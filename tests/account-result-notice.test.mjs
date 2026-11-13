// Actual submit/content functions with owned response ports; no browser/network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/process/user-access.js','utf8');
function fixture(){
 let owner={id:'synthetic-manager',generation:1},mode='normal',language='zh',active=true;
 const events={posts:0,reads:0,paints:0,noticesRemoved:0},buttons=[],form={addEventListener(){},setAttribute(){},removeAttribute(){}},errorBox={textContent:'',append(b){buttons.push(b);},before(){}};
 const dialog={isConnected:true,open:true,dataset:{dirty:'1'},querySelector:s=>s==='form'?form:s==='.ua-error'?errorBox:null,querySelectorAll:()=>[{disabled:false},{disabled:true}],close(){this.closed=true;}};
 const actor={id:owner.id,name:'Synthetic manager',role:'staff'},target={id:'synthetic-staff',name:'Before'};
 const ctx={structuredClone,Error,JSON,model:{revision:1,actor,users:[target]},modelStamp:owner,writing:0,writeUncertain:false,page:'users',state:{view:'data',dataTab:'users'},identityStamp:()=>owner,sameIdentity:stamp=>stamp===owner,active:()=>active,h:String,t:(zh,vi)=>language==='vi'?vi:zh,roleName:()=> 'STAFF',ownPermissions:()=>'',button:label=>'<button>'+label+'</button>',message:code=>code,toast(){},accountToast(){},paint(){events.paints++;},setTimeout(){throw Error('Result must not auto-dismiss');},document:{querySelector:s=>s==='[data-ua-result]'?{remove(){events.noticesRemoved++;}}:null,createElement:()=>({setAttribute(){}})},async send(){
  events.posts++;
  if(mode==='unknown'){ctx.writeUncertain=true;throw Error('WRITE_RESULT_UNKNOWN_RELOAD_REQUIRED');}
  if(mode==='prewrite')throw Error('FORBIDDEN');
  if(mode==='revision-rejected')throw Error('REVISION_CHANGED');
  ctx.model={revision:2,actor:{...actor},users:[{id:target.id,name:'Saved'}]};return {...ctx.model,...(mode==='relogin'?{relogin:true}:{})};
 },async load(){
  events.reads++;
  if(mode==='readback-failure'&&events.posts>0)throw Error('SYNTHETIC_READBACK_FAILURE');
  if(mode==='identity-change'&&events.posts>0){owner={id:'synthetic-other',generation:2};ctx.modelStamp=owner;throw Error('STALE_IDENTITY_RESPONSE');}
  if(mode==='target-changed'&&events.posts>0)ctx.model={...ctx.model,revision:3,users:[{id:target.id,name:'External change'}]};
  return ctx.model;
 }};
 vm.createContext(ctx);
 const start=source.indexOf(' function rememberResultNotice('),helpers=start<0?'':source.slice(start,source.indexOf(' function paint('));
 const content=source.slice(source.indexOf(' function content('),source.indexOf(' function roleOptions(')),submit=source.slice(source.indexOf(' function submit('),source.indexOf(' function password('));
 vm.runInContext('let resultNotice=null;'+helpers+content+submit,ctx);
 function arm(){ctx.submit(dialog,()=>({action:'update-user',id:target.id,name:'Saved'}));}
 arm();
 return {ctx,events,errorBox,dialog,buttons,run:()=>form.onsubmit({preventDefault(){}}),arm,mode:v=>mode=v,language:v=>language=v,active:v=>active=v,render:()=>ctx.content(),switchIdentity(){owner={id:'synthetic-other',generation:2};ctx.modelStamp=owner;ctx.model={revision:3,actor:{id:owner.id,name:'Other',role:'staff'},users:[]};}};
}
const notice=html=>html.match(/<p data-ua-result[^>]*>([\s\S]*?)<\/p>/)?.[1]||'';
void test('a verified save remains visible across renders with no dismiss timer',async()=>{
 const f=fixture();assert.equal(notice(f.render()),'');await f.run();
 for(let i=0;i<3;i++)assert.match(notice(f.render()),/上次操作已儲存並讀回確認/);
 assert.equal(f.events.posts,1);assert.equal(f.events.reads,2);assert.equal(f.dialog.closed,true);
});
void test('result uses the current language rather than retaining old translated text',async()=>{
 const f=fixture();await f.run();f.language('vi');assert.match(notice(f.render()),/Thao tác trước đã được lưu/);assert.equal(/[\u3400-\u9fff]/.test(notice(f.render())),false);
});
for(const mode of ['prewrite','unknown','readback-failure','target-changed','identity-change','relogin'])void test(mode+' does not claim a verified result',async()=>{
 const f=fixture();f.mode(mode);await f.run();assert.equal(notice(f.render()),'');assert.equal(f.events.posts,1);
});
void test('explicit readback recovery publishes a result without sending another write',async()=>{
 const f=fixture();f.mode('readback-failure');await f.run();assert.equal(notice(f.render()),'');assert.equal(f.buttons.length,1);
 f.mode('normal');await f.buttons[0].onclick();assert.match(notice(f.render()),/上次操作已儲存並讀回確認/);assert.equal(f.events.posts,1);assert.equal(f.events.reads,3);
});
for(const mode of ['unknown','revision-rejected'])void test(mode+' read-only verification does not claim a completed write',async()=>{
 const f=fixture();f.mode(mode);await f.run();f.mode('normal');await f.buttons[0].onclick();
 assert.equal(notice(f.render()),'');assert.equal(f.events.posts,1);assert.equal(f.events.reads,2);assert.equal(f.errorBox.textContent,mode==='unknown'?'WRITE_RESULT_UNKNOWN_RELOAD_REQUIRED':'READ_VERIFIED');
});
void test('a new failed confirmation clears the previous success without changing the target',async()=>{
 const f=fixture();await f.run();assert(notice(f.render()));f.arm();f.mode('prewrite');await f.run();assert.equal(notice(f.render()),'');assert(f.events.noticesRemoved>0);
});
void test('a result cannot follow another identity or appear for an inactive page',async()=>{
 const f=fixture();await f.run();f.switchIdentity();assert.equal(notice(f.render()),'');
 const g=fixture();g.active(false);await g.run();g.active(true);assert.equal(notice(g.render()),'');
});

void test('definite prewrite denial stays unsuccessful and offers no read-only cure',async()=>{const f=fixture();f.mode('prewrite');await f.run();assert.equal(notice(f.render()),'');assert.equal(f.events.posts,1);assert.equal(f.events.reads,1);assert.equal(f.buttons.length,0);assert.equal(f.errorBox.textContent,'FORBIDDEN');});
