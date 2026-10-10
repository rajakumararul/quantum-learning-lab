// Pseudo-random numbers (no DOM, no dependencies).
//
// Default runs use the browser's Math.random. A seeded run uses mulberry32, a small, fast 32-bit
// generator: the same seed always gives the same sequence, which makes classroom demonstrations and
// tests reproducible. Neither is quantum randomness. On real hardware each outcome comes from a
// physical measurement; here the Born-rule probabilities are exact and only the sampling is simulated.
export const MAX_SEED = 0xffffffff;

// mulberry32: returns successive unsigned 32-bit integers.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

// Uniform doubles in [0, 1) with full 53-bit resolution: 32 bits from one draw, 21 from the next.
// (A single 32-bit draw would quantize probabilities to steps of 2^-32.)
export function seededRandom(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) throw Error(`Seed must be an integer from 0 to ${MAX_SEED}`);
  const next = mulberry32(seed);
  return () => (next() * 2 ** 21 + (next() >>> 11)) / 2 ** 53;
}

export const systemRandom = () => Math.random;

// Random source for a run: seeded when a seed is given, otherwise the system generator.
export const randomSource = (seed = null) => (seed === null ? systemRandom() : seededRandom(seed));

// A different but reproducible seed for each part of a seeded experiment (e.g. each shot count).
export function deriveSeed(seed, salt) {
  let h = (seed ^ Math.imul(salt >>> 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Seed text from the UI: "" means "no seed" (random run); otherwise a whole number 0 … 4 294 967 295.
export function parseSeed(text) {
  const t = String(text ?? '').trim();
  if (t === '') return {ok: true, seed: null};
  if (!/^\d+$/.test(t)) return {ok: false, message: 'The seed must be a whole number, for example 42.'};
  const seed = Number(t);
  if (seed > MAX_SEED) return {ok: false, message: `The seed must be at most ${MAX_SEED.toLocaleString('en-US')}.`};
  return {ok: true, seed};
}
