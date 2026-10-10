# Quantum Learning Lab
A free, client-side, offline-capable-after-download **single-qubit educational simulator**. No account, tracking, backend, or external libraries required.

## Features
- Canvas-based orbitable Bloch sphere
- X, Y, Z, H, S, T single-qubit gates applied using complex matrix multiplication
- Parameterized rotations Rx(θ), Ry(θ), Rz(θ) with a slider, a typed angle (0°–360°, validated) and presets
- Animated Bloch-vector rotation showing the active axis, rotation sense and trajectory (respects `prefers-reduced-motion`)
- Step inspector with the full matrix × state-vector calculation, amplitudes, Bloch coordinates and angles
- Lessons on global vs relative phase, and guided "Try it" experiments with predictions
- Theta and phi state preparation controls
- Live state amplitudes and measurement probabilities
- Computational-basis measurement with state collapse

## Local development
Run a local HTTP server (ES modules may not work when opened directly from the filesystem):

```bash
cd quantum-learning-lab
python3 -m http.server 8000
```
Open http://localhost:8000 . Alternatively open the directory using VS Code Live Server.

## Tests
Unit and mathematical regression tests use Node.js's built-in test runner (Node 20+, no dependencies to install):

```bash
npm test          # same as: node --test test/*.test.js
```
They cover every gate and rotation matrix (unitarity, 2π = −I, exact preset angles, exact entries, algebraic identities, Bloch-sphere rotations), normalization, Bloch coordinates, measurement probabilities and sampling, global-phase invariance, amplitude formatting, and the right-handedness of the drawn sphere. The GitHub Pages workflow runs them and will not deploy if any fail.

| File | Contents |
|---|---|
| `quantum.js` | State-vector maths (no DOM) |
| `rotations.js` | Rx, Ry, Rz matrices (θ in radians), exact at multiples of 90° |
| `circuit.js` | Immutable circuit history (gates, rotations, measurements, preparations) |
| `format.js` | Amplitude, angle and equation formatting |
| `angle-input.js` | Validation of typed rotation angles |
| `gate-info.js`, `rotation-info.js` | Educational reference data, checked against the maths by tests |
| `transformation.js` | Display-ready description of a rotation step |
| `experiments.js` | Guided experiments and phase demonstrations (data) |
| `bloch-animation.js` | Visual-only rotation animation; its last frame is the exact computed state |
| `projection.js` | Right-handed camera projection for the Bloch sphere |
| `sphere-view.js`, `circuit-view.js`, `inspector-view.js`, `rotation-panel.js`, `experiments-view.js`, `dom.js` | Views |
| `app.js` | UI state and wiring |
| `test/` | `*.test.js` suites and shared helpers |

## Deploy to GitHub Pages
1. Create a **public** GitHub repository named `quantum-learning-lab`.
2. Push all files, **including `.github/workflows/deploy.yml`**, to its `main` branch.
3. In repository **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**.
4. After the Actions deployment succeeds, visit `https://YOUR_USERNAME.github.io/quantum-learning-lab/`.

There is no build step: the site is plain HTML, CSS, and JavaScript. This is deliberate so the first release is easy to inspect and deploy.

## Mathematical conventions
`|ψ⟩=α|0⟩+β|1⟩` with |α|²+|β|²=1.
Bloch vector: `x=2 Re(α*β), y=2 Im(α*β), z=|α|²−|β|²`. State displays remove an unobservable global phase. The measurement button samples and collapses the state.
Rotations: `R_n(θ) = cos(θ/2) I − i sin(θ/2) n·σ`, so `R_n(2π) = −I`: the same physical operation as I (global phase π), but not the same matrix.
The sphere is drawn in a right-handed frame (X × Y = Z), so S and T rotate anticlockwise when viewed from |0⟩. Arcs on the far hemisphere are dashed.

## Suggested next improvements
- Accessible 3D orientation and responsive mobile gesture controls
- Guided exercises with automated assessment
- Browser E2E tests
- PWA manifest, icons, service worker and offline caching (not yet implemented)

## License
MIT License. See LICENSE.
