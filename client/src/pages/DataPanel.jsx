import { useState } from "react";
import {
  loadSessions,
  clearSessions,
  exportJSON,
  exportCSV,
} from "../util/telemetry";
import { useNavigate } from "react-router-dom";

/**
 * DataPanel — admin view for collected RAT probe sessions.
 *
 * Features:
 *   - View all sessions with key metrics
 *   - Manually label sessions as "human" or "rat" (ground truth for ML training)
 *   - Export as JSON (full fidelity) or CSV (flattened features for pandas)
 *   - Clear all data
 *
 * Access: navigate to /data  (add route to App.jsx)
 */
export default function DataPanel() {
  const [sessions, setSessions] = useState(() => loadSessions());
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();

  const setLabel = (sessionId, label) => {
    const updated = sessions.map((s) =>
      s.sessionId === sessionId ? { ...s, label } : s,
    );
    setSessions(updated);
    localStorage.setItem("ratprobe_sessions", JSON.stringify(updated));
  };

  const handleClear = () => {
    if (window.confirm("Delete all session data? This cannot be undone.")) {
      clearSessions();
      setSessions([]);
      setSelected(null);
    }
  };

  const labelCounts = {
    total: sessions.length,
    human: sessions.filter((s) => s.label === "human").length,
    rat: sessions.filter((s) => s.label === "rat").length,
    unlabelled: sessions.filter((s) => !s.label).length,
  };

  return (
    <div style={S.page}>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={() => navigate("/")}>
          ← Back
        </button>
        <h1 style={S.pageTitle}>Session data</h1>
        <div style={S.actions}>
          <button style={S.btn} onClick={() => exportCSV(sessions)}>
            Export CSV
          </button>
          <button style={S.btn} onClick={() => exportJSON(sessions)}>
            Export JSON
          </button>
          <button
            style={{ ...S.btn, borderColor: "#f87171", color: "#f87171" }}
            onClick={handleClear}
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={S.cards}>
        {[
          { label: "Total sessions", value: labelCounts.total },
          {
            label: "Labelled human",
            value: labelCounts.human,
            color: "#4ade80",
          },
          { label: "Labelled RAT", value: labelCounts.rat, color: "#f87171" },
          {
            label: "Unlabelled",
            value: labelCounts.unlabelled,
            color: "#fbbf24",
          },
        ].map((c) => (
          <div key={c.label} style={S.card}>
            <p style={S.cardLabel}>{c.label}</p>
            <p style={{ ...S.cardValue, color: c.color || "#f0f4ff" }}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <p style={S.hint}>
        Label sessions as <strong style={{ color: "#4ade80" }}>human</strong> or{" "}
        <strong style={{ color: "#f87171" }}>RAT</strong> to build ground-truth
        training data. Use a real RAT tool (e.g. AnyDesk, TeamViewer) and
        simulate sessions to collect RAT samples.
      </p>

      {/* Session table */}
      <div style={S.tableWrapper}>
        {sessions.length === 0 ? (
          <p style={S.empty}>
            No sessions yet. Complete a transfer to generate data.
          </p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                {["Time", "User", "Score", "Flags", "Label", "Details"].map(
                  (h) => (
                    <th key={h} style={S.th}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {[...sessions].reverse().map((s) => (
                <tr key={s.sessionId} style={S.tr}>
                  <td style={S.td}>{new Date(s.timestamp).toLocaleString()}</td>
                  <td style={S.td}>{s.username}</td>
                  <td style={S.td}>
                    <span
                      style={{
                        ...S.scorePill,
                        background:
                          s.combinedScore >= 60
                            ? "rgba(248,113,113,0.12)"
                            : "rgba(74,222,128,0.12)",
                        color: s.combinedScore >= 60 ? "#f87171" : "#4ade80",
                      }}
                    >
                      {s.combinedScore}
                    </span>
                  </td>
                  <td style={S.td}>
                    <span style={S.flagCount}>
                      {
                        (s.allFlags || []).filter(
                          (f) => f !== "insufficient_data",
                        ).length
                      }{" "}
                      flags
                    </span>
                  </td>
                  <td style={S.td}>
                    <div style={S.labelBtns}>
                      <button
                        style={{
                          ...S.labelBtn,
                          ...(s.label === "human" ? S.labelHuman : {}),
                        }}
                        onClick={() => setLabel(s.sessionId, "human")}
                      >
                        H
                      </button>
                      <button
                        style={{
                          ...S.labelBtn,
                          ...(s.label === "rat" ? S.labelRat : {}),
                        }}
                        onClick={() => setLabel(s.sessionId, "rat")}
                      >
                        R
                      </button>
                    </div>
                  </td>
                  <td style={S.td}>
                    <button
                      style={S.detailBtn}
                      onClick={() =>
                        setSelected(
                          selected?.sessionId === s.sessionId ? null : s,
                        )
                      }
                    >
                      {selected?.sessionId === s.sessionId ? "close" : "view"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div style={S.drawer}>
          <div style={S.drawerHeader}>
            <span style={S.drawerTitle}>
              Session detail — {selected.sessionId.slice(0, 8)}…
            </span>
            <button style={S.closeBtn} onClick={() => setSelected(null)}>
              ✕
            </button>
          </div>

          <div style={S.drawerGrid}>
            <MetricBox label="Combined score" value={selected.combinedScore} />
            <MetricBox
              label="Ambient score"
              value={selected.ambientProbe?.score ?? 0}
            />
            <MetricBox
              label="Captcha score"
              value={selected.captchaProbe?.score ?? 0}
            />
            <MetricBox
              label="Samples"
              value={selected.captchaProbe?.samples?.length ?? 0}
            />
          </div>

          <p style={S.drawerSectionLabel}>Flags</p>
          <div style={S.flagsRow}>
            {(selected.allFlags || []).filter((f) => f !== "insufficient_data")
              .length === 0 ? (
              <span style={{ color: "#6b7fa3", fontSize: "12px" }}>none</span>
            ) : (
              (selected.allFlags || [])
                .filter((f) => f !== "insufficient_data")
                .map((f) => (
                  <span key={f} style={S.flag}>
                    {f.replace(/_/g, " ")}
                  </span>
                ))
            )}
          </div>

          <p style={S.drawerSectionLabel}>Per-click samples</p>
          {(selected.captchaProbe?.samples ?? []).map((s, i) => (
            <div key={i} style={S.sampleRow}>
              <span style={S.sampleTarget}>{s.targetId}</span>
              <span style={S.sampleStat}>
                straight: {s.straightness?.toFixed(3)}
              </span>
              <span style={S.sampleStat}>dwell: {s.preDwellMs}ms</span>
              <span style={S.sampleStat}>react: {s.reactionMs}ms</span>
              <span style={S.sampleStat}>traj: {s.trajectory?.length}pts</span>
              <span
                style={{
                  ...S.sampleStat,
                  color: s.overshoot ? "#4ade80" : "#6b7fa3",
                }}
              >
                {s.overshoot ? "overshot" : "direct"}
              </span>
            </div>
          ))}

          <p style={S.drawerSectionLabel}>Raw JSON</p>
          <pre style={S.pre}>{JSON.stringify(selected, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value }) {
  return (
    <div
      style={{
        background: "#0f1117",
        borderRadius: "8px",
        padding: "12px 16px",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "10px",
          color: "#6b7fa3",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: "22px",
          fontWeight: 700,
          color: "#f0f4ff",
        }}
      >
        {value}
      </p>
    </div>
  );
}

const S = {
  page: {
    minHeight: "100vh",
    background: "#0f1117",
    fontFamily: "'IBM Plex Mono',monospace",
    color: "#f0f4ff",
    padding: "40px 48px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "#6b7fa3",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "13px",
    padding: 0,
  },
  pageTitle: { margin: 0, fontSize: "20px", fontWeight: 600, flex: 1 },
  actions: { display: "flex", gap: "8px" },
  btn: {
    padding: "8px 16px",
    background: "none",
    border: "1px solid #2a3045",
    borderRadius: "6px",
    color: "#8899bb",
    fontFamily: "inherit",
    fontSize: "12px",
    cursor: "pointer",
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "12px",
  },
  card: {
    background: "#161b27",
    border: "1px solid #2a3045",
    borderRadius: "8px",
    padding: "16px",
  },
  cardLabel: {
    margin: "0 0 4px",
    fontSize: "11px",
    color: "#6b7fa3",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  cardValue: { margin: 0, fontSize: "28px", fontWeight: 700 },
  hint: {
    margin: 0,
    fontSize: "12px",
    color: "#6b7fa3",
    lineHeight: 1.6,
    background: "#161b27",
    border: "1px solid #2a3045",
    borderRadius: "8px",
    padding: "14px 16px",
  },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "12px" },
  th: {
    textAlign: "left",
    padding: "10px 14px",
    color: "#6b7fa3",
    borderBottom: "1px solid #2a3045",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontSize: "10px",
    whiteSpace: "nowrap",
  },
  tr: { borderBottom: "1px solid #1a2035" },
  td: { padding: "10px 14px", verticalAlign: "middle", color: "#8899bb" },
  scorePill: {
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "12px",
    fontWeight: 700,
  },
  flagCount: { color: "#6b7fa3", fontSize: "11px" },
  labelBtns: { display: "flex", gap: "4px" },
  labelBtn: {
    width: "24px",
    height: "24px",
    borderRadius: "4px",
    border: "1px solid #2a3045",
    background: "none",
    color: "#6b7fa3",
    cursor: "pointer",
    fontSize: "11px",
    fontFamily: "inherit",
    fontWeight: 700,
  },
  labelHuman: {
    background: "rgba(74,222,128,0.15)",
    border: "1px solid rgba(74,222,128,0.4)",
    color: "#4ade80",
  },
  labelRat: {
    background: "rgba(248,113,113,0.15)",
    border: "1px solid rgba(248,113,113,0.4)",
    color: "#f87171",
  },
  detailBtn: {
    background: "none",
    border: "1px solid #2a3045",
    borderRadius: "4px",
    padding: "3px 8px",
    color: "#6b7fa3",
    cursor: "pointer",
    fontSize: "11px",
    fontFamily: "inherit",
  },
  empty: {
    color: "#6b7fa3",
    fontSize: "13px",
    padding: "32px 0",
    textAlign: "center",
  },
  drawer: {
    background: "#161b27",
    border: "1px solid #2a3045",
    borderRadius: "10px",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  drawerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  drawerTitle: { fontSize: "13px", color: "#8899bb" },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#6b7fa3",
    cursor: "pointer",
    fontSize: "16px",
    fontFamily: "inherit",
  },
  drawerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "8px",
  },
  drawerSectionLabel: {
    margin: 0,
    fontSize: "10px",
    color: "#6b7fa3",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  flagsRow: { display: "flex", flexWrap: "wrap", gap: "6px" },
  flag: {
    background: "rgba(251,191,36,0.08)",
    border: "1px solid rgba(251,191,36,0.2)",
    color: "#fbbf24",
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "11px",
  },
  sampleRow: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap",
    padding: "8px 12px",
    background: "#0f1117",
    borderRadius: "6px",
    alignItems: "center",
  },
  sampleTarget: {
    color: "#f0f4ff",
    fontSize: "12px",
    fontWeight: 700,
    minWidth: "60px",
  },
  sampleStat: { color: "#6b7fa3", fontSize: "11px" },
  pre: {
    background: "#0a0f1a",
    borderRadius: "6px",
    padding: "16px",
    fontSize: "10px",
    color: "#6b7fa3",
    overflow: "auto",
    maxHeight: "300px",
    margin: 0,
    lineHeight: 1.6,
  },
};
