const authorityFixture=require('../scripts/routine-reset-authority-fixture.cjs');
const assert=require('node:assert/strict'),{test}=require('node:test'),fixture=require('../scripts/fqc-apply-fixture.cjs');
const date='2026-11-21',origin=authorityFixture.origin;
for(const lane of ['fqc','iqc'])test(lane+' matched pending settlement retains unknown truth and peer evidence',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date(date+'T01:09:00+07:00')});
 const f=await fixture();
 t.after(()=>f.close());
 await f.mutate(values=>{
  const [user]=JSON.parse(values.platformUsers);
  user.role='admin';
  Object.assign(user.accessOverrides,{'routine.view':true,'routine.edit':true,'routine.settings':true,'iqc.view':true});
  values.platformUsers=JSON.stringify([user,{...user,id:'frank'},{...user,id:'other',role:'staff'}]);values.routineFqcEnabled='1';
  const quality=JSON.parse(values.qualityMasterControl),fv=quality.libraries.fqc.versions[0],original=fv.snapshot.items[0];
  const at='2026-01-01T00:00:00+07:00';fv.createdAt=fv.updatedAt=at;
  fv.snapshot.items=['weekly','monthly','quarterly','excluded'].map((cadence,i)=>({...original,id:'fqc-'+i,productCodes:['SYN-P'],rule:i===3?{cadence:'pending_confirmation'}:{cadence:'time',timeFrequency:cadence}}));
  values.qualityMasterControl=JSON.stringify(quality);
  const snapshot={categories:[{id:'cat',nameVi:'Synthetic'}],suppliers:[],parts:[{id:'part',code:'P',nameVi:'Synthetic',categoryId:'cat',supplierIds:[],photos:[],isEnabled:true}],errors:[{id:'error',partCode:'P',code:'SYN'}],items:['week','month','quarter','fixed_count'].map((kind,i)=>({id:'iqc-'+i,partCode:'P',errorId:'error',checkNo:'SYN-'+i,nameVi:'Synthetic',isEnabled:true,frequencyRaw:'',rules:[{id:'rule-'+i,cadence:i===3?'batch':'time',kind,value:i===3?'5':''}]}))};
  snapshot.items.push({...snapshot.items[0],id:'iqc-no-frequency',rules:[]});
  values.iqcMasterControl=JSON.stringify({schemaVersion:1,versions:[{id:'iqc',status:'approved',number:1,createdAt:at,snapshot}],activeVersionId:'iqc'});
 });
 async function signOwner(){
   const req=new Request(origin+'/process/');
   f.cookies.frank=f.core.sessionCookie(req,await f.core.demoSession(req,'frank',false,1)).split(';')[0];
 }
 await signOwner();
 const command=(action,revision,fields={})=>({action,expectedRevision:revision,operationId:'parity-'+action+'-'+crypto.randomUUID(),...fields});
 async function call(lane,query='',cmd,status=200,cookie=f.cookies.frank){
  const method=cmd?'POST':'GET',route=f.load('app/api/routine-'+lane+'/route.ts');
  const r=await route[method](new Request(origin+'/api/routine-'+lane+query,{method,headers:{...authorityFixture.headers,origin,cookie,'x-process-admin-id':'frank','content-type':'application/json'},...(cmd?{body:JSON.stringify(cmd)}:{})}));
  const body=await r.json();assert.equal(r.status,status,JSON.stringify({lane,action:cmd?.action,error:body.error}));return body;
 }

 const moduleKey=lane==='fqc'?'routineFqcControl':'routineIqcControl',peerKey=lane==='fqc'?'routineIqcControl':'routineFqcControl';
 const initial=await call(lane),rev=lane==='fqc'?initial.control.revision:initial.revision;
 await call(lane,'',command('configure',rev,lane==='fqc'?{startDate:date,calendarVersion:2}:{start:date,scope:'routine-iqc-only',confirm:'START IQC',startAck:true,reason:'synthetic',expectedStateRevision:initial.stateRevision}));
 const now=await call(lane),known=command('generate',lane==='fqc'?now.control.revision:now.revision);
 await call(lane,'',known);
 const unknown='plan-'+lane+'-'+crypto.randomUUID();
 const memory=new Map([['own-known',known.operationId],['own-unknown',unknown],['peer-pending','peer-original'],['unrelated','keep']]);
 const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const c={window:{localStorage:storage,ProcessSync:{identity:{id:'frank'}}},crypto,TextEncoder,Uint8Array};
 require('node:vm').runInNewContext(require('node:fs').readFileSync('public/process/routine-reset.js','utf8'),c);
 const client=c.window.RoutineReset;
 const rows=['own-known','own-unknown'].map(key=>({key,raw:storage.getItem(key),operationId:storage.getItem(key),storage}));
 const pending=await client.markers(rows);
 authorityFixture.enable(f);
 const resetRoute=f.load('app/api/routine-reset/route.ts');
 const invoke=async(body,status=200)=>{
  const r=await resetRoute.POST(new Request(origin+'/api/routine-reset?scope='+lane,{method:'POST',headers:{...authorityFixture.headers,origin,cookie:f.cookies.frank},body:JSON.stringify(body)}));
  const value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value;
 };
 const lookup=async id=>{
  const r=await resetRoute.GET(new Request(origin+'/api/routine-reset?scope='+lane+'&operationId='+id,{headers:{...authorityFixture.headers,cookie:f.cookies.frank}}));assert.equal(r.status,200);return r.json();
 };
 const before=await f.core.readState();
 const payload={id:crypto.randomUUID(),scope:lane,confirm:'RESET '+lane.toUpperCase(),irreversibleAck:true,reason:'matched pending synthetic',pendingCount:0,revision:before.revision,pending};
 await invoke(payload);
 const receipt=await lookup(payload.id),after=await f.core.readState();
 assert.equal(after.values[peerKey],before.values[peerKey]);
 assert.deepEqual(receipt.settlements.map(s=>s.priorOutcome),['committed','unknown']);
 assert(receipt.settlements.every(s=>s.status==='superseded-by-reset'));
 const raw=JSON.parse(after.values[moduleKey]);assert.equal(raw.resetLedger.entries.length,1);
 assert.equal(raw.resetLedger.retired[unknown].outcome,'unknown');
 // Neither a wrong scope nor an older readback can clear pending markers.
 await assert.rejects(client.settle(lane==='fqc'?'iqc':'fqc','frank',receipt,()=>call(lane),rows));
 await assert.rejects(client.settle(lane,'frank',receipt,async()=>({identity:{id:'frank'},control:{resetGenerationRevision:0},resetGenerationRevision:0}),rows));
 assert.equal(memory.get('own-unknown'),unknown);
 // A reset boundary advancing during readback invalidates the response.
 await assert.rejects(client.settle(lane,'frank',receipt,async()=>{
  const next=await call(lane);storage.setItem('routine-reset-client-epoch:'+lane+':frank','newer');return next;
 },rows));
 assert.equal(memory.get('own-known'),known.operationId);
 await client.settle(lane,'frank',receipt,()=>call(lane),rows);
 assert(!memory.has('own-known')&&!memory.has('own-unknown'));
 assert.equal(memory.get('peer-pending'),'peer-original');assert.equal(memory.get('unrelated'),'keep');
 // A new request cannot reuse a settled ID even with the latest revision.
 const current=await call(lane),latest=lane==='fqc'?current.control.revision:current.revision;
 const rejected=await call(lane,'',command('generate',latest,{operationId:known.operationId}),409);
 assert.equal(rejected.error,'OPERATION_SUPERSEDED_BY_RESET');
 // Registration is another writer: it cannot resurrect a reset-retired plan ID.
 const intent=f.load('app/api/routine-plan-intent/route.ts');
 const ir=await intent.POST(new Request(origin+'/api/routine-plan-intent?scope='+lane+'&id='+unknown,{method:'POST',headers:{...authorityFixture.headers,origin,cookie:f.cookies.frank,'X-Process-Expected-Actor':'frank','content-type':'application/json'},body:JSON.stringify({action:'register',command:{}})}));
 assert.equal(ir.status,409);assert.equal((await ir.json()).error,'OPERATION_SUPERSEDED_BY_RESET');
 const retirement=f.load('app/api/routine-start-retirement/route.ts');
 const rr=await retirement.POST(new Request(origin+'/api/routine-start-retirement',{method:'POST',headers:{...authorityFixture.headers,origin,cookie:f.cookies.frank},body:JSON.stringify({action:'retire-first-start',scope:lane,operationId:unknown,expectedRevision:0,confirm:'RETIRE '+lane.toUpperCase()+' START'})}));
 assert.equal(rr.status,409);assert.equal((await rr.json()).error,'FIRST_START_STATE_CHANGED');
 const nextPayload={...payload,id:crypto.randomUUID(),revision:(await f.core.readState()).revision,pending:[]};
 await invoke(nextPayload);
 assert.deepEqual(await lookup(payload.id),receipt,'historic matched proof survives repeated reset');
 assert.equal((await invoke(payload)).replayed,true);
 assert.equal(JSON.parse((await f.core.readState()).values[moduleKey]).resetLedger.retired[unknown].outcome,'unknown');
 assert.equal((await f.core.readState()).values[peerKey],before.values[peerKey]);
});
