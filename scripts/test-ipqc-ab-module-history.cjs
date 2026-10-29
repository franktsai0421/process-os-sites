/* Actual IPQC-AB history entry + real shared client/modal in isolated VM. GET-only memory responses; no SDK/network/browser/data writes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'public/process/ipqc-ab.js'),'utf8'),shared=fs.readFileSync(path.join(root,'public/process/shared-draft-client.js'),'utf8');
const results=[],at='2026-10-16T09:00:00Z';
async function check(name,run){await run();results.push({name,status:'PASS'});}
function actualParts(text){
 const lines=text.split(/\r?\n/),transport=lines.filter(l=>l.includes('function transport(){')),moduleLines=lines.filter(l=>l.includes('function moduleTransport(){')),entry=lines.filter(l=>l.includes("button.id='ab-case-history'"));
 assert.equal(transport.length,1);assert.equal(moduleLines.length,1);assert.equal(entry.length,1);return transport[0]+'\n'+moduleLines[0]+'\n'+entry[0];
}
function historyView(script,lang,events){
 const helpers=script.split(/\r?\n/).filter(l=>['  const h =','  const vi =','  const t ='].some(prefix=>l.startsWith(prefix)));assert.equal(helpers.length,3);
 const actual=script.match(/  function historyHTML\(\) \{[\s\S]*?\r?\n  \}/)?.[0];assert(actual,'actual source historyHTML');
 const raw=JSON.stringify(events),context={document:{documentElement:{lang}},events,Date,output:''};
 vm.runInNewContext(helpers.join('\n')+'\nconst version=()=>({history:events});\n'+actual+'\noutput=historyHTML();',context,{filename:'actual-ipqcab-source-history.js'});assert.equal(JSON.stringify(events),raw,'history display never rewrites raw actions/actor/comment');return context.output;
}
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.style={};this.isConnected=true;this.disabled=false;this._html='';this.handlers={};}
 set innerHTML(value){this._html=String(value);this.buttons=[...this._html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(m=>{const b=new Element('button');b.attrs={};for(const a of m[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)){b.attrs[a[1]]=a[2]??'';if(a[1].startsWith('data-'))b.dataset[a[1].slice(5).replace(/-([a-z])/g,(_m,c)=>c.toUpperCase())]=a[2]??'';}b.disabled=Object.hasOwn(b.attrs,'disabled');b.textContent=m[2];return b;});}
 get innerHTML(){return this._html;}
 querySelectorAll(selector){const match=selector.match(/^\[([\w-]+)\]$/);if(match)return(this.buttons||[]).filter(b=>Object.hasOwn(b.attrs,match[1]));if(selector==='button')return this.buttons||[];return[];}
 querySelector(selector){if(selector==='main'){this.main||=new Element('main');return this.main;}return this.querySelectorAll(selector)[0]||null;}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);n.isConnected=true;}}
 prepend(...nodes){this.children.unshift(...nodes);}
 setAttribute(key,value){this.attrs||={};this.attrs[key]=String(value);}
 addEventListener(type,handler){this.handlers[type]=handler;}
 focus(){}
 remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 async click(){if(this.disabled)throw Error('DISABLED_CONTROL');if(this.onclick)return this.onclick();if(this.handlers.click)return this.handlers.click();}
}
async function fixture(script,{whole=true,mayEdit=true,mayHistory=true,restore}={}){
 const requests=[],overlays=[],created=[],storageWrites=[],timers=new Set(),container=new Element(),body=new Element('body');body.style.overflow='';
 const identity={id:'synthetic-frank',name:'Synthetic Frank',role:'admin'},initialControl=whole?{moduleDraft:{workflow:{}}}:{};
 const moduleCases=['returned','withdrawn','withdrawn','approved'].map((status,i)=>({id:'module-'+(i+1),status,actor:{id:identity.id,name:'Module Submitter'},at,reason:'Module reason '+(i+1),savedId:'module-save',before:{scopes:{'A:G1':{errors:[],items:[]}},bases:{}},content:{scopes:{'A:G1':{errors:[],items:[]}},bases:{}},result:{actor:{id:identity.id,name:'Module Reviewer'},at,reason:'Module decision '+(i+1),selfReview:true}}));
 const groupCases=Array.from({length:6},(_,i)=>({id:'group-'+(i+1),status:'approved',actor:{name:'Old group actor'},at,reason:'Old group reason',savedId:'group-save',before:{errors:[],items:[]},content:{errors:[],items:[]}}));
 const document={documentElement:{lang:'zh'},activeElement:null,body,createElement:tag=>{const e=new Element(tag);created.push(e);return e;},querySelector:()=>null,querySelectorAll:selector=>selector==='.shared-restore-overlay'?overlays.filter(o=>o.isConnected):[],addEventListener(){},removeEventListener(){}};
 body.append=(node)=>{overlays.push(node);node.parent=body;body.children.push(node);};
 const window={ProcessSync:{identity},addEventListener(){}};
 const fetch=async(url,options)=>{const u=new URL(url,'http://memory.invalid');requests.push({url:u.href,method:options.method});assert.equal(options.method,'GET','history must never write');assert.equal(u.pathname,'/api/ipqc-ab/workflow');const whole=u.searchParams.get('module')==='1',rows=whole?moduleCases:groupCases;let value;
  if(u.searchParams.has('history'))value={cases:rows.map(({before:_before,content:_content,...c})=>c),next:null,total:rows.length};
  else if(u.searchParams.has('caseId')){value={reviewCase:rows.find(c=>c.id===u.searchParams.get('caseId'))};assert(value.reviewCase);}
  else if(u.searchParams.has('permissions'))value={permissions:{view:true,history:mayHistory,edit:mayEdit,...(restore===undefined?{}:{restore})}};
  else throw Error('UNEXPECTED_READ '+u.search);return new Response(JSON.stringify(value),{status:200});};
 const context=vm.createContext({window,document,fetch,Response,AbortController,URL,URLSearchParams,crypto:{randomUUID:()=>String(created.length+requests.length)},sessionStorage:{getItem:()=>null,setItem(){storageWrites.push('set');throw Error('SESSION_WRITE_FORBIDDEN');},removeItem(){storageWrites.push('remove');throw Error('SESSION_WRITE_FORBIDDEN');}},setTimeout(fn){timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn),console,initialControl,mayEdit,mayHistory,statusContainer:container});
 vm.runInContext(shared,context,{filename:'actual-shared-draft-client.js'});
 const realOpen=window.openSharedDraftHistory;let options;
 window.openSharedDraftHistory=async opts=>{options=opts;await opts.client.permissions();return realOpen(opts);};
 const setup="const API='/api/ipqc-ab',headers=()=>({}),key=()=> 'A:G1',actor=()=>window.ProcessSync.identity,t=(zh,_vi)=>zh,opened=()=>({status:'draft'}),permitted=k=>k==='approval.compare'?mayHistory:mayEdit,status=statusContainer;let control=initialControl,sharedClient=null,sharedIdentity='',moduleClient=null,moduleActor='',message='';function draw(){}\n";
 vm.runInContext(setup+actualParts(script),context,{filename:'actual-ipqcab-history-entry.js'});
 const button=container.children.find(n=>n.id==='ab-case-history');if(button)await button.click();
 const overlay=overlays.at(-1);
 async function openCase(){assert(overlay);const first=overlay.querySelectorAll('[data-case]')[0];assert(first);await first.click();}
 function close(){overlay?.querySelectorAll('[data-close]')[0]?.onclick?.();assert.equal(vm.runInContext('message',context),'','entry error must not be swallowed');assert.equal(storageWrites.length,0);assert(requests.every(r=>r.method==='GET'));}
 return{button,options,overlay,requests,openCase,close,initialControl,context};
}
(async()=>{
 if(process.argv.length>2){assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--before');const before=fs.readFileSync(path.resolve(process.argv[3]),'utf8');await check('old actual entry reproduces six group cases instead of four module cases',async()=>{const f=await fixture(before);assert.equal(f.overlay.querySelectorAll('[data-case]').length,6);assert(f.requests.every(r=>new URL(r.url).searchParams.get('scope')==='A:G1'));assert(!f.overlay.innerHTML.includes('module-1'));f.close();assert.match(historyView(before,'zh',[{action:'approved',actorName:'Actor',at,comment:'Reason'}]),/<p>approved · Actor/,'old actual source history exposes raw English');});}
 await check('actual entry and real client/modal list the four module cases at exact module endpoint',async()=>{const f=await fixture(source);assert.equal(f.overlay.querySelectorAll('[data-case]').length,4);assert(f.requests.every(r=>{const q=new URL(r.url).searchParams;return q.get('module')==='1'&&q.get('caseMetadata')==='1'&&!q.has('scope');}));assert.equal(f.options.editable(),false);assert(!f.overlay.innerHTML.includes('group-1'));await f.openCase();assert.match(f.overlay.innerHTML,/Module Reviewer/);assert.match(f.overlay.innerHTML,/Module decision 1/);assert.equal(f.overlay.querySelectorAll('[data-restore]').length,0);f.close();for(const lang of ['zh','vi']){
 const expected={'initial-import':['匯入初始資料','Nhập dữ liệu ban đầu'],begin:['開始修改','Bắt đầu sửa'],save:['儲存草稿','Lưu bản nháp'],submit:['送出審核','Gửi duyệt'],'submit-test':['送出試用確認','Gửi xác nhận thử nghiệm'],'create-error':['新增錯誤代碼','Thêm mã lỗi'],'create-item':['新增檢查項目','Thêm hạng mục kiểm tra'],'delete-error':['刪除錯誤代碼','Xóa mã lỗi'],'delete-item':['刪除檢查項目','Xóa hạng mục kiểm tra'],approve:['已核准','Đã duyệt'],approved:['已核准','Đã duyệt'],return:['已發回','Đã trả lại'],returned:['已發回','Đã trả lại'],reject:['已發回','Đã trả lại'],withdraw:['已撤回','Đã rút'],withdrawn:['已撤回','Đã rút']};
 const events=[...Object.keys(expected),'future<action>','constructor'].map(action=>({action,actorName:'Actor <safe>&',at,comment:'Reason <safe>& [self-review]'})),html=historyView(source,lang,events),escapedDate=new Date(at).toLocaleString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 for(const labels of Object.values(expected))assert(html.includes('<p>'+labels[lang==='vi'?1:0]+' · Actor &lt;safe&gt;&amp; · '+escapedDate+' Reason &lt;safe&gt;&amp; [self-review]</p>'),'known action localized without actor/date/reason changes');
 assert(html.includes('<p>future&lt;action&gt; · '));assert(html.includes('<p>constructor · '));assert(!html.includes('future<action>'));assert(!html.includes('Actor <safe>'));assert(!html.includes('Reason <safe>'));assert.equal((html.match(/<p>/g)||[]).length,events.length);
 }});
 await check('whole-module stays readonly even with normal edit rights',async()=>{const f=await fixture(source,{whole:true,mayEdit:true,restore:true});await f.openCase();assert.equal(f.options.editable(),false);assert.equal(f.overlay.querySelectorAll('[data-restore]').length,0);f.close();});
 await check('legacy group read and preexisting restore visibility remain permission gated',async()=>{for(const mayEdit of [true,false]){const f=await fixture(source,{whole:false,mayEdit,restore:true});assert.equal(f.overlay.querySelectorAll('[data-case]').length,6);assert(f.requests.every(r=>new URL(r.url).searchParams.get('scope')==='A:G1'&&!new URL(r.url).searchParams.has('module')));assert.equal(f.options.editable(),mayEdit);await f.openCase();assert.equal(f.overlay.querySelectorAll('[data-restore]').length,mayEdit?1:0);assert.equal(f.overlay.querySelectorAll('[data-archive]').length,1);f.close();}});
 await check('legacy group edit does not imply missing false or malformed restore',async()=>{for(const restore of [undefined,false,null,0,1,'true']){const f=await fixture(source,{whole:false,mayEdit:true,restore});assert.equal(f.options.editable(),true);await f.openCase();assert.equal(f.overlay.querySelectorAll('[data-restore]').length,0);assert(f.requests.some(r=>new URL(r.url).searchParams.has('permissions')),'real client hydrates explicit synthetic rights');f.close();}});
 await check('no history permission means no entry and no request',async()=>{const f=await fixture(source,{mayHistory:false});assert.equal(f.button,undefined);assert.equal(f.requests.length,0);f.close();});
 await check('a legacy opened entry cannot expose restore after module adoption',async()=>{const f=await fixture(source,{whole:false,mayEdit:true,restore:true});assert.equal(f.options.editable(),true);await f.openCase();const restore=f.overlay.querySelector('[data-restore]');assert(restore);f.initialControl.moduleDraft={workflow:{}};assert.equal(f.options.editable(),false);const count=f.requests.length;await restore.handlers.click();assert.equal(f.requests.length,count,'retained group Restore cannot read preview after module adoption');f.close();});
 await check('actor ownership remains enforced by unchanged real transport',async()=>{const f=await fixture(source);const count=f.requests.length;f.context.window.ProcessSync.identity={id:'other-synthetic',role:'admin'};await assert.rejects(()=>f.options.client.history(),/ACCOUNT_CHANGED_REOPEN_REQUIRED/);assert.equal(f.requests.length,count);f.close();});
 assert(source.includes("returned:t('已發回','Đã trả lại'),withdrawn:t('已撤回','Đã rút')"),'two status entries retained');
 console.log(JSON.stringify({status:'PASS_IPQCAB_MODULE_HISTORY_ENTRY_MEMORY_ONLY',groups:results.length,results,actualEntry:true,actualTransportAndModal:true,SDK:false,HTTP:false,GUI:false,realDataWrites:0,restoreApplyExecuted:false,moduleBodyDisplayAccepted:false,moduleBodyQualification:'Existing shared historyCollections does not flatten {scopes,bases}; entry/list/actor/decision tested only. No shared renderer fix or full content acceptance.'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
