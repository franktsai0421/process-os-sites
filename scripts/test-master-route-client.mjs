import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const requests=[],host={ProcessSync:{identity:{id:'a'}},createSharedDraftClient:()=>({read:token=>new Promise((resolve,reject)=>requests.push({token,resolve,reject}))})};

vm.runInNewContext(fs.readFileSync('public/process/master-shared-client.js','utf8'),{window:host});
const control={versions:[],active:{}},bridge=host.createMasterSharedBridge({control}),body=(revision,name)=>({revision,permissions:{view:true},control:{activeVersionId:'v',versions:[{id:'v',status:'approved',snapshot:{name,products:[],lines:[],categoryGroups:[]}}]}});

(async()=>{
 const first=bridge.load('C');requests.shift().resolve(body(10,'current'));await first;
 const unchanged=bridge.load('C');const req=requests.shift();assert.equal(req.token,'state:10');req.resolve({revision:10,permissions:{view:true},unchanged:true});assert.equal((await unchanged).unchanged,true);assert.equal(control.active.C.name,'current');
 console.log('PASS unadopted catalog uses state revision token and retains current projection');
 const old=bridge.load('C'),newer=bridge.load('C'),oldRequest=requests.shift(),newRequest=requests.shift();newRequest.resolve(body(11,'newer'));await newer;oldRequest.resolve(body(10,'old'));await old;assert.equal(control.active.C.name,'newer');
 console.log('PASS delayed older success cannot replace newer source');
 for(const failure of [false,true]){const pending=bridge.load('C'),request=requests.shift();host.ProcessSync.identity={id:failure?'c':'b'};if(failure)request.reject(Error('old account error'));else request.resolve(body(12,'private old'));assert.equal((await pending).unchanged,true);assert.equal(control.active.C.name,'newer');}
 console.log('PASS delayed old-account success and failure are ignored');
})().catch(error=>{console.error(error);process.exitCode=1;});