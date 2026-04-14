const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
const STORAGE_KEY = "ratprobe_sessions";
const MAX_LOCAL = 500;

// Feature computation

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

// Device info
function detectDevice() {
  const userAgent = navigator.userAgent;
  return {
    os: userAgent.includes("Windows")
      ? "windows"
      : userAgent.includes("Mac")
        ? "macos"
        : userAgent.includes("Linux")
          ? "linux"
          : "unknown",
    browser:
      userAgent.includes("Chrome") && !userAgent.includes("Edge")
        ? "chrome"
        : userAgent.includes("Safari") && !userAgent.includes("Chrome")
          ? "safari"
          : userAgent.includes("Firefox")
            ? "firefox"
            : userAgent.includes("Edge")
              ? "edge"
              : "unknown",
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

// Network info
async function measureNetworkLatency() {
  try {
    const start = performance.now(); //staright from web
    await fetch(`${BASE_URL}/probe/stats`, { method: "HEAD" });

    return Math.round(performance.now() - start);
  } catch (error) {
    console.warn("Network latency extraction failed:", error);
    return null;
  }
}

//default interaction feature: Mouse
function extractSampleFeatures(sample) {
  const traj = sample.trajectory || [];
  if (traj.length < 3) return null;

  const xs = traj.map((p) => p.x),
    ys = traj.map((p) => p.y),
    ts = traj.map((p) => p.t);
  const dx = xs.slice(1).map((x, i) => x - xs[i]);
  const dy = ys.slice(1).map((y, i) => y - ys[i]);
  const dt = ts.slice(1).map((t, i) => Math.max(t - ts[i], 0.1));
  const dists = dx.map((d, i) => Math.sqrt(d * d + dy[i] * dy[i]));
  const vel = dists.map((d, i) => d / dt[i]);
  const accel = vel.slice(1).map((v, i) => v - vel[i]);

  const chord = Math.sqrt(
    (xs[xs.length - 1] - xs[0]) ** 2 + (ys[ys.length - 1] - ys[0]) ** 2,
  );
  const arc = dists.reduce((a, b) => a + b, 0);
  const straightness = arc > 0 ? Math.min(1, chord / arc) : 1;

  const angles = dx.map((d, i) => Math.atan2(dy[i], d));
  const buckets = angles.map(
    (a) => Math.round((a + Math.PI) / (Math.PI / 4)) % 8,
  );
  const counts = Array(8).fill(0);
  buckets.forEach((b) => counts[b]++);
  const dirEntropy = counts
    .filter((c) => c > 0)
    .reduce((h, c) => {
      const p = c / buckets.length;
      return h - p * Math.log2(p);
    }, 0);

  return {
    straightness,
    dir_entropy: dirEntropy,
    vel_mean: mean(vel),
    vel_std: std(vel),
    vel_cv: std(vel) / (mean(vel) + 1e-9),
    accel_std: std(accel),
    pre_dwell_ms: sample.preDwellMs ?? 0,
    reaction_ms: sample.reactionMs ?? 0,
    overshoot: sample.overshoot ? 1 : 0,
    traj_points: traj.length,
    arc_length: arc,
    chord_length: chord,
  };
}

export function computeSessionFeatures(captchaSamples) {
  const correct = (captchaSamples || []).filter((s) => s.correct);
  const sf = correct.map((s) => extractSampleFeatures(s)).filter(Boolean);
  if (!sf.length) return {};
  const agg = (k) => ({
    mean: mean(sf.map((f) => f[k])),
    std: std(sf.map((f) => f[k])),
  });
  const r = (v) => +v.toFixed(5);
  return {
    straightnessMean: r(agg("straightness").mean),
    straightnessStd: r(agg("straightness").std),
    dirEntropyMean: r(agg("dir_entropy").mean),
    dirEntropyStd: r(agg("dir_entropy").std),
    velCvMean: r(agg("vel_cv").mean),
    velCvStd: r(agg("vel_cv").std),
    velStdMean: r(agg("vel_std").mean),
    accelStdMean: r(agg("accel_std").mean),
    preDwellMean: r(agg("pre_dwell_ms").mean),
    preDwellStd: r(agg("pre_dwell_ms").std),
    reactionMsMean: r(agg("reaction_ms").mean),
    overshootMean: r(agg("overshoot").mean),
    idleBurstMean: 0,
    trajPointsMean: r(agg("traj_points").mean),
    arcLengthMean: r(agg("arc_length").mean),
  };
}

//  localStorage

export function saveSession(record) {
  const existing = loadSessions();
  const updated = [...existing, record].slice(-MAX_LOCAL);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(updated.slice(-MAX_LOCAL / 2)),
    );
  }
  syncToBackend(record).catch((e) =>
    console.warn("[Telemetry] Backend sync queued (offline?):", e.message),
  );
  return record;
}

export function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function clearSessions() {
  localStorage.removeItem(STORAGE_KEY);
}
export function sessionCount() {
  return loadSessions().length;
}

// Backend sync

async function syncToBackend(record) {
  const features = computeSessionFeatures(record.captchaProbe?.samples);
  const device = detectDevice();
  const networkLatency = await measureNetworkLatency();

  const payload = {
    username: record.username ?? "",
    combinedScore: record.combinedScore ?? 0,
    ambientScore: record.ambientProbe?.score ?? 0,
    captchaScore: record.captchaProbe?.score ?? 0,
    flags: (record.allFlags || []).join(","),
    sessionJson: JSON.stringify(record.captchaProbe?.samples ?? []),
    ...features,
    deviceOs: device.os,
    deviceBrowser: device.browser,
    screenResolution: `${device.screenWidth}x${device.screenHeight}`,
    devicePixelRatio: device.devicePixelRatio,
    networkLatencyMs: networkLatency,
  };
  const res = await fetch(`${BASE_URL}/probe/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  // Store server ID for labelling !!!
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.sessionId === record.sessionId);
  if (idx >= 0) {
    sessions[idx].serverId = data.id;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }
  return data;
}

export async function labelOnServer(serverId, label) {
  if (!serverId) return;
  await fetch(`${BASE_URL}/probe/session/${serverId}/label`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
}

export function downloadServerCSV(labelledOnly = true) {
  const ep = labelledOnly ? "/probe/export/csv" : "/probe/export/full-csv";
  window.open(`${BASE_URL}${ep}`, "_blank");
}

// Local export

export function exportJSON(sessions) {
  const data = sessions || loadSessions();
  dl(
    JSON.stringify(data, null, 2),
    `ratprobe_sessions_${stamp()}.json`,
    "application/json",
  );
}

export function exportCSV(sessions) {
  const data = sessions || loadSessions();
  if (!data.length) {
    alert("No sessions to export");
    return;
  }
  const hdrs = [
    "sessionId",
    "timestamp",
    "username",
    "label",
    "combinedScore",
    "ambientScore",
    "captchaScore",
    "straightnessMean",
    "straightnessStd",
    "dirEntropyMean",
    "dirEntropyStd",
    "velCvMean",
    "velCvStd",
    "velStdMean",
    "accelStdMean",
    "preDwellMean",
    "preDwellStd",
    "reactionMsMean",
    "overshootMean",
    "idleBurstMean",
    "trajPointsMean",
    "arcLengthMean",
    "flags",
  ];
  const rows = [hdrs.join(",")];
  for (const s of data) {
    const f = computeSessionFeatures(s.captchaProbe?.samples);
    rows.push(
      [
        q(s.sessionId),
        q(s.timestamp),
        q(s.username ?? ""),
        q(s.label ?? ""),
        s.combinedScore ?? "",
        s.ambientProbe?.score ?? "",
        s.captchaProbe?.score ?? "",
        f.straightnessMean ?? "",
        f.straightnessStd ?? "",
        f.dirEntropyMean ?? "",
        f.dirEntropyStd ?? "",
        f.velCvMean ?? "",
        f.velCvStd ?? "",
        f.velStdMean ?? "",
        f.accelStdMean ?? "",
        f.preDwellMean ?? "",
        f.preDwellStd ?? "",
        f.reactionMsMean ?? "",
        f.overshootMean ?? "",
        f.idleBurstMean ?? "",
        f.trajPointsMean ?? "",
        f.arcLengthMean ?? "",
        q((s.allFlags || []).join(";")),
      ].join(","),
    );
  }
  dl(rows.join("\n"), `ratprobe_features_${stamp()}.csv`, "text/csv");
}

function q(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}
function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
}
function dl(text, name, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
}
