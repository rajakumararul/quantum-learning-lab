import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {bloch} from '../quantum.js';
import {applyRotation, rotationAxes, ROTATIONS} from '../rotations.js';
import {easeInOut, rotationDuration, animationFrame} from '../bloch-animation.js';
import {rng, randomState, assertClose, assertVectorClose} from './helpers.js';

const dot = (a, [x, y, z]) => a.x * x + a.y * y + a.z * z;

describe('Bloch vector animation (visual only)', () => {
  test('easing starts at 0, ends at 1 and is monotonic', () => {
    assert.equal(easeInOut(0), 0);
    assert.equal(easeInOut(1), 1);
    assertClose(easeInOut(0.5), 0.5, 1e-15);
    let last = 0;
    for (let i = 1; i <= 100; i++) { const v = easeInOut(i / 100); assert.ok(v >= last); last = v; }
  });

  test('durations grow with the angle and are capped', () => {
    assert.ok(rotationDuration(Math.PI / 2) < rotationDuration(Math.PI));
    assert.equal(rotationDuration(2 * Math.PI), 1800);
    assert.equal(rotationDuration(-2 * Math.PI), 1800);
    assert.ok(rotationDuration(0) > 0);
  });

  test('the final frame is the exact computed Bloch vector (same object, not the interpolated path)', () => {
    const r = rng(101);
    for (let i = 0; i < 50; i++) {
      const s = randomState(r), g = ROTATIONS[i % 3], t = r() * 2 * Math.PI, to = bloch(applyRotation(s, g, t));
      const spec = {from: bloch(s), to, axis: rotationAxes[g], angle: t, duration: rotationDuration(t)};
      for (const elapsed of [spec.duration, spec.duration + 1, 1e9]) {
        const frame = animationFrame(spec, elapsed);
        assert.equal(frame.done, true);
        assert.equal(frame.vector, to);
        assert.equal(frame.progress, 1);
      }
    }
  });

  test('intermediate frames stay on the sphere and on the circle about the axis', () => {
    const r = rng(102);
    for (let i = 0; i < 30; i++) {
      const s = randomState(r), g = ROTATIONS[i % 3], t = r() * 2 * Math.PI, from = bloch(s);
      const spec = {from, to: bloch(applyRotation(s, g, t)), axis: rotationAxes[g], angle: t, duration: 1000};
      for (let ms = 0; ms < 1000; ms += 50) {
        const {vector, done} = animationFrame(spec, ms);
        assert.equal(done, false);
        assertClose(Math.hypot(vector.x, vector.y, vector.z), 1, 1e-12);
        assertClose(dot(vector, spec.axis), dot(from, spec.axis), 1e-12);
      }
      // Just before the end, the path has converged onto the exact output.
      assertVectorClose(animationFrame(spec, 999.999).vector, spec.to, 1e-6);
    }
  });

  test('the first frame is the previous state, and a zero-length animation ends immediately', () => {
    const from = {x: 0, y: 0, z: 1}, to = {x: 1, y: 0, z: 0};
    assertVectorClose(animationFrame({from, to, axis: [0, 1, 0], angle: Math.PI / 2, duration: 500}, 0).vector, from, 0);
    assert.equal(animationFrame({from, to, axis: [0, 1, 0], angle: Math.PI / 2, duration: 0}, 0).vector, to);
  });

  test('animation never mutates its inputs', () => {
    const spec = {from: {x: 0, y: 0, z: 1}, to: {x: 0, y: -1, z: 0}, axis: [1, 0, 0], angle: Math.PI / 2, duration: 400};
    const snapshot = JSON.stringify(spec);
    for (let ms = 0; ms <= 500; ms += 25) animationFrame(spec, ms);
    assert.equal(JSON.stringify(spec), snapshot);
  });
});
