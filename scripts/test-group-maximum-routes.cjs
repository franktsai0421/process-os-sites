/* oxlint-disable typescript/no-require-imports -- isolated helpers and real API handlers. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const fixture=require('./ipqc-assignment-fixture.cjs'),host={};
vm.runInNewContext(fs.readFileSync('public/process/master-admin-ui.js','utf8'),{window:host});
vm.runInNewContext(fs.readFileSync('public/process/master-shared-client.js','utf8'),{window:host});
const ui=host.MasterAdminUI,bridge=host.createMasterSharedBridge({control:{}}),copy=v=>JSON.parse(JSON.stringify(v)),equal=(a,b)=>assert.deepEqual(copy(a),copy(b));
async function main(){
 let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
 for(const line of ['A','B','C']){
  const catalog={lines:[{code:line,stages:'ABCDE'.split('').map(code=>({code}))}],categoryGroups:[{line,name:'G'}],products:[{id:'p1',code:'1',line,category:'G',stages:'ABCD'.split('')},{id:'p2',code:'2',line,category:'G',stages:'ABCEDE'.split('')}]},before=copy(catalog);
  equal(ui.groupRoute(catalog,line,'G').maximum,'ABCDE'.split(''));equal(catalog,before);equal(ui.groupRoute(catalog,line,'G').conflicts,['2']);pass(line+' ABCD + ABCEDE -> ABCDE without rewriting source/repetitions');
  catalog.products.push({id:'p3',code:'3',line,category:'G',stages:'ABCDE'.split(''),routeMode:'exception'});
  ui.setGroupRoute(catalog,line,'G','ABCDE'.split(''),true);assert.equal(catalog.products[0].routeMode,'exception');assert.equal(catalog.products[2].routeMode,'group');equal(catalog.products[1].stages,'ABCEDE'.split(''));
  ui.setGroupRoute(catalog,line,'G',null);equal(catalog.products[0].stages,'ABCD'.split(''));assert.ok(catalog.products.every(p=>p.routeMode==='exception'));pass(line+' maximum adoption classifies equal routes and preserves shorter/ordered exceptions; removal preserves all');
 }
 const agreed={lines:[{code:'B',stages:['ASSY','PACK','FINAL','PHAO','HCT'].map(code=>({code}))}],categoryGroups:[],products:[{line:'B',category:'G',stages:['PHAO','HCT','ASSY','PACK','FINAL']}]};equal(ui.groupRoute(agreed,'B','G').maximum,agreed.products[0].stages);pass('agreed product order beats unrelated master enumeration order');
 const cyclic={lines:[{code:'A',stages:['FINAL','X','Y'].map(code=>({code}))}],categoryGroups:[],products:[{line:'A',category:'G',stages:['X','Y','FINAL']},{line:'A',category:'G',stages:['Y','X','FINAL']}]};equal(ui.groupRoute(cyclic,'A','G').maximum,['X','Y','FINAL']);pass('cycle condensation retains unanimous downstream FINAL even when master lists FINAL first');
 cyclic.products=[{code:'repeat',line:'A',category:'G',stages:['X','Y','X']}];equal(ui.groupRoute(cyclic,'A','G').conflicts,['repeat']);pass('repeated-stage cycle is reported from original order constraints');
 const f=await fixture(process.argv[2]);let sequence=0;
 const endpoint='/api/master/workflow?scope=C&caseMetadata=1';
 async function get(){const r=await f.request(endpoint,'GET',undefined,'admin');assert.equal(r.status,200);return r.body;}
 async function cmd(action,detail={}){const current=await get();const r=await f.request(endpoint,'POST',{command:{operationId:randomUUID(),clientId:'max-route-test',sequence:++sequence,generation:current.control.workflow.generation,action,...detail}},'admin');assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
 try{
  const begin=await f.request(endpoint,'POST',{action:'begin'},'admin');assert.equal(begin.status,200);
  const before=copy((await get()).control.workflow.working),after=copy(before),info=ui.groupRoute(after,'C','TIEN');
  ui.setGroupRoute(after,'C','TIEN',info.maximum,true);const changes=copy(bridge.diff(before,after));changes.guards.push({path:['products'],value:before.products});await cmd('apply',changes);
  const current=(await get()).control.workflow.working;for(const p of before.products)equal(current.products.find(n=>n.id===p.id).stages,p.stages);pass('real C TIEN maximum atomic Apply retains every product route');
  const saved=(await cmd('save')).control.workflow.saved;const submitted=await cmd('submit',{savedId:saved.id,reason:'isolated maximum-route verification'});await cmd('approve',{caseId:submitted.receipt.caseId,reason:'isolated explicit self review',selfReviewConfirmed:true});
  const approved=await get();equal(approved.control.versions.find(v=>v.id===approved.control.activeVersionId).snapshot,after);pass('maximum setting manual Save / fixed Submit / explicit normal approval persists');
  await f.request(endpoint,'POST',{action:'begin'},'admin');
  const base=copy((await get()).control.workflow.working),next=copy(base),line=base.lines[0];
  ui.setGroupRoute(next,'C','GIA CONG',ui.groupRoute(next,'C','GIA CONG').maximum,true);
  const stale=copy(bridge.diff(base,next));stale.guards.push({path:['products'],value:base.products},{path:['lines'],value:base.lines});
  await cmd('apply',{patches:[{op:'order',path:['lines',{id:line.id},'stages'],ids:[...line.stages].reverse().map(s=>s.id)}],guards:[{path:['lines',{id:line.id},'stages'],value:line.stages}]});
  const now=await get(),revision=(await f.core.readState()).revision;
  const conflict=await f.request(endpoint,'POST',{command:{operationId:randomUUID(),clientId:'max-route-test',sequence:++sequence,generation:now.control.workflow.generation,action:'apply',...stale}},'admin');
  assert.equal(conflict.status,409);assert.equal(conflict.body.error,'DEPENDENCY_CHANGED_RECONFIRM');assert.equal((await f.core.readState()).revision,revision);pass('concurrent stage order change rejects stale maximum atomically');
  const controls=await f.core.readState();assert.ok(controls.revision);console.log(JSON.stringify({result:'PASS',checks,isolated:true}));
 }finally{f.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
