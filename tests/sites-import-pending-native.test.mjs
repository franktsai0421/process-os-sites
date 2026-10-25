import assert from 'node:assert/strict';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {runImportBoot} from './import-pending-browser-fixture.mjs';
const tests=[],report={programCommit:process.env.PROCESS_PROGRAM_COMMIT,realData:false,realCredentials:false,remoteBindings:false};let f,stage='startup';
async function test(name,run){stage=name;await run();tests.push(name);}
try{
 f=await createRootEntryFixture();const origin='https://pending.synthetic.invalid';
 const get=route=>f.mf.dispatchFetch(origin+route);
 let sharedSource,bootSource;
 await test('compiled static client sources are served and inactive API stays closed',async()=>{for(const [route,assign]of [['/process/shared-state.js',v=>sharedSource=v],['/process/bootstrap.js',v=>bootSource=v]]){const r=await get(route);assert.equal(r.status,200);assign(await r.text());}const r=await get('/api/shared-state');assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.deepEqual(await r.json(),{error:'IMPORT_TARGET_NOT_ACTIVE'});});
 await test('compiled inactive response reaches pending screen before requesting company modules',async()=>{const trace=[],b=await runImportBoot({sharedSource,bootSource,response:async route=>{trace.push(route);return get(route);}});assert.equal(b.api.importPending,true);assert.deepEqual(trace,['/api/process-bootstrap']);assert.deepEqual(b.preloads,[]);assert.deepEqual(b.executed,[]);assert.ok(b.boot.innerHTML.includes('Dữ liệu đang chờ nhập và kích hoạt'));});
 await test('compiled company APIs and images remain closed with no data or account writes',async()=>{for(const route of ['/api/shared-state','/api/process-bootstrap','/process/data/imported-data.js','/process/iqc-media/example.png','/api/snapshots']){const r=await get(route);assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'IMPORT_TARGET_NOT_ACTIVE'});}for(const table of ['shared_state','process_owner_bootstrap','process_snapshot_target','process_snapshot_transfers','state_backups'])assert.equal((await f.db.prepare('SELECT count(*) n FROM '+table).first()).n,0);});
 report.status='PASS_COMPILED_IMPORT_PENDING_CLIENT';
}catch(e){report.status='FAIL_COMPILED_IMPORT_PENDING_CLIENT';report.failedStage=stage;report.errorType=e.constructor.name;if(typeof e.actual==='number')report.actual=e.actual;if(typeof e.expected==='number')report.expected=e.expected;}
finally{if(f)await f.close();report.disposed=true;report.tests=tests;report.cases=tests.length;}
console.log(JSON.stringify(report));process.exitCode=report.status.startsWith('PASS_')?0:1;
