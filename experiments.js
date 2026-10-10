// Guided "Try it" experiments and the phase-lesson demonstrations (data only, no DOM).
// Each experiment is setup steps followed by one action step. A prediction is judged against the
// simulated result (see judgePrediction), never against a stored answer, so the text cannot drift
// from the mathematics; tests check that exactly one choice is correct and that each explanation's
// numerical claims hold.
import {bloch, probabilities} from './quantum.js';
import {statesOf, circuitOf} from './circuit.js';

const rotation = (gate, degrees) => ({type: 'rotation', gate, theta: degrees * Math.PI / 180});

export const experiments = [
  {
    id: 'predict-ry',
    title: 'Predict a measurement',
    setupText: 'Start in |0⟩ (the north pole).',
    setup: [],
    action: rotation('Ry', 90),
    question: 'Before applying Ry(90°), predict the measurement probabilities.',
    kind: 'probabilities',
    choices: [
      {label: 'P(0) = 100%, P(1) = 0%', p0: 1},
      {label: 'P(0) = 75%, P(1) = 25%', p0: 0.75},
      {label: 'P(0) = 50%, P(1) = 50%', p0: 0.5},
      {label: 'P(0) = 0%, P(1) = 100%', p0: 0},
    ],
    explanation: 'Ry(90°)|0⟩ = cos(45°)|0⟩ + sin(45°)|1⟩ = 0.707|0⟩ + 0.707|1⟩ = |+⟩, so P(0) = P(1) = 0.707² = 50%. On the sphere the vector turned 90° about Y, from the north pole down to +X on the equator. In general Ry(θ)|0⟩ gives P(1) = sin²(θ/2).',
  },
  {
    id: 'relative-phase',
    title: 'Watch a relative phase',
    setupText: 'H prepares |+⟩ = (|0⟩ + |1⟩)/√2, pointing along +X.',
    setup: [{type: 'gate', gate: 'H'}],
    action: rotation('Rz', 90),
    question: 'Where will the Bloch vector point after Rz(90°)?',
    kind: 'bloch',
    choices: [
      {label: 'Still +X', vector: {x: 1, y: 0, z: 0}},
      {label: '+Y', vector: {x: 0, y: 1, z: 0}},
      {label: '−Y', vector: {x: 0, y: -1, z: 0}},
      {label: 'The north pole |0⟩', vector: {x: 0, y: 0, z: 1}},
    ],
    explanation: 'Rz(90°)|+⟩ = e^{−iπ/4} (|0⟩ + i|1⟩)/√2. The common factor e^{−iπ/4} is a global phase; the factor i = e^{iπ/2} on |1⟩ is a relative phase φ = 90°, so the vector turns from +X to +Y. P(0) and P(1) stay 50%, yet the states differ physically: apply H now and you get 50/50, whereas H on |+⟩ would give |0⟩ with certainty.',
  },
  {
    id: 'full-turn',
    title: 'A full turn: −|ψ⟩',
    setupText: 'Ry(60°) prepares |ψ⟩ = 0.866|0⟩ + 0.500|1⟩, with P(0) = 75%.',
    setup: [rotation('Ry', 60)],
    action: rotation('Rx', 360),
    question: 'After a full 360° turn about X, what is P(0)?',
    kind: 'probabilities',
    choices: [
      {label: 'P(0) = 25% (swapped)', p0: 0.25},
      {label: 'P(0) = 50%', p0: 0.5},
      {label: 'P(0) = 75% (unchanged)', p0: 0.75},
      {label: 'P(0) = 100%', p0: 1},
    ],
    explanation: 'Rx(360°) = cos(180°) I − i sin(180°) X = −I, so the state becomes −|ψ⟩ = −0.866|0⟩ − 0.500|1⟩. The factor −1 = e^{iπ} multiplies the whole state: it is a global phase, so every probability (|−α|² = |α|²) and the Bloch vector are unchanged. The vector travels a complete circle about X and ends where it began. Only Rx(720°) gives back +|ψ⟩ exactly.',
  },
];

// One-click demonstrations for the global/relative phase lesson.
export const phaseDemos = [
  {id: 'rz-pole', label: 'Rz(90°) on |0⟩', steps: [rotation('Rz', 90)]},
  {id: 'rz-plus', label: 'Rz(90°) on |+⟩', steps: [{type: 'gate', gate: 'H'}, rotation('Rz', 90)]},
  {id: 'rx-full', label: 'Rx(360°) on Ry(60°)|0⟩', steps: [rotation('Ry', 60), rotation('Rx', 360)]},
];

export const experimentCircuit = (experiment, {withAction = true} = {}) =>
  circuitOf(withAction ? [...experiment.setup, experiment.action] : experiment.setup);

export const experimentResult = (experiment) => statesOf(experimentCircuit(experiment)).at(-1);

const TOLERANCE = 1e-9;
// True when a choice describes the simulated outcome of the experiment.
export function choiceMatches(experiment, choice, state = experimentResult(experiment)) {
  if (experiment.kind === 'probabilities') return Math.abs(probabilities(state)[0] - choice.p0) < TOLERANCE;
  const v = bloch(state);
  return ['x', 'y', 'z'].every((k) => Math.abs(v[k] - choice.vector[k]) < TOLERANCE);
}

export function judgePrediction(experiment, choiceIndex) {
  const state = experimentResult(experiment);
  const correctIndex = experiment.choices.findIndex((c) => choiceMatches(experiment, c, state));
  return {correct: choiceIndex === correctIndex, correctIndex, state};
}
