// Production Journal and VM entrypoints only. No browser, sockets or live data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=name=>fs.readFileSync('public/process/'+name+'.js','utf8'),clone=structuredClone,plain=value=>JSON.parse(JSON.stringify(value));
const box={structuredClone};vm.runInNewContext(source('canvas-local'),box);const Journal=box.CanvasJournal,w='workspace',s='S';
const content=()=>({workspaces:[{id:w,stages:{S:[{id:'a',stageCode:s,name:'Original',x:0,y:0,nextIds:[]},{id:'b',stageCode:s,name:'B',x:1,nextIds:[]}],T:[{id:'c',stageCode:'T',name:'C',nextIds:[]}]}}]});
const op=(c,id)=>c.workspaces[0].stages.S.find(o=>o.id===id);
for(const decision of ['mine','latest'])void test(`Journal ${decision}: true field merge retains independent local and peer edits`,()=>{
 const base=content(),j=new Journal(base);j.edit(w,s,[{id:'a',f:'name',value:'Local'},{id:'a',f:'x',value:42}]);j.edit(w,'T',[{id:'c',f:'name',value:'Other canvas'}]);j.forms.other={draft:{name:'Unfinished'}};
 const latest=clone(base);op(latest,'a').name='Peer';op(latest,'a').y=99;const review=j.review(w,s,latest);assert.equal(review.changes.filter(c=>c.conflict).length,1);j.resolveReview(review,decision);
 const a=j.project(w,s)[0];assert.equal(a.name,decision==='mine'?'Local':'Peer');assert.equal(a.x,42);assert.equal(a.y,99);assert.equal(j.project(w,'T')[0].name,'Other canvas');assert.equal(j.forms.other.draft.name,'Unfinished');
 j.edit(w,s,[{id:'a',f:'name',value:'Original'}]);assert.equal(j.project(w,s)[0].name,'Original');const name=j.freeze(w,s).patches.find(p=>p.path.at(-1)==='name');assert.equal(name.value,'Original');assert.equal(j.freeze(w,s).guards.find(g=>g.path.at(-1)==='name').value,'Peer');
});
for(const decision of ['mine','latest'])void test(`Journal ${decision}: converged entries clean up and subsequent original-value input is retained`,()=>{
 const base=content(),j=new Journal(base);j.edit(w,s,[{id:'a',f:'name',value:'Same'}]);const latest=clone(base);op(latest,'a').name='Same';const review=j.review(w,s,latest);assert(!review.changes.some(c=>c.conflict));j.resolveReview(review,decision);assert.equal(j.counts().fields,0);
 j.edit(w,s,[{id:'a',f:'name',value:'Original'}]);assert.equal(j.project(w,s)[0].name,'Original');assert.equal(j.freeze(w,s).guards[0].value,'Same');
});
void test('latest with no surviving fields does not retain the rejected node baseline',()=>{
 const base=content(),j=new Journal(base);j.edit(w,s,[{id:'a',f:'name',value:'First local'}]);const latest=clone(base);op(latest,'a').name='Peer';j.resolveReview(j.review(w,s,latest),'latest');assert.equal(j.counts().fields,0);
 j.edit(w,s,[{id:'a',f:'name',value:'Original'}]);assert.equal(j.counts().fields,1);assert.equal(j.project(w,s)[0].name,'Original');assert.equal(j.freeze(w,s).guards[0].value,'Peer');
});
void test('disjoint review updates the basis for later edits of another field',()=>{
 const base=content(),j=new Journal(base);j.edit(w,s,[{id:'a',f:'x',value:7}]);const latest=clone(base);op(latest,'a').name='Peer';j.resolveReview(j.review(w,s,latest),'latest');j.edit(w,s,[{id:'a',f:'name',value:'Original'}]);assert.equal(j.freeze(w,s).guards.find(g=>g.path.at(-1)==='name').value,'Peer');assert.equal(j.project(w,s)[0].x,7);
});
for(const decision of ['mine','latest'])void test(`legacy whole-node dependency cannot be silently rebased by ${decision}`,()=>{
 const base=content(),j=new Journal(base);j.operation(w,s,{...op(base,'a'),name:'Mine'},op(base,'a'),true);const latest=clone(base);op(latest,'a').y=99;const review=j.review(w,s,latest),before=plain(j.record());assert(review.blockers.some(b=>b.reason==='OPERATION_DEPENDENCY_CHANGED'));assert.throws(()=>j.resolveReview(review,decision),/REVIEW_UNSAFE/);assert.deepEqual(plain(j.record()),before);
});
for(const decision of ['mine','latest'])void test(`new node ID collision cannot be adopted by ${decision}`,()=>{
 const base=content(),j=new Journal(base),node={id:'new',stageCode:s,name:'New',nextIds:[]};j.operation(w,s,node,null);const latest=clone(base);latest.workspaces[0].stages.S.push(clone(node));assert.throws(()=>j.resolveReview(j.review(w,s,latest),decision),/REVIEW_UNSAFE/);assert.equal(j.counts().created,1);
});
for(const reason of ['local-edit','remote-change','cancelled','tampered','cloned','other-journal'])void test(`review is invalid after ${reason}`,()=>{
 const base=content(),j=new Journal(base);j.edit(w,s,[{id:'a',f:'name',value:'Mine'}]);let review=j.review(w,s,base),target=j;
 if(reason==='local-edit')j.edit(w,s,[{id:'a',f:'x',value:1}]);
 if(reason==='remote-change'){j.content=clone(base);op(j.content,'a').name='Unseen';}
 if(reason==='cancelled')j.cancelReview(review);
 if(reason==='tampered')review.content.workspaces[0].stages.S[0].name='Injected';
 if(reason==='cloned')review=clone(review);
 if(reason==='other-journal')target=new Journal(base,clone(j.record()));
 const before=plain(target.record());assert.throws(()=>target.resolveReview(review,'latest'),/REVIEW_CHANGED/);assert.deepEqual(plain(target.record()),before);
});
void test('pending retains the exact operation and cannot be cleared or rebased by a review',()=>{
 const j=new Journal(content());j.edit(w,s,[{id:'a',f:'name',value:'Mine'}]);const review=j.review(w,s,content()),batch=j.freeze(w,s);batch.command={operationId:'original',patches:clone(batch.patches)};j.sent(batch);const before=plain(j.record());assert.throws(()=>j.resolveReview(review,'latest'),/RECEIPT_REQUIRED/);assert.deepEqual(plain(j.record()),before);assert.equal(j.pending.command.operationId,'original');
});
void test('effective-version notice keeps main entry read and has no fixed timer or focus/visibility reads',async()=>{
 const events=new Map(),intervals=[],reads=[],state={view:'editor'},window={ProcessSync:{identity:{id:'a'},platformHeaders:()=>({})},addEventListener:(name,fn)=>events.set(name,fn),createScopedReadPause:()=>({canPoll:()=>true,capture:()=>({}),success(){},denied(){}})};
 const document={documentElement:{lang:'zh'},hidden:false,addEventListener:(name,fn)=>events.set(name,fn),querySelector:()=>null};
 vm.runInNewContext(source('effective-version-notice'),{window,document,state,localStorage:{getItem:()=> '{}'},location:{href:'/process/'},setInterval:(fn,ms)=>intervals.push(ms),AbortSignal,fetch:async(url)=>{reads.push(url);return{ok:true,json:async()=>({effective:{process:'version'}})};}});
 await new Promise(setImmediate);assert.equal(events.has('focus'),false);assert.equal(events.has('visibilitychange'),false);assert.deepEqual(intervals,[]);assert.equal(reads.length,1,'main entry read is preserved');
 await window.EffectiveVersionNotice.check(true);assert.equal(reads.length,2,'explicit check still reads');state.view='approval';await window.EffectiveVersionNotice.check();assert.equal(reads.length,3,'explicit approval entry check remains supported');
});
void test('IPQC references keep explicit mounts and bilingual Save copy without fixed reads',async()=>{
 const intervals=[],reads=[],events=new Map(),node={dataset:{source:'AB',scope:'A',item:'one'},isConnected:true,lastElementChild:{innerHTML:''},querySelector:()=>null};
 const document={documentElement:{lang:'zh'},querySelectorAll:selector=>selector==='[data-ipqc-reference]'?[node]:[],querySelector:()=>null};
 const window={ProcessSync:{identity:{id:'a'},platformHeaders:()=>({})},addEventListener:(name,fn)=>events.set(name,fn),createScopedReadPause:()=>({canPoll:()=>true,capture:()=>({}),success(){},denied(){}})};
 vm.runInNewContext(source('process-ipqc'),{window,document,URLSearchParams,queueMicrotask,escapeHtml:String,setInterval:(fn,ms)=>intervals.push(ms),fetch:async url=>{reads.push(url);return{ok:true,json:async()=>({revision:1,references:[],canReadHistory:false})};}});
 assert.deepEqual(intervals,[]);assert.equal(reads.length,0);await window.ProcessIPQC.mountReferences();assert.equal(reads.length,1);await window.ProcessIPQC.mountReferences();assert.equal(reads.length,2);assert(events.has('process-language-change'));
 assert(source('process-ipqc').includes('完成方塊後先留目前頁面，再存取草稿'));assert(source('process-ipqc').includes('Hoàn tất để giữ trên trang hiện tại, rồi lưu bản nháp.'));assert(!source('process-ipqc').includes('再同步目前畫布'));
});
for(const lang of ['zh','vi'])void test(`Save conflict dialog ${lang} keeps unsafe dependency choices disabled and cancellation available`,async()=>{
 const children=[],dialogs=[];let dialog;
 const node=tag=>({tag,dataset:{},children:[],append(n){this.children.push(n);children.push(n);},remove(){},showModal(){this.open=true;},close(){this.open=false;this.onclose?.();}});
 const document={createElement(tag){const n=node(tag);if(tag==='dialog'){dialog=n;dialogs.push(n);}return n;},body:{append(){}}};
 const production=source('process-editor'),start=production.indexOf(' function resolveSaveConflicts(review)'),end=production.indexOf(' function ask(',start),context={document,t:(zh,vi)=>lang==='zh'?zh:vi};
 vm.runInNewContext(production.slice(start,end)+'\nglobalThis.choose=resolveSaveConflicts;',context);
 const pending=context.choose({changes:[],blockers:[{id:'a',reason:'OPERATION_DEPENDENCY_CHANGED'}]});assert.equal(dialogs.length,1);const buttons=children.filter(n=>n.tag==='button');assert.equal(buttons.length,3);assert(buttons[0].disabled);assert(buttons[1].disabled);assert.equal(buttons[2].disabled,false);buttons[0].onclick();assert.equal(dialog.open,true);buttons[2].onclick();assert.equal(await pending,null);
});

void test('reviewed canvas stays on its explicit latest view without repainting another canvas',()=>{
 const base=content(),j=new Journal(base);j.edit(w,s,[{id:'a',f:'name',value:'Mine'}]);const latest=clone(base);op(latest,'a').name='Peer';latest.workspaces[0].stages.T[0].name='Unreviewed peer';j.resolveReview(j.review(w,s,latest),'latest');
 assert.equal(j.project(w,s,base.workspaces[0].stages.S)[0].name,'Peer');assert.equal(j.project(w,'T',base.workspaces[0].stages.T)[0].name,'C');j.edit(w,s,[{id:'a',f:'name',value:'Original'}]);assert.equal(j.project(w,s,base.workspaces[0].stages.S)[0].name,'Original');assert.equal(j.freeze(w,s).guards[0].value,'Peer');
});
