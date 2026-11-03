import { esc, section, pageHead, category, severity, lifecycle, toast, download, meter } from '../ui.js';
import { failureModeStats, CRIT } from '../engine.js';
import { CATEGORIES } from '../spec.js';
import { buildTicket, createLink, toJiraCsv, createIssueViaProxy, issueStatusViaProxy, lifecycleFromJira, normaliseSite } from '../jira.js';
import { log, save, session } from '../store.js';

const STATUSES = ['New', 'Ticketed', 'In fix', 'Fixed'];

export function render({ state, params }) {
  const stats = failureModeStats(state.traces, state.fms, state.runs);
  const reviewed = state.traces.filter((t) => t.review).length;
  const maxCount = Math.max(1, ...stats.map((f) => f.count));
  const site = normaliseSite(state.jira.site);
  const unassigned = state.traces.filter((t) => t.review?.verdict === 'fail' && !t.review.fm);

  const rows = stats.map((f) => `<tr class="${params.fm === f.id ? 'selected' : ''}">
    <td><a href="#/failures?fm=${esc(f.id)}"><b>${esc(f.id)}</b> ${esc(f.name)}</a><div class="small muted">${esc(f.criterion)} ${esc(CRIT[f.criterion].name)}${CRIT[f.criterion].mustNever ? ' · <b>must never</b>' : ''}</div></td>
    <td>${category(f.category)}</td>
    <td>${severity(f.severity)}</td>
    <td>${meter((f.count / maxCount) * 100)} <b>${f.count}</b> <span class="small muted">${Math.round(f.rate * 100)}%</span>${f.suspected ? `<div class="small warn-text">+${f.suspected} suspected</div>` : ''}</td>
    <td class="r"><b>${f.risk}</b></td>
    <td>${f.lifecycle === 'Verified' ? lifecycle('Verified') : `<select data-status="${esc(f.id)}">${STATUSES.map((s) => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`}</td>
    <td>${f.jira ? (site ? `<a href="${esc(site)}/browse/${esc(f.jira)}" target="_blank" rel="noopener">${esc(f.jira)}</a>` : esc(f.jira)) : '<span class="muted">—</span>'}</td>
    <td class="small">${f.regression ? `${f.regression.pass}/${f.regression.n} ${f.regression.pass === f.regression.n ? '✓' : '✕'}` : '<span class="muted">none yet</span>'}</td>
    <td><a class="btn small ${f.jira ? 'ghost' : ''}" href="#/failures?fm=${esc(f.id)}">${f.jira ? 'Details' : 'Ticket'}</a></td></tr>`).join('');

  const detail = params.fm ? ticketPanel(stats.find((f) => f.id === params.fm), reviewed, state) : '';

  return `
    ${pageHead('Act · failure modes', 'Failure modes', 'Notes from the review queue, grouped into named failure modes and ranked by risk (severity × frequency, plus a weight for must-never criteria). Each one runs through the same lifecycle: ticketed in Jira, fixed, then verified by a regression eval in the release gate.')}
    <div class="lifecycle-strip">${['New', 'Ticketed', 'In fix', 'Fixed', 'Verified'].map((s) => `<div>${lifecycle(s)}<b>${stats.filter((f) => f.lifecycle === s).length}</b></div>`).join('<span>→</span>')}</div>
    ${section(`Ranked by risk — ${stats.length} failure modes from ${reviewed} reviewed conversations`, `<div class="table-wrap"><table class="table fm-table">
      <thead><tr><th>Failure mode</th><th>Category</th><th>Severity</th><th>Frequency</th><th class="r">Risk</th><th>Lifecycle</th><th>Jira</th><th>Regression</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="row"><button class="btn ghost" id="csv">Export open failure modes as Jira CSV</button><span class="small muted">Import in Jira: Settings → System → External system import → CSV.</span></div>`)}
    ${detail}
    ${unassigned.length ? section(`Failures without a failure mode — ${unassigned.length}`, `<p class="small muted">Axial coding: group each note under an existing failure mode, or create a new one from the review queue.</p>
      <ul class="flags">${unassigned.map((t) => `<li class="flag"><div class="flag-head"><a href="#/review?id=${esc(t.id)}"><b>${esc(t.id)}</b></a> <span class="small">${esc(t.review.note)}</span></div>
        <div class="row"><select data-assign="${esc(t.id)}"><option value="">Assign to…</option>${state.fms.map((f) => `<option value="${esc(f.id)}">${esc(f.id)} ${esc(f.name)}</option>`).join('')}</select></div></li>`).join('')}</ul>`) : ''}
    ${section('Governance mapping', `<div class="table-wrap"><table class="table"><thead><tr><th>Category</th><th>Points to</th><th class="r">Failure modes</th></tr></thead><tbody>
      ${Object.entries(CATEGORIES).map(([k, v]) => `<tr><td>${category(k)}</td><td class="small">${esc(v.ref)}</td><td class="r">${stats.filter((f) => f.category === k).length}</td></tr>`).join('')}</tbody></table></div>`)}`;
}

function ticketPanel(f, reviewed, state) {
  if (!f) return '';
  const ticket = buildTicket(f, reviewed);
  const link = createLink(state.jira, ticket);
  const proxyReady = normaliseSite(state.jira.proxyUrl) && session.get('aiew.proxyKey');
  return section(`${f.id} · ${f.name}`, `
    <div class="grid-2 ticket">
      <div>
        <h3>Examples (${f.examples.length})</h3>
        ${f.examples.map((t) => `<div class="example"><a href="#/review?id=${esc(t.id)}">${esc(t.id)}</a> <span class="small muted">${esc(t.review.note)}</span>
          <div class="bubble user small">${esc(t.user)}</div><div class="bubble ai small">${esc(t.ai)}</div></div>`).join('') || '<p class="muted small">No reviewed examples yet.</p>'}
        <h3>Expected behaviour — ${esc(f.criterion)}</h3><p class="small">${esc(CRIT[f.criterion].rubric)}</p>
      </div>
      <div>
        <h3>Jira ticket preview</h3>
        <div class="ticket-preview"><b>${esc(ticket.summary)}</b>
          <div class="small muted">Priority ${esc(ticket.priority)} · Labels ${esc(ticket.labels.join(', '))}</div>
          <pre>${esc(ticket.description)}</pre></div>
        <div class="row">
          ${link ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener" id="open-jira">Open in Jira (pre-filled)</a>` : '<a class="btn ghost" href="#/integrations">Set up Jira to open pre-filled</a>'}
          <button class="btn ghost" id="copy">Copy ticket</button>
          ${proxyReady ? `<button class="btn" id="proxy-create" ${f.jira ? 'disabled' : ''}>Create via proxy</button>` : ''}
          ${proxyReady && f.jira ? '<button class="btn ghost" id="proxy-sync">Sync status from Jira</button>' : ''}
        </div>
        <form id="record-key" class="row"><input name="key" placeholder="Jira key, e.g. VCS-420" value="${esc(f.jira || '')}" pattern="[A-Z][A-Z0-9_]+-[0-9]+"><button class="btn ghost small">Record key</button></form>
        <p class="small muted">Nothing is created without a person: the pre-filled screen opens in Jira for review, and the proxy only creates what you click.</p>
      </div>
    </div>`, `<a class="small" href="#/failures">Close ✕</a>`);
}

export function bind({ root, state, params, refresh }) {
  const fm = (id) => state.fms.find((f) => f.id === id);
  root.querySelectorAll('[data-status]').forEach((s) => s.addEventListener('change', async () => {
    fm(s.dataset.status).status = s.value;
    await log(state, 'You', 'FAILURE_MODE_STATUS', `${s.dataset.status} → ${s.value}`);
    refresh();
  }));
  root.querySelectorAll('[data-assign]').forEach((s) => s.addEventListener('change', async () => {
    if (!s.value) return;
    const t = state.traces.find((x) => x.id === s.dataset.assign);
    t.review.fm = s.value;
    await log(state, 'You', 'FAILURE_ASSIGNED', `${t.id} → ${s.value}`);
    refresh();
  }));
  root.querySelector('#csv').addEventListener('click', async () => {
    const stats = failureModeStats(state.traces, state.fms, state.runs).filter((f) => !f.jira && f.lifecycle !== 'Verified');
    if (!stats.length) return toast('Every failure mode already has a ticket.');
    const reviewed = state.traces.filter((t) => t.review).length;
    download('failure-modes-jira-import.csv', toJiraCsv(stats.map((f) => buildTicket(f, reviewed))), 'text/csv');
    await log(state, 'You', 'JIRA_CSV_EXPORTED', stats.map((f) => f.id).join(', '));
  });

  if (!params.fm) return;
  const f = failureModeStats(state.traces, state.fms, state.runs).find((x) => x.id === params.fm);
  const ticket = buildTicket(f, state.traces.filter((t) => t.review).length);
  root.querySelector('#copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(`${ticket.summary}\n\n${ticket.description}`); toast('Ticket copied.'); } catch { toast('Copy failed — select the text instead.'); }
  });
  root.querySelector('#open-jira')?.addEventListener('click', () => log(state, 'You', 'JIRA_CREATE_OPENED', `${f.id} opened in Jira create screen`));
  root.querySelector('#record-key').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = e.target.key.value.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) return toast('Use a Jira key like VCS-420.');
    Object.assign(fm(f.id), { jira: key, status: fm(f.id).status === 'New' ? 'Ticketed' : fm(f.id).status });
    await log(state, 'You', 'JIRA_KEY_RECORDED', `${f.id} → ${key}`);
    refresh();
  });
  root.querySelector('#proxy-create')?.addEventListener('click', async () => {
    try {
      const res = await createIssueViaProxy({ ...state.jira, proxyKey: session.get('aiew.proxyKey') }, ticket);
      Object.assign(fm(f.id), { jira: res.key, status: 'Ticketed' });
      await log(state, 'You', 'JIRA_ISSUE_CREATED', `${f.id} → ${res.key} via proxy`);
      toast(`Created ${res.key}.`);
      refresh();
    } catch (err) { toast('Jira: ' + err.message); }
  });
  root.querySelector('#proxy-sync')?.addEventListener('click', async () => {
    try {
      const res = await issueStatusViaProxy({ ...state.jira, proxyKey: session.get('aiew.proxyKey') }, f.jira);
      const next = lifecycleFromJira(res.category);
      if (next) fm(f.id).status = next;
      await log(state, 'jira-proxy', 'JIRA_STATUS_SYNCED', `${f.jira}: ${res.status} → ${f.id} ${next || 'unchanged'}`);
      toast(`${f.jira} is "${res.status}".`);
      save(state);
      refresh();
    } catch (err) { toast('Jira: ' + err.message); }
  });
}
