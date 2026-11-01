import {env} from 'cloudflare:workers';
import {createScopedWorkflowReadPermissionPhase,type State} from './process-state';
import {decodeRecordValues,isImmutableRecordBody} from './state-records';
import {DraftConflict} from './shared-draft';

// Server-owned GET scopes only. No caller-supplied keys, projection, authority
// cache, writer capability or background integrity operation.
export type ScopedWorkflowRead='ipqc-c-workflow'|'routine-fqc';
type ReadPhase=Awaited<ReturnType<typeof createScopedWorkflowReadPermissionPhase>>;
const phases=new WeakMap<State,{request:Request;phase:ReadPhase}>();
export function scopedWorkflowPermissionPhase(request:Request,state:State):ReadPhase|null{
 const binding=phases.get(state);
 if(!binding){if(state.deliveryOnly&&state.recordStorage?.partial)throw Error('MISSING_SCOPED_READ_PERMISSION_PHASE');return null;}
 if(binding.request!==request)throw Error('SCOPED_READ_PERMISSION_REQUEST_MISMATCH');
 return binding.phase;
}
const authKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export async function readScopedWorkflowState(request:Request,scope:ScopedWorkflowRead):Promise<State|null>{
 if(scope!=='ipqc-c-workflow'&&scope!=='routine-fqc'||request.method!=='GET'||new URL(request.url).pathname!==(scope==='ipqc-c-workflow'?'/api/ipqc-c/workflow':'/api/routine-fqc'))throw Error('Invalid workflow read scope');
 const row=await env.DB.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first<{revision:number;values:string}>();
 if(!row)throw Error('Current state is missing; explicit initialization is required');
 const envelope:Parameters<typeof decodeRecordValues>[1]=JSON.parse(row.values),manifest=envelope?.__processRecords;
 // Legacy/unsupported layouts retain the original reader, including its
 // combined authority/business blob and compatibility limitations.
 if(!object(envelope)||!object(manifest)||manifest.version!==1||!object(manifest.values)||manifest.legacySources!==undefined&&!object(manifest.legacySources)||manifest.allocations!==undefined&&!object(manifest.allocations)||Object.keys(envelope).some(key=>!['__processRecords','platformUsers','maintenanceMode'].includes(key))||Object.keys(manifest).some(key=>!['version','values','legacySources','allocations'].includes(key)))return null;
 if(!Number.isSafeInteger(row.revision)||row.revision<0)throw Error('Invalid workflow state revision');
 if(envelope.platformUsers!==undefined&&typeof envelope.platformUsers!=='string'||envelope.maintenanceMode!==undefined&&typeof envelope.maintenanceMode!=='string')throw Error('Invalid workflow inline authority');
 if(envelope.platformUsers!==undefined)JSON.parse(envelope.platformUsers);if(envelope.maintenanceMode!==undefined)JSON.parse(envelope.maintenanceMode);
 const auth=await decodeRecordValues(env.STATE_ARCHIVE,envelope,{keys:authKeys,projectValue:(_key,raw)=>{
  JSON.parse(raw,(_name,value:unknown)=>{if(isImmutableRecordBody(value))throw Error('Invalid workflow authority body');return value;});return raw;
 }});
 // platformUsers is a legacy mirror, not the authority used by identity. Its
 // absence/staleness must not override the SHA-verified selected aggregate.
 const state:State={revision:row.revision,...auth,deliveryOnly:true},query=new URL(request.url).searchParams;
 const keys=scope==='ipqc-c-workflow'?(query.has('permissions')?[]:['ipqcCMasterControl']):['routineFqcEnabled','routineFqcControl','qualityMasterControl','masterDataControl'];
 const phase=await createScopedWorkflowReadPermissionPhase(request,state);
 const stale=()=>new DraftConflict(scope==='routine-fqc'?'LOGIN_REQUIRED':'FORBIDDEN',scope==='routine-fqc'?401:403);
 if(!phase.actor)throw stale();
 if(!phase.allowed(scope==='routine-fqc'?'routine.view':'ipqc-c.view'))throw new DraftConflict('FORBIDDEN',403);
 if(keys.length){
  // Fresh prebody gate is distinct from initial pure permissions and from the
  // postbody and final JSON-delivery fences. No business GET precedes this.
  if(!await phase.current())throw stale();
  const target=await decodeRecordValues(env.STATE_ARCHIVE,envelope,scope==='ipqc-c-workflow'?{
   keys,modelKey:'ipqcCMasterControl',deferDependencyHistory:true,deferHistory:true,
   caseId:query.get('caseId'),saveId:query.get('restoreSaveId'),versionId:query.get('versionId')||query.get('legacyVersionId'),
  }:{keys,deferHistory:true,deferDependencyHistory:true});
  // Existing adapters may normalize absent values, but a present required
  // aggregate with malformed JSON is not a legitimate empty module.
  for(const raw of Object.values(target.values))JSON.parse(raw);
  state.values={...auth.values,...target.values};
  state.recordStorage={...target.recordStorage,originalValues:{...state.values},known:new Set([...auth.recordStorage.known,...target.recordStorage.known]),partial:true};
  if(!await phase.current())throw stale();
 }
 phases.set(state,{request,phase});
 const required=[...authKeys,...keys];
 // No body/identity/session data. Unread references are not declared healthy;
 // the unchanged manifest/revision remains available to full integrity tools.
 console.info('[record-read-scope]',JSON.stringify({policy:scope+'-read-v1',revision:row.revision,required,unverifiedAggregates:Object.keys(manifest.values).filter(key=>!required.includes(key)).length}));
 return state;
}
