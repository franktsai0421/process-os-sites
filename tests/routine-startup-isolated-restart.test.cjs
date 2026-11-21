const assert=require('node:assert/strict'),{test}=require('node:test'),fixture=require('../scripts/fqc-apply-fixture.cjs');
const date='2026-11-21',origin='https://synthetic.invalid';
for(const start of [date,'2026-11-23'])void test('same pristine fixture for FQC and IQC, start '+start,async t=>{
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
  values.iqcMasterControl=JSON.stringify({schemaVersion:1,versions:[{id:'iqc',status:'approved',number:1,createdAt:at,snapshot}],activeVersionId:'iqc'});
 });
 async function signOwner(){
   const req=new Request(origin+'/process/');
   f.cookies.frank=f.core.sessionCookie(req,await f.core.demoSession(req,'frank',false,1)).split(';')[0];
 }
 await signOwner();
 const saved=()=>f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
 const command=(action,revision,fields={})=>({action,expectedRevision:revision,operationId:'parity-'+action+'-'+crypto.randomUUID(),...fields});
 async function call(lane,query='',cmd,status=200,cookie=f.cookies.frank){
  const method=cmd?'POST':'GET',route=f.load('app/api/routine-'+lane+'/route.ts');
  const r=await route[method](new Request(origin+'/api/routine-'+lane+query,{method,headers:{origin,cookie,'x-process-admin-id':'frank','content-type':'application/json'},...(cmd?{body:JSON.stringify(cmd)}:{})}));
  const body=await r.json();assert.equal(r.status,status,JSON.stringify({lane,action:cmd?.action,error:body.error}));return body;
 }
 let before=saved();
 const masterRefs=state=>Object.fromEntries(Object.entries(JSON.parse(state.values).__processRecords.values).filter(([key])=>!['routineFqcControl','routineIqcControl'].includes(key)));
 const sourceBefore=masterRefs(before);
 for(const lane of ['fqc','iqc']){
   for(const cookie of [f.cookies.editor,f.cookies.other,'']){
     const denied=cookie?403:401;
     if(cookie)assert.equal((await call(lane,'',undefined,200,cookie)).permissions.settings,false);
     await call(lane,'',command('configure',0,lane==='fqc'?{startDate:start,calendarVersion:2}:{start,scope:'routine-iqc-only',confirm:'START IQC',startAck:true,reason:'synthetic',expectedStateRevision:before.revision}),denied,cookie);
     assert.deepEqual(saved(),before);
   }
 }
 const a=await call('fqc'),b=await call('iqc');
 assert(!a.control.startDate&&!b.startDate);assert.deepEqual([a.control.jobs.length,b.jobs.length],[0,0]);assert.deepEqual(saved(),before);
 const p=await call('fqc','?preview=1&calendar=2&start='+start);assert.equal(p.jobs.length,3);assert.equal(p.unresolved.length,1);assert.deepEqual(saved(),before);
 const ar=await call('fqc','',command('configure',a.control.revision,{startDate:start,calendarVersion:2}));
 const ad=await call('fqc','',command('generate',ar.revision));
 const fresh=await call('iqc');
 const br=await call('iqc','',command('configure',fresh.revision,{scope:'routine-iqc-only',start,reason:'TEST ONLY start',confirm:'START IQC',startAck:true,expectedStateRevision:fresh.stateRevision}));
 const bd=await call('iqc','',command('generate',br.revision));
 if(start!==date){
   assert.deepEqual([(await call('fqc')).control.jobs.length,(await call('iqc')).jobs.length],[0,0]);
   assert.equal((await call('iqc')).scheduleDue,false);
   t.mock.timers.setTime(new Date(start+'T00:00:01+07:00').getTime());
   await signOwner();
   assert.equal((await call('iqc')).scheduleDue,true);
   await call('fqc','',command('generate',ad.revision));await call('iqc','',command('generate',bd.revision));
 }
 const fqc=(await call('fqc')).control,iqc=await call('iqc');
 assert.equal(fqc.startDate,start);assert.equal(iqc.startDate,start);
 const byPeriod=(a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]);
 const periods=list=>list.map(j=>[j.start,j.end]).sort(byPeriod);
 const expected=[[start===date?'2026-11-16':'2026-11-23',start===date?'2026-11-22':'2026-11-29'],['2026-11-01','2026-11-30'],['2026-10-01','2026-12-31']].sort(byPeriod);
 for(const jobs of [p.jobs,fqc.jobs,iqc.jobs])assert.deepEqual(periods(jobs),expected);
 before=saved();
 assert.deepEqual(masterRefs(before),sourceBefore);
 await call('fqc','',command('admin-reset',fqc.revision),422);
 await call('iqc','',command('admin-reset',iqc.revision),422);
 assert.deepEqual(saved(),before);
 const reset=f.load('app/api/routine-reset/route.ts').POST;
 assert.equal(f.db.prepare('PRAGMA database_list').all()[0].file, '');
 const restartDate=start===date?'2026-11-20':'2026-11-24';
 if(start!==date)t.mock.timers.setTime(new Date(restartDate+'T00:00:01+07:00').getTime());
 await signOwner();
 for (const lane of ['fqc', 'iqc']) {
   const key=lane==='fqc'?'routineFqcControl':'routineIqcControl';
   const photoKey='routine-'+lane+'/photos/original-synthetic';
   const originalPhoto=Buffer.from('synthetic-photo-reference');
   f.objects.set(photoKey,originalPhoto);
   // Stored records exercise removal of the entire routine control, including its review history.
   await f.mutate(values=>{
     const stored=JSON.parse(values[key]);
     stored.documents=['plan','report','retest-plan','retest-report','disposition','waiver'].map((kind,i)=>({
       id:'synthetic-'+kind,kind,flow:{pendingId:i===0?'pending-plan':null,active:{id:null},cases:
         ['approved','returned','withdrawn',...(i===0?['pending']:[])].map(status=>({id:status+'-'+kind,status}))}
     }));
     stored.cases=['fail','abnormal'].map(result=>({id:'synthetic-'+result,result,events:[{action:'approved'}]}));
     values[key]=JSON.stringify(stored);
   });
   assert.equal((await call(lane,'?pending-count=1')).pendingCount,1);
   const other = lane === 'fqc' ? 'routineIqcControl' : 'routineFqcControl';
   const state = await f.core.readState();
   const otherBefore = state.values[other];
   const body={id:crypto.randomUUID(),scope:lane,confirm:'RESET '+lane.toUpperCase(),irreversibleAck:true,
     reason:'Disposable restart test',pendingCount:1,revision:saved().revision};
   const request=(payload,cookie=f.cookies.frank)=>reset(new Request(origin+'/api/routine-reset?scope='+lane,
     {method:'POST',headers:{origin,cookie},body:JSON.stringify(payload)}));
   const beforeReset=saved();
   delete f.env.ROUTINE_RESET_DEDICATED_TEST_DB;
   assert.equal((await request(body)).status,403);
   f.env.ROUTINE_RESET_DEDICATED_TEST_DB={};
   assert.equal((await request(body)).status,403);
   f.env.ROUTINE_RESET_DEDICATED_TEST_DB=f.env.DB;
   assert.deepEqual(saved(),beforeReset);
   assert.equal((await request({...body,scope:'other'})).status,422);
   assert.equal((await request({...body,pendingCount:0})).status,409);
   assert.equal((await request({...body,revision:body.revision-1})).status,409);
   for(const cookie of [f.cookies.editor,f.cookies.other,''])assert.equal((await request(body,cookie)).status,403);
   assert.deepEqual(saved(),beforeReset);
   const {canvasDOM}=await import('../scripts/login-reentry-dom.mjs');
   const {document}=canvasDOM(),panel=document.createElement('details');
   panel.className='rf-fqc-administration';panel.open=true;document.body.append(panel);
   const memory=new Map(),methods=[];
   const context={document,window:{},crypto,encodeURIComponent,sessionStorage:{
     getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
     fetch:async(url,options)=>{
       const method=options.method||'GET';methods.push(method);
       const response=await f.load('app/api/routine-reset/route.ts')[method](new Request(origin+url,
         {...options,method,headers:{...options.headers,origin,cookie:f.cookies.frank}}));
       if(method==='POST'){
         assert.equal(response.status,200);
         Object.assign(body,JSON.parse(options.body));
         if(lane==='iqc')throw Error('synthetic loss after commit');
       }
       return response;
     }};
   require('node:vm').runInNewContext(require('node:fs').readFileSync('public/process/routine-reset.js','utf8'),context);
   let readback=null;
   const mount=async()=>{
     panel.replaceChildren();
     await context.window.RoutineReset.bind(document.body,lane,'frank',(zh,vi)=>lane==='iqc'?vi:zh,()=>true,
       async()=>{readback=await call(lane);});
     assert.equal(panel.children.length,1);
   };
   delete f.env.ROUTINE_RESET_DEDICATED_TEST_DB;await mount();assert.equal(panel.querySelector('button'),null);
   f.env.ROUTINE_RESET_DEDICATED_TEST_DB={};await mount();assert.equal(panel.querySelector('button'),null);
   f.env.ROUTINE_RESET_DEDICATED_TEST_DB=f.env.DB;await mount();
   panel.querySelector('button').click();
   const form=panel.querySelector('form'),[typed,ack]=form.querySelectorAll('input');
   assert.match(form.textContent,lane==='iqc'?/lịch sử xét duyệt/:/例行送審歷史/);
   assert.equal(form.querySelectorAll('button').at(-1).disabled,true);
   typed.value='RESET '+lane.toUpperCase();ack.checked=true;form.querySelector('textarea').value=body.reason;
   form.oninput();assert.equal(form.querySelectorAll('button').at(-1).disabled,false);
   await form.onsubmit({preventDefault(){}});
   if(lane==='iqc'){
     assert.equal(readback,null);assert.equal(memory.size,1);
     await mount();await panel.querySelector('button').click();
   }
   assert(readback);assert.equal(memory.size,0);assert.equal(methods.filter(m=>m==='POST').length,1);
   assert.equal((lane==='fqc'?readback.control:readback).jobs.length,0);
   const once=saved();
   const lookup=(id,cookie=f.cookies.frank)=>f.load('app/api/routine-reset/route.ts').GET(
     new Request(origin+'/api/routine-reset?scope='+lane+'&operationId='+id,{headers:{cookie}}));
   assert.equal((await lookup(body.id)).status,200);
   assert.equal((await lookup(body.id,f.cookies.editor)).status,403);
   assert.equal((await lookup(crypto.randomUUID())).status,404);
   assert.equal((await (await request(body)).json()).replayed,true);
   assert.equal((await request({...body,reason:'different'})).status,409);
   assert.deepEqual(saved(),once);
   assert.equal((await call(lane,'?pending-count=1')).pendingCount,0);
   const empty = await call(lane);
   const control = lane === 'fqc' ? empty.control : empty;
   assert(control.revision>0);
   assert.equal(control.documents.length,0);
   assert.equal(control.cases.length,0);
   assert.deepEqual(f.objects.get(photoKey),originalPhoto);
   assert(!control.startDate);
   assert.equal(control.jobs.length, 0);
   const fields = lane === 'fqc'
     ? {startDate:restartDate, calendarVersion:2}
     : {scope:'routine-iqc-only', start:restartDate, reason:'Synthetic restart', confirm:'START IQC', startAck:true,
        expectedStateRevision:empty.stateRevision};
   await call(lane,'',command('configure',0,fields),409);
   assert.deepEqual(saved(),once);
   const restarted = await call(lane, '', command('configure', control.revision, fields));
   await call(lane, '', command('generate', restarted.revision));
   const reloaded = await call(lane);
   const freshControl=lane==='fqc'?reloaded.control:reloaded;
   assert.equal(freshControl.startDate,restartDate);
   assert.equal((await lookup(body.id)).status,200);
   assert.deepEqual([freshControl.documents.length,freshControl.cases.length], [0,0]);
   assert.equal((await call(lane,'?pending-count=1')).pendingCount,0);
   assert.deepEqual(periods(lane === 'fqc' ? reloaded.control.jobs : reloaded.jobs), expected);
   assert.deepEqual(masterRefs(saved()), sourceBefore);
   assert.equal((await f.core.readState()).values[other], otherBefore);
 }
});

void test('missing owner mapping and forged primary claims cannot set either schedule',async t=>{
  const f=await fixture();t.after(()=>f.close());
  await f.mutate(values=>{values.routineFqcEnabled='1';});
  const req=new Request(origin),cookie=f.core.sessionCookie(req,await f.core.demoSession(req,'frank',false,1)).split(';')[0];
  const stored=()=>f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),before=stored();
  for(const path of ['routine-fqc','routine-fqc/page','routine-iqc']){
    const route=f.load('app/api/'+path+'/route.ts');
    const command=path.endsWith('/page')?{command:{action:'save',moduleAction:'domain-v1',input:{action:'configure',startDate:date}}}:{action:'configure',operationId:crypto.randomUUID(),expectedRevision:0};
    const result=await route.POST(new Request(origin+'/api/'+path,{method:'POST',headers:{origin,cookie,'x-process-admin-id':'frank','x-process-primary':'true'},body:JSON.stringify(command)}));
    assert.equal(result.status,401,path);assert.deepEqual(stored(),before);
  }
});
