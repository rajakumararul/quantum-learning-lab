// Validation for the rotation-angle controls (no DOM). Students enter degrees; the
// mathematics uses radians. Anything that is not a plain decimal number in range is
// rejected with a message rather than silently clamped or coerced.
export const MIN_DEGREES = 0;
export const MAX_DEGREES = 360;
export const PRESET_DEGREES = [0, 45, 90, 180, 270, 360];

export const degreesToRadians = (degrees) => degrees * Math.PI / 180;

// Optional sign (ASCII or typographic minus), digits with an optional decimal point,
// optional trailing degree sign or "deg". Rejects "", "1e3", "0x10", "Infinity", "12abc".
const NUMBER = /^([+\-−]?)(\d+(?:\.\d*)?|\.\d+)\s*(?:°|deg)?$/i;

export function parseDegrees(text) {
  const match = NUMBER.exec(String(text ?? '').trim());
  if (!match) return {ok: false, message: 'Enter the angle as a number of degrees, for example 90 or 22.5.'};
  const degrees = Number(match[2]) * (match[1] && match[1] !== '+' ? -1 : 1);
  if (degrees < MIN_DEGREES || degrees > MAX_DEGREES) {
    return {ok: false, message: `Choose an angle from ${MIN_DEGREES}° to ${MAX_DEGREES}°.`};
  }
  // Number('-0') is −0; report a plain 0.
  return {ok: true, degrees: degrees === 0 ? 0 : degrees, radians: degreesToRadians(degrees === 0 ? 0 : degrees)};
}

// The slider uses step="any" so it can show a typed decimal such as 22.5° exactly (a step of 1 would
// make the browser snap it to 23°). Dragging is rounded here to whole degrees instead.
const clampDegrees = (d) => Math.min(MAX_DEGREES, Math.max(MIN_DEGREES, d));
export const sliderDegrees = (raw) => {
  const d = Number(raw);
  return Number.isFinite(d) ? clampDegrees(Math.round(d)) : MIN_DEGREES;
};

// Keyboard stepping for the slider (step="any" leaves arrow-key steps to the browser, so we define them).
// From a decimal value, a one-degree step lands on the next whole degree in that direction: 22.5 → 23 or 22.
export const SLIDER_KEYS = {ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 15, PageDown: -15};
export function stepDegrees(current, key) {
  if (key === 'Home') return MIN_DEGREES;
  if (key === 'End') return MAX_DEGREES;
  const delta = SLIDER_KEYS[key];
  if (!delta) return null;
  const whole = Number.isInteger(current) ? current + delta : (delta > 0 ? Math.floor(current) + delta : Math.ceil(current) + delta);
  return clampDegrees(whole);
}

// The text shown for an accepted angle in both controls: the exact value, never rounded ("22.5", "90").
export const angleText = (degrees) => String(degrees);
