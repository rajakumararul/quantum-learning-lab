// Small DOM helpers shared by the views. Text is always inserted as text nodes; HTML is never parsed.
import {formatComplex, formatReal} from './format.js';

// Renders text with e^{...} exponents as superscripts.
export function math(text) {
  const fragment = document.createDocumentFragment();
  String(text).split(/\^\{([^}]*)\}/).forEach((part, i) => fragment.append(i % 2 ? el('sup', {}, part) : document.createTextNode(part)));
  return fragment;
}

export function el(tag, attrs = {}, ...children) {
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
export function matrixNode(rows, prefactor = '') {
  const grid = el('span', {class: 'mat', style: `--cols:${rows[0].length}`}, rows.flat().map((entry) => el('span', {}, entry)));
  return el('span', {class: 'mat-wrap'}, prefactor ? el('span', {class: 'prefactor'}, prefactor) : null, grid);
}

export const columnVector = ([a, b]) => matrixNode([[formatComplex(a)], [formatComplex(b)]]);
export const vectorText = ({x, y, z}) => `(${formatReal(x)}, ${formatReal(y)}, ${formatReal(z)})`;
export const wrapParens = (text) => (text.startsWith('(') ? text : `(${text})`);
export const subscript = (k) => String(k).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d]);
