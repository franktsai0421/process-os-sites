import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {fixture,productPath} from './master-ab-auth-phase-fixture.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
const change=(path,value,before)=>({patches:[{op:'set',path,value}],guards:[{path,value:before}]});
const save=(f,batches,detail={})=>f.command('save',{moduleAction:'save-local-v1',patches:batches.flatMap(b=>b.patches),input:{batches},...detail});
for(const scope of ['AB','C'])for(const inline of [true,false]){
 void test(`${scope} ${inline?'inline':'records'}: ordered Save is one CAS, saved=working, replay exact`,async t=>{
  const f=await fixture({scope,inline});t.after(f.close);const original=copy(f.flow.working);
  const command=save(f,[change(productPath,'First',original.products[0].name),change(productPath,'Second','First'),change(['lines',{id:'line-a'},'name'],'新線 Chuyền',original.lines[0].name)]);
  const result=await f.request('POST',command);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(f.stats.cas,1);
  const flow=result.body.control.workflow;assert.equal(flow.working.products[0].name,'Second');assert.deepEqual(flow.saved.content,flow.working);assert.equal(flow.revision,original.revision??1);
  const before=f.row();f.reset();const replay=await f.request('POST',command);assert.equal(replay.status,200);assert.deepEqual(replay.body.receipt,result.body.receipt);assert.deepEqual(f.row(),before);assert.equal(f.stats.cas,0);
 });
 void test(`${scope}: conflicting last batch leaves no partial first Apply or Save`,async t=>{
  const f=await fixture({scope,inline});t.after(f.close);const before=f.row();
  const result=await f.request('POST',save(f,[change(productPath,'First','Synthetic product'),change(['lines',{id:'line-a'},'name'],'Changed','stale')]));
  assert.equal(result.status,409);assert.equal(result.body.error,'DEPENDENCY_CHANGED_RECONFIRM');assert.deepEqual(f.row(),before);assert.equal(f.stats.cas,0);
 });
}
for(const scope of ['AB','C']){
 void test(`${scope}: different fields merge; same field conflicts; all original guards stay`,async t=>{
  const f=await fixture({scope});t.after(f.close);
  const first=await f.request('POST',save(f,[change(productPath,'Peer','Synthetic product')],{clientId:'peer-client'}));assert.equal(first.status,200);
  const second=await f.request('POST',save(f,[change(['products',{id:'product-a'},'unit'],'kg','CAI')]));assert.equal(second.status,200,JSON.stringify(second.body));assert.equal(second.body.control.workflow.saved.content.products[0].name,'Peer');
  const before=f.row();const conflict=await f.request('POST',save(f,[change(productPath,'Mine','Synthetic product')]));assert.equal(conflict.status,409);assert.deepEqual(f.row(),before);
 });
 for(const gate of ['edit','create','delete','submit'])void test(`${scope}: raw ${gate} remains separately enforced`,async t=>{
  const prefix=scope==='AB'?'ab':'c',f=await fixture({scope,user:{accessOverrides:{[prefix+'.view']:true,[prefix+'.edit']:true,[prefix+'.save']:false,[prefix+'.'+gate]:false}}});t.after(f.close);
  const allowed=await f.request('GET',undefined,'&permissions=1');assert.equal(allowed.body.permissions.save,gate!=='edit');
  let batches=[change(productPath,'Changed','Synthetic product')];
  if(gate==='create')batches=[{patches:[{op:'insert',path:['products'],value:{...f.flow.working.products[0],id:'new-product',code:'NEW'}}],guards:[]}];
  if(gate==='delete')batches=[{patches:[{op:'remove',path:['products',{id:'product-a'}]}],guards:[{path:['products',{id:'product-a'}],value:f.flow.working.products[0]}]}];
  const result=await f.request('POST',save(f,batches));assert.equal(result.status,gate==='submit'?200:403,JSON.stringify(result.body));
  if(gate==='submit'){const flow=result.body.control.workflow;const denied=await f.request('POST',f.command('submit',{savedId:flow.saved.id,expectedRevision:flow.revision,reason:'Synthetic review'}));assert.equal(denied.status,403);}
 });
 void test(`${scope}: entered line/stage validation and removed-route delete gate apply during Save`,async t=>{
  const prefix=scope==='AB'?'ab':'c',f=await fixture({scope,user:{accessOverrides:{[prefix+'.delete']:false}}});t.after(f.close);
  for(const [path,value,expected]of [[['lines',{id:'line-a'},'name'],'','NAME_REQUIRED'],[['lines',{id:'line-a'},'code'],'bad code','LINE_CODE_INVALID'],[['lines',{id:'line-a'},'stages',{id:'stage-a'},'name'],'','NAME_REQUIRED'],[['products',{id:'product-a'},'stages'],[],'FORBIDDEN']]){
   let prior=f.flow.working;for(const part of path)prior=typeof part==='string'?prior[part]:prior.find(x=>x.id===part.id);
   const before=f.row(),result=await f.request('POST',save(f,[change(path,value,prior)]));assert.equal(result.body.error,expected,JSON.stringify(result.body));assert.deepEqual(f.row(),before);
  }
 });
 void test(`${scope}: pending and stale generation reject whole Save`,async t=>{
  const f=await fixture({scope});t.after(f.close);const before=f.row();const stale=await f.request('POST',save(f,[],{generation:'old-generation'}));assert.equal(stale.status,409);assert.deepEqual(f.row(),before);
  await f.mutateValues(v=>{const root=JSON.parse(v.masterDataControl);root.workflowScopes[scope].pendingId='pending-fixture';v.masterDataControl=JSON.stringify(root);});const locked=f.row();const r=await f.request('POST',save(f,[change(productPath,'Changed','Synthetic product')]));assert.equal(r.body.error,'PENDING_LOCKED');assert.deepEqual(f.row(),locked);
 });
 void test(`${scope}: Begin v1 is receipt-addressable and basis guarded`,async t=>{
  const f=await fixture({scope});t.after(f.close);const open=f.master.versions.find(v=>v.status==='draft');
  const body={action:'begin-v1',begin:{operationId:randomUUID(),basis:{generation:f.flow.generation,activeVersionId:'active',openVersionId:open.id,openVersionStatus:'draft',openVersionRevision:open.revision}}};
  const response=await f.route.POST(new Request(f.url,{method:'POST',headers:f.headers,body:JSON.stringify(body)}));const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.operationKind,'begin-v1');
  const receipt=await f.request('GET',undefined,'&operationId='+body.begin.operationId);assert.equal(receipt.status,200);assert.equal(receipt.body.receipt.operationId,body.begin.operationId);
 });
}
void test('AB group default Save requires whole products/lines dependencies and keeps inheritance',async t=>{
 const f=await fixture();t.after(f.close);const before=copy(f.flow.working),path=['categoryGroups',{id:'group-a'},'defaultStages'];
 const batch={patches:[{op:'set',path,value:['A-CUT']},{op:'set',path:['products',{id:'product-a'},'routeMode'],value:'group'}],guards:[{path},{path:['products',{id:'product-a'},'routeMode']},{path:['products'],value:before.products},{path:['lines'],value:before.lines}]};
 const r=await f.request('POST',save(f,[batch]));assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.control.workflow.saved.content.products[0].routeMode,'group');
 const tampered=copy(batch);tampered.guards=tampered.guards.filter(g=>g.path[0]!=='products');const fail=await f.request('POST',save(f,[tampered]));assert.equal(fail.body.error,'DEPENDENCY_GUARD_REQUIRED');
});
void test('atomic catalog removal still loads full reference history',async t=>{
 const f=await fixture();t.after(f.close);const adapter=f.load('lib/master-workflow.ts').masterWorkflowAdapter('AB');
 assert.equal(adapter.needsReferenceHistory(save(f,[{patches:[{op:'remove',path:['products',{id:'product-a'}]}],guards:[]}])),true);
});
for(const scope of ['AB','C']){
 void test(`${scope}: raw atomic removal and category rename retain hidden published/history reference checks`,async t=>{
  const line=scope==='AB'?'A':'C',f=await fixture({scope,values:{publishedProcess:JSON.stringify([{id:'retained-published',line,category:'G',productCodes:[line+'1']}])}});t.after(f.close);
  for(const batch of [{patches:[{op:'remove',path:['products',{id:'product-a'}]}],guards:[{path:['products',{id:'product-a'}],value:f.flow.working.products[0]}]},change(['categoryGroups',{id:'group-a'},'name'],'Renamed','G')]){
   const before=f.row(),r=await f.request('POST',save(f,[batch]));assert.equal(r.body.error,'CATALOG_IN_USE',JSON.stringify(r.body));assert.deepEqual(f.row(),before);assert.equal(f.stats.cas,0);
  }
 });
 void test(`${scope}: no-change Save keeps saved identity; no substantive change still cannot submit`,async t=>{
  const f=await fixture({scope});t.after(f.close);const a=await f.request('POST',save(f,[]));assert.equal(a.status,200);const b=await f.request('POST',save(f,[]));assert.equal(b.status,200);assert.equal(b.body.receipt.unchanged,true);assert.equal(b.body.control.workflow.saved.id,a.body.control.workflow.saved.id);
  const flow=b.body.control.workflow,r=await f.request('POST',f.command('submit',{savedId:flow.saved.id,expectedRevision:flow.revision,reason:'No substantive change'}));assert.equal(r.body.error,'NO_SUBSTANTIVE_CHANGE');
 });
 void test(`${scope}: revoked edit/save cannot persist the previously prepared raw batch`,async t=>{
  const f=await fixture({scope});t.after(f.close);const cmd=save(f,[change(productPath,'Prepared while allowed','Synthetic product')]),prefix=scope==='AB'?'ab':'c';
  await f.mutateValues(values=>{const users=JSON.parse(values.platformUsers);users[0].accessOverrides={...users[0].accessOverrides,[prefix+'.edit']:false,[prefix+'.save']:false};values.platformUsers=JSON.stringify(users);});const before=f.row(),r=await f.request('POST',cmd);assert.equal(r.status,403);assert.deepEqual(f.row(),before);assert.equal(f.stats.cas,0);
 });
 void test(`${scope}: group membership and line dependency changes reject the original whole batch`,async t=>{
  const f=await fixture({scope});t.after(f.close);const before=copy(f.flow.working),batch={patches:[{op:'set',path:['categoryGroups',{id:'group-a'},'defaultStages'],value:[scope==='AB'?'A-CUT':'C-CUT']},{op:'set',path:['products',{id:'product-a'},'routeMode'],value:'group'}],guards:[{path:['categoryGroups',{id:'group-a'},'defaultStages']},{path:['products',{id:'product-a'},'routeMode']},{path:['products'],value:before.products},{path:['lines'],value:before.lines}]};
  const peer=await f.request('POST',f.command('apply',{patches:[{op:'insert',path:['products'],value:{...before.products[0],id:'peer-member',code:'NEW-MEMBER'}}],guards:[],clientId:'peer-member-client'}));assert.equal(peer.status,200);const pinned=f.row(),r=await f.request('POST',save(f,[batch]));assert.equal(r.body.error,'DEPENDENCY_CHANGED_RECONFIRM');assert.deepEqual(f.row(),pinned);
 });
}
void test('two scopes save concurrently through actual shared-state CAS without cross-saving',async t=>{
 const ab=await fixture({scope:'AB'}),c=await fixture({scope:'C'});t.after(ab.close);t.after(c.close);
 await ab.mutateValues(v=>{const root=JSON.parse(v.masterDataControl);root.active.C=copy(c.master.active.C);root.active.PROCESS={...root.active.PROCESS,...c.master.active.PROCESS};root.versions.push(...c.master.versions.map(v=>({...v,id:'C-'+v.id})));const other=copy(c.flow);other.generation='synthetic-generation-C';other.baseId='C-active';other.active.id='C-active';other.cases=other.cases.map(v=>({...v,id:'C-'+v.id,baseId:'C-'+v.baseId,savedId:'C-'+v.savedId}));other.saves=other.saves.map(v=>({...v,id:'C-'+v.id}));root.workflowScopes.C=other;v.masterDataControl=JSON.stringify(root);});
 const abCommand=save(ab,[change(productPath,'AB independently saved','Synthetic product')]),cCommand=save(c,[change(productPath,'C independently saved','Synthetic product')],{generation:'synthetic-generation-C'});
 const responses=await Promise.all([ab.request('POST',abCommand),ab.route.POST(new Request(ab.url.replace('scope=AB','scope=C'),{method:'POST',headers:ab.headers,body:JSON.stringify({command:cCommand})}))]);assert.equal(responses[0].status,200,JSON.stringify(responses[0].body));assert.equal(responses[1].status,200,JSON.stringify(await responses[1].json()));
 const root=JSON.parse((await ab.decoded()).masterDataControl);assert.equal(root.workflowScopes.AB.saved.content.products[0].name,'AB independently saved');assert.equal(root.workflowScopes.C.saved.content.products[0].name,'C independently saved');
});
