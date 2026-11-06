// Test-only reader. Never creates/upgrades the product outbox, even when blocked.
// Serializable as a standalone browser function for Playwright page.evaluate.
export function readAccessEventOutbox({mode='count',actorId='frank',timeoutMs=5000}={}){
 return new Promise((resolve,reject)=>{
  if(!['count','all'].includes(mode)||typeof actorId!=='string'||!actorId||!Number.isSafeInteger(timeoutMs)||timeoutMs<1){reject(Error('OUTBOX_PROBE_OPTIONS'));return;}
  let db,tx,value,settled=false,upgrading=false;
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);if(error&&tx)try{tx.abort();}catch{}db?.close();if(error)reject(error);else resolve(result);};
  const timer=setTimeout(()=>finish(Error('OUTBOX_PROBE_TIMEOUT')),timeoutMs);
  try{
   const request=indexedDB.open('process-access-event-outbox-v1',2);
   request.onupgradeneeded=()=>{upgrading=true;try{db=request.result;request.transaction.abort();}catch{finish(Error('OUTBOX_PROBE_UPGRADE_ABORT_FAILED'));}finally{db?.close();}};
   request.onerror=()=>finish(Error(upgrading?'OUTBOX_NOT_INITIALIZED':'OUTBOX_OPEN_FAILED'));
   request.onblocked=()=>finish(Error('OUTBOX_OPEN_BLOCKED'));
   request.onsuccess=()=>{
    db=request.result;if(settled){db.close();return;}
    try{
     if(db.version!==2||!db.objectStoreNames.contains('events')||!db.objectStoreNames.contains('queues')){finish(Error('OUTBOX_SCHEMA_MISSING'));return;}
     tx=db.transaction('events','readonly');tx.oncomplete=()=>finish(null,value);tx.onerror=()=>finish(Error('OUTBOX_PROBE_FAILED'));tx.onabort=()=>finish(Error('OUTBOX_PROBE_ABORTED'));
     const prefix=location.origin+'|'+actorId+'|',range=IDBKeyRange.bound(prefix,prefix+'\uffff'),store=tx.objectStore('events'),query=mode==='all'?store.getAll(range):store.count(range);
     query.onsuccess=()=>{value=query.result;};query.onerror=()=>finish(Error('OUTBOX_PROBE_FAILED'));
    }catch(error){finish(error);}
   };
  }catch(error){finish(error);}
 });
}
