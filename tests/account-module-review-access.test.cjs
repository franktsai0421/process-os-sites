// Real registered endpoints and central evaluator; synthetic adopted page data.
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../public/process/access-policy.mjs'),fixture=require('../scripts/test-routine-whole-page-route.cjs');
for(const records of [false,true])void test((records?'records':'inline')+' all thirteen owner endpoints agree on module review, explicit high approval and fresh revocation',async()=>{
 const f=await fixture(records);try{
  const boundaries=f.load('lib/draft-page-boundaries.ts').draftPageBoundaries;assert.equal(boundaries.length,13);const users=JSON.parse(f.values.platformUsers),modules=boundaries.map(row=>row.permissionModule),writer=users.find(user=>user.id==='writer'),reviewer=users.find(user=>user.id==='reviewer'),off=Object.fromEntries(P.accessKeys.map(key=>[key,false]));
  writer.accessOverrides={...off,'approval.view':true};reviewer.accessOverrides={...off,'approval.view':true,'approval.approve':true};for(const permissionModule of modules){writer.accessOverrides[permissionModule+'.view']=true;writer.accessOverrides[permissionModule+'.approve']=true;reviewer.accessOverrides[permissionModule+'.view']=true;}
  const control={schemaVersion:2,primaryAdminId:'frank',draftReviewPolicy:'page-v1',audit:[{id:'synthetic-high',actor:{id:'frank',role:'admin'},action:'update-user',target:'reviewer',before:{accessOverrides:{'approval.approve':false}},after:{accessOverrides:{'approval.approve':true}}}]};const seed=await f.core.readState(),values={...seed.values,platformUsers:JSON.stringify(users),processAccessControl:JSON.stringify(control)};await f.install(values);
  const original=JSON.stringify(await f.core.readState()),effects=f.metrics();
  for(const subject of ['writer','reviewer'])for(const row of boundaries){
   const url=new URL(row.endpoint,f.base);url.searchParams.set('permissions','1');const request=new Request(url,{headers:{cookie:f.cookies[subject],origin:f.base}}),state=await f.core.readState(),core=f.core,workflow=f.load('lib/versioned-shared-workflow.ts');
   const expected=subject==='reviewer';assert.equal(P.moduleForURL(url.href),row.permissionModule,row.page);assert.equal(await core.can(request,state,'approval.approve'),expected,row.page+' legacy alias');const projected=await workflow.workflowAccess(request,state);assert.equal(projected.approve,expected,row.page);for(const action of ['submit','withdraw','return'])assert.equal(projected[action],true,row.page+' '+action);
   const route=f.load('app'+url.pathname+'/route.ts'),response=await route.GET(request),body=await response.json();assert.equal(response.status,200,row.page+' '+JSON.stringify(body));assert.equal(body.permissions.approve,expected,row.page+' owner final');for(const action of ['submit','withdraw','return'])assert.equal(body.permissions[action],true,row.page+' owner '+action);
  }
  assert.equal(JSON.stringify(await f.core.readState()),original);assert.deepEqual(f.metrics(),effects);
  reviewer.accessOverrides['approval.approve']=false;await f.install({...values,platformUsers:JSON.stringify(users)},11);const revoked=JSON.stringify(await f.core.readState()),revokedEffects=f.metrics();
  for(const row of boundaries){const url=new URL(row.endpoint,f.base);url.searchParams.set('permissions','1');const response=await f.load('app'+url.pathname+'/route.ts').GET(new Request(url,{headers:{cookie:f.cookies.reviewer,origin:f.base}})),body=await response.json();assert.equal(response.status,200,row.page+' '+JSON.stringify(body));for(const action of ['approve','submit','withdraw','return'])assert.equal(body.permissions[action],false,row.page+' revoked '+action);}
  assert.equal(JSON.stringify(await f.core.readState()),revoked);assert.deepEqual(f.metrics(),revokedEffects);
 }finally{f.close();}
});
for(const records of [false,true])void test((records?'records':'inline')+' Routine page independent Save preserves its original capability ledger and rejects edits/create/submit',async()=>{
 const f=await fixture(records);try{
  const state=await f.core.readState(),users=JSON.parse(state.values.platformUsers),user=users.find(user=>user.id==='writer');user.accessOverrides=Object.fromEntries(P.accessKeys.map(key=>[key,['routine.view','routine.save'].includes(key)]));await f.install({...state.values,platformUsers:JSON.stringify(users)},state.revision+1);
  const command=await f.save(),response=await f.send({command});assert.equal(response.status,200,JSON.stringify(response));const before=JSON.stringify(await f.core.readState()),effects=f.metrics();
  const receipt=await f.send(null,'writer','?operationId='+command.operationId);assert.equal(receipt.status,200);assert.equal(receipt.body.receipt.operationId,command.operationId);assert.equal(JSON.stringify(await f.core.readState()),before);assert.deepEqual(f.metrics(),effects);
  const create=await f.save([{id:require('node:crypto').randomUUID(),type:'plan',jobIds:['job-a']}]);assert.equal((await f.send({command:create})).status,403);assert.equal((await f.send({command:await f.command('submit',{savedId:(await f.read()).control.workflow.saved.id,reason:'No submit'})})).status,403);assert.equal(JSON.stringify(await f.core.readState()),before);assert.deepEqual(f.metrics(),effects);
  user.accessOverrides['routine.save']=false;const fresh=await f.core.readState();await f.install({...fresh.values,platformUsers:JSON.stringify(users)},fresh.revision+1);assert.equal((await f.send(null,'writer','?operationId='+command.operationId)).status,403);
 }finally{f.close();}
});
