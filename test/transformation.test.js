import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {C} from '../quantum.js';
import {ROTATIONS} from '../rotations.js';
import {describeRotation} from '../transformation.js';
import {MINUS, formatRotation, formatRotationRadians, formatPhaseFactor, formatRadians, formatAngle} from '../format.js';
import {parseDegrees, degreesToRadians, PRESET_DEGREES, MIN_DEGREES, MAX_DEGREES, sliderDegrees, stepDegrees, angleText} from '../angle-input.js';
import {rng, randomState, cis} from './helpers.js';

const PI = Math.PI, R = Math.SQRT1_2;
const ket0 = [C(1), C(0)], plus = [C(R), C(R)];
const deg = (d) => d * PI / 180;
// Every string in the description, recursively.
const strings = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.entries(v).filter(([k]) => k !== 'after').flatMap(([, x]) => strings(x)) : []);

describe('mathematical transformation panel data', () => {
  test('Ry(90°)|0⟩: every field the panel shows', () => {
    const d = describeRotation('Ry', deg(90), ket0);
    assert.equal(d.label, 'Ry(90°)');
    assert.equal(d.radiansLabel, 'Ry(π/2)');
    assert.equal(d.degrees, '90°');
    assert.equal(d.radians, 'π/2 rad ≈ 1.571');
    assert.deepEqual(d.matrix, [['0.707', `${MINUS}0.707`], ['0.707', '0.707']]);
    assert.deepEqual(d.input, ['1.000', '0.000']);
    assert.deepEqual(d.output, ['0.707', '0.707']);
    assert.equal(d.alpha, '0.707');
    assert.equal(d.beta, '0.707');
    assert.deepEqual(d.probabilities, ['50.0%', '50.0%']);
    assert.equal(d.blochIn.vector, '(0.000, 0.000, 1.000)');
    assert.equal(d.blochOut.vector, '(1.000, 0.000, 0.000)');
    assert.equal(d.blochIn.polar, '0° = 0 rad');
    assert.equal(d.blochIn.azimuth, 'undefined (at a pole)');
    assert.equal(d.blochOut.polar, '90° = π/2 rad ≈ 1.571');
    assert.equal(d.blochOut.azimuth, '0° = 0 rad');
    assert.match(d.observation, /turns by 90° about the Y axis/);
    assert.equal(d.steps.length, 2);
    assert.equal(d.steps[0].result, '0.707');
  });

  test('Rx(180°)|0⟩ shows exact zeros and −i, never 6.1e-17', () => {
    const d = describeRotation('Rx', deg(180), ket0);
    assert.deepEqual(d.matrix, [['0.000', `${MINUS}1.000i`], [`${MINUS}1.000i`, '0.000']]);
    assert.deepEqual(d.output, ['0.000', `${MINUS}1.000i`]);
    assert.equal(d.blochOut.vector, '(0.000, 0.000, 1.000)'.replace('1.000)', `${MINUS}1.000)`));
  });

  test('Rz(φ)|0⟩ explains that only a global phase changed', () => {
    const d = describeRotation('Rz', deg(90), ket0);
    assert.match(d.observation, /e\^\{−i·π\/4\} × the input: only a global phase/);
    assert.match(d.observation, /does not move/);
    assert.equal(d.blochIn.vector, d.blochOut.vector);
  });

  test('a 2π rotation explains −|ψ⟩ as a global phase of π', () => {
    for (const g of ROTATIONS) {
      const d = describeRotation(g, deg(360), plus);
      assert.match(d.observation, /−1 × the input: a global phase of π/);
      assert.match(d.observation, /same physical state/);
    }
  });

  test('Rz(90°)|+⟩ moves the vector and changes the azimuth', () => {
    const d = describeRotation('Rz', deg(90), plus);
    assert.equal(d.blochOut.vector, '(0.000, 1.000, 0.000)');
    assert.equal(d.blochOut.azimuth, '90° = π/2 rad ≈ 1.571');
  });

  test('no misleading floating-point text for any preset, gate or random state', () => {
    const r = rng(91), states = [ket0, plus, [C(0), C(1)], ...Array.from({length: 30}, () => randomState(r))];
    for (const d of [...PRESET_DEGREES, 1, 22.5, 359.99]) for (const g of ROTATIONS) for (const s of states) {
      for (const text of strings(describeRotation(g, deg(d), s))) {
        assert.ok(!/e[-+]\d/.test(text), `scientific notation in "${text}"`);
        assert.ok(!/NaN|Infinity|undefined\)|-0\.000/.test(text.replace('undefined (at a pole)', '')), `bad text "${text}"`);
        assert.ok(!/\d-|-\d/.test(text), `ASCII hyphen as minus in "${text}"`);
        assert.ok(!text.includes(`${MINUS}0.000`), `negative zero in "${text}"`);
      }
    }
  });
});

describe('rotation formatting', () => {
  test('labels in degrees and radians', () => {
    assert.equal(formatRotation('Rx', deg(90)), 'Rx(90°)');
    assert.equal(formatRotation('Rz', deg(45)), 'Rz(45°)');
    assert.equal(formatRotation('Ry', deg(22.5)), 'Ry(22.5°)');
    assert.equal(formatRotationRadians('Ry', PI / 2), 'Ry(π/2)');
    assert.equal(formatRotationRadians('Rx', 2 * PI), 'Rx(2π)');
    assert.equal(formatRotationRadians('Rz', deg(1)), 'Rz(0.017 rad)');
    assert.equal(formatRotationRadians('Rz', 0), 'Rz(0)');
  });

  test('phase factors are written exactly for simple multiples of π', () => {
    assert.equal(formatPhaseFactor(C(1)), '1');
    assert.equal(formatPhaseFactor(C(-1, 1e-16)), `${MINUS}1`);
    assert.equal(formatPhaseFactor(C(-1, -1e-16)), `${MINUS}1`);
    assert.equal(formatPhaseFactor(C(0, 1)), 'i');
    assert.equal(formatPhaseFactor(C(6e-17, -1)), `${MINUS}i`);
    assert.equal(formatPhaseFactor(cis(PI / 4)), 'e^{i·π/4}');
    assert.equal(formatPhaseFactor(cis(-PI / 8)), `e^{${MINUS}i·π/8}`);
    assert.equal(formatPhaseFactor(cis(1)), 'e^{i·1.000}');
  });

  test('regression: tiny angles format as 0, never "0π"', () => {
    for (const v of [1e-11, -1e-11, 1e-10]) {
      assert.equal(formatRadians(v), '0');
      assert.equal(formatAngle(v), '0° = 0 rad');
    }
  });
});

describe('angle input validation', () => {
  test('range and presets', () => {
    assert.equal(MIN_DEGREES, 0);
    assert.equal(MAX_DEGREES, 360);
    assert.deepEqual(PRESET_DEGREES, [0, 45, 90, 180, 270, 360]);
  });

  test('accepts plain decimal degrees, with optional sign, spaces and degree sign', () => {
    const ok = {'90': 90, ' 45 ': 45, '22.5': 22.5, '.5': 0.5, '360': 360, '0': 0, '+90': 90, '90°': 90, '90 °': 90, '180deg': 180, '-0': 0, '7.': 7};
    for (const [text, degrees] of Object.entries(ok)) {
      const p = parseDegrees(text);
      assert.ok(p.ok, text);
      assert.ok(Object.is(p.degrees, degrees), `${text} → ${p.degrees}`);
      assert.equal(p.radians, degreesToRadians(degrees));
    }
  });

  test('rejects text, empty input and non-decimal notation', () => {
    for (const text of ['', '   ', 'abc', '12abc', '1e2', '0x10', 'Infinity', 'NaN', '9 0', '--5', '1,5', null, undefined]) {
      const p = parseDegrees(text);
      assert.equal(p.ok, false, String(text));
      assert.match(p.message, /number of degrees/);
    }
  });

  test('rejects angles outside 0°–360°', () => {
    for (const text of ['-1', `${MINUS}45`, '360.01', '720', '-0.5']) {
      const p = parseDegrees(text);
      assert.equal(p.ok, false, text);
      assert.match(p.message, /0° to 360°/);
    }
  });

  test('degree presets convert to the radians used by the mathematics', () => {
    assert.equal(degreesToRadians(180), PI);
    assert.equal(degreesToRadians(90), PI / 2);
    assert.equal(degreesToRadians(360), 2 * PI);
  });

  test('decimal angles stay synchronized: both controls show the exact typed value', () => {
    for (const text of ['22.5', '0.25', '359.99', '12.125', '90', '0', '360', '45.0', '22.5°']) {
      const p = parseDegrees(text);
      assert.ok(p.ok, text);
      // The slider (step="any") and the field both receive angleText(degrees): no rounding to whole degrees.
      assert.equal(Number(angleText(p.degrees)), p.degrees, text);
      assert.equal(parseDegrees(angleText(p.degrees)).degrees, p.degrees, `${text} round-trips`);
      assert.equal(p.radians, degreesToRadians(p.degrees));
    }
    assert.equal(angleText(22.5), '22.5');
    assert.equal(angleText(90), '90');
  });

  test('dragging the slider snaps to whole degrees within 0°–360°', () => {
    const cases = {'22.5': 23, '22.49': 22, '0': 0, '360': 360, '359.7': 360, '0.4': 0, '-3': 0, '400': 360, 'abc': 0, '': 0};
    for (const [raw, want] of Object.entries(cases)) assert.equal(sliderDegrees(raw), want, `slider ${raw}`);
  });

  test('keyboard steps on the slider move to whole degrees and respect the range', () => {
    assert.equal(stepDegrees(90, 'ArrowRight'), 91);
    assert.equal(stepDegrees(90, 'ArrowLeft'), 89);
    assert.equal(stepDegrees(90, 'ArrowUp'), 91);
    assert.equal(stepDegrees(90, 'ArrowDown'), 89);
    assert.equal(stepDegrees(22.5, 'ArrowRight'), 23);
    assert.equal(stepDegrees(22.5, 'ArrowLeft'), 22);
    assert.equal(stepDegrees(22.5, 'PageUp'), 37);
    assert.equal(stepDegrees(22.5, 'PageDown'), 8);
    assert.equal(stepDegrees(360, 'ArrowRight'), 360);
    assert.equal(stepDegrees(0, 'ArrowLeft'), 0);
    assert.equal(stepDegrees(5, 'PageDown'), 0);
    assert.equal(stepDegrees(45.5, 'Home'), 0);
    assert.equal(stepDegrees(45.5, 'End'), 360);
    assert.equal(stepDegrees(45, 'Tab'), null);
    assert.equal(stepDegrees(45, 'a'), null);
  });
});
