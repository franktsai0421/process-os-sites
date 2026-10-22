// Isolated synthetic compatibility check. Never starts the application or reads data.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {assertLocalMode,configureOfflineLocal} from '../lib/local-runtime.mjs';
import {installLocalNetworkGuard} from '../lib/local-network-guard.mjs';

const source=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
assertLocalMode([]);
const dependencyRoot=process.env.PROCESS_PROBE_DEPENDENCY_ROOT;
if(!dependencyRoot||!path.isAbsolute(dependencyRoot))throw Error('PROBE_EXPLICIT_EXISTING_DEPENDENCIES_REQUIRED');
const require=createRequire(path.join(dependencyRoot,'package.json'));
const versions=Object.fromEntries(['miniflare','typescript'].map(name=>[name,require(name+'/package.json').version]));
if(versions.miniflare!=='4.20260515.0'||versions.typescript!=='5.9.3')throw Error('PROBE_PINNED_DEPENDENCIES_REQUIRED');
const reportPath=process.env.PROCESS_PROBE_REPORT;
if(!reportPath||!path.isAbsolute(reportPath)||fs.existsSync(reportPath))throw Error('PROBE_NEW_REPORT_REQUIRED');
const root=fs.mkdtempSync(path.join(path.dirname(source),'synthetic-runtime-'));
configureOfflineLocal(root);installLocalNetworkGuard(root);
const ts=require('typescript');
const passwordCode=ts.transpileModule(fs.readFileSync(path.join(source,'lib/passwords.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const script=passwordCode+`
export default {async fetch(request,env){
 const checks=[];const check=(name,ok)=>{checks.push({name,status:ok?'PASS':'FAIL'});};
 // Fixed synthetic input only; random verifiers remain in this request's memory.
 const fake='synthetic-only-passphrase';
 try{const hash=await passwordHash(fake);check('actual passwordHash/verifyPassword roundtrip',await verifyPassword({passwordHash:hash},fake));check('wrong password refuses',!await verifyPassword({passwordHash:hash},fake+'x'));check('malformed verifier refuses',!await verifyPassword({passwordHash:'scrypt$1'},fake));check('legacy plaintext compatibility',await verifyPassword({password:fake},fake));}catch{check('password crypto supported by pinned runtime',false);}
 try{await env.DB.prepare('CREATE TABLE fixture (id INTEGER PRIMARY KEY, value TEXT NOT NULL)').run();await env.DB.prepare('INSERT INTO fixture VALUES (?,?)').bind(1,'synthetic').run();const row=await env.DB.prepare('SELECT value FROM fixture WHERE id=?').bind(1).first();check('local D1 binding parameterized write/read',row?.value==='synthetic');}catch{check('local D1 binding parameterized write/read',false);}
 try{await env.STATE_ARCHIVE.put('fixture-only','synthetic');const object=await env.STATE_ARCHIVE.get('fixture-only');check('local R2 binding write/read',await object?.text()==='synthetic');}catch{check('local R2 binding write/read',false);}
 try{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('synthetic-request-only-key'),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);const data=new TextEncoder().encode('synthetic-session');const sig=await crypto.subtle.sign('HMAC',key,data);check('WebCrypto HMAC sign/verify',await crypto.subtle.verify('HMAC',key,sig,data));check('WebCrypto altered message refuses',!await crypto.subtle.verify('HMAC',key,sig,new Uint8Array([0])));}catch{check('WebCrypto HMAC sign/verify',false);}
 return Response.json({checks});
}};`;
let mf;const report={at:new Date().toISOString(),root,versions,scope:{synthetic:true,realData:false,realCredentials:false,applicationStarted:false,remoteBindings:false,installed:false,sitesAccepted:false},checks:[]};
try{
 const {Miniflare,Log,LogLevel}=require('miniflare');
 mf=new Miniflare({host:'127.0.0.1',port:0,modules:true,script,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,log:new Log(LogLevel.NONE),d1Databases:{DB:'synthetic-only'},r2Buckets:{STATE_ARCHIVE:'synthetic-only'},d1Persist:false,r2Persist:false,cachePersist:false,defaultPersistRoot:root,outboundService:{network:{allow:[],deny:['public','private']}}});
 const ready=await mf.ready;
 if(!['127.0.0.1','localhost','[::1]'].includes(ready.hostname)||ready.port==='3000')throw Error('PROBE_LOOPBACK_PORT_REQUIRED');
 const response=await mf.dispatchFetch('http://localhost/fixture');
 if(response.status!==200)throw Error('PROBE_WORKER_RESPONSE');
 report.checks=(await response.json()).checks;
 report.status=report.checks.length&&report.checks.every(check=>check.status==='PASS')?'PASS_PINNED_LOCAL_WORKER_SYNTHETIC_ONLY':'FAIL_PINNED_LOCAL_WORKER_CHECKS';
}catch(error){report.status='RUNTIME_PROBE_UNAVAILABLE';report.failureCode=typeof error?.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:'REDACTED_RUNTIME_ERROR';report.errorClass=/^[A-Za-z0-9_]+$/.test(error?.constructor?.name||'')?error.constructor.name:'Error';}
finally{if(mf)try{await mf.dispose();report.disposed=true;}catch{report.disposed=false;}fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify(report));process.exitCode=report.status.startsWith('PASS_')?0:1;
