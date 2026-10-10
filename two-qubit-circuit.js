// Two-qubit circuit history (no DOM). Like circuit.js, a circuit is an immutable list of steps
// applied to |00⟩, and states are recomputed by replay, so Undo is exact. emptyCircuit, undo and
// circuitOf from circuit.js work unchanged on these circuits. Steps:
//   {type: 'gate', gate, target}                fixed single-qubit gate (H, X, Y, Z, S, T) on q0 or q1
//   {type: 'rotation', gate, theta, target}     Rx, Ry or Rz (θ in radians) on q0 or q1
//   {type: 'two', gate, control, target}        two-qubit gate from controlled-gates.js (SWAP has no control)
//   {type: 'measure', qubit, outcome}           qubit 0 or 1 (outcome 0/1), or 'both' (outcome = basis index 0–3)
import {gates} from './quantum.js';
import {rotationMatrix} from './rotations.js';
import {initial2, basis2, singleQubitOperator, applyOperator, projectQubit, QUBITS, BASIS} from './multi-qubit.js';
import {twoQubitGates, twoQubitMatrix} from './controlled-gates.js';

const append = (circuit, step) => ({steps: [...circuit.steps, step]});
const checkTarget = (q) => { if (!QUBITS.includes(q)) throw Error('Target qubit must be 0 or 1, got ' + q); };

// Every add* validates eagerly so an invalid step can never enter the history.
export function addGate2(circuit, gate, target) {
  if (!gates[gate]) throw Error('Unsupported gate ' + gate);
  checkTarget(target);
  return append(circuit, {type: 'gate', gate, target});
}

export function addRotation2(circuit, gate, theta, target) {
  rotationMatrix(gate, theta);
  checkTarget(target);
  return append(circuit, {type: 'rotation', gate, theta, target});
}

export function addTwoQubitGate(circuit, gate, control = 0, target = 1) {
  twoQubitMatrix(gate, control, target);
  return append(circuit, twoQubitGates[gate].controlled ? {type: 'two', gate, control, target} : {type: 'two', gate});
}

export function addMeasurement2(circuit, qubit, outcome) {
  if (qubit === 'both' ? !(outcome >= 0 && outcome <= 3 && Number.isInteger(outcome)) : !QUBITS.includes(qubit) || ![0, 1].includes(outcome)) {
    throw Error(`Invalid measurement of ${qubit} with outcome ${outcome}`);
  }
  return append(circuit, {type: 'measure', qubit, outcome});
}

// The 4×4 unitary of a gate step, with how it is built (for display).
export function operatorOf(step) {
  switch (step.type) {
    case 'gate': return {matrix: singleQubitOperator(gates[step.gate], step.target), factors: step.target === 0 ? `${step.gate} ⊗ I` : `I ⊗ ${step.gate}`};
    case 'rotation': {
      const name = `${step.gate}(θ)`;
      return {matrix: singleQubitOperator(rotationMatrix(step.gate, step.theta), step.target), factors: step.target === 0 ? `${name} ⊗ I` : `I ⊗ ${name}`};
    }
    case 'two': {
      const info = twoQubitGates[step.gate];
      if (!info) throw Error('Unsupported two-qubit gate ' + step.gate);
      const factors = !info.controlled ? step.gate
        : step.control === 0 ? `|0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ ${info.base}` : `I ⊗ |0⟩⟨0| + ${info.base} ⊗ |1⟩⟨1|`;
      return {matrix: twoQubitMatrix(step.gate, step.control, step.target), factors};
    }
    default: return null;
  }
}

export function applyStep2(state, step) {
  if (step.type === 'measure') {
    return step.qubit === 'both' ? basis2(step.outcome) : projectQubit(state, step.qubit, step.outcome).state;
  }
  const op = operatorOf(step);
  if (!op) throw Error('Unknown circuit step ' + step.type);
  return applyOperator(state, op.matrix);
}

// states[0] is |00⟩; states[k] is the state after step k. Global phase is kept.
export function statesOf2(circuit) {
  const states = [initial2()];
  for (const step of circuit.steps) states.push(applyStep2(states.at(-1), step));
  return states;
}

export const measurementLabel = (step) => (step.qubit === 'both' ? `|${BASIS[step.outcome]}⟩` : `${step.outcome}`);
