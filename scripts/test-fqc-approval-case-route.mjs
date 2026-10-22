import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2);
assert(args.length===0||(args.length===2&&args[0]==='--source'),'usage: [--source public-routine-fqc.js]');
const file=args.length?path.resolve(args[1]):path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/process/routine-fqc.js');
const source=fs.readFileSync(file,'utf8');
function block(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a);return source.slice(a,b);}
const choose=block('  function choose(value, tab = s.tab) {','  function bind() {');
const detail=block('  function detail() {','  const empty =');
const review=block('  function paintReview() {','  async function bindReview(container) {');
assert(source.includes(".forEach((b) => (b.onclick = () => choose(b.dataset.case, 'cases')));"));
assert(source.includes('if (s.reviewPlatform) { paintReview(); restoreView(); return; }'));
assert(source.includes("async function mount(container, historyMode = false) {\n    s.reviewPlatform = false;"));
function scenario({reviewPlatform=false,selected='case',tab='cases',mobile=false,deny=false}={}){
 const calls={routes:[],paints:0,reviewPaints:0,normalPaints:0,scrolls:0,focuses:0};
 const buffer={notes:'local synthetic text',photos:[{id:'synthetic-photo'}]};
 const s={reviewPlatform,selected:'report',tab:'reports',reviewModule:'FQC',documentKind:'',workState:'',busy:false,cancelConfirm:{},selfReview:{},error:'prior synthetic error',issues:['prior'],draftBuffer:buffer};
 const data={control:{documents:[{id:'report'}],cases:[{id:'case'}]}};
 const root={innerHTML:'',querySelectorAll:()=>[],querySelector:q=>q==='.rf-detail-panel'?{scrollIntoView(){calls.scrolls++;}}:{focus(){calls.focuses++;}}};
 const ctx={s,data,root,t:a=>a,btn:()=>'',h:String,label:x=>x,liveDocs:()=>[],docs:()=>data.control.documents,doc:()=>data.control.documents.find(d=>d.id===s.selected),selectedCase:()=>data.control.cases.find(c=>c.id===s.selected),documentTab:()=> 'reports',documentDetail:()=>'<DOCUMENT_DETAIL>',caseDetail:()=>'<CASE_DETAIL>',empty:()=>'<EMPTY_DETAIL>',bind:()=>{},mountDraft:()=>{},window:{matchMedia:()=>({matches:mobile}),ProcessDualSystem:{go(view){calls.routes.push(view);if(!deny){s.reviewPlatform=false;ctx.paint();}}}}};
 ctx.paint=()=>{calls.paints++;if(s.reviewPlatform){calls.reviewPaints++;ctx.paintReview();}else{calls.normalPaints++;root.innerHTML=ctx.detail();}};
 vm.createContext(ctx);vm.runInContext(detail+review+choose,ctx);ctx.choose(selected,tab);return {calls,s,html:root.innerHTML,buffer};
}
const rows=[];function check(name,f){f();rows.push({name,passed:true});}
check('approval case uses existing normal route once before review repaint',()=>{const r=scenario({reviewPlatform:true});assert.deepEqual(r.calls.routes,['quality-inspections']);assert.equal(r.calls.reviewPaints,0);assert.equal(r.calls.normalPaints,1);assert.equal(r.html,'<CASE_DETAIL>');assert.equal(r.s.selected,'case');assert.equal(r.s.tab,'cases');});
check('normal case stays current route and desktop focus',()=>{const r=scenario();assert.deepEqual(r.calls.routes,[]);assert.equal(r.html,'<CASE_DETAIL>');assert.equal(r.calls.focuses,1);assert.equal(r.calls.scrolls,0);});
check('normal case mobile scroll retained',()=>{const r=scenario({mobile:true});assert.equal(r.calls.scrolls,1);assert.equal(r.calls.focuses,0);assert.deepEqual(r.calls.routes,[]);});
check('approval document remains approval renderer',()=>{const r=scenario({reviewPlatform:true,selected:'report',tab:'documents'});assert.deepEqual(r.calls.routes,[]);assert.equal(r.s.reviewPlatform,true);assert(r.html.includes('<DOCUMENT_DETAIL>'));});
check('unknown case does not fabricate case',()=>{const r=scenario({reviewPlatform:true,selected:'missing'});assert.deepEqual(r.calls.routes,['quality-inspections']);assert.equal(r.html,'<EMPTY_DETAIL>');});
check('original selection cleanup and input buffer preserved',()=>{const r=scenario({reviewPlatform:true});assert.equal(r.s.cancelConfirm,null);assert.equal(r.s.selfReview,null);assert.equal(r.s.error,'');assert.equal(r.s.issues.length,0);assert.equal(r.s.draftBuffer,r.buffer);assert.equal(r.buffer.notes,'local synthetic text');assert.equal(r.buffer.photos.length,1);});
check('router denial does not locally bypass review or render case',()=>{const r=scenario({reviewPlatform:true,deny:true});assert.deepEqual(r.calls.routes,['quality-inspections']);assert.equal(r.s.reviewPlatform,true);assert.equal(r.calls.paints,0);});
check('normal document selection does not route',()=>{const r=scenario({selected:'report',tab:'documents'});assert.deepEqual(r.calls.routes,[]);assert.equal(r.html,'<DOCUMENT_DETAIL>');});
console.log(JSON.stringify({status:'PASS_FQC_APPROVAL_CASE_ROUTE_EXTRACTED_SOURCE_CONTROLS',controls:rows.length,results:rows,qualification:'Actual choose/detail/paintReview extracted; DOM, router mount and helpers are inRAM stubs. No browser, API, SDK, storage reads/writes or real role enforcement. Router denial control models delegation, not real permission acceptance.'}));
