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
// Exact startup changes on the PR tree. This is a historical test inverse;
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
  'app/api/routine-fqc/page/route.ts': Object.freeze({
    blob:'92661b8a4c800b9411eca5cdeed50a26e11a7466', length:12816,
    current:'e8fcf073f0e85b709a8f44560fc5315860c5e220f83d1e82de162637d135e87f',
    get currentLf() { return this.current; },
    baseBlob:'bf4a0ff53b68c6dd4425bdeb419e21bef0b0af2d', baseLength:12551,
    baseHash:'ff76bcb4bf444401c8c559d6258ae683a2ef737dc9799348c99ca1219e3eaecb',
  }),
  'app/api/routine-fqc/route.ts': Object.freeze({
    blob:'b71b1a1c1cca839a3744bdca72272916608090bb', length:24214,
    current:'05cfb5539ccc8943fb5df02bd2d2e32b0237dee7613c6afd2af022668c14ec0c',
    get currentLf() { return this.current; },
    baseBlob:'0cde79c68065a3025fffdaa4dc0a0028299af8a1', baseLength:23888,
    baseHash:'3a63ad835803e92a0e26fa11170a0f0f19da1d8ef5f0da2b284fc25c8571eaf5',
  }),
  'public/process/routine-fqc-page.js': Object.freeze({
    blob:'144980f1df83a5d2beb52c74f247282062a37fa0', length:41875,
    current:'4163884c3b8d18ce11b4ce59c9e0faef58fadce324b2223d7a4c40467da04d58',
    get currentLf() { return this.current; },
    baseBlob:'e839cd2a12f5c86e0f7fcb0b72c3af9c45d6cb07', baseLength:38322,
    baseHash:'49d4477cbf543d27fdecafee88d94f7d83d11ac46cd16ff990e70168f6eb5bbb',
  }),
  'app/api/routine-iqc/route.ts': Object.freeze({
    blob:'bf72c0e30db355e317b26cce4a19948c54090880', length:7357,
    current:'3f059e26f67655d1966db258d662c8e4cfb03b21ed865eaa328289a6c76bea66',
    get currentLf() { return this.current; },
    baseBlob:'bb5e41b76deaf6ea3b8c34d9cdf0373c9d62dd90', baseLength:7257,
    baseHash:'cc6b401f063b3bc4a030584018c041aa2bff7c074ac2d146e093e9371e5a22fd',
  }),
  'lib/routine-iqc-access.ts': Object.freeze({
    blob:'3392d8160379ef1d7c7ae596961d864d3016a9b8', length:1424,
    current:'47304c35b41c7b562d2cbb47a7d0fdbf953d52371b409bcd363c88605b7b884a',
    get currentLf() { return this.current; },
    baseBlob:'e0f593a9e0d4c8337e4bc6dc3a670ce3712b4b1a', baseLength:1313,
    baseHash:'727047881880ca3cb2d869e2207922d1d269a0dbfeabb7e0a840583ee28a3a3e',
  }),
  'public/process/routine-iqc.js': Object.freeze({
    blob:'8ff0e22114e903648e89cd91cd29f2455c980173', length:110267,
    current:'d3b73f372050c49d02a7c2f4f199ec57c1bddaecde24d459cb2c8f8200b8f0e1',
    get currentLf() { return this.current; },
    baseBlob:'bc80bc8b43d6d4f10c07ef5d1a499c85f219fe6a', baseLength:109954,
    baseHash:'705063f055e571e7c23a750cce4f7ed56963a7f0fbb3885a62c158ec0bad0ef2',
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

function startupPredecessor(file, entry) {
  assert.equal(git('rev-parse', startupBase + '^{tree}').toString().trim(), startupBaseTree);
  for (const [tree, blob] of [[startupTree, entry.blob], [startupBaseTree, entry.baseBlob]]) {
    assert.equal(git('ls-tree', tree, '--', file).toString().trimEnd(), '100644 blob '+blob+'\t'+file);
  }
  const candidate = preimage(startupTree, file, entry.current);
  assert.equal(candidate.length, entry.length);
  const prior = preimage(startupBase, file, entry.baseHash || parityPin(file).current);
  assert.equal(prior.length, entry.baseLength);
  return prior;
}

// Exact test-file revisions for the startup inventory and its cache/order expectations.
const startupTestTree='902282dba25500f80a64ec6f1922ad1d0a09a5eb';
const startupTests=Object.freeze({
  'tests/source-normalization-cache.test.cjs':['ab2574cb66de26ab4e48686fdb81f48453a5bb878dcd1190e7f44911c8e97b0b','f0e3dff8e7dc164f9bd372e46977c4fa7f47c4c6','6bb917eccb0c7960a815037582db5a129f1d36a3','HEAD'],
  'tests/account-page-entry.test.cjs':['1a84ebffc05ffaa3078850cad613398dc2a8737018bcf5f531e2c26e09ecc9be','f1d319f377de927b2132090368c92681839b1d01','332cff632d00f76254f18265f11fc1f0222166b9'],
  'tests/navigation-adapters.test.mjs':['4b156c6a03ab764696fb4ff32ae0004755fb6ff7501834775629cff5a4b2c06c','7b7fadba1c03920c747c7149c6cb16438fc0aec6','f6c6a715b1131644eabbd1687575eec931d484f6'],
  'tests/accounts-process-integration-source.test.mjs':['f6a458f88af4f0049453b1596a533543584a860adacb4e70e809fd2c177f6967','ef3ce8c4bca500a84f2b43841694b43c205f5a9a','ac1cf4c6021195c02c86e8a10fae42f651276b64'],
  'tests/process-scripts-build.test.mjs':['67173b5a1531eccac8ae20924b928d5b2caba72b8bdbb76ebf03f73b2b3eaa4e','522043e278ffb538b7523887b234a1250cfb187f','fb215348fabf77ae97d9325adfc0b2e9c61b1152'],
  'tests/process-shell-bundle-oracle.mjs':['a7a019b2f37b43c19726a900352c3aa4aa71bbbc7b81488d4d614bd3c599326f','95383f55f5d9a37ec695dc877e74d317f7f868df','fcc8b164dee86c5d84cf1d64ef809b2ea1566b3d'],
  'tests/process-shell-bundle-oracle.test.mjs':['cfbb6d5f89df3b161236b13c73998d944d428e05cd2f69626be9d7908cb5e99a','88e4e67516b1db389caa1ef81b7b0d4a4376085d','2a708d1344c1e0c67c55c25af526b33db84ea255'],
  'tests/quality-shell-bundle-oracle.test.mjs':['939c277082afafcfce84afe856d282cf88e2a1fa63c8a329c0455359473fc638','9e4d2114743b8acd27bf88dda935f42a250f3484','d9f255ca3214fd6f6357d106f048474175933a1f'],
});

function startupTestPreimage(bytes,file,readChange=false) {
  if (!Object.hasOwn(startupTests,file)) return null;
  const [digest,after,before,treeOfChange=startupTestTree]=startupTests[file];
  if (!exactCheckout(bytes,{current:digest,currentLf:digest})) return null;
  for (const [tree,blob] of [[readChange&&treeOfChange==='HEAD'?startupRead.base:treeOfChange,after],[startupBaseTree,before]]) {
    assert.equal(git('ls-tree',tree,'--',file).toString().trimEnd(),'100644 blob '+blob+'\t'+file);
  }
  assert.equal(hash(git('cat-file','blob',after)),digest);
  return git('cat-file','blob',before);
}

const startupRead=require('../tests/routine-startup-read-successor.cjs');
function projectKnown(bytes, file) {
  assert(Buffer.isBuffer(bytes), 'Routine integration proof requires raw Buffer');
  const prior=startupRead.projectKnown(bytes,file);
  const previousTest=startupTestPreimage(prior,file,prior!==bytes);
  bytes=prior;
  if (previousTest) return projectKnown(previousTest,file);
  const entry = startupPin(file);
  if (entry && exactCheckout(bytes, entry)) {
    return projectKnown(Buffer.from(startupPredecessor(file, entry)), file);
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
  if (startupRead.has(file)) {
    const successor = git('cat-file', 'blob', startupRead.blobs[file][1]);
    if (lf === hash(Buffer.from(successor.toString('utf8').replaceAll('\r\n', '\n')))) {
      assert(bytes.equals(successor), message);
      return;
    }
  }
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
  if (startupRead.has(file)) {
    // A historical caller can supply the exact predecessor after its own inverse.
    // Independently fence the committed object in both cases, including rollback.
    const [before, after] = startupRead.blobs[file];
    assert.equal(pin.blob, before);
    assert.equal(git('ls-tree', 'HEAD', '--', file).toString().trimEnd(),
      '100644 blob ' + after + '\t' + file, 'Routine HEAD differs from the reviewed raw bytes');
    if (hash(bytes) !== pin.current) bytes = startupRead.predecessor(bytes, file);
  }
  assert.equal(bytes.length, pin.length, 'Routine attested Git blob length differs from the reviewed raw bytes');
  assert.equal(hash(bytes), pin.current, 'Routine attested Git blob differs from the reviewed raw bytes');
}

function assertUploadedOrFollowup(bytes, file) {
  assert(Buffer.isBuffer(bytes), 'Routine integration proof requires raw Buffer');
  const entry=startupPin(file);
  if (entry?.baseHash) {
    assert(exactCheckout(bytes,entry),'Routine startup bytes changed: '+file);
    bytes=startupPredecessor(file,entry);
  }
  const pin = entry?.baseHash ? parityPin(file) || followup.files[file] : currentSourcePin(file);
  if (pin) {
    assert(exactCheckout(bytes, pin), 'Routine follow-up reviewed bytes changed: ' + file);
  } else {
    assert.deepEqual(bytes, git('show', followup.uploaded + ':' + file), 'Uploaded product bytes changed: ' + file);
  }
}

module.exports = {projectKnown:memoizeSourceProof(projectKnown), assertRawRoutineEncoding, assertRoutineHeadBlob, assertUploadedOrFollowup, currentSourcePin, followup};
