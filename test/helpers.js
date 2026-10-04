// Shared test utilities. Not a test file itself (no .test.js suffix).
import assert from 'node:assert/strict';
import {C, add, mul, abs2, fromAngles} from '../quantum.js';

export const EPS = 1e-12;
export const conj = (a) => C(a.re, -a.im);
export const cis = (angle) => C(Math.cos(angle), Math.sin(angle));
export const norm2 = (state) => abs2(state[0]) + abs2(state[1]);

export function assertClose(actual, expected, eps = EPS, message = '') {
  assert.ok(Math.abs(actual - expected) <= eps, `${message} expected ${expected}, got ${actual}`);
}

export function assertComplexClose(actual, expected, eps = EPS, message = '') {
  assertClose(actual.re, expected.re, eps, `${message} (real part)`);
  assertClose(actual.im, expected.im, eps, `${message} (imaginary part)`);
}

export function assertStateClose(actual, expected, eps = EPS, message = '') {
  assertComplexClose(actual[0], expected[0], eps, `${message} alpha`);
  assertComplexClose(actual[1], expected[1], eps, `${message} beta`);
}

export function assertVectorClose(actual, expected, eps = EPS, message = '') {
  for (const k of ['x', 'y', 'z']) assertClose(actual[k], expected[k], eps, `${message} ${k}`);
}

// Deterministic PRNG (mulberry32) so randomized tests are reproducible.
export function rng(seed = 12345) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Uniformly distributed random pure state on the Bloch sphere.
export function randomState(random) {
  return fromAngles(Math.acos(2 * random() - 1), 2 * Math.PI * random());
}

export const matMul = (A, B) => [0, 1].map((i) => [0, 1].map((j) => add(mul(A[i][0], B[0][j]), mul(A[i][1], B[1][j]))));
export const dagger = (A) => [[conj(A[0][0]), conj(A[1][0])], [conj(A[0][1]), conj(A[1][1])]];
export const I2 = [[C(1), C(0)], [C(0), C(1)]];

export function assertMatrixClose(actual, expected, eps = EPS, message = '') {
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) assertComplexClose(actual[i][j], expected[i][j], eps, `${message} [${i}][${j}]`);
}

// Rodrigues rotation of vector v about unit axis by angle (right-hand rule).
export function rotate(v, [ux, uy, uz], angle) {
  const c = Math.cos(angle), s = Math.sin(angle), d = ux * v.x + uy * v.y + uz * v.z;
  const cross = {x: uy * v.z - uz * v.y, y: uz * v.x - ux * v.z, z: ux * v.y - uy * v.x};
  return {
    x: v.x * c + cross.x * s + ux * d * (1 - c),
    y: v.y * c + cross.y * s + uy * d * (1 - c),
    z: v.z * c + cross.z * s + uz * d * (1 - c),
  };
}
