// Jira integration, three ways — all keep a person in the loop:
//  1. Pre-filled "create issue" link: opens Jira's create screen; the user reviews and saves.
//  2. CSV export in Jira's import format: bulk-create through Jira's CSV importer.
//  3. Optional proxy (worker/jira-proxy.js): real create + status sync through Jira's REST API.
//     Jira Cloud does not accept direct browser calls with API tokens, so the token lives in the proxy.

import { CRIT } from './engine.js';
import { CATEGORIES, FEATURE } from './spec.js';

const PRIORITY = { Critical: 'Highest', High: 'High', Medium: 'Medium', Low: 'Low' };

export function buildTicket(fm, reviewedCount, appUrl = 'https://geopap.github.io/ai-eval-workbench/') {
  const c = CRIT[fm.criterion];
  const examples = (fm.examples || []).slice(0, 3);
  const summary = `[AI quality] ${fm.id}: ${fm.name} (${fm.category}, ${fm.severity})`.slice(0, 250);
  const lines = [
    `Feature: ${FEATURE.id} ${FEATURE.name}`,
    `Failure mode: ${fm.id} — ${fm.name}`,
    `Frequency: ${fm.count} of ${reviewedCount} reviewed conversations (${Math.round((fm.rate || 0) * 100)}%)${fm.suspected ? `, plus ${fm.suspected} suspected in unreviewed traffic` : ''}`,
    `Severity: ${fm.severity} · Governance category: ${fm.category} (${CATEGORIES[fm.category]?.ref || '—'})`,
    `Eval criterion: ${c.id} ${c.name}${c.mustNever ? ' — MUST NEVER happen: one violation blocks release' : ` — threshold ${Math.round(c.threshold * 100)}%`}`,
    '',
    'Expected behaviour:',
    c.rubric,
    '',
    'Examples:',
    ...examples.flatMap((t) => [`- ${t.id} Customer: "${clip(t.user)}"`, `  Assistant: "${clip(t.ai)}"`, `  Reviewer note: ${t.review?.note || '—'}`]),
    '',
    'Definition of done:',
    `- A regression eval for ${fm.id} is built from these examples.`,
    `- It passes in full on the next release candidate in the release gate.`,
    `- The failure mode is marked Verified in the AI Eval Workbench (${appUrl}).`,
  ];
  return {
    summary,
    description: lines.join('\n'),
    priority: PRIORITY[fm.severity] || 'Medium',
    labels: ['ai-quality', 'eval-failure-mode', FEATURE.id.toLowerCase(), `severity-${fm.severity.toLowerCase()}`, fm.category.toLowerCase()],
  };
}

const clip = (s, n = 160) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// Jira's create screen accepts pre-filled fields on /secure/CreateIssueDetails!init.jspa.
// It needs the numeric project ID and issue-type ID (not the key or name).
export function createLink(settings, ticket) {
  if (!settings.site || !settings.projectId || !settings.issueTypeId) return null;
  const site = normaliseSite(settings.site);
  if (!site) return null;
  const q = new URLSearchParams({
    pid: settings.projectId,
    issuetype: settings.issueTypeId,
    summary: ticket.summary,
    description: ticket.description.slice(0, 6000), // keep the URL within common length limits
    labels: ticket.labels.join(' '),
  });
  return `${site}/secure/CreateIssueDetails!init.jspa?${q}`;
}

export function normaliseSite(raw) {
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}`;
  } catch { return null; }
}

// Jira CSV import: one row per issue; multiple labels use repeated "Labels" columns.
export function toJiraCsv(tickets) {
  const maxLabels = Math.max(1, ...tickets.map((t) => t.labels.length));
  const header = ['Summary', 'Issue Type', 'Priority', 'Description', ...Array(maxLabels).fill('Labels')];
  const rows = tickets.map((t) => [t.summary, 'Bug', t.priority, t.description, ...t.labels, ...Array(maxLabels - t.labels.length).fill('')]);
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}

function cell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Proxy client ────────────────────────────────────────────────────────────
export async function proxyRequest(settings, path, body, fetchImpl = fetch) {
  const base = normaliseSite(settings.proxyUrl);
  if (!base) throw new Error('Set a valid https proxy URL first.');
  const res = await fetchImpl(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-proxy-key': settings.proxyKey || '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Proxy error ${res.status}`);
  return data;
}

export const createIssueViaProxy = (settings, ticket, fetchImpl) => proxyRequest(settings, '/issues', ticket, fetchImpl);
export const issueStatusViaProxy = (settings, key, fetchImpl) => proxyRequest(settings, `/issues/${encodeURIComponent(key)}`, null, fetchImpl);

// Map Jira's status category to the failure-mode lifecycle.
export function lifecycleFromJira(category) {
  return { done: 'Fixed', indeterminate: 'In fix', new: 'Ticketed' }[category] || null;
}
