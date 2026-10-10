# Quantum Learning Lab
A free, client-side, offline-capable-after-download **one- and two-qubit educational simulator**. No account, tracking, backend, or external libraries required.

## Features
- Canvas-based orbitable Bloch sphere
- X, Y, Z, H, S, T single-qubit gates applied using complex matrix multiplication
- Parameterized rotations Rx(θ), Ry(θ), Rz(θ) with a slider, a typed angle (0°–360°, validated) and presets
- Animated Bloch-vector rotation showing the active axis, rotation sense and trajectory (respects `prefers-reduced-motion`)
- Step inspector with the full matrix × state-vector calculation, amplitudes, Bloch coordinates and angles
- Lessons on global vs relative phase, and guided "Try it" experiments with predictions
- **Two-qubit mode**: any single-qubit gate or rotation on q0 or q1 (as U ⊗ I or I ⊗ U), CNOT in both directions, CZ and SWAP
- Two-wire circuit diagram in standard notation (control •, target ⊕, CZ dots, SWAP ×) with history and exact Undo
- 4×4 matrices, amplitudes α, β, γ, δ with exact forms such as 1/√2, and a probability histogram
- Entanglement via the concurrence C = 2|αδ − βγ|, reduced density matrices ρ₀ = Tr₁ρ, ρ₁ = Tr₀ρ and their Bloch vectors
- Guided preparation of the four Bell states and two-qubit experiments (Bell pair, superposition vs entanglement, SWAP, CZ)
- **Measurement lab** in both modes: live measurement with collapse (recorded in the circuit, undoable), a shot simulator (1 to 100,000 shots) comparing Born-rule probabilities with observed counts, frequencies and errors, a convergence demonstration, joint and partial (q0 or q1) measurement with conditional collapse, seeded reproducible runs, and a measurement history kept separate from Undo
- Theta and phi state preparation controls
- Live state amplitudes and measurement probabilities
- Computational-basis measurement with state collapse

## Local development
Requires Node.js 20 or later. There are **no dependencies**, so no `npm install` is needed: the development server uses only Node.js built-in modules.

```bash
cd quantum-learning-lab
npm run serve            # serves the project at http://localhost:8000
```
Open http://localhost:8000 and press Ctrl+C to stop. Use `npm run serve -- --port 8080` (or `PORT=8080 npm run serve`) for another port.

The page must be served over HTTP, because browsers do not load ES modules from `file://`. The server sends `Cache-Control: no-store`, so edited modules are never served stale, and it never serves hidden files such as `.git`.

Fallback: `python3 -m http.server 8000` also works for small pages, but it is not recommended here. The app loads about 30 modules in parallel, and Python's server can reset some of those connections, which leaves the page blank.

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
| `measurement.js` | Born-rule distributions, marginals, collapse and conditional states |
| `sampling.js` | Distribution validation and unbiased inverse-CDF sampling |
| `rng.js` | Seeded pseudo-random generator (mulberry32, 53-bit uniforms) and seed parsing |
| `shot-simulator.js` | N-shot experiments, shot-count validation, convergence runs |
| `measurement-history.js`, `measurement-experiments.js` | Shot-experiment history and guided measurement experiments |
| `measurement-view.js` | The Measurement lab UI (shared by both modes) |
| `tensor.js` | Complex n×n linear algebra: Kronecker product, products, adjoint, trace |
| `multi-qubit.js` | Two-qubit states, basis ordering, U ⊗ I / I ⊗ U operators, measurement |
| `controlled-gates.js` | CNOT, CZ, SWAP and a generic controlled-U builder (registry for future gates) |
| `density-matrix.js` | ρ = \|ψ⟩⟨ψ\|, partial traces, reduced Bloch vectors, purity |
| `entanglement.js` | Concurrence and product-state factorization |
| `two-qubit-circuit.js`, `two-qubit-format.js`, `two-qubit-experiments.js` | Two-qubit history, formatting, Bell states and experiments |
| `two-qubit-circuit-view.js`, `two-qubit-view.js`, `two-qubit-app.js` | Two-qubit views and UI wiring |
| `bloch-animation.js` | Visual-only rotation animation; its last frame is the exact computed state |
| `projection.js` | Right-handed camera projection for the Bloch sphere |
| `sphere-view.js`, `circuit-view.js`, `inspector-view.js`, `rotation-panel.js`, `experiments-view.js`, `dom.js` | Views |
| `app.js` | UI state and wiring |
| `scripts/serve.mjs` | Zero-dependency local development server (`npm run serve`) |
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
Measurement: **N shots** means preparing the state, measuring once and recording the outcome, N times. Each shot starts from the same prepared state, and the live state is never changed. A **live measurement** samples one outcome and collapses the state, and measuring again immediately repeats that outcome. Seeded runs use a pseudo-random generator, for reproducibility only; it is not quantum randomness.
Two qubits: `|ψ⟩ = α|00⟩ + β|01⟩ + γ|10⟩ + δ|11⟩`, where a label `|q0 q1⟩` lists q0 first, so the basis index is `k = 2·q0 + q1` and q0 is the left tensor factor (a gate on q0 is `U ⊗ I`). Some toolkits, such as Qiskit, order qubits the other way round.
The sphere is drawn in a right-handed frame (X × Y = Z), so S and T rotate anticlockwise when viewed from |0⟩. Arcs on the far hemisphere are dashed.

## Suggested next improvements
- Accessible 3D orientation and responsive mobile gesture controls
- Guided exercises with automated assessment
- Browser E2E tests
- PWA manifest, icons, service worker and offline caching (not yet implemented)

## License
MIT License. See LICENSE.
