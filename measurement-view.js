// Measurement lab: one tabbed panel per mode — Live measurement, Shot simulator, Convergence,
// History — plus guided measurement experiments. All mathematics comes from measurement.js,
// shot-simulator.js and sampling.js; this module only builds DOM and wires events.
//
// options:
//   root          the <section> to fill
//   mode          'single' | 'two'
//   prefix        unique id prefix
//   getShown()    {state, label}: the state displayed in the panels above (shots sample this)
//   getLive()     {state, label, lastMeasurement}: the live state (latest step), which live measurement collapses
//   measureLive(target) → {outcome, before, after}: one real measurement, recorded as a circuit step
//   loadSteps(steps)     replaces the circuit (guided experiments)
//   history       shared store from measurement-history.js
import {distributionFor, conditionalOutcomes, targetLabel, TARGETS} from './measurement.js';
import {runShots, parseShots, convergence, nonMonotonicSteps, maxError, SHOT_PRESETS, MAX_SHOTS, CONVERGENCE_SHOTS} from './shot-simulator.js';
import {parseSeed} from './rng.js';
import {rerunSettings} from './measurement-history.js';
import {measurementExperiments} from './measurement-experiments.js';
import {formatReal} from './format.js';
import {formatVector3} from './two-qubit-format.js';
import {el} from './dom.js';

const TABS = [['live', 'Live measurement'], ['shots', 'Shot simulator'], ['convergence', 'Convergence'], ['history', 'History']];
const fmtInt = (n) => n.toLocaleString('en-US');
const pct = (p) => `${(p * 100).toFixed(1)}%`;
const ketOf = (label) => `|${label}⟩`;
const signedPp = (d) => {
  const v = Math.round(d * 1000) / 10;
  return v === 0 ? '0.0 pp' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} pp`;
};

// ---- Pure-ish builders (nodes from results) ------------------------------------------------

export function resultTable(result, caption) {
  return el('div', {class: 'table-scroll'}, el('table', {class: 'shot-table'},
    el('caption', {}, caption),
    el('thead', {}, el('tr', {}, ['Outcome', 'Theory P', 'Count', 'Frequency', '|Error|', 'Deviation'].map((h) => el('th', {scope: 'col'}, h)))),
    el('tbody', {}, result.labels.map((label, k) => el('tr', {},
      el('th', {scope: 'row'}, ketOf(label)),
      el('td', {}, formatReal(result.theory[k])),
      el('td', {}, fmtInt(result.counts[k])),
      el('td', {}, formatReal(result.frequencies[k])),
      el('td', {}, formatReal(result.errors[k])),
      el('td', {}, signedPp(result.frequencies[k] - result.theory[k])))))));
}

// Theory as a dashed outline, observed as a solid bar: distinguishable without colour.
// Each row also states both values in text, which is what screen readers read.
export function resultChart(result, {compact = false} = {}) {
  return el('figure', {class: `shot-chart${compact ? ' compact' : ''}`},
    el('ul', {}, result.labels.map((label, k) => el('li', {},
      el('span', {class: 'sc-label'}, ketOf(label)),
      // Zero-width bars are omitted: a border alone would look like a small nonzero value.
      el('span', {class: 'sc-track', 'aria-hidden': 'true'},
        result.theory[k] > 0 ? el('span', {class: 'sc-theory', style: `width:${(result.theory[k] * 100).toFixed(3)}%`}) : null,
        result.frequencies[k] > 0 ? el('span', {class: 'sc-observed', style: `width:${(result.frequencies[k] * 100).toFixed(3)}%`}) : null),
      el('span', {class: 'sc-values'}, `observed ${pct(result.frequencies[k])} · theory ${pct(result.theory[k])}`)))),
    compact ? null : el('figcaption', {class: 'sc-legend'},
      el('span', {class: 'legend-item'}, el('span', {class: 'key observed', 'aria-hidden': 'true'}), ' solid bar: observed frequency'),
      el('span', {class: 'legend-item'}, el('span', {class: 'key theory', 'aria-hidden': 'true'}), ' dashed outline: Born-rule probability')));
}

const describeRun = (r) => `${fmtInt(r.shots)} shot${r.shots === 1 ? '' : 's'} of ${targetLabel(r.target)}${r.seed === null ? ', random' : `, seed ${r.seed}`}`;
const countsText = (labels, counts) => labels.map((l, k) => `${l}: ${fmtInt(counts[k])}`).join(' · ');

// ---- Component ---------------------------------------------------------------------------------

export function createMeasurementLab({root, mode, prefix, getShown, getLive, measureLive, loadSteps, history}) {
  const id = (name) => `${prefix}-${name}`;
  const targets = TARGETS[mode];
  let target = targets[0], shots = 1000, shotsValid = true, seeded = false, seedText = '42';

  // ---- Header and tabs
  const tabButtons = [], panels = {};
  const tablist = el('div', {class: 'm-tabs', role: 'tablist', 'aria-label': 'Measurement tools'});
  for (const [key, label] of TABS) {
    const button = el('button', {type: 'button', role: 'tab', id: id(`tab-${key}`), 'aria-controls': id(`panel-${key}`), 'aria-selected': 'false', tabindex: '-1'}, label);
    button.addEventListener('click', () => selectTab(key));
    tabButtons.push(button);
    tablist.append(button);
    panels[key] = el('div', {class: 'm-panel', role: 'tabpanel', id: id(`panel-${key}`), 'aria-labelledby': id(`tab-${key}`), tabindex: '0', hidden: ''});
  }
  tablist.addEventListener('keydown', (e) => {
    const i = tabButtons.indexOf(document.activeElement);
    const next = {ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabButtons.length - 1}[e.key];
    if (i < 0 || next === undefined) return;
    e.preventDefault();
    const key = TABS[(next + TABS.length) % TABS.length][0];
    selectTab(key);
    tabButtons[TABS.findIndex(([k]) => k === key)].focus();
  });
  function selectTab(key) {
    TABS.forEach(([k], i) => {
      const on = k === key;
      tabButtons[i].setAttribute('aria-selected', String(on));
      tabButtons[i].tabIndex = on ? 0 : -1;
      panels[k].hidden = !on;
    });
  }

  root.replaceChildren(
    el('div', {class: 'panelhead'}, el('h2', {id: id('title')}, 'Measurement lab'), el('span', {}, mode === 'single' ? 'Born rule · shots · collapse' : 'Joint and partial measurement · correlations')),
    el('p', {class: 'hint'}, 'Theory first, then experiment. The Born rule gives exact probabilities; measurements produce random outcomes whose frequencies only approach those probabilities over many shots.'),
    tablist, ...Object.values(panels));
  root.setAttribute('aria-labelledby', id('title'));

  // ---- Shared controls: target, shots, seed
  const targetControl = mode === 'two'
    ? el('fieldset', {class: 'm-field'}, el('legend', {}, 'Measure'),
      el('div', {class: 'm-options'}, targets.map((t) => {
        const input = el('input', {type: 'radio', name: id('target'), value: String(t), id: id(`target-${t}`)});
        if (t === target) input.checked = true;
        input.addEventListener('change', () => { target = t; refresh(); });
        return el('label', {class: 'm-option', for: id(`target-${t}`)}, input, el('span', {}, t === 'joint' ? 'Both qubits (joint)' : `q${t} only`));
      })))
    : null;

  const shotField = el('input', {type: 'text', inputmode: 'numeric', id: id('shots'), value: '1000', autocomplete: 'off', 'aria-describedby': id('shots-error')});
  const shotError = el('p', {class: 'error', id: id('shots-error'), 'aria-live': 'polite', hidden: ''});
  const presetButtons = SHOT_PRESETS.map((n) => {
    const b = el('button', {type: 'button', class: 'secondary preset', 'aria-pressed': 'false'}, fmtInt(n));
    b.addEventListener('click', () => { shotField.value = String(n); onShots(); });
    return b;
  });
  shotField.addEventListener('input', onShots);
  function onShots() {
    const parsed = parseShots(shotField.value);
    shotsValid = parsed.ok;
    if (parsed.ok) shots = parsed.shots;
    shotField.setAttribute('aria-invalid', String(!parsed.ok));
    shotError.hidden = parsed.ok;
    shotError.textContent = parsed.ok ? '' : parsed.message;
    refresh();
  }

  const seedToggle = el('input', {type: 'checkbox', id: id('seeded')});
  const seedField = el('input', {type: 'text', inputmode: 'numeric', id: id('seed'), value: seedText, autocomplete: 'off', disabled: '', 'aria-describedby': id('seed-help') + ' ' + id('seed-error')});
  const seedError = el('p', {class: 'error', id: id('seed-error'), 'aria-live': 'polite', hidden: ''});
  seedToggle.addEventListener('change', () => { seeded = seedToggle.checked; seedField.disabled = !seeded; refresh(); });
  seedField.addEventListener('input', () => { seedText = seedField.value; refresh(); });
  const seedState = () => {
    if (!seeded) return {ok: true, seed: null};
    const parsed = parseSeed(seedText);
    return parsed.ok && parsed.seed === null ? {ok: false, message: 'Enter a seed, or untick “Reproducible run”.'} : parsed;
  };
  const seedControl = el('div', {class: 'm-field'},
    el('label', {class: 'm-check', for: id('seeded')}, seedToggle, el('span', {}, 'Reproducible run (seed)')),
    el('label', {class: 'visually-hidden', for: id('seed')}, 'Seed'),
    seedField,
    el('p', {class: 'hint', id: id('seed-help')}, 'Same state, shot count and seed always give the same counts, for classroom demonstrations and testing. This is a pseudo-random generator, not quantum randomness. Without a seed, every run is different.'),
    seedError);

  // ---- Live measurement tab
  const liveTheory = el('div', {});
  const liveResult = el('div', {class: 'm-result', 'aria-live': 'polite'});
  const liveButtons = (mode === 'single' ? [['qubit', 'Measure the live state once']] : [['joint', 'Measure both qubits'], [0, 'Measure q0 only'], [1, 'Measure q1 only']]).map(([t, label]) => {
    const b = el('button', {type: 'button', class: t === targets[0] ? 'measure apply' : 'secondary'}, label);
    b.addEventListener('click', () => doLiveMeasure(t));
    return b;
  });
  const conditional = el('div', {});
  panels.live.append(
    el('p', {class: 'explanation'}, 'A live measurement samples one outcome and collapses the live state, just like a measurement on hardware. It is added to the circuit as a measurement step, so Undo restores the state before it.'),
    liveTheory,
    el('div', {class: 'tools m-live-buttons'}, liveButtons),
    liveResult,
    conditional,
    el('div', {class: 'm-contrast'},
      el('h3', {}, 'Shots are not repeated measurements'),
      el('p', {}, el('strong', {}, 'N shots'), ': prepare the state, measure, record, then prepare it again, N times. Every shot starts from the same prepared state, so outcomes stay random. The Shot simulator does this and never changes the live state.'),
      el('p', {}, el('strong', {}, 'Repeated measurement'), ': measure the same qubit again right after a measurement. The state has already collapsed, so the same outcome repeats with probability 1.')));

  function doLiveMeasure(t) {
    const {outcome, before, after} = measureLive(t);
    const labels = distributionFor(before, t).labels, p = distributionFor(before, t).probabilities[outcome];
    const again = el('button', {type: 'button', class: 'secondary'}, 'Measure again (same collapsed state)');
    again.addEventListener('click', () => {
      const second = measureLive(t);
      liveResult.append(el('p', {class: 'verdict right'}, `Second measurement: ${ketOf(labels[second.outcome])}${second.outcome === outcome ? ' — the same result, as it must be (probability 1).' : ''}`));
      again.remove();
    });
    liveResult.replaceChildren(
      el('p', {class: 'm-outcome'}, `Outcome ${ketOf(labels[outcome])}`, el('small', {}, ` (it had probability ${pct(p)})`)),
      el('p', {}, `The live state collapsed to ${getLive().label}. Measuring ${targetLabel(t)} again now gives ${ketOf(labels[outcome])} with probability ${pct(distributionFor(after, t).probabilities[outcome])}.`),
      again);
  }

  function renderLive() {
    const live = getLive(), shown = live.state;
    const tables = (mode === 'single' ? ['qubit'] : ['joint', 0, 1]).map((t) => {
      const {labels, probabilities} = distributionFor(shown, t);
      return el('div', {class: 'm-dist'}, el('h3', {}, mode === 'single' ? 'Born rule: P(0) = |α|², P(1) = |β|²' : t === 'joint' ? 'Joint: P(ab) = |amplitude of |ab⟩|²' : `Marginal for q${t}`),
        el('p', {class: 'formula'}, labels.map((l, k) => `P(${mode === 'single' || t === 'joint' ? l : `q${t}=${l}`}) = ${formatReal(probabilities[k])}`).join('   ')));
    });
    liveTheory.replaceChildren(el('p', {class: 'formula'}, `Live state: ${live.label}`), ...tables);
    if (mode === 'two') {
      conditional.replaceChildren(el('h3', {}, 'What measuring one qubit would do'),
        el('p', {class: 'hint'}, 'For each possible outcome: its probability, the collapsed joint state, and the other qubit\'s reduced Bloch vector before → after (length 1 means that qubit is now in a pure state).'),
        el('div', {class: 'table-scroll'}, el('table', {class: 'shot-table'},
          el('thead', {}, el('tr', {}, ['Measure', 'Outcome', 'Probability', 'State becomes', 'Other qubit before → after'].map((h) => el('th', {scope: 'col'}, h)))),
          el('tbody', {}, [0, 1].flatMap((q) => conditionalOutcomes(shown, q).map((c) => el('tr', {},
            el('th', {scope: 'row'}, `q${q}`), el('td', {}, String(c.outcome)), el('td', {}, pct(c.probability)),
            el('td', {}, c.possible ? live.format(c.state) : 'impossible'),
            el('td', {}, c.possible ? `q${1 - q}: ${formatVector3(c.otherBefore)} → ${formatVector3(c.otherAfter)} (|r| ${formatReal(c.otherLengthBefore)} → ${formatReal(c.otherLengthAfter)})` : '—'))))))));
    }
  }

  // ---- Shot simulator tab
  const runButton = el('button', {type: 'button', class: 'measure apply'}, 'Run shots');
  const shotContext = el('p', {class: 'formula'});
  const shotWarning = el('p', {class: 'hint'});
  const shotOutput = el('div', {class: 'm-result', 'aria-live': 'polite'});
  runButton.addEventListener('click', () => {
    const seed = seedState();
    if (!shotsValid || !seed.ok) return;
    const shown = getShown();
    showResult(record(runShots({state: shown.state, target, shots, seed: seed.seed}), shown));
  });
  panels.shots.append(
    el('p', {class: 'explanation'}, `Each shot prepares the shown state again, measures it once and records the outcome. The live state is not changed, and nothing is added to the circuit. Up to ${fmtInt(MAX_SHOTS)} shots.`),
    shotContext, shotWarning,
    el('div', {class: 'm-controls'},
      targetControl,
      el('div', {class: 'm-field'},
        el('label', {for: id('shots')}, 'Shots'),
        el('div', {class: 'presets', role: 'group', 'aria-label': 'Preset shot counts'}, presetButtons),
        shotField, shotError),
      seedControl),
    runButton, shotOutput);

  function record(result, shown) {
    history.add({mode, label: shown.label, target: result.target, shots: result.shots, seed: result.seed, labels: result.labels, counts: result.counts, state: shown.state});
    return result;
  }
  function showResult(result, {rerunOf = null} = {}) {
    const worst = Math.max(...result.typical);
    shotOutput.replaceChildren(
      el('p', {class: 'm-summary'}, `${describeRun(result)}${rerunOf ? ` (rerun of #${rerunOf})` : ''}: ${countsText(result.labels, result.counts)}`),
      resultChart(result),
      resultTable(result, `Theory vs experiment, N = ${fmtInt(result.shots)}`),
      el('p', {class: 'hint'}, `Typical fluctuation for N = ${fmtInt(result.shots)}: σ = √(p(1 − p)/N) ≤ ${formatReal(worst)}. About two runs in three land within 1σ of the theory, and almost all within 3σ.`));
  }

  // ---- Convergence tab
  const convOutput = el('div', {class: 'm-result', 'aria-live': 'polite'});
  const convButton = el('button', {type: 'button', class: 'measure apply'}, `Run ${CONVERGENCE_SHOTS.map(fmtInt).join(', ')} shots`);
  const prepare = el('button', {type: 'button', class: 'secondary'}, mode === 'single' ? 'Prepare H|0⟩ = |+⟩' : 'Prepare |Φ+⟩');
  prepare.addEventListener('click', () => loadSteps(mode === 'single' ? [{type: 'gate', gate: 'H'}] : [{type: 'gate', gate: 'H', target: 0}, {type: 'two', gate: 'CNOT', control: 0, target: 1}]));
  convButton.addEventListener('click', () => {
    const seed = seedState();
    if (!seed.ok) { selectTab('shots'); return; }
    const shown = getShown(), results = convergence({state: shown.state, target, seed: seed.seed});
    results.forEach((r) => record(r, shown));
    const reversals = nonMonotonicSteps(results);
    convOutput.replaceChildren(
      el('div', {class: 'table-scroll'}, el('table', {class: 'shot-table'},
        el('caption', {}, `Same state, ${targetLabel(target)}, increasing N${seed.seed === null ? '' : ` (seed ${seed.seed})`}`),
        el('thead', {}, el('tr', {}, ['Shots N', 'Observed frequencies', 'Largest |error|', 'Typical σ', 'Error / σ'].map((h) => el('th', {scope: 'col'}, h)))),
        el('tbody', {}, results.map((r) => {
          const sigma = Math.max(...r.typical), err = maxError(r);
          return el('tr', {}, el('th', {scope: 'row'}, fmtInt(r.shots)), el('td', {}, r.labels.map((l, k) => `${l}: ${pct(r.frequencies[k])}`).join(' · ')),
            el('td', {}, formatReal(err)), el('td', {}, formatReal(sigma)), el('td', {}, sigma > 0 ? (err / sigma).toFixed(2) : '—'));
        })))),
      el('div', {class: 'conv-grid'}, results.map((r) => el('div', {}, el('h3', {}, `N = ${fmtInt(r.shots)}`), resultChart(r, {compact: true})))),
      el('p', {}, 'The typical error shrinks like 1/√N: 100 times more shots make it about 10 times smaller. That is a statement about averages. Any single run fluctuates, so a larger sample is not guaranteed to land closer at every step.'),
      el('p', {class: 'hint'}, reversals.length
        ? `In this run, the larger sample landed further from the theory at ${reversals.map(([a, b]) => `N = ${fmtInt(a)} → ${fmtInt(b)}`).join(' and ')}. That is ordinary statistical fluctuation, not a bug.`
        : 'In this run the error happened to shrink at every step. Run it again to see that this is not guaranteed.'));
  });
  panels.convergence.append(
    el('p', {class: 'explanation'}, 'Measure the same prepared state with 10, 100, 1 000 and 10 000 shots and watch the observed frequencies approach the Born-rule probabilities. It uses the shown state, and the target and seed settings from the Shot simulator.'),
    el('div', {class: 'tools'}, prepare, convButton), convOutput);

  // ---- History tab
  const historyBody = el('div', {});
  const clear = el('button', {type: 'button', class: 'secondary'}, 'Clear measurement history');
  clear.addEventListener('click', () => history.clear());
  panels.history.append(
    el('p', {class: 'explanation'}, 'Every shot experiment, in both modes, newest first, as aggregate counts only. Shot experiments never change the quantum state, so they are not circuit steps and are not part of Undo.'),
    el('div', {class: 'tools'}, clear), historyBody);
  function renderHistory(h) {
    clear.disabled = h.records.length === 0;
    if (!h.records.length) { historyBody.replaceChildren(el('p', {class: 'hint'}, 'No shot experiments yet.')); return; }
    historyBody.replaceChildren(el('div', {class: 'table-scroll'}, el('table', {class: 'shot-table history-table'},
      el('thead', {}, el('tr', {}, ['#', 'Time', 'Mode', 'Prepared state', 'Measured', 'Shots', 'Seed', 'Counts', ''].map((x) => el('th', {scope: 'col'}, x)))),
      el('tbody', {}, h.records.map((r) => {
        const rerun = el('button', {type: 'button', class: 'link', 'aria-label': `Rerun experiment ${r.id}`}, 'Rerun');
        rerun.addEventListener('click', () => {
          const result = runShots(rerunSettings(r));
          history.add({...rerunSettings(r), labels: result.labels, counts: result.counts});
          selectTab('shots');
          showResult(result, {rerunOf: r.id});
        });
        return el('tr', {},
          el('th', {scope: 'row'}, String(r.id)), el('td', {}, new Date(r.time).toLocaleTimeString()),
          el('td', {}, r.mode === 'single' ? 'one qubit' : 'two qubits'), el('td', {class: 'formula'}, r.label),
          el('td', {}, targetLabel(r.target)), el('td', {}, fmtInt(r.shots)), el('td', {}, r.seed === null ? 'random' : String(r.seed)),
          el('td', {}, countsText(r.labels, r.counts)), el('td', {}, rerun));
      })))));
  }
  history.subscribe(renderHistory);

  // ---- Guided experiments
  const guided = el('div', {class: 'experiments m-guided'});
  for (const exp of measurementExperiments[mode]) {
    const out = el('div', {class: 'feedback', 'aria-live': 'polite'});
    const run = el('button', {type: 'button', class: 'secondary'}, 'Run experiment');
    run.addEventListener('click', () => runGuided(exp, out));
    guided.append(el('article', {class: 'experiment'}, el('h3', {}, exp.title), el('p', {}, exp.setupText), el('div', {class: 'tools'}, run), out));
  }
  root.append(el('h3', {class: 'm-guided-title'}, 'Guided measurement experiments'),
    el('p', {class: 'hint'}, 'Each experiment replaces the current circuit. Shot results are added to the measurement history.'), guided);

  function runGuided(exp, out) {
    loadSteps(exp.steps);
    const seed = seedState().ok ? seedState().seed : null, nodes = [];
    for (const action of exp.actions) {
      if (action.kind === 'shots') {
        const shown = getShown(), r = record(runShots({state: shown.state, target: action.target, shots: action.shots, seed}), shown);
        nodes.push(el('h4', {}, describeRun(r)), el('p', {class: 'formula'}, countsText(r.labels, r.counts)), resultChart(r, {compact: true}));
      } else {
        const before = getLive();
        const cond = mode === 'two' && action.target !== 'joint' ? conditionalOutcomes(before.state, action.target) : null;
        const {outcome, after} = measureLive(action.target), labels = distributionFor(before.state, action.target).labels;
        nodes.push(el('p', {}, `Live measurement of ${targetLabel(action.target)}: outcome ${ketOf(labels[outcome])}; the state is now ${getLive().label}. Repeating it now gives ${ketOf(labels[outcome])} with probability ${pct(distributionFor(after, action.target).probabilities[outcome])}.`));
        if (cond) {
          const c = cond[outcome];
          nodes.push(el('p', {class: 'formula'}, `q${1 - action.target} reduced Bloch vector: ${formatVector3(c.otherBefore)} (|r| = ${formatReal(c.otherLengthBefore)}) → ${formatVector3(c.otherAfter)} (|r| = ${formatReal(c.otherLengthAfter)})`));
        }
      }
    }
    out.replaceChildren(...nodes, el('p', {}, exp.explanation));
  }

  // ---- Refresh on any change
  function refresh() {
    const shown = getShown(), seed = seedState();
    presetButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(shotsValid && SHOT_PRESETS[i] === shots)));
    seedError.hidden = seed.ok;
    seedError.textContent = seed.ok ? '' : seed.message;
    seedField.setAttribute('aria-invalid', String(!seed.ok));
    runButton.disabled = !shotsValid || !seed.ok;
    runButton.textContent = shotsValid ? `Run ${fmtInt(shots)} shot${shots === 1 ? '' : 's'}` : 'Run shots';
    shotContext.textContent = `Prepared state: ${shown.label}`;
    shotWarning.textContent = shown.afterMeasurement
      ? 'This state comes after a recorded measurement, so shots re-prepare the circuit with that outcome held fixed. Undo the measurement to sample the state before it.'
      : '';
    renderLive();
  }

  selectTab('live');
  renderHistory(history.get());
  refresh();
  return {update: refresh};
}
