import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=fs.readFileSync('public/process/ipqc-c.js','utf8');
const editor=fs.readFileSync('public/process/process-editor.js','utf8');
function unique(source,pattern){const matches=[...source.matchAll(pattern)];assert.equal(matches.length,1,'pin actual handler exactly once');return matches[0][1];}
const productHandler=unique(c,/if\(button\.dataset\.ipqccProduct\)\{([^}]+)\}/g);
void test('actual IPQC C product handler retains per-product unsaved fields and photos across switch/back without a write',()=>{
 const working={errors:[{id:'a',productCode:'A',name:'unsaved A',mediaItems:[{src:'local-a'}]},{id:'b',productCode:'B',name:'unsaved B',mediaItems:[{src:'local-b'}]}]};
 const modal={fields:{productCode:'A',description:'still typing'},photos:[{src:'pending-a'}]},control={workflow:{saved:{content:{errors:[]}}}},before=structuredClone({working,modal,control});let paints=0;
 const box={button:{dataset:{ipqccProduct:'B'}},productCode:'A',stageCode:'S',errorId:'a',working,modal,control,draw:()=>paints++};vm.createContext(box);
 vm.runInContext('(function(){'+productHandler+'})()',box);assert.equal(box.productCode,'B');box.button.dataset.ipqccProduct='A';vm.runInContext('(function(){'+productHandler+'})()',box);
 assert.equal(box.productCode,'A');assert.equal(paints,2);assert.deepEqual({working,modal,control},before);
});
void test('actual process operation product selector retains product notes, steps and photos without completing or saving',()=>{
 const handler=unique(editor,/query\('\[data-work-product-select\]'\)\)query\('\[data-work-product-select\]'\)\.onchange=e=>\{([^}]+)\}/g);
 const m={product:'A',draft:{productInstructions:{A:'unsaved A',B:'unsaved B'},productInstructionSteps:{A:[{text:'A step'}]},productMediaItems:{A:[{src:'pending-A'}],B:[{src:'pending-B'}]}}},before=structuredClone(m.draft);let paints=0;
 const box={m,e:{target:{value:'B'}},repaint:()=>paints++};vm.createContext(box);vm.runInContext(handler,box);assert.equal(m.product,'B');box.e.target.value='A';vm.runInContext(handler,box);assert.equal(m.product,'A');assert.deepEqual(m.draft,before);assert.equal(paints,2);
});
void test('actual IPQC C module reset clears unsent working and modal but retains original transport identity',()=>{
 const reset=unique(c,/error:\(\)=>navigationError,reset\(\)\{([\s\S]*?)\}\},html:/g);let clears=0;
 const sharedClient={originalReceipt:'unchanged'},box={clearLocal:()=>clears++,busy:true,modal:{photos:[{src:'pending'}]},picker:{},viewer:{},errorRecovery:null,errorRecoveryPending:null,mountSequence:1,saveInputNotice:{},readRecoveryNeeded:true,pollTimer:{cancel(){}},host:{},reviewHost:{},control:{},revision:1,working:{unsaved:true},catalog:{},equipment:[],equipmentGroups:[],equipmentCategories:[],equipmentSubcategories:[],selectedVersionId:'v',caseHistory:{},navigationError:null,sharedClient};vm.createContext(box);vm.runInContext(reset,box);
 assert.equal(clears,1);assert.equal(box.working,null);assert.equal(box.modal,null);assert.equal(box.mountSequence,2);assert.equal(box.sharedClient,sharedClient);assert.equal(sharedClient.originalReceipt,'unchanged');
});
void test('redraw sources retain current draft objects rather than clearing them on product selection',()=>{
 const draw=c.slice(c.indexOf('  function draw() {'),c.indexOf('  function refreshProducts() {'));
 assert(draw.includes('host.innerHTML = mainHTML()'));
 assert.doesNotMatch(draw,/\b(?:working|modal)\s*=(?!=)|\b(?:clearLocal|closeEditor|reset)\s*\(/);
 const panel=editor.slice(editor.indexOf(' function renderPanel(){'),editor.indexOf(' function bindPanel(){'));
 assert(panel.includes('o=m.draft'));assert(panel.includes('builders[m.tab](o)'));
 assert.doesNotMatch(panel,/\bm\.draft\s*=(?!=)|\bmodal\s*=(?!=)|\b(?:clearForm|discardLocal)\s*\(/);
 const repaint=unique(editor,/repaint=\(\)=>\{([^}]+)\};/g);
 assert(repaint.includes('renderPanel()'));assert.doesNotMatch(repaint,/\b(?:draft|modal)\s*=(?!=)|\b(?:clearForm|discardLocal)\s*\(/);
});
