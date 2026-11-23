const authorityFixture=require('../scripts/routine-reset-authority-fixture.cjs');
// Actual-handler regression for the observed v68 late-generate gap.
// This is not complete reset acceptance or hosted QA.
const assert=require('node:assert/strict'),{test}=require('node:test'),fixture=require('../scripts/fqc-apply-fixture.cjs');
const date='2026-11-21',origin=authorityFixture.origin;
for(const lane of ['fqc','iqc'])for(const timing of ['after-reset','entered-before-reset'])test(lane+' late generate '+timing+' is fenced independently',async t=>{
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

 const key=lane==='fqc'?'routineFqcControl':'routineIqcControl';
 const otherKey=lane==='fqc'?'routineIqcControl':'routineFqcControl';
 const otherLane=lane==='fqc'?'iqc':'fqc';
 async function configure(scope){
   const initial=await call(scope);
   return call(scope,'',command('configure',scope==='fqc'?initial.control.revision:initial.revision,scope==='fqc'?{startDate:date,calendarVersion:2}:{start:date,scope:'routine-iqc-only',confirm:'START IQC',startAck:true,reason:'synthetic',expectedStateRevision:initial.stateRevision}));
 }
 await configure(lane);await configure(otherLane);
 await f.mutate(values=>{
   const other=JSON.parse(values[otherKey]);
   other.receipts['synthetic-other-pending-evidence']={actorId:'frank',fingerprint:'untouched',result:{documentId:'synthetic-pending'}};
   other.events=[{action:'synthetic-audit',at:'synthetic'}];
   values[otherKey]=JSON.stringify(other);
 });
 const before=await call(lane);
 const stale=command('generate',lane==='fqc'?before.control.revision:before.revision);
 const otherBefore=(await f.core.readState()).values[otherKey];
 authorityFixture.enable(f); // Synthetic capability only.
 async function reset(){
   const state=await f.core.readState();
   const request=new Request(origin+'/api/routine-reset?scope='+lane,{method:'POST',headers:{...authorityFixture.headers,origin,cookie:f.cookies.frank},body:JSON.stringify({id:crypto.randomUUID(),scope:lane,confirm:'RESET '+lane.toUpperCase(),irreversibleAck:true,reason:'isolated late request reproduction',pendingCount:0,revision:state.revision})});
   const result=await f.load('app/api/routine-reset/route.ts').POST(request);
   assert.equal(result.status,200,await result.text());
 }
 let afterReset;
 if(timing==='after-reset'){
   await reset(); afterReset=await f.core.readState();
 }else{
   // Pause the actual old request immediately before its shared-state CAS.
   f.hooks.run=async(sql)=>{
     if(!sql.startsWith('UPDATE shared_state'))return;
     delete f.hooks.run;
     await reset();afterReset=await f.core.readState();
   };
 }
 const response=await call(lane,'',stale,409);
 assert.equal(response.error,'RESET_GENERATION_CHANGED');
 const final=await f.core.readState(),control=JSON.parse(final.values[key]);
 assert(afterReset);
 assert.equal(final.revision,afterReset.revision,'old request cannot commit after reset');
 assert(!control.receipts[stale.operationId],'old operation cannot acquire a new receipt');
 assert.equal((lane==='fqc'?control:control.calendar).jobs.length,0);
 assert.equal(control.documents.length,0);
 assert.equal(final.values[otherKey],otherBefore,'other module audit and receipt are byte-identical');
 // Repeated resets never reuse the module floor. New date setup still works.
 const firstFloor=control.resetGenerationRevision;
 await reset();
 const again=JSON.parse((await f.core.readState()).values[key]);
 assert(again.resetGenerationRevision>firstFloor);
 await configure(lane);
 const fresh=await call(lane),revision=lane==='fqc'?fresh.control.revision:fresh.revision;
 await call(lane,'',command('generate',revision));
 const restarted=await f.core.readState(),next=JSON.parse(restarted.values[key]);
 assert((lane==='fqc'?next:next.calendar).jobs.length>0);
 assert.equal(restarted.values[otherKey],otherBefore);
 // Other module's previously captured revision still authorizes its own action.
 const other=JSON.parse(otherBefore);
 await call(otherLane,'',command('generate',other.revision));
});
