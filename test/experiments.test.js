import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {C, mul, applyGate, bloch, probabilities, globalPhaseFactor} from '../quantum.js';
import {statesOf, circuitOf} from '../circuit.js';
import {experiments, phaseDemos, experimentCircuit, experimentResult, choiceMatches, judgePrediction} from '../experiments.js';
import {assertClose, assertStateClose, assertVectorClose, assertComplexClose} from './helpers.js';

const byId = (id) => experiments.find((e) => e.id === id);

describe('guided experiments', () => {
  test('there are the three required experiments', () => {
    assert.deepEqual(experiments.map((e) => e.id), ['predict-ry', 'relative-phase', 'full-turn']);
  });

  for (const exp of experiments) {
    test(`${exp.id}: exactly one choice matches the simulated result`, () => {
      const matches = exp.choices.filter((c) => choiceMatches(exp, c));
      assert.equal(matches.length, 1, matches.map((c) => c.label).join(', '));
      const index = exp.choices.indexOf(matches[0]);
      assert.equal(judgePrediction(exp, index).correct, true);
      for (let i = 0; i < exp.choices.length; i++) if (i !== index) assert.equal(judgePrediction(exp, i).correct, false);
    });

    test(`${exp.id}: setup circuit excludes the action; full circuit adds it last`, () => {
      assert.equal(experimentCircuit(exp, {withAction: false}).steps.length, exp.setup.length);
      assert.deepEqual(experimentCircuit(exp).steps.at(-1), exp.action);
    });
  }

  test('Experiment 1: Ry(90°)|0⟩ = |+⟩ gives 50/50, as the explanation says', () => {
    const exp = byId('predict-ry'), state = experimentResult(exp);
    assertStateClose(state, [C(Math.SQRT1_2), C(Math.SQRT1_2)], 1e-15);
    assert.deepEqual(probabilities(state).map((p) => Math.round(p * 1000) / 1000), [0.5, 0.5]);
    assert.match(exp.explanation, /0\.707\|0⟩ \+ 0\.707\|1⟩/);
  });

  test('Experiment 2: H then Rz(90°) points along +Y with a global phase e^{−iπ/4}', () => {
    const exp = byId('relative-phase'), state = experimentResult(exp);
    assertVectorClose(bloch(state), {x: 0, y: 1, z: 0}, 1e-15);
    const plusI = [C(Math.SQRT1_2), C(0, Math.SQRT1_2)];
    assertComplexClose(globalPhaseFactor(plusI, state), C(Math.cos(-Math.PI / 4), Math.sin(-Math.PI / 4)), 1e-15);
    assertClose(probabilities(state)[0], 0.5, 1e-15);
  });

  test('Experiment 2 explanation: after H, |+i⟩ gives 50/50 but |+⟩ gives |0⟩ with certainty', () => {
    const state = experimentResult(byId('relative-phase'));
    assertClose(probabilities(applyGate(state, 'H'))[0], 0.5, 1e-15);
    assertClose(probabilities(applyGate(applyGate([C(1), C(0)], 'H'), 'H'))[0], 1, 1e-15);
  });

  test('Experiment 3: Rx(360°) gives −|ψ⟩ with unchanged probabilities and Bloch vector', () => {
    const exp = byId('full-turn'), states = statesOf(experimentCircuit(exp)), [before, after] = states.slice(-2);
    assertStateClose(before, [C(Math.sqrt(3) / 2), C(0.5)], 1e-15);
    assertStateClose(after, before.map((a) => mul(C(-1), a)), 1e-15);
    assertClose(probabilities(after)[0], 0.75, 1e-15);
    assertVectorClose(bloch(after), bloch(before), 1e-15);
    assert.match(exp.setupText, /0\.866\|0⟩ \+ 0\.500\|1⟩/);
    assert.match(exp.explanation, /−0\.866\|0⟩ − 0\.500\|1⟩/);
  });

  test('phase demos replay to the states the lesson describes', () => {
    const end = (id) => statesOf(circuitOf(phaseDemos.find((d) => d.id === id).steps)).at(-1);
    assertVectorClose(bloch(end('rz-pole')), {x: 0, y: 0, z: 1}, 1e-15); // does not move
    assert.notEqual(end('rz-pole')[0].im, 0); // but the amplitude acquired a phase
    assertVectorClose(bloch(end('rz-plus')), {x: 0, y: 1, z: 0}, 1e-15);
    assertComplexClose(globalPhaseFactor([C(Math.sqrt(3) / 2), C(0.5)], end('rx-full')), C(-1), 1e-14);
  });
});
