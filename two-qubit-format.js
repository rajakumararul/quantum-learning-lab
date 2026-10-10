// Formatting for two-qubit states and 4×4 matrices (no DOM).
// Values that are, to within 1e-12, one of the common exact numbers below are written exactly
// (1/√2 rather than 0.707); everything else uses format.js, which never shows floating-point noise
// such as 6.1e-17 or "−0.000".
import {MINUS, formatComplex, formatReal} from './format.js';
import {BASIS} from './multi-qubit.js';

const EXACT = [[0, '0'], [1, '1'], [Math.SQRT1_2, '1/√2'], [0.5, '1/2'], [Math.sqrt(3) / 2, '√3/2'], [Math.SQRT1_2 / 2, '1/(2√2)'], [0.25, '1/4']];
const TOL = 1e-12;

// Exact text for a real number, or null.
export function exactReal(v) {
  const hit = EXACT.find(([x]) => Math.abs(Math.abs(v) - x) < TOL);
  if (!hit) return null;
  return hit[1] === '0' ? '0' : (v < 0 ? MINUS : '') + hit[1];
}

// "1" → "i", "1/√2" → "i/√2", "√3/2" → "i√3/2", keeping a leading minus.
const imaginaryText = (text) => {
  const negative = text.startsWith(MINUS), body = negative ? text.slice(1) : text;
  const unit = body === '1' ? 'i' : body.startsWith('1/') ? `i${body.slice(1)}` : `i${body}`;
  return (negative ? MINUS : '') + unit;
};

// Exact text for a complex number, or null if either part is not one of the exact values.
export function exactComplex(c) {
  const re = exactReal(c.re), im = exactReal(c.im);
  if (re === null || im === null) return null;
  if (im === '0') return re;
  if (re === '0') return imaginaryText(im);
  const imText = imaginaryText(im), negative = imText.startsWith(MINUS);
  return `(${re} ${negative ? MINUS : '+'} ${negative ? imText.slice(1) : imText})`;
}

// Exact when recognized, otherwise 3 decimals.
export const formatEntry = (c) => exactComplex(c) ?? formatComplex(c);

const isZeroText = (t) => t === '0' || t === '0.000';

// Dirac notation over the given basis labels, omitting zero terms: "1/√2 |00⟩ + 1/√2 |11⟩".
// With exact = false, coefficients are always decimals: "0.707 |00⟩ + 0.707 |11⟩".
export function formatKetIn(labels, state, {exact = true} = {}) {
  const terms = [];
  state.forEach((a, k) => {
    const text = exact ? formatEntry(a) : formatComplex(a);
    if (isZeroText(text)) return;
    const negative = text.startsWith(MINUS), body = negative ? text.slice(1) : text;
    const coefficient = body === '1' || body === '1.000' ? '' : `${body} `;
    terms.push({negative, text: `${coefficient}|${labels[k]}⟩`});
  });
  if (!terms.length) return '0';
  return terms.map((t, i) => (i === 0 ? (t.negative ? MINUS : '') + t.text : `${t.negative ? MINUS : '+'} ${t.text}`)).join(' ');
}

export const formatKet2 = (state, options) => formatKetIn(BASIS, state, options);
// A single-qubit factor, in the same exact style: "1/√2 |0⟩ + 1/√2 |1⟩", "|0⟩".
export const formatKet1 = (state, options) => formatKetIn(['0', '1'], state, options);

export const formatPercent = (p) => `${(p * 100).toFixed(1)}%`;
export const formatVector3 = ({x, y, z}) => `(${formatReal(x)}, ${formatReal(y)}, ${formatReal(z)})`;
export const formatMatrix = (M) => M.map((row) => row.map(formatEntry));
