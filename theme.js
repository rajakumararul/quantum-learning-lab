// Light / dark theme (independent of all quantum state: this module imports nothing from the simulator).
//
// Rules, shared with the inline script in index.html that applies the theme before first paint:
//   1. A theme the user chose earlier (localStorage "qll-theme" = "light" | "dark") wins.
//   2. Otherwise follow the operating system: light if it prefers light, else dark (dark is the
//      lab's original look, so "no preference" and unsupported browsers keep it).
//   3. Anything else stored (old or corrupted values) is ignored, never trusted.
// While no choice is saved, the page keeps following OS changes; once the user picks, it stops.
export const THEMES = ['light', 'dark'];
export const STORAGE_KEY = 'qll-theme';
export const LIGHT_QUERY = '(prefers-color-scheme: light)';
export const THEME_COLORS = {dark: '#0b1020', light: '#f3f6fb'}; // <meta name="theme-color">, matching --bg
export const THEME_EVENT = 'qll-themechange';

export const isTheme = (value) => THEMES.includes(value);
export const otherTheme = (theme) => (theme === 'dark' ? 'light' : 'dark');
export const resolveTheme = (stored, prefersLight) => (isTheme(stored) ? stored : prefersLight ? 'light' : 'dark');

// Storage can be missing or throw (private browsing, blocked cookies): treat that as "nothing saved".
export function readStoredTheme(storage) {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}
export function saveTheme(storage, theme) {
  if (!isTheme(theme)) throw Error('Unknown theme ' + theme);
  try {
    storage?.setItem(STORAGE_KEY, theme);
    return true;
  } catch {
    return false; // still applied for this visit, just not remembered
  }
}

// Text for the toggle: always names the current theme in words, not only with an icon.
export const toggleLabel = (theme) => ({
  text: theme === 'dark' ? 'Dark' : 'Light',
  icon: theme === 'dark' ? '☾' : '☀',
  aria: `Theme: ${theme}. Switch to ${otherTheme(theme)} theme`,
});

// root: the <html> element (anything with setAttribute); media: a MediaQueryList for LIGHT_QUERY.
export function createThemeController({root, storage, media, onChange = () => {}}) {
  let saved = readStoredTheme(storage);
  let theme = resolveTheme(saved, media?.matches ?? false);
  const apply = () => { root.setAttribute('data-theme', theme); onChange(theme); };
  const followSystem = (e) => {
    if (saved) return;
    theme = e.matches ? 'light' : 'dark';
    apply();
  };
  media?.addEventListener?.('change', followSystem);
  apply();
  return {
    get: () => theme,
    isSaved: () => saved !== null,
    set(next) {
      if (!isTheme(next)) throw Error('Unknown theme ' + next);
      theme = next;
      saved = next;
      saveTheme(storage, next);
      apply();
    },
    toggle() { this.set(otherTheme(theme)); return theme; },
  };
}

// Browser wiring: the header button, <meta name="theme-color">, and an event the canvases redraw on.
export function initTheme(doc = document, win = window) {
  const button = doc.getElementById('themeToggle'), meta = doc.querySelector('meta[name="theme-color"]');
  let storage = null;
  try { storage = win.localStorage; } catch { /* blocked */ }
  const controller = createThemeController({
    root: doc.documentElement, storage, media: win.matchMedia?.(LIGHT_QUERY),
    onChange(theme) {
      meta?.setAttribute('content', THEME_COLORS[theme]);
      if (button) {
        const label = toggleLabel(theme);
        button.querySelector('.theme-icon').textContent = label.icon;
        button.querySelector('.theme-text').textContent = label.text;
        button.setAttribute('aria-label', label.aria);
        button.title = label.aria;
      }
      doc.dispatchEvent(new win.CustomEvent(THEME_EVENT, {detail: {theme}}));
    },
  });
  button?.addEventListener('click', () => controller.toggle());
  return controller;
}
