import { esc, section, pageHead, download, toast } from '../ui.js';
import { verifyChain } from '../audit.js';
import { freshState, save, log } from '../store.js';

let verdict = null;

export function render({ state }) {
  const rows = state.audit.slice().reverse().map((e) => `<tr>
    <td class="r muted">${e.seq}</td><td class="small">${esc(new Date(e.ts).toLocaleString('en-GB'))}</td>
    <td><span class="actor ${['claude-judge', 'jira-proxy', 'system'].includes(e.actor) ? 'agent' : 'human'}">${esc(e.actor)}</span></td>
    <td><code>${esc(e.action)}</code></td><td>${esc(e.detail)}</td><td class="hash" title="${esc(e.hash)}">${esc(e.hash.slice(0, 10))}…</td></tr>`).join('');

  return `
    ${pageHead('Every step is logged', 'Audit trail & data', 'A tamper-evident record of every review, failure-mode change, Jira action, judge run and release decision. Each entry includes the hash of the one before it, so any edit breaks the chain.')}
    ${section(`Audit log — ${state.audit.length} entries`, `
      <div class="row"><button class="btn" id="verify">Verify chain integrity</button><button class="btn ghost" id="export-log">Export log (JSON)</button>
      ${verdict ? `<span class="pill ${verdict.ok ? 'ok' : 'bad'}">${verdict.ok ? `✓ Chain intact — ${verdict.entries} entries` : `✕ Broken at entry ${verdict.brokenAt}: ${esc(verdict.reason)}`}</span>` : ''}</div>
      <div class="table-wrap"><table class="table audit"><thead><tr><th class="r">#</th><th>Time</th><th>Actor</th><th>Action</th><th>Detail</th><th>Hash</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="muted">No entries yet.</td></tr>'}</tbody></table></div>`)}
    <div class="grid-2">
      ${section('Review data', `<p class="small">Export this round's human labels — the most valuable asset of any eval programme — to reuse them in another tool or the next round.</p>
        <div class="row"><button class="btn ghost" id="export-json">Export labels (JSON)</button></div>`)}
      ${section('Reset the demo', `<p class="small">Restore the synthetic review round and clear decisions, Jira settings and the audit log stored in this browser.</p>
        <button class="btn danger" id="reset">Reset demo data</button>`)}
    </div>`;
}

export function bind({ root, state, refresh, replaceState }) {
  const $ = (s) => root.querySelector(s);
  $('#verify').addEventListener('click', async () => { verdict = await verifyChain(state.audit); refresh(); });
  $('#export-log').addEventListener('click', () => download('audit-log.json', JSON.stringify(state.audit, null, 2), 'application/json'));
  $('#export-json').addEventListener('click', () => download('eval-labels.json', JSON.stringify(state.traces.filter((t) => t.review).map((t) => ({ id: t.id, user: t.user, ai: t.ai, ...t.review })), null, 2), 'application/json'));
  $('#reset').addEventListener('click', async () => {
    if (!confirm('Reset all demo data in this browser?')) return;
    const s = freshState();
    verdict = null;
    await log(s, 'user', 'DEMO_RESET', 'Synthetic review round restored');
    save(s);
    replaceState(s);
  });
}
