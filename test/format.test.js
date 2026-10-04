import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {C, initial, applyGate, canonical} from '../quantum.js';
import {MINUS, formatReal, formatComplex, formatStateEquation, formatSum, formatKet, formatDegrees, formatRadians, formatAngle} from '../format.js';

const R = Math.SQRT1_2;
const display = (sequence) => {
  const [a, b] = canonical(sequence.reduce((s, g) => applyGate(s, g), initial()));
  return formatStateEquation(a, b);
};

describe('formatReal', () => {
  test('positive and negative values use 3 decimals and the typographic minus', () => {
    assert.equal(formatReal(R), '0.707');
    assert.equal(formatReal(-R), `${MINUS}0.707`);
    assert.equal(formatReal(1), '1.000');
    assert.equal(formatReal(-1), `${MINUS}1.000`);
  });

  test('never shows a negative zero', () => {
    for (const v of [0, -0, -1e-17, -0.00004, -0.0003, -0.000499]) assert.equal(formatReal(v), '0.000', `value ${v}`);
  });

  test('small values that still round to a visible digit keep their sign', () => {
    assert.equal(formatReal(-0.0006), `${MINUS}0.001`);
    assert.equal(formatReal(0.0006), '0.001');
  });

  test('never uses an ASCII hyphen as a minus sign', () => {
    for (const v of [-0.5, -R, -1, -0.0006]) assert.ok(!formatReal(v).includes('-'));
  });
});

describe('formatComplex', () => {
  const cases = [
    [C(0), '0.000'],
    [C(-0, -0), '0.000'],
    [C(R), '0.707'],
    [C(-R), `${MINUS}0.707`],
    [C(0, R), '0.707i'],
    [C(0, -R), `${MINUS}0.707i`],
    [C(0.5, 0.5), '(0.500 + 0.500i)'],
    [C(0.5, -0.5), `(0.500 ${MINUS} 0.500i)`],
    [C(-0.5, 0.5), `(${MINUS}0.500 + 0.500i)`],
    [C(-0.5, -0.5), `(${MINUS}0.500 ${MINUS} 0.500i)`],
    // Floating-point residue in one component is treated as zero, consistently with the rounding.
    [C(-R, 1.2e-16), `${MINUS}0.707`],
    [C(6.1e-17, -1), `${MINUS}1.000i`],
    [C(-0.0003, 0.5), '0.500i'],
    [C(0.5, -0.0003), '0.500'],
  ];
  for (const [value, text] of cases) test(`${JSON.stringify(value)} → ${text}`, () => assert.equal(formatComplex(value), text));
});

describe('formatStateEquation', () => {
  test('positive real β uses +', () => {
    assert.equal(formatStateEquation(C(R), C(R)), '|ψ⟩ = 0.707 |0⟩ + 0.707 |1⟩');
  });

  test('negative real β is written with a minus operator, not "+ -"', () => {
    const text = formatStateEquation(C(R), C(-R));
    assert.equal(text, `|ψ⟩ = 0.707 |0⟩ ${MINUS} 0.707 |1⟩`);
    assert.ok(!text.includes('+ -') && !text.includes(`+ ${MINUS}`));
  });

  test('negative imaginary β is written with a minus operator', () => {
    assert.equal(formatStateEquation(C(R), C(0, -R)), `|ψ⟩ = 0.707 |0⟩ ${MINUS} 0.707i |1⟩`);
  });

  test('complex β keeps its signs inside parentheses', () => {
    assert.equal(formatStateEquation(C(R), C(-0.5, 0.5)), `|ψ⟩ = 0.707 |0⟩ + (${MINUS}0.500 + 0.500i) |1⟩`);
    assert.equal(formatStateEquation(C(R), C(-0.5, -0.5)), `|ψ⟩ = 0.707 |0⟩ + (${MINUS}0.500 ${MINUS} 0.500i) |1⟩`);
  });

  test('basis states', () => {
    assert.equal(formatStateEquation(C(1), C(0)), '|ψ⟩ = 1.000 |0⟩ + 0.000 |1⟩');
    assert.equal(formatStateEquation(C(0), C(1)), '|ψ⟩ = 0.000 |0⟩ + 1.000 |1⟩');
  });
});

describe('regression: what students see after gate sequences', () => {
  const cases = [
    [[], '|ψ⟩ = 1.000 |0⟩ + 0.000 |1⟩'],
    [['X'], '|ψ⟩ = 0.000 |0⟩ + 1.000 |1⟩'],
    [['H'], '|ψ⟩ = 0.707 |0⟩ + 0.707 |1⟩'],
    [['X', 'H'], `|ψ⟩ = 0.707 |0⟩ ${MINUS} 0.707 |1⟩`],
    [['H', 'Z'], `|ψ⟩ = 0.707 |0⟩ ${MINUS} 0.707 |1⟩`],
    [['H', 'S'], '|ψ⟩ = 0.707 |0⟩ + 0.707i |1⟩'],
    [['H', 'S', 'S', 'S'], `|ψ⟩ = 0.707 |0⟩ ${MINUS} 0.707i |1⟩`],
    [['H', 'T'], '|ψ⟩ = 0.707 |0⟩ + (0.500 + 0.500i) |1⟩'],
    [['H', 'S', 'T'], `|ψ⟩ = 0.707 |0⟩ + (${MINUS}0.500 + 0.500i) |1⟩`],
    [['H', 'Z', 'T'], `|ψ⟩ = 0.707 |0⟩ + (${MINUS}0.500 ${MINUS} 0.500i) |1⟩`],
  ];
  for (const [sequence, text] of cases) test(sequence.join(' → ') || '(no gates)', () => assert.equal(display(sequence), text));
});

describe('formatSum and formatKet', () => {
  test('a negative second term becomes a minus operator', () => {
    assert.equal(formatSum(C(0.5), C(-0.5)), `0.500 ${MINUS} 0.500`);
    assert.equal(formatSum(C(0.5), C(0, -0.5)), `0.500 ${MINUS} 0.500i`);
    assert.equal(formatSum(C(0.5), C(0.25)), '0.500 + 0.250');
  });

  test('complex second terms keep signs inside parentheses', () => {
    assert.equal(formatSum(C(0), C(-0.5, 0.5)), `0.000 + (${MINUS}0.500 + 0.500i)`);
  });

  test('formatKet is the state equation without the |ψ⟩ prefix', () => {
    assert.equal(formatKet(C(R), C(-R)), `0.707 |0⟩ ${MINUS} 0.707 |1⟩`);
    assert.equal(formatStateEquation(C(R), C(-R)), `|ψ⟩ = ${formatKet(C(R), C(-R))}`);
  });
});

describe('angles in degrees and radians', () => {
  test('degrees are rounded to 0.01 and drop trailing zeros', () => {
    assert.equal(formatDegrees(Math.PI / 2), '90°');
    assert.equal(formatDegrees(0.65), '37.24°');
    assert.equal(formatDegrees(-Math.PI / 4), `${MINUS}45°`);
    assert.equal(formatDegrees(-1e-15), '0°');
  });

  test('radians are written as reduced multiples of π when exact', () => {
    const cases = [[0, '0'], [Math.PI, 'π'], [Math.PI / 2, 'π/2'], [Math.PI / 4, 'π/4'], [3 * Math.PI / 4, '3π/4'],
      [Math.PI / 6, 'π/6'], [2 * Math.PI / 3, '2π/3'], [7 * Math.PI / 4, '7π/4'], [Math.PI / 12, 'π/12'],
      [3 * Math.PI / 2, '3π/2'], [-Math.PI / 2, `${MINUS}π/2`], [-Math.PI, `${MINUS}π`], [2 * Math.PI, '2π']];
    for (const [rad, text] of cases) assert.equal(formatRadians(rad), text, `${rad}`);
  });

  test('other angles fall back to 3-decimal radians', () => {
    assert.equal(formatRadians(0.65), '0.650');
    assert.equal(formatRadians(Math.PI / 180), '0.017');
  });

  test('formatAngle shows degrees, exact radians and a decimal value', () => {
    assert.equal(formatAngle(0), '0° = 0 rad');
    assert.equal(formatAngle(Math.PI / 2), '90° = π/2 rad ≈ 1.571');
    assert.equal(formatAngle(Math.PI / 4), '45° = π/4 rad ≈ 0.785');
    assert.equal(formatAngle(0.65), '37.24° = 0.650 rad');
  });
});
