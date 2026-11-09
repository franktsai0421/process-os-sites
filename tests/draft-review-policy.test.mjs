import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {accessKeys} from '../public/process/access-policy.mjs';
import {prepareDraftReviewPolicy,platformApprovalSource,createDraftReviewPolicy,draftOperationPermission,draftReviewReceiptAllowed} from '../public/process/draft-review-policy.mjs';
import {workerSource} from './helpers/native-worker-source.mjs';
const registry=JSON.parse(fs.readFileSync(new URL('./fixtures/draft-review-page-boundaries.json',import.meta.url))).boundaries;
const policy=createDraftReviewPolicy(registry),modules=registry.map(entry=>entry.permissionModule);
const off=Object.fromEntries(accessKeys.map(key=>[key,false]));
const user={id:'synthetic-reviewer',role:'custom_review',name:'Synthetic reviewer',enabled:true};
const source=workerSource(),K=await source.load('lib/shared-draft.ts');
const migration=await source.load('lib/access-migration.ts'),access=await source.load('lib/user-access.ts');
function explicit(cells,kind='role'){
 const role={name:'Synthetic',views:[],permissions:[],access:{...off,...cells}},roles={custom_review:role};
 const subject=kind==='role'?{...user}:{...user,accessOverrides:{'approval.approve':cells['approval.approve']===true}};
 const field=kind==='role'?'access':'accessOverrides',id=kind==='role'?user.role:user.id;
 const entry={id:'synthetic-explicit-grant',actor:{id:'frank',role:'admin'},target:id,action:kind==='role'?'update-role':'update-user',before:{[field]:{'approval.approve':false}},after:{[field]:{'approval.approve':true}}};
 return {user:subject,roles,control:{audit:[entry],schemaVersion:2,primaryAdminId:'frank',migration:{mappingVersion:2}}};
}
function project(f){return prepareDraftReviewPolicy(f.user,f.roles,f.control);}
function pending(scope){
 const actor={id:'synthetic-author',name:'Synthetic author',admin:false},at='2026-11-09T00:00:00Z';
 const state=K.createSharedDraft(scope,{value:1},null,'synthetic-generation');
 state.working={value:2};state.saved={id:'synthetic-save',revision:0,content:{value:2},contributors:{},actor,at};state.saves=[structuredClone(state.saved)];
 state.pendingId='synthetic-case';state.cases=[{id:state.pendingId,savedId:state.saved.id,baseId:null,content:{value:2},before:{value:1},reason:'Synthetic submit',status:'pending',actor,at}];return state;
}
function command(state,action){return {action,operationId:randomUUID(),clientId:'synthetic-policy',sequence:(state.sequences[JSON.stringify([user.id,'synthetic-policy'])]||0)+1,generation:state.generation,expectedRevision:state.revision,caseId:'synthetic-case',reason:'Synthetic correction'};}
function context(permissions){return {actor:{id:user.id,name:user.name,admin:false},at:'2026-11-09T00:01:00Z',id:()=> 'synthetic-next',allowed:key=>permissions[key]===true,activeId:null,structure(){},validate:()=>[],semantic:value=>value};}
void test('raw legacy reviewer maps each existing page review to submit/correction without high approval',()=>{
 const roles={custom_review:{name:'Synthetic',views:['approval'],permissions:['approval.approve','approval.reject']}},before=JSON.stringify({user,roles});
 const plan=prepareDraftReviewPolicy(user,roles);assert(plan.projectionReady);assert.equal(plan.platformApprovalSource.status,'legacy-only');assert.equal(plan.after['approval.approve'],false);
 for(const row of registry){const p=policy.permissions(row.page,plan);assert(p.view&&p.submit&&p.withdraw&&p.return,row.page);assert.equal(p.approve,false);assert.equal(p.edit,plan.before[row.permissionModule+'.edit']);assert.equal(p.save,plan.before[row.permissionModule+'.save']);}
 assert.equal(JSON.stringify({user,roles}),before);assert.equal(plan.runtimeActivated,false);
});
void test('actual v2 mapping collision is blocked until high-grant provenance is available',async()=>{
 const values={platformUsers:JSON.stringify([{id:'frank',role:'admin',name:'Synthetic primary',enabled:true},user]),processCustomRoles:JSON.stringify([{id:user.role,name:'Synthetic',lines:['A'],views:['approval'],permissions:['approval.approve','approval.reject']}]),processRoleTemplateOverrides:'{}'};
 const before=JSON.stringify(values),mapped=await migration.prepareAccessMigration(values),roles=access.roleTemplates(mapped.values),control=JSON.parse(mapped.values.processAccessControl),plan=prepareDraftReviewPolicy(user,roles,control);
 assert.equal(mapped.report.status,'READ_ONLY_MAPPING_PLAN');assert.equal(plan.platformApprovalSource.status,'confirmation-required');assert.equal(plan.after['approval.approve'],false);assert.equal(plan.projectionReady,false);assert.equal(plan.blocked[0].code,'PLATFORM_APPROVAL_CONFIRMATION_REQUIRED');assert.throws(()=>policy.permissions('BOM',plan),/REVIEW_POLICY_UNRESOLVED/);assert.equal(JSON.stringify(values),before);
});
void test('a retained explicit role or user grant includes submit/correction only on visible modules',()=>{
 for(const kind of ['role','user']){
  const f=explicit({'approval.view':true,'approval.approve':true,...Object.fromEntries(modules.map(id=>[id+'.view',id!=='lines']))},kind),plan=project(f);
  assert(plan.projectionReady);assert.equal(plan.platformApprovalSource.status,'confirmed-explicit');assert.equal(plan.platformApprovalSource.auditId,'synthetic-explicit-grant');assert.equal(plan.after['approval.approve'],true);
  for(const row of registry){const p=policy.permissions(row.page,plan),view=row.permissionModule!=='lines';for(const op of ['view','submit','withdraw','return','approve'])assert.equal(p[op],view,kind+' '+row.page+' '+op);assert.equal(p.edit,false);assert.equal(p.save,false);}
 }
});
void test('module-only correction never grants high approval, edit, save or another page',()=>{
 const f=explicit({'bom.view':true,'bom.withdraw':true});f.control.audit=[];const plan=project(f),p=policy.permissions('BOM',plan);
 assert(plan.projectionReady);assert(p.withdraw&&p.return);for(const key of ['submit','approve','edit','save'])assert.equal(p[key],false,key);assert.equal(plan.after['approval.approve'],false);assert.equal(policy.permissions('AB',plan).withdraw,false);
});
void test('unchanged snapshots, foreign actor/target, revoked grants and incomplete tails cannot prove high approval',()=>{
 const cases=[f=>{f.control.primaryAdminId='other-primary';},f=>{delete f.control.primaryAdminId;},f=>{f.control.schemaVersion=0;},f=>{f.control.audit[0].before.access['approval.approve']=true;},f=>{f.control.audit[0].actor.id='someone-else';},f=>{f.control.audit[0].actor.role='staff';},f=>{f.control.audit[0].target='other-role';},f=>{delete f.control.audit[0].id;},f=>{f.control.audit.push({...f.control.audit[0],id:'revoke',before:{access:{'approval.approve':true}},after:{access:{'approval.approve':false}}});},f=>{f.control.audit.push({...f.control.audit[0],id:'incomplete',after:null});},f=>{f.control.audit.push({...f.control.audit[0],id:'missing-key',before:{access:{}},after:{access:{}}});},f=>{f.control.audit.push({...f.control.audit[0],id:'deleted',action:'delete-role',after:null});},f=>{f.control.audit.push({...f.control.audit[0],id:'inconsistent-false',before:{access:{'approval.approve':false}},after:{access:{'approval.approve':false}}});}];
 for(const change of cases){const f=explicit({'approval.view':true,'approval.approve':true,'bom.view':true});change(f);const plan=project(f);assert.equal(plan.projectionReady,false);assert.equal(plan.after['approval.approve'],false);assert.throws(()=>policy.permissions('BOM',plan),/UNRESOLVED/);}
 const f=explicit({'approval.view':true,'approval.approve':true,'bom.view':true});f.control.audit.push({...f.control.audit[0],id:'unrelated-edit',before:{access:{'approval.approve':true}},after:{access:{'approval.approve':true}}});assert.equal(project(f).platformApprovalSource.auditId,'synthetic-explicit-grant');
});
void test('a user deny overrides confirmed role evidence; missing view never silently grants view',()=>{
 const f=explicit({'approval.view':true,'approval.approve':true,'bom.view':true});f.user.accessOverrides={'approval.approve':false};const denied=project(f);assert(denied.projectionReady);assert.equal(denied.after['approval.approve'],false);assert.equal(denied.platformApprovalSource.subject.kind,'user');
 const hidden=explicit({'approval.approve':true,'bom.approve':true});const blocked=project(hidden);assert(!blocked.projectionReady);assert(blocked.blocked.some(x=>x.code==='PLATFORM_APPROVAL_VIEW_REQUIRED'));assert(blocked.blocked.some(x=>x.code==='MODULE_REVIEW_VIEW_REQUIRED'&&x.module==='bom'));assert.equal(blocked.after['approval.view'],false);assert.equal(blocked.after['bom.view'],false);
});
void test('disabled/deleted/missing-role identities project no operation; primary retains existing full authority',()=>{
 for(const mutate of [f=>{f.user.enabled=false;},f=>{f.user.deletedAt='synthetic';},f=>{f.roles={};}]){const f=explicit({'approval.view':true,'approval.approve':true,'bom.view':true});mutate(f);const plan=project(f);assert(plan.projectionReady);for(const row of registry){const p=policy.permissions(row.page,plan);for(const op of ['view','edit','save','submit','withdraw','return','approve','history'])assert.equal(p[op],false);}}
 const plan=prepareDraftReviewPolicy({id:'frank',role:'admin',enabled:true},{admin:{name:'Synthetic primary',access:off,views:[],permissions:[]}});assert.equal(plan.platformApprovalSource.status,'confirmed-primary');for(const row of registry)assert(policy.permissions(row.page,plan).approve);
});
void test('registry is copied and closed over thirteen real pages; forged/blocked/mutable projections are refused',()=>{
 for(const entries of [registry.slice(1),[...registry,{...registry[0]}],registry.map((r,i)=>i===1?registry[0]:r),registry.map((r,i)=>i===0?{...r,permissionModule:'feedback'}:r),registry.map((r,i)=>i===0?{...r,scope:registry[1].scope}:r)])assert.throws(()=>createDraftReviewPolicy(entries),/REGISTRY/);
 const entries=structuredClone(registry),local=createDraftReviewPolicy(entries),f=explicit({'bom.view':true,'bom.withdraw':true}),plan=project(f);entries.find(r=>r.page==='BOM').scope='forged';assert.equal(local.permissions('BOM',plan).scope,'bom');assert.throws(()=>local.permissions('BOM',{...plan}),/UNRESOLVED/);assert.throws(()=>local.permissions('BOM',JSON.parse(JSON.stringify(plan))),/UNRESOLVED/);assert.throws(()=>local.permissions('BOM?line=A',plan),/PAGE_INVALID/);assert.throws(()=>{plan.after['approval.approve']=true;},TypeError);
});
void test('actual kernel uses identical correction authority on every captured #102 page, retaining immutable Saves',()=>{
 const f=explicit(Object.fromEntries(modules.flatMap(id=>[[id+'.view',true],[id+'.withdraw',true]]))),plan=project(f);
 for(const row of registry){const permissions=policy.permissions(row.page,plan),flow=pending(row.scope),before=JSON.stringify(flow),results=[];
  for(const action of ['return','withdraw']){const out=K.applyDraftCommand(flow,command(flow,action),context(permissions));assert.equal(out.state.pendingId,null);assert.deepEqual(out.state.saved,flow.saved);assert.deepEqual(out.state.active,flow.active);assert.equal(out.state.cases[0].result.selfReview,false);results.push(out);}
  assert.deepEqual(results[0].state.working,results[1].state.working);assert.equal(results[0].state.generation,results[1].state.generation);assert.equal(JSON.stringify(flow),before);
  const absent={...permissions,withdraw:false,return:false};for(const action of ['return','withdraw','approve'])assert.throws(()=>K.applyDraftCommand(flow,command(flow,action),context(absent)),e=>e.code==='FORBIDDEN');assert.equal(JSON.stringify(flow),before);
 }
});
void test('actual kernel approval/pending/replay guards survive the planned high and correction projection',()=>{
 const f=explicit({'approval.view':true,'approval.approve':true,'bom.view':true}),permissions=policy.permissions('BOM',project(f)),flow=pending('bom');
 const approved=K.applyDraftCommand(flow,command(flow,'approve'),context(permissions)).state;
 for(const action of ['return','withdraw'])assert.throws(()=>K.applyDraftCommand(approved,command(approved,action),context(permissions)),e=>e.code==='CASE_NOT_PENDING');
 const own=structuredClone(flow);own.cases[0].actor.id=user.id;own.saved.actor.id=user.id;for(const action of ['return','withdraw'])assert.equal(K.applyDraftCommand(own,command(own,action),context(permissions)).state.cases[0].result.selfReview,false);assert.throws(()=>K.applyDraftCommand(own,command(own,'approve'),context(permissions)),e=>e.code==='SELF_REVIEW_CONFIRM_REQUIRED');assert.equal(K.applyDraftCommand(own,{...command(own,'approve'),selfReviewConfirmed:true},context(permissions)).state.cases[0].result.selfReview,true);
 const cmd=command(flow,'return'),returned=K.applyDraftCommand(flow,cmd,context(permissions)),snapshot=JSON.stringify(returned.state);assert.deepEqual(K.applyDraftCommand(returned.state,cmd,context(permissions)).receipt,returned.receipt);
 assert.throws(()=>K.applyDraftCommand(returned.state,cmd,context({...permissions,return:false,withdraw:false})),e=>e.code==='FORBIDDEN');assert.equal(JSON.stringify(returned.state),snapshot);
 for(const patch of [{generation:'stale'},{expectedRevision:99},{reason:''}])assert.throws(()=>K.applyDraftCommand(flow,{...command(flow,'return'),...patch},context(permissions)),e=>['STALE_GENERATION','DRAFT_REVISION_CHANGED_RECONFIRM','REASON_REQUIRED'].includes(e.code));
});

void test('receipt and command permission mapping share correction authority and preserve owner/revocation/restore checks',()=>{
 const f=explicit({'bom.view':true,'bom.withdraw':true}),permissions=policy.permissions('BOM',project(f)),flow=pending('bom');
 for(const action of ['withdraw','return']){
  assert.equal(draftOperationPermission(action),'withdraw');const cmd=command(flow,action),out=K.applyDraftCommand(flow,cmd,context(permissions)),stored=out.state.receipts[cmd.operationId],receipt={actorId:stored.actorId,action:JSON.parse(stored.fingerprint).action};
  assert(draftReviewReceiptAllowed(permissions,receipt,user.id));assert.equal(draftReviewReceiptAllowed(permissions,receipt,'other-actor'),false);assert.equal(draftReviewReceiptAllowed({...permissions,view:false},receipt,user.id),false);assert.equal(draftReviewReceiptAllowed({...permissions,withdraw:false,return:true},receipt,user.id),false);
 }
 for(const action of ['unknown','__proto__','constructor','toString',null])assert.equal(draftOperationPermission(action),null,String(action));
 for(const action of ['approve','save','submit','unknown','__proto__','constructor','toString',null])assert.equal(draftReviewReceiptAllowed(permissions,{actorId:user.id,action},user.id),false,String(action));
 const editable={...permissions,edit:true};assert(draftReviewReceiptAllowed(editable,{actorId:user.id,action:'begin-v1'},user.id));assert.equal(draftReviewReceiptAllowed(editable,{actorId:user.id,action:'restore'},user.id),false);assert(draftReviewReceiptAllowed({...editable,restore:true},{actorId:user.id,action:'restore'},user.id));assert.equal(draftReviewReceiptAllowed(editable,{actorId:'',action:'apply'},''),false);
});

void test('binding mismatch blocks even primary projection; no policy is activated or stored',()=>{
 const identity={id:'frank',role:'admin',enabled:true},roles={admin:{name:'Synthetic',views:[],permissions:[]}},control={schemaVersion:2,primaryAdminId:'other-primary',audit:[]},before=JSON.stringify({identity,roles,control});
 const plan=prepareDraftReviewPolicy(identity,roles,control);assert.equal(plan.projectionReady,false);assert.equal(plan.after['approval.approve'],false);assert.equal(plan.blocked[0].code,'PRIMARY_BINDING_MISMATCH');assert.throws(()=>policy.permissions('BOM',plan),/UNRESOLVED/);assert.equal(JSON.stringify({identity,roles,control}),before);assert.equal(plan.runtimeActivated,false);
});
