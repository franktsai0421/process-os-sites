import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';

const candidate=fs.readFileSync('public/process/master-review.js','utf8');
// A pinned pre-change copy is supplied for exact HTML/performance comparison.
const baseline=process.env.MASTER_REVIEW_BASELINE?fs.readFileSync(process.env.MASTER_REVIEW_BASELINE,'utf8'):null;
function fixture(source,{count=120,language='zh-Hant',fallbackIntl=false,instrument=true}={}){
 const dates=['2026-10-30T00:00:00Z','2026-01-02T23:04:05Z','invalid',null];
 const versions=[],cases={AB:[],C:[],PROCESS:[]};let flowReads=0,findComparisons=0;
 for(let i=0;i<count;i++){
  const scope=['AB','C','PROCESS'][i%3],id='case-'+i,status=i%2?'approved':'pending',at=dates[i%dates.length];
  versions.push({id,scope,status,number:i+1,snapshot:{products:[],lines:[]},updatedAt:at});
  cases[scope].push({id,scope,status,actor:{id:'submitter',name:'Synthetic '+i},at,reason:'reason '+i,result:status==='approved'?{actor:{name:'Reviewer'},at,reason:'approved'}:undefined});
 }
 versions.push({...versions[0],number:999999});
 versions.push({id:'legacy',scope:'AB',status:'approved',number:50000,snapshot:{products:[],lines:[]},updatedAt:'2025-01-01T00:00:00Z'});
 if(instrument){const originalFind=versions.find;versions.find=function(predicate){return originalFind.call(this,(v,i,a)=>{findComparisons++;return predicate(v,i,a);});};}
 const state={view:'approval',approvalTab:'master',masterReviewId:'AB:case-0'},control={versions};
 let allowed=new Set(['ab.view','c.view','templates.view','bom.view']);
 const host={ProcessSync:{identity:{id:'reviewer'}},addEventListener(){},hasPermission:key=>allowed.has(key),BOMWorkspace:{reviewItems:()=>[{id:'bom-case',scope:'BOM',status:'pending',fixed:true,actor:{name:'BOM submitter'},at:dates[0]}],reviewPermission:()=>true,reviewError:()=>''}};
 const document={documentElement:{lang:language},querySelector:()=>null};
 const context={window:host,document,URL,location:{href:'https://fixture.invalid/process/index.html'},history:{state:null,replaceState(){}},navigate(view){state.view=view;},...(fallbackIntl?{Intl:{}}:{})};
 vm.createContext(context);vm.runInContext(source,context);
 const review=host.MasterReview.install({state,control,shared:{flow:instrument?scope=>{flowReads++;return{cases:cases[scope]};}:scope=>({cases:cases[scope]}),permissions:()=>({approve:true,return:true,withdraw:true})},applyActive(){},persist(){throw Error('Unexpected write');}});
 return{view:review.view,state,control,cases,document,host,allow:keys=>{allowed=new Set(keys);},stats:()=>({flowReads,findComparisons})};
}

void test('large review render reads each allowed scope once and preserves duplicate first version',()=>{
 const f=fixture(candidate,{count:300});const html=f.view();
 assert.equal(f.stats().flowReads,3);assert.equal(f.stats().findComparisons,0);
 assert.match(html,/AB · V1/);assert.doesNotMatch(html,/999999/);
 assert.equal((html.match(/data-master-review=/g)||[]).length,151);
 f.allow(['templates.view']);assert.doesNotMatch(f.view(),/data-master-review="(?:AB|C|BOM):/);
 f.allow([]);assert.equal((f.view().match(/data-master-review=/g)||[]).length,0);
});

void test('updates, history, language and account changes are not held in a cross-render cache',()=>{
 const f=fixture(candidate);const initial=f.view();
 f.cases.AB[0].status='returned';f.cases.AB[0].result={actor:{name:'New reviewer'},at:'2026-10-30T12:00:00Z',reason:'change'};
 assert.doesNotMatch(f.view(),/data-master-review="AB:case-0"/);
 f.state.masterReviewMode='history';f.state.masterReviewId='AB:case-0';assert.match(f.view(),/New reviewer/);
 f.document.documentElement.lang='vi';assert.match(f.view(),/Hồ sơ duyệt dữ liệu gốc/);
 f.state.masterReviewId='PROCESS:case-5';f.view();assert.equal(f.state.masterReviewId,'PROCESS:case-5');f.host.ProcessSync.identity={id:'another'};f.view();assert.notEqual(f.state.masterReviewId,'PROCESS:case-5');
 assert.notEqual(initial,f.view());
});

void test('formatter absence retains native Date fallback and invalid/absent timestamps',()=>{
 for(const language of ['zh-Hant','vi']){
  const normal=fixture(candidate,{language}),fallback=fixture(candidate,{language,fallbackIntl:true});
  for(const mode of ['pending','history']){normal.state.masterReviewMode=mode;fallback.state.masterReviewMode=mode;assert.equal(normal.view(),fallback.view());}
 }
});

if(baseline)void test('exact pre-change HTML equivalence across mixed scopes, duplicate IDs, dates, selection and permissions',()=>{
 for(const language of ['zh-Hant','vi'])for(const fallbackIntl of [false,true]){
  const before=fixture(baseline,{language,fallbackIntl}),after=fixture(candidate,{language,fallbackIntl});
  for(const mode of ['pending','history'])for(const id of [null,'AB:case-0','C:case-1','PROCESS:case-5','missing']){
   for(const f of [before,after]){f.state.masterReviewMode=mode;f.state.masterReviewId=id;}
   assert.equal(after.view(),before.view());
  }
  for(const f of [before,after]){f.allow(['templates.view']);f.state.masterReviewId=null;}
  assert.equal(after.view(),before.view());
  for(const id of [0,undefined,NaN]){for(const f of [before,after]){f.allow(['ab.view']);f.cases.AB[0].id=id;f.control.versions[0].id=id;f.state.masterReviewMode='pending';f.state.masterReviewId=null;}assert.equal(after.view(),before.view());}
 }
});

if(baseline&&process.env.MASTER_REVIEW_BENCHMARK==='1'){
 const rows=[];
 for(let round=1;round<=5;round++)for(const variant of round%2?['baseline','candidate']:['candidate','baseline']){
  const f=fixture(variant==='baseline'?baseline:candidate,{count:3000,instrument:false});
  f.state.masterReviewMode='history';const start=performance.now(),html=f.view();
  rows.push({round,variant,ms:Math.round((performance.now()-start)*100)/100,bytes:Buffer.byteLength(html)});
 }
 const workCounts=Object.fromEntries([['baseline',baseline],['candidate',candidate]].map(([variant,source])=>{const f=fixture(source,{count:3000});f.state.masterReviewMode='history';f.view();return[variant,f.stats()];}));
 fs.mkdirSync('.sites-runtime/perf-review',{recursive:true});fs.writeFileSync('.sites-runtime/perf-review/master-review-render.json',JSON.stringify({runtime:'Node VM actual master-review source; synthetic 3000 fixed cases; one history render; uninstrumented native Array.find timing; no HTTP/browser/DB',workCountsMeasuredSeparately:workCounts,sourceHashes:{baseline:createHash('sha256').update(baseline).digest('hex'),candidate:createHash('sha256').update(candidate).digest('hex')},rows},null,2));
 console.log(JSON.stringify(rows));
}
