/* Pure actual-function equivalence; no request/authority result cache. */
const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const {makeLoader}=require('./read-performance-harness.cjs');
const {withoutPR44AccessChanges,assertAccessTemplateContract}=require('./access-template-source-contract.cjs');
const {withoutMasterABPermissionPhase,assertMasterABPermissionPhaseContract}=require('./master-ab-auth-source-contract.cjs');
const {withoutFqcPermissionPhase,assertFqcPermissionPhaseContract}=require('./fqc-permission-source-contract.cjs');
const Canvas=require('./process-platform-canvas-contract.cjs');Canvas.verifyRepository();
const {accessKeys}=require('../public/process/access-policy.mjs');
const current=makeLoader()('lib/user-access.ts'),prior=makeLoader({}, {baseline:['lib/user-access.ts']})('lib/user-access.ts');
const custom=[{id:'custom',name:'Custom',views:['data','approval'],lines:['B'],permissions:['approval.compare','approval.submit'],access:{'ipqc-ab.view':true,'ipqc-ab.save':false,'feedback.exchange':true,'users.view':true}}];
const values={processCustomRoles:JSON.stringify(custom),processRoleTemplateOverrides:JSON.stringify({staff:{access:{'ipqc-ab.view':true,'ipqc-ab.save':false}}})};
const users=[{id:'frank',role:'admin'},{id:'secondary-admin',role:'admin'},{id:'rd-user',role:'rd'},{id:'staff-user',role:'staff'},{id:'custom-user',role:'custom'},{id:'unknown-user',role:'missing'},{id:'disabled-user',role:'admin',enabled:false},{id:'deleted-user',role:'admin',deletedAt:'fixture'},{id:'frank',role:'admin',authMode:'demo'},{id:'own-fields',role:'staff',inheritRole:false,views:['player'],permissions:['approval.submit'],lines:['B']},{id:'override-user',role:'custom',accessOverrides:{'ipqc-ab.save':true,'users.edit':true,'feedback.exchange':true}}];
let comparisons=0;const checks=[];const json=v=>JSON.parse(JSON.stringify(v));
const outcome=(module,user,state)=>{try{return{value:json(module.effectiveAccess(user,state))};}catch(e){return{error:{name:e.name,message:e.message}};}};
function legacyExpected(user,state){const expected=outcome(prior,user,state);if(expected.value)expected.value={...expected.value,draftReviewPolicyActive:false};return expected;}
function assertLegacy(actual,user,state){assert.deepEqual(actual,legacyExpected(user,state));}
function same(user,state){comparisons++;assertLegacy(outcome(current,user,state),user,state);}
function check(name,fn){fn();checks.push(name);console.log('PASS '+name);}
check('T1 primary/secondary/custom/default/disabled/deleted/demo and overrides retain exact results',()=>{
 for(const user of users)for(const state of [values,{}, {processCustomRoles:custom,processRoleTemplateOverrides:{}}, {processCustomRoles:'invalid-json',processRoleTemplateOverrides:'invalid-json'}, {processCustomRoles:'[]',processRoleTemplateOverrides:'{}'}])same(user,state);
 assert.equal(current.effectiveAccess(users[0],values).primary,true);assert.equal(current.effectiveAccess(users[1],values).primary,false);assert.equal(current.effectiveAccess(users[8],values).primary,false);
 const limited=current.effectiveAccess(users.at(-1),values);assert.equal(limited.cells['users.edit'],false);assert.equal(limited.cells['feedback.exchange'],false);
});
check('T2 malformed legacy shapes preserve throws instead of broadening fallback',()=>{
 for(const state of [{processCustomRoles:'{}'},{processCustomRoles:'null'},{processCustomRoles:'[null]'}, {processCustomRoles:[],processRoleTemplateOverrides:null},{processCustomRoles:custom,processRoleTemplateOverrides:{custom:{permissions:null,access:null}}}])for(const user of users)same(user,state);
});
let oldParseCount,newParseCount;
check('T3 same-call role JSON parsing halves without cross-call storage',()=>{
 const parse=JSON.parse;let count=0;JSON.parse=(text,...rest)=>{if(text===values.processCustomRoles||text===values.processRoleTemplateOverrides)count++;return parse(text,...rest);};
 try{prior.effectiveAccess(users[3],values);oldParseCount=count;count=0;current.effectiveAccess(users[3],values);newParseCount=count;assert.equal(oldParseCount,4);assert.equal(newParseCount,2);}finally{JSON.parse=parse;}
});
check('T4 next-call role/raw/enabled changes recompute; returned cells cannot poison later decisions',()=>{
 const state={...values},user={...users[4]};const first=current.effectiveAccess(user,state);first.cells['ipqc-ab.view']=false;first.views.length=0;same(user,state);assert.equal(current.effectiveAccess(user,state).cells['ipqc-ab.view'],true);
 state.processRoleTemplateOverrides=JSON.stringify({custom:{access:{'ipqc-ab.view':false}}});same(user,state);assert.equal(current.effectiveAccess(user,state).cells['ipqc-ab.view'],false);
 user.role='staff';same(user,state);user.enabled=false;same(user,state);assert.equal(current.effectiveAccess(user,state).enabled,false);
});
check('T5 exact reuse plus pinned PR44, AB-phase and FQC-phase deltas; outside-span session/identity/revocation remain untouched',()=>{
 const base='dc8c1c2238a6dd89c2707d50e050fe8ae674c9e8',old=execFileSync('git',['show',base+':lib/user-access.ts']),now=execFileSync('git',['show','HEAD:lib/user-access.ts']);
 const expected=old.toString().replace('const preset = roleTemplates(values)[role];','const roles = roleTemplates(values), preset = roles[role];').replace('effectiveCells(user,roleTemplates(values))','effectiveCells(user,roles)');assert.deepEqual(withoutPR44AccessChanges('lib/user-access.ts',Canvas.restorePredecessor(now,'lib/user-access.ts')),Buffer.from(expected));
 const lf=b=>Buffer.from([...b].filter((v,i)=>v!==13||b[i+1]!==10));assert.deepEqual(lf(fs.readFileSync('lib/user-access.ts')),lf(now));
 for(const file of ['lib/process-state.ts','lib/session-revocation.ts']){
  const committed=execFileSync('git',['show','HEAD:'+file]),original=execFileSync('git',['show',base+':'+file]);
  assert.deepEqual(file==='lib/process-state.ts'?withoutMasterABPermissionPhase(withoutFqcPermissionPhase(Canvas.projectKnown(committed,file)),original):committed,original);
  assert.deepEqual(lf(fs.readFileSync(file)),lf(committed),'working auth source differs from committed bytes');
  if(file==='lib/process-state.ts'){assert.equal(assertFqcPermissionPhaseContract(Canvas.projectKnown(committed,file)),5);assert.equal(assertMasterABPermissionPhaseContract(withoutFqcPermissionPhase(Canvas.projectKnown(committed,file)),original),6);}
 }
 const policy='public/process/access-policy.mjs',committedPolicy=execFileSync('git',['show','HEAD:'+policy]);
 assert.deepEqual(withoutPR44AccessChanges(policy,Canvas.restorePredecessor(committedPolicy,policy)),execFileSync('git',['show',base+':'+policy]));
 assert.deepEqual(lf(fs.readFileSync(policy)),lf(committedPolicy));
 for(const [file,bytes]of [['lib/user-access.ts',now],[policy,committedPolicy]])assertAccessTemplateContract(file,Canvas.projectKnown(bytes,file));
});
check('T6 legacy policy metadata is explicit, not stripped; wrong state, added grants and errors still fail exact comparison',()=>{
 const user=users[3],actual=outcome(current,user,values);assert.equal(actual.value.draftReviewPolicyActive,false);assert.equal(Object.hasOwn(actual.value,'reviewPolicy'),false);
 for(const mutate of [row=>{delete row.value.draftReviewPolicyActive;},row=>{row.value.draftReviewPolicyActive=true;},row=>{row.value.reviewPolicy={resolved:true,blocked:[]};},row=>{row.value.cells['users.edit']=true;},row=>{row.value.permissions.push('fixture-ungranted');},row=>{row.value.unexpected=true;}]){const altered=json(actual);mutate(altered);assert.throws(()=>assertLegacy(altered,user,values),{code:'ERR_ASSERTION'});}
 assert.throws(()=>assertLegacy({error:{name:'Error',message:'invented'}},user,values),{code:'ERR_ASSERTION'});
});
check('T7 active review policy is compared against actual same-call role reuse with provenance and fresh-call fences',()=>{
 const off=Object.fromEntries(accessKeys.map(key=>[key,false])),role='fixture-policy-role';
 const state={processCustomRoles:JSON.stringify([{id:role,name:'Synthetic',views:[],permissions:[],lines:[],access:off}]),processRoleTemplateOverrides:'{}'};
 const subject={id:'fixture-policy-user',role,enabled:true,accessOverrides:{...off,'editor.view':true,'editor.approve':true}};
 const control={schemaVersion:2,primaryAdminId:'frank',draftReviewPolicy:'page-v1',audit:[]};
 const access=(user,policy)=>{const input={...state,processAccessControl:JSON.stringify(policy)},before=JSON.stringify({user,input}),implicit=current.effectiveAccess(user,input),explicit=current.effectiveAccess(user,input,current.roleTemplates(input));assert.deepEqual(json(implicit),json(explicit));assert.equal(JSON.stringify({user,input}),before,'projection never writes grants or control');return implicit;};
 let result=access(subject,control);assert.equal(result.draftReviewPolicyActive,true);assert.deepEqual(json(result.reviewPolicy),{resolved:true,blocked:[]});for(const key of ['submit','withdraw','return'])assert.equal(result.cells['editor.'+key],true);for(const key of ['edit','save','approve'])assert.equal(result.cells['editor.'+key],false);assert.equal(result.cells['approval.approve'],false);assert.equal(result.permissions.includes('approval.approve'),false);
 const high={...subject,accessOverrides:{...off,'editor.view':true,'approval.view':true,'approval.approve':true}};
 result=access(high,control);assert.equal(result.reviewPolicy.resolved,false);assert(result.reviewPolicy.blocked.includes('PLATFORM_APPROVAL_CONFIRMATION_REQUIRED'));assert.equal(result.cells['approval.approve'],false);assert.equal(result.cells['editor.approve'],false);assert.equal(result.permissions.includes('approval.approve'),false);
 const grant={id:'fixture-explicit-grant',action:'update-user',target:high.id,actor:{id:'frank',role:'admin'},before:{accessOverrides:{'approval.approve':false}},after:{accessOverrides:{'approval.approve':true}}},proven={...control,audit:[grant]};
 result=access(high,proven);assert.equal(result.reviewPolicy.resolved,true);assert.equal(result.cells['approval.approve'],true);assert.equal(result.cells['editor.approve'],true);assert.equal(result.cells['editor.edit'],false);assert.equal(result.cells['editor.save'],false);
 result.cells['editor.approve']=false;result.reviewPolicy.blocked.push('poison');result.permissions.length=0;const recomputed=access(high,proven);assert.equal(recomputed.cells['editor.approve'],true);assert.deepEqual(json(recomputed.reviewPolicy.blocked),[]);
 const revoked={...proven,audit:[grant,{...grant,id:'fixture-revoke',before:{accessOverrides:{'approval.approve':true}},after:{accessOverrides:{'approval.approve':false}}}]};result=access(high,revoked);assert.equal(result.reviewPolicy.resolved,false);assert.equal(result.cells['approval.approve'],false);assert.equal(result.cells['editor.approve'],false);
 for(const invalid of [{...control,draftReviewPolicy:'future'},{...control,schemaVersion:1},{...control,primaryAdminId:'other'}]){result=access(high,invalid);assert.equal(result.draftReviewPolicyActive,true);assert.deepEqual(json(result.reviewPolicy),{resolved:false,blocked:['DRAFT_REVIEW_POLICY_LAYOUT_INVALID']});for(const key of ['submit','withdraw','return','approve'])assert.equal(result.cells['editor.'+key],false);assert.equal(result.permissions.includes('approval.approve'),false);}
 for(const inactive of [{},{schemaVersion:2,primaryAdminId:'frank',audit:[grant]}]){result=access(high,inactive);assert.equal(result.draftReviewPolicyActive,false);assert.equal(Object.hasOwn(result,'reviewPolicy'),false);same(high,{...state,processAccessControl:JSON.stringify(inactive)});}
});
console.log(JSON.stringify({status:'PASS',groups:checks.length,checks,comparisons,oldParseCount,newParseCount,network:false,limits:['Pure local computation work only, not measured live bottleneck','No caching between calls or skipping identity/revocation checks','Legacy comparison preserves the exact pinned PR44 policy and requires explicit inactive metadata; active policy deliberately has its own provenance/fail-closed tests']}));
