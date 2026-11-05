const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto');
const {accessKeys}=require('../public/process/access-policy.mjs');

void test('actual access-event API: minimal collection, original receipts, current permissions, CAS and private projection',async t=>{
 const db=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));db.exec(fs.readFileSync('scripts/access-events-schema.sql','utf8'));
 let beforeRun=null;const objects=new Map();const env={PROCESS_SESSION_SECRET:randomUUID(),ACCESS_EVENTS_ENABLED:'1',ACCESS_EVENTS_RETENTION_POLICY:'retain',DB:{prepare(sql){let args=[];return{bind(...value){args=value;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){beforeRun?.(sql);return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};},},STATE_ARCHIVE:{async get(key){return objects.get(key)||null;},async put(){throw Error('BUSINESS_R2_WRITE_FORBIDDEN');}}};
 const load=require('../scripts/ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts'),kernel=load('lib/shared-draft.ts'),route=load('app/api/access-events/route.ts');
 const ids=['frank','other-admin','view-admin','employee','peer','restricted','no-feedback'];
 const users=ids.map(id=>({id,name:id==='other-admin'?'Frank':id,role:id==='frank'||id.includes('admin')?'admin':'staff',enabled:true,authMode:'platform',authEpoch:1,accessOverrides:Object.fromEntries(accessKeys.map(key=>[key,!((id==='restricted'&&key.startsWith('bom.'))||(id==='no-feedback'&&key.startsWith('feedback.'))||(id==='view-admin'&&['feedback.edit','feedback.exchange'].includes(key)))]))}));
 const flow=kernel.createSharedDraft('bom',{bom:{},referenceIssues:[]},null,'synthetic-generation');
 const operationId='original-save-000001';flow.receipts[operationId]={actorId:'employee',fingerprint:JSON.stringify({action:'save',commandDigestV1:'a'.repeat(64)}),result:{operationId,generation:flow.generation,revision:1,savedId:'synthetic-saved',caseId:null,unchanged:false}};
 const values={platformUsers:JSON.stringify(users),bomMasterControl:JSON.stringify({schemaVersion:1,activeVersionId:null,versions:[],workflow:flow})};
 db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(JSON.stringify(values),'synthetic');
 const sessions={};for(const id of ids)sessions[id]='process_demo='+await core.demoSession(new Request('http://fixture'),id,false,1);
 async function call(action,body,id='employee',origin='http://fixture'){
  const response=await route[body===undefined?'GET':'POST'](new Request('http://fixture/api/access-events?action='+action,{method:body===undefined?'GET':'POST',headers:{Cookie:sessions[id]||'',Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));return{status:response.status,value:await response.json()};
 }
 const event=(id=operationId)=>({module:'bom',action:'save',operationId:id,occurredAt:123456,phase:'unknown'});
 const original=db.prepare('SELECT * FROM shared_state').get();
 try{
  await t.test('default-off and retention decision gate write no event',async()=>{
   env.ACCESS_EVENTS_RETENTION_POLICY='';let r=await call('capabilities');assert.equal(r.value.enabled,false);assert.equal(r.value.reason,'RETENTION_POLICY_REQUIRED');r=await call('observe',event());assert.equal(r.status,409);assert.equal(r.value.error,'RETENTION_POLICY_REQUIRED');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM access_events').get().n,0);env.ACCESS_EVENTS_RETENTION_POLICY='retain';
   env.ACCESS_EVENTS_ENABLED='0';assert.equal((await call('capabilities')).value.enabled,false);env.ACCESS_EVENTS_ENABLED='1';
  });
  await t.test('fresh login, same origin, exact metadata and module view are mandatory',async()=>{
   assert.equal((await call('observe',event(),'anonymous')).status,401);assert.equal((await call('observe',event(),'employee','http://evil.invalid')).status,403);
   for(const extra of [{actorId:'peer'},{description:'PRIVATE'},{receipt:flow.receipts[operationId]},{password:'DO-NOT-STORE'},{photos:['PRIVATE']}])assert.equal((await call('observe',{...event(),...extra})).status,422);
   assert.equal((await call('observe',event(),'restricted')).status,403);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM access_events').get().n,0);
  });
  await t.test('original actor-authorized receipt verifies success; duplicates do not create issues or overwrite action',async()=>{
   const first=await call('observe',event());assert.equal(first.status,200);assert.equal(first.value.verified,true);await call('observe',event());assert.equal(db.prepare('SELECT COUNT(*) AS n FROM access_events').get().n,1);
   assert.equal((await call('observe',{...event(),action:'approve'})).status,409);
   const peer=await call('observe',event(),'peer');assert.equal(peer.value.verified,false);assert.equal(db.prepare('SELECT outcome FROM access_events WHERE actor_id=?').get('peer').outcome,'unknown');
   const absent=await call('observe',event('not-found-operation'));assert.equal(absent.value.verified,false);assert.equal(db.prepare('SELECT outcome FROM access_events WHERE operation_id=?').get('not-found-operation').outcome,'unknown');
  });
  let id,privateNote;
  await t.test('existing page viewers see only authorized minimal metadata, not operation IDs or receipts',async()=>{
   const list=await call('list');assert.equal(list.status,200);assert.equal(list.value.events.length,3);assert.equal(list.value.complete,false);assert.equal(list.value.coverage,'received-events-only');id=list.value.events.find(row=>row.outcome==='receipt-confirmed').id;
   assert(!JSON.stringify(list.value).includes(operationId));assert(!JSON.stringify(list.value).includes('commandDigestV1'));assert(list.value.events.every(row=>!Object.hasOwn(row,'notes')&&!Object.hasOwn(row,'history')&&!Object.hasOwn(row,'actorId')));
   assert.equal((await call('list',undefined,'restricted')).value.events.length,0);assert.equal((await call('list',undefined,'no-feedback')).status,403);
   assert.equal((await call('detail&id='+id,undefined,'restricted')).status,404);
  });
  await t.test('management follows configured existing permissions, with exactly-once notes and separate handling status',async()=>{
   const detail=await call('detail&id='+id,undefined,'other-admin');privateNote={id,version:detail.value.event.version,status:'handled',note:'<img src=x onerror=alert(1)> PRIVATE-NOTE',operationId:'event-note-000001'};
   assert.equal((await call('update',privateNote,'employee')).status,403);assert.equal((await call('update',privateNote,'view-admin')).status,403);
   const update=await call('update',privateNote,'other-admin');assert.equal(update.status,200);assert.equal(update.value.outcome,'receipt-confirmed');assert.equal(update.value.status,'handled');
   assert.equal((await call('update',privateNote,'other-admin')).value.replayed,true);assert.equal(JSON.parse(db.prepare('SELECT notes FROM access_events WHERE id=?').get(id).notes).length,1);
   assert.equal((await call('update',{...privateNote,note:'changed'},'other-admin')).status,409);
   assert.equal((await call('update',{...privateNote,operationId:'stale-note-000001'},'other-admin')).status,409);
   assert(!JSON.stringify((await call('list&status=handled')).value).includes('PRIVATE-NOTE'));
   const restore=await call('update',{id,version:update.value.version,status:'open',note:'',operationId:'restore-event-000001'},'other-admin');assert.equal(restore.status,200);assert.equal(restore.value.outcome,'receipt-confirmed');assert.equal(restore.value.history.length,2);
   assert.equal((await call('delete',{id},'frank')).status,404);
  });
  await t.test('manual handling cannot manufacture a result for an unknown operation',async()=>{
   const unknown=(await call('list',undefined,'other-admin')).value.events.find(row=>row.outcome==='unknown');const result=await call('update',{id:unknown.id,version:unknown.version,status:'handled',note:'checked, still unknown',operationId:'unknown-note-000001'},'other-admin');assert.equal(result.value.outcome,'unknown');assert.equal(result.value.verifiedAt,null);
  });
  await t.test('pagination remains scoped; mismatched statuses and unsupported actions reject',async()=>{
   for(let n=0;n<55;n++)db.prepare('INSERT INTO access_events SELECT ?,actor_id,module,?,action,occurred_at,received_at,updated_at,outcome,verified_at,status,version,notes,history,update_receipts FROM access_events WHERE id=?').run(randomUUID(),'page-operation-'+n,id);
   const a=await call('list');assert.equal(a.value.events.length,50);assert(a.value.next);const b=await call('list&after='+a.value.next);assert(b.value.events.length>0);assert(!a.value.events.some(row=>b.value.events.some(other=>other.id===row.id)));
   assert.equal((await call('list&status=deleted')).status,422);assert.equal((await call('list&after=bad')).status,422);assert.equal((await call('export',{},'frank')).status,404);
  });
  await t.test('event collection and management preserve all original business/receipt bytes',()=>{assert.deepEqual(db.prepare('SELECT * FROM shared_state').get(),original);assert.equal(objects.size,0);});
  await t.test('authorization revision change at the event CAS rejects rather than silently writing',async()=>{
   const count=db.prepare('SELECT COUNT(*) AS n FROM access_events').get().n;let fired=false;beforeRun=sql=>{if(!fired&&sql.startsWith('INSERT INTO access_events')){fired=true;db.prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1').run();}};
   assert.equal((await call('observe',event('race-operation-000001'))).status,409);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM access_events').get().n,count);beforeRun=null;
   const revised=JSON.parse(original.values),revoked=JSON.parse(revised.platformUsers);revoked.find(user=>user.id==='other-admin').accessOverrides['feedback.view']=false;revised.platformUsers=JSON.stringify(revoked);db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(JSON.stringify(revised));assert.equal((await call('list',undefined,'other-admin')).status,403);
  });
 }finally{db.close();}
});
