import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

// Reuse the existing authority-recovery ports with the actual current
// controller. Only the advisory transport/timers are delayed by these tests.
const fixtureFile=path.resolve('scripts/test-authoring-begin-recovery.cjs');
let prefix=fs.readFileSync(fixtureFile,'utf8').split('(async()=>{')[0];
assert(prefix.includes('function fixture(known=false)'));
const marker='host.__beginTest={action,retryBeginAuthority,error:()=>loadError};';
assert.equal(prefix.split(marker).length,2);
prefix=prefix.replace(marker,'host.__beginTest={action,retryBeginAuthority,error:()=>loadError,busy:()=>busy,inspectionFailed,inspectionRun:()=>inspectionRun};');
const fixtureModule={exports:{}};
vm.runInNewContext(prefix+'\nmodule.exports={fixture};',{module:fixtureModule,exports:fixtureModule.exports,require:createRequire(fixtureFile),__dirname:path.dirname(fixtureFile),console,structuredClone,queueMicrotask,URL,Error},{filename:fixtureFile});
const {fixture}=fixtureModule.exports;
const drain=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function setup(known=true){
  const f=fixture(known);if(known)await f.load();
  const advisory=deferred(),timers=new Map(),paints=[];let next=0,inspections=0;
  f.c.render=()=>paints.push('render');
  f.c.setTimeout=run=>{timers.set(++next,run);return next;};
  f.c.clearTimeout=id=>timers.delete(id);
  f.client.contentIssues=()=>{inspections++;return advisory.promise;};
  return{...f,advisory,timers,paints,inspections:()=>inspections,
    async startInspection(){for(const [id,run]of timers){timers.delete(id);run();}await drain();},
    answerInspection(){advisory.resolve({generation:f.ack.control.workflow.generation,revision:f.ack.control.workflow.revision,working:{checked:true,id:null,issues:[]},saved:{checked:false,id:null,issues:[]},review:null});},
  };
}

void test('successful Begin becomes editable after ACK and paint while advisory remains pending',async()=>{
  const f=await setup();let done=false;const begin=f.begin().then(()=>{done=true;});
  await drain();assert(done,'Begin must not wait for advisory validation');
  assert.equal(f.c.__beginTest.busy(),false);assert(f.canEdit());assert.equal(f.counts.begin,1);assert.equal(f.counts.permissions,0);assert.equal(f.counts.read,1);
  assert.deepEqual(f.paints,['render']);assert.equal(f.inspections(),0);
  await f.startInspection();assert.equal(f.inspections(),1);assert.equal(f.c.__beginTest.inspectionRun().phase,'pending');
  f.answerInspection();await drain();await begin;assert.deepEqual(f.paints,['render']);
});

void test('unknown authority still waits for a fresh permission response before Begin completes',async()=>{
  const f=await setup(false),release=f.hold();let done=false;const begin=f.begin().then(()=>{done=true;});
  await f.waitPermission();assert.equal(done,false);assert.equal(f.canEdit(),false);assert.equal(f.paints.length,0);assert.equal(f.inspections(),0);
  release();await drain();assert(done);assert(f.canEdit());assert.equal(f.counts.begin,1);assert.equal(f.counts.permissions,1);assert.deepEqual(f.paints,['render']);
  await f.startInspection();f.answerInspection();await drain();await begin;
});

void test('advisory failure preserves acknowledged draft and editability, with visible inspection failure state',async()=>{
  const f=await setup();await f.begin();const flow=f.c.ProcessAuthoringV3.flow();
  await f.startInspection();f.advisory.reject(Error('CONTENT_ISSUES_LOAD_FAILED'));await drain();
  assert(f.c.__beginTest.inspectionFailed());assert.equal(f.c.ProcessAuthoringV3.flow(),flow);assert(f.canEdit());assert.equal(f.c.__beginTest.busy(),false);assert.equal(f.counts.begin,1);assert.deepEqual(f.paints,['render']);
});

void test('late advisory from Begin cannot apply after the delivery changes',async()=>{
  const f=await setup();await f.begin();await f.startInspection();f.invalidate();f.answerInspection();await drain();
  assert.equal(f.c.__beginTest.inspectionFailed(),false);assert.equal(f.paints.length,1);assert.equal(f.counts.begin,1);
});

void test('failed authority retains the read-only draft and does not schedule an advisory success path',async()=>{
  const f=await setup(false);f.setResult(Error('AUTHORITY_READ_FAILED'));await f.begin();
  assert.equal(f.canEdit(),false);assert.equal(f.c.__beginTest.error(),'AUTHORITY_READ_FAILED');assert.equal(f.paints.length,0);assert.equal(f.timers.size,0);assert.equal(f.inspections(),0);assert.equal(f.counts.begin,1);
});
