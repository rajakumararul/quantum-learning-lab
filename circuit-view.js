// Circuit diagram markup: a horizontal wire starting at the input |0⟩, then one standard symbol
// per step (gate box, measurement meter, or |ψ⟩ preparation box). Every symbol is a
// <button data-step="k"> so students can inspect it; k = 0 is the input, k = n the latest step.
// Rotations show both the gate and its parameter: R with subscript axis above the angle in degrees.
import {formatDegrees, formatRadians, formatRotation} from './format.js';

const METER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 17a8 8 0 0 1 16 0"/><path d="M12 17 17.5 8"/></svg>';
const degrees = (rad) => `${Math.round(rad * 180 / Math.PI)}°`;

export function stepLabel(step) {
  switch (step.type) {
    case 'gate': return `${step.gate} gate`;
    case 'rotation': return `${formatRotation(step.gate, step.theta)}, rotation by ${formatRadians(step.theta)} rad about the ${step.gate[1].toUpperCase()} axis`;
    case 'measure': return `measurement, outcome ${step.outcome}`;
    case 'prepare': return `state preparation θ = ${degrees(step.theta)}, φ = ${degrees(step.phi)}`;
    default: throw Error('Unknown circuit step ' + step.type);
  }
}

export function renderCircuit(steps, selected) {
  const node = (k, kind, content, label) =>
    `<button type="button" class="c-node ${kind}" data-step="${k}" aria-label="${label}"${k === selected ? ' aria-current="step"' : ''}>${content}</button>`;
  const symbols = [node(0, 'c-input', '|0⟩', 'Input state |0⟩')];
  steps.forEach((step, i) => {
    const k = i + 1, label = `Step ${k}: ${stepLabel(step)}`;
    if (step.type === 'gate') symbols.push(node(k, 'c-gate', step.gate, label));
    else if (step.type === 'rotation') symbols.push(node(k, 'c-gate c-rot', `<span class="c-rot-name">R<sub>${step.gate[1]}</sub></span><span class="c-rot-angle">${formatDegrees(step.theta)}</span>`, label));
    else if (step.type === 'measure') symbols.push(node(k, 'c-measure', `${METER}<span class="c-outcome">${step.outcome}</span>`, label));
    else symbols.push(node(k, 'c-prep', '|ψ⟩', label));
  });
  return `<div class="circuit-track">${symbols.join('')}</div>`;
}
