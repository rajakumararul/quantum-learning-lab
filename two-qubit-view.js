// DOM builders for two-qubit mode. Every function takes plain values and returns nodes; no state.
import {sub, mul, abs2} from './quantum.js';
import {formatReal, formatComplex, formatAngle} from './format.js';
import {BASIS, probabilities2, qubitProbability} from './multi-qubit.js';
import {twoQubitGates} from './controlled-gates.js';
import {operatorOf} from './two-qubit-circuit.js';
import {concurrence, classifyEntanglement, productFactors} from './entanglement.js';
import {reducedDensityMatrices, blochFromDensity, purity, blochLength} from './density-matrix.js';
import {exactComplex, formatEntry, formatKet1, formatKet2, formatPercent, formatVector3, formatMatrix} from './two-qubit-format.js';
import {stepLabel2} from './two-qubit-circuit-view.js';
import {el, matrixNode, subscript} from './dom.js';

const SYMBOLS = ['α', 'β', 'γ', 'δ'];
const wrap = (t) => (t.startsWith('(') ? t : `(${t})`);
const column4 = (state) => matrixNode(state.map((a) => [formatEntry(a)]));

export function amplitudeTable(state) {
  const probs = probabilities2(state);
  return el('table', {class: 'amp-table'},
    el('thead', {}, el('tr', {},
      el('th', {scope: 'col'}, 'Basis |q0 q1⟩'), el('th', {scope: 'col'}, 'Amplitude'), el('th', {scope: 'col'}, 'Exact'), el('th', {scope: 'col'}, 'Probability'))),
    el('tbody', {}, state.map((a, k) => el('tr', {},
      el('th', {scope: 'row'}, `${SYMBOLS[k]} · |${BASIS[k]}⟩`),
      el('td', {}, formatComplex(a)),
      el('td', {}, exactComplex(a) ?? '—'),
      el('td', {}, formatPercent(probs[k]))))));
}

export function probabilityHistogram(state) {
  return el('ul', {class: 'histogram'}, probabilities2(state).map((p, k) => el('li', {},
    el('span', {class: 'h-label'}, `|${BASIS[k]}⟩`),
    el('span', {class: 'h-track', 'aria-hidden': 'true'}, el('span', {class: `h-fill k${k}`, style: `width:${(p * 100).toFixed(3)}%`})),
    el('span', {class: 'h-value'}, formatPercent(p)))));
}

// Probabilities of each qubit alone, for the measurement panel.
export function marginals(state) {
  return el('p', {class: 'hint'}, [0, 1].map((q) => `q${q}: P(0) = ${formatPercent(qubitProbability(state, q, 0))}, P(1) = ${formatPercent(qubitProbability(state, q, 1))}`).join(' · '));
}

export function entanglementPanel(state) {
  const c = concurrence(state), kind = classifyEntanglement(c), [a, b, g, d] = state, det = sub(mul(a, d), mul(b, g));
  const factors = productFactors(state);
  const lengths = reducedDensityMatrices(state).map((rho) => blochLength(blochFromDensity(rho)));
  return [
    el('div', {class: 'conc-head'},
      el('div', {}, el('small', {}, 'Concurrence'), el('strong', {class: 'conc-value'}, `C = ${formatReal(c)}`)),
      el('span', {class: `badge ent ${kind.split(' ')[0]}`}, kind)),
    el('div', {class: 'conc-meter', role: 'img', 'aria-label': `Concurrence ${formatReal(c)} on a scale from 0, separable, to 1, maximally entangled`},
      el('span', {class: 'conc-fill', style: `width:${(c * 100).toFixed(3)}%`})),
    el('div', {class: 'conc-scale', 'aria-hidden': 'true'}, el('span', {}, '0 · separable'), el('span', {}, '1 · maximally entangled')),
    el('p', {class: 'formula'}, `C = 2|αδ − βγ| = 2|${wrap(formatEntry(a))}${wrap(formatEntry(d))} − ${wrap(formatEntry(b))}${wrap(formatEntry(g))}| = 2 × ${formatReal(Math.sqrt(abs2(det)))} = ${formatReal(c)}`),
    factors
      ? el('p', {class: 'explanation'}, 'Separable: the state is a product of one state per qubit, ', el('span', {class: 'formula'}, factors.map((f) => { const t = formatKet1(f); return / [+−] /.test(t) ? `(${t})` : t; }).join(' ⊗ ')), ', with q0 on the left.')
      : el('p', {class: 'explanation'}, `Entangled: no choice of single-qubit states |a⟩ ⊗ |b⟩ gives this state, because αδ − βγ ≠ 0. Each qubit's reduced Bloch vector has length √(1 − C²) = ${formatReal(lengths[0])}.`),
    el('p', {class: 'hint'}, 'C is not a percentage or a probability. It is 0 exactly for product states and 1 for maximally entangled states such as the Bell states. In between, it measures how far each qubit, viewed alone, is from a pure state: |r|² = 1 − C², where r is that qubit\'s reduced Bloch vector.'),
  ];
}

export function reducedStatePanel(state, qubit) {
  const rho = reducedDensityMatrices(state)[qubit], r = blochFromDensity(rho), len = blochLength(r), p = purity(rho);
  const meaning = len > 1 - 1e-9 ? 'a pure state: this qubit has a definite state of its own (on the sphere surface).'
    : len < 1e-9 ? 'maximally mixed (I/2): alone, this qubit is completely random in every direction (at the centre).'
      : 'a mixed state: the qubit is partly correlated with the other one (inside the sphere).';
  return [
    el('div', {class: 'matrix-eq'}, `ρ${subscript(qubit)} = Tr${subscript(1 - qubit)}(ρ) =`, matrixNode(formatMatrix(rho))),
    el('dl', {class: 'facts'},
      el('div', {}, el('dt', {}, 'Bloch vector (x, y, z)'), el('dd', {}, formatVector3(r))),
      el('div', {}, el('dt', {}, 'Length |r|'), el('dd', {}, formatReal(len))),
      el('div', {}, el('dt', {}, 'Purity Tr(ρ²)'), el('dd', {}, formatReal(p)))),
    el('p', {class: 'hint'}, `q${qubit} is ${meaning}`),
  ];
}

function phaseOfEntanglement(before, after) {
  const c0 = concurrence(before), c1 = concurrence(after);
  const change = Math.abs(c1 - c0) < 1e-9 ? 'unchanged' : c1 > c0 ? 'increased: this gate created entanglement' : 'decreased';
  return el('p', {}, `Concurrence C: ${formatReal(c0)} → ${formatReal(c1)} (${change}).`);
}

export function inspectorContent(step, before, after, index) {
  if (!step) {
    return {title: 'Two-qubit inspector', nodes: [el('p', {class: 'explanation'}, 'The circuit starts in |00⟩ = (1, 0, 0, 0). Apply a gate, or select a step in the circuit, to see its 4×4 matrix, how it acts on the state vector, and whether it changes the entanglement.')]};
  }
  const kIn = subscript(index - 1), kOut = subscript(index);
  if (step.type === 'measure') {
    const lengthsBefore = reducedDensityMatrices(before).map((rho) => blochLength(blochFromDensity(rho)));
    const p = step.qubit === 'both' ? probabilities2(before)[step.outcome] : qubitProbability(before, step.qubit, step.outcome);
    const other = step.qubit === 'both' ? null : 1 - step.qubit;
    const nodes = [
      el('p', {class: 'explanation'}, step.qubit === 'both'
        ? `Both qubits were measured. Outcome |${BASIS[step.outcome]}⟩ had probability ${formatPercent(p)}, and the state collapsed to it.`
        : `q${step.qubit} was measured with outcome ${step.outcome} (probability ${formatPercent(p)}). The amplitudes inconsistent with that outcome are removed and the rest renormalized.`),
      el('p', {class: 'formula'}, `|ψ${kIn}⟩ = ${formatKet2(before)}  →  |ψ${kOut}⟩ = ${formatKet2(after)}`),
    ];
    if (other !== null && concurrence(before) > 1e-9) {
      nodes.push(el('p', {}, `Because the qubits were entangled, this also changed q${other}: its reduced Bloch vector length went from ${formatReal(lengthsBefore[other])} to ${formatReal(blochLength(blochFromDensity(reducedDensityMatrices(after)[other])))}. Measuring one qubit gave q${other} a definite state too. (This correlation cannot be used to send a signal: q${other}'s own outcome probabilities, averaged over q${step.qubit}'s random result, are unchanged.)`));
    }
    return {title: `Measurement · ${stepLabel2(step)}`, nodes};
  }
  const op = operatorOf(step), info = step.type === 'two' ? twoQubitGates[step.gate] : null;
  const what = step.type === 'two' ? info.summary
    : `A single-qubit gate on q${step.target} acts on the two-qubit state as ${op.factors}${step.type === 'rotation' ? ` with θ = ${formatAngle(step.theta)}` : ''}: q0 is always the left factor of the tensor product.`;
  return {
    title: `${stepLabel2(step)}${info ? ` · ${info.title}` : ''}`,
    nodes: [
      el('p', {class: 'explanation'}, what),
      el('div', {class: 'inspector-grid'},
        el('div', {},
          el('h3', {}, '4×4 matrix (basis |00⟩, |01⟩, |10⟩, |11⟩)'),
          el('p', {class: 'formula'}, `U = ${op.factors}`),
          el('div', {class: 'table-scroll'}, el('div', {class: 'matrix-eq'}, 'U =', matrixNode(formatMatrix(op.matrix))))),
        el('div', {},
          el('h3', {}, 'Matrix × state vector'),
          el('div', {class: 'table-scroll'}, el('div', {class: 'matrix-eq'}, `U |ψ${kIn}⟩ =`, column4(before), '→', column4(after))),
          el('p', {class: 'formula'}, `|ψ${kIn}⟩ = ${formatKet2(before)}`),
          el('p', {class: 'formula'}, `|ψ${kOut}⟩ = ${formatKet2(after)}`),
          phaseOfEntanglement(before, after)))],
  };
}

export function bellCard(bell, onPrepare) {
  const button = el('button', {type: 'button', class: 'secondary'}, `Prepare |${bell.name}⟩`);
  button.addEventListener('click', () => onPrepare(bell));
  return el('article', {class: 'bell-card'},
    el('h3', {}, `|${bell.name}⟩ = ${bell.formula}`),
    el('p', {class: 'formula'}, `|00⟩ → ${bell.steps.map(stepLabel2).join(' → ')}`),
    el('p', {}, bell.recipe),
    button);
}
