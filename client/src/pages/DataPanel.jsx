import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  loadSessions,
  clearSessions,
  exportJSON,
  exportCSV,
  labelOnServer,
  bulkLabelOnServer,
  downloadServerCSV,
  downloadParticipantCSV,
} from "../util/telemetry";
import "../styles/datapanel.css";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

// ── Per-session CSV download (calls the existing /trials/session/{id} endpoint
//    and converts the JSON array into a CSV client-side) ──────────────────────
async function downloadSessionCSV(sessionId) {
  const res = await fetch(
    `${BASE_URL}/trials/session/${encodeURIComponent(sessionId)}`,
  );
  if (!res.ok) {
    alert(`Failed to fetch session: HTTP ${res.status}`);
    return;
  }
  const rows = await res.json();
  if (!rows.length) {
    alert("No trials found for this session.");
    return;
  }

  // Build CSV from the keys of the first row
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h];
          if (v == null) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(","),
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `session_${sessionId.slice(0, 8)}.csv`;
  a.click();
}

export default function DataPanel() {
  const navigate = useNavigate();

  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [statsErr, setStatsErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [trials, setTrials] = useState([]);
  const [filterParticipant, setFilterParticipant] = useState("");
  const [filterCondition, setFilterCondition] = useState("all");
  const [filterTrialType, setFilterTrialType] = useState("formal");
  const [filterLabel, setFilterLabel] = useState("all");
  const [selectedTrial, setSelectedTrial] = useState(null);
  const [localSessions, setLocalSessions] = useState(() => loadSessions());

  // ── Fetchers ──────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/trials/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
      setStatsErr(null);
    } catch (e) {
      setStatsErr(e.message);
    }
  }, []);

  const fetchParticipants = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/trials/participants`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setParticipants(await res.json());
    } catch (e) {
      console.warn("[DataPanel] participants fetch failed:", e.message);
    }
  }, []);

  const fetchTrials = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterParticipant) params.set("participantId", filterParticipant);
      if (filterCondition !== "all") params.set("condition", filterCondition);
      const qs = params.toString();
      const res = await fetch(`${BASE_URL}/trials${qs ? "?" + qs : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data = await res.json();
      if (filterTrialType !== "all")
        data = data.filter((t) => t.trialType === filterTrialType);
      if (filterLabel === "labelled") data = data.filter((t) => t.label);
      if (filterLabel === "unlabelled") data = data.filter((t) => !t.label);
      setTrials(data);
    } catch (e) {
      console.warn("[DataPanel] trials fetch failed:", e.message);
      setTrials([]);
    } finally {
      setLoading(false);
    }
  }, [filterParticipant, filterCondition, filterTrialType, filterLabel]);

  useEffect(() => {
    fetchStats();
    fetchParticipants();
  }, [fetchStats, fetchParticipants]);
  useEffect(() => {
    if (tab === "trials") fetchTrials();
  }, [tab, fetchTrials]);

  const refreshAll = () => {
    fetchStats();
    fetchParticipants();
    if (tab === "trials") fetchTrials();
    setLocalSessions(loadSessions());
  };

  const handleClearLocal = () => {
    if (
      window.confirm(
        "Delete all LOCAL session cache? (Backend data is untouched.)",
      )
    ) {
      clearSessions();
      setLocalSessions([]);
    }
  };

  const handleLabel = async (trialId, label) => {
    await labelOnServer(trialId, label);
    setTrials((prev) =>
      prev.map((t) => (t.id === trialId ? { ...t, label } : t)),
    );
    if (selectedTrial?.id === trialId)
      setSelectedTrial({ ...selectedTrial, label });
    fetchStats();
  };

  const handleBulkLabel = async (label) => {
    const ids = trials.map((t) => t.id);
    if (!ids.length) return;
    if (
      !window.confirm(
        `Label all ${ids.length} currently-shown trials as "${label}"?`,
      )
    )
      return;
    await bulkLabelOnServer(ids, label);
    fetchTrials();
    fetchStats();
  };

  const participantOptions = participants.map((p) => p.participantId);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="dp-page">
      {/* Top bar */}
      <div className="dp-topbar">
        <button className="dp-back-btn" onClick={() => navigate("/")}>
          ← Back
        </button>
        <h1 className="dp-title">Experiment data</h1>
        <div className="dp-topbar-actions">
          <button className="dp-btn" onClick={refreshAll}>
            ↻ Refresh
          </button>
          <button
            className="dp-btn"
            onClick={() => downloadServerCSV("formal")}
          >
            Formal CSV
          </button>
          <button className="dp-btn" onClick={() => downloadServerCSV("all")}>
            Full CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="dp-tabs">
        {[
          ["overview", "Overview"],
          ["participants", "Participants"],
          ["trials", "Trials"],
        ].map(([k, lbl]) => (
          <button
            key={k}
            className={`dp-tab ${tab === k ? "dp-tab--active" : ""}`}
            onClick={() => setTab(k)}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <>
          {statsErr && (
            <div className="dp-alert">
              Backend unreachable: {statsErr}. Showing local cache only.
            </div>
          )}
          <div className="dp-stat-grid">
            <StatCard label="Total trials" value={stats?.total ?? "—"} />
            <StatCard
              label="Formal"
              value={stats?.formal ?? "—"}
              accent="good"
            />
            <StatCard label="Practice" value={stats?.practice ?? "—"} subtle />
            <StatCard
              label="Participants"
              value={stats?.participants ?? "—"}
              accent="good"
            />
            <StatCard label="Local formal" value={stats?.localFormal ?? "—"} />
            <StatCard
              label="Remote formal"
              value={stats?.remoteFormal ?? "—"}
            />
            <StatCard
              label="Labelled"
              value={stats?.labelled ?? "—"}
              accent="good"
            />
            <StatCard
              label="Unlabelled"
              value={stats?.unlabelled ?? "—"}
              accent="warn"
            />
          </div>

          <div className="dp-card">
            <p className="dp-card-title">
              Progress · 50-participant target (§22.2)
            </p>
            <ProgressBar
              label="Participants"
              current={stats?.participants ?? 0}
              target={50}
            />
            <ProgressBar
              label="Local formal trials (50 × 30 = 1500)"
              current={stats?.localFormal ?? 0}
              target={1500}
            />
            <ProgressBar
              label="Remote formal trials (50 × 30 = 1500)"
              current={stats?.remoteFormal ?? 0}
              target={1500}
            />
          </div>

          <div className="dp-card">
            <p className="dp-card-title">Local browser cache</p>
            <p className="dp-card-sub">
              {localSessions.length} session
              {localSessions.length === 1 ? "" : "s"} saved locally (
              {localSessions.filter((s) => s.synced).length} synced to backend).
            </p>
            <div className="dp-inline-actions">
              <button
                className="dp-btn"
                onClick={() => exportCSV(localSessions)}
              >
                Local CSV
              </button>
              <button
                className="dp-btn"
                onClick={() => exportJSON(localSessions)}
              >
                Local JSON
              </button>
              <button
                className="dp-btn dp-btn--danger"
                onClick={handleClearLocal}
              >
                Clear local cache
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Participants ──────────────────────────────────────────────────── */}
      {tab === "participants" && (
        <div className="dp-card">
          <p className="dp-card-title">Participant roster</p>
          {participants.length === 0 ? (
            <p className="dp-empty">No participants yet.</p>
          ) : (
            <table className="dp-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Local trials</th>
                  <th>Remote trials</th>
                  <th>Balance</th>
                  <th className="dp-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => {
                  const localOk = p.localTrials >= 33;
                  const remoteOk = p.remoteTrials >= 33;
                  const balanced = localOk && remoteOk;
                  return (
                    <tr key={p.participantId}>
                      <td className="dp-td-pid">{p.participantId}</td>
                      <td className={localOk ? "dp-td-ok" : "dp-td-warn"}>
                        {p.localTrials}
                      </td>
                      <td className={remoteOk ? "dp-td-ok" : "dp-td-warn"}>
                        {p.remoteTrials}
                      </td>
                      <td>
                        <span
                          className={`dp-pill ${balanced ? "dp-pill--ok" : "dp-pill--warn"}`}
                        >
                          {balanced ? "complete" : "incomplete"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="dp-btn dp-btn--small"
                          onClick={() =>
                            downloadParticipantCSV(p.participantId)
                          }
                        >
                          CSV
                        </button>
                        <button
                          className="dp-btn dp-btn--small"
                          onClick={() => {
                            setFilterParticipant(p.participantId);
                            setTab("trials");
                          }}
                        >
                          View trials
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Trials ───────────────────────────────────────────────────────── */}
      {tab === "trials" && (
        <>
          <div className="dp-filters">
            <div className="dp-filter">
              <label>Participant</label>
              <select
                value={filterParticipant}
                onChange={(e) => setFilterParticipant(e.target.value)}
              >
                <option value="">(all)</option>
                {participantOptions.map((pid) => (
                  <option key={pid} value={pid}>
                    {pid}
                  </option>
                ))}
              </select>
            </div>
            <div className="dp-filter">
              <label>Condition</label>
              <select
                value={filterCondition}
                onChange={(e) => setFilterCondition(e.target.value)}
              >
                <option value="all">all</option>
                <option value="local">local</option>
                <option value="remote">remote</option>
              </select>
            </div>
            <div className="dp-filter">
              <label>Trial type</label>
              <select
                value={filterTrialType}
                onChange={(e) => setFilterTrialType(e.target.value)}
              >
                <option value="formal">formal</option>
                <option value="practice">practice</option>
                <option value="all">all</option>
              </select>
            </div>
            <div className="dp-filter">
              <label>Label</label>
              <select
                value={filterLabel}
                onChange={(e) => setFilterLabel(e.target.value)}
              >
                <option value="all">all</option>
                <option value="labelled">labelled only</option>
                <option value="unlabelled">unlabelled only</option>
              </select>
            </div>
            <button className="dp-btn" onClick={fetchTrials}>
              Apply
            </button>
          </div>

          <div className="dp-trials-bar">
            <span className="dp-trials-count">
              {loading
                ? "Loading…"
                : `${trials.length} trial${trials.length === 1 ? "" : "s"}`}
            </span>
            <div className="dp-inline-actions">
              <button
                className="dp-btn dp-btn--small"
                onClick={() => handleBulkLabel("local")}
                disabled={!trials.length}
              >
                Label all → local
              </button>
              <button
                className="dp-btn dp-btn--small"
                onClick={() => handleBulkLabel("remote")}
                disabled={!trials.length}
              >
                Label all → remote
              </button>
            </div>
          </div>

          {trials.length === 0 ? (
            <p className="dp-empty">No trials match the current filters.</p>
          ) : (
            <div className="dp-table-wrap">
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Cond</th>
                    <th>Type</th>
                    <th>#</th>
                    <th>Duration</th>
                    <th>Col.</th>
                    <th>Clicks</th>
                    <th>D1 ms</th>
                    <th>D2 ms</th>
                    <th>Avg risk</th>
                    <th>Label</th>
                    <th className="dp-th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trials.map((t) => (
                    <tr key={t.id}>
                      <td className="dp-td-pid">{t.participantId}</td>
                      <td>
                        <span className={`dp-cond dp-cond--${t.condition}`}>
                          {t.condition}
                        </span>
                      </td>
                      <td className="dp-td-subtle">{t.trialType}</td>
                      <td>{t.trialId}</td>
                      <td>{t.durationMs} ms</td>
                      <td>
                        {t.collisionFlag ? (
                          <span className="dp-col dp-col--hit">
                            {t.collisionSide}
                          </span>
                        ) : (
                          <span className="dp-col dp-col--ok">—</span>
                        )}
                      </td>
                      <td>{t.totalClicks}</td>
                      <td>{t.danger1DurationMs}</td>
                      <td>{t.danger2DurationMs}</td>
                      <td>{Number(t.avgRiskScore ?? 0).toFixed(3)}</td>
                      <td>
                        <div className="dp-label-btns">
                          <button
                            className={`dp-lbtn ${t.label === "local" ? "dp-lbtn--local" : ""}`}
                            onClick={() => handleLabel(t.id, "local")}
                          >
                            L
                          </button>
                          <button
                            className={`dp-lbtn ${t.label === "remote" ? "dp-lbtn--remote" : ""}`}
                            onClick={() => handleLabel(t.id, "remote")}
                          >
                            R
                          </button>
                        </div>
                      </td>
                      <td>
                        {/* Session CSV button — only shows when a sessionId exists */}
                        {t.sessionId && (
                          <button
                            className="dp-btn dp-btn--small"
                            onClick={() => downloadSessionCSV(t.sessionId)}
                            title={`Download all trials in session ${t.sessionId.slice(0, 8)}…`}
                          >
                            Session CSV
                          </button>
                        )}
                        <button
                          className="dp-btn dp-btn--small"
                          onClick={() =>
                            setSelectedTrial(
                              selectedTrial?.id === t.id ? null : t,
                            )
                          }
                        >
                          {selectedTrial?.id === t.id ? "close" : "view"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedTrial && (
            <TrialDrawer
              trial={selectedTrial}
              onClose={() => setSelectedTrial(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, accent, subtle }) {
  const cls = ["dp-stat"];
  if (accent === "good") cls.push("dp-stat--good");
  if (accent === "warn") cls.push("dp-stat--warn");
  if (subtle) cls.push("dp-stat--subtle");
  return (
    <div className={cls.join(" ")}>
      <span className="dp-stat-label">{label}</span>
      <span className="dp-stat-value">{value}</span>
    </div>
  );
}

function ProgressBar({ label, current, target }) {
  const pct =
    target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <div className="dp-progress">
      <div className="dp-progress-head">
        <span>{label}</span>
        <span className="dp-progress-count">
          {current} / {target} ({pct}%)
        </span>
      </div>
      <div className="dp-progress-track">
        <div className="dp-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TrialDrawer({ trial, onClose }) {
  return (
    <div className="dp-drawer">
      <div className="dp-drawer-head">
        <span className="dp-drawer-title">
          Trial · {trial.participantId} · {trial.condition} · {trial.trialType}{" "}
          #{trial.trialId}
        </span>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {trial.sessionId && (
            <button
              className="dp-btn dp-btn--small"
              onClick={() => downloadSessionCSV(trial.sessionId)}
            >
              Session CSV
            </button>
          )}
          <button className="dp-close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {/* ── Outcome summary ─────────────────────────────────────────────── */}
      <div className="dp-drawer-grid">
        <MetricBox label="Duration" value={`${trial.durationMs} ms`} />
        <MetricBox
          label="Collision"
          value={trial.collisionFlag ? trial.collisionSide : "—"}
        />
        <MetricBox label="Total clicks" value={trial.totalClicks} />
        <MetricBox label="Total frames" value={trial.totalFrames} />
        <MetricBox
          label="D1 duration"
          value={`${trial.danger1DurationMs} ms`}
        />
        <MetricBox
          label="D2 duration"
          value={`${trial.danger2DurationMs} ms`}
        />
        <MetricBox
          label="Avg risk"
          value={Number(trial.avgRiskScore ?? 0).toFixed(3)}
        />
        <MetricBox label="Max risk" value={trial.maxRiskScore} />
      </div>

      {/* ── §22.12 A — Boundary risk ─────────────────────────────────────── */}
      <p className="dp-drawer-section">§22.12 A — Boundary risk</p>
      <div className="dp-drawer-grid">
        <MetricBox label="Survival time" value={fmtMs(trial.survivalTimeMs)} />
        <MetricBox
          label="Collision (0/1)"
          value={trial.collisionOccurred ?? "—"}
        />
        <MetricBox
          label="Min dist mean"
          value={fmt(trial.minDistanceToWallMean)}
        />
        <MetricBox
          label="Min dist min"
          value={fmt(trial.minDistanceToWallMin)}
        />
        <MetricBox label="Danger1 ratio" value={fmt(trial.danger1Ratio)} />
        <MetricBox label="Danger2 ratio" value={fmt(trial.danger2Ratio)} />
        <MetricBox label="Entry count" value={trial.dangerEntryCount ?? "—"} />
        <MetricBox
          label="Visit dur. mean"
          value={fmtMs(trial.dangerVisitDurationMean)}
        />
      </div>

      {/* ── §22.12 B — Reaction latency ──────────────────────────────────── */}
      <p className="dp-drawer-section">§22.12 B — Reaction latency</p>
      <div className="dp-drawer-grid">
        <MetricBox
          label="1st click latency mean"
          value={fmtMs(trial.dangerResponseLatencyMean)}
        />
        <MetricBox
          label="1st click latency std"
          value={fmtMs(trial.dangerResponseLatencyStd)}
        />
        <MetricBox
          label="1st click latency max"
          value={fmtMs(trial.dangerResponseLatencyMax)}
        />
        <MetricBox
          label="2nd click latency mean"
          value={fmtMs(trial.secondClickLatencyMean)}
        />
        <MetricBox
          label="2nd click latency std"
          value={fmtMs(trial.secondClickLatencyStd)}
        />
        <MetricBox
          label="Recovery mean"
          value={fmtMs(trial.recoveryTimeMean)}
        />
      </div>

      {/* ── §22.12 C — Overshoot ─────────────────────────────────────────── */}
      <p className="dp-drawer-section">§22.12 C — Overshoot</p>
      <div className="dp-drawer-grid">
        <MetricBox
          label="Overshoot count"
          value={trial.overshootCount ?? "—"}
        />
        <MetricBox
          label="Amplitude mean"
          value={fmt(trial.overshootAmplitudeMean)}
        />
        <MetricBox
          label="Amplitude max"
          value={fmt(trial.overshootAmplitudeMax)}
        />
      </div>

      {/* ── §22.12 D — Oscillation ───────────────────────────────────────── */}
      <p className="dp-drawer-section">§22.12 D — Oscillation</p>
      <div className="dp-drawer-grid">
        <MetricBox label="Dir changes" value={trial.dirChangeCount ?? "—"} />
        <MetricBox
          label="Side switches"
          value={trial.dangerSideSwitchCount ?? "—"}
        />
        <MetricBox
          label="High-freq clicks"
          value={trial.highFreqClickCount ?? "—"}
        />
        <MetricBox label="Click bursts" value={trial.clickBurstCount ?? "—"} />
        <MetricBox
          label="Heading variance"
          value={fmt(trial.headingVariance)}
        />

        <MetricBox
          label="Frame jitter"
          value={fmtMs(trial.frameIntervalJitterMs)}
        />
        <MetricBox
          label="Click jitter"
          value={fmtMs(trial.clickIntervalJitterMs)}
        />
      </div>

      {/* ── §22.12 E — Control efficiency ────────────────────────────────── */}
      <p className="dp-drawer-section">§22.12 E — Control efficiency</p>
      <div className="dp-drawer-grid">
        <MetricBox label="Click rate" value={`${fmt(trial.clickRate)} /s`} />
        <MetricBox
          label="Effective %"
          value={fmtPct(trial.effectiveClickRatio)}
        />
        <MetricBox
          label="Ineffective %"
          value={fmtPct(trial.ineffectiveClickRatio)}
        />
        <MetricBox
          label="Risk drop/click"
          value={fmt(trial.riskDropPerClickMean)}
        />
        <MetricBox
          label="Worsening count"
          value={trial.worseningClickCount ?? "—"}
        />
        <MetricBox
          label="Worsening %"
          value={fmtPct(trial.worseningClickRatio)}
        />
        <MetricBox
          label="Anticipatory %"
          value={fmtPct(trial.anticipatoryClickRatio)}
        />
      </div>

      {/* ── Environment ─────────────────────────────────────────────────── */}
      {(trial.deviceOs || trial.deviceBrowser) && (
        <>
          <p className="dp-drawer-section">Environment</p>
          <div className="dp-drawer-grid">
            <MetricBox label="OS" value={trial.deviceOs || "—"} />
            <MetricBox label="Browser" value={trial.deviceBrowser || "—"} />
            <MetricBox label="Screen" value={trial.screenResolution || "—"} />
            <MetricBox label="DPR" value={trial.devicePixelRatio ?? "—"} />
            <MetricBox
              label="Net latency"
              value={
                trial.networkLatencyMs != null
                  ? `${trial.networkLatencyMs} ms`
                  : "—"
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

function MetricBox({ label, value }) {
  return (
    <div className="dp-metric">
      <span className="dp-metric-label">{label}</span>
      <span className="dp-metric-value">{value}</span>
    </div>
  );
}

function fmt(v) {
  return v == null ? "—" : typeof v === "number" ? v.toFixed(3) : String(v);
}
function fmtMs(v) {
  return v == null ? "—" : `${Math.round(v)} ms`;
}
function fmtPct(v) {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
