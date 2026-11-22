import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/routine-fqc-durable.mjs';

for(const mode of ['cancel','retire','lost','wrong actor','stale readback','other operation','missing assessment']){
 void test('FQC first-start recovery control: '+mode,async()=>{
  const f=fixture(),data=f.api.getData();
  Object.assign(data.control,{revision:0,startDate:null});data.permissions.settings=true;
  const doc=data.control.documents[0];f.api.buffer(doc).notes='synthetic unsaved input';
  f.setMode('lost');
  await assert.rejects(f.api.postOwned(mode==='other operation'?f.draft():{action:'configure',startDate:'2026-11-22',expectedRevision:0}));
  const record=f.api.record(),id=record.meta.operationId;
  await f.api.act('retry');assert(f.api.s.retry);
  let retired=false,writes=0,reads=0;
  const fetch=f.box.fetch.bind(f.box);
  f.api.setDialog(async()=>mode==='cancel'?null:{});
  f.box.fetch=async(url,o)=>{
   if(!url.startsWith('/api/routine-start-retirement'))return fetch(url,o);
   if(o.method==='POST'){
    writes++;const b=JSON.parse(o.body);assert.equal(b.operationId,id);assert.equal(b.action,'retire-first-start');
    retired=true;f.remote.control.revision=mode==='stale readback'?0:1;f.remote.revision++;
    if(mode==='lost')throw Error('synthetic lost retirement reply');
   }else reads++;
   return retired?Response.json({status:'retired',scope:'fqc',id,expectedRevision:0,fencedRevision:1,actorId:mode==='wrong actor'?'someone else':data.identity.id}):
    mode==='missing assessment'?Response.json({error:'RETIREMENT_NOT_FOUND'},{status:404}):Response.json({status:'eligible',scope:'fqc',id,expectedRevision:0,actorId:data.identity.id});
  };
  await f.api.act('retire-first-start');
  if(mode==='lost'){assert(f.api.s.retry);await f.api.act('retire-first-start');}
  assert.equal(writes,['cancel','other operation','missing assessment'].includes(mode)?0:1);
  assert.equal(reads===0,mode==='other operation');
  assert.equal(!!f.api.s.retry,!['retire','lost'].includes(mode));
  assert.equal(f.api.s.buffers.get(doc.id).notes,'synthetic unsaved input');
  assert.equal(f.posts(),1);
 });
}
