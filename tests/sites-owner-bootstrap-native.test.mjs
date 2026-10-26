// Actual compiled application, synthetic nonpersistent D1/R2 and owned loopback.
// Never uses a hosted Site, source credential, real account or external network.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {configureOfflineLocal} from '../lib/local-runtime.mjs';import {installLocalNetworkGuard} from '../lib/local-network-guard.mjs';import {denyLocalWorkerOutbound} from '../lib/local-worker-outbound.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),runtime=fs.mkdtempSync(path.join(root,'.sites-runtime/owner-native-fixture-'));
configureOfflineLocal(runtime);installLocalNetworkGuard(runtime);const require=createRequire(import.meta.url),{Miniflare,Log,LogLevel}=require('miniflare');
const moduleRoot=path.join(root,'dist/server'),main=path.join(moduleRoot,'index.js'),files=[];
function walk(directory){for(const name of fs.readdirSync(directory)){const file=path.join(directory,name),stat=fs.lstatSync(file);assert.equal(stat.isSymbolicLink(),false);if(stat.isDirectory())walk(file);else if(/\.(js|mjs)$/.test(name))files.push(file);}}
walk(moduleRoot);const modules=[main,...files.filter(f=>f!==main)].map(file=>({type:'ESModule',path:file})),origin='https://owner-native.synthetic.invalid',key='a'.repeat(64),password='synthetic-'+'native-owner-password',tests=[];
let mf,db,cookie,stage='startup',outboundDenied=0;
const requestDiagnostics=[];
const report={status:'PENDING',programCommit:process.env.PROCESS_PROGRAM_COMMIT,realOwnerCreated:false,realCredentials:false,remoteBindings:false,externalNetwork:false,tests,requestDiagnostics};
async function check(name,run){stage=name;await run();tests.push(name);}
async function request(route,{method='GET',body,headers={}}={}){return mf.dispatchFetch(origin+route,{method,headers:{...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});}
// Diagnostic output uses fixed labels/codes and numeric locations, never raw errors or inputs.
function safeDiagnostic(error) {
 const types=new Set(['Error','TypeError','AssertionError','DOMException','AggregateError','SyntaxError','RangeError']);
 const codes=new Set(['UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_ABORTED','ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','ABORT_ERR','ERR_ASSERTION','BODY_TOO_LARGE','INVALID_JSON']);
 const labels=[['owner-fixture',/sites-owner-bootstrap-native\.test\.mjs:(\d+):(\d+)\)?$/],['node-undici',/node:internal\/deps\/undici\/undici:(\d+):(\d+)\)?$/],['miniflare',/[\\/]miniflare[\\/]dist[\\/]src[\\/]index\.js:(\d+):(\d+)\)?$/],['compiled-worker',/[\\/]dist[\\/]server[\\/]index\.js:(\d+):(\d+)\)?$/],['node-stream',/node:internal\/(?:webstreams|streams)\/[a-z_-]+:(\d+):(\d+)\)?$/]];
 const detail=value=>{
  const type=types.has(value?.constructor?.name)?value.constructor.name:'Other';
  const code=codes.has(value?.code)?value.code:codes.has(value?.message)?value.message:'UNCLASSIFIED';
  const frames=[];
  for(const line of (typeof value?.stack==='string'?value.stack:'').split('\n').slice(1,9)){
   for(const [component,pattern]of labels){const match=pattern.exec(line.trim());if(match){const row=Number(match[1]),column=Number(match[2]);if(Number.isSafeInteger(row)&&Number.isSafeInteger(column)&&row>=0&&row<=1_000_000&&column>=0&&column<=1_000_000)frames.push({component,line:row,column});break;}}
   if(frames.length===4)break;
  }
  return {type,code,frames};
 };
 return {...detail(error),...(error?.cause?{cause:detail(error.cause)}:{})};
}
async function diagnosticRequest(substage,options){
 requestDiagnostics.push({substage,phase:'dispatch-started'});
 const response=await request('/api/setup/owner',options);
 requestDiagnostics.push({substage,phase:'response-received',status:response.status});
 return response;
}
try{
 assert.match(process.env.PROCESS_PROGRAM_COMMIT||'',/^[a-f0-9]{40}$/);
 mf=new Miniflare({host:'127.0.0.1',port:0,modules,modulesRoot:moduleRoot,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,log:new Log(LogLevel.NONE),defaultPersistRoot:runtime,d1Databases:{DB:'synthetic-owner'},r2Buckets:{STATE_ARCHIVE:'synthetic-owner'},d1Persist:false,r2Persist:false,cachePersist:false,assets:{directory:path.join(root,'dist/client'),routerConfig:{has_user_worker:true}},bindings:{PROCESS_OWNER_BOOTSTRAP_ENABLED:'1',PROCESS_OWNER_BOOTSTRAP_SECRET:key,PROCESS_OWNER_BOOTSTRAP_EXPIRES_AT:new Date(Date.now()+300_000).toISOString(),PROCESS_SESSION_SECRET:'b'.repeat(64),PROCESS_IMPORT_ENABLED:'1',PROCESS_IMPORT_OWNER_ID:'frank',PROCESS_IMPORT_ORIGIN:origin,PROCESS_IMPORT_TARGET_FINGERPRINT:'c'.repeat(64),PROCESS_IMPORT_MANIFEST_SHA256:'d'.repeat(64),PROCESS_PROGRAM_COMMIT:process.env.PROCESS_PROGRAM_COMMIT,DEMO_LOGIN_ENABLED:'false',PROCESS_SESSION_REVOCATION_ENABLED:'1',PROCESS_RELEASE_DISABLED:'true'},outboundService:(...args)=>{outboundDenied++;return denyLocalWorkerOutbound(...args);}});
 const ready=await mf.ready;assert.notEqual(ready.port,'3000');db=await mf.getD1Database('DB');
 for(const name of fs.readdirSync(path.join(root,'drizzle-sites-fresh')).filter(n=>n.endsWith('.sql')).sort())for(const sql of fs.readFileSync(path.join(root,'drizzle-sites-fresh',name),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 await check('compiled setup page renders bilingual form without secret prefilling',async()=>{const response=await request('/setup/owner'),html=await response.text();assert.equal(response.status,200);for(const field of ['bootstrapKey','confirmation','password'])assert.ok(html.includes(field));assert.ok(!html.includes(key)&&!html.includes(password));});
 await check('inactive company traffic remains closed before setup',async()=>{assert.equal((await request('/api/shared-state')).status,503);});
 await check('forged Sites identity cannot authorize the compiled setup route',async()=>{assert.equal((await request('/api/setup/owner',{method:'POST',body:{bootstrapKey:'f'.repeat(64),password,confirmation:password},headers:{'oai-authenticated-user-id':'frank'}})).status,403);assert.equal((await db.prepare('SELECT count(*) n FROM shared_state').first()).n,0);});
 await check('compiled setup enforces origin and streaming body limit',async()=>{
  assert.equal((await diagnosticRequest('cross-origin',{method:'POST',body:{bootstrapKey:key,password,confirmation:password},headers:{Origin:'https://other.synthetic.invalid'}})).status,403);
  requestDiagnostics.push({substage:'cross-origin',phase:'assertion-passed',status:403});
  assert.equal((await diagnosticRequest('oversized-body',{method:'POST',body:'x'.repeat(9000)})).status,413);
  requestDiagnostics.push({substage:'oversized-body',phase:'assertion-passed',status:413});
 });
 await check('compiled D1 bootstrap creates exactly one hashed owner and receipt',async()=>{const response=await request('/api/setup/owner',{method:'POST',body:{bootstrapKey:key,password,confirmation:password}}),text=await response.text();assert.equal(response.status,200);assert.equal(JSON.parse(text).loginRequired,true);assert.ok(!text.includes(key)&&!text.includes(password)&&!text.includes('scrypt'));const row=await db.prepare('SELECT "values" v FROM shared_state').first(),users=JSON.parse(JSON.parse(row.v).platformUsers);assert.equal(users.length,1);assert.equal(users[0].id,'frank');assert.match(users[0].passwordHash,/^scrypt\$/);assert.equal(users[0].password,undefined);assert.equal((await db.prepare('SELECT count(*) n FROM process_owner_bootstrap').first()).n,1);});
 await check('compiled import configuration refuses anonymous and forged platform identity',async()=>{for(const headers of [{},{'oai-authenticated-user-id':'frank','oai-authenticated-user-email':'synthetic@invalid'}]){const r=await request('/api/snapshots/import?action=configuration',{headers});assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'LOGIN_REQUIRED'});}});
 await check('replay refuses without changing the verifier or opening business traffic',async()=>{const before=(await db.prepare('SELECT "values" v FROM shared_state').first()).v;assert.equal((await request('/api/setup/owner',{method:'POST',body:{bootstrapKey:key,password,confirmation:password}})).status,409);assert.equal((await db.prepare('SELECT "values" v FROM shared_state').first()).v,before);assert.equal((await request('/api/shared-state')).status,503);});
 await check('new synthetic owner logs in through the original route and secure cookie',async()=>{const response=await request('/api/platform-login',{method:'POST',body:{id:'frank',password}});assert.equal(response.status,200);const value=response.headers.get('Set-Cookie')||'';for(const flag of ['Secure','HttpOnly','SameSite=Strict'])assert.ok(value.includes(flag));cookie=value.split(';')[0];});
 await check('compiled owner configuration excludes secrets and unknown quota',async()=>{const r=await request('/api/snapshots/import?action=configuration',{headers:{Cookie:cookie}}),text=await r.text();assert.equal(r.status,200);const config=JSON.parse(text);assert.equal(config.pins.ownerId,'frank');assert.equal(config.capacity,null);assert.ok(!text.includes(key)&&!text.includes(password)&&!text.includes('scrypt$'));const page=await request('/setup/import');assert.equal(page.status,200);assert.ok(!(await page.text()).includes('type="file"'));});
 await check('compiled begin rejects unknown capacity before any transfer or R2 writes',async()=>{const r=await request('/api/snapshots/import?action=begin',{method:'POST',body:{},headers:{Cookie:cookie}});assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:'IMPORT_CAPACITY_UNVERIFIED'});assert.equal((await db.prepare('SELECT count(*) n FROM process_snapshot_transfers').first()).n,0);});
 await check('DEMO login stays closed and setup does not bypass activation',async()=>{assert.equal((await request('/api/platform-login',{method:'POST',body:{demoRole:'admin'}})).status,403);assert.equal((await request('/api/shared-state',{headers:{Cookie:cookie}})).status,503);});
 await check('original logout revokes the setup owner normal session',async()=>{assert.equal((await request('/api/platform-login',{method:'POST',body:{action:'logout'},headers:{Cookie:cookie}})).status,200);assert.equal((await request('/api/snapshots/import',{headers:{Cookie:cookie}})).status,401);});
 report.status='PASS_COMPILED_SYNTHETIC_OWNER_BOOTSTRAP';
}catch(error){report.status='FAIL_COMPILED_SYNTHETIC_OWNER_BOOTSTRAP';report.failedStage=stage;report.failureDiagnostic=safeDiagnostic(error);report.errorType=report.failureDiagnostic.type;if(typeof error.actual==="number")report.actual=error.actual;if(typeof error.expected==="number")report.expected=error.expected;report.code=report.failureDiagnostic.code;}
finally{if(mf)await mf.dispose();report.disposed=true;report.outboundDenied=outboundDenied;report.cases=tests.length;}
console.log(JSON.stringify(report));process.exitCode=report.status.startsWith('PASS_')?0:1;
