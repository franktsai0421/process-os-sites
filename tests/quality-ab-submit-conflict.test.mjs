// Actual AB module handler + shared client + full AB controller, private fixtures.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import {createRequire} from 'node:module';import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
const require=createRequire(import.meta.url),{createTransferFixture}=require('../scripts/equipment-transfer-fixture.cjs');
for(const language of ['zh','vi'])for(const mode of ['original','missing-request-id','receipt-only','fetch-status'])void test('AB module Submit '+language+' '+mode+' conflict preserves saved draft; only exact original refusal settles',async()=>{
 const h=await createTransferFixture(),disk=new Map([['unrelated','keep']]),calls=[];let conflict=true,referenceState;
 try{
  await h.begin('ipqc-ab','editor',200,'&module=1');const group=await h.read('ipqc-ab','editor','&scope=A%3AG-A'),row=h.flow(group).working.items[0];
  await h.command('ipqc-ab','save',{moduleAction:'save-local-v1',input:{scopes:[{scope:'A:G-A',generation:h.flow(group).generation,baseId:group.control.activeVersionId,changes:[{patches:[{op:'set',path:['items',{id:row.id},'methodText'],value:'Saved QA method'}],guards:[{path:['items',{id:row.id},'methodText'],value:row.methodText}]}]}]}},'editor',200,'&module=1');
  async function realm(){
   const dom=canvasDOM(),{document,events}=dom;Object.defineProperty(dom.Node.prototype,'options',{get(){return this.querySelectorAll('option');}});const actor={id:'preview-editor',name:'Synthetic',role:'staff'},box=events({console,document,crypto:webcrypto,TextEncoder,Uint8Array,URL,URLSearchParams,Response,AbortController,performance,setTimeout:()=>1,clearTimeout(){},MutationObserver:class{observe(){}},location:{origin:'http://fixture',pathname:'/process/',search:''},navigator:{},CustomEvent:class{},alert(){},toast(){},confirm:()=>true,scrollY:0,scrollTo(){}});box.window=box;document.documentElement.lang=language;document.contains=node=>document.documentElement.contains(node);
   box.sessionStorage={get length(){return disk.size;},key:i=>[...disk.keys()][i]??null,getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)};
   box.ProcessSync={identity:actor,identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:x=>x===1,platformHeaders:()=>h.sessions.editor,requiresReload:false};box.hasPermission=()=>true;box.state={view:'data',dataTab:'quality-ipqc-ab'};box.bindDataInner=()=>{};box.ProcessIPQC={referenceMarkup:()=>'',mountReferences:async()=>{}};
   box.fetch=async(url,options={})=>{const u=new URL(url,'http://fixture'),body=options.body&&JSON.parse(options.body),method=options.method||'GET';calls.push({url:String(url),body,method});
    if(conflict&&body?.command?.action==='submit'){h.db.prepare('UPDATE shared_state SET revision=revision+1').run();referenceState=h.snapshot();}
    if(mode==='receipt-only'&&u.searchParams.has('operationId'))return Response.json({error:'MODULE_CHANGED_RECONFIRM',requestId:webcrypto.randomUUID()},{status:409});
    const response=await h.load('app'+u.pathname+'/route.ts')[method](new Request(u,{...options,method,headers:h.sessions.editor}));
    if(body?.command?.action==='submit'&&conflict){assert.equal(response.status,409);const result=await response.clone().json();assert.equal(result.error,'MODULE_CHANGED_RECONFIRM');if(mode==='fetch-status')throw Object.assign(Error('MODULE_CHANGED_RECONFIRM'),{status:409,requestId:webcrypto.randomUUID()});if(mode==='receipt-only')throw Error('LOST_RESPONSE');if(mode==='missing-request-id'){delete result.requestId;return Response.json(result,{status:409});}}
    return response;
   };
   vm.createContext(box);for(const name of ['shared-draft-client.js','version-draft-ui.js'])vm.runInContext(fs.readFileSync('public/process/'+name,'utf8'),box);box.VersionDraftUI.mount=()=>{}; // Header layout is covered separately; AB action/recovery controls are real.
   box.VersionDraftUI.confirmSubmit=async()=> 'Synthetic explicit confirmation';
   let page=fs.readFileSync('public/process/ipqc-ab.js','utf8');page=page.replace('  window.IPQCABUI = {',`  window.__AB={moduleSave,queryLocalOperation,moduleTransport,draw,get:()=>({busy,message,control})};\n  window.IPQCABUI = {`);vm.runInContext(page,box);
   const host=document.createElement('main');host.dataset.activeTab='quality-ipqc-ab';document.body.append(host);await box.IPQCABUI.mount(host);assert(host.querySelector('#ipqcab-line'),'actual page mounted: '+host.textContent);return{box,probe:box.__AB,host};
  }
  const f=await realm(),before=await h.read('ipqc-ab','editor','&module=1'),saved=h.flow(before).saved;
  await f.probe.moduleSave('submit');const posts=()=>calls.filter(c=>c.method==='POST');assert.equal(posts().length,1);assert.deepEqual(h.snapshot(),referenceState,'refusal made no write');assert.equal(f.probe.get().busy,false);assert.equal(disk.get('unrelated'),'keep');
  if(mode==='original'){
   assert.equal(f.probe.moduleTransport().hasUnknown(),false);assert.match(f.host.textContent,/本次送審未寫入|lần gửi duyệt này chưa ghi/);assert(f.host.querySelector('#ipqcab-submit'));assert.equal(disk.size,1);const current=await h.read('ipqc-ab','editor','&module=1');assert.deepEqual(h.flow(current).saved,saved);assert.equal(h.flow(current).pendingId,null);
   conflict=false;await f.probe.moduleSave('submit');assert.equal(posts().length,2,'new explicit click, never automatic retry');assert((await h.read('ipqc-ab','editor','&module=1')).control.workflow.pendingId);
  }else{
   const raw=[...disk];assert(f.probe.moduleTransport().hasUnknown());const query=f.host.querySelector('[data-ab-local-query]');assert(query);assert.equal(query.disabled,false);conflict=false;
   await f.probe.queryLocalOperation();assert.equal(posts().length,1);assert.deepEqual([...disk],raw);assert(f.probe.moduleTransport().hasUnknown());if(mode!=='receipt-only')assert.match(f.host.textContent,/不能據此判定未寫入|chưa thể kết luận chưa ghi/);
   const fresh=await realm();assert(fresh.probe.moduleTransport().hasUnknown());assert(fresh.host.querySelector('[data-ab-local-query]'));await fresh.probe.queryLocalOperation();assert.equal(posts().length,1);assert.deepEqual([...disk],raw);
  }
 }finally{h.close();}
});
