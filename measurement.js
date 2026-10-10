// Computational-basis measurement: Born-rule distributions, marginals and collapse (no DOM).
//
//   single qubit  α|0⟩ + β|1⟩:                    P(0) = |α|², P(1) = |β|²
//   two qubits    α|00⟩ + β|01⟩ + γ|10⟩ + δ|11⟩:  P(00) = |α|², P(01) = |β|², P(10) = |γ|², P(11) = |δ|²
//   marginals     P(q0=0) = P(00) + P(01),  P(q0=1) = P(10) + P(11)
//                 P(q1=0) = P(00) + P(10),  P(q1=1) = P(01) + P(11)
// Collapse: a joint outcome k leaves the basis state |k⟩; measuring one qubit with outcome b keeps
// only the amplitudes with that bit and renormalizes (projectQubit). Every function is pure: input
// states are never modified.
import {abs2, basisState} from './quantum.js';
import {BASIS, basis2, projectQubit} from './multi-qubit.js';
import {normalizeDistribution} from './sampling.js';
import {reducedDensityMatrices, blochFromDensity, blochLength} from './density-matrix.js';

// target: 'qubit' (single-qubit mode), 'joint' (both qubits), or 0 / 1 (one qubit of two).
export const TARGETS = {single: ['qubit'], two: ['joint', 0, 1]};

export const singleQubitProbabilities = (state) => normalizeDistribution(state.map(abs2));
export const jointProbabilities = (state) => normalizeDistribution(state.map(abs2));

export function marginalProbabilities(state, qubit) {
  const [p00, p01, p10, p11] = jointProbabilities(state);
  if (qubit === 0) return [p00 + p01, p10 + p11];
  if (qubit === 1) return [p00 + p10, p01 + p11];
  throw Error('Qubit must be 0 or 1');
}

// The distribution measured for a target, with outcome labels.
export function distributionFor(state, target) {
  if (target === 'qubit') return {labels: ['0', '1'], probabilities: singleQubitProbabilities(state)};
  if (target === 'joint') return {labels: [...BASIS], probabilities: jointProbabilities(state)};
  return {labels: ['0', '1'], probabilities: marginalProbabilities(state, target)};
}

export const targetLabel = (target) => (target === 'qubit' ? 'the qubit' : target === 'joint' ? 'both qubits (joint)' : `q${target} only`);

// Post-measurement state for an outcome index of distributionFor(state, target).
export function collapse(state, target, outcome) {
  if (target === 'qubit') return basisState(outcome);
  if (target === 'joint') return basis2(outcome);
  return projectQubit(state, target, outcome).state;
}

// For a one-qubit measurement on a two-qubit state: what happens for each possible outcome.
// Returns, per outcome b: its probability and, if possible, the collapsed state and the other qubit's
// reduced Bloch vector before and after (|r| = 1 means that qubit is now in a pure state).
export function conditionalOutcomes(state, qubit) {
  const other = 1 - qubit, probs = marginalProbabilities(state, qubit);
  const otherBefore = blochFromDensity(reducedDensityMatrices(state)[other]);
  return probs.map((probability, outcome) => {
    if (probability < 1e-15) return {outcome, probability, possible: false};
    const after = projectQubit(state, qubit, outcome).state, otherAfter = blochFromDensity(reducedDensityMatrices(after)[other]);
    return {outcome, probability, possible: true, state: after, otherBefore, otherAfter, otherLengthBefore: blochLength(otherBefore), otherLengthAfter: blochLength(otherAfter)};
  });
}

// After a collapse, measuring the same target again gives the same outcome with probability 1.
export const repeatProbability = (collapsed, target, outcome) => distributionFor(collapsed, target).probabilities[outcome];
