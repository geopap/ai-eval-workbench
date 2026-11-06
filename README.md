# AI Eval Workbench

**From AI failures to fixes, release decisions and audit-ready evidence. Evals that product teams use and AI governance can trust.**

[**▶ Live demo**](https://geopap.github.io/ai-eval-workbench/) · [Method](docs/METHOD.md) · [Architecture](docs/ARCHITECTURE.md) · [Jira proxy](worker/) · AI life cycle: decide with [AI Use-Case Intake](https://github.com/geopap/ai-use-case-intake) → build with [Claude Code SDLC](https://github.com/geopap/claude-code-sdlc) → **prove** → govern with [AI Portfolio Office](https://github.com/geopap/ai-portfolio-office)

![Overview](docs/screenshots/overview.png)

---

## Why this exists

Evaluation is the hardest part of shipping AI, and the tooling is built for engineers. Product managers own *what good looks like*, and the AI governance office needs *evidence that it holds*, but both still work in documents and spreadsheets:

- **"Good" lives in documents.** Rubrics, must-never rules and release bars sit outside any tool.
- **Error analysis dead-ends.** Teams find failure patterns, but they never become prioritised backlog items.
- **There is no ship/no-ship moment.** Scores exist; a clear release decision with a named owner does not.
- **AI judges are trusted blindly.** Using an AI model to grade outputs only works after it has been checked against human labels.
- **There is no bridge to compliance.** EU AI Act Art. 15 expects declared accuracy metrics and testing across the system's life, but eval results are rarely packaged as evidence.

The market is also consolidating fast: Promptfoo went to OpenAI, Humanloop to Anthropic, Galileo to Cisco and Langfuse to ClickHouse. A team's specs, labels, failure modes and release decisions shouldn't disappear with its eval vendor. So this workbench is **tool-neutral**: it sits *above* whatever eval tool engineering uses.

## Who it's for

| | What they get |
|---|---|
| **Product leaders** | An eval spec that replaces the requirements document for AI behaviour, error analysis that turns into a prioritised backlog, and a clear release decision they own |
| **Technology leaders** | Quality gates and regression suites wired into release management, Jira integration with the token kept server-side, and a tool-neutral import, so no eval vendor lock-in. See the [architecture](docs/ARCHITECTURE.md) for the domain model, security and fallbacks |
| **AI governance and risk** | Calibrated measurements instead of trusted-by-default AI judges, must-never criteria, named sign-off and an EU AI Act Art. 15 evidence pack |

## The loop

| Step | What happens |
|---|---|
| **1 · Define** | An **eval spec** replaces the requirements document for AI behaviour: nine criteria for a customer service assistant, each with a rubric, a measurement method (code check or AI judge) and a release bar. Four are **must-never**: one violation blocks a release. |
| **2 · Discover** | **Error analysis** on real conversations. People review, mark pass or fail, and write what went wrong in their own words. Notes are then grouped into named **failure modes**. Review is **blind by default**, so the AI judge doesn't anchor human judgement, and a **saturation** counter shows when no new failure modes are appearing. |
| **3 · Act** | Failure modes are **ranked by risk** (severity × frequency, plus a weight for must-never criteria), mapped to governance categories, and sent to **Jira** as fully written tickets with examples and a definition of done. Each runs through the same lifecycle: **New → Ticketed → In fix → Fixed → Verified**. *Verified* means the ticket is done **and** a regression eval built from its examples passes in full. |
| **4 · Decide** | **Judge calibration**: each AI judge is checked against human labels for both passes and failures (TPR and TNR, with minimum label counts). Only trusted judges count. The **release gate** compares a candidate with production, flags regressions, corrects judge scores for their known errors, and recommends **SHIP / SHIP WITH CONDITIONS / NO-SHIP**. A named person signs off. |
| **5 · Prove** | An **evidence pack** for the AI governance office, printable as a PDF: declared accuracy metrics (Art. 15(3)), testing across the system's life (Art. 15(1), 9), robustness and injection results (Art. 15(5)), transparency (Art. 50(1)), privacy (GDPR), human oversight, a risk register built from the failure modes, and a tamper-evident audit trail. |

### What the demo shows

- **Release candidate 1 is NO-SHIP**, with must-never violations in safety, AI disclosure, financing promises and prompt injection. **Candidate 2 ships with conditions**: everything is clean, but the **tone judge isn't trusted**. It catches only 40% of real failures, so the gate requires a human-reviewed sample instead of trusting its score.
- **One hidden failure is waiting to be found.** Among the ten unreviewed conversations, the assistant obeys an injected "admin mode" instruction and issues a fake discount code. Review it, create a new failure mode, and its Jira ticket is generated.
- **The connection to the Intake stage.** AI Use-Case Intake approved this assistant *on condition that red-team findings are closed*. The evidence pack shows which of those findings are verified and which are still open.

## Jira, three ways, always with a person in the loop

| Route | How | Backend |
|---|---|---|
| **Pre-filled create screen** | "Open in Jira" fills in summary, description and labels; you review and click Create | None |
| **CSV import** | Export every open failure mode in Jira's import format | None |
| **Two-way sync** | Create issues through the Jira REST API and sync their status back, so failure modes move to *Fixed* automatically | Optional [Cloudflare Worker](worker/) that holds the token |

Jira Cloud doesn't accept browser calls authenticated with API tokens, so the token stays in the worker. The worker only accepts calls from the app's own website and requires a shared key. The Jira project is fixed in its configuration, and every request is validated. The worker is tested against a mocked Jira API.

## AI judge, live

Pre-computed judge results make the demo work for everyone. With your own Anthropic key, you can **re-run any judge live with Claude** on this round's labelled conversations and see its agreement with the human labels. The judge returns a binary verdict with a short written reason, in a strict JSON format, and treats the conversation as untrusted data.

## Tool-neutral import

The release gate accepts results from any eval tool, such as Promptfoo, Braintrust, Langfuse or an in-house harness, as CSV or JSON with one row per test case and criterion. Rows tagged with a failure-mode ID (`FM-01`) count as that failure mode's regression suite.

## Run it locally

```bash
git clone https://github.com/geopap/ai-eval-workbench.git
cd ai-eval-workbench
python3 -m http.server 8080      # then open http://localhost:8080
npm test                         # 23 tests: checks, calibration, gate, Jira, proxy, import, judge, backup (Node 20+)
```

## Screenshots

| Review queue: blind review, open and axial coding | Failure modes ranked by risk, with Jira ticket preview |
|---|---|
| ![Review](docs/screenshots/review.png) | ![Failure modes](docs/screenshots/failures.png) |
| **Judge calibration: why the tone judge isn't trusted** | **Release gate: NO-SHIP on must-never violations** |
| ![Judge](docs/screenshots/judge.png) | ![Gate](docs/screenshots/gate.png) |

## How it is built

Plain HTML, CSS and JavaScript modules, with no framework, no build step and no third-party scripts.

```
js/spec.js        the eval spec: criteria, rubrics, release bars, judge-trust and gate policies
js/engine.js      code checks, judge calibration (TPR/TNR, Rogan–Gladen), risk, saturation, release gate
js/jira.js        ticket builder, pre-filled create link, Jira CSV, proxy client
js/importer.js    tool-neutral results import
js/llm.js         live judge with Claude: strict JSON schema, untrusted-data framing
js/audit.js       SHA-256 hash-chained audit trail
js/store.js       browser state, full backup and verified restore
worker/           optional Cloudflare Worker for Jira REST sync
tests/            node:test suites, with mocked Jira and Anthropic APIs
```

## About

Built by **George Papadongonas**, a digital leader focused on **AI value creation**: turning AI from pilots into measurable P&L impact, with the governance, compliance and security that let it scale.

The method draws on established practice in error analysis and judge calibration, especially Hamel Husain and Shreya Shankar's work on evals. *All data is synthetic, including the pre-computed judge verdicts and eval results. **Varnholt Group** is a fictional company. The regulatory mapping is indicative and is not legal advice.*

## License

[MIT](LICENSE)
