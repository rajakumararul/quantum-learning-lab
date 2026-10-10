// Density matrices and reduced states of a pure two-qubit state (no DOM).
//   ρ = |ψ⟩⟨ψ|                               the 4×4 density matrix, ρ[k][l] = ψ_k conj(ψ_l)
//   ρ₀ = Tr₁(ρ):  ρ₀[i][j] = Σ_b ρ[2i+b][2j+b]   trace out q1, keep q0
//   ρ₁ = Tr₀(ρ):  ρ₁[i][j] = Σ_a ρ[2a+i][2a+j]   trace out q0, keep q1
// (indices use the |q0 q1⟩ ordering k = 2·q0 + q1 from multi-qubit.js).
// Each reduced state has a Bloch vector r = (Tr(ρX), Tr(ρY), Tr(ρZ)) with |r| ≤ 1:
// |r| = 1 for a pure single-qubit state, |r| = 0 for the maximally mixed state I/2.
import {C, add, gates} from './quantum.js';
import {outer, matMul, trace} from './tensor.js';

export const densityMatrix = (state) => outer(state, state);

export function partialTrace(rho, keep) {
  if (keep !== 0 && keep !== 1) throw Error('keep must be qubit 0 or 1');
  const at = keep === 0 ? (i, other) => 2 * i + other : (i, other) => 2 * other + i;
  return [0, 1].map((i) => [0, 1].map((j) => add(rho[at(i, 0)][at(j, 0)], rho[at(i, 1)][at(j, 1)])));
}

// [ρ₀, ρ₁] for a pure two-qubit state.
export function reducedDensityMatrices(state) {
  const rho = densityMatrix(state);
  return [partialTrace(rho, 0), partialTrace(rho, 1)];
}

// Expectation value Tr(ρσ). It is real for Hermitian ρ and σ; the real part is returned.
export const expectation = (rho, sigma) => trace(matMul(rho, sigma)).re;

export const blochFromDensity = (rho) => ({x: expectation(rho, gates.X), y: expectation(rho, gates.Y), z: expectation(rho, gates.Z)});

export const purity = (rho) => trace(matMul(rho, rho)).re;

export const blochLength = ({x, y, z}) => Math.hypot(x, y, z);

// Reduced Bloch vectors [r₀, r₁] of a pure two-qubit state.
export const reducedBlochVectors = (state) => reducedDensityMatrices(state).map(blochFromDensity);

export const maximallyMixed = () => [[C(0.5), C(0)], [C(0), C(0.5)]];
