import { esc, section, pageHead, decision, trust, toast } from '../ui.js';
import { gate, calibration, failureModeStats, pctx } from '../engine.js';
import { GATE_POLICY } from '../spec.js';
import { SEED_LABELS } from '../data.js';
import { log } from '../store.js';

export function render({ state, params }) {
  const baseline = state.runs.find((r) => r.baseline);
  const candidates = state.runs.filter((r) => !r.baseline);
  const run = candidates.find((r) => r.id === params.run) || candidates[candidates.length - 1];
  const cal = calibration(state.traces, state.fms, SEED_LABELS);
  const g = gate(run, baseline, cal);
  const fms = failureModeStats(state.traces, state.fms, [baseline, run]);
  const signed = state.gateDecisions[run.id];

  const rows = g.rows.map((r) => {
    const b = baseline.results[r.c.id];
    const st = { pass: '✓ pass', fail: '✕ below threshold', violation: '✕ violation', unverified: '? unverified', missing: '– no data' }[r.status];
    return `<tr class="gate-${r.status}">
      <td><b>${esc(r.c.id)}</b> ${esc(r.c.name)}<div class="small muted">${esc(r.c.category)}</div></td>
      <td class="small">${r.c.method === 'code' ? 'Code check' : `LLM judge ${trust(r.judge.status)}`}</td>
      <td class="r small">${r.c.mustNever ? '<b>0 violations</b>' : `≥ ${pctx(r.c.threshold)}${r.c.critical ? ' · critical' : ''}`}</td>
      <td class="r">${b ? pctx(b.pass / b.n, 1) : '–'}</td>
      <td class="r"><b>${r.rate === null ? '–' : pctx(r.rate, 1)}</b>${r.c.mustNever && r.fails ? `<div class="small neg">${r.fails} of ${r.n}</div>` : `<div class="small muted">n=${r.n ?? '–'}</div>`}</td>
      <td class="r ${r.regression ? 'neg' : ''}">${r.delta === null ? '–' : (r.delta >= 0 ? '+' : '') + (r.delta * 100).toFixed(1)}${r.regression ? ' ▼' : ''}</td>
      <td class="r small">${r.corrected !== null ? pctx(r.corrected, 1) : '–'}</td>
      <td class="status-cell">${st}</td></tr>`;
  }).join('');

  const reg = Object.entries(run.regression || {});
  const allowed = g.decision === 'NO-SHIP' ? ['Block release', 'Risk-accepted exception'] : g.decision === 'SHIP' ? ['Approve release', 'Block release'] : ['Approve with conditions', 'Block release'];

  return `
    ${pageHead('Decide · release gate', 'Release gate', `Every criterion from the eval spec, measured on the regression test set and compared with production (${esc(baseline.id)}). Must-never criteria block on a single violation; untrusted judges cannot pass a criterion on their own.`)}
    <div class="row">${candidates.map((r) => `<a class="btn ${r.id === run.id ? 'primary' : 'ghost'}" href="#/gate?run=${esc(r.id)}">${esc(r.label)}${r.imported ? ' (imported)' : ''}</a>`).join('')}<a class="small" href="#/integrations">Import results →</a></div>
    <div class="gate-head card">
      <div><div class="kicker">${esc(run.label)} · ${esc(run.date)}</div>${decision(g.decision)}</div>
      <ul class="reasons">${g.reasons.map((x) => `<li>${esc(x)}</li>`).join('') || '<li>All criteria pass with trusted measurements.</li>'}</ul>
    </div>
    ${section('Criteria', `<div class="table-wrap"><table class="table gate-table"><thead><tr><th>Criterion</th><th>Measured by</th><th class="r">Bar</th><th class="r">${esc(baseline.id)}</th><th class="r">${esc(run.id)}</th><th class="r">Δ pts</th><th class="r">Corrected*</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small muted">* Judge pass rate corrected for the judge's measured error rates (Rogan–Gladen). Regression = drop of more than ${pctx(GATE_POLICY.regressionTolerance)} points vs production.</p>`)}
    <div class="grid-2">
      ${section('Regression evals from failure modes', reg.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Failure mode</th><th class="r">Pass</th><th>Lifecycle</th></tr></thead><tbody>
        ${reg.map(([id, v]) => { const f = fms.find((x) => x.id === id); return `<tr><td><a href="#/failures?fm=${esc(id)}">${esc(id)}</a> ${esc(f?.name || '')}</td><td class="r ${v.pass < v.n ? 'neg' : 'pos'}">${v.pass}/${v.n}</td><td>${esc(f?.lifecycle || '—')}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="small muted">A failure mode is <b>Verified</b> once its ticket is fixed and its regression eval passes in full.</p>` : '<p class="muted small">No regression suites in this run yet — they are built from failure-mode examples after the first review round.</p>')}
      ${section('Sign-off', signed ? `<div class="banner ${signed.choice.startsWith('Block') ? 'bad' : 'ok'}"><b>${esc(signed.choice)}</b> by ${esc(signed.by)} on ${esc(signed.at)}<br>${esc(signed.rationale)}${signed.conditions ? `<br><b>Conditions:</b> ${esc(signed.conditions)}` : ''}</div><p class="small muted">Recorded in the audit trail and the evidence pack.</p>` : `
        <form id="signoff" class="signoff">
          <label>Decision<select name="choice">${allowed.map((a) => `<option>${a}</option>`).join('')}</select></label>
          <label>Decided by<input name="by" required placeholder="Product owner and AI governance lead"></label>
          <label>Rationale<textarea name="rationale" required rows="2" placeholder="Why — logged and included in the evidence pack"></textarea></label>
          <label>Conditions<textarea name="conditions" rows="2" placeholder="Required for conditional approval, e.g. human review of 50 sampled answers for tone within 2 weeks"></textarea></label>
          <label class="check"><input type="checkbox" name="ack" required> I have read the failing and unverified criteria above.</label>
          <button class="btn primary">Record decision</button>
          <p class="small muted">The gate recommends; a person decides. Overriding a NO-SHIP needs a risk-accepted exception with a written rationale.</p>
        </form>`)}
    </div>`;
}

export function bind({ root, state, params, refresh }) {
  const form = root.querySelector('#signoff');
  if (!form) return;
  const candidates = state.runs.filter((r) => !r.baseline);
  const run = candidates.find((r) => r.id === params.run) || candidates[candidates.length - 1];
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const choice = String(f.get('choice'));
    const rationale = String(f.get('rationale')).trim();
    const conditions = String(f.get('conditions') || '').trim();
    if (choice === 'Approve with conditions' && conditions.length < 10) return toast('State the conditions.');
    if (choice === 'Risk-accepted exception' && rationale.length < 40) return toast('A risk-accepted exception needs a full rationale (40+ characters).');
    state.gateDecisions[run.id] = { choice, by: String(f.get('by')).trim().slice(0, 80), rationale: rationale.slice(0, 600), conditions: conditions.slice(0, 600), at: new Date().toISOString().slice(0, 10) };
    await log(state, state.gateDecisions[run.id].by, 'RELEASE_DECISION', `${run.id}: ${choice} — ${rationale.slice(0, 160)}${conditions ? ' | Conditions: ' + conditions.slice(0, 120) : ''}`);
    refresh();
  });
}
