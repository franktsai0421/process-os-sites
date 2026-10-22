// Compiled API plus normal synthetic application login. Cookies stay in this
// local fixture only; no user browser/session or real password is accessed.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {setup} from './hosted-import-fixtures.mjs';
import {createNormalizationPlan,openNormalizationView} from '../lib/snapshot-normalize.mjs';
import {createRecipeUploader} from '../lib/snapshot-recipe-uploader.mjs';
import {sha256} from '../lib/snapshot-contract.mjs';
const tests=[],report={programCommit:process.env.PROCESS_PROGRAM_COMMIT,realData:false,realCredentials:false,remoteBindings:false};let f,original,view,stage='startup';
async function test(name,run){stage=name;await run();tests.push(name);}
try{
 original=await setup({canonical:false});const plan=await createNormalizationPlan(original.pack,{programCommit:'e'.repeat(40)});view=await openNormalizationView(original.pack,plan);const manifestSha256=await sha256(new TextEncoder().encode(JSON.stringify(plan.manifest))),origin='https://upload-native.synthetic.invalid',projectId='appgprj_6ad9abaff47c8191846eb9821034696b',targetFingerprint='c'.repeat(64),capacity={projectId,targetFingerprint,reference:'synthetic-capacity-only',checkedAt:new Date().toISOString(),r2AvailableBytes:4*1024**3,d1AvailableBytes:100*1024**2},pins={projectId,targetFingerprint,origin,ownerId:'frank',manifestSha256};
 f=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ORIGIN:origin,PROCESS_IMPORT_OWNER_ID:'frank',PROCESS_IMPORT_TARGET_FINGERPRINT:targetFingerprint,PROCESS_IMPORT_MANIFEST_SHA256:manifestSha256,PROCESS_IMPORT_CAPACITY_JSON:JSON.stringify(capacity),PROCESS_SESSION_SECRET:'s'.repeat(64)}});
 const require=createRequire(import.meta.url),{scryptSync}=require('node:crypto'),salt='12'.repeat(24),password='synthetic-'+'uploader-password';
 // Exact retained scrypt parameters; never fall back to a weaker test verifier.
 const verifier='scrypt$32768$8$3$'+salt+'$'+scryptSync(password,Buffer.from(salt,'hex'),64,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex');
 await f.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,0,?,?)').bind(JSON.stringify({platformUsers:JSON.stringify([{id:'frank',role:'admin',enabled:true,authEpoch:0,passwordHash:verifier}]),maintenanceMode:'1'}),'synthetic').run();let cookie;
 await test('compiled normal login authorizes owner import page without exposing verifier',async()=>{const login=await f.mf.dispatchFetch(origin+'/api/platform-login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({id:'frank',password})});assert.equal(login.status,200);cookie=(login.headers.get('Set-Cookie')||'').split(';')[0];assert.ok(cookie);const r=await f.mf.dispatchFetch(origin+'/setup/import',{headers:{Cookie:cookie}}),html=await r.text();assert.equal(r.status,200);assert.ok(!html.includes(verifier)&&!html.includes(password));});
 await test('compiled recipe uploader transfers and verifies all pinned synthetic chunks through API',async()=>{const client=await createRecipeUploader({source:view,pins,request:(url,o)=>f.mf.dispatchFetch(url,{...o,headers:{...o.headers,Cookie:cookie}})}),r=await client.upload({allowDataWrite:true,capacity});assert.equal(r.phase,'integrity-verified');const count=await f.db.prepare('SELECT count(*) n FROM process_snapshot_chunks').first();assert.equal(count.n,plan.manifest.chunks.length);});
 await test('verified transport still leaves company gate closed and owner password unchanged',async()=>{const r=await f.mf.dispatchFetch(origin+'/api/shared-state',{headers:{Cookie:cookie}});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'IMPORT_TARGET_NOT_ACTIVE'});const row=await f.db.prepare('SELECT "values" v FROM shared_state WHERE id=1').first();assert.equal(JSON.parse(JSON.parse(row.v).platformUsers)[0].passwordHash,verifier);assert.equal((await f.db.prepare('SELECT count(*) n FROM process_snapshot_activations').first()).n,0);});
 report.status='PASS_COMPILED_RECIPE_UPLOAD_TRANSPORT';
}catch(e){report.status='FAIL_COMPILED_RECIPE_UPLOAD_TRANSPORT';report.failedStage=stage;report.errorType=e.constructor.name;if(typeof e.actual==='number')report.actual=e.actual;if(typeof e.expected==='number')report.expected=e.expected;}
finally{if(f)await f.close();if(view)await view.close();if(original)await original.close();report.disposed=true;report.tests=tests;report.cases=tests.length;}
console.log(JSON.stringify(report));process.exitCode=report.status.startsWith('PASS_')?0:1;
