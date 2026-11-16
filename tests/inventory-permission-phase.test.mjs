import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),toolingFixture=require('../scripts/tooling-local-save-fixture.cjs'),{fixture:equipmentFixture}=require('../scripts/equipment-atomic-fixture.cjs'),loader=require('../scripts/fqc-bootstrap-projection-fixture.cjs');
const prior='e040a7e838133c0c9870850a49955cf045dbc02b',baseline=execFileSync('git',['show',prior+':lib/versioned-shared-workflow.ts'],{encoding:'utf8'});
const plain=x=>JSON.parse(JSON.stringify(x));
void test('inventory phases match can for each role, bind authority/header/revision, and reject wrong endpoints',async()=>{
 const f=await equipmentFixture();try{
  for(const [actor,headers]of Object.entries(f.sessions)){
   const state=await f.core.readState(),request=new Request('http://fixture/api/routine-equipment/workflow',{headers}),phase=await f.core.createInventoryPermissionPhase(request,state);
   for(const key of ['equipment.view','equipment.edit','equipment.create','equipment.delete','equipment.save','equipment.submit','equipment.withdraw','equipment.approve','equipment.return','tooling.view','approval.compare'])assert.equal(phase.allowed(key),await f.core.can(request,state,key),actor+' '+key);
   assert.equal(await phase.current(),true);state.values.processAccessControl='changed';assert.equal(phase.allowed('equipment.view'),false);assert.equal(await phase.current(),false);
  }
  for(const path of ['/api/iqc/workflow','/api/ipqc-c/workflow','/api/tooling/workflow?scope=other'])await assert.rejects(f.core.createInventoryPermissionPhase(new Request('http://fixture'+path,{headers:f.sessions.editor}),await f.core.readState()),/INVALID_PERMISSION_PHASE/);
  const state=await f.core.readState(),request=new Request('http://fixture/api/routine-equipment/workflow',{headers:f.sessions.editor}),phase=await f.core.createInventoryPermissionPhase(request,state);request.headers.set('cookie','changed');assert.equal(phase.allowed('equipment.edit'),false);assert.equal(await phase.current(),false);
 }finally{f.close();}
});
void test('tooling permission DTOs equal exact main for allowed, denied and edit-only policies',async()=>{
 const f=await toolingFixture();try{
  const old=loader(process.cwd(),f.env,{}, {'lib/versioned-shared-workflow.ts':baseline}).load('app/api/tooling/workflow/route.ts');
  for(const grants of [{view:true,edit:true,submit:false,approve:false},{view:true,edit:false,save:false},{view:false,edit:true,approve:true}]){
   await f.rights('editor',grants);const request=()=>new Request('https://synthetic.invalid/api/tooling/workflow?permissions=1',{headers:{cookie:f.cookies.editor}});
   const before=await old.GET(request()),after=await f.api.GET(request());assert.equal(after.status,before.status);assert.deepEqual(await after.json(),await before.json());
  }
 }finally{f.close();}
});
async function cycle(mode){
 const f=await toolingFixture();try{
  await f.rights('editor',{view:true,edit:true,save:true,submit:true,withdraw:true});await f.rights('other',{view:true,approve:true,return:true});
  const api=mode==='baseline'?loader(process.cwd(),f.env,{}, {'lib/versioned-shared-workflow.ts':baseline}).load('app/api/tooling/workflow/route.ts'):f.api,results=[];let sequence=0;
  async function call(action,more={},who='editor'){
   const current=await f.read(),flow=current.workflow,command=action==='begin'?{action:'begin'}:{command:{action,generation:flow.generation,operationId:randomUUID(),clientId:'inventory-probe',sequence:++sequence,expectedRevision:flow.revision,...more}},offset=f.events.length,start=performance.now();
   const response=await api.POST(new Request('https://synthetic.invalid/api/tooling/workflow?caseMetadata=1',{method:'POST',headers:{cookie:f.cookies[who],origin:'https://synthetic.invalid','Content-Type':'application/json'},body:JSON.stringify(command)})),body=await response.json();
   assert.equal(response.status,200,action+' '+JSON.stringify(body));const events=f.events.slice(offset);results.push({action,revocationReads:events.filter(e=>e.sql?.includes('FROM process_revoked_sessions')).length,archiveGets:events.filter(e=>e.kind==='get').length,casWrites:events.filter(e=>e.kind==='sql'&&e.sql.startsWith('UPDATE shared_state SET revision')).length,ms:Math.round((performance.now()-start)*100)/100});return body;
  }
  await call('begin');let c=await f.read();const path=['tools',{id:'one'},'notes'];await call('save',{moduleAction:'save-local-v1',patches:[{op:'set',path,value:'Measured synthetic change'}],guards:[{path,value:c.workflow.working.tools[0].notes}]});
  c=await f.read();await call('submit',{savedId:c.workflow.saved.id,reason:'Synthetic measured submission'});c=await f.read();await call('withdraw',{caseId:c.workflow.pendingId,reason:'Synthetic measured withdrawal'});c=await f.read();await call('submit',{savedId:c.workflow.saved.id,reason:'Synthetic measured resubmission'});c=await f.read();await call('approve',{caseId:c.workflow.pendingId,reason:'Synthetic measured approval'},'other');
  const final=await f.read();assert.equal(final.workflow.active.content.tools[0].notes,'Measured synthetic change');assert.equal(final.workflow.cases.filter(c=>c.status==='approved').length,1);assert(final.workflow.cases.some(c=>c.status==='withdrawn'));return results;
 }finally{f.close();}
}
void test('actual tooling Save/Submit/Withdraw/Resubmit/Approve retain one CAS and reduce repeated authority reads',async t=>{
 const before=await cycle('baseline'),after=await cycle('current');assert.equal(before.length,after.length);
 for(let i=0;i<before.length;i++){assert.equal(after[i].action,before[i].action);assert(after[i].revocationReads<before[i].revocationReads,after[i].action);assert.equal(after[i].casWrites,1);assert.equal(after[i].archiveGets,before[i].archiveGets,'immutable read policy unchanged');}
 t.diagnostic(JSON.stringify({fixture:'in-memory SQLite/R2; isolated Node only',before,after}));
});
void test('tooling session revoked while writing immutable records cannot commit Save or its receipt',async()=>{
 const f=await toolingFixture();try{
  await f.rights('editor',{save:true});assert.equal((await f.call({action:'begin'})).status,200);const c=await f.read(),before=f.db.prepare('SELECT * FROM shared_state WHERE id=1').get(),path=['tools',{id:'one'},'notes'];let revoked=false;
  f.hooks.put=()=>{if(!revoked){revoked=true;f.revoke();}};
  const result=await f.call({command:{action:'save',moduleAction:'save-local-v1',generation:c.workflow.generation,operationId:randomUUID(),clientId:'inventory-revoked',sequence:1,patches:[{op:'set',path,value:'Never committed'}],guards:[{path,value:c.workflow.working.tools[0].notes}]}});
  assert(revoked,JSON.stringify(result));assert.equal(result.status,401);assert.deepEqual(f.db.prepare('SELECT * FROM shared_state WHERE id=1').get(),before);assert.deepEqual(plain((await f.read()).workflow),plain(c.workflow));
 }finally{f.close();}
});
