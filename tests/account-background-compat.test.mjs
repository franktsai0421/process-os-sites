// Exact #100 preservation plus current-runtime no-poll checks; no build or AST substitute.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),proof=require('../scripts/account-background-check-source-contract.cjs'),unified=require('../scripts/unified-draft-source-contract.cjs'),{canonicalCheckout}=require('../scripts/routine-fqc-source-contract.cjs');
const main='9fbba823090f03da8385c8d92f5e59293d19d2f1',show=file=>execFileSync('git',['show',main+':'+file]),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const checkout=file=>unified.project(canonicalCheckout(fs.readFileSync(file),execFileSync('git',['show','HEAD:'+file])),file,'account_preparation');
const accountPredecessor=file=>file.startsWith('public/')?checkout(file):execFileSync('git',['show','ea5811141f308a615a78b6c763b124f1612fad47:'+file]);
void test('combined source preserves exact account predecessor and its #100 no-poll lineage',()=>{
 for(const file of ['public/process/shared-draft-client.js','public/process/process-authoring-v3.js','public/process/process-ipqc.js','public/process/effective-version-notice.js','scripts/browser-timer-inventory.mjs','tests/fixtures/browser-timer-inventory.json'])assert.deepEqual(accountPredecessor(file),show(file),file);
});
void test('index inverse retains every #100 rule and predecessor, adding only known account cache-version changes',()=>{
 const previous=JSON.parse(show('scripts/background-check-source-contracts.json')),index='public/process/index.html';
 for(const old of previous){const current=proof.contracts.find(c=>c.file===old.file);if(old.file!==index){assert.deepEqual(current,old);continue;}
  assert.equal(current.beforeHash,old.beforeHash);assert.deepEqual(current.rules.slice(0,old.rules.length),old.rules);assert(current.rules.length>old.rules.length);
  const extra=current.rules.slice(old.rules.length),strip=text=>text.replace(/\?v=[^"']+/g,'?v=VERSION');let restored=checkout(index);
  for(const {offset,before,after}of [...extra].reverse()){assert.equal(strip(before),strip(after),'Only asset versions may differ');assert.deepEqual(restored.subarray(offset,offset+Buffer.byteLength(after)),Buffer.from(after));restored=Buffer.concat([restored.subarray(0,offset),Buffer.from(before),restored.subarray(offset+Buffer.byteLength(after))]);}
  assert.equal(hash(restored),old.afterHash);assert.deepEqual(restored,show(index));
 }
 const current=checkout(index),before=execFileSync('git',['show','d4ac309fe05c89288af226b52c18161865ccdcb8:'+index]);assert.deepEqual(proof.restorePredecessor(current,index),before);
 for(const changed of [Buffer.concat([current,Buffer.from(' ')]),current.subarray(1),show(index)])assert.throws(()=>proof.restorePredecessor(changed,index),/pinned bytes/);
});
void test('actual inert foreground facade stays idle through scheduling, focus and visibility changes',()=>{
 const source=fs.readFileSync('public/process/shared-draft-client.js','utf8'),start=source.indexOf('  window.createForegroundPoll ='),end=source.indexOf('  // Local Begin feedback only:',start);assert(start>=0&&end>start);
 let timers=0,listeners=0,calls=0;const context={window:{addEventListener(){listeners++;}},document:{visibilityState:'visible',hasFocus:()=>true,addEventListener(){listeners++;}},setTimeout(){timers++;},setInterval(){timers++;}};vm.createContext(context);vm.runInContext(source.slice(start,end),context);const scheduler=context.window.createForegroundPoll();for(let i=0;i<100;i++){scheduler.schedule(()=>calls++);scheduler.cancel();context.document.visibilityState=i%2?'visible':'hidden';}scheduler.dispose();scheduler.schedule(()=>calls++);assert.equal(timers,0);assert.equal(listeners,0);assert.equal(calls,0);
});

void test('Windows checkout EOL can canonicalize to exact committed source; content drift still rejects',()=>{
 const file='public/process/index.html',committed=execFileSync('git',['show','HEAD:'+file]),windows=Buffer.from(committed.toString().replace(/\r?\n/g,'\r\n'));assert.deepEqual(canonicalCheckout(windows,committed),committed);assert.throws(()=>canonicalCheckout(Buffer.concat([windows,Buffer.from(' ')]),committed),/checkout differs/);assert.deepEqual(proof.restorePredecessor(unified.project(canonicalCheckout(windows,committed),file,'account_preparation'),file),execFileSync('git',['show','d4ac309fe05c89288af226b52c18161865ccdcb8:'+file]));
});
