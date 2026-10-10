// Step inspector: the mathematics of the selected circuit step, as DOM nodes.
// inspectorContent returns {title, nodes}; the caller places them on the page.
import {gates, bloch, probabilities, decompose, matrixVectorSteps} from './quantum.js';
import {formatComplex, formatSum, formatKet, formatAngle, formatRadians, formatDegrees} from './format.js';
import {gateInfo} from './gate-info.js';
import {rotationInfo} from './rotation-info.js';
import {describeRotation} from './transformation.js';
import {el, matrixNode, columnVector, vectorText, wrapParens, subscript} from './dom.js';

function phaseLine(before, after) {
  const p = decompose(before), q = decompose(after);
  const phi = (d) => (d.phiDefined ? formatRadians(d.phi) : 'undefined');
  return el('p', {class: 'phase-change'},
    el('span', {class: 'tag relative'}, 'relative φ'), ` ${phi(p)} → ${phi(q)} (observable) `,
    el('br'),
    el('span', {class: 'tag global'}, 'global γ'), ` ${formatRadians(p.gamma)} → ${formatRadians(q.gamma)} (unobservable)`);
}

const intro = () => ({
  title: 'Gate inspector',
  nodes: [el('p', {class: 'explanation'}, 'The circuit starts in |ψ₀⟩ = |0⟩ = (1, 0). Apply a gate or rotation, or select one in the circuit, to see its matrix, the matrix–vector multiplication step by step, and how it moves the Bloch vector.')],
});

function preparation(step, after, kOut) {
  return {
    title: 'State preparation',
    nodes: [
      el('p', {class: 'explanation'}, 'The sliders prepare a new state directly instead of applying a gate. This is not a unitary applied to the previous state: the old state is replaced.'),
      el('p', {class: 'formula'}, `|ψ${kOut}⟩ = cos(θ/2) |0⟩ + e^{iφ} sin(θ/2) |1⟩ with θ = ${formatAngle(step.theta)}, φ = ${formatAngle(step.phi)}`),
      el('p', {class: 'formula'}, `|ψ${kOut}⟩ = ${formatKet(after[0], after[1])}`)],
  };
}

function measurement(step, before, kIn, kOut) {
  const m = step.outcome, p = probabilities(before)[m];
  return {
    title: 'Measurement (computational basis)',
    nodes: [
      el('p', {class: 'explanation'}, `Outcome ${m} occurred with probability P(${m}) = |${m ? 'β' : 'α'}|² = ${(p * 100).toFixed(1)}%. The state collapses to |${m}⟩. Measurement is not a unitary gate: it applies the projector |${m}⟩⟨${m}| and renormalizes, so it cannot be reversed physically (Undo here just edits the circuit).`),
      el('div', {class: 'matrix-eq'}, `P${subscript(m)} = |${m}⟩⟨${m}| =`, matrixNode(m ? [['0', '0'], ['0', '1']] : [['1', '0'], ['0', '0']])),
      el('p', {class: 'formula'}, `|ψ${kIn}⟩ = ${formatKet(before[0], before[1])}  →  |ψ${kOut}⟩ = |${m}⟩`)],
  };
}

function fixedGate(step, before, after, kIn, kOut) {
  const info = gateInfo[step.gate], matrix = gates[step.gate];
  const rows = matrixVectorSteps(matrix, before).map((row, i) => {
    const name = i ? 'β′' : 'α′';
    return el('li', {},
      el('span', {class: 'formula'}, `${name} = ${step.gate}${subscript(i)}${subscript(0)}·α + ${step.gate}${subscript(i)}${subscript(1)}·β`),
      el('span', {class: 'formula'}, `= ${wrapParens(formatComplex(row.entries[0]))}${wrapParens(formatComplex(row.inputs[0]))} + ${wrapParens(formatComplex(row.entries[1]))}${wrapParens(formatComplex(row.inputs[1]))}`),
      el('span', {class: 'formula'}, `= ${formatSum(row.products[0], row.products[1])}`),
      el('strong', {class: 'formula'}, `= ${formatComplex(row.result)}`));
  });
  const vIn = bloch(before), vOut = bloch(after);
  return {
    title: `${step.gate} · ${info.title}`,
    nodes: [
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
          phaseLine(before, after)))],
  };
}

// The mathematical transformation panel for Rx(θ), Ry(θ), Rz(θ).
function rotation(step, before, after, kIn, kOut) {
  const d = describeRotation(step.gate, step.theta, before), info = rotationInfo[step.gate];
  const mat = (rows) => matrixNode(rows);
  const vec = (pair) => matrixNode([[pair[0]], [pair[1]]]);
  const rows = d.steps.map((row, i) => el('li', {},
    el('span', {class: 'formula'}, `${i ? 'β′' : 'α′'} = ${wrapParens(row.entries[0])}${wrapParens(row.inputs[0])} + ${wrapParens(row.entries[1])}${wrapParens(row.inputs[1])}`),
    el('span', {class: 'formula'}, `= ${row.products[0]} + ${row.products[1]}`.replace(/\+ −/g, '− ')),
    el('strong', {class: 'formula'}, `= ${row.result}`)));
  const blochRow = (label, a, b) => el('tr', {}, el('th', {scope: 'row'}, label), el('td', {}, a), el('td', {}, b));
  return {
    title: `${d.label} · ${info.title}`,
    nodes: [
      el('p', {class: 'explanation'}, `${d.label} = ${d.radiansLabel}. ${d.observation} The rotation axis and path are drawn in violet on the sphere.`),
      el('div', {class: 'inspector-grid'},
        el('div', {},
          el('h3', {}, 'Rotation'),
          el('dl', {class: 'facts'},
            el('div', {}, el('dt', {}, 'Selected gate'), el('dd', {}, `${step.gate}(θ), about ${info.axisLabel}`)),
            el('div', {}, el('dt', {}, 'θ in degrees'), el('dd', {}, d.degrees)),
            el('div', {}, el('dt', {}, 'θ in radians'), el('dd', {}, d.radians))),
          el('h3', {}, 'Rotation matrix'),
          el('div', {class: 'matrix-eq'}, `${step.gate}(θ) =`, mat(d.symbolicMatrix)),
          el('div', {class: 'matrix-eq'}, `${d.radiansLabel} =`, mat(d.matrix)),
          el('h3', {}, 'Matrix × state vector'),
          el('div', {class: 'matrix-eq'}, `${d.radiansLabel} |ψ${kIn}⟩ =`, mat(d.matrix), vec(d.input), '=', vec(d.output)),
          el('ol', {class: 'steps'}, rows),
          el('p', {class: 'hint'}, `Input |ψ${kIn}⟩ = ${formatKet(before[0], before[1])}. Output |ψ${kOut}⟩ = ${formatKet(after[0], after[1])}.`)),
        el('div', {},
          el('h3', {}, 'Output amplitudes'),
          el('dl', {class: 'facts'},
            el('div', {}, el('dt', {}, 'α amplitude'), el('dd', {}, d.alpha)),
            el('div', {}, el('dt', {}, 'β amplitude'), el('dd', {}, d.beta)),
            el('div', {}, el('dt', {}, 'P(0), P(1)'), el('dd', {}, `${d.probabilities[0]}, ${d.probabilities[1]}`))),
          el('h3', {}, 'Bloch sphere'),
          el('div', {class: 'table-scroll'}, el('table', {class: 'bloch-table'},
            el('thead', {}, el('tr', {}, el('th', {scope: 'col'}, ''), el('th', {scope: 'col'}, `|ψ${kIn}⟩ before`), el('th', {scope: 'col'}, `|ψ${kOut}⟩ after`))),
            el('tbody', {},
              blochRow('(x, y, z)', d.blochIn.vector, d.blochOut.vector),
              blochRow('Polar angle θ_Bloch', d.blochIn.polar, d.blochOut.polar),
              blochRow('Azimuthal angle φ', d.blochIn.azimuth, d.blochOut.azimuth)))),
          el('p', {class: 'formula'}, info.blochMap),
          el('h3', {}, 'Phases'),
          phaseLine(before, after)))],
  };
}

// index is the selected step number k (state |ψ_k⟩ after it); step is undefined for the input.
export function inspectorContent(step, before, after, index) {
  if (!step) return intro();
  const kIn = subscript(index - 1), kOut = subscript(index);
  switch (step.type) {
    case 'prepare': return preparation(step, after, kOut);
    case 'measure': return measurement(step, before, kIn, kOut);
    case 'rotation': return rotation(step, before, after, kIn, kOut);
    default: return fixedGate(step, before, after, kIn, kOut);
  }
}
