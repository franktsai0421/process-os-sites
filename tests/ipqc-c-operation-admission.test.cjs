/* Actual IPQC-C + actual shared client in an isolated JS VM. Synthetic DOM/HTTP ports only.
 * No browser, server, network, backend authorization, persistence or native-speed claim.
 * Source is unchanged: a closure test hook exposes local functions and injects fixture state. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
const sourceRoot=path.resolve(process.env.C_UI_SOURCE||process.cwd());
const cSource=fs.readFileSync(path.join(sourceRoot,'public/process/ipqc-c.js'),'utf8');
const clientSource=fs.readFileSync(path.join(sourceRoot,'public/process/shared-draft-client.js'),'utf8');
const digest=s=>createHash('sha256').update(s).digest('hex');
const endpoint='/api/ipqc-c/workflow?caseMetadata=1',actor='synthetic-c-editor';
const recoveryKey='shared-draft-v3-operation:'+actor+':'+endpoint;
const unknown={operationId:'synthetic-uncertain-op',clientId:'synthetic-prior-client',sequence:7,generation:'g-c',action:'apply',patches:[{op:'set',path:['items',{id:'fixture-item'},'note'],value:'保留 Việt'}]};
const rawUnknown=JSON.stringify(unknown,null,2);
const copy=x=>JSON.parse(JSON.stringify(x));
const perms=(x={})=>({view:true,edit:false,save:false,submit:false,withdraw:false,approve:false,return:false,history:true,delete:false,...x});
const probeHook=`\nwindow.__cOperationTest={operationAllowed:typeof operationAllowed==='function'?operationAllowed:null,editing,mainHTML,writeShared,upload,submitEditor,bind,sharedTransport,
 setup(s){control=s.control;working=s.working;revision=7;selectedVersionId='draft-c';modal=s.modal||null;host=s.host||null;caseHistory=s.caseHistory||null;catalog={products:[],stages:[]};},
 snapshot(){return{control,working,modal,message,busy,sharedActor};}};\n`;
function fixture({permissions=perms(),recovery=null,adopted=true,malformedReceipt=false}={}){
 const calls=[],storageWrites=[],events=[],nodes=new Map(),memory=new Map(recovery?[[recoveryKey,recovery]]:[]);
 let nextResponse=null,caps=permissions,control,working;
 class Node{
  constructor(id=''){this.id=id;this.dataset={};this.disabled=false;this.attrs={};this.value='unsaved 中文 Việt';this.children=[];this.listeners={};this.isConnected=false;}
  setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}hasAttribute(k){return k in this.attrs;}
  addEventListener(k,f){this.listeners[k]=f;}querySelector(s){return nodes.get(s)||null;}querySelectorAll(){return[];}
  prepend(n){this.children.unshift(n);if(n.id)nodes.set('#'+n.id,n);n.parentElement=this;}
  closest(){return root;}contains(){return false;}focus(){}remove(){this.isConnected=false;}
 }
 const root=new Node('fixture'),page=new Node('ipqcc-page'),footer=new Node('case-footer'),host=new Node('host');
 nodes.set('#ipqcc-page',page);nodes.set('#ipqcc-case-dialog footer',footer);
 for(const id of ['ipqcc-begin','ipqcc-save','ipqcc-submit','ipqcc-editor','fixture-input'])nodes.set('#'+id,new Node(id));
 const document={documentElement:{lang:'zh'},visibilityState:'visible',activeElement:null,createElement:()=>new Node(),querySelector:s=>s==='#data-content'?null:nodes.get(s)||null,querySelectorAll:s=>s.split(',').flatMap(q=>nodes.has(q.trim())?[nodes.get(q.trim())]:[]),addEventListener(){},removeEventListener(){}};
 const sync={identity:{id:actor},requiresReload:false,platformHeaders:()=>({})};
 const window={ProcessSync:sync,hasPermission:()=>true,VersionDraftUI:{preserveView:()=>()=>{},reasonFor:()=>'',confirmSubmit:async()=> 'synthetic explicit submit',confirmReview:async()=>({reason:'unused'}),date:()=>''},ProcessIPQC:{referenceMarkup:()=>'',mountReferences:async()=>{}},addEventListener(){},dispatchEvent:e=>events.push(e.type),alert:()=>{}};
 const snapshot={errors:[],items:[]};working=copy(snapshot);control={activeVersionId:null,versions:[{id:'draft-c',number:1,status:'draft',snapshot:copy(snapshot),history:[]}],...(adopted?{workflow:{generation:'g-c',revision:3,working:copy(snapshot),saved:{id:'saved-c',content:copy(snapshot),actor:{id:actor,name:'Synthetic editor'},at:'2026-10-27T00:00:00Z'},pendingId:null,cases:[],receipts:{'prior-fixed':{result:'preserved'}}}}:{})};
 const context=vm.createContext({window,document,console,crypto:webcrypto,AbortController,URL,URLSearchParams,FormData,Blob,CustomEvent:class{constructor(type){this.type=type;}},setTimeout,clearTimeout,confirm:()=>true,toast:()=>{},sessionStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>{memory.set(k,v);storageWrites.push(['set',k,v]);},removeItem:k=>{memory.delete(k);storageWrites.push(['remove',k]);}},fetch:async(url,options={})=>{
  const call={url,method:options.method||'GET',...(options.body&&typeof options.body==='string'?{body:JSON.parse(options.body)}:{})};calls.push(call);
  if(nextResponse){const next=nextResponse;nextResponse=null;return next(url,options);}
  if(call.method==='PUT')return Response.json({id:'a'.repeat(64)});
  if(call.method==='POST'){
   const command=call.body?.command;
   // Synthetic response projection, not a backend transition/authority test.
   // Bind all six receipt fields to the returned workflow; Begin is control-only.
   const returned=copy(control),flow=returned.workflow;
   if(command){
    flow.revision++;
    if(command.action==='save')flow.saved={...flow.saved,id:'saved-'+command.operationId,revision:flow.revision,content:copy(flow.working)};
    if(command.action==='submit'){
     assert.equal(command.savedId,flow.saved.id,'Submit consumes the fixed saved snapshot');
     flow.pendingId='case-'+command.operationId;
     flow.cases.push({id:flow.pendingId,savedId:flow.saved.id,status:'pending',actor:copy(flow.saved.actor),content:copy(flow.saved.content)});
     returned.versions[0].status='pending';
    }
   }
   const receipt=command?(malformedReceipt?{operationId:command.operationId}:{operationId:command.operationId,generation:flow.generation,revision:flow.revision,savedId:flow.saved?.id||null,caseId:flow.pendingId||null,unchanged:false}):null;
   return Response.json({revision:7,control:returned,...(receipt?{receipt}:{})});
  }
  if(String(url).includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
  if(String(url).startsWith('/api/ipqc-c?'))return Response.json({control:copy(control),revision:7,catalog:{products:[],stages:[]}});
  return Response.json({permissions:caps,revision:7,unchanged:true,otherReviewerAvailable:true});
 }});
 vm.runInContext(clientSource,context,{filename:'actual-shared-draft-client.js'});
 const end=cSource.lastIndexOf('})();');assert(end>0,'IIFE hook anchor');
 vm.runInContext(cSource.slice(0,end)+probeHook+cSource.slice(end),context,{filename:'actual-ipqc-c.js'});
 const ui=window.__cOperationTest;ui.setup({control,working});const client=ui.sharedTransport();
 const state=()=>copy(ui.snapshot());
 const setModal=()=>{const modal={kind:'item',existingId:'fixture-item',fields:{description:'尚未儲存 中文 Việt',note:'retain'},photos:[{id:'b'.repeat(64),name:'retain.png',note:'photo retain'}],pendingInsert:{afterParagraph:0,description:'pending text'},dirty:true,readonly:false,generation:'g-c'};ui.setup({control,working,modal});return copy(modal);};
 const mutations=()=>calls.filter(c=>c.method!=='GET');
 return{ui,client,sync,window,calls,events,nodes,footer,host,root,memory,storageWrites,control,working,state,setModal,mutations,setCaps:value=>{caps=value;},next:fn=>{nextResponse=fn;},hydrate:()=>client.permissions(),bindHistory(){ui.setup({control,working,host,caseHistory:{reviewCase:{savedId:'saved-c'}}});ui.bind();}};
}
function stableInput(f){const s=f.state();return{control:s.control,working:s.working,modal:s.modal,storage:[...f.memory]};}
function noWrites(f,before,label){assert.deepEqual(stableInput(f),before,label+' retained working/modal/fixed receipt/recovery');assert.equal(f.mutations().length,0,label+' no mutation dispatched');}

void test('strict operationAllowed requires true, same actor and non-terminal delivery',async()=>{
 const f=fixture();assert.equal(f.ui.operationAllowed('edit'),false,'unknown before first permission read');
 for(const value of [false,null,0,1,'true',undefined]){f.setCaps(perms({edit:value}));await f.hydrate();assert.equal(f.ui.operationAllowed('edit'),false,'non-true capability '+String(value));}
 f.setCaps(perms({edit:true}));await f.hydrate();assert.equal(f.ui.operationAllowed('edit'),true);
 f.sync.identity={id:'different-actor'};assert.equal(f.ui.operationAllowed('edit'),false);f.sync.identity=null;assert.equal(f.ui.operationAllowed('edit'),false);
 f.sync.identity={id:actor};f.sync.requiresReload=true;assert.equal(f.ui.operationAllowed('edit'),false);assert.equal(f.mutations().length,0);
});

void test('adopted Save and Submit have independent visibility and actual dispatch without edit',async()=>{
 for(const action of ['save','submit']){
  const f=fixture({permissions:perms({[action]:true})});await f.hydrate();
  const html=f.ui.mainHTML();assert.equal(html.includes('id="ipqcc-'+action+'"'),true,action+' visible independent of edit');
  assert.equal(html.includes('id="ipqcc-'+(action==='save'?'submit':'save')+'"'),false,'other operation hidden');assert.equal(html.includes('data-ipqcc-add='),false,'no editor affordance');
  const result=await f.ui.writeShared(action);assert(result?.receipt,action+' dispatched');
  assert.deepEqual(f.mutations().map(c=>c.body.command.action),[action]);assert.equal(f.mutations()[0].body.command.generation,'g-c');
  const command=f.mutations()[0].body.command,flow=result.control.workflow;
  assert.equal(result.receipt.operationId,command.operationId);assert.equal(result.receipt.generation,flow.generation);assert.equal(result.receipt.revision,flow.revision);assert.equal(flow.revision,4);
  assert.equal(result.receipt.savedId,flow.saved.id);assert.equal(result.receipt.caseId,flow.pendingId);assert.equal(result.receipt.unchanged,false);
  if(action==='save'){assert.equal(flow.saved.id,'saved-'+command.operationId);assert.equal(flow.pendingId,null);assert.deepEqual(flow.saved.content,f.control.workflow.working);}
  if(action==='submit'){assert.equal(command.savedId,'saved-c');assert.equal(flow.pendingId,'case-'+command.operationId);assert.equal(flow.cases.at(-1).savedId,command.savedId);assert.deepEqual(flow.cases.at(-1).content,f.control.workflow.saved.content);}
  assert.equal(f.client.hasUnknown(),false,'successful synthetic receipt settled');
 }
});

void test('edit-only allows Apply and photo but does not Save or Submit',async()=>{
 const f=fixture({permissions:perms({edit:true})});await f.hydrate();
 const html=f.ui.mainHTML();assert(!html.includes('id="ipqcc-save"'));assert(!html.includes('id="ipqcc-submit"'));
 const patches=[{op:'set',path:['items',{id:'fixture-item'},'note'],value:'explicit synthetic edit'}];const result=await f.ui.writeShared('apply',{patches,guards:[]});assert(result?.receipt,'valid Apply receipt acknowledged');assert.equal(f.client.hasUnknown(),false);
 assert.equal(f.mutations().length,1);assert.equal(f.mutations()[0].body.command.action,'apply');assert.deepEqual(f.mutations()[0].body.command.patches,patches);
 assert.equal(await f.ui.upload(new Blob(['synthetic bytes'],{type:'image/png'})),'a'.repeat(64));assert.equal(f.mutations()[1].method,'PUT');
 await f.ui.writeShared('save');await f.ui.writeShared('submit');assert.equal(f.mutations().length,2,'no implicit Save/Submit');
});

void test('malformed successful Save ACK stays unknown with input retained and no repeated POST',async()=>{
 const f=fixture({permissions:perms({save:true}),malformedReceipt:true});await f.hydrate();f.setModal();
 const before=f.state();assert.equal(await f.ui.writeShared('save'),null);assert.equal(f.client.hasUnknown(),true);
 assert.deepEqual(f.mutations().map(c=>c.body.command.action),['save']);
 assert.equal(f.calls.filter(c=>c.method==='GET'&&c.url.includes('operationId=')).length,1,'receipt lookup follows malformed ACK');
 const recovery=f.memory.get(recoveryKey);assert(recovery);assert.equal(JSON.parse(recovery).operationId,f.mutations()[0].body.command.operationId);
 for(const key of ['control','working','modal'])assert.deepEqual(f.state()[key],before[key],key+' preserved');
 assert.equal(await f.ui.writeShared('save'),null);assert.equal(f.client.hasUnknown(),true);assert.equal(f.mutations().length,1,'another Save does not blindly resend');assert.equal(f.memory.get(recoveryKey),recovery);
});

void test('unknown and denied edit block Begin Apply module mutations and photo with input intact',async()=>{
 for(const hydrate of [false,true]){
  const f=fixture();if(hydrate)await f.hydrate();f.setModal();const before=stableInput(f);
  for(const action of ['begin','apply','create-item','create-error','delete-item','delete-error']){await f.ui.writeShared(action,{patches:[],guards:[]});noWrites(f,before,action);}
  await assert.rejects(f.ui.upload(new Blob(['synthetic'])),/FORBIDDEN/);noWrites(f,before,'photo');
  let prevented=false;await f.ui.submitEditor({preventDefault(){prevented=true;},currentTarget:{}});assert(prevented);noWrites(f,before,'actual editor submit early guard');
 }
});

void test('unadopted Save or Submit cannot silently Begin without edit',async()=>{
 for(const action of ['save','submit']){
  const f=fixture({permissions:perms({[action]:true}),adopted:false});await f.hydrate();
  assert(!f.ui.mainHTML().includes('id="ipqcc-'+action+'"'));const before=stableInput(f);await f.ui.writeShared(action);noWrites(f,before,action+' nonadopted');assert.equal(f.state().message,'FORBIDDEN');
 }
});

void test('no-edit history binding creates no Restore button; allowed button is disabled by unchanged revocation',async()=>{
 const denied=fixture();await denied.hydrate();denied.bindHistory();assert.equal(denied.nodes.has('#ipqcc-case-restore'),false);assert.equal(denied.mutations().length,0);
 const f=fixture({permissions:perms({edit:true,save:true,submit:true})});await f.hydrate();f.bindHistory();const restore=f.nodes.get('#ipqcc-case-restore');assert(restore);assert.equal(restore.disabled,false);
 f.setModal();const before=stableInput(f);f.setCaps(perms());const update=await f.client.read('g-c:3');assert.equal(update.unchanged,true);
 for(const id of ['ipqcc-begin','ipqcc-case-restore','ipqcc-save','ipqcc-submit'])assert.equal(f.nodes.get('#'+id).disabled,true,id+' revoked');
 assert.equal(f.ui.operationAllowed('edit'),false);noWrites(f,before,'unchanged revocation');
});

void test('401 and 403 permission refresh fail closed without discarding unsaved input or unknown receipt',async()=>{
 for(const status of [401,403]){
  const f=fixture({permissions:perms({edit:true,save:true,submit:true}),recovery:rawUnknown});await f.hydrate();f.setModal();const before=stableInput(f),writes=f.storageWrites.length;
  f.next(()=>Response.json({error:'FORBIDDEN'},{status}));await assert.rejects(f.hydrate(),e=>e.status===status);
  for(const op of ['edit','save','submit'])assert.equal(f.ui.operationAllowed(op),false);assert(f.client.hasUnknown());assert.equal(f.memory.get(recoveryKey),rawUnknown);assert.equal(f.storageWrites.length,writes);noWrites(f,before,'HTTP '+status);
 }
});

void test('revoked unknown-operation action does receipt GET only and retains raw unresolved recovery',async()=>{
 const f=fixture({permissions:perms({edit:true}),recovery:rawUnknown});await f.hydrate();f.setModal();f.setCaps(perms());await f.client.read('g-c:3');const before=stableInput(f),start=f.calls.length;
 await f.ui.writeShared('apply',{patches:[],guards:[]},true);
 assert.deepEqual(f.calls.slice(start).map(c=>[c.method,new URL(c.url,'http://fixture').searchParams.get('operationId')]),[['GET',unknown.operationId]]);
 assert.equal(f.client.hasUnknown(),true);assert.equal(f.memory.get(recoveryKey),rawUnknown);assert.deepEqual(f.storageWrites,[]);noWrites(f,before,'failed receipt lookup');
});

void test('terminal reload and actor mismatch cannot dispatch through C or lose current input',async()=>{
 for(const mode of ['reload','actor']){
  const f=fixture({permissions:perms({edit:true,save:true,submit:true})});await f.hydrate();f.setModal();const before=stableInput(f);
  if(mode==='reload')f.sync.requiresReload=true;else f.sync.identity={id:'new-synthetic-actor'};
  for(const action of ['begin','apply','save','submit'])await f.ui.writeShared(action,{patches:[],guards:[]});
  await assert.rejects(f.ui.upload(new Blob(['synthetic'])),/FORBIDDEN/);noWrites(f,before,mode);
 }
});

void test('Submit confirmation rechecks operation actor and delivery before dispatch',async()=>{
 for(const mode of ['revoke','actor','reload']){
  const f=fixture({permissions:perms({submit:true})});await f.hydrate();f.setModal();const before=stableInput(f);
  let confirm;f.window.VersionDraftUI.confirmSubmit=()=>new Promise(resolve=>{confirm=resolve;});
  const pending=f.ui.writeShared('submit');assert.equal(typeof confirm,'function','confirmation awaits user');
  if(mode==='revoke'){f.setCaps(perms());await f.client.read('g-c:3');}
  else if(mode==='actor')f.sync.identity={id:'new-synthetic-actor'};
  else f.sync.requiresReload=true;
  confirm('explicit synthetic reason');await pending;noWrites(f,before,'deferred '+mode);
 }
});

void test('pending draft hides edit Save Submit affordances without changing fixed history',async()=>{
 const f=fixture({permissions:perms({edit:true,save:true,submit:true})});await f.hydrate();f.control.workflow.pendingId='fixed-pending';f.control.versions[0].status='pending';const before=stableInput(f),html=f.ui.mainHTML();
 for(const id of ['ipqcc-begin','ipqcc-save','ipqcc-submit'])assert(!html.includes('id="'+id+'"'));assert.equal(f.ui.editing(),false);noWrites(f,before,'pending render');
});

void test('source receipt identifies exact actual JS used by this synthetic VM',t=>{t.diagnostic(JSON.stringify({sourceRoot,ipqcCSha256:digest(cSource),sharedClientSha256:digest(clientSource),boundary:'Actual JS functions and transport; test-only closure exposure, synthetic DOM and fetch responses. Not native UI or backend acceptance.'}));});
