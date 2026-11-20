// Historical source proofs only. Restore the exact previous main bytes for
// the pinned files. No projected predecessor executes in application tests.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const contract = require('./navigation-read-source-contract.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function projectKnown(bytes, file) {
  assert(Buffer.isBuffer(bytes), 'Navigation proof requires raw Buffer');
  bytes = require('./routine-integration-source-contract.cjs').projectKnown(bytes, file);
  if (!Object.hasOwn(contract, file)) return bytes;
  const entry = contract[file];
  let prior = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
  if (hash(prior) !== entry.after) return bytes;
  for (const rule of [...entry.rules].reverse()) {
    const end = rule.offset + Buffer.byteLength(rule.after);
    assert(prior.subarray(rule.offset, end).equals(Buffer.from(rule.after)), 'Navigation successor span');
    prior = Buffer.concat([prior.subarray(0, rule.offset), Buffer.from(rule.before), prior.subarray(end)]);
  }
  if (entry.beforeCRLFRanges) {
    const lines = prior.toString('utf8').split('\n');
    for (const [start, end] of entry.beforeCRLFRanges)
      for (let i = start; i < end; i++) lines[i] += '\r';
    prior = Buffer.from(lines.join('\n'));
  }
  assert.equal(hash(prior), entry.before, 'Navigation exact predecessor');
  return prior;
}
module.exports = {projectKnown};
