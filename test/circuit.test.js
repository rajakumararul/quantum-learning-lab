import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {C, initial, applyGate, fromAngles, bloch} from '../quantum.js';
import {emptyCircuit, addGate, addMeasurement, addPreparation, undo, applyStep, statesOf} from '../circuit.js';
import {renderCircuit, stepLabel} from '../circuit-view.js';
import {rng, assertStateClose, assertVectorClose} from './helpers.js';

const GATES = ['X', 'Y', 'Z', 'H', 'S', 'T'];
const build = (...gateNames) => gateNames.reduce(addGate, emptyCircuit());

describe('circuit history', () => {
  test('starts empty with the single state |0⟩', () => {
    const states = statesOf(emptyCircuit());
    assert.equal(states.length, 1);
    assertStateClose(states[0], initial(), 0);
  });

  test('records gates in chronological order', () => {
    assert.deepEqual(build('H', 'S', 'T').steps.map((s) => s.gate), ['H', 'S', 'T']);
  });

  test('statesOf gives |0⟩ followed by the state after every step', () => {
    const random = rng(31), sequence = Array.from({length: 40}, () => GATES[Math.floor(random() * 6)]);
    const states = statesOf(build(...sequence));
    assert.equal(states.length, sequence.length + 1);
    let expected = initial();
    sequence.forEach((g, k) => {
      expected = applyGate(expected, g);
      assertStateClose(states[k + 1], expected, 1e-12, `after step ${k + 1}`);
    });
  });

  test('keeps global phase (no canonicalization): Y|0⟩ = i|1⟩', () => {
    assertStateClose(statesOf(build('Y')).at(-1), [C(0), C(0, 1)], 0);
  });

  test('operations never mutate the previous circuit', () => {
    const a = build('H'), snapshot = JSON.stringify(a);
    addGate(a, 'X'); addMeasurement(a, 1); addPreparation(a, 1, 2); undo(a);
    assert.equal(JSON.stringify(a), snapshot);
  });

  test('undo removes only the last step and restores the previous state', () => {
    const circuit = build('H', 'S', 'X');
    const undone = undo(circuit);
    assert.deepEqual(undone.steps.map((s) => s.gate), ['H', 'S']);
    assertStateClose(statesOf(undone).at(-1), statesOf(circuit)[2], 0);
  });

  test('undo on an empty circuit is a no-op', () => {
    assert.deepEqual(undo(emptyCircuit()), emptyCircuit());
  });

  test('undo repeatedly returns to |0⟩', () => {
    let circuit = build('H', 'T', 'Y', 'Z');
    for (let i = 0; i < 4; i++) circuit = undo(circuit);
    assert.equal(circuit.steps.length, 0);
    assertStateClose(statesOf(circuit).at(-1), initial(), 0);
  });

  test('clear (a new empty circuit) resets both state and history', () => {
    const cleared = emptyCircuit();
    assert.equal(cleared.steps.length, 0);
    assertStateClose(statesOf(cleared).at(-1), initial(), 0);
  });

  test('measurement collapses to the recorded outcome and later gates act on it', () => {
    const circuit = addGate(addMeasurement(build('H'), 1), 'H');
    const states = statesOf(circuit);
    assertStateClose(states[2], [C(0), C(1)], 0);
    assertVectorClose(bloch(states[3]), {x: -1, y: 0, z: 0}, 1e-12);
  });

  test('undoing a measurement restores the pre-measurement superposition', () => {
    const circuit = undo(addMeasurement(build('H'), 0));
    assertVectorClose(bloch(statesOf(circuit).at(-1)), {x: 1, y: 0, z: 0}, 1e-12);
  });

  test('preparation replaces the state with fromAngles(θ, φ)', () => {
    const states = statesOf(addPreparation(build('X'), Math.PI / 3, Math.PI / 5));
    assertStateClose(states.at(-1), fromAngles(Math.PI / 3, Math.PI / 5), 0);
  });

  test('consecutive slider preparations collapse into a single undoable step', () => {
    let circuit = build('H');
    for (let t = 1; t <= 30; t++) circuit = addPreparation(circuit, t * Math.PI / 180, 0);
    assert.equal(circuit.steps.length, 2);
    assert.equal(circuit.steps[1].theta, 30 * Math.PI / 180);
    assertVectorClose(bloch(statesOf(undo(circuit)).at(-1)), {x: 1, y: 0, z: 0}, 1e-12);
  });

  test('a preparation after a gate starts a new step', () => {
    const circuit = addPreparation(addGate(addPreparation(emptyCircuit(), 1, 0), 'H'), 2, 0);
    assert.deepEqual(circuit.steps.map((s) => s.type), ['prepare', 'gate', 'prepare']);
  });

  test('unknown step types and gates throw', () => {
    assert.throws(() => applyStep(initial(), {type: 'teleport'}), /Unknown circuit step/);
    assert.throws(() => statesOf(build('Q')), /Unsupported gate/);
  });
});

describe('circuit diagram markup', () => {
  const count = (html, pattern) => (html.match(pattern) || []).length;

  test('has one selectable symbol per step plus the input |0⟩', () => {
    const html = renderCircuit(build('H', 'S', 'T').steps, 3);
    assert.equal(count(html, /data-step="/g), 4);
    for (let k = 0; k <= 3; k++) assert.ok(html.includes(`data-step="${k}"`));
    assert.ok(html.includes('>|0⟩</button>'));
  });

  test('gate boxes show the gate letter in circuit order', () => {
    const html = renderCircuit(build('H', 'X', 'Z').steps, 0);
    const letters = [...html.matchAll(/class="c-node c-gate"[^>]*>([A-Z])</g)].map((m) => m[1]);
    assert.deepEqual(letters, ['H', 'X', 'Z']);
  });

  test('exactly the selected step is marked aria-current', () => {
    const steps = build('H', 'S').steps;
    for (let k = 0; k <= 2; k++) {
      const html = renderCircuit(steps, k);
      assert.equal(count(html, /aria-current="step"/g), 1);
      assert.match(html, new RegExp(`data-step="${k}" aria-label="[^"]*" aria-current="step"`));
    }
  });

  test('measurement uses the meter symbol and shows the outcome', () => {
    const html = renderCircuit(addMeasurement(build('H'), 1).steps, 2);
    assert.ok(html.includes('c-measure') && html.includes('<svg'));
    assert.ok(html.includes('<span class="c-outcome">1</span>'));
    assert.ok(html.includes('aria-label="Step 2: measurement, outcome 1"'));
  });

  test('preparation uses a |ψ⟩ box with its angles in the accessible label', () => {
    const html = renderCircuit(addPreparation(emptyCircuit(), Math.PI / 2, Math.PI).steps, 1);
    assert.ok(html.includes('c-prep') && html.includes('>|ψ⟩</button>'));
    assert.ok(html.includes('state preparation θ = 90°, φ = 180°'));
  });

  test('every symbol has an accessible label', () => {
    const html = renderCircuit(addPreparation(addMeasurement(build('H', 'T'), 0), 1, 1).steps, 0);
    assert.equal(count(html, /<button/g), count(html, /aria-label="/g));
  });

  test('step labels', () => {
    assert.equal(stepLabel({type: 'gate', gate: 'H'}), 'H gate');
    assert.equal(stepLabel({type: 'measure', outcome: 0}), 'measurement, outcome 0');
    assert.throws(() => stepLabel({type: 'teleport'}));
  });
});
