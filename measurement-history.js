// Measurement-results history (no DOM). Separate from the circuit history: shot experiments never
// change the quantum state, so they are not circuit steps and are not part of Undo.
// Each record is compact — aggregate counts only, never the individual shot outcomes.
export const HISTORY_LIMIT = 50;

export const emptyHistory = () => ({nextId: 1, records: []});

// record: {mode, label, target, shots, seed, labels, counts, state}. `state` (the prepared amplitudes)
// is kept so the experiment can be rerun with the same settings.
export function addRecord(history, record, time = Date.now()) {
  const entry = {...record, id: history.nextId, time, counts: [...record.counts], labels: [...record.labels], state: record.state.map((a) => ({...a}))};
  return {nextId: history.nextId + 1, records: [entry, ...history.records].slice(0, HISTORY_LIMIT)};
}

export const clearHistory = (history) => ({nextId: history.nextId, records: []});

export const findRecord = (history, id) => history.records.find((r) => r.id === id) ?? null;

// The settings needed to run the same experiment again.
export const rerunSettings = (record) => ({mode: record.mode, label: record.label, target: record.target, shots: record.shots, seed: record.seed, state: record.state.map((a) => ({...a}))});

// A tiny observable store, so both modes' Measurement labs share one history list.
export function createHistoryStore() {
  let history = emptyHistory();
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn(history));
  return {
    get: () => history,
    add(record) { history = addRecord(history, record); notify(); return history.records[0]; },
    clear() { history = clearHistory(history); notify(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
