import {canonical, bloch, angles, probabilities, measure, decompose} from './quantum.js';
import {formatComplex, formatReal, formatKet, formatStateEquation, formatAngle, formatRadians, formatDegrees, formatRotation} from './format.js';
import {defaultView} from './projection.js';
import {emptyCircuit, addGate, addRotation, addMeasurement, addPreparation, undo, statesOf, circuitOf} from './circuit.js';
import {renderCircuit, stepLabel} from './circuit-view.js';
import {gateInfo} from './gate-info.js';
import {ROTATIONS, rotationAxes} from './rotations.js';
import {rotationInfo} from './rotation-info.js';
import {inspectorContent} from './inspector-view.js';
import {createRotationPanel} from './rotation-panel.js';
import {createExperiments} from './experiments-view.js';
import {drawBlochSphere} from './sphere-view.js';
import {animationFrame, rotationDuration} from './bloch-animation.js';
import {el, math, matrixNode, vectorText, subscript} from './dom.js';

const $ = (id) => document.getElementById(id);
const GATES = Object.keys(gateInfo);

// ---- Application state ------------------------------------------------------
let circuit = emptyCircuit();
let selected = 0; // index into statesOf(circuit) currently displayed; 0 = input |0⟩
let {yaw, pitch} = defaultView, drag = null;
let shown = null, overlay = null; // state drawn on the sphere, and the optional step overlay
// Visual-only animation of the latest step: {from, to, axis, angle, duration, start}. It never changes
// `circuit` or `shown`; when it ends (or is cancelled) the sphere shows bloch(shown) exactly.
let animation = null;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// ---- Actions ----------------------------------------------------------------------
// Every change to the circuit jumps the display to the latest step.
function commit(next, {syncSliders = true, animate = false} = {}) {
  circuit = next;
  selected = circuit.steps.length;
  render({syncSliders});
  if (animate) startAnimation();
}

for (const gate of GATES) {
  const button = el('button', {'aria-label': `Apply ${gate} gate`, title: gateInfo[gate].title}, gate);
  button.addEventListener('click', () => {
    commit(addGate(circuit, gate), {animate: true});
    $('gateInfo').textContent = gateInfo[gate].summary;
    $('measurementResult').textContent = 'Apply more gates or measure this state.';
  });
  $('gates').appendChild(button);
}

$('undo').addEventListener('click', () => {
  if (!circuit.steps.length) return;
  commit(undo(circuit));
  $('gateInfo').textContent = 'Removed the last step.';
  $('measurementResult').textContent = 'Apply more gates or measure this state.';
});

$('clear').addEventListener('click', () => {
  commit(emptyCircuit());
  $('gateInfo').textContent = 'Circuit cleared. The qubit is back at the north pole |0⟩.';
  $('measurementResult').textContent = 'Measurement results appear here. Measuring collapses the state.';
});

createRotationPanel({
  onApply(gate, theta) {
    commit(addRotation(circuit, gate, theta), {animate: true});
    $('gateInfo').textContent = `${formatRotation(gate, theta)} rotates the Bloch vector by ${formatDegrees(theta)} about ${rotationInfo[gate].axisLabel}. See the inspector below for the full calculation.`;
    $('measurementResult').textContent = 'Apply more gates or measure this state.';
  },
});

createExperiments({
  container: $('experiments'),
  demoContainer: $('phaseDemos'),
  load(steps, {animate = false} = {}) {
    commit(circuitOf(steps), {animate});
    $('gateInfo').textContent = 'Experiment loaded. The circuit and history show its steps; select any step to inspect it.';
    $('measurementResult').textContent = 'Apply more gates or measure this state.';
  },
});

for (const id of ['theta', 'phi']) {
  $(id).addEventListener('input', () => {
    commit(addPreparation(circuit, Number($('theta').value) * Math.PI / 180, Number($('phi').value) * Math.PI / 180), {syncSliders: false});
    $('gateInfo').textContent = 'The angles directly prepare a new pure qubit state.';
    $('measurementResult').textContent = 'Apply more gates or measure this state.';
  });
}

$('measure').addEventListener('click', () => {
  const {outcome} = measure(statesOf(circuit).at(-1));
  commit(addMeasurement(circuit, outcome));
  $('measurementResult').textContent = `Outcome |${outcome}⟩. The state collapsed to |${outcome}⟩.`;
  $('gateInfo').textContent = 'Computational-basis measurement projects the state to the observed basis state.';
});

function select(index, {focus = false} = {}) {
  selected = Math.max(0, Math.min(circuit.steps.length, index));
  render();
  if (focus) $('circuit').querySelector(`[data-step="${selected}"]`)?.focus();
}
$('circuit').addEventListener('click', (e) => {
  const node = e.target.closest('[data-step]');
  if (node) select(Number(node.dataset.step), {focus: true});
});
$('circuit').addEventListener('keydown', (e) => {
  const moves = {ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: circuit.steps.length};
  if (!(e.key in moves)) return;
  e.preventDefault();
  select(moves[e.key], {focus: true});
});
$('history').addEventListener('click', (e) => {
  const node = e.target.closest('[data-step]');
  if (node) select(Number(node.dataset.step));
});
$('showLatest').addEventListener('click', () => select(circuit.steps.length));

// ---- Rendering ----------------------------------------------------------------
function render({syncSliders = true} = {}) {
  animation = null; // any re-render shows the exact state immediately
  const states = statesOf(circuit), n = circuit.steps.length;
  selected = Math.min(selected, n);
  const state = states[selected], step = circuit.steps[selected - 1], before = selected > 0 ? states[selected - 1] : null;

  renderState(state, syncSliders);
  renderProbabilities(state);
  renderCircuitPanel(states);
  renderInspector(step, before, state);

  shown = state;
  overlay = overlayFor(step, before);
  $('sphereLegend').hidden = !overlay?.axis;
  draw();
}

// What the sphere shows for the selected step: the state before it and, for any unitary, its rotation.
function overlayFor(step, before) {
  if (!before || step.type === 'prepare') return null;
  const from = bloch(before);
  if (step.type === 'gate') return {from, axis: gateInfo[step.gate].axis, angle: gateInfo[step.gate].angle, label: `${step.gate} axis`};
  if (step.type === 'rotation') return {from, axis: rotationAxes[step.gate], angle: step.theta, label: `${rotationInfo[step.gate].axisName} axis (${step.gate})`};
  return {from};
}

function renderState(state, syncSliders) {
  const [a, b] = state, [ca, cb] = canonical(state), an = angles(state), parts = decompose(state);
  $('stateEquation').textContent = formatStateEquation(a, b);
  $('canonicalEquation').textContent = formatStateEquation(ca, cb);
  $('polarEquation').replaceChildren(math(`= e^{i·${formatRadians(parts.gamma)}} ( ${formatReal(Math.cos(parts.theta / 2))} |0⟩ + e^{i·${formatRadians(parts.phi)}} ${formatReal(Math.sin(parts.theta / 2))} |1⟩ )`));
  $('alpha').textContent = formatComplex(a);
  $('beta').textContent = formatComplex(b);
  const amplitudeParts = (c) => `Re ${formatReal(c.re)} · Im ${formatReal(c.im)} · |·| ${formatReal(Math.hypot(c.re, c.im))} · arg ${formatDegrees(Math.atan2(c.im, c.re))}`;
  $('alphaParts').textContent = amplitudeParts(a);
  $('betaParts').textContent = amplitudeParts(b);
  $('thetaFull').textContent = formatAngle(parts.theta);
  $('phiFull').textContent = parts.phiDefined ? formatAngle(parts.phi) : 'undefined at a pole (shown as 0)';
  $('globalPhase').textContent = formatAngle(parts.gamma);
  $('relativePhase').textContent = parts.phiDefined ? formatAngle(parts.phi) : 'undefined at a pole';

  const t = Math.round(an.theta * 180 / Math.PI), p = (Math.abs(Math.sin(an.theta)) < 1e-9 ? 0 : Math.round(an.phi * 180 / Math.PI)) % 360;
  $('angles').textContent = `θ = ${t}° · φ = ${p}°`;
  if (syncSliders) {
    $('theta').value = t;
    $('phi').value = p;
  }
  $('thetaVal').textContent = `${$('theta').value}°`;
  $('phiVal').textContent = `${$('phi').value}°`;
}

function renderProbabilities(state) {
  const [p0, p1] = probabilities(state);
  $('p0').textContent = `${(p0 * 100).toFixed(1)}%`;
  $('p1').textContent = `${(p1 * 100).toFixed(1)}%`;
  $('bar0').style.width = `${p0 * 100}%`;
  $('bar1').style.width = `${p1 * 100}%`;
}

function renderCircuitPanel(states) {
  const n = circuit.steps.length, scroller = $('circuit');
  scroller.innerHTML = renderCircuit(circuit.steps, selected);
  const current = scroller.querySelector('[aria-current]');
  if (current) {
    const left = current.offsetLeft, right = left + current.offsetWidth;
    if (left < scroller.scrollLeft) scroller.scrollLeft = left - 12;
    else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth + 12;
  }
  $('undo').disabled = n === 0;
  $('clear').disabled = n === 0;
  $('showLatest').hidden = selected === n;
  $('circuitStatus').textContent = n === 0 ? 'Input |0⟩ · no gates yet'
    : selected === n ? `${n} step${n === 1 ? '' : 's'} · showing the latest state`
    : `Inspecting step ${selected} of ${n}`;

  const label = (step) => step.type === 'gate' ? `${step.gate} gate` : step.type === 'rotation' ? formatRotation(step.gate, step.theta) : step.type === 'measure' ? `Measure → ${step.outcome}` : 'Prepare';
  $('history').replaceChildren(...states.map((s, k) => el('li', {},
    el('button', {type: 'button', 'data-step': k, ...(k === selected ? {'aria-current': 'step'} : {})},
      el('span', {class: 'h-index'}, k === 0 ? 'Start' : `${k}`),
      el('span', {class: 'h-step'}, k === 0 ? 'Input' : label(circuit.steps[k - 1])),
      el('span', {class: 'h-state'}, `|ψ${subscript(k)}⟩ = ${formatKet(s[0], s[1])}`)))));
}

function renderInspector(step, before, after) {
  const {title, nodes} = inspectorContent(step, before, after, selected);
  $('inspectorStep').textContent = step ? `Step ${selected}: ${stepLabel(step)}` : '';
  $('inspectorTitle').textContent = title;
  $('inspector').replaceChildren(...nodes);
}

function renderReference() {
  const row = (name, title, matrix, prefactor, rotation, blochMap, dirac, detail) => el('tr', {},
    el('th', {scope: 'row'}, el('span', {class: 'ref-gate'}, name), el('small', {}, title)),
    el('td', {}, matrixNode(matrix, prefactor)),
    el('td', {}, rotation),
    el('td', {class: 'formula'}, blochMap),
    el('td', {class: 'formula'}, dirac),
    el('td', {}, detail));
  $('gateReference').replaceChildren(
    ...GATES.map((g) => {
      const info = gateInfo[g];
      return row(g, info.title, info.matrix, info.prefactor, `${formatDegrees(info.angle)} about ${info.axisLabel}`, info.blochMap, info.dirac, info.detail);
    }),
    ...ROTATIONS.map((g) => {
      const info = rotationInfo[g];
      return row(`${g}`, `${info.title} (θ)`, info.matrix, '', `θ about ${info.axisLabel}`, info.blochMap, info.dirac, info.geometry);
    }));
}

// ---- Bloch sphere drawing ------------------------------------------------------------
const canvas = $('sphere');

function draw(now = performance.now()) {
  let vector = bloch(shown), progress = 1;
  if (animation) {
    const frame = animationFrame(animation, now - animation.start);
    vector = frame.vector; progress = frame.progress;
    if (frame.done) animation = null; // frame.vector is then exactly bloch(shown)
  }
  drawBlochSphere(canvas, {yaw, pitch, vector, overlay: overlay && {...overlay, progress}});
  const step = circuit.steps[selected - 1];
  canvas.setAttribute('aria-label', `Bloch sphere. State vector at (x, y, z) = ${vectorText(bloch(shown))}.${overlay?.axis ? ` Selected step: ${stepLabel(step)}. The rotation axis and path are drawn in violet.` : ''}`);
}

// Animates the latest step's rotation from the previous Bloch vector. Skipped under prefers-reduced-motion,
// where the static axis and path overlay still show the transformation.
function startAnimation() {
  if (!overlay?.axis || Math.abs(overlay.angle) < 1e-9 || reduceMotion()) return;
  animation = {from: overlay.from, to: bloch(shown), axis: overlay.axis, angle: overlay.angle, duration: rotationDuration(overlay.angle), start: performance.now()};
  const tick = (now) => {
    if (!animation) return;
    draw(now);
    if (animation) requestAnimationFrame(tick);
  };
  draw();
  requestAnimationFrame(tick);
}

canvas.addEventListener('pointerdown', (e) => { drag = {x: e.clientX, y: e.clientY, yaw, pitch}; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  yaw = drag.yaw + (e.clientX - drag.x) * .008;
  pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + (e.clientY - drag.y) * .006));
  draw();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });

renderReference();
render();
