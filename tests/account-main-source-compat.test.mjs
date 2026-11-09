// Run unchanged main assertions against actual source modules in this checkout.
// This only replaces the dependency-based test loader with the established native
// source fixture. No build, relocation, dependencies, network or live storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {workerSource} from './helpers/native-worker-source.mjs';
const require=createRequire(import.meta.url);
const allowedFixtures=new Set(['tests/process-stage-catalog.test.cjs','scripts/test-master-line-draft.cjs','scripts/test-master-stage-link-v3.cjs']);
async function fixture(file,storage='inline'){
 assert(allowedFixtures.has(file));assert(['inline','records'].includes(storage));
 const code=fs.readFileSync(file,'utf8'),env={},source=workerSource(env),modules=new Map();
 const imports=new Set([...code.matchAll(/\bload\(['"]((?:lib|app\/api)\/[^'"]+\.ts)['"]\)/g)].map(match=>match[1]));
 assert(imports.size>0);for(const name of imports)modules.set(name,await source.load(name));
 const output=[],errors=[],processPort={env:{V3_STORAGE:storage},exitCode:0};
 if(file.endsWith('test-master-stage-link-v3.cjs'))assert(code.includes("new DatabaseSync(':memory:')"));
 const context={Request,Response,Headers,URL,URLSearchParams,Buffer,crypto:webcrypto,structuredClone,process:processPort,console:{log(value){output.push(String(value));},error(error){errors.push(error?.message||String(error));}},require(id){
  if(id==='../scripts/ipqc-ab-import-harness.cjs'||id==='./ipqc-ab-import-harness.cjs')return(binding={})=>{Object.assign(env,binding);return name=>{assert(modules.has(name),'Unprepared source import: '+name);return modules.get(name);};};
  assert(['node:test','node:assert/strict','node:crypto','node:sqlite'].includes(id),'Unexpected fixture dependency: '+id);return require(id);
 }};
 // Keep test literals and Response.json() in Node's normal realm, as in the
 // original CJS runner; production modules remain in the isolated Worker realm.
 const names=Object.keys(context),run=vm.compileFunction('return eval(fixtureCode);',['fixtureCode',...names],{filename:new URL('../'+file,import.meta.url).pathname});
 await run(code,...names.map(name=>context[name]));
 assert.equal(processPort.exitCode,0,errors.join('\n'));assert.deepEqual(errors,[]);
 const summary=output.filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).at(-1);
 return{summary,groups:output.filter(line=>line.startsWith('PASS ')).length};
}
// Registers the original 20 node:test cases; assertion text is never transformed.
await fixture('tests/process-stage-catalog.test.cjs');
void test('merged main retains all 42 independent-line reducer groups with account kernel changes',async()=>{
 const result=await fixture('scripts/test-master-line-draft.cjs');assert.equal(result.summary.status,'PASS');assert.equal(result.summary.groups,42);assert.equal(result.groups,42);assert.equal(result.summary.activationAvailable,false);
});
for(const storage of ['inline','records'])void test('merged main retains 13 stage-link actual API groups with account changes: '+storage,async()=>{
 const result=await fixture('scripts/test-master-stage-link-v3.cjs',storage);assert.equal(result.summary.result,'PASS_ISOLATED');assert.equal(result.summary.checks,13);assert.equal(result.groups,13);assert.equal(result.summary.realLocalWrites,0);assert.equal(result.summary.browser,'NOT_EXECUTED');
});
