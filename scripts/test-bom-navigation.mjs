import __esmImport0 from "node:assert/strict";
import __esmImport1 from "node:fs";
import __esmImport2 from "node:vm";
import {createRequire as __esmFactory} from 'node:module';
const __esmRequire=__esmFactory(import.meta.url);
// Exercise actual BOM UI guards/save/read code with isolated data and transport.
const assert=__esmImport0,fs=__esmImport1,vm=__esmImport2;
const source=fs.readFileSync('public/process/bom-workspace.js','utf8');
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
(async()=>{
 const D=await import('../public/process/bom-domain.mjs');
 const bom=D.parseMatrices([{name:'Fixture',rows:[D.columns,['TEST','0','','','主件','','PCS','0','0','0'],['TEST','.1','10','PART','零件','','PCS','2','1','0']]}]);
 const clone=v=>JSON.parse(JSON.stringify(v)),events={},calls=[];let fail=false,unknown=false,hasFailure=false,confirmCount=0;
 const workflow={generation:'test',revision:1,working:{bom:clone(bom)},saved:{id:'saved',content:{bom:clone(bom)}}};
 const ctx={D,copy:clone,editor:clone(bom),base:clone(bom),pending:[],batch:null,edit:null,saveCommand:null,prepared:new WeakMap(),control:{workflow},actor:'test',readEpoch:0,reviewEpoch:0,fullRevision:0,reviewState:null,reviewRevision:null,
  t:(zh,_vi)=>zh,active:()=>null,document:{querySelectorAll:()=>[],querySelector:()=>({}),addEventListener:(name,fn)=>events[name]=fn},window:{ProcessSync:{identity:{id:'test'}},addEventListener:(name,fn)=>events[name]=fn},confirm:()=>{confirmCount++;return false;}};
 const client={permission:()=>true,hasUnknown:()=>unknown,hasSyncFailures:()=>hasFailure,resolveUnknown:async()=>{unknown=false;},read:async()=>({control:ctx.control}),prepare:(g,action,details)=>({generation:g,action,...details}),sendPrepared:async cmd=>{calls.push(cmd.action);if(cmd.action==='apply')workflow.working={bom:clone(ctx.editor)};if(cmd.action==='save'){if(fail)throw Error('SAVE_FAILED');workflow.saved={id:'confirmed-save',content:clone(workflow.working)};}return{control:ctx.control};}};
 Object.assign(ctx,{client,transport:()=>client,flow:()=>ctx.control.workflow});vm.createContext(ctx);
 vm.runInContext(section(' function collectEdit()', '\n async function run(')+section(' async function read(', '\n async function command(')+section(" window.addEventListener('beforeunload'", '\n new MutationObserver(')+';this.dirty=hasUnsavedChanges;this.saveBom=save;this.readBom=read;',ctx);
 const row=()=>ctx.editor.TEST[1],start=()=>ctx.edit={rows:clone([row()])};
 const leave=()=>{const e={prevented:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){},target:{closest:()=>({closest:()=>null})}};events.click(e);return e.prevented;};
 const unload=()=>{const e={prevented:false,preventDefault(){this.prevented=true;}};events.beforeunload(e);return e.prevented;};
 assert.equal(ctx.dirty(),false);assert.equal(leave(),false);assert.equal(unload(),false);
 start();assert.equal(ctx.dirty(),false);assert.equal(leave(),false);assert.equal(unload(),false);assert.equal(confirmCount,0);
 row().itemName='修改';assert.equal(ctx.dirty(),true);assert.equal(leave(),true);assert.equal(unload(),true);assert.equal(row().itemName,'修改');
 await ctx.saveBom();assert.deepEqual(calls,['apply','save']);assert.equal(ctx.dirty(),false);assert.equal(leave(),false);assert.equal(workflow.saved.content.bom.TEST[1].itemName,'修改');
 await ctx.readBom();assert.equal(ctx.dirty(),false);assert.equal(row().itemName,'修改');
 start();row().itemName='未存';fail=true;await assert.rejects(ctx.saveBom(),/SAVE_FAILED/);assert.equal(ctx.pending.length,0);assert(ctx.saveCommand);assert.equal(ctx.dirty(),true);assert.equal(leave(),true);assert.equal(workflow.saved.content.bom.TEST[1].itemName,'修改');assert.equal(row().itemName,'未存');
 fail=false;await ctx.saveBom();assert.equal(ctx.dirty(),false);assert.equal(workflow.saved.content.bom.TEST[1].itemName,'未存');
 ctx.batch={changes:[{decision:'keep'}]};const before=calls.length;await assert.rejects(ctx.saveBom(),/尚未套用/);assert.equal(calls.length,before);assert.equal(ctx.dirty(),true);assert.equal(leave(),true);assert(ctx.batch);
 ctx.t=(zh,vi)=>vi;await assert.rejects(ctx.saveBom(),/chưa được áp dụng/);ctx.t=zh=>zh;
 ctx.batch={changes:[]};assert.equal(ctx.dirty(),false);assert.equal(leave(),false);await ctx.saveBom();assert.equal(ctx.batch,null);
 start();workflow.working.bom.TEST[1].itemName='別人已存';workflow.saved.content=clone(workflow.working);await ctx.readBom();assert.equal(ctx.edit,null);assert.equal(row().itemName,'別人已存');assert.equal(ctx.dirty(),false);
 start();row().itemName='我的未存';await ctx.readBom();assert.equal(row().itemName,'我的未存');assert.equal(ctx.dirty(),true);
 ctx.edit=null;ctx.editor=clone(workflow.working.bom);workflow.pendingId='locked';assert.equal(ctx.dirty(),false);assert.equal(leave(),false);
 unknown=true;assert.equal(unload(),true);unknown=false;hasFailure=true;assert.equal(leave(),true);hasFailure=false;
 console.log('PASS BOM navigation: view/edit-without-change, real unsaved input, save/reopen, save failure/retry, import differences/no-difference, localization, remote update, pending lock, unknown-result protection');
})().catch(error=>{console.error(error);process.exitCode=1;});
