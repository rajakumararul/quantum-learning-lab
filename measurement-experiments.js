// Guided measurement experiments (data only, no DOM). Each has a preparation (circuit steps) and a
// list of actions the Measurement lab performs in order:
//   {kind: 'shots', target, shots}   N-shot experiment on the prepared state (state unchanged)
//   {kind: 'measure', target}        one live measurement: collapses the live state (a circuit step)
// Tests check every claim in the explanations against the simulator.
const g = (gate, target) => ({type: 'gate', gate, target});
const H0 = {type: 'gate', gate: 'H'}; // single-qubit mode step
const CNOT01 = {type: 'two', gate: 'CNOT', control: 0, target: 1};

export const measurementExperiments = {
  single: [
    {
      id: 'one-vs-many', title: 'One shot vs many shots',
      setupText: 'H prepares |+⟩ = (|0⟩ + |1⟩)/√2, so P(0) = P(1) = 1/2.',
      steps: [H0],
      actions: [{kind: 'shots', target: 'qubit', shots: 1}, {kind: 'shots', target: 'qubit', shots: 100}, {kind: 'shots', target: 'qubit', shots: 10000}],
      explanation: 'One shot gives a single 0 or 1: it cannot reveal the probabilities. 100 shots give a rough estimate: the typical fluctuation is σ = √(p(1 − p)/N) = √(0.25/100) = 0.05, and about two runs in three land within 5 percentage points of 50%. With 10 000 shots σ = 0.005, so about two runs in three land within 0.5 points. Larger samples are better on average, not on every single run. The state itself never changed: each shot re-prepares |+⟩ and measures it once.',
    },
    {
      id: 'collapse-repeat', title: 'Collapse and repeated measurement',
      setupText: 'H prepares |+⟩. This time the live state is measured, twice in a row.',
      steps: [H0],
      actions: [{kind: 'measure', target: 'qubit'}, {kind: 'measure', target: 'qubit'}],
      explanation: 'The first measurement is random: 0 or 1 with probability 1/2 each. It collapses the state to |0⟩ or |1⟩, so the second, immediate measurement of the same state must repeat that result with probability 1. Compare the shot simulator, which re-prepares |+⟩ before every shot and so keeps giving random results. Undo removes the measurements and restores |+⟩.',
    },
  ],
  two: [
    {
      id: 'bell-correlation', title: 'Bell correlation',
      setupText: 'H on q0 and CNOT prepare |Φ+⟩ = (|00⟩ + |11⟩)/√2.',
      steps: [g('H', 0), CNOT01],
      actions: [{kind: 'shots', target: 'joint', shots: 1000}],
      explanation: 'Only 00 and 11 appear, each about half the time; 01 and 10 never do, because their amplitudes are exactly 0. Each qubit alone looks like a fair coin (P(q0 = 0) = P(q1 = 0) = 1/2), yet the two results always agree. Random does not mean structureless: the randomness is in the pair, and the correlation is perfect.',
    },
    {
      id: 'bell-anticorrelation', title: 'Bell anti-correlation',
      setupText: 'H on q0, X on q1 and CNOT prepare |Ψ+⟩ = (|01⟩ + |10⟩)/√2.',
      steps: [g('H', 0), g('X', 1), CNOT01],
      actions: [{kind: 'shots', target: 'joint', shots: 1000}],
      explanation: 'Only 01 and 10 appear: the two qubits always disagree. Again each qubit alone is a fair coin, and again the pattern between them is perfect, just the opposite one.',
    },
    {
      id: 'partial-measurement', title: 'Partial measurement',
      setupText: 'Prepare |Φ+⟩, then measure only q0 on the live state.',
      steps: [g('H', 0), CNOT01],
      actions: [{kind: 'measure', target: 0}],
      explanation: 'Before the measurement, q1 alone is maximally mixed: ρ₁ = I/2, Bloch vector (0, 0, 0). Measuring q0 gives 0 or 1 at random, and the joint state collapses to |00⟩ or |11⟩ to match. q1 is now in a pure state, |0⟩ or |1⟩: its reduced Bloch vector jumps to a pole (length 1). Averaged over both possible outcomes, q1\'s own statistics are unchanged, so no message can be sent this way.',
    },
  ],
};
