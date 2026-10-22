import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const host={};

vm.runInNewContext(fs.readFileSync('public/process/master-admin-ui.js','utf8'),{window:host});

vm.runInNewContext(fs.readFileSync('public/process/master-shared-client.js','utf8'),{window:host});
const ui=host.MasterAdminUI,_bridge=host.createMasterSharedBridge({control:{}}),copy=v=>JSON.parse(JSON.stringify(v)),equal=(a,b)=>assert.deepEqual(copy(a),copy(b));

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
 console.log(JSON.stringify({result:'PASS',checks}));
}

main().catch(e=>{console.error(e);process.exitCode=1;});