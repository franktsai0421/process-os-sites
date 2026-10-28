import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {BASELINE_COMMIT,INPUTS,classifyInputs,compareCheckouts,gitBlob} from '../scripts/compare-lint-baseline-inputs.mjs';
const ROOT=new URL('../',import.meta.url);
const GUARD='scripts/main-push-guard.mjs';
function entry(bytes){return {sha:gitBlob(bytes),bytes};}
function fixture(){
  const base={},head={};
  for(const file of INPUTS){const bytes=execFileSync('git',['show',`HEAD:${file}`],{cwd:ROOT,stdio:['ignore','pipe','pipe']});base[file]=entry(Buffer.from(bytes));head[file]=entry(Buffer.from(bytes));}
  const h=head[GUARD].bytes.toString('utf8');
  const old=h.replace("import {pathToFileURL} from 'node:url';","import {fileURLToPath,pathToFileURL} from 'node:url';");
  base[GUARD]=entry(Buffer.from(old));
  assert.equal(base[GUARD].sha,'c476feed3be3d3b24210506135264a258797f200');
  assert.equal(head[GUARD].sha,'fc1dc7fb48fe8379aa28208e9158342119786533');
  return {baseCommit:BASELINE_COMMIT,base,head};
}
void test('recognizes only the reviewed exact blob pair and exact byte edit',()=>{assert.equal(classifyInputs(fixture()),'EQUIVALENT_REVIEWED_UNUSED_IMPORT_ONLY');});
void test('identical inputs remain explicitly byte-identical',()=>{const x=fixture();x.base=x.head;assert.equal(classifyInputs(x),'BYTE_IDENTICAL');});
void test('different baseline commit is not comparable',()=>{const x=fixture();x.baseCommit='0'.repeat(40);assert.throws(()=>classifyInputs(x),/NOT_COMPARABLE/);});
for(const file of INPUTS.filter(x=>x!==GUARD))void test(`changed input stays blocking: ${file}`,()=>{const x=fixture();x.head[file]=entry(Buffer.concat([x.head[file].bytes,Buffer.from('\n')]));assert.throws(()=>classifyInputs(x),/NOT_COMPARABLE/);});
void test('guard-body change cannot use the import classification',()=>{const x=fixture();x.head[GUARD]=entry(Buffer.concat([x.head[GUARD].bytes,Buffer.from('\nthrow new Error("changed");\n')]));assert.throws(()=>classifyInputs(x),/NOT_COMPARABLE/);});
void test('different base guard is blocking',()=>{const x=fixture();x.base[GUARD]=entry(Buffer.concat([x.base[GUARD].bytes,Buffer.from('\n')]));assert.throws(()=>classifyInputs(x),/NOT_COMPARABLE/);});
void test('reverse direction is not the reviewed pair',()=>{const x=fixture();[x.base,x.head]=[x.head,x.base];assert.throws(()=>classifyInputs(x),/NOT_COMPARABLE/);});
void test('claimed exact hashes cannot hide different bytes',()=>{const x=fixture();x.head[GUARD].bytes=Buffer.concat([x.head[GUARD].bytes,Buffer.from('\n')]);assert.throws(()=>classifyInputs(x),/NOT_COMPARABLE/);});
void test('missing base or head input remains blocking',()=>{for(const side of ['base','head']){const x=fixture();delete x[side][GUARD];assert.throws(()=>classifyInputs(x),/NOT_COMPARABLE/);}});
void test('checkout read failure is blocking and does not expose git stderr',()=>{assert.throws(()=>compareCheckouts(new URL('./missing-fixture-directory',import.meta.url),ROOT),/^Error: BASELINE_INPUTS_NOT_COMPARABLE baseline-commit$/);});
