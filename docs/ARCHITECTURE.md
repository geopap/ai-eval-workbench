# Architecture

## Goals

- **Zero-install demo.** A static site anyone can open from a link, hosted on GitHub Pages.
- **Auditable.** Plain JavaScript modules with no build step and no third-party runtime code, so every line that runs can be read in this repository.
- **Deterministic decisions.** Code checks, judge calibration, risk ranking and the release gate are pure functions: the same input always gives the same decision.
- **Optional integrations.** The app is complete without a model or Jira. Each integration adds capability, and none is required to reach a release decision.

## Domain model

The eval spec and the release decision are the two ends of the model. Everything in between is evidence.

```
Feature (UC-01) ──1:n──► Criterion ──── rubric, method (code | judge), release bar, must-never
                              │
Conversation (trace) ──n:m────┤  human label per criterion (pass / fail + note)
      │                       │  judge verdict per criterion
      └──n:1──► Failure mode ─┘  one criterion, severity, governance category,
                    │            lifecycle: New → Ticketed → In fix → Fixed → Verified
                    └──1:1──► Jira issue (key, status category)

Run (release candidate) ──► results per criterion (pass / n)
                        └─► regression suite per failure mode (FM-xx)

Calibration (per judge criterion) = human labels × judge verdicts → TPR, TNR, trusted?

Gate decision = Run + baseline Run + Calibration → SHIP | SHIP WITH CONDITIONS | NO-SHIP
              + named decider, rationale, timestamp → audit trail → evidence pack
```

Design choices worth noting:

- **A failure mode belongs to exactly one criterion.** That keeps the risk score, the regression suite and the release bar pointing at the same thing.
- **Verified is derived, never set by hand.** It needs the Jira issue done *and* the failure mode's regression suite passing in full on the latest run.
- **Policy is data.** Release bars, judge-trust thresholds and the regression tolerance live in `js/spec.js`, versioned with the spec, not scattered through the code.

## Modules

| File | Responsibility |
|---|---|
| `js/spec.js` | The eval spec: criteria, rubrics, release bars, governance categories, judge-trust and gate policies |
| `js/data.js` | Synthetic conversations, failure modes, seed labels and eval runs (fictional company) |
| `js/engine.js` | Pure functions: `codeChecks`, `calibration`, `correctedRate`, `failureModeStats`, `saturation`, `gate` |
| `js/jira.js` | Ticket builder, pre-filled create link, Jira CSV export, proxy client, Jira status → lifecycle mapping |
| `js/importer.js` | Tool-neutral results import (CSV or JSON) into runs and regression suites |
| `js/llm.js` | Optional live judge with Claude |
| `js/audit.js` | Hash-chained audit log (Web Crypto SHA-256) |
| `js/store.js` | State persistence in `localStorage`, session-only secrets in `sessionStorage` |
| `js/app.js`, `js/views/*.js` | Hash router and one module per page |
| `worker/jira-proxy.js` | Optional Cloudflare Worker that holds the Jira token |

## Data flow

```
spec.js + data.js ─► store.js (state) ─► engine ─► views
                         ▲     │
   results import (CSV/JSON)   ├─► jira.js ─► pre-filled link | CSV | worker ─► Jira REST v3
   live judge (llm.js) ────────┘                                    │
                         │                     status sync ◄────────┘
                     audit.js ◄── every label, failure mode, ticket and gate decision
```

## Security

- **Strict Content-Security-Policy.** Scripts only from this site; network access only to `api.anthropic.com` and `*.workers.dev`.
- **Untrusted input everywhere it enters.** Conversations, notes, imported results and model output are HTML-escaped before rendering. Conversations are wrapped as untrusted data in the judge prompt, and the judge has no tools.
- **Secrets never persist.** API and proxy keys are kept in `sessionStorage` for the tab only. The Jira token never reaches the browser.
- **The proxy is narrow by design.** One allowed origin, a shared key compared in constant time, a project fixed in configuration, issue reads limited to that project, and validated, size-limited inputs.
- **Export hygiene.** The Jira CSV neutralises spreadsheet formula injection.

See [SECURITY.md](../SECURITY.md).

## Availability and fallbacks

Every integration fails safe, so the core flow (review, rank, decide) always works.

| Dependency | If it is unavailable | Behaviour |
|---|---|---|
| Browser storage | Private mode or blocked | The app runs from the built-in demo data; nothing is lost except persistence |
| Claude API | No key, outage or refusal | Pre-computed judge results stay in place; errors are shown per conversation, not for the whole batch |
| Preferred model | Overloaded or unavailable | Server-side model fallback is requested; if the request is rejected, the call is retried without it |
| Judge output | Malformed or off-schema | Strict JSON schema, re-validated locally; anything else is rejected, never guessed |
| Untrusted judge | Fails calibration | Its scores are not used: the gate asks for a human-reviewed sample instead |
| Jira proxy | Not deployed or down | Pre-filled create link and CSV import still work; the lifecycle is updated by hand |
| Proxy misconfigured | Missing secret or variable | It refuses every request (fails closed) instead of running half-configured |

**Backup and restore.** The full state (labels, failure modes, runs, decisions and the audit log) downloads as one JSON backup and restores from the *Audit trail & data* page. A restore is refused unless the file has the expected shape and its audit chain verifies, so an edited audit log is caught before it replaces anything.

## Taking it to production

The demo runs in the browser so it needs no backend. In an enterprise setting, the same modules map onto:

- **Shared store and SSO** instead of `localStorage`, so labels and decisions are shared across reviewers and tied to real identities.
- **Eval runs from CI.** The pipeline posts results to the import endpoint, and the release gate becomes a required check before deployment.
- **A model gateway** that holds the key and applies organisation policy (logging, data-loss prevention, model allow-list), instead of browser calls.
- **The Jira proxy as a service** behind the company's identity provider, with the same narrow contract.

## Tests

`npm test` runs `node:test` suites against the pure modules, with mocked Jira and Anthropic APIs:

- engine: code checks and language detection, calibration and trust, Rogan–Gladen correction, risk and lifecycle rules, saturation, every gate outcome
- integrations: ticket builder, create link, CSV escaping, proxy authentication, origin and project limits, input validation, Jira status mapping, results import, judge request shape, fallback retry and refusal handling, audit tamper detection, backup restore

CI runs the tests on every push. GitHub Pages deploys the site from `main`.
