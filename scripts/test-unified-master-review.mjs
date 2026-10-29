import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const cases=['AB','C','PROCESS','BOM'].map(scope=>({id:scope+'-case',scope,status:'pending',reason:scope+' reason',actor:{id:'submitter',name:'Submitter'},at:'2026-10-10T00:00:00Z',fixed:true}));
const state={view:'approval',approvalTab:'master'},control={versions:[{id:'old',scope:'AB',status:'approved',number:1,snapshot:{products:[],lines:[]}}]};
const host={ProcessSync:{identity:{id:'reviewer'}},addEventListener(){},BOMWorkspace:{reviewItems:()=>cases.filter(c=>c.scope==='BOM'),reviewPermission:()=>true,reviewError:()=>''},hasPermission:key=>["ab.view","c.view","templates.view","bom.view"].includes(key)};
const context={window:host,document:{documentElement:{lang:'zh-Hant'},querySelector:()=>null},URL,location:{href:'http://localhost/process/?view=data&dataTab=bom'},history:{state:null,replaceState(a,b,url){context.location.href=String(url);}},navigate(view){state.view=view;},currentUser:{role:'staff'}};

vm.createContext(context);
vm.runInContext(fs.readFileSync('public/process/master-review.js','utf8'),context);
const review=host.MasterReview.install({state,control,shared:{flow:scope=>({cases:cases.filter(c=>c.scope===scope)}),permissions:()=>({approve:true,return:true,withdraw:true})},applyActive(){},record(){},persist(){throw Error('Unexpected write');},validateCatalog:()=>[]});
let html=review.view();
assert.equal((html.match(/data-master-review=/g)||[]).length,4);
assert(!html.includes('review-bom'));
assert(!html.includes('data-master-review="AB:old"'));
assert.match(html,/data-review-action="approve"/);

cases[2].status='withdrawn';
cases[2].result={actor:{name:'Reviewer'},at:'2026-10-10T01:00:00Z',reason:'withdraw reason'};
state.masterReviewId='PROCESS:PROCESS-case';
html=review.view();
assert.equal((html.match(/data-master-review=/g)||[]).length,3);
assert(!html.includes('data-master-review="PROCESS:PROCESS-case"'));

state.masterReviewMode='history';
state.masterReviewId='PROCESS:PROCESS-case';
html=review.view();
assert.match(html,/withdraw reason/);
assert.match(html,/Reviewer/);
assert(!html.includes('data-review-action='));

host.MasterReview.open('BOM','BOM-case');
assert.equal(state.masterReviewId,'BOM:BOM-case');
assert.equal(state.masterReviewMode,'pending');
const url=new URL(context.location.href);
assert.equal(url.searchParams.get('view'),'approval');
assert.equal(url.searchParams.get('approvalTab'),'master');
assert(!url.searchParams.has('dataTab'));

context.document.documentElement.lang='vi';
html=review.view();
assert.match(html,/Hồ sơ duyệt dữ liệu gốc/);
assert.match(html,/Trả lại/);
assert(!html.includes('主資料送審案件'));

host.ProcessSync.identity={id:'other'};
review.view();
assert.notEqual(state.masterReviewId,'BOM:BOM-case');

console.log('PASS unified AB/C/PROCESS/BOM list, withdrawn exclusion, audit history, read-only closed cases, bilingual labels, route and actor reset');
// A restricted reviewer must not load or display unauthorized cached scopes.
host.hasPermission=key=>key==='templates.view';
state.masterReviewMode='history';state.masterReviewId=null;
html=review.view();assert.match(html,/PROCESS-case/);assert(!html.includes('AB:old'));assert(!html.includes('BOM:BOM-case'));
assert.equal(Array.from(host.MasterReview.readableScopes()).join(','),'PROCESS');
host.hasPermission=()=>false;assert.equal((review.view().match(/data-master-review=/g)||[]).length,0);
console.log('PASS restricted reviewer sees only permitted scopes; denied view exposes no cached cases');
