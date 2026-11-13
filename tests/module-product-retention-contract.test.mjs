import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=fs.readFileSync('public/process/ipqc-c.js','utf8');
const editor=fs.readFileSync('public/process/process-editor.js','utf8');
function unique(source,pattern){const matches=[...source.matchAll(pattern)];assert.equal(matches.length,1,'pin actual handler exactly once');return matches[0][1];}
const productHandler=unique(c,/if\(button\.dataset\.ipqccProduct\)\{([^}]+)\}/g);
void test('actual IPQC C product handler retains staged per-product fields, photos and receipt across switch/back without a write',()=>{
 const working={errors:[{id:'a',productCode:'A',name:'unsaved A',mediaItems:[{src:'local-a'}]},{id:'b',productCode:'B',name:'unsaved B',mediaItems:[{src:'local-b'}]}]};
 const control={workflow:{generation:'g',saved:{content:{errors:[]}}}},localChanges=[{id:'a',name:'unsaved A'}],localPhotos=new Map([['local-a',{preview:'pending-a'}]]),sharedClient={originalReceipt:'unchanged'};
 const before=structuredClone({working,control,localChanges,localPhotos});let paints=0,cancels=0;
 const productForms=new Map();
 const box={productForms,selectedVersionId:'draft',editing:()=>true,button:{dataset:{ipqccProduct:'B'}},productCode:'A',stageCode:'S',errorId:'a',working,control,localChanges,localPhotos,sharedClient,mountSequence:7,busy:false,modal:{generation:'g',fields:{name:'unapplied dialog input'},photos:[{preview:'unapplied-photo'}]},picker:{},viewer:{},conflict:{},cancelSaveChoice:()=>cancels++,draw:()=>paints++,clearLocal:()=>assert.fail('product switch must not clear staged input'),write:()=>assert.fail('product switch must not write')};vm.createContext(box);
 const originalModal=box.modal;
 const retain=unique(c,/function retainProductDraft\(nextProduct\)\{([\s\S]*?)\n  \}/g);
 vm.runInContext('function retainProductDraft(nextProduct){'+retain+'}',box);
 for(const product of ['B','A']){box.button.dataset.ipqccProduct=product;vm.runInContext('(function(){'+productHandler+'})()',box);assert.equal(box.productCode,product);assert.deepEqual({working:box.working,control:box.control,localChanges:box.localChanges,localPhotos:box.localPhotos},before);}
 assert.equal(paints,2);assert.equal(cancels,2);assert.equal(box.mountSequence,7);assert.equal(box.sharedClient,sharedClient);assert.equal(sharedClient.originalReceipt,'unchanged');
 assert.equal(box.modal,originalModal);assert.equal(box.stageCode,'S');assert.equal(box.errorId,'a');
 assert.equal(box.modal.fields.name,'unapplied dialog input');assert.equal(box.modal.photos[0].preview,'unapplied-photo');
 for(const field of ['picker','viewer','conflict'])assert.equal(box[field],null);
});
void test('actual process operation product selector retains product notes, steps and photos without completing or saving',()=>{
 const handler=unique(editor,/query\('\[data-work-product-select\]'\)\)query\('\[data-work-product-select\]'\)\.onchange=e=>\{([^}]+)\}/g);
 const m={product:'A',draft:{productInstructions:{A:'unsaved A',B:'unsaved B'},productInstructionSteps:{A:[{text:'A step'}]},productMediaItems:{A:[{src:'pending-A'}],B:[{src:'pending-B'}]}}},before=structuredClone(m.draft);let paints=0;
 const box={m,e:{target:{value:'B'}},repaint:()=>paints++};vm.createContext(box);vm.runInContext(handler,box);assert.equal(m.product,'B');box.e.target.value='A';vm.runInContext(handler,box);assert.equal(m.product,'A');assert.deepEqual(m.draft,before);assert.equal(paints,2);
});
void test('actual IPQC C module reset clears unsent working and modal but retains original transport identity',()=>{
 const reset=unique(c,/error:\(\)=>navigationError,reset\(\)\{([\s\S]*?)\}\},html:/g);let clears=0,cancels=0;
 const sharedClient={originalReceipt:'unchanged'},box={clearProductForms:()=>clears++,cancelSaveChoice:()=>cancels++,clearLocal:()=>clears++,busy:true,modal:{photos:[{src:'pending'}]},picker:{},viewer:{},errorRecovery:null,errorRecoveryPending:null,mountSequence:1,saveInputNotice:{},readRecoveryNeeded:true,pollTimer:{cancel(){}},host:{},reviewHost:{},control:{},revision:1,working:{unsaved:true},catalog:{},equipment:[],equipmentGroups:[],equipmentCategories:[],equipmentSubcategories:[],selectedVersionId:'v',caseHistory:{},navigationError:null,sharedClient};vm.createContext(box);vm.runInContext(reset,box);
 assert.equal(clears,2);assert.equal(cancels,1);assert.equal(box.working,null);assert.equal(box.modal,null);assert.equal(box.mountSequence,2);assert.equal(box.sharedClient,sharedClient);assert.equal(sharedClient.originalReceipt,'unchanged');
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
void test('C retained forms do not cross generation, version, actor or revoked edit permission',()=>{
 const retain=unique(c,/function retainProductDraft\(nextProduct\)\{([\s\S]*?)\n  \}/g);
 for(const denied of ['generation','version','actor','permission']){
  const original={generation:'g',fields:{name:'private draft'},recoveryOwned:()=>denied!=='actor'};
  const box={productForms:new Map([['A',{modal:original,stageCode:'S',errorId:'e',versionId:denied==='version'?'old':'v'}]]),productCode:'B',stageCode:'T',errorId:'',selectedVersionId:'v',control:{workflow:{generation:denied==='generation'?'new':'g'}},editing:()=>denied!=='permission',modal:null,picker:null,viewer:null,conflict:null,cancelSaveChoice:null};
  vm.createContext(box);vm.runInContext('function retainProductDraft(nextProduct){'+retain+'}\nretainProductDraft("A")',box);assert.equal(box.modal,null,denied+' cannot restore an editable form');
 }
});
void test('C module form cleanup revokes only unapplied photo previews and clears retained forms',()=>{
 const clear=unique(c,/function clearProductForms\(\)\{([\s\S]*?)\n  \}/g);const revoked=[];
 const box={productForms:new Map([['A',{modal:{photos:[{preview:'unapplied'},{preview:'staged'}]}}]]),localPhotos:new Map([['staged',{preview:'staged'}]]),URL:{revokeObjectURL:value=>revoked.push(value)}};
 vm.createContext(box);vm.runInContext('function clearProductForms(){'+clear+'}\nclearProductForms()',box);assert.equal(box.productForms.size,0);assert.deepEqual(revoked,['unapplied']);
});
