// Single-qubit circuit history. A circuit is an immutable value: a chronological list of
// steps applied to |0⟩. Every operation returns a new circuit; states are recomputed by replay.
//   {type: 'gate', gate}            a fixed unitary gate from quantum.js
//   {type: 'rotation', gate, theta} a parameterized rotation Rx, Ry or Rz from rotations.js (θ in radians)
//   {type: 'measure', outcome}      computational-basis measurement with its recorded outcome
//   {type: 'prepare', theta, phi}   direct state preparation from the θ/φ sliders
import {initial, applyGate, basisState, fromAngles} from './quantum.js';
import {applyRotation, rotationMatrix} from './rotations.js';

export const emptyCircuit = () => ({steps: []});

export const addGate = (circuit, gate) => ({steps: [...circuit.steps, {type: 'gate', gate}]});

// Validates eagerly (rotationMatrix throws on an unknown gate or a non-finite angle) so an
// invalid step can never enter the history and break every later replay.
export function addRotation(circuit, gate, theta) {
  rotationMatrix(gate, theta);
  return {steps: [...circuit.steps, {type: 'rotation', gate, theta}]};
}

export const addMeasurement = (circuit, outcome) => ({steps: [...circuit.steps, {type: 'measure', outcome}]});

// Dragging a slider fires many input events; consecutive preparations collapse into one step.
export function addPreparation(circuit, theta, phi) {
  const steps = circuit.steps.at(-1)?.type === 'prepare' ? circuit.steps.slice(0, -1) : circuit.steps;
  return {steps: [...steps, {type: 'prepare', theta, phi}]};
}

export const undo = (circuit) => ({steps: circuit.steps.slice(0, -1)});

export function applyStep(state, step) {
  switch (step.type) {
    case 'gate': return applyGate(state, step.gate);
    case 'rotation': return applyRotation(state, step.gate, step.theta);
    case 'measure': return basisState(step.outcome);
    case 'prepare': return fromAngles(step.theta, step.phi);
    default: throw Error('Unknown circuit step ' + step.type);
  }
}

// states[0] is the input |0⟩; states[k] is the state after step k. Global phase is kept, not removed.
export function statesOf(circuit) {
  const states = [initial()];
  for (const step of circuit.steps) states.push(applyStep(states.at(-1), step));
  return states;
}

// A circuit built from a list of steps, e.g. a guided experiment's setup.
export const circuitOf = (steps) => ({steps: steps.map((step) => ({...step}))});
