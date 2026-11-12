import { POSTERS } from "./game";

/**
 * The posters hang around a ring. This is its turning state, kept outside the
 * three.js code so the page can steer it without downloading the 3D scene.
 */
export const COUNT = POSTERS.length;
export const STEP = (Math.PI * 2) / COUNT;

/** Mutable state shared by the drag handlers, the render loop and the HUD buttons. */
export interface Ring {
  angle: number;
  velocity: number;
  dragging: boolean;
  /** Index the ring is easing towards, or null while it coasts. */
  target: number | null;
  /** Radians of turn per pixel of drag, refreshed whenever the viewport changes. */
  anglePerPixel: number;
}

export const createRing = (index: number): Ring => ({
  angle: index * STEP,
  velocity: 0,
  dragging: false,
  target: index,
  anglePerPixel: 0.002,
});

export const nearestIndex = (angle: number) => ((Math.round(angle / STEP) % COUNT) + COUNT) % COUNT;

/** The angle equal to `index` that is closest to where the ring already is, so it never spins the long way round. */
export function angleFor(index: number, from: number): number {
  const base = index * STEP;
  return base + Math.round((from - base) / (Math.PI * 2)) * Math.PI * 2;
}

/** Turns the ring to face a given window. */
export function aimRing(ring: Ring, index: number): void {
  ring.velocity = 0;
  ring.target = ((index % COUNT) + COUNT) % COUNT;
}

/** Moves one window left or right of wherever the ring is heading. */
export function stepRing(ring: Ring, delta: number): void {
  aimRing(ring, (ring.target ?? nearestIndex(ring.angle)) + delta);
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
