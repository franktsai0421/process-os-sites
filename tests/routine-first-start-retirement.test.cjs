const {test}=require('node:test');
const assert=require('node:assert/strict');
const fixture=require('../scripts/fqc-apply-fixture.cjs');
const origin='https://synthetic.invalid';

async function setup(t,scope){
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-22T01:00:00+07:00')});
 const f=await fixture();t.after(()=>f.close());
 await f.mutate(v=>{
  const [user]=JSON.parse(v.platformUsers);Object.assign(user.accessOverrides,{'routine.view':true,'routine.edit':true,'routine.settings':true,'iqc.view':true});
  v.platformUsers=JSON.stringify([user,{...user,id:'frank',role:'admin'}]);v.routineFqcEnabled='1';
  const catalog=JSON.parse(v.qualityMasterControl),version=catalog.libraries.fqc.versions[0];
  version.updatedAt=version.createdAt='2026-11-01T00:00:00Z';
  v.qualityMasterControl=JSON.stringify(catalog);
  v.iqcMasterControl=JSON.stringify({activeVersionId:'active',versions:[{id:'active',status:'approved',number:1,createdAt:'2026-11-01T00:00:00Z',snapshot:{parts:[],categories:[],items:[],errors:[]}}]});
 });
 const login=new Request(origin),cookie=f.core.sessionCookie(login,await f.core.demoSession(login,'frank',false,1)).split(';')[0];
 const row=()=>f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
 const op='synthetic-first-start',cmd={action:'configure',operationId:op,expectedRevision:0,...(scope==='fqc'?
   {calendarVersion:2,startDate:'2026-11-22'}:{scope:'routine-iqc-only',start:'2026-11-22',expectedStateRevision:row().revision,confirm:'START IQC',startAck:true,reason:'Synthetic'})};
 const target='routine-'+scope,retirement='routine-start-retirement';
 async function call(path,query='',body,session=cookie){
  const method=body?'POST':'GET';
  return f.load('app/api/'+path+'/route.ts')[method](new Request(origin+'/api/'+path+query,{method,headers:{cookie:session,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 }
 const fence={action:'retire-first-start',scope,operationId:op,expectedRevision:0,confirm:'RETIRE '+scope.toUpperCase()+' START'};
 return {f,cmd,row,assess:id=>call(retirement,'?scope='+scope+'&assessment=1'+(id==null?'':'&operationId='+encodeURIComponent(id))),start:b=>call(target,'',b||cmd),lookup:()=>call(target,'?operationId='+op),
  status:()=>call(retirement,'?scope='+scope+'&operationId='+op),retire:(b,session)=>call(retirement,'',b||fence,session),fence};
}

for(const scope of ['fqc','iqc']){
 void test(scope+' retirement wins over a delayed actual configure and permits one new start',async t=>{
  const {f,cmd,row,start,lookup,retire,status,fence}=await setup(t,scope),initial=row();
  assert.equal((await retire(fence,f.cookies.editor)).status,403);
  assert.equal((await retire({...fence,confirm:'wrong scope'})).status,422);assert.deepEqual(row(),initial);
  let release,enter;
  const gate=new Promise(resolve=>{release=resolve;}),atCas=new Promise(resolve=>{enter=resolve;});
  let first=true;
  f.hooks.run=async sql=>{if(first&&sql.startsWith('UPDATE shared_state')){first=false;enter();await gate;}};
  const original=start();await Promise.race([atCas,original.then(async res=>{throw Error(JSON.stringify(await res.json()));})]);
  try{
   assert.equal((await lookup()).status,404);assert.equal((await status()).status,404);
   const response=await retire();assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  }finally{release();}
  assert.equal((await original).status,409);assert.equal(row().revision,initial.revision+1);
  assert.equal((await lookup()).status,404);assert.equal((await (await status()).json()).status,'retired');
  const priorRefs=JSON.parse(initial.values),currentRefs=JSON.parse(row().values);
  const key=scope==='fqc'?'routineFqcControl':'routineIqcControl';
  delete priorRefs.__processRecords.values[key];delete currentRefs.__processRecords.values[key];
  assert.deepEqual(currentRefs,priorRefs);
  const after=row();assert.equal((await retire()).status,200);assert.deepEqual(row(),after);
  const sibling={...cmd,operationId:'another-first-start'};
  assert.equal((await start(sibling)).status,409);assert.deepEqual(row(),after);
  const fresh={...cmd,operationId:'synthetic-new-start',expectedRevision:1,...(scope==='iqc'?{expectedStateRevision:after.revision}:{})};
  assert.equal((await start(fresh)).status,200);assert.equal((await start(fresh)).status,200);
  assert.equal(row().revision,initial.revision+2);assert.equal((await status()).status,200);
 });
 void test(scope+' configure wins before retirement; recovery preserves the original result',async t=>{
  const {row,start,lookup,retire}=await setup(t,scope);
  assert.equal((await start()).status,200);const committed=row();
  const response=await retire();assert.equal(response.status,409);
  assert.equal((await response.json()).error,'CHECK_ORIGINAL_RECEIPT');
  assert.equal((await lookup()).status,200);assert.deepEqual(row(),committed);
 });
 void test(scope+' lost retirement acknowledgement is recoverable without another write',async t=>{
  const {f,row,retire,status,lookup}=await setup(t,scope),before=row();
  f.hooks.run=(sql,args)=>{if(sql.startsWith('UPDATE shared_state')){
   assert.equal(f.db.prepare(sql).run(...args).changes,1);throw Error('lost ack');
  }};
  assert.equal((await retire()).status,503);const after=row();
  assert.equal(after.revision,before.revision+1);
  assert.equal((await (await status()).json()).status,'retired');assert.equal((await lookup()).status,404);
  assert.deepEqual(row(),after);
 });
}

for(const scope of ['fqc','iqc']){
 void test(scope+' original wins a CAS while the retirement is waiting: no false retirement evidence',async t=>{
  const {f,row,retire,start,status,lookup}=await setup(t,scope);
  let enter,release,first=true;
  const atCas=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  f.hooks.run=async sql=>{if(first&&sql.startsWith('UPDATE shared_state')){first=false;enter();await gate;}};
  const originalRow=row(),pending=retire();
  await Promise.race([atCas,pending.then(async res=>{throw Error(JSON.stringify(await res.json()));})]);
  try{assert.equal((await start()).status,200);}finally{release();}
  assert.equal((await pending).status,409);const query=await status();assert.equal(query.status,409);assert.equal((await query.json()).error,'CHECK_ORIGINAL_RECEIPT');
  assert.equal((await lookup()).status,200);assert.equal(row().revision,originalRow.revision+1);
 });
 void test(scope+' revoke the owner during archive preparation: neither receipt nor CAS is published',async t=>{
  const {f,retire,row}=await setup(t,scope),before=row();
  let session,fired=false;
  f.hooks.sql=(sql,args)=>{if(sql.includes('process_revoked_sessions'))session=args[0];};
  f.hooks.put=()=>{fired=true;f.db.prepare('INSERT OR REPLACE INTO process_revoked_sessions VALUES(?,?,?)').run(session,Date.now()+3600000,Date.now());};
  assert.equal((await retire()).status,403);assert(fired);assert.deepEqual(row(),before);
 });
}

for(const scope of ['fqc','iqc'])void test(scope+' configure after one unrelated shared revision advance',async t=>{
 const {f,row,start,retire,lookup}=await setup(t,scope),before=row();
 let advanced=false;
 f.hooks.run=sql=>{if(!advanced&&sql.startsWith('UPDATE shared_state')){
   advanced=true;f.db.prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1').run();
 }};
 const response=await start();assert(advanced);
 if(scope==='iqc'){
   assert.equal(response.status,409);assert.equal((await lookup()).status,404);
   assert.equal(row().revision,before.revision+1);assert.equal(row().values,before.values);
 }else{
   assert.equal(response.status,200);assert.equal((await lookup()).status,200);
   assert.equal(row().revision,before.revision+2);assert.equal((await retire()).status,409);
 }
});

for(const known of [false,true])void test('IQC owner assessment and fence with '+(known?'ID-only marker':'lost tab and no ID'),async t=>{
 const {f,cmd,row,start,lookup,retire,assess,fence}=await setup(t,'iqc');
 const id=known?cmd.operationId:null,initial=row();
 const checked=await assess(id);assert.equal(checked.status,200);
 assert.deepEqual(await checked.json(),{status:'eligible',scope:'iqc',actorId:'frank',id,expectedRevision:0});
 assert.deepEqual(row(),initial);
 let enter,release,first=true;
 const reached=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 f.hooks.run=async sql=>{if(first&&sql.startsWith('UPDATE shared_state')){first=false;enter();await gate;}};
 const old=start();
 await Promise.race([reached,old.then(async r=>{throw Error(JSON.stringify(await r.json()));})]);
 try{assert.equal((await retire({...fence,operationId:id})).status,200);}finally{release();}
 assert.equal((await old).status,409);
 const proof=await (await assess(id)).json();
 assert.equal(proof.id,id);assert.equal(proof.fencedRevision,1);assert.equal(proof.status,'retired');
 assert.equal((await lookup()).status,404);
 assert.equal((await assess('different-session-id')).status,409);
 assert.equal((await start({...cmd,operationId:'new-after-fence',expectedRevision:1,expectedStateRevision:row().revision})).status,200);
});
void test('IQC lost-tab owner assessment refuses an already started calendar and cannot erase a receipt',async t=>{
 const {cmd,start,assess,retire,fence,row,lookup}=await setup(t,'iqc');assert.equal((await start()).status,200);
 const saved=row();assert.equal((await assess(null)).status,409);assert.equal((await retire({...fence,operationId:null})).status,409);
 assert.equal((await assess(cmd.operationId)).status,409);assert.equal((await lookup()).status,200);assert.deepEqual(row(),saved);
});
