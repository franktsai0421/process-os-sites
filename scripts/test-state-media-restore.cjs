/* oxlint-disable typescript/no-require-imports -- Isolated production-module test. */
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const objects = new Map();let gets=0;
const load = require('./ipqc-ab-import-harness.cjs')({STATE_ARCHIVE:{async get(key){gets++;return objects.get(key)||null;}}});
const { digest,restoreMediaUpdates } = load('lib/state-media.ts');
(async()=>{
  const start=performance.now();
  const photos=Array.from({length:13},(_,i)=>'data:image/png;base64,'+Buffer.alloc(265000,i).toString('base64'));
  const ids=await Promise.all(photos.map(digest));
  const rows=photos.map((src,i)=>({id:'row-'+i,mediaItems:[{id:'photo-'+i,src}]}));
  const old=JSON.stringify({rows});
  const moved=rows.slice().reverse().map((row,i)=>({...row,mediaItems:[{...row.mediaItems[0],src:'/api/state-media?id='+ids[12-i]}]}));
  const result=await restoreMediaUpdates({workspace:JSON.stringify({rows:moved})},{workspace:old});
  const restored=JSON.parse(result.workspace);
  assert.equal(gets,0);assert.equal(restored.rows[0].mediaItems[0].src,photos[12]);assert.equal(restored.rows[12].mediaItems[0].src,photos[0]);
  const bytes=Buffer.from('brand new media');const fresh='data:image/png;base64,'+bytes.toString('base64');const id=await digest(fresh);
  objects.set('delivery/media/'+id,{arrayBuffer:async()=>bytes,httpMetadata:{contentType:'image/png'}});
  assert.equal(JSON.parse((await restoreMediaUpdates({workspace:JSON.stringify({src:'/api/state-media?id='+id})},{workspace:old})).workspace).src,fresh);
  assert.equal(gets,1);
  objects.set('delivery/media/'+id,{arrayBuffer:async()=>Buffer.from('corrupt'),httpMetadata:{contentType:'image/png'}});
  await assert.rejects(()=>restoreMediaUpdates({workspace:JSON.stringify({src:'/api/state-media?id='+id})}),/integrity/);
  await assert.rejects(()=>restoreMediaUpdates({workspace:JSON.stringify({src:'/api/state-media?id='+'f'.repeat(64)})}),/unavailable/);
  console.log(JSON.stringify({result:'PASS',bytes:Buffer.byteLength(old),media:13,reusedMediaR2Reads:0,totalR2Reads:gets,elapsedMs:Math.round(performance.now()-start),cases:['unchanged','reordered stable photo IDs','new media','corrupt media','missing media']}));
})().catch(error=>{console.error(error);process.exitCode=1;});
