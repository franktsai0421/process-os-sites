// Historical proof only. Runtime tests must use the integrated implementation.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {isUtf8} = require('node:buffer');
const contract = require('./routine-integration-source-contract.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function exactCheckout(bytes, entry) {
  if (hash(bytes) === entry.current) return true;
  if (!entry.currentLf || !isUtf8(bytes)) return false;
  const text = bytes.toString('utf8');
  const lf = text.replaceAll('\r\n', '\n');
  return hash(lf) === entry.currentLf && (text === lf || text === lf.replaceAll('\n', '\r\n'));
}
function projectKnown(bytes, file) {
  assert(Buffer.isBuffer(bytes), 'Routine integration proof requires raw Buffer');
  const entry = Object.hasOwn(contract.files, file) && contract.files[file];
  if (!entry || !exactCheckout(bytes, entry)) return bytes;
  const original = execFileSync('git', ['show', contract.publicBase + ':' + file], {cwd: root});
  assert.equal(hash(original), entry.base, 'Routine integration exact public preimage');
  return original;
}
module.exports = {projectKnown};
