// Bell-state recipes and two-qubit guided experiments (data only, no DOM).
// Predictions are judged against the simulation (judgeTwoQubit), never a stored answer; tests check
// that exactly one choice is correct and that every claim in the explanations holds.
import {C, abs2} from './quantum.js';
import {circuitOf} from './circuit.js';
import {statesOf2} from './two-qubit-circuit.js';
import {probabilities2} from './multi-qubit.js';
import {concurrence} from './entanglement.js';

const R = Math.SQRT1_2;
const g = (gate, target) => ({type: 'gate', gate, target});
const CNOT01 = {type: 'two', gate: 'CNOT', control: 0, target: 1};

export const bellStates = [
  {id: 'phi-plus', name: 'Φ+', formula: '(|00⟩ + |11⟩)/√2', state: [C(R), C(0), C(0), C(R)],
    steps: [g('H', 0), CNOT01],
    recipe: 'H on q0 makes (|00⟩ + |10⟩)/√2. CNOT then flips q1 only in the |10⟩ branch, giving (|00⟩ + |11⟩)/√2.'},
  {id: 'phi-minus', name: 'Φ−', formula: '(|00⟩ − |11⟩)/√2', state: [C(R), C(0), C(0), C(-R)],
    steps: [g('H', 0), g('Z', 0), CNOT01],
    recipe: 'H then Z on q0 make (|00⟩ − |10⟩)/√2: Z puts a minus sign on the q0 = 1 branch. CNOT turns it into (|00⟩ − |11⟩)/√2.'},
  {id: 'psi-plus', name: 'Ψ+', formula: '(|01⟩ + |10⟩)/√2', state: [C(0), C(R), C(R), C(0)],
    steps: [g('H', 0), g('X', 1), CNOT01],
    recipe: 'H on q0 and X on q1 make (|01⟩ + |11⟩)/√2. CNOT flips q1 in the |11⟩ branch, giving (|01⟩ + |10⟩)/√2: the qubits now always disagree.'},
  {id: 'psi-minus', name: 'Ψ−', formula: '(|01⟩ − |10⟩)/√2', state: [C(0), C(R), C(-R), C(0)],
    steps: [g('H', 0), g('Z', 0), g('X', 1), CNOT01],
    recipe: 'H and Z on q0 and X on q1 make (|01⟩ − |11⟩)/√2; CNOT gives (|01⟩ − |10⟩)/√2, the antisymmetric "singlet" state.'},
];

const probs = (p00, p01, p10, p11) => [p00, p01, p10, p11];

export const twoQubitExperiments = [
  {
    id: 'bell-pair', title: 'Create a Bell pair',
    setupText: 'Start in |00⟩.', setup: [], actions: [g('H', 0), CNOT01], actionText: 'H on q0, then CNOT q0→q1',
    question: 'Predict the measurement probabilities of |00⟩, |01⟩, |10⟩, |11⟩.',
    kind: 'probabilities',
    choices: [
      {label: 'P(00) = 100%', probs: probs(1, 0, 0, 0)},
      {label: 'P(00) = P(10) = 50%', probs: probs(0.5, 0, 0.5, 0)},
      {label: 'P(00) = P(11) = 50%', probs: probs(0.5, 0, 0, 0.5)},
      {label: 'All four 25%', probs: probs(0.25, 0.25, 0.25, 0.25)},
    ],
    explanation: 'The result is |Φ+⟩ = (|00⟩ + |11⟩)/√2. Each qubit alone is completely random (50% 0, 50% 1), yet the two outcomes always agree: 00 or 11, never 01 or 10. That perfect correlation, with no definite state for either qubit separately, is entanglement. The concurrence is C = 2|αδ − βγ| = 2 · (1/√2)(1/√2) = 1, and both reduced Bloch vectors sit at the centre of their spheres.',
  },
  {
    id: 'superposition-vs-entanglement', title: 'Entanglement vs superposition',
    setupText: 'Start in |00⟩.', setup: [], actions: [g('H', 0), CNOT01], actionText: 'H on q0, then CNOT q0→q1',
    compare: {A: [g('H', 0)], B: [g('H', 0), CNOT01]},
    question: 'A = H on q0 only. B = H on q0 followed by CNOT q0→q1. Which states are entangled?',
    kind: 'entangled',
    choices: [
      {label: 'Neither', entangled: [false, false]},
      {label: 'Only A', entangled: [true, false]},
      {label: 'Only B', entangled: [false, true]},
      {label: 'Both: each contains a superposition', entangled: [true, true]},
    ],
    explanation: 'A = (|00⟩ + |10⟩)/√2 = |+⟩ ⊗ |0⟩: q0 is in superposition, but each qubit has a state of its own, so it is separable (αδ − βγ = (1/√2)(0) − (0)(1/√2) = 0, C = 0). B = (|00⟩ + |11⟩)/√2 cannot be written as |a⟩ ⊗ |b⟩: that would need αδ = βγ, but 1/2 ≠ 0, so C = 1. Superposition alone is not entanglement; the CNOT made q1 depend on q0.',
  },
  {
    id: 'swap', title: 'SWAP exchanges the qubits',
    setupText: 'X on q0 prepares |10⟩ (q0 = 1, q1 = 0).', setup: [g('X', 0)], actions: [{type: 'two', gate: 'SWAP'}], actionText: 'SWAP',
    question: 'What state does SWAP produce from |10⟩?',
    kind: 'basis',
    choices: [{label: '|00⟩', k: 0}, {label: '|01⟩', k: 1}, {label: '|10⟩', k: 2}, {label: '|11⟩', k: 3}],
    explanation: 'SWAP exchanges the states of q0 and q1, so |10⟩ (q0 = 1, q1 = 0) becomes |01⟩ (q0 = 0, q1 = 1). In the basis |00⟩, |01⟩, |10⟩, |11⟩ its matrix swaps the middle two amplitudes and leaves |00⟩ and |11⟩ alone. SWAP never creates entanglement: it only relabels which qubit is which.',
  },
  {
    id: 'cz', title: 'CZ creates entanglement through phase',
    setupText: 'H on both qubits prepares |++⟩ = (|00⟩ + |01⟩ + |10⟩ + |11⟩)/2, a product state with C = 0.', setup: [g('H', 0), g('H', 1)], actions: [{type: 'two', gate: 'CZ', control: 0, target: 1}], actionText: 'CZ',
    question: 'After CZ, what is the concurrence C?',
    kind: 'concurrence',
    choices: [{label: 'C = 0 (still separable)', value: 0}, {label: 'C = 1/2', value: 0.5}, {label: 'C = 1 (maximally entangled)', value: 1}],
    explanation: 'CZ only flips the sign of |11⟩: CZ|++⟩ = (|00⟩ + |01⟩ + |10⟩ − |11⟩)/2. All four probabilities stay 25%, so a measurement in this basis cannot see the change, but the phase pattern is no longer a product: αδ − βγ = (1/2)(−1/2) − (1/2)(1/2) = −1/2, so C = 2 · 1/2 = 1. Equivalently the state is (|0⟩|+⟩ + |1⟩|−⟩)/√2: q1 is |+⟩ when q0 is 0 and |−⟩ when q0 is 1.',
  },
];

const TOL = 1e-9;
export const experimentSteps2 = (exp, {withActions = true} = {}) => (withActions ? [...exp.setup, ...exp.actions] : [...exp.setup]);
const finalState = (steps) => statesOf2(circuitOf(steps)).at(-1);
export const experimentResult2 = (exp) => finalState(experimentSteps2(exp));

export function choiceMatches2(exp, choice) {
  const state = experimentResult2(exp);
  switch (exp.kind) {
    case 'probabilities': return probabilities2(state).every((p, k) => Math.abs(p - choice.probs[k]) < TOL);
    case 'basis': return Math.abs(abs2(state[choice.k]) - 1) < TOL;
    case 'concurrence': return Math.abs(concurrence(state) - choice.value) < TOL;
    case 'entangled': {
      const actual = [exp.compare.A, exp.compare.B].map((steps) => concurrence(finalState([...exp.setup, ...steps])) > TOL);
      return actual.every((e, i) => e === choice.entangled[i]);
    }
    default: throw Error('Unknown experiment kind ' + exp.kind);
  }
}

export function judgeTwoQubit(exp, choiceIndex) {
  const correctIndex = exp.choices.findIndex((c) => choiceMatches2(exp, c));
  return {correct: choiceIndex === correctIndex, correctIndex, state: experimentResult2(exp)};
}
