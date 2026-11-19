// Historical proof only. Runtime tests must use the integrated implementation.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const contract = require('./routine-integration-source-contract.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function projectKnown(bytes, file) {
  assert(Buffer.isBuffer(bytes), 'Routine integration proof requires raw Buffer');
  const entry = Object.hasOwn(contract.files, file) && contract.files[file];
  if (!entry || hash(bytes) !== entry.current) return bytes;
  const original = execFileSync('git', ['show', contract.publicBase + ':' + file], {cwd: root});
  assert.equal(hash(original), entry.base, 'Routine integration exact public preimage');
  return original;
}
module.exports = {projectKnown};
