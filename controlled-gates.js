// Two-qubit gates (no DOM), in the |q0 q1⟩ basis order |00⟩, |01⟩, |10⟩, |11⟩ (see multi-qubit.js).
//
// A controlled-U is built from projectors on the control qubit:
//   C_c(U)_t = |0⟩⟨0|_c ⊗ I_t + |1⟩⟨1|_c ⊗ U_t,
// with the tensor factors written in the order (q0, q1). So CNOT with control q0, target q1 is
// P0 ⊗ I + P1 ⊗ X, and with control q1, target q0 it is I ⊗ P0 + X ⊗ P1.
// To add a new controlled gate (CY, CS, controlled rotations, …), add one entry to twoQubitGates.
import {gates} from './quantum.js';
import {identity, fromReal, kron, matAdd} from './tensor.js';

const I2 = identity(2);
export const P0 = fromReal([[1, 0], [0, 0]]); // |0⟩⟨0|
export const P1 = fromReal([[0, 0], [0, 1]]); // |1⟩⟨1|

export function controlled(U, control, target) {
  if (![0, 1].includes(control) || ![0, 1].includes(target) || control === target) {
    throw Error(`Control and target must be different qubits (0 and 1), got control ${control}, target ${target}`);
  }
  return control === 0 ? matAdd(kron(P0, I2), kron(P1, U)) : matAdd(kron(I2, P0), kron(U, P1));
}

// SWAP exchanges the two qubits: |01⟩ ↔ |10⟩, while |00⟩ and |11⟩ are unchanged.
export const SWAP = fromReal([[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1]]);

export const twoQubitGates = {
  CNOT: {
    title: 'Controlled-NOT', controlled: true, base: 'X', symmetric: false,
    matrix: (control, target) => controlled(gates.X, control, target),
    summary: 'Flips the target qubit (applies X) exactly when the control qubit is |1⟩.',
  },
  CZ: {
    title: 'Controlled-Z', controlled: true, base: 'Z', symmetric: true,
    matrix: (control, target) => controlled(gates.Z, control, target),
    summary: 'Multiplies the |11⟩ amplitude by −1 and leaves the others alone. The result is the same whichever qubit is called the control, so both wires get a dot.',
  },
  SWAP: {
    title: 'SWAP', controlled: false, symmetric: true,
    matrix: () => SWAP,
    summary: 'Exchanges the states of q0 and q1: |01⟩ ↔ |10⟩, with |00⟩ and |11⟩ unchanged.',
  },
};

export function twoQubitMatrix(gate, control = 0, target = 1) {
  const info = twoQubitGates[gate];
  if (!info) throw Error('Unsupported two-qubit gate ' + gate);
  return info.controlled ? info.matrix(control, target) : info.matrix();
}
