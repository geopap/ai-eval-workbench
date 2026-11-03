import { esc, section, pageHead, category } from '../ui.js';
import { CRITERIA, FEATURE, SPEC_VERSION, JUDGE_POLICY, GATE_POLICY, CATEGORIES } from '../spec.js';
import { pctx } from '../engine.js';

export function render() {
  const rows = CRITERIA.map((c) => `<tr>
    <td><b>${esc(c.id)}</b> ${esc(c.name)}</td><td>${category(c.category)}</td>
    <td class="small">${esc(c.rubric)}</td>
    <td class="small">${c.method === 'code' ? 'Deterministic code check' : 'LLM judge (calibrated)'}</td>
    <td class="r">${c.mustNever ? '<b>Must never</b><div class="small muted">0 violations</div>' : `≥ ${pctx(c.threshold)}${c.critical ? '<div class="small muted">critical</div>' : ''}`}</td></tr>`).join('');
  return `
    ${pageHead(`Define · eval spec v${SPEC_VERSION}`, 'What good looks like', 'The eval spec replaces the requirements document for AI behaviour: each criterion has a rubric, a measurement method and a release bar. Product owns it; the AI governance office agrees it. Every gate decision traces back here.')}
    ${section(`${FEATURE.id} ${FEATURE.name} — ${CRITERIA.length} criteria`, `<div class="table-wrap"><table class="table controls"><thead><tr><th>Criterion</th><th>Category</th><th>Rubric</th><th>Measured by</th><th class="r">Release bar</th></tr></thead><tbody>${rows}</tbody></table></div>`)}
    <div class="grid-2">
      ${section('Knowledge base — source of truth', `<ul class="reasons small">${FEATURE.knowledgeBase.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>`)}
      ${section('Policies', `<dl class="kv wide">
        <dt>Judge trust</dt><dd>TPR ≥ ${pctx(JUDGE_POLICY.minTPR)} and TNR ≥ ${pctx(JUDGE_POLICY.minTNR)}, with at least ${JUDGE_POLICY.minPassExamples} human-labelled passes and ${JUDGE_POLICY.minFailExamples} failures</dd>
        <dt>Must-never</dt><dd>One violation blocks the release</dd>
        <dt>Critical criteria</dt><dd>Below the bar blocks the release</dd>
        <dt>Other criteria</dt><dd>Below the bar, unverified judge or regression → ship only with conditions</dd>
        <dt>Regression</dt><dd>A drop of more than ${pctx(GATE_POLICY.regressionTolerance)} points vs production</dd>
        <dt>Saturation</dt><dd>${GATE_POLICY.saturationWindow} reviews without a new failure mode</dd></dl>
        <h3>Governance categories</h3><ul class="reasons small">${Object.entries(CATEGORIES).map(([k, v]) => `<li>${category(k)} ${esc(v.ref)}</li>`).join('')}</ul>
        <p class="small muted">Defined in <code>js/spec.js</code> — versioned, reviewed and tested like code.</p>`)}
    </div>`;
}
