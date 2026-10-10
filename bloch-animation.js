// Visual-only animation of a Bloch vector rotating about an axis (no DOM).
// The animation never feeds back into the quantum state: it only chooses which vector to draw
// while it runs, and its final frame is the exact Bloch vector of the computed output state,
// not the end of the interpolated path.
import {rotateAbout} from './gate-info.js';

export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// Longer rotations take longer, so the angular speed stays readable: 90° 0.85 s, 180° 1.2 s, 360° 1.8 s (cap).
export const rotationDuration = (angle) => Math.min(1800, 500 + 350 * Math.abs(angle) / (Math.PI / 2));

// spec: {from, to, axis, angle, duration}. Returns the vector to draw and the eased progress.
export function animationFrame(spec, elapsed) {
  const t = spec.duration > 0 ? Math.max(0, elapsed / spec.duration) : 1;
  if (t >= 1) return {vector: spec.to, progress: 1, done: true};
  const progress = easeInOut(t);
  return {vector: rotateAbout(spec.from, spec.axis, spec.angle * progress), progress, done: false};
}
