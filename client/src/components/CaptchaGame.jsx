import { useState, useEffect, useRef, useCallback } from "react";
import "../styles/game.css";

const ICONS = [
  { id: "graduation", emoji: "🎓", label: "graduation cap" },
  { id: "calendar", emoji: "📅", label: "calendar" },
  { id: "bug", emoji: "🐛", label: "bug" },
  { id: "pencil", emoji: "✏️", label: "pencil" },
  { id: "camera", emoji: "📷", label: "camera" },
  { id: "rocket", emoji: "🚀", label: "rocket" },
  { id: "leaf", emoji: "🌿", label: "leaf" },
  { id: "diamond", emoji: "💎", label: "diamond" },
  { id: "lock", emoji: "🔒", label: "lock" },
];

const SCENE_W = 340;
const SCENE_H = 200;
const ICON_R = 28;
const REQUIRED = 3; // how many icons to click

function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function placeIcons(icons) {
  const placed = [];
  for (const icon of icons) {
    let tries = 0,
      x,
      y;
    do {
      x = ICON_R + Math.random() * (SCENE_W - ICON_R * 2);
      y = ICON_R + Math.random() * (SCENE_H - ICON_R * 2);
      tries++;
    } while (
      tries < 40 &&
      placed.some((p) => Math.hypot(p.x - x, p.y - y) < ICON_R * 2.4)
    );
    placed.push({ ...icon, x: Math.round(x), y: Math.round(y) });
  }
  return placed;
}

function computeStraightness(traj) {
  if (traj.length < 2) return 1;
  const chord = Math.hypot(
    traj[traj.length - 1].x - traj[0].x,
    traj[traj.length - 1].y - traj[0].y,
  );
  let arc = 0;
  for (let i = 1; i < traj.length; i++) {
    arc += Math.hypot(traj[i].x - traj[i - 1].x, traj[i].y - traj[i - 1].y);
  }
  return arc > 0 ? Math.min(1, chord / arc) : 1;
}

function computeVelocityAccel(traj) {
  const vel = [],
    acc = [];
  for (let i = 1; i < traj.length; i++) {
    const dt = traj[i].t - traj[i - 1].t;
    const d = Math.hypot(traj[i].x - traj[i - 1].x, traj[i].y - traj[i - 1].y);
    vel.push(dt > 0 ? d / dt : 0);
  }
  for (let i = 1; i < vel.length; i++) acc.push(vel[i] - vel[i - 1]);
  return { vel, acc };
}

export default function CaptchaGame({ onComplete, onCancel }) {
  const [phase, setPhase] = useState("intro"); // intro | play | success | fail
  const [icons, setIcons] = useState([]);
  const [targets, setTargets] = useState([]); // ordered icons to click
  const [progress, setProgress] = useState(0); // how many targets clicked
  const [feedback, setFeedback] = useState(null); // "wrong" flash
  const [attempts, setAttempts] = useState(0);

  const mouseRef = useRef([]); // running trajectory buffer
  const lastClickPos = useRef({ x: SCENE_W / 2, y: SCENE_H / 2 });
  const phaseStartRef = useRef(null);
  const firstMoveRef = useRef(null);
  const missRef = useRef(0);
  const preDwellRef = useRef(null);
  const telemetryRef = useRef([]); // collected BehaviorSamples
  const sceneRef = useRef(null);

  const startGame = useCallback(() => {
    const pool = pickRandom(ICONS, 6);
    const placed = placeIcons(pool);
    const ordered = pickRandom(placed, REQUIRED);
    setIcons(placed);
    setTargets(ordered);
    setProgress(0);
    setFeedback(null);
    mouseRef.current = [];
    telemetryRef.current = [];
    missRef.current = 0;
    firstMoveRef.current = null;
    phaseStartRef.current = Date.now();
    lastClickPos.current = { x: SCENE_W / 2, y: SCENE_H / 2 };
    setPhase("play");
  }, []);

  // Mouse tracking within the scene
  useEffect(() => {
    if (phase !== "play") return;
    const scene = sceneRef.current;
    if (!scene) return;

    const onMove = (e) => {
      const rect = scene.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const t = Date.now();
      mouseRef.current.push({ x, y, t });
      if (!firstMoveRef.current) firstMoveRef.current = t;

      // Track dwell near current target
      const target = targets[progress];
      if (target) {
        const dist = Math.hypot(x - target.x, y - target.y);
        if (dist < ICON_R * 1.5) {
          if (!preDwellRef.current) preDwellRef.current = t;
        } else {
          preDwellRef.current = null;
        }
      }
    };

    scene.addEventListener("mousemove", onMove, { passive: true });
    return () => scene.removeEventListener("mousemove", onMove);
  }, [phase, progress, targets]);

  const handleIconClick = useCallback(
    (icon, e) => {
      if (phase !== "play") return;
      const scene = sceneRef.current;
      if (!scene) return;

      const rect = scene.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const now = Date.now();

      const expected = targets[progress];
      const correct = icon.id === expected.id;

      // Build BehaviorSample from current trajectory buffer
      const traj = mouseRef.current.slice();
      const { vel, acc } = computeVelocityAccel(traj);
      const straightness = computeStraightness(traj);

      // Detect overshoot: did cursor go past target center then come back?
      let overshoot = false;
      if (traj.length > 4) {
        const dists = traj.map((p) =>
          Math.hypot(p.x - expected.x, p.y - expected.y),
        );
        const minDist = Math.min(...dists);
        const minIdx = dists.indexOf(minDist);
        // If minimum distance was reached before the last 20% of trajectory
        if (minIdx < traj.length * 0.8) overshoot = true;
      }

      const sample = {
        targetId: icon.id,
        correct,
        trajectory: traj,
        velocity: vel,
        acceleration: acc,
        straightness: parseFloat(straightness.toFixed(4)),
        overshoot,
        preDwellMs: preDwellRef.current ? now - preDwellRef.current : 0,
        reactionMs: firstMoveRef.current
          ? firstMoveRef.current - phaseStartRef.current
          : 0,
        missCount: missRef.current,
        targetSize: ICON_R * 2,
        targetDist: Math.round(
          Math.hypot(
            expected.x - lastClickPos.current.x,
            expected.y - lastClickPos.current.y,
          ),
        ),
        timestamp: now,
      };

      telemetryRef.current.push(sample);

      // Reset per-click state
      mouseRef.current = [];
      firstMoveRef.current = null;
      preDwellRef.current = null;
      phaseStartRef.current = now;

      if (correct) {
        missRef.current = 0;
        lastClickPos.current = { x: expected.x, y: expected.y };
        const next = progress + 1;
        setProgress(next);
        if (next >= REQUIRED) {
          setPhase("success");
          setTimeout(() => onComplete(telemetryRef.current), 800);
        }
      } else {
        missRef.current++;
        setFeedback("wrong");
        setTimeout(() => setFeedback(null), 600);
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 5) {
          setPhase("fail");
        }
      }
    },
    [phase, progress, targets, attempts, onComplete],
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (phase === "intro") {
    return (
      <div style={s.card}>
        <div style={s.header}>
          <span style={s.shield}>⬡</span>
          <div>
            <p style={s.title}>Security check</p>
            <p style={s.sub}>Complete to authorize transfer</p>
          </div>
        </div>
        <p style={s.body}>
          Click the icons shown below in the correct order to confirm you are
          the account holder. Your interaction pattern is recorded as part of
          session security.
        </p>
        <button style={s.primaryBtn} onClick={startGame}>
          Begin check →
        </button>
        <button style={s.ghostBtn} onClick={onCancel}>
          Cancel transfer
        </button>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div style={s.card}>
        <div
          style={{
            ...s.statusIcon,
            background: "rgba(74,222,128,0.12)",
            color: "#4ade80",
          }}
        >
          ✓
        </div>
        <p style={s.title}>Verified</p>
        <p style={s.sub}>Interaction pattern recorded. Sending transfer…</p>
      </div>
    );
  }

  if (phase === "fail") {
    return (
      <div style={s.card}>
        <div
          style={{
            ...s.statusIcon,
            background: "rgba(248,113,113,0.12)",
            color: "#f87171",
          }}
        >
          ✕
        </div>
        <p style={s.title}>Verification failed</p>
        <p style={s.sub}>Too many incorrect attempts.</p>
        <button
          style={s.primaryBtn}
          onClick={() => {
            setAttempts(0);
            startGame();
          }}
        >
          Try again
        </button>
        <button style={s.ghostBtn} onClick={onCancel}>
          Cancel transfer
        </button>
      </div>
    );
  }

  // ── play phase ──
  const currentTarget = targets[progress];

  return (
    <div style={s.card}>
      {/* Prompt bar */}
      <div style={s.promptBar}>
        <span style={s.promptLabel}>Click in order:</span>
        <div style={s.promptIcons}>
          {targets.map((t, i) => (
            <span
              key={t.id}
              style={{
                ...s.promptChip,
                opacity: i < progress ? 0.3 : 1,
                borderColor:
                  i === progress ? "#4ade80" : "rgba(255,255,255,0.15)",
                background:
                  i === progress ? "rgba(74,222,128,0.12)" : "transparent",
              }}
            >
              {t.emoji}
              {i < progress && <span style={s.checkMark}>✓</span>}
            </span>
          ))}
        </div>
        <span style={s.attemptCount}>{REQUIRED - progress} left</span>
      </div>

      {/* Scene */}
      <div
        ref={sceneRef}
        style={{
          ...s.scene,
          outline:
            feedback === "wrong"
              ? "2px solid #f87171"
              : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Background grid lines for depth */}
        <svg
          style={s.bgSvg}
          viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
          preserveAspectRatio="none"
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <line
              key={`v${i}`}
              x1={(i + 1) * (SCENE_W / 8)}
              y1="0"
              x2={(i + 1) * (SCENE_W / 8)}
              y2={SCENE_H}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="1"
            />
          ))}
          {Array.from({ length: 4 }).map((_, i) => (
            <line
              key={`h${i}`}
              x1="0"
              y1={(i + 1) * (SCENE_H / 5)}
              x2={SCENE_W}
              y2={(i + 1) * (SCENE_H / 5)}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="1"
            />
          ))}
        </svg>

        {/* Icons */}
        {icons.map((icon) => {
          const isTarget = icon.id === currentTarget?.id;
          const isDone = targets
            .slice(0, progress)
            .some((t) => t.id === icon.id);
          return (
            <div
              key={icon.id}
              onClick={(e) => handleIconClick(icon, e)}
              style={{
                ...s.iconBtn,
                left: icon.x - ICON_R,
                top: icon.y - ICON_R,
                width: ICON_R * 2,
                height: ICON_R * 2,
                opacity: isDone ? 0.25 : 1,
                border: isTarget
                  ? "1.5px solid rgba(74,222,128,0.5)"
                  : "1px solid rgba(255,255,255,0.1)",
                background: isTarget
                  ? "rgba(74,222,128,0.08)"
                  : "rgba(255,255,255,0.05)",
                cursor: isDone ? "default" : "pointer",
                transform: isTarget ? "scale(1.08)" : "scale(1)",
              }}
            >
              <span
                style={{ fontSize: "20px", lineHeight: 1, userSelect: "none" }}
              >
                {icon.emoji}
              </span>
            </div>
          );
        })}

        {/* Wrong click flash */}
        {feedback === "wrong" && (
          <div style={s.wrongFlash}>Wrong icon — try again</div>
        )}
      </div>

      {/* Bottom hint */}
      <p style={s.hint}>
        Find and click:{" "}
        <strong style={{ color: "#f0f4ff" }}>{currentTarget?.label}</strong>
      </p>

      <button
        style={{ ...s.ghostBtn, fontSize: "12px", padding: "6px 12px" }}
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}

const s = {
  card: {
    background: "#161b27",
    border: "1px solid #2a3045",
    borderRadius: "12px",
    padding: "24px",
    width: "100%",
    maxWidth: "400px",
    fontFamily: "'IBM Plex Mono', monospace",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    color: "#f0f4ff",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  shield: {
    fontSize: "24px",
    color: "#4ade80",
  },
  title: {
    margin: 0,
    fontSize: "15px",
    fontWeight: 700,
    color: "#f0f4ff",
  },
  sub: {
    margin: 0,
    fontSize: "11px",
    color: "#6b7fa3",
  },
  body: {
    margin: 0,
    fontSize: "12px",
    color: "#8899bb",
    lineHeight: 1.6,
  },
  promptBar: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "#0f1117",
    borderRadius: "8px",
    padding: "10px 14px",
    flexWrap: "wrap",
  },
  promptLabel: {
    fontSize: "11px",
    color: "#6b7fa3",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    flexShrink: 0,
  },
  promptIcons: {
    display: "flex",
    gap: "6px",
    flex: 1,
    flexWrap: "wrap",
  },
  promptChip: {
    position: "relative",
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    border: "1px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    transition: "all 0.2s",
    flexShrink: 0,
  },
  checkMark: {
    position: "absolute",
    top: "-6px",
    right: "-6px",
    fontSize: "10px",
    background: "#4ade80",
    color: "#0a1a10",
    borderRadius: "50%",
    width: "14px",
    height: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    lineHeight: 1,
  },
  attemptCount: {
    fontSize: "11px",
    color: "#6b7fa3",
    flexShrink: 0,
  },
  scene: {
    position: "relative",
    width: `${SCENE_W}px`,
    height: `${SCENE_H}px`,
    background: "#0a0f1a",
    borderRadius: "8px",
    overflow: "hidden",
    userSelect: "none",
    alignSelf: "center",
  },
  bgSvg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  },
  iconBtn: {
    position: "absolute",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform 0.15s, border-color 0.15s, background 0.15s",
    backdropFilter: "blur(4px)",
  },
  wrongFlash: {
    position: "absolute",
    bottom: "10px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(248,113,113,0.15)",
    border: "1px solid rgba(248,113,113,0.4)",
    color: "#f87171",
    borderRadius: "6px",
    padding: "4px 12px",
    fontSize: "11px",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },
  hint: {
    margin: 0,
    fontSize: "12px",
    color: "#6b7fa3",
    textAlign: "center",
  },
  primaryBtn: {
    padding: "11px",
    background: "#4ade80",
    color: "#0a1a10",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    letterSpacing: "0.03em",
  },
  ghostBtn: {
    padding: "10px",
    background: "none",
    border: "1px solid #2a3045",
    borderRadius: "6px",
    color: "#6b7fa3",
    fontSize: "13px",
    fontFamily: "inherit",
    cursor: "pointer",
    textAlign: "center",
  },
  statusIcon: {
    width: "52px",
    height: "52px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "22px",
    fontWeight: 700,
    alignSelf: "center",
  },
};
