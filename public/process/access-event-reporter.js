/* Optional minimal telemetry, isolated from all business recovery stores. */
(() => {
 'use strict';
 if(window.ProcessAccessEvents)return;
 let modulePromise=null,active=null,database=null,lastStatus='not-connected',stageTail=Promise.resolve();
 const notify=value=>{lastStatus=value;window.dispatchEvent(new CustomEvent('process-access-event-report-status',{detail:{status:value}}));};
 const stagePrefix='process-access-event-stage-v1:';
 const stageKey=actorId=>stagePrefix+location.origin+':'+actorId;
 const actions=new Set(['begin-v1','apply','save','submit','withdraw','approve','return','restore']);
 const modules=new Set(['fqc','iqc','ipqc-c','ipqc-ab','bom','tooling','equipment','ab','c','templates','editor']);
 function minimal(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!=='action,module,occurredAt,operationId,phase'||!modules.has(value.module)||!actions.has(value.action)||!['unknown','receipt-observed'].includes(value.phase)||typeof value.operationId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(value.operationId)||!Number.isSafeInteger(value.occurredAt)||value.occurredAt<0)throw Error('INVALID_ACCESS_EVENT');
  return {module:value.module,action:value.action,operationId:value.operationId,occurredAt:value.occurredAt,phase:value.phase};
 }
 function staged(actorId){const raw=localStorage.getItem(stageKey(actorId));if(!raw)return[];const values=JSON.parse(raw);if(!Array.isArray(values)||values.length>100)throw Error('ACCESS_EVENT_STAGE_INVALID');return values.map(minimal);}
 function stage(actorId,event){const values=staged(actorId),id=value=>value.module+':'+value.operationId+':'+value.phase,index=values.findIndex(value=>id(value)===id(event));if(index<0&&values.length>=100){notify('capacity');return false;}if(index<0)values.push(event);else values[index]=event;localStorage.setItem(stageKey(actorId),JSON.stringify(values));return true;}
 function unstage(actorId,event){const values=staged(actorId),id=value=>value.module+':'+value.operationId+':'+value.phase;const next=values.filter(value=>id(value)!==id(event)||JSON.stringify(value)!==JSON.stringify(event));if(next.length===values.length)return;if(next.length)localStorage.setItem(stageKey(actorId),JSON.stringify(next));else localStorage.removeItem(stageKey(actorId));}
 function admitted(actorId,module){const sync=window.ProcessSync;return !!actorId&&!sync?.requiresReload&&sync?.identity?.id===actorId&&sync?.features?.accessEvents?.includes(module)&&!document.documentElement.hasAttribute('data-process-boot');}
 function db(){return database||(database=new Promise((resolve,reject)=>{const request=indexedDB.open('process-access-event-outbox-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('queues');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('ACCESS_EVENT_STORAGE_UNAVAILABLE'));}));}
 async function reporter(actorId){
  const sync=window.ProcessSync,epoch=sync?.identityGeneration?.(),owner=sync?.captureDelivery?.();
  const current=()=>!!actorId&&sync===window.ProcessSync&&!sync.requiresReload&&sync.identity?.id===actorId&&sync.identityGeneration?.()===epoch&&(!owner||sync.isCurrentDelivery?.(owner)!==false);
  if(!current()||!window.ProcessSync?.features?.accessEvents?.length)return null;
  if(active?.actorId===actorId&&active.epoch===epoch&&active.current())return active.value;
  modulePromise||=import('./access-event-client.mjs?v=20261106-access-offline1');const {createAccessEventReporter}=await modulePromise;if(!current())return null;if(active?.actorId===actorId&&active.epoch===epoch&&active.current())return active.value;
  const key=location.origin+'|'+actorId;
  const storage=async(mode,value)=>{if(!current())throw Error('ACCESS_EVENT_OWNER_CHANGED');const database=await db();if(!current())throw Error('ACCESS_EVENT_OWNER_CHANGED');return new Promise((resolve,reject)=>{const tx=database.transaction('queues',mode==='read'?'readonly':'readwrite'),store=tx.objectStore('queues'),request=mode==='read'?store.get(key):store.put(value,key);let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(Error('ACCESS_EVENT_STORAGE_UNAVAILABLE'));tx.onabort=()=>reject(Error('ACCESS_EVENT_STORAGE_UNAVAILABLE'));});};
  const request=async(action,body)=>{if(!current())throw Error('ACCESS_EVENT_OWNER_CHANGED');const response=await fetch('/api/access-events?action='+action,{cache:'no-store',method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});if(!current())throw Error('ACCESS_EVENT_OWNER_CHANGED');if(!response.ok)throw Error(response.status===403?'FORBIDDEN':response.status===401?'LOGIN_REQUIRED':'ACCESS_EVENT_UNAVAILABLE');return response.json();};
  const value=createAccessEventReporter({current,request,storage,bootstrapAdmitted:true,onStatus:value=>{if(current())notify(value);}});active={actorId,epoch,current,value};return value;
 }
 function deliver(actorId,epoch){
  const run=stageTail.catch(()=>{}).then(async()=>{const value=await reporter(actorId);if(!value)return;for(const event of staged(actorId)){
   if(window.ProcessSync?.identityGeneration?.()!==epoch||!admitted(actorId,event.module))return;
   if(await value.observe(event)!==false)unstage(actorId,event);
  }await value.flush();});stageTail=run;
  void run.catch(()=>{if(window.ProcessSync?.identity?.id===actorId&&window.ProcessSync?.identityGeneration?.()===epoch)notify('storage-or-source-failed');});
 }
 window.ProcessAccessEvents={
  observe(input){
   // Copy scalars before the asynchronous boundary. Never retain a command,
   // response/error object, form, photo, endpoint query or workflow snapshot.
   const actorId=input.actorId,epoch=window.ProcessSync?.identityGeneration?.();let event;
   try{event=minimal({module:input.module,action:input.action,operationId:input.operationId,occurredAt:input.occurredAt,phase:input.phase});if(!admitted(actorId,event.module))return;if(stage(actorId,event))deliver(actorId,epoch);}catch{if(admitted(actorId,input.module))notify('storage-or-source-failed');}
  },
  status:()=>lastStatus,
  flush(){const actorId=window.ProcessSync?.identity?.id;if(actorId)deliver(actorId,window.ProcessSync.identityGeneration());}
 };
 function resume(){const actorId=window.ProcessSync?.identity?.id;if(!actorId||window.ProcessSync?.requiresReload||document.documentElement.hasAttribute('data-process-boot'))return;deliver(actorId,window.ProcessSync.identityGeneration());}
 window.addEventListener('online',resume);window.addEventListener('process-ui-ready',resume);setTimeout(resume,0);
})();
