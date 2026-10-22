/* Actual FQC renderer + actual version projection in memory; no SDK, API, storage writes or listeners. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'public/process/fqc-master.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value)),at='2026-10-16T08:28:00Z',actor={id:'frank-fixture',name:'FRANK TSAI'};
const results=[];
function check(name,run){run();results.push({name,status:'PASS'});}
function projectFixture(){
  const file='lib/versioned-shared-workflow.ts',raw=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,raw,ts.ScriptTarget.ES2022,true);
  const project=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='projectSharedVersion');
  const effective=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='effectiveVersion'));
  assert(project&&effective,'actual projection nodes');
  const code=ts.transpileModule(effective.getText(ast)+'\n'+project.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,cloneDraft:clone},{filename:file});
  const snapshot={errors:[],items:[]},old={id:'old',number:19,status:'approved',snapshot:clone(snapshot),revision:1,creatorId:'importer',creatorName:'Original Import',createdAt:at,updatedAt:at,history:[]};
  const cases=['returned','withdrawn','withdrawn','approved'].map((status,i)=>({id:'case'+(i+1),baseId:'old',actor:clone(actor),at,reason:'Submitted C'+(i+1),status,content:clone(snapshot),result:{actor:clone(actor),at,reason:'Decision C'+(i+1)+' <keep> [given]',selfReview:status!=='withdrawn'}}));
  const control={activeVersionId:'old',versions:[old],workflow:{generation:'fixture',revision:8,pendingId:null,active:{id:'case4',content:clone(snapshot)},working:clone(snapshot),cases,saved:null}};
  exports.projectSharedVersion(control,actor,at,true);
  assert.equal(control.versions.find(v=>v.id==='case4').reviewedBy,actor.name);
  assert.match(control.versions.find(v=>v.id==='case4').history.at(-1).comment,/\[self-review\]$/);
  return control;
}
function view(script,library,lang='zh',preference=null){
  const control={schemaVersion:1,libraries:{fqc:clone(library),iqc:{versions:[]},ipqc:{versions:[]},routineReports:{versions:[]}}};
  const storage=new Map([['qualityMasterControl',JSON.stringify(control)],['masterDataControl',JSON.stringify({active:{AB:{products:[],categoryGroups:[]}}})]]);
  if(preference!==null)storage.set('processUILanguage',preference);
  let requests=0,writes=0,languagePreferenceReads=0;const listeners=[];
  function element(){return{innerHTML:'',isConnected:true,dataset:{},querySelector:()=>null,querySelectorAll:()=>[],prepend(){},contains:()=>false,addEventListener(){}};}
  const host=element();host.dataset.activeTab='quality-fqc';host.querySelector=selector=>selector==='#fqc-page'?host:null;
  const document={documentElement:{lang},activeElement:null,querySelector:selector=>selector==='#data-content'?host:null,querySelectorAll:()=>[],createElement(){const e=element(),cases=element();e.querySelector=selector=>selector==='#fqc-cases'?cases:null;return e;}};
  const window={createSharedDraftClient:()=>({hasUnknown:()=>false,gatePermissions(){}}),ProcessSync:{identity:{...actor,role:'admin'}},VersionDraftUI:{date:value=>'T:'+value,mount(){},t:key=>key},addEventListener:name=>listeners.push(name),scrollY:0,scrollTo(){}};
  const context={window,document,localStorage:{getItem:key=>{if(key==='processUILanguage')languagePreferenceReads++;return storage.get(key)||null;},setItem(){writes++;throw Error('STORAGE_WRITE_FORBIDDEN');}},fetch(){requests++;throw Error('NETWORK_FORBIDDEN');},console,setTimeout(){throw Error('TIMER_FORBIDDEN');},clearTimeout(){},state:{},structuredClone};
  const end='})(window);';assert.equal(script.indexOf(end),script.lastIndexOf(end));assert(script.includes(end));
  vm.runInNewContext(script.replace(end,'window.__fqcDisplayFixture={render,setHost(value){hostElement=value;},lastEdit,isVi};'+end),context,{filename:'actual-fqc-master.js'});
  const before=JSON.stringify(window.FQCMasterUI.control);
  window.__fqcDisplayFixture.setHost(host);window.__fqcDisplayFixture.render();
  const list=window.FQCMasterUI.reviewHTML(),detail=element();
  const buttons=[...list.matchAll(/data-quality-review="([^"]+)"/g)].map(m=>({dataset:{qualityReview:m[1]},click(){this.onclick?.();}}));
  const panel={isConnected:true,querySelectorAll:selector=>selector==='[data-quality-review]'?buttons:[],querySelector:selector=>selector==='#quality-review-detail'?detail:selector==='[data-quality-review]'?buttons[0]:null};
  window.FQCMasterUI.bindReview(panel);
  assert.equal(JSON.stringify(window.FQCMasterUI.control),before,'render must not rewrite raw control/history');
  assert.equal(requests,0);assert.equal(writes,0);
  return{main:host.innerHTML,list,detail:detail.innerHTML,lastEdit:window.__fqcDisplayFixture.lastEdit,listeners,languageVi:window.__fqcDisplayFixture.isVi(),languagePreferenceReads};
}
function equipmentLanguage(script,documentLang,preference){
  const start=script.indexOf('  const lang ='),end=script.indexOf('  const norm =',start);assert(start>=0&&end>start,'actual EQ lang/t declarations');const actionStart=script.indexOf('  const actionName ='),actionEnd=script.indexOf('  const details =',actionStart),hDeclaration=script.split(/\r?\n/).find(line=>line.startsWith('  const h ='));assert(actionStart>0&&actionEnd>actionStart&&hDeclaration,'actual EQ actionName/h declarations');let reads=0;const localStorage={getItem(key){assert.equal(key,'processUILanguage');reads++;return preference;},setItem(){throw Error('STORAGE_WRITE_FORBIDDEN');}};const api=vm.runInNewContext(script.slice(start,end)+'\n'+hDeclaration+'\n'+script.slice(actionStart,actionEnd)+'\n({lang,t,actionName,h});',{document:{documentElement:{lang:documentLang}},localStorage},{filename:'actual-equipment-language.js',timeout:1000});return{language:api.lang(),text:api.t('中文','Tiếng Việt'),reads,action:value=>api.actionName(value),escapedAction:value=>api.h(api.actionName(value))};
}
const projected=projectFixture();
if(process.argv.length>2){
  assert.ok(process.argv.length===4||process.argv.length===6);assert.equal(process.argv[2],'--before');if(process.argv.length===6)assert.equal(process.argv[4],'--equipment-before');
  const before=fs.readFileSync(path.resolve(process.argv[3]),'utf8'),old=view(before,projected);
  check('old actual renderer reproduces missing V3 reviewer and event history',()=>{const eventHistory=old.detail.match(/<div class="quality-diff">([\s\S]*?)<\/div>/)?.[1];assert.notEqual(eventHistory,undefined);assert.match(old.detail,/確認者：—/);assert.doesNotMatch(eventHistory,/Decision C4|FRANK TSAI|self-review/);assert.match(old.detail,/審核意見：Decision C4/,'existing top-level reviewComment remains valid');assert.doesNotMatch(old.main,/確認／發回者：FRANK TSAI/);const oldVi=view(before,projected,'vi');assert.match(oldVi.detail,/<p>錯誤代碼：0 → 0<br>檢查項目：0 → 0<\/p>/,'old actual VI review count labels remain Chinese');assert.equal(view(before,projected,'zh-Hant','vi').languageVi,true,'old actual FQC helper leaks another tab preference into Chinese document');if(process.argv.length===6){const oldEquipment=fs.readFileSync(path.resolve(process.argv[5]),'utf8');assert.equal(equipmentLanguage(oldEquipment,'zh-Hant','vi').language,'vi','old actual equipment helper leaks another tab preference');}});
}
check('actual projected V3 decision actor/history/reason/self-review in both languages',()=>{
  for(const lang of ['zh','vi']){const out=view(source,projected,lang);assert.match(out.detail,new RegExp((lang==='vi'?'Người duyệt':'確認者')+'：FRANK TSAI'));assert.match(out.detail,/Decision C4 &lt;keep&gt; \[given\] \[self-review\]/);assert.match(out.main,/FRANK TSAI/);assert.match(out.main,/Decision C4 &lt;keep&gt; \[given\] \[self-review\]/);assert.ok(out.main.includes(lang==='vi'?'Gửi duyệt':'送出審核'));assert.ok(out.detail.includes(lang==='vi'?'Đã duyệt':'已核准'));assert.doesNotMatch(out.main+out.detail,/\[object Object\]/);assert.ok(out.detail.includes(lang==='vi'?'<p>Mã lỗi：0 → 0<br>Hạng mục kiểm tra：0 → 0</p>':'<p>錯誤代碼：0 → 0<br>檢查項目：0 → 0</p>'));if(lang==='vi')assert.doesNotMatch(out.detail,/錯誤代碼：|檢查項目：/);assert.ok(out.list.includes(lang==='vi'?'FQC · Chờ duyệt 0':'FQC · 待確認 0'),'already localized pending count remains unchanged');}
});
const legacy={activeVersionId:'legacy',versions:[{id:'legacy',number:'V2',status:'approved',snapshot:{errors:[],items:[]},creatorName:'Legacy Creator',createdAt:at,updatedAt:at,reviewedAt:at,reviewerName:'Legacy Reviewer',reviewerId:'legacy-reviewer',reviewComment:'Legacy decision',history:[{action:'imported',label:'Unique legacy import label',actor:'Legacy Importer',at,note:'Unique legacy import note'},{action:'approved',label:'Unique legacy approval label',actor:'Legacy Reviewer',at,note:'Unique legacy approval note'}]}],workflow:{working:{errors:[],items:[]},cases:[],saved:null}};
check('legacy custom labels/actor/note remain exact and ID fallback remains supported',()=>{
  const out=view(source,legacy);for(const text of ['Legacy Reviewer','Unique legacy import label','Unique legacy import note','Unique legacy approval label','Unique legacy approval note'])assert.ok((out.main+out.detail).includes(text));
  const idOnly=clone(legacy);delete idOnly.versions[0].reviewerName;idOnly.versions[0].reviewerId=17;assert.match(view(source,idOnly).detail,/確認者：17/);
  if(process.argv[2]==='--before'){const old=view(fs.readFileSync(path.resolve(process.argv[3]),'utf8'),legacy);assert.equal(out.main,old.main);assert.equal(out.list,old.list);assert.equal(out.detail,old.detail);}
});
check('canonical V3 actor/comment wins while valid legacy label is preserved',()=>{
  const lib=clone(legacy),v=lib.versions[0];v.reviewedBy='Canonical Reviewer';v.history=[{action:'approved',label:'Preserved custom label',actorName:'Canonical Actor',actor:'Stale Legacy Actor',comment:'Canonical comment [self-review]',note:'Stale Legacy Note',at}];
  const out=view(source,lib);assert.match(out.detail,/確認者：Canonical Reviewer/);assert.match(out.main,/Canonical Actor/);assert.match(out.detail,/Preserved custom label/);assert.match(out.detail,/Canonical comment \[self-review\]/);assert.doesNotMatch(out.main+out.detail,/Stale Legacy Actor|Stale Legacy Note/);
  v.history[0].comment='';const empty=view(source,lib);assert.doesNotMatch(empty.main+empty.detail,/Stale Legacy Note|Canonical comment/,'explicit empty V3 comment must not resurrect legacy note');
});
check('malformed object fields never stringify and valid escaped scalar fallback survives',()=>{
  const lib=clone(legacy),v=lib.versions[0];v.reviewedBy={name:'wrong'};v.reviewerName={name:'wrong'};v.reviewerId='legacy<&>';v.history=[{action:'withdrawn',label:{bad:1},actorName:{bad:1},actor:'Legacy <actor>',comment:{bad:1},note:'Legacy <note> [self-review]',at}];
  const out=view(source,lib);assert.match(out.detail,/確認者：legacy&lt;&amp;&gt;/);assert.match(out.detail,/Legacy &lt;actor&gt;/);assert.match(out.detail,/Legacy &lt;note&gt; \[self-review\]/);assert.doesNotMatch(out.main+out.detail,/\[object Object\]|Legacy <actor>|Legacy <note>/);
});
check('review actions are not last editor and unknown action remains escaped',()=>{
  const lib=clone(legacy),v=lib.versions[0];v.history=[{action:'edited',actorName:'Actual Editor',at},{action:'submit',actorName:'Submitter',at},{action:'returned',actorName:'Reviewer',at}];
  const out=view(source,lib);assert.equal(out.lastEdit(v).actorName,'Actual Editor');assert.match(out.main,/最後編輯：Actual Editor/);
  v.history=[{action:'unknown<action>',actorName:'Actor',at,comment:'Preserved'}];assert.match(view(source,lib).detail,/unknown&lt;action&gt;/);
});
check('history filter and fixed-case source entry stay unchanged',()=>{
  const equipment=fs.readFileSync(path.join(root,'public/process/routine-equipment.js'),'utf8');
  const languageCases=[{document:'zh-Hant',stored:'vi',expected:'zh'},{document:'zh',stored:'vi',expected:'zh'},{document:'zh-TW',stored:'vi',expected:'zh'},{document:'vi',stored:'zh',expected:'vi'},{document:'en',stored:'vi',expected:'vi'},{document:'',stored:'vi',expected:'vi'},{document:null,stored:'zh',expected:'zh'},{document:'unknown',stored:'unknown',expected:'zh'}];
  for(const c of languageCases){const expectedVI=c.expected==='vi',fqc=view(source,projected,c.document,c.stored),eq=equipmentLanguage(equipment,c.document,c.stored);assert.equal(fqc.languageVi,expectedVI,'actual FQC full-module tab language');assert.ok(fqc.list.includes(expectedVI?'FQC · Chờ duyệt 0':'FQC · 待確認 0'));assert.equal(eq.language,c.expected,'actual EQ language');assert.equal(eq.text,expectedVI?'Tiếng Việt':'中文','actual EQ t');if(c.document==='vi'||String(c.document).startsWith('zh')){assert.equal(fqc.languagePreferenceReads,0,'known FQC document language never reads shared preference');assert.equal(eq.reads,0,'known EQ document language never reads shared preference');}else{assert.ok(fqc.languagePreferenceReads>0);assert.ok(eq.reads>0);}}
  const legacyEquipment=process.argv.length===6?fs.readFileSync(path.resolve(process.argv[5]),'utf8'):null;for(const lang of ['zh-Hant','vi']){const current=equipmentLanguage(equipment,lang,lang==='vi'?'zh':'vi'),old=legacyEquipment&&equipmentLanguage(legacyEquipment,lang,lang==='vi'?'vi':'zh');for(const action of ['begin','save','submit','approve','reject','withdraw']){assert.notEqual(current.action(action),action,'legacy action remains localized');if(old)assert.equal(current.action(action),old.action(action),'legacy wording unchanged');}for(const [v3,legacy]of [['approved','approve'],['returned','reject'],['withdrawn','withdraw']]){assert.equal(current.action(v3),current.action(legacy),'V3 decision uses existing legacy display wording');if(old)assert.equal(old.action(v3),v3,'old actual source misses V3 action alias');}assert.equal(current.action('future<action>&'),'future<action>&');assert.equal(current.escapedAction('future<action>&'),'future&lt;action&gt;&amp;');}
  const out=view(source,projected);for(const id of ['case1','case2','case3'])assert.ok(!out.list.includes('data-quality-review="'+id+'"'));assert.match(out.list,/data-quality-review="case4"/);
  assert.ok(source.includes("bar.querySelector('#fqc-cases').onclick=()=>window.openSharedDraftHistory({client:transport()"));
  assert.equal((source.match(/function reviewHTML\(\) \{[\s\S]*?\n  \}/)||[])[0].includes("['pending','approved','superseded']"),true);
});
check('review summary compares nondeleted populations and preserves both raw snapshots',()=>{
  const errors=(total,deleted=0)=>Array.from({length:total},(_,i)=>({id:'counter-error-'+i,code:'E'+i,name:'Synthetic '+i,line:'B',category:'COUNTER',isDeleted:i>=total-deleted}));
  const items=(total,deleted=0)=>Array.from({length:total},(_,i)=>({id:'counter-item-'+i,checkNo:'I'+i,name:'Synthetic '+i,errorId:'counter-error-0',line:'B',category:'COUNTER',isDeleted:i>=total-deleted}));
  const snapshot=(e,ed,i,id)=>({errors:errors(e,ed),items:items(i,id)});
  const cases=[
    {name:'same two old tombstones plus one item',before:snapshot(166,2,510,0),after:snapshot(166,2,511,0),errors:[164,164],items:[510,511]},
    {name:'only before contains deleted rows',before:snapshot(3,1,4,2),after:snapshot(2,0,2,0),errors:[2,2],items:[2,2]},
    {name:'only after contains deleted rows',before:snapshot(2,0,2,0),after:snapshot(3,1,4,2),errors:[2,2],items:[2,2]},
    {name:'independent deleted counts and different totals',before:snapshot(5,2,8,3),after:snapshot(7,1,6,2),errors:[3,6],items:[5,4]},
    {name:'all rows deleted on both sides',before:snapshot(2,2,3,3),after:snapshot(4,4,1,1),errors:[0,0],items:[0,0]},
    {name:'genuine same-total deletion',before:snapshot(2,0,2,0),after:snapshot(2,1,2,1),errors:[2,1],items:[2,1]},
    {name:'no tombstones true addition',before:snapshot(1,0,1,0),after:snapshot(2,0,2,0),errors:[1,2],items:[1,2]},
    {name:'equal count does not imply unchanged identities',before:snapshot(2,0,2,0),after:snapshot(2,0,2,0),errors:[2,2],items:[2,2]},
  ];
  cases.at(-1).after.errors.forEach(row=>{row.id+='-replacement';row.name+=' changed';});
  cases.at(-1).after.items.reverse().forEach(row=>{row.id+='-replacement';row.name+=' changed';});
  for(const c of cases)for(const lang of ['zh','vi']){
    const lib={activeVersionId:'counter-before',versions:[{id:'counter-before',number:27,status:'approved',snapshot:clone(c.before),creatorName:'Synthetic',createdAt:at,updatedAt:at,history:[]},{id:'counter-after',number:29,status:'pending',baseVersionId:'counter-before',snapshot:clone(c.after),creatorName:'Synthetic',createdAt:at,updatedAt:at,history:[{action:'edited',actorName:'Counter <actor>',comment:'Retain <history>',at}]}],workflow:{working:clone(c.after),cases:[],saved:null}};
    const raw=JSON.stringify(lib),out=view(source,lib,lang),errorLabel=lang==='vi'?'Mã lỗi':'錯誤代碼',itemLabel=lang==='vi'?'Hạng mục kiểm tra':'檢查項目';
    assert.ok(out.detail.includes('<p>'+errorLabel+'：'+c.errors[0]+' → '+c.errors[1]+'<br>'+itemLabel+'：'+c.items[0]+' → '+c.items[1]+'</p>'),c.name+' / '+lang);
    assert.match(out.detail,/Counter &lt;actor&gt;/);assert.match(out.detail,/Retain &lt;history&gt;/);
    assert.equal(JSON.stringify(lib),raw,'render must retain original rows/IDs/deleted flags/history: '+c.name);
    if(c.name==='equal count does not imply unchanged identities')assert.notEqual(JSON.stringify(c.before),JSON.stringify(c.after));
  }
});
console.log(JSON.stringify({status:'PASS_FQC_HISTORY_DISPLAY_MEMORY_ONLY',groups:results.length,results,actualProjection:true,actualFullBrowserModule:true,legacyByteExact:process.argv[2]==='--before',SDK:false,HTTP:false,listenersOpened:0,realDataWrites:0,GUI:false}));
