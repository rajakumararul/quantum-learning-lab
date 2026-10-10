// Parameterized single-qubit rotations (no DOM). θ is always in radians.
//   R_n(θ) = exp(−iθ n·σ/2) = cos(θ/2) I − i sin(θ/2) n·σ,   n = X, Y or Z.
// On the Bloch sphere R_n(θ) turns the vector by θ about n (right-hand rule).
// Because the matrix depends on θ/2, a full turn θ = 2π gives −I, not I.
import {C, applyMatrix} from './quantum.js';

export const ROTATIONS = ['Rx', 'Ry', 'Rz'];
export const rotationAxes = {Rx: [1, 0, 0], Ry: [0, 1, 0], Rz: [0, 0, 1]};
export const isRotation = (name) => ROTATIONS.includes(name);

// cos and sin at the eight multiples of π/4, as exact values.
const R = Math.SQRT1_2;
const EIGHTHS = [[1, 0], [R, R], [0, 1], [-R, R], [-1, 0], [-R, -R], [0, -1], [R, -R]];

// cos(θ/2) and sin(θ/2). A degree value such as 180° becomes the nearest double to π, whose
// cosine is 6.1e-17 rather than 0. When θ/2 is within 1e-12 (relative) of a nonzero multiple of
// π/4, the intended exact value is used instead. Near 0, Math.cos/Math.sin are already exact
// to full precision, so tiny angles such as 1e-20 rad are never snapped.
export function halfAngle(theta) {
  const h = theta / 2, k = h / (Math.PI / 4), n = Math.round(k);
  if (n !== 0 && Math.abs(k - n) < 1e-12 * Math.max(1, Math.abs(n))) {
    const [c, s] = EIGHTHS[((n % 8) + 8) % 8];
    return {c, s};
  }
  return {c: Math.cos(h), s: Math.sin(h)};
}

// Negation that never produces −0, so displayed and compared zeros are plain 0.
const neg = (v) => 0 - v;

export function rotationMatrix(gate, theta) {
  if (!isRotation(gate)) throw Error('Unsupported rotation ' + gate);
  if (typeof theta !== 'number' || !Number.isFinite(theta)) throw Error('Rotation angle must be a finite number of radians');
  const {c, s} = halfAngle(theta);
  switch (gate) {
    case 'Rx': return [[C(c), C(0, neg(s))], [C(0, neg(s)), C(c)]];
    case 'Ry': return [[C(c), C(neg(s))], [C(s), C(c)]];
    case 'Rz': return [[C(c, neg(s)), C(0)], [C(0), C(c, s)]];
  }
}

export const applyRotation = (state, gate, theta) => applyMatrix(state, rotationMatrix(gate, theta));
