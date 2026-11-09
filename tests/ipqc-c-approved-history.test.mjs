// Real C module + common UI + primary transport + C GET route. Only DOM,
// storage/fetch, SQLite and R2 ports are synthetic; no browser/live acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {fixture,clone,turn,posts} from './ipqc-c-approved-history-fixture.mjs';
const require=createRequire(import.meta.url),serverFixture=require('../scripts/ipqc-c-operation-fixture.cjs').fixture;
const at='2026-11-08T00:00:00.000Z',actor={id:'preview-editor',name:'Synthetic editor'};
const snapshot={errors:[{id:'E1',name:'Approved name',note:'',code:'C-1-L1',productCode:'P1',stageCode:'S1'}],items:[]};
function historyControl(){
 const row=(id,number,status='superseded')=>({id,number,status,snapshot:clone(snapshot),baseVersionId:null,revision:1,creatorId:actor.id,creatorName:actor.name,createdAt:at,updatedAt:at,history:[]});
 const versions=[row('formal',1,'approved'),row('approved-case',2),row('shared-superseded',3),row('unapproved',4),row('pending-case',5,'pending'),row('returned',6,'returned'),row('withdrawn',7,'withdrawn'),row('missing-result',8),row('missing-save',9)];
 for(let i=0;i<23;i++){const v=row('legacy-'+i,10+i);v.history.push({action:'approved',actorId:actor.id,actorName:actor.name,at});versions.push(v);}
 const c={id:'approved-case',savedId:'saved-reviewed',baseId:null,actor,at,reason:'Synthetic approved',status:'approved',content:clone(snapshot),before:{errors:[],items:[]},result:{actor,at,reason:'Reviewed'}};
 versions[1].snapshot.errors[0].name='Untrusted mutable projection';
 return {schemaVersion:1,activeVersionId:'formal',source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions,workflow:{schemaVersion:3,scope:'ipqc-c',generation:'g1',revision:1,active:{id:'formal',content:clone(snapshot)},baseId:'formal',working:clone(snapshot),saved:null,pendingId:'pending-case',contributors:{},saves:[],cases:[c,{...clone(c),id:'missing-result',result:undefined},{...clone(c),id:'missing-save',savedId:''},{...clone(c),id:'pending-case',status:'pending',result:undefined}],tombstones:[],sequences:{},receipts:{}}};
}
const until=async check=>{for(let i=0;i<200;i++){if(check())return;await turn();}throw Error('fixture wait expired');};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
async function setup(t,{mode='ok'}={}){
 const server=await serverFixture({ipqcCMasterControl:JSON.stringify(historyControl())});t.after(()=>server.close());
 const get=(url,who='editor')=>server.load('app/api/ipqc-c/workflow/route.ts').GET(new Request(new URL(url,'http://fixture'),{headers:server.sessions[who]}));
 const f=await fixture({mode});t.after(()=>f.close());let mutate=null,bodyHook=null;
 f.response(async event=>{if(!event.url.includes('approvedOnly=1')&&!event.url.includes('permissions=1'))return null;let result=await get(event.url);if(mutate&&result.ok)result=Response.json(mutate(await result.json(),event.url));return bodyHook?bodyHook(result,event.url):result;});
 f.common();const client=f.api.sharedTransport(),q=selector=>f.document.querySelector(selector);
 const ready=()=>q('#ipqcc-approved-version')&&q('[data-approved-notice]').textContent!=='載入中…'&&q('[data-approved-notice]').textContent!=='Đang tải…';
 const select=id=>{const choice=q('#ipqcc-approved-version');choice.value=id;return choice.onchange();};
 const open=async()=>{await q('#ipqcc-approved-version').onfocus();};
 const choose=async id=>{assert(q('#ipqcc-approved-version').querySelectorAll('option').some(o=>o.value===id),id+' listed');await select(id);};
 return {f,client,server,get,q,open,choose,select,ready,mutate:fn=>mutate=fn,body:fn=>bodyHook=fn};
}
void test('real C approved-only route filters retained drafts and uses immutable reviewed content without writes',async t=>{
 const x=await setup(t),before=x.server.snapshot();const first=await (await x.get('/api/ipqc-c/workflow?approvedOnly=1&uiHistory=1')).json();assert.equal(first.versions.rows.length,20);assert.equal(first.versions.total,24);
 const second=await (await x.get('/api/ipqc-c/workflow?approvedOnly=1&uiHistory=1&versionBefore='+first.versions.next)).json();assert.deepEqual(second.versions.rows.map(v=>v.id),['legacy-2','legacy-1','legacy-0','approved-case']);
 for(const id of ['formal','pending-case','returned','withdrawn','shared-superseded','unapproved','missing-result','missing-save'])assert.equal((await x.get('/api/ipqc-c/workflow?approvedOnly=1&versionId='+id)).status,404,id);
 const selected=await (await x.get('/api/ipqc-c/workflow?approvedOnly=1&versionId=approved-case')).json();assert.equal(selected.version.snapshot.errors[0].name,'Approved name');assert.equal(selected.version.approvalEvidence.savedId,'saved-reviewed');assert.deepEqual(x.server.snapshot(),before);
 for(const query of ['uiHistory=1&caseId=approved-case','versionId=approved-case&restoreSaveId=saved-reviewed','uiHistory=1&versionId=approved-case','uiHistory=1&approvedOnly=0','uiHistory=1&uiHistory=1','uiHistory=1&saveBefore=old'])assert.equal((await x.get('/api/ipqc-c/workflow?approvedOnly=1&'+query)).status,422,query);
 assert.equal((await x.get('/api/ipqc-c/workflow?approvedOnly=1&uiHistory=1','no-view')).status,403);
});
void test('real common C history preserves working, RAM form, active receipt and storage through list/detail/return',async t=>{
 const x=await setup(t);x.f.start();x.f.edit('RAM applied');await x.f.api.apply();x.f.start();x.f.edit('RAM open form');const state=JSON.stringify(x.f.api.state()),storage=[...x.f.data],working=x.f.api.state().working,form=x.f.api.state().modal;
 const before=x.server.snapshot();await x.open();assert.equal(x.q('#ipqcc-approved-version').querySelectorAll('option').length,22);await x.select('__more');await x.choose('approved-case');assert.match(x.q('[data-ipqcc-approved-view]').textContent,/Approved name/);assert(!x.q('[data-ipqcc-approved-view]').textContent.includes('Untrusted mutable projection'));assert.equal(x.q('[data-ipqcc-approved-view]').querySelectorAll('input,textarea,button').length,0);
 await x.choose('');assert(x.q('[data-ipqcc-approved-view]').hidden);assert.equal(JSON.stringify(x.f.api.state()),state);assert.strictEqual(x.f.api.state().working,working);assert.strictEqual(x.f.api.state().modal,form);assert.deepEqual([...x.f.data],storage);assert.deepEqual(x.server.snapshot(),before);assert.equal(posts(x.f).length,0);assert(x.f.calls.every(c=>!c.url.includes('operationId=')));assert(x.f.box.IPQCCUI.historyDisplay.current());
});
for(const change of ['actor','epoch','delivery','reset','remount','cancel','pagehide'])void test('late selected history '+change+' cannot change authority, DOM, input or receipts',async t=>{
 const x=await setup(t);await x.open();const gate=deferred(),entered=deferred();x.body((response,url)=>{if(!url.includes('versionId='))return response;const json=response.json.bind(response);response.json=async()=>{entered.resolve();await gate.promise;return json();};return response;});
 x.select('legacy-22');await entered.promise;
 if(change==='actor')x.f.actor('different');if(change==='epoch')x.f.epoch(2);if(change==='delivery')x.f.delivery();if(change==='reset')x.f.box.IPQCCUI.navigation.reset();if(change==='remount')x.f.api.draw();if(change==='cancel')await x.choose('');if(change==='pagehide')x.f.box.dispatchEvent({type:'pagehide'});
 const state=JSON.stringify(x.f.api.state()),storage=[...x.f.data],focus=x.f.document.activeElement,permissions=x.client.permission('view'),count=x.f.calls.length;
 gate.resolve();await turn();await turn();assert.equal(JSON.stringify(x.f.api.state()),state);assert.deepEqual([...x.f.data],storage);assert.strictEqual(x.f.document.activeElement,focus);assert.equal(x.client.permission('view'),permissions);assert.equal(x.f.calls.length,count);assert.equal(posts(x.f).length,0);assert(!x.q('[data-ipqcc-approved-view]')?.textContent.includes('Approved name'));
});
for(const malformed of ['not-approved','wrong-id','missing-proof','missing-items','missing-permissions','stale-revision'])void test('C fails closed on '+malformed+' detail',async t=>{
 const x=await setup(t);await x.open();const before=JSON.stringify(x.f.api.state());x.mutate((result,url)=>{if(!url.includes('versionId='))return result;if(malformed==='not-approved')result.version.status='pending';if(malformed==='wrong-id')result.version.id='wrong';if(malformed==='missing-proof')delete result.version.approvalEvidence.approvedAt;if(malformed==='missing-items')delete result.version.snapshot.items;if(malformed==='missing-permissions')delete result.permissions.edit;if(malformed==='stale-revision')result.revision=0;return result;});await x.choose('legacy-22');assert.equal(x.q('[data-ipqcc-approved-view]').textContent,'');assert.match(x.q('[data-approved-notice]').textContent,/APPROVED_HISTORY_|ACCESS_READ_SUPERSEDED/);assert.equal(JSON.stringify(x.f.api.state()),before);assert.equal(posts(x.f).length,0);
});
void test('C history while original UNKNOWN and pending does not look up, settle, replay or unlock',async t=>{
 const x=await setup(t,{mode:'unknown404'});await assert.rejects(x.client.sendPrepared(x.client.prepare('g1','save',{})));x.f.api.state().control.workflow.pendingId='pending';const before=JSON.stringify(x.f.api.state()),storage=[...x.f.data],flight=x.f.api.flight();x.f.calls.length=0;
 await x.open();await x.choose('legacy-22');await x.choose('');assert.equal(x.client.hasUnknown(),true);assert.equal(JSON.stringify(x.f.api.state()),before);assert.deepEqual([...x.f.data],storage);assert.strictEqual(x.f.api.flight(),flight);assert.equal(posts(x.f).length,0);assert(x.f.calls.every(c=>!c.url.includes('operationId=')));assert(![...x.f.timers.values()].some(t=>t.ms===4000));
});
void test('C accepted access revocation clears visible historical data, preserves RAM and closes safely',async t=>{
 const x=await setup(t);x.f.start();x.f.edit('RAM retained');await x.open();await x.choose('legacy-22');const before=JSON.stringify(x.f.api.state());x.body((response,url)=>url.includes('permissions=1')?Response.json({error:'FORBIDDEN'},{status:403}):response);
 await assert.rejects(x.client.permissions());assert.equal(x.q('[data-ipqcc-approved-view]').textContent,'');assert.equal(x.q('#ipqcc-approved-version').querySelectorAll('option').length,2);assert.equal(JSON.stringify(x.f.api.state()),before);await x.choose('');assert(x.q('[data-ipqcc-approved-view]').hidden);assert(x.q('#ipqcc-approved-version').disabled);assert(!x.f.box.IPQCCUI.historyDisplay.current());assert.equal(posts(x.f).length,0);
});
for(const lang of ['zh','vi'])void test(lang+' inline selector retains focus, has no modal and returns through the same selector',async t=>{
 const x=await setup(t);x.f.document.documentElement.lang=lang;x.f.api.render(lang);x.f.common();const select=x.q('#ipqcc-approved-version');select.focus();await x.open();assert.match(select.textContent,lang==='zh'?/當前共用草稿/:/Bản nháp chung hiện tại/);await x.choose('legacy-22');assert.strictEqual(x.f.document.activeElement,select);assert.equal(x.f.document.querySelectorAll('[role="dialog"]').length,0);assert(!x.q('[data-ipqcc-approved-view]').hidden);await x.choose('');assert.strictEqual(x.f.document.activeElement,select);assert(x.q('[data-ipqcc-approved-view]').hidden);assert.equal(posts(x.f).length,0);
});
void test('historical selection and selection load fail closed for direct C mutation entrypoints',async t=>{
 const x=await setup(t);await x.open();const before=JSON.stringify(x.f.api.state());await x.choose('legacy-22');for(const action of ['save','begin','submit','apply','create-error']){await x.f.api.write(action,{});await x.f.api.writeShared(action,{});}assert.equal(JSON.stringify(x.f.api.state()),before);assert.equal(posts(x.f).length,0);assert(!x.f.box.IPQCCUI.historyDisplay.current());
 const gate=deferred(),entered=deferred();await x.choose('');x.body((response,url)=>{if(!url.includes('versionId='))return response;const json=response.json.bind(response);response.json=async()=>{entered.resolve();await gate.promise;return json();};return response;});x.select('legacy-22');await entered.promise;assert(!x.f.box.IPQCCUI.historyDisplay.current());await x.f.api.write('save',{});assert.equal(posts(x.f).length,0);gate.resolve();await until(()=>x.ready());
});
void test('C UI source has no old archive/restore chooser or periodic refresh; shared adapter admits only explicit C and IQC adapters',()=>{
 const c=fs.readFileSync('public/process/ipqc-c.js','utf8'),ui=fs.readFileSync('public/process/version-draft-ui.js','utf8');for(const text of ['scheduleSharedRefresh','pollTimer','openSharedDraftHistory','previewSharedDraftRestore','loadCaseHistory','caseHistoryHTML','id="ipqcc-version"'])assert(!c.includes(text),text);assert(ui.includes("if(['IPQC-C','IQC'].includes(model.module)&&typeof model.mountApprovedHistory==='function')"));
});
void test('historical equipment and media never borrow the current registry or mutable draft',async t=>{
 const x=await setup(t);x.f.api.equipment([{id:'gauge',name:'CURRENT REGISTRY MUST NOT APPEAR',photoId:'c'.repeat(64)}]);x.mutate((result,url)=>{if(url.includes('versionId='))result.version.snapshot.items=[{id:'historic-item',code:'H-1',equipmentId:'gauge',equipmentSnapshot:null,mediaItems:[{id:'a'.repeat(64),name:'Historical photo'}]}];return result;});await x.open();await x.choose('legacy-22');const display=x.q('[data-ipqcc-approved-view]');assert(!display.textContent.includes('CURRENT REGISTRY'));assert.match(display.textContent,/缺少歷史檢具快照/);const img=display.querySelector('img');assert(img.getAttribute('src').includes('a'.repeat(64)));assert(!img.getAttribute('src').includes('c'.repeat(64)));img.onerror();assert.match(display.textContent,/無法讀取此歷史版本圖片/);assert.equal(posts(x.f).length,0);
});
void test('direct mount, manual reread and unchanged view start no background polling',async t=>{
 const x=await setup(t);x.f.calls.length=0;await x.f.box.IPQCCUI.mount(x.f.area);assert(x.f.calls.some(c=>c.url.startsWith('/api/ipqc-c?')));const count=x.f.calls.length;for(let i=0;i<4;i++)await turn();assert.equal(x.f.calls.length,count);assert(!x.f.calls.some(c=>c.url.includes('approvedOnly=')));await x.f.api.read(false);assert(x.f.calls.length>count);assert(![...x.f.timers.values()].some(timer=>timer.ms===4000));assert.equal(posts(x.f).length,0);
});
void test('older ordinary content read cannot overwrite RAM after history selection starts',async t=>{
 const x=await setup(t);await x.open();const gate=deferred(),entered=deferred();x.f.hook(event=>{if(event.url.startsWith('/api/ipqc-c?')){entered.resolve();return gate.promise;}});const read=x.f.api.read(false),rejected=assert.rejects(read,/IPQCC_READ_SUPERSEDED/);await entered.promise;await x.choose('legacy-22');const before=JSON.stringify(x.f.api.state());gate.resolve();await rejected;assert.equal(JSON.stringify(x.f.api.state()),before);assert(!x.q('[data-ipqcc-approved-view]').hidden);assert.equal(posts(x.f).length,0);
});
for(const change of ['revision','revoke'])void test('real C handler rechecks '+change+' after selected immutable-body hydration before returning bytes',async t=>{
 const x=await setup(t),original=x.server.env.STATE_ARCHIVE.get.bind(x.server.env.STATE_ARCHIVE),gate=deferred(),entered=deferred();let armed=true;
 x.server.env.STATE_ARCHIVE.get=async key=>{const object=await original(key);if(armed&&object){const raw=await object.text();let body;try{body=JSON.parse(raw);}catch{}if(body&&Array.isArray(body.errors)&&body.errors[0]?.name==='Approved name'&&Array.isArray(body.items)){armed=false;entered.resolve();await gate.promise;}}return object;};
 const pending=x.get('/api/ipqc-c/workflow?approvedOnly=1&versionId=approved-case');await entered.promise;
 if(change==='revision')x.server.db.prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1').run();
 else {const state=await x.server.core.readState(),users=JSON.parse(state.values.platformUsers);users.find(u=>u.id==='preview-editor').accessOverrides['ipqc-c.view']=false;state.values.platformUsers=JSON.stringify(users);const encoded=await x.server.load('lib/state-records.ts').encodeRecordValues(x.server.env.STATE_ARCHIVE,state.values,state.recordStorage);x.server.db.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').run(state.revision+1,encoded);}
 gate.resolve();const response=await pending;assert.equal(response.status,change==='revision'?409:403);const body=await response.json();assert.equal(body.version,undefined);assert.equal(body.versions,undefined);
});
void test('retained editor input/change/photo and delegated draft handlers cannot alter RAM while history is selected',async t=>{
 const x=await setup(t);x.f.start();x.f.edit('RAM protected');const form=x.f.area.querySelector('#ipqcc-editor'),page=x.f.area.querySelector('#ipqcc-page'),input=form.querySelector('input');await x.open();await x.choose('legacy-22');const before=JSON.stringify(x.f.api.state()),storage=[...x.f.data],count=x.f.calls.length;
 input.name='name';input.value='STALE MUTATION';form.dispatchEvent({type:'input',target:input});form.dispatchEvent({type:'change',target:{name:'inspectionMode',value:'equipment'},currentTarget:form});
 const close=x.f.document.createElement('button');close.id='ipqcc-cancel';page.append(close);page.dispatchEvent({type:'click',target:close});
 const photo=x.f.document.createElement('input');photo.files=[{name:'stale.png'}];photo.id='ipqcc-photo-input';form.append(photo);form.dispatchEvent({type:'input',target:{dataset:{photoNote:0},value:'stale'}});
 await x.f.api.checkPreviousOperation();await x.f.api.checkPreviousOperation(true);await x.f.api.openLegacyReceipts();await assert.rejects(x.f.api.queryLegacyReceipt('none'),/READ_ONLY/);
 assert.equal(JSON.stringify(x.f.api.state()),before);assert.deepEqual([...x.f.data],storage);assert.equal(x.f.calls.length,count);assert(!x.q('[data-ipqcc-approved-view]').hidden);
 await x.choose('');form.dispatchEvent({type:'input',target:input});assert.equal(x.f.api.state().modal.fields.name,'STALE MUTATION');
});
void test('retained original UNKNOWN query button does not look up or settle from history',async t=>{
 const x=await setup(t,{mode:'unknown404'});await assert.rejects(x.client.sendPrepared(x.client.prepare('g1','save',{})));x.f.api.draw();const button=x.f.area.querySelector('#ipqcc-check-operation');assert(button);await x.open();await x.choose('legacy-22');const storage=[...x.f.data],state=JSON.stringify(x.f.api.state()),count=x.f.calls.length;button.click();await x.f.api.checkPreviousOperation();await turn();assert.equal(x.f.calls.length,count);assert.equal(x.client.hasUnknown(),true);assert.deepEqual([...x.f.data],storage);assert.equal(JSON.stringify(x.f.api.state()),state);assert(!x.q('[data-ipqcc-approved-view]').hidden);
});
void test('upload completion across historical selection and return is rejected before it can bind RAM',async t=>{
 const x=await setup(t);await x.open();const gate=deferred(),entered=deferred(),fetch=x.f.box.fetch;x.f.box.fetch=async(url,options)=>{if(options.method==='PUT'){entered.resolve();await gate.promise;return Response.json({id:'a'.repeat(64)});}return fetch(url,options);};const pending=x.f.api.upload({size:10,type:'image/png'}),rejected=assert.rejects(pending,/IPQCC_READ_SUPERSEDED/);await entered.promise;await x.choose('legacy-22');await x.choose('');const before=JSON.stringify(x.f.api.state());gate.resolve();await rejected;assert.equal(JSON.stringify(x.f.api.state()),before);
});
void test('invalid historical photo reference is marked missing without a substituted URL',async t=>{
 const x=await setup(t);x.mutate((result,url)=>{if(url.includes('versionId='))result.version.snapshot.items=[{id:'historic',equipmentId:'',mediaItems:[{id:'invalid',name:'Missing evidence'}]}];return result;});await x.open();await x.choose('legacy-22');const display=x.q('[data-ipqcc-approved-view]');assert.match(display.textContent,/缺少可核對的歷史圖片資料/);assert.equal(display.querySelectorAll('img').length,0);
});
void test('old bound input and file callbacks retire across history/current roundtrip; current bindings work once',async t=>{
 const x=await setup(t);x.f.api.startEditor('item',{id:'item-fixture',standard:'Current',description:'Current description',mediaItems:[],equipmentId:'',standardEnabled:true});const form=x.f.area.querySelector('#ipqcc-editor'),file=x.f.area.querySelector('#ipqcc-photo-input'),old={};
 for(const [node,key,type]of [[form,'input','input'],[file,'file','change']]){const add=node.addEventListener.bind(node);node.addEventListener=(name,callback,options)=>{if(name===type&&!old[key])old[key]=callback;return add(name,callback,options);};}
 x.f.api.bind();await x.open();await x.choose('legacy-22');assert(form.closest('.ipqcc-overlay').hidden);assert(fs.readFileSync('public/process/iqc-master.css','utf8').includes('body:has(.ipqcc-overlay:not([hidden]))'));await x.choose('');const before=JSON.stringify(x.f.api.state());
 const event={target:{name:'description',dataset:{},type:'text',value:'stale callback'}};old.input(event);old.file({target:{files:[{name:'old.png'}]}});assert.equal(JSON.stringify(x.f.api.state()),before);
 form.dispatchEvent({type:'input',...event});assert.equal(x.f.api.state().modal.fields.description,'stale callback');
 const blob=new Blob(['synthetic'],{type:'image/png'});blob.name='new.png';file.dispatchEvent({type:'change',target:{files:[blob]}});assert.equal(x.f.api.state().modal.photos.length,1,'no duplicate active listener');
});
void test('language events retain selected approved version and readonly state without exposing working or POST',async t=>{
 const x=await setup(t);x.f.start();x.f.edit('RAM protected');await x.open();await x.choose('legacy-22');const before=JSON.stringify(x.f.api.state()),count=x.f.calls.length;
 for(const language of ['vi','zh']){x.f.document.documentElement.lang=language;x.f.box.dispatchEvent({type:'process-language-change',detail:{language}});assert.equal(x.q('#ipqcc-approved-version').value,'legacy-22');assert(!x.q('[data-ipqcc-approved-view]').hidden);assert(x.f.area.querySelector('#ipqcc-editor').closest('.ipqcc-overlay').hidden);assert(!x.f.box.IPQCCUI.historyDisplay.current());assert.equal(JSON.stringify(x.f.api.state()),before);}
 assert.equal(x.f.calls.length,count);assert.equal(posts(x.f).length,0);
});
void test('explicit denial then fresh regrant cannot revive an old held selected body',async t=>{
 const x=await setup(t);await x.open();const gate=deferred(),entered=deferred();let deny=false;x.body((response,url)=>{if(url.includes('permissions=1')&&deny)return Response.json({error:'FORBIDDEN'},{status:403});if(!url.includes('versionId='))return response;const json=response.json.bind(response);response.json=async()=>{entered.resolve();await gate.promise;return json();};return response;});x.select('legacy-22');await entered.promise;deny=true;await assert.rejects(x.client.permissions());deny=false;await x.client.permissions();assert.equal(x.q('#ipqcc-approved-version').disabled,false,'accepted regrant enables the real selector');assert.equal(x.q('#ipqcc-approved-version').value,'__blocked');assert(x.q('[data-ipqcc-approved-view]').hidden);await x.choose('');const before=JSON.stringify(x.f.api.state()),count=x.f.calls.length;gate.resolve();await turn();await turn();assert.equal(JSON.stringify(x.f.api.state()),before);assert.equal(x.q('#ipqcc-approved-version').value,'');assert(x.q('[data-ipqcc-approved-view]').hidden);assert.equal(x.f.calls.length,count);assert.equal(posts(x.f).length,0);
});
void test('old bound UNKNOWN receipt callback stays retired after return; freshly bound current query remains usable',async t=>{
 const x=await setup(t,{mode:'unknown404'});await assert.rejects(x.client.sendPrepared(x.client.prepare('g1','save',{})));x.f.api.draw();const button=x.f.area.querySelector('#ipqcc-check-operation'),add=button.addEventListener.bind(button);let old;
 button.addEventListener=(type,fn,options)=>{if(type==='click'&&!old)old=fn;return add(type,fn,options);};x.f.api.bind();await x.open();await x.choose('legacy-22');await x.choose('');x.f.calls.length=0;const before=JSON.stringify(x.f.api.state()),storage=[...x.f.data];await old({target:button});assert.equal(x.f.calls.length,0);assert.equal(JSON.stringify(x.f.api.state()),before);assert.deepEqual([...x.f.data],storage);button.click();await until(()=>x.f.calls.some(c=>c.url.includes('operationId=')));await turn();assert.equal(x.f.calls.filter(c=>c.url.includes('operationId=')).length,1);assert.equal(x.client.hasUnknown(),true);assert.equal(posts(x.f).length,0);
});
for(const fault of ['500','404','malformed'])void test('failed '+fault+' historical choice stays explicitly blocked until same-selector current renews input handlers',async t=>{
 const x=await setup(t);x.f.start();x.f.edit('RAM before attempt');const form=x.f.area.querySelector('#ipqcc-editor'),input=form.querySelector('input');input.name='name';await x.open();x.body((response,url)=>!url.includes('versionId=')?response:fault==='malformed'?Response.json({approvedOnly:true,revision:1,permissions:{view:true,history:true},version:{}}):Response.json({error:'HISTORY_FAILURE'},{status:Number(fault)}));
 for(let i=0;i<3;i++){const value=x.f.api.state().modal.fields.name;await x.choose('legacy-22');assert.equal(x.q('#ipqcc-approved-version').value,'__blocked');assert(!x.f.box.IPQCCUI.historyDisplay.current());input.value='ignored failed history';form.dispatchEvent({type:'input',target:input});assert.equal(x.f.api.state().modal.fields.name,value);await x.choose('');assert.equal(x.q('#ipqcc-approved-version').value,'');assert(x.f.box.IPQCCUI.historyDisplay.current());input.value='Current edit '+i;form.dispatchEvent({type:'input',target:input});assert.equal(x.f.api.state().modal.fields.name,'Current edit '+i);}
 assert.equal(posts(x.f).length,0);
});
for(const mode of ['loading','failure','denial'])void test('language changes preserve '+mode+' history boundary until explicit current selection',async t=>{
 const x=await setup(t);x.f.start();x.f.edit('Unchanged RAM');const form=x.f.area.querySelector('#ipqcc-editor');await x.open();const gate=deferred(),entered=deferred();let pending;
 if(mode==='loading'){x.body((response,url)=>{if(!url.includes('versionId='))return response;const json=response.json.bind(response);response.json=async()=>{entered.resolve();await gate.promise;return json();};return response;});pending=x.select('legacy-22');await entered.promise;}
 if(mode==='failure'){x.body((response,url)=>url.includes('versionId=')?Response.json({error:'FAIL'},{status:500}):response);await x.choose('legacy-22');}
 if(mode==='denial'){await x.choose('legacy-22');x.body((response,url)=>url.includes('permissions=1')?Response.json({error:'FORBIDDEN'},{status:403}):response);await assert.rejects(x.client.permissions());}
 const state=JSON.stringify(x.f.api.state()),count=x.f.calls.length;
 for(const language of ['vi','zh']){x.f.document.documentElement.lang=language;x.f.box.dispatchEvent({type:'process-language-change',detail:{language}});assert.equal(x.q('#ipqcc-approved-version').value,mode==='loading'?'__loading':'__blocked');assert(form.closest('.ipqcc-overlay').hidden);assert(!x.f.box.IPQCCUI.historyDisplay.current());assert.equal(JSON.stringify(x.f.api.state()),state);}assert.equal(x.f.calls.length,count);
 if(mode==='loading'){gate.resolve();await pending;}if(mode==='denial'){x.body(null);await x.client.permissions();assert.equal(x.q('#ipqcc-approved-version').disabled,false);}await x.choose('');assert(x.f.box.IPQCCUI.historyDisplay.current());assert(!form.closest('.ipqcc-overlay').hidden);assert.equal(JSON.stringify(x.f.api.state()),state);assert.equal(posts(x.f).length,0);
});
