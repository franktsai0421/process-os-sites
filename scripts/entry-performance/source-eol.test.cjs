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
  // Integrated atomic Save and checked silent departure retain the three-anchor panel optimization.
  // Pin this complete inverse source; changed/duplicated anchor negatives remain mandatory.
  { name: 'panel', fixture: 'scripts/test-authoring-panel-local-unsaved.cjs', target: 'public/process/process-authoring-v3.js', boundary: 'function loader(code){', output: '{ baseline: baselineSource, candidate: candidateSource }', marker: '  // Markup helpers may reset an obsolete owner; cache only after that boundary.', baselineHash: '2ad12e4a6fc20395bc9f043be2615a1dfebc0342dfdcc1e583804ba4395e5722' },
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
  if(test.name==='panel'){
    const proof=JSON.parse(fs.readFileSync(path.join(root,'scripts/entry-performance/fixtures/authoring-departure-inverse.json'),'utf8'));
    assert.equal(lf.candidate,raw,'complete departure candidate remains unchanged');
    for(const row of proof.spans)for(const replacement of [row.candidate.replace(/\S/,'?'),'',row.candidate+row.candidate]){
      assert.throws(()=>execute(raw.replace(row.candidate,replacement)),{code:'ERR_ASSERTION'},'changed/missing/duplicate departure inverse must be rejected');checks++;
    }
  }
  if(test.name==='identity'){
    assert.equal(lf.candidate,raw,'complete FQC and IPQC-C candidate remains unchanged');
    const proof=JSON.parse(fs.readFileSync(path.join(root,'scripts/entry-performance/fixtures/identity-prefetch-reverse.json'),'utf8'));
    const at=raw.indexOf(proof.reviewedFqcRequiredTail.marker),prefix=raw.slice(0,at),tail=raw.slice(at);
    const corruptions=[
      ['missing tail',prefix],
      ['changed tail',raw.replace('const fqcRequiredAuth=','const fqcRequiredAuthChanged=')],
      ['duplicate tail',raw+tail],
      ['extra suffix',raw+'\n// unreviewed suffix\n'],
      ['changed original prefix',raw.replace("const prefix='state-records/v1/'","const prefix='state-records/v2/'")],
      ['relocated tail',tail+prefix],
      ['duplicated original inverse span',raw.replace(proof.spans[0].candidate,proof.spans[0].candidate+proof.spans[0].candidate)],
      ...[proof.ipqcCCreateMutationInverse].flatMap(row=>[
        ['changed IPQC-C create inverse',raw.replace(row.candidate,row.candidate.replace('b.consumed=true;','b.consumed=false;'))],
        ['missing IPQC-C create inverse',raw.replace(row.candidate,'')],
        ['duplicate IPQC-C create inverse',raw.replace(row.candidate,row.candidate+row.candidate)],
        ['relocated IPQC-C create inverse',row.candidate+raw.replace(row.candidate,'')],
        ['gap before FQC tail',raw.replace(row.candidate,row.candidate+'// unexpected gap\n')],
      ]),
      ...proof.fqcAggregateReadAheadInverse.spans.flatMap((row,index)=>[
        ['changed read-ahead inverse '+index,raw.replace(row.candidate,row.candidate+'// unexpected drift\n')],
        ['missing read-ahead inverse '+index,raw.replace(row.candidate,'')],
        ['duplicate read-ahead inverse '+index,raw.replace(row.candidate,row.candidate+row.candidate)],
      ]),
      ...proof.fqcAuthorityHydrationInverse.spans.flatMap((row,index)=>[
        ['changed authority inverse '+index,raw.replace(row.candidate,row.candidate+'// unexpected authority drift\n')],
        ['missing authority inverse '+index,raw.replace(row.candidate,'')],
        ['duplicate authority inverse '+index,raw.replace(row.candidate,row.candidate+row.candidate)],
      ]),
    ];
    for(const[name,source]of corruptions){assert.notEqual(source,raw,name+' mutation is effective');assert.throws(()=>execute(source),{code:'ERR_ASSERTION'},name+' must be rejected');}
    checks+=corruptions.length+1;
  }
  assert.throws(() => execute(raw.replace(test.marker, test.marker + ' changed')), { code: 'ERR_ASSERTION' }, test.name + ' changed source anchor is rejected');
  assert.throws(() => execute(raw + '\n' + raw), { code: 'ERR_ASSERTION' }, test.name + ' duplicate source anchors are rejected');
  checks += 2;
}
console.log(JSON.stringify({ status: 'PASS', checks, scope: 'Actual inverse fixture prefixes; EOL-only equivalence and changed/duplicate anchor rejection, not product runtime' }));
