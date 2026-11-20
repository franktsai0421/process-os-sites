// Historical proof only. Runtime tests must use the integrated implementation.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {isUtf8} = require('node:buffer');
const contract = require('./routine-integration-source-contract.json');
const followup = require('./routine-integration-followup-source.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const git = (...args) => execFileSync('git', args, {cwd: root});

function exactCheckout(bytes, entry) {
  if (hash(bytes) === entry.current) return true;
  if (!entry.currentLf || !isUtf8(bytes)) return false;
  const text = bytes.toString('utf8');
  const lf = text.replaceAll('\r\n', '\n');
  return hash(lf) === entry.currentLf && (text === lf || text === lf.replaceAll('\n', '\r\n'));
}

// Cache only published preimages after validating the fixed digest. Repeated
// exact projections still validate every input and return independent bytes.
const preimages = new Map();
function preimage(commit, file, expected) {
  const key = commit + ':' + file;
  if (!preimages.has(key)) {
    const bytes = git('show', key);
    assert.equal(hash(bytes), expected, 'Routine integration exact public preimage');
    preimages.set(key, bytes);
  }
  return preimages.get(key);
}

function projectKnown(bytes, file) {
  assert(Buffer.isBuffer(bytes), 'Routine integration proof requires raw Buffer');
  const old = Object.hasOwn(contract.files, file) && contract.files[file];
  const next = Object.hasOwn(followup.files, file) && followup.files[file];
  if (next && exactCheckout(bytes, next)) {
    const uploaded = preimage(followup.uploaded, file, next.uploaded);
    if (old) {
      assert.equal(next.uploaded, old.current, 'Routine follow-up diverged from the uploaded pin');
      return Buffer.from(preimage(contract.publicBase, file, old.base));
    }
    return Buffer.from(uploaded);
  }
  if (!old || !exactCheckout(bytes, old)) return bytes;
  return Buffer.from(preimage(contract.publicBase, file, old.base));
}

function assertUploadedOrFollowup(bytes, file) {
  assert(Buffer.isBuffer(bytes), 'Routine integration proof requires raw Buffer');
  if (Object.hasOwn(followup.files, file)) {
    assert(exactCheckout(bytes, followup.files[file]), 'Routine follow-up reviewed bytes changed: ' + file);
  } else {
    assert.deepEqual(bytes, git('show', followup.uploaded + ':' + file), 'Uploaded product bytes changed: ' + file);
  }
}

module.exports = {projectKnown, assertUploadedOrFollowup, followup};
