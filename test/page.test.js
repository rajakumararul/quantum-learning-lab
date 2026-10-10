import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {MIN_DEGREES, MAX_DEGREES} from '../angle-input.js';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const tag = (id) => html.match(new RegExp(`<input id="${id}"[^>]*>`))?.[0] ?? '';

describe('page markup', () => {
  test('the rotation slider accepts decimal values over the UI range', () => {
    const slider = tag('rotSlider');
    assert.match(slider, /type="range"/);
    // step="any" lets the slider show a typed 22.5° exactly; a step of 1 would display 23°.
    assert.match(slider, /step="any"/);
    assert.match(slider, new RegExp(`min="${MIN_DEGREES}"`));
    assert.match(slider, new RegExp(`max="${MAX_DEGREES}"`));
  });

  test('the typed angle field is a text field, so validation is ours and consistent across browsers', () => {
    assert.match(tag('rotAngle'), /type="text"/);
    assert.match(tag('rotAngle'), /inputmode="decimal"/);
  });

  test('a local SVG favicon is linked and present (no favicon.ico 404, no remote asset)', () => {
    const link = html.match(/<link rel="icon"[^>]*>/)?.[0];
    assert.ok(link, 'icon link');
    assert.match(link, /href="favicon\.svg"/);
    assert.match(link, /type="image\/svg\+xml"/);
    assert.ok(existsSync(new URL('favicon.svg', root)));
    const svg = readFileSync(new URL('favicon.svg', root), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.doesNotMatch(svg, /href=|<script|url\(/, 'self-contained: no external references or scripts');
  });

  test('every id the scripts look up exists exactly once', () => {
    const ids = ['rotAxes', 'rotAngle', 'rotSlider', 'rotAngleRadians', 'rotAngleError', 'rotPresets', 'applyRotation', 'rotationInfo', 'experiments', 'phaseDemos', 'sphere', 'circuit', 'history', 'inspector', 'gates', 'undo', 'clear'];
    for (const id of ids) assert.equal(html.split(`id="${id}"`).length - 1, 1, id);
  });
});
