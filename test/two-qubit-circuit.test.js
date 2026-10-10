import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {C, gates} from '../quantum.js';
import {rotationMatrix} from '../rotations.js';
import {emptyCircuit, undo, circuitOf} from '../circuit.js';
import {addGate2, addRotation2, addTwoQubitGate, addMeasurement2, statesOf2, applyStep2, operatorOf} from '../two-qubit-circuit.js';
import {basis2, initial2, singleQubitOperator, applyOperator, probabilities2} from '../multi-qubit.js';
import {twoQubitMatrix} from '../controlled-gates.js';
import {concurrence} from '../entanglement.js';
import {renderCircuit2, stepLabel2} from '../two-qubit-circuit-view.js';
import {exactReal, exactComplex, formatEntry, formatKet1, formatKet2, formatMatrix} from '../two-qubit-format.js';
import {twoQubitExperiments, bellStates, choiceMatches2, judgeTwoQubit, experimentResult2, experimentSteps2} from '../two-qubit-experiments.js';
import {MINUS} from '../format.js';
import {rng, assertClose, assertMatrixCloseN, assertState4Close} from './helpers.js';

const R = Math.SQRT1_2, PI = Math.PI;

describe('two-qubit circuit history', () => {
  test('starts at |00⟩ with no steps', () => {
    assertState4Close(statesOf2(emptyCircuit()).at(-1), initial2(), 0);
  });

  test('steps store gate type, target, control and rotation parameter', () => {
    let c = addGate2(emptyCircuit(), 'H', 0);
    c = addRotation2(c, 'Ry', PI / 2, 1);
    c = addTwoQubitGate(c, 'CNOT', 1, 0);
    c = addTwoQubitGate(c, 'SWAP');
    c = addTwoQubitGate(c, 'CZ', 0, 1);
    c = addMeasurement2(c, 0, 1);
    assert.deepEqual(c.steps, [
      {type: 'gate', gate: 'H', target: 0},
      {type: 'rotation', gate: 'Ry', theta: PI / 2, target: 1},
      {type: 'two', gate: 'CNOT', control: 1, target: 0},
      {type: 'two', gate: 'SWAP'},
      {type: 'two', gate: 'CZ', control: 0, target: 1},
      {type: 'measure', qubit: 0, outcome: 1},
    ]);
  });

  test('replay agrees with applying the 4×4 operators directly', () => {
    let c = addGate2(emptyCircuit(), 'H', 0);
    c = addRotation2(c, 'Rx', 0.4, 1);
    c = addTwoQubitGate(c, 'CNOT', 0, 1);
    c = addGate2(c, 'T', 1);
    let s = initial2();
    s = applyOperator(s, singleQubitOperator(gates.H, 0));
    s = applyOperator(s, singleQubitOperator(rotationMatrix('Rx', 0.4), 1));
    s = applyOperator(s, twoQubitMatrix('CNOT', 0, 1));
    s = applyOperator(s, singleQubitOperator(gates.T, 1));
    assertState4Close(statesOf2(c).at(-1), s, 0);
  });

  test('invalid steps never enter the history', () => {
    const c = emptyCircuit();
    assert.throws(() => addGate2(c, 'Q', 0), /Unsupported gate/);
    assert.throws(() => addGate2(c, 'H', 2), /Target qubit/);
    assert.throws(() => addRotation2(c, 'Rx', NaN, 0), /finite number/);
    assert.throws(() => addRotation2(c, 'Rx', 1, 3), /Target qubit/);
    assert.throws(() => addTwoQubitGate(c, 'CNOT', 0, 0), /different qubits/);
    assert.throws(() => addTwoQubitGate(c, 'CY', 0, 1), /Unsupported two-qubit gate/);
    assert.throws(() => addMeasurement2(c, 2, 0), /Invalid measurement/);
    assert.throws(() => addMeasurement2(c, 'both', 4), /Invalid measurement/);
    assert.throws(() => applyStep2(initial2(), {type: 'teleport'}), /Unknown circuit step/);
    assert.equal(c.steps.length, 0);
  });

  test('undo after a mixed sequence reconstructs every prior state exactly', () => {
    const r = rng(401);
    let c = emptyCircuit();
    const history = [statesOf2(c).at(-1)];
    const moves = [
      (x) => addGate2(x, ['H', 'X', 'Y', 'Z', 'S', 'T'][Math.floor(r() * 6)], Math.floor(r() * 2)),
      (x) => addRotation2(x, ['Rx', 'Ry', 'Rz'][Math.floor(r() * 3)], r() * 2 * PI, Math.floor(r() * 2)),
      (x) => addTwoQubitGate(x, 'CNOT', 0, 1),
      (x) => addTwoQubitGate(x, 'CNOT', 1, 0),
      (x) => addTwoQubitGate(x, 'CZ', 0, 1),
      (x) => addTwoQubitGate(x, 'SWAP'),
    ];
    for (let i = 0; i < 60; i++) {
      c = moves[i % moves.length](c);
      history.push(statesOf2(c).at(-1));
    }
    for (let k = history.length - 2; k >= 0; k--) {
      c = undo(c);
      assertState4Close(statesOf2(c).at(-1), history[k], 0, `undo to step ${k}`);
    }
  });

  test('undoing a measurement restores the entangled state', () => {
    const bell = circuitOf(bellStates[0].steps), measured = addMeasurement2(bell, 0, 1);
    assertState4Close(statesOf2(measured).at(-1), basis2(3), 1e-15);
    assertState4Close(statesOf2(undo(measured)).at(-1), bellStates[0].state, 0);
    assertClose(concurrence(statesOf2(undo(measured)).at(-1)), 1, 1e-15);
  });

  test('measuring both qubits collapses to the recorded basis state', () => {
    const c = addMeasurement2(circuitOf(bellStates[2].steps), 'both', 2);
    assertState4Close(statesOf2(c).at(-1), basis2(2), 0);
  });

  test('clear (a new empty circuit) returns to |00⟩', () => {
    assertState4Close(statesOf2(emptyCircuit()).at(-1), initial2(), 0);
  });

  test('operatorOf describes how each 4×4 matrix is built', () => {
    assert.equal(operatorOf({type: 'gate', gate: 'H', target: 0}).factors, 'H ⊗ I');
    assert.equal(operatorOf({type: 'gate', gate: 'H', target: 1}).factors, 'I ⊗ H');
    assert.equal(operatorOf({type: 'rotation', gate: 'Ry', theta: 1, target: 1}).factors, 'I ⊗ Ry(θ)');
    assert.equal(operatorOf({type: 'two', gate: 'CNOT', control: 0, target: 1}).factors, '|0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ X');
    assert.equal(operatorOf({type: 'two', gate: 'CNOT', control: 1, target: 0}).factors, 'I ⊗ |0⟩⟨0| + X ⊗ |1⟩⟨1|');
    assert.equal(operatorOf({type: 'two', gate: 'SWAP'}).factors, 'SWAP');
    assert.equal(operatorOf({type: 'measure', qubit: 0, outcome: 0}), null);
    assertMatrixCloseN(operatorOf({type: 'gate', gate: 'X', target: 1}).matrix, singleQubitOperator(gates.X, 1), 0);
  });
});

describe('two-wire circuit diagram markup', () => {
  const count = (html, pattern) => (html.match(pattern) || []).length;
  const build = () => {
    let c = addGate2(emptyCircuit(), 'H', 0);
    c = addTwoQubitGate(c, 'CNOT', 0, 1);
    c = addRotation2(c, 'Ry', PI / 2, 1);
    c = addTwoQubitGate(c, 'CZ', 0, 1);
    c = addTwoQubitGate(c, 'SWAP');
    c = addTwoQubitGate(c, 'CNOT', 1, 0);
    return addMeasurement2(c, 'both', 3);
  };

  test('labels both wires q0 and q1 and has one selectable column per step plus the input', () => {
    const html = renderCircuit2(build().steps, 7);
    assert.ok(html.includes('>q0<') && html.includes('>q1<'));
    assert.equal(count(html, /data-step="/g), 8);
    assert.equal(count(html, /aria-current="step"/g), 1);
    assert.equal(count(html, /<button/g), count(html, /aria-label="/g));
  });

  test('single-qubit gates sit on the selected wire', () => {
    const html = renderCircuit2(addGate2(addGate2(emptyCircuit(), 'H', 1), 'X', 0).steps, 0);
    assert.match(html, /data-step="1"[^>]*><span class="c2-cell q0"><\/span><span class="c2-cell q1"><span class="g2-box">H<\/span>/);
    assert.match(html, /data-step="2"[^>]*><span class="c2-cell q0"><span class="g2-box">X<\/span>/);
  });

  test('CNOT uses a control dot and a ⊕ target joined by a line, in either direction', () => {
    const html = renderCircuit2(build().steps, 0);
    assert.match(html, /CNOT, control q0, target q1"[^>]*><span class="c2-cell q0"><span class="g2-dot"><\/span><\/span><span class="c2-cell q1"><span class="g2-target">⊕<\/span>/);
    assert.match(html, /CNOT, control q1, target q0"[^>]*><span class="c2-cell q0"><span class="g2-target">⊕<\/span><\/span><span class="c2-cell q1"><span class="g2-dot"><\/span>/);
    assert.equal(count(html, /class="c2-link"/g), 4);
  });

  test('CZ uses two control dots; SWAP uses two crosses', () => {
    const html = renderCircuit2(build().steps, 0);
    assert.match(html, /CZ on q0 and q1"[^>]*><span class="c2-cell q0"><span class="g2-dot"><\/span><\/span><span class="c2-cell q1"><span class="g2-dot"><\/span>/);
    assert.equal(count(html, /class="g2-swap"/g), 2);
  });

  test('rotations keep their parameter; measurements show their outcome on each wire', () => {
    const html = renderCircuit2(build().steps, 0);
    assert.ok(html.includes('R<sub>y</sub></span><span class="c-rot-angle">90°</span>'));
    assert.ok(html.includes('aria-label="Step 7: measure both qubits, outcome |11⟩"'));
    assert.equal(count(html, /class="g2-meter"/g), 2);
  });

  test('step labels', () => {
    assert.equal(stepLabel2({type: 'gate', gate: 'H', target: 1}), 'H on q1');
    assert.equal(stepLabel2({type: 'rotation', gate: 'Rz', theta: PI / 4, target: 0}), 'Rz(45°) on q0');
    assert.equal(stepLabel2({type: 'two', gate: 'CNOT', control: 0, target: 1}), 'CNOT, control q0, target q1');
    assert.equal(stepLabel2({type: 'two', gate: 'CZ', control: 0, target: 1}), 'CZ on q0 and q1');
    assert.equal(stepLabel2({type: 'two', gate: 'SWAP'}), 'SWAP q0 ↔ q1');
    assert.equal(stepLabel2({type: 'measure', qubit: 1, outcome: 0}), 'measure q1, outcome 0');
    assert.throws(() => stepLabel2({type: 'teleport'}));
  });
});

describe('two-qubit formatting', () => {
  test('exact values are recognized within tolerance, never noise', () => {
    assert.equal(exactReal(R), '1/√2');
    assert.equal(exactReal(-R), `${MINUS}1/√2`);
    assert.equal(exactReal(0.5000000000000001), '1/2');
    assert.equal(exactReal(6.1e-17), '0');
    assert.equal(exactReal(-1e-17), '0');
    assert.equal(exactReal(Math.sqrt(3) / 2), '√3/2');
    assert.equal(exactReal(0.3), null);
    assert.equal(exactComplex(C(0, R)), 'i/√2');
    assert.equal(exactComplex(C(0, -1)), `${MINUS}i`);
    assert.equal(exactComplex(C(0.5, -0.5)), `(1/2 ${MINUS} i/2)`);
    assert.equal(exactComplex(C(0.3, 0)), null);
    assert.equal(formatEntry(C(0.3, 0)), '0.300');
  });

  test('Dirac notation in |q0 q1⟩ order, omitting zero terms', () => {
    assert.equal(formatKet2(bellStates[0].state), '1/√2 |00⟩ + 1/√2 |11⟩');
    assert.equal(formatKet2(bellStates[1].state), `1/√2 |00⟩ ${MINUS} 1/√2 |11⟩`);
    assert.equal(formatKet2(bellStates[3].state), `1/√2 |01⟩ ${MINUS} 1/√2 |10⟩`);
    assert.equal(formatKet2(bellStates[0].state, {exact: false}), '0.707 |00⟩ + 0.707 |11⟩');
    assert.equal(formatKet2(basis2(2)), '|10⟩');
    assert.equal(formatKet2(basis2(2).map((a) => C(-a.re))), `${MINUS}|10⟩`);
    assert.equal(formatKet2([C(0.5), C(0.5), C(0.5), C(-0.5)]), `1/2 |00⟩ + 1/2 |01⟩ + 1/2 |10⟩ ${MINUS} 1/2 |11⟩`);
    assert.equal(formatKet2([C(0.6), C(0), C(0), C(0.8)]), '0.600 |00⟩ + 0.800 |11⟩');
  });

  test('single-qubit factors use the same exact style', () => {
    assert.equal(formatKet1([C(R), C(R)]), '1/√2 |0⟩ + 1/√2 |1⟩');
    assert.equal(formatKet1([C(1), C(0)]), '|0⟩');
    assert.equal(formatKet1([C(0), C(0, -1)]), `${MINUS}i |1⟩`);
  });

  test('no floating-point noise in matrices of any gate', () => {
    const ms = [singleQubitOperator(gates.H, 0), singleQubitOperator(rotationMatrix('Ry', PI), 1), twoQubitMatrix('CNOT', 1, 0), twoQubitMatrix('CZ')];
    for (const M of ms) for (const text of formatMatrix(M).flat()) assert.ok(!/e-|NaN|-0|−0\.000/.test(text), text);
  });
});

describe('two-qubit guided experiments', () => {
  test('the four required experiments are present', () => {
    assert.deepEqual(twoQubitExperiments.map((e) => e.id), ['bell-pair', 'superposition-vs-entanglement', 'swap', 'cz']);
  });

  for (const exp of twoQubitExperiments) {
    test(`${exp.id}: exactly one choice matches the simulation`, () => {
      const matches = exp.choices.filter((c) => choiceMatches2(exp, c));
      assert.equal(matches.length, 1, matches.map((m) => m.label).join(', '));
      const index = exp.choices.indexOf(matches[0]);
      exp.choices.forEach((_, i) => assert.equal(judgeTwoQubit(exp, i).correct, i === index));
    });
  }

  test('Experiment 1 gives (|00⟩ + |11⟩)/√2', () => {
    const exp = twoQubitExperiments[0];
    assertState4Close(experimentResult2(exp), bellStates[0].state, 0);
    assert.deepEqual(experimentSteps2(exp), bellStates[0].steps);
  });

  test('Experiment 2: A is separable, B entangled, as the explanation computes', () => {
    const exp = twoQubitExperiments[1];
    assert.equal(concurrence(statesOf2(circuitOf(exp.compare.A)).at(-1)), 0);
    assertClose(concurrence(statesOf2(circuitOf(exp.compare.B)).at(-1)), 1, 1e-15);
    assert.match(exp.explanation, /\|\+⟩ ⊗ \|0⟩/);
  });

  test('Experiment 3: SWAP takes |10⟩ to |01⟩ exactly', () => {
    const exp = twoQubitExperiments[2];
    assertState4Close(statesOf2(circuitOf(exp.setup)).at(-1), basis2(2), 0);
    assertState4Close(experimentResult2(exp), basis2(1), 0);
  });

  test('Experiment 4: CZ|++⟩ = (|00⟩ + |01⟩ + |10⟩ − |11⟩)/2, all 25%, C = 1', () => {
    const exp = twoQubitExperiments[3], s = experimentResult2(exp);
    assertState4Close(s, [C(0.5), C(0.5), C(0.5), C(-0.5)], 1e-15);
    probabilities2(s).forEach((p) => assertClose(p, 0.25, 1e-15));
    assertClose(concurrence(s), 1, 1e-15);
    assertClose(concurrence(statesOf2(circuitOf(exp.setup)).at(-1)), 0, 1e-15);
  });
});
