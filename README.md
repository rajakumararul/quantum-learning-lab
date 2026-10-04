# Quantum Learning Lab
A free, client-side, offline-capable-after-download **single-qubit educational simulator**. No account, tracking, backend, or external libraries required.

## Features
- Canvas-based orbitable Bloch sphere
- X, Y, Z, H, S, T single-qubit gates applied using complex matrix multiplication
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
They cover every gate matrix (unitarity, exact entries, algebraic identities, Bloch-sphere rotations), normalization, Bloch coordinates, measurement probabilities and sampling, global-phase invariance, amplitude formatting, and the right-handedness of the drawn sphere. The GitHub Pages workflow runs them and will not deploy if any fail.

| File | Contents |
|---|---|
| `quantum.js` | State-vector maths (no DOM) |
| `format.js` | Amplitude and equation formatting |
| `projection.js` | Right-handed camera projection for the Bloch sphere |
| `app.js` | UI wiring and canvas drawing |
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
The sphere is drawn in a right-handed frame (X × Y = Z), so S and T rotate anticlockwise when viewed from |0⟩. Arcs on the far hemisphere are dashed.

## Suggested next improvements
- Accessible 3D orientation and responsive mobile gesture controls
- Gate sequence history and circuit diagram
- Guided exercises with automated assessment
- Automated unit tests and browser E2E tests
- PWA manifest, icons, service worker and offline caching (not yet implemented)

## License
MIT License. See LICENSE.
