// Educational reference for each gate. Tests check that every field agrees with quantum.js:
//   matrix     display entries (all multiplied by prefactor) evaluate to gates[name]
//   axis/angle the Bloch-sphere rotation (right-hand rule) performed, up to global phase
//   map        the action on Bloch coordinates (x, y, z); blochMap is its written form
// Text may contain e^{...}, which the page renders as a superscript.
const R = Math.SQRT1_2;

export const gateInfo = {
  X: {
    title: 'Pauli-X (quantum NOT)',
    summary: 'X swaps |0⟩ and |1⟩: a half-turn about the X axis.',
    detail: 'Bit flip. X exchanges the amplitudes of |0⟩ and |1⟩, so the poles swap and P(0) and P(1) are exchanged. States on the X axis, |+⟩ and |−⟩, are unchanged apart from a global phase.',
    prefactor: '',
    matrix: [['0', '1'], ['1', '0']],
    axis: [1, 0, 0], axisLabel: 'the X axis', angle: Math.PI,
    blochMap: '(x, y, z) → (x, −y, −z)',
    map: ({x, y, z}) => ({x, y: -y, z: -z}),
    dirac: 'α|0⟩ + β|1⟩ → β|0⟩ + α|1⟩',
  },
  Y: {
    title: 'Pauli-Y',
    summary: 'Y swaps |0⟩ and |1⟩ with phases (|0⟩ → i|1⟩, |1⟩ → −i|0⟩): a half-turn about the Y axis.',
    detail: 'Bit flip and phase flip together (Y = iXZ). Y swaps the amplitudes and attaches the factors −i and i. Y|0⟩ = i|1⟩: the factor i there is a global phase, so on the Bloch sphere this is simply |0⟩ → |1⟩.',
    prefactor: '',
    matrix: [['0', '−i'], ['i', '0']],
    axis: [0, 1, 0], axisLabel: 'the Y axis', angle: Math.PI,
    blochMap: '(x, y, z) → (−x, y, −z)',
    map: ({x, y, z}) => ({x: -x, y, z: -z}),
    dirac: 'α|0⟩ + β|1⟩ → −iβ|0⟩ + iα|1⟩',
  },
  Z: {
    title: 'Pauli-Z (phase flip)',
    summary: 'Z changes the sign of the |1⟩ amplitude: a half-turn about Z.',
    detail: 'Phase flip. Z leaves |0⟩ alone and negates the |1⟩ amplitude. Probabilities do not change, but the relative phase φ increases by π, so |+⟩ ↔ |−⟩. The difference becomes measurable after an H gate.',
    prefactor: '',
    matrix: [['1', '0'], ['0', '−1']],
    axis: [0, 0, 1], axisLabel: 'the Z axis', angle: Math.PI,
    blochMap: '(x, y, z) → (−x, −y, z)',
    map: ({x, y, z}) => ({x: -x, y: -y, z}),
    dirac: 'α|0⟩ + β|1⟩ → α|0⟩ − β|1⟩',
  },
  H: {
    title: 'Hadamard',
    summary: 'H maps |0⟩ to (|0⟩ + |1⟩)/√2 and exchanges the X and Z axes.',
    detail: 'Creates and undoes equal superpositions: |0⟩ → |+⟩ and |1⟩ → |−⟩. H is its own inverse (H² = I). It is a half-turn about the diagonal axis between X and Z, so it swaps the X and Z coordinates and negates Y.',
    prefactor: '1/√2',
    matrix: [['1', '1'], ['1', '−1']],
    axis: [R, 0, R], axisLabel: 'the diagonal axis (X + Z)/√2', angle: Math.PI,
    blochMap: '(x, y, z) → (z, −y, x)',
    map: ({x, y, z}) => ({x: z, y: -y, z: x}),
    dirac: 'α|0⟩ + β|1⟩ → ((α + β)/√2)|0⟩ + ((α − β)/√2)|1⟩',
  },
  S: {
    title: 'Phase gate S (√Z)',
    summary: 'S adds a relative phase of π/2 to |1⟩: a quarter-turn about Z.',
    detail: 'S multiplies the |1⟩ amplitude by i = e^{iπ/2}, adding π/2 to the relative phase φ. Probabilities do not change. Two S gates make Z (S² = Z), and S takes |+⟩ to |+i⟩.',
    prefactor: '',
    matrix: [['1', '0'], ['0', 'i']],
    axis: [0, 0, 1], axisLabel: 'the Z axis', angle: Math.PI / 2,
    blochMap: '(x, y, z) → (−y, x, z)',
    map: ({x, y, z}) => ({x: -y, y: x, z}),
    dirac: 'α|0⟩ + β|1⟩ → α|0⟩ + iβ|1⟩',
  },
  T: {
    title: 'T gate (π/8 gate, √S)',
    summary: 'T adds a relative phase of π/4 to |1⟩: an eighth-turn about Z.',
    detail: 'T multiplies the |1⟩ amplitude by e^{iπ/4}, adding π/4 to the relative phase φ. Probabilities do not change. T² = S and T⁸ = I. Combined with H, T can approximate any single-qubit gate.',
    prefactor: '',
    matrix: [['1', '0'], ['0', 'e^{iπ/4}']],
    axis: [0, 0, 1], axisLabel: 'the Z axis', angle: Math.PI / 4,
    blochMap: '(x, y, z) → ((x − y)/√2, (x + y)/√2, z)',
    map: ({x, y, z}) => ({x: R * (x - y), y: R * (x + y), z}),
    dirac: 'α|0⟩ + β|1⟩ → α|0⟩ + e^{iπ/4}β|1⟩',
  },
};

// Rodrigues rotation of v about the unit vector axis by angle (right-hand rule).
export function rotateAbout(v, [ux, uy, uz], angle) {
  const c = Math.cos(angle), s = Math.sin(angle), d = ux * v.x + uy * v.y + uz * v.z;
  return {
    x: v.x * c + (uy * v.z - uz * v.y) * s + ux * d * (1 - c),
    y: v.y * c + (uz * v.x - ux * v.z) * s + uy * d * (1 - c),
    z: v.z * c + (ux * v.y - uy * v.x) * s + uz * d * (1 - c),
  };
}
