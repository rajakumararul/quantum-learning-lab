// Shot simulator (no DOM).
//
// What "N shots" means here: prepare the same state, measure it, record the outcome, re-prepare,
// repeat N times. Because the simulation is deterministic, every re-preparation gives the identical
// state, so the N outcomes are N independent samples from that state's Born-rule distribution.
// The live state is never collapsed or modified: runShots only reads it.
import {distributionFor} from './measurement.js';
import {sampleCounts, standardError} from './sampling.js';
import {randomSource, deriveSeed} from './rng.js';

export const SHOT_PRESETS = [1, 10, 100, 1000, 10000];
// 100 000 shots take a few milliseconds even on slow phones (K ≤ 4 outcomes, O(N) work), so the
// browser never freezes, while still being large enough to show convergence clearly.
export const MAX_SHOTS = 100000;
export const CONVERGENCE_SHOTS = [10, 100, 1000, 10000];

// Accepts "1000", "1,000" or "1 000"; rejects decimals, signs, zero and values above MAX_SHOTS.
export function parseShots(text) {
  const t = String(text ?? '').trim().replace(/[,\s_]/g, '');
  if (!/^\d+$/.test(t)) return {ok: false, message: `Enter a whole number of shots from 1 to ${MAX_SHOTS.toLocaleString('en-US')}.`};
  const shots = Number(t);
  if (shots < 1 || shots > MAX_SHOTS) return {ok: false, message: `Choose between 1 and ${MAX_SHOTS.toLocaleString('en-US')} shots.`};
  return {ok: true, shots};
}

// One shot experiment. `random` may be passed directly (tests); otherwise it comes from the seed.
export function runShots({state, target, shots, seed = null, random = randomSource(seed)}) {
  const {labels, probabilities} = distributionFor(state, target);
  const counts = sampleCounts(probabilities, shots, random);
  const frequencies = counts.map((c) => c / shots);
  return {
    target, shots, seed, labels, theory: probabilities, counts, frequencies,
    errors: frequencies.map((f, k) => Math.abs(f - probabilities[k])),
    typical: probabilities.map((p) => standardError(p, shots)),
  };
}

// The largest |frequency − probability| over all outcomes.
export const maxError = (result) => Math.max(...result.errors);

// The same state measured with increasing shot counts. With a seed, each shot count uses its own
// derived seed, so the whole table is reproducible.
export function convergence({state, target, shotCounts = CONVERGENCE_SHOTS, seed = null}) {
  const shared = seed === null ? randomSource(null) : null;
  return shotCounts.map((shots) => runShots({state, target, shots, seed, random: shared ?? randomSource(deriveSeed(seed, shots))}));
}

// Pairs of shot counts where the larger sample happened to land further from the theory:
// ordinary statistical fluctuation, worth pointing out rather than hiding.
export function nonMonotonicSteps(results) {
  const steps = [];
  for (let i = 1; i < results.length; i++) if (maxError(results[i]) > maxError(results[i - 1])) steps.push([results[i - 1].shots, results[i].shots]);
  return steps;
}
