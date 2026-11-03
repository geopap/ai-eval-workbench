import { esc, section, pageHead, toast, download } from '../ui.js';
import { normaliseSite, proxyRequest } from '../jira.js';
import { parseResults, rowsToRun, SAMPLE_CSV } from '../importer.js';
import { log, save, session } from '../store.js';

let health = null;

export function render({ state }) {
  const j = state.jira;
  const key = session.get('aiew.proxyKey');
  return `
    ${pageHead('Connect', 'Integrations', 'Jira for the failure-mode lifecycle, and a tool-neutral import so the release gate works with whatever eval tool engineering uses.')}
    <div class="grid-2">
      ${section('Jira — pre-filled create screen (no backend)', `
        <form id="jira" class="signoff">
          <label>Jira site<input name="site" placeholder="https://your-site.atlassian.net" value="${esc(j.site)}"></label>
          <div class="form-grid two"><label>Project ID<input name="projectId" inputmode="numeric" placeholder="10001" value="${esc(j.projectId)}"></label>
          <label>Issue type ID<input name="issueTypeId" inputmode="numeric" placeholder="10004" value="${esc(j.issueTypeId)}"></label></div>
          <button class="btn primary">Save</button>
        </form>
        <p class="small muted">The create screen needs numeric IDs. Find them in Jira under Project settings (the project ID is in the page URL) and Issue types. "Open in Jira" then pre-fills the summary, description and labels; you review and click Create.</p>`)}
      ${section('Jira — two-way sync through the proxy (optional)', `
        <form id="proxy" class="signoff">
          <label>Proxy URL<input name="proxyUrl" placeholder="https://ai-eval-workbench-jira-proxy.you.workers.dev" value="${esc(j.proxyUrl)}"></label>
          <label>Proxy key<input name="proxyKey" type="password" autocomplete="off" placeholder="Shared secret set in the worker" value="${esc(key)}"></label>
          <div class="row"><button class="btn primary">Save</button><button type="button" class="btn ghost" id="test">Test connection</button>
          ${health ? `<span class="pill ${health.ok ? 'ok' : 'bad'}">${esc(health.text)}</span>` : ''}</div>
        </form>
        <p class="small muted">Creates issues through the Jira REST API and syncs their status back, so failure modes move to Fixed automatically. Jira Cloud blocks browser calls with API tokens, so the token lives in a small Cloudflare Worker — see <a href="https://github.com/geopap/ai-eval-workbench/tree/main/worker" target="_blank" rel="noopener">worker/</a>. The proxy key is kept for this browser tab only.</p>`)}
    </div>
    <div class="grid-2">
      ${section('Import eval results', `
        <p class="small">One row per test case and criterion, from any tool — Promptfoo, Braintrust, Langfuse or an in-house harness. Use criterion IDs from the eval spec (C1–C9); rows with a failure-mode ID (FM-01…) count as that failure mode's regression suite.</p>
        <form id="import" class="signoff">
          <label>Run label<input name="label" placeholder="v2.3 release candidate 3" required></label>
          <label class="btn ghost file">Choose CSV or JSON…<input type="file" name="file" accept=".csv,.json,text/csv,application/json" hidden></label>
        </form>
        <div class="row"><button class="btn ghost small" id="sample">Download sample CSV</button></div>
        <pre class="facts">${esc(SAMPLE_CSV)}</pre>`)}
      ${section('Where this sits', `<ol class="reasoning small">
        <li><b>Engineering's eval tool</b> runs the test sets and exports results.</li>
        <li><b>This workbench</b> owns the spec, the human review, the failure-mode lifecycle, the gate and the evidence — so they survive a change of eval vendor.</li>
        <li><b>Jira</b> carries the fix work; its status flows back.</li>
        <li><b>The AI governance office</b> receives the evidence pack.</li></ol>`)}
    </div>`;
}

export function bind({ root, state, refresh, go }) {
  root.querySelector('#jira').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const site = String(f.get('site')).trim();
    if (site && !normaliseSite(site)) return toast('Use an https:// Jira site URL.');
    const id = (v) => String(v).trim().replace(/\D/g, '');
    Object.assign(state.jira, { site: site ? normaliseSite(site) : '', projectId: id(f.get('projectId')), issueTypeId: id(f.get('issueTypeId')) });
    await log(state, 'You', 'JIRA_SETTINGS', `Site ${state.jira.site || '—'}, project ${state.jira.projectId || '—'}`);
    toast('Jira settings saved.');
    refresh();
  });
  root.querySelector('#proxy').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const url = String(f.get('proxyUrl')).trim();
    if (url && !normaliseSite(url)) return toast('Use an https:// proxy URL.');
    state.jira.proxyUrl = url ? normaliseSite(url) : '';
    session.set('aiew.proxyKey', String(f.get('proxyKey')).trim());
    save(state);
    toast('Proxy settings saved.');
    refresh();
  });
  root.querySelector('#test').addEventListener('click', async () => {
    try {
      const r = await proxyRequest({ proxyUrl: state.jira.proxyUrl, proxyKey: session.get('aiew.proxyKey') }, '/health');
      health = { ok: true, text: `Connected — project ${r.project}` };
    } catch (err) { health = { ok: false, text: err.message }; }
    refresh();
  });
  root.querySelector('#sample').addEventListener('click', () => download('eval-results-sample.csv', SAMPLE_CSV, 'text/csv'));
  root.querySelector('#import input[type=file]').addEventListener('change', async (e) => {
    const form = root.querySelector('#import');
    const label = form.label.value.trim();
    const file = e.target.files[0];
    if (!file) return;
    if (!label) { e.target.value = ''; return toast('Give the run a label first.'); }
    try {
      if (file.size > 5_000_000) throw new Error('file too large (max 5 MB)');
      const rows = parseResults(await file.text(), file.name);
      const id = `import-${state.runs.length}`;
      const { run, rejected } = rowsToRun(rows, { id, label: label.slice(0, 60) });
      if (!Object.keys(run.results).length) throw new Error('no rows matched a criterion C1–C9');
      state.runs.push(run);
      await log(state, 'You', 'RESULTS_IMPORTED', `${label}: ${rows.length - rejected.length} rows from ${file.name.slice(0, 60)}${rejected.length ? `, ${rejected.length} rejected (${rejected[0].reason})` : ''}`);
      toast(`Imported ${rows.length - rejected.length} results${rejected.length ? `, ${rejected.length} rejected` : ''}.`);
      go(`#/gate?run=${id}`);
    } catch (err) { toast('Import failed: ' + err.message); }
  });
}
