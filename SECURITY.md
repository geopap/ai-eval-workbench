# Security

## Design

- **Static site, no backend required.** Review labels, failure modes and decisions live only in the viewer's browser (`localStorage`).
- **Content-Security-Policy.** Scripts load only from this site. Network access is limited to `api.anthropic.com` (optional live judge) and `*.workers.dev` (optional Jira proxy). If you host the proxy on a custom domain, add it to `connect-src` in `index.html`.
- **Output encoding.** All dynamic text, including conversations, notes and model output, is HTML-escaped before rendering.
- **Secrets.** The Anthropic key and the proxy key are held in `sessionStorage` for the current tab only. The Jira API token never reaches the browser: it lives in the worker's secret store.
- **Jira proxy.** It only accepts calls from the app's own website, every request needs a shared key (compared in constant time), the project is fixed in configuration, and inputs are validated and size-limited. Use a dedicated Jira account limited to one project.
- **Exports.** The Jira CSV neutralises spreadsheet formula injection.
- **Model calls.** Conversations are wrapped as untrusted data; the judge has no tools and returns a strict JSON verdict that is validated before use.

## Reporting a vulnerability

Please open a private security advisory on this repository (Security → Advisories → Report a vulnerability) rather than a public issue.
