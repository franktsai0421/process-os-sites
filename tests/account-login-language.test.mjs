// Execute the actual login binding with synthetic input/response ports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/process/data-safety-ui.js','utf8'),start=source.indexOf('  function bindProtectedPlatformLogin()'),binding=source.slice(start,source.indexOf('  const oldLogin =',start));
function fixture(language,error){
 const hint={textContent:'',classList:{add(){},remove(){}}},id={value:'',focus(){}},password={value:'',focused:false,focus(){this.focused=true;}},submit={disabled:false},quick={dataset:{quickLogin:'synthetic-user'},querySelector:()=>({textContent:'Synthetic user'})};let calls=0;
 const context={document:{documentElement:{lang:language},querySelector:s=>({'#login-submit':submit,'#login-id':id,'#login-password':password,'.login-hint':hint})[s],querySelectorAll:()=>[quick]},accountText:(zh,vi)=>language==='vi'?vi:zh,platformLogin:async()=>{calls++;throw error;}};vm.createContext(context);vm.runInContext(binding+';bindProtectedPlatformLogin();',context);return{context,hint,id,password,submit,quick,calls:()=>calls};
}
void test('login failures use the selected language for server codes and legacy error text',async()=>{
 const cases=[['ACCOUNT_NOT_FOUND','帳號不存在'],['ACCOUNT_DISABLED','此帳號已停用'],['PASSWORD_INCORRECT','密碼錯誤'],['NO_PERMISSION','此帳號尚未設定使用權限'],['LOGIN_RATE_LIMITED','登入次數過多，請稍後重試'],['LOGIN_LIMIT_UNAVAILABLE','登入暫時無法使用']];
 for(const language of ['zh','vi'])for(const [code,message]of cases)for(const modern of [false,true]){const error=Error(message);if(modern)error.code=code;const f=fixture(language,error);await f.submit.onclick();assert.equal(f.calls(),1);assert.equal(f.submit.disabled,false);if(language==='vi'){assert.doesNotMatch(f.hint.textContent,/[\u3400-\u9fff]/);assert.match(f.hint.textContent,/[A-Za-z]/);}else assert.match(f.hint.textContent,/[\u3400-\u9fff]/);assert.doesNotMatch(f.hint.textContent,/ACCOUNT_|PASSWORD_|LOGIN_/);}
});
void test('initial and quick-login hints are localized and never insert a stored password',()=>{
 for(const language of ['zh','vi']){const f=fixture(language,Error('synthetic'));if(language==='vi')assert.doesNotMatch(f.hint.textContent,/[\u3400-\u9fff]/);f.password.value='synthetic-stale-input';f.quick.onclick();assert.equal(f.password.value,'');assert.equal(f.password.focused,true);assert.equal(f.id.value,'synthetic-user');assert.match(f.hint.textContent,/Synthetic user/);if(language==='vi')assert.doesNotMatch(f.hint.textContent,/[\u3400-\u9fff]/);assert.equal(f.calls(),0);}
});
void test('unknown/stale errors display safe localized guidance without raw server text or an automatic resend',async()=>{
 for(const language of ['zh','vi'])for(const message of ['UNEXPECTED synthetic private detail','ACCOUNT_CHANGED_REOPEN_REQUIRED','ACCOUNT_INPUT_CHANGED_REOPEN_REQUIRED']){const f=fixture(language,Error(message));await f.submit.onclick();assert.equal(f.calls(),1);assert.equal(f.submit.disabled,false);assert.equal(f.hint.textContent.includes(message),false);if(language==='vi')assert.doesNotMatch(f.hint.textContent,/[\u3400-\u9fff]/);assert.doesNotMatch(f.hint.textContent,/重試|thử lại/);}
});
void test('actual login preserves internal errors/codes, stale identity rejection and unknown-result handling',async()=>{
 const begin=source.indexOf('  async function platformLogin('),code=source.slice(begin,source.indexOf('  function bindProtectedPlatformLogin()',begin));
 for(const scenario of ['rejected','unknown','stale','success']){
  const effects={confirmed:0,unknown:0,finished:0,identity:0,entered:0};
  const context={window:{ProcessAccountTransition:{begin:()=>({}),current:()=>scenario!=='stale',unconfirmed(){effects.unknown++;return true;},inputBlock:()=>false,confirm(){effects.confirmed++;},finish(){effects.finished++;}},BOMExcel:{}},sync:{setPlatformIdentity(){effects.identity++;},refresh:async()=>{}},sessionStorage:{removeItem(){}},state:{},enterPlatform(){effects.entered++;},updateOwnRecovery(){},fetch:async()=>({ok:scenario==='success',status:scenario==='unknown'?503:scenario==='success'?200:403,json:async()=>scenario==='success'?{user:{id:'synthetic-user'}}:{error:'帳號已停用',code:'ACCOUNT_DISABLED'}})};
  vm.createContext(context);vm.runInContext(code,context);
  if(scenario==='rejected')await assert.rejects(context.platformLogin('synthetic-user','synthetic'),e=>e.message==='帳號已停用'&&e.code==='ACCOUNT_DISABLED');
  else if(scenario==='stale')await assert.rejects(context.platformLogin('synthetic-user','synthetic'),e=>e.message==='ACCOUNT_CHANGED_REOPEN_REQUIRED');
  else await context.platformLogin('synthetic-user','synthetic');
  assert.equal(effects.finished,1);assert.equal(effects.identity,scenario==='success'?1:0);assert.equal(effects.confirmed,scenario==='success'?1:0);assert.equal(effects.entered,scenario==='success'?1:0);assert.equal(effects.unknown,scenario==='unknown'?1:0);
 }
});
