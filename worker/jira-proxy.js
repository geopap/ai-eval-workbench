// Jira proxy for AI Eval Workbench — a Cloudflare Worker.
// Holds the Jira API token server-side, so it never reaches the browser.
//
// Routes
//   GET  /health          → { ok: true, project }
//   POST /issues          → create an issue in the configured project; body { summary, description, labels, priority }
//   GET  /issues/:key     → { key, status, category } for lifecycle sync
//
// Security
//   - Only the configured origin may call it (CORS), and every call needs the shared x-proxy-key.
//   - The project is fixed by configuration; callers cannot choose another project.
//   - Inputs are validated and size-limited; issue keys must belong to the configured project.
//
// Secrets / vars (see wrangler.toml.example):
//   JIRA_SITE (https://your-site.atlassian.net), JIRA_EMAIL, JIRA_API_TOKEN (secret),
//   JIRA_PROJECT (e.g. VCS), JIRA_ISSUE_TYPE (default Bug), ALLOWED_ORIGIN, PROXY_KEY (secret),
//   SET_PRIORITY ("true" to pass the priority through — names must exist in your Jira)

const LABEL = /^[a-z0-9][a-z0-9_-]{0,49}$/;

export default {
  fetch: (request, env) => handle(request, env, fetch),
};

export async function handle(request, env, fetchImpl) {
  const origin = request.headers.get('origin') || '';
  const cors = {
    'access-control-allow-origin': env.ALLOWED_ORIGIN,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-proxy-key',
    'access-control-max-age': '600',
    vary: 'origin',
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

  if (!env.ALLOWED_ORIGIN || !env.PROXY_KEY || !env.JIRA_SITE || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN || !env.JIRA_PROJECT) {
    return json({ error: 'Proxy is not configured.' }, 500);
  }
  if (origin && origin !== env.ALLOWED_ORIGIN) return json({ error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!timingSafeEqual(request.headers.get('x-proxy-key') || '', env.PROXY_KEY)) return json({ error: 'Unauthorised.' }, 401);

  const url = new URL(request.url);
  const jira = (path, init = {}) => fetchImpl(`${env.JIRA_SITE.replace(/\/$/, '')}/rest/api/3${path}`, {
    ...init,
    headers: {
      authorization: 'Basic ' + btoa(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`),
      accept: 'application/json',
      'content-type': 'application/json',
    },
  });

  if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, project: env.JIRA_PROJECT });

  if (request.method === 'POST' && url.pathname === '/issues') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    const problem = validateIssue(body);
    if (problem) return json({ error: problem }, 400);
    const fields = {
      project: { key: env.JIRA_PROJECT },
      issuetype: { name: env.JIRA_ISSUE_TYPE || 'Bug' },
      summary: body.summary.trim(),
      description: toADF(body.description),
      labels: body.labels || [],
    };
    if (env.SET_PRIORITY === 'true' && body.priority) fields.priority = { name: body.priority };
    const res = await jira('/issue', { method: 'POST', body: JSON.stringify({ fields }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: 'Jira rejected the issue.', details: data.errors || data.errorMessages || null }, 502);
    return json({ key: data.key, url: `${env.JIRA_SITE.replace(/\/$/, '')}/browse/${data.key}` }, 201);
  }

  const m = url.pathname.match(/^\/issues\/([A-Z][A-Z0-9_]+-\d+)$/);
  if (request.method === 'GET' && m) {
    if (!m[1].startsWith(`${env.JIRA_PROJECT}-`)) return json({ error: 'Issue is outside the configured project.' }, 403);
    const res = await jira(`/issue/${m[1]}?fields=status`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: 'Issue not found.' }, res.status === 404 ? 404 : 502);
    return json({ key: m[1], status: data.fields?.status?.name, category: data.fields?.status?.statusCategory?.key });
  }

  return json({ error: 'Not found.' }, 404);
}

export function validateIssue(b) {
  if (!b || typeof b !== 'object') return 'Body must be an object.';
  if (typeof b.summary !== 'string' || !b.summary.trim() || b.summary.length > 255) return 'Summary is required (max 255 characters).';
  if (typeof b.description !== 'string' || b.description.length > 20000) return 'Description is required (max 20,000 characters).';
  if (b.labels !== undefined && (!Array.isArray(b.labels) || b.labels.length > 10 || !b.labels.every((l) => typeof l === 'string' && LABEL.test(l)))) return 'Labels must be up to 10 lowercase slugs.';
  if (b.priority !== undefined && !['Highest', 'High', 'Medium', 'Low', 'Lowest'].includes(b.priority)) return 'Unknown priority.';
  return null;
}

// Jira REST API v3 expects descriptions in Atlassian Document Format.
export function toADF(text) {
  return {
    type: 'doc',
    version: 1,
    content: text.split('\n').map((line) => (line.trim()
      ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
      : { type: 'paragraph', content: [] })),
  };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
