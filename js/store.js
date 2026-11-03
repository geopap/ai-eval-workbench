// App state, persisted per browser; every storage access is guarded.

import { TRACES, FAILURE_MODES, RUNS } from './data.js';
import { appendEntry } from './audit.js';

const KEY = 'aiew.state.v1';

export function freshState() {
  return {
    traces: structuredClone(TRACES).map((t, i) => (t.review ? { ...t, review: { ...t.review, seq: i } } : t)),
    fms: structuredClone(FAILURE_MODES),
    runs: structuredClone(RUNS),
    jira: { site: '', projectId: '', issueTypeId: '', proxyUrl: '' },
    liveJudge: {},
    gateDecisions: {},
    audit: [],
    seq: 100,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...freshState(), ...JSON.parse(raw) };
  } catch { /* storage unavailable or corrupt */ }
  return freshState();
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export async function log(state, actor, action, detail) {
  state.audit = await appendEntry(state.audit, { actor, action, detail });
  save(state);
}

export function nextFmId(fms) {
  const n = Math.max(0, ...fms.map((f) => Number(f.id.replace(/\D/g, '')) || 0)) + 1;
  return `FM-${String(n).padStart(2, '0')}`;
}

export const session = {
  get(k) { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch { /* ignore */ } },
};
