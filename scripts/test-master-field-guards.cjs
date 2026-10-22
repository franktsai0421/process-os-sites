/* Isolated production-handler regression: memory SQLite + Map R2; no listeners or SDK. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto');
const harness=require('./ipqc-ab-import-harness.cjs'),master=require('./v3-master-permission-fixture.cjs'),quality=require('./v3-quality-growth-fixture.cjs');
process.chdir(path.resolve(__dirname,'..'));
const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const at=(v,segments)=>segments.reduce((x,s)=>typeof s==='object'?x?.find(r=>r.id===s.id):x?.[s],v);
let checks=0;const results=[];
async function check(name,fn){await fn();results.push({name,status:'PASS'});checks++;console.log('PASS '+name);}
const replayOnly=process.argv.includes('--replay-compat-only');
async function fixture(id,initial={},seedLegacy=false){
 const db=new DatabaseSync(':memory:'),objects=new Map();for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',f),'utf8'));
 const bucket={async put(k,v){objects.set(k,Buffer.from(v));},async head(k){return objects.has(k)?{size:objects.get(k).length}:null;},async get(k){const b=objects.get(k);return b?{text:async()=>b.toString(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),body:new ReadableStream({start(c){c.enqueue(b);c.close();}})}:null;}};
 const env={PROCESS_SESSION_SECRET:randomUUID(),STATE_ARCHIVE:bucket,DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
 const load=harness(env),f=id==='routine-equipment'?quality(id,[{id:'a'.repeat(64),bytes:1}],0,1):master(id);
 const row=f.rowPath||[f.collection,{id:'row0'}];
 const model=JSON.parse(f.values[f.key]),flow=id.startsWith('master-')?model.workflowScopes[id.slice(7)]:model.workflow;
 const target=at(flow.working,row);if(id==='authoring'){target.instructions='';target.ipqc='';}if(id==='routine-equipment')target.photoId='';Object.assign(target,initial);
 let legacyCommand;
 if(seedLegacy){
  // The old adapters permitted this exact unguarded name command. Generate its
  // authentic successful receipt with the unchanged production shared kernel.
  legacyCommand={action:'apply',generation:flow.generation,operationId:randomUUID(),clientId:'legacy-replay-a',sequence:1,patches:[{op:'set',path:[...row,'name'],value:'legacy applied name'}]};
  const result=load('lib/shared-draft.ts').applyDraftCommand(flow,legacyCommand,{actor:{id:'a',name:'Synthetic a',admin:true},at:'2026-10-16T00:00:00.000Z',id:randomUUID,allowed:()=>true,structure(){},validate(){return[];}});
  if(id.startsWith('master-'))model.workflowScopes[id.slice(7)]=result.state;else model.workflow=result.state;
 }
 f.values[f.key]=JSON.stringify(model);
 f.values.platformUsers=JSON.stringify(['a','b'].map(id=>({id,name:'Synthetic '+id,role:'admin',enabled:true,inheritRole:true,lines:['A','B','C'],views:['editor','data','approval'],permissions:['approval.submit','approval.withdraw','approval.approve','approval.reject','approval.compare','master.delete']})));
 f.values.unrelatedFieldGuardSentinel=JSON.stringify('unchanged');
 db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(await load('lib/state-records.ts').encodeRecordValues(bucket,f.values),'fixture');
 const core=load('lib/process-state.ts'),api=load('app/api/'+(f.api||id)+'/workflow/route.ts'),wire=load('lib/workflow-wire.ts'),headers={},sequence={a:0,b:0};
 for(const actor of ['a','b'])headers[actor]={Cookie:'process_demo='+await core.demoSession(new Request('http://127.0.0.1'),actor,false),Origin:'http://127.0.0.1','Content-Type':'application/json'};
 const request=async(body,actor='a')=>{const r=await api[body?'POST':'GET'](new Request(f.url.replace('http://fixture','http://127.0.0.1'),{method:body?'POST':'GET',headers:headers[actor],...(body?{body:JSON.stringify(body)}:{})}));return{status:r.status,body:wire.expandWorkflowPayload(await r.json())};};
 const read=async()=>{const r=await request();assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 const command=(state,patches,guards,actor='a')=>({action:'apply',generation:state.control.workflow.generation,operationId:randomUUID(),clientId:'field-guard-'+actor,sequence:++sequence[actor],patches,...(guards===undefined?{}:{guards})});
 const send=async(cmd,actor='a',status=200,error)=>{const r=await request({command:cmd},actor);assert.equal(r.status,status,JSON.stringify(r.body));if(error)assert.equal(r.body.error,error);return r.body;};
 return{db,objects,read,command,send,row,core,key:f.key,legacyCommand};
}
async function unchanged(f,fn){const s=await f.core.readState(),before=JSON.stringify(s),objects=JSON.stringify([...f.objects].map(([k,v])=>[k,v.toString('base64')]));await fn();assert.equal(JSON.stringify(await f.core.readState()),before,'rejection must not write state');assert.equal(JSON.stringify([...f.objects].map(([k,v])=>[k,v.toString('base64')])),objects,'rejection must not write R2');}
(async()=>{
 for(const id of (replayOnly?[]:['master-AB','master-C','master-PROCESS','authoring','routine-equipment'])){
  const f=await fixture(id);try{
   const fields=id==='authoring'?['name','instructions','ipqc']:id==='routine-equipment'?['name','notes','owner','spec']:id==='master-PROCESS'?['name','nameVi','description','note','specification']:['name','nameVi','specification'];
   for(const field of fields)await check(id+' '+field+' missing guard 422; stale original baseline 409 atomic',async()=>{
    const state=await f.read(),p=[...f.row,field],old=copy(at(state.control.workflow.working,p));
    // Freeze B before A changes the field; do not refresh B baseline after A.
    const stale=f.command(state,[{op:'set',path:p,value:'stale '+field}],[{path:p,value:old}],'b');
    const missing=f.command(state,[{op:'set',path:p,value:'unguarded '+field}],undefined,'b');
    await unchanged(f,()=>f.send(missing,'b',422,'DEPENDENCY_GUARD_REQUIRED'));
    const a=f.command(state,[{op:'set',path:p,value:'new A '+field}],[{path:p,value:old}]);await f.send(a);
    await unchanged(f,()=>f.send(stale,'b',409,'DEPENDENCY_CHANGED_RECONFIRM'));
    assert.equal(at((await f.read()).control.workflow.working,p),'new A '+field);
   });
   await check(id+' independent field merge; exact replay preserves newer value; mixed missing guard atomic',async()=>{
    const state=await f.read(),p=[...f.row,'name'],q=[...f.row,id==='master-PROCESS'?'people':id==='authoring'?'instructions':id==='routine-equipment'?'notes':'specification'];
    const oldP=copy(at(state.control.workflow.working,p)),oldQ=copy(at(state.control.workflow.working,q));
    const a=f.command(state,[{op:'set',path:p,value:'merge A'}],[{path:p,value:oldP}]);
    const b=f.command(state,[{op:'set',path:q,value:q.at(-1)==='people'?Number(oldQ||1)+1:'merge B'}],[{path:q,value:oldQ}],'b');
    await f.send(a);await f.send(b,'b');let current=await f.read();assert.equal(at(current.control.workflow.working,p),'merge A');assert.deepEqual(at(current.control.workflow.working,q),b.patches[0].value);
    await f.send(f.command(current,[{op:'set',path:p,value:'newer after A'}],[{path:p,value:'merge A'}],'b'),'b');await f.send(a);assert.equal(at((await f.read()).control.workflow.working,p),'newer after A');
    current=await f.read();const mixed=f.command(current,[{op:'set',path:q,value:b.patches[0].value},{op:'set',path:p,value:'must not commit'}],[{path:q,value:b.patches[0].value}]);await unchanged(f,()=>f.send(mixed,'a',422,'DEPENDENCY_GUARD_REQUIRED'));
    assert.equal((await f.core.readState()).values.unrelatedFieldGuardSentinel,JSON.stringify('unchanged'));
   });
  }finally{f.db.close();}
 }
 if(!replayOnly){
 for(const baseline of [undefined,null])await check('JSON transport preserves '+String(baseline)+' old-value baseline without conflation',async()=>{
  const f=await fixture('master-AB',baseline===undefined?{}:{nameVi:null});try{
   const state=await f.read(),p=[...f.row,'nameVi'];assert.equal(at(state.control.workflow.working,p),baseline);
   const a=f.command(state,[{op:'set',path:p,value:'new optional value'}],[{path:p,value:baseline}]);const stale=f.command(state,[{op:'set',path:p,value:'stale optional value'}],[{path:p,value:baseline}],'b');
   await f.send(a);await unchanged(f,()=>f.send(stale,'b',409,'DEPENDENCY_CHANGED_RECONFIRM'));
  }finally{f.db.close();}
 });
 await check('actual shared master diff guards every changed scalar including missing/null; authoring uses same diff',()=>{
  const window={};vm.runInNewContext(fs.readFileSync('public/process/master-shared-client.js','utf8'),{window,crypto:{randomUUID},console});const diff=window.createMasterSharedBridge({control:{active:{},versions:[]}}).diff;
  const before={name:'old',nameVi:null,description:'old',note:'old',specification:'old',instructions:'old',ipqc:'old'},after={...before,name:'new',nameVi:'new',description:'new',note:'new',specification:'new',instructions:'new',ipqc:'new',optional:'new'};
  const changes=JSON.parse(JSON.stringify(diff(before,after)));assert.equal(changes.patches.length,8);assert.equal(changes.guards.length,8);for(const patch of changes.patches){const guard=changes.guards.find(g=>JSON.stringify(g.path)===JSON.stringify(patch.path));assert.ok(guard);assert.deepEqual(guard.value,at(before,patch.path));}
  assert.match(fs.readFileSync('public/process/process-authoring-v3.js','utf8'),/const diff=host.createMasterSharedBridge/);
 });
 await check('actual equipment snapshotChanges guards name/notes/owner/spec/resolution and missing/null',()=>{
  const source=fs.readFileSync('public/process/routine-equipment.js','utf8'),start=source.indexOf('function snapshotChanges('),end=source.indexOf('async function writeShared',start);assert(start>0&&end>start);const context={};vm.runInNewContext(source.slice(start,end)+';this.diff=snapshotChanges;',context);
  const before={equipment:[{id:'r',name:'old',notes:'old',owner:null}],groups:[],categories:[],subcategories:[],issues:[{id:'i',status:'open',resolution:'old'}]},after=copy(before);Object.assign(after.equipment[0],{name:'new',notes:'new',owner:'new',spec:'new'});after.issues[0].resolution='new';
  const result=JSON.parse(JSON.stringify(context.diff(before,after)));assert.equal(result.patches.length,5);assert.equal(result.guards.length,5);for(const patch of result.patches)assert.deepEqual(result.guards.find(g=>JSON.stringify(g.path)===JSON.stringify(patch.path)).value,at(before,patch.path));
 });
 }
 for(const id of ['master-AB','authoring'])await check(id+' historical unguarded receipt replay200/no reapply/no writes; wrong actor/fingerprint rejected; new guard requirement retained',async()=>{
  const f=await fixture(id,{},true);try{
   const state=await f.read(),p=[...f.row,'name'];assert.equal(at(state.control.workflow.working,p),'legacy applied name');
   const missing=f.command(state,[{op:'set',path:p,value:'new unguarded'}],undefined);
   await unchanged(f,()=>f.send(missing,'a',422,'DEPENDENCY_GUARD_REQUIRED'));
   const stale=f.command(state,[{op:'set',path:p,value:'new stale'}],[{path:p,value:'legacy applied name'}],'b');
   await f.send(f.command(state,[{op:'set',path:p,value:'newer retained name'}],[{path:p,value:'legacy applied name'}]));
   await unchanged(f,()=>f.send(stale,'b',409,'DEPENDENCY_CHANGED_RECONFIRM'));
   await unchanged(f,()=>f.send(f.legacyCommand,'a'));
   assert.equal(at((await f.read()).control.workflow.working,p),'newer retained name');
   await unchanged(f,()=>f.send(f.legacyCommand,'b',409,'OPERATION_ID_REUSED'));
   const changed=copy(f.legacyCommand);changed.patches[0].value='wrong fingerprint';
   await unchanged(f,()=>f.send(changed,'a',409,'OPERATION_ID_REUSED'));
  }finally{f.db.close();}
 });
 console.log(JSON.stringify({status:'PASS',checks,scope:replayOnly?'two scopes historical receipt replay; real Request handlers; memory SQLite/Map R2':'five scopes real Request handlers; memory SQLite/Map R2; VM actual client functions',GUI:'NOT_RUN',SDK:'NOT_LOADED',results}));
})().catch(error=>{console.error(error);process.exitCode=1;});
