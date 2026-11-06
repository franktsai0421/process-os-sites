import {minimalAccessObservation} from './access-event-protocol.mjs';
export {createAccessEventStorage} from './access-event-storage.mjs';

// Own reporting queue only. It has no capability to settle a business operation.
export function createAccessEventReporter({current,request,storage,atomicStorage=false,bootstrapAdmitted=false,onStatus=()=>{},onAdmissionRevoked=()=>{}}) {
  // A successful actor-fenced bootstrap can admit this document's collection.
  // It is never persisted as a future-session permission or send authority.
  const entries=new Map(),dirty=new Set();let loaded=false,tail=Promise.resolve(),admitted=bootstrapAdmitted,volatilePending=false,revoked=false,revokedStatus='permission-denied';
  const key=event=>event.module+':'+event.operationId;
  const assert=()=>{if(!current())throw Error('ACCESS_EVENT_OWNER_CHANGED');};
  const serial=run=>{const task=tail.catch(()=>{}).then(run);tail=task;return task;};
  async function load(){assert();if(loaded)return;const values=await storage('read');assert();if(values!==undefined&&(!Array.isArray(values)||values.length>100))throw Error('ACCESS_EVENT_QUEUE_INVALID');for(const value of values||[]){const event=minimalAccessObservation(value.event);if(typeof value.acked!=='boolean')throw Error('ACCESS_EVENT_QUEUE_INVALID');entries.set(key(event),{event,acked:value.acked});}loaded=true;}
  // Another tab may have saved a report after this reporter first loaded. Read
  // the shared atomic records again on reconnect, retaining only this tab's
  // genuinely unpersisted observations over the new snapshot.
  async function refresh(){
    if(!atomicStorage)return;assert();const values=await storage('read');assert();if(!Array.isArray(values)||values.length>100)throw Error('ACCESS_EVENT_QUEUE_INVALID');
    const next=new Map();for(const value of values){const event=minimalAccessObservation(value.event);if(typeof value.acked!=='boolean')throw Error('ACCESS_EVENT_QUEUE_INVALID');next.set(key(event),{event,acked:value.acked});}
    for(const id of dirty){const local=entries.get(id),shared=next.get(id);if(!local){dirty.delete(id);continue;}
      if(shared&&(shared.event.phase==='receipt-observed'&&local.event.phase==='unknown'||shared.event.phase===local.event.phase&&shared.acked)){dirty.delete(id);continue;}
      next.set(id,local);
    }
    entries.clear();for(const [id,value] of next)entries.set(id,value);volatilePending=dirty.size>0;
  }
  const persist=async()=>{assert();if(atomicStorage){for(const id of dirty){const result=await storage('upsert',entries.get(id));assert();if(result.capacity===true){onStatus('capacity');return false;}dirty.delete(id);}volatilePending=false;return true;}await storage('write',[...entries.values()].map(value=>({event:{...value.event},acked:value.acked})));assert();dirty.clear();volatilePending=false;return true;};
  function revoke(status){if(!revoked){revoked=true;admitted=false;revokedStatus=status;for(const id of dirty)entries.delete(id);dirty.clear();volatilePending=false;onAdmissionRevoked(status);}onStatus(revokedStatus);}
  async function sync(){
    assert();let capability;
    try{capability=await request('capabilities');assert();}
    catch(error){if(current()){const denied=['FORBIDDEN','LOGIN_REQUIRED'].includes(error?.message);if(denied)revoke('permission-denied');else{if(admitted)await persist();onStatus(revoked?revokedStatus:volatilePending?'volatile-pending':'offline');}}return;}
    if(capability.enabled!==true){revoke(capability.reason==='RETENTION_POLICY_REQUIRED'?'policy-required':'not-enabled');return;}
    if(!revoked)admitted=true;await refresh();if(!await persist())return;
    for(const [id,value] of entries){
      assert();if(value.acked||!capability.modules?.includes(value.event.module))continue;
      try{
        const result=await request('observe',{...value.event});assert();
        if(result.received!==true)throw Error('ACCESS_EVENT_NOT_ACKNOWLEDGED');
        if(atomicStorage)await storage('ack',{event:value.event,verified:result.verified===true});
        if(result.verified===true)entries.delete(id);else value.acked=true;
        if(!atomicStorage)await persist();
      }catch(error){if(current()){if(['FORBIDDEN','LOGIN_REQUIRED'].includes(error?.message))revoke('permission-denied');else onStatus(revoked?revokedStatus:'sync-failed');}return;}
    }
    onStatus(revoked?revokedStatus:[...entries.values()].some(value=>!value.acked)?'permission-denied':entries.size?'received-unknown':'received');
  }
  return {
    observe(input){return serial(async()=>{if(revoked){onStatus(revokedStatus);return false;}await load();const event=minimalAccessObservation(input),id=key(event),previous=entries.get(id);if(event.phase==='receipt-observed'&&!previous)return true;if(!previous&&entries.size>=100){onStatus('capacity');return false;}entries.set(id,{event,acked:false});dirty.add(id);volatilePending=true;const durable=bootstrapAdmitted;if(durable&&!await persist())return false;await sync();return durable||admitted;});},
    flush(){return serial(async()=>{await load();await sync();});}
  };
}
