import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
const source=fs.readFileSync('public/process/routine-fqc.js','utf8'),shared=fs.readFileSync('public/process/shared-draft-client.js','utf8'),copy=structuredClone;
const instrument=source.replace('  function paint() {','  function paint() { if(window.skipPaint)return;').replace(/\}\)\(\);\s*$/,'window.testRoutine={s,postOwned,read,save,refresh,act,buffer,dirty,record:()=>receiptRecord,setData:v=>data=v,getData:()=>data,setRoot:v=>root=v};})();');
assert.notEqual(instrument,source);assert(instrument.includes('window.testRoutine='));
function storage(){const map=new Map(),calls=[];let fault=null;return{map,calls,setFault:fn=>fault=fn,get length(){fault?.('length');return map.size;},key(i){fault?.('key');return [...map.keys()][i]??null;},getItem(k){calls.push(['get',k]);fault?.('get',k);return map.get(k)??null;},setItem(k,v){calls.push(['set',k,v]);fault?.('set',k,v);map.set(k,v);},removeItem(k){calls.push(['remove',k]);fault?.('remove',k);map.delete(k);}};}
export function fixture({store=storage(),actor='owner',remote=null}={}){
 const content={title:'Original',date:'2026-10-31',notes:'',reason:'',disposition:'',evidence:[],lines:[]};
 remote||={identity:{id:actor},permissions:{view:true,edit:true,save:true,submit:true,approve:true,return:true,withdraw:true,history:true},revision:50,control:{revision:10,startDate:'2026-10-31',documents:[{id:'doc',kind:'plan',flow:{scope:'routine-fqc:doc',generation:'generation-1',revision:5,working:copy(content),saved:{id:'saved-original',revision:4,content:copy(content)},pendingId:null,active:{id:null},cases:[]}}],jobs:[],cases:[]},sources:[],catalog:{},today:'2026-10-31'};
 let epoch=1,delivery=1,mode='ok',error={error:'PROXY_UNKNOWN'},errorStatus=409,afterPost=()=>{},afterRead=()=>{},alterReceipt=x=>x;const receipts=new Map(),calls=[],listeners=new Map();
 const sync={identity:{id:actor},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:x=>x===delivery};
 const win={ProcessSync:sync,localStorage:store,skipPaint:true,addEventListener(name,fn){const all=listeners.get(name)||[];all.push(fn);listeners.set(name,all);}};
 const box={window:win,document:{documentElement:{lang:'zh'},hidden:false,querySelector:()=>null,addEventListener(){}},crypto:webcrypto,setInterval(){},setTimeout,clearTimeout,AbortController,URL,URLSearchParams,Response,console,structuredClone,async fetch(url,options={}){
  const method=options.method||'GET';calls.push({url,method,body:options.body||'',responseBytes:0});const call=calls.at(-1);const response=(value,status=200)=>{call.responseBytes=Buffer.byteLength(JSON.stringify(value));return Response.json(value,{status});};
  if(method==='POST'){
   const body=JSON.parse(options.body);if(mode==='reject')return response(error,errorStatus);if(mode==='lost')throw Error('LOST');
   const d=remote.control.documents.find(d=>d.id===body.documentId),cmd=body.command;let result={ok:true};
   if(body.action==='draft'){
    if(cmd.action==='apply')for(const p of cmd.patches){d.flow.working[p.path[0]]=copy(p.value);}
    if(cmd.action==='save')d.flow.saved={id:'saved-'+body.operationId,revision:d.flow.revision,content:copy(d.flow.working)};
    if(cmd.action==='submit')d.flow.pendingId='case-'+body.operationId;
    if(['approve','return','withdraw'].includes(cmd.action)){d.flow.generation='generation-'+body.operationId;d.flow.pendingId=null;if(cmd.action==='approve')d.flow.saved=null;}
    d.flow.revision++;result={operationId:body.operationId,generation:d.flow.generation,revision:d.flow.revision,savedId:d.flow.saved?.id||null,caseId:d.flow.pendingId,unchanged:false};
   }
   remote.control.revision++;remote.revision++;receipts.set(body.operationId,copy(result));await Promise.resolve(afterPost(body,result));
   if(mode==='commit-lost')throw Error('LOST');return response({result:alterReceipt(result),revision:remote.control.revision,requestId:webcrypto.randomUUID()});
  }
  const op=new URL(url,'https://example.invalid').searchParams.get('operationId');
  if(op){if(mode==='receipt404'||!receipts.has(op))return response({error:'OPERATION_NOT_FOUND'},404);return response({result:alterReceipt(copy(receipts.get(op))),revision:remote.control.revision});}
  if(mode==='read403')return response({error:'FORBIDDEN'},403);if(mode==='read503')return response({error:'OFFLINE'},503);
  await Promise.resolve(afterRead());return response(copy(remote));
 }};
 vm.createContext(box);vm.runInContext(shared,box);vm.runInContext(instrument,box);const api=win.testRoutine;api.setData(JSON.parse(JSON.stringify(remote)));api.setRoot({isConnected:true});api.s.selected='doc';
 const command=(action='apply',extra={})=>({action:'draft',documentId:'doc',operationId:webcrypto.randomUUID(),command:{action,generation:api.getData().control.documents[0].flow.generation,clientId:'client-original',sequence:1,...(action==='apply'?{patches:[{op:'set',path:['title'],value:'Mine'}],guards:[{path:['title'],value:'Original'}]}:{}),...extra}});
 const draft=(action,extra)=>{const c=command(action,extra);c.command.operationId=c.operationId;return c;};
 return{api,box,win,sync,store,remote,receipts,calls,draft,setMode:v=>mode=v,reject:(status,body)=>{mode='reject';errorStatus=status;error=body;},epoch:()=>epoch++,delivery:()=>delivery++,afterPost:fn=>afterPost=fn,afterRead:fn=>afterRead=fn,alterReceipt:fn=>alterReceipt=fn,event:name=>listeners.get(name)?.forEach(fn=>fn({})),posts:()=>calls.filter(c=>c.method==='POST').length,methods:()=>calls.map(c=>c.method),metadata:()=>[...store.map.values()].map(JSON.parse)};
}

