/**
 * useRatProbe — Behavioral biometrics collector for RAT detection.
 *
 * Calibrated thresholds (based on observed human baseline):
 *   velVariance:  human ≈ 1–5+,  robotic ≈ 0–0.3
 *   dirEntropy:   human ≈ 2.2–3.0, robotic ≈ 0–1.2
 *   uniqueDirs:   human ≈ 6–8,   robotic ≈ 1–3
 *   idleBursts:   human ≈ low,   RAT latency ≈ high
 *
 * Score 0–100. isRisky = score >= 60.
 */

import { useEffect, useRef, useCallback } from "react";

const IDLE_THRESHOLD_MS = 500;
const MIN_SAMPLES = 15;

function calcVariance(arr) {
  if (arr.length < 2) return 999; // no data = assume human (fail open)
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
}

function calcEntropy(arr) {
  if (arr.length === 0) return 3; // no data = assume human
  const counts = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  const total = arr.length;
  return Object.values(counts).reduce((h, c) => {
    const p = c / total;
    return h - p * Math.log2(p);
  }, 0);
}

function quantizeAngle(dx, dy) {
  const angle = Math.atan2(dy, dx);
  return Math.round((angle + Math.PI) / (Math.PI / 4)) % 8;
}

export function useRatProbe(active) {
  const pointsRef = useRef([]);

  useEffect(() => {
    if (!active) {
      pointsRef.current = [];
      return;
    }
    const onMove = (e) => {
      pointsRef.current.push({ x: e.clientX, y: e.clientY, t: Date.now() });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [active]);

  const analyze = useCallback(() => {
    const pts = pointsRef.current;

    if (pts.length < MIN_SAMPLES) {
      return {
        score: 0,
        flags: ["insufficient_data"],
        isRisky: false,
        rawMetrics: { sampleCount: pts.length },
      };
    }

    const velocities = [];
    const directions = [];
    let idlePauses = 0;
    let burstAfterIdle = 0;
    let wasIdle = false;

    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const dt = pts[i].t - pts[i - 1].t;
      if (dt <= 0) continue;

      velocities.push(Math.sqrt(dx * dx + dy * dy) / dt);
      directions.push(quantizeAngle(dx, dy));

      if (dt > IDLE_THRESHOLD_MS) {
        idlePauses++;
        wasIdle = true;
      } else if (wasIdle) {
        burstAfterIdle++;
        wasIdle = false;
      }
    }

    const velVariance = calcVariance(velocities);
    const dirEntropy = calcEntropy(directions);
    const uniqueDirs = new Set(directions).size;
    const idleBurstRatio = burstAfterIdle / Math.max(idlePauses, 1);

    // --- Scoring (calibrated) ---
    // velVariance:  robotic < 0.3  (human baseline ~1–5)
    const velScore =
      velVariance < 0.05
        ? 40
        : velVariance < 0.15
          ? 30
          : velVariance < 0.3
            ? 15
            : 0;

    // dirEntropy: robotic < 1.2  (human baseline ~2.2–3.0)
    const entropyScore =
      dirEntropy < 0.8 ? 35 : dirEntropy < 1.2 ? 25 : dirEntropy < 1.8 ? 10 : 0;

    // uniqueDirs: robotic <= 2  (human baseline 6–8)
    const straightScore =
      uniqueDirs <= 1 ? 20 : uniqueDirs <= 2 ? 15 : uniqueDirs <= 3 ? 5 : 0;

    // idleBursts: high ratio = latency-driven remote control
    const burstScore = idleBurstRatio > 0.8 ? 15 : idleBurstRatio > 0.5 ? 8 : 0;

    const totalScore = Math.min(
      100,
      velScore + entropyScore + straightScore + burstScore,
    );

    const flags = [];
    if (velScore > 0) flags.push("low_velocity_variance");
    if (entropyScore > 0) flags.push("low_direction_entropy");
    if (straightScore > 0) flags.push("straight_line_movement");
    if (burstScore > 0) flags.push("idle_burst_pattern");

    return {
      score: totalScore,
      flags,
      isRisky: totalScore >= 60,
      rawMetrics: {
        sampleCount: pts.length,
        velVariance: velVariance.toFixed(4),
        dirEntropy: dirEntropy.toFixed(2),
        uniqueDirs,
        idlePauses,
        burstAfterIdle,
        idleBurstRatio: idleBurstRatio.toFixed(2),
      },
    };
  }, []);

  const reset = useCallback(() => {
    pointsRef.current = [];
  }, []);

  return { analyze, reset };
}
