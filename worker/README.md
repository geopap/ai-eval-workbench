# Jira proxy (optional)

The AI Eval Workbench works without any backend: it opens pre-filled Jira create screens and exports Jira-ready CSV. This proxy adds **real two-way sync**: it creates issues through the Jira REST API and reads their status back, so a failure mode moves to *Fixed* when its ticket is done.

Jira Cloud does not accept browser calls authenticated with API tokens, so the token has to live server-side. That is all this worker does.

## Deploy (Cloudflare Workers, free tier)

```bash
cd worker
cp wrangler.toml.example wrangler.toml      # set your site, email, project key and allowed origin
npx wrangler secret put JIRA_API_TOKEN
npx wrangler secret put PROXY_KEY
npx wrangler deploy
```

Then open the app → **Integrations**, paste the worker URL and the proxy key, and click **Test connection**. The app allows network calls to `*.workers.dev`; if you use a custom domain, add it to `connect-src` in `index.html`.

## Security design

- Token stays in the worker's secret store; the browser only holds the proxy key for the current tab.
- CORS allows only `ALLOWED_ORIGIN`; every call needs `x-proxy-key` (compared in constant time).
- The Jira project is fixed in configuration; status reads are limited to that project's keys.
- Input is validated and size-limited before anything is sent to Jira.
- Use a dedicated Jira account with permission to create issues in one project only.
