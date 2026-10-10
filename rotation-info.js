// Educational reference for the parameterized rotations. Tests check every field against rotations.js:
//   matrix        symbolic entries; SYMBOLS in the tests evaluate them at θ and compare with rotationMatrix
//   axis          the Bloch-sphere rotation axis; map(v, θ) is the action on (x, y, z), blochMap its written form
//   specialCases  each `check` is evaluated: R(θ) (or R(θ)|input⟩) must equal phase(θ) × target exactly.
//                 kind 'equal' means the phase is exactly 1 (mathematical equality);
//                 kind 'equivalent' means a nontrivial global phase (same physical operation or state).
// Text may contain e^{...}, which the page renders as a superscript.
import {C} from './quantum.js';

const PI = Math.PI;
const cis = (a) => C(Math.cos(a), Math.sin(a));
const ONE = () => C(1);
const SAMPLE = [0, PI / 7, PI / 3, PI / 2, 2, PI, 4.5, 2 * PI];

export const rotationInfo = {
  Rx: {
    title: 'Rotation about X',
    axis: [1, 0, 0], axisName: 'X', axisLabel: 'the X axis',
    matrix: [['cos(θ/2)', '−i sin(θ/2)'], ['−i sin(θ/2)', 'cos(θ/2)']],
    blochMap: '(x, y, z) → (x, y cos θ − z sin θ, y sin θ + z cos θ)',
    dirac: 'α|0⟩ + β|1⟩ → (cos(θ/2)α − i sin(θ/2)β)|0⟩ + (−i sin(θ/2)α + cos(θ/2)β)|1⟩',
    map: ({x, y, z}, t) => ({x, y: y * Math.cos(t) - z * Math.sin(t), z: y * Math.sin(t) + z * Math.cos(t)}),
    geometry: 'Turns the Bloch vector by θ about the X axis, anticlockwise when +X points toward you (right-hand rule). The x coordinate never changes. Starting from |0⟩ the vector sweeps the Y–Z great circle: |0⟩ → −Y (90°) → |1⟩ (180°) → +Y (270°) → |0⟩ (360°). |+⟩ and |−⟩ lie on the axis and do not move.',
    use: 'On many hardware platforms an X rotation is a native operation: a resonant drive pulse whose length or amplitude sets θ. Rx(π/2) is a standard building block, and Rx(θ) with a trainable θ appears in variational algorithms.',
    specialCases: [
      {statement: 'Rx(0) = I', kind: 'equal', meaning: 'No rotation: every state is unchanged.',
        check: {thetas: [0], target: 'I', phase: ONE}},
      {statement: 'Rx(π) = −iX', kind: 'equivalent', meaning: 'Rx(π) ≃ X: physically the same operation as X, differing only by the global phase −i.',
        check: {thetas: [PI], target: 'X', phase: () => C(0, -1)}},
      {statement: 'Rx(π)|0⟩ = −i|1⟩', kind: 'equivalent', meaning: 'Physically the state |1⟩; the factor −i is a global phase.',
        check: {thetas: [PI], input: '0', target: '1', phase: () => C(0, -1)}},
      {statement: 'Rx(π/2)|0⟩ = (|0⟩ − i|1⟩)/√2', kind: 'equal', meaning: 'An equal superposition with relative phase −π/2: the Bloch vector points along −Y.',
        check: {thetas: [PI / 2], input: '0', target: '-i', phase: ONE}},
      {statement: 'Rx(2π) = −I', kind: 'equivalent', meaning: 'A full turn returns every Bloch vector to its start, but the state vector becomes −|ψ⟩ (global phase π). Only Rx(4π) = I exactly.',
        check: {thetas: [2 * PI], target: 'I', phase: () => C(-1)}},
    ],
  },
  Ry: {
    title: 'Rotation about Y',
    axis: [0, 1, 0], axisName: 'Y', axisLabel: 'the Y axis',
    matrix: [['cos(θ/2)', '−sin(θ/2)'], ['sin(θ/2)', 'cos(θ/2)']],
    blochMap: '(x, y, z) → (x cos θ + z sin θ, y, −x sin θ + z cos θ)',
    dirac: 'α|0⟩ + β|1⟩ → (cos(θ/2)α − sin(θ/2)β)|0⟩ + (sin(θ/2)α + cos(θ/2)β)|1⟩',
    map: ({x, y, z}, t) => ({x: x * Math.cos(t) + z * Math.sin(t), y, z: -x * Math.sin(t) + z * Math.cos(t)}),
    geometry: 'Turns the Bloch vector by θ about the Y axis (right-hand rule). The y coordinate never changes. Starting from |0⟩ the vector sweeps the X–Z great circle: |0⟩ → +X (90°) → |1⟩ (180°) → −X (270°) → |0⟩ (360°). The matrix is real, so amplitudes that start real stay real.',
    use: 'State preparation: Ry(θ)|0⟩ = cos(θ/2)|0⟩ + sin(θ/2)|1⟩ gives P(1) = sin²(θ/2) for any chosen θ, with no phase. Ry(θ) layers are common in variational circuits and in loading data into amplitudes.',
    specialCases: [
      {statement: 'Ry(π)|0⟩ = |1⟩', kind: 'equal', meaning: 'Exactly |1⟩, with no phase factor at all.',
        check: {thetas: [PI], input: '0', target: '1', phase: ONE}},
      {statement: 'Ry(π/2)|0⟩ = |+⟩ = (|0⟩ + |1⟩)/√2', kind: 'equal', meaning: 'Exactly the same state as H|0⟩: the Bloch vector points along +X.',
        check: {thetas: [PI / 2], input: '0', target: '+', phase: ONE}},
      {statement: 'Ry(θ)|0⟩ = cos(θ/2)|0⟩ + sin(θ/2)|1⟩', kind: 'equal', meaning: 'Real amplitudes for every θ, so P(0) = cos²(θ/2) and P(1) = sin²(θ/2).',
        check: {thetas: SAMPLE, input: '0', target: (t) => [C(Math.cos(t / 2)), C(Math.sin(t / 2))], phase: ONE}},
      {statement: 'Ry(π) = −iY', kind: 'equivalent', meaning: 'Ry(π) ≃ Y: physically the same operation as Y, up to the global phase −i.',
        check: {thetas: [PI], target: 'Y', phase: () => C(0, -1)}},
      {statement: 'Ry(2π) = −I', kind: 'equivalent', meaning: 'A full turn gives −|ψ⟩: the same physical state (global phase π), not the same vector.',
        check: {thetas: [2 * PI], target: 'I', phase: () => C(-1)}},
    ],
  },
  Rz: {
    title: 'Rotation about Z',
    axis: [0, 0, 1], axisName: 'Z', axisLabel: 'the Z axis',
    matrix: [['e^{−iθ/2}', '0'], ['0', 'e^{iθ/2}']],
    blochMap: '(x, y, z) → (x cos θ − y sin θ, x sin θ + y cos θ, z)',
    dirac: 'α|0⟩ + β|1⟩ → e^{−iθ/2}α|0⟩ + e^{iθ/2}β|1⟩',
    map: ({x, y, z}, t) => ({x: x * Math.cos(t) - y * Math.sin(t), y: x * Math.sin(t) + y * Math.cos(t), z}),
    geometry: 'Turns the Bloch vector by θ about the Z axis: the azimuth φ increases by θ while z, and hence every measurement probability, stays fixed. |+⟩ goes +X → +Y (90°) → −X (180°) → −Y (270°). The poles |0⟩ and |1⟩ lie on the axis and do not move.',
    use: 'Changes only the relative phase. Rz(θ) = e^{−iθ/2} diag(1, e^{iθ}), so Z, S and T are all Z rotations up to global phase. On many superconducting-qubit platforms Rz is applied "virtually", by shifting the phase of later control pulses.',
    specialCases: [
      {statement: 'Rz(θ)|0⟩ = e^{−iθ/2}|0⟩', kind: 'equivalent', meaning: 'Only a global phase: |0⟩ is on the rotation axis, so the Bloch vector does not move.',
        check: {thetas: SAMPLE, input: '0', target: '0', phase: (t) => cis(-t / 2)}},
      {statement: 'Rz(θ)|+⟩ = e^{−iθ/2}(|0⟩ + e^{iθ}|1⟩)/√2', kind: 'equivalent', meaning: 'A global phase e^{−iθ/2} times a state with relative phase φ = θ: the vector turns θ around the equator.',
        check: {thetas: SAMPLE, input: '+', target: (t) => [C(Math.SQRT1_2), C(Math.SQRT1_2 * Math.cos(t), Math.SQRT1_2 * Math.sin(t))], phase: (t) => cis(-t / 2)}},
      {statement: 'Rz(π) = −iZ', kind: 'equivalent', meaning: 'Rz(π) ≃ Z: physically the same operation as Z, up to the global phase −i.',
        check: {thetas: [PI], target: 'Z', phase: () => C(0, -1)}},
      {statement: 'Rz(π/2) = e^{−iπ/4} S', kind: 'equivalent', meaning: 'Rz(π/2) ≃ S up to global phase.',
        check: {thetas: [PI / 2], target: 'S', phase: () => cis(-PI / 4)}},
      {statement: 'Rz(π/4) = e^{−iπ/8} T', kind: 'equivalent', meaning: 'Rz(π/4) ≃ T up to global phase.',
        check: {thetas: [PI / 4], target: 'T', phase: () => cis(-PI / 8)}},
      {statement: 'Rz(2π) = −I', kind: 'equivalent', meaning: 'The same physical operation as doing nothing, but it multiplies every state by −1.',
        check: {thetas: [2 * PI], target: 'I', phase: () => C(-1)}},
    ],
  },
};
