/**
 * telemetry.js — MiniGame session storage, feature extraction, and backend sync.
 *
 * Feature definitions follow supervisor spec §22.12 (A–E) plus fixes from
 * analysis sessions:
 *   - collision_flag + duration_ms added as ML features (gap 1)
 *   - overshoot detection rewritten to use velocity reversal (gap 2)
 *   - inter-click latency during danger added (gap 3, §22.12 B)
 *   - wall-side switching count added (gap 4, §22.12 D)
 *   - worsening_click metrics added (gap 5)
 *   - danger_visit_duration_mean added (gap 6)
 *   - effective_click redefined as "moves ball toward canvas centre" (gap 7)
 *   - anticipatory_click_ratio added (gap 8)
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
const STORAGE_KEY = "minigame_sessions";
const MAX_LOCAL = 100;

// ─── Math helpers ─────────────────────────────────────────────────────────────
function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
function maxOr(arr, d = 0) {
  return arr.length ? Math.max(...arr) : d;
}
function minOr(arr, d = 0) {
  return arr.length ? Math.min(...arr) : d;
}
function r(v, p = 4) {
  return v == null || Number.isNaN(v) ? null : +v.toFixed(p);
}

// ─── Device & network ─────────────────────────────────────────────────────────
async function collectDeviceInfo() {
  const ua = navigator.userAgent;
  let deviceOs = "Unknown";
  if (/Windows NT/.test(ua)) deviceOs = "Windows";
  else if (/Mac OS X/.test(ua)) deviceOs = "macOS";
  else if (/Android/.test(ua)) deviceOs = "Android";
  else if (/iPhone|iPad/.test(ua)) deviceOs = "iOS";
  else if (/Linux/.test(ua)) deviceOs = "Linux";

  let deviceBrowser = "Unknown";
  if (/Edg\//.test(ua)) deviceBrowser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) deviceBrowser = "Opera";
  else if (/Chrome\//.test(ua)) deviceBrowser = "Chrome";
  else if (/Safari\//.test(ua)) deviceBrowser = "Safari";
  else if (/Firefox\//.test(ua)) deviceBrowser = "Firefox";

  const screenResolution = `${window.screen.width}x${window.screen.height}`;
  const devicePixelRatio = window.devicePixelRatio ?? 1;

  // Network latency — average of 3 sequential pings to the backend /hello endpoint.
  // NOTE: This measures browser→backend RTT (localhost or deployed server), NOT
  // AnyDesk channel latency. Under AnyDesk remote sessions, this value will be
  // similar to local sessions because the browser runs on the experiment machine.
  // Use this field for session auditing (e.g. identifying VPN-affected sessions)
  // rather than as an ML feature. The actual remote-control lag is captured
  // behaviorally by danger_response_latency_mean and second_click_latency_mean.
  let networkLatencyMs = null;
  try {
    const pings = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      await fetch(`${BASE_URL}/hello`, { method: "GET", cache: "no-store" });
      pings.push(performance.now() - t0);
    }
    // Use median of 3 to reduce outlier noise
    pings.sort((a, b) => a - b);
    networkLatencyMs = Math.round(pings[1]);
  } catch {
    /* offline */
  }

  return {
    deviceOs,
    deviceBrowser,
    screenResolution,
    devicePixelRatio,
    networkLatencyMs,
  };
}

// ─── §22.12 Feature extraction ────────────────────────────────────────────────

/**
 * Extract all §22.12 features from one trial's frameLogs + clickLogs.
 * Returns a flat object whose keys match TrialRecord column names exactly.
 */
export function extractTrialFeatures(trial) {
  const frames = trial.frameLogs || [];
  const clicks = trial.clickLogs || [];
  const nFrames = frames.length;
  const nClicks = clicks.length;
  const durationMs = trial.durationMs || 0;
  const durationSec = durationMs / 1000;

  // ── §22.12 A — Boundary risk ───────────────────────────────────────────────
  const distances = frames.map((f) => f.minDistanceToWall);
  const d1Frames = frames.filter((f) => f.dangerLevel === 1).length;
  const d2Frames = frames.filter((f) => f.dangerLevel === 2).length;

  // Danger entry events: safe (0) → danger (>0)
  const dangerEntries = []; // { entryIdx, entryTs, exitTs|null, side }
  for (let i = 1; i < frames.length; i++) {
    if (frames[i - 1].dangerLevel === 0 && frames[i].dangerLevel > 0) {
      // Determine which wall was closest at entry
      const f = frames[i];
      const side = closestSide(f);
      // Find exit frame (returns to 0)
      let exitTs = null;
      for (let j = i + 1; j < frames.length; j++) {
        if (frames[j].dangerLevel === 0) {
          exitTs = frames[j].timestampMs;
          break;
        }
      }
      dangerEntries.push({
        entryIdx: i,
        entryTs: frames[i].timestampMs,
        exitTs,
        side,
      });
    }
  }
  const dangerEntryCount = dangerEntries.length;

  // Visit duration per entry (for mean)
  const visitDurations = dangerEntries.map((e) =>
    e.exitTs != null
      ? e.exitTs - e.entryTs
      : durationMs - e.entryTs + frames[0].timestampMs,
  );

  // Wall-side switch count: consecutive entries on different sides
  let dangerSideSwitchCount = 0;
  for (let i = 1; i < dangerEntries.length; i++) {
    if (dangerEntries[i].side !== dangerEntries[i - 1].side)
      dangerSideSwitchCount++;
  }

  // ── §22.12 B — Reaction latency ────────────────────────────────────────────
  const firstClickLatencies = []; // time from danger entry to FIRST click
  const secondClickLatencies = []; // interval between FIRST and SECOND click in danger
  const recoveryTimes = []; // time from entry back to safe

  for (const entry of dangerEntries) {
    // Clicks at or after entry
    const dangerClicks = clicks.filter(
      (c) =>
        c.timestampMs >= entry.entryTs &&
        (entry.exitTs == null || c.timestampMs <= entry.exitTs),
    );

    if (dangerClicks.length >= 1) {
      firstClickLatencies.push(dangerClicks[0].timestampMs - entry.entryTs);
    }
    if (dangerClicks.length >= 2) {
      secondClickLatencies.push(
        dangerClicks[1].timestampMs - dangerClicks[0].timestampMs,
      );
    }
    if (entry.exitTs != null) {
      recoveryTimes.push(entry.exitTs - entry.entryTs);
    }
  }

  // ── §22.12 C — Overshoot (rewritten) ──────────────────────────────────────
  // Definition: after a click in danger, the ball's velocity component toward
  // the nearest wall INCREASES within the next 500 ms window (i.e., click
  // pushed ball toward the wall instead of away — a "worsening" click that
  // often comes from clicking while seeing a stale screen state under RAT).
  // We also capture amplitude as how far the ball travels INTO the wall zone
  // after that worsening click.

  const overshootAmplitudes = [];
  const worseningAmplitudes = []; // same concept, different naming for clarity

  for (const c of clicks) {
    // Find the closest frame to this click
    let closestF = frames[0];
    let minDiff = Infinity;
    for (const f of frames) {
      const diff = Math.abs(f.timestampMs - c.timestampMs);
      if (diff < minDiff) {
        minDiff = diff;
        closestF = f;
      }
    }
    if (!closestF) continue;

    const distAtClick = closestF.minDistanceToWall;

    // Look ahead 500 ms for worsening: did ball get closer to ANY wall?
    // We do NOT filter by same wall side — after a click the ball often
    // moves toward a different wall, so the side check caused near-zero counts.
    let minDistAfter = distAtClick;
    for (const f of frames) {
      if (f.timestampMs <= c.timestampMs) continue;
      if (f.timestampMs > c.timestampMs + 500) break;
      if (f.minDistanceToWall < minDistAfter) {
        minDistAfter = f.minDistanceToWall;
      }
    }

    const worsening = distAtClick - minDistAfter; // positive = got closer = overshoot
    if (worsening > 5) {
      // 5px threshold to ignore noise
      overshootAmplitudes.push(worsening);
      worseningAmplitudes.push(worsening);
    }
  }

  const overshootCount = overshootAmplitudes.length;

  // ── §22.12 D — Oscillation ─────────────────────────────────────────────────
  // Direction changes: sign flip in vx OR vy (caused by wall bounces + corrections)
  let dirChangeCount = 0;
  for (let i = 1; i < frames.length; i++) {
    const xFlip = frames[i - 1].ballVx >= 0 !== frames[i].ballVx >= 0;
    const yFlip = frames[i - 1].ballVy >= 0 !== frames[i].ballVy >= 0;
    if (xFlip || yFlip) dirChangeCount++;
  }

  // High-freq clicks: inter-click interval < 150 ms
  let highFreqClickCount = 0;
  for (let i = 1; i < clicks.length; i++) {
    if (clicks[i].timestampMs - clicks[i - 1].timestampMs < 150)
      highFreqClickCount++;
  }

  // Click bursts: 3+ clicks within 400 ms
  let clickBurstCount = 0;
  let i = 0;
  while (i < clicks.length) {
    let j = i;
    while (
      j + 1 < clicks.length &&
      clicks[j + 1].timestampMs - clicks[i].timestampMs <= 400
    )
      j++;
    if (j - i + 1 >= 3) {
      clickBurstCount++;
      i = j + 1;
    } else {
      i++;
    }
  }

  // Heading variance
  const headings = frames.map((f) => Math.atan2(f.ballVy, f.ballVx));
  const headingVariance = std(headings) ** 2;

  // Frame interval jitter: std of gaps between consecutive frame timestamps.
  // Measures rAF loop consistency on the experiment machine. Normally ~0ms
  // on a healthy machine; elevated under CPU load.
  const frameIntervals = [];
  for (let i = 1; i < frames.length; i++) {
    frameIntervals.push(frames[i].timestampMs - frames[i - 1].timestampMs);
  }
  const frameIntervalJitterMs = r(std(frameIntervals), 2);

  // Click interval jitter: std of gaps between consecutive clicks.
  // This is the RAT-sensitive metric — remote users see delayed screen
  // feedback, so their clicks arrive in uneven bursts rather than
  // at consistent intervals. Higher std = more irregular clicking.
  const clickIntervals = [];
  for (let i = 1; i < clicks.length; i++) {
    clickIntervals.push(clicks[i].timestampMs - clicks[i - 1].timestampMs);
  }
  const clickIntervalJitterMs = r(std(clickIntervals), 2);

  // ── §22.12 E — Control efficiency ─────────────────────────────────────────
  const clickRate = durationSec > 0 ? nClicks / durationSec : 0;

  // Effective click (fixed): click moves ball TOWARD canvas centre.
  // Check by comparing distance-to-centre before and after the velocity change.
  const cx = 250,
    cy = 250; // canvas centre (500/2) — adjust if CANVAS_SIZE changes
  let effectiveClicks = 0;
  const riskDrops = [];
  for (const c of clicks) {
    // Velocity after click: project onto direction toward centre
    const toCx = cx - c.ballXAtClick,
      toCy = cy - c.ballYAtClick;
    const toCLen = Math.hypot(toCx, toCy) || 1;
    const dotAfter = (c.ballVxAfter * toCx + c.ballVyAfter * toCy) / toCLen;
    // Positive dot product means velocity has a component toward centre
    if (dotAfter > 0) {
      effectiveClicks++;
      // Also track risk drop if in danger
      if (c.dangerLevelAtClick > 0) riskDrops.push(c.dangerLevelAtClick);
    }
  }
  const effectiveClickRatio = nClicks ? effectiveClicks / nClicks : 0;
  const ineffectiveClickRatio = nClicks ? 1 - effectiveClickRatio : 0;

  // Worsening clicks (separate from overshoot — counts clicks that made things worse)
  const worseningClickCount = worseningAmplitudes.length;
  const worseningClickRatio = nClicks ? worseningClickCount / nClicks : 0;

  // Anticipatory clicks: clicks while safe (dangerLevel=0) but within 120px of wall
  const ANTICIPATORY_ZONE = 120;
  let anticipatoryClicks = 0;
  for (const c of clicks) {
    if (
      c.dangerLevelAtClick === 0 &&
      c.minDistanceToWallAtClick < ANTICIPATORY_ZONE
    ) {
      anticipatoryClicks++;
    }
  }
  const anticipatoryClickRatio = nClicks ? anticipatoryClicks / nClicks : 0;

  // ── Assemble output ────────────────────────────────────────────────────────
  return {
    // Outcome fields as ML features (gap 1)
    survivalTimeMs: durationMs,
    collisionOccurred: trial.collisionFlag ? 1 : 0,

    // §22.12 A
    minDistanceToWallMean: r(mean(distances), 2),
    minDistanceToWallMin: r(minOr(distances), 2),
    danger1Ratio: r(nFrames ? d1Frames / nFrames : 0),
    danger2Ratio: r(nFrames ? d2Frames / nFrames : 0),
    dangerEntryCount,
    dangerVisitDurationMean: r(mean(visitDurations), 1), // gap 6

    // §22.12 B
    dangerResponseLatencyMean: r(mean(firstClickLatencies), 1),
    dangerResponseLatencyStd: r(std(firstClickLatencies), 1),
    dangerResponseLatencyMax: r(maxOr(firstClickLatencies), 1),
    secondClickLatencyMean: r(mean(secondClickLatencies), 1), // gap 3
    secondClickLatencyStd: r(std(secondClickLatencies), 1), // gap 3
    recoveryTimeMean: r(mean(recoveryTimes), 1),

    // §22.12 C (rewritten)
    overshootCount,
    overshootAmplitudeMean: r(mean(overshootAmplitudes), 2),
    overshootAmplitudeMax: r(maxOr(overshootAmplitudes), 2),

    // §22.12 D
    dirChangeCount,
    dangerSideSwitchCount, // gap 4
    highFreqClickCount,
    clickBurstCount,
    headingVariance: r(headingVariance, 4),
    frameIntervalJitterMs, // rAF loop consistency
    clickIntervalJitterMs, // RAT-sensitive click timing irregularity

    // §22.12 E
    clickRate: r(clickRate, 3),
    effectiveClickRatio: r(effectiveClickRatio, 3), // fixed definition
    ineffectiveClickRatio: r(ineffectiveClickRatio, 3),
    riskDropPerClickMean: r(mean(riskDrops), 3),
    worseningClickCount, // gap 5
    worseningClickRatio: r(worseningClickRatio, 3), // gap 5
    anticipatoryClickRatio: r(anticipatoryClickRatio, 3), // gap 8
  };
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
function closestSide(frame) {
  const { distanceLeft, distanceRight, distanceTop, distanceBottom } = frame;
  let side = "left",
    d = distanceLeft;
  if (distanceRight < d) {
    d = distanceRight;
    side = "right";
  }
  if (distanceTop < d) {
    d = distanceTop;
    side = "top";
  }
  if (distanceBottom < d) {
    d = distanceBottom;
    side = "bottom";
  }
  return side;
}

// ─── saveSession — main entry point ──────────────────────────────────────────
export async function saveSession(record) {
  const device = await collectDeviceInfo();
  const enriched = { ...record, ...device };

  const existing = loadSessions();
  const updated = [...existing, enriched].slice(-MAX_LOCAL);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(updated.slice(-MAX_LOCAL / 2)),
    );
  }

  syncToBackend(enriched).catch((e) =>
    console.warn("[Telemetry] Backend sync failed:", e.message),
  );

  return enriched;
}

// ─── Backend sync ─────────────────────────────────────────────────────────────
async function syncToBackend(record) {
  const mg = record.miniGame || {};
  const allTrials = [...(mg.practiceTrials || []), ...(mg.formalTrials || [])];

  const trials = allTrials.map((t) => {
    const features = extractTrialFeatures(t);
    return {
      trialType: t.trialType,
      trialId: t.trialId,
      durationMs: t.durationMs,
      collisionFlag: t.collisionFlag,
      collisionSide: t.collisionSide,
      totalClicks: t.totalClicks,
      totalFrames: t.totalFrames,
      danger1DurationMs: t.danger1DurationMs,
      danger2DurationMs: t.danger2DurationMs,
      avgRiskScore: t.avgRiskScore,
      maxRiskScore: t.maxRiskScore,
      features,
      label: record.condition, // default label = condition
      frameLogsJson: JSON.stringify(t.frameLogs || []),
      clickLogsJson: JSON.stringify(t.clickLogs || []),
    };
  });

  const payload = {
    sessionId: record.sessionId,
    participantId: record.participantId,
    condition: record.condition,
    username: record.username ?? "",
    transferTo: record.transferTo ?? "",
    transferAmount: record.transferAmount ?? null,
    deviceOs: record.deviceOs ?? null,
    deviceBrowser: record.deviceBrowser ?? null,
    screenResolution: record.screenResolution ?? null,
    devicePixelRatio: record.devicePixelRatio ?? null,
    networkLatencyMs: record.networkLatencyMs ?? null,
    trials,
  };

  const res = await fetch(`${BASE_URL}/trials/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.sessionId === record.sessionId);
  if (idx >= 0) {
    sessions[idx].synced = true;
    sessions[idx].syncedTrials = data.trialsSaved ?? trials.length;
    sessions[idx].serverIds = data.ids ?? [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }
  return data;
}

// ─── Label helpers ────────────────────────────────────────────────────────────
export async function labelOnServer(trialId, label) {
  if (!trialId) return;
  await fetch(`${BASE_URL}/trials/${trialId}/label`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
}

export async function bulkLabelOnServer(ids, label) {
  if (!ids?.length) return;
  await fetch(`${BASE_URL}/trials/bulk-label`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, label }),
  });
}

// ─── localStorage helpers ─────────────────────────────────────────────────────
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

// ─── Server CSV downloads ─────────────────────────────────────────────────────
export function downloadServerCSV(which = "formal") {
  window.open(
    `${BASE_URL}${which === "all" ? "/trials/export/csv/all" : "/trials/export/csv"}`,
    "_blank",
  );
}
export function downloadParticipantCSV(participantId) {
  window.open(
    `${BASE_URL}/trials/export/csv/participant?participantId=${encodeURIComponent(participantId)}`,
    "_blank",
  );
}

// ─── Local exports ────────────────────────────────────────────────────────────
export function exportJSON(sessions) {
  dl(
    JSON.stringify(sessions || loadSessions(), null, 2),
    `minigame_sessions_${stamp()}.json`,
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
    "participantId",
    "condition",
    "trialType",
    "trialId",
    "label",
    "durationMs",
    "collisionFlag",
    "collisionSide",
    "totalClicks",
    "totalFrames",
    "danger1DurationMs",
    "danger2DurationMs",
    "avgRiskScore",
    "maxRiskScore",
    // A
    "survivalTimeMs",
    "collisionOccurred",
    "minDistanceToWallMean",
    "minDistanceToWallMin",
    "danger1Ratio",
    "danger2Ratio",
    "dangerEntryCount",
    "dangerVisitDurationMean",
    // B
    "dangerResponseLatencyMean",
    "dangerResponseLatencyStd",
    "dangerResponseLatencyMax",
    "secondClickLatencyMean",
    "secondClickLatencyStd",
    "recoveryTimeMean",
    // C
    "overshootCount",
    "overshootAmplitudeMean",
    "overshootAmplitudeMax",
    // D
    "dirChangeCount",
    "dangerSideSwitchCount",
    "highFreqClickCount",
    "clickBurstCount",
    "headingVariance",
    "frameIntervalJitterMs",
    "clickIntervalJitterMs",
    // E
    "clickRate",
    "effectiveClickRatio",
    "ineffectiveClickRatio",
    "riskDropPerClickMean",
    "worseningClickCount",
    "worseningClickRatio",
    "anticipatoryClickRatio",
    // device
    "deviceOs",
    "deviceBrowser",
    "screenResolution",
    "devicePixelRatio",
    "networkLatencyMs",
  ];
  const rows = [hdrs.join(",")];
  for (const s of data) {
    const mg = s.miniGame || {};
    const all = [...(mg.practiceTrials || []), ...(mg.formalTrials || [])];
    for (const t of all) {
      const f = extractTrialFeatures(t);
      rows.push(
        [
          q(s.sessionId),
          q(s.timestamp),
          q(s.participantId),
          q(s.condition),
          q(t.trialType),
          t.trialId ?? "",
          q(s.condition),
          t.durationMs ?? "",
          t.collisionFlag ?? "",
          q(t.collisionSide),
          t.totalClicks ?? "",
          t.totalFrames ?? "",
          t.danger1DurationMs ?? "",
          t.danger2DurationMs ?? "",
          t.avgRiskScore ?? "",
          t.maxRiskScore ?? "",
          f.survivalTimeMs ?? "",
          f.collisionOccurred ?? "",
          f.minDistanceToWallMean ?? "",
          f.minDistanceToWallMin ?? "",
          f.danger1Ratio ?? "",
          f.danger2Ratio ?? "",
          f.dangerEntryCount ?? "",
          f.dangerVisitDurationMean ?? "",
          f.dangerResponseLatencyMean ?? "",
          f.dangerResponseLatencyStd ?? "",
          f.dangerResponseLatencyMax ?? "",
          f.secondClickLatencyMean ?? "",
          f.secondClickLatencyStd ?? "",
          f.recoveryTimeMean ?? "",
          f.overshootCount ?? "",
          f.overshootAmplitudeMean ?? "",
          f.overshootAmplitudeMax ?? "",
          f.dirChangeCount ?? "",
          f.dangerSideSwitchCount ?? "",
          f.highFreqClickCount ?? "",
          f.clickBurstCount ?? "",
          f.headingVariance ?? "",
          f.frameIntervalJitterMs ?? "",
          f.clickIntervalJitterMs ?? "",
          f.clickRate ?? "",
          f.effectiveClickRatio ?? "",
          f.ineffectiveClickRatio ?? "",
          f.riskDropPerClickMean ?? "",
          f.worseningClickCount ?? "",
          f.worseningClickRatio ?? "",
          f.anticipatoryClickRatio ?? "",
          q(s.deviceOs),
          q(s.deviceBrowser),
          q(s.screenResolution),
          s.devicePixelRatio ?? "",
          s.networkLatencyMs ?? "",
        ].join(","),
      );
    }
  }
  dl(rows.join("\n"), `minigame_features_${stamp()}.csv`, "text/csv");
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
