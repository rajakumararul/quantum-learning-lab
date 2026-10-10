// Entanglement of a pure two-qubit state (no DOM).
//
// Concurrence, for |ψ⟩ = α|00⟩ + β|01⟩ + γ|10⟩ + δ|11⟩:
//   C = 2 |αδ − βγ|,   0 ≤ C ≤ 1.
// Arranging the amplitudes as the 2×2 matrix M = [[α, β], [γ, δ]] (rows q0, columns q1), the state is a
// product |a⟩ ⊗ |b⟩ exactly when M = a bᵀ has rank 1, i.e. det M = αδ − βγ = 0. So:
//   C = 0  ⇔ separable (product) state
//   C = 1  ⇔ maximally entangled (e.g. the Bell states)
// C is not a percentage. For pure states it is tied to each qubit's reduced state:
//   |r|² = 1 − C²  (length of each reduced Bloch vector)   and   Tr(ρ₀²) = Tr(ρ₁²) = 1 − C²/2  (purity).
import {C, sub, mul, abs2, canonical} from './quantum.js';
import {conj} from './tensor.js';

export const SEPARABLE_TOLERANCE = 1e-9;

export function concurrence([a, b, c, d]) {
  const det = sub(mul(a, d), mul(b, c));
  return Math.min(1, 2 * Math.sqrt(abs2(det)));
}

export function classifyEntanglement(value) {
  if (value < SEPARABLE_TOLERANCE) return 'separable';
  if (value > 1 - SEPARABLE_TOLERANCE) return 'maximally entangled';
  return 'partially entangled';
}

// For a separable state, single-qubit states [a, b] with |a⟩ ⊗ |b⟩ = |ψ⟩ exactly
// (b is in canonical form, α real and ≥ 0; a carries any global phase). Returns null if entangled.
export function productFactors(state) {
  if (concurrence(state) >= SEPARABLE_TOLERANCE) return null;
  const rows = [[state[0], state[1]], [state[2], state[3]]];
  const row = abs2(rows[0][0]) + abs2(rows[0][1]) >= abs2(rows[1][0]) + abs2(rows[1][1]) ? rows[0] : rows[1];
  const len = Math.sqrt(abs2(row[0]) + abs2(row[1]));
  const b = canonical([C(row[0].re / len, row[0].im / len), C(row[1].re / len, row[1].im / len)]);
  const a = rows.map(([x, y]) => {
    const s = mul(x, conj(b[0])), t = mul(y, conj(b[1]));
    return C(s.re + t.re, s.im + t.im);
  });
  return [a, b];
}
