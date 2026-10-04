import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {C, mul, abs2, initial, basisState, gates, applyGate, canonical, fromAngles, bloch, angles, probabilities, measure} from '../quantum.js';
import {EPS, cis, norm2, rng, randomState, matMul, dagger, I2, rotate, assertClose, assertComplexClose, assertStateClose, assertVectorClose, assertMatrixClose} from './helpers.js';

const R = Math.SQRT1_2;
const GATE_NAMES = ['X', 'Y', 'Z', 'H', 'S', 'T'];
const ket0 = [C(1), C(0)];
const ket1 = [C(0), C(1)];
const plus = [C(R), C(R)];
const minus = [C(R), C(-R)];
const plusI = [C(R), C(0, R)];
const minusI = [C(R), C(0, -R)];
const run = (state, sequence) => sequence.reduce((s, g) => applyGate(s, g), state);
const withGlobalPhase = (state, gamma) => state.map((a) => mul(cis(gamma), a));

describe('gate matrices', () => {
  // Textbook definitions (Nielsen & Chuang). Regression: any edit to a matrix entry fails here.
  const expected = {
    X: [[C(0), C(1)], [C(1), C(0)]],
    Y: [[C(0), C(0, -1)], [C(0, 1), C(0)]],
    Z: [[C(1), C(0)], [C(0), C(-1)]],
    H: [[C(R), C(R)], [C(R), C(-R)]],
    S: [[C(1), C(0)], [C(0), C(0, 1)]],
    T: [[C(1), C(0)], [C(0), cis(Math.PI / 4)]],
  };

  test('exactly the six supported gates are defined', () => {
    assert.deepEqual(Object.keys(gates).sort(), [...GATE_NAMES].sort());
  });

  for (const name of GATE_NAMES) {
    test(`${name} matches its textbook matrix`, () => assertMatrixClose(gates[name], expected[name], EPS, name));
    test(`${name} is unitary (U U† = U† U = I)`, () => {
      assertMatrixClose(matMul(gates[name], dagger(gates[name])), I2, EPS, `${name} U U†`);
      assertMatrixClose(matMul(dagger(gates[name]), gates[name]), I2, EPS, `${name} U† U`);
    });
  }

  test('unknown gate name throws', () => {
    assert.throws(() => applyGate(initial(), 'Q'), /Unsupported gate Q/);
  });
});

describe('gate action on basis states', () => {
  const cases = [
    ['X', ket0, ket1], ['X', ket1, ket0],
    ['Y', ket0, [C(0), C(0, 1)]], ['Y', ket1, [C(0, -1), C(0)]],
    ['Z', ket0, ket0], ['Z', ket1, [C(0), C(-1)]],
    ['H', ket0, plus], ['H', ket1, minus],
    ['S', ket0, ket0], ['S', ket1, [C(0), C(0, 1)]],
    ['T', ket0, ket0], ['T', ket1, [C(0), cis(Math.PI / 4)]],
  ];
  for (const [gate, input, output] of cases) {
    test(`${gate}|${input === ket0 ? 0 : 1}⟩ (exact amplitudes, including phase)`, () => assertStateClose(applyGate(input, gate), output));
  }
});

describe('algebraic identities (exact, not just up to phase)', () => {
  const product = (...names) => names.reduce((M, n) => matMul(M, gates[n]), I2);
  const scaled = (M, c) => M.map((row) => row.map((a) => mul(c, a)));
  const cases = {
    'X² = I': [product('X', 'X'), I2],
    'Y² = I': [product('Y', 'Y'), I2],
    'Z² = I': [product('Z', 'Z'), I2],
    'H² = I': [product('H', 'H'), I2],
    'S² = Z': [product('S', 'S'), gates.Z],
    'T² = S': [product('T', 'T'), gates.S],
    'T⁸ = I': [product('T', 'T', 'T', 'T', 'T', 'T', 'T', 'T'), I2],
    'XY = iZ': [product('X', 'Y'), scaled(gates.Z, C(0, 1))],
    'YZ = iX': [product('Y', 'Z'), scaled(gates.X, C(0, 1))],
    'ZX = iY': [product('Z', 'X'), scaled(gates.Y, C(0, 1))],
    'HXH = Z': [product('H', 'X', 'H'), gates.Z],
    'HZH = X': [product('H', 'Z', 'H'), gates.X],
    'HYH = −Y': [product('H', 'Y', 'H'), scaled(gates.Y, C(-1))],
  };
  for (const [name, [actual, expected]] of Object.entries(cases)) test(name, () => assertMatrixClose(actual, expected, 1e-12, name));
});

describe('normalization', () => {
  test('initial state is |0⟩ and normalized', () => {
    assertStateClose(initial(), ket0, 0);
    assert.equal(norm2(initial()), 1);
  });

  test('fromAngles produces normalized states across the sphere', () => {
    for (let t = 0; t <= 180; t += 5) for (let p = 0; p <= 360; p += 15) {
      assertClose(norm2(fromAngles(t * Math.PI / 180, p * Math.PI / 180)), 1, 1e-14, `θ=${t} φ=${p}`);
    }
  });

  test('every gate preserves the norm', () => {
    const random = rng(1);
    for (let i = 0; i < 500; i++) {
      const state = randomState(random);
      for (const g of GATE_NAMES) assertClose(norm2(applyGate(state, g)), 1, 1e-14, g);
    }
  });

  test('norm does not drift over 100 000 random gates (with canonicalization, as in the app)', () => {
    const random = rng(2);
    let state = initial();
    for (let i = 0; i < 100000; i++) state = canonical(applyGate(state, GATE_NAMES[Math.floor(random() * 6)]));
    assertClose(norm2(state), 1, 1e-9);
  });

  test('canonical preserves the norm', () => {
    const random = rng(3);
    for (let i = 0; i < 500; i++) assertClose(norm2(canonical(randomState(random))), 1, 1e-14);
  });
});

describe('exact basis states', () => {
  const isExactZero = (a) => a.re === 0 && a.im === 0;

  test('fromAngles(π, φ) has α exactly 0 for any φ', () => {
    for (let p = 0; p <= 360; p += 15) {
      const state = fromAngles(Math.PI, p * Math.PI / 180);
      assert.ok(isExactZero(state[0]), `φ=${p}: α = ${JSON.stringify(state[0])}`);
      assertClose(abs2(state[1]), 1, 1e-15);
    }
  });

  test('fromAngles(π, 0) is exactly |1⟩', () => {
    const [a, b] = fromAngles(Math.PI, 0);
    assert.ok(isExactZero(a));
    assert.ok(b.re === 1 && b.im === 0);
  });

  test('slider value θ = 180° (degrees → radians) is exactly |1⟩', () => {
    const [a, b] = fromAngles(180 * Math.PI / 180, 0);
    assert.ok(isExactZero(a) && b.re === 1 && b.im === 0);
  });

  test('fromAngles(0, φ) is exactly |0⟩ for any φ', () => {
    for (let p = 0; p <= 360; p += 15) {
      const [a, b] = fromAngles(0, p * Math.PI / 180);
      assert.ok(a.re === 1 && a.im === 0 && isExactZero(b), `φ=${p}`);
    }
  });

  test('equatorial states at φ = 90°, 180°, 270° have no floating-point residue', () => {
    assert.equal(fromAngles(Math.PI / 2, Math.PI / 2)[1].re, 0);
    assert.equal(fromAngles(Math.PI / 2, Math.PI)[1].im, 0);
    assert.equal(fromAngles(Math.PI / 2, 3 * Math.PI / 2)[1].re, 0);
  });

  test('basisState returns exact |0⟩ and |1⟩', () => {
    assertStateClose(basisState(0), ket0, 0);
    assertStateClose(basisState(1), ket1, 0);
  });
});

describe('Bloch coordinates', () => {
  const cardinal = [
    ['|0⟩', ket0, {x: 0, y: 0, z: 1}],
    ['|1⟩', ket1, {x: 0, y: 0, z: -1}],
    ['|+⟩', plus, {x: 1, y: 0, z: 0}],
    ['|−⟩', minus, {x: -1, y: 0, z: 0}],
    ['|+i⟩', plusI, {x: 0, y: 1, z: 0}],
    ['|−i⟩', minusI, {x: 0, y: -1, z: 0}],
  ];
  for (const [name, state, vector] of cardinal) test(`${name} → (${vector.x}, ${vector.y}, ${vector.z})`, () => assertVectorClose(bloch(state), vector));

  test('fromAngles(θ, φ) maps to (sinθ cosφ, sinθ sinφ, cosθ)', () => {
    const random = rng(4);
    for (let i = 0; i < 1000; i++) {
      const t = random() * Math.PI, p = random() * 2 * Math.PI;
      assertVectorClose(bloch(fromAngles(t, p)), {x: Math.sin(t) * Math.cos(p), y: Math.sin(t) * Math.sin(p), z: Math.cos(t)}, 1e-12);
    }
  });

  test('pure states lie on the unit sphere', () => {
    const random = rng(5);
    for (let i = 0; i < 1000; i++) {
      const {x, y, z} = bloch(randomState(random));
      assertClose(x * x + y * y + z * z, 1, 1e-12);
    }
  });

  test('angles() inverts fromAngles() away from the poles', () => {
    const random = rng(6);
    for (let i = 0; i < 1000; i++) {
      const t = 0.01 + random() * (Math.PI - 0.02), p = random() * 2 * Math.PI * 0.999;
      const a = angles(fromAngles(t, p));
      assertClose(a.theta, t, 1e-9, 'θ');
      assertClose(a.phi, p, 1e-9, 'φ');
    }
  });

  test('angles() keeps φ in [0, 2π) and θ in [0, π]', () => {
    const random = rng(7);
    for (let i = 0; i < 1000; i++) {
      const {theta, phi} = angles(randomState(random));
      assert.ok(theta >= 0 && theta <= Math.PI && phi >= 0 && phi < 2 * Math.PI);
    }
  });

  // Each gate is a rotation of the Bloch sphere obeying the right-hand rule.
  const rotations = {
    X: [[1, 0, 0], Math.PI],
    Y: [[0, 1, 0], Math.PI],
    Z: [[0, 0, 1], Math.PI],
    H: [[R, 0, R], Math.PI],
    S: [[0, 0, 1], Math.PI / 2],
    T: [[0, 0, 1], Math.PI / 4],
  };
  for (const [gate, [axis, angle]] of Object.entries(rotations)) {
    test(`${gate} rotates the Bloch vector by ${(angle * 180 / Math.PI).toFixed(0)}° about (${axis.map((v) => v.toFixed(3)).join(', ')})`, () => {
      const random = rng(8);
      for (let i = 0; i < 300; i++) {
        const state = randomState(random);
        assertVectorClose(bloch(applyGate(state, gate)), rotate(bloch(state), axis, angle), 1e-12, gate);
      }
    });
  }
});

describe('measurement probabilities', () => {
  test('cardinal states', () => {
    assert.deepEqual(probabilities(ket0), [1, 0]);
    assert.deepEqual(probabilities(ket1), [0, 1]);
    for (const s of [plus, minus, plusI, minusI]) {
      const [p0, p1] = probabilities(s);
      assertClose(p0, 0.5, 1e-15);
      assertClose(p1, 0.5, 1e-15);
    }
  });

  test('P(0) = cos²(θ/2) and P(1) = sin²(θ/2), independent of φ', () => {
    const random = rng(9);
    for (let i = 0; i < 1000; i++) {
      const t = random() * Math.PI, p = random() * 2 * Math.PI;
      const [p0, p1] = probabilities(fromAngles(t, p));
      assertClose(p0, Math.cos(t / 2) ** 2, 1e-14);
      assertClose(p1, Math.sin(t / 2) ** 2, 1e-14);
    }
  });

  test('P(0) = (1 + z) / 2 links probabilities to the Bloch vector', () => {
    const random = rng(10);
    for (let i = 0; i < 1000; i++) {
      const s = randomState(random);
      assertClose(probabilities(s)[0], (1 + bloch(s).z) / 2, 1e-14);
    }
  });

  test('Z, S and T never change measurement probabilities (phase gates)', () => {
    const random = rng(11);
    for (let i = 0; i < 300; i++) {
      const s = randomState(random), before = probabilities(s);
      for (const g of ['Z', 'S', 'T']) {
        const after = probabilities(applyGate(s, g));
        assertClose(after[0], before[0], 1e-14, g);
      }
    }
  });

  test('measure() picks outcome 0 exactly when the sample is below P(0)', () => {
    const s = fromAngles(Math.PI / 3, 0.4), [p0] = probabilities(s);
    assert.equal(measure(s, 0).outcome, 0);
    assert.equal(measure(s, p0 - 1e-9).outcome, 0);
    assert.equal(measure(s, p0 + 1e-9).outcome, 1);
    assert.equal(measure(s, 0.999999).outcome, 1);
  });

  test('measure() collapses to the exact basis state of the outcome', () => {
    const s = fromAngles(1.1, 2.2);
    assertStateClose(measure(s, 0).state, ket0, 0);
    assertStateClose(measure(s, 0.999999).state, ket1, 0);
  });

  test('basis states are measured deterministically and repeat measurement is stable', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
      assert.equal(measure(ket0, r).outcome, 0);
      assert.equal(measure(ket1, r).outcome, 1);
    }
    const first = measure(plus, 0.3);
    for (const r of [0, 0.5, 0.999999]) assert.equal(measure(first.state, r).outcome, first.outcome);
  });

  test('outcome frequencies match the Born rule (seeded, 20 000 shots, within 5σ)', () => {
    const random = rng(12), shots = 20000;
    for (const t of [Math.PI / 6, Math.PI / 2, 2 * Math.PI / 3]) {
      const s = fromAngles(t, 1), [p0] = probabilities(s);
      let zeros = 0;
      for (let i = 0; i < shots; i++) if (measure(s, random()).outcome === 0) zeros++;
      const sigma = Math.sqrt(p0 * (1 - p0) / shots);
      assert.ok(Math.abs(zeros / shots - p0) < 5 * sigma, `θ=${t}: observed ${zeros / shots}, expected ${p0}`);
    }
  });
});

describe('global phase invariance', () => {
  const phases = [0.3, Math.PI / 2, Math.PI, -2.1, 5.9];

  test('Bloch vector is unchanged by a global phase', () => {
    const random = rng(13);
    for (let i = 0; i < 300; i++) {
      const s = randomState(random);
      for (const g of phases) assertVectorClose(bloch(withGlobalPhase(s, g)), bloch(s), 1e-12);
    }
  });

  test('probabilities are unchanged by a global phase', () => {
    const random = rng(14);
    for (let i = 0; i < 300; i++) {
      const s = randomState(random), [p0] = probabilities(s);
      for (const g of phases) assertClose(probabilities(withGlobalPhase(s, g))[0], p0, 1e-14);
    }
  });

  test('canonical() gives the same representative for every global phase', () => {
    const random = rng(15);
    for (let i = 0; i < 300; i++) {
      const s = randomState(random), ref = canonical(s);
      for (const g of phases) assertStateClose(canonical(withGlobalPhase(s, g)), ref, 1e-12);
    }
  });

  test('canonical() makes α real and non-negative, and keeps the Bloch vector', () => {
    const random = rng(16);
    for (let i = 0; i < 300; i++) {
      const s = withGlobalPhase(randomState(random), random() * 6), c = canonical(s);
      assertClose(c[0].im, 0, 1e-15);
      assert.ok(c[0].re >= 0);
      assertVectorClose(bloch(c), bloch(s), 1e-12);
    }
  });

  test('canonical() makes β real and positive when α = 0', () => {
    for (const g of phases) {
      const c = canonical(withGlobalPhase(ket1, g));
      assertComplexClose(c[0], C(0), 1e-15);
      assertComplexClose(c[1], C(1), 1e-15);
    }
  });

  test('gates commute with a global phase', () => {
    const random = rng(17);
    for (let i = 0; i < 100; i++) {
      const s = randomState(random);
      for (const gate of GATE_NAMES) {
        assertStateClose(applyGate(withGlobalPhase(s, 0.7), gate), withGlobalPhase(applyGate(s, gate), 0.7), 1e-12, gate);
      }
    }
  });
});

describe('regression: golden gate sequences from |0⟩', () => {
  // Canonical amplitudes (global phase removed) and Bloch vectors for sequences used in teaching.
  // If any of these change, the physics shown to students has changed.
  const c45 = Math.cos(Math.PI / 4) * R;
  const golden = [
    {seq: [], state: ket0, vector: {x: 0, y: 0, z: 1}},
    {seq: ['X'], state: ket1, vector: {x: 0, y: 0, z: -1}},
    {seq: ['Y'], state: ket1, vector: {x: 0, y: 0, z: -1}},
    {seq: ['H'], state: plus, vector: {x: 1, y: 0, z: 0}},
    {seq: ['X', 'H'], state: minus, vector: {x: -1, y: 0, z: 0}},
    {seq: ['H', 'Z'], state: minus, vector: {x: -1, y: 0, z: 0}},
    {seq: ['H', 'S'], state: plusI, vector: {x: 0, y: 1, z: 0}},
    {seq: ['H', 'T', 'T'], state: plusI, vector: {x: 0, y: 1, z: 0}},
    {seq: ['H', 'S', 'S', 'S'], state: minusI, vector: {x: 0, y: -1, z: 0}},
    {seq: ['H', 'T'], state: [C(R), C(c45, c45)], vector: {x: R, y: R, z: 0}},
    {seq: ['H', 'S', 'H'], state: minusI, vector: {x: 0, y: -1, z: 0}},
    {seq: ['H', 'Z', 'H'], state: ket1, vector: {x: 0, y: 0, z: -1}},
    {seq: ['H', 'H'], state: ket0, vector: {x: 0, y: 0, z: 1}},
  ];
  for (const {seq, state, vector} of golden) {
    const label = seq.length ? seq.join(' → ') : '(no gates)';
    test(label, () => {
      const result = canonical(run(initial(), seq));
      assertStateClose(result, state, 1e-12, label);
      assertVectorClose(bloch(result), vector, 1e-12, label);
    });
  }

  test('lesson text claim: H → S and H → T → T both reach +Y', () => {
    assertVectorClose(bloch(run(initial(), ['H', 'S'])), {x: 0, y: 1, z: 0}, 1e-12);
    assertVectorClose(bloch(run(initial(), ['H', 'T', 'T'])), {x: 0, y: 1, z: 0}, 1e-12);
  });

  test('applying T eight times returns to the starting Bloch vector after H', () => {
    const start = run(initial(), ['H']);
    assertVectorClose(bloch(run(start, Array(8).fill('T'))), bloch(start), 1e-12);
  });
});
