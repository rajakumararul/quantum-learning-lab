// "Try it" cards (shared by both modes) and the single-qubit phase-lesson demo buttons.
// Each experiment: Set up (loads the setup steps) → choose a prediction → Apply (loads setup + actions)
// → feedback judged against the simulated result. load(steps) replaces the current circuit.
import {experiments, phaseDemos, experimentCircuit, judgePrediction} from './experiments.js';
import {probabilities, bloch} from './quantum.js';
import {formatRotation, formatKet} from './format.js';
import {el, vectorText} from './dom.js';

// options: {container, items, idPrefix, actionText(exp), steps(exp, withActions), judge(exp, choiceIndex),
//           resultNodes(state), load(steps, {animate})}
export function createExperimentCards({container, items, idPrefix, actionText, steps, judge, resultNodes, load}) {
  items.forEach((exp, n) => {
    const action = actionText(exp), name = `${idPrefix}-${exp.id}`;
    const choices = exp.choices.map((c, i) => el('label', {class: 'choice'}, el('input', {type: 'radio', name, value: String(i)}), el('span', {}, c.label)));
    const setupButton = el('button', {type: 'button', class: 'secondary'}, 'Set up');
    const applyButton = el('button', {type: 'button', class: 'measure apply', disabled: ''}, `Apply ${action} and check`);
    const feedback = el('div', {class: 'feedback', 'aria-live': 'polite'});
    const fieldset = el('fieldset', {class: 'choices', disabled: ''}, el('legend', {}, exp.question), choices);
    const status = el('p', {class: 'hint'}, 'Press Set up to load the starting state. This replaces the current circuit.');

    setupButton.addEventListener('click', () => {
      load(steps(exp, false));
      fieldset.disabled = false;
      for (const c of fieldset.querySelectorAll('input')) c.checked = false;
      applyButton.disabled = true;
      feedback.replaceChildren();
      status.textContent = `Loaded: ${exp.setupText} Make your prediction, then apply ${action}.`;
      fieldset.querySelector('input').focus();
    });
    fieldset.addEventListener('change', () => { applyButton.disabled = false; });
    applyButton.addEventListener('click', () => {
      const picked = fieldset.querySelector('input:checked');
      if (!picked) return;
      const {correct, correctIndex, state} = judge(exp, Number(picked.value));
      load(steps(exp, true), {animate: true});
      fieldset.disabled = true;
      applyButton.disabled = true;
      feedback.replaceChildren(
        el('p', {class: correct ? 'verdict right' : 'verdict wrong'}, correct ? '✓ Your prediction matches the simulation.' : `Not quite. The simulation gives: ${exp.choices[correctIndex].label}.`),
        ...resultNodes(state),
        el('p', {}, exp.explanation));
      status.textContent = 'Press Set up to try again.';
    });

    container.append(el('article', {class: 'experiment', 'aria-labelledby': `${name}-title`},
      el('h3', {id: `${name}-title`}, `Experiment ${n + 1} · ${exp.title}`),
      el('p', {}, `${exp.setupText} Then apply ${action}.`),
      el('div', {class: 'tools'}, setupButton),
      status, fieldset, applyButton, feedback));
  });
}

// Single-qubit experiments and phase demos.
export function createExperiments({container, demoContainer, load}) {
  createExperimentCards({
    container, items: experiments, idPrefix: 'exp', load,
    actionText: (exp) => formatRotation(exp.action.gate, exp.action.theta),
    steps: (exp, withAction) => experimentCircuit(exp, {withAction}).steps,
    judge: judgePrediction,
    resultNodes(state) {
      const [p0, p1] = probabilities(state);
      return [
        el('p', {class: 'formula'}, `|ψ⟩ = ${formatKet(state[0], state[1])}`),
        el('p', {class: 'formula'}, `P(0) = ${(p0 * 100).toFixed(1)}%, P(1) = ${(p1 * 100).toFixed(1)}%, Bloch vector ${vectorText(bloch(state))}`)];
    },
  });

  for (const demo of phaseDemos) {
    const button = el('button', {type: 'button', class: 'secondary'}, `Show ${demo.label}`);
    button.addEventListener('click', () => load(demo.steps, {animate: true}));
    demoContainer.append(button);
  }
}
