// Existing records-v1 storage format. Immutable snapshot bodies are separate
// from live aggregates; workflow requests need not reconstruct old history.
import {effectiveDeliveryValue} from './effective-delivery.mjs';
type Bucket={get(key:string):Promise<{text():Promise<string>;size?:number;body?:{cancel():Promise<unknown>}}|null>;put(key:string,value:string,options?:{httpMetadata:{contentType:string}}):Promise<unknown>};
type Ref={key:string;sha256:string};
export type AllocationIndex={version:1;errors:Record<string,string>[];items:Record<string,string>[];equipment:{assetCode:string;pieceMark:string}[];categories:{code:string}[]};
type Envelope={__processRecords:{version:1;values:Record<string,Ref>;legacySources?:Record<string,Ref>;allocations?:Record<string,Ref>};platformUsers?:string;maintenanceMode?:string};
export type RecordStorage={envelope:Envelope;originalValues:Record<string,string>;known:Set<string>;partial:boolean;models:Map<string,unknown>;allocations:Map<string,AllocationIndex>};
export type RecordRead={deferHistory?:boolean;caseId?:string|null;saveId?:string|null;versionId?:string|null;keys?:string[];modelKey?:string;
 // Server-owned, read-only projection after aggregate SHA verification, before
 // body hydration. It is never accepted from HTTP input or a write adapter.
 projectValue?:(key:string,raw:string)=>string|undefined|Promise<string|undefined>;
 // Read-only delivery projection. Never use as a write/backup baseline. Dedicated
 // workflow and history routes retain the complete original decoding contract.
 effectiveOnly?:boolean;
 // Workflow adapters consume dependencies' effective/open content, not legacy
 // historical parsers. Opt-in only; ordinary/public reads retain their contract.
 deferDependencyHistory?:boolean;allocationKey?:string;
 // Opaque server-created request token; never supplied by HTTP or a write path.
 identityReadToken?:object};
const prefix='state-records/v1/',encoder=new TextEncoder();
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const valid=(r:unknown):r is Ref=>object(r)&&typeof r.sha256==='string'&&/^[a-f0-9]{64}$/.test(r.sha256)&&r.key===prefix+r.sha256+'.json';
const reference=(v:unknown):v is {__immutableBody:Ref}=>object(v)&&Object.keys(v).length===1&&valid(v.__immutableBody);
// Only prepared models produced by this decoder may pass these references to
// adapters. Raw/client payloads must still undergo their ordinary validation.
export const isImmutableRecordBody=reference;
async function read(bucket:Bucket,ref:Ref){if(!valid(ref))throw Error('Invalid immutable record reference');const object=await bucket.get(ref.key);if(!object)throw Error('Immutable record missing');const raw=await object.text();if(await hash(raw)!==ref.sha256)throw Error('Immutable record corrupt');return raw;}
export const readImmutableRecord=read;
// A bootstrap may reuse only previously SHA-verified raw identity aggregates
// between its first and selected reads. No parsed objects or authority results
// are cached; its final read MUST omit the token and reread storage independently.
const identityReadKeys=new Set(['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']);
type IdentityReadContext={revision:number|null;manifest:string;bucket:Bucket|null;phase:'collect'|'reuse'|'disabled';raws:Map<string,string>};
const identityReadContexts=new WeakMap<object,IdentityReadContext>();
export function createIdentityReadToken(){const token=Object.freeze({});identityReadContexts.set(token,{revision:null,manifest:'',bucket:null,phase:'collect',raws:new Map()});return token;}
export function pinIdentityReadToken(token:object|undefined,revision:number,manifest:string,bucket:Bucket){
 const c=token&&identityReadContexts.get(token);if(!c)return;
 if(c.revision!==null&&(c.revision!==revision||c.manifest!==manifest||c.bucket!==bucket)){c.raws.clear();c.phase='disabled';}
 c.revision=revision;c.manifest=manifest;c.bucket=bucket;
}
export function allowIdentityReadReuse(token:object){
 const c=identityReadContexts.get(token);if(!c||c.phase!=='collect')return false;
 // Identity-only destinations have no other media/BOM dependencies. Opt out if
 // these raw values could introduce deferred-media I/O before the final fence.
 try{const override=JSON.parse(c.manifest).maintenanceMode;for(const raw of [...c.raws.values(),...(override===undefined?[]:[override])]){const normalized=JSON.stringify(JSON.parse(raw));if(/data:(?:image|video)\//.test(normalized)||normalized.includes('"__immutableBody"'))throw Error('NOT_REUSABLE');}}catch{c.raws.clear();c.phase='disabled';return false;}
 c.phase='reuse';return true;
}
async function readIdentityAggregate(bucket:Bucket,key:string,ref:Ref,token?:object){
 if(!valid(ref))throw Error('Invalid immutable record reference');
 const c=token&&identityReadContexts.get(token),name=key+'\0'+ref.key+'\0'+ref.sha256;
 if(c?.phase==='reuse'&&c.bucket===bucket&&identityReadKeys.has(key)&&c.raws.has(name))return c.raws.get(name)!;
 const raw=await read(bucket,ref);
 if(c?.phase==='collect'&&c.bucket===bucket&&identityReadKeys.has(key)){
  // Bound retained strings by UTF-16 code units, not UTF-8 bytes.
  if(raw.length>262144){c.raws.clear();c.phase='disabled';}else c.raws.set(name,raw);
 }
 return raw;
}
const allocationKeys=new Set(['qualityMasterControl','ipqcABMasterControl','ipqcCMasterControl','routineEquipmentControl']);
function checkedAllocation(value:unknown):AllocationIndex{
 if(!object(value)||value.version!==1||!['errors','items','equipment','categories'].every(k=>Array.isArray(value[k])&&(value[k] as unknown[]).every(row=>object(row)&&Object.values(row).every(v=>typeof v==='string'))))throw Error('Invalid allocation index');
 return value as AllocationIndex;
}
// Derived, immutable storage metadata. It is not a business snapshot or a new
// saved draft. Keep every historical/reserved number without loading photo/text
// bodies for each allocation. Original JSON remains in legacySources unchanged.
function allocationIndex(value:unknown,previous?:AllocationIndex):AllocationIndex{
 const result:AllocationIndex={version:1,errors:[],items:[],equipment:[],categories:[]},sets=new Map<string,Set<string>>();
 const add=(kind:keyof Omit<AllocationIndex,'version'>,row:Record<string,string>)=>{const key=JSON.stringify(row),seen=sets.get(kind)||new Set<string>();sets.set(kind,seen);if(!seen.has(key)){seen.add(key);(result[kind] as Record<string,string>[]).push(row);}};
 if(previous)for(const kind of ['errors','items','equipment','categories'] as const)for(const row of previous[kind])add(kind,row);
 function visit(v:unknown){if(reference(v))return;if(Array.isArray(v)){for(const item of v)visit(item);return;}if(!object(v))return;
  for(const [key,child]of Object.entries(v)){
   if(['errors','items','equipment','categories'].includes(key)&&Array.isArray(child))for(const row of child.filter(object)){
    const names=key==='equipment'?['assetCode','pieceMark']:key==='categories'?['code']:key==='errors'?['id','code','category','line']:['code','checkNo','errorId'];
    const projected=Object.fromEntries(names.filter(name=>typeof row[name]==='string').map(name=>[name,row[name] as string]));
    if(key==='equipment'?!!projected.assetCode&&!!projected.pieceMark:!!projected.code||!!projected.checkNo)add(key as keyof Omit<AllocationIndex,'version'>,projected);
   }
   if(key==='groups'&&Array.isArray(child))for(const group of child.filter(object))if(typeof group.categoryCode==='string'&&group.categoryCode)add('categories',{code:group.categoryCode});
   visit(child);
  }
 }visit(value);return result;
}
export async function encodeRecordValues(bucket:Bucket,values:Record<string,string>,previous?:RecordStorage,updatedModels?:Map<string,unknown>){
 if(previous?.partial)throw Error('Partial read cannot be saved');
 return encodeRecordValuesCore(bucket,values,previous,updatedModels);
}
// First master-workflow adoption keeps every pre-write legacy value verbatim
// in the existing legacySources archive, alongside the new current projection.
// It creates immutable objects only; the caller must publish with its usual CAS.
export async function initializeRecordValues(bucket:Bucket,values:Record<string,string>,originalValues:Record<string,string>){
 if(Object.keys(originalValues).some(key=>!Object.hasOwn(values,key)))throw Error('Initial record adoption cannot drop legacy keys');
 return encodeRecordValuesCore(bucket,values,undefined,undefined,originalValues);
}
// Private encoding primitive. The ordinary writer above always rejects partial
// state; the FQC overlay below supplies a server-issued, single-target handle.
async function encodeRecordValuesCore(bucket:Bucket,values:Record<string,string>,previous?:RecordStorage,updatedModels?:Map<string,unknown>,initialSources?:Record<string,string>){
 const refs:Record<string,Ref>={},allocations:Record<string,Ref>={...previous?.envelope.__processRecords.allocations},legacySources:Record<string,Ref>=previous?.envelope.__processRecords.legacySources||{},written=new Set<string>(),known=new Set(previous?.known||[]);
 const put=async(raw:string)=>{const sha256=await hash(raw),ref={key:prefix+sha256+'.json',sha256};if(!written.has(sha256)&&!known.has(sha256)){await bucket.put(ref.key,raw,{httpMetadata:{contentType:'application/json'}});written.add(sha256);}return ref;};
 const bodies=new WeakMap<object,Ref>();
 const putBody=async(value:object)=>{let ref=bodies.get(value);if(!ref){ref=await put(JSON.stringify(value));bodies.set(value,ref);}return ref;};
 let replaced=false;
 async function visit(v:unknown,parent='',equipmentModule=false):Promise<unknown>{
  if(reference(v)){if(!known.has(v.__immutableBody.sha256))throw Error('Untrusted immutable record reference');return v;}
  if(Array.isArray(v)){const next=[];for(const item of v)next.push(await visit(item,parent==='versions'?'equipment-version':'',equipmentModule));return next;}
  if(object(v)){const next:Record<string,unknown>={};for(const [k,value]of Object.entries(v)){
    // All snapshots are immutable objects; their selection is handled on read.
    if(k==='active'&&Array.isArray(v.versions)&&value&&typeof value==='object'){
      const active:Record<string,unknown>={};for(const [scope,content]of Object.entries(value)){if(reference(content)){if(!known.has(content.__immutableBody.sha256))throw Error('Untrusted immutable record reference');active[scope]=content;}else {replaced=true;active[scope]={__immutableBody:await putBody(content as object)};}}next[k]=active;
    }else if((['snapshot','content','before','working'].includes(k)||equipmentModule&&parent==='equipment-version'&&['equipment','groups','categories','subcategories','issues'].includes(k))&&value&&typeof value==='object'){
      if(reference(value)){if(!known.has(value.__immutableBody.sha256))throw Error('Untrusted immutable record reference');next[k]=value;}
      else {replaced=true;next[k]={__immutableBody:await putBody(value)};}
    }else next[k]=await visit(value,k,equipmentModule);
   }return next;
  }return v;
 }
 for(const [key,value]of Object.entries(values)){
  if(!updatedModels?.has(key)&&previous?.originalValues[key]===value){refs[key]=previous.envelope.__processRecords.values[key];continue;}
  if(typeof value!=='string')throw Error('Invalid shared-state value');
  if(!previous)legacySources[key]=await put(initialSources?.[key]??value);
  // Trusted request-local models avoid expanding all live aliases into a JSON
  // string and parsing independent copies immediately before record encoding.
  const parsed=updatedModels?.has(key)?updatedModels.get(key):JSON.parse(value);
  if(allocationKeys.has(key)){
   const priorRef=allocations[key],prior=previous?.allocations.get(key)||(priorRef?checkedAllocation(JSON.parse(await read(bucket,priorRef))):undefined);
   if(priorRef)known.add(priorRef.sha256);
   // Older records manifests have no index. Do not manufacture a partial index
   // from a deferred model; allocation requests use full-history compatibility.
   const hasDeferred=(v:unknown):boolean=>reference(v)||Array.isArray(v)&&v.some(hasDeferred)||object(v)&&Object.values(v).some(hasDeferred);
   const deferred=hasDeferred(parsed);
   if(prior||!deferred)allocations[key]=await put(JSON.stringify(allocationIndex(parsed,prior)));
  }
  replaced=false;const compact=await visit(parsed,'',key==='routineEquipmentControl'),serialized=JSON.stringify(compact);refs[key]=await put(!replaced&&!updatedModels?.has(key)?value:serialized);
 }
 return JSON.stringify({__processRecords:{version:1,values:refs,legacySources,...(Object.keys(allocations).length?{allocations}:{})},platformUsers:values.platformUsers,...(values.maintenanceMode!==undefined?{maintenanceMode:values.maintenanceMode}:{})});
}
export async function decodeRecordValues(bucket:Bucket,envelope:Envelope,options:RecordRead={}){
 return decodeRecordValuesCore(bucket,envelope,options);
}
// Only the dedicated FQC mutation reader may supply a body hydration boundary.
async function decodeRecordValuesCore(bucket:Bucket,envelope:Envelope,options:RecordRead={},bodyKeys?:ReadonlySet<string>){
 if(envelope.__processRecords?.version!==1||!envelope.__processRecords.values||Array.isArray(envelope.__processRecords.values))throw Error('Invalid record manifest');
 const values:Record<string,string>={},known=new Set<string>(),cache=new Map<string,unknown>(),models=new Map<string,unknown>(),allocations=new Map<string,AllocationIndex>();
 const allocationRef=options.allocationKey?envelope.__processRecords.allocations?.[options.allocationKey]:null;
 if(allocationRef){known.add(allocationRef.sha256);allocations.set(options.allocationKey!,checkedAllocation(JSON.parse(await read(bucket,allocationRef))));}
 // These legacy parsers validate/normalize every version snapshot. Keep those
 // snapshots hydrated until their adapters support trusted lazy projections;
 // never skip their validation merely to report lower memory consumption.
 const fullVersionReaders=new Set(['qualityMasterControl','iqcMasterControl','ipqcCMasterControl','ipqcABMasterControl','routineEquipmentControl']);
 let deferVersions=true;
 async function body(ref:Ref){known.add(ref.sha256);if(!cache.has(ref.sha256))cache.set(ref.sha256,JSON.parse(await read(bucket,ref)));return cache.get(ref.sha256);}
 async function visit(v:unknown,parent='',activeIds:string[]=[],inheritedDeferred=false):Promise<unknown>{
  if(reference(v)){if(inheritedDeferred){known.add(v.__immutableBody.sha256);return v;}return body(v.__immutableBody);}
  if(Array.isArray(v)){const next=[];for(const item of v){if(!object(item)){next.push(item);continue;}
     const row={...item},deferred=inheritedDeferred||options.deferHistory&&(
      parent==='versions'&&deferVersions&&!['draft','pending','pending-test'].includes(typeof row.status==='string'?row.status:'')&&!activeIds.includes(typeof row.id==='string'?row.id:'')&&row.id!==options.versionId||
      parent==='cases'&&row.status!=='pending'&&row.id!==options.caseId||
      parent==='saves'&&row.id!==options.saveId);
    for(const key of Object.keys(row))if(reference(row[key])){known.add(row[key].__immutableBody.sha256);if(!deferred)row[key]=await body(row[key].__immutableBody);}else row[key]=await visit(row[key],key,activeIds,!!deferred);
    next.push(row);
   }return next;}
  if(object(v)){const next:Record<string,unknown>={},active=object(v.active)?v.active:{},ids=typeof v.activeVersionId==='string'?[v.activeVersionId]:Array.isArray(v.versions)&&v.active?v.versions.filter(object).filter(row=>{const source=typeof row.scope==='string'?active[row.scope]:null;return reference(row.snapshot)&&reference(source)&&row.snapshot.__immutableBody.sha256===source.__immutableBody.sha256;}).map(row=>typeof row.id==='string'?row.id:''):activeIds;
   // Legacy readers still consume version snapshots directly. Only adopted
   // scopes have the authorized on-demand history endpoint needed for laziness.
    if(Array.isArray(v.versions))for(const row of v.versions.filter(object)){
    const adopted=!!v.workflow||(typeof row.scope==='string'&&object(v.workflowScopes)&&!!v.workflowScopes[row.scope]);
    if(!adopted&&typeof row.id==='string'&&!ids.includes(row.id))ids.push(row.id);
   }
    for(const [key,value]of Object.entries(v))next[key]=await visit(value,key,ids,inheritedDeferred);
    return next;}return v;
 }
 // Prefetch only adjacent selected identity aggregates, never token reads.
 // GET metadata may overlap; speculative text/SHA is limited to two provider-
 // sized objects <=256KiB each. Large/unknown sizes consume text in old order.
 const entries=Object.entries(envelope.__processRecords.values).filter(([key])=>!options.keys||options.keys.includes(key));
 type StoredObject=Awaited<ReturnType<Bucket['get']>>;
 type Outcome<T>={ok:true;value:T}|{ok:false;error:unknown};
 const settle=<T,>(promise:Promise<T>):Promise<Outcome<T>>=>promise.then(value=>({ok:true,value}),error=>({ok:false,error}));
 const unwrap=<T,>(result:Outcome<T>):T=>{if(!result.ok)throw result.error;return result.value;};
 const small=(value:StoredObject)=>!!value&&Number.isSafeInteger(value.size)&&value.size!>=0&&value.size!<=262144;
 async function consume(value:StoredObject,ref:Ref){if(!value)throw Error('Immutable record missing');const raw=await value.text();if(await hash(raw)!==ref.sha256)throw Error('Immutable record corrupt');return raw;}
 let pendingIdentity:{key:string;ref:Ref;object:Promise<Outcome<StoredObject>>;raw?:Promise<Outcome<string>>;released?:boolean}|undefined;
 async function aggregate(index:number){
  const [key,ref]=entries[index];
  if(options.identityReadToken)return readIdentityAggregate(bucket,key,ref,options.identityReadToken);
  if(pendingIdentity?.key===key){const pending=pendingIdentity;pendingIdentity=undefined;const object=await pending.object;return pending.raw?unwrap(await pending.raw):consume(unwrap(object),ref);}
  const next=entries[index+1];
  if(identityReadKeys.has(key)&&valid(ref)&&next&&identityReadKeys.has(next[0])&&valid(next[1])){
   const current=settle(Promise.resolve().then(()=>bucket.get(ref.key)));pendingIdentity={key:next[0],ref:next[1],object:settle(Promise.resolve().then(()=>bucket.get(next[1].key)))};
   const first=unwrap(await current);
   if(small(first)){
    const pending=pendingIdentity;
    // Never delay the first text/SHA/failure on a slow second GET. Metadata
    // admission for speculative second text is independent and rejection-safe.
    void pending.object.then(second=>{if(!pending.released&&second.ok&&small(second.value))pending.raw=settle(consume(second.value,next[1]));}).catch(()=>{});
   }
   return consume(first,ref);
  }
  return read(bucket,ref);
 }
 function releasePendingIdentity(){
  const pending=pendingIdentity;pendingIdentity=undefined;
  // A late GET or cleanup rejection cannot replace the original traversal
  // failure. No additional fetch/write; release an unused provider stream.
  if(pending){pending.released=true;void pending.object.then(async result=>{if(result.ok&&result.value?.body)await result.value.body.cancel();}).catch(()=>{});}
 }
 // Serial module loading bounds transient allocation. Per-request body sharing
 // avoids duplicate R2 reads; no bucket handles/content survive a request.
 try{for(let index=0;index<entries.length;index++){const [key,ref]=entries[index];deferVersions=key===options.allocationKey&&!allocationRef?false:!fullVersionReaders.has(key)||options.modelKey===key||!!options.deferDependencyHistory&&key!==options.modelKey;const original=await aggregate(index);
  // Preserve the original manifest traversal/error order: required bodies are
  // hydrated now, before reading the next aggregate. Excluded bodies alone are
  // the approved fault-policy change; aggregate SHA/JSON still fail closed.
  if(bodyKeys&&!bodyKeys.has(key)){if(original.includes('"__immutableBody"'))JSON.parse(original);continue;}
  known.add(ref.sha256);const raw=options.projectValue?await options.projectValue(key,original):original;
  if(raw===undefined)continue;
  if(key===options.modelKey&&!options.effectiveOnly&&!options.projectValue){models.set(key,await visit(JSON.parse(raw)));values[key]=raw;}
  else values[key]=options.effectiveOnly?JSON.stringify(await visit(effectiveDeliveryValue(JSON.parse(raw)))):raw.includes('"__immutableBody"')?JSON.stringify(await visit(JSON.parse(raw))):raw;
 }}finally{releasePendingIdentity();}
 if(envelope.maintenanceMode!==undefined)values.maintenanceMode=envelope.maintenanceMode;
  return{values,recordStorage:{envelope,originalValues:{...values},known,partial:!!bodyKeys||!!options.keys||!!options.effectiveOnly||!!options.projectValue,models,allocations} satisfies RecordStorage};
}

// B0 mutation boundary: all aggregates are verified, but only the fixed FQC
// dependency closure hydrates bodies. This is not a general partial-state writer.
const fqcMutationKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','qualityMasterControl','masterDataControl','routineEquipmentControl'];
export type FqcRecordMutationHandle={readonly __fqcRecordMutation:unique symbol};
type FqcMutationBinding={bucket:Bucket;revision:number;manifest:string;envelope:Envelope;storage:RecordStorage;values:Record<string,string>;visibleStorage:RecordStorage;visibleKnown:string[];model:unknown;siblings:string;consumed:boolean};
const fqcMutationHandles=new WeakMap<object,FqcMutationBinding>();
const fqcSiblings=(model:unknown)=>{if(!object(model)||!object(model.libraries))throw Error('Invalid FQC mutation model');return JSON.stringify({...model,libraries:Object.fromEntries(Object.entries(model.libraries).filter(([key])=>key!=='fqc'))});};
export async function readFqcRecordMutation(bucket:Bucket,envelope:Envelope,revision:number){
 const manifest=envelope?.__processRecords;
 if(!Number.isSafeInteger(revision)||revision<0||!object(envelope)||envelope.platformUsers!==undefined&&typeof envelope.platformUsers!=='string'||envelope.maintenanceMode!==undefined&&typeof envelope.maintenanceMode!=='string'||Object.keys(envelope).some(k=>!['__processRecords','platformUsers','maintenanceMode'].includes(k))||!object(manifest)||manifest.version!==1||Object.keys(manifest).some(k=>!['version','values','legacySources','allocations'].includes(k))||!object(manifest.values)||!object(manifest.legacySources)||!object(manifest.allocations)||!valid(manifest.allocations.qualityMasterControl)||!valid(manifest.values.qualityMasterControl))return null;
 const original=JSON.stringify(envelope);
 const selected=await decodeRecordValuesCore(bucket,envelope,{modelKey:'qualityMasterControl',deferDependencyHistory:true,deferHistory:true},new Set(fqcMutationKeys));
 // Noncanonical mirrors are handled by the ordinary full reader/encoder;
 // this overlay never silently repairs or retains a divergent auth mirror.
 if(envelope.platformUsers!==selected.values.platformUsers||envelope.maintenanceMode!==selected.values.maintenanceMode)return null;
 const model=selected.recordStorage.models.get('qualityMasterControl');
 if(!object(model)||model.schemaVersion!==1||!object(model.libraries)||!object(model.libraries.fqc)||!object(model.libraries.fqc.workflow)||model.libraries.fqc.workflow.scope!=='fqc'||model.libraries.fqc.workflow.schemaVersion!==3)return null;
 const handle=Object.freeze({}) as FqcRecordMutationHandle;
 const privateStorage:RecordStorage={...selected.recordStorage,envelope:JSON.parse(original),originalValues:{...selected.recordStorage.originalValues},known:new Set(selected.recordStorage.known),models:new Map(selected.recordStorage.models),allocations:new Map(selected.recordStorage.allocations)};
 fqcMutationHandles.set(handle,{bucket,revision,manifest:original,envelope:privateStorage.envelope,storage:privateStorage,values:{...selected.values},visibleStorage:selected.recordStorage,visibleKnown:[...selected.recordStorage.known],model,siblings:fqcSiblings(model),consumed:false});
 return{...selected,handle};
}
export async function encodeFqcRecordMutation(bucket:Bucket,handle:FqcRecordMutationHandle,revision:number,values:Record<string,string>,storage:RecordStorage,model:unknown){
 const b=fqcMutationHandles.get(handle);
 if(!b||b.consumed||b.bucket!==bucket||b.revision!==revision||b.visibleStorage!==storage||!storage.partial||JSON.stringify(storage.envelope)!==b.manifest||JSON.stringify(storage.originalValues)!==JSON.stringify(b.values)||storage.known.size!==b.visibleKnown.length||b.visibleKnown.some(sha=>!storage.known.has(sha))||storage.models.size!==1||storage.models.get('qualityMasterControl')!==b.model||storage.allocations.size!==0||Object.keys(values).length!==Object.keys(b.values).length||Object.entries(b.values).some(([key,value])=>values[key]!==value)||fqcSiblings(model)!==b.siblings)throw Error('Invalid FQC mutation handle');
 b.consumed=true;
 const encoded=JSON.parse(await encodeRecordValuesCore(bucket,{qualityMasterControl:b.values.qualityMasterControl},b.storage,new Map([['qualityMasterControl',model]]))) as Envelope;
 const next:Envelope={...b.envelope,__processRecords:{...b.envelope.__processRecords,values:{...b.envelope.__processRecords.values,qualityMasterControl:encoded.__processRecords.values.qualityMasterControl},allocations:{...b.envelope.__processRecords.allocations,qualityMasterControl:encoded.__processRecords.allocations!.qualityMasterControl}}};
 return JSON.stringify(next);
}

// Process Save has its own capability, not an extension of the FQC Apply scope.
// All aggregate verification is retained; only unrelated body hydration differs.
const processSaveMutationKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','processAuthoringControl','masterDataControl'];
export type ProcessSaveRecordMutationHandle={readonly __processSaveRecordMutation:unique symbol};
type ProcessSaveMutationBinding={bucket:Bucket;revision:number;manifest:string;envelope:Envelope;storage:RecordStorage;values:Record<string,string>;visibleStorage:RecordStorage;visibleKnown:string[];model:unknown;consumed:boolean};
const processSaveMutationHandles=new WeakMap<object,ProcessSaveMutationBinding>();
export async function readProcessSaveRecordMutation(bucket:Bucket,envelope:Envelope,revision:number){
 const manifest=envelope?.__processRecords;
 if(!Number.isSafeInteger(revision)||revision<0||!object(envelope)||envelope.platformUsers!==undefined&&typeof envelope.platformUsers!=='string'||envelope.maintenanceMode!==undefined&&typeof envelope.maintenanceMode!=='string'||Object.keys(envelope).some(k=>!['__processRecords','platformUsers','maintenanceMode'].includes(k))||!object(manifest)||manifest.version!==1||Object.keys(manifest).some(k=>!['version','values','legacySources','allocations'].includes(k))||!object(manifest.values)||!object(manifest.legacySources)||manifest.allocations!==undefined&&!object(manifest.allocations)||!valid(manifest.values.processAuthoringControl))return null;
 const original=JSON.stringify(envelope);
 const selected=await decodeRecordValuesCore(bucket,envelope,{modelKey:'processAuthoringControl',deferDependencyHistory:true,deferHistory:true},new Set(processSaveMutationKeys));
 if(envelope.platformUsers!==selected.values.platformUsers||envelope.maintenanceMode!==selected.values.maintenanceMode)return null;
 const model=selected.recordStorage.models.get('processAuthoringControl');
 if(!object(model)||!Array.isArray(model.versions)||!object(model.workflow)||model.workflow.scope!=='process:platform'||model.workflow.schemaVersion!==3)return null;
 const handle=Object.freeze({}) as ProcessSaveRecordMutationHandle;
 const privateStorage:RecordStorage={...selected.recordStorage,envelope:JSON.parse(original),originalValues:{...selected.recordStorage.originalValues},known:new Set(selected.recordStorage.known),models:new Map(selected.recordStorage.models),allocations:new Map(selected.recordStorage.allocations)};
 processSaveMutationHandles.set(handle,{bucket,revision,manifest:original,envelope:privateStorage.envelope,storage:privateStorage,values:{...selected.values},visibleStorage:selected.recordStorage,visibleKnown:[...selected.recordStorage.known],model,consumed:false});
 return{...selected,handle};
}
export async function encodeProcessSaveRecordMutation(bucket:Bucket,handle:ProcessSaveRecordMutationHandle,revision:number,values:Record<string,string>,storage:RecordStorage,model:unknown){
 const b=processSaveMutationHandles.get(handle);
 if(!b||b.consumed||b.bucket!==bucket||b.revision!==revision||b.visibleStorage!==storage||!storage.partial||JSON.stringify(storage.envelope)!==b.manifest||JSON.stringify(storage.originalValues)!==JSON.stringify(b.values)||storage.known.size!==b.visibleKnown.length||b.visibleKnown.some(sha=>!storage.known.has(sha))||storage.models.size!==1||storage.models.get('processAuthoringControl')!==b.model||storage.allocations.size!==0||Object.keys(values).length!==Object.keys(b.values).length||Object.entries(b.values).some(([key,value])=>values[key]!==value))throw Error('Invalid Process Save mutation handle');
 b.consumed=true;
 const encoded=JSON.parse(await encodeRecordValuesCore(bucket,{processAuthoringControl:b.values.processAuthoringControl},b.storage,new Map([['processAuthoringControl',model]]))) as Envelope;
 const next:Envelope={...b.envelope,__processRecords:{...b.envelope.__processRecords,values:{...b.envelope.__processRecords.values,processAuthoringControl:encoded.__processRecords.values.processAuthoringControl}}};
 return JSON.stringify(next);
}

// Process Apply/Submit/Approve has a distinct capability and full BOM/IPQC closure.
// All aggregate verification is retained; only unrelated body hydration differs.
const processFlowMutationKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','processAuthoringControl','masterDataControl','bomOverrides','ipqcABMasterControl','ipqcCMasterControl'];
export type ProcessFlowRecordMutationHandle={readonly __processFlowRecordMutation:unique symbol};
type ProcessFlowMutationBinding={bucket:Bucket;revision:number;manifest:string;envelope:Envelope;storage:RecordStorage;values:Record<string,string>;visibleStorage:RecordStorage;visibleKnown:string[];model:unknown;consumed:boolean};
const processFlowMutationHandles=new WeakMap<object,ProcessFlowMutationBinding>();
export async function readProcessFlowRecordMutation(bucket:Bucket,envelope:Envelope,revision:number,caseId?:string){
 const manifest=envelope?.__processRecords;
 if(!Number.isSafeInteger(revision)||revision<0||!object(envelope)||envelope.platformUsers!==undefined&&typeof envelope.platformUsers!=='string'||envelope.maintenanceMode!==undefined&&typeof envelope.maintenanceMode!=='string'||Object.keys(envelope).some(k=>!['__processRecords','platformUsers','maintenanceMode'].includes(k))||!object(manifest)||manifest.version!==1||Object.keys(manifest).some(k=>!['version','values','legacySources','allocations'].includes(k))||!object(manifest.values)||!object(manifest.legacySources)||manifest.allocations!==undefined&&!object(manifest.allocations)||!valid(manifest.values.processAuthoringControl))return null;
 const original=JSON.stringify(envelope);
 const selected=await decodeRecordValuesCore(bucket,envelope,{modelKey:'processAuthoringControl',deferDependencyHistory:true,deferHistory:true,caseId},new Set(processFlowMutationKeys));
 if(envelope.platformUsers!==selected.values.platformUsers||envelope.maintenanceMode!==selected.values.maintenanceMode)return null;
 const model=selected.recordStorage.models.get('processAuthoringControl');
 if(!object(model)||!Array.isArray(model.versions)||!object(model.workflow)||model.workflow.scope!=='process:platform'||model.workflow.schemaVersion!==3)return null;
 const handle=Object.freeze({}) as ProcessFlowRecordMutationHandle;
 const privateStorage:RecordStorage={...selected.recordStorage,envelope:JSON.parse(original),originalValues:{...selected.recordStorage.originalValues},known:new Set(selected.recordStorage.known),models:new Map(selected.recordStorage.models),allocations:new Map(selected.recordStorage.allocations)};
 processFlowMutationHandles.set(handle,{bucket,revision,manifest:original,envelope:privateStorage.envelope,storage:privateStorage,values:{...selected.values},visibleStorage:selected.recordStorage,visibleKnown:[...selected.recordStorage.known],model,consumed:false});
 return{...selected,handle};
}
export async function encodeProcessFlowRecordMutation(bucket:Bucket,handle:ProcessFlowRecordMutationHandle,revision:number,values:Record<string,string>,storage:RecordStorage,model:unknown){
 const b=processFlowMutationHandles.get(handle);
 if(!b||b.consumed||b.bucket!==bucket||b.revision!==revision||b.visibleStorage!==storage||!storage.partial||JSON.stringify(storage.envelope)!==b.manifest||JSON.stringify(storage.originalValues)!==JSON.stringify(b.values)||storage.known.size!==b.visibleKnown.length||b.visibleKnown.some(sha=>!storage.known.has(sha))||storage.models.size!==1||storage.models.get('processAuthoringControl')!==b.model||storage.allocations.size!==0||Object.keys(values).length!==Object.keys(b.values).length||Object.entries(b.values).some(([key,value])=>values[key]!==value))throw Error('Invalid Process Flow mutation handle');
 b.consumed=true;
 const encoded=JSON.parse(await encodeRecordValuesCore(bucket,{processAuthoringControl:b.values.processAuthoringControl},b.storage,new Map([['processAuthoringControl',model]]))) as Envelope;
 const next:Envelope={...b.envelope,__processRecords:{...b.envelope.__processRecords,values:{...b.envelope.__processRecords.values,processAuthoringControl:encoded.__processRecords.values.processAuthoringControl}}};
 return JSON.stringify(next);
}

// FQC lifecycle has a separate fixed eight-body capability. Existing-set B0
// remains unchanged; selected case hydration follows the original POST reader.
const fqcLifecycle8MutationKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','qualityMasterControl','masterDataControl','routineEquipmentControl'];
export type FqcLifecycle8RecordMutationHandle={readonly __fqcLifecycle8RecordMutation:unique symbol};
type FqcLifecycle8MutationBinding={selection:string;bucket:Bucket;revision:number;manifest:string;envelope:Envelope;storage:RecordStorage;values:Record<string,string>;visibleStorage:RecordStorage;visibleKnown:string[];model:unknown;siblings:string;consumed:boolean};
const fqcLifecycle8MutationHandles=new WeakMap<object,FqcLifecycle8MutationBinding>();
const fqcLifecycle8Siblings=(model:unknown)=>{if(!object(model)||!object(model.libraries))throw Error('Invalid FQC lifecycle mutation model');return JSON.stringify({...model,libraries:Object.fromEntries(Object.entries(model.libraries).filter(([key])=>key!=='fqc'))});};
export type FqcLifecycle8Selection={action:'save'|'submit'|'withdraw'|'return'|'approve';caseId?:string};
export async function readFqcLifecycle8RecordMutation(bucket:Bucket,envelope:Envelope,revision:number,selection:FqcLifecycle8Selection){
 if(!selection||!['save','submit','withdraw','return','approve'].includes(selection.action)||Object.keys(selection).some(k=>k!=='action'&&k!=='caseId'))return null;
 const review=['withdraw','return','approve'].includes(selection.action);
 if(review?typeof selection.caseId!=='string'||!selection.caseId:selection.caseId!==undefined)return null;
 const manifest=envelope?.__processRecords;
 if(!Number.isSafeInteger(revision)||revision<0||!object(envelope)||envelope.platformUsers!==undefined&&typeof envelope.platformUsers!=='string'||envelope.maintenanceMode!==undefined&&typeof envelope.maintenanceMode!=='string'||Object.keys(envelope).some(k=>!['__processRecords','platformUsers','maintenanceMode'].includes(k))||!object(manifest)||manifest.version!==1||Object.keys(manifest).some(k=>!['version','values','legacySources','allocations'].includes(k))||!object(manifest.values)||!object(manifest.legacySources)||!object(manifest.allocations)||!valid(manifest.allocations.qualityMasterControl)||!valid(manifest.values.qualityMasterControl))return null;
 const original=JSON.stringify(envelope);
 const selected=await decodeRecordValuesCore(bucket,envelope,{modelKey:'qualityMasterControl',deferDependencyHistory:true,deferHistory:true,caseId:selection.caseId},new Set(fqcLifecycle8MutationKeys));
 // Noncanonical mirrors are handled by the ordinary full reader/encoder;
 // this overlay never silently repairs or retains a divergent auth mirror.
 if(envelope.platformUsers!==selected.values.platformUsers||envelope.maintenanceMode!==selected.values.maintenanceMode)return null;
 const model=selected.recordStorage.models.get('qualityMasterControl');
 if(!object(model)||model.schemaVersion!==1||!object(model.libraries)||!object(model.libraries.fqc)||!object(model.libraries.fqc.workflow)||model.libraries.fqc.workflow.scope!=='fqc'||model.libraries.fqc.workflow.schemaVersion!==3)return null;
 const handle=Object.freeze({}) as FqcLifecycle8RecordMutationHandle;
 const privateStorage:RecordStorage={...selected.recordStorage,envelope:JSON.parse(original),originalValues:{...selected.recordStorage.originalValues},known:new Set(selected.recordStorage.known),models:new Map(selected.recordStorage.models),allocations:new Map(selected.recordStorage.allocations)};
 fqcLifecycle8MutationHandles.set(handle,{selection:JSON.stringify(selection),bucket,revision,manifest:original,envelope:privateStorage.envelope,storage:privateStorage,values:{...selected.values},visibleStorage:selected.recordStorage,visibleKnown:[...selected.recordStorage.known],model,siblings:fqcLifecycle8Siblings(model),consumed:false});
 return{...selected,handle};
}
export async function encodeFqcLifecycle8RecordMutation(bucket:Bucket,handle:FqcLifecycle8RecordMutationHandle,revision:number,values:Record<string,string>,storage:RecordStorage,model:unknown,selection:FqcLifecycle8Selection){
 const b=fqcLifecycle8MutationHandles.get(handle);
 if(!b||b.selection!==JSON.stringify(selection)||b.consumed||b.bucket!==bucket||b.revision!==revision||b.visibleStorage!==storage||!storage.partial||JSON.stringify(storage.envelope)!==b.manifest||JSON.stringify(storage.originalValues)!==JSON.stringify(b.values)||storage.known.size!==b.visibleKnown.length||b.visibleKnown.some(sha=>!storage.known.has(sha))||storage.models.size!==1||storage.models.get('qualityMasterControl')!==b.model||storage.allocations.size!==0||Object.keys(values).length!==Object.keys(b.values).length||Object.entries(b.values).some(([key,value])=>values[key]!==value)||fqcLifecycle8Siblings(model)!==b.siblings)throw Error('Invalid FQC lifecycle mutation handle');
 b.consumed=true;
 const encoded=JSON.parse(await encodeRecordValuesCore(bucket,{qualityMasterControl:b.values.qualityMasterControl},b.storage,new Map([['qualityMasterControl',model]]))) as Envelope;
 const next:Envelope={...b.envelope,__processRecords:{...b.envelope.__processRecords,values:{...b.envelope.__processRecords.values,qualityMasterControl:encoded.__processRecords.values.qualityMasterControl},allocations:{...b.envelope.__processRecords.allocations,qualityMasterControl:encoded.__processRecords.allocations!.qualityMasterControl}}};
 return JSON.stringify(next);
}

// Fixed canonical IPQC-C Save capability; never a caller-provided write set.
const ipqcCSaveMutationKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','ipqcCMasterControl','masterDataControl','routineEquipmentControl'];
export type IpqcCSaveRecordMutationHandle={readonly __ipqcCSaveRecordMutation:unique symbol};
type IpqcCSaveMutationBinding={bucket:Bucket;revision:number;manifest:string;envelope:Envelope;storage:RecordStorage;values:Record<string,string>;visibleStorage:RecordStorage;visibleKnown:string[];model:unknown;allocation:string;consumed:boolean};
const ipqcCSaveMutationHandles=new WeakMap<object,IpqcCSaveMutationBinding>();
export async function readIpqcCSaveRecordMutation(bucket:Bucket,envelope:Envelope,revision:number){
 const manifest=envelope?.__processRecords;
 if(!Number.isSafeInteger(revision)||revision<0||!object(envelope)||envelope.platformUsers!==undefined&&typeof envelope.platformUsers!=='string'||envelope.maintenanceMode!==undefined&&typeof envelope.maintenanceMode!=='string'||Object.keys(envelope).some(k=>!['__processRecords','platformUsers','maintenanceMode'].includes(k))||!object(manifest)||manifest.version!==1||Object.keys(manifest).some(k=>!['version','values','legacySources','allocations'].includes(k))||!object(manifest.values)||!object(manifest.legacySources)||!object(manifest.allocations)||!valid(manifest.allocations.ipqcCMasterControl)||!valid(manifest.values.ipqcCMasterControl))return null;
 const original=JSON.stringify(envelope);
 const selected=await decodeRecordValuesCore(bucket,envelope,{modelKey:'ipqcCMasterControl',deferDependencyHistory:true,deferHistory:true,allocationKey:'ipqcCMasterControl'},new Set(ipqcCSaveMutationKeys));
 if(envelope.platformUsers!==selected.values.platformUsers||envelope.maintenanceMode!==selected.values.maintenanceMode)return null;
 const model=selected.recordStorage.models.get('ipqcCMasterControl');
 if(!object(model)||!Array.isArray(model.versions)||!object(model.workflow)||model.workflow.scope!=='ipqc-c'||model.workflow.schemaVersion!==3)return null;
 const allocation=selected.recordStorage.allocations.get('ipqcCMasterControl');
 if(!allocation||JSON.stringify(allocationIndex(model,allocation))!==JSON.stringify(allocation))return null;
 const handle=Object.freeze({}) as IpqcCSaveRecordMutationHandle;
 const privateStorage:RecordStorage={...selected.recordStorage,envelope:JSON.parse(original),originalValues:{...selected.recordStorage.originalValues},known:new Set(selected.recordStorage.known),models:new Map(selected.recordStorage.models),allocations:new Map(selected.recordStorage.allocations)};
 ipqcCSaveMutationHandles.set(handle,{bucket,revision,manifest:original,envelope:privateStorage.envelope,storage:privateStorage,values:{...selected.values},visibleStorage:selected.recordStorage,visibleKnown:[...selected.recordStorage.known],model,allocation:JSON.stringify(allocation),consumed:false});
 return{...selected,handle};
}
export async function encodeIpqcCSaveRecordMutation(bucket:Bucket,handle:IpqcCSaveRecordMutationHandle,revision:number,values:Record<string,string>,storage:RecordStorage,model:unknown){
 const b=ipqcCSaveMutationHandles.get(handle);
 if(!b||b.consumed||b.bucket!==bucket||b.revision!==revision||b.visibleStorage!==storage||!storage.partial||JSON.stringify(storage.envelope)!==b.manifest||JSON.stringify(storage.originalValues)!==JSON.stringify(b.values)||storage.known.size!==b.visibleKnown.length||b.visibleKnown.some(sha=>!storage.known.has(sha))||storage.models.size!==1||storage.models.get('ipqcCMasterControl')!==b.model||storage.allocations.size!==1||JSON.stringify(storage.allocations.get('ipqcCMasterControl'))!==b.allocation||JSON.stringify(allocationIndex(model,JSON.parse(b.allocation)))!==b.allocation||Object.keys(values).length!==Object.keys(b.values).length||Object.entries(b.values).some(([key,value])=>values[key]!==value))throw Error('Invalid IPQC-C Save mutation handle');
 b.consumed=true;
 const encoded=JSON.parse(await encodeRecordValuesCore(bucket,{ipqcCMasterControl:b.values.ipqcCMasterControl},b.storage,new Map([['ipqcCMasterControl',model]]))) as Envelope;
 const next:Envelope={...b.envelope,__processRecords:{...b.envelope.__processRecords,values:{...b.envelope.__processRecords.values,ipqcCMasterControl:encoded.__processRecords.values.ipqcCMasterControl}}};
 return JSON.stringify(next);
}

