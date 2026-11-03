import { esc, section, pageHead, verdict, toast, meter } from '../ui.js';
import { codeChecks, saturation, CRIT } from '../engine.js';
import { CRITERIA, SEVERITY, FEATURE } from '../spec.js';
import { log, save, nextFmId } from '../store.js';

let filter = 'todo';
let blind = true;
let showNew = false;
const drafts = {}; // half-written notes, kept across re-renders but never saved

export function render({ state, params }) {
  const traces = state.traces;
  const list = traces.filter((t) => filter === 'all' || (filter === 'todo' ? !t.review : t.review?.verdict === filter));
  const current = traces.find((t) => t.id === params.id) || list[0] || traces[0];
  const sat = saturation(traces, state.fms);
  const fmCounts = Object.fromEntries(state.fms.map((f) => [f.id, traces.filter((t) => t.review?.fm === f.id).length]));
  const unassigned = traces.filter((t) => t.review?.verdict === 'fail' && !t.review.fm).length;

  const queue = list.map((t) => `<li><a href="#/review?id=${esc(t.id)}" class="q-item ${t.id === current.id ? 'on' : ''}">
      <span class="q-dot ${t.review ? (t.review.verdict === 'pass' ? 'ok' : 'bad') : 'todo'}"></span>
      <span><b>${esc(t.id)}</b> <span class="muted small">${esc(t.topic)} · ${esc(t.lang.toUpperCase())}</span><br><span class="small">${esc(t.user.slice(0, 60))}${t.user.length > 60 ? '…' : ''}</span></span></a></li>`).join('');

  const tabs = [['todo', `To review (${traces.filter((t) => !t.review).length})`], ['fail', 'Failed'], ['pass', 'Passed'], ['all', 'All']]
    .map(([k, l]) => `<button class="tab ${filter === k ? 'on' : ''}" data-tab="${k}">${esc(l)}</button>`).join('');

  return `
    ${pageHead('Discover · error analysis', 'Review queue', `Read real conversations from <b>${esc(FEATURE.name)}</b> ${esc('v2.3-rc1')}, judge them, and write down what went wrong in your own words. Notes become failure modes; failure modes become tickets and regression evals.`)}
    <div class="review-layout">
      <aside class="card queue">
        <div class="tabs">${tabs}</div>
        <ul class="q-list">${queue || '<li class="muted small pad">Nothing here.</li>'}</ul>
      </aside>
      <div>${current ? traceCard(current, state) : ''}</div>
      <aside>
        ${section('Progress', `
          <div class="live-row"><span>Reviewed</span>${meter((sat.reviewed / sat.total) * 100)} <b>${sat.reviewed}/${sat.total}</b></div>
          <div class="live-row"><span>Failure modes</span><b>${state.fms.length}</b></div>
          <div class="live-row"><span>Since last new mode</span><b>${sat.sinceNew} reviews</b></div>
          <p class="small ${sat.saturated ? 'pos' : 'muted'}">${sat.saturated ? `Saturation reached: ${sat.window} reviews without a new failure mode. Discovery for this round can stop.` : `Keep reviewing: discovery is saturated after ${sat.window} reviews without a new failure mode.`}</p>`)}
        ${section('This round', `<ul class="fm-tally">${state.fms.map((f) => `<li><span>${esc(f.id)} ${esc(f.name)}</span><b>${fmCounts[f.id]}</b></li>`).join('')}
          ${unassigned ? `<li class="warn-text"><span>Failures without a mode</span><b>${unassigned}</b></li>` : ''}</ul>
          <a class="small" href="#/failures">Failure modes →</a>`)}
      </aside>
    </div>`;
}

function traceCard(t, state) {
  const checks = codeChecks(t);
  const reviewed = !!t.review;
  const judgeCrit = CRITERIA.filter((c) => c.method === 'judge');
  const judgeFlags = judgeCrit.filter((c) => (t.judge?.[c.id] || 'pass') === 'fail');
  const fmOptions = state.fms.map((f) => `<option value="${esc(f.id)}" ${t.review?.fm === f.id ? 'selected' : ''}>${esc(f.id)} · ${esc(f.name)}</option>`).join('');
  const r = t.review || {};
  return `
    <section class="card trace">
      <header class="card-head"><h2>${esc(t.id)} · ${esc(t.topic)}</h2><span class="small muted">${esc(t.release)} · ${esc(t.lang.toUpperCase())}${reviewed ? ` · reviewed by ${esc(r.by)}` : ''}</span></header>
      <div class="chat">
        <div class="bubble user"><span class="who">Customer</span>${esc(t.user)}</div>
        <div class="bubble ai"><span class="who">AI assistant</span>${esc(t.ai)}</div>
      </div>
      <h3>Automated checks <span class="muted small">(code-based, always on)</span></h3>
      <div class="chips">${['C3', 'C4', 'C7'].map((k) => `<span class="chip">${esc(k)} ${esc(CRIT[k].name)} ${verdict(checks[k])}</span>`).join('')}</div>
      <h3>LLM judge <span class="muted small">(pre-computed)</span></h3>
      ${blind && !reviewed
        ? '<p class="small muted">Hidden until you record your verdict, so the judge does not anchor your judgement. <button class="link" id="unblind">Show anyway</button></p>'
        : `<div class="chips">${judgeFlags.length ? judgeFlags.map((c) => `<span class="chip">${esc(c.id)} ${esc(c.name)} ${verdict('fail')}</span>`).join('') : '<span class="chip">No criterion flagged ' + verdict('pass') + '</span>'}</div>`}
      <details class="kb"><summary>Knowledge base (source of truth)</summary><ul class="reasons small">${FEATURE.knowledgeBase.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></details>

      <form id="review" class="review-form">
        <div class="verdict-buttons">
          <label class="vbtn pass ${r.verdict === 'pass' ? 'on' : ''}"><input type="radio" name="verdict" value="pass" ${r.verdict === 'pass' ? 'checked' : ''}> ✓ Pass <kbd>P</kbd></label>
          <label class="vbtn fail ${r.verdict === 'fail' ? 'on' : ''}"><input type="radio" name="verdict" value="fail" ${r.verdict === 'fail' ? 'checked' : ''}> ✕ Fail <kbd>F</kbd></label>
        </div>
        <label class="field">What went wrong — in your own words <span class="muted small">(open coding)</span>
          <textarea name="note" rows="2" placeholder="e.g. Promised a refund the policy does not allow">${esc(r.note || '')}</textarea></label>
        <label class="field">Failure mode <span class="muted small">(axial coding — optional now, can be assigned later)</span>
          <select name="fm"><option value="">— not assigned yet —</option>${fmOptions}<option value="__new" ${showNew ? 'selected' : ''}>+ New failure mode…</option></select></label>
        ${showNew ? `<div class="new-fm">
          <label class="field">Name<input name="newName" placeholder="Short, specific: what the assistant does wrong"></label>
          <label class="field">Eval criterion<select name="newCrit">${CRITERIA.map((c) => `<option value="${c.id}">${esc(c.id)} ${esc(c.name)} (${esc(c.category)})</option>`).join('')}</select></label>
          <label class="field">Severity<select name="newSev">${Object.keys(SEVERITY).map((s) => `<option ${s === 'High' ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        </div>` : ''}
        <div class="row"><button class="btn primary">Save &amp; next <kbd>↵</kbd></button>
          <label class="check small"><input type="checkbox" id="blind" ${blind ? 'checked' : ''}> Blind review (hide judge until I decide)</label></div>
      </form>
    </section>`;
}

export function bind({ root, state, params, refresh, go }) {
  const form = root.querySelector('#review');
  if (!form) return;
  const current = state.traces.find((t) => t.id === params.id) || state.traces.find((t) => (filter === 'todo' ? !t.review : true));

  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.tab; go('#/review'); refresh(); }));
  root.querySelector('#unblind')?.addEventListener('click', () => { blind = false; refresh(); });
  root.querySelector('#blind').addEventListener('change', (e) => { blind = e.target.checked; refresh(); });
  form.fm.addEventListener('change', () => { showNew = form.fm.value === '__new'; keepDraft(); refresh(); });
  form.querySelectorAll('input[name="verdict"]').forEach((r) => r.addEventListener('change', () => {
    form.querySelectorAll('.vbtn').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
    if (r.value === 'fail') form.note.focus();
  }));

  // Keep the half-written note when the form re-renders.
  function keepDraft() {
    drafts[current.id] = { verdict: form.verdict.value, note: form.note.value };
  }
  const d = drafts[current.id];
  if (d) {
    if (d.verdict) form.querySelector(`input[value="${d.verdict}"]`).checked = true;
    form.note.value = d.note;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = form.verdict.value;
    if (!v) return toast('Choose Pass or Fail.');
    const note = form.note.value.trim();
    if (v === 'fail' && note.length < 5) return toast('Describe what went wrong — notes are the raw material for failure modes.');
    let fm = form.fm.value === '__new' ? '' : form.fm.value;
    if (form.fm.value === '__new') {
      const name = form.newName.value.trim();
      if (name.length < 5) return toast('Give the new failure mode a short, specific name.');
      const crit = CRIT[form.newCrit.value];
      fm = nextFmId(state.fms);
      state.fms.push({ id: fm, name: name.slice(0, 80), criterion: crit.id, category: crit.category, severity: form.newSev.value, status: 'New', jira: '' });
      await log(state, 'You', 'FAILURE_MODE_CREATED', `${fm} ${name} (${crit.id}, ${form.newSev.value})`);
      showNew = false;
    }
    if (v === 'pass') fm = null;
    delete drafts[current.id];
    current.review = { verdict: v, fm: fm || null, note: note.slice(0, 500), by: 'You', at: new Date().toISOString().slice(0, 10), seq: state.seq++ };
    await log(state, 'You', 'REVIEW_RECORDED', `${current.id}: ${v}${fm ? ' → ' + fm : ''}${note ? ' — ' + note.slice(0, 120) : ''}`);
    save(state);
    const next = state.traces.find((t) => !t.review && t.id > current.id) || state.traces.find((t) => !t.review);
    if (next) go(`#/review?id=${next.id}`); else { toast('All conversations reviewed.'); refresh(); }
  });

  form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); form.requestSubmit(); } });
  document.onkeydown = (e) => {
    if (!location.hash.startsWith('#/review') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'p' || e.key === 'P') { form.querySelector('input[value="pass"]').click(); }
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); form.querySelector('input[value="fail"]').click(); }
  };
}

