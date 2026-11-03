# Method

> Indicative and for illustration, not legal advice.

## 1. Define: the eval spec

The spec (`js/spec.js`) is the contract between product and governance. Each criterion has:

- a **rubric**, written so that two reviewers would reach the same verdict
- a **method**: *code* (a deterministic check, always trusted) or *judge* (an LLM-as-judge, trusted only after calibration)
- a **release bar**: a pass-rate threshold, or **must-never** (zero violations)

Binary pass/fail verdicts are used throughout. They are easier to label consistently, easier to calibrate and easier to act on than 1–10 scores.

## 2. Discover: error analysis

1. Sample real conversations from the release candidate.
2. **Open coding**: a person marks pass or fail and writes what went wrong in their own words. The AI judge's verdict stays hidden until then, so it can't anchor the reviewer.
3. **Axial coding**: notes are grouped into named failure modes, each tied to one criterion, a severity and a governance category.
4. **Saturation**: stop when 10 consecutive reviews surface no new failure mode.

## 3. Act: the failure-mode lifecycle

| Stage | Meaning |
|---|---|
| New | Found in review, not yet ticketed |
| Ticketed | Jira issue exists (pre-filled screen, CSV import or proxy) |
| In fix | Jira status category "in progress" |
| Fixed | Jira status category "done" |
| **Verified** | Fixed **and** the regression eval built from its examples passes in full on the latest candidate |

**Risk score** = severity (1–4) × frequency band (1–3, by share of reviewed conversations) + 2 for must-never criteria.

## 4. Decide: judge calibration and the release gate

**Calibration.** For every judge criterion, judge verdicts are compared with human labels:

- **TPR**: of the answers people passed, the share the judge also passed
- **TNR**: of the answers people failed, the share the judge caught

A judge is *trusted* when TPR ≥ 80% and TNR ≥ 80%, with at least 10 human-labelled passes and 5 failures. TNR matters most: a judge that passes everything has high raw agreement but catches nothing.

**Correction.** For trusted judges, the observed pass rate is corrected for known judge error (Rogan–Gladen): `(observed + TNR − 1) / (TPR + TNR − 1)`.

**Gate rules.**

- **NO-SHIP**: any must-never violation, a critical criterion below its bar, or missing data.
- **SHIP WITH CONDITIONS**: a non-critical criterion below its bar, an untrusted judge, or a regression of more than 2 points against production.
- **SHIP**: everything passes with trusted measurements.

The gate recommends; a named person decides. Overriding a NO-SHIP requires a *risk-accepted exception* with a full written rationale.

## 5. Prove: the evidence pack

| Section | Points to |
|---|---|
| Declared accuracy metrics | EU AI Act Art. 15(3) |
| Testing across the life cycle | Art. 15(1), Art. 9 |
| Robustness and cybersecurity (prompt-injection red team) | Art. 15(4)–(5) |
| AI disclosure | Art. 50(1) |
| Payment data and privacy | GDPR Art. 5(1)(f), 32 |
| Human oversight | Art. 14 (applied voluntarily) |
| Risk register | Art. 9, built from the failure modes |
| Audit trail | Hash-chained, verifiable |

Art. 15 requirements are expected to be operationalised through harmonised standards that are still in draft (for example prEN 18229-2), so treat this mapping as a working structure, not a certified one.
