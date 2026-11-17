// Actual AB controller, transport, signed routes and common header; isolated SQLite/R2.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {setup} from './ipqc-ab-approved-history-fixture.mjs';
export const tick=()=>new Promise(setImmediate);
export async function until(predicate,label){for(let i=0;i<200;i++){if(predicate())return;await tick();}assert.fail('Synthetic delivery did not settle: '+label);}
export async function officeAB(t,{lang='zh',emptyB=true}={}){
 const f=await setup(t,{lang,extraGroup:!emptyB,seedHistory:false});
 f.edit(f.ids[0],'standard','Saved A QA / Đã lưu A');await f.api.save();assert(f.state().control.moduleDraft.workflow.saved,'real A Save receipt and readback required');
 if(emptyB){const state=await f.f.core.readState(),values={...state.values},master=JSON.parse(values.masterDataControl);master.active.AB.lines.push({code:'B',stages:[{code:'B-CUT',name:'B Cut'}]});master.active.AB.categoryGroups.push({line:'B',name:'BRCINOX',defaultStages:['B-CUT']});master.active.AB.products.push({code:'B1',name:'B fixture',line:'B',category:'BRCINOX',stages:['B-CUT']});values.masterDataControl=JSON.stringify(master);const encoded=await f.f.core.encodeValues(values,state);f.f.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(encoded);await f.api.load();}
 const proto=f.dom.Node.prototype;proto.before=function(node){const p=this.parentElement;node.remove();node.parentElement=p;p.children.splice(p.children.indexOf(this),0,node);};proto.getClientRects=()=>[{}];
 f.box.document.createTreeWalker=area=>{const nodes=[];const visit=n=>{if(n._text)nodes.push({get nodeValue(){return n._text;},set nodeValue(v){n._text=v;}});for(const child of n.children)visit(child);};visit(area);let i=0;return{nextNode:()=>nodes[i++]||null};};f.box.NodeFilter={SHOW_TEXT:4};
 vm.runInContext(fs.readFileSync(new URL('../public/process/version-draft-ui.js',import.meta.url),'utf8'),f.box);
 const mount=f.box.VersionDraftUI.mount.bind(f.box.VersionDraftUI);f.box.VersionDraftUI.mount=(root,model)=>{f.model=model;return mount(root,model);};f.api.draw();
 f.groupB=emptyB?'BRCINOX':'H';f.title=()=>f.host.querySelector('.vd-top h3')?.textContent;f.saver=()=>f.host.querySelector('[data-vd-saver]')?.textContent;f.savedState=()=>f.host.querySelector('[data-vd-saved]')?.textContent;
 f.switchLine=async value=>{const node=f.host.querySelector('#ipqcab-line');node.value=value;node.dispatchEvent({type:'change',target:node});await until(()=>f.host.querySelector('#ipqcab-group')?.children.some(o=>o.value===(value==='B'?f.groupB:'G'))&&f.api.canEdit()&&!f.state().busy,'scope permission for '+value);};
 f.beginLocal=async()=>{const button=f.host.querySelector('#ipqcab-begin');assert(button,'actual Begin entry');button.click();await until(()=>f.state().localScopes.some(e=>e.scope==='B:'+f.groupB),'actual local Begin');};
 f.database=()=>f.f.core.readState().then(s=>({revision:s.revision,values:s.values}));return f;
}
