import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {initial, applyGate, bloch} from '../quantum.js';
import {defaultView, projectBloch} from '../projection.js';
import {rng, assertClose} from './helpers.js';

// Screen frame (right, up, depth-toward-viewer) is right-handed, so a correct drawing
// requires the projected axes to satisfy P(X) × P(Y) = P(Z).
const toArray = ({right, up, depth}) => [right, up, depth];
const P = (v, view = defaultView) => toArray(projectBloch(v, view.yaw, view.pitch));
const cross = ([a1, a2, a3], [b1, b2, b3]) => [a2 * b3 - a3 * b2, a3 * b1 - a1 * b3, a1 * b2 - a2 * b1];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const det3 = (a, b, c) => dot(cross(a, b), c);
const EX = {x: 1, y: 0, z: 0}, EY = {x: 0, y: 1, z: 0}, EZ = {x: 0, y: 0, z: 1};

// Views reachable in the app: any yaw, pitch clamped to [-1.4, 1.4] by the drag handler.
function* views() {
  yield defaultView;
  const random = rng(21);
  for (let i = 0; i < 500; i++) yield {yaw: (random() - 0.5) * 20, pitch: (random() - 0.5) * 2.8};
}

describe('Bloch sphere projection', () => {
  test('is a proper rotation (orthonormal, determinant +1) for every reachable view', () => {
    for (const view of views()) {
      const [px, py, pz] = [P(EX, view), P(EY, view), P(EZ, view)];
      for (const [a, b] of [[px, py], [py, pz], [pz, px]]) assertClose(dot(a, b), 0, 1e-12, 'orthogonal');
      for (const a of [px, py, pz]) assertClose(dot(a, a), 1, 1e-12, 'unit length');
      assertClose(det3(px, py, pz), 1, 1e-12, `determinant at yaw=${view.yaw} pitch=${view.pitch}`);
    }
  });

  test('projected axes satisfy the right-hand rule: X × Y = Z', () => {
    for (const view of views()) {
      const z = cross(P(EX, view), P(EY, view)), expected = P(EZ, view);
      for (let i = 0; i < 3; i++) assertClose(z[i], expected[i], 1e-12);
    }
  });

  test('is linear, so the drawn state vector matches its Bloch coordinates', () => {
    const random = rng(22);
    for (let i = 0; i < 200; i++) {
      const v = {x: random() - 0.5, y: random() - 0.5, z: random() - 0.5};
      const view = {yaw: random() * 6, pitch: random() - 0.5};
      const [px, py, pz] = [P(EX, view), P(EY, view), P(EZ, view)];
      const expected = [0, 1, 2].map((k) => v.x * px[k] + v.y * py[k] + v.z * pz[k]);
      const actual = P(v, view);
      for (let k = 0; k < 3; k++) assertClose(actual[k], expected[k], 1e-12);
    }
  });

  test('default view looks down on the sphere from above the equator', () => {
    const north = projectBloch(EZ, defaultView.yaw, defaultView.pitch);
    assert.ok(north.up > 0, '|0⟩ is drawn above the centre');
    assert.ok(north.depth > 0, 'north pole tilts toward the viewer');
  });

  test('with no tilt, Z points up and X points right', () => {
    const z = projectBloch(EZ, 0, 0), x = projectBloch(EX, 0, 0), y = projectBloch(EY, 0, 0);
    [[z, [0, 1, 0], 'Z'], [x, [1, 0, 0], 'X'], [y, [0, 0, -1], 'Y (into the screen)']].forEach(([p, e, name]) =>
      toArray(p).forEach((v, k) => assertClose(v, e[k], 1e-15, name)));
  });

  test('regression: S turns +X toward +Y anticlockwise when viewed from +Z on screen', () => {
    // H|0⟩ = +X, then S gives +Y. Angular momentum of the on-screen motion must point along projected +Z.
    const before = P(bloch(applyGate(initial(), 'H')));
    const after = P(bloch(applyGate(applyGate(initial(), 'H'), 'S')));
    assert.ok(dot(cross(before, after), P(EZ)) > 0.99);
  });

  test('regression: the mirrored projection shipped in v0.1 would fail this suite', () => {
    // v0.1 used up = z cos(pitch) − yy sin(pitch), depth = z sin(pitch) + yy cos(pitch).
    const mirrored = ({x, y, z}, {yaw, pitch}) => {
      const xx = x * Math.cos(yaw) - y * Math.sin(yaw), yy = x * Math.sin(yaw) + y * Math.cos(yaw);
      return [xx, z * Math.cos(pitch) - yy * Math.sin(pitch), z * Math.sin(pitch) + yy * Math.cos(pitch)];
    };
    assertClose(det3(mirrored(EX, defaultView), mirrored(EY, defaultView), mirrored(EZ, defaultView)), -1, 1e-12);
  });
});
