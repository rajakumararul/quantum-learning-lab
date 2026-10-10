import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {C, mul, gates, bloch, applyMatrix} from '../quantum.js';
import {ROTATIONS, rotationAxes, rotationMatrix, applyRotation} from '../rotations.js';
import {rotationInfo} from '../rotation-info.js';
import {rotateAbout} from '../gate-info.js';
import {cis, rng, randomState, I2, assertClose, assertComplexClose, assertVectorClose, assertStateClose, assertMatrixClose} from './helpers.js';

const R = Math.SQRT1_2;
// Every symbol the rotation matrices may use, as a function of θ.
const SYMBOLS = {
  '0': () => C(0),
  'cos(θ/2)': (t) => C(Math.cos(t / 2)),
  'sin(θ/2)': (t) => C(Math.sin(t / 2)),
  '−sin(θ/2)': (t) => C(-Math.sin(t / 2)),
  '−i sin(θ/2)': (t) => C(0, -Math.sin(t / 2)),
  'e^{−iθ/2}': (t) => cis(-t / 2),
  'e^{iθ/2}': (t) => cis(t / 2),
};
const STATES = {'0': [C(1), C(0)], '1': [C(0), C(1)], '+': [C(R), C(R)], '-i': [C(R), C(0, -R)]};
const MATRICES = {I: I2, ...gates};
const isOne = (c) => Math.abs(c.re - 1) < 1e-15 && Math.abs(c.im) < 1e-15;

describe('rotation reference data', () => {
  test('describes exactly Rx, Ry and Rz', () => {
    assert.deepEqual(Object.keys(rotationInfo), ROTATIONS);
  });

  for (const [name, info] of Object.entries(rotationInfo)) {
    describe(name, () => {
      test('has every explanatory field', () => {
        for (const field of ['title', 'axisName', 'axisLabel', 'blochMap', 'dirac', 'geometry', 'use']) {
          assert.equal(typeof info[field], 'string', field);
          assert.ok(info[field].length > 0, field);
        }
        assert.ok(info.specialCases.length >= 4);
      });

      test('axis matches the rotation module', () => assert.deepEqual(info.axis, rotationAxes[name]));

      test('symbolic matrix evaluates to rotationMatrix for many θ', () => {
        for (let k = -8; k <= 24; k++) {
          const t = k * Math.PI / 8 + 0.123;
          for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
            const symbol = info.matrix[i][j];
            assert.ok(symbol in SYMBOLS, `unknown symbol ${symbol}`);
            assertComplexClose(SYMBOLS[symbol](t), rotationMatrix(name, t)[i][j], 1e-15, `${name}[${i}][${j}] θ=${t}`);
          }
        }
      });

      test('Bloch coordinate map matches the gate on random states and angles', () => {
        const r = rng(81);
        for (let i = 0; i < 300; i++) {
          const s = randomState(r), t = (r() - 0.5) * 4 * Math.PI;
          assertVectorClose(info.map(bloch(s), t), bloch(applyRotation(s, name, t)), 1e-12);
          assertVectorClose(rotateAbout(bloch(s), info.axis, t), bloch(applyRotation(s, name, t)), 1e-12);
        }
      });

      for (const c of info.specialCases) {
        test(`special case: ${c.statement}`, () => {
          const {thetas, input, target, phase} = c.check;
          assert.ok(['equal', 'equivalent'].includes(c.kind));
          let nontrivial = false;
          for (const t of thetas) {
            const f = phase(t);
            assertClose(Math.hypot(f.re, f.im), 1, 1e-15, 'phase has modulus 1');
            if (!isOne(f)) nontrivial = true;
            if (input) {
              const want = (typeof target === 'function' ? target(t) : STATES[target]).map((a) => mul(f, a));
              assertStateClose(applyMatrix(STATES[input], rotationMatrix(name, t)), want, 1e-15, `θ=${t}`);
            } else {
              assertMatrixClose(rotationMatrix(name, t), MATRICES[target].map((row) => row.map((a) => mul(f, a))), 1e-15, `θ=${t}`);
            }
          }
          // "Exact equality" claims carry no phase at all; "≃" claims carry a nontrivial global phase.
          assert.equal(nontrivial, c.kind === 'equivalent', `${c.statement} is labelled ${c.kind}`);
        });
      }
    });
  }

  test('the brief\'s examples are present and labelled correctly', () => {
    const find = (g, s) => rotationInfo[g].specialCases.find((c) => c.statement === s);
    assert.equal(find('Rx', 'Rx(π) = −iX').kind, 'equivalent');
    assert.match(find('Rx', 'Rx(π) = −iX').meaning, /Rx\(π\) ≃ X/);
    assert.equal(find('Ry', 'Ry(π)|0⟩ = |1⟩').kind, 'equal');
    assert.equal(find('Rz', 'Rz(π) = −iZ').kind, 'equivalent');
    assert.match(find('Rz', 'Rz(π) = −iZ').meaning, /Rz\(π\) ≃ Z/);
  });

  test('geometry text describes the quarter-turn images correctly', () => {
    // Rx: |0⟩ → −Y; Ry: |0⟩ → +X; Rz: |+⟩ → +Y (checked numerically, then against the text).
    assertVectorClose(bloch(applyRotation(STATES['0'], 'Rx', Math.PI / 2)), {x: 0, y: -1, z: 0}, 1e-15);
    assert.match(rotationInfo.Rx.geometry, /\|0⟩ → −Y \(90°\)/);
    assertVectorClose(bloch(applyRotation(STATES['0'], 'Ry', Math.PI / 2)), {x: 1, y: 0, z: 0}, 1e-15);
    assert.match(rotationInfo.Ry.geometry, /\|0⟩ → \+X \(90°\)/);
    assertVectorClose(bloch(applyRotation(STATES['+'], 'Rz', Math.PI / 2)), {x: 0, y: 1, z: 0}, 1e-15);
    assert.match(rotationInfo.Rz.geometry, /\+X → \+Y \(90°\)/);
  });
});
