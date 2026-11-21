// Historical proof only. Runtime tests must use the integrated implementation.
const {memoizeSourceProof}=require('./source-proof-context.cjs');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {isUtf8} = require('node:buffer');
const contract = require('./routine-integration-source-contract.json');
const followup = require('./routine-integration-followup-source.json');
const parity = followup.workspaceParity;
const parityPin = file => parity && Object.hasOwn(parity.files, file) ? parity.files[file] : null;
// Two exact startup changes on the PR tree. This is a historical test inverse;
// it grants no repository, deployment or owner approval.
const startupBase = '0149cf21fd2e46e83f8eab99a8426bc8c9df6b47';
const startupBaseTree = '9fd2b6dcaa7077608833695be6f67ad41e5d8fd2';
const startupTree = 'fabbd77ef40921f2ad7450c60e5063ebc17d04bd';
const startup = Object.freeze({
  'public/process/routine-fqc.js': Object.freeze({
    blob:'a51874b45f9926737a94c6443dc26589597a6e79', length:290561,
    current:'250159f08106c57b0228219cfb39f2d647b04b97e02b40c3907a462d98ed3eea',
    get currentLf() { return this.current; },
    baseBlob:'242d9ccd86c3bb1afcf5ca2a06b71fd31ffa953c', baseLength:287832,
  }),
  'public/process/index.html': Object.freeze({
    blob:'ce00a855cb63dd90dd7c18a3fa5d823c8df41c9b', length:11807,
    current:'ae9b157708e6daaafc601468026a15a98ffa054a3f0fed12c20287633c11b888',
    get currentLf() { return this.current; },
    baseBlob:'5ce26d8fcb52c24005da0f9f0118c29fd37e6b17', baseLength:11786,
  }),
});
const startupPin = file => Object.hasOwn(startup,file) ? startup[file] : null;
function currentSourcePin(file) {
  return startupPin(file) || parityPin(file) || (Object.hasOwn(followup.files, file) ? followup.files[file] : null);
}

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
  const entry = startupPin(file);
  if (entry && exactCheckout(bytes, entry)) {
    assert.equal(git('rev-parse', startupBase + '^{tree}').toString().trim(), startupBaseTree);
    for (const [tree, blob] of [[startupTree, entry.blob], [startupBaseTree, entry.baseBlob]]) {
      assert.equal(git('ls-tree', tree, '--', file).toString().trimEnd(), '100644 blob '+blob+'\t'+file);
    }
    const candidate = preimage(startupTree, file, entry.current);
    assert.equal(candidate.length, entry.length);
    const prior = preimage(startupBase, file, parityPin(file).current);
    assert.equal(prior.length, entry.baseLength);
    return projectKnown(Buffer.from(prior), file);
  }
  const successor = parityPin(file);
  if (successor && exactCheckout(bytes, successor)) {
    assert.equal(git('rev-parse', parity.base + '^{tree}').toString().trim(), parity.tree);
    const prior = preimage(parity.base, file, successor.base);
    assert.notEqual(successor.base, successor.current, 'Parity successor requires an exact public predecessor');
    return projectKnown(Buffer.from(prior), file);
  }
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

// Raw Git attestations must fence the checkout-compatible historical inverse.
function assertRawRoutineEncoding(bytes, file, message) {
  if (!startupPin(file)) return;
  assert(Buffer.isBuffer(bytes), 'Routine integration proof requires raw Buffer');
  const raw = hash(bytes);
  const lf = hash(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n')));
  if (lf === startupPin(file)?.current) {
    assert.equal(raw, lf, message);
    assert.equal(bytes.length, startupPin(file).length, message);
    return;
  }
  if (file !== 'public/process/routine-fqc.js') return;
  const matching = [contract.files[file], followup.files[file], parityPin(file)].filter(pin => pin?.currentLf === lf);
  if (matching.length) assert(matching.some(pin => pin.current === raw), message);
}

function assertRoutineHeadBlob(bytes, file) {
  const pin = startupPin(file);
  if (!pin) return;
  assert(Buffer.isBuffer(bytes), 'Routine integration proof requires raw Buffer');
  assert.equal(bytes.length, pin.length, 'Routine attested Git blob length differs from the reviewed raw bytes');
  assert.equal(hash(bytes), pin.current, 'Routine attested Git blob differs from the reviewed raw bytes');
}

function assertUploadedOrFollowup(bytes, file) {
  assert(Buffer.isBuffer(bytes), 'Routine integration proof requires raw Buffer');
  const pin = currentSourcePin(file);
  if (pin) {
    assert(exactCheckout(bytes, pin), 'Routine follow-up reviewed bytes changed: ' + file);
  } else {
    assert.deepEqual(bytes, git('show', followup.uploaded + ':' + file), 'Uploaded product bytes changed: ' + file);
  }
}

module.exports = {projectKnown:memoizeSourceProof(projectKnown), assertRawRoutineEncoding, assertRoutineHeadBlob, assertUploadedOrFollowup, currentSourcePin, followup};
