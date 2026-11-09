// Actual caller/handler/kernel in an isolated in-memory fixture. No bundle build,
// HTTP server, external fetch, account changes or production-data acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,webcrypto} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{fixture}=require('../scripts/quality-replacement-preview-fixture.cjs');
const master={active:{AB:{products:['P1','P2'].map(code=>({code,name:code,line:'A',category:'G',stages:['A-CUT']})),lines:[{code:'A',stages:[{code:'A-CUT',name:'Cut'}]}],categoryGroups:[{line:'A',name:'G',defaultStages:['A-CUT']}]}}};
const endpoint='http://fixture/api/ipqc-ab/workflow?module=1&caseMetadata=1';
const group=f=>f.read('ipqc-ab','editor','&scope=A%3AG');
async function setup(t){const f=await fixture({masterDataControl:JSON.stringify(master)});t.after(()=>f.close());await f.begin('ipqc-ab','editor',200,'&scope=A%3AG');await f.command('ipqc-ab','apply',{moduleAction:'create-error',input:{stageCode:'A-CUT',name:'Synthetic'}},'editor',200,'&scope=A%3AG');let g=await group(f);await f.command('ipqc-ab','apply',{moduleAction:'create-item',input:{errorId:g.control.workflow.working.errors[0].id}},'editor',200,'&scope=A%3AG');await f.begin('ipqc-ab','editor',200,'&module=1');g=await group(f);return{f,g,id:g.control.workflow.working.items[0].id};}
const set=(id,field,before,value)=>({patches:[{op:'set',path:['items',{id},field],value}],guards:[{path:['items',{id},field],value:before}]});
async function command(f,g,changes){const m=await f.read('ipqc-ab','editor','&module=1');return{action:'save',moduleAction:'save-local-v1',operationId:randomUUID(),clientId:'synthetic-fence',sequence:1,generation:m.control.workflow.generation,expectedRevision:m.control.workflow.revision,input:{stateRevision:m.revision,scopes:[{scope:'A:G',generation:g.control.workflow.generation,baseId:g.control.activeVersionId,changes}]}};}
async function send(f,c,who='editor'){const response=await f.load('app/api/ipqc-ab/workflow/route.ts').POST(new Request(endpoint,{method:'POST',headers:f.sessions[who],body:JSON.stringify({command:c})}));return{status:response.status,body:f.load('lib/workflow-wire.ts').expandWorkflowPayload(await response.json())};}
async function peer(f,id,field,value,before=''){return f.command('ipqc-ab','apply',set(id,field,before,value),'editor',200,'&scope=A%3AG');}

void test('stale group writer after authoritative Save read is rejected without adopting its unseen content',async t=>{
 const {f,g,id}=await setup(t),c=await command(f,g,[set(id,'standard','','Mine')]),moduleRevision=c.expectedRevision;
 await peer(f,id,'methodText','Peer after read');const afterPeer=f.snapshot();
 assert.equal((await f.read('ipqc-ab','editor','&module=1')).control.workflow.revision,moduleRevision,'legacy group writer does not advance module revision');
 const r=await send(f,c);assert.equal(r.status,409);assert.equal(r.body.error,'MODULE_CHANGED_RECONFIRM');assert.deepEqual(f.snapshot(),afterPeer);
 assert.equal((await group(f)).control.workflow.working.items[0].standard,'');
});
for(const revision of [undefined,-1,0.5,'0'])void test('local Save requires an exact integer module revision: '+String(revision),async t=>{
 const {f,g,id}=await setup(t),c=await command(f,g,[set(id,'standard','','Mine')]);if(revision===undefined)delete c.expectedRevision;else c.expectedRevision=revision;
 const before=f.snapshot(),r=await send(f,c);assert.equal(r.status,409);assert.equal(r.body.error,'DRAFT_REVISION_REQUIRED');assert.deepEqual(f.snapshot(),before);
});
void test('module revision mismatch is not erased by the local Save adapter',async t=>{
 const {f,g,id}=await setup(t),c=await command(f,g,[set(id,'standard','','Mine')]);c.expectedRevision++;
 const before=f.snapshot(),r=await send(f,c);assert.equal(r.status,409);assert.equal(r.body.error,'DRAFT_REVISION_CHANGED_RECONFIRM');assert.deepEqual(f.snapshot(),before);
});
for(const revision of [undefined,-1,0.5,'1'])void test('local Save requires an authoritative state revision: '+String(revision),async t=>{
 const {f,g,id}=await setup(t),c=await command(f,g,[set(id,'standard','','Mine')]);if(revision===undefined)delete c.input.stateRevision;else c.input.stateRevision=revision;
 const before=f.snapshot(),r=await send(f,c);assert.equal(r.status,422);assert.equal(r.body.error,'INVALID_AB_LOCAL_SAVE');assert.deepEqual(f.snapshot(),before);
});
void test('fresh Save read merges old nonconflicting guards and matrix cells while preserving peer fields',async t=>{
 const {f,g,id}=await setup(t);await peer(f,id,'methodText','Peer before read');await peer(f,id,'productCodes',['P1'],[]);
 const c=await command(f,g,[set(id,'standard','','Mine'),set(id,'productCodes',[],['P2'])]),r=await send(f,c);assert.equal(r.status,200,JSON.stringify(r));
 const row=r.body.control.workflow.saved.content.scopes['A:G'].items[0];assert.equal(row.standard,'Mine');assert.equal(row.methodText,'Peer before read');assert.deepEqual(row.productCodes,['P1','P2']);
 const after=f.snapshot();assert.equal((await send(f,c)).status,200);assert.deepEqual(f.snapshot(),after,'exact receipt replay never writes again');
});
void test('fresh pins never bypass a genuine same-field dependency conflict or pending lock',async t=>{
 const {f,g,id}=await setup(t);await peer(f,id,'standard','Peer');const c=await command(f,g,[set(id,'standard','','Mine')]),before=f.snapshot(),r=await send(f,c);
 assert.equal(r.status,409);assert.equal(r.body.error,'DEPENDENCY_CHANGED_RECONFIRM');assert.equal(r.body.details.scope,'A:G');assert.deepEqual(f.snapshot(),before);
 const saved=await send(f,await command(f,await group(f),[]));assert.equal(saved.status,200);
 const m=saved.body;await f.call('ipqc-ab/workflow','POST',{command:{action:'submit',operationId:randomUUID(),clientId:'synthetic-submit',sequence:1,generation:m.control.workflow.generation,expectedRevision:m.control.workflow.revision,savedId:m.control.workflow.saved.id,input:{stateRevision:m.revision},reason:'Synthetic review'}},'editor',200,'?module=1&caseMetadata=1');
 const locked=await command(f,await group(f),[set(id,'methodText','','Mine')]),lockedBefore=f.snapshot();assert.equal((await send(f,locked)).body.error,'PENDING_LOCKED');assert.deepEqual(f.snapshot(),lockedBefore);
});
void test('a real peer CAS between apply and commit cannot be adopted by the handler retry',async t=>{
 const {f,g,id}=await setup(t),c=await command(f,g,[set(id,'standard','','Mine')]);const prepare=f.env.DB.prepare.bind(f.env.DB);let injected=false,peerSnapshot,outerAttempts=0;
 f.env.DB.prepare=sql=>{const s=prepare(sql);if(/UPDATE shared_state SET/.test(sql)){const run=s.run.bind(s);s.run=async()=>{if(!injected){injected=true;outerAttempts++;await peer(f,id,'methodText','Concurrent peer');peerSnapshot=f.snapshot();}return run();};}return s;};
 const r=await send(f,c);assert.equal(r.status,409);assert.equal(r.body.error,'MODULE_CHANGED_RECONFIRM');assert.equal(outerAttempts,1);assert.deepEqual(f.snapshot(),peerSnapshot);
 const m=await f.read('ipqc-ab','editor','&module=1');assert.equal(m.control.workflow.receipts[c.operationId],undefined);assert.equal(m.control.workflow.saved,null);
});
void test('legacy committed receipt remains readable and replayable without new fence fields',async t=>{
 const {f,g,id}=await setup(t),c=await command(f,g,[set(id,'standard','','Committed')]),saved=await send(f,c);assert.equal(saved.status,200);
 const old=structuredClone(c);delete old.expectedRevision;delete old.input.stateRevision;
 const state=await f.core.readState(),root=JSON.parse(state.values.ipqcABMasterControl),receipt=root.moduleDraft.workflow.receipts[c.operationId];receipt.fingerprint=f.load('lib/shared-draft.ts').stableDraftJSON(old);
 // A pre-policy committed receipt is synthetic fixture state, not a new write
 // accepted without pins. Replay still traverses the real auth/handler/kernel.
 const encoded=await f.core.encodeValues({...state.values,ipqcABMasterControl:JSON.stringify(root)},state);f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(encoded);
 const before=f.snapshot(),replay=await send(f,old);assert.equal(replay.status,200);assert.deepEqual(replay.body.receipt,saved.body.receipt);assert.deepEqual(f.snapshot(),before);
 const lookup=await f.call('ipqc-ab/workflow','GET',undefined,'editor',200,'?module=1&operationId='+old.operationId);assert.equal(lookup.receipt.operationId,old.operationId);assert.deepEqual(f.snapshot(),before);
 assert.equal((await send(f,old,'ab-only')).status,409,'another actor cannot adopt the original operation');assert.deepEqual(f.snapshot(),before);
});

function transport(f){const memory=new Map(),calls=[],box={console,crypto:webcrypto,AbortController,setTimeout,clearTimeout,Response,Request,Headers,URL,URLSearchParams,performance,location:{origin:'http://fixture',pathname:'/process/'},document:{documentElement:{lang:'zh'},body:{style:{}},querySelector:()=>null,querySelectorAll:()=>[]},ProcessSync:{identity:{id:'preview-editor'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:d=>d===1,requiresReload:false},sessionStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),key:i=>[...memory.keys()][i]??null,get length(){return memory.size;}}};let lose=false,receiptUnavailable=false,proxy=null;
 box.window=box;box.addEventListener=()=>{};box.fetch=async(url,options={})=>{calls.push({url,method:options.method||'GET',body:options.body});const u=new URL(url,'http://fixture');if(u.searchParams.has('operationId')&&receiptUnavailable)return Response.json({error:'SYNTHETIC_RECEIPT_UNAVAILABLE'},{status:503});const route=f.load('app'+u.pathname+'/route.ts'),r=await route[options.method||'GET'](new Request(u,{...options,headers:{...f.sessions.editor,...options.headers}}));if(lose&&options.method==='POST'){lose=false;throw Error('SYNTHETIC_ACK_LOST');}if(proxy&&options.method==='POST')return proxy(r,box);return r;};
 vm.runInNewContext(fs.readFileSync(new URL('../public/process/shared-draft-client.js',import.meta.url),'utf8'),box);
 const client=box.createSharedDraftClient({endpoint:'/api/ipqc-ab/workflow?module=1&caseMetadata=1',actorId:'preview-editor',headers:()=>f.sessions.editor,externalDurableBounded:{scope:'IPQC-AB'},guardAccessResults:true,allowUnknownDeparture:true});
 return{box,client,memory,calls,lose(){lose=true;receiptUnavailable=true;},receipts(){receiptUnavailable=false;},proxy(fn){proxy=fn;}};
}
void test('actual bounded client treats exact fresh revision rejection as rejected, not unknown or automatic retry',async t=>{
 const {f,g,id}=await setup(t),x=transport(f);await x.client.read();const raw=await command(f,g,[set(id,'standard','','Mine')]),c=x.client.prepare(raw.generation,'save',{expectedRevision:raw.expectedRevision,moduleAction:raw.moduleAction,input:raw.input});
 await peer(f,id,'methodText','Peer');const before=f.snapshot();let error;try{await x.client.sendPrepared(c);}catch(e){error=e;}
 assert(error);assert.equal(error.message,'MODULE_CHANGED_RECONFIRM');assert.equal(x.client.hasUnknown(),false);assert.equal(x.client.isConfirmedRejection(error,c),true);assert.equal(x.client.hasSyncFailures(),false,'AB Save rejection is not an Apply/FQC queued failure');assert.equal(x.calls.filter(r=>r.method==='POST').length,1);assert.deepEqual(f.snapshot(),before);
});
void test('lost Save ACK retains original receipt operation and resolves without another POST',async t=>{
 const {f,g,id}=await setup(t),x=transport(f);await x.client.read();const raw=await command(f,g,[set(id,'standard','','Mine')]),c=x.client.prepare(raw.generation,'save',{expectedRevision:raw.expectedRevision,moduleAction:raw.moduleAction,input:raw.input});x.lose();
 await assert.rejects(x.client.sendPrepared(c));assert.equal(x.client.hasUnknown(),true);const before=f.snapshot();x.receipts();const resolved=await x.client.resolveUnknown();assert.equal(resolved.receipt.operationId,c.operationId);assert.equal(x.client.hasUnknown(),false);assert.equal(x.calls.filter(r=>r.method==='POST').length,1);assert.deepEqual(f.snapshot(),before);
});
for(const fault of ['missing-request-id','proxy-request-id','wrong-status','late-owner'])void test('revision refusal cannot clear unknown without an owned original response: '+fault,async t=>{
 const {f,g,id}=await setup(t),x=transport(f);await x.client.read();const raw=await command(f,g,[set(id,'standard','','Mine')]),c=x.client.prepare(raw.generation,'save',{expectedRevision:raw.expectedRevision,moduleAction:raw.moduleAction,input:raw.input});await peer(f,id,'methodText','Peer');const before=f.snapshot();
 x.proxy(async(r,box)=>{const body=await r.json();if(fault==='missing-request-id')delete body.requestId;if(fault==='proxy-request-id')body.requestId='proxy';if(fault==='late-owner')box.ProcessSync.identity={id:'another-actor'};return Response.json(body,{status:fault==='wrong-status'?503:r.status});});
 await assert.rejects(x.client.sendPrepared(c));assert.equal(x.client.hasUnknown(),true);assert.equal(x.memory.size,1);assert.equal(x.calls.filter(r=>r.method==='POST').length,1);assert.deepEqual(f.snapshot(),before);
});

// Actual Save function with synthetic surrounding ports: proves caller pin
// wiring and its early ownership fence, not native DOM or route admission.
function caller({supersedeAfterRead=false}={}){
 const ts=require('typescript'),source=fs.readFileSync(new URL('../public/process/ipqc-ab.js',import.meta.url),'utf8'),tree=ts.createSourceFile('ipqc-ab.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let found;
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='saveLocalModule')found=n;ts.forEachChild(n,visit);}visit(tree);assert(found);
 const scope={scope:'A:G',generation:'group-generation',baseId:null,changes:[set('item','standard','','Mine')]},calls=[],flow={generation:'module-generation',revision:7};let current=true;
 const client={async read(){calls.push('read');if(supersedeAfterRead)current=false;return{revision:41,permissions:{edit:true,restore:false},control:{workflow:flow,versions:[{status:'draft'}]}};},async permissions(){calls.push('permissions');return{revision:41,permissions:{edit:true,restore:false}};},prepare(generation,action,detail){calls.push({generation,action,detail});return{generation,action,...detail,operationId:'synthetic-operation'};},async sendPrepared(c){calls.push('POST');return{receipt:{operationId:c.operationId}};},hasUnknown:()=>false};
 const box={busy:false,accessBlocked:false,host:{isConnected:true},mutationLifetime:1,localPhotos:new Map(),localChangePhotos:()=>[],localSaveIntent:null,localConflict:null,localConflictRows:()=>null,localSaveIntentCurrent:()=>true,localPreflightConflicts:()=>[],mergeLocalListEntries:entries=>entries,compareLocalLineage:()=>false,control:{moduleDraft:{workflow:flow}},revision:41,localOwnerCurrent:()=>true,moduleTransport:()=>client,localSent:null,localPending:()=>false,modal:null,permittedAction:()=>true,localSaveScopes:()=>[scope],moduleDrafts:()=>[],actor:()=>({id:'owner'}),window:{ProcessSync:{identityGeneration:()=>3,captureDelivery:()=>1}},JSON,Error,localModuleGeneration:null,localBeginReceipt:null,localBeginExpectation:null,message:'',lastCommandAcknowledgement:null,draw(){},t:zh=>zh,async uploadLocalPhotos(){return false;},clearLocalEditing(){calls.push('clear-local');},async load(){return true;}};
 box.localScopes=new Map();box.pinLocalOperation=()=>({current:()=>current,setSent(value){box.localSent=value;},refresh(){},finish(){box.busy=false;}});vm.createContext(box);vm.runInContext(found.getText(tree)+';this.run=saveLocalModule;',box);return{box,calls};
}
void test('actual Save caller pins both revisions from its authoritative read in one prepared operation',async()=>{
 const x=caller(),r=await x.box.run();assert(r);const c=x.calls.find(v=>typeof v==='object');assert.equal(c.detail.expectedRevision,7);assert.equal(c.detail.input.stateRevision,41);assert.equal(x.calls.filter(v=>v==='POST').length,1);assert.equal(x.calls.filter(v=>v==='read').length,1);
});
void test('actual Save caller never prepares or sends after read ownership is superseded',async()=>{
 const x=caller({supersedeAfterRead:true});assert.equal(await x.box.run(),null);assert.deepEqual(x.calls,['read']);assert.equal(x.box.busy,false);assert.equal(x.box.localSent,null);
});
