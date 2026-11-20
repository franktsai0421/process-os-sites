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
function currentSourcePin(file) {
  return parityPin(file) || (Object.hasOwn(followup.files, file) ? followup.files[file] : null);
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
  if (file !== 'public/process/routine-fqc.js') return;
  assert(Buffer.isBuffer(bytes), 'Routine integration proof requires raw Buffer');
  const raw = hash(bytes);
  const lf = hash(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n')));
  const matching = [contract.files[file], followup.files[file], parityPin(file)].filter(pin => pin?.currentLf === lf);
  if (matching.length) assert(matching.some(pin => pin.current === raw), message);
}

function assertRoutineHeadBlob(bytes, file) {
  if (file === 'public/process/routine-fqc.js')
    assert.equal(hash(bytes), currentSourcePin(file).current, 'Routine attested Git blob differs from the reviewed raw bytes');
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
