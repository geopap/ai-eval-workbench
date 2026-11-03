// Tamper-evident audit trail. Each entry carries the SHA-256 hash of the previous
// entry, so editing or deleting any past entry breaks the chain on verification.

const GENESIS = '0'.repeat(64);

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function payload(e) {
  return JSON.stringify({ seq: e.seq, ts: e.ts, actor: e.actor, action: e.action, detail: e.detail });
}

export async function appendEntry(log, { actor, action, detail = '' }, now = new Date()) {
  const prev = log[log.length - 1];
  const entry = { seq: log.length + 1, ts: now.toISOString(), actor, action, detail, prevHash: prev ? prev.hash : GENESIS };
  entry.hash = await sha256(entry.prevHash + payload(entry));
  return [...log, entry];
}

export async function verifyChain(log) {
  let prevHash = GENESIS;
  for (const e of log) {
    if (e.prevHash !== prevHash) return { ok: false, brokenAt: e.seq, reason: 'previous-hash link does not match' };
    const expected = await sha256(e.prevHash + payload(e));
    if (expected !== e.hash) return { ok: false, brokenAt: e.seq, reason: 'entry content was modified' };
    prevHash = e.hash;
  }
  return { ok: true, entries: log.length };
}
