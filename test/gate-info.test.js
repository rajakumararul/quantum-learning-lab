import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {C, mul, gates, applyGate, bloch} from '../quantum.js';
import {gateInfo, rotateAbout} from '../gate-info.js';
import {rng, randomState, rotate, assertClose, assertVectorClose, assertComplexClose} from './helpers.js';

const R = Math.SQRT1_2;
// Every symbol the reference table is allowed to use, with its exact value.
const SYMBOLS = {'0': C(0), '1': C(1), '−1': C(-1), 'i': C(0, 1), '−i': C(0, -1), 'e^{iπ/4}': C(R, R)};
const PREFACTORS = {'': 1, '1/√2': R};

describe('gate reference data', () => {
  test('describes exactly the gates the simulator supports', () => {
    assert.deepEqual(Object.keys(gateInfo).sort(), Object.keys(gates).sort());
  });

  for (const [name, info] of Object.entries(gateInfo)) {
    describe(name, () => {
      test('has every explanatory field', () => {
        for (const field of ['title', 'summary', 'detail', 'blochMap', 'dirac', 'axisLabel']) {
          assert.equal(typeof info[field], 'string');
          assert.ok(info[field].length > 0, field);
        }
      });

      test('displayed matrix evaluates exactly to the simulator matrix', () => {
        assert.ok(info.prefactor in PREFACTORS, `unknown prefactor ${info.prefactor}`);
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          const symbol = info.matrix[i][j];
          assert.ok(symbol in SYMBOLS, `unknown matrix symbol ${symbol}`);
          const value = mul(C(PREFACTORS[info.prefactor]), SYMBOLS[symbol]);
          assertComplexClose(value, gates[name][i][j], 1e-15, `${name}[${i}][${j}]`);
        }
      });

      test('rotation axis is a unit vector', () => {
        const [x, y, z] = info.axis;
        assertClose(x * x + y * y + z * z, 1, 1e-15);
      });

      test('Bloch coordinate map matches the gate on random states', () => {
        const random = rng(41);
        for (let i = 0; i < 300; i++) {
          const s = randomState(random);
          assertVectorClose(info.map(bloch(s)), bloch(applyGate(s, name)), 1e-12);
        }
      });

      test('stated rotation (axis, angle) matches the gate on random states', () => {
        const random = rng(42);
        for (let i = 0; i < 300; i++) {
          const s = randomState(random);
          assertVectorClose(rotateAbout(bloch(s), info.axis, info.angle), bloch(applyGate(s, name)), 1e-12);
        }
      });

      test('the drawn rotation path ends exactly at the output state', () => {
        const random = rng(43);
        for (let i = 0; i < 50; i++) {
          const s = randomState(random);
          const path = Array.from({length: 49}, (_, k) => rotateAbout(bloch(s), info.axis, info.angle * k / 48));
          assertVectorClose(path[0], bloch(s), 1e-12);
          assertVectorClose(path.at(-1), bloch(applyGate(s, name)), 1e-12);
          for (const p of path) assertClose(Math.hypot(p.x, p.y, p.z), 1, 1e-12);
        }
      });
    });
  }

  test('rotateAbout agrees with an independent Rodrigues implementation', () => {
    const random = rng(44);
    for (let i = 0; i < 200; i++) {
      const v = {x: random() - .5, y: random() - .5, z: random() - .5};
      const a = [random() - .5, random() - .5, random() - .5], n = Math.hypot(...a), axis = a.map((c) => c / n);
      const angle = random() * 7;
      assertVectorClose(rotateAbout(v, axis, angle), rotate(v, axis, angle), 1e-12);
    }
  });

  test('rotations follow the right-hand rule: a quarter-turn about +Z takes +X to +Y', () => {
    assertVectorClose(rotateAbout({x: 1, y: 0, z: 0}, [0, 0, 1], Math.PI / 2), {x: 0, y: 1, z: 0}, 1e-15);
  });

  test('summaries for S and T state the correct phase', () => {
    assert.match(gateInfo.S.summary, /π\/2/);
    assert.match(gateInfo.T.summary, /π\/4/);
  });
});
