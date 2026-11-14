// Complete production controller/transport/ledger and signed API handlers.
// Memory SQLite/R2, generated identities, DOM and fault clock only; no live data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {setup} from './canvas-approved-history-fixture.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const posts=f=>f.calls.filter(c=>c.method==='POST');
async function ready(f){for(const [id,timer]of f.timers)if(timer.ms===0){f.timers.delete(id);timer.fn();}const deadline=Date.now()+5000;while(Date.now()<deadline){await new Promise(r=>setTimeout(r,10));if(!/內容驗證中|Đang kiểm tra nội dung/.test(f.root.textContent))return;}assert.fail('inspection did not settle');}
async function reviewPage(f){f.box.state.view='approval';f.box.render();await f.api.load();await ready(f);}
const button=(f,name)=>f.doc.querySelector('[data-process-review="'+name+'"]');
async function fixture(options={}){const f=await setup({pending:true,...options});f.box.scrollTo=()=>{};f.box.confirm=()=>true;f.box.VersionDraftUI.confirmReview=async()=>({reason:'Isolated QA',selfReviewConfirmed:true});await reviewPage(f);return f;}
async function approve(f){let opened;f.box.openSharedDraftHistory=async options=>{opened=options;};await button(f,'view').click();assert(opened,'real View handler opened current case');assert.equal(opened.reviewActions.find(x=>x.name==='approve').enabled,true);return opened.onReview('approve',opened.caseId);}
for(const inline of [false,true])for(const lang of ['zh','vi'])for(const action of ['withdraw','approve'])void test(`signed nonprimary ADMIN ${action} via review UI ${inline}/${lang}`,async t=>{
 const f=await fixture({inline,lang});t.after(f.close);assert.notEqual(f.f.user.id,'frank');const before=f.api.flow(),caseId=before.pendingId,saved=before.saved?.id??null,version=before.active.id;
 if(action==='withdraw')await button(f,action).click();else assert.equal(await approve(f),true);
 assert.equal(f.box.sharedDraftAccountState().unknown,false);assert.equal(f.api.flow().pendingId,null);
 const state=await f.f.decoded(),model=JSON.parse(state.processAuthoringControl),row=model.workflow.cases.find(x=>x.id===caseId);
 assert.equal(row.status,action==='approve'?'approved':'withdrawn');assert.equal(row.result.actor.id,f.f.user.id);
 assert.equal(model.activeVersionId,action==='approve'?caseId:version);assert.equal(model.workflow.saved?.id??null,action==='approve'?null:saved);
 const command=JSON.parse(posts(f).at(-1).body).command;assert.equal(command.expectedRevision,before.revision);
 const r=await f.f.load('app/api/process-authoring/workflow/route.ts').GET(new Request('https://fixture.invalid/api/process-authoring/workflow?caseMetadata=1&operationId='+command.operationId+'&accessEvent=1',{headers:f.f.headers}));assert.equal(r.status,200);assert.equal((await r.json()).operationAction,action);
});
for(const action of ['withdraw','approve'])for(const phase of ['dialog','post'])void test(`${action} ${phase}: duplicate click and cancel preserve one operation`,async t=>{
 const gate=deferred(),entered=deferred();let armed=false;
 const f=await fixture({intercept:async(url,o,send)=>{if(armed&&o.body&&JSON.parse(o.body).command?.action===action){entered.resolve();await gate.promise;}return send();}});t.after(f.close);
 let confirmations=0;f.box.VersionDraftUI.confirmReview=async()=>{confirmations++;if(phase==='dialog'){entered.resolve();await gate.promise;return null;}return{reason:'Synthetic',selfReviewConfirmed:true};};armed=true;
 const initial=f.f.row(),count=posts(f).length;
 let run,repeat;
 if(action==='withdraw'){const node=button(f,'withdraw');run=node.click();await entered.promise;repeat=node.click();}
 else{let open;f.box.openSharedDraftHistory=async o=>open=o;await button(f,'view').click();run=open.onReview(action,open.caseId);await entered.promise;repeat=open.onReview(action,open.caseId);}
 await repeat;assert.equal(confirmations,1);assert.equal(posts(f).length,count+(phase==='post'?1:0));
 if(phase==='post'){assert.match(f.root.textContent,/處理中/);assert.equal(f.box.sharedDraftAccountState().unknown,true);assert.doesNotMatch(f.root.textContent,/結果尚未確認/);}
 gate.resolve();await run;
 assert.equal(posts(f).length,count+(phase==='post'?1:0));if(phase==='dialog')assert.deepEqual(f.f.row(),initial);
});
for(const action of ['withdraw','approve'])void test(`${action}: changed page during confirmation sends zero writes`,async t=>{
 const gate=deferred(),entered=deferred(),f=await fixture();t.after(f.close);f.box.VersionDraftUI.confirmReview=async()=>{entered.resolve();await gate.promise;return{reason:'Synthetic',selfReviewConfirmed:true};};
 let run;if(action==='withdraw')run=button(f,'withdraw').click();else{let open;f.box.openSharedDraftHistory=async o=>open=o;await button(f,'view').click();run=open.onReview(action,open.caseId).catch(()=>false);}
 await entered.promise;const count=posts(f).length;f.api.navigation.reset();f.box.state.view='dashboard';f.root.innerHTML='<p>DESTINATION</p>';gate.resolve();await run;assert.equal(posts(f).length,count);assert.equal(f.root.textContent,'DESTINATION');
});
for(const action of ['withdraw','approve'])void test(`${action}: late response after page change cannot repaint destination`,async t=>{
 const gate=deferred(),entered=deferred();let armed=false;const f=await fixture({intercept:async(url,o,send)=>{const r=await send();if(armed&&o.body&&JSON.parse(o.body).command?.action===action){entered.resolve();await gate.promise;}return r;}});t.after(f.close);armed=true;
 const run=action==='withdraw'?button(f,action).click():approve(f);await entered.promise;const count=posts(f).length;f.api.navigation.reset();f.box.state.view='dashboard';f.root.innerHTML='<p>DESTINATION</p>';gate.resolve();await run;assert.equal(f.root.textContent,'DESTINATION');assert.equal(posts(f).length,count);assert.equal(f.box.sharedDraftAccountState().unknown,false);
});
for(const action of ['withdraw','approve'])void test(`${action}: lost reply,404,wrong action,reload and original receipt never replay`,async t=>{
 let armed=false,lookup='404';const f=await fixture({intercept:async(url,o,send)=>{
  if(!armed)return send();const cmd=o.body&&JSON.parse(o.body).command;if(cmd?.action===action){const r=await send();assert.equal(r.status,200);throw Error('Synthetic ACK loss after commit');}
  if(url.includes('operationId=')){if(lookup==='404')return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});const r=await send();if(lookup==='wrong'){const b=await r.json();return Response.json({...b,operationAction:'different'});}return r;}return send();
 }});t.after(f.close);armed=true;const count=posts(f).length;if(action==='withdraw')await button(f,action).click();else assert.equal(await approve(f),false);
 assert.equal(posts(f).length,count+1);assert.equal(f.box.sharedDraftAccountState().unknown,true);const command=JSON.parse(posts(f).at(-1).body).command,marker=[...f.session.data];assert.match(f.root.textContent,/結果尚未確認/);assert.match(f.root.textContent,new RegExp(command.operationId));
 await button(f,'receipt').click();assert.deepEqual([...f.session.data],marker);assert.equal(posts(f).length,count+1);
 lookup='wrong';await button(f,'receipt').click();assert.equal(f.box.sharedDraftAccountState().unknown,true);assert.deepEqual([...f.session.data],marker);
 // New controller and transport in the same retained session storage. The
 // production transport rediscovers its exact original command, no guessed ID.
 vm.runInContext(fs.readFileSync('public/process/process-authoring-v3.js','utf8'),f.box);f.api=f.box.ProcessAuthoringV3;await f.api.load();assert.equal(f.box.sharedDraftAccountState().unknown,true);assert.match(f.root.textContent,new RegExp(command.operationId));
 lookup='valid';await button(f,'receipt').click();assert.equal(f.box.sharedDraftAccountState().unknown,false);assert.equal(posts(f).length,count+1);assert.equal(f.api.flow().pendingId,null);
 assert(f.calls.filter(c=>c.url.includes('operationId=')).every(c=>c.method==='GET'&&c.url.includes('accessEvent=1')));
});
for(const role of ['admin','staff'])for(const same of [true,false])for(const action of ['withdraw','approve'])void test(`actor matrix ${role}/${same?'submitter':'other'}/${action}`,async t=>{
 const user={id:same?'fixture':'qa-'+crypto.randomUUID(),name:'Generated QA '+role,role,enabled:true,inheritRole:true,accessOverrides:Object.fromEntries(['view','withdraw','approve','return'].map(op=>['editor.'+op,true]))};
 const f=await fixture({user});t.after(f.close);const pending=f.api.flow().cases.find(c=>c.id===f.api.flow().pendingId);assert.equal(pending.actor.id===user.id,same);
 if(action==='withdraw')await button(f,action).click();else assert.equal(await approve(f),true);const value=JSON.parse((await f.f.decoded()).processAuthoringControl).workflow;
 assert.equal(value.pendingId,null);assert.equal(value.cases.at(-1).result.actor.id,user.id);assert.equal(value.cases.at(-1).result.selfReview,action==='approve'&&same);
});
for(const role of ['admin','staff'])for(const action of ['submit','withdraw','approve'])void test(`fresh ${role} explicit ${action} denial preserves data`,async t=>{
 const f=await fixture({user:{accessOverrides:{['editor.'+action]:false},role}});t.after(f.close);const route=f.f.load('app/api/process-authoring/workflow/route.ts'),before=f.f.row(),flow=f.api.flow();
 const cmd={action,operationId:crypto.randomUUID(),clientId:'isolated-denial',sequence:1,generation:flow.generation,expectedRevision:flow.revision,caseId:flow.pendingId,savedId:'synthetic',reason:'QA'};
 const r=await route.POST(new Request('https://fixture.invalid/api/process-authoring/workflow?caseMetadata=1',{method:'POST',headers:f.f.headers,body:JSON.stringify({command:cmd})}));assert.equal(r.status,403);assert.equal((await r.json()).error,'FORBIDDEN');assert.deepEqual(f.f.row(),before);
});
void test('other account cannot read a committed operation receipt',async t=>{
 const f=await fixture();t.after(f.close);await button(f,'withdraw').click();const cmd=JSON.parse(posts(f).at(-1).body).command;
 const other={id:'qa-'+crypto.randomUUID(),name:'Generated other admin',role:'admin',enabled:true,authEpoch:1};await f.f.mutateValues(v=>v.platformUsers=JSON.stringify([...JSON.parse(v.platformUsers),other]));
 const request=new Request('https://fixture.invalid/api/process-authoring/workflow?caseMetadata=1&operationId='+cmd.operationId+'&accessEvent=1'),token=await f.f.core.demoSession(request,other.id,false,1),headers={...f.f.headers,Cookie:f.f.core.sessionCookie(request,token).split(';')[0]};
 const r=await f.f.load('app/api/process-authoring/workflow/route.ts').GET(new Request(request,{headers}));assert.equal(r.status,403);assert.equal((await r.json()).error,'FORBIDDEN');
});
void test('genuine main predecessor reproduces missing review receipt recovery UI',async t=>{
 let armed=false;const f=await fixture({intercept:async(url,o,send)=>{if(!armed)return send();if(o.body&&JSON.parse(o.body).command?.action==='withdraw'){await send();throw Error('Synthetic lost ACK');}if(url.includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});return send();}});t.after(f.close);
 const {createRequire}=await import('node:module'),proof=createRequire(import.meta.url)('../scripts/process-review-source-contract.cjs');
 vm.runInContext(proof.restore(fs.readFileSync('public/process/process-authoring-v3.js'),'public/process/process-authoring-v3.js').toString(),f.box);f.api=f.box.ProcessAuthoringV3;await f.api.load();armed=true;
 await button(f,'withdraw').click();assert.equal(f.box.sharedDraftAccountState().unknown,true);assert.equal(button(f,'receipt'),null);assert.doesNotMatch(f.root.textContent,/查原操作收據/);assert.equal(posts(f).length,1);
});
// Latest confirmed policy is opt-in through trusted persisted page-v1 evidence.
// These changes exist only in generated in-memory fixture state, never a Site.
async function installPolicy(f,{high=false,moduleReviewer=false,correction=false,provenance=true}={}){
 await f.f.mutateValues(values=>{const users=JSON.parse(values.platformUsers),user=users.find(u=>u.id===f.f.user.id);user.accessOverrides={...user.accessOverrides,'approval.view':true,'approval.approve':high,'editor.view':true,'editor.edit':false,'editor.save':false,'editor.submit':false,'editor.withdraw':correction,'editor.return':false,'editor.approve':moduleReviewer};values.platformUsers=JSON.stringify(users);values.processAccessControl=JSON.stringify({schemaVersion:2,primaryAdminId:'frank',draftReviewPolicy:'page-v1',audit:high&&provenance?[{id:crypto.randomUUID(),actor:{id:'frank',role:'admin'},target:user.id,action:'update-user',before:{accessOverrides:{'approval.approve':false}},after:{accessOverrides:{'approval.approve':true}}}]:[]});});
 await f.api.load();await ready(f);
}
async function directCommand(f,action,extra={}){
 const flow=f.api.flow(),command={action,operationId:crypto.randomUUID(),clientId:'isolated-policy',sequence:1,generation:flow.generation,expectedRevision:flow.revision,caseId:flow.pendingId,reason:'Generated policy QA',...extra};
 const response=await f.f.load('app/api/process-authoring/workflow/route.ts').POST(new Request('https://fixture.invalid/api/process-authoring/workflow?caseMetadata=1',{method:'POST',headers:f.f.headers,body:JSON.stringify({command})}));return{status:response.status,body:await response.json(),command};
}
for(const inline of [false,true])for(const action of ['withdraw','return'])void test(`adopted module reviewer can ${action} but cannot finally approve ${inline}`,async t=>{
 const f=await fixture({inline,user:{id:'qa-'+crypto.randomUUID(),role:'staff'}});t.after(f.close);await installPolicy(f,{moduleReviewer:true});
 const before=f.f.row();assert.equal((await directCommand(f,'approve')).status,403);assert.deepEqual(f.f.row(),before);
 let opened;f.box.openSharedDraftHistory=async o=>opened=o;await button(f,'view').click();assert.equal(opened.reviewActions.find(x=>x.name==='approve').enabled,false);assert.equal(opened.reviewActions.find(x=>x.name==='return').enabled,true);
 if(action==='withdraw')await button(f,action).click();else assert.equal(await opened.onReview(action,opened.caseId),true);
 assert.equal(f.api.flow().pendingId,null);assert.equal(JSON.parse((await f.f.decoded()).processAuthoringControl).workflow.cases.at(-1).status,action==='withdraw'?'withdrawn':'returned');
});
for(const action of ['withdraw','return'])void test(`adopted correction-only grant treats ${action} identically`,async t=>{
 const f=await fixture({user:{role:'staff'}});t.after(f.close);await installPolicy(f,{correction:true});const result=await directCommand(f,action);assert.equal(result.status,200);assert.equal(result.body.control.workflow.pendingId,null);
});
for(const inline of [false,true])void test(`platform final approval includes correction but never edit; approved case cannot withdraw ${inline}`,async t=>{
 const f=await fixture({inline,user:{id:'qa-'+crypto.randomUUID(),role:'staff'}});t.after(f.close);await installPolicy(f,{high:true});
 const access=(await f.f.load('app/api/process-authoring/workflow/route.ts').GET(new Request('https://fixture.invalid/api/process-authoring/workflow?permissions=1',{headers:f.f.headers})));const rights=(await access.json()).permissions;
 for(const key of ['view','submit','withdraw','return','approve'])assert.equal(rights[key],true,key);for(const key of ['edit','save'])assert.equal(rights[key],false,key);
 assert.equal(await approve(f),true);const before=f.f.row(),result=await directCommand(f,'withdraw',{caseId:'pending-case'});assert.equal(result.status,409);assert.equal(result.body.error,'BEGIN_REQUIRED');assert.deepEqual(f.f.row(),before);
});
void test('platform-looking grant without retained confirmation evidence fails closed',async t=>{
 const f=await fixture({user:{id:'qa-'+crypto.randomUUID(),role:'staff'}});t.after(f.close);await installPolicy(f,{high:true,provenance:false});for(const action of ['submit','withdraw','return','approve']){const before=f.f.row();assert.equal((await directCommand(f,action)).status,403);assert.deepEqual(f.f.row(),before);}
});
for(const high of [false,true])void test(`adopted ${high?'platform approver':'module reviewer'} submits a genuine fixed saved version`,async t=>{
 const f=await setup({pending:false,user:{id:'qa-'+crypto.randomUUID(),role:'staff'}});t.after(f.close);f.box.scrollTo=()=>{};f.box.alert=()=>{};f.box.ProcessEditorV2.departure.inspect=()=>({state:'clean'});f.canvas.edit(JSON.stringify(['G','A']),'A-CUT',[{id:'one',f:'name',value:'Generated substantive policy content'}]);assert.equal(await f.api.save(),true);await ready(f);await installPolicy(f,{high,moduleReviewer:!high});
 f.box.VersionDraftUI.confirmSubmit=async()=> 'Generated policy submit';const b=f.doc.querySelector('[data-av3=submit]');assert.equal(b.disabled,false);await b.click();assert.ok(f.api.flow().pendingId);assert.equal(f.box.sharedDraftAccountState().unknown,false);
});
for(const action of ['withdraw','approve'])void test(`${action}: account replacement cannot accept old reply or discard its original operation`,async t=>{
 const gate=deferred(),entered=deferred();let armed=false;const f=await fixture({intercept:async(url,o,send)=>{const response=await send();if(armed&&o.body&&JSON.parse(o.body).command?.action===action){entered.resolve();await gate.promise;}return response;}});t.after(f.close);armed=true;
 const run=action==='withdraw'?button(f,action).click():approve(f);await entered.promise;const marker=[...f.session.data],count=posts(f).length;assert(marker.length);
 f.api.navigation.reset();f.box.ProcessSync.identity={id:'qa-replacement-'+crypto.randomUUID()};f.box.state.view='dashboard';f.root.innerHTML='<p>NEW ACCOUNT DESTINATION</p>';gate.resolve();await run;
 assert.equal(f.root.textContent,'NEW ACCOUNT DESTINATION');assert.equal(posts(f).length,count);assert.deepEqual([...f.session.data],marker,'old actor keeps exact unresolved original bytes');assert.equal(f.box.sharedDraftAccountState().unknown,false,'old actor unknown is not attributed to the replacement actor');
});
