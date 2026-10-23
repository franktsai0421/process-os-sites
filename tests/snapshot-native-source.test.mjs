import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {setup} from './hosted-import-fixtures.mjs';
import {sha256} from '../lib/snapshot-contract.mjs';
import {openSnapshotDirectory} from '../lib/snapshot-files.mjs';
import {createNormalizationDirectory} from '../lib/snapshot-normalize-files.mjs';
import {writeBrowserHandoff} from '../lib/snapshot-browser-handoff.mjs';
import {openNativeSnapshot,createNativeRecipeUploader} from '../lib/snapshot-native-source.mjs';
import {decodeBatchBody} from '../lib/snapshot-batch.mjs';
import {actor} from './hosted-import-fixtures.mjs';
import {runNativeImport} from '../lib/snapshot-native-runner.mjs';
import {nativeImportCLI} from '../scripts/snapshot-upload-native.mjs';
const base=fs.mkdtempSync(path.resolve(import.meta.dirname,'../.sites-runtime/native-source-fixture-')),f=await setup({canonical:false,feedback:true}),tests=[];let normalized;
async function test(name,run){await run();tests.push(name);}
try{
 const sourceDirectory=path.join(base,'source');fs.mkdirSync(sourceDirectory);fs.mkdirSync(path.join(sourceDirectory,'chunks'));
 const raw=new TextEncoder().encode(JSON.stringify(f.pack.completed)),sourcePin=await sha256(raw);
 fs.writeFileSync(path.join(sourceDirectory,'manifest.json'),raw);fs.writeFileSync(path.join(sourceDirectory,'COMPLETE'),'synthetic');for(const[id,b]of f.pack.chunks)fs.writeFileSync(path.join(sourceDirectory,'chunks',id),b);
 const source=await openSnapshotDirectory(sourceDirectory,sourcePin),viewRoot=path.join(base,'view');normalized=await createNormalizationDirectory({source,sourceRoot:sourceDirectory,output:viewRoot,programCommit:'e'.repeat(40),sourceManifestSha256:sourcePin});
 const pins={projectId:f.config.projectId,origin:'https://native-upload.synthetic.invalid',ownerId:f.config.ownerId,targetFingerprint:f.config.targetFingerprint,manifestSha256:normalized.result.manifestSha256},handoffDirectory=path.join(base,'handoff');
 await writeBrowserHandoff({source,normalized,viewRoot,output:handoffDirectory,pins});const args={sourceDirectory,handoffDirectory,pins};
 const metadata=JSON.parse(fs.readFileSync(path.join(handoffDirectory,'HANDOFF.json'),'utf8'));
 await test('read-only CLI consumes fixed folders directly and never authorizes upload',async()=>{const result=await nativeImportCLI(['--inspect','--source',sourceDirectory,'--handoff',handoffDirectory,'--project',pins.projectId,'--origin',pins.origin,'--owner',pins.ownerId,'--target',pins.targetFingerprint,'--manifest',pins.manifestSha256]);assert.equal(result.status,'PASS_NATIVE_PREFLIGHT_ONLY');assert.equal(result.remoteRequests,0);assert.equal(result.authorizedToUpload,false);});
 await test('local adapter reads identical normalized bytes without browser selection or network',async()=>{const native=await openNativeSnapshot(args),m=await native.manifest();assert.equal(await sha256(new TextEncoder().encode(JSON.stringify(m))),pins.manifestSha256);for(const c of m.chunks)assert.deepEqual(await native.readChunk(c.id),await normalized.view.readChunk(c.id));});
 await test('native uploader refuses absent authorized transport before opening a source',async()=>{await assert.rejects(createNativeRecipeUploader({...args,sourceDirectory:path.join(base,'not-present')}),/NATIVE_AUTHORIZED_TRANSPORT_REQUIRED/);});
 await test('native uploader construction performs no implicit remote request',async()=>{let requests=0;const uploader=await createNativeRecipeUploader({...args,request:async()=>{requests++;assert.fail('NO_IMPLICIT_FETCH');}});assert.ok(uploader.transferId);assert.equal(requests,0);});
 await test('all target pins must match the reviewed handoff',async()=>{for(const k of ['projectId','origin','ownerId','targetFingerprint','manifestSha256'])await assert.rejects(openNativeSnapshot({...args,pins:{...pins,[k]:'wrong'}}),/BROWSER_TARGET_MISMATCH/);});
 await test('failed or incomplete roots cannot be imported',async()=>{for(const root of [sourceDirectory,handoffDirectory])for(const marker of ['INCOMPLETE','FAILED']){fs.writeFileSync(path.join(root,marker),'synthetic');try{await assert.rejects(openNativeSnapshot(args),/NATIVE_PACKAGE_INCOMPLETE/);}finally{fs.unlinkSync(path.join(root,marker));}}});
 await test('modified alias bytes fail their original chunk checksum',async()=>{const item=metadata.mapping.find(x=>x.sourceId),file=path.join(sourceDirectory,'chunks',item.sourceId),before=fs.readFileSync(file),native=await openNativeSnapshot(args),changed=Buffer.from(before);changed[0]^=1;fs.writeFileSync(file,changed);try{await assert.rejects(native.readChunk(item.id),/BROWSER_CHUNK_INTEGRITY/);}finally{fs.writeFileSync(file,before);}});
 await test('missing bounded replay chunk refuses before any request',async()=>{const item=metadata.mapping.find(x=>x.delta),file=path.join(handoffDirectory,'chunks',item.id),hold=file+'.synthetic-held';fs.renameSync(file,hold);try{await assert.rejects(openNativeSnapshot(args),/ENOENT/);}finally{fs.renameSync(hold,file);}});
 await test('untrusted mapping paths cannot escape either selected root',async()=>{const file=path.join(handoffDirectory,'HANDOFF.json'),before=fs.readFileSync(file),wrong=structuredClone(metadata);wrong.mapping[0].sourceId='../outside';delete wrong.mapping[0].delta;fs.writeFileSync(file,JSON.stringify(wrong));try{await assert.rejects(openNativeSnapshot(args),/NATIVE_MEMBER_PATH/);}finally{fs.writeFileSync(file,before);}});
 await test('changed handoff metadata cannot evade its checksum',async()=>{const file=path.join(handoffDirectory,'HANDOFF.json'),before=fs.readFileSync(file),wrong=structuredClone(metadata);wrong.ownerId='wrong';fs.writeFileSync(file,JSON.stringify(wrong));try{await assert.rejects(openNativeSnapshot(args),/BROWSER_HANDOFF_INTEGRITY/);}finally{fs.writeFileSync(file,before);}});
 await test('native files traverse the synthetic batch verify audit copy and restore pipeline with target owner retained',async()=>{
  f.config.manifestSha256=pins.manifestSha256;const calls=[],before=f.sqlite.prepare('SELECT "values" v FROM shared_state').get().v;
  const request=async(url,o)=>{const u=new URL(url),id=u.searchParams.get('id'),action=u.searchParams.get('action'),version=u.searchParams.has('version')?Number(u.searchParams.get('version')):undefined;calls.push(action||'status');let value;
   if(o.method==='GET')value=action==='activation-status'?await f.activation.status(actor,id):await f.transfer.status(actor,id,{cursor:Number(u.searchParams.get('cursor')||0)});
   else if(action==='begin')value=await f.transfer.begin(actor,o.body);
   else if(action==='batch')value=await f.transfer.receiveBatch(actor,id,await decodeBatchBody(o.body,o.headers['Content-Type']));
   else if(action==='verify')value=await f.transfer.verify(actor,id,{expectedVersion:version,limit:16});
   else if(['audit','copy','restore'].includes(action))value=await f.activation[action](actor,id,{expectedVersion:version,limit:4});
   else assert.fail('UNAUTHORIZED_SYNTHETIC_ACTION');return Response.json(value);};
  const client=await createNativeRecipeUploader({...args,request}),options={allowDataWrite:true,capacity:{projectId:pins.projectId,targetFingerprint:pins.targetFingerprint,reference:'synthetic-known-capacity',checkedAt:new Date().toISOString(),r2AvailableBytes:2**40,d1AvailableBytes:2**30}};
  await client.upload(options);const result=await client.restore({...options,allowActivation:false});assert.equal(result.phase,'data-ready');assert.equal(result.businessTrafficEnabled,false);assert.ok(calls.includes('batch')&&calls.includes('verify')&&calls.includes('audit')&&calls.includes('copy')&&calls.includes('restore'));assert.ok(!calls.includes('activate'));
  const current=JSON.parse(f.sqlite.prepare('SELECT "values" v FROM shared_state').get().v),original=JSON.parse(before);assert.equal(current.platformUsers,original.platformUsers);
 });
 await test('lost acknowledgement stops native sender; explicit new runner resumes receipts without retransmitting confirmed chunks',async()=>{
  const target=await setup({canonical:false,feedback:true});try{
   target.config.manifestSha256=pins.manifestSha256;const manifest=await normalized.view.manifest(),raw=new TextEncoder().encode(JSON.stringify(manifest));await target.transfer.begin(actor,raw);
   const puts=new Map(),originalPut=target.bucket.put;target.bucket.put=async(key,...rest)=>{if(key.includes('/chunks/'))puts.set(key,(puts.get(key)||0)+1);return originalPut(key,...rest);};let lose=true;const methods=[];
   const sendAuthorized=async(url,o)=>{methods.push(o.method);const u=new URL(url),id=u.searchParams.get('id'),action=u.searchParams.get('action'),version=u.searchParams.has('version')?Number(u.searchParams.get('version')):undefined;let value;
    if(action==='configuration')value={pins,bootstrapClosed:true,budget:{state:'open',inFlight:false}};
    else if(action==='budget-status')value={state:'open',inFlight:false};
    else if(o.method==='GET')value=action==='activation-status'?await target.activation.status(actor,id):await target.transfer.status(actor,id,{cursor:Number(u.searchParams.get('cursor')||0)});
    else if(action==='batch'){value=await target.transfer.receiveBatch(actor,id,await decodeBatchBody(o.body,new Headers(o.headers).get('Content-Type')));if(lose){lose=false;throw Error('SYNTHETIC_LOST_ACK');}}
    else if(action==='verify')value=await target.transfer.verify(actor,id,{expectedVersion:version,limit:16});
    else if(['audit','copy','restore'].includes(action))value=await target.activation[action](actor,id,{expectedVersion:version,limit:4});else assert.fail('UNEXPECTED_NATIVE_ACTION');return Response.json(value);};
   const options={allowDataWrite:true,resume:true,capacity:{projectId:pins.projectId,targetFingerprint:pins.targetFingerprint,reference:'synthetic-known-capacity',checkedAt:new Date().toISOString(),r2AvailableBytes:2**40,d1AvailableBytes:2**30}};
   const stopped=await runNativeImport({...args,sendAuthorized,options});assert.equal(stopped.status,'NATIVE_STOPPED_REQUIRE_RECEIPT_REVIEW');assert.equal(stopped.receipt.readOnly,true);assert.ok(stopped.receipt.received>0);assert.equal(stopped.receipt.automaticResumeAllowed,false);assert.equal(methods.filter(m=>m==='POST').length,1);
   const before=target.sqlite.prepare('SELECT "values" v FROM shared_state').get().v;
   const resumed=await runNativeImport({...args,sendAuthorized,options});assert.equal(resumed.status,'NATIVE_STAGING_VERIFIED_NOT_RESTORED');assert.equal(resumed.dataReady,false);assert.equal(resumed.businessTrafficEnabled,false);assert.ok([...puts.values()].every(n=>n===1));assert.equal(puts.size,manifest.chunks.length);
   assert.equal(target.sqlite.prepare('SELECT "values" v FROM shared_state').get().v,before);assert.equal(target.sqlite.prepare('SELECT COUNT(*) n FROM state_backups').get().n,0);assert.equal(target.sqlite.prepare('SELECT COUNT(*) n FROM web_feedback_store').get().n,0);assert.ok([...target.bucket.objects.keys()].every(k=>k.startsWith('process-import/v1/')));
  }finally{await target.close();}
 });
 console.log(JSON.stringify({status:'PASS_SYNTHETIC_NATIVE_SOURCE',cases:tests.length,tests,network:false,realData:false,realCredentials:false}));
}finally{if(normalized)await normalized.view.close();await f.close();}
