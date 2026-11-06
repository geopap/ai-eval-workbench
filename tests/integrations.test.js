// Jira (ticket, link, CSV, proxy), results import and the live judge — all with mocked network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTicket, createLink, toJiraCsv, normaliseSite, createIssueViaProxy, lifecycleFromJira } from '../js/jira.js';
import { handle, validateIssue, toADF } from '../worker/jira-proxy.js';
import { parseResults, rowsToRun, SAMPLE_CSV, parseCsv } from '../js/importer.js';
import { judgeTrace, judgeMany } from '../js/llm.js';
import { failureModeStats } from '../js/engine.js';
import { TRACES, FAILURE_MODES, RUNS } from '../js/data.js';
import { CRITERIA } from '../js/spec.js';
import { appendEntry, verifyChain } from '../js/audit.js';
import { freshState, toBackup, restoreBackup } from '../js/store.js';

const fm1 = failureModeStats(TRACES, FAILURE_MODES, RUNS).find((f) => f.id === 'FM-01');
const reply = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

test('ticket contains frequency, governance mapping, examples and definition of done', () => {
  const t = buildTicket(fm1, 26);
  assert.ok(t.summary.startsWith('[AI quality] FM-01'));
  assert.equal(t.priority, 'High');
  assert.ok(t.description.includes('5 of 26 reviewed'));
  assert.ok(t.description.includes('Art. 15'));
  assert.ok(t.description.includes('T-03'));
  assert.ok(t.description.includes('Definition of done'));
  assert.ok(t.labels.every((l) => /^[a-z0-9][a-z0-9_-]*$/.test(l)), 'labels are valid for the proxy');
});

test('pre-filled link needs numeric IDs and an https site', () => {
  const t = buildTicket(fm1, 26);
  assert.equal(createLink({ site: 'https://x.atlassian.net', projectId: '', issueTypeId: '1' }, t), null);
  assert.equal(createLink({ site: 'http://x.atlassian.net', projectId: '1', issueTypeId: '1' }, t), null);
  const u = new URL(createLink({ site: 'https://x.atlassian.net/jira/x', projectId: '10001', issueTypeId: '10004' }, t));
  assert.equal(u.origin + u.pathname, 'https://x.atlassian.net/secure/CreateIssueDetails!init.jspa');
  assert.equal(u.searchParams.get('pid'), '10001');
  assert.equal(normaliseSite('javascript:alert(1)'), null);
});

test('Jira CSV has repeated label columns and neutralises formulas', () => {
  const t = { ...buildTicket(fm1, 26), summary: '=HYPERLINK("x")' };
  const rows = parseCsv(toJiraCsv([t]));
  assert.deepEqual(rows[0].slice(0, 4), ['Summary', 'Issue Type', 'Priority', 'Description']);
  assert.equal(rows[0].filter((h) => h === 'Labels').length, t.labels.length);
  assert.ok(rows[1][0].startsWith("'="));
});

const env = { ALLOWED_ORIGIN: 'https://geopap.github.io', PROXY_KEY: 'k'.repeat(32), JIRA_SITE: 'https://v.atlassian.net', JIRA_EMAIL: 'a@b.c', JIRA_API_TOKEN: 'tok', JIRA_PROJECT: 'VCS' };
const req = (path, { method = 'GET', key = env.PROXY_KEY, origin = env.ALLOWED_ORIGIN, body } = {}) => new Request(`https://proxy.test${path}`, {
  method, body: body ? JSON.stringify(body) : undefined,
  headers: { origin, 'x-proxy-key': key, 'content-type': 'application/json' },
});

test('proxy rejects wrong origin and wrong key, answers preflight', async () => {
  assert.equal((await handle(req('/health', { origin: 'https://evil.example' }), env, fetch)).status, 403);
  assert.equal((await handle(req('/health', { key: 'nope' }), env, fetch)).status, 401);
  const pre = await handle(req('/issues', { method: 'OPTIONS' }), env, fetch);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), env.ALLOWED_ORIGIN);
  assert.equal((await handle(req('/health'), { ...env, JIRA_API_TOKEN: '' }, fetch)).status, 500);
});

test('proxy creates an issue in the fixed project with an ADF description', async () => {
  let sent;
  const jira = async (url, init) => { sent = { url, init, body: JSON.parse(init.body) }; return reply({ key: 'VCS-501' }, 201); };
  const t = buildTicket(fm1, 26);
  const res = await handle(req('/issues', { method: 'POST', body: { ...t, project: 'OTHER' } }), env, jira);
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { key: 'VCS-501', url: 'https://v.atlassian.net/browse/VCS-501' });
  assert.equal(sent.url, 'https://v.atlassian.net/rest/api/3/issue');
  assert.equal(sent.body.fields.project.key, 'VCS', 'caller cannot pick the project');
  assert.equal(sent.body.fields.description.type, 'doc');
  assert.ok(sent.init.headers.authorization.startsWith('Basic '));
  assert.equal(sent.body.fields.priority, undefined, 'priority only when enabled');
});

test('proxy validates input and limits status reads to its project', async () => {
  assert.match(validateIssue({ summary: '', description: 'x' }), /Summary/);
  assert.match(validateIssue({ summary: 'ok', description: 'x', labels: ['Bad Label'] }), /Labels/);
  assert.equal(validateIssue({ summary: 'ok', description: 'x', labels: ['ai-quality'], priority: 'High' }), null);
  assert.equal((await handle(req('/issues/OTHER-1'), env, fetch)).status, 403);
  const jira = async () => reply({ fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } });
  const r = await (await handle(req('/issues/VCS-12'), env, jira)).json();
  assert.deepEqual(r, { key: 'VCS-12', status: 'Done', category: 'done' });
  assert.equal(lifecycleFromJira(r.category), 'Fixed');
  assert.equal(toADF('a\n\nb').content.length, 3);
});

test('app proxy client sends the key and surfaces errors', async () => {
  let headers;
  const ok = await createIssueViaProxy({ proxyUrl: 'https://p.workers.dev', proxyKey: 'k' }, { summary: 's' }, async (u, i) => { headers = i.headers; return reply({ key: 'VCS-9' }, 201); });
  assert.equal(ok.key, 'VCS-9');
  assert.equal(headers['x-proxy-key'], 'k');
  await assert.rejects(createIssueViaProxy({ proxyUrl: 'https://p.workers.dev', proxyKey: 'k' }, { summary: 's' }, async () => reply({ error: 'Unauthorised.' }, 401)), /Unauthorised/);
  await assert.rejects(createIssueViaProxy({ proxyUrl: 'ftp://x' }, {}), /https/);
});

test('results import: CSV and JSON, criteria and regression suites, bad rows rejected', () => {
  const { run, rejected } = rowsToRun(parseResults(SAMPLE_CSV, 's.csv'), { id: 'i1', label: 'Imported' });
  assert.deepEqual(run.results.C8, { n: 1, pass: 0 });
  assert.deepEqual(run.regression['FM-01'], { n: 1, pass: 1 });
  assert.equal(rejected.length, 0);
  const j = rowsToRun(parseResults('[{"criterion":"c1","pass":true},{"criterion":"C99","pass":true},{"criterion":"C2","pass":"maybe"}]', 'r.json'), { id: 'i2', label: 'x' });
  assert.deepEqual(j.run.results.C1, { n: 1, pass: 1 });
  assert.equal(j.rejected.length, 2);
  assert.throws(() => parseResults('a,b\n1,2', 'x.csv'), /criterion/);
});

test('live judge sends a strict schema, wraps the conversation and handles failures', async () => {
  let body;
  const fetchImpl = async (u, i) => { body = JSON.parse(i.body); return reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"reason":"Invented 60 days.","verdict":"fail"}' }] }); };
  const c1 = CRITERIA.find((c) => c.id === 'C1');
  const r = await judgeTrace({ apiKey: 'k', model: 'claude-opus-5-5', criterion: c1, trace: TRACES[2], fetchImpl });
  assert.equal(r.verdict, 'fail');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.ok(body.system.includes('untrusted data'));
  assert.ok(body.messages[0].content.startsWith('<conversation>'));
  const many = await judgeMany({ apiKey: 'k', model: 'claude-haiku-5-5', criterion: c1, traces: TRACES.slice(0, 4), fetchImpl: async () => reply({ error: { message: 'rate limited' } }, 429) });
  assert.equal(Object.values(many).filter((v) => v.error).length, 4, 'errors are reported per trace');
});

test('audit chain detects tampering', async () => {
  let log = [];
  for (const a of ['REVIEW', 'GATE']) log = await appendEntry(log, { actor: 'x', action: a, detail: a });
  assert.equal((await verifyChain(log)).ok, true);
  log[1].detail = 'edited';
  assert.equal((await verifyChain(log)).ok, false);
});

test('live judge retries without fallbacks when rejected, and surfaces refusals', async () => {
  const sent = [];
  const fetchImpl = async (u, i) => {
    const b = JSON.parse(i.body);
    sent.push(b);
    if (b.fallbacks) return reply({ error: { message: 'unknown field' } }, 400);
    return reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"reason":"Correct.","verdict":"pass"}' }] });
  };
  const c1 = CRITERIA.find((c) => c.id === 'C1');
  const r = await judgeTrace({ apiKey: 'k', model: 'claude-opus-5-5', criterion: c1, trace: TRACES[0], fetchImpl });
  assert.equal(r.verdict, 'pass');
  assert.deepEqual(sent.map((b) => b.fallbacks), ['default', undefined]);
  await assert.rejects(
    judgeTrace({ apiKey: 'k', model: 'claude-haiku-5-5', criterion: c1, trace: TRACES[0], fetchImpl: async () => reply({ stop_reason: 'refusal', content: [] }) }),
    /declined/,
  );
});

test('backup round-trips and a tampered audit chain is rejected', async () => {
  const s = freshState();
  for (const a of ['REVIEW', 'GATE']) s.audit = await appendEntry(s.audit, { actor: 'x', action: a, detail: a });
  const restored = await restoreBackup(toBackup(s));
  assert.equal(restored.audit.length, 2);
  assert.equal(restored.traces.length, s.traces.length);
  const bad = JSON.parse(toBackup(s));
  bad.state.audit[0].detail = 'edited';
  await assert.rejects(restoreBackup(JSON.stringify(bad)), /chain is broken/);
  await assert.rejects(restoreBackup('{"app":"other"}'), /Not an AI Eval Workbench backup/);
  await assert.rejects(restoreBackup('not json'), /valid JSON/);
});
