/* Actual handlers, in-memory SQLite/R2, no network or real account data. */
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const fixture=require('../scripts/fqc-apply-fixture.cjs');
const {base,loadAt,snap,restore}=require('../scripts/quality-operation-speed-fixture.cjs');
async function setup(size=100){
 const f=await fixture();await f.mutate(values=>{
  const users=JSON.parse(values.platformUsers);for(const user of users)for(const op of ['view','edit','create','save','submit','withdraw','approve','return','history','delete'])user.accessOverrides['iqc.'+op]=true;values.platformUsers=JSON.stringify(users);
  const snapshot={categories:[{id:'c',nameVi:'Category'}],suppliers:[],parts:Array.from({length:size},(_,i)=>({id:'p'+i,code:'P'+i,nameVi:'Part '+i,categoryId:'c',supplierIds:[],photos:[]})),errors:[],items:[]};
  values.iqcMasterControl=JSON.stringify({schemaVersion:1,activeVersionId:'a',versions:[{id:'a',number:1,status:'approved',snapshot,revision:1,history:[]}],issues:[],reservedErrorCodes:[],reservedCheckNos:[]});
  for(let i=0;i<20;i++)values['unrelated-'+i]=JSON.stringify({id:i,working:{text:'synthetic'.repeat(1000)}});
 });return f;
}
async function call(load,f,command,query='?caseMetadata=1&compact=1',actor='editor'){
 const response=await load('app/api/iqc/workflow/route.ts')[command?'POST':'GET'](new Request('https://synthetic.invalid/api/iqc/workflow'+query,{method:command?'POST':'GET',headers:{cookie:f.cookies[actor],origin:'https://synthetic.invalid','Content-Type':'application/json'},...(command?{body:JSON.stringify(command)}:{})}));
 return{status:response.status,body:JSON.parse(JSON.stringify(load('lib/workflow-wire.ts').expandWorkflowPayload(await response.json())))};
}
void test('IQC paired actual Save/Submit/Withdraw/Resubmit/Approve preserve exact DTO and persisted bytes',async t=>{
 const f=await setup(Number(process.env.QUALITY_FIXTURE_PARTS||100));t.after(()=>f.close());
 assert.equal((await call(f.load,f,{action:'begin'})).status,200);
 let seq=0;const report=[],delay=Number(process.env.QUALITY_FIXTURE_DELAY_MS||0);
 const get=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE),prepare=f.env.DB.prepare.bind(f.env.DB);let counts={};
 const reset=()=>{counts={gets:0,bytes:0,revocation:0,cas:0};};reset();
 f.env.STATE_ARCHIVE.get=async key=>{counts.gets++;if(delay)await new Promise(r=>setTimeout(r,delay));const obj=await get(key);return obj&&{...obj,text:async()=>{const raw=await obj.text();counts.bytes+=Buffer.byteLength(raw);return raw;}};};
 f.env.DB.prepare=sql=>{const s=prepare(sql);if(sql.includes('FROM process_revoked_sessions')){const first=s.first.bind(s);s.first=async()=>{counts.revocation++;if(delay)await new Promise(r=>setTimeout(r,delay));return first();};}if(sql.startsWith('UPDATE shared_state')){const run=s.run.bind(s);s.run=async()=>{counts.cas++;return run();};}return s;};
 for(const action of ['save','submit','withdraw','submit','approve']){
  const current=(await call(f.load,f)).body,flow=current.control.workflow,path=['parts',{id:'p0'},'nameVi'];
  const command={action,operationId:randomUUID(),clientId:'quality-paired',sequence:++seq,generation:flow.generation,expectedRevision:flow.revision,reason:'Synthetic',...(action==='save'?{moduleAction:'save-local-v1',patches:[{op:'set',path,value:'Changed'}],guards:[{path,value:'Part 0'}]}:{}),...(action==='submit'?{savedId:flow.saved.id}:{}),...(['withdraw','approve'].includes(action)?{caseId:flow.pendingId}:{} )};
  const before=snap(f),instant=Date.now(),rows=[];let expected,expectedState;
  for(const old of [true,false]){
   restore(f,before);const load=loadAt(f.env,old,instant);load('app/api/iqc/workflow/route.ts');reset();const started=performance.now();
   const result=await call(load,f,{command},undefined,action==='approve'?'other':'editor');const ms=performance.now()-started;assert.equal(result.status,200,JSON.stringify(result));assert.equal(counts.cas,1);
   const state=snap(f).row;if(old){expected=result;expectedState=state;}else{assert.deepEqual(result,expected);assert.deepEqual(state,expectedState);}rows.push({source:old?base:'candidate',ms,...counts});
  }
  assert(rows[1].revocation<rows[0].revocation);assert.equal(rows[1].gets,rows[0].gets);assert.equal(rows[1].bytes,rows[0].bytes);report.push({action,...(action==='submit'?{round:seq}:{}),measurements:rows});
  const row=snap(f).row;const receipt=await call(f.load,f,undefined,'?operationId='+command.operationId,action==='approve'?'other':'editor');assert.equal(receipt.status,200);assert.deepEqual(receipt.body.receipt,expected.body.receipt);assert.deepEqual(snap(f).row,row);
 }
 t.diagnostic(JSON.stringify({method:'same snapshot and command, fixed clock/UUID, handler preloaded, complete JSON consumed; synthetic delay per GET and revocation query',parts:Number(process.env.QUALITY_FIXTURE_PARTS||100),delayMs:delay,report}));
});
void test('IQC phase binds selected state and credentials; every existing cell equals can()',async t=>{
 const f=await setup();t.after(()=>f.close());const {accessKeys}=require('../public/process/access-policy.mjs');
 for(const actor of ['editor','other']){
  const state=await f.core.readState(),request=new Request('https://synthetic.invalid/api/iqc/workflow',{headers:{cookie:f.cookies[actor]}}),phase=await f.core.createIqcPermissionPhase(request,state);
  for(const key of accessKeys)assert.equal(phase.allowed(key),await f.core.can(request,state,key),key);assert.equal(await phase.current(),true);
  state.values.processAccessControl='changed';assert.equal(phase.allowed('iqc.view'),false);assert.equal(await phase.current(),false);
 }
 for(const path of ['/api/fqc/workflow','/api/iqc/workflow?scope=other'])await assert.rejects(f.core.createIqcPermissionPhase(new Request('https://synthetic.invalid'+path),await f.core.readState()),/INVALID_PERMISSION_PHASE/);
 const request=new Request('https://synthetic.invalid/api/iqc/workflow',{headers:{cookie:f.cookies.editor}}),phase=await f.core.createIqcPermissionPhase(request,await f.core.readState());request.headers.set('cookie','changed');assert.equal(await phase.current(),false);
});
void test('IQC revocation during immutable encoding denies CAS and receipt',async t=>{
 const f=await setup();t.after(()=>f.close());await call(f.load,f,{action:'begin'});const flow=(await call(f.load,f)).body.control.workflow,before=snap(f).row,path=['parts',{id:'p0'},'nameVi'];let revoked=false;
 f.hooks.put=()=>{if(!revoked){revoked=true;f.revoke();}};
 const result=await call(f.load,f,{command:{action:'save',moduleAction:'save-local-v1',operationId:randomUUID(),clientId:'revoked-fixture',sequence:1,generation:flow.generation,patches:[{op:'set',path,value:'Never committed'}],guards:[{path,value:'Part 0'}]}});
 assert(revoked);assert.equal(result.status,401);assert.deepEqual(snap(f).row,before);
});
