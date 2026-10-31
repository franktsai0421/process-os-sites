import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync('public/process/shared-draft-client.js','utf8');
const ui=fs.readFileSync('public/process/version-draft-ui.js','utf8');
const helper=ui.slice(ui.indexOf('  function createDeparture(config){'),ui.indexOf('  host.VersionDraftUI='));
const ab=fs.readFileSync('public/process/ipqc-ab.js','utf8');
const abHelper=ab.slice(ab.indexOf('  function departureSharedState(){'),ab.indexOf('  window.IPQCABUI ='));
const flow=(scope='fqc',revision=3)=>({scope,generation:'g',revision,pendingId:null,working:{value:'unsaved'},saved:{id:'s',revision:1,content:{value:'saved'}},contributors:{field:{actor:{id:'same-user'}}}});
const receipt=(command,extra={})=>({operationId:command.operationId,generation:command.generation,revision:3,savedId:null,caseId:null,unchanged:false,...extra});
function fixture(endpoint='/api/fqc/workflow?caseMetadata=1'){
 let epoch=1,global=10,localRevision=3,reply=null;
 const memory=new Map(),calls=[],sync={identity:{id:'same-user'},identityGeneration:()=>epoch,requiresReload:false};
 const window={ProcessSync:sync},document={documentElement:{lang:'zh'},querySelectorAll:()=>[]};
 const box={window,document,crypto:webcrypto,AbortController,setTimeout,clearTimeout,
  sessionStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},
  fetch:async(url,options)=>{const body=options.body&&JSON.parse(options.body);calls.push({url,body,method:options.method});if(reply)return reply(url,body);return Response.json(body?.command?{receipt:receipt(body.command,{revision:localRevision}),revision:global}:{control:{workflow:flow()},revision:global});}};
 vm.createContext(box);vm.runInContext(source,box);vm.runInContext(helper.replaceAll('host.','window.')+'\nwindow.createDeparture=createDeparture;',box);
 const create=(url=endpoint)=>window.createSharedDraftClient({endpoint:url,actorId:'same-user',headers:()=>({})}),client=create();
 const adapter=f=>window.createDeparture({flow:()=>f,local:()=>false,canSave:()=>true,canDiscard:()=>true,unknown:()=>client.hasUnknown(),failed:()=>client.hasSyncFailures()});
 return {window,box,sync,calls,memory,client,create,adapter,tracker:window.SharedDraftDeparture,epoch:()=>epoch++,revisions:(local,state)=>{localRevision=local;global=state;},reply:fn=>reply=fn};
}
const apply=f=>f.client.command('g','apply',{patches:[{op:'set',path:['value'],value:'unsaved'}]});
const groupFlow=()=>flow('ipqc-ab:A:G',100);
const moduleFlow=(saved='module-save')=>({scope:'ipqc-ab:module',generation:'m',revision:4,saved:{id:saved,revision:3,content:{scopes:{'A:G':{value:'saved'}}}}});
const groupOwns=(f,g,m)=>f.tracker.owns(g,{key:'A:G',moduleFlow:m});

void test('same-account tabs: only the tab with a successful Apply owns the unsaved write',async()=>{
 const writer=fixture(),reader=fixture(),f=flow();await apply(writer);await reader.client.read();
 assert.equal(writer.adapter(f).inspect().state,'dirty');assert.equal(reader.adapter(f).inspect().state,'clean');
 assert.equal(writer.adapter(f).inspect().canDiscard,false);assert.equal(reader.calls.length,1);
});
for(const contributors of [undefined,{}, {legacy:{actor:{id:'same-user'}}}])void test('registered modern scope with no tab writes ignores absent/stale actor contributor stamps',()=>{const f=fixture(),d=flow();d.contributors=contributors;assert.equal(f.adapter(d).inspect().state,'clean');assert.equal(f.calls.length,0);});
for(const name of ['read','permissions','begin','noop','arbitrary-receipt'])void test(`${name} must not establish tab ownership`,async()=>{
 const f=fixture();
 if(name==='noop'){f.reply((_u,b)=>Response.json({receipt:receipt(b.command,{unchanged:true}),revision:10}));await apply(f);}
 else if(name==='arbitrary-receipt'){f.reply(()=>Response.json({receipt:receipt({operationId:'peer',generation:'g'})}));await f.client.receipt('peer','g');}
 else await f.client[name]();
 assert.equal(f.tracker.owns(flow()),false);assert.equal(f.adapter(flow()).inspect().state,'clean');
});
void test('generic peer Save covering own ACK frees departure even when another tab edits later',async()=>{
 const f=fixture();await apply(f);const d=flow('fqc',5);d.saved.revision=3;d.working.value='same-account peer later';
 assert.equal(f.adapter(d).inspect().state,'clean');f.revisions(6,12);await apply(f);d.revision=6;assert.equal(f.adapter(d).inspect().state,'dirty');
});
void test('Save older than own Apply is not coverage, regardless of latest read/global revision',async()=>{
 const f=fixture();await apply(f);const d=flow('fqc',20);d.saved.revision=2;assert.equal(f.tracker.owns(d),true);
});
void test('stale clean readback cannot clear the more recent Apply ACK',async()=>{const f=fixture();await apply(f);const d=flow('fqc',2);d.working=d.saved.content;assert.equal(f.adapter(d).inspect().state,'dirty');});
void test('exact saved snapshot settles acknowledged ownership and later peer writes do not resurrect it',async()=>{const f=fixture();await apply(f);const d=flow();d.saved.revision=undefined;d.working=d.saved.content;assert.equal(f.tracker.owns(d),false);d.revision++;d.working={value:'peer'};assert.equal(f.tracker.owns(d),false);});
void test('restore writes establish tab ownership but no-op restore does not',async()=>{for(const unchanged of [false,true]){const f=fixture();f.reply((_u,b)=>Response.json({receipt:receipt(b.command,{unchanged})}));await f.client.command('g','restore',{expectedRevision:2,restoreSaveId:'old'});assert.equal(f.tracker.owns(flow()),!unchanged);}});
for(const kind of ['actor','epoch','reload'])void test(`late Apply after ${kind} change never establishes new-owner writes`,async()=>{
 const f=fixture();let done;f.reply((_u,b)=>new Promise(resolve=>{done=()=>resolve(Response.json({receipt:receipt(b.command),revision:10}));}));
 const pending=apply(f);await new Promise(resolve=>setImmediate(resolve));if(kind==='actor')f.sync.identity={id:'other'};if(kind==='epoch')f.epoch();if(kind==='reload')f.sync.requiresReload=true;done();try{await pending;}catch{ /* Original actor guard retains uncertain command. */ }
 assert.equal(f.tracker.owns(flow()),false);
});
void test('generation and scope boundaries never inherit a different write',async()=>{const f=fixture();await apply(f);f.create('/api/iqc/workflow');assert.equal(f.tracker.owns(flow('iqc')),false);const d=flow();d.generation='next';assert.equal(f.tracker.owns(d),false);});
void test('rejected Apply never establishes ownership and retains the existing failure barrier',async()=>{const f=fixture();f.reply(()=>Response.json({error:'DEPENDENCY_CHANGED_RECONFIRM'},{status:409}));await assert.rejects(apply(f));assert.equal(f.tracker.owns(flow()),false);assert.equal(f.adapter(flow()).inspect().state,'blocked');});
for(const method of ['resolveUnknown','retryUnknown','receipt','sendPrepared'])void test(`${method} confirms only the original unknown receipt, with zero resend`,async()=>{
 const f=fixture();let original,recover=false;
 f.reply((url,body)=>{if(body){original=body.command;throw Error('lost');}return recover?Response.json({receipt:receipt(original)}):Response.json({error:'UNAVAILABLE'},{status:503});});
 await assert.rejects(apply(f),/RESULT_UNKNOWN/);assert.equal(f.adapter(flow()).inspect().state,'unknown');recover=true;
 if(method==='receipt')await f.client.receipt(original.operationId,'g');else if(method==='sendPrepared')await f.client.sendPrepared(original);else await f.client[method]();
 assert.equal(f.tracker.owns(flow()),true);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.client.hasUnknown(),false);
});
void test('malformed receipt retains unknown and cannot authorize leave',async()=>{const f=fixture();f.reply(()=>Response.json({receipt:{operationId:'wrong'}}));await assert.rejects(apply(f),/RESULT_UNKNOWN/);assert.equal(f.tracker.owns(flow()),false);assert.equal(f.adapter(flow()).inspect().state,'unknown');});
void test('foreign arbitrary receipt cannot clear a known owned write',async()=>{const f=fixture();await apply(f);f.reply(()=>Response.json({receipt:receipt({operationId:'foreign',generation:'g'},{savedId:'saved',revision:100})}));await f.client.receipt('foreign');assert.equal(f.tracker.owns(flow()),true);});

void test('AB module Save uses global input CAS, never group/module revision, for owned cutoff',async()=>{
 const f=fixture('/api/ipqc-ab/workflow?scope=A%3AG&caseMetadata=1');f.revisions(100,501);await apply(f);const g=groupFlow(),m=moduleFlow();assert.equal(groupOwns(f,g,m),true);
 const save=f.create('/api/ipqc-ab/workflow?module=1&caseMetadata=1');f.reply((_u,b)=>Response.json({receipt:receipt(b.command,{revision:4,savedId:m.saved.id}),revision:502}));await save.command('m','save',{input:{stateRevision:501}});
 g.revision=101;g.working={value:'peer after saved cutoff'};assert.equal(groupOwns(f,g,m),false);
});
void test('AB old global Save cutoff cannot cover newer write even when group revision is smaller',async()=>{
 const f=fixture('/api/ipqc-ab/workflow?scope=A%3AG');f.revisions(2,700);await apply(f);const g=flow('ipqc-ab:A:G',2),m=moduleFlow(),save=f.create('/api/ipqc-ab/workflow?module=1');
 f.reply((_u,b)=>Response.json({receipt:receipt(b.command,{savedId:m.saved.id}),revision:650}));await save.command('m','save',{input:{stateRevision:649}});assert.equal(groupOwns(f,g,m),true);
});
for(const missing of ['apply-global','save-global','cas','saved-id','generation'])void test(`AB ${missing} missing/mismatched proof stays conservative unless exact group snapshot matches`,async()=>{
 const f=fixture('/api/ipqc-ab/workflow?scope=A%3AG');f.revisions(100,501);
 if(missing==='apply-global')f.reply((_u,b)=>Response.json({receipt:receipt(b.command,{revision:100})}));await apply(f);
 const g=groupFlow(),m=moduleFlow(),save=f.create('/api/ipqc-ab/workflow?module=1');
 f.reply((_u,b)=>Response.json({receipt:receipt(b.command,{revision:4,savedId:missing==='saved-id'?'old-id':m.saved.id}),...(missing==='save-global'?{}:{revision:502})}));
 await save.command(missing==='generation'?'older':'m','save',missing==='cas'?{}:{input:{stateRevision:501}});
 assert.equal(groupOwns(f,g,m),true);g.working=m.saved.content.scopes['A:G'];assert.equal(groupOwns(f,g,m),false);
});
void test('AB actual aggregate adapter sees own writes across group switch, but not same-account other tabs',async()=>{
 const f=fixture('/api/ipqc-ab/workflow?scope=A%3AG');f.revisions(100,501);await apply(f);const g=groupFlow(),m=moduleFlow();
 Object.assign(f.box,{control:{scopes:{'A:G':{workflow:g},'B:other':{workflow:flow('ipqc-ab:B:other')}},moduleDraft:{workflow:m}},revision:501,departureSharedCache:null,key:()=> 'B:other',scope:()=>null});vm.runInContext(abHelper,f.box);assert.equal(f.box.departureOwnShared(),true);
 const other=fixture('/api/ipqc-ab/workflow?scope=B%3Aother');Object.assign(other.box,{control:f.box.control,revision:501,key:()=> 'B:other',scope:()=>null});vm.runInContext(abHelper,other.box);assert.equal(other.box.departureOwnShared(),false);
});
void test('unsupported or malformed legacy flow retains conservative fallback, not guessed no-own',()=>{const f=fixture();assert.equal(f.tracker.owns({...flow(),scope:'unknown'}),null);const d=flow();delete d.revision;assert.equal(f.adapter(d).inspect().state,'dirty');});
void test('1000 repeated departure ownership checks add no requests and compare the shared snapshot once',async()=>{
 const f=fixture();await apply(f);let traversals=0;const d=flow();d.working.toJSON=()=>{traversals++;return{value:'unsaved'};};const before=f.calls.length;
 for(let i=0;i<1000;i++)assert.equal(f.tracker.owns(d),true);assert.equal(f.calls.length,before);assert.equal(traversals,1);
});
void test('revoked permissions do not silently waive this tab’s proven unsaved writes',async()=>{const f=fixture();await apply(f);const adapter=f.window.createDeparture({flow:()=>flow(),canSave:()=>false,canDiscard:()=>false,local:()=>false});assert.equal(adapter.inspect().state,'dirty');assert.equal(adapter.inspect().canSave,false);assert.equal(adapter.inspect().canDiscard,false);});

void test('actual shared kernel: two same-account clients preserve saved cutoff after the peer edits again',async()=>{
 const {createRequire}=await import('node:module');
 const {createSharedDraft,applyDraftCommand}=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')()('lib/shared-draft.ts');
 let shared=createSharedDraft('fqc',{value:'initial'},null,'g'),stateRevision=200;
 const context={actor:{id:'same-user',name:'Synthetic'},at:'2026-10-31T00:00:00Z',id:()=>webcrypto.randomUUID(),allowed:()=>true,structure(){},validate:()=>[]};
 const send=(_url,body)=>{if(!body)return Response.json({control:{workflow:shared},revision:stateRevision});const result=applyDraftCommand(shared,body.command,context);shared=result.state;return Response.json({receipt:result.receipt,control:{workflow:shared},revision:++stateRevision});};
 const a=fixture(),b=fixture();a.reply(send);b.reply(send);
 await apply(a);const ownRevision=shared.revision;assert.equal(a.tracker.owns(shared),true);assert.equal(b.tracker.owns(shared),false);
 await b.client.command('g','save',{expectedRevision:shared.revision});assert.equal(shared.saved.revision,ownRevision);
 await b.client.command('g','apply',{patches:[{op:'set',path:['value'],value:'later peer'}]});
 assert.equal(a.adapter(shared).inspect().state,'clean');assert.equal(b.adapter(shared).inspect().state,'dirty');
});

void test('actual AB module adapter CAS/Save: group ACK global cutoff settles only writes included in its snapshot',async()=>{
 const {createRequire}=await import('node:module'),load=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')();
 const {createSharedDraft,applyDraftCommand}=load('lib/shared-draft.ts'),adapter=load('lib/ipqc-ab-module-workflow.ts').abModuleWorkflowAdapter();
 const root={schemaVersion:1,scopes:{'A:G':{line:'A',group:'G',activeVersionId:null,versions:[],workflow:createSharedDraft('ipqc-ab:A:G',{errors:[],items:[]},null,'g')}},source:null,reservedErrorCodes:[],reservedItemCodes:[]};
 const moduleControl=adapter.parse(JSON.stringify(root));moduleControl.workflow=createSharedDraft('ipqc-ab:module',adapter.empty(),null,'m');const live=adapter.serializeModel(moduleControl);let stateRevision=500;
 const context={actor:{id:'same-user',name:'Synthetic'},at:'2026-10-31T00:00:00Z',id:()=>webcrypto.randomUUID(),allowed:()=>true,structure(){},validate:()=>[],activeId:null};
 const f=fixture('/api/ipqc-ab/workflow?scope=A%3AG'),save=f.create('/api/ipqc-ab/workflow?module=1');
 f.reply((url,body)=>{const command=body.command;let result;
  if(url.includes('module=1')){adapter.beforeCommand(moduleControl,command,{revision:stateRevision});result=adapter.apply(moduleControl,command,context);moduleControl.workflow=result.state;adapter.serializeModel(moduleControl);}
  else{result=applyDraftCommand(live.scopes['A:G'].workflow,command,context);live.scopes['A:G'].workflow=result.state;}
  return Response.json({receipt:result.receipt,revision:++stateRevision});});
 await f.client.command('g','apply',{patches:[{op:'insert',path:['errors'],value:{id:'mine',name:'mine'}}]});const ownGlobal=stateRevision;
 await save.command('m','save',{expectedRevision:moduleControl.workflow.revision,input:{stateRevision:ownGlobal}});
 assert.deepEqual(Array.from(moduleControl.workflow.saved.content.scopes['A:G'].errors,r=>r.id),['mine']);
 live.scopes['A:G'].workflow=applyDraftCommand(live.scopes['A:G'].workflow,{action:'apply',operationId:webcrypto.randomUUID(),clientId:'other-tab',sequence:1,generation:'g',patches:[{op:'insert',path:['errors'],value:{id:'peer',name:'peer'}}]},context).state;
 assert.equal(f.tracker.owns(live.scopes['A:G'].workflow,{key:'A:G',moduleFlow:moduleControl.workflow}),false);
 assert.notEqual(live.scopes['A:G'].workflow.revision,ownGlobal);
});
for(const action of ['apply','restore'])for(const method of ['resolveUnknown','receipt','retryUnknown'])void test(`non-no-op ${action} revision zero stays unknown through POST and ${method}`,async()=>{
 const f=fixture();let command;
 f.reply((_u,body)=>{if(body)command=body.command;return Response.json({receipt:receipt(command,{revision:0,unchanged:false}),revision:100});});
 await assert.rejects(f.client.command('g',action,{patches:[]}),/RESULT_UNKNOWN/);assert.equal(f.client.hasUnknown(),true);assert.equal(f.adapter(flow()).inspect().state,'unknown');const bytes=[...f.memory];
 if(method==='receipt')await assert.rejects(f.client.receipt(command.operationId),/INVALID_OPERATION_RECEIPT/);else await assert.rejects(f.client[method](),/INVALID_OPERATION_RECEIPT/);
 assert.equal(f.client.hasUnknown(),true);assert.deepEqual([...f.memory],bytes);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
for(const action of ['apply','restore'])void test(`valid no-op ${action} revision zero establishes no write and is not unknown`,async()=>{const f=fixture();f.reply((_u,b)=>Response.json({receipt:receipt(b.command,{revision:0,unchanged:true})}));await f.client.command('g',action,{patches:[]});assert.equal(f.client.hasUnknown(),false);assert.equal(f.tracker.owns(flow()),false);});
void test('AB group ownership cache avoids repeated scans and invalidates on ACK, Save and identity epoch',async()=>{
 const f=fixture('/api/ipqc-ab/workflow?scope=A%3AG'),g=groupFlow(),m=moduleFlow();Object.assign(f.box,{control:{scopes:{'A:G':{workflow:g}},moduleDraft:{workflow:m}},revision:501,key:()=> 'A:G',scope:()=>null});vm.runInContext(abHelper,f.box);
 let scans=0;const owns=f.tracker.owns;f.tracker.owns=(...args)=>{scans++;return owns(...args);};for(let n=0;n<1000;n++)assert.equal(f.box.departureOwnShared(),false);assert.equal(scans,1);
 f.revisions(100,501);await apply(f);assert.equal(f.box.departureOwnShared(),true);assert.equal(scans,2);
 const save=f.create('/api/ipqc-ab/workflow?module=1');f.reply((_u,b)=>Response.json({receipt:receipt(b.command,{savedId:m.saved.id}),revision:502}));await save.command('m','save',{input:{stateRevision:501}});
 assert.equal(f.box.departureOwnShared(),false);assert.equal(scans,3);assert.equal(f.box.departureOwnShared(),false);assert.equal(scans,3);
 f.epoch();assert.equal(f.box.departureOwnShared(),false);assert.equal(scans,4);
 f.box.revision++;assert.equal(f.box.departureOwnShared(),false);assert.equal(scans,5);
});
void test('AB malformed group or module scope is conservative even with no own receipt',()=>{const f=fixture('/api/ipqc-ab/workflow?scope=A%3AG'),g=groupFlow(),m=moduleFlow();assert.equal(f.tracker.owns(g,{key:'B:other',moduleFlow:m}),null);assert.equal(f.tracker.owns(g,{key:'A:G',moduleFlow:{...m,scope:'other-module'}}),null);assert.equal(f.tracker.owns(g,{key:'A:G',moduleFlow:{...m,scope:undefined}}),null);assert.equal(groupOwns(f,g,m),false);});
