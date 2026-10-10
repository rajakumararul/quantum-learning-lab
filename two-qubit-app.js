// Two-qubit mode: UI state and wiring. Its circuit is separate from the single-qubit circuit, so no
// history is ever shared between modes; reset() starts again from |00⟩.
import {ROTATIONS} from './rotations.js';
import {emptyCircuit, undo, circuitOf} from './circuit.js';
import {addGate2, addRotation2, addTwoQubitGate, addMeasurement2, statesOf2} from './two-qubit-circuit.js';
import {measureQubit, measureBoth, BASIS} from './multi-qubit.js';
import {reducedBlochVectors} from './density-matrix.js';
import {concurrence} from './entanglement.js';
import {renderCircuit2, stepLabel2} from './two-qubit-circuit-view.js';
import {amplitudeTable, probabilityHistogram, marginals, entanglementPanel, reducedStatePanel, inspectorContent, bellCard} from './two-qubit-view.js';
import {bellStates, twoQubitExperiments, experimentSteps2, judgeTwoQubit} from './two-qubit-experiments.js';
import {createExperimentCards} from './experiments-view.js';
import {createMeasurementLab} from './measurement-view.js';
import {parseDegrees, degreesToRadians} from './angle-input.js';
import {drawBlochSphere} from './sphere-view.js';
import {defaultView} from './projection.js';
import {formatRotation} from './format.js';
import {formatKet2, formatPercent, formatVector3} from './two-qubit-format.js';
import {el, subscript} from './dom.js';

const SINGLE_GATES = ['H', 'X', 'Y', 'Z', 'S', 'T'];
const TWO_GATES = [
  {label: 'CNOT q0→q1', gate: 'CNOT', control: 0, target: 1, aria: 'Apply CNOT with control q0 and target q1'},
  {label: 'CNOT q1→q0', gate: 'CNOT', control: 1, target: 0, aria: 'Apply CNOT with control q1 and target q0'},
  {label: 'CZ', gate: 'CZ', control: 0, target: 1, aria: 'Apply controlled-Z to q0 and q1'},
  {label: 'SWAP', gate: 'SWAP', aria: 'Swap q0 and q1'},
];

export function createTwoQubitMode({history}) {
  const $ = (id) => document.getElementById(id);
  let circuit = emptyCircuit(), selected = 0, target = 0, lab = null;
  let {yaw, pitch} = defaultView;
  const spheres = [$('tqSphere0'), $('tqSphere1')];

  function commit(next, message) {
    circuit = next;
    selected = circuit.steps.length;
    render();
    if (message) $('tqInfo').textContent = message;
  }
  // Every action goes through here so an invalid step shows a message instead of breaking the page.
  function attempt(build, message) {
    try { commit(build(circuit), message); } catch (error) { $('tqInfo').textContent = error.message; }
  }

  // ---- Controls -----------------------------------------------------------------
  for (const q of [0, 1]) {
    $(`tqTarget${q}`).addEventListener('change', () => { target = q; updateGateLabels(); });
  }
  for (const g of SINGLE_GATES) {
    const button = el('button', {type: 'button', 'data-gate': g}, g);
    button.addEventListener('click', () => attempt((c) => addGate2(c, g, target), `${g} applied to q${target}: the 4×4 operator is ${target === 0 ? `${g} ⊗ I` : `I ⊗ ${g}`}.`));
    $('tqGates').append(button);
  }
  function updateGateLabels() {
    for (const b of $('tqGates').children) b.setAttribute('aria-label', `Apply ${b.dataset.gate} to q${target}`);
    $('tqRotApply').textContent = rotationLabel();
  }
  for (const g of ROTATIONS) $('tqRotGate').append(el('option', {value: g}, `${g}(θ)`));
  function rotationLabel() {
    const parsed = parseDegrees($('tqRotAngle').value);
    return parsed.ok ? `Apply ${formatRotation($('tqRotGate').value, parsed.radians)} to q${target}` : 'Apply rotation';
  }
  function validateRotation() {
    const parsed = parseDegrees($('tqRotAngle').value);
    $('tqRotAngle').setAttribute('aria-invalid', String(!parsed.ok));
    $('tqRotError').hidden = parsed.ok;
    $('tqRotError').textContent = parsed.ok ? '' : parsed.message;
    $('tqRotApply').disabled = !parsed.ok;
    $('tqRotApply').textContent = rotationLabel();
    return parsed;
  }
  $('tqRotAngle').addEventListener('input', validateRotation);
  $('tqRotGate').addEventListener('change', validateRotation);
  $('tqRotApply').addEventListener('click', () => {
    const parsed = validateRotation();
    if (!parsed.ok) return;
    const gate = $('tqRotGate').value;
    attempt((c) => addRotation2(c, gate, degreesToRadians(parsed.degrees), target), `${formatRotation(gate, degreesToRadians(parsed.degrees))} applied to q${target}.`);
  });

  for (const t of TWO_GATES) {
    const button = el('button', {type: 'button', 'aria-label': t.aria}, t.label);
    button.addEventListener('click', () => attempt((c) => addTwoQubitGate(c, t.gate, t.control, t.target), `${t.label} applied.`));
    $('tqTwoGates').append(button);
  }

  const current = () => statesOf2(circuit).at(-1);
  // One real measurement of the live state, recorded as a circuit step. target: 'joint', 0 or 1.
  function measureLive(target) {
    const before = current();
    const {outcome} = target === 'joint' ? measureBoth(before) : measureQubit(before, target);
    commit(addMeasurement2(circuit, target === 'joint' ? 'both' : target, outcome));
    $('tqMeasureResult').textContent = target === 'joint'
      ? `Both qubits measured: outcome |${BASIS[outcome]}⟩.`
      : `q${target} gave ${outcome}. The state is now ${formatKet2(current())}.`;
    return {outcome, before, after: current()};
  }
  $('tqMeasure0').addEventListener('click', () => measureLive(0));
  $('tqMeasure1').addEventListener('click', () => measureLive(1));
  $('tqMeasureBoth').addEventListener('click', () => measureLive('joint'));

  $('tqUndo').addEventListener('click', () => { if (circuit.steps.length) commit(undo(circuit), 'Removed the last step.'); });
  $('tqClear').addEventListener('click', () => reset('Circuit cleared. Both qubits are back in |00⟩.'));

  function select(index, {focus = false} = {}) {
    selected = Math.max(0, Math.min(circuit.steps.length, index));
    render();
    if (focus) $('tqCircuit').querySelector(`[data-step="${selected}"]`)?.focus();
  }
  $('tqCircuit').addEventListener('click', (e) => { const n = e.target.closest('[data-step]'); if (n) select(Number(n.dataset.step), {focus: true}); });
  $('tqCircuit').addEventListener('keydown', (e) => {
    const moves = {ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: circuit.steps.length};
    if (!(e.key in moves)) return;
    e.preventDefault();
    select(moves[e.key], {focus: true});
  });
  $('tqHistory').addEventListener('click', (e) => { const n = e.target.closest('[data-step]'); if (n) select(Number(n.dataset.step)); });
  $('tqShowLatest').addEventListener('click', () => select(circuit.steps.length));

  // Reduced-state spheres share one orbit-able view.
  for (const canvas of spheres) {
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = {x: e.clientX, y: e.clientY, yaw, pitch}; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      yaw = drag.yaw + (e.clientX - drag.x) * .008;
      pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + (e.clientY - drag.y) * .006));
      drawSpheres(statesOf2(circuit)[selected]);
    });
    for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { drag = null; });
  }

  const load = (steps) => commit(circuitOf(steps), 'Loaded. The circuit and history show each step; select a step to inspect it.');
  for (const bell of bellStates) {
    $('tqBell').append(bellCard(bell, (b) => commit(circuitOf(b.steps), `Prepared |${b.name}⟩ = ${b.formula}. Both reduced Bloch vectors are at the centre: C = 1.`)));
  }
  createExperimentCards({
    container: $('tqExperiments'), items: twoQubitExperiments, idPrefix: 'tq-exp', load,
    actionText: (exp) => exp.actionText,
    steps: (exp, withActions) => experimentSteps2(exp, {withActions}),
    judge: judgeTwoQubit,
    resultNodes: (state) => [
      el('p', {class: 'formula'}, `|ψ⟩ = ${formatKet2(state)}`),
      el('p', {class: 'formula'}, `${BASIS.map((b, k) => `P(${b}) = ${formatPercent(state[k].re ** 2 + state[k].im ** 2)}`).join(', ')}; C = ${concurrence(state).toFixed(3)}`)],
  });

  // ---- Rendering --------------------------------------------------------------------
  function drawSpheres(state) {
    reducedBlochVectors(state).forEach((vector, q) => {
      drawBlochSphere(spheres[q], {yaw, pitch, vector, overlay: null});
      spheres[q].setAttribute('aria-label', `Reduced Bloch vector of q${q}: ${formatVector3(vector)}, length ${Math.hypot(vector.x, vector.y, vector.z).toFixed(3)}.`);
    });
  }

  function render() {
    const states = statesOf2(circuit), n = circuit.steps.length;
    selected = Math.min(selected, n);
    const state = states[selected], step = circuit.steps[selected - 1], before = selected > 0 ? states[selected - 1] : null;

    const scroller = $('tqCircuit');
    scroller.innerHTML = renderCircuit2(circuit.steps, selected);
    // Keep the selected column visible by scrolling the circuit sideways only (never the page).
    const cur = scroller.querySelector('[aria-current]');
    if (cur) {
      const left = cur.offsetLeft, right = left + cur.offsetWidth;
      const pinned = scroller.querySelector('.c2-labels')?.offsetWidth ?? 0; // sticky wire labels cover the left edge
      if (left - pinned < scroller.scrollLeft) scroller.scrollLeft = left - pinned - 12;
      else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth + 12;
    }
    $('tqUndo').disabled = n === 0;
    $('tqClear').disabled = n === 0;
    $('tqShowLatest').hidden = selected === n;
    $('tqStatus').textContent = n === 0 ? 'Input |00⟩ · no gates yet' : selected === n ? `${n} step${n === 1 ? '' : 's'} · showing the latest state` : `Inspecting step ${selected} of ${n}`;
    $('tqHistory').replaceChildren(...states.map((s, k) => el('li', {},
      el('button', {type: 'button', 'data-step': k, ...(k === selected ? {'aria-current': 'step'} : {})},
        el('span', {class: 'h-index'}, k === 0 ? 'Start' : `${k}`),
        el('span', {class: 'h-step'}, k === 0 ? 'Input' : stepLabel2(circuit.steps[k - 1])),
        el('span', {class: 'h-state'}, `|ψ${subscript(k)}⟩ = ${formatKet2(s)}`)))));

    $('tqKet').textContent = `|ψ⟩ = ${formatKet2(state)}`;
    $('tqKetDecimal').textContent = `= ${formatKet2(state, {exact: false})}`;
    $('tqAmps').replaceChildren(amplitudeTable(state));
    $('tqProbs').replaceChildren(probabilityHistogram(state), marginals(state));
    $('tqEntanglement').replaceChildren(...entanglementPanel(state));
    $('tqReduced0').replaceChildren(...reducedStatePanel(state, 0));
    $('tqReduced1').replaceChildren(...reducedStatePanel(state, 1));
    const {title, nodes} = inspectorContent(step, before, state, selected);
    $('tqInspectorTitle').textContent = title;
    $('tqInspectorStep').textContent = step ? `Step ${selected}` : '';
    $('tqInspector').replaceChildren(...nodes);
    drawSpheres(state);
    lab?.update();
  }

  function reset(message = 'Two-qubit mode: both qubits start in |00⟩. Choose a target qubit and apply gates.') {
    commit(emptyCircuit(), message);
    $('tqMeasureResult').textContent = 'Measure one qubit, or both. Measuring collapses the state.';
  }

  const ketLabel = (k, state) => `|ψ${subscript(k)}⟩ = ${formatKet2(state)}`;
  lab = createMeasurementLab({
    root: $('labTwo'), mode: 'two', prefix: 'mt', history,
    getShown: () => {
      const state = statesOf2(circuit)[selected];
      return {state, label: ketLabel(selected, state), afterMeasurement: circuit.steps.slice(0, selected).some((s) => s.type === 'measure')};
    },
    getLive: () => ({state: current(), label: ketLabel(circuit.steps.length, current()), format: formatKet2}),
    measureLive,
    loadSteps: load,
  });

  updateGateLabels();
  validateRotation();
  reset();
  return {reset};
}
