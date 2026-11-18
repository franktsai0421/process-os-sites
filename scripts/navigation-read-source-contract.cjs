// Historical source proofs only. Restore the exact previous main bytes for
// three pinned files. No projected predecessor executes in application tests.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const contract = require('./navigation-read-source-contract.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function projectKnown(bytes, file) {
  assert(Buffer.isBuffer(bytes), 'Navigation proof requires raw Buffer');
  if (!Object.hasOwn(contract, file)) return bytes;
  const entry = contract[file];
  let prior = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
  if (hash(prior) !== entry.after) return bytes;
  for (const rule of [...entry.rules].reverse()) {
    const end = rule.offset + Buffer.byteLength(rule.after);
    assert(prior.subarray(rule.offset, end).equals(Buffer.from(rule.after)), 'Navigation successor span');
    prior = Buffer.concat([prior.subarray(0, rule.offset), Buffer.from(rule.before), prior.subarray(end)]);
  }
  assert.equal(hash(prior), entry.before, 'Navigation exact predecessor');
  return prior;
}
module.exports = {projectKnown};
