/* Pure actual-function equivalence; no request/authority result cache. */
const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const {makeLoader}=require('./read-performance-harness.cjs');
const {withoutPR44AccessChanges,assertAccessTemplateContract}=require('./access-template-source-contract.cjs');
const {withoutMasterABPermissionPhase,assertMasterABPermissionPhaseContract}=require('./master-ab-auth-source-contract.cjs');
const {withoutFqcPermissionPhase,assertFqcPermissionPhaseContract}=require('./fqc-permission-source-contract.cjs');
const current=makeLoader()('lib/user-access.ts'),prior=makeLoader({}, {baseline:['lib/user-access.ts']})('lib/user-access.ts');
const custom=[{id:'custom',name:'Custom',views:['data','approval'],lines:['B'],permissions:['approval.compare','approval.submit'],access:{'ipqc-ab.view':true,'ipqc-ab.save':false,'feedback.exchange':true,'users.view':true}}];
const values={processCustomRoles:JSON.stringify(custom),processRoleTemplateOverrides:JSON.stringify({staff:{access:{'ipqc-ab.view':true,'ipqc-ab.save':false}}})};
const users=[{id:'frank',role:'admin'},{id:'secondary-admin',role:'admin'},{id:'rd-user',role:'rd'},{id:'staff-user',role:'staff'},{id:'custom-user',role:'custom'},{id:'unknown-user',role:'missing'},{id:'disabled-user',role:'admin',enabled:false},{id:'deleted-user',role:'admin',deletedAt:'fixture'},{id:'frank',role:'admin',authMode:'demo'},{id:'own-fields',role:'staff',inheritRole:false,views:['player'],permissions:['approval.submit'],lines:['B']},{id:'override-user',role:'custom',accessOverrides:{'ipqc-ab.save':true,'users.edit':true,'feedback.exchange':true}}];
let comparisons=0;const checks=[];const json=v=>JSON.parse(JSON.stringify(v));
const outcome=(module,user,state)=>{try{return{value:json(module.effectiveAccess(user,state))};}catch(e){return{error:{name:e.name,message:e.message}};}};
function same(user,state){
 comparisons++;const before=outcome(prior,user,state),after=outcome(current,user,state);
 // The historical implementation derives generic data access from feedback alone.
 // Reverse only that newly forbidden alias; every other result field stays exact.
 if(before.value?.enabled&&before.value.cells['feedback.view']&&!require('../public/process/access-policy.mjs').catalog.some(row=>row.id!=='feedback'&&row.view==='data'&&before.value.cells[row.id+'.view']))before.value.views=before.value.views.filter(view=>view!=='data');
 assert.deepEqual(after,before);
}
function check(name,fn){fn();checks.push(name);console.log('PASS '+name);}
check('T1 primary/secondary/custom/default/disabled/deleted/demo and overrides retain results except the explicit feedback-only data alias',()=>{
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
 const expected=old.toString().replace('const preset = roleTemplates(values)[role];','const roles = roleTemplates(values), preset = roles[role];').replace('effectiveCells(user,roleTemplates(values))','effectiveCells(user,roles)');assert.deepEqual(withoutPR44AccessChanges('lib/user-access.ts',now),Buffer.from(expected));
 const lf=b=>Buffer.from([...b].filter((v,i)=>v!==13||b[i+1]!==10));assert.deepEqual(lf(fs.readFileSync('lib/user-access.ts')),lf(now));
 for(const file of ['lib/process-state.ts','lib/session-revocation.ts']){
  const committed=execFileSync('git',['show','HEAD:'+file]),original=execFileSync('git',['show',base+':'+file]);
  // Preserve the merged account/process layer before reversing its historical
  // page changes; the isolated AB parent predates those account changes.
  const joint=require('./quality-main-source-contract.cjs'),mainBytes=joint.projectKnown(committed,file,'main');
  const mainContract=joint.contracts.find(c=>c.file===file&&c.target==='main'&&c.afterHash===joint.hash(committed));
  if(mainContract){
   assert.deepEqual(mainBytes,execFileSync('git',['show',mainContract.sourceCommit+':'+file]),'historical authority proof must begin at genuine merged main');
   const unknown=Buffer.concat([committed,Buffer.from(' ')]);
   assert.deepEqual(joint.projectKnown(unknown,file,'main'),unknown,'unattested authority bytes must not gain an inverse proof');
   assert.throws(()=>require('./account-page-source-contract.cjs').projectFile(unknown,file),'unattested authority bytes must fail the account predecessor proof');
  }
  const phaseBytes=require('./ipqc-ab-integration-source-contract.cjs').projectKnown(mainBytes,file);
  const historical=file==='lib/process-state.ts'?require('./account-page-source-contract.cjs').projectFile(phaseBytes,file):phaseBytes;
  assert.deepEqual(file==='lib/process-state.ts'?withoutMasterABPermissionPhase(withoutFqcPermissionPhase(historical),original):historical,original);
  assert.deepEqual(lf(fs.readFileSync(file)),lf(committed),'working auth source differs from committed bytes');
  if(file==='lib/process-state.ts'){assert.equal(assertFqcPermissionPhaseContract(historical),5);assert.equal(assertMasterABPermissionPhaseContract(withoutFqcPermissionPhase(historical),original),6);}
 }
 const policy='public/process/access-policy.mjs',committedPolicy=execFileSync('git',['show','HEAD:'+policy]);
 assert.deepEqual(withoutPR44AccessChanges(policy,committedPolicy),execFileSync('git',['show',base+':'+policy]));
 assert.deepEqual(lf(fs.readFileSync(policy)),lf(committedPolicy));
 for(const [file,bytes]of [['lib/user-access.ts',now],[policy,committedPolicy]])assertAccessTemplateContract(file,bytes);
});
console.log(JSON.stringify({status:'PASS',groups:checks.length,checks,comparisons,oldParseCount,newParseCount,network:false,limits:['Pure local computation work only, not measured live bottleneck','No caching between calls or skipping identity/revocation checks','Reuse comparison shares current policy and isolates only feedback-derived data removal; exact main/PR44 layers prove source, not pre-PR44 policy equivalence']}));
