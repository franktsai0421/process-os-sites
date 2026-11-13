// Current browser bridge, merge dialog, durable transport and production routes.
// DOM, signed accounts, SQLite and R2 remain isolated fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
import {fixture} from './master-ab-auth-phase-fixture.mjs';
const copy=value=>JSON.parse(JSON.stringify(value));
const path=['A-CUT',{id:'A-CUT-FLOW-02'},'name'];
const other=['A-CUT',{id:'A-CUT-FLOW-02'},'editorType'];
async function until(fn){const end=Date.now()+10000;while(Date.now()<end){if(fn())return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error('DIALOG_DID_NOT_SETTLE');}
async function setup(t){
 const f=await fixture({scope:'PROCESS'}),dom=canvasDOM(),disk=new Map(),calls=[];let epoch=1,mode='',intercept;
 const peerUser={...f.user,id:'peer',name:'Synthetic second account'};await f.mutateValues(values=>{values.platformUsers=JSON.stringify([f.user,peerUser]);});const peerToken=await f.core.demoSession(new Request(f.url),peerUser.id,false,1),peerHeaders={...f.headers,Cookie:f.core.sessionCookie(new Request(f.url),peerToken).split(';')[0]};
 const box={...dom,crypto:webcrypto,URL,URLSearchParams,Request,Response,Headers,AbortController,TextEncoder,performance,console,setTimeout,clearTimeout,location:{origin:'https://fixture.invalid',pathname:'/process/'},ProcessSync:{identity:f.user,identityGeneration:()=>epoch,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,platformHeaders:()=>f.headers},sessionStorage:{get length(){return disk.size;},key:i=>[...disk.keys()][i]??null,getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)}};
 box.window=box;dom.events(box);box.document.documentElement.lang='zh';
 box.fetch=async(url,options)=>{const body=options.body&&JSON.parse(options.body);calls.push({url,body});const send=async()=>{if(mode==='missing'&&url.includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});const response=await f.route[options.method](new Request(new URL(url,'https://fixture.invalid'),{...options,headers:f.headers}));if(mode==='lost'&&body)throw Error('Synthetic lost ACK');return response;};return intercept?intercept(url,options,send):send();};
 vm.createContext(box);for(const file of ['shared-draft-client','page-draft-merge','master-shared-client'])vm.runInContext(fs.readFileSync('public/process/'+file+'.js','utf8'),box,{filename:file});
 const control={active:{},versions:[]},bridge=box.createMasterSharedBridge({control,processLocalSave:true});await bridge.load('PROCESS');
 const draft=()=>control.versions.find(row=>row.scope==='PROCESS'&&row.status==='draft').snapshot;
 const stage=async(value,target=path)=>{let before=draft();for(const part of target)before=typeof part==='string'?before[part]:before.find(row=>row.id===part.id);await bridge.patch('PROCESS',[{op:'set',path:target,value}],[{path:target,value:before}]);};
 const peer=async(value,target=path)=>{const current=(await f.request()).body.control.workflow;let before=current.working;for(const part of target)before=typeof part==='string'?before[part]:before.find(row=>row.id===part.id);const r=await f.request('POST',f.command('apply',{clientId:'peer-client',patches:[{op:'set',path:target,value}],guards:[{path:target,value:before}]}),'',peerHeaders);assert.equal(r.status,200,JSON.stringify(r.body));};
 const choose=async label=>{await until(()=>box.document.querySelector('dialog'));const button=box.document.querySelectorAll('button').find(row=>row.textContent===label);assert(button);button.click();};
 t.after(f.close);return{f,box,bridge,control,disk,calls,draft,stage,peer,choose,posts:()=>calls.filter(row=>row.body),mode:value=>{mode=value;},rotate(){epoch++;box.dispatchEvent({type:'process-delivery-invalidated'});},intercept:fn=>{intercept=fn;}};
}
for(const choice of ['用我的','用對方的','取消'])void test('PROCESS actual whole-group '+choice+' keeps nonconflicting changes and exact original operation',async t=>{
 const x=await setup(t);await x.stage('Mine');await x.peer('Peer');await x.peer('inspection',other);const before=x.f.row(),count=x.posts().length;
 const task=x.bridge.execute('PROCESS','save');await x.choose(choice);const result=await task;
 if(choice==='取消'){assert.equal(result,null);assert.deepEqual(x.f.row(),before);assert.equal(x.posts().length,count);assert.equal(x.draft()['A-CUT'][1].name,'Mine');assert(x.bridge.localDirty('PROCESS'));return;}
 assert.equal(x.posts().length,count+1);assert.equal(result.control.workflow.saved.content['A-CUT'][1].name,choice==='用我的'?'Mine':'Peer');assert.equal(result.control.workflow.saved.content['A-CUT'][1].editorType,'inspection');assert.equal(x.bridge.localDirty('PROCESS'),false);
});
void test('PROCESS peer change after choice requires a new whole-group confirmation, never stale POST',async t=>{
 const x=await setup(t);await x.stage('Mine');await x.peer('Peer');const task=x.bridge.execute('PROCESS','save');await until(()=>x.box.document.querySelector('dialog'));await x.peer('Peer changed again');await x.choose('用我的');await until(()=>x.box.document.querySelector('dialog'));assert.equal(x.posts().length,0);assert.match(x.box.document.querySelector('dialog').textContent,/Peer changed again/);await x.choose('用對方的');const result=await task;assert.equal(result.control.workflow.saved.content['A-CUT'][1].name,'Peer changed again');assert.equal(x.posts().length,1);
});
void test('PROCESS identity invalidation closes pending choice with zero POST and retains unsent overlay',async t=>{
 const x=await setup(t);await x.stage('Mine');await x.peer('Peer');const row=x.f.row(),task=x.bridge.execute('PROCESS','save');await until(()=>x.box.document.querySelector('dialog'));x.rotate();assert.equal(await task,null);assert.equal(x.posts().length,0);assert.deepEqual(x.f.row(),row);assert.equal(x.box.document.querySelector('dialog'),null);
});
void test('PROCESS lost grouped Save ACK retains later input, original ID and receipt-only recovery',async t=>{
 const x=await setup(t);await x.stage('Mine');await x.peer('Peer');let sent,release;const entered=new Promise(resolve=>sent=resolve),gate=new Promise(resolve=>release=resolve);
 x.intercept(async(_url,options,send)=>{const body=options.body&&JSON.parse(options.body),response=await send();if(body?.command?.action==='save'){sent();await gate;throw Error('Synthetic connection lost');}return response;});
 const task=x.bridge.execute('PROCESS','save');await x.choose('用我的');await entered;await x.stage('Later');x.mode('missing');release();await assert.rejects(task,/UNKNOWN/);const marker=[...x.disk];assert(marker.length);const posted=copy(x.posts()[0].body);x.intercept(null);x.mode('missing');await assert.rejects(x.bridge.recover('PROCESS'),/OPERATION_NOT_FOUND/);assert.deepEqual([...x.disk],marker);x.mode('');await x.bridge.recover('PROCESS');assert.equal(x.posts().length,1);assert.deepEqual(x.posts()[0].body,posted);assert.equal(x.draft()['A-CUT'][1].name,'Later');assert(x.bridge.localDirty('PROCESS'));await x.bridge.execute('PROCESS','save');assert.equal(x.posts().length,2);assert.equal(x.control.workflowScopes.PROCESS.saved.content['A-CUT'][1].name,'Later');
});
void test('PROCESS slow Save uses finite 45s boundary, single dispatch and truthful timeout classification',async t=>{
 const x=await setup(t);await x.stage('Slow');let deadline,abort;const timers=x.box.setTimeout;x.box.setTimeout=(fn,ms)=>{if(ms===45000){deadline=ms;abort=fn;return timers(()=>{},45000);}if(ms===15000)throw Error('SHORT_MUTATION_DEADLINE');return timers(fn,ms);};
 x.intercept(async(_url,options,send)=>{if(options.body){await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,30);options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Object.assign(Error('Synthetic request deadline'),{name:'AbortError'}));},{once:true});});}return send();});
 const task=x.bridge.execute('PROCESS','save');await until(()=>x.posts().length===1);await assert.rejects(x.bridge.execute('PROCESS','save'),/OPERATION_IN_PROGRESS/);assert.equal(deadline,45000);abort();await assert.rejects(task,/UNKNOWN/);assert(x.bridge.client('PROCESS').hasUnknown());assert.equal(x.posts().length,1);assert.equal(x.control.workflowScopes.PROCESS.saved,null);
});
void test('PROCESS legacy history helper refuses restore modal even if called by retained handler',async t=>{
 const x=await setup(t);x.box.openSharedDraftHistory=()=>{throw Error('RESTORE_MODAL_MUST_NOT_OPEN');};await assert.rejects(x.bridge.history('PROCESS'),/APPROVED_HISTORY_USE_PAGE_SELECTOR/);assert.equal(x.posts().length,0);
});
void test('PROCESS source read cannot adopt after a delivery change while GET is pending',async t=>{
 const x=await setup(t);let entered,release;const sent=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);x.intercept(async(_url,options,send)=>{const response=await send();if(!options.body){entered();await gate;}return response;});const before=copy(x.control),task=x.bridge.load('PROCESS');await sent;x.rotate();release();await task;assert.deepEqual(copy(x.control),before);assert.equal(x.posts().length,0);
});
void test('PROCESS PR102 late photo append after choose-theirs preserves accepted primary and both independent tails',async t=>{
 const x=await setup(t),template=['A-CUT',{id:'A-CUT-FLOW-02'}],photo=src=>({src,name:src+'.png',type:'image/png'}),base=x.draft()['A-CUT'][1];
 const stageGroup=async value=>{for(const [key,item]of Object.entries(value))await x.stage(item,[...template,key]);},peerGroup=async value=>{for(const [key,item]of Object.entries(value))await x.peer(item,[...template,key]);};
 const own={mediaItems:[photo('mine-primary')],media:'mine-primary',mediaName:'mine-primary.png',mediaType:'image/png'},other={mediaItems:[photo('peer-primary'),photo('peer-tail')],media:'peer-primary',mediaName:'peer-primary.png',mediaType:'image/png'};assert(base.mediaItems.length);await stageGroup(own);await peerGroup(other);
 let entered,release;const sent=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);x.intercept(async(_url,options,send)=>{const response=await send();if(options.body&&JSON.parse(options.body).command?.action==='save'){entered();await gate;}return response;});
 const pending=x.bridge.execute('PROCESS','save');await x.choose('用對方的');await sent;await x.stage([...own.mediaItems,photo('late-tail')],[...template,'mediaItems']);release();await pending;x.intercept(null);assert(x.bridge.localDirty('PROCESS'));const result=await x.bridge.execute('PROCESS','save'),saved=result.control.workflow.saved.content['A-CUT'][1];assert.equal(saved.media,'peer-primary');assert.equal(saved.mediaItems[0].src,'peer-primary');assert(saved.mediaItems.some(row=>row.src==='peer-tail'));assert(saved.mediaItems.some(row=>row.src==='late-tail'));assert.equal(x.posts().length,2);
});
void test('PROCESS actual missing-stage button stages defaults and stable new IDs locally; only Save shares it',async t=>{
 const x=await setup(t),app=fs.readFileSync('public/process/app.js','utf8'),ast=ts.createSourceFile('app.js',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),names=['defaultTemplatesForStage','mergeRequiredProcessPresets','processMasterReferenceStage','processMasterCatalogTemplates'];
 const functions=names.map(name=>{const declaration=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert(declaration);return declaration.getText(ast);});
 const constants=['PROCESS_TEMPLATE_PRESETS','PROCESS_TEMPLATE_PRESET_VERSION'].map(name=>{const statement=ast.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>item.name.getText(ast)===name));assert(statement);return statement.getText(ast);});
 await x.f.mutateValues(values=>{const root=JSON.parse(values.masterDataControl);root.active.AB.lines[0].stages.push({id:'missing-approved-stage',code:'A-MISSING',name:'Approved missing stage'});values.masterDataControl=JSON.stringify(root);});
 const bar=x.box.document.createElement('div');bar.className='process-master-actions';x.box.document.body.append(bar);let paints=0;
 x.box.routing={lines:[{code:'A',stages:[{code:'A-CUT'},{code:'A-MISSING'}]}]};x.box.currentProcessMasterData=x.draft;x.box.editableProcessMasterData=x.draft;x.box.hasPermission=key=>key==='templates.create';x.box.processMasterText=zh=>zh;x.box.MasterDataWorkflow={shared:x.bridge};x.box.repaintProcessMasterPage=()=>paints++;x.box.toast=message=>assert.fail(message);
 vm.runInContext(constants.concat(functions).join('\n'),x.box);const start=app.indexOf('    const missingStages=routing.lines.flatMap'),end=app.indexOf('    const addMasterTemplate =',start);assert(start>0&&end>start);vm.runInContext(app.slice(start,end),x.box);const button=bar.querySelector('button');assert(button);const row=x.f.row();await button.onclick();assert.equal(paints,1);assert.equal(x.posts().length,0);assert.deepEqual(x.f.row(),row);const additions=copy(x.draft()['A-MISSING']);assert.equal(additions.filter(item=>item.presetKey).length,5);assert.equal(new Set(additions.map(item=>item.id)).size,additions.length);assert(additions.every(item=>!item.machineIds.length));const saved=await x.bridge.execute('PROCESS','save');assert.equal(x.posts().length,1);assert.deepEqual(copy(saved.control.workflow.saved.content['A-MISSING']),additions);assert.equal(JSON.parse((await x.f.decoded()).masterDataControl).active.PROCESS['A-MISSING'],undefined);
});
void test('PROCESS no-conflict Save reads one comparison before its single CAS; dialog choices retain a fresh second read',async t=>{
 const x=await setup(t);await x.stage('One explicit Save');const start=x.calls.length;await x.bridge.execute('PROCESS','save');const calls=x.calls.slice(start),post=calls.findIndex(row=>row.body);assert.equal(calls.slice(0,post).filter(row=>!row.body).length,1);assert.equal(calls.filter(row=>row.body).length,1);assert(Number.isSafeInteger(calls[post].body.command.expectedRevision));
});

void test('PROCESS actual name binder renders local-only actions and updates status without removed review button',async t=>{
 const x=await setup(t),box=x.box,doc=box.document;
 const create=doc.createElement.bind(doc);doc.createElement=tag=>{const node=create(tag);node.dataset=new Proxy(node.dataset,{set(target,key,value){target[key]=String(value);node.attrs['data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(value);return true;}});return node;};
 const app=fs.readFileSync('public/process/app.js','utf8'),ast=ts.createSourceFile('app.js',app,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
 const names=['processMasterText','processMasterTemplateKey','processMasterCatalogMatches','bindProcessMasterName'];
 const functions=names.map(name=>{const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(node,name);return node.getText(ast);}).join('\n');
 Object.assign(box,{MasterDataWorkflow:{shared:x.bridge},editableProcessMasterData:()=>x.draft(),updateProcessSharedStatus(){},LocalDraftRecoverySession:{create(){throw Error('LOCAL_RECOVERY_FORBIDDEN');}},processMasterNameBindings:new Set()});
 vm.runInContext(functions,box);const parent=doc.createElement('section');parent.className='master-template';parent.dataset.templateKey=box.processMasterTemplateKey(x.draft()['A-CUT'][1]);const label=doc.createElement('label');label.className='template-name-field';const input=doc.createElement('input');input.value=x.draft()['A-CUT'][1].name;label.append(input);parent.append(label);doc.body.append(parent);box.bindProcessMasterName(input);
 const bar=doc.querySelector('.process-name-apply-bar');assert(bar);assert.equal(bar.querySelector('[data-name-action="review"]'),null);assert.equal(bar.querySelector('[data-name-action="recovery"]'),null);assert(bar.querySelector('[data-name-action="apply"]'));
 input.value='Local actual binder';input.oninput({isComposing:false});assert.match(bar.textContent,/名稱修改留在本機/);assert.doesNotMatch(bar.textContent,/恢復/);assert.equal(x.posts().length,0);
});
