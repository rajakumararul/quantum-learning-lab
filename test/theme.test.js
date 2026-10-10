import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {THEMES, STORAGE_KEY, LIGHT_QUERY, THEME_COLORS, isTheme, otherTheme, resolveTheme, readStoredTheme, saveTheme, toggleLabel, createThemeController} from '../theme.js';
import {applyGate, initial} from '../quantum.js';
import {emptyCircuit, addGate, statesOf} from '../circuit.js';
import {createHistoryStore} from '../measurement-history.js';

const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');

// Minimal fakes for the browser pieces the theme needs.
function fakeStorage(initial = {}, {throws = false} = {}) {
  const data = {...initial};
  return {
    data,
    getItem(k) { if (throws) throw Error('blocked'); return k in data ? data[k] : null; },
    setItem(k, v) { if (throws) throw Error('blocked'); data[k] = String(v); },
  };
}
function fakeMedia(matches) {
  const listeners = [];
  return {matches, addEventListener: (type, fn) => listeners.push(fn), fire(m) { this.matches = m; listeners.forEach((fn) => fn({matches: m})); }};
}
function fakeRoot() {
  const calls = [];
  return {calls, attrs: {}, setAttribute(name, value) { calls.push([name, value]); this.attrs[name] = value; }};
}

describe('theme rules', () => {
  test('two themes; the other theme of each', () => {
    assert.deepEqual(THEMES, ['light', 'dark']);
    assert.equal(otherTheme('dark'), 'light');
    assert.equal(otherTheme('light'), 'dark');
    assert.equal(isTheme('dark'), true);
    assert.equal(isTheme('Dark'), false);
  });

  test('system preference fallback: light only when the OS prefers light', () => {
    assert.equal(resolveTheme(null, true), 'light');
    assert.equal(resolveTheme(null, false), 'dark');
    assert.equal(LIGHT_QUERY, '(prefers-color-scheme: light)');
  });

  test('a saved light or dark preference wins over the OS', () => {
    assert.equal(resolveTheme('light', false), 'light');
    assert.equal(resolveTheme('dark', true), 'dark');
  });

  test('invalid stored values fall back to the OS preference', () => {
    for (const bad of ['', 'blue', 'LIGHT', 'null', '{"theme":"dark"}', undefined, null, 42]) {
      assert.equal(resolveTheme(bad, true), 'light', String(bad));
      assert.equal(resolveTheme(bad, false), 'dark', String(bad));
    }
  });
});

describe('persistence through localStorage', () => {
  test('reads only valid saved values', () => {
    assert.equal(readStoredTheme(fakeStorage({[STORAGE_KEY]: 'light'})), 'light');
    assert.equal(readStoredTheme(fakeStorage({[STORAGE_KEY]: 'dark'})), 'dark');
    assert.equal(readStoredTheme(fakeStorage({[STORAGE_KEY]: 'sepia'})), null);
    assert.equal(readStoredTheme(fakeStorage()), null);
    assert.equal(readStoredTheme(null), null);
  });

  test('blocked storage is treated as "nothing saved" and saving fails softly', () => {
    const blocked = fakeStorage({}, {throws: true});
    assert.equal(readStoredTheme(blocked), null);
    assert.equal(saveTheme(blocked, 'light'), false);
  });

  test('saveTheme writes the key and rejects unknown themes', () => {
    const s = fakeStorage();
    assert.equal(saveTheme(s, 'light'), true);
    assert.equal(s.data[STORAGE_KEY], 'light');
    assert.throws(() => saveTheme(s, 'sepia'), /Unknown theme/);
  });
});

describe('theme controller', () => {
  test('first visit follows the system preference and saves nothing', () => {
    for (const [prefersLight, expected] of [[true, 'light'], [false, 'dark']]) {
      const storage = fakeStorage(), r = fakeRoot();
      const c = createThemeController({root: r, storage, media: fakeMedia(prefersLight)});
      assert.equal(c.get(), expected);
      assert.equal(r.attrs['data-theme'], expected);
      assert.equal(c.isSaved(), false);
      assert.deepEqual(storage.data, {});
    }
  });

  test('a saved light or dark preference is used on later visits', () => {
    assert.equal(createThemeController({root: fakeRoot(), storage: fakeStorage({[STORAGE_KEY]: 'light'}), media: fakeMedia(false)}).get(), 'light');
    assert.equal(createThemeController({root: fakeRoot(), storage: fakeStorage({[STORAGE_KEY]: 'dark'}), media: fakeMedia(true)}).get(), 'dark');
  });

  test('toggling switches theme, updates <html> and is remembered', () => {
    const storage = fakeStorage(), r = fakeRoot(), changes = [];
    const c = createThemeController({root: r, storage, media: fakeMedia(false), onChange: (t) => changes.push(t)});
    assert.equal(c.toggle(), 'light');
    assert.equal(r.attrs['data-theme'], 'light');
    assert.equal(storage.data[STORAGE_KEY], 'light');
    assert.equal(c.toggle(), 'dark');
    assert.equal(storage.data[STORAGE_KEY], 'dark');
    assert.deepEqual(changes, ['dark', 'light', 'dark']);
    // A new visit restores the last choice.
    assert.equal(createThemeController({root: fakeRoot(), storage, media: fakeMedia(true)}).get(), 'dark');
  });

  test('invalid stored values fall back safely and are replaced by the next real choice', () => {
    const storage = fakeStorage({[STORAGE_KEY]: 'neon'});
    const c = createThemeController({root: fakeRoot(), storage, media: fakeMedia(true)});
    assert.equal(c.get(), 'light');
    c.set('dark');
    assert.equal(storage.data[STORAGE_KEY], 'dark');
    assert.throws(() => c.set('neon'), /Unknown theme/);
  });

  test('follows OS changes until the user chooses, then stops', () => {
    const media = fakeMedia(false), c = createThemeController({root: fakeRoot(), storage: fakeStorage(), media});
    media.fire(true);
    assert.equal(c.get(), 'light');
    c.set('dark');
    media.fire(true);
    assert.equal(c.get(), 'dark');
  });

  test('works without storage or matchMedia (defaults to dark)', () => {
    const c = createThemeController({root: fakeRoot(), storage: null, media: undefined});
    assert.equal(c.get(), 'dark');
    assert.equal(c.toggle(), 'light');
  });

  test('the toggle label names the theme in words, not only an icon', () => {
    assert.deepEqual(toggleLabel('dark'), {text: 'Dark', icon: '☾', aria: 'Theme: dark. Switch to light theme'});
    assert.deepEqual(toggleLabel('light'), {text: 'Light', icon: '☀', aria: 'Theme: light. Switch to dark theme'});
  });

  test('theme-color meta values match each theme\'s page background token', () => {
    const css = read('styles.css');
    assert.match(css, new RegExp(`:root \\{[^}]*--bg: ${THEME_COLORS.dark};`));
    assert.match(css, new RegExp(`:root\\[data-theme="light"\\] \\{[^}]*--bg: ${THEME_COLORS.light};`));
  });
});

describe('theme changes never alter quantum state', () => {
  test('theme.js imports nothing from the simulator', () => {
    assert.doesNotMatch(read('theme.js'), /^\s*import\s/m);
  });

  test('the controller touches only <html> data-theme and its own storage key', () => {
    const r = fakeRoot(), storage = fakeStorage({other: 'kept'});
    const c = createThemeController({root: r, storage, media: fakeMedia(false)});
    c.toggle(); c.toggle(); c.set('light');
    assert.ok(r.calls.every(([name]) => name === 'data-theme'));
    assert.deepEqual(Object.keys(storage.data).sort(), ['other', STORAGE_KEY].sort());
    assert.equal(storage.data.other, 'kept');
  });

  test('circuit, state, measurement history and mode are unchanged by toggling', () => {
    const circuit = addGate(addGate(emptyCircuit(), 'H'), 'T'), history = createHistoryStore();
    history.add({mode: 'single', label: '|+⟩', target: 'qubit', shots: 10, seed: 1, labels: ['0', '1'], counts: [6, 4], state: applyGate(initial(), 'H')});
    const app = {mode: 'two', circuit, selected: 1};
    const snapshot = JSON.stringify({app, state: statesOf(circuit), history: history.get()});
    const c = createThemeController({root: fakeRoot(), storage: fakeStorage(), media: fakeMedia(true)});
    for (let i = 0; i < 5; i++) c.toggle();
    assert.equal(JSON.stringify({app, state: statesOf(circuit), history: history.get()}), snapshot);
  });
});

describe('pre-paint inline script in index.html', () => {
  const html = read('index.html');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];

  function runInline({stored = null, throws = false, prefersLight = false, matchMedia = true}) {
    const attrs = {}, meta = {content: ''};
    const context = {
      localStorage: {getItem: (k) => { if (throws) throw Error('blocked'); return k === STORAGE_KEY ? stored : null; }},
      document: {documentElement: {setAttribute: (n, v) => { attrs[n] = v; }}, querySelector: () => ({setAttribute: (n, v) => { meta[n] = v; }})},
    };
    context.window = {matchMedia: matchMedia ? (q) => ({matches: q === LIGHT_QUERY && prefersLight}) : undefined};
    vm.runInNewContext(script, context);
    return {theme: attrs['data-theme'], meta: meta.content};
  }

  test('runs before the stylesheet and module scripts (no theme flash)', () => {
    assert.ok(html.indexOf('<script>') < html.indexOf('styles.css'));
    assert.ok(html.indexOf('<script>') < html.indexOf('type="module"'));
  });

  test('makes exactly the same decision as theme.js for every case', () => {
    for (const stored of [null, 'light', 'dark', 'blue', '']) for (const prefersLight of [true, false]) for (const throws of [false, true]) {
      const got = runInline({stored, prefersLight, throws});
      const want = resolveTheme(throws ? null : stored, prefersLight);
      assert.equal(got.theme, want, `stored=${stored} prefersLight=${prefersLight} throws=${throws}`);
      assert.equal(got.meta, THEME_COLORS[want]);
    }
    assert.equal(runInline({matchMedia: false}).theme, 'dark');
  });

  test('uses the same storage key and query as theme.js', () => {
    assert.ok(script.includes(`'${STORAGE_KEY}'`));
    assert.ok(script.includes(`'${LIGHT_QUERY}'`));
  });
});

describe('design tokens', () => {
  const css = read('styles.css');
  const block = (selector) => {
    const start = css.indexOf(selector + ' {');
    return Object.fromEntries([...css.slice(start, css.indexOf('}', start)).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  };
  const dark = block(':root'), light = {...dark, ...block(':root[data-theme="light"]')};
  // Badge fills and text on fills / primary buttons are intentionally identical in both themes.
  const SAME_IN_BOTH = ['fill-state', 'fill-axis', 'fill-success', 'fill-warn', 'fill-neutral', 'on-fill', 'on-primary'];

  test('the light theme redefines every token except the intentionally shared ones', () => {
    const lightOwn = block(':root[data-theme="light"]');
    for (const name of Object.keys(dark)) {
      if (SAME_IN_BOTH.includes(name)) assert.equal(lightOwn[name], undefined, `${name} should be shared`);
      else assert.ok(name in lightOwn, `light theme is missing --${name}`);
    }
  });

  test('every var() used in the stylesheet is defined', () => {
    for (const [, name] of css.matchAll(/var\(--([a-z0-9-]+)\)/g)) if (name !== 'cols') assert.ok(name in dark, `--${name} is not defined`);
  });

  test('no hard-coded colours outside the token blocks', () => {
    const rest = css.slice(css.indexOf('}', css.indexOf(':root[data-theme="light"] {')) + 1).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.deepEqual(rest.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [], []);
  });

  test('the Bloch sphere canvas reads only tokens that exist', () => {
    const keys = [...read('sphere-view.js').match(/PALETTE_DEFAULTS = \{([\s\S]*?)\};/)[1].matchAll(/'?([a-z-]+)'?:/g)].map((m) => m[1]);
    assert.ok(keys.length >= 10);
    for (const k of keys) assert.ok(k in dark && k in light, `--${k}`);
  });

  // WCAG 2 relative luminance and contrast ratio.
  const lum = (hex) => {
    const h = hex.replace('#', ''), full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const TEXT = [['text', 'surface'], ['text', 'bg'], ['text-2', 'surface'], ['text-3', 'surface'], ['text-muted', 'surface'], ['text-muted', 'inset'], ['text-muted', 'raised'], ['text-muted', 'bg'],
    ['link', 'surface'], ['state-text', 'surface'], ['state-text', 'inset'], ['success', 'surface'], ['danger-text', 'surface'], ['text', 'raised'], ['text', 'accent-bg'], ['text-strong', 'accent-bg-strong'],
    ['on-primary', 'primary'], ['on-primary', 'primary-hover'], ['on-fill', 'fill-state'], ['on-fill', 'fill-axis'], ['on-fill', 'fill-success'], ['on-fill', 'fill-warn'], ['on-fill', 'fill-neutral'], ['footer-strong', 'bg']];
  const GRAPHICS = [['focus', 'surface'], ['focus', 'bg'], ['state', 'surface'], ['state', 'inset'], ['axis', 'surface'], ['axis', 'inset'], ['p0', 'track'], ['p1', 'track'],
    ['p0', 'surface'], ['p1', 'surface'], ['wire', 'inset'], ['gate-border', 'surface'], ['border-control', 'surface'], ['accent', 'surface'], ['heart', 'bg'], ['danger', 'surface']];

  for (const [name, theme] of [['dark', dark], ['light', light]]) {
    test(`${name} theme: text meets WCAG AA (4.5:1)`, () => {
      for (const [fg, bg] of TEXT) assert.ok(ratio(theme[fg], theme[bg]) >= 4.5, `${name}: --${fg} on --${bg} = ${ratio(theme[fg], theme[bg]).toFixed(2)}`);
    });
    test(`${name} theme: focus rings, chart bars, wires and controls meet 3:1`, () => {
      for (const [fg, bg] of GRAPHICS) assert.ok(ratio(theme[fg], theme[bg]) >= 3, `${name}: --${fg} on --${bg} = ${ratio(theme[fg], theme[bg]).toFixed(2)}`);
    });
  }

  test('quantum-meaning colours keep their hue family in both themes', () => {
    const hue = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    for (const k of ['state', 'axis', 'p0', 'p1', 'success', 'focus']) {
      const diff = Math.abs(hue(dark[k]) - hue(light[k]));
      assert.ok(Math.min(diff, 360 - diff) < 25, `--${k} hue ${hue(dark[k]).toFixed(0)}° vs ${hue(light[k]).toFixed(0)}°`);
    }
  });
});

describe('header and footer markup', () => {
  const html = read('index.html');
  test('the theme toggle is a labelled button in the header', () => {
    const header = html.slice(html.indexOf('<header>'), html.indexOf('</header>'));
    assert.match(header, /<button type="button" id="themeToggle"[^>]*aria-label="Theme: [^"]+"/);
    assert.match(header, /class="theme-text">Dark</);
  });

  test('the footer keeps its text and adds the credit with a text heart and text names', () => {
    const footer = html.slice(html.indexOf('<footer>'), html.indexOf('</footer>'));
    assert.ok(footer.includes('Quantum Learning Lab · Open-source educational prototype · MIT'));
    assert.match(footer, /class="credit">Made with <span class="heart" aria-hidden="true">♥<\/span>/);
    assert.ok(footer.includes('<strong>VQTF, VIT Chennai</strong>'));
    assert.ok(footer.includes('🇮🇳'));
    assert.doesNotMatch(footer, /<img|url\(/);
  });
});
