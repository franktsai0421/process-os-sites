// Actual C handler, shared transport and full C page; isolated SQLite/R2 and DOM.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import {createRequire} from 'node:module';import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
const require=createRequire(import.meta.url),{fixture}=require('../scripts/ipqc-c-operation-fixture.cjs'),gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
for(const language of ['zh','vi'])for(const fault of ['delay','readback503','mismatched-receipt'])void test('IPQC-C Begin '+language+' '+fault+' shows only qualified receipt and recovers same-page with one POST',async()=>{
 const seed={schemaVersion:1,activeVersionId:'approved-fixture',source:null,reservedErrorCodes:[],reservedItemCodes:[],versions:[{id:'approved-fixture',number:1,status:'approved',snapshot:{errors:[],items:[]},baseVersionId:null,revision:1,creatorId:'fixture',creatorName:'Synthetic',createdAt:'fixture',updatedAt:'fixture',history:[]}]};
 const f=await fixture({ipqcCMasterControl:JSON.stringify(seed)}),held=gate(),reached=gate(),{document,events}=canvasDOM(),calls=[],mounts=[];let ack=false,block=true,tamper=fault==='mismatched-receipt';
 const data=new Map(),actor={id:'preview-editor'},box=events({document,console,crypto:webcrypto,URL,URLSearchParams,Response,AbortController,performance,TextEncoder,Uint8Array,setTimeout,clearTimeout,location:{origin:'http://fixture',pathname:'/process/'},confirm:()=>true,alert(){},toast(){},scrollY:0,scrollTo(){}});box.window=box;
 box.sessionStorage={get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 box.ProcessSync={identity:actor,identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,platformHeaders:()=>f.sessions.editor,requiresReload:false};
 box.ProcessIPQC={mountReferences:async()=>{},referenceMarkup:()=>''};box.VersionDraftUI={preserveView:()=>()=>{},date:()=>'',reasonFor:()=>'',mount:(_host,value)=>mounts.push(value)};
 box.fetch=async(url,options={})=>{const u=new URL(url,'http://fixture'),body=options.body&&JSON.parse(options.body),method=options.method||'GET';calls.push({url:String(url),body,method});
  if(ack&&block&&method==='GET'&&!u.searchParams.has('operationId')){reached.resolve();await held.promise;if(fault==='readback503')return Response.json({error:'SYNTHETIC_READBACK_DOWN'},{status:503});}
  const route=f.load('app'+u.pathname+'/route.ts'),response=await route[method](new Request(u,{...options,method,headers:f.sessions.editor}));
  if(body?.action==='begin-v1'){ack=true;if(tamper){const result=await response.json();result.receipt.operationId='00000000-0000-4000-8000-000000000000';return Response.json(result);}}
  return response;
 };
 const area=document.createElement('section');area.innerHTML='<header class="ipqcc-header"></header><input id="retained-input" value="typed">';document.body.append(area);
 vm.createContext(box);vm.runInContext(fs.readFileSync('public/process/shared-draft-client.js','utf8'),box);
 const page=fs.readFileSync('public/process/ipqc-c.js','utf8'),end=page.lastIndexOf('})();');vm.runInContext(page.slice(0,end)+`window.__C={setup(value){host=window.__host;language=window.__lang;control=value;catalog={products:[],stages:[]};},writeShared,checkPreviousOperation,sharedTransport,mountVersionState,get:()=>({busy,control,message})};`+page.slice(end),box);box.__host=area;box.__lang=language;
 try{
  box.__C.setup((await f.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1')).control);await box.__C.sharedTransport().read();const input=area.querySelector('#retained-input'),pending=box.__C.writeShared('begin');
  if(tamper){assert.equal(await pending,null);assert.equal(box.__C.sharedTransport().confirmedOperation(),null);assert(box.__C.sharedTransport().hasUnknownBegin());tamper=false;block=false;await box.__C.checkPreviousOperation();}
  else {await Promise.race([reached.promise,pending.then(()=>{throw Error('BEGIN_EARLY '+JSON.stringify(box.__C.get())+' '+JSON.stringify(calls));})]);const client=box.__C.sharedTransport();assert.equal(client.confirmedOperation()?.action,'begin');assert.equal(area.querySelector('#retained-input'),input);assert.equal(input.value,'typed');assert.equal(mounts.at(-1).failed,false);assert.match(mounts.at(-1).syncNotice,/原操作收據已確認|Biên nhận gốc đã xác nhận/);await box.__C.writeShared('begin');assert.equal(calls.filter(c=>c.method==='POST').length,1);assert(client.hasUnknownBegin());held.resolve();const result=await pending;
   if(fault==='readback503'){assert.equal(result,null);box.__C.mountVersionState();assert.equal(mounts.at(-1).failed,false);assert.match(mounts.at(-1).syncNotice,/原操作收據已確認|Biên nhận gốc đã xác nhận/);block=false;await box.__C.checkPreviousOperation();}else assert(result);
  }
  assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.equal(box.__C.sharedTransport().hasUnknown(),false);assert.equal(box.__C.sharedTransport().confirmedOperation(),null);assert(box.__C.get().control.workflow.generation);assert.equal(box.__C.get().busy,false);assert((await f.read('ipqc-c')).workflow.generation);
 }finally{held.resolve();f.close();}
});
