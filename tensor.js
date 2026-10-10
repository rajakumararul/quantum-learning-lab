// Complex linear algebra for n-component state vectors and n×n matrices (no DOM).
// Matrices are arrays of rows of complex numbers {re, im} from quantum.js.
import {C, add, mul, abs2} from './quantum.js';

export const conj = (a) => C(a.re, -a.im);
export const identity = (n) => Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => C(i === j ? 1 : 0)));
export const fromReal = (rows) => rows.map((row) => row.map((v) => C(v)));

// Kronecker (tensor) product A ⊗ B: (A ⊗ B)[i·m + k][j·m + l] = A[i][j] · B[k][l], with A the LEFT factor.
export function kron(A, B) {
  const m = B.length;
  return Array.from({length: A.length * m}, (_, r) => Array.from({length: A[0].length * B[0].length}, (_, c) =>
    mul(A[Math.floor(r / m)][Math.floor(c / B[0].length)], B[r % m][c % B[0].length])));
}

// Tensor product of state vectors: (a ⊗ b)[i·m + k] = a[i] · b[k].
export const kronVector = (a, b) => a.flatMap((x) => b.map((y) => mul(x, y)));

export const matMul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => add(s, mul(a, B[k][j])), C(0))));
export const matAdd = (A, B) => A.map((row, i) => row.map((a, j) => add(a, B[i][j])));
export const matScale = (A, c) => A.map((row) => row.map((a) => mul(c, a)));
export const dagger = (A) => A[0].map((_, j) => A.map((row) => conj(row[j])));
export const matVec = (M, v) => M.map((row) => row.reduce((s, a, k) => add(s, mul(a, v[k])), C(0)));
export const trace = (A) => A.reduce((s, row, i) => add(s, row[i]), C(0));

// Outer product |u⟩⟨v|: entry (i, j) = u_i · conj(v_j).
export const outer = (u, v) => u.map((a) => v.map((b) => mul(a, conj(b))));

export const vectorNorm2 = (v) => v.reduce((s, a) => s + abs2(a), 0);
export const innerN = (u, v) => u.reduce((s, a, i) => add(s, mul(conj(a), v[i])), C(0));
