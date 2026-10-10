// Display-ready description of one rotation step R(θ)|ψ_in⟩ = |ψ_out⟩ (no DOM).
// All numbers pass through format.js, so floating-point residues such as 6.1e-17 are shown as 0
// and minus signs are typographic. The quantum state itself is never rounded: rounding is applied
// only to the strings returned here.
import {bloch, decompose, probabilities, matrixVectorSteps, globalPhaseFactor, applyMatrix} from './quantum.js';
import {rotationMatrix} from './rotations.js';
import {rotationInfo} from './rotation-info.js';
import {formatComplex, formatReal, formatDegrees, formatAngle, formatRotation, formatRotationRadians, formatPhaseFactor} from './format.js';

const formatVector = ({x, y, z}) => `(${formatReal(x)}, ${formatReal(y)}, ${formatReal(z)})`;
const percent = (p) => `${(p * 100).toFixed(1)}%`;

function blochSummary(state) {
  const d = decompose(state);
  return {
    vector: formatVector(bloch(state)),
    polar: formatAngle(d.theta),
    azimuth: d.phiDefined ? formatAngle(d.phi) : 'undefined (at a pole)',
  };
}

// What the student should notice about this particular step.
function observation(gate, theta, before, after) {
  const info = rotationInfo[gate], factor = globalPhaseFactor(before, after);
  if (!factor) return `The Bloch vector turns by ${formatDegrees(theta)} about ${info.axisLabel} (right-hand rule).`;
  const written = formatPhaseFactor(factor);
  if (written === '1') return 'The output equals the input to the displayed precision: this rotation leaves the state vector unchanged.';
  if (written === '−1') return `The output is −1 × the input: a global phase of π. Every probability and the Bloch vector are unchanged, so this is the same physical state${Math.abs(theta) > 1e-9 ? `, even though ${formatRotation(gate, theta)} is not the identity matrix` : ''}.`;
  return `The output is ${written} × the input: only a global phase changed. The Bloch vector lies on ${info.axisLabel}, the rotation axis, so it does not move, and no measurement can tell the two states apart.`;
}

export function describeRotation(gate, theta, before) {
  const matrix = rotationMatrix(gate, theta), after = applyMatrix(before, matrix);
  const [p0, p1] = probabilities(after);
  return {
    gate,
    label: formatRotation(gate, theta),
    radiansLabel: formatRotationRadians(gate, theta),
    degrees: formatDegrees(theta),
    radians: formatAngle(theta).split(' = ').slice(1).join(' = '),
    symbolicMatrix: rotationInfo[gate].matrix,
    matrix: matrix.map((row) => row.map(formatComplex)),
    input: before.map(formatComplex),
    output: after.map(formatComplex),
    steps: matrixVectorSteps(matrix, before).map((row) => ({
      entries: row.entries.map(formatComplex),
      inputs: row.inputs.map(formatComplex),
      products: row.products.map(formatComplex),
      result: formatComplex(row.result),
    })),
    alpha: formatComplex(after[0]),
    beta: formatComplex(after[1]),
    probabilities: [percent(p0), percent(p1)],
    blochIn: blochSummary(before),
    blochOut: blochSummary(after),
    observation: observation(gate, theta, before, after),
    after,
  };
}
