import {gates, canonical, bloch, angles, probabilities, measure, decompose, matrixVectorSteps} from './quantum.js';
import {formatComplex, formatReal, formatSum, formatKet, formatStateEquation, formatAngle, formatRadians, formatDegrees} from './format.js';
import {defaultView, projectBloch} from './projection.js';
import {emptyCircuit, addGate, addMeasurement, addPreparation, undo, statesOf} from './circuit.js';
import {renderCircuit, stepLabel} from './circuit-view.js';
import {gateInfo, rotateAbout} from './gate-info.js';

const $ = (id) => document.getElementById(id);
const GATES = Object.keys(gateInfo);

// ---- Application state ------------------------------------------------------
let circuit = emptyCircuit();
let selected = 0; // index into statesOf(circuit) currently displayed; 0 = input |0⟩
let {yaw, pitch} = defaultView, drag = null;
let shown = null, overlay = null; // state drawn on the sphere, and the optional gate overlay

// ---- Small DOM helpers ----------------------------------------------------------
// Renders text with e^{...} exponents as superscripts; never parses HTML.
function math(text) {
  const fragment = document.createDocumentFragment();
  String(text).split(/\^\{([^}]*)\}/).forEach((part, i) => fragment.append(i % 2 ? el('sup', {}, part) : document.createTextNode(part)));
  return fragment;
}
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) if (child != null) node.append(child instanceof Node ? child : math(child));
  return node;
}
// A bracketed matrix or column vector; rows is an array of arrays of display strings.
function matrixNode(rows, prefactor = '') {
  const grid = el('span', {class: 'mat', style: `--cols:${rows[0].length}`}, rows.flat().map((entry) => el('span', {}, entry)));
  return el('span', {class: 'mat-wrap'}, prefactor ? el('span', {class: 'prefactor'}, prefactor) : null, grid);
}
const columnVector = ([a, b]) => matrixNode([[formatComplex(a)], [formatComplex(b)]]);
const vectorText = ({x, y, z}) => `(${formatReal(x)}, ${formatReal(y)}, ${formatReal(z)})`;
const wrapParens = (text) => (text.startsWith('(') ? text : `(${text})`);
const subscript = (k) => String(k).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d]);

// ---- Actions ----------------------------------------------------------------------
// Every change to the circuit jumps the display to the latest step.
function commit(next, {syncSliders = true} = {}) {
  circuit = next;
  selected = circuit.steps.length;
  render({syncSliders});
}

for (const gate of GATES) {
  const button = el('button', {'aria-label': `Apply ${gate} gate`, title: gateInfo[gate].title}, gate);
  button.addEventListener('click', () => {
    commit(addGate(circuit, gate));
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
  const states = statesOf(circuit), n = circuit.steps.length;
  selected = Math.min(selected, n);
  const state = states[selected], step = circuit.steps[selected - 1], before = selected > 0 ? states[selected - 1] : null;

  renderState(state, syncSliders);
  renderProbabilities(state);
  renderCircuitPanel(states);
  renderInspector(step, before, state);

  shown = state;
  overlay = before && step.type !== 'prepare' ? {from: bloch(before), gate: step.type === 'gate' ? gateInfo[step.gate] : null} : null;
  $('sphereLegend').hidden = !overlay?.gate;
  draw();
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

  const label = (step) => step.type === 'gate' ? `${step.gate} gate` : step.type === 'measure' ? `Measure → ${step.outcome}` : 'Prepare';
  $('history').replaceChildren(...states.map((s, k) => el('li', {},
    el('button', {type: 'button', 'data-step': k, ...(k === selected ? {'aria-current': 'step'} : {})},
      el('span', {class: 'h-index'}, k === 0 ? 'Start' : `${k}`),
      el('span', {class: 'h-step'}, k === 0 ? 'Input' : label(circuit.steps[k - 1])),
      el('span', {class: 'h-state'}, `|ψ${subscript(k)}⟩ = ${formatKet(s[0], s[1])}`)))));
}

function renderInspector(step, before, after) {
  const box = $('inspector');
  $('inspectorStep').textContent = step ? `Step ${selected}: ${stepLabel(step)}` : '';
  if (!step) {
    $('inspectorTitle').textContent = 'Gate inspector';
    box.replaceChildren(el('p', {class: 'explanation'}, 'The circuit starts in |ψ₀⟩ = |0⟩ = (1, 0). Apply a gate, or select one in the circuit, to see its matrix, the matrix–vector multiplication step by step, and how it moves the Bloch vector.'));
    return;
  }
  const kIn = subscript(selected - 1), kOut = subscript(selected);
  const phaseLine = () => {
    const p = decompose(before), q = decompose(after);
    const phi = (d) => (d.phiDefined ? formatRadians(d.phi) : 'undefined');
    return el('p', {class: 'phase-change'},
      el('span', {class: 'tag relative'}, 'relative φ'), ` ${phi(p)} → ${phi(q)} (observable) `,
      el('br'),
      el('span', {class: 'tag global'}, 'global γ'), ` ${formatRadians(p.gamma)} → ${formatRadians(q.gamma)} (unobservable)`);
  };

  if (step.type === 'prepare') {
    $('inspectorTitle').textContent = 'State preparation';
    box.replaceChildren(
      el('p', {class: 'explanation'}, 'The sliders prepare a new state directly instead of applying a gate. This is not a unitary applied to the previous state: the old state is replaced.'),
      el('p', {class: 'formula'}, `|ψ${kOut}⟩ = cos(θ/2) |0⟩ + e^{iφ} sin(θ/2) |1⟩ with θ = ${formatAngle(step.theta)}, φ = ${formatAngle(step.phi)}`),
      el('p', {class: 'formula'}, `|ψ${kOut}⟩ = ${formatKet(after[0], after[1])}`));
    return;
  }

  if (step.type === 'measure') {
    const m = step.outcome, p = probabilities(before)[m];
    $('inspectorTitle').textContent = 'Measurement (computational basis)';
    box.replaceChildren(
      el('p', {class: 'explanation'}, `Outcome ${m} occurred with probability P(${m}) = |${m ? 'β' : 'α'}|² = ${(p * 100).toFixed(1)}%. The state collapses to |${m}⟩. Measurement is not a unitary gate: it applies the projector |${m}⟩⟨${m}| and renormalizes, so it cannot be reversed physically (Undo here just edits the circuit).`),
      el('div', {class: 'matrix-eq'}, `P${subscript(m)} = |${m}⟩⟨${m}| =`, matrixNode(m ? [['0', '0'], ['0', '1']] : [['1', '0'], ['0', '0']])),
      el('p', {class: 'formula'}, `|ψ${kIn}⟩ = ${formatKet(before[0], before[1])}  →  |ψ${kOut}⟩ = |${m}⟩`));
    return;
  }

  const info = gateInfo[step.gate], matrix = gates[step.gate];
  $('inspectorTitle').textContent = `${step.gate} · ${info.title}`;
  const rows = matrixVectorSteps(matrix, before).map((row, i) => {
    const name = i ? 'β′' : 'α′';
    return el('li', {},
      el('span', {class: 'formula'}, `${name} = ${step.gate}${subscript(i)}${subscript(0)}·α + ${step.gate}${subscript(i)}${subscript(1)}·β`),
      el('span', {class: 'formula'}, `= ${wrapParens(formatComplex(row.entries[0]))}${wrapParens(formatComplex(row.inputs[0]))} + ${wrapParens(formatComplex(row.entries[1]))}${wrapParens(formatComplex(row.inputs[1]))}`),
      el('span', {class: 'formula'}, `= ${formatSum(row.products[0], row.products[1])}`),
      el('strong', {class: 'formula'}, `= ${formatComplex(row.result)}`));
  });
  const vIn = bloch(before), vOut = bloch(after);
  box.replaceChildren(
    el('p', {class: 'explanation'}, info.detail),
    el('div', {class: 'inspector-grid'},
      el('div', {},
        el('h3', {}, 'Matrix–vector multiplication'),
        el('div', {class: 'matrix-eq'}, `${step.gate} |ψ${kIn}⟩ =`, matrixNode(info.matrix, info.prefactor), columnVector(before), '=', columnVector(after)),
        el('ol', {class: 'steps'}, rows),
        el('p', {class: 'hint'}, `Input |ψ${kIn}⟩ = ${formatKet(before[0], before[1])}. Output |ψ${kOut}⟩ = ${formatKet(after[0], after[1])}.`)),
      el('div', {},
        el('h3', {}, 'Effect on the Bloch sphere'),
        el('p', {}, `A rotation of ${formatDegrees(info.angle)} about ${info.axisLabel} (right-hand rule), drawn in violet on the sphere.`),
        el('p', {class: 'formula'}, info.blochMap),
        el('p', {class: 'formula'}, `${vectorText(vIn)} → ${vectorText(vOut)}`),
        el('h3', {}, 'In Dirac notation'),
        el('p', {class: 'formula'}, info.dirac),
        el('h3', {}, 'Phases'),
        phaseLine())));
}

function renderReference() {
  $('gateReference').replaceChildren(...GATES.map((g) => {
    const info = gateInfo[g];
    return el('tr', {},
      el('th', {scope: 'row'}, el('span', {class: 'ref-gate'}, g), el('small', {}, info.title)),
      el('td', {}, matrixNode(info.matrix, info.prefactor)),
      el('td', {}, `${formatDegrees(info.angle)} about ${info.axisLabel}`),
      el('td', {class: 'formula'}, info.blochMap),
      el('td', {class: 'formula'}, info.dirac),
      el('td', {}, info.detail));
  }));
}

// ---- Bloch sphere drawing ------------------------------------------------------------
const canvas = $('sphere'), ctx = canvas.getContext('2d');
const OVERLAY_COLOR = '#c4a1ff';

function draw() {
  const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2, r = Math.min(W, H) * .365;
  ctx.clearRect(0, 0, W, H);
  const project = (v) => {
    const p = projectBloch(v, yaw, pitch);
    return {x: cx + r * p.right, y: cy - r * p.up, depth: p.depth};
  };
  const O = {x: 0, y: 0, z: 0}, origin = project(O);
  function line(a, b, color, width = 1.4, dash = []) {
    const A = project(a), B = project(b);
    ctx.beginPath(); ctx.setLineDash(dash); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.setLineDash([]);
  }
  function dot(p, radius, color, alpha = 1) {
    ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.fill(); ctx.globalAlpha = 1;
  }

  const glow = ctx.createRadialGradient(cx - r * .3, cy - r * .4, r * .05, cx, cy, r);
  glow.addColorStop(0, 'rgba(76,129,245,.21)'); glow.addColorStop(1, 'rgba(76,129,245,.045)');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fillStyle = glow; ctx.fill(); ctx.strokeStyle = '#5174ab'; ctx.lineWidth = 2; ctx.stroke();

  // Arcs on the far hemisphere are dashed and dimmed so the viewer can tell front from back (and hence handedness).
  function circle(plane, color) {
    const points = [];
    for (let i = 0; i <= 180; i++) points.push(project(plane(i * 2 * Math.PI / 180)));
    ctx.strokeStyle = color; ctx.lineWidth = 1.35;
    for (const back of [true, false]) {
      ctx.setLineDash(back ? [4, 5] : []); ctx.globalAlpha = back ? .45 : 1; ctx.beginPath();
      for (let i = 1; i < points.length; i++) {
        if ((points[i - 1].depth + points[i].depth < 0) !== back) continue;
        ctx.moveTo(points[i - 1].x, points[i - 1].y); ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  circle((t) => ({x: Math.cos(t), y: Math.sin(t), z: 0}), '#4971a6');
  circle((t) => ({x: Math.cos(t), y: 0, z: Math.sin(t)}), '#355980');
  circle((t) => ({x: 0, y: Math.cos(t), z: Math.sin(t)}), '#355980');

  for (const axis of [{v: {x: 1.2, y: 0, z: 0}, label: '+X'}, {v: {x: 0, y: 1.2, z: 0}, label: '+Y'}, {v: {x: 0, y: 0, z: 1.2}, label: '|0⟩'}, {v: {x: 0, y: 0, z: -1.2}, label: '|1⟩'}]) {
    line(O, axis.v, '#8099c0', 1.5, [4, 5]);
    const a = project(axis.v);
    ctx.fillStyle = '#dbeaff'; ctx.font = 'bold 18px system-ui'; ctx.fillText(axis.label, a.x + 5, a.y - 5);
  }

  // Overlay for the selected step: the state before it (faded), and for a gate its rotation axis and path.
  if (overlay) {
    const {from, gate} = overlay;
    if (gate) {
      const [ux, uy, uz] = gate.axis;
      line({x: -1.25 * ux, y: -1.25 * uy, z: -1.25 * uz}, {x: 1.25 * ux, y: 1.25 * uy, z: 1.25 * uz}, OVERLAY_COLOR, 2, [8, 6]);
    }
    line(O, from, 'rgba(255,207,105,.38)', 3);
    dot(project(from), 6, '#ffcf69', .4);
    if (gate) {
      const path = [];
      for (let i = 0; i <= 48; i++) path.push(project(rotateAbout(from, gate.axis, gate.angle * i / 48)));
      ctx.beginPath(); path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = OVERLAY_COLOR; ctx.lineWidth = 2.5; ctx.stroke();
      const [p1, p2] = path.slice(-2), angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) > .3) {
        ctx.beginPath(); ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - 13 * Math.cos(angle - .45), p2.y - 13 * Math.sin(angle - .45));
        ctx.lineTo(p2.x - 13 * Math.cos(angle + .45), p2.y - 13 * Math.sin(angle + .45));
        ctx.closePath(); ctx.fillStyle = OVERLAY_COLOR; ctx.fill();
      }
    }
  }

  const vector = bloch(shown);
  line(O, vector, '#ffcf69', 5);
  const end = project(vector);
  dot(end, 8, '#ffcf69', end.depth < -1e-9 ? .55 : 1);
  dot(origin, 3, '#cad9ff');
  canvas.setAttribute('aria-label', `Bloch sphere. State vector at (x, y, z) = ${vectorText(vector)}.`);
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
