import { esc, pageHead, decision, trust, verdict, download } from '../ui.js';
import { gate, calibration, failureModeStats, saturation, codeChecks, pctx } from '../engine.js';
import { CRITERIA, FEATURE, SPEC_VERSION, CATEGORIES } from '../spec.js';
import { SEED_LABELS } from '../data.js';
import { verifyChain } from '../audit.js';

let chain = null;

export function build(state) {
  const baseline = state.runs.find((r) => r.baseline);
  const candidates = state.runs.filter((r) => !r.baseline);
  const signedId = [...candidates].reverse().find((r) => state.gateDecisions[r.id])?.id;
  const run = candidates.find((r) => r.id === signedId) || candidates[candidates.length - 1];
  const cal = calibration(state.traces, state.fms, SEED_LABELS);
  const g = gate(run, baseline, cal);
  const history = candidates.map((r) => ({ run: r, g: gate(r, baseline, cal), signed: state.gateDecisions[r.id] }));
  const fms = failureModeStats(state.traces, state.fms, [baseline, run]);
  const sat = saturation(state.traces, state.fms);
  const row = (id) => g.rows.find((r) => r.c.id === id);
  const critical = fms.filter((f) => ['Critical', 'High'].includes(f.severity));
  return { baseline, run, cal, g, history, fms, sat, row, critical, signed: state.gateDecisions[run.id] };
}

export function render({ state }) {
  const e = build(state);
  const { run, g, row, fms, sat, cal, critical, signed } = e;
  const redTeamClosed = critical.every((f) => f.lifecycle === 'Verified');
  const reviewed = state.traces.filter((t) => t.review);
  const disclosure = state.traces.filter((t) => codeChecks(t).C3 !== 'n/a');

  return `
    <div class="report-actions no-print">
      <button class="btn primary" id="print">Print / save as PDF</button>
      <button class="btn ghost" id="json">Export evidence (JSON)</button>
      <button class="btn ghost" id="verify">Verify audit trail</button>
      ${chain ? `<span class="pill ${chain.ok ? 'ok' : 'bad'}">${chain.ok ? `✓ Audit chain intact — ${chain.entries} entries` : `✕ Audit chain broken at ${chain.brokenAt}`}</span>` : ''}
    </div>
    <article class="report evidence ${signed ? '' : 'is-draft'}">
      <header class="report-head">
        <div><div class="kicker">${esc(FEATURE.company)} · AI assurance evidence</div>
          <h1>${esc(FEATURE.id)} ${esc(FEATURE.name)}</h1>
          <p class="muted">Release ${esc(run.label)} · eval spec v${esc(SPEC_VERSION)} · generated ${esc(new Date().toISOString().slice(0, 10))}</p></div>
        <div>${decision(g.decision)}${signed ? `<div class="small">${esc(signed.choice)} · ${esc(signed.by)}</div>` : '<div class="small neg">Not yet signed off</div>'}</div>
      </header>

      <section><h2>1 · Scope and intake conditions</h2>
        <p>Approved at AI intake <i>with conditions</i>: “${esc(FEATURE.intakeConditions)}”</p>
        <table class="table compact"><tbody>
          <tr><td>Red-team and quality findings (Critical and High) closed and verified</td><td>${redTeamClosed ? verdict('pass') : verdict('fail')}</td><td class="small">${critical.filter((f) => f.lifecycle === 'Verified').length} of ${critical.length} verified${redTeamClosed ? '' : ` — open: ${esc(critical.filter((f) => f.lifecycle !== 'Verified').map((f) => f.id).join(', '))}`}</td></tr>
          <tr><td>DPIA signed off</td><td><span class="vd vd-na">outside this tool</span></td><td class="small">Tracked as control C-DPIA in AI Use-Case Intake</td></tr>
          <tr><td>Intake controls this pack evidences</td><td colspan="2" class="small">C-EVAL pre-launch evaluation and red-teaming · C-ACC accuracy, robustness and cybersecurity testing · C-MON production monitoring (review rounds)</td></tr>
        </tbody></table></section>

      <section><h2>2 · Declared accuracy metrics — EU AI Act Art. 15(3)</h2>
        <table class="table compact"><thead><tr><th>Metric</th><th>Definition</th><th>Measured by</th><th class="r">Bar</th><th class="r">Result</th></tr></thead><tbody>
        ${CRITERIA.map((c) => { const r = row(c.id); return `<tr><td><b>${esc(c.id)}</b> ${esc(c.name)}</td><td class="small">${esc(c.rubric)}</td><td class="small">${c.method === 'code' ? 'Deterministic check' : `LLM judge — ${trust(cal[c.id].status)}`}</td><td class="r small">${c.mustNever ? '0 violations' : pctx(c.threshold)}</td><td class="r">${r.rate === null ? '–' : pctx(r.rate, 1)}${c.mustNever ? ` <span class="small">(${r.fails})</span>` : ''}</td></tr>`; }).join('')}
        </tbody></table></section>

      <section><h2>3 · Testing across the life cycle — Art. 15(1), 9</h2>
        <table class="table compact"><thead><tr><th>Run</th><th>Date</th><th>Gate recommendation</th><th>Human decision</th></tr></thead><tbody>
        <tr><td>${esc(e.baseline.label)}</td><td>${esc(e.baseline.date)}</td><td colspan="2" class="small">Baseline in production</td></tr>
        ${e.history.map((h) => `<tr><td>${esc(h.run.label)}${h.run.imported ? ' (imported)' : ''}</td><td>${esc(h.run.date)}</td><td>${decision(h.g.decision)}</td><td class="small">${h.signed ? `${esc(h.signed.choice)} — ${esc(h.signed.by)}` : '—'}</td></tr>`).join('')}
        </tbody></table>
        <p class="small">Error analysis on real traffic: ${sat.reviewed} conversations reviewed by people this round, ${sat.modes} failure modes identified; ${sat.saturated ? 'discovery saturated' : `${sat.sinceNew} reviews since the last new failure mode (saturation at ${sat.window})`}.</p></section>

      <div class="report-cols">
        <section><h2>4 · Robustness & cybersecurity — Art. 15(4)–(5)</h2>
          <p>Prompt-injection red-team set (C8): <b>${row('C8').fails}</b> violation(s) in ${row('C8').n} attacks. ${row('C8').fails ? 'Release blocked until resolved.' : 'No injection succeeded.'}</p></section>
        <section><h2>5 · Transparency — Art. 50(1)</h2>
          <p>AI disclosure (C3): <b>${row('C3').fails}</b> violation(s) in ${row('C3').n} test cases; ${disclosure.filter((t) => codeChecks(t).C3 === 'fail').length} of ${disclosure.length} live conversations asking “am I talking to a person?” failed the automated check.</p></section>
        <section><h2>6 · Privacy — GDPR Art. 5(1)(f), 32</h2>
          <p>Payment data in chat (C4): <b>${row('C4').fails}</b> violation(s) in ${row('C4').n} test cases. Conversations sent to an external judge model are synthetic or pseudonymised; personal data is not used for calibration.</p></section>
        <section><h2>7 · Human oversight — Art. 14 (voluntary)</h2>
          <p>${reviewed.length} human labels this round; judges trusted only after calibration (TPR and TNR ≥ 80%). Release decisions recorded by a named person: ${signed ? `${esc(signed.choice)} by ${esc(signed.by)} — “${esc(signed.rationale)}”` : 'pending'}.</p></section>
      </div>

      <section><h2>8 · Risk register — failure modes (Art. 9)</h2>
        <table class="table compact"><thead><tr><th>Failure mode</th><th>Category</th><th>Severity</th><th class="r">Freq.</th><th>Treatment</th><th>Status</th></tr></thead><tbody>
        ${fms.map((f) => `<tr><td><b>${esc(f.id)}</b> ${esc(f.name)}</td><td class="small">${esc(f.category)} · ${esc(CATEGORIES[f.category]?.ref || '')}</td><td>${esc(f.severity)}</td><td class="r">${f.count}</td><td class="small">${f.jira ? `Jira ${esc(f.jira)}` : 'Not ticketed'}${f.regression ? ` · regression ${f.regression.pass}/${f.regression.n}` : ''}</td><td>${esc(f.lifecycle)}</td></tr>`).join('')}
        </tbody></table></section>

      <footer class="report-foot">
        <p><b>How this evidence was produced.</b> Code checks run on every conversation; LLM judges are calibrated against human labels before their results count; release decisions are recommended by a versioned gate policy and taken by a named person. Every step is recorded in a SHA-256 hash-chained audit trail (${state.audit.length} entries).</p>
        <p class="muted">Indicative mapping for illustration, not legal advice. Synthetic data · ${esc(FEATURE.company)} is a fictional company.</p>
      </footer>
    </article>`;
}

export function bind({ root, state, refresh }) {
  root.querySelector('#print').addEventListener('click', () => window.print());
  root.querySelector('#verify').addEventListener('click', async () => { chain = await verifyChain(state.audit); refresh(); });
  root.querySelector('#json').addEventListener('click', () => {
    const e = build(state);
    const out = {
      feature: FEATURE, specVersion: SPEC_VERSION, generated: new Date().toISOString(),
      release: e.run.id, recommendation: e.g.decision, reasons: e.g.reasons, signOff: e.signed || null,
      metrics: e.g.rows.map((r) => ({ id: r.c.id, name: r.c.name, method: r.c.method, bar: r.c.mustNever ? '0 violations' : r.c.threshold, rate: r.rate, fails: r.fails, n: r.n, judgeStatus: r.judge?.status || null, corrected: r.corrected })),
      failureModes: e.fms.map(({ examples, ...f }) => ({ ...f, examples: examples.map((t) => t.id) })),
      review: e.sat,
      auditEntries: state.audit.length,
    };
    download(`evidence-${FEATURE.id}-${e.run.id}.json`, JSON.stringify(out, null, 2), 'application/json');
  });
}
