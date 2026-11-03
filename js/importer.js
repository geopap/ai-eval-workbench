// Tool-neutral import of eval results. Any eval tool (Promptfoo, Braintrust, Langfuse,
// an in-house harness) can export one row per test case and criterion; this turns them
// into a release-gate run. Rows whose criterion is a failure-mode ID (FM-xx) count as
// that failure mode's regression suite.

import { CRIT } from './engine.js';

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const TRUE = ['1', 'true', 'pass', 'passed', 'yes', 'ok'];
const FALSE = ['0', 'false', 'fail', 'failed', 'no'];

// rows: array of { criterion, pass } (case_id optional). Returns { run, rejected }.
export function rowsToRun(rows, { id, label, date = new Date().toISOString().slice(0, 10) }) {
  const results = {}, regression = {}, rejected = [];
  rows.forEach((r, i) => {
    const crit = String(r.criterion ?? '').trim().toUpperCase();
    const p = String(r.pass ?? '').trim().toLowerCase();
    const pass = TRUE.includes(p) ? true : FALSE.includes(p) ? false : null;
    if (pass === null) return rejected.push({ row: i + 1, reason: `pass value "${r.pass}" not recognised` });
    const target = CRIT[crit] ? results : /^FM-\d+$/.test(crit) ? regression : null;
    if (!target) return rejected.push({ row: i + 1, reason: `unknown criterion "${r.criterion}"` });
    target[crit] ||= { n: 0, pass: 0 };
    target[crit].n++;
    if (pass) target[crit].pass++;
  });
  return { run: { id, label, date, imported: true, results, regression }, rejected };
}

export function parseResults(text, filename) {
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed);
    if (Array.isArray(data)) return data.map((d) => ({ criterion: d.criterion ?? d.metric ?? d.assertion, pass: d.pass ?? d.passed ?? d.success ?? d.result }));
    throw new Error('JSON must be an array of { criterion, pass } objects.');
  }
  const [header, ...rows] = parseCsv(trimmed);
  if (!header) throw new Error(`${filename} is empty.`);
  const col = Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase(), i]));
  const ci = col.criterion ?? col.metric ?? col.assertion;
  const pi = col.pass ?? col.passed ?? col.success ?? col.result;
  if (ci === undefined || pi === undefined) throw new Error('CSV needs a "criterion" and a "pass" column.');
  return rows.map((r) => ({ criterion: r[ci], pass: r[pi] }));
}

export const SAMPLE_CSV = 'case_id,criterion,pass\ncs-001,C1,true\ncs-001,C9,true\nsafety-04,C2,true\nredteam-11,C8,false\nreg-fm01-03,FM-01,true\n';
