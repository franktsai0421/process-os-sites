import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source=fs.readFileSync('public/process/version-workflow.js','utf8'),start=source.indexOf('  function validate('),end=source.indexOf('  function compare(',start);
assert(start>0&&end>start);
let v3=true,formal;
const product={code:'QA-P',category:'QA',name:'QA product'},route={line:'B',stages:['B-PHAO']};
const context={window:{ProcessAuthoringV3:{enabled:()=>v3}},data:{products:[product]},routeFor:code=>code===product.code?route:null,approved:()=>formal,rootBom:()=>[{id:'qa-bom'}],bomReferenceKey:r=>r.id,stepsFor:o=>o.instructionSteps||[]};
vm.createContext(context);
vm.runInContext(source.slice(start,end)+';this.checkDispatch=dispatchReadiness;',context);
const operation=(id,type,nextIds,productCodes=[])=>({id,editorType:type,nextIds,productCodes,name:id,number:id,mode:'human',instructionSteps:[{text:'QA step',standard:'QA expected'}],bomSelections:{'QA-P':['qa-bom']}});
const valid=()=>({category:'QA',line:'B',id:'qa-approved',number:1,stages:{'B-PHAO':[operation('qa-entry','entry',['qa-work']),operation('qa-work','manual',['qa-exit'],['QA-P']),operation('qa-exit','exit',[])]}});

formal=valid();
assert.equal(context.checkDispatch('QA-P','B').ok,true);
console.log('PASS V3 entry/manual/exit graph dispatches without assigning products to terminals');

formal=valid();
formal.stages['B-PHAO'][1].nextIds=['missing'];
assert.equal(context.checkDispatch('QA-P','B').ok,false);
assert(context.checkDispatch('QA-P','B').errors.some(e=>e.field==='nextIds'));
console.log('PASS missing graph targets remain blocked');

formal=valid();
formal.stages['B-PHAO'][1].bomSelections={'QA-P':[]};
assert(context.checkDispatch('QA-P','B').errors.some(e=>e.type==='bom'));
formal=valid();
assert.equal(context.checkDispatch('QA-P','A').ok,false);
formal=null;
assert.equal(context.checkDispatch('QA-P','B').ok,false);
console.log('PASS BOM coverage, route and approved-version gates retained');

v3=false;
formal=valid();
assert.equal(context.checkDispatch('QA-P','B').ok,false);
formal.stages['B-PHAO']= [operation('qa-work','manual',[],['QA-P'])];
assert.equal(context.checkDispatch('QA-P','B').ok,true);
console.log('PASS legacy product filtering unchanged');