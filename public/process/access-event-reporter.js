/* Optional minimal telemetry, isolated from all business recovery stores. */
(() => {
 'use strict';
 if(window.ProcessAccessEvents)return;
 let modulePromise=null,active=null,database=null,lastStatus='not-connected';
 const notify=value=>{lastStatus=value;window.dispatchEvent(new CustomEvent('process-access-event-report-status',{detail:{status:value}}));};
 function db(){return database||(database=new Promise((resolve,reject)=>{const request=indexedDB.open('process-access-event-outbox-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('queues');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('ACCESS_EVENT_STORAGE_UNAVAILABLE'));}));}
 async function reporter(actorId){
  const sync=window.ProcessSync,epoch=sync?.identityGeneration?.(),owner=sync?.captureDelivery?.();
  const current=()=>!!actorId&&sync===window.ProcessSync&&!sync.requiresReload&&sync.identity?.id===actorId&&sync.identityGeneration?.()===epoch&&(!owner||sync.isCurrentDelivery?.(owner)!==false);
  if(!current())return null;
  if(active?.actorId===actorId&&active.epoch===epoch&&active.current())return active.value;
  modulePromise||=import('./access-event-client.mjs?v=20261105-events1');const {createAccessEventReporter}=await modulePromise;if(!current())return null;if(active?.actorId===actorId&&active.epoch===epoch&&active.current())return active.value;
  const key=location.origin+'|'+actorId;
  const storage=async(mode,value)=>{if(!current())throw Error('ACCESS_EVENT_OWNER_CHANGED');const database=await db();if(!current())throw Error('ACCESS_EVENT_OWNER_CHANGED');return new Promise((resolve,reject)=>{const tx=database.transaction('queues',mode==='read'?'readonly':'readwrite'),store=tx.objectStore('queues'),request=mode==='read'?store.get(key):store.put(value,key);let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(Error('ACCESS_EVENT_STORAGE_UNAVAILABLE'));tx.onabort=()=>reject(Error('ACCESS_EVENT_STORAGE_UNAVAILABLE'));});};
  const request=async(action,body)=>{if(!current())throw Error('ACCESS_EVENT_OWNER_CHANGED');const response=await fetch('/api/access-events?action='+action,{cache:'no-store',method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});if(!current())throw Error('ACCESS_EVENT_OWNER_CHANGED');if(!response.ok)throw Error(response.status===403?'FORBIDDEN':response.status===401?'LOGIN_REQUIRED':'ACCESS_EVENT_UNAVAILABLE');return response.json();};
  const value=createAccessEventReporter({current,request,storage,onStatus:notify});active={actorId,epoch,current,value};return value;
 }
 window.ProcessAccessEvents={
  observe(input){
   // Copy scalars before the asynchronous boundary. Never retain a command,
   // response/error object, form, photo, endpoint query or workflow snapshot.
   const event={module:input.module,action:input.action,operationId:input.operationId,occurredAt:input.occurredAt,phase:input.phase},actorId=input.actorId;
   void reporter(actorId).then(value=>value?.observe(event)).catch(()=>notify('storage-or-source-failed'));
  },
  status:()=>lastStatus,
  flush(){if(active?.current())void active.value.flush().catch(()=>notify('storage-or-source-failed'));}
 };
 function resume(){const actorId=window.ProcessSync?.identity?.id;if(!actorId||window.ProcessSync?.requiresReload||document.documentElement.hasAttribute('data-process-boot'))return;void reporter(actorId).then(value=>value?.flush()).catch(()=>notify('storage-or-source-failed'));}
 window.addEventListener('online',resume);window.addEventListener('process-ui-ready',resume);setTimeout(resume,0);
})();
