import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {C, measure, gates, applyGate} from '../quantum.js';
import {basis2, measureBoth, measureQubit, BASIS, product} from '../multi-qubit.js';
import {singleQubitProbabilities, jointProbabilities, marginalProbabilities, distributionFor, collapse, conditionalOutcomes, repeatProbability, targetLabel} from '../measurement.js';
import {normalizeDistribution, cumulative, sampleIndex, sampleCounts, standardError} from '../sampling.js';
import {mulberry32, seededRandom, randomSource, deriveSeed, parseSeed, MAX_SEED} from '../rng.js';
import {runShots, parseShots, convergence, nonMonotonicSteps, maxError, SHOT_PRESETS, MAX_SHOTS, CONVERGENCE_SHOTS} from '../shot-simulator.js';
import {emptyHistory, addRecord, clearHistory, findRecord, rerunSettings, HISTORY_LIMIT} from '../measurement-history.js';
import {measurementExperiments} from '../measurement-experiments.js';
import {circuitOf, statesOf} from '../circuit.js';
import {statesOf2} from '../two-qubit-circuit.js';
import {bellStates} from '../two-qubit-experiments.js';
import {rng, randomState, randomState2, assertClose, assertState4Close, assertStateClose, assertVectorClose} from './helpers.js';

const R = Math.SQRT1_2;
const ket = {'0': [C(1), C(0)], '1': [C(0), C(1)], '+': [C(R), C(R)], '-': [C(R), C(-R)]};
const PHI_PLUS = bellStates[0].state, PSI_PLUS = bellStates[2].state;
const sum = (a) => a.reduce((s, x) => s + x, 0);
const assertProbs = (actual, expected, eps = 1e-15, msg = '') => expected.forEach((p, k) => assertClose(actual[k], p, eps, `${msg}[${k}]`));
const deepCopy = (x) => JSON.parse(JSON.stringify(x));

describe('Born-rule probabilities', () => {
  test('single qubit: |0⟩, |1⟩, |+⟩, |−⟩', () => {
    assert.deepEqual(singleQubitProbabilities(ket['0']), [1, 0]);
    assert.deepEqual(singleQubitProbabilities(ket['1']), [0, 1]);
    assertProbs(singleQubitProbabilities(ket['+']), [0.5, 0.5]);
    assertProbs(singleQubitProbabilities(ket['-']), [0.5, 0.5]);
  });

  test('two qubits: |00⟩, |01⟩, |10⟩, |11⟩ in basis order', () => {
    for (let k = 0; k < 4; k++) assert.deepEqual(jointProbabilities(basis2(k)), [0, 1, 2, 3].map((i) => (i === k ? 1 : 0)), BASIS[k]);
  });

  test('two qubits: |Φ+⟩ and |Ψ+⟩', () => {
    assertProbs(jointProbabilities(PHI_PLUS), [0.5, 0, 0, 0.5]);
    assertProbs(jointProbabilities(PSI_PLUS), [0, 0.5, 0.5, 0]);
  });

  test('marginals of |Φ+⟩: every single-qubit outcome has probability 1/2', () => {
    assertProbs(marginalProbabilities(PHI_PLUS, 0), [0.5, 0.5]);
    assertProbs(marginalProbabilities(PHI_PLUS, 1), [0.5, 0.5]);
  });

  test('marginals follow P(q0=b) = p(b0) + p(b1), P(q1=b) = p(0b) + p(1b)', () => {
    const r = rng(501);
    for (let i = 0; i < 200; i++) {
      const s = randomState2(r), [p00, p01, p10, p11] = jointProbabilities(s);
      assertProbs(marginalProbabilities(s, 0), [p00 + p01, p10 + p11], 1e-15);
      assertProbs(marginalProbabilities(s, 1), [p00 + p10, p01 + p11], 1e-15);
    }
    assert.throws(() => marginalProbabilities(PHI_PLUS, 2), /Qubit must be 0 or 1/);
  });

  test('marginals of a product state are the single-qubit probabilities of each factor', () => {
    const r = rng(502);
    for (let i = 0; i < 100; i++) {
      const a = randomState(r), b = randomState(r), s = product(a, b);
      assertProbs(marginalProbabilities(s, 0), singleQubitProbabilities(a), 1e-14);
      assertProbs(marginalProbabilities(s, 1), singleQubitProbabilities(b), 1e-14);
    }
  });

  test('distributions sum to 1 and are robust to floating-point drift', () => {
    const r = rng(503);
    for (let i = 0; i < 200; i++) assertClose(sum(jointProbabilities(randomState2(r))), 1, 1e-15);
    const drifted = [C(R * 0.9999999), C(0), C(R * 0.9999999), C(0)];
    const p = jointProbabilities(drifted);
    assertClose(sum(p), 1, 1e-15);
    assert.equal(p[1], 0); assert.equal(p[3], 0);
  });

  test('distributionFor gives labels in basis order for every target', () => {
    assert.deepEqual(distributionFor(ket['+'], 'qubit').labels, ['0', '1']);
    assert.deepEqual(distributionFor(PHI_PLUS, 'joint').labels, ['00', '01', '10', '11']);
    assert.deepEqual(distributionFor(PHI_PLUS, 1).labels, ['0', '1']);
    assert.equal(targetLabel('joint'), 'both qubits (joint)');
    assert.equal(targetLabel(0), 'q0 only');
  });
});

describe('collapse', () => {
  test('single-qubit measurement collapses to |0⟩ or |1⟩', () => {
    assert.deepEqual(collapse(ket['+'], 'qubit', 0), ket['0']);
    assert.deepEqual(collapse(ket['+'], 'qubit', 1), ket['1']);
    assert.deepEqual(measure(ket['+'], 0.2).state, ket['0']);
    assert.deepEqual(measure(ket['+'], 0.8).state, ket['1']);
  });

  test('joint measurement collapses to the basis state of the outcome', () => {
    for (let k = 0; k < 4; k++) assert.deepEqual(collapse(PHI_PLUS, 'joint', k), basis2(k));
  });

  test('q0-only measurement of |Φ+⟩: 0 → |00⟩, 1 → |11⟩', () => {
    assertState4Close(collapse(PHI_PLUS, 0, 0), basis2(0), 1e-15);
    assertState4Close(collapse(PHI_PLUS, 0, 1), basis2(3), 1e-15);
  });

  test('q1-only measurement: |Ψ+⟩ gives q1 = 0 → |10⟩, q1 = 1 → |01⟩', () => {
    assertState4Close(collapse(PSI_PLUS, 1, 0), basis2(2), 1e-15);
    assertState4Close(collapse(PSI_PLUS, 1, 1), basis2(1), 1e-15);
  });

  test('partial collapse keeps the unmeasured qubit\'s superposition when there is no entanglement', () => {
    const s = product(ket['+'], ket['+']);
    assertState4Close(collapse(s, 0, 1), product(ket['1'], ket['+']), 1e-15);
    assertState4Close(collapse(s, 1, 0), product(ket['+'], ket['0']), 1e-15);
  });

  test('conditional outcomes of |Φ+⟩: q1 goes from I/2 (|r| = 0) to a pole (|r| = 1)', () => {
    const [zero, one] = conditionalOutcomes(PHI_PLUS, 0);
    assertClose(zero.probability, 0.5, 1e-15);
    assertClose(one.probability, 0.5, 1e-15);
    assertClose(zero.otherLengthBefore, 0, 1e-15);
    assertClose(zero.otherLengthAfter, 1, 1e-15);
    assertVectorClose(zero.otherAfter, {x: 0, y: 0, z: 1}, 1e-15);
    assertVectorClose(one.otherAfter, {x: 0, y: 0, z: -1}, 1e-15);
    assertState4Close(one.state, basis2(3), 1e-15);
  });

  test('impossible conditional outcomes are flagged, not divided by zero', () => {
    const [zero, one] = conditionalOutcomes(basis2(0), 0);
    assert.equal(zero.possible, true);
    assert.equal(one.possible, false);
    assert.equal(one.probability, 0);
  });

  test('repeated measurement after collapse repeats the outcome with probability 1', () => {
    const r = rng(504);
    for (let i = 0; i < 200; i++) {
      const s1 = randomState(r), o1 = measure(s1, r()).outcome, c1 = collapse(s1, 'qubit', o1);
      assert.equal(repeatProbability(c1, 'qubit', o1), 1);
      for (let n = 0; n < 5; n++) assert.equal(measure(c1, r()).outcome, o1);
      const s2 = randomState2(r);
      for (const target of ['joint', 0, 1]) {
        const {probabilities} = distributionFor(s2, target), o = sampleIndex(probabilities, r()), c = collapse(s2, target, o);
        assertClose(repeatProbability(c, target, o), 1, 1e-15, `target ${target}`);
        for (let n = 0; n < 5; n++) assert.equal(sampleIndex(distributionFor(c, target).probabilities, r()), o);
      }
    }
  });

  test('measureQubit and measureBoth agree with collapse()', () => {
    const r = rng(505);
    for (let i = 0; i < 100; i++) {
      const s = randomState2(r), u = r();
      const m = measureBoth(s, u);
      assert.deepEqual(m.state, collapse(s, 'joint', m.outcome));
      const q = measureQubit(s, i % 2, u);
      assertState4Close(q.state, collapse(s, i % 2, q.outcome), 0);
    }
  });

  test('regression: measureBoth never picks a zero-probability outcome under drift', () => {
    const drifted = [C(R * 0.9999999), C(0), C(R * 0.9999999), C(0)];
    for (const u of [0.99999999, 0.9999999999999999, 0.5, 0]) assert.notEqual(measureBoth(drifted, u).outcome % 2, 1, `u=${u}`);
  });

  test('collapse never mutates its input', () => {
    const s = deepCopy(PHI_PLUS), before = JSON.stringify(s);
    collapse(s, 0, 1); collapse(s, 'joint', 3); conditionalOutcomes(s, 1); distributionFor(s, 'joint');
    assert.equal(JSON.stringify(s), before);
  });
});

describe('sampling engine', () => {
  test('normalizeDistribution validates and removes drift', () => {
    assert.deepEqual(normalizeDistribution([0.5, 0.5]), [0.5, 0.5]);
    assertClose(sum(normalizeDistribution([0.3333333, 0.3333333, 0.3333333])), 1, 1e-15);
    assert.equal(normalizeDistribution([-1e-17, 1])[0], 0);
    for (const bad of [[], [0.5, 0.6], [NaN, 1], [-0.1, 1.1], [0, 0], 'x']) assert.throws(() => normalizeDistribution(bad), String(bad));
  });

  test('half-open intervals: outcome k owns [F(k−1), F(k))', () => {
    const p = [0.25, 0.25, 0.25, 0.25];
    assert.deepEqual(cumulative(p), [0.25, 0.5, 0.75, 1]);
    assert.equal(sampleIndex(p, 0), 0);
    assert.equal(sampleIndex(p, 0.2499999999), 0);
    assert.equal(sampleIndex(p, 0.25), 1);
    assert.equal(sampleIndex(p, 0.5), 2);
    assert.equal(sampleIndex(p, 0.75), 3);
    assert.equal(sampleIndex(p, 0.9999999999999999), 3);
  });

  test('zero-probability outcomes are never selected, even at interval boundaries', () => {
    const p = [0, 0.5, 0, 0.5];
    for (const u of [0, 1e-300, 0.4999999, 0.5, 0.5000001, 0.9999999999999999]) assert.ok([1, 3].includes(sampleIndex(p, u)), `u=${u}`);
    assert.equal(sampleIndex([0, 0, 1, 0], 0), 2);
    // u at or above the (drifted) total falls back to the last positive outcome.
    assert.equal(sampleIndex([0.5, 0.4999999999, 0, 0], 0.99999999999), 1);
  });

  test('sampleCounts sums to N and never mutates its input', () => {
    const p = [0.1, 0.2, 0.3, 0.4], copy = [...p], random = seededRandom(7);
    for (const n of [0, 1, 7, 1000]) assert.equal(sum(sampleCounts(p, n, random)), n);
    assert.deepEqual(p, copy);
    assert.throws(() => sampleCounts(p, -1, random), /non-negative integer/);
    assert.throws(() => sampleCounts(p, 1.5, random), /non-negative integer/);
  });

  test('a certain outcome needs no randomness', () => {
    let calls = 0;
    const counting = () => { calls++; return 0.5; };
    assert.deepEqual(sampleCounts([0, 1], 10000, counting), [0, 10000]);
    assert.equal(calls, 0);
  });

  test('seeded frequencies match the Born rule within 5σ (deterministic, so never flaky)', () => {
    const cases = [[0.5, 0.5], [0.1, 0.9], [0.25, 0.25, 0.25, 0.25], [0.7, 0, 0.2, 0.1], [0.001, 0.999]];
    for (const p of cases) for (const seed of [1, 2, 3, 42, 2024]) {
      const n = 20000, counts = sampleCounts(p, n, seededRandom(seed));
      counts.forEach((c, k) => {
        assert.ok(Math.abs(c / n - p[k]) <= 5 * standardError(p[k], n) + 1e-12, `p=${p} seed=${seed} k=${k} count=${c}`);
        if (p[k] === 0) assert.equal(c, 0);
      });
    }
  });

  test('a chi-square check on 100 000 seeded shots of a 4-outcome distribution', () => {
    const p = [0.4, 0.3, 0.2, 0.1], n = 100000, counts = sampleCounts(p, n, seededRandom(99));
    const chi2 = counts.reduce((s, c, k) => s + (c - n * p[k]) ** 2 / (n * p[k]), 0);
    assert.ok(chi2 < 16.27, `χ² = ${chi2} (3 degrees of freedom, p = 0.001 cutoff 16.27)`);
  });

  test('standard error σ = √(p(1 − p)/N)', () => {
    assertClose(standardError(0.5, 100), 0.05, 1e-15);
    assertClose(standardError(0.5, 10000), 0.005, 1e-15);
    assert.equal(standardError(1, 50), 0);
    assert.ok(Number.isNaN(standardError(0.5, 0)));
  });

  test('100 000 shots run quickly (well under a frame budget on a laptop)', () => {
    const start = performance.now();
    sampleCounts([0.25, 0.25, 0.25, 0.25], MAX_SHOTS, seededRandom(5));
    assert.ok(performance.now() - start < 200, `took ${performance.now() - start} ms`);
  });
});

describe('seeded randomness', () => {
  test('mulberry32 is deterministic and produces unsigned 32-bit integers', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      assert.equal(x, b());
      assert.ok(Number.isInteger(x) && x >= 0 && x <= MAX_SEED);
    }
  });

  test('seededRandom gives uniforms in [0, 1) with 53-bit resolution', () => {
    const r = seededRandom(1);
    let min = 1, max = 0;
    for (let i = 0; i < 10000; i++) { const u = r(); assert.ok(u >= 0 && u < 1); min = Math.min(min, u); max = Math.max(max, u); }
    assert.ok(min < 0.001 && max > 0.999);
    assert.ok([...Array(50)].map(r).some((u) => !Number.isInteger(u * 2 ** 32)), 'uses more than 32 bits');
  });

  test('seeds are validated', () => {
    for (const bad of [-1, 1.5, MAX_SEED + 1, NaN, '1']) assert.throws(() => seededRandom(bad), /Seed must be an integer/);
    assert.deepEqual(parseSeed(''), {ok: true, seed: null});
    assert.deepEqual(parseSeed(' 42 '), {ok: true, seed: 42});
    assert.deepEqual(parseSeed('0'), {ok: true, seed: 0});
    assert.equal(parseSeed(String(MAX_SEED)).seed, MAX_SEED);
    for (const bad of ['abc', '-1', '1.5', '1e3', String(MAX_SEED + 1)]) assert.equal(parseSeed(bad).ok, false, bad);
  });

  test('same state, seed and shot count give identical counts', () => {
    for (const [state, target] of [[ket['+'], 'qubit'], [PHI_PLUS, 'joint'], [PHI_PLUS, 0], [randomState2(rng(7)), 1]]) {
      const a = runShots({state, target, shots: 1000, seed: 12345}), b = runShots({state, target, shots: 1000, seed: 12345});
      assert.deepEqual(a.counts, b.counts);
    }
  });

  test('different seeds generally give different counts (checked over many seeds, not one pair)', () => {
    const results = new Set(Array.from({length: 20}, (_, seed) => runShots({state: ket['+'], target: 'qubit', shots: 1000, seed}).counts.join(',')));
    assert.ok(results.size >= 10, `only ${results.size} distinct outcomes from 20 seeds`);
  });

  test('derived seeds are reproducible, distinct and in range', () => {
    assert.equal(deriveSeed(42, 100), deriveSeed(42, 100));
    const seen = new Set(CONVERGENCE_SHOTS.map((n) => deriveSeed(42, n)));
    assert.equal(seen.size, CONVERGENCE_SHOTS.length);
    for (const s of seen) assert.ok(Number.isInteger(s) && s >= 0 && s <= MAX_SEED);
  });

  test('no seed means the system generator', () => {
    assert.equal(randomSource(null), Math.random);
  });
});

describe('shot simulator', () => {
  test('presets and limits', () => {
    assert.deepEqual(SHOT_PRESETS, [1, 10, 100, 1000, 10000]);
    assert.equal(MAX_SHOTS, 100000);
  });

  test('shot counts are validated', () => {
    assert.deepEqual(parseShots('1000'), {ok: true, shots: 1000});
    assert.deepEqual(parseShots('10,000'), {ok: true, shots: 10000});
    assert.deepEqual(parseShots(' 1 000 '), {ok: true, shots: 1000});
    assert.equal(parseShots(String(MAX_SHOTS)).ok, true);
    for (const bad of ['', '0', '-5', '2.5', 'abc', '1e3', String(MAX_SHOTS + 1), null]) assert.equal(parseShots(bad).ok, false, String(bad));
  });

  test('deterministic states: |0⟩ always gives 0, |11⟩ always gives 11, for every shot count', () => {
    for (const shots of [1, 10, 100, 1000, 10000, MAX_SHOTS]) {
      assert.deepEqual(runShots({state: ket['0'], target: 'qubit', shots}).counts, [shots, 0]);
      assert.deepEqual(runShots({state: basis2(3), target: 'joint', shots}).counts, [0, 0, 0, shots]);
      assert.deepEqual(runShots({state: basis2(3), target: 0, shots}).counts, [0, shots]);
    }
  });

  test('|Φ+⟩: 01 and 10 never occur; |Ψ+⟩: 00 and 11 never occur (any seed, any N)', () => {
    for (const seed of [null, 1, 2, 3, 99, 4096]) for (const shots of [1, 10, 1000, 10000]) {
      const phi = runShots({state: PHI_PLUS, target: 'joint', shots, seed}).counts;
      assert.equal(phi[1] + phi[2], 0, `Φ+ seed ${seed}`);
      const psi = runShots({state: PSI_PLUS, target: 'joint', shots, seed}).counts;
      assert.equal(psi[0] + psi[3], 0, `Ψ+ seed ${seed}`);
    }
  });

  test('Bell marginals look like fair coins while the pair is perfectly correlated (seeded)', () => {
    const joint = runShots({state: PHI_PLUS, target: 'joint', shots: 10000, seed: 8});
    const q0 = runShots({state: PHI_PLUS, target: 0, shots: 10000, seed: 9});
    for (const r of [joint, q0]) r.frequencies.forEach((f, k) => { if (r.theory[k] > 0) assert.ok(Math.abs(f - 0.5) < 5 * 0.005); });
  });

  test('results report theory, counts, frequencies, absolute errors and typical σ', () => {
    const r = runShots({state: ket['+'], target: 'qubit', shots: 1000, seed: 3});
    assert.equal(sum(r.counts), 1000);
    r.frequencies.forEach((f, k) => {
      assertClose(f, r.counts[k] / 1000, 0);
      assertClose(r.errors[k], Math.abs(f - r.theory[k]), 0);
      assertClose(r.typical[k], Math.sqrt(0.25 / 1000), 1e-15);
    });
    assert.equal(maxError(r), Math.max(...r.errors));
  });

  test('running 10 000 shots never changes the live state', () => {
    for (const [state, target] of [[deepCopy(ket['+']), 'qubit'], [deepCopy(PHI_PLUS), 'joint'], [deepCopy(PHI_PLUS), 0]]) {
      const before = JSON.stringify(state);
      runShots({state, target, shots: 10000});
      runShots({state, target, shots: 10000, seed: 1});
      assert.equal(JSON.stringify(state), before);
    }
  });

  test('a frozen state can be sampled (proves no write access is needed)', () => {
    const state = Object.freeze(PHI_PLUS.map((a) => Object.freeze({...a})));
    assert.equal(sum(runShots({state, target: 'joint', shots: 100, seed: 1}).counts), 100);
  });

  test('convergence: one result per shot count, reproducible with a seed', () => {
    const a = convergence({state: ket['+'], target: 'qubit', seed: 7}), b = convergence({state: ket['+'], target: 'qubit', seed: 7});
    assert.deepEqual(a.map((r) => r.shots), CONVERGENCE_SHOTS);
    assert.deepEqual(a.map((r) => r.counts), b.map((r) => r.counts));
    // Every run stays within 5σ of the theory (deterministic for this seed).
    for (const r of a) assert.ok(maxError(r) <= 5 * r.typical[0] + 1e-12, `N=${r.shots}`);
  });

  test('convergence on average: the mean error over many seeds shrinks as N grows', () => {
    const mean = CONVERGENCE_SHOTS.map((_, i) => {
      let total = 0;
      for (let seed = 0; seed < 40; seed++) total += maxError(convergence({state: ket['+'], target: 'qubit', seed})[i]);
      return total / 40;
    });
    for (let i = 1; i < mean.length; i++) assert.ok(mean[i] < mean[i - 1], `mean error ${mean}`);
  });

  test('nonMonotonicSteps reports where a larger sample landed further from theory', () => {
    const fake = [{shots: 10, errors: [0.01]}, {shots: 100, errors: [0.03]}, {shots: 1000, errors: [0.002]}];
    assert.deepEqual(nonMonotonicSteps(fake), [[10, 100]]);
    // Over many seeds, such reversals really happen: the UI must not claim monotonic improvement.
    let reversals = 0;
    for (let seed = 0; seed < 40; seed++) reversals += nonMonotonicSteps(convergence({state: ket['+'], target: 'qubit', seed})).length;
    assert.ok(reversals > 0);
  });
});

describe('measurement history', () => {
  const record = (n) => ({mode: 'single', label: '|+⟩', target: 'qubit', shots: n, seed: null, labels: ['0', '1'], counts: [n, 0], state: ket['+']});

  test('records are added newest-first with ids, separately from any circuit', () => {
    let h = emptyHistory();
    h = addRecord(h, record(10), 1000);
    h = addRecord(h, record(20), 2000);
    assert.deepEqual(h.records.map((r) => [r.id, r.shots, r.time]), [[2, 20, 2000], [1, 10, 1000]]);
    assert.equal(findRecord(h, 1).shots, 10);
    assert.equal(findRecord(h, 9), null);
  });

  test('records keep only aggregate counts and copy their inputs', () => {
    const input = record(1000);
    const h = addRecord(emptyHistory(), input);
    input.counts[0] = -1; input.state[0].re = 9;
    assert.deepEqual(h.records[0].counts, [1000, 0]);
    assert.equal(h.records[0].state[0].re, R);
    assert.equal(Object.keys(h.records[0]).includes('outcomes'), false);
  });

  test('history is capped and can be cleared', () => {
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = addRecord(h, record(i + 1));
    assert.equal(h.records.length, HISTORY_LIMIT);
    assert.equal(h.records[0].shots, HISTORY_LIMIT + 10);
    h = clearHistory(h);
    assert.equal(h.records.length, 0);
    assert.equal(addRecord(h, record(1)).records[0].id, HISTORY_LIMIT + 11);
  });

  test('rerunning a seeded record reproduces its counts exactly', () => {
    const first = runShots({state: PHI_PLUS, target: 'joint', shots: 1000, seed: 77});
    const h = addRecord(emptyHistory(), {mode: 'two', label: '|Φ+⟩', target: 'joint', shots: 1000, seed: 77, labels: first.labels, counts: first.counts, state: PHI_PLUS});
    const again = runShots(rerunSettings(h.records[0]));
    assert.deepEqual(again.counts, first.counts);
  });
});

describe('guided measurement experiments', () => {
  const finalState = (mode, steps) => (mode === 'single' ? statesOf(circuitOf(steps)) : statesOf2(circuitOf(steps))).at(-1);

  test('the five required experiments exist', () => {
    assert.deepEqual(measurementExperiments.single.map((e) => e.id), ['one-vs-many', 'collapse-repeat']);
    assert.deepEqual(measurementExperiments.two.map((e) => e.id), ['bell-correlation', 'bell-anticorrelation', 'partial-measurement']);
  });

  test('Experiments 1–2 prepare |+⟩; experiment 1 compares 1, 100 and 10 000 shots', () => {
    for (const e of measurementExperiments.single) assertStateClose(finalState('single', e.steps), applyGate(ket['0'], 'H'), 0);
    assert.deepEqual(measurementExperiments.single[0].actions.map((a) => a.shots), [1, 100, 10000]);
    assert.deepEqual(measurementExperiments.single[1].actions.map((a) => a.kind), ['measure', 'measure']);
  });

  test('Experiments 3–5 prepare |Φ+⟩, |Ψ+⟩, |Φ+⟩ exactly', () => {
    const [a, b, c] = measurementExperiments.two;
    assertState4Close(finalState('two', a.steps), PHI_PLUS, 0);
    assertState4Close(finalState('two', b.steps), PSI_PLUS, 0);
    assertState4Close(finalState('two', c.steps), PHI_PLUS, 0);
    assert.deepEqual(c.actions, [{kind: 'measure', target: 0}]);
  });

  test('every action targets a valid measurement for its mode', () => {
    for (const e of measurementExperiments.single) for (const a of e.actions) assert.equal(a.target, 'qubit');
    for (const e of measurementExperiments.two) for (const a of e.actions) assert.ok(['joint', 0, 1].includes(a.target));
  });

  test('explanation numbers hold: σ(100) = 0.05, σ(10 000) = 0.005', () => {
    assertClose(standardError(0.5, 100), 0.05, 1e-15);
    assertClose(standardError(0.5, 10000), 0.005, 1e-15);
    assert.match(measurementExperiments.single[0].explanation, /0\.05/);
    assert.match(measurementExperiments.single[0].explanation, /0\.005/);
  });

  test('gates referenced by the experiments exist', () => {
    for (const e of [...measurementExperiments.single, ...measurementExperiments.two]) for (const s of e.steps) assert.ok(gates[s.gate] || s.type === 'two', s.gate);
  });
});
