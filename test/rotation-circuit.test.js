import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {C, initial, applyGate, bloch} from '../quantum.js';
import {applyRotation, ROTATIONS} from '../rotations.js';
import {emptyCircuit, addGate, addRotation, addMeasurement, addPreparation, undo, statesOf, circuitOf} from '../circuit.js';
import {renderCircuit, stepLabel} from '../circuit-view.js';
import {rng, assertStateClose, assertVectorClose} from './helpers.js';

const PI = Math.PI;

describe('rotations in the circuit history', () => {
  test('a rotation step stores the gate type and its parameter θ (radians)', () => {
    const c = addRotation(emptyCircuit(), 'Rx', PI / 2);
    assert.deepEqual(c.steps, [{type: 'rotation', gate: 'Rx', theta: PI / 2}]);
  });

  test('statesOf replays rotations mixed with fixed gates exactly', () => {
    const c = addRotation(addGate(addRotation(emptyCircuit(), 'Ry', PI / 3), 'H'), 'Rz', PI / 4);
    let expected = applyRotation(initial(), 'Ry', PI / 3);
    expected = applyGate(expected, 'H');
    expected = applyRotation(expected, 'Rz', PI / 4);
    assertStateClose(statesOf(c).at(-1), expected, 0);
  });

  test('examples from the brief: Rx(90°), Ry(π/2), Rz(45°)', () => {
    const c = addRotation(addRotation(addRotation(emptyCircuit(), 'Rx', 90 * PI / 180), 'Ry', PI / 2), 'Rz', 45 * PI / 180);
    assert.deepEqual(c.steps.map((s) => stepLabel(s)), [
      'Rx(90°), rotation by π/2 rad about the X axis',
      'Ry(90°), rotation by π/2 rad about the Y axis',
      'Rz(45°), rotation by π/4 rad about the Z axis',
    ]);
  });

  test('invalid rotations never enter the history', () => {
    const c = emptyCircuit();
    assert.throws(() => addRotation(c, 'Rq', 1), /Unsupported rotation/);
    for (const bad of [NaN, Infinity, '45', undefined]) assert.throws(() => addRotation(c, 'Rx', bad), /finite number/);
    assert.equal(c.steps.length, 0);
  });

  test('adding a rotation never mutates the previous circuit', () => {
    const a = addRotation(emptyCircuit(), 'Ry', 1), snapshot = JSON.stringify(a);
    addRotation(a, 'Rx', 2); undo(a);
    assert.equal(JSON.stringify(a), snapshot);
  });

  test('undo after several parameterized gates reconstructs every previous state exactly', () => {
    const r = rng(71);
    let c = emptyCircuit();
    const history = [statesOf(c).at(-1)];
    for (let i = 0; i < 25; i++) {
      c = i % 5 === 4 ? addGate(c, 'H') : addRotation(c, ROTATIONS[i % 3], r() * 2 * PI);
      history.push(statesOf(c).at(-1));
    }
    for (let k = history.length - 2; k >= 0; k--) {
      c = undo(c);
      assert.equal(c.steps.length, k);
      // Exact equality (tolerance 0): replay recomputes the same floating-point operations.
      assertStateClose(statesOf(c).at(-1), history[k], 0, `after undo to step ${k}`);
    }
    assertStateClose(statesOf(c).at(-1), [C(1), C(0)], 0);
  });

  test('undoing Rx(360°) restores +|ψ⟩, not the physically equivalent −|ψ⟩', () => {
    const prepared = addRotation(emptyCircuit(), 'Ry', PI / 3), turned = addRotation(prepared, 'Rx', 2 * PI);
    const [before, after] = statesOf(turned).slice(-2);
    assertStateClose(after, before.map((a) => C(-a.re, -a.im)), 1e-15);
    assertStateClose(statesOf(undo(turned)).at(-1), before, 0);
  });

  test('clearing (a new empty circuit) returns to |0⟩ and removes all rotation history', () => {
    let c = addRotation(addRotation(emptyCircuit(), 'Rx', 1), 'Rz', 2);
    c = emptyCircuit();
    assert.equal(c.steps.length, 0);
    assertStateClose(statesOf(c).at(-1), [C(1), C(0)], 0);
  });

  test('rotations act on the collapsed state after a measurement', () => {
    const c = addRotation(addMeasurement(addRotation(emptyCircuit(), 'Ry', PI / 2), 1), 'Ry', PI / 2);
    assertVectorClose(bloch(statesOf(c).at(-1)), {x: -1, y: 0, z: 0}, 1e-15);
  });

  test('a rotation after a slider preparation starts a new step (preparations still collapse)', () => {
    const c = addPreparation(addRotation(addPreparation(addPreparation(emptyCircuit(), 1, 0), 2, 0), 'Rz', 1), 1, 1);
    assert.deepEqual(c.steps.map((s) => s.type), ['prepare', 'rotation', 'prepare']);
  });

  test('circuitOf copies its steps', () => {
    const steps = [{type: 'rotation', gate: 'Rx', theta: 1}], c = circuitOf(steps);
    c.steps[0].theta = 2;
    assert.equal(steps[0].theta, 1);
  });
});

describe('rotation boxes in the circuit diagram', () => {
  test('show R with the axis subscript and the angle in degrees', () => {
    const html = renderCircuit(addRotation(addGate(emptyCircuit(), 'H'), 'Rz', PI / 4).steps, 2);
    assert.ok(html.includes('class="c-node c-gate c-rot"'));
    assert.ok(html.includes('R<sub>z</sub>') && html.includes('<span class="c-rot-angle">45°</span>'));
    assert.ok(html.includes('aria-label="Step 2: Rz(45°), rotation by π/4 rad about the Z axis" aria-current="step"'));
  });

  test('fixed gates keep their plain boxes alongside rotations', () => {
    const html = renderCircuit(addGate(addRotation(emptyCircuit(), 'Rx', 1), 'X').steps, 0);
    const letters = [...html.matchAll(/class="c-node c-gate"[^>]*>([A-Z])</g)].map((m) => m[1]);
    assert.deepEqual(letters, ['X']);
  });

  test('non-preset angles are labelled readably', () => {
    assert.equal(stepLabel({type: 'rotation', gate: 'Ry', theta: 22.5 * PI / 180}), 'Ry(22.5°), rotation by π/8 rad about the Y axis');
    assert.equal(stepLabel({type: 'rotation', gate: 'Rx', theta: PI / 180}), 'Rx(1°), rotation by 0.017 rad about the X axis');
    assert.equal(stepLabel({type: 'rotation', gate: 'Rx', theta: 0}), 'Rx(0°), rotation by 0 rad about the X axis');
  });
});
