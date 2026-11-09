// Read-only requirements diagnostic. Synthetic identities and a pure draft only.
// Deliberately exits 1 while any confirmed requirement is not implemented.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import * as P from '../public/process/access-policy.mjs';
const require=createRequire(import.meta.url);
const load=require('./ipqc-ab-import-harness.cjs')();
const {effectiveAccess}=load('lib/user-access.ts');
const K=load('lib/shared-draft.ts');
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const checks=[];
const check=(id,expected,actual,scope)=>checks.push({id,status:JSON.stringify(actual)===JSON.stringify(expected)?'PASS':'FAIL',scope,expected,actual});
const modules=P.catalog.filter(r=>r.id!=='lines'&&r.ops.includes('submit')).map(r=>r.id);
const off=Object.fromEntries(P.accessKeys.map(k=>[k,false]));
function cells(access,{views=[],permissions=[]}={}){
 const roles={synthetic:{name:'Synthetic',lines:['A'],views,permissions,access}};
 return P.effectiveCells({id:'synthetic-user',role:'synthetic',enabled:true,inheritRole:true},roles);
}
const legacy=cells(undefined,{views:['approval'],permissions:['approval.approve','approval.reject']});
check('LEGACY_REVIEW_MUST_NOT_BECOME_PLATFORM_APPROVAL',false,legacy['approval.approve'],'Legacy-only review identity; no saved explicit high-level grant');
check('LEGACY_REVIEW_MODULE_SUBMIT_WITHDRAW',[],modules.filter(id=>!legacy[id+'.submit']||!legacy[id+'.withdraw']),'Legacy reviewer migration requirement; no real migration executed');
const high=cells({...off,...Object.fromEntries(modules.map(id=>[id+'.view',true])),'approval.view':true,'approval.approve':true});
check('PLATFORM_APPROVAL_INCLUDES_MODULE_SUBMIT_WITHDRAW',[],modules.filter(id=>!high[id+'.submit']||!high[id+'.withdraw']),'Effective configured cells; fixture already grants module view');
const ownModule=cells({...off,'bom.view':true,'bom.submit':true,'bom.withdraw':true});
check('MODULE_SUBMISSION_DOES_NOT_GRANT_PLATFORM_APPROVAL',false,ownModule['approval.approve'],'Explicit module-only grant');
const ordinary=cells({...off,'dashboard.view':true});
check('FEEDBACK_VISIBLE_TO_EVERY_ENABLED_COMPANY_ACCOUNT',true,ordinary['feedback.view'],'Enabled ordinary account with one legitimate page view and explicit feedback view=false');
const feedback=cells({...off,'feedback.view':true,'feedback.edit':true,'feedback.exchange':true});
check('FEEDBACK_EDIT_EXPORT_FOLLOW_EXPLICIT_GRANTS',{edit:true,exchange:true},{edit:feedback['feedback.edit'],exchange:feedback['feedback.exchange']},'Non-admin synthetic role; policy currently has adminOps ceiling');
const actualAccess=effectiveAccess({id:'synthetic-line-user',role:'synthetic',enabled:true,inheritRole:true},{},{synthetic:{name:'Synthetic',lines:['A'],views:['data'],permissions:[],access:{'bom.view':true}}});
check('SAME_PAGE_A_B_C_LINES_VISIBLE',['A','B','C'],actualAccess.lines,'EffectiveAccess output only; no business data fetched');
const actor={id:'synthetic-reviewer',name:'Synthetic reviewer',admin:false};
const source=K.createSharedDraft('bom',{value:1},null,'synthetic-generation');
const submitted={id:'synthetic-case',savedId:'synthetic-saved',baseId:null,content:{value:2},before:{value:1},reason:'Synthetic',status:'pending',actor:{id:'synthetic-author',name:'Synthetic author',admin:false},at:'2026-11-09T00:00:00Z'};
source.cases=[submitted];source.pendingId=submitted.id;
source.saved={id:submitted.savedId,revision:0,content:{value:2},contributors:{},actor:submitted.actor,at:submitted.at};
function execute(action,allowed,status='pending',reviewActor=actor){
 const basis=structuredClone(source);basis.cases[0].status=status;if(status!=='pending')basis.pendingId=null;
 const before=JSON.stringify(basis);
 try{
  const result=K.applyDraftCommand(basis,{action,operationId:'synthetic-operation',clientId:'synthetic-client',sequence:1,generation:basis.generation,caseId:submitted.id,reason:'Synthetic correction'},{actor:reviewActor,at:'2026-11-09T00:01:00Z',id:()=> 'synthetic-next-generation',allowed:p=>p==='view'||allowed.includes(p),structure:()=>{},validate:()=>[],semantic:v=>v,activeId:null});
  assert.equal(JSON.stringify(basis),before,'diagnostic must never mutate its source');
  return {status:200,pendingId:result.state.pendingId,working:result.state.working,savedId:result.state.saved.id};
 }catch(error){
  assert.equal(JSON.stringify(basis),before,'rejected source unchanged');
  if(!(error instanceof K.DraftConflict))throw error;
  return {status:error.status,code:error.code};
 }
}
const withdraw=execute('withdraw',['withdraw']),returned=execute('return',['withdraw']);
check('RETURN_AND_WITHDRAW_USE_SAME_PENDING_AUTHORITY',withdraw,returned,'Same pending case and actor with withdraw-only authority; pure transition kernel');
const self=source.cases[0].actor;
check('RETURN_AND_WITHDRAW_USE_SAME_SELF_CONFIRMATION',execute('withdraw',['withdraw','return'],'pending',self),execute('return',['withdraw','return'],'pending',self),'Same author and pending case, no selfReviewConfirmed');
check('APPROVED_VERSION_CANNOT_BE_WITHDRAWN',{status:409,code:'CASE_NOT_PENDING'},execute('withdraw',['withdraw'],'approved'),'Pure transition kernel; state is unchanged');
const failed=checks.filter(c=>c.status==='FAIL').length;
console.log(JSON.stringify({head,status:failed?'REQUIREMENTS_NOT_MET':'PASS',checks,failed,realAccountsRead:false,realCredentialsRead:false,liveWrites:false,browserAcceptance:false},null,2));
process.exitCode=failed?1:0;
