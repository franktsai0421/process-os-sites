import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {validateSourceMember,gitBlobId,inspectSourceBytes,parseBatch,validatePolicy} from '../scripts/sites-ci-preflight.mjs';
const tests=[],empty={entries:[]};
function test(name,run){run();tests.push(name);}
test('program and schema metadata are source',()=>{for(const file of ['app/api/login/route.ts','drizzle/0000_schema.sql','config/sites-test.template.json'])validateSourceMember(file);});
test('private paths and held files refuse before content access',()=>{for(const file of ['.env','a/.dev.vars','database.json','data/canonical/x.json','a/snapshot.zip','scripts/u1-package.mjs','scripts/dev-package-restore.mjs','scripts/dev-package-update.mjs'])assert.throws(()=>validateSourceMember(file));});
test('escape and ambiguous paths refuse',()=>{for(const file of ['../x','/x','x//y','x\\y','a/./x'])assert.throws(()=>validateSourceMember(file));});
test('symlinks submodules and media paths refuse',()=>{for(const mode of ['120000','160000'])assert.throws(()=>validateSourceMember('a.js',mode));assert.throws(()=>validateSourceMember('public/photo.png'));});
test('binary non-UTF8 and oversized contents refuse',()=>{for(const bytes of [Buffer.from([0]),Buffer.from([255]),Buffer.alloc(5*1024*1024+1,32)])assert.throws(()=>inspectSourceBytes('test.js',bytes,empty));});
test('unreviewed credential categories refuse',()=>{
 const fixtures=['ghp_'+'X'.repeat(36),'Bearer '+'Z'.repeat(40),['-----BEGIN ','PRIVATE KEY-----'].join(''),'eyJ'+'a'.repeat(20)+'.'+'b'.repeat(20)+'.'+'c'.repeat(20),['PROCESS_SESSION_SECRET',' = "','f'.repeat(32),'"'].join('')];
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
test('batch framing hashes missing and extra content are checked',()=>{
 const bytes=Buffer.from('synthetic'),oid=gitBlobId(bytes),item={oid},valid=Buffer.concat([Buffer.from(oid+' blob '+bytes.length+'\n'),bytes,Buffer.from('\n')]);
 assert.deepEqual(parseBatch(valid,[item]),[bytes]);
 for(const invalid of [valid.subarray(0,-1),Buffer.concat([valid,Buffer.from('extra')]),Buffer.from(oid+' missing\n'),Buffer.from(valid.toString().replace('synthetic','different'))])assert.throws(()=>parseBatch(invalid,[item]));
});
console.log(JSON.stringify({status:'PASS_SOURCE_ONLY_CI_NEGATIVE_FIXTURES',cases:tests.length,tests,realData:false,network:false}));
