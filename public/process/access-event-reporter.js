/* Optional minimal telemetry, isolated from all business recovery stores. */
(() => {
 'use strict';
 if(window.ProcessAccessEvents)return;
 let modulePromise=null,active=null,lastStatus='not-connected',stageTail=Promise.resolve();
 const notify=value=>{lastStatus=value;window.dispatchEvent(new CustomEvent('process-access-event-report-status',{detail:{status:value}}));};
 const stagePrefix='process-access-event-stage-v2:';
 const ownerPrefix=actorId=>stagePrefix+location.origin+':'+encodeURIComponent(actorId)+':';
 const stageKey=(actorId,event)=>ownerPrefix(actorId)+event.module+':'+event.operationId+':'+event.phase;
 const actions=new Set(['begin-v1','apply','save','submit','withdraw','approve','return','restore']);
 const modules=new Set(['fqc','iqc','ipqc-c','ipqc-ab','bom','tooling','equipment','ab','c','templates','editor']);
 function minimal(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!=='action,module,occurredAt,operationId,phase'||!modules.has(value.module)||!actions.has(value.action)||!['unknown','receipt-observed'].includes(value.phase)||typeof value.operationId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(value.operationId)||!Number.isSafeInteger(value.occurredAt)||value.occurredAt<0)throw Error('INVALID_ACCESS_EVENT');
  return {module:value.module,action:value.action,operationId:value.operationId,occurredAt:value.occurredAt,phase:value.phase};
 }
 function staged(actorId){const values=[],prefix=ownerPrefix(actorId);for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(prefix)){const raw=localStorage.getItem(key);if(raw)values.push(minimal(JSON.parse(raw)));}}return values;}
 function stage(actorId,event){const key=stageKey(actorId,event);if(localStorage.getItem(key)===null&&staged(actorId).length>=100){notify('capacity');return false;}localStorage.setItem(key,JSON.stringify(event));if(staged(actorId).length>100)notify('capacity');return true;}
 function unstage(actorId,event){const key=stageKey(actorId,event);if(localStorage.getItem(key)===JSON.stringify(event))localStorage.removeItem(key);}
 function admitted(actorId,module){const sync=window.ProcessSync;return !!actorId&&!sync?.requiresReload&&sync?.identity?.id===actorId&&sync?.features?.accessEvents?.includes(module)&&!(active?.actorId===actorId&&active.features===sync.features&&active.revoked)&&!document.documentElement.hasAttribute('data-process-boot');}
 async function reporter(actorId){
  const sync=window.ProcessSync,epoch=sync?.identityGeneration?.(),owner=sync?.captureDelivery?.(),features=sync?.features;
  const current=()=>!!actorId&&sync===window.ProcessSync&&sync.features===features&&!sync.requiresReload&&sync.identity?.id===actorId&&sync.identityGeneration?.()===epoch&&(!owner||sync.isCurrentDelivery?.(owner)!==false);
  if(!current()||!window.ProcessSync?.features?.accessEvents?.length)return null;
  if(active?.actorId===actorId&&active.epoch===epoch&&active.current())return active.value;
  modulePromise||=import('./access-event-client.mjs?v=20261106-access-offline3');const {createAccessEventReporter,createAccessEventStorage}=await modulePromise;if(!current())return null;if(active?.actorId===actorId&&active.epoch===epoch&&active.current())return active.value;
  const storage=createAccessEventStorage({indexedDB,origin:location.origin,actorId,current});
  const request=async(action,body)=>{if(!current())throw Error('ACCESS_EVENT_OWNER_CHANGED');const response=await fetch('/api/access-events?action='+action,{cache:'no-store',method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});if(!current())throw Error('ACCESS_EVENT_OWNER_CHANGED');if(!response.ok)throw Error(response.status===403?'FORBIDDEN':response.status===401?'LOGIN_REQUIRED':'ACCESS_EVENT_UNAVAILABLE');return response.json();};
  const record={actorId,epoch,features,current,value:null,revoked:false};
  const value=createAccessEventReporter({current,request,storage,atomicStorage:true,bootstrapAdmitted:true,onAdmissionRevoked:()=>{record.revoked=true;},onStatus:value=>{if(current())notify(value);}});record.value=value;active=record;return value;
 }
 function deliver(actorId,epoch){
  const run=stageTail.catch(()=>{}).then(async()=>{const value=await reporter(actorId);if(!value)return;for(const event of staged(actorId)){
   if(window.ProcessSync?.identityGeneration?.()!==epoch||!admitted(actorId,event.module))break;
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
