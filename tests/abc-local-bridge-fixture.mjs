// Actual bridge + shared transport + production handlers. Only browser ports and
// isolated SQLite/R2 bindings are synthetic; no private fixture snapshots.
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
import {fixture as apiFixture} from './master-ab-auth-phase-fixture.mjs';
export async function fixture({scope='AB',disk=new Map(),api,sharedSource}={}){
 const f=api||await apiFixture({scope}),calls=[],control={active:{},versions:[]},events=new Map();let mode='',form=false;
 const box={window:null,crypto:webcrypto,URL,URLSearchParams,Request,Response,Headers,AbortController,TextEncoder,performance,console,setTimeout,clearTimeout,location:{origin:'https://fixture.invalid',pathname:'/process/'},document:{documentElement:{lang:'zh'},body:{style:{}},querySelector:()=>form?{}:null,querySelectorAll:()=>[]},ProcessSync:{identity:f.user,identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,platformHeaders:()=>f.headers},addEventListener(name,fn){const list=events.get(name)||[];list.push(fn);events.set(name,list);},sessionStorage:{get length(){return disk.size;},key:i=>[...disk.keys()][i]??null,getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)}};box.window=box;
 box.fetch=async(url,options)=>{
  const body=options.body&&JSON.parse(options.body);calls.push({url,method:options.method,body});
  if(mode==='missing'&&url.includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
  const response=await f.route[options.method](new Request(new URL(url,'https://fixture.invalid'),{...options,headers:f.headers}));
  if((mode==='lost'||mode==='lost-begin')&&body)throw Error('Synthetic lost ACK');return response;
 };
 vm.createContext(box);for(const p of ['shared-draft-client.js','master-shared-client.js'])vm.runInContext(p==='shared-draft-client.js'&&sharedSource!==undefined?sharedSource:fs.readFileSync('public/process/'+p,'utf8'),box);
 const bridge=box.createMasterSharedBridge({control});await bridge.load(scope);
 return {f,box,bridge,control,disk,calls,scope,draft:()=>control.versions.find(v=>v.scope===scope&&v.status==='draft'),mode:v=>mode=v,form:v=>form=v,emit:name=>{for(const fn of events.get(name)||[])fn({});},posts:()=>calls.filter(c=>c.method==='POST')};
}
