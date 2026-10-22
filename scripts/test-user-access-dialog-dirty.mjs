import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const source=fs.readFileSync('public/process/user-access.js','utf8'),dialogSource=source.slice(source.indexOf(' function dialog('),source.indexOf(' function submit('));

function fixture(){
 const form={},closeButtons=[{},{}],events={},dialog={dataset:{},closed:false,showModal(){},remove(){},close(){this.closed=true;events.close?.();},addEventListener(name,fn){events[name]=fn;},querySelectorAll(){return closeButtons;},querySelector(selector){return selector==='form'?form:closeButtons[0];}};
 let confirmations=0,answer=false;const context={document:{createElement:()=>dialog,body:{append(){}}},h:String,t:zh=>zh,button:()=>'<button/>',confirm(){confirmations++;return answer;}};vm.runInNewContext(dialogSource,context);context.dialog('QA','');closeButtons[0].click=()=>closeButtons[0].onclick();
 return {dialog,input(field){const attribute=field==='user-search'?'data-ua-matrix-search':field==='role-search'?'data-ua-role-search':null;form.oninput({target:{matches:selector=>attribute!==null&&selector.split(',').some(part=>part.trim()===`[${attribute}]`)}});},leave(){closeButtons[0].onclick();},escape(){dialog.oncancel({preventDefault(){}});},confirmations:()=>confirmations,accept(){answer=true;}};
}

for(const field of ['user-search','role-search']){const search=fixture();search.input(field);assert.equal(search.dialog.dataset.dirty,undefined,field);search.leave();assert.equal(search.dialog.closed,true);assert.equal(search.confirmations(),0);}

for(const field of ['name','role','permission']){const f=fixture();f.input(field);assert.equal(f.dialog.dataset.dirty,'1',field);f.escape();assert.equal(f.confirmations(),1);assert.equal(f.dialog.closed,false);f.accept();f.leave();assert.equal(f.confirmations(),2);assert.equal(f.dialog.closed,true);}

console.log(JSON.stringify({status:'PASS',cases:['user and role search-only cancel skips false leave prompt','name/role/permission edits retain cancellable leave prompt and Escape guard'],networkRequests:0,businessWrites:0}));