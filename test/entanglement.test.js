import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {C, mul, gates, bloch} from '../quantum.js';
import {rotationMatrix} from '../rotations.js';
import {kronVector, matMul, dagger, fromReal} from '../tensor.js';
import {basis2, initial2, product, singleQubitOperator, applyOperator, BASIS} from '../multi-qubit.js';
import {twoQubitMatrix} from '../controlled-gates.js';
import {densityMatrix, partialTrace, reducedDensityMatrices, blochFromDensity, purity, blochLength, reducedBlochVectors, maximallyMixed} from '../density-matrix.js';
import {concurrence, classifyEntanglement, productFactors, SEPARABLE_TOLERANCE} from '../entanglement.js';
import {circuitOf} from '../circuit.js';
import {statesOf2} from '../two-qubit-circuit.js';
import {bellStates} from '../two-qubit-experiments.js';
import {rng, randomState, assertClose, assertComplexClose, assertVectorClose, assertMatrixCloseN, assertState4Close, randomState2} from './helpers.js';

const R = Math.SQRT1_2;
const ket = {'0': [C(1), C(0)], '1': [C(0), C(1)], '+': [C(R), C(R)], '-': [C(R), C(-R)]};
const plusPlus = product(ket['+'], ket['+']);
const bell = Object.fromEntries(bellStates.map((b) => [b.id, b.state]));

describe('Bell states', () => {
  test('the four Bell states have the stated amplitudes', () => {
    assertState4Close(bell['phi-plus'], [C(R), C(0), C(0), C(R)], 0);
    assertState4Close(bell['phi-minus'], [C(R), C(0), C(0), C(-R)], 0);
    assertState4Close(bell['psi-plus'], [C(0), C(R), C(R), C(0)], 0);
    assertState4Close(bell['psi-minus'], [C(0), C(R), C(-R), C(0)], 0);
  });

  for (const b of bellStates) {
    test(`${b.name}: its recipe prepares exactly ${b.formula} from |00⟩`, () => {
      assertState4Close(statesOf2(circuitOf(b.steps)).at(-1), b.state, 0);
    });
  }

  test('the brief\'s demonstration: |00⟩ → H on q0 → CNOT(q0 → q1) → |Φ+⟩', () => {
    let s = applyOperator(initial2(), singleQubitOperator(gates.H, 0));
    assertState4Close(s, [C(R), C(0), C(R), C(0)], 0);
    s = applyOperator(s, twoQubitMatrix('CNOT', 0, 1));
    assertState4Close(s, bell['phi-plus'], 0);
  });

  test('the Bell states are orthonormal', () => {
    for (const a of bellStates) for (const b of bellStates) {
      const ip = a.state.reduce((s, x, k) => s + x.re * b.state[k].re + x.im * b.state[k].im, 0);
      assertClose(ip, a === b ? 1 : 0, 1e-15, `${a.name}·${b.name}`);
    }
  });
});

describe('concurrence', () => {
  test('C(|00⟩) = 0, C(|++⟩) = 0, C(|Φ+⟩) = 1, C(|Ψ−⟩) = 1', () => {
    assert.equal(concurrence(initial2()), 0);
    assertClose(concurrence(plusPlus), 0, 1e-15);
    assertClose(concurrence(bell['phi-plus']), 1, 1e-15);
    assertClose(concurrence(bell['psi-minus']), 1, 1e-15);
  });

  test('every Bell state is maximally entangled', () => {
    for (const b of bellStates) {
      assertClose(concurrence(b.state), 1, 1e-15, b.name);
      assert.equal(classifyEntanglement(concurrence(b.state)), 'maximally entangled');
    }
  });

  test('every product state has C = 0 and is classified separable', () => {
    const r = rng(301);
    for (let i = 0; i < 500; i++) {
      const c = concurrence(product(randomState(r), randomState(r)));
      assertClose(c, 0, 1e-14);
      assert.equal(classifyEntanglement(c), 'separable');
    }
  });

  test('cos(t)|00⟩ + sin(t)|11⟩ has C = |sin 2t| (partial entanglement)', () => {
    for (let t = 0; t <= Math.PI; t += Math.PI / 24) {
      assertClose(concurrence([C(Math.cos(t)), C(0), C(0), C(Math.sin(t))]), Math.abs(Math.sin(2 * t)), 1e-14);
    }
    assert.equal(classifyEntanglement(0.5), 'partially entangled');
  });

  test('0 ≤ C ≤ 1, and C is unchanged by local gates and by SWAP', () => {
    const r = rng(302);
    for (let i = 0; i < 300; i++) {
      const s = randomState2(r), c = concurrence(s);
      assert.ok(c >= 0 && c <= 1);
      const U = rotationMatrix('Ry', r() * 6), V = rotationMatrix('Rz', r() * 6);
      assertClose(concurrence(applyOperator(applyOperator(s, singleQubitOperator(U, 0)), singleQubitOperator(V, 1))), c, 1e-12);
      assertClose(concurrence(applyOperator(s, twoQubitMatrix('SWAP'))), c, 1e-14);
    }
  });

  test('a global phase does not change C', () => {
    const r = rng(303);
    for (let i = 0; i < 100; i++) {
      const s = randomState2(r), g = r() * 6, p = C(Math.cos(g), Math.sin(g));
      assertClose(concurrence(s.map((a) => mul(p, a))), concurrence(s), 1e-14);
    }
  });

  test('CNOT creates entanglement from |+0⟩; CZ creates it from |++⟩', () => {
    assertClose(concurrence(applyOperator(product(ket['+'], ket['0']), twoQubitMatrix('CNOT', 0, 1))), 1, 1e-15);
    const cz = applyOperator(plusPlus, twoQubitMatrix('CZ'));
    assertState4Close(cz, [C(0.5), C(0.5), C(0.5), C(-0.5)], 1e-15);
    assertClose(concurrence(cz), 1, 1e-15);
  });

  test('separable tolerance is tight enough to see small but real entanglement', () => {
    assert.ok(SEPARABLE_TOLERANCE <= 1e-9);
    const t = 1e-6, s = [C(Math.cos(t)), C(0), C(0), C(Math.sin(t))];
    assert.equal(classifyEntanglement(concurrence(s)), 'partially entangled');
  });
});

describe('product factors', () => {
  test('factor a separable state exactly: |ψ⟩ = |a⟩ ⊗ |b⟩', () => {
    const r = rng(304);
    for (let i = 0; i < 300; i++) {
      const a = randomState(r), b = randomState(r), g = r() * 6, s = product(a, b).map((x) => mul(C(Math.cos(g), Math.sin(g)), x));
      const [fa, fb] = productFactors(s);
      assertState4Close(kronVector(fa, fb), s, 1e-12);
      assertVectorClose(bloch(fa), bloch(a), 1e-11);
      assertVectorClose(bloch(fb), bloch(b), 1e-11);
    }
  });

  test('|+0⟩ factors as |+⟩ ⊗ |0⟩; entangled states have no factors', () => {
    const [a, b] = productFactors([C(R), C(0), C(R), C(0)]);
    assertState4Close([...a, ...b], [C(R), C(R), C(1), C(0)], 1e-15);
    for (const bs of bellStates) assert.equal(productFactors(bs.state), null);
  });
});

describe('reduced density matrices', () => {
  test('ρ = |ψ⟩⟨ψ| is Hermitian, has trace 1 and is a projector (ρ² = ρ)', () => {
    const r = rng(305);
    for (let i = 0; i < 50; i++) {
      const rho = densityMatrix(randomState2(r));
      assertMatrixCloseN(dagger(rho), rho, 1e-15);
      assertClose(rho.reduce((s, row, k) => s + row[k].re, 0), 1, 1e-14);
      assertMatrixCloseN(matMul(rho, rho), rho, 1e-14);
    }
  });

  test('for |Φ+⟩: ρ₀ = ρ₁ = I/2 and both reduced Bloch vectors are (0, 0, 0)', () => {
    const [r0, r1] = reducedDensityMatrices(bell['phi-plus']);
    assertMatrixCloseN(r0, maximallyMixed(), 1e-15);
    assertMatrixCloseN(r1, maximallyMixed(), 1e-15);
    for (const v of reducedBlochVectors(bell['phi-plus'])) assertVectorClose(v, {x: 0, y: 0, z: 0}, 1e-15);
  });

  test('every Bell state has maximally mixed reduced states (purity 1/2)', () => {
    for (const b of bellStates) for (const rho of reducedDensityMatrices(b.state)) {
      assertMatrixCloseN(rho, maximallyMixed(), 1e-15, b.name);
      assertClose(purity(rho), 0.5, 1e-15);
    }
  });

  test('partial traces match the direct amplitude formulas', () => {
    const r = rng(306);
    for (let i = 0; i < 100; i++) {
      const s = randomState2(r), [a, b, c, d] = s, conj = (x) => C(x.re, -x.im), add = (x, y) => C(x.re + y.re, x.im + y.im);
      const [r0, r1] = reducedDensityMatrices(s);
      // ρ₀[i][j] = Σ_b ψ(i,b) conj ψ(j,b);  ρ₁[i][j] = Σ_a ψ(a,i) conj ψ(a,j)
      assertComplexClose(r0[0][1], add(mul(a, conj(c)), mul(b, conj(d))), 1e-15);
      assertComplexClose(r1[0][1], add(mul(a, conj(b)), mul(c, conj(d))), 1e-15);
      assertClose(r0[0][0].re, a.re ** 2 + a.im ** 2 + b.re ** 2 + b.im ** 2, 1e-15);
      assertClose(r1[0][0].re, a.re ** 2 + a.im ** 2 + c.re ** 2 + c.im ** 2, 1e-15);
      for (const rho of [r0, r1]) {
        assertMatrixCloseN(dagger(rho), rho, 1e-15);
        assertClose(rho[0][0].re + rho[1][1].re, 1, 1e-14);
      }
    }
  });

  test('partialTrace rejects an invalid qubit', () => {
    assert.throws(() => partialTrace(densityMatrix(initial2()), 2), /keep must be/);
  });

  test('product states: reduced Bloch vectors equal each factor\'s Bloch vector (length 1)', () => {
    const r = rng(307);
    for (let i = 0; i < 200; i++) {
      const a = randomState(r), b = randomState(r), [v0, v1] = reducedBlochVectors(product(a, b));
      assertVectorClose(v0, bloch(a), 1e-13);
      assertVectorClose(v1, bloch(b), 1e-13);
      assertClose(blochLength(v0), 1, 1e-13);
    }
  });

  test('Tr(ρσ) Bloch formula agrees with x = 2 Re ρ₀₁, y = −2 Im ρ₀₁, z = ρ₀₀ − ρ₁₁', () => {
    const r = rng(308);
    for (let i = 0; i < 100; i++) for (const rho of reducedDensityMatrices(randomState2(r))) {
      assertVectorClose(blochFromDensity(rho), {x: 2 * rho[0][1].re, y: -2 * rho[0][1].im, z: rho[0][0].re - rho[1][1].re}, 1e-15);
    }
  });

  test('pure-state identities: |r|² = 1 − C² and Tr(ρ²) = 1 − C²/2 for both qubits', () => {
    const r = rng(309);
    for (let i = 0; i < 300; i++) {
      const s = randomState2(r), c = concurrence(s);
      reducedDensityMatrices(s).forEach((rho) => {
        assertClose(blochLength(blochFromDensity(rho)) ** 2, 1 - c * c, 1e-13);
        assertClose(purity(rho), 1 - c * c / 2, 1e-13);
      });
    }
  });

  test('|Ψ−⟩ reduced vectors are (0,0,0); a partially entangled state has 0 < |r| < 1', () => {
    for (const v of reducedBlochVectors(bell['psi-minus'])) assertVectorClose(v, {x: 0, y: 0, z: 0}, 1e-15);
    const t = Math.PI / 8, [v0, v1] = reducedBlochVectors([C(Math.cos(t)), C(0), C(0), C(Math.sin(t))]);
    assertVectorClose(v0, {x: 0, y: 0, z: Math.cos(2 * t)}, 1e-15);
    assertVectorClose(v1, {x: 0, y: 0, z: Math.cos(2 * t)}, 1e-15);
  });

  test('basis ordering: |10⟩ has q0 at the south pole and q1 at the north pole', () => {
    const [v0, v1] = reducedBlochVectors(basis2(2));
    assertVectorClose(v0, {x: 0, y: 0, z: -1}, 0);
    assertVectorClose(v1, {x: 0, y: 0, z: 1}, 0);
    assert.equal(BASIS[2], '10');
  });

  test('fromReal helper used for explicit matrices', () => {
    assertMatrixCloseN(fromReal([[1, 0], [0, 1]]), [[C(1), C(0)], [C(0), C(1)]], 0);
  });
});
