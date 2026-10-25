import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {validateSourceMember,gitBlobId,inspectSourceBytes,parseBatch,validatePolicy,authorizeSupplementalReviews} from '../scripts/sites-ci-preflight.mjs';
const tests=[],empty={entries:[]};
function test(name,run){run();tests.push(name);}
function reviewProof(policy){return {commits:new Set(policy.supplementalReviews.map(r=>r.commit)),pairs:new Map(policy.supplementalReviews.map(r=>[r.commit,new Set(r.entries.map(item=>item.path+'\0'+item.blob))]))};}
test('program and schema metadata are source',()=>{for(const file of ['app/api/login/route.ts','drizzle/0000_schema.sql','config/sites-test.template.json'])validateSourceMember(file);});
test('private paths and held files refuse before content access',()=>{for(const file of ['.env','a/.dev.vars','database.json','data/canonical/x.json','a/snapshot.zip','scripts/u1-package.mjs','scripts/dev-package-restore.mjs','scripts/dev-package-update.mjs'])assert.throws(()=>validateSourceMember(file));});
test('escape and ambiguous paths refuse',()=>{for(const file of ['../x','/x','x//y','x\\y','a/./x'])assert.throws(()=>validateSourceMember(file));});
test('symlinks submodules and media paths refuse',()=>{for(const mode of ['120000','160000'])assert.throws(()=>validateSourceMember('a.js',mode));assert.throws(()=>validateSourceMember('public/photo.png'));});
test('binary non-UTF8 and oversized contents refuse',()=>{for(const bytes of [Buffer.from([0]),Buffer.from([255]),Buffer.alloc(5*1024*1024+1,32)])assert.throws(()=>inspectSourceBytes('test.js',bytes,empty));});
test('unreviewed credential categories refuse',()=>{
 const fixtures=['ghp_'+'X'.repeat(36),'Bearer '+'Z'.repeat(40),['-----BEGIN ','PRIVATE KEY-----'].join(''),'eyJ'+'a'.repeat(20)+'.'+'b'.repeat(20)+'.'+'c'.repeat(20),['PROCESS_SESSION_SECRET',' = "','f'.repeat(32),'"'].join('')];
 fixtures.push(['PROCESS_OWNER_BOOTSTRAP_SECRET',' = "','f'.repeat(64),'"'].join(''));
 for(const value of fixtures)assert.throws(()=>inspectSourceBytes('tests/fixture.mjs',Buffer.from(value),empty),/SOURCE_UNREVIEWED/);
});
test('inline media and workstation references refuse without exact review',()=>{
 for(const value of ['data:image/png;base64,'+'A'.repeat(100),String.fromCharCode(67)+':/'+'private/source'])assert.throws(()=>inspectSourceBytes('docs/example.md',Buffer.from(value),empty),/SOURCE_UNREVIEWED/);
});
test('real reviewed fixture blob classification is exact by bytes and path',()=>{
 const policy=validatePolicy(JSON.parse(fs.readFileSync(new URL('../config/sites-source-reviewed-blobs.json',import.meta.url))));
 const item=policy.entries.find(x=>x.path==='scripts/test-data-safety.mjs');assert.ok(item);
 const bytes=execFileSync('git',['cat-file','blob',item.blob]);assert.equal(gitBlobId(bytes),item.blob);
 assert.ok(inspectSourceBytes(item.path,bytes,policy).includes('ASSIGNED_SECRET'));
 assert.throws(()=>inspectSourceBytes('tests/other.mjs',bytes,policy),/SOURCE_UNREVIEWED/);
 assert.throws(()=>inspectSourceBytes(item.path,Buffer.concat([bytes,Buffer.from('\n// changed')]),policy),/SOURCE_UNREVIEWED/);
 // Windows working-tree line endings normalize only CRLF, not arbitrary edits.
 assert.ok(inspectSourceBytes(item.path,Buffer.from(bytes.toString().replace(/\r?\n/g,'\r\n')),policy,{working:true}).length);
});
test('invalid review policies reject broad or malformed classifications',()=>{
 for(const entry of [{path:'tests/a.js',blob:'x',categories:['ASSIGNED_SECRET']},{path:'.env',blob:'a'.repeat(40),categories:['ASSIGNED_SECRET']},{path:'tests/a.js',blob:'a'.repeat(40),categories:['ALL']}])assert.throws(()=>validatePolicy({version:1,reviewedSource:'a'.repeat(40),entries:[entry]}));
});
test('PR23 supplement admits only both fixed synthetic blobs after ancestor and exact tree proof',()=>{
 const policy=JSON.parse(fs.readFileSync(new URL('../config/sites-source-reviewed-blobs.json',import.meta.url)));
 assert.equal(policy.reviewedSource,'e3f7be2f78a07a6e4d1eaffd6dbd4bb8308d0d70');
 const review=policy.supplementalReviews[0],proof=reviewProof(policy),pairs=proof.pairs.get(review.commit);
 const authorized=authorizeSupplementalReviews(policy,proof.commits,proof.pairs);
 for(const item of review.entries){
  const bytes=execFileSync('git',['cat-file','blob',item.blob]);assert.equal(gitBlobId(bytes),item.blob);
  assert.deepEqual(inspectSourceBytes(item.path,bytes,authorized),item.categories);
  assert.throws(()=>inspectSourceBytes('tests/other.mjs',bytes,authorized),/SOURCE_UNREVIEWED/);
  assert.throws(()=>inspectSourceBytes(item.path,Buffer.concat([bytes,Buffer.from('\n// changed')]),authorized),/SOURCE_UNREVIEWED/);
  const wrongCategory={entries:authorized.entries.map(entry=>entry.path===item.path&&entry.blob===item.blob?{...entry,categories:[]}:entry)};
  assert.throws(()=>inspectSourceBytes(item.path,bytes,wrongCategory),/SOURCE_UNREVIEWED/);
 }
 assert.throws(()=>authorizeSupplementalReviews(policy,new Set([...proof.commits].filter(c=>c!==review.commit)),proof.pairs),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);
 const missingPair=new Map(proof.pairs);missingPair.set(review.commit,new Set([...pairs].slice(1)));
 assert.throws(()=>authorizeSupplementalReviews(policy,proof.commits,missingPair),/SOURCE_SUPPLEMENT_BLOB_MISMATCH/);
});
test('PR23 supplement cannot change path blob category commit or add a broad exemption',()=>{
 const policy=JSON.parse(fs.readFileSync(new URL('../config/sites-source-reviewed-blobs.json',import.meta.url)));
 for(const mutate of [p=>p.supplementalReviews[0].commit='a'.repeat(40),p=>p.supplementalReviews[0].entries[0].path='tests/other.mjs',p=>p.supplementalReviews[0].entries[0].blob='b'.repeat(40),p=>p.supplementalReviews[0].entries[0].categories=['WORKSTATION_PATH'],p=>p.supplementalReviews[0].entries[0].categories.push('INLINE_MEDIA'),p=>p.supplementalReviews[0].entries.push({...p.supplementalReviews[0].entries[0],path:'tests/*'})]){
  const modified=structuredClone(policy);mutate(modified);assert.throws(()=>validatePolicy(modified),/SOURCE_SUPPLEMENT_REVIEW_INVALID/);
 }
});
test('PR26 supplement admits only its exact historical browser fixture after ancestry and tree proof',()=>{
 const policy=JSON.parse(fs.readFileSync(new URL('../config/sites-source-reviewed-blobs.json',import.meta.url))),proof=reviewProof(policy);
 const review=policy.supplementalReviews[1];
 assert.equal(review.commit,'705e92bf53b7cd4ed9667444bcd5289679a86234');
 assert.deepEqual(review.entries,[{path:'tests/sites-delivery-browser.test.mjs',blob:'f7992a769f1e739ce60ec6887137348824a429e6',categories:['WORKSTATION_PATH']}]);
 const item=review.entries[0],bytes=execFileSync('git',['cat-file','blob',item.blob]);assert.equal(gitBlobId(bytes),item.blob);
 assert.throws(()=>inspectSourceBytes(item.path,bytes,{entries:policy.entries}),/SOURCE_UNREVIEWED_WORKSTATION_PATH/);
 const authorized=authorizeSupplementalReviews(policy,proof.commits,proof.pairs);
 assert.deepEqual(inspectSourceBytes(item.path,bytes,authorized),['WORKSTATION_PATH']);
 assert.deepEqual(inspectSourceBytes(item.path,Buffer.from(bytes.toString().replace(/\r?\n/g,'\r\n')),authorized,{working:true}),['WORKSTATION_PATH']);
 assert.throws(()=>inspectSourceBytes('tests/other.mjs',bytes,authorized),/SOURCE_UNREVIEWED_WORKSTATION_PATH/);
 assert.throws(()=>inspectSourceBytes(item.path,Buffer.concat([bytes,Buffer.from('\n// changed')]),authorized),/SOURCE_UNREVIEWED_WORKSTATION_PATH/);
 assert.throws(()=>authorizeSupplementalReviews(policy,new Set([...proof.commits].filter(c=>c!==review.commit)),proof.pairs),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);
 const wrongTree=new Map(proof.pairs);wrongTree.set(review.commit,new Set([item.path+'\0'+'a'.repeat(40)]));
 assert.throws(()=>authorizeSupplementalReviews(policy,proof.commits,wrongTree),/SOURCE_SUPPLEMENT_BLOB_MISMATCH/);
});
test('PR26 historical registration cannot broaden commit path blob or categories',()=>{
 const policy=JSON.parse(fs.readFileSync(new URL('../config/sites-source-reviewed-blobs.json',import.meta.url)));
 for(const mutate of [p=>p.supplementalReviews[1].commit='a'.repeat(40),p=>p.supplementalReviews[1].entries[0].path='tests/other.mjs',p=>p.supplementalReviews[1].entries[0].blob='b'.repeat(40),p=>p.supplementalReviews[1].entries[0].categories=['ASSIGNED_SECRET'],p=>p.supplementalReviews[1].entries[0].categories.push('INLINE_MEDIA'),p=>p.supplementalReviews[1].entries.push({...p.supplementalReviews[1].entries[0],path:'tests/*'}),p=>p.supplementalReviews.push({...p.supplementalReviews[1],commit:'c'.repeat(40)})]){
  const modified=structuredClone(policy);mutate(modified);assert.throws(()=>validatePolicy(modified),/SOURCE_SUPPLEMENT_REVIEW_INVALID/);
 }
});
test('batch framing hashes missing and extra content are checked',()=>{
 const bytes=Buffer.from('synthetic'),oid=gitBlobId(bytes),item={oid},valid=Buffer.concat([Buffer.from(oid+' blob '+bytes.length+'\n'),bytes,Buffer.from('\n')]);
 assert.deepEqual(parseBatch(valid,[item]),[bytes]);
 for(const invalid of [valid.subarray(0,-1),Buffer.concat([valid,Buffer.from('extra')]),Buffer.from(oid+' missing\n'),Buffer.from(valid.toString().replace('synthetic','different'))])assert.throws(()=>parseBatch(invalid,[item]));
});
{
 const source=fs.readFileSync(new URL('./sites-delivery-browser.test.mjs',import.meta.url),'utf8');
 assert.deepEqual(inspectSourceBytes('tests/sites-delivery-browser.test.mjs',Buffer.from(source),empty),[]);
 const begin=source.indexOf(' const bundled='),end=source.indexOf(' const origin=fixture.url.origin;');assert.ok(begin>=0&&end>begin);
 const code=source.slice(begin,end),args=['--disable-background-networking','--disable-component-update','--no-first-run'];
 for(const exists of [true,false]){
  const probes=[],options=await vm.runInNewContext('(async()=>{let browser;'+code+'return browser;})()',{fs:{existsSync:p=>(probes.push(p),exists)},chromium:{executablePath:()=>'/synthetic/bundled-browser',launch:async options=>options}});
  assert.deepEqual(probes,['/synthetic/bundled-browser']);assert.equal(options.headless,true);assert.deepEqual(JSON.parse(JSON.stringify(options.args)),args);
  if(exists){assert.equal(options.executablePath,'/synthetic/bundled-browser');assert.equal(options.channel,undefined);}else{assert.equal(options.channel,'chrome');assert.equal(options.executablePath,undefined);}
 }
 await assert.rejects(vm.runInNewContext('(async()=>{let browser;'+code+'return browser;})()',{fs:{existsSync:()=>false},chromium:{executablePath:()=>'/synthetic/bundled-browser',launch:async()=>{throw Error('BROWSER_UNAVAILABLE');}}}),/BROWSER_UNAVAILABLE/);
 tests.push('actual portable browser selector retains bundled priority channel discovery flags and hard launch failure');
}
console.log(JSON.stringify({status:'PASS_SOURCE_ONLY_CI_NEGATIVE_FIXTURES',cases:tests.length,tests,realData:false,network:false}));
