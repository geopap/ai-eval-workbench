import { esc, section, pageHead, tile, decision, lifecycle, severity } from '../ui.js';
import { gate, calibration, failureModeStats, saturation } from '../engine.js';
import { FEATURE, CRITERIA } from '../spec.js';
import { SEED_LABELS } from '../data.js';

export function render({ state }) {
  const baseline = state.runs.find((r) => r.baseline);
  const candidates = state.runs.filter((r) => !r.baseline);
  const latest = candidates[candidates.length - 1];
  const cal = calibration(state.traces, state.fms, SEED_LABELS);
  const g = gate(latest, baseline, cal);
  const fms = failureModeStats(state.traces, state.fms, [baseline, latest]);
  const sat = saturation(state.traces, state.fms);
  const open = fms.filter((f) => f.lifecycle !== 'Verified');
  const judges = Object.values(cal);
  const signed = state.gateDecisions[latest.id];

  const steps = [
    ['Define', '#/spec', `${CRITERIA.length} criteria · ${CRITERIA.filter((c) => c.mustNever).length} must-never`, 'What good looks like, agreed by product and governance'],
    ['Discover', '#/review', `${sat.reviewed}/${sat.total} reviewed · ${sat.saturated ? 'saturated' : `${sat.sinceNew} since last new mode`}`, 'People read real conversations and note what went wrong'],
    ['Act', '#/failures', `${open.length} open failure modes · ${fms.filter((f) => f.jira).length} in Jira`, 'Failure modes ranked by risk, ticketed, fixed, verified'],
    ['Decide', '#/gate', `${g.decision}${signed ? ' · signed off' : ''}`, 'Calibrated judges and a release gate; a person decides'],
    ['Prove', '#/evidence', 'Evidence pack ready', 'Art. 15 metrics, risk register and audit trail for governance'],
  ].map(([t, href, stat, txt], i) => `<a class="loop-step" href="${href}"><span class="step-n">${i + 1}</span><b>${esc(t)}</b><span class="small">${esc(txt)}</span><span class="loop-stat">${esc(stat)}</span></a>`).join('<span class="loop-arrow">→</span>');

  return `
    ${pageHead(`${FEATURE.company} · ${FEATURE.id}`, `${FEATURE.name} — eval overview`, 'From AI failures to fixes, release decisions and audit-ready evidence. Product teams use the loop to improve the assistant; the AI governance office gets its evidence from the same work.')}
    <div class="loop">${steps}</div>
    <div class="tiles">
      <div class="tile"><div class="tile-value small-value">${decision(g.decision)}</div><div class="tile-label">${esc(latest.label)}</div></div>
      ${tile('open failure modes', open.length, `${open.filter((f) => f.severity === 'Critical').length} critical`, open.some((f) => f.severity === 'Critical') ? 'bad' : 'warn')}
      ${tile('must-never violations', g.rows.filter((r) => r.c.mustNever).reduce((s, r) => s + (r.fails || 0), 0), 'in the latest candidate', g.blockers ? 'bad' : 'good')}
      ${tile('judges trusted', `${judges.filter((j) => j.status === 'trusted').length}/${judges.length}`, 'calibrated against human labels')}
      ${tile('reviewed this round', `${sat.reviewed}/${sat.total}`, sat.saturated ? 'discovery saturated' : 'discovery ongoing')}
      ${tile('regression evals', Object.keys(latest.regression || {}).length, 'built from failure modes')}
    </div>
    <div class="grid-2">
      ${section('Top risks', `<ul class="flags">${fms.slice(0, 5).map((f) => `<li class="flag"><div class="flag-head">${severity(f.severity)} <a href="#/failures?fm=${esc(f.id)}"><b>${esc(f.id)}</b> ${esc(f.name)}</a> ${lifecycle(f.lifecycle)}</div>
        <div class="flag-body">${f.count} of ${sat.reviewed} reviewed (${Math.round(f.rate * 100)}%) · ${esc(f.category)}${f.jira ? ` · ${esc(f.jira)}` : ' · not ticketed'}</div></li>`).join('')}</ul>`, '<a class="small" href="#/failures">All failure modes →</a>')}
      ${section('Release gate', `<p>${decision(g.decision)} <span class="muted">${esc(latest.label)} vs ${esc(baseline.label)}</span></p>
        <ul class="reasons">${g.reasons.map((r) => `<li>${esc(r)}</li>`).join('') || '<li>All criteria pass with trusted measurements.</li>'}</ul>
        <h3>Part of a connected lifecycle</h3>
        <ol class="reasoning small">
          <li><a href="${esc(FEATURE.intakeUrl)}" target="_blank" rel="noopener">AI Use-Case Intake ↗</a> approved ${esc(FEATURE.id)} with conditions: “${esc(FEATURE.intakeConditions)}”</li>
          <li><b>This workbench</b> produces the evidence that closes those conditions.</li>
          <li><a href="https://geopap.github.io/ai-portfolio-office/" target="_blank" rel="noopener">AI Portfolio Office ↗</a> tracks the assistant's value as an initiative.</li>
        </ol>`, '<a class="small" href="#/gate">Open gate →</a>')}
    </div>`;
}
