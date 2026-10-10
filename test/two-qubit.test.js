import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {C, mul, gates, applyGate} from '../quantum.js';
import {rotationMatrix, applyRotation, ROTATIONS} from '../rotations.js';
import {identity, kron, kronVector, matMul, dagger, matVec, fromReal, outer, trace, innerN} from '../tensor.js';
import {BASIS, bitOf, indexOf, basis2, initial2, norm2, probabilities2, product, singleQubitOperator, applyOperator, qubitProbability, projectQubit, measureQubit, measureBoth} from '../multi-qubit.js';
import {controlled, SWAP, P0, P1, twoQubitGates, twoQubitMatrix} from '../controlled-gates.js';
import {rng, randomState, assertClose, assertComplexClose, cis, assertMatrixCloseN, assertState4Close, randomState2} from './helpers.js';

const R = Math.SQRT1_2;
const I2 = identity(2), I4 = identity(4);
const SINGLE = ['X', 'Y', 'Z', 'H', 'S', 'T'];
const ket = {'0': [C(1), C(0)], '1': [C(0), C(1)], '+': [C(R), C(R)], '-': [C(R), C(-R)]};

describe('two-qubit state representation', () => {
  test('initial state is |00⟩ = (1, 0, 0, 0) and normalized', () => {
    assert.deepEqual(initial2(), [C(1), C(0), C(0), C(0)]);
    assert.equal(norm2(initial2()), 1);
  });

  test('basis ordering is |00⟩, |01⟩, |10⟩, |11⟩ with index k = 2·q0 + q1', () => {
    assert.deepEqual(BASIS, ['00', '01', '10', '11']);
    for (let k = 0; k < 4; k++) {
      assert.equal(`${bitOf(k, 0)}${bitOf(k, 1)}`, BASIS[k]);
      assert.equal(indexOf(bitOf(k, 0), bitOf(k, 1)), k);
      assert.equal(probabilities2(basis2(k))[k], 1);
    }
  });

  test('|a⟩ ⊗ |b⟩ puts a on q0 (the left label): |1⟩ ⊗ |0⟩ = |10⟩', () => {
    assert.deepEqual(product(ket['1'], ket['0']), basis2(2));
    assert.deepEqual(product(ket['0'], ket['1']), basis2(1));
  });

  test('products of normalized states are normalized; random states stay normalized under every gate', () => {
    const r = rng(201);
    for (let i = 0; i < 200; i++) {
      assertClose(norm2(product(randomState(r), randomState(r))), 1, 1e-14);
      let s = randomState2(r);
      for (const g of SINGLE) for (const q of [0, 1]) s = applyOperator(s, singleQubitOperator(gates[g], q));
      for (const g of Object.keys(twoQubitGates)) s = applyOperator(s, twoQubitMatrix(g, 0, 1));
      s = applyOperator(s, twoQubitMatrix('CNOT', 1, 0));
      assertClose(norm2(s), 1, 1e-13);
    }
  });
});

describe('tensor products', () => {
  test('kron of 2×2 matrices matches the block definition', () => {
    const r = rng(202);
    for (let n = 0; n < 50; n++) {
      const A = [[C(r(), r()), C(r(), r())], [C(r(), r()), C(r(), r())]], B = [[C(r(), r()), C(r(), r())], [C(r(), r()), C(r(), r())]];
      const K = kron(A, B);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) for (let l = 0; l < 2; l++) {
        assertComplexClose(K[2 * i + k][2 * j + l], mul(A[i][j], B[k][l]), 1e-15);
      }
    }
  });

  test('(A ⊗ B)(a ⊗ b) = (Aa) ⊗ (Bb)', () => {
    const r = rng(203);
    for (let i = 0; i < 100; i++) {
      const a = randomState(r), b = randomState(r), A = gates[SINGLE[i % 6]], B = rotationMatrix(ROTATIONS[i % 3], r() * 7);
      assertState4Close(matVec(kron(A, B), kronVector(a, b)), kronVector(matVec(A, a), matVec(B, b)), 1e-14);
    }
  });

  for (const g of SINGLE) {
    test(`${g} on q0 is ${g} ⊗ I, on q1 is I ⊗ ${g}, and acts only on that qubit`, () => {
      assertMatrixCloseN(singleQubitOperator(gates[g], 0), kron(gates[g], I2), 0);
      assertMatrixCloseN(singleQubitOperator(gates[g], 1), kron(I2, gates[g]), 0);
      const r = rng(204);
      for (let i = 0; i < 50; i++) {
        const a = randomState(r), b = randomState(r);
        assertState4Close(applyOperator(product(a, b), singleQubitOperator(gates[g], 0)), product(applyGate(a, g), b), 1e-14);
        assertState4Close(applyOperator(product(a, b), singleQubitOperator(gates[g], 1)), product(a, applyGate(b, g)), 1e-14);
      }
    });
  }

  test('explicit 4×4 matrices: X ⊗ I and I ⊗ X', () => {
    assertMatrixCloseN(singleQubitOperator(gates.X, 0), fromReal([[0, 0, 1, 0], [0, 0, 0, 1], [1, 0, 0, 0], [0, 1, 0, 0]]), 0);
    assertMatrixCloseN(singleQubitOperator(gates.X, 1), fromReal([[0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0]]), 0);
  });

  test('X on q0 maps |00⟩ → |10⟩; X on q1 maps |00⟩ → |01⟩', () => {
    assert.deepEqual(probabilities2(applyOperator(initial2(), singleQubitOperator(gates.X, 0))), [0, 0, 1, 0]);
    assert.deepEqual(probabilities2(applyOperator(initial2(), singleQubitOperator(gates.X, 1))), [0, 1, 0, 0]);
  });

  test('rotations on either qubit match the single-qubit rotation on that factor', () => {
    const r = rng(205);
    for (let i = 0; i < 100; i++) {
      const a = randomState(r), b = randomState(r), g = ROTATIONS[i % 3], t = (r() - 0.5) * 4 * Math.PI;
      assertState4Close(applyOperator(product(a, b), singleQubitOperator(rotationMatrix(g, t), 0)), product(applyRotation(a, g, t), b), 1e-14);
      assertState4Close(applyOperator(product(a, b), singleQubitOperator(rotationMatrix(g, t), 1)), product(a, applyRotation(b, g, t)), 1e-14);
    }
  });

  test('operators on different qubits commute: (U ⊗ I)(I ⊗ V) = U ⊗ V', () => {
    for (const u of SINGLE) for (const v of SINGLE) {
      const UI = singleQubitOperator(gates[u], 0), IV = singleQubitOperator(gates[v], 1);
      assertMatrixCloseN(matMul(UI, IV), kron(gates[u], gates[v]), 1e-15);
      assertMatrixCloseN(matMul(IV, UI), kron(gates[u], gates[v]), 1e-15);
    }
  });

  test('invalid target qubits are rejected', () => {
    for (const q of [2, -1, '0', null]) assert.throws(() => singleQubitOperator(gates.H, q), /Qubit must be 0 or 1/);
  });
});

describe('CNOT', () => {
  const map = (M) => [0, 1, 2, 3].map((k) => applyOperator(basis2(k), M).findIndex((a) => a.re === 1 && a.im === 0));

  test('control q0 → target q1: |00⟩→|00⟩, |01⟩→|01⟩, |10⟩→|11⟩, |11⟩→|10⟩ (exactly)', () => {
    assert.deepEqual(map(twoQubitMatrix('CNOT', 0, 1)), [0, 1, 3, 2]);
  });

  test('control q1 → target q0: |00⟩→|00⟩, |01⟩→|11⟩, |10⟩→|10⟩, |11⟩→|01⟩ (exactly)', () => {
    assert.deepEqual(map(twoQubitMatrix('CNOT', 1, 0)), [0, 3, 2, 1]);
  });

  test('matches the textbook 4×4 matrices', () => {
    assertMatrixCloseN(twoQubitMatrix('CNOT', 0, 1), fromReal([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0]]), 0);
    assertMatrixCloseN(twoQubitMatrix('CNOT', 1, 0), fromReal([[1, 0, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0], [0, 1, 0, 0]]), 0);
  });

  test('reversing control and target equals conjugating by H ⊗ H', () => {
    const HH = kron(gates.H, gates.H);
    assertMatrixCloseN(matMul(HH, matMul(twoQubitMatrix('CNOT', 0, 1), HH)), twoQubitMatrix('CNOT', 1, 0), 1e-15);
  });

  test('three alternating CNOTs make a SWAP', () => {
    const a = twoQubitMatrix('CNOT', 0, 1), b = twoQubitMatrix('CNOT', 1, 0);
    assertMatrixCloseN(matMul(a, matMul(b, a)), SWAP, 0);
  });

  test('CNOT is its own inverse', () => {
    for (const [c, t] of [[0, 1], [1, 0]]) assertMatrixCloseN(matMul(twoQubitMatrix('CNOT', c, t), twoQubitMatrix('CNOT', c, t)), I4, 0);
  });

  test('controlled() rejects equal or invalid qubits', () => {
    assert.throws(() => controlled(gates.X, 0, 0), /different qubits/);
    assert.throws(() => controlled(gates.X, 1, 2), /different qubits/);
    assert.throws(() => twoQubitMatrix('CQ'), /Unsupported two-qubit gate/);
  });

  test('controlled(U) is |0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ U for any U (future controlled gates)', () => {
    const U = rotationMatrix('Ry', 0.7);
    const M = controlled(U, 0, 1);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      assertComplexClose(M[i][j], I2[i][j], 0);
      assertComplexClose(M[2 + i][2 + j], U[i][j], 0);
      assertComplexClose(M[i][2 + j], C(0), 0);
      assertComplexClose(M[2 + i][j], C(0), 0);
    }
    assertMatrixCloseN(controlled(gates.X, 0, 1), kron(P0, I2).map((row, i) => row.map((a, j) => C(a.re + kron(P1, gates.X)[i][j].re, 0))), 0);
  });
});

describe('CZ', () => {
  test('flips the sign of |11⟩ only', () => {
    for (let k = 0; k < 4; k++) {
      const out = applyOperator(basis2(k), twoQubitMatrix('CZ', 0, 1));
      const want = basis2(k).map((a) => (k === 3 ? C(-a.re) : a));
      assertState4Close(out, want, 0, `|${BASIS[k]}⟩`);
    }
    assertMatrixCloseN(twoQubitMatrix('CZ', 0, 1), fromReal([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, -1]]), 0);
  });

  test('is symmetric: control q0 and control q1 give the same matrix', () => {
    assertMatrixCloseN(twoQubitMatrix('CZ', 0, 1), twoQubitMatrix('CZ', 1, 0), 0);
    assert.equal(twoQubitGates.CZ.symmetric, true);
  });

  test('CZ = (I ⊗ H) CNOT (I ⊗ H)', () => {
    const IH = singleQubitOperator(gates.H, 1);
    assertMatrixCloseN(matMul(IH, matMul(twoQubitMatrix('CNOT', 0, 1), IH)), twoQubitMatrix('CZ'), 1e-15);
  });

  test('never changes measurement probabilities', () => {
    const r = rng(206);
    for (let i = 0; i < 100; i++) {
      const s = randomState2(r);
      probabilities2(applyOperator(s, twoQubitMatrix('CZ'))).forEach((p, k) => assertClose(p, probabilities2(s)[k], 1e-15));
    }
  });
});

describe('SWAP', () => {
  test('|01⟩ ↔ |10⟩ while |00⟩ and |11⟩ are unchanged', () => {
    const map = [0, 1, 2, 3].map((k) => applyOperator(basis2(k), twoQubitMatrix('SWAP')).findIndex((a) => a.re === 1));
    assert.deepEqual(map, [0, 2, 1, 3]);
  });

  test('exchanges the factors of any product state: SWAP(a ⊗ b) = b ⊗ a', () => {
    const r = rng(207);
    for (let i = 0; i < 100; i++) {
      const a = randomState(r), b = randomState(r);
      assertState4Close(applyOperator(product(a, b), SWAP), product(b, a), 1e-15);
    }
  });

  test('SWAP (U ⊗ V) SWAP = V ⊗ U', () => {
    for (const u of SINGLE) for (const v of SINGLE) assertMatrixCloseN(matMul(SWAP, matMul(kron(gates[u], gates[v]), SWAP)), kron(gates[v], gates[u]), 1e-15);
  });
});

describe('unitarity of every 4×4 gate', () => {
  const ops = [
    ...SINGLE.flatMap((g) => [0, 1].map((q) => [`${g} on q${q}`, singleQubitOperator(gates[g], q)])),
    ...ROTATIONS.flatMap((g) => [0, 1].flatMap((q) => [0.3, Math.PI / 2, Math.PI, 5].map((t) => [`${g}(${t}) on q${q}`, singleQubitOperator(rotationMatrix(g, t), q)]))),
    ['CNOT 0→1', twoQubitMatrix('CNOT', 0, 1)], ['CNOT 1→0', twoQubitMatrix('CNOT', 1, 0)],
    ['CZ', twoQubitMatrix('CZ')], ['SWAP', twoQubitMatrix('SWAP')],
  ];
  for (const [name, U] of ops) {
    test(`${name}: U†U = UU† = I`, () => {
      assertMatrixCloseN(matMul(dagger(U), U), I4, 1e-14, name);
      assertMatrixCloseN(matMul(U, dagger(U)), I4, 1e-14, name);
    });
  }
});

describe('two-qubit measurement', () => {
  const bell = [C(R), C(0), C(0), C(R)];

  test('single-qubit marginal probabilities', () => {
    assertClose(qubitProbability(bell, 0, 0), 0.5, 1e-15);
    assertClose(qubitProbability(bell, 1, 1), 0.5, 1e-15);
    assert.equal(qubitProbability(basis2(2), 0, 1), 1);
    assert.equal(qubitProbability(basis2(2), 1, 1), 0);
  });

  test('measuring q0 of |Φ+⟩ fixes q1 too: outcome 0 → |00⟩, outcome 1 → |11⟩', () => {
    assertState4Close(projectQubit(bell, 0, 0).state, basis2(0), 1e-15);
    assertState4Close(projectQubit(bell, 0, 1).state, basis2(3), 1e-15);
    assertState4Close(projectQubit(bell, 1, 1).state, basis2(3), 1e-15);
  });

  test('projection renormalizes and keeps relative amplitudes', () => {
    const r = rng(208);
    for (let i = 0; i < 100; i++) {
      const s = randomState2(r), q = i % 2, o = (i >> 1) % 2, {state, probability} = projectQubit(s, q, o);
      assertClose(norm2(state), 1, 1e-13);
      assertClose(probability, qubitProbability(s, q, o), 0);
      state.forEach((a, k) => { if (bitOf(k, q) !== o) assertComplexClose(a, C(0), 0); });
    }
  });

  test('an impossible outcome is refused', () => {
    assert.throws(() => projectQubit(basis2(0), 0, 1), /probability 0/);
  });

  test('measureQubit picks outcome 0 exactly when the sample is below P(0)', () => {
    assert.equal(measureQubit(bell, 0, 0.49).outcome, 0);
    assert.equal(measureQubit(bell, 0, 0.51).outcome, 1);
  });

  test('measureBoth samples the Born rule over |00⟩…|11⟩ and collapses to that basis state', () => {
    const s = [C(0.5), C(0, 0.5), C(-0.5), C(0.5)];
    assert.deepEqual([0.1, 0.3, 0.6, 0.9].map((x) => measureBoth(s, x).outcome), [0, 1, 2, 3]);
    assert.deepEqual(measureBoth(s, 0.6).state, basis2(2));
    const r = rng(209), counts = [0, 0, 0, 0], n = 20000;
    const t = [C(Math.sqrt(0.1)), C(Math.sqrt(0.2)), C(0, Math.sqrt(0.3)), C(-Math.sqrt(0.4))];
    for (let i = 0; i < n; i++) counts[measureBoth(t, r()).outcome]++;
    counts.forEach((c, k) => assert.ok(Math.abs(c / n - (k + 1) / 10) < 5 * Math.sqrt(0.25 / n), `|${BASIS[k]}⟩ ${c}`));
  });
});

describe('tensor helpers', () => {
  test('outer, trace and inner products', () => {
    const v = [C(R), C(0), C(0), C(0, R)];
    assertComplexClose(trace(outer(v, v)), C(1), 1e-15);
    assertComplexClose(innerN(v, v), C(1), 1e-15);
    assertComplexClose(innerN(basis2(0), v), C(R), 0);
    assertComplexClose(innerN(v, basis2(3)), C(0, -R), 0);
    assertComplexClose(cis(0), C(1), 0);
  });
});
