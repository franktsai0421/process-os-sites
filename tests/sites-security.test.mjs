import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {demoLoginAllowed} from '../lib/demo-identities.mjs';
import {boundedJson,projectCompanyState,visibleMediaReference,validateAssetIndex} from '../lib/site-security.mjs';
import {exportSnapshot,importSnapshot,validateSnapshot,maximumChunkBytes,sha256} from '../lib/snapshot-contract.mjs';
import {checkSitesSource} from '../scripts/sites-source-check.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
// Existing compiler is read only. No dependency installation, SDK, Miniflare,
// listener, fetch, source package restore or native database is used by this test.
const require=createRequire(import.meta.url);
const compilerPath=process.env.SITES_TEST_TYPESCRIPT || require.resolve('typescript');
const ts=require(compilerPath);
const report=[];
async function test(name,run){await run();report.push(name);}
function loader(overrides={}) {
  const context=vm.createContext({Request,Response,Headers,URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,crypto:webcrypto,atob,btoa,console});
  const cache=new Map();
  async function load(specifier,importer=path.join(root,'entry.ts')) {
    if(Object.hasOwn(overrides,specifier)) {
      const key='override:'+specifier;
      if(!cache.has(key)){const exports=overrides[specifier];cache.set(key,new vm.SyntheticModule(Object.keys(exports),function(){for(const [name,value] of Object.entries(exports))this.setExport(name,value);},{context}));}
      return cache.get(key);
    }
    let file=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):path.resolve(path.dirname(importer),specifier);
    if(!fs.existsSync(file))for(const extension of ['.ts','.mjs','.js'])if(fs.existsSync(file+extension)){file+=extension;break;}
    if(!file.startsWith(root+path.sep))throw Error('Test module outside isolated source');
    if(cache.has(file))return cache.get(file);
    const source=fs.readFileSync(file,'utf8');
    const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:file,reportDiagnostics:true});
    assert.equal((output.diagnostics||[]).filter(item=>item.category===ts.DiagnosticCategory.Error).length,0,'TypeScript syntax diagnostics');
    const module=new vm.SourceTextModule(output.outputText,{context,identifier:file});cache.set(file,module);
    await module.link((name,parent)=>load(name,parent.identifier));
    return module;
  }
  return async relative=>{const module=await load('./'+relative);await module.evaluate();return module.namespace;};
}

await test('source-only copy excludes business dataset and retains the selected Site identity',()=>{const hosting=JSON.parse(fs.readFileSync(path.join(root,'.openai/hosting.json'),'utf8'));assert.equal(hosting.project_id,'appgprj_6ad9abaff47c8191846eb9821034696b');assert.equal(hosting.d1,'DB');assert.equal(hosting.r2,'STATE_ARCHIVE');assert.equal(checkSitesSource(root).registered,true);});
await test('DEMO defaults closed; explicit opt-in still works',()=>{for(const value of [undefined,null,'',false,'false'])assert.equal(demoLoginAllowed(value),false);assert.equal(demoLoginAllowed('true'),true);});
await test('request body size is enforced without trusting Content-Length',async()=>{await assert.rejects(boundedJson(new Request('https://fixture.invalid',{method:'POST',body:'x'.repeat(9000)})),/BODY_TOO_LARGE/);assert.deepEqual(await boundedJson(new Request('https://fixture.invalid',{method:'POST',body:'{"id":"fixture"}'})),{id:'fixture'});});
const actor={id:'fixture-staff'};
const fakeState={revision:1,values:{platformUsers:'[]',iqcMasterControl:'{}',routineEquipmentControl:'{}',unknownPrivate:'{}',masterDataControl:JSON.stringify({active:{AB:{},C:{},PROCESS:{}},versions:[{scope:'AB'},{scope:'C'}]})}};
await test('anonymous projection is refused',async()=>{await assert.rejects(projectCompanyState(fakeState,null,()=>true),/LOGIN_REQUIRED/);});
await test('module and master scopes restrict reads; unknown keys denied',async()=>{const value=await projectCompanyState(fakeState,actor,key=>['iqc.view','c.view'].includes(key));assert.ok(value.values.iqcMasterControl);assert.equal(value.values.routineEquipmentControl,undefined);assert.equal(value.values.unknownPrivate,undefined);assert.deepEqual(Object.keys(JSON.parse(value.values.masterDataControl).active),['C']);});
await test('media requires a reference visible to this visitor',async()=>{const data='data:image/png;base64,ZmFrZQ==';const id=await sha256(new TextEncoder().encode(data));assert.equal(await visibleMediaReference({image:JSON.stringify(data)},id),true);assert.equal(await visibleMediaReference({image:'[]'},id),false);});
const id='a'.repeat(64);
const asset={path:'/process/iqc-media/fixture.png',key:'company-assets/objects/'+id,sha256:id,bytes:4,permissions:['iqc.view'],contentType:'image/png'};
await test('private asset index rejects traversal, empty ACL and duplicate paths',()=>{const index=assets=>({format:'PROCESS_OS_COMPANY_ASSETS_V1',assets});validateAssetIndex(index([asset]));for(const bad of [{...asset,path:'/process/iqc-media/../secret'},{...asset,permissions:[]}])assert.throws(()=>validateAssetIndex(index([bad])));assert.throws(()=>validateAssetIndex(index([asset,asset])));});

const sessionEnv={PROCESS_SESSION_SECRET:'fixture-only-not-a-live-secret',DEMO_LOGIN_ENABLED:'false',PROCESS_SESSION_REVOCATION_ENABLED:'0',DB:{prepare(){return {bind(){return this;},async first(){return null;}};}}};
const processState=await loader({'cloudflare:workers':{env:sessionEnv},'./passwords':{verifyPassword:async()=>false},'./state-chunks':{encodeChunkedValues(){throw Error('Not used');},decodeChunkedValues(){throw Error('Not used');}},'./state-records':{encodeRecordValues(){throw Error('Not used');},decodeRecordValues(){throw Error('Not used');}}})('lib/process-state.ts');
const userState={revision:1,values:{platformUsers:JSON.stringify([{id:'fixture-user',name:'Fixture',role:'staff',enabled:true,authEpoch:2}])}};
await test('real HMAC session preserves normal account login and cookie attributes',async()=>{const token=await processState.demoSession(new Request('https://fixture.invalid'),'fixture-user',false,2);const response=await processState.identity(new Request('https://fixture.invalid',{headers:{cookie:'process_demo='+token}}),userState);assert.equal(response.id,'fixture-user');const cookie=processState.sessionCookie(new Request('https://fixture.invalid'),token);for(const flag of ['HttpOnly','Secure','SameSite=Strict','Max-Age=28800'])assert.ok(cookie.includes(flag));});
await test('missing/fake Sites and admin headers do not authenticate hosted visitors',async()=>{assert.equal(await processState.identity(new Request('https://fixture.invalid',{headers:{'oai-authenticated-user-id':'fake','oai-authenticated-user-email':'fake@invalid','x-process-admin-id':'fixture-user','x-process-admin-password':'fixture-only'}}),userState),null);});
await test('auth epoch, disabled user, tampered token and revocation deny sessions',async()=>{const token=await processState.demoSession(new Request('https://fixture.invalid'),'fixture-user',false,1);assert.equal(await processState.identity(new Request('https://fixture.invalid',{headers:{cookie:'process_demo='+token}}),userState),null);const valid=await processState.demoSession(new Request('https://fixture.invalid'),'fixture-user',false,2);const request=new Request('https://fixture.invalid',{headers:{cookie:'process_demo='+valid}});const disabled=structuredClone(userState);disabled.values.platformUsers=JSON.stringify([{id:'fixture-user',role:'staff',enabled:false,authEpoch:2}]);assert.equal(await processState.identity(request,disabled),null);assert.equal(await processState.identity(new Request('https://fixture.invalid',{headers:{cookie:'process_demo='+valid+'x'}}),userState),null);sessionEnv.PROCESS_SESSION_REVOCATION_ENABLED='1';sessionEnv.DB.prepare=()=>({bind(){return this;},async first(){return {expires_at:Date.now()+10000};}});assert.equal(await processState.identity(request,userState),null);sessionEnv.PROCESS_SESSION_REVOCATION_ENABLED='0';});
await test('login limiter denies exhausted counters and does not create schema',async()=>{const calls=[];const env={DB:{prepare(sql){calls.push(sql);return {bind(){return this;}};},async batch(){return [{success:true,results:[{attempts:31}]},{success:true,results:[{attempts:1}]}];}}};const api=await loader({'cloudflare:workers':{env}})('lib/login-limit.ts');assert.equal(await api.allowLoginAttempt(new Request('https://fixture.invalid'),'fixture'),false);assert.ok(calls.every(sql=>!sql.includes('CREATE')));});
await test('generic image endpoint allows normal staff only for visible image',async()=>{let visible=true;const api=await loader({'cloudflare:workers':{env:{STATE_ARCHIVE:{async get(){return {body:'fake',size:4,httpMetadata:{contentType:'image/png'}};}}}},'@/lib/process-state':{readState:async()=>fakeState,companyReader:async()=>({actor}),companyState:async()=>({values:{image:JSON.stringify(visible?'/api/state-media?id='+id:'none')}})}})('app/api/state-media/route.ts');const request=new Request('https://fixture.invalid/api/state-media?id='+id);const ok=await api.GET(request);assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'no-store');visible=false;assert.equal((await api.GET(request)).status,403);});
await test('anonymous image request is denied before bucket access',async()=>{let reads=0;const api=await loader({'cloudflare:workers':{env:{STATE_ARCHIVE:{get(){reads++;}}}},'@/lib/process-state':{readState:async()=>fakeState,companyReader:async()=>null,companyState:async()=>{throw Error('Must not read');}}})('app/api/state-media/route.ts');assert.equal((await api.GET(new Request('https://fixture.invalid/api/state-media?id='+id))).status,401);assert.equal(reads,0);});
await test('snapshot API requires normal admin and fixed program version; hosted import unavailable',async()=>{let who={role:'staff',sessionType:'platform'};const api=await loader({'cloudflare:workers':{env:{}},'@/lib/snapshot-d1-r2.mjs':{createD1R2Source(){throw Error('No real bindings used');}},'@/lib/snapshot-stream.mjs':{snapshotResponseBody(){throw Error('No live export');}},'@/lib/process-state':{readState:async()=>fakeState,identity:async()=>who,can:async()=>true,responseHeaders:{'Cache-Control':'no-store'}}})('app/api/snapshots/route.ts');const request=new Request('https://fixture.invalid/api/snapshots?action=export');assert.equal((await api.GET(request)).status,403);who={role:'admin',sessionType:'demo'};assert.equal((await api.GET(request)).status,403);who={role:'admin',sessionType:'platform'};assert.equal((await api.GET(request)).status,503);assert.equal((await api.POST()).status,405);});

const encoded=new TextEncoder().encode('[]'),schemaFingerprint='b'.repeat(64);
function fixturePackage({drift=false}={}) {
  let checks=0,manifest,aborted=false;
  const chunks=new Map();
  const source={scope:'site-export',credentialPolicy:'excluded',schemaFingerprint,programCommit:'a'.repeat(40),async checkpoint(){checks++;return {revision:drift?checks:7};},async *chunks(){for(const resource of ['db/shared_state','db/state_backups','db/web_feedback_store','r2/fixture/image'])yield {resource,offset:0,totalBytes:encoded.length,data:encoded,metadata:{contentType:'application/json'}};}};
  const sink={scope:'private-snapshot',async writeChunk(id,data){chunks.set(id,data.slice());},async complete(value){manifest=value;},async abort(){aborted=true;}};
  const reader={scope:'private-snapshot',async manifest(){return manifest;},async readChunk(id){return chunks.get(id);}};
  return {source,sink,reader,chunks,get manifest(){return manifest;},get aborted(){return aborted;}};
}
function fixtureTarget(){let committed=false,aborted=false,writes=0;return {scope:'isolated-local',schemaFingerprint,async isEmpty(){return true;},async begin(){return {async writeChunk(){writes++;},async commit(){committed=true;},async abort(){aborted=true;}};},get committed(){return committed;},get aborted(){return aborted;},get writes(){return writes;}};}
await test('versioned snapshot exports, verifies and imports to isolated fixture only',async()=>{const pack=fixturePackage();await exportSnapshot(pack.source,pack.sink);const target=fixtureTarget();const result=await importSnapshot(pack.reader,target);assert.equal(result.resources,4);assert.equal(target.committed,true);assert.equal(target.writes,4);});
await test('snapshot drift never publishes a complete manifest',async()=>{const pack=fixturePackage({drift:true});await assert.rejects(exportSnapshot(pack.source,pack.sink),/SOURCE_CHANGED/);assert.equal(pack.manifest,undefined);assert.equal(pack.aborted,true);});
await test('snapshot corruption aborts staging; hosted and nonempty targets rejected',async()=>{const pack=fixturePackage();await exportSnapshot(pack.source,pack.sink);const target=fixtureTarget();pack.chunks.set('c1',new TextEncoder().encode('XX'));await assert.rejects(importSnapshot(pack.reader,target),/INTEGRITY/);assert.equal(target.aborted,true);assert.equal(target.committed,false);await assert.rejects(importSnapshot(pack.reader,{...fixtureTarget(),scope:'site'}),/LOCAL_TARGET/);await assert.rejects(importSnapshot(pack.reader,{...fixtureTarget(),async isEmpty(){return false;}}),/NOT_EMPTY/);});
await test('snapshot validates schema, coverage, ordering, traversal and chunk bounds',async()=>{const pack=fixturePackage();await exportSnapshot(pack.source,pack.sink);for(const change of [m=>m.format='other',m=>m.chunks[0].offset=1,m=>m.chunks[0].resource='r2/../secret',m=>m.chunks[0].bytes=maximumChunkBytes+1,m=>m.chunks=m.chunks.filter(c=>c.resource!=='db/state_backups')]){const bad=structuredClone(pack.manifest);change(bad);assert.throws(()=>validateSnapshot(bad));}await assert.rejects(importSnapshot(pack.reader,{...fixtureTarget(),schemaFingerprint:'c'.repeat(64)}),/SCHEMA_MISMATCH/);});
const evidence={status:'PASS_FIXTURE_ONLY',cases:report.length,tests:report,scope:{SDK:false,Miniflare:false,HTTP:false,database:false,realCredentials:false,realData:false,deployment:false,fullBuild:false}};
if(process.env.SITES_TEST_REPORT)fs.writeFileSync(process.env.SITES_TEST_REPORT,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
