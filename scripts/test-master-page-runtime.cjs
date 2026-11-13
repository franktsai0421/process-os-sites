/* oxlint-disable typescript/no-require-imports -- Actual Workers routes with ephemeral SQLite and Map R2 only. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite'),{randomUUID,createHash}=require('node:crypto');
const harness=require('./ipqc-ab-import-harness.cjs');
const {accessKeys}=require('../public/process/access-policy.mjs');
const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(record=false) {
 const db=new DatabaseSync(':memory:');
 for(const file of ['drizzle/0000_conscious_skin.sql','drizzle/0001_woozy_roxanne_simpson.sql','drizzle/0002_local_feedback_sessions.sql','drizzle/0003_login_limits.sql'])db.exec(fs.readFileSync(file,'utf8'));
 const objects=new Map();let hook=null,putHook=null,puts=0,runs=0;
 db.exec('CREATE TABLE IF NOT EXISTS process_revoked_sessions(token_digest TEXT PRIMARY KEY,expires_at INTEGER,revoked_at INTEGER)');
 const bucket={async put(key,value){puts++;objects.set(key,Buffer.from(value));if(putHook){const fn=putHook;putHook=null;await fn();}},async get(key){const raw=objects.get(key);return raw?{text:async()=>raw.toString(),arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)}:null;},async head(key){return objects.has(key)?{}:null;}};
 const env={PROCESS_SESSION_REVOCATION_ENABLED:'1',PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){if(sql.startsWith('UPDATE shared_state SET revision=')&&hook){const fn=hook;hook=null;await fn();}runs++;return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:bucket};
 const load=harness(env),draft=load('lib/shared-draft.ts'),records=load('lib/state-records.ts'),core=load('lib/process-state.ts'),route=new Proxy({}, {get(_target,method){return (...args)=>load('app/api/master/pages/route.ts')[method](...args);}}),legacy=load('app/api/master/workflow/route.ts');
 const users=['writer','reviewer'].map(id=>({id,name:'Synthetic '+id,role:'staff',enabled:true,inheritRole:false,authEpoch:1,accessOverrides:Object.fromEntries(accessKeys.map(key=>[key,true]))}));
 const part=code=>({lines:[{id:'line-'+code,code,name:code,stages:[{id:'stage-'+code,code:code+'-1',name:'Stage '+code}]}]});
 const topology={AB:part('A'),C:part('C')},catalog={AB:{products:[],categoryGroups:[]},C:{products:[],categoryGroups:[]}};
 const process={'A-1':load('lib/master-stage-link.ts').stageDefaultTemplates('A-1'),'C-1':load('lib/master-stage-link.ts').stageDefaultTemplates('C-1')};
 const root={pageDraftLayout:'page-v1',active:{'AB.catalog':catalog.AB,'C.catalog':catalog.C,LINES:topology,AB:{...catalog.AB,...topology.AB},C:{...catalog.C,...topology.C},PROCESS:process},versions:[],workflowScopes:{},retainedExtension:{original:true}};
 const version=(scope,snapshot)=>({id:'approved-'+scope,scope,status:'approved',number:1,snapshot:plain(snapshot),revision:1,creatorId:'fixture',creatorName:'Synthetic',createdAt:'fixture',updatedAt:'fixture',history:[]});
 for(const scope of ['AB','C','PROCESS','AB.catalog','C.catalog','LINES'])root.versions.push(version(scope,root.active[scope]));
 for(const scope of ['AB','C'])root.workflowScopes[scope]=draft.createSharedDraft('master:'+scope,root.active[scope],'approved-'+scope,'legacy-'+scope);
 const legacyId=randomUUID();root.workflowScopes.AB.receipts[legacyId]={actorId:'writer',fingerprint:JSON.stringify({action:'save'}),result:{operationId:legacyId,generation:'legacy-AB',revision:0,savedId:null,caseId:null,unchanged:true}};
 const values={platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(root),sentinel:JSON.stringify('unrelated original bytes')};
 async function install(next=values,revision=10){db.prepare('INSERT OR REPLACE INTO shared_state(id,revision,"values",updated_at) VALUES(1,?,?,?)').run(revision,record?await records.encodeRecordValues(bucket,next):JSON.stringify(next),'fixture');}
 await install();const base='https://master-page-fixture.invalid';
 const cookies=Object.fromEntries(await Promise.all(users.map(async user=>[user.id,'process_demo='+await core.demoSession(new Request(base),user.id,false,1)])));
 async function request(page,body,who='writer',query='') {const url=base+'/api/master/pages?scope='+page+query;return new Request(url,{method:body?'POST':'GET',headers:{cookie:cookies[who],origin:base,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
 async function send(page,body,who,query){const response=await route[body?'POST':'GET'](await request(page,body,who,query));return {status:response.status,body:await response.json()};}
 async function begin(page){const loaded=await send(page);assert.equal(loaded.status,200,JSON.stringify(loaded));const basis=load('lib/workflow-begin.ts').beginBasis(loaded.body.control);const r=await send(page,{action:'begin-v1',begin:{operationId:randomUUID(),basis}});assert.equal(r.status,200,JSON.stringify(r));return (await send(page)).body.control;}
 async function readRoot(){const state=await core.readState();return JSON.parse(state.values.masterDataControl);}
 function command(control,action,extra={}){return{action,operationId:randomUUID(),clientId:'synthetic-client-'+randomUUID(),sequence:1,generation:control.workflow.generation,...extra};}
 function save(control,batches){return command(control,'save',{expectedRevision:control.workflow.revision,moduleAction:'save-local-v1',patches:batches.flatMap(batch=>batch.patches),input:{batches}});}
 return {env,load,route,db,send,begin,readRoot,command,save,root,values,install,core,records,bucket,legacy,cookies,base,request,legacyId,putHook:fn=>{putHook=fn;},revoke:()=>db.prepare('INSERT INTO process_revoked_sessions VALUES(?,?,?)').run(createHash('sha256').update(cookies.writer.slice('process_demo='.length)).digest('hex'),Date.now()+3600000,Date.now()),hook:fn=>{hook=fn;},metrics:()=>({puts,runs}),close:()=>db.close()};
}
const checks=[];async function check(name,fn){await fn();checks.push(name);}
module.exports=fixture;
if(require.main===module)(async()=>{
 for(const record of [false,true]) {
  await check((record?'records':'inline')+' page Begin Save Submit Withdraw Return and Approve retain owner boundaries',async()=>{
   const f=await fixture(record);try {
    let lines=await f.begin('LINES'),ab=await f.begin('AB');const original=await f.readRoot(),cBefore=JSON.stringify(original.workflowScopes['C.catalog']);
    const path=['AB','lines',{id:'line-A'},'name'],request=f.save(lines,[{patches:[{op:'set',path,value:'Changed line'}],guards:[{path,value:'A'}]}]);
    let r=await f.send('LINES',{command:request});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.control.workflow.saved.content.AB.lines[0].name,'Changed line');
    assert.equal(r.body.control.workflow.revision,1);assert.equal(r.body.receipt.revision,1);lines=r.body.control;
    r=await f.send('LINES',{command:request});assert.equal(r.status,200);assert.equal(r.body.unchanged,true);
    const afterSave=await f.readRoot();assert.equal(afterSave.active.AB.lines[0].name,'A');assert.equal(JSON.stringify(afterSave.workflowScopes['AB.catalog']),JSON.stringify(original.workflowScopes['AB.catalog']));assert.equal(JSON.stringify(afterSave.workflowScopes['C.catalog']),cBefore);
    const p={id:'product-new',code:'NEW',name:'New product',category:'',line:'A',stages:['A-1']};
    r=await f.send('AB',{command:f.save(ab,[{patches:[{op:'insert',path:['products'],value:p}],guards:[]}])});assert.equal(r.status,200,JSON.stringify(r));ab=r.body.control;
    assert.equal(r.body.control.workflow.saved.content.lines,undefined);assert.equal(r.body.control.references.lines[0].name,'A');
    for(const terminal of ['withdraw','return']){
     r=await f.send('LINES',{command:f.command(lines,'submit',{expectedRevision:lines.workflow.revision,savedId:lines.workflow.saved.id,reason:'Synthetic review'})});assert.equal(r.status,200,JSON.stringify(r));lines=r.body.control;
     assert.equal((await f.readRoot()).workflowScopes['AB.catalog'].pendingId,null);
     r=await f.send('LINES',{command:f.command(lines,terminal,{caseId:lines.workflow.pendingId,reason:'Synthetic terminal'})},terminal==='return'?'reviewer':'writer');assert.equal(r.status,200,JSON.stringify(r));lines=r.body.control;
    }
    r=await f.send('LINES',{command:f.command(lines,'submit',{expectedRevision:lines.workflow.revision,savedId:lines.workflow.saved.id,reason:'Synthetic approval'})});assert.equal(r.status,200,JSON.stringify(r));lines=r.body.control;
    r=await f.send('LINES',{command:f.command(lines,'approve',{caseId:lines.workflow.pendingId,reason:'Synthetic independent approval'})},'reviewer');assert.equal(r.status,200,JSON.stringify(r));
    const final=await f.readRoot();assert.equal(final.active.AB.lines[0].name,'Changed line');assert.equal(final.active.AB.products.length,0);assert.equal(final.workflowScopes['AB.catalog'].saved.content.products[0].code,'NEW');
    assert.deepEqual(plain(final.versions.filter(v=>['AB','C'].includes(v.scope))),plain(original.versions.filter(v=>['AB','C'].includes(v.scope))));
    assert.equal(final.retainedExtension.original,true);
   }finally{f.close();}
  });
  await check((record?'records':'inline')+' full topology uses one union PROCESS link and one CAS approval',async()=>{
   const f=await fixture(record);try {
    let c=await f.begin('LINES');const batches=['AB','C'].map(part=>{const code=part==='AB'?'A':'C',path=[part,'lines',{id:'line-'+code},'stages'];return{patches:[{op:'insert',path,value:{id:'new-'+code,code:code+'-2',name:'New '+code}}],guards:[]};});
    let r=await f.send('LINES',{command:f.save(c,batches)});assert.equal(r.status,200,JSON.stringify(r));c=r.body.control;
    r=await f.send('LINES',{command:f.command(c,'submit',{expectedRevision:c.workflow.revision,savedId:c.workflow.saved.id,reason:'Synthetic union'})});assert.equal(r.status,200,JSON.stringify(r));c=r.body.control;
    const before=await f.readRoot(),pending=before.workflowScopes.LINES.cases.at(-1),link=pending.linkedProcess;
    assert.deepEqual([...link.added].sort((a,b)=>a.localeCompare(b)),['A-2','C-2']);assert(link.content['A-2']);assert(link.content['C-2']);assert.equal(before.active.PROCESS['A-2'],undefined);
    r=await f.send('LINES',{command:f.command(c,'approve',{caseId:c.workflow.pendingId,reason:'Approve union'})},'reviewer');assert.equal(r.status,200,JSON.stringify(r));const after=await f.readRoot();
    assert(after.active.PROCESS['A-2']);assert(after.active.PROCESS['C-2']);assert.equal(after.versions.filter(v=>v.id===pending.id+'-PROCESS').length,1);
   }finally{f.close();}
  });
 }
 await check('caller query cannot enable layout and original receipt remains under legacy owner',async()=>{
  const f=await fixture();try{
   const root=plain(f.root);delete root.pageDraftLayout;await f.install({...f.values,masterDataControl:JSON.stringify(root)});
   assert.equal((await f.send('LINES')).body.error,'MASTER_PAGE_CUTOVER_REQUIRED');
   await f.install();const request=new Request(f.base+'/api/master/workflow?scope=AB',{headers:{cookie:f.cookies.writer}});const r=await f.legacy.GET(request);assert.equal(r.status,409);
  }finally{f.close();}
 });
 for(const record of [false,true])await check((record?'records':'inline')+' concurrent catalog Save survives a retried topology CAS without duplicate receipt',async()=>{
  const f=await fixture(record);try{
   const lines=await f.begin('LINES'),ab=await f.begin('AB'),path=['AB','lines',{id:'line-A'},'name'];
   const own=f.save(lines,[{patches:[{op:'set',path,value:'CAS line'}],guards:[{path,value:'A'}]}]);
   f.hook(async()=>{const peer=f.save(ab,[{patches:[{op:'insert',path:['products'],value:{id:'peer',code:'PEER',name:'Peer',category:'',line:'A',stages:['A-1']}}],guards:[]}]);const r=await f.send('AB',{command:peer});assert.equal(r.status,200,JSON.stringify(r));});
   const r=await f.send('LINES',{command:own});assert.equal(r.status,200,JSON.stringify(r));const root=await f.readRoot();
   assert.equal(root.workflowScopes.LINES.saves.length,1);assert.equal(root.workflowScopes.LINES.working.AB.lines[0].name,'CAS line');assert.equal(root.workflowScopes['AB.catalog'].working.products[0].code,'PEER');
  }finally{f.close();}
 });
 await check('R2 encode session revocation denies CAS and legacy receipt remains readable at original owner',async()=>{
  const f=await fixture(true);try{
   const response=await f.legacy.GET(new Request(f.base+'/api/master/workflow?scope=AB&operationId='+f.legacyId,{headers:{cookie:f.cookies.writer}}));
   assert.equal(response.status,200);assert.equal((await response.json()).receipt.operationId,f.legacyId);
   const c=await f.begin('LINES'),before=JSON.stringify(await f.readRoot()),path=['AB','lines',{id:'line-A'},'name'];
   f.putHook(()=>f.revoke());const r=await f.send('LINES',{command:f.save(c,[{patches:[{op:'set',path,value:'Revoked'}],guards:[{path,value:'A'}]}])});assert.equal(r.status,401,JSON.stringify(r));assert.equal(JSON.stringify(await f.readRoot()),before);
  }finally{f.close();}
 });
 for(const record of [false,true])await check((record?'records':'inline')+' approved catalog composition keeps source IDs and public state hides old and new private drafts',async()=>{
  const f=await fixture(record);try{
   await f.begin('AB');const c=await f.begin('LINES'),path=['AB','lines',{id:'line-A'},'name'];await f.send('LINES',{command:f.save(c,[{patches:[{op:'set',path,value:'PRIVATE UNSAVED SOURCE'}],guards:[{path,value:'A'}]}])});
   const response=await f.legacy.GET(new Request(f.base+'/api/master/workflow?scope=AB&catalog=effective',{headers:{cookie:f.cookies.writer}})),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
   assert.equal(body.control.catalog.kind,'approved-page-composition-v1');assert.equal(body.control.catalog.content.lines[0].name,'A');assert.equal(body.control.catalog.sources.catalog.versionId,'approved-AB.catalog');assert.equal(body.control.catalog.sources.lines.versionId,'approved-LINES');assert.equal(body.control.versions,undefined);
   const publicValues=f.core.publicState(await f.core.readState(),'writer').values,publicRoot=JSON.parse(publicValues.masterDataControl);assert.equal(publicRoot.workflowScopes,undefined);assert.equal(publicRoot.retainedExtension,undefined);assert(!JSON.stringify(publicRoot).includes('PRIVATE UNSAVED SOURCE'));assert(!publicRoot.versions.some(version=>version.scope!=='PROCESS'));
  }finally{f.close();}
 });
 await check('catalog cannot borrow unapproved topology, malformed field paths or unresolved legacy reviews',async()=>{
  const f=await fixture();try{
   let lines=await f.begin('LINES');const stages=['AB','lines',{id:'line-A'},'stages'];let r=await f.send('LINES',{command:f.save(lines,[{patches:[{op:'insert',path:stages,value:{id:'draft-stage',code:'A-DRAFT',name:'Unapproved stage'}}],guards:[]}])});assert.equal(r.status,200,JSON.stringify(r));
   const ab=await f.begin('AB');r=await f.send('AB',{command:f.save(ab,[{patches:[{op:'insert',path:['products'],value:{id:'bad',code:'BAD',name:'Bad',category:'',line:'A',stages:['A-DRAFT']}}],guards:[]}])});assert.equal(r.body.error,'PRODUCT_ROUTE_INVALID');
   lines=(await f.send('LINES')).body.control;const before=JSON.stringify(await f.readRoot()),path=['AB','lines',{id:'line-A'},'secret'];r=await f.send('LINES',{command:f.save(lines,[{patches:[{op:'set',path,value:'forbidden'}],guards:[{path:['AB','lines',{id:'line-A'}],value:lines.workflow.working.AB.lines[0]}]}])});assert.equal(r.body.error,'UNSUPPORTED_CATALOG_PATCH');assert.equal(JSON.stringify(await f.readRoot()),before);
   const root=plain(f.root);root.workflowScopes.AB.pendingId='unresolved';await f.install({...f.values,masterDataControl:JSON.stringify(root)});assert.equal((await f.send('LINES')).body.error,'MASTER_LEGACY_PENDING_REQUIRES_RESOLUTION');
  }finally{f.close();}
 });
 await check('same-parent original identity restoration uses edit while genuinely new identities still require create',async()=>{
  const f=await fixture(true);try{
   const users=JSON.parse(f.values.platformUsers);users.find(user=>user.id==='writer').accessOverrides['lines.create']=false;await f.install({...f.values,platformUsers:JSON.stringify(users)});
   let c=await f.begin('LINES');const path=['AB','lines',{id:'line-A'},'stages',{id:'stage-A'}],original=c.workflow.working.AB.lines[0].stages[0];
   let r=await f.send('LINES',{command:f.save(c,[{patches:[{op:'remove',path}],guards:[{path,value:original}]}])},'reviewer');assert.equal(r.status,200,JSON.stringify(r));c=r.body.control;
   r=await f.send('LINES',{command:f.save(c,[{patches:[{op:'insert',path:path.slice(0,-1),value:{...original,name:'Restored same item'}}],guards:[]}])});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.control.workflow.working.AB.lines[0].stages[0].id,'stage-A');c=r.body.control;
   r=await f.send('LINES',{command:f.save(c,[{patches:[{op:'insert',path:path.slice(0,-1),value:{id:'entirely-new',code:'A-NEW',name:'New item'}}],guards:[]}])});assert.equal(r.status,403,JSON.stringify(r));
  }finally{f.close();}
 });
 await check('drifted active, numeric projection and claimed Save cannot become a page review',async()=>{
  const f=await fixture();try{
   const c=await f.begin('LINES'),path=['AB','lines',{id:'line-A'},'name'];await f.send('LINES',{command:f.save(c,[{patches:[{op:'set',path,value:'Saved'}],guards:[{path,value:'A'}]}])});
   const original=await f.readRoot();
   for(const kind of ['active','numeric','saved']){
    const root=plain(original);if(kind==='active')root.workflowScopes.LINES.active.content.AB.lines[0].name='drift';else if(kind==='numeric')root.versions.find(version=>version.scope==='LINES'&&version.status==='draft').snapshot.AB.lines[0].name='drift';else root.workflowScopes.LINES.saved.content.AB.lines[0].name='never saved';
    await f.install({...f.values,masterDataControl:JSON.stringify(root)});const before=JSON.stringify(await f.readRoot());const request=f.command({workflow:root.workflowScopes.LINES},'submit',{expectedRevision:root.workflowScopes.LINES.revision,savedId:root.workflowScopes.LINES.saved.id,reason:'Invalid projection'}),r=await f.send('LINES',{command:request});assert.equal(r.status,409,kind+JSON.stringify(r));assert.equal(JSON.stringify(await f.readRoot()),before);
   }
  }finally{f.close();}
 });
 console.log(JSON.stringify({status:'PASS',checks,scope:'actual page route, SQLite :memory:, Map R2; no real data or cutover'},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
