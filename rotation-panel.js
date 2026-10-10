// Rotation explorer controls: choose Rx/Ry/Rz, set θ with a slider, a typed value or presets,
// and apply. Also renders the gate information card for the selected rotation.
// The panel owns only its control state; applying calls onApply(gate, thetaRadians).
import {ROTATIONS, rotationMatrix} from './rotations.js';
import {rotationInfo} from './rotation-info.js';
import {PRESET_DEGREES, parseDegrees, degreesToRadians, sliderDegrees, stepDegrees, angleText} from './angle-input.js';
import {formatComplex, formatAngle, formatRotation} from './format.js';
import {el, matrixNode} from './dom.js';

export function createRotationPanel({onApply}) {
  const $ = (id) => document.getElementById(id);
  const slider = $('rotSlider'), field = $('rotAngle'), error = $('rotAngleError'), apply = $('applyRotation');
  let gate = 'Rx', degrees = 90, valid = true;

  for (const g of ROTATIONS) {
    const input = el('input', {type: 'radio', name: 'rotAxis', value: g, id: `rot-${g}`});
    if (g === gate) input.checked = true;
    input.addEventListener('change', () => { gate = g; renderInfo(); update(); });
    $('rotAxes').append(el('label', {for: `rot-${g}`, class: 'axis-option'}, input, el('span', {}, `${g}(θ)`), el('small', {}, `about ${rotationInfo[g].axisName}`)));
  }
  for (const d of PRESET_DEGREES) {
    const button = el('button', {type: 'button', class: 'secondary preset', 'data-degrees': d, 'aria-label': `Set θ to ${d} degrees`}, `${d}°`);
    button.addEventListener('click', () => setDegrees(d));
    $('rotPresets').append(button);
  }

  // Both controls always show the same accepted value, exactly (the slider has step="any").
  function setDegrees(d, {fromField = false} = {}) {
    degrees = d; valid = true;
    slider.value = angleText(d);
    if (!fromField) field.value = angleText(d);
    update();
  }

  slider.addEventListener('input', () => setDegrees(sliderDegrees(slider.value)));
  slider.addEventListener('keydown', (e) => {
    const next = stepDegrees(degrees, e.key);
    if (next === null) return;
    e.preventDefault();
    setDegrees(next);
  });
  field.addEventListener('input', () => {
    const parsed = parseDegrees(field.value);
    if (parsed.ok) setDegrees(parsed.degrees, {fromField: true});
    else { valid = false; error.textContent = parsed.message; update(); }
  });
  // On leaving the field, show the accepted value in canonical form ("90°" → "90").
  field.addEventListener('change', () => { if (valid) field.value = angleText(degrees); });
  apply.addEventListener('click', () => { if (valid) onApply(gate, degreesToRadians(degrees)); });

  function update() {
    const theta = degreesToRadians(degrees), label = formatRotation(gate, theta);
    field.setAttribute('aria-invalid', String(!valid));
    slider.setAttribute('aria-valuetext', `${angleText(degrees)} degrees`);
    error.hidden = valid;
    $('rotAngleRadians').textContent = valid ? formatAngle(theta) : 'Waiting for a valid angle';
    apply.disabled = !valid;
    apply.textContent = valid ? `Apply ${label}` : 'Apply rotation';
    for (const b of $('rotPresets').children) b.setAttribute('aria-pressed', String(valid && Number(b.dataset.degrees) === degrees));
    $('rotNumeric').replaceChildren(valid
      ? el('div', {class: 'matrix-eq'}, `${label} =`, matrixNode(rotationMatrix(gate, theta).map((row) => row.map(formatComplex))))
      : el('p', {class: 'hint'}, 'The numerical matrix appears for a valid angle.'));
  }

  // The gate card is rebuilt only when the gate changes, so the angle controls never collapse its
  // sections; which sections are open is carried over from one gate to the next.
  function renderInfo() {
    const box = $('rotationInfo'), info = rotationInfo[gate];
    const wasOpen = new Set([...box.querySelectorAll('details[open]')].map((d) => d.dataset.section));
    const section = (key, title, ...content) => {
      const details = el('details', {class: 'info-section', 'data-section': key}, el('summary', {}, title), ...content);
      details.open = wasOpen.has(key);
      return details;
    };
    box.replaceChildren(
      el('div', {class: 'info-head'},
        el('h3', {}, `${gate}(θ) · ${info.title}`),
        el('span', {class: 'axis-tag'}, `axis ${info.axisName} = (${info.axis.join(', ')})`)),
      el('div', {class: 'matrix-pair'},
        el('div', {class: 'matrix-eq'}, `${gate}(θ) =`, matrixNode(info.matrix)),
        el('div', {id: 'rotNumeric'})),
      el('p', {class: 'formula'}, info.blochMap),
      section('geometry', 'On the Bloch sphere', el('p', {class: 'info-text'}, info.geometry)),
      section('use', 'Typical use', el('p', {class: 'info-text'}, info.use)),
      section('special', `Special cases (${info.specialCases.length})`,
        el('p', {class: 'hint'}, '“=” is exact mathematical equality. “≃” means physically equivalent: equal up to a global phase, which no measurement can detect.'),
        el('ul', {class: 'special-list'}, info.specialCases.map((c) => el('li', {},
          el('span', {class: 'formula'}, c.statement),
          el('span', {class: `badge ${c.kind}`}, c.kind === 'equal' ? 'exact equality' : '≃ up to global phase'),
          el('span', {class: 'case-meaning'}, c.meaning))))));
  }

  renderInfo();
  update();
}
