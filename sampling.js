// Sampling from a discrete probability distribution (no DOM).
//
// Inverse-CDF sampling: outcome k owns the half-open interval [F(k−1), F(k)) of [0, 1), where F is
// the cumulative sum. A uniform draw u selects the first k with u < F(k). Half-open intervals give
// every outcome exactly its probability (no boundary double-counting), and an outcome with p = 0 owns
// an empty interval, so it can never be chosen. If rounding leaves u ≥ F(last) (sums like 0.9999…),
// the last outcome with p > 0 is chosen — never a zero-probability one.
//
// N shots cost O(N·K) for K outcomes (K ≤ 4 here): the state is prepared once and N independent
// draws are taken from its fixed distribution. Re-simulating the circuit for every shot would give
// exactly the same distribution, so it is unnecessary.

const TOLERANCE = 1e-9;

// Validates a distribution and divides out floating-point drift so it sums to exactly ~1.
export function normalizeDistribution(probabilities) {
  if (!Array.isArray(probabilities) || probabilities.length === 0) throw Error('A distribution needs at least one outcome');
  for (const p of probabilities) {
    if (typeof p !== 'number' || !Number.isFinite(p) || p < -TOLERANCE) throw Error(`Invalid probability ${p}`);
  }
  const clean = probabilities.map((p) => Math.max(0, p));
  const total = clean.reduce((s, p) => s + p, 0);
  if (Math.abs(total - 1) > 1e-6) throw Error(`Probabilities must sum to 1 (got ${total})`);
  return clean.map((p) => p / total);
}

export function cumulative(probabilities) {
  let acc = 0;
  return probabilities.map((p) => (acc += p));
}

// The outcome index for one uniform draw u ∈ [0, 1).
export function sampleIndex(probabilities, u) {
  const cdf = cumulative(probabilities);
  return indexFromCdf(cdf, probabilities, u);
}

function indexFromCdf(cdf, probabilities, u) {
  for (let k = 0; k < cdf.length; k++) if (u < cdf[k]) return k;
  for (let k = probabilities.length - 1; k >= 0; k--) if (probabilities[k] > 0) return k;
  throw Error('Distribution has no outcome with positive probability');
}

// Aggregate counts of `shots` independent samples. `random` returns uniforms in [0, 1).
export function sampleCounts(probabilities, shots, random) {
  if (!Number.isInteger(shots) || shots < 0) throw Error('Shots must be a non-negative integer');
  const p = normalizeDistribution(probabilities), counts = p.map(() => 0);
  // A certain outcome needs no random numbers at all.
  const certain = p.findIndex((x) => x === 1);
  if (certain >= 0) { counts[certain] = shots; return counts; }
  const cdf = cumulative(p);
  for (let i = 0; i < shots; i++) counts[indexFromCdf(cdf, p, random())]++;
  return counts;
}

// Typical size of the statistical fluctuation of an observed frequency: σ = √(p(1 − p)/N).
export const standardError = (p, shots) => (shots > 0 ? Math.sqrt(p * (1 - p) / shots) : NaN);
