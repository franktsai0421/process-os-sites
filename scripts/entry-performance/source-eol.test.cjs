/* Exercise the actual inverse-fixture prefixes against LF/CRLF and bad anchors. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => value.replace(/\r\n/g, '\n');
const cases = [
  { name: 'identity', fixture: 'scripts/entry-performance/identity-prefetch.test.cjs', target: 'lib/state-records.ts', boundary: 'const baseline=load(baselineSource),candidate=load(candidateSource);', output: '{ baseline: baselineSource, candidate: candidateSource }', marker: ' // Prefetch only adjacent selected identity aggregates, never token reads.', baselineHash: '5245f6533dc253b220b3bf2b61c298138917e8b4dcab9a4ff1210e4edf741fcc' },
  // Fixed ea235ca adds reviewed Canvas ACK admission around the unchanged three-anchor inverse optimization.
  // Pin this complete inverse source; changed/duplicated anchor negatives remain mandatory.
  { name: 'panel', fixture: 'scripts/test-authoring-panel-local-unsaved.cjs', target: 'public/process/process-authoring-v3.js', boundary: 'function loader(code){', output: '{ baseline: baselineSource, candidate: candidateSource }', marker: '  // Markup helpers may reset an obsolete owner; cache only after that boundary.', baselineHash: 'da8e3c709b0750c92305a59cdd37e9cce06684bfe3a1a7f3458520190b580a5c' },
  { name: 'incoming', fixture: 'scripts/test-process-incoming-index.cjs', target: 'lib/process-editor-integrity.ts', boundary: "const original=fs.readFileSync(loaderFile,'utf8')", output: '{ baseline: baselineCode, candidate: candidateCode }', marker: '  // Valid JSON graph rows can share one stage-local incoming lookup. Preserve', baselineHash: '80d53996faaced356241821b9d530c54a1edf5fa07ef502810e48d379c5027ba' },
];
let checks = 0;
for (const test of cases) {
  const fixture = path.join(root, test.fixture), target = path.join(root, test.target);
  const code = fs.readFileSync(fixture, 'utf8');
  assert.equal(code.split(test.boundary).length, 2, test.name + ' unique fixture prefix');
  const prefix = code.slice(0, code.indexOf(test.boundary));
  const raw = canonical(fs.readFileSync(target, 'utf8'));
  assert.equal(raw.split(test.marker).length, 2, test.name + ' unique mutation marker');
  function execute(source) {
    const requireFixture = createRequire(fixture), mod = { exports: {} };
    const readFileSync = (file, ...args) => path.resolve(String(file)) === target ? source : fs.readFileSync(file, ...args);
    const requirePort = id => id === 'node:fs' ? { ...fs, readFileSync } : requireFixture(id);
    const context = { require: requirePort, module: mod, exports: mod.exports, __dirname: path.dirname(fixture), process: { ...process, env: { ...process.env, INCOMING_TEST_ROOT: root, PANEL_TEST_ROOT: root, INCOMING_CANDIDATE: target, PANEL_CANDIDATE: target } }, console };
    vm.runInNewContext(prefix + '\nmodule.exports=' + test.output + ';', context, { filename: fixture });
    return mod.exports;
  }
  const lf = execute(raw), crlf = execute(raw.replace(/\n/g, '\r\n'));
  assert.equal(canonical(lf.baseline), canonical(crlf.baseline), test.name + ' LF/CRLF complete baseline bytes');
  assert.equal(canonical(lf.candidate), canonical(crlf.candidate), test.name + ' LF/CRLF complete candidate bytes');
  assert.equal(hash(canonical(lf.baseline)), test.baselineHash, test.name + ' reviewed complete baseline hash');
  checks += 2;
  assert.throws(() => execute(raw.replace(test.marker, test.marker + ' changed')), { code: 'ERR_ASSERTION' }, test.name + ' changed source anchor is rejected');
  assert.throws(() => execute(raw + '\n' + raw), { code: 'ERR_ASSERTION' }, test.name + ' duplicate source anchors are rejected');
  checks += 2;
}
console.log(JSON.stringify({ status: 'PASS', checks, scope: 'Actual inverse fixture prefixes; EOL-only equivalence and changed/duplicate anchor rejection, not product runtime' }));
