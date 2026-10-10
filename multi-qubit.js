// Two-qubit pure states (no DOM).
//
// Basis ordering convention, used everywhere in this lab (matrices, displays, charts, measurement, tests):
//   |ψ⟩ = α|00⟩ + β|01⟩ + γ|10⟩ + δ|11⟩,   state = [α, β, γ, δ]
//   A basis label |q0 q1⟩ lists qubit q0 FIRST (on the left). Index k = 2·q0 + q1.
//   q0 is therefore the left tensor factor: a gate U on q0 is U ⊗ I, and on q1 it is I ⊗ U.
// (Some toolkits, e.g. Qiskit, number qubits the other way round; this lab follows the textbook
// left-to-right convention so that |10⟩ means q0 = 1, q1 = 0.)
import {C, abs2} from './quantum.js';
import {identity, kron, kronVector, matVec, vectorNorm2} from './tensor.js';

export const BASIS = ['00', '01', '10', '11'];
export const QUBITS = [0, 1];
const I2 = identity(2);

// Value (0 or 1) of qubit q in basis index k.
export const bitOf = (k, q) => (q === 0 ? k >> 1 : k & 1);
export const indexOf = (q0, q1) => 2 * q0 + q1;

export const basis2 = (k) => [0, 1, 2, 3].map((i) => C(i === k ? 1 : 0));
export const initial2 = () => basis2(0);
export const norm2 = vectorNorm2;
export const probabilities2 = (state) => state.map(abs2);
export const product = (a, b) => kronVector(a, b); // |a⟩ ⊗ |b⟩, with a on q0

function checkQubit(q) {
  if (!QUBITS.includes(q)) throw Error('Qubit must be 0 or 1, got ' + q);
}

// The 4×4 operator for a single-qubit gate U acting on one qubit.
export function singleQubitOperator(U, target) {
  checkQubit(target);
  return target === 0 ? kron(U, I2) : kron(I2, U);
}

export const applyOperator = (state, M) => matVec(M, state);

// Probability that measuring `qubit` gives `outcome`: the sum of |amplitude|² over basis states with that bit.
export function qubitProbability(state, qubit, outcome) {
  checkQubit(qubit);
  return state.reduce((s, a, k) => s + (bitOf(k, qubit) === outcome ? abs2(a) : 0), 0);
}

// Measuring one qubit with a known outcome: keep the amplitudes consistent with it, then renormalize.
export function projectQubit(state, qubit, outcome) {
  const p = qubitProbability(state, qubit, outcome);
  if (p < 1e-15) throw Error(`Outcome ${outcome} on q${qubit} has probability 0`);
  const s = Math.sqrt(p);
  return {probability: p, state: state.map((a, k) => (bitOf(k, qubit) === outcome ? C(a.re / s, a.im / s) : C(0)))};
}

// `random` is a uniform sample in [0, 1); passing it in keeps measurement testable.
export function measureQubit(state, qubit, random = Math.random()) {
  const outcome = random < qubitProbability(state, qubit, 0) ? 0 : 1;
  return {outcome, ...projectQubit(state, qubit, outcome)};
}

// Measuring both qubits: outcome k with probability |amplitude_k|²; the state collapses to the basis state |k⟩.
export function measureBoth(state, random = Math.random()) {
  const p = probabilities2(state);
  let k = 0, acc = p[0];
  while (k < 3 && random >= acc) acc += p[++k];
  return {outcome: k, state: basis2(k)};
}
