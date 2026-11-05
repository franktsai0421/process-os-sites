import {minimalAccessObservation} from './access-event-protocol.mjs';

// Own reporting queue only. It has no capability to settle a business operation.
export function createAccessEventReporter({current,request,storage,onStatus=()=>{}}) {
  const entries=new Map();let loaded=false,tail=Promise.resolve(),admitted=false;
  const key=event=>event.module+':'+event.operationId;
  const assert=()=>{if(!current())throw Error('ACCESS_EVENT_OWNER_CHANGED');};
  const serial=run=>{const task=tail.catch(()=>{}).then(run);tail=task;return task;};
  async function load(){assert();if(loaded)return;const values=await storage('read');assert();if(values!==undefined&&(!Array.isArray(values)||values.length>100))throw Error('ACCESS_EVENT_QUEUE_INVALID');for(const value of values||[]){const event=minimalAccessObservation(value.event);if(typeof value.acked!=='boolean')throw Error('ACCESS_EVENT_QUEUE_INVALID');entries.set(key(event),{event,acked:value.acked});}loaded=true;}
  const persist=async()=>{assert();await storage('write',[...entries.values()].map(value=>({event:{...value.event},acked:value.acked})));assert();};
  async function sync(){
    assert();let capability;
    try{capability=await request('capabilities');assert();}
    catch(error){if(current()){if(admitted)await persist();onStatus(['FORBIDDEN','LOGIN_REQUIRED'].includes(error?.message)?'permission-denied':'offline');}return;}
    if(capability.enabled!==true){onStatus(capability.reason==='RETENTION_POLICY_REQUIRED'?'policy-required':'not-enabled');return;}
    admitted=true;await persist();
    for(const [id,value] of entries){
      assert();if(value.acked||!capability.modules?.includes(value.event.module))continue;
      try{
        const result=await request('observe',{...value.event});assert();
        if(result.received!==true)throw Error('ACCESS_EVENT_NOT_ACKNOWLEDGED');
        if(result.verified===true)entries.delete(id);else value.acked=true;
        await persist();
      }catch(error){if(current())onStatus(error?.message==='FORBIDDEN'?'permission-denied':'sync-failed');return;}
    }
    onStatus([...entries.values()].some(value=>!value.acked)?'permission-denied':entries.size?'received-unknown':'received');
  }
  return {
    observe(input){return serial(async()=>{await load();const event=minimalAccessObservation(input),id=key(event),previous=entries.get(id);if(event.phase==='receipt-observed'&&!previous)return;if(!previous&&entries.size>=100){onStatus('capacity');return;}entries.set(id,{event,acked:false});await sync();});},
    flush(){return serial(async()=>{await load();await sync();});}
  };
}
