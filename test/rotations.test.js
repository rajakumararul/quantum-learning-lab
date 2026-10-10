import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {C, mul, abs2, gates, applyGate, bloch, probabilities, globalPhaseFactor, inner} from '../quantum.js';
import {ROTATIONS, rotationAxes, rotationMatrix, applyRotation, halfAngle, isRotation} from '../rotations.js';
import {gateInfo, rotateAbout} from '../gate-info.js';
import {EPS, cis, norm2, rng, randomState, matMul, dagger, I2, rotate, assertClose, assertComplexClose, assertStateClose, assertVectorClose, assertMatrixClose} from './helpers.js';

const PI = Math.PI, R = Math.SQRT1_2;
const ket0 = [C(1), C(0)], ket1 = [C(0), C(1)], plus = [C(R), C(R)];
const deg = (d) => d * PI / 180;
const scaled = (M, c) => M.map((row) => row.map((a) => mul(c, a)));
const negI = scaled(I2, C(-1));
// Textbook definitions written out independently of rotations.js.
const textbook = {
  Rx: (t) => [[C(Math.cos(t / 2)), C(0, -Math.sin(t / 2))], [C(0, -Math.sin(t / 2)), C(Math.cos(t / 2))]],
  Ry: (t) => [[C(Math.cos(t / 2)), C(-Math.sin(t / 2))], [C(Math.sin(t / 2)), C(Math.cos(t / 2))]],
  Rz: (t) => [[cis(-t / 2), C(0)], [C(0), cis(t / 2)]],
};
// Many angles: a uniform grid in degrees, random values, and negative and large angles.
const random = rng(2024);
const THETAS = [
  ...Array.from({length: 73}, (_, k) => deg(k * 5)),
  ...Array.from({length: 40}, () => (random() - 0.5) * 8 * PI),
  -PI / 3, -2 * PI, 3 * PI, 4 * PI, deg(720), 1e-8, 1e-15, 1e-300,
];

describe('rotation matrices', () => {
  test('exactly Rx, Ry and Rz are provided, with unit axes X, Y, Z', () => {
    assert.deepEqual(ROTATIONS, ['Rx', 'Ry', 'Rz']);
    assert.deepEqual(rotationAxes, {Rx: [1, 0, 0], Ry: [0, 1, 0], Rz: [0, 0, 1]});
    assert.ok(isRotation('Ry') && !isRotation('H') && !isRotation('rx'));
  });

  for (const g of ROTATIONS) {
    test(`${g}(θ) matches the textbook matrix for many θ`, () => {
      for (const t of THETAS) assertMatrixClose(rotationMatrix(g, t), textbook[g](t), 1e-15, `${g}(${t})`);
    });

    test(`${g}(θ) is unitary: U†U = UU† = I for many θ`, () => {
      for (const t of THETAS) {
        const U = rotationMatrix(g, t);
        assertMatrixClose(matMul(dagger(U), U), I2, 1e-14, `${g}(${t}) U†U`);
        assertMatrixClose(matMul(U, dagger(U)), I2, 1e-14, `${g}(${t}) UU†`);
      }
    });

    test(`${g}(θ) has determinant 1 (it is in SU(2))`, () => {
      for (const t of THETAS) {
        const [[a, b], [c, d]] = rotationMatrix(g, t), det = {re: mul(a, d).re - mul(b, c).re, im: mul(a, d).im - mul(b, c).im};
        assertComplexClose(det, C(1), 1e-14, `${g}(${t})`);
      }
    });

    test(`${g}(a) ${g}(b) = ${g}(a + b) and ${g}(−θ) = ${g}(θ)†`, () => {
      const r = rng(7);
      for (let i = 0; i < 100; i++) {
        const a = (r() - 0.5) * 4 * PI, b = (r() - 0.5) * 4 * PI;
        assertMatrixClose(matMul(rotationMatrix(g, a), rotationMatrix(g, b)), rotationMatrix(g, a + b), 1e-13);
        assertMatrixClose(rotationMatrix(g, -a), dagger(rotationMatrix(g, a)), 1e-15);
      }
    });
  }

  test('invalid gates and angles are rejected', () => {
    assert.throws(() => rotationMatrix('Rw', 1), /Unsupported rotation Rw/);
    for (const bad of [NaN, Infinity, -Infinity, '90', null, undefined, {}]) {
      assert.throws(() => rotationMatrix('Rx', bad), /finite number/, String(bad));
    }
  });
});

describe('normalization under rotations', () => {
  test('|α|² + |β|² = 1 is preserved for random states, gates and angles', () => {
    const r = rng(11);
    for (let i = 0; i < 2000; i++) {
      const s = randomState(r), g = ROTATIONS[i % 3], t = (r() - 0.5) * 8 * PI;
      assertClose(norm2(applyRotation(s, g, t)), 1, 1e-14, `${g}(${t})`);
    }
  });

  test('no norm drift over 100 000 successive random rotations', () => {
    const r = rng(12);
    let s = randomState(r);
    for (let i = 0; i < 100000; i++) s = applyRotation(s, ROTATIONS[i % 3], r() * 2 * PI);
    assertClose(norm2(s), 1, 1e-10);
  });
});

describe('known transformations (exact amplitudes, including phase)', () => {
  test('Rx(π)|0⟩ = −i|1⟩', () => assertStateClose(applyRotation(ket0, 'Rx', PI), [C(0), C(0, -1)], EPS));
  test('Ry(π)|0⟩ = |1⟩', () => assertStateClose(applyRotation(ket0, 'Ry', PI), ket1, EPS));
  test('Rx(π/2)|0⟩ = (|0⟩ − i|1⟩)/√2', () => assertStateClose(applyRotation(ket0, 'Rx', PI / 2), [C(R), C(0, -R)], EPS));
  test('Ry(π/2)|0⟩ = (|0⟩ + |1⟩)/√2 = |+⟩ = H|0⟩', () => {
    assertStateClose(applyRotation(ket0, 'Ry', PI / 2), plus, EPS);
    assertStateClose(applyRotation(ket0, 'Ry', PI / 2), applyGate(ket0, 'H'), EPS);
  });
  test('Rz(θ)|0⟩ = e^{−iθ/2}|0⟩ for many θ', () => {
    for (const t of THETAS) assertStateClose(applyRotation(ket0, 'Rz', t), [cis(-t / 2), C(0)], 1e-15, `θ=${t}`);
  });
  test('Rz(θ)|1⟩ = e^{iθ/2}|1⟩', () => {
    for (const t of THETAS) assertStateClose(applyRotation(ket1, 'Rz', t), [C(0), cis(t / 2)], 1e-15, `θ=${t}`);
  });

  describe('Rz on |+⟩', () => {
    const cases = [
      [PI / 2, [cis(-PI / 4), cis(PI / 4)].map((c) => mul(c, C(R))), {x: 0, y: 1, z: 0}, '|+i⟩ (up to global phase)'],
      [PI, [C(0, -R), C(0, R)], {x: -1, y: 0, z: 0}, '−i|−⟩'],
      [3 * PI / 2, [cis(-3 * PI / 4), cis(3 * PI / 4)].map((c) => mul(c, C(R))), {x: 0, y: -1, z: 0}, '|−i⟩ (up to global phase)'],
      [PI / 4, [cis(-PI / 8), cis(PI / 8)].map((c) => mul(c, C(R))), {x: R, y: R, z: 0}, 'φ = π/4'],
      [2 * PI, [C(-R), C(-R)], {x: 1, y: 0, z: 0}, '−|+⟩'],
    ];
    for (const [t, state, vector, name] of cases) {
      test(`Rz(${t.toFixed(3)})|+⟩ = ${name}`, () => {
        const out = applyRotation(plus, 'Rz', t);
        assertStateClose(out, state, 1e-15);
        assertVectorClose(bloch(out), vector, 1e-15);
        assertClose(probabilities(out)[0], 0.5, 1e-15);
      });
    }
  });
});

describe('Bloch sphere behaviour', () => {
  for (const g of ROTATIONS) {
    test(`${g}(θ) rotates the Bloch vector by θ about ${g[1].toUpperCase()} (right-hand rule)`, () => {
      const r = rng(21);
      for (let i = 0; i < 400; i++) {
        const s = randomState(r), t = (r() - 0.5) * 6 * PI;
        assertVectorClose(bloch(applyRotation(s, g, t)), rotate(bloch(s), rotationAxes[g], t), 1e-12, `${g}(${t})`);
      }
    });

    test(`${g}(θ) leaves the coordinate along its own axis unchanged`, () => {
      const r = rng(22), k = {Rx: 'x', Ry: 'y', Rz: 'z'}[g];
      for (let i = 0; i < 200; i++) {
        const s = randomState(r);
        assertClose(bloch(applyRotation(s, g, r() * 2 * PI))[k], bloch(s)[k], 1e-13);
      }
    });
  }

  test('right-hand rule at a quarter turn: Rx: +Z → −Y, Ry: +Z → +X, Rz: +X → +Y', () => {
    assertVectorClose(bloch(applyRotation(ket0, 'Rx', PI / 2)), {x: 0, y: -1, z: 0}, 1e-15);
    assertVectorClose(bloch(applyRotation(ket0, 'Ry', PI / 2)), {x: 1, y: 0, z: 0}, 1e-15);
    assertVectorClose(bloch(applyRotation(plus, 'Rz', PI / 2)), {x: 0, y: 1, z: 0}, 1e-15);
  });

  test('states on the rotation axis do not move (only a global phase changes)', () => {
    for (const t of THETAS) {
      for (const [g, s] of [['Rz', ket0], ['Rz', ket1], ['Rx', plus], ['Ry', [C(R), C(0, R)]]]) {
        const out = applyRotation(s, g, t);
        assertVectorClose(bloch(out), bloch(s), 1e-14, `${g}(${t})`);
        assert.ok(globalPhaseFactor(s, out), `${g}(${t}) should differ by a global phase only`);
      }
    }
  });

  test('the drawn rotation path (rotateAbout) ends exactly where the state lands', () => {
    const r = rng(23);
    for (let i = 0; i < 100; i++) {
      const s = randomState(r), g = ROTATIONS[i % 3], t = r() * 2 * PI;
      assertVectorClose(rotateAbout(bloch(s), rotationAxes[g], t), bloch(applyRotation(s, g, t)), 1e-12);
    }
  });
});

describe('fixed gates are rotations up to global phase', () => {
  const cases = [['Rx', PI, 'X', C(0, -1)], ['Ry', PI, 'Y', C(0, -1)], ['Rz', PI, 'Z', C(0, -1)], ['Rz', PI / 2, 'S', cis(-PI / 4)], ['Rz', PI / 4, 'T', cis(-PI / 8)]];
  for (const [g, t, fixed, phase] of cases) {
    test(`${g}(${t.toFixed(4)}) = phase × ${fixed}, not equal to ${fixed}`, () => {
      assertMatrixClose(rotationMatrix(g, t), scaled(gates[fixed], phase), 1e-15);
      assert.ok(Math.abs(phase.re - 1) > 0.1 || Math.abs(phase.im) > 0.1, 'phase is nontrivial');
      const r = rng(31);
      for (let i = 0; i < 50; i++) {
        const s = randomState(r);
        assertVectorClose(bloch(applyRotation(s, g, t)), bloch(applyGate(s, fixed)), 1e-13);
      }
    });
  }

  test('the Bloch rotation angle in gate-info agrees: X, Y, Z, S, T are R(angle) up to phase', () => {
    const axisGate = {X: 'Rx', Y: 'Ry', Z: 'Rz', S: 'Rz', T: 'Rz'};
    for (const [fixed, g] of Object.entries(axisGate)) {
      const U = rotationMatrix(g, gateInfo[fixed].angle), V = gates[fixed];
      // V = c U with |c| = 1: compare against the entry of largest modulus.
      const [i, j] = abs2(V[0][0]) > 0.1 ? [0, 0] : [0, 1], c = mul(V[i][j], C(U[i][j].re, -U[i][j].im));
      assertMatrixClose(scaled(U, c), V, 1e-14, fixed);
    }
  });
});

describe('2π rotations', () => {
  for (const g of ROTATIONS) {
    test(`${g}(2π) = −I exactly (as a matrix), and ${g}(4π) = I`, () => {
      assertMatrixClose(rotationMatrix(g, 2 * PI), negI, 0, `${g}(2π)`);
      assertMatrixClose(rotationMatrix(g, deg(360)), negI, 0, `${g}(360°)`);
      assertMatrixClose(rotationMatrix(g, 4 * PI), I2, 0, `${g}(4π)`);
      assertMatrixClose(rotationMatrix(g, deg(720)), I2, 0, `${g}(720°)`);
    });

    test(`${g}(2π)|ψ⟩ = −|ψ⟩: physically equivalent to |ψ⟩ (global phase π)`, () => {
      const r = rng(41);
      for (let i = 0; i < 200; i++) {
        const s = randomState(r), out = applyRotation(s, g, 2 * PI);
        assertStateClose(out, s.map((a) => mul(C(-1), a)), 1e-15);
        assertVectorClose(bloch(out), bloch(s), 1e-15);
        assertClose(probabilities(out)[0], probabilities(s)[0], 1e-15);
        assertComplexClose(globalPhaseFactor(s, out), C(-1), 1e-14);
      }
    });
  }
});

describe('numerical stability at boundary angles', () => {
  const isExactZero = (a) => Object.is(a.re + 0, 0) && Object.is(a.im + 0, 0);

  test('0° gives exactly I', () => {
    for (const g of ROTATIONS) assertMatrixClose(rotationMatrix(g, 0), I2, 0, g);
  });

  test('degree presets produce exact entries with no 6.1e-17 residues', () => {
    // 180°: cos(π/2) and 360°: sin(π) are exact zeros, not floating-point residue.
    assertMatrixClose(rotationMatrix('Rx', deg(180)), [[C(0), C(0, -1)], [C(0, -1), C(0)]], 0);
    assertMatrixClose(rotationMatrix('Ry', deg(180)), [[C(0), C(-1)], [C(1), C(0)]], 0);
    assertMatrixClose(rotationMatrix('Rz', deg(180)), [[C(0, -1), C(0)], [C(0), C(0, 1)]], 0);
    assertMatrixClose(rotationMatrix('Ry', deg(90)), [[C(R), C(-R)], [C(R), C(R)]], 0);
    assertMatrixClose(rotationMatrix('Ry', deg(270)), [[C(-R), C(-R)], [C(R), C(-R)]], 0);
    for (const d of [180, 360, 540, 720]) for (const g of ROTATIONS) {
      for (const row of rotationMatrix(g, deg(d))) for (const a of row) {
        for (const v of [a.re, a.im]) assert.ok(v === 0 || Math.abs(Math.abs(v) - 1) === 0, `${g}(${d}°) entry ${v}`);
      }
    }
  });

  test('Ry(180°)|0⟩ has α exactly 0 and Rx(180°)|0⟩ has β exactly −i', () => {
    const [a] = applyRotation(ket0, 'Ry', deg(180));
    assert.ok(isExactZero(a), JSON.stringify(a));
    const out = applyRotation(ket0, 'Rx', deg(180));
    assert.ok(isExactZero(out[0]) && out[1].re === 0 && out[1].im === -1);
  });

  test('halfAngle snaps only near nonzero multiples of π/4', () => {
    assert.deepEqual(halfAngle(PI), {c: 0, s: 1});
    assert.deepEqual(halfAngle(2 * PI), {c: -1, s: 0});
    assert.deepEqual(halfAngle(-PI), {c: 0, s: -1});
    assert.deepEqual(halfAngle(PI / 2), {c: R, s: R});
    // Not snapped: ordinary angles keep full Math.cos / Math.sin precision.
    assert.deepEqual(halfAngle(1), {c: Math.cos(0.5), s: Math.sin(0.5)});
    assert.deepEqual(halfAngle(PI + 1e-6), {c: Math.cos((PI + 1e-6) / 2), s: Math.sin((PI + 1e-6) / 2)});
  });

  test('very small θ: the state moves by θ/2 and is never snapped to zero', () => {
    for (const t of [1e-6, 1e-10, 1e-15, 1e-300]) {
      const out = applyRotation(ket0, 'Ry', t);
      assert.ok(out[1].re > 0, `θ=${t}: β must be positive, got ${out[1].re}`);
      assertClose(out[1].re / (t / 2), 1, 1e-9, `θ=${t}`);
      assertClose(norm2(out), 1, 1e-15);
    }
  });

  test('negative angles rotate the other way: R(−θ) undoes R(θ)', () => {
    const r = rng(51);
    for (let i = 0; i < 200; i++) {
      const s = randomState(r), g = ROTATIONS[i % 3], t = r() * 2 * PI;
      assertStateClose(applyRotation(applyRotation(s, g, t), g, -t), s, 1e-14);
    }
    assertVectorClose(bloch(applyRotation(ket0, 'Ry', -PI / 2)), {x: -1, y: 0, z: 0}, 1e-15);
  });

  test('720° (4π) returns the exact state vector, not just the physical state', () => {
    const r = rng(52);
    for (let i = 0; i < 100; i++) {
      const s = randomState(r);
      for (const g of ROTATIONS) assertStateClose(applyRotation(s, g, deg(720)), s, 1e-15);
    }
  });
});

describe('global phase helpers', () => {
  test('inner product ⟨u|v⟩', () => {
    assertComplexClose(inner(ket0, ket0), C(1), 0);
    assertComplexClose(inner(ket0, ket1), C(0), 0);
    assertComplexClose(inner([C(R), C(0, R)], plus), C(0.5, -0.5), 1e-15);
  });

  test('globalPhaseFactor finds e^{iγ} with v = e^{iγ} u, and rejects different states', () => {
    const r = rng(61);
    for (let i = 0; i < 200; i++) {
      const s = randomState(r), g = r() * 2 * PI, v = s.map((a) => mul(cis(g), a));
      const f = globalPhaseFactor(s, v);
      assertComplexClose(f, cis(g), 1e-13);
      assertStateClose(s.map((a) => mul(f, a)), v, 1e-13);
    }
    assert.equal(globalPhaseFactor(ket0, plus), null);
    assert.equal(globalPhaseFactor(plus, [C(R), C(0, R)]), null);
  });
});
