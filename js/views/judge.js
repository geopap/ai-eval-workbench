import { esc, section, pageHead, trust, verdict, toast } from '../ui.js';
import { calibration, humanLabel, pctx, CRIT } from '../engine.js';
import { CRITERIA, JUDGE_POLICY } from '../spec.js';
import { SEED_LABELS } from '../data.js';
import { judgeMany, MODELS } from '../llm.js';
import { log, save, session } from '../store.js';

let selected = 'C1';
let progress = null;

export function render({ state }) {
  const cal = calibration(state.traces, state.fms, SEED_LABELS);
  const judges = CRITERIA.filter((c) => c.method === 'judge');
  const rows = judges.map((c) => {
    const k = cal[c.id];
    return `<tr class="${selected === c.id ? 'selected' : ''}" data-pick="${c.id}" tabindex="0">
      <td><b>${esc(c.id)}</b> ${esc(c.name)}${c.mustNever ? ' <span class="small muted">must never</span>' : ''}</td>
      <td>${trust(k.status)}</td><td class="r">${pctx(k.tpr)}</td><td class="r">${pctx(k.tnr)}</td>
      <td class="r">${k.nPass} / ${k.nFail}</td><td class="small">${esc(k.reasons.join('; ') || 'Meets policy')}</td></tr>`;
  }).join('');

  const k = cal[selected];
  const c = CRIT[selected];
  const live = state.liveJudge[selected];
  const labelled = state.traces.filter((t) => t.review);
  const key = session.get('aiew.key');

  let liveBlock = '';
  if (live) {
    const m = { tp: 0, fn: 0, fp: 0, tn: 0 };
    const lines = labelled.filter((t) => live.verdicts[t.id] && !live.verdicts[t.id].error).map((t) => {
      const h = humanLabel(t, selected, state.fms);
      const j = live.verdicts[t.id].verdict;
      h === 'pass' ? (j === 'pass' ? m.tp++ : m.fn++) : (j === 'pass' ? m.fp++ : m.tn++);
      return `<tr class="${h !== j ? 'disagree' : ''}"><td><a href="#/review?id=${esc(t.id)}">${esc(t.id)}</a></td><td>${verdict(h)}</td><td>${verdict(j)}</td><td class="small">${esc(live.verdicts[t.id].reason)}</td></tr>`;
    }).join('');
    const errors = Object.values(live.verdicts).filter((v) => v.error).length;
    liveBlock = `<h3>Live run — ${esc(live.model)} · ${esc(new Date(live.at).toLocaleString('en-GB'))}</h3>
      <p>On this round's ${m.tp + m.fn + m.fp + m.tn} labelled conversations: TPR <b>${pctx(m.tp / Math.max(1, m.tp + m.fn))}</b> · TNR <b>${m.tn + m.fp ? pctx(m.tn / (m.tn + m.fp)) : 'n/a (no human failures)'}</b> · ${m.fn + m.fp} disagreement(s)${errors ? ` · ${errors} call(s) failed` : ''}</p>
      <p class="small muted">One round is a small sample; the trust decision above uses all labelled rounds.</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>Trace</th><th>Human</th><th>Claude</th><th>Claude's reason</th></tr></thead><tbody>${lines}</tbody></table></div>`;
  }

  return `
    ${pageHead('Decide · can we trust the judge?', 'Judge calibration', 'An LLM judge is only useful if it agrees with people. Before its scores count in the release gate, each judge is checked against human labels — on passes <i>and</i> on failures.')}
    ${section('LLM judges', `<div class="table-wrap"><table class="table table-click"><thead><tr><th>Criterion</th><th>Status</th><th class="r">TPR</th><th class="r">TNR</th><th class="r">Labels pass / fail</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small muted">Policy: TPR and TNR at least ${pctx(JUDGE_POLICY.minTPR)}, with at least ${JUDGE_POLICY.minPassExamples} human-labelled passes and ${JUDGE_POLICY.minFailExamples} failures. Code-based checks (C3, C4, C7) need no calibration.</p>`)}
    <div class="grid-2">
      ${section(`${c.id} ${c.name}`, `
        <p class="small">${esc(c.rubric)}</p>
        <div class="confusion">
          <div></div><div class="ch">Judge: pass</div><div class="ch">Judge: fail</div>
          <div class="rh">Human: pass</div><div class="cell good">${k.tp}<span>agree</span></div><div class="cell bad">${k.fn}<span>false alarm</span></div>
          <div class="rh">Human: fail</div><div class="cell bad">${k.fp}<span>missed failure</span></div><div class="cell good">${k.tn}<span>agree</span></div>
        </div>
        <dl class="kv wide">
          <dt>TPR</dt><dd><b>${pctx(k.tpr)}</b> — of the answers people passed, the share the judge also passed</dd>
          <dt>TNR</dt><dd><b>${pctx(k.tnr)}</b> — of the answers people failed, the share the judge caught</dd>
          <dt>Status</dt><dd>${trust(k.status)} ${esc(k.reasons.join('; '))}</dd>
        </dl>
        <p class="small muted">Why TNR matters most: a judge that passes everything scores high on simple agreement but catches nothing. The release gate also corrects the judge's raw pass rate for its known error rates.</p>`)}
      ${section('Re-run this judge live with Claude', `
        <p class="small">Sends each labelled conversation from this round, with the rubric and knowledge base, to Claude and compares its verdicts with the human labels. About ${labelled.length} calls.</p>
        <div class="ai-form">
          <label>Anthropic API key<input type="password" id="ai-key" autocomplete="off" placeholder="sk-ant-…" value="${esc(key)}"></label>
          <label>Model<select id="ai-model">${MODELS.map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" id="ai-consent"> I understand these synthetic conversations are sent to the Anthropic API. The key stays in this browser tab only.</label>
          <div class="row"><button class="btn" id="run" ${progress ? 'disabled' : ''}>${progress ? `Judging… ${progress.done}/${progress.total}` : `Run ${esc(c.id)} judge`}</button>${key ? '<button class="btn ghost" id="forget">Forget key</button>' : ''}</div>
        </div>
        ${liveBlock}`)}
    </div>`;
}

export function bind({ root, state, refresh }) {
  root.querySelectorAll('[data-pick]').forEach((tr) => tr.addEventListener('click', () => { selected = tr.dataset.pick; refresh(); }));
  root.querySelector('#forget')?.addEventListener('click', () => { session.set('aiew.key', ''); refresh(); });
  root.querySelector('#run').addEventListener('click', async () => {
    const apiKey = root.querySelector('#ai-key').value.trim();
    if (!apiKey) return toast('Enter an Anthropic API key.');
    if (!root.querySelector('#ai-consent').checked) return toast('Please confirm the data-sharing notice first.');
    session.set('aiew.key', apiKey);
    const model = root.querySelector('#ai-model').value;
    const crit = CRIT[selected];
    const traces = state.traces.filter((t) => t.review);
    progress = { done: 0, total: traces.length };
    refresh();
    const verdicts = await judgeMany({ apiKey, model, criterion: crit, traces, onProgress: (done, total) => { progress = { done, total }; const b = document.getElementById('run'); if (b) b.textContent = `Judging… ${done}/${total}`; } });
    progress = null;
    state.liveJudge[crit.id] = { model, at: new Date().toISOString(), verdicts };
    const errors = Object.values(verdicts).filter((v) => v.error);
    await log(state, 'claude-judge', 'JUDGE_RUN', `${crit.id} with ${model} on ${traces.length} labelled traces${errors.length ? `, ${errors.length} failed: ${errors[0].error.slice(0, 80)}` : ''}`);
    if (errors.length === traces.length) toast('Claude request failed: ' + errors[0].error);
    save(state);
    refresh();
  });
}
