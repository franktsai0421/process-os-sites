// Production choices, validation and full IPQC controller; synthetic DOM/data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
const require=createRequire(import.meta.url),api=require('../scripts/ipqc-ab-import-harness.cjs')()('lib/process-ipqc.ts');
const copy=structuredClone,plain=v=>JSON.parse(JSON.stringify(v));
const tuple=c=>Object.fromEntries(['source','scope','itemId','sourceVersionId','productCodes'].map(k=>[k,copy(c[k])]));
function data(line){
 const source=line==='C'?'C':'AB',scope=source==='C'?'C':line+':SYN',stage=line==='C'?'TIEN':'CUT';
 const error={id:'error',code:'E',name:'Synthetic error',stageCode:stage,productCode:'001',line,group:'SYN',deleted:false};
 const item={id:'stable-item',code:'SYN-I',errorId:error.id,stageCode:stage,productCode:'001',productCodes:['reference-product'],standard:'Synthetic standard',description:'Visual',methodText:'Visual',sourceTool:'',sourceMethod:'',tool:'',method:'',equipmentSnapshot:null,rules:[],rule:null,sourceFrequency:'',frequency:'',standardPhotos:[],methodPhotos:[],mediaItems:[],isEnabled:true,standardEnabled:true,notApplicable:false,deleted:false};
 const versions=['old','current'].map(id=>({id,status:'approved',snapshot:{errors:[copy(error)],items:[copy(item)]}}));
 const control={activeVersionId:'current',versions},values={masterDataControl:JSON.stringify({active:{C:{products:['001','002'].map(code=>({code,line:'C',category:'SYN',stages:[]}))}}}),[source==='C'?'ipqcCMasterControl':'ipqcABMasterControl']:JSON.stringify(source==='C'?control:{scopes:{[scope]:control}})};
 const w={id:'workspace',line,category:'SYN',stages:{[stage]:[]}},op={id:'one',number:line+'-01',name:'Synthetic owner',stageCode:stage,productCodes:source==='C'?['001']:[],ipqcAssignments:[]};w.stages[stage]=[op];
 const choices=()=>api.ipqcChoices(values,w,op.stageCode,op.productCodes),a=tuple(choices().choices[0]);op.ipqcAssignments=[copy(a)];
 return{source,scope,stage,control,values,w,op,a,choices,write(){values[source==='C'?'ipqcCMasterControl':'ipqcABMasterControl']=JSON.stringify(source==='C'?control:{scopes:{[scope]:control}});}};
}
async function fixture(line,{lang='zh',historical=false,missing=false}={}){
 const d=data(line),dom=canvasDOM(),{document}=dom;document.documentElement.lang=lang;
 if(historical)d.op.ipqcAssignments[0].sourceVersionId='old';
 if(missing){d.control.versions.find(v=>v.id==='current').snapshot.items[0].deleted=true;d.write();}
 const requests=[],peer={id:'two',number:line+'-02',name:'Synthetic peer',stageCode:d.stage,ipqcAssignments:[],productCodes:copy(d.op.productCodes)},actor={id:'synthetic'};
 const box={window:null,document,console,URLSearchParams,URL,Response,Map,Set,Error,JSON,Date,Number,Math,queueMicrotask,Event:class{constructor(type,options){this.type=type;Object.assign(this,options);}},escapeHtml:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),state:{view:'editor',editorLine:line,category:'SYN'},ProcessSync:{identity:actor,platformHeaders:()=>({})},setInterval(){},setTimeout(){},clearTimeout(){},addEventListener(){},ensureCategoryEditor:()=>({[d.stage]:[d.op,peer]}),fetch:async(url,options={})=>{assert.equal(options.method||'GET','GET');requests.push(String(url));return Response.json(d.choices());}};box.window=box;vm.createContext(box);
 for(const file of ['shared-draft-client.js','process-ipqc.js'])vm.runInContext(fs.readFileSync('public/process/'+file,'utf8'),box,{filename:file});
 const dialog=document.createElement('dialog');dialog.id='process-operation-dialog';dialog.innerHTML='<button id="apply-operation"></button><section class="process-ipqc-panel"></section>';document.body.append(dialog);const panel=dialog.querySelector('section');
 const mount=()=>box.ProcessIPQC.mountChoices(panel,d.op);await mount();
 return{...d,box,dom,panel,peer,requests,mount,input:()=>panel.querySelector('[data-ipqc-choice]'),warnings:()=>panel.querySelectorAll('[data-ipqc-warning]'),count:s=>panel.querySelector('[data-ipqc-count="'+s+'"]').textContent};
}
for(const line of ['A','B','C'])for(const lang of ['zh','vi']){
 void test(`${line}/${lang} current tuple: selected and no warning; product-independent AB`,async()=>{
  const f=await fixture(line,{lang}),before=JSON.stringify(f.op);assert.equal(f.input().checked,true);assert.equal(f.input().closest('article').dataset.status,'selected');assert.equal(f.count('selected'),'1');assert.equal(f.warnings().length,0);assert.equal(JSON.stringify(f.op),before);
  if(line!=='C')for(const products of [[],['unrelated'],['one','two']]){f.op.productCodes=products;await f.mount();assert.equal(f.input().closest('article').dataset.status,'selected');assert.equal(f.warnings().length,0);}
 });
 void test(`${line}/${lang} same ID/product, newer whole-source approval: preserve historical pin and show precise retained state`,async()=>{
  const f=await fixture(line,{lang,historical:true}),before=JSON.stringify(f.op);assert.equal(f.input().checked,true);assert.equal(f.input().disabled,false);assert.equal(f.input().closest('article').dataset.status,'retained');assert.equal(f.count('selected'),'0');assert.equal(f.count('retained'),'1');assert.equal(f.warnings().length,1);assert.match(f.warnings()[0].textContent,/old/);assert.match(f.warnings()[0].textContent,/current/);assert.match(f.warnings()[0].dataset.ipqcReasons,/version/);assert.equal(JSON.stringify(f.op),before);
  api.validateIPQCAssignments([f.w],[copy(f.w)],f.values);assert(api.ipqcIssues([f.w],f.values).some(i=>i.message==='IPQC_REFERENCE_CHANGED:stable-item'));await f.mount();assert.equal(f.count('retained'),'1');assert.equal(JSON.stringify(f.op),before);
 });
 void test(`${line}/${lang} explicit uncheck/reselect updates warning/count/progress immediately and survives remount`,async()=>{
  const f=await fixture(line,{lang,historical:true});f.input().checked=false;f.input().onchange();assert.equal(f.panel.querySelectorAll('[data-ipqc-remove]').length,0,'old warning must disappear after explicit removal');assert.equal(f.count('retained'),'0');assert.equal(f.count('available'),'1');
  f.input().checked=true;f.input().onchange();assert.deepEqual(plain(f.op.ipqcAssignments),[f.a]);assert.equal(f.count('selected'),'1');assert.equal(f.count('retained'),'0');assert.equal(f.warnings().length,0);assert.equal(f.input().closest('article').dataset.status,'selected');assert.equal(f.panel.querySelector('.process-ipqc-group').dataset.complete,'true');
  api.validateIPQCAssignments([f.w],[],f.values);assert(!api.ipqcIssues([f.w],f.values).some(i=>i.message.startsWith('IPQC_REFERENCE_CHANGED')));await f.mount();assert.equal(f.count('selected'),'1');assert.equal(f.warnings().length,0);assert(f.requests.every(url=>url.startsWith('/api/process-ipqc?')));
 });
 void test(`${line}/${lang} deleted/missing current source retains warning and ownership, without current selection`,async()=>{
  const f=await fixture(line,{lang,missing:true}),before=JSON.stringify(f.op);assert.equal(f.input(),null);assert.equal(f.count('retained'),'1');assert.equal(f.count('selected'),'0');assert.equal(f.warnings().length,1);assert.match(f.warnings()[0].dataset.ipqcReasons,/unavailable/);assert.equal(JSON.stringify(f.op),before);api.validateIPQCAssignments([f.w],[copy(f.w)],f.values);assert(api.ipqcIssues([f.w],f.values).some(i=>i.message.startsWith('IPQC_REFERENCE_CHANGED')));
 });
 void test(`${line}/${lang} old pinned item stays occupied in another block and exposes owner`,async()=>{
  const f=await fixture(line,{lang,historical:true});f.peer.ipqcAssignments=copy(f.op.ipqcAssignments);f.op.ipqcAssignments=[];await f.mount();assert(f.input().disabled);assert.equal(f.input().closest('article').dataset.status,'occupied');assert.match(f.panel.querySelector('.process-ipqc-owner').textContent,/Synthetic peer/);f.input().checked=true;f.input().onchange();assert.deepEqual(f.op.ipqcAssignments,[]);assert.equal(f.count('occupied'),'1');
 });
}
void test('C same-version product mismatch remains retained; explicit replacement clears only its warning',async()=>{
 const f=await fixture('C');f.op.ipqcAssignments[0].productCodes=['002'];await f.mount();assert.equal(f.input().closest('article').dataset.status,'retained');assert.equal(f.warnings().length,1);assert.equal(f.warnings()[0].dataset.ipqcReasons,'products');assert.throws(()=>api.validateIPQCAssignments([f.w],[],f.values),/IPQC_SOURCE_CHANGED/);assert.equal(f.op.ipqcAssignments[0].productCodes[0],'002');
 f.input().checked=false;f.input().onchange();f.input().checked=true;f.input().onchange();assert.equal(f.warnings().length,0);assert.deepEqual(plain(f.op.ipqcAssignments[0].productCodes),['001']);
});
void test('C switching actual product or stage does not clear historical links or true invalid warnings',async()=>{
 const f=await fixture('C'),before=copy(f.op.ipqcAssignments);f.op.productCodes=['002'];await f.mount();assert.equal(f.input(),null);assert.equal(f.count('retained'),'1');assert.deepEqual(plain(f.op.ipqcAssignments),before);f.op.productCodes=['001'];f.op.stageCode='OTHER';await f.mount();assert.equal(f.input(),null);assert.equal(f.count('retained'),'1');assert.deepEqual(plain(f.op.ipqcAssignments),before);
});

void test('entry and exit have no IPQC tab; historical fields remain untouched',()=>{
 const box={};box.window=box;vm.createContext(box);vm.runInContext(fs.readFileSync('public/process/editor-graph.js','utf8'),box);const graph=box.ProcessEditorGraph;
 for(const type of ['entry','exit'])assert.equal(graph.tabs(type).includes('ipqc'),false);for(const type of ['manual','inspection','machine','custom'])assert(graph.tabs(type).includes('ipqc'));
});
