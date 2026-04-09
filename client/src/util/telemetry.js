/**
 * telemetry.js
 *
 * Handles local storage and export of RAT probe session records.
 * Each record = one transfer attempt = one CAPTCHA completion.
 *
 * Storage: localStorage key "ratprobe_sessions" → JSON array of SessionRecord
 *
 * SessionRecord schema:
 * {
 *   sessionId:      string         — unique ID for this attempt
 *   timestamp:      string         — ISO datetime
 *   username:       string         — who was logged in
 *   transferTo:     string         — intended recipient
 *   transferAmount: number
 *   label:          null | "human" | "rat"  — ground truth (set manually later)
 *   ambientProbe: {
 *     score:       number,
 *     flags:       string[],
 *     rawMetrics:  object
 *   },
 *   captchaProbe: {
 *     score:       number,
 *     flags:       string[],
 *     samples:     BehaviorSample[]
 *   },
 *   combinedScore:  number
 * }
 */

const STORAGE_KEY = "ratprobe_sessions";
const MAX_SESSIONS = 500; // cap to avoid localStorage overflow

export function saveSession(record) {
  const existing = loadSessions();
  const updated = [...existing, record].slice(-MAX_SESSIONS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.log("[Telemetry] Failed to save session record:", e);
    console.warn("[Telemetry] localStorage full — oldest records trimmed");
    const trimmed = updated.slice(-Math.floor(MAX_SESSIONS / 2));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }
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

/**
 * Export as JSON file download (full fidelity — use for ML training)
 */
export function exportJSON(sessions) {
  const data = sessions || loadSessions();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, `ratprobe_sessions_${dateStamp()}.json`);
}

/**
 * Export as CSV (flattened — use for quick EDA in pandas/Excel)
 *
 * One row per BehaviorSample (click event), with session metadata repeated.
 * Trajectory/velocity arrays are summarised into scalar features.
 */
export function exportCSV(sessions) {
  const data = sessions || loadSessions();
  if (data.length === 0) {
    alert("No sessions to export");
    return;
  }

  const rows = [];
  const headers = [
    "sessionId",
    "timestamp",
    "username",
    "label",
    "combinedScore",
    "ambientScore",
    "captchaScore",
    // per-sample fields
    "sampleIndex",
    "targetId",
    "correct",
    "straightness",
    "preDwellMs",
    "reactionMs",
    "overshoot",
    "missCount",
    "targetSize",
    "targetDist",
    "trajPoints",
    "velMean",
    "velStd",
    "velMin",
    "velMax",
    "accelMean",
    "accelStd",
  ];
  rows.push(headers.join(","));

  for (const session of data) {
    const base = [
      q(session.sessionId),
      q(session.timestamp),
      q(session.username),
      q(session.label ?? ""),
      session.combinedScore,
      session.ambientProbe?.score ?? 0,
      session.captchaProbe?.score ?? 0,
    ];

    const samples = session.captchaProbe?.samples ?? [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const vel = s.velocity ?? [];
      const acc = s.acceleration ?? [];

      const row = [
        ...base,
        i,
        q(s.targetId),
        s.correct ? 1 : 0,
        s.straightness,
        s.preDwellMs,
        s.reactionMs,
        s.overshoot ? 1 : 0,
        s.missCount,
        s.targetSize,
        s.targetDist,
        s.trajectory?.length ?? 0,
        mean(vel).toFixed(4),
        std(vel).toFixed(4),
        vel.length ? Math.min(...vel).toFixed(4) : 0,
        vel.length ? Math.max(...vel).toFixed(4) : 0,
        mean(acc).toFixed(4),
        std(acc).toFixed(4),
      ];
      rows.push(row.join(","));
    }
  }

  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  triggerDownload(blob, `ratprobe_features_${dateStamp()}.csv`);
}

function q(v) {
  return `"${String(v).replace(/"/g, '""')}"`;
}
function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
function dateStamp() {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
}
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
