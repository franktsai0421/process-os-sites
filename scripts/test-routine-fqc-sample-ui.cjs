/* oxlint-disable typescript/no-require-imports -- Isolated UI binding harness; no HTTP or business writes. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const source={id:'source',name:'Fixture',code:'TEST',versionId:'v1',products:[{code:'A',name:'Sample A'},{code:'B',name:'Sample B'}]};
const line={id:'line',jobId:'job',source,requiredSamples:[],results:[{id:'r1',samples:['A'],outcome:'fail',value:'',notes:'Issue',photos:[]},{id:'r2',samples:['B'],outcome:'pass',value:'12',notes:'',photos:[]}]};
const content={title:'Fixture',date:'2026-10-12',notes:'',reason:'',disposition:'',evidence:[],lines:[line]};
const d={id:'draft',kind:'report',number:'FQC-RPT-20261012-0001',createdAt:'2026-10-12T01:00:00Z',owner:{id:'fixture',name:'Fixture'},flow:{working:content,active:{id:'',content:{...content,lines:[]}},cases:[],saves:[],pendingId:null}};
const data={today:'2026-10-12',sources:[source],identity:{id:'fixture'},permissions:{edit:true,history:true},control:{jobs:[{id:'job',source,start:'2026-10-01',end:'2026-10-31',completion:null}],documents:[d],cases:[]}};
let lang='zh-TW',uploadResolve,uploaded=0;
const resultNodes=line.results.map((r,i)=>({dataset:{result:String(i),resultId:r.id},open:i===0,isConnected:true}));
const lineNode={dataset:{line:'0'}};
const photoButton={dataset:{removePhoto:'a'.repeat(64)},closest:q=>q==='[data-result]'?resultNodes[0]:q==='[data-line]'?lineNode:null};
const upload={dataset:{upload:'result'},files:[{type:'image/png'}],disabled:false,closest:photoButton.closest};
const root={isConnected:true,parentElement:null,innerHTML:'',querySelector:()=>null,querySelectorAll:q=>q==='.rf-result[data-result-id]'?resultNodes:q==='[data-upload]'?[upload]:q==='[data-remove-photo]'?[photoButton]:[]};
const document={documentElement:{get lang(){return lang}},hidden:false,querySelector:()=>null,createElement:()=>({innerHTML:"",querySelector:()=>null})};
const window={scrollX:0,scrollY:300,scrollTo:()=>{},matchMedia:()=>({matches:false}),addEventListener:()=>{}};
const fetch=async()=>{uploaded++;return await new Promise(resolve=>uploadResolve=()=>resolve({ok:true,json:async()=>({id:'a'.repeat(64)})}));};
let code=fs.readFileSync('public/process/routine-fqc.js','utf8');
code=code.replace('  window.RoutineFQCUI = {','  window.__contract={s,setData:v=>data=v,setRoot:v=>root=v,bind,paint,lineHTML,buffer,localMissing,displayNumber,legacyNumber};\n  window.RoutineFQCUI = {');
vm.runInNewContext(fs.readFileSync('public/process/shared-draft-client.js','utf8')+'\n'+code,{window,document,fetch,crypto:webcrypto,setInterval:()=>{},setTimeout:()=>{},location:{port:'3040',href:'http://127.0.0.1:3040/process/'},URL,console});
const ui=window.__contract;ui.setData(data);ui.setRoot(root);ui.s.selected=d.id;ui.s.tab='reports';
const original=JSON.stringify(data),working=ui.buffer(d);
const html=ui.lineHTML(working.lines[0],0,d,true);assert.match(html,/type="radio"/);assert.match(html,/data-sample="A" disabled/);assert.doesNotMatch(html,/repeat-result|use-required/);
assert.doesNotMatch(html,/data-result-id="r2" open/);
(async()=>{
 ui.bind();const uploadTask=upload.onchange();assert.equal(uploaded,1);
 // The original upload target survives an index move while upload is in progress.
 working.lines[0].results.reverse();uploadResolve();await uploadTask;
 assert.deepEqual(Array.from(working.lines[0].results.find(r=>r.id==='r1').photos),['a'.repeat(64)]);
 assert.equal(working.lines[0].results.find(r=>r.id==='r2').photos.length,0);
 assert.equal(working.lines[0].results.length,2);assert.equal(ui.s.resultOpen.get('r2'),false,'Upload cannot open an untouched result row');
 // Restore fixture order, then remove the just-uploaded reference through the actual handler.
 working.lines[0].results.reverse();ui.bind();photoButton.onclick();
 assert.equal(working.lines[0].results[0].photos.length,0);
 assert.ok(ui.localMissing(working,d).some(i=>i.message==='UPLOADED_PHOTO_REQUIRED'));
 assert.equal(JSON.stringify(data),original,'Photo operations edit buffer only and preserve saved/business data');
 resultNodes[1].open=true;resultNodes[1].ontoggle();ui.paint();assert.equal(ui.s.resultOpen.get('r2'),true,'Explicit expansion survives redraw');
 const retest={...d,caseId:'case',number:'FQC-RPT-20261012-0036'};assert.equal(ui.displayNumber(retest),'FQC-RTS-20261012-0036');assert.match(ui.legacyNumber(retest),/原編號.*FQC-RPT/);
 lang='vi';assert.match(ui.lineHTML(working.lines[0],0,d,true),/Gỡ ảnh|Mẫu thực thử/);
 assert.doesNotMatch(ui.lineHTML(working.lines[0],0,d,false),/data-remove-photo/);
 console.log('PASS UI binding: singleton radios/used-sample disable; upload preserves target and collapsed rows; remove photo buffer-only and restores required-photo blocker; explicit expansion; legacy RTS alias; Vietnamese and read-only protection');
})().catch(e=>{console.error(e);process.exitCode=1});
