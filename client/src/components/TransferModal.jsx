import React, { useState } from "react";
import { apiTransfer } from "../util/api";
import { saveSession } from "../util/telemetry";
import GameRule from "./GameRule";
import MiniGame from "./MiniGame";
import TransferSuccess from "./TransferSuccess";
import "../styles/transfer.css";

export default function TransferModal(props) {
  if (!props.visible) return null;
  // Key on openId so every open gets a fresh mount — no reset-in-effect needed
  return <TransferModalContent key={props.openId ?? "open"} {...props} />;
}

function TransferModalContent({ onClose, onSuccess, username }) {
  const [step, setStep] = useState("form");
  const [toUser, setToUser] = useState("Bob");
  const [amount, setAmount] = useState("1.00");
  const [condition, setCondition] = useState("local");
  const [error, setError] = useState("");

  // Stored after minigame completes so SessionComplete can read it
  const [gameResult, setGameResult] = useState(null);

  // ── Step 1: form ───────────────────────────────────────────────────────────
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
    setStep("instructions");
  };

  // ── Step 2 → 3: instructions → minigame ───────────────────────────────────
  const handleStartGame = () => setStep("minigame");

  // ── Step 3 → 4: minigame complete → upload ────────────────────────────────
  const handleMiniGameComplete = async (result) => {
    setGameResult(result);
    setStep("uploading");

    try {
      await saveSession({
        sessionId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        username,
        transferTo: toUser,
        transferAmount: parseFloat(amount),
        participantId: username, // auth username IS the participant ID
        condition: result.condition,
        label: null, // labelled offline in DataPanel
        miniGame: {
          practiceTrials: result.practiceTrials,
          formalTrials: result.formalTrials,
          totalFormalTrials: result.totalFormalTrials,
        },
      });
      console.info(
        "[TransferModal] session saved for",
        username,
        result.condition,
      );
    } catch (err) {
      // Save failure must not block the transfer — log and continue
      console.warn("[TransferModal] session save failed, proceeding:", err);
    }

    doTransfer();
  };

  // ── Step 4 → 5: execute transfer ──────────────────────────────────────────
  const doTransfer = async () => {
    setStep("sending");
    setError("");
    try {
      await apiTransfer(username, toUser, parseFloat(amount));
      setStep("done");
    } catch (err) {
      setError(err.message);
      setStep("form");
    }
  };

  // ── Step 5 → close ────────────────────────────────────────────────────────
  const handleDone = () => {
    onSuccess?.();
    onClose();
  };

  // RENDER
  // Instructions and MiniGame and SessionComplete are full-width — no modal wrapper
  if (step === "instructions") {
    return (
      <div className="tr-overlay">
        <div className="tr-wrapper" onClick={(e) => e.stopPropagation()}>
          <GameRule onStart={handleStartGame} onCancel={onClose} />
        </div>
      </div>
    );
  }

  if (step === "minigame") {
    return (
      <div className="tr-overlay">
        <div className="tr-wrapper" onClick={(e) => e.stopPropagation()}>
          <MiniGame
            participantId={username}
            condition={condition}
            onComplete={handleMiniGameComplete}
            onCancel={onClose}
          />
        </div>
      </div>
    );
  }

  if (step === "done" && gameResult) {
    return (
      <div className="tr-overlay">
        <div className="tr-wrapper" onClick={(e) => e.stopPropagation()}>
          <TransferSuccess
            condition={gameResult.condition}
            formalTrials={gameResult.formalTrials}
            onClose={handleDone}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="tr-overlay" onClick={step === "form" ? onClose : undefined}>
      <div className="tr-wrapper" onClick={(e) => e.stopPropagation()}>
        {step === "form" && (
          <div className="tr-modal">
            <div className="tr-header">
              <span className="tr-header__title">New transfer</span>
              <button
                className="tr-close-btn"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="tr-form">
              <label className="tr-label">To (username)</label>
              <input
                className="tr-input"
                value={toUser}
                onChange={(e) => setToUser(e.target.value)}
                placeholder="recipient_username"
                autoComplete="off"
                required
              />

              <label className="tr-label">Amount</label>
              <div className="tr-amount-row">
                <span className="tr-currency">$</span>
                <input
                  className="tr-input tr-input--grow"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="tr-exp-block">
                <p className="tr-exp-header">Experiment condition</p>
                <div className="tr-condition-row">
                  <label
                    className={`tr-radio ${condition === "local" ? "tr-radio--active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="condition"
                      value="local"
                      checked={condition === "local"}
                      onChange={() => setCondition("local")}
                    />
                    <span>Local</span>
                    <small>本机操作</small>
                  </label>
                  <label
                    className={`tr-radio ${condition === "remote" ? "tr-radio--active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="condition"
                      value="remote"
                      checked={condition === "remote"}
                      onChange={() => setCondition("remote")}
                    />
                    <span>Remote</span>
                    <small>远程桌面</small>
                  </label>
                </div>
              </div>

              {error && <p className="tr-error">{error}</p>}

              <button className="tr-submit-btn" type="submit">
                Continue to verification →
              </button>
            </form>
          </div>
        )}

        {/* ── uploading ────────────────────────────────────────────────── */}
        {step === "uploading" && (
          <div className="tr-modal tr-modal--centered">
            <div className="tr-spinner" />
            <p className="tr-status-text">Uploading session data…</p>
            <p className="tr-status-sub">Please do not close this window.</p>
          </div>
        )}

        {/* ── sending ──────────────────────────────────────────────────── */}
        {step === "sending" && (
          <div className="tr-modal tr-modal--centered">
            <div className="tr-spinner" />
            <p className="tr-status-text">Processing transfer…</p>
          </div>
        )}
      </div>
    </div>
  );
}
