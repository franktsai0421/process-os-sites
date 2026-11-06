import {minimalAccessObservation} from './access-event-protocol.mjs';

// Per-operation IndexedDB records use native readwrite transactions. A whole
// account snapshot cannot safely be written by two tabs at the same time.
export function createAccessEventStorage({indexedDB,origin,actorId,current}){
 const prefix=origin+'|'+actorId+'|',legacyKey=origin+'|'+actorId;
 const range=()=>IDBKeyRange.bound(prefix,prefix+'\uffff');
 const key=event=>prefix+event.module+':'+event.operationId;
 const assert=()=>{if(!current())throw Error('ACCESS_EVENT_OWNER_CHANGED');};
 let opening=null;
 function database(){
  if(opening)return opening;
  opening=new Promise((resolve,reject)=>{
   const request=indexedDB.open('process-access-event-outbox-v1',2);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('queues'))request.result.createObjectStore('queues');if(!request.result.objectStoreNames.contains('events'))request.result.createObjectStore('events');};
   request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
   request.onerror=()=>reject(Error('ACCESS_EVENT_STORAGE_UNAVAILABLE'));
   request.onblocked=()=>reject(Error('ACCESS_EVENT_STORAGE_BLOCKED'));
  }).catch(error=>{opening=null;throw error;});
  return opening;
 }
 async function transact(stores,run){
  assert();const db=await database();assert();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(stores,'readwrite');let result;
   const finish=value=>{result=value;};
   tx.oncomplete=()=>{try{assert();resolve(result);}catch(error){reject(error);}};
   tx.onerror=()=>reject(Error('ACCESS_EVENT_STORAGE_UNAVAILABLE'));
   tx.onabort=()=>reject(Error('ACCESS_EVENT_STORAGE_UNAVAILABLE'));
   try{run(tx,finish);}catch(error){tx.abort();reject(error);}
  });
 }
 function validate(value){if(!value||typeof value!=='object'||typeof value.acked!=='boolean')throw Error('ACCESS_EVENT_QUEUE_INVALID');return{event:minimalAccessObservation(value.event),acked:value.acked};}
 return async function storage(mode,input){
  if(mode==='read')return transact(['queues','events'],(tx,finish)=>{
   const events=tx.objectStore('events'),queues=tx.objectStore('queues'),old=queues.get(legacyKey);
   const complete=()=>{const all=events.getAll(range());all.onsuccess=()=>finish(all.result.map(validate));};
   old.onsuccess=()=>{
    if(old.result===undefined){complete();return;}
    if(!Array.isArray(old.result)||old.result.length>100)throw Error('ACCESS_EVENT_QUEUE_INVALID');
    const values=old.result.map(validate);let pending=values.length;
    const done=()=>{queues.delete(legacyKey);complete();};
    if(!pending){done();return;}
    for(const value of values){const existing=events.get(key(value.event));existing.onsuccess=()=>{if(!existing.result)events.put(value,key(value.event));if(!--pending)done();};}
   };
  });
  if(mode==='upsert')return transact(['events'],(tx,finish)=>{
   const events=tx.objectStore('events'),value=validate(input),id=key(value.event),existing=events.get(id);
   existing.onsuccess=()=>{
    if(existing.result){const prior=validate(existing.result);if(prior.event.action!==value.event.action)throw Error('ACCESS_EVENT_IDENTITY_CONFLICT');
     const newer=prior.event.phase==='receipt-observed'&&value.event.phase==='unknown'?prior:prior.event.phase==='unknown'&&value.event.phase==='receipt-observed'?value:prior;
     const merged={event:newer.event,acked:newer===value?value.acked:prior.acked};events.put(merged,id);finish({record:merged});return;
    }
    const count=events.count(range());count.onsuccess=()=>{if(count.result>=100){finish({capacity:true});return;}events.put(value,id);finish({record:value});};
   };
  });
  if(mode==='ack')return transact(['events'],(tx,finish)=>{
   const events=tx.objectStore('events'),event=minimalAccessObservation(input.event),id=key(event),existing=events.get(id);
   existing.onsuccess=()=>{if(!existing.result)return;const prior=validate(existing.result);if(prior.event.phase!==event.phase||prior.event.action!==event.action)return;
    if(input.verified===true){events.delete(id);finish({removed:true});}else{const next={event:prior.event,acked:true};events.put(next,id);finish({record:next});}
   };
  });
  throw Error('ACCESS_EVENT_STORAGE_MODE');
 };
}
