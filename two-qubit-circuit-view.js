// Two-wire circuit diagram markup. Wire q0 is drawn on top, q1 below (matching |q0 q1⟩ labels).
// Each step is one <button data-step="k"> column holding a cell per wire, so students can select it;
// k = 0 is the input |00⟩. Standard notation: gate boxes on their wire, control dot •, target ⊕,
// CZ as two dots, SWAP as two ×, each joined by a vertical line.
import {formatDegrees} from './format.js';
import {BASIS} from './multi-qubit.js';

const METER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 17a8 8 0 0 1 16 0"/><path d="M12 17 17.5 8"/></svg>';

export function stepLabel2(step) {
  switch (step.type) {
    case 'gate': return `${step.gate} on q${step.target}`;
    case 'rotation': return `${step.gate}(${formatDegrees(step.theta)}) on q${step.target}`;
    case 'two':
      if (step.gate === 'SWAP') return 'SWAP q0 ↔ q1';
      if (step.gate === 'CZ') return 'CZ on q0 and q1';
      return `${step.gate}, control q${step.control}, target q${step.target}`;
    case 'measure': return step.qubit === 'both' ? `measure both qubits, outcome |${BASIS[step.outcome]}⟩` : `measure q${step.qubit}, outcome ${step.outcome}`;
    default: throw Error('Unknown circuit step ' + step.type);
  }
}

// [q0 content, q1 content, joined by a vertical link?]
function symbols(step) {
  const cells = ['', ''];
  switch (step.type) {
    case 'gate': cells[step.target] = `<span class="g2-box">${step.gate}</span>`; return [cells, false];
    case 'rotation':
      cells[step.target] = `<span class="g2-box g2-rot"><span class="c-rot-name">R<sub>${step.gate[1]}</sub></span><span class="c-rot-angle">${formatDegrees(step.theta)}</span></span>`;
      return [cells, false];
    case 'two':
      if (step.gate === 'SWAP') return [['<span class="g2-swap">×</span>', '<span class="g2-swap">×</span>'], true];
      if (step.gate === 'CZ') return [['<span class="g2-dot"></span>', '<span class="g2-dot"></span>'], true];
      cells[step.control] = '<span class="g2-dot"></span>';
      cells[step.target] = '<span class="g2-target">⊕</span>';
      return [cells, true];
    case 'measure': {
      const meter = (bit) => `<span class="g2-meter">${METER}<span class="c-outcome">${bit}</span></span>`;
      if (step.qubit === 'both') return [[meter(BASIS[step.outcome][0]), meter(BASIS[step.outcome][1])], false];
      cells[step.qubit] = meter(step.outcome);
      return [cells, false];
    }
    default: throw Error('Unknown circuit step ' + step.type);
  }
}

export function renderCircuit2(steps, selected) {
  const current = (k) => (k === selected ? ' aria-current="step"' : '');
  const column = (k, [q0, q1], link, label, extra = '') =>
    `<button type="button" class="c2-col${extra}" data-step="${k}" aria-label="${label}"${current(k)}><span class="c2-cell q0">${q0}</span><span class="c2-cell q1">${q1}</span>${link ? '<span class="c2-link" aria-hidden="true"></span>' : ''}</button>`;
  const parts = [
    '<div class="c2-labels" aria-hidden="true"><span>q0</span><span>q1</span></div>',
    column(0, ['<span class="g2-input">|0⟩</span>', '<span class="g2-input">|0⟩</span>'], false, 'Input state |00⟩', ' c2-input'),
  ];
  steps.forEach((step, i) => {
    const [cells, link] = symbols(step);
    parts.push(column(i + 1, cells, link, `Step ${i + 1}: ${stepLabel2(step)}`));
  });
  return `<div class="c2-track">${parts.join('')}</div>`;
}
