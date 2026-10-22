import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const source=fs.readFileSync('public/process/process-editor.js','utf8'),results=[];
const extract=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));

function pass(name,fn){fn();results.push({name,status:'PASS'});}
const copy=v=>structuredClone(v),o={instructions:'common',instructionSteps:[{name:'one',text:'work',standard:'ok',legacy:'retain'},{name:'two',text:'work 2'}],productInstructions:{A:'A note',B:'B note'},productInstructionSteps:{A:[{name:'A one',text:'A text'},{name:'A two'}],B:[{name:'B one',text:'B text'}]},mediaItems:[{name:'common photo',src:'common.png'}],productMediaItems:{A:[{name:'A photo',src:'a.png'}],B:[{name:'B photo',src:'b.png'}]}};
const initial=JSON.stringify(o),modal={draft:copy(o),tab:'common',product:'',scroll:{},workSelection:{}},nodes=new Map(),panel={scrollTop:0,querySelector:s=>nodes.get(s)?.[0]||null,querySelectorAll:s=>nodes.get(s)||[]};
modal.dialog={querySelector:()=>panel};
const c={modal,h:s=>String(s??'').replaceAll('<','&lt;'),t:zh=>zh,operationWorkMediaItems:o=>o.mediaItems||[],operationProductMediaItems:(o,p)=>o.productMediaItems?.[p]||[],copy,renderPanel(){},host:{},state:{editorLine:'A'},codeKey:s=>s};
vm.createContext(c);
vm.runInContext(extract(' function workItemsMarkup(','\n function productWork(')+extract(' function bindPanel(){','\n async function apply(){'),c);

pass('Rendering common and product items preserves all stored fields',()=>{const a=c.workPanel(modal.draft,''),b=c.workPanel(modal.draft,'A');assert.match(a,/data-select-step="0"/);assert.match(a,/common.png/);assert.doesNotMatch(a,/a.png/);assert.match(b,/A text/);assert.match(b,/a.png/);assert.doesNotMatch(b,/B text/);assert.equal(JSON.stringify(modal.draft),initial);});
const fake=(dataset,value='')=>({dataset,value,classList:{toggle(){}},closest:()=>({classList:{toggle(){}}})});

pass('Rename and reorder operate only on selected product draft; Cancel source remains unchanged',()=>{modal.tab='product-work';modal.product='A';const name=fake({stepName:'0'},'A renamed'),down=fake({stepDown:'0'}),label={textContent:''};nodes.set('[data-step-name]',[name]);nodes.set('[data-step-down]',[down]);nodes.set('[data-select-step="0"] span',[label]);c.bindPanel();name.oninput();assert.equal(label.textContent,'A renamed');down.onclick();assert.equal(modal.draft.productInstructionSteps.A[1].name,'A renamed');assert.equal(modal.draft.productInstructionSteps.B[0].text,'B text');assert.equal(modal.draft.instructionSteps[0].name,'one');assert.equal(JSON.stringify(o),initial);});

pass('Add/remove steps and tab switching keep independent selection and contents',()=>{nodes.clear();const add=fake({}),remove=fake({stepRemove:'2'});nodes.set('[data-add-step]',[add]);c.bindPanel();add.onclick();assert.equal(modal.draft.productInstructionSteps.A.length,3);nodes.set('[data-step-remove]',[remove]);c.bindPanel();remove.onclick();assert.equal(modal.draft.productInstructionSteps.A.length,2);modal.tab='common';c.workPanel(modal.draft,'');assert.equal(modal.workSelection.common,0);c.workPanel(modal.draft,'B');assert.equal(modal.workSelection.B,0);assert.equal(modal.draft.instructionSteps[0].legacy,'retain');});

pass('Controls re-enable save after content sync without bypassing canvas permission',()=>{let content=false,canvas=true;const buttons=['add','delete','save','input','output','layout','edit'].map(pe=>({dataset:{pe}})),ctx={can:()=>content,canvasCan:()=>canvas,document:{querySelectorAll:()=>buttons}};vm.runInNewContext(extract(' function updateControls(){','\n function bind(){')+';this.update=updateControls',ctx);ctx.update();assert.equal(buttons[2].disabled,true);assert.equal(buttons[3].disabled,false);content=true;canvas=false;ctx.update();assert.equal(buttons[2].disabled,false);assert.equal(buttons[3].disabled,true);});

(async()=>{let saved=0;const classes=new Set(),root={classList:{contains:k=>classes.has(k),toggle:k=>classes.has(k)?classes.delete(k):classes.add(k)}};const doc={documentElement:root};
 const ctx={document:doc,remember(){},paint(){},host:{ProcessAuthoringV3:{save(){saved++;}}}};vm.runInNewContext(extract(' async function action(','\n function album(')+';this.run=action;',ctx);await ctx.run('fullscreen');assert.equal(classes.has('pe-fullscreen'),true);await ctx.run('save');assert.equal(saved,1);assert.equal(classes.has('pe-fullscreen'),true);await ctx.run('fullscreen');assert.equal(classes.size,0);results.push({name:'Fullscreen anchors to stable document without native fullscreen and uses existing Save flow',status:'PASS'});
 console.log(JSON.stringify({result:'PASS',evidence:'isolated VM; not browser fullscreen acceptance',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});