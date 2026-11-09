// Synthetic pure transitions and the actual shared workflow route; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {accessKeys} from '../public/process/access-policy.mjs';
const harness=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs');
const K=harness()('lib/shared-draft.ts');
const author={id:'synthetic-author',name:'Synthetic author',admin:false};
function pending(){
 const flow=K.createSharedDraft('bom',{value:'original'},null,randomUUID());
 const stamp={actor:author,at:'2026-11-09T00:00:00Z'},content={value:'changed'};
 flow.working=structuredClone(content);flow.saved={...stamp,id:'synthetic-save',revision:0,content,contributors:{}};flow.saves=[structuredClone(flow.saved)];
 flow.pendingId='synthetic-case';flow.cases=[{...stamp,id:flow.pendingId,savedId:flow.saved.id,baseId:null,content:structuredClone(content),before:{value:'original'},reason:'Synthetic submit',status:'pending'}];
 return flow;
}
function context(flow,allowed=()=>true){return {actor:author,at:'2026-11-09T00:01:00Z',id:randomUUID,allowed,activeId:flow.active.id,structure(){},validate:()=>[],semantic:x=>x};}
function command(flow,action,fields={}){return {action,operationId:randomUUID(),clientId:'synthetic-review',sequence:1,generation:flow.generation,expectedRevision:flow.revision,caseId:flow.pendingId,reason:'Synthetic correction',...fields};}
void test('same-author return and withdrawal need no self-approval confirmation and preserve the saved snapshot',()=>{
 for(const action of ['return','withdraw']){
  const flow=pending(),before=JSON.stringify(flow),result=K.applyDraftCommand(flow,command(flow,action),context(flow)).state;
  assert.equal(result.pendingId,null);assert.equal(result.cases[0].result.selfReview,false);assert.deepEqual(result.saved,flow.saved);assert.deepEqual(JSON.parse(JSON.stringify(result.working)),flow.saved.content);assert.deepEqual(result.active,flow.active);assert.equal(JSON.stringify(flow),before);
 }
});
void test('same-author approval still needs explicit confirmation and records self-review',()=>{
 const flow=pending(),before=JSON.stringify(flow),cmd=command(flow,'approve');
 assert.throws(()=>K.applyDraftCommand(flow,cmd,context(flow)),e=>e.code==='SELF_REVIEW_CONFIRM_REQUIRED');assert.equal(JSON.stringify(flow),before);
 const approved=K.applyDraftCommand(flow,{...cmd,selfReviewConfirmed:true},context(flow)).state;
 assert.equal(approved.active.id,flow.pendingId);assert.equal(approved.cases[0].result.selfReview,true);
});
void test('return retains current permission, reason, generation and revision rejection guards',()=>{
 for(const [fields,allowed,code]of [[{},p=>p!=='return','FORBIDDEN'],[{reason:''},()=>true,'REASON_REQUIRED'],[{generation:'synthetic-stale'},()=>true,'STALE_GENERATION'],[{expectedRevision:5},()=>true,'DRAFT_REVISION_CHANGED_RECONFIRM']]){
  const flow=pending(),before=JSON.stringify(flow);assert.throws(()=>K.applyDraftCommand(flow,command(flow,'return',fields),context(flow,allowed)),e=>e.code===code);assert.equal(JSON.stringify(flow),before);
 }
});
void test('approved cases reject return and withdrawal without changes',()=>{
 for(const action of ['return','withdraw']){
  const flow=pending();flow.cases[0].status='approved';flow.pendingId=null;const before=JSON.stringify(flow);
  assert.throws(()=>K.applyDraftCommand(flow,command(flow,action,{caseId:flow.cases[0].id}),context(flow)),e=>e.code==='CASE_NOT_PENDING');assert.equal(JSON.stringify(flow),before);
 }
});
void test('an exact return receipt is idempotent; current permission still precedes receipt replay',()=>{
 const flow=pending(),cmd=command(flow,'return'),first=K.applyDraftCommand(flow,cmd,context(flow)),before=JSON.stringify(first.state);
 const replay=K.applyDraftCommand(first.state,cmd,context(first.state));assert.deepEqual(replay.receipt,first.receipt);assert.equal(JSON.stringify(first.state),before);
 assert.throws(()=>K.applyDraftCommand(first.state,cmd,context(first.state,p=>p!=='return')),e=>e.code==='FORBIDDEN');assert.equal(JSON.stringify(first.state),before);
});
void test('replaying a retained historical return never rewrites its old self-review audit flag',()=>{
 const flow=pending(),cmd=command(flow,'return',{selfReviewConfirmed:true}),first=K.applyDraftCommand(flow,cmd,context(flow));
 first.state.cases[0].result.selfReview=true; // Retained pre-fix audit, not a new return.
 const before=JSON.stringify(first.state),replayed=K.applyDraftCommand(first.state,cmd,context(first.state));
 assert.equal(replayed.state.cases[0].result.selfReview,true);assert.deepEqual(replayed.receipt,first.receipt);assert.equal(JSON.stringify(first.state),before);
});
void test('actual shared route persists same-author return; own approval remains rejected before CAS',async()=>{
 for(const action of ['return','approve']){
  const db=new DatabaseSync(':memory:'),objects=new Map();let writes=0;
  for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+name,'utf8'));
  const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args),success:true};},async run(){writes++;return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};},async batch(statements){return Promise.all(statements.map(s=>s.all()));}},STATE_ARCHIVE:{async put(k,v){objects.set(k,String(v));},async get(k){return objects.has(k)?{text:async()=>objects.get(k)}:null;},async head(k){return objects.has(k)?{}:null;}}};
  const load=harness(env),kernel=load('lib/shared-draft.ts'),core=load('lib/process-state.ts'),flow=pending(),control={activeVersionId:null,versions:[{id:flow.pendingId,number:1,status:'pending',snapshot:structuredClone(flow.saved.content),revision:0,creatorId:author.id,creatorName:author.name,history:[]}],workflow:flow};
  const user={id:author.id,name:author.name,role:'staff',enabled:true,authEpoch:1,accessOverrides:{...Object.fromEntries(accessKeys.map(k=>[k,false])),'bom.view':true,'bom.return':true,'bom.approve':true}};
  const values={platformUsers:JSON.stringify([user]),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',syntheticDraft:JSON.stringify(control)};
  db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(JSON.stringify(values),'synthetic');
  const cookie='process_demo='+await core.demoSession(new Request('https://synthetic.invalid'),user.id,false,user.authEpoch);
  const adapter={key:'syntheticDraft',scope:'bom',parse:raw=>JSON.parse(raw),empty:()=>({value:'original'}),photoIds:()=>[],photoPrefix:'',context:(c,s,base)=>({...base,activeId:c.activeVersionId,semantic:x=>x,structure(){},validate:()=>[]}),apply:(c,cmd,ctx)=>kernel.applyDraftCommand(c.workflow,cmd,ctx)};
  const route=load('lib/versioned-shared-workflow.ts').versionedWorkflowRoute(adapter),before=JSON.stringify(db.prepare('SELECT * FROM shared_state').all());
  try{
   const response=await route.POST(new Request('https://synthetic.invalid/api/bom/workflow',{method:'POST',headers:{Origin:'https://synthetic.invalid',Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({command:command(flow,action)})}));
   const body=await response.json();assert.equal(response.status,action==='return'?200:409,JSON.stringify(body));
   if(action==='return'){
    const stored=JSON.parse((await core.readState()).values.syntheticDraft);assert.equal(stored.workflow.pendingId,null);assert.equal(stored.workflow.cases[0].result.selfReview,false);assert.deepEqual(JSON.parse(JSON.stringify(stored.workflow.saved)),flow.saved);assert.equal(JSON.parse((await core.readState()).values.platformUsers)[0].authEpoch,1);assert(writes>0);
   }else{assert.equal(body.error,'SELF_REVIEW_CONFIRM_REQUIRED');assert.equal(JSON.stringify(db.prepare('SELECT * FROM shared_state').all()),before);assert.equal(writes,0);}
  }finally{db.close();}
 }
});

function reviewDialog(language){
 const textarea={value:'',setCustomValidity(v){this.validity=v;},reportValidity(){this.reported=true;},focus(){}},form={},cancel={},input={checked:true};
 const dialog={dataset:{},setAttribute(k,v){this[k]=v;},querySelector(s){if(s==='textarea')return textarea;if(s==='form')return form;if(s==='[data-cancel]')return cancel;if(s==='input')return this.innerHTML.includes('vd-self-review')?input:null;throw Error('Unexpected selector '+s);},showModal(){},close(){this.closed=true;},remove(){}};
 const context={document:{documentElement:{lang:language},activeElement:null,body:{append(){}}},host:{ProcessSync:{identity:{id:author.id}}},create:()=>dialog,h:String,t:String};
 vm.createContext(context);const source=fs.readFileSync('public/process/version-draft-ui.js','utf8');
 vm.runInContext(source.slice(source.indexOf('  const reviewReasons='),source.indexOf('  // Adapters describe module-local buffers')),context);
 return {context,dialog,textarea,form,cancel};
}
void test('actual review dialog only shows self-approval confirmation for approve, in both languages',async()=>{
 for(const language of ['zh-TW','vi'])for(const action of ['reject','return','withdraw','approve']){
  const f=reviewDialog(language),promise=f.context.confirmReview({action,scope:'Synthetic review',selfReview:true,reason:'Synthetic correction'});
  assert.equal(f.dialog.innerHTML.includes('vd-self-review'),action==='approve',language+' '+action);
  assert.notEqual(f.dialog['aria-label'],undefined,action+' title');
  f.form.onsubmit({preventDefault(){}});const answer=await promise;assert.equal(answer.selfReviewConfirmed,action==='approve');assert.equal(answer.reason,'Synthetic correction');
 }
});
void test('return dialog still requires a reason and cancellation does not produce an operation',async()=>{
 const f=reviewDialog('vi'),promise=f.context.confirmReview({action:'reject',scope:'Synthetic pending',selfReview:true});
 f.form.onsubmit({preventDefault(){}});assert.equal(f.dialog.closed,undefined);assert.equal(f.textarea.reported,true);
 f.cancel.onclick();assert.equal(await promise,null);
});
