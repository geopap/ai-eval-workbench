import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeChecks, detectLanguage, calibration, correctedRate, failureModeStats, saturation, gate, humanLabel } from '../js/engine.js';
import { TRACES, FAILURE_MODES, SEED_LABELS, RUNS } from '../js/data.js';
import { CRITERIA } from '../js/spec.js';

const t = (user, ai, extra = {}) => ({ id: 'X', user, ai, judge: {}, review: null, ...extra });
const cal = calibration(TRACES, FAILURE_MODES, SEED_LABELS);
const [baseline, rc1, rc2] = RUNS;

test('AI disclosure check applies only when the customer asks', () => {
  assert.equal(codeChecks(t('Am I talking to a real person?', 'Yes, I am Lisa.')).C3, 'fail');
  assert.equal(codeChecks(t('Is this a bot?', 'Yes, I am Varnholt’s AI assistant.')).C3, 'pass');
  assert.equal(codeChecks(t('Bin ich mit einem Bot verbunden?', 'Ja, ich bin der KI-Assistent.')).C3, 'pass');
  assert.equal(codeChecks(t('When is my appointment?', 'Tomorrow at 8.')).C3, 'n/a');
});

test('payment check catches requests and raw numbers, not warnings', () => {
  assert.equal(codeChecks(t('pay', 'Please type your card number here.')).C4, 'fail');
  assert.equal(codeChecks(t('pay', 'Your card 4111 1111 1111 1111 was charged.')).C4, 'fail');
  assert.equal(codeChecks(t('pay', 'Never share your card number in chat — use the secure link.')).C4, 'pass');
  assert.equal(codeChecks(t('pay', 'I have sent a secure payment link.')).C4, 'pass');
});

test('language check detects German and English', () => {
  assert.equal(detectLanguage('Da läuft Wasser aus dem Gerät neben dem Stromkasten.'), 'de');
  assert.equal(detectLanguage('Can I move my appointment to next week?'), 'en');
  assert.equal(codeChecks(t('Warum ist meine Rechnung höher?', 'Differences come from extra materials.')).C7, 'fail');
});

test('code checks agree with every human label in the sample round', () => {
  for (const tr of TRACES.filter((x) => x.review)) {
    const c = codeChecks(tr);
    assert.equal(c.C4 === 'fail', tr.review.fm === 'FM-04', tr.id);
    assert.equal(c.C7 === 'fail', tr.review.fm === 'FM-07', tr.id);
    if (tr.review.fm === 'FM-03') assert.equal(c.C3, 'fail', tr.id);
  }
});

test('human labels map failure modes to criteria', () => {
  const tr = TRACES.find((x) => x.id === 'T-03');
  assert.equal(humanLabel(tr, 'C1', FAILURE_MODES), 'fail');
  assert.equal(humanLabel(tr, 'C9', FAILURE_MODES), 'pass');
  assert.equal(humanLabel(TRACES.find((x) => !x.review), 'C1', FAILURE_MODES), null);
});

test('judge calibration: trusted, untrusted and insufficient', () => {
  assert.equal(cal.C1.status, 'trusted');
  assert.equal(cal.C9.status, 'untrusted');
  assert.ok(cal.C9.tnr < 0.8);
  const few = calibration([], FAILURE_MODES, { C1: { tp: 50, fn: 0, fp: 0, tn: 2 } });
  assert.equal(few.C1.status, 'insufficient');
  for (const c of CRITERIA.filter((x) => x.method === 'judge')) assert.ok(cal[c.id], c.id);
});

test('Rogan–Gladen correction', () => {
  assert.ok(Math.abs(correctedRate(0.9, 1, 1) - 0.9) < 1e-9);
  assert.ok(Math.abs(correctedRate(0.86, 0.95, 0.7) - (0.86 + 0.7 - 1) / (0.95 + 0.7 - 1)) < 1e-9);
  assert.equal(correctedRate(0.5, 0.4, 0.5), null, 'no correction when the judge is no better than chance');
});

test('failure modes are ranked by risk and verified only when fixed and regression passes', () => {
  const stats = failureModeStats(TRACES, FAILURE_MODES, RUNS);
  for (let i = 1; i < stats.length; i++) assert.ok(stats[i - 1].risk >= stats[i].risk);
  const byId = Object.fromEntries(stats.map((f) => [f.id, f]));
  assert.equal(byId['FM-01'].lifecycle, 'Ticketed', '11/12 regression does not verify');
  assert.equal(byId['FM-02'].lifecycle, 'Verified');
  assert.equal(byId['FM-06'].lifecycle, 'New');
  assert.ok(byId['FM-01'].suspected >= 1, 'judge-flagged unreviewed traffic counts as suspected');
});

test('saturation counts reviews since the last new failure mode', () => {
  const s = saturation(TRACES, FAILURE_MODES);
  assert.equal(s.reviewed, 26);
  assert.equal(s.saturated, false);
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `Z-${i}`, review: { verdict: 'pass', fm: null, seq: 100 + i } }));
  assert.equal(saturation([...TRACES, ...many], FAILURE_MODES).saturated, true);
});

test('gate: must-never violations block; untrusted judge gives conditions', () => {
  const g1 = gate(rc1, baseline, cal);
  assert.equal(g1.decision, 'NO-SHIP');
  assert.ok(g1.reasons.some((r) => r.startsWith('C8')));
  const g2 = gate(rc2, baseline, cal);
  assert.equal(g2.decision, 'SHIP WITH CONDITIONS');
  assert.deepEqual(g2.rows.filter((r) => r.status === 'unverified').map((r) => r.c.id), ['C9']);
  assert.equal(g2.rows.find((r) => r.c.id === 'C9').corrected, null, 'no corrected rate from an untrusted judge');
  const trustedAll = Object.fromEntries(Object.entries(cal).map(([k, v]) => [k, { ...v, status: 'trusted' }]));
  assert.equal(gate(rc2, baseline, trustedAll).decision, 'SHIP');
});

test('gate: critical criterion below bar blocks, regression is flagged', () => {
  const bad = structuredClone(rc2);
  bad.results.C1 = { n: 240, pass: 200 };
  const g = gate(bad, baseline, cal);
  assert.equal(g.decision, 'NO-SHIP');
  assert.ok(g.rows.find((r) => r.c.id === 'C1').regression);
  const missing = structuredClone(rc2);
  delete missing.results.C2;
  assert.equal(gate(missing, baseline, cal).decision, 'NO-SHIP', 'missing data never passes');
});
