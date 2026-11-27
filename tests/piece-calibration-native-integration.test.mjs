import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,pixel,photoEndpoint,endpoint} from './piece-calibration-native-fixture.mjs';
import {receiveSnapshotStream} from '../lib/snapshot-stream.mjs';
import {restoreLocalSnapshot} from '../lib/snapshot-local.mjs';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {memoryPackage,stage} from './snapshot-fixtures.mjs';

test('compiled calibration is disabled by default and grants are checked per operation',async()=>{
 const off=await setup('0','0');try{
  await off.json(endpoint,'frank',404);assert.equal((await off.request(photoEndpoint,'frank','PUT',pixel(),{'content-type':'image/png'})).status,404);
 }finally{await off.close();}
 const f=await setup('1','0');try{
  await f.json(endpoint,'outsider',403);assert(!(await f.json(endpoint,'viewer')).actions.length);
  await f.send('viewer',{action:'newPlan',ids:['source']},403);
  await f.send('frank',{action:'resetPreview',id:null},403);
  assert.equal((await f.request(photoEndpoint,'viewer','PUT',pixel(),{'content-type':'image/png'})).status,403);
 }finally{await f.close();}
});

test('compiled actual shared rounds, draft permissions, photo scope, backup restore, retry and restart',async()=>{
 const f=await setup('1','1',{transfer:false,restartable:true});
 const equipment='/api/routine-equipment?caseMetadata=1';
 const photo=id=>f.request(photoEndpoint+'?id='+id,'viewer');
 const upload=async red=>{const r=await f.request(photoEndpoint,'operator','PUT',pixel(red),{'content-type':'image/png'});assert.equal(r.status,200);return (await r.json()).id;};
 const send=(action,doc,extra={})=>f.send('operator',{action,doc,...extra});
 const approve=async doc=>{await send('submit',doc);await f.send('reviewer',{action:'approve',doc});};
 const round=async(ids,date,photos,exerciseReview=false)=>{
  const {doc}=await f.send('operator',{action:'newPlan',ids});const plan=(await f.state()).docs.find(d=>d.id===doc).plan;
  await send('save',doc,{start:date,end:date});
  if(exerciseReview){
   await send('submit',doc);await send('withdraw',doc);await send('submit',doc);await f.send('reviewer',{action:'return',doc,reason:'Synthetic review'});await send('save',doc,{start:date,end:date});
  }
  await approve(doc);const report=(await f.state()).docs.find(d=>d.plan===plan&&d.kind==='initial').id;
  await send('save',report,{rows:ids.map(id=>({id,date,outcome:'pass',photos}))});await approve(report);return plan;
 };
 try{
  const shared=await upload(41),unique=await upload(55);
  const first=await round(['source','target'],'2026-09-15',[shared],true);
  const later=await round(['target'],'2026-10-16',[shared,unique]);
  const begun=await f.request('/api/routine-equipment/workflow?caseMetadata=1','frank','POST',{action:'begin'},{'X-Process-Expected-Actor':'frank'});
  assert.equal(begun.status,200);
  const rawMaster=(await f.json(equipment,'frank')).control;
  assert(rawMaster.versions.some(v=>v.status==='draft'));
  const facts=(await f.json(equipment,'frank')).calibrationFacts;
  assert.equal(facts.target.dates.calibratedAt,'2026-10-16');assert(facts.target.locked);assert.equal((await photo(unique)).status,200);
  await f.send('viewer',{action:'resetPreview',id:null},403);await f.send('frank',{action:'resetPreview',planId:first},409,'NEWER_ROUND');
  const backup=memoryPackage(),exp=await f.request('/api/snapshots?action=export','frank');assert.equal(exp.status,200,exp.ok?'':await exp.text());
  const receipt=await receiveSnapshotStream(exp.body,backup);assert.equal(receipt.source.programCommit,process.env.PROCESS_PROGRAM_COMMIT);
  const restored=await createRootEntryFixture(f.settings);try{
   const bucket=await restored.mf.getR2Bucket('STATE_ARCHIVE');
   await restoreLocalSnapshot(backup,{db:restored.db,bucket,staging:stage(),proof:{kind:'local-platform-proxy',remoteBindings:false,emptyTarget:true}});
   const row=await restored.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
   const data=(await f.load('lib/state-records.ts').decodeRecordValues(bucket,JSON.parse(row.values))).values;
   const initialEquipment=rawMaster.versions.find(v=>v.id===rawMaster.activeVersionId).equipment;
   for(const item of initialEquipment){
    const key='routine-equipment/photos/'+item.photoId;
    const original=await (await f.mf.getR2Bucket('STATE_ARCHIVE')).get(key),copy=await bucket.get(key);
    assert.equal(copy.httpMetadata.contentType,'image/png');
    assert.deepEqual(new Uint8Array(await copy.arrayBuffer()),new Uint8Array(await original.arrayBuffer()));
   }
   assert.equal(JSON.parse(data.pieceCalibrationLedger).plans.length,2);assert(await bucket.head('piece-calibration/photos/'+unique));
  }finally{await restored.close();}
  const preview=await f.send('frank',{action:'resetPreview',planId:later});
  assert.deepEqual(preview.pieces[0].restore,{calibratedAt:'2026-09-15',expiresAt:'2026-10-15'});
  const cmd={action:'reset',planId:later,confirm:'RESET round',token:preview.token,revision:preview.revision};
  await f.send('frank',{...cmd,confirm:'RESET all'},400);
  const reset=()=>f.request(endpoint,'frank','POST',cmd);
  const batch=await Promise.all([reset(),reset()]);assert(batch.some(r=>r.status===200));assert(batch.every(r=>[200,409].includes(r.status)));
  assert.equal((await f.state()).revision,preview.revision+1);
  await f.restart();assert.equal((await reset()).status,200);assert.equal((await f.state()).revision,preview.revision+1);
  assert.equal((await photo(shared)).status,200);assert.equal((await photo(unique)).status,404);
  assert(await (await f.mf.getR2Bucket('STATE_ARCHIVE')).head('piece-calibration/photos/'+unique));
  const all=await f.send('frank',{action:'resetPreview',id:null});
  assert.equal(all.counts.plans,1);await f.send('frank',{action:'reset',id:null,confirm:'RESET all',revision:all.revision,token:all.token});
  assert.equal((await f.state()).docs.length,0);assert.equal((await photo(shared)).status,404);
  const master=await f.json(equipment,'frank');assert.deepEqual(master.control,rawMaster);assert(!master.calibrationFacts.target.locked);assert.equal(master.calibrationFacts.target.dates.calibratedAt,'2025-12-12');
 }finally{await f.close();}
});

test('compiled external pass, failed internal retest, missing photo recovery and unreferenced retirement',async()=>{
 const f=await setup('1','1',{transfer:false,restartable:true,externalTarget:true,legacyMethods:true});
 const equipment='/api/routine-equipment?caseMetadata=1';
 try{
  const beforeRead=new Date(),opening=await f.state(),today=opening.today;
  const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'});
  assert([localDay.format(beforeRead),localDay.format(new Date())].includes(today));
  assert.deepEqual(opening.items.map(r=>[r.id,r.method]).sort(),[['source','internal'],['target','external']]);
  const methods=async()=>{
   const {control}=await f.json(equipment,'frank');
   return control.versions.find(v=>v.id===control.activeVersionId).equipment.map(r=>[r.id,r.calibrationMethod]).sort();
  };
  assert.deepEqual(await methods(),[['source','內部校正'],['target','Hiệu chuẩn bên ngoài']]);
  const save=(doc,fields)=>f.send('operator',{action:'save',doc,...fields});
  const submit=doc=>f.send('operator',{action:'submit',doc}),review=doc=>f.send('reviewer',{action:'approve',doc});
  const promote=async doc=>{await submit(doc);await review(doc);};
  const upload=async()=>{const r=await f.request(photoEndpoint,'operator','PUT',pixel(65),{'content-type':'image/png'});assert.equal(r.status,200);return (await r.json()).id;};
  const photo=await upload();
  const begin=async id=>{
   const {doc}=await f.send('operator',{action:'newPlan',ids:[id]});await save(doc,{start:today,end:today});await promote(doc);
   return (await f.state()).docs.findLast(d=>d.kind==='initial'&&d.ids.includes(id)).id;
  };
  const row=(id,outcome)=>({id,date:today,outcome,photos:[photo]});
  await f.send('operator',{action:'newPlan',ids:['source','target']},422,'MIXED_METHOD');
  const ext=await begin('target');await save(ext,{rows:[row('target','pass')]});await promote(ext);
  assert((await f.json(equipment,'frank')).calibrationFacts.target.locked);
  const first=await begin('source');await save(first,{rows:[row('source','fail')]});await submit(first);
  const before=await f.state(),bucket=await f.mf.getR2Bucket('STATE_ARCHIVE');
  await bucket.delete('piece-calibration/photos/'+photo);
  await f.send('reviewer',{action:'approve',doc:first},422,'PHOTO_MISSING');
  assert.equal((await f.state()).revision,before.revision);assert.equal((await f.state()).docs.find(d=>d.id===first).status,'pending');
  await f.restart();assert.equal(await upload(),photo);await review(first);
  let facts=(await f.json(equipment,'frank')).calibrationFacts;assert(facts.source.locked);assert.equal(facts.source.status,'failed');
  const choose=async kind=>{
   const failed=(await f.state()).docs.findLast(d=>d.kind==='failure'&&d.status==='draft');
   await f.send('operator',{action:'branch',doc:failed.id,kind});
   return (await f.state()).docs.findLast(d=>d.kind===kind).id;
  };
  const request=await choose('retestRequest');await save(request,{scheduled:today+'T08:00'});await promote(request);
  const retest=(await f.state()).docs.findLast(d=>d.kind==='retest').id;
  await save(retest,{rows:[row('source','pass')]});await promote(retest);
  facts=(await f.json(equipment,'frank')).calibrationFacts;assert(facts.source.locked);assert.equal(facts.source.dates.calibratedAt,today);assert((await f.state()).items.find(r=>r.id==='source').selectable);
  const second=await begin('source');await save(second,{rows:[row('source','fail')]});await promote(second);
  const scrap=await choose('scrapRequest');await save(scrap,{reason:'Synthetic retirement'});await promote(scrap);
  const catalog=async()=>{const {control}=await f.json('/api/routine-equipment?catalog=effective','frank');return control.versions[0].equipment.find(r=>r.id==='source');};
  assert.equal((await catalog()).enabled,false);assert.equal((await f.json(equipment,'frank')).calibrationFacts.source.status,'retired');
  await f.restart({PIECE_CALIBRATION_ENABLED:'0',PIECE_CALIBRATION_RESET_ENABLED:'0'});await f.json(endpoint,'frank',404);assert.equal((await catalog()).enabled,false);
  await f.restart();assert.equal((await f.json(equipment,'frank')).calibrationFacts.source.status,'retired');
  const preview=await f.send('frank',{action:'resetPreview',id:null});
  await f.send('frank',{action:'reset',id:null,confirm:'RESET all',token:preview.token});
  assert.deepEqual(await methods(),[['source','內部校正'],['target','Hiệu chuẩn bên ngoài']]);
  assert.equal((await catalog()).enabled,true);assert(!(await f.json(equipment,'frank')).calibrationFacts.source.locked);
 }finally{await f.close();}
});
