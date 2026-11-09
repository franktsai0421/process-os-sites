// Actual account UI functions with synthetic dialog/response ports; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/process/user-access.js','utf8');
function fixture({language='zh',action='update-user',id='synthetic-target',mode='normal'}={}){
 const owner={id:'synthetic-manager'},actor={id:owner.id,role:'staff',name:'Synthetic manager'},target={id:'synthetic-target',name:'Before'},key=action.endsWith('role')?'roles':'users',initial={actor,users:[],roles:[],[key]:[target]};
 const controls=[{disabled:false,textContent:'Confirm'},{disabled:true,textContent:'Protected'},{disabled:false,value:'Synthetic input'}],submitButton=controls[0],retries=[],form={},errorBox={textContent:'',append:button=>retries.push(button)},dialog={dataset:{dirty:'1'},querySelector:s=>s==='form'?form:s==='.ua-error'?errorBox:s==='[type="submit"]'?submitButton:null,querySelectorAll:()=>controls,close(){this.closed=true;}};
 let posts=0,reads=0,hold=null,release;
 const ctx={JSON,structuredClone,Error,model:structuredClone(initial),modelStamp:owner,writeUncertain:false,identityStamp:()=>owner,sameIdentity:x=>x===owner,active:()=>true,h:s=>String(s).replaceAll('<','&lt;'),t:(zh,vi)=>language==='vi'?vi:zh,message:code=>code,toast(){},paint(){},document:{querySelector:()=>null,createElement:()=>({})},async send(){posts++;if(hold)await hold;if(mode==='rejected')throw Error('FORBIDDEN');if(mode==='unknown'){ctx.writeUncertain=true;throw Error('WRITE_RESULT_UNKNOWN_RELOAD_REQUIRED');}ctx.model={actor,users:[],roles:[],[key]:action.startsWith('delete-')||mode==='missing-target'?[]:[{...target,name:'After'}]};return ctx.model;},async load(){reads++;if(mode==='read-failed')throw Error('SYNTHETIC_READ_FAILED');if(mode==='changed')ctx.model={...ctx.model,[key]:[{...target,name:'External'}]};return ctx.model;}};
 const helpers=source.slice(source.indexOf(' function rememberResultNotice('),source.indexOf(' function paint(')),submit=source.slice(source.indexOf(' function submit('),source.indexOf(' function password('));vm.createContext(ctx);vm.runInContext('let resultNotice=null;'+helpers+submit+';this.noticeValue=()=>resultNotice;',ctx);ctx.submit(dialog,()=>({action,id,password:'SYNTHETIC-SECRET-NEVER-IN-NOTICE',confirmation:'SYNTHETIC-SECRET-NEVER-IN-NOTICE'}));
 return{ctx,controls,submitButton,dialog,errorBox,retries,posts:()=>posts,reads:()=>reads,run:()=>form.onsubmit({preventDefault(){}}),mode(value){mode=value;},hold(){hold=new Promise(r=>release=r);},release(){release();}};
}
void test('pending Save shows busy feedback and disables controls; completion restores prior disabled states',async()=>{
 const f=fixture();f.hold();const running=f.run();await Promise.resolve();assert.equal(f.dialog.ariaBusy,'true');assert.match(f.submitButton.textContent,/保存|核對/);assert(f.controls.every(c=>c.disabled));assert.equal(f.posts(),1);await f.run();assert.equal(f.posts(),1);f.release();await running;assert.equal(f.dialog.ariaBusy,'false');assert.equal(f.submitButton.textContent,'Confirm');assert.equal(f.controls[1].disabled,true);assert.equal(f.controls[2].disabled,false);assert.equal(f.dialog.closed,true);
});
for(const mode of ['unknown','read-failed','changed'])void test(mode+' keeps Confirm visibly blocked and permits only explicit read-only verification',async()=>{
 const f=fixture({mode});await f.run();assert.equal(f.submitButton.disabled,true);assert.equal(f.controls[2].disabled,false,'input remains available to copy');assert.equal(f.dialog.closed,undefined);assert.equal(f.retries.length,1);assert.match(f.retries[0].textContent,/不寫入/);await f.run();assert.equal(f.posts(),1);f.mode('normal');await f.retries[0].onclick();assert.equal(f.posts(),1);if(mode==='read-failed')assert.equal(f.dialog.closed,true);else assert.equal(f.dialog.closed,undefined);
});
void test('definite rejection restores a usable Confirm and preserves originally disabled controls',async()=>{
 const f=fixture({mode:'rejected'});await f.run();assert.equal(f.submitButton.disabled,false);assert.equal(f.submitButton.textContent,'Confirm');assert.equal(f.controls[1].disabled,true);assert.equal(f.dialog.ariaBusy,'false');assert.equal(f.errorBox.textContent,'FORBIDDEN');f.mode('normal');await f.run();assert.equal(f.posts(),2);assert.equal(f.dialog.closed,true);
});
void test('uppercase account input is checked against the server canonical target and detects a changed readback',async()=>{
 const f=fixture({id:'SYNTHETIC-TARGET',mode:'changed'});await f.run();assert.equal(f.dialog.closed,undefined);assert.equal(f.submitButton.disabled,true);assert.equal(f.ctx.noticeValue(),null);assert.equal(f.posts(),1);assert.equal(f.reads(),1);
});
void test('a non-delete acknowledgement missing its target cannot become a verified success',async()=>{
 for(const action of ['create-user','update-user','status-user','password','create-role','update-role']){const f=fixture({action,mode:'missing-target'});await f.run();assert.equal(f.dialog.closed,undefined,action);assert.equal(f.ctx.noticeValue(),null,action);assert.equal(f.submitButton.disabled,true,action);assert.equal(f.posts(),1);}
 const deleted=fixture({action:'delete-user'});await deleted.run();assert.equal(deleted.dialog.closed,true);assert(deleted.ctx.noticeValue());
});
void test('password result distinguishes account readback from fresh-login acceptance and retains no credentials',async()=>{
 for(const language of ['zh','vi']){const f=fixture({action:'password',language});await f.run();const html=f.ctx.resultNoticeHTML();assert.match(html,language==='vi'?/đăng nhập.*mật khẩu mới/:/新密碼.*登入/);assert.match(html,/synthetic-target/);assert.equal(JSON.stringify(f.ctx.noticeValue()).includes('SYNTHETIC-SECRET'),false);if(language==='vi')assert.doesNotMatch(html,/[\u3400-\u9fff]/);}
});
void test('reset-other and own-password dialogs use distinct localized titles and original-password fields',()=>{
 const start=source.indexOf(' function password('),code=source.slice(start,source.indexOf(' function editUser(',start));for(const language of ['zh','vi'])for(const self of [true,false]){let title,markup;const ctx={model:{actor:{id:'synthetic-manager'}},t:(zh,vi)=>language==='vi'?vi:zh,dialog:(a,b)=>{title=a;markup=b;return{};},submit(){}};vm.createContext(ctx);vm.runInContext(code,ctx);ctx.password({id:self?'synthetic-manager':'synthetic-target'});assert.match(title,language==='vi'?(self?/Đổi/:/Đặt lại/):(self?/修改/:/重設/));assert.equal(markup.includes('name="oldPassword"'),self);}
});
void test('known account API errors have specific translations and Vietnamese permission summaries use commas',()=>{
 const labels=source.slice(source.indexOf(' const labels='),source.indexOf(' const roleName=')),summary=source.slice(source.indexOf(' function otherSummary('),source.indexOf(' function matrix('));for(const language of ['zh','vi']){const ctx={t:(zh,vi)=>language==='vi'?vi:zh,primaryOps:['view'],operationLabel:x=>x};vm.createContext(ctx);vm.runInContext(labels+summary+';this.translate=message;',ctx);for(const code of ['ACCOUNT_NOT_FOUND','INVALID_CELLS','INVALID_INPUT','USE_STATUS_ACTION']){const text=ctx.translate(code);assert.doesNotMatch(text,/無法完成操作|Không thể hoàn tất;/);if(language==='vi')assert.doesNotMatch(text,/[\u3400-\u9fff]/);}const text=ctx.otherSummary({id:'synthetic',ops:['view','edit','submit']},{cells:{'synthetic.edit':true,'synthetic.submit':true}});assert.equal(text,language==='vi'?'edit, submit':'edit、submit');}
});

void test('an already unknown account write blocks a newly opened dialog visibly without another send',async()=>{
 const f=fixture();f.ctx.writeUncertain=true;f.ctx.submit(f.dialog,()=>({action:'password',id:'synthetic-target'}));assert.equal(f.submitButton.disabled,true);assert.equal(f.errorBox.textContent,'WRITE_RESULT_UNKNOWN_RELOAD_REQUIRED');await f.run();assert.equal(f.posts(),0);assert.equal(f.reads(),0);
});
void test('read-only checks cannot certify a missing ACK target or a readback reverted to its old value',async()=>{
 for(const mode of ['missing-target','changed']){const f=fixture({mode});await f.run();f.mode('normal');if(mode==='changed')f.ctx.model={...f.ctx.model,users:[{id:'synthetic-target',name:'Before'}]};await f.retries[0].onclick();assert.equal(f.dialog.closed,undefined);assert.equal(f.ctx.noticeValue(),null);assert.equal(f.submitButton.disabled,true);assert.equal(f.errorBox.textContent,mode==='missing-target'?'WRITE_RESULT_UNKNOWN_RELOAD_REQUIRED':'TARGET_CHANGED');assert.equal(f.posts(),1);}
});

void test('role create/update/delete require the same exact target readback and invoke completion only after verification',async()=>{
 for(const action of ['create-role','update-role','delete-role'])for(const language of ['zh','vi']){const f=fixture({action,language});let completed=0;f.ctx.submit(f.dialog,()=>({action,id:'SYNTHETIC-TARGET'}),()=>completed++);await f.run();assert.equal(f.dialog.closed,true);assert.equal(completed,1);assert.equal(f.posts(),1);assert.equal(f.reads(),1);assert.match(f.ctx.resultNoticeHTML(),/synthetic-target/);}
});
void test('an owner change while waiting or before read-only recovery never closes or certifies the old dialog',async()=>{
 for(const phase of ['waiting','recovery']){const f=fixture({mode:phase==='waiting'?'normal':'read-failed'});if(phase==='waiting'){f.hold();const running=f.run();await Promise.resolve();f.ctx.sameIdentity=()=>false;f.release();await running;}else{await f.run();f.mode('normal');f.ctx.sameIdentity=()=>false;await f.retries[0].onclick();}assert.equal(f.dialog.closed,undefined);assert.equal(f.ctx.noticeValue(),null);assert.equal(f.submitButton.disabled,true);assert.equal(f.posts(),1);}
});
