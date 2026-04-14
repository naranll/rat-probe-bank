import React, { useState, useEffect } from "react";
import { useRatProbe } from "../hooks/useRatProbe";
import { apiTransfer } from "../util/api";
import { saveSession } from "../util/telemetry";
import CaptchaGame from "./CaptchaGame";

/**
 * TransferModal — 4-step state machine:
 *   form → captcha → ratWarning | sending
 *
 * On CAPTCHA complete: blends ambient probe (35%) + captcha score (65%).
 * Full session record is saved to localStorage via telemetry.js.
 */
export default function TransferModal({
  visible,
  onClose,
  onSuccess,
  username,
}) {
  const [step, setStep] = useState("form");
  const [toUser, setToUser] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [ratResult, setRatResult] = useState(null);
  const [pendingSession, setPendingSession] = useState(null);

  const { analyze, reset } = useRatProbe(visible && step === "form");

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep("form");
      setToUser("");
      setAmount("");
      setError("");
      setRatResult(null); // temp until detector is working
      setPendingSession(null);
      reset();
    }
  }, [visible, reset]);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setError("");
    if (!toUser.trim()) {
      setError("Enter a recipient username");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setStep("captcha");
  };

  const handleCaptchaComplete = async (captchaSamples) => {
    const ambientProbe = analyze();
    const captchaScore = scoreCaptcha(captchaSamples);
    const combinedScore = Math.round(
      ambientProbe.score * 0.35 + captchaScore * 0.65,
    );
    const allFlags = [...ambientProbe.flags, ...captchaFlags(captchaSamples)];

    const session = {
      sessionId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      username,
      transferTo: toUser,
      transferAmount: parseFloat(amount),
      label: null, // set manually during labelling
      ambientProbe: {
        score: ambientProbe.score,
        flags: ambientProbe.flags,
        rawMetrics: ambientProbe.rawMetrics,
      },
      captchaProbe: {
        score: captchaScore,
        flags: captchaFlags(captchaSamples),
        samples: captchaSamples,
      },
      combinedScore,
      allFlags,
    };

    await saveSession(session);

    console.info("[RatProbe] ambient:", ambientProbe);
    console.info("[RatProbe] captcha samples:", captchaSamples);
    console.info(
      "[RatProbe] combined score:",
      combinedScore,
      "flags:",
      allFlags,
    );
    console.info("[RatProbe] session saved:", session.sessionId);

    if (combinedScore >= 60) {
      setRatResult({ score: combinedScore, flags: allFlags });
      setPendingSession(session);
      setStep("ratWarning");
    } else {
      doTransfer();
    }
  };

  const doTransfer = async () => {
    setStep("sending");
    setError("");
    try {
      await apiTransfer(username, toUser, parseFloat(amount));
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
      setStep("form");
    }
  };

  if (!visible) return null;

  return (
    <div style={S.overlay} onClick={step === "form" ? onClose : undefined}>
      <div style={S.wrapper} onClick={(e) => e.stopPropagation()}>
        {step === "form" && (
          <div style={S.modal}>
            <div style={S.header}>
              <span style={S.headerTitle}>New transfer</span>
              <button style={S.closeBtn} onClick={onClose}>
                ✕
              </button>
            </div>
            <form onSubmit={handleFormSubmit} style={S.form}>
              <label style={S.label}>To (username)</label>
              <input
                style={S.input}
                value={toUser}
                onChange={(e) => setToUser(e.target.value)}
                placeholder="recipient_username"
                autoComplete="off"
                required
              />
              <label style={S.label}>Amount</label>
              <div style={S.amountRow}>
                <span style={S.currency}>USD</span>
                <input
                  style={{ ...S.input, flex: 1 }}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              {error && <p style={S.error}>{error}</p>}
              <button style={S.submitBtn} type="submit">
                Continue to verification →
              </button>
            </form>
          </div>
        )}

        {step === "captcha" && (
          <CaptchaGame onComplete={handleCaptchaComplete} onCancel={onClose} />
        )}

        {step === "ratWarning" && ratResult && (
          <div style={S.modal}>
            <div style={S.ratPanel}>
              <div style={S.ratIcon}>⚠</div>
              <p style={S.ratTitle}>Suspicious session detected</p>
              <p style={S.ratDesc}>
                Risk score:{" "}
                <strong style={{ color: "#fbbf24" }}>
                  {ratResult.score}/100
                </strong>
                . Behavioral analysis flagged this interaction pattern. We
                recommend cancelling.
              </p>
              <div style={S.ratMetrics}>
                {ratResult.flags
                  .filter((f) => f !== "insufficient_data")
                  .map((f) => (
                    <span key={f} style={S.ratFlag}>
                      {f.replace(/_/g, " ")}
                    </span>
                  ))}
              </div>
              <div style={S.ratActions}>
                <button style={S.ratCancel} onClick={onClose}>
                  Cancel transfer
                </button>
                <button style={S.ratProceed} onClick={doTransfer}>
                  Proceed anyway
                </button>
              </div>
              {error && <p style={S.error}>{error}</p>}
            </div>
          </div>
        )}

        {step === "sending" && (
          <div style={{ ...S.modal, alignItems: "center", gap: "16px" }}>
            <div style={S.spinner} />
            <p style={{ color: "#8899bb", fontSize: "13px", margin: 0 }}>
              Processing transfer…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreCaptcha(samples) {
  if (!samples?.length) return 0;
  const correct = samples.filter((s) => s.correct);
  if (!correct.length) return 0;
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const avgStraight = avg(correct.map((s) => s.straightness));
  const avgPreDwell = avg(correct.map((s) => s.preDwellMs));
  const avgReaction = avg(correct.map((s) => s.reactionMs));
  const overshootRate =
    correct.filter((s) => s.overshoot).length / correct.length;
  const avgVelVar = avg(
    correct.map((s) => {
      const v = s.velocity ?? [];
      if (v.length < 2) return 999;
      const m = avg(v);
      return avg(v.map((x) => (x - m) ** 2));
    }),
  );

  let score = 0;
  score +=
    avgStraight > 0.97
      ? 30
      : avgStraight > 0.93
        ? 20
        : avgStraight > 0.88
          ? 10
          : 0;
  score +=
    avgPreDwell < 20 ? 25 : avgPreDwell < 60 ? 15 : avgPreDwell < 100 ? 5 : 0;
  score +=
    avgVelVar < 0.03 ? 25 : avgVelVar < 0.1 ? 15 : avgVelVar < 0.25 ? 5 : 0;
  score += overshootRate < 0.05 ? 15 : overshootRate < 0.2 ? 8 : 0;
  score += avgReaction < 80 ? 10 : avgReaction < 150 ? 5 : 0;
  return Math.min(100, Math.round(score));
}

function captchaFlags(samples) {
  const flags = [];
  const correct = samples.filter((s) => s.correct);
  if (!correct.length) return flags;
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  if (avg(correct.map((s) => s.straightness)) > 0.93)
    flags.push("straight_cursor_path");
  if (avg(correct.map((s) => s.preDwellMs)) < 60)
    flags.push("no_scan_hesitation");
  if (avg(correct.map((s) => s.reactionMs)) < 150)
    flags.push("fast_reaction_time");
  if (correct.filter((s) => s.overshoot).length / correct.length < 0.1)
    flags.push("no_target_overshoot");
  return flags;
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    backdropFilter: "blur(4px)",
  },
  wrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "24px",
  },
  modal: {
    background: "#161b27",
    border: "1px solid #2a3045",
    borderRadius: "12px",
    padding: "28px",
    width: "100%",
    maxWidth: "380px",
    fontFamily: "'IBM Plex Mono',monospace",
    boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { color: "#f0f4ff", fontWeight: 700, fontSize: "15px" },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#6b7fa3",
    cursor: "pointer",
    fontSize: "16px",
    fontFamily: "inherit",
  },
  form: { display: "flex", flexDirection: "column", gap: "6px" },
  label: {
    color: "#8899bb",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginTop: "8px",
  },
  input: {
    background: "#0f1117",
    border: "1px solid #2a3045",
    borderRadius: "6px",
    padding: "10px 14px",
    color: "#f0f4ff",
    fontSize: "14px",
    fontFamily: "inherit",
    outline: "none",
  },
  amountRow: { display: "flex", alignItems: "center", gap: "8px" },
  currency: { color: "#6b7fa3", fontSize: "13px", minWidth: "36px" },
  error: {
    color: "#f87171",
    fontSize: "12px",
    padding: "8px 12px",
    background: "rgba(248,113,113,0.08)",
    borderRadius: "6px",
    borderLeft: "3px solid #f87171",
    margin: "4px 0 0",
  },
  submitBtn: {
    marginTop: "16px",
    padding: "12px",
    background: "#4ade80",
    color: "#0a1a10",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  ratPanel: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    alignItems: "center",
    textAlign: "center",
  },
  ratIcon: {
    fontSize: "30px",
    color: "#fbbf24",
    width: "52px",
    height: "52px",
    borderRadius: "50%",
    background: "rgba(251,191,36,0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ratTitle: { color: "#fbbf24", fontWeight: 700, fontSize: "15px", margin: 0 },
  ratDesc: { color: "#8899bb", fontSize: "12px", lineHeight: 1.6, margin: 0 },
  ratMetrics: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    justifyContent: "center",
  },
  ratFlag: {
    background: "rgba(251,191,36,0.1)",
    border: "1px solid rgba(251,191,36,0.25)",
    color: "#fbbf24",
    borderRadius: "4px",
    padding: "3px 8px",
    fontSize: "11px",
  },
  ratActions: { display: "flex", gap: "10px", width: "100%" },
  ratCancel: {
    flex: 1,
    padding: "10px",
    background: "none",
    border: "1px solid #2a3045",
    borderRadius: "6px",
    color: "#f0f4ff",
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: "12px",
    cursor: "pointer",
  },
  ratProceed: {
    flex: 1,
    padding: "10px",
    background: "rgba(251,191,36,0.1)",
    border: "1px solid rgba(251,191,36,0.3)",
    borderRadius: "6px",
    color: "#fbbf24",
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: "12px",
    cursor: "pointer",
  },
  spinner: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    border: "2px solid #2a3045",
    borderTopColor: "#4ade80",
    animation: "spin 0.8s linear infinite",
  },
};
