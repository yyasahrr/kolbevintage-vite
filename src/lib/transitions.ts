import type { TransitionMode } from "@/types";

export interface ModelLayout {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  blur: number;
  rotateY: number;
  zIndex: number;
  visible: boolean;
  /** 0 = far away, 1 = front and centre. Drives shadow + caption treatment. */
  depth: number;
}

export interface LayoutInput {
  mode: TransitionMode;
  offset: number;
  count: number;
  stageW: number;
  stageH: number;
  spacing: number;
  blurEnabled: boolean;
  /** RTL: mirror the orbit so the next exit sits on the left */
  mirror?: boolean;
}

const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);

/** Signed distance from the active index, wrapped around the carousel. */
export function wrapOffset(index: number, active: number, count: number): number {
  const half = Math.floor(count / 2);
  let d = index - active;
  while (d > half) d -= count;
  while (d < -half) d += count;
  if (count % 2 === 0 && d === -half) d = half;
  return d;
}

export const TRANSITIONS: {
  id: TransitionMode;
  label: string;
  hint: string;
  duration: number;
  ease: [number, number, number, number];
}[] = [
  {
    id: "ring",
    label: "حلقهٔ چرخان",
    hint: "مدل‌ها روی مسیری منحنی حول یک مرکز می‌چرخند.",
    duration: 0.95,
    ease: [0.22, 0.61, 0.24, 1],
  },
  {
    id: "catwalk",
    label: "کت‌واک سینمایی",
    hint: "پرسپکتیو عمیق؛ مدل انتخاب‌شده جلو می‌آید.",
    duration: 0.9,
    ease: [0.2, 0.7, 0.2, 1],
  },
  {
    id: "queue",
    label: "صف کلاسیک",
    hint: "کاروسل افقی و ساده؛ سریع‌ترین حالت.",
    duration: 0.5,
    ease: [0.33, 1, 0.68, 1],
  },
];

export const transitionMeta = (mode: TransitionMode) => TRANSITIONS.find((t) => t.id === mode) ?? TRANSITIONS[0];

/**
 * TransitionEngine — pure geometry. Given a model's distance from the active
 * exit it returns the 2D placement that *reads* as 3D depth: position, scale,
 * layering, fade and defocus. The flat cut-outs are never spun on their own
 * axis (only a few degrees of yaw) so they never look like cardboard.
 */
export function computeLayout(input: LayoutInput): ModelLayout {
  const { mode, offset, count, stageW, stageH, spacing, blurEnabled } = input;
  const a = Math.abs(offset);
  const sign = Math.sign(offset);
  const w = Math.max(stageW, 320);
  const h = Math.max(stageH, 320);

  let layout: ModelLayout;

  if (mode === "ring") {
    const step = Math.min((Math.PI * 2) / count, Math.PI / 2.4);
    const angle = offset * step;
    // narrow viewports need a proportionally wider orbit so the side exits
    // don't swallow the hero model
    const radius = w * (w < 680 ? 0.38 : 0.3) * spacing;
    const depth = (Math.cos(angle) + 1) / 2;
    layout = {
      x: Math.sin(angle) * radius,
      y: -(1 - depth) * h * 0.08,
      scale: 0.44 + 0.56 * Math.pow(depth, 1.1),
      opacity: clamp(0.06 + 1.3 * Math.pow(depth, 1.7), 0, 1),
      blur: (1 - depth) * 9,
      rotateY: -Math.sin(angle) * 9,
      zIndex: Math.round(depth * 1000),
      visible: depth > 0.08,
      depth,
    };
  } else if (mode === "catwalk") {
    const spread = 0.44 * (1 - Math.pow(0.55, a));
    const depth = 1 / (1 + 0.52 * a);
    layout = {
      x: sign * w * spacing * spread,
      y: -h * 0.19 * (1 - 1 / (1 + 0.55 * a)),
      scale: depth,
      opacity: a === 0 ? 1 : clamp(1 / (1 + 1.05 * a), 0.1, 1),
      blur: Math.min(10, a * 3),
      rotateY: sign * -5,
      zIndex: 1000 - a * 100,
      visible: a <= 3,
      depth,
    };
  } else {
    const step = Math.max(w * 0.3 * spacing, 136);
    const depth = Math.max(0.3, 1 - 0.2 * a);
    layout = {
      x: offset * step,
      y: 0,
      scale: Math.max(0.52, 1 - 0.17 * a),
      opacity: a === 0 ? 1 : Math.max(0.12, 1 - 0.34 * a),
      blur: Math.min(6, a * 2),
      rotateY: 0,
      zIndex: 1000 - a * 100,
      visible: a <= 3,
      depth,
    };
  }

  if (!blurEnabled) layout.blur = 0;
  if (input.mirror) {
    layout.x = -layout.x;
    layout.rotateY = -layout.rotateY;
  }
  return layout;
}
