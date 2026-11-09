// Pinned #102 receipt function + account review projection; source contracts only.
// No full RF route, native Worker, build, data adoption or external checkout loader.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {accessKeys,moduleForURL} from '../public/process/access-policy.mjs';
import {prepareDraftReviewPolicy,createDraftReviewPolicy,draftReviewReceiptAllowed,routinePageReceiptAllowed} from '../public/process/draft-review-policy.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/draft-review-page-boundaries.json',import.meta.url)));
const registry=fixture.boundaries,policy=createDraftReviewPolicy(registry),off=Object.fromEntries(accessKeys.map(key=>[key,false]));
const pinned=fixture.routineReceiptSource,snippet=fs.readFileSync(new URL('./fixtures/'+pinned.fixture,import.meta.url),'utf8');
assert.equal(createHash('sha256').update(snippet).digest('hex'),pinned.functionSHA256);
const context=vm.createContext({ROUTINE_PAGE_SCOPE:'routine-fqc:page',demand(value,code,status=409){if(!value)throw Object.assign(Error(code),{code,status});}});
const module=new vm.SourceTextModule(stripTypeScriptTypes(snippet,{mode:'transform'}),{context});
await module.link(()=>{throw Error('RECEIPT_FIXTURE_IMPORT_REFUSED');});await module.evaluate();
const actualReceiptCheck=module.namespace.assertRoutinePageReceiptAccess;
const actor={id:'synthetic-routine-reviewer',admin:false};
function permissions(cells={},high=false){
 const subject={id:actor.id,role:'custom_routine',enabled:true},roles={custom_routine:{name:'Synthetic routine',views:[],permissions:[],access:{...off,'routine.view':true,...cells,...(high?{'approval.view':true,'approval.approve':true}:{})}}};
 const control={schemaVersion:2,primaryAdminId:'frank',audit:high?[{id:'synthetic-high-grant',actor:{id:'frank',role:'admin'},target:subject.role,action:'update-role',before:{access:{'approval.approve':false}},after:{access:{'approval.approve':true}}}]:[]};
 return policy.permissions('ROUTINE_FQC',prepareDraftReviewPolicy(subject,roles,control));
}
function owner(caps,action='return'){
 return {page:{workflow:{scope:'routine-fqc:page',receipts:{'synthetic-operation':{actorId:actor.id,fingerprint:JSON.stringify({action}),result:{operationId:'synthetic-operation',unchanged:false}}}},operationPermissions:{'synthetic-operation':[...caps]}}};
}
function sourceAllows(p,c,a=actor){
 try{actualReceiptCheck(c,'synthetic-operation',{actor:a,allowed:key=>p[key]===true,...Object.fromEntries(['create','delete','revise','revoke','settings'].map(key=>[key,p[key]===true]))});return true;}catch(error){assert(['FORBIDDEN','OPERATION_NOT_FOUND','ROUTINE_PAGE_OWNER_MISMATCH','ROUTINE_PAGE_RECEIPT_SOURCE_REQUIRED'].includes(error.code));return false;}
}
void test('captured registry pins the new RF endpoint, whole-page scope and existing routine permission module',()=>{
 assert.equal(fixture.sourceCommit,'e5c3c780fac8413ede01809d5fc871ad0477a225');assert.equal(fixture.workingSourceSHA256,'c7e2a312cdb2d8a04246ca56e5418ba590927d4cd72b9a1a685dede9a888aad7');assert.equal(registry.length,13);assert.equal(fixture.runtimeIntegrated,false);assert.equal(pinned.fullRouteExecuted,false);
 const p=permissions({'routine.withdraw':true});assert.equal(p.endpoint,'/api/routine-fqc/page');assert.equal(p.scope,'routine-fqc:page');assert.equal(p.stateKey,'routineFqcControl');assert.equal(p.permissionModule,'routine');
 for(const selector of ['', '?permissions=1','?operationId=synthetic-operation','?compact=1'])assert.equal(moduleForURL(p.endpoint+selector),'routine');
});
void test('the actual pinned RF receipt guard and new helper agree on both correction capabilities',()=>{
 const p=permissions({'routine.withdraw':true});assert(p.withdraw&&p.return);assert.equal(p.approve,false);
 for(const action of ['withdraw','return']){const c=owner(['view',action],action),before=JSON.stringify(c);assert(sourceAllows(p,c));assert(routinePageReceiptAllowed(p,c,'synthetic-operation',actor));assert.equal(JSON.stringify(c),before);
  const revoked={...p,withdraw:false,return:false};assert.equal(sourceAllows(revoked,c),false);assert.equal(routinePageReceiptAllowed(revoked,c,'synthetic-operation',actor),false);
 }
});
void test('whole-page Save receipt keeps every additional create/delete/revise/revoke/settings requirement',()=>{
 for(const cap of ['create','delete','revise','revoke','settings']){const p=permissions({'routine.save':true}),c=owner(['view','save',cap],'save'),before=JSON.stringify(c);assert.equal(draftReviewReceiptAllowed(p,{actorId:actor.id,action:'save'},actor.id),true,'generic action-only helper cannot establish RF ledger access');assert.equal(sourceAllows(p,c),false);assert.equal(routinePageReceiptAllowed(p,c,'synthetic-operation',actor),false,cap);
  assert(sourceAllows({...p,[cap]:true},c));assert(routinePageReceiptAllowed({...p,[cap]:true},c,'synthetic-operation',actor));assert.equal(JSON.stringify(c),before);
 }
});
void test('domain review receipts use their original approve ledger without inventing Save rights or changing fingerprints',()=>{
 const p=permissions({},true),c=owner(['view','approve'],'save'),before=JSON.stringify(c);assert.equal(p.save,false);assert(p.approve&&p.submit&&p.withdraw);assert.equal(draftReviewReceiptAllowed(p,{actorId:actor.id,action:'save'},actor.id),false);assert(sourceAllows(p,c));assert(routinePageReceiptAllowed(p,c,'synthetic-operation',actor));assert.equal(routinePageReceiptAllowed({...p,approve:false},c,'synthetic-operation',actor),false);assert.equal(JSON.stringify(c),before);
});
void test('retained ADMIN receipt requirements stay enforced, including historical own-return receipts',()=>{
 const p=permissions({'routine.withdraw':true}),c=owner(['view','return','admin']),before=JSON.stringify(c);assert.equal(sourceAllows(p,c),false);assert.equal(routinePageReceiptAllowed(p,c,'synthetic-operation',actor),false);const admin={...actor,admin:true};assert(sourceAllows(p,c,admin));assert(routinePageReceiptAllowed(p,c,'synthetic-operation',admin));assert.equal(JSON.stringify(c),before);
});
void test('legacy document scope, old endpoint, foreign actor, revoked view and missing/unknown ledgers fail closed',()=>{
 const p=permissions({'routine.withdraw':true}),base=owner(['view','return']);
 for(const mutation of [c=>{c.page.workflow.scope='routine-fqc:synthetic-document';},c=>{c.page.workflow.receipts['synthetic-operation'].actorId='other-actor';},c=>{delete c.page.operationPermissions;},c=>{c.page.operationPermissions['synthetic-operation']=['view','not-a-capability'];}]){const c=structuredClone(base);mutation(c);assert.equal(sourceAllows(p,c),false);assert.equal(routinePageReceiptAllowed(p,c,'synthetic-operation',actor),false);}
 for(const changed of [{...p,view:false},{...p,endpoint:'/api/routine-fqc'},{...p,page:'FQC'},{...p,scope:'routine-fqc:document'},{...p,permissionModule:'fqc'},{...p,withdraw:false,return:true}])assert.equal(routinePageReceiptAllowed(changed,base,'synthetic-operation',actor),false);
 for(const caps of [[],['return'],null]){const c=structuredClone(base);c.page.operationPermissions['synthetic-operation']=caps;assert.equal(routinePageReceiptAllowed(p,c,'synthetic-operation',actor),false);}
 assert.equal(routinePageReceiptAllowed(p,base,'synthetic-operation',{id:'',admin:true}),false);assert.equal(routinePageReceiptAllowed(p,base,'missing-operation',actor),false);
});
void test('receipt owner and permission ledger must be own entries, without mutating retained source',()=>{
 const p=permissions({'routine.withdraw':true}),c=owner(['view','return']),record=c.page.workflow.receipts['synthetic-operation'],caps=c.page.operationPermissions['synthetic-operation'];c.page.workflow.receipts=Object.create({'synthetic-operation':record});assert.equal(routinePageReceiptAllowed(p,c,'synthetic-operation',actor),false);c.page.workflow.receipts={'synthetic-operation':record};c.page.operationPermissions=Object.create({'synthetic-operation':caps});assert.equal(routinePageReceiptAllowed(p,c,'synthetic-operation',actor),false);
});
