import { useState, useRef, useCallback, useEffect } from "react";
import "../styles/game.css";

// ─── Constants (locked per supervisor spec §22.4) ────────────────────────────
const CANVAS_SIZE = 500;
const BALL_RADIUS = 12;
const INIT_SPEED = 165; //org-140
const MIN_SPEED = 115; //100
const MAX_SPEED = 205; //180  maintains ~40px/s headroom above init
const CLICK_BOOST = 80;
const PERTURB_INTERVAL = 350;
const PERTURB_ANGLE_MAX = 15; //org-12， moderate increase
const TRIAL_DURATION_MS = 6000;
const DANGER1_THRESHOLD = 80;
const DANGER2_THRESHOLD = 40;
export const PRACTICE_TRIALS = 3;
export const FORMAL_TRIALS = 3; // set to 3 for quick testing, 30 for production
const IDLE_DANGER_MS = 300;

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function deg2rad(d) {
  return (d * Math.PI) / 180;
}
function randomAngleDeg() {
  return (Math.random() * 2 - 1) * PERTURB_ANGLE_MAX;
}
function rotateDeg(vx, vy, deg) {
  const r = deg2rad(deg),
    cos = Math.cos(r),
    sin = Math.sin(r);
  return { vx: vx * cos - vy * sin, vy: vx * sin + vy * cos };
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function createInitialBall() {
  const angle = Math.random() * 2 * Math.PI;
  return {
    x: CANVAS_SIZE / 2,
    y: CANVAS_SIZE / 2,
    vx: Math.cos(angle) * INIT_SPEED,
    vy: Math.sin(angle) * INIT_SPEED,
    speed: INIT_SPEED,
  };
}

function minDistToWall(x, y) {
  return Math.min(
    x - BALL_RADIUS,
    CANVAS_SIZE - x - BALL_RADIUS,
    y - BALL_RADIUS,
    CANVAS_SIZE - y - BALL_RADIUS,
  );
}

function getDangerLevel(d) {
  if (d >= DANGER1_THRESHOLD) return 0;
  if (d >= DANGER2_THRESHOLD) return 1;
  return 2;
}

function getRiskScore(dangerLevel, msSinceLastClickInDanger) {
  let r = dangerLevel;
  if (dangerLevel > 0 && msSinceLastClickInDanger >= IDLE_DANGER_MS) r += 1;
  return r;
}

export default function MiniGame({
  onComplete,
  participantId = "",
  condition = "local",
}) {
  // Phase: practice_intro | practice_running | practice_done
  //      | formal_intro   | formal_running   | formal_done
  const [phase, setPhase] = useState("practice_intro");
  const [trialType, setTrialType] = useState("practice");
  const [trialIndex, setTrialIndex] = useState(0);
  const [trialResult, setTrialResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState(
    (TRIAL_DURATION_MS / 1000).toFixed(1),
  );
  const [danger, setDanger] = useState(0);

  const canvasRef = useRef(null);
  const ballRef = useRef(createInitialBall());
  const runningRef = useRef(false);
  const lastTRef = useRef(null);
  const lastPerturbT = useRef(null);
  const startTRef = useRef(null);
  const lastClickInDangerT = useRef(null);
  const frameIndexRef = useRef(0);
  const frameLogsRef = useRef([]);
  const clickLogsRef = useRef([]);
  const allTrialsRef = useRef([]);
  const rafRef = useRef(null);
  const tickRef = useRef(null);

  // ── Canvas draw ────────────────────────────────────────────────────────────
  function drawCanvas(ball, dangerLevel, collided) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = CANVAS_SIZE;

    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = "#0a0f1a";
    ctx.fillRect(0, 0, W, W);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 100, 0);
      ctx.lineTo(i * 100, W);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * 100);
      ctx.lineTo(W, i * 100);
      ctx.stroke();
    }

    // Danger zone fills
    if (dangerLevel >= 1) {
      ctx.fillStyle = "rgba(251,191,36,0.06)";
      ctx.fillRect(0, 0, W, DANGER1_THRESHOLD);
      ctx.fillRect(0, W - DANGER1_THRESHOLD, W, DANGER1_THRESHOLD);
      ctx.fillRect(0, 0, DANGER1_THRESHOLD, W);
      ctx.fillRect(W - DANGER1_THRESHOLD, 0, DANGER1_THRESHOLD, W);
    }
    if (dangerLevel === 2 || collided) {
      ctx.fillStyle = collided
        ? "rgba(248,113,113,0.18)"
        : "rgba(248,113,113,0.10)";
      ctx.fillRect(0, 0, W, DANGER2_THRESHOLD);
      ctx.fillRect(0, W - DANGER2_THRESHOLD, W, DANGER2_THRESHOLD);
      ctx.fillRect(0, 0, DANGER2_THRESHOLD, W);
      ctx.fillRect(W - DANGER2_THRESHOLD, 0, DANGER2_THRESHOLD, W);
    }

    // Border
    ctx.strokeStyle = collided
      ? "#f87171"
      : dangerLevel === 2
        ? "rgba(248,113,113,0.6)"
        : dangerLevel === 1
          ? "rgba(251,191,36,0.5)"
          : "rgba(255,255,255,0.08)";
    ctx.lineWidth = collided ? 2.5 : dangerLevel > 0 ? 1.5 : 1;
    ctx.strokeRect(1, 1, W - 2, W - 2);

    // Ball
    const ballColor = collided
      ? "#f87171"
      : dangerLevel === 2
        ? "#fca5a5"
        : dangerLevel === 1
          ? "#fde68a"
          : "#4ade80";
    ctx.shadowBlur = collided ? 24 : 14;
    ctx.shadowColor = ballColor;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = ballColor;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Velocity arrow
    const spd = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (spd > 0) {
      const ux = ball.vx / spd,
        uy = ball.vy / spd;
      ctx.beginPath();
      ctx.moveTo(
        ball.x + ux * (BALL_RADIUS + 2),
        ball.y + uy * (BALL_RADIUS + 2),
      );
      ctx.lineTo(
        ball.x + ux * (BALL_RADIUS + 22),
        ball.y + uy * (BALL_RADIUS + 22),
      );
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ── Game loop ──────────────────────────────────────────────────────────────
  const tick = useCallback(
    (nowMs) => {
      if (!runningRef.current) return;

      const lastT = lastTRef.current ?? nowMs;
      const dt = Math.min((nowMs - lastT) / 1000, 0.05);
      lastTRef.current = nowMs;

      const ball = ballRef.current;

      // Perturbation
      let pApplied = false,
        pAngle = 0;
      const msSincePerturb = lastPerturbT.current
        ? nowMs - lastPerturbT.current
        : PERTURB_INTERVAL + 1;
      if (msSincePerturb >= PERTURB_INTERVAL) {
        pAngle = randomAngleDeg();
        const rot = rotateDeg(ball.vx, ball.vy, pAngle);
        ball.vx = rot.vx;
        ball.vy = rot.vy;
        lastPerturbT.current = nowMs;
        pApplied = true;
      }

      // Position
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // Risk
      const d = minDistToWall(ball.x, ball.y);
      const dangerLevel = getDangerLevel(d);

      if (dangerLevel > 0 && lastClickInDangerT.current === null)
        lastClickInDangerT.current = nowMs;
      if (dangerLevel === 0) lastClickInDangerT.current = null;

      const msSinceCID =
        dangerLevel > 0 && lastClickInDangerT.current
          ? nowMs - lastClickInDangerT.current
          : 0;
      const riskScore = getRiskScore(dangerLevel, msSinceCID);

      // Frame log
      frameLogsRef.current.push({
        participantId,
        condition,
        trialType,
        trialId: allTrialsRef.current.length,
        frameIndex: frameIndexRef.current++,
        timestampMs: Math.round(nowMs),
        ballX: parseFloat(ball.x.toFixed(2)),
        ballY: parseFloat(ball.y.toFixed(2)),
        ballVx: parseFloat(ball.vx.toFixed(3)),
        ballVy: parseFloat(ball.vy.toFixed(3)),
        ballSpeed: parseFloat(ball.speed.toFixed(2)),
        distanceLeft: parseFloat((ball.x - BALL_RADIUS).toFixed(2)),
        distanceRight: parseFloat(
          (CANVAS_SIZE - ball.x - BALL_RADIUS).toFixed(2),
        ),
        distanceTop: parseFloat((ball.y - BALL_RADIUS).toFixed(2)),
        distanceBottom: parseFloat(
          (CANVAS_SIZE - ball.y - BALL_RADIUS).toFixed(2),
        ),
        minDistanceToWall: parseFloat(d.toFixed(2)),
        dangerLevel,
        riskScore,
        perturbationApplied: pApplied,
        perturbationAngle: parseFloat(pAngle.toFixed(2)),
      });

      // Display update ~4 Hz
      if (frameIndexRef.current % 15 === 0) {
        const elapsed = nowMs - startTRef.current;
        setTimeLeft(
          Math.max(0, (TRIAL_DURATION_MS - elapsed) / 1000).toFixed(1),
        );
        setDanger(dangerLevel);
      }

      // ── finishTrial (inlined — avoids stale-closure dep) ──────────────────
      function finishTrial(collided, collisionSide) {
        runningRef.current = false;
        const frameLogs = frameLogsRef.current;
        const fps =
          frameLogs.length > 1
            ? frameLogs.length /
              ((frameLogs[frameLogs.length - 1].timestampMs -
                frameLogs[0].timestampMs) /
                1000)
            : 60;
        const msPerFrame = fps > 0 ? 1000 / fps : 16.67;

        let d1f = 0,
          d2f = 0,
          riskSum = 0,
          riskMax = 0;
        for (const f of frameLogs) {
          if (f.dangerLevel === 1) d1f++;
          if (f.dangerLevel === 2) d2f++;
          riskSum += f.riskScore;
          if (f.riskScore > riskMax) riskMax = f.riskScore;
        }

        const summary = {
          sessionId: crypto.randomUUID(),
          participantId,
          condition,
          trialType,
          trialId: allTrialsRef.current.length,
          startTime: startTRef.current,
          endTime: nowMs,
          durationMs: nowMs - startTRef.current,
          collisionFlag: collided,
          collisionSide: collisionSide || "none",
          totalClicks: clickLogsRef.current.length,
          totalFrames: frameLogs.length,
          danger1DurationMs: Math.round(d1f * msPerFrame),
          danger2DurationMs: Math.round(d2f * msPerFrame),
          avgRiskScore: frameLogs.length
            ? parseFloat((riskSum / frameLogs.length).toFixed(3))
            : 0,
          maxRiskScore: riskMax,
          frameLogs: frameLogs.slice(),
          clickLogs: clickLogsRef.current.slice(),
        };

        allTrialsRef.current.push(summary);
        setTrialResult(summary);
        setPhase(trialType === "practice" ? "practice_done" : "formal_done");
      }

      // Collision
      if (d <= 0) {
        const sides = [
          { side: "left", dist: ball.x - BALL_RADIUS },
          { side: "right", dist: CANVAS_SIZE - ball.x - BALL_RADIUS },
          { side: "top", dist: ball.y - BALL_RADIUS },
          { side: "bottom", dist: CANVAS_SIZE - ball.y - BALL_RADIUS },
        ];
        const hit = sides.reduce((a, b) => (a.dist < b.dist ? a : b));
        finishTrial(true, hit.side);
        drawCanvas(ball, dangerLevel, true);
        return;
      }

      // Time limit
      const elapsed = nowMs - startTRef.current;
      if (elapsed >= TRIAL_DURATION_MS) {
        finishTrial(false, "none");
        drawCanvas(ball, dangerLevel, false);
        return;
      }

      drawCanvas(ball, dangerLevel, false);
      ballRef.current = ball;
      rafRef.current = requestAnimationFrame(tickRef.current);
    },
    [participantId, condition, trialType],
  );

  // Sync tickRef after each render
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  // Cleanup rAF on unmount
  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  // Draw static canvas on first mount
  useEffect(() => {
    drawCanvas(ballRef.current, 0, false);
  }, []);

  // ── startTrial ─────────────────────────────────────────────────────────────
  function startTrial() {
    const ball = createInitialBall();
    ballRef.current = ball;
    runningRef.current = true;
    lastTRef.current = null;
    lastPerturbT.current = null;
    startTRef.current = performance.now();
    lastClickInDangerT.current = null;
    frameIndexRef.current = 0;
    frameLogsRef.current = [];
    clickLogsRef.current = [];
    setDanger(0);
    setTimeLeft((TRIAL_DURATION_MS / 1000).toFixed(1));
    setTrialResult(null);
    setPhase(trialType === "practice" ? "practice_running" : "formal_running");
    rafRef.current = requestAnimationFrame(tickRef.current);
  }

  // ── Click handler ──────────────────────────────────────────────────────────
  function handleCanvasClick(e) {
    if (!runningRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const nowMs = performance.now();
    const ball = ballRef.current;

    const dx = cx - ball.x,
      dy = cy - ball.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len,
      uy = dy / len;

    const vxB = ball.vx,
      vyB = ball.vy;
    let vx = ball.vx + CLICK_BOOST * ux;
    let vy = ball.vy + CLICK_BOOST * uy;
    const spd = Math.sqrt(vx * vx + vy * vy);
    const clamped = clamp(spd, MIN_SPEED, MAX_SPEED);
    vx = (vx / spd) * clamped;
    vy = (vy / spd) * clamped;

    ball.vx = vx;
    ball.vy = vy;
    ball.speed = clamped;

    const d = minDistToWall(ball.x, ball.y);
    const dl = getDangerLevel(d);
    if (dl > 0) lastClickInDangerT.current = nowMs;

    clickLogsRef.current.push({
      participantId,
      condition,
      trialType,
      trialId: allTrialsRef.current.length,
      clickId: clickLogsRef.current.length,
      timestampMs: Math.round(nowMs),
      clickX: parseFloat(cx.toFixed(1)),
      clickY: parseFloat(cy.toFixed(1)),
      ballXAtClick: parseFloat(ball.x.toFixed(2)),
      ballYAtClick: parseFloat(ball.y.toFixed(2)),
      ballVxBefore: parseFloat(vxB.toFixed(3)),
      ballVyBefore: parseFloat(vyB.toFixed(3)),
      ballVxAfter: parseFloat(vx.toFixed(3)),
      ballVyAfter: parseFloat(vy.toFixed(3)),
      minDistanceToWallAtClick: parseFloat(d.toFixed(2)),
      dangerLevelAtClick: dl,
    });
  }

  // ── nextTrial ──────────────────────────────────────────────────────────────
  function nextTrial() {
    const next = trialIndex + 1;
    if (trialType === "practice") {
      if (next < PRACTICE_TRIALS) {
        setTrialIndex(next);
        setPhase("practice_intro");
      } else {
        setTrialIndex(0);
        setTrialType("formal");
        setPhase("formal_intro");
      }
    } else {
      if (next < FORMAL_TRIALS) {
        setTrialIndex(next);
        setPhase("formal_intro");
      } else {
        // All done — hand payload up to TransferModal, which shows SessionComplete
        const practiceTrials = allTrialsRef.current.filter(
          (t) => t.trialType === "practice",
        );
        const formalTrials = allTrialsRef.current.filter(
          (t) => t.trialType === "formal",
        );
        onComplete?.({
          participantId,
          condition,
          practiceTrials,
          formalTrials,
          totalFormalTrials: FORMAL_TRIALS,
        });
      }
    }
  }

  // ── Danger chip helper ─────────────────────────────────────────────────────
  function dangerChipClass(d) {
    if (d === 0) return "bg-status-chip bg-status-chip--safe";
    if (d === 1) return "bg-status-chip bg-status-chip--warning";
    return "bg-status-chip bg-status-chip--danger";
  }
  const dangerLabel =
    danger === 0 ? "安全" : danger === 1 ? "一级危险" : "二级危险";

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (phase === "practice_intro")
    return (
      <div className="bg-card">
        <p className="bg-badge">
          练习轮 {trialIndex + 1} / {PRACTICE_TRIALS}
        </p>
        <p className="bg-body-text">
          {trialIndex === 0
            ? "第一次练习。点击'开始'后小球立即运动，请立即尝试控制。"
            : "继续熟悉控制方式。"}
        </p>
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="bg-canvas"
        />
        <button className="bg-btn-primary" onClick={startTrial}>
          开始本轮 →
        </button>
      </div>
    );

  if (phase === "formal_intro")
    return (
      <div className="bg-card">
        <div className="bg-badge bg-badge--formal">正式实验</div>
        <p className="bg-title">
          正式轮 {trialIndex + 1} / {FORMAL_TRIALS}
        </p>
        <p className="bg-body-text">
          {trialIndex === 0
            ? "练习结束。接下来开始正式实验，共 30 轮。请自然操作。"
            : "准备好后点击开始。"}
        </p>
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="bg-canvas"
        />
        <button className="bg-btn-primary" onClick={startTrial}>
          开始本轮 →
        </button>
      </div>
    );

  if (phase === "practice_running" || phase === "formal_running") {
    const label =
      trialType === "practice"
        ? `练习 ${trialIndex + 1}/${PRACTICE_TRIALS}`
        : `正式 ${trialIndex + 1}/${FORMAL_TRIALS}`;
    return (
      <div className="bg-card">
        <div className="bg-status-bar">
          <span className="bg-status-chip">{label}</span>
          <span className={dangerChipClass(danger)}>{dangerLabel}</span>
          <span className="bg-status-chip bg-status-chip--timer">
            ⏱ {timeLeft}s
          </span>
        </div>
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="bg-canvas bg-canvas--active"
          onClick={handleCanvasClick}
        />
        <p className="bg-hint">点击画布 → 小球朝点击方向修正</p>
      </div>
    );
  }

  if (phase === "practice_done" || phase === "formal_done") {
    const survived = !trialResult?.collisionFlag;
    const isPractice = trialType === "practice";
    const isLastFormal = !isPractice && trialIndex === FORMAL_TRIALS - 1;

    return (
      <div className="bg-card">
        <div
          className={`bg-result-icon ${survived ? "bg-result-icon--success" : "bg-result-icon--fail"}`}
        >
          {survived ? "✓" : "✕"}
        </div>
        <p className="bg-title">
          {survived
            ? "存活 — 本轮通过"
            : `碰撞 (${trialResult?.collisionSide} 墙)`}
        </p>

        <div className="bg-stats-grid">
          <StatCell
            label="存活时间"
            value={`${((trialResult?.durationMs ?? 0) / 1000).toFixed(2)}s`}
          />
          <StatCell label="总点击" value={trialResult?.totalClicks ?? 0} />
          <StatCell
            label="危险区1停留"
            value={`${trialResult?.danger1DurationMs ?? 0}ms`}
          />
          <StatCell
            label="危险区2停留"
            value={`${trialResult?.danger2DurationMs ?? 0}ms`}
          />
          <StatCell
            label="平均风险"
            value={(trialResult?.avgRiskScore ?? 0).toFixed(3)}
          />
          <StatCell label="最高风险" value={trialResult?.maxRiskScore ?? 0} />
        </div>

        <button className="bg-btn-primary" onClick={nextTrial}>
          {isLastFormal
            ? "提交结果"
            : isPractice && trialIndex === PRACTICE_TRIALS - 1
              ? "开始正式实验 →"
              : "下一轮 →"}
        </button>
      </div>
    );
  }

  return null;
}

// ─── StatCell ─────────────────────────────────────────────────────────────────
function StatCell({ label, value }) {
  return (
    <div className="bg-stat-cell">
      <span className="bg-stat-cell__label">{label}</span>
      <span className="bg-stat-cell__value">{value}</span>
    </div>
  );
}
