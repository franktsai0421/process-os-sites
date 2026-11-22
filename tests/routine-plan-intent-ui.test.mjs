import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture} from './fixtures/routine-fqc-durable.mjs';

void test('FQC registers before dispatch and recovers a lost retirement response after reloading the original marker',async()=>{
 const first=fixture(),remote=first.remote;
 remote.control.calendarPolicy={version:2};first.api.setData(structuredClone(remote));
 let id,status='registered',registers=0,plans=0,retires=0;
 function connect(f){
   const initial=f.box.fetch;
   f.box.fetch=async(url,options={})=>{
     if(url.startsWith('/api/routine-plan-intent')){
       if(options.method==='POST'){
         const b=JSON.parse(options.body);
         if(b.action==='register'){id=b.command.operationId;registers++;}
         else {retires++;status='retired';throw Error('lost retirement response');}
       }
       return Response.json({id,status,actorId:'owner',scope:'fqc',expectedRevision:remote.control.revision});
     }
     if(options.method==='POST'){plans++;throw Error('lost plan acknowledgement');}
     return initial(url,options);
   };
 }
 connect(first);
 await assert.rejects(first.api.postOwned({action:'create-plan',jobIds:['synthetic'],startDate:'2026-11-22',endDate:'2026-11-22',expectedRevision:remote.control.revision}));
 assert.equal(registers,1);assert.equal(plans,1);
 const recovered=fixture({store:first.store,remote});connect(recovered);
 await recovered.api.refresh(false,false);await recovered.api.act('retry');
 assert.equal(recovered.api.record().meta.operationId,id);
 recovered.api.setDialog(async()=>true);
 await recovered.api.act('recover-plan');assert(recovered.api.record());
 await recovered.api.act('recover-plan');assert.equal(recovered.api.record(),null);
 assert.equal(retires,1);assert.equal(plans,1);
});
