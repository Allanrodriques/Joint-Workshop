/**
 * Shared timeline for the cinematic intro.
 *
 * Every intro module reads exactly these timestamps so the light reveal,
 * particle swarm, roll, smoke signature and burst stay in lock-step.
 */

export const T = {
  LIGHT_START: 0.3,
  LIGHT_FULL: 1.35,
  TITLE_IN: 0.85,
  TITLE_FULL: 1.55,
  TITLE_OUT: 4.62,
  SWIRL_START: 1.0,
  SWIRL_SETTLE: 3.05,
  ROLL_START: 3.45,
  ROLL_END: 4.55,
  FLOAT_START: 4.62,
  FLOAT_FULL: 4.95,
  SMOKE_START: 5.0,
  SIG_START: 5.75,
  SIG_END: 6.55,
  DISPERSE: 6.65,
  BURST: 6.85,
  BURST_DONE: 7.6,
  DONE: 7.7,
  READY: 7.7,
} as const;

/** The fictional rolling workspace bounds (world units ≈ dm). */
export const PAPER = { LEN: 1.6, W: 0.92 };
export const PAPER_R = PAPER.W / (2 * Math.PI);
export const TABLE = { hx: 1.18, hz: 0.78 };

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Normalised 0..1 progress of `time` between `a` and `b`. */
export function seg(t: number, a: number, b: number): number {
  return clamp01((t - a) / Math.max(0.0001, b - a));
}