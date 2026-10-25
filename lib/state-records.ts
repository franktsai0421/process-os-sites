// Explicit isolated conversion format. Immutable snapshot bodies are separate
// from live aggregates; workflow requests need not reconstruct old history.
import {effectiveDeliveryValue} from './effective-delivery.mjs';
type Bucket={get(key:string):Promise<{text():Promise<string>}|null>;put(key:string,value:string,options?:{httpMetadata:{contentType:string}}):Promise<unknown>};
type Ref={key:string;sha256:string};
export type AllocationIndex={version:1;errors:Record<string,string>[];items:Record<string,string>[];equipment:{assetCode:string;pieceMark:string}[];categories:{code:string}[]};
type Envelope={__processRecords:{version:1;values:Record<string,Ref>;legacySources?:Record<string,Ref>;allocations?:Record<string,Ref>};platformUsers?:string;maintenanceMode?:string};
export type RecordStorage={envelope:Envelope;originalValues:Record<string,string>;known:Set<string>;partial:boolean;models:Map<string,unknown>;allocations:Map<string,AllocationIndex>};
export type RecordRead={deferHistory?:boolean;caseId?:string|null;saveId?:string|null;versionId?:string|null;keys?:string[];modelKey?:string;
 // Read-only delivery projection. Never use as a write/backup baseline. Dedicated
 // workflow and history routes retain the complete original decoding contract.
 effectiveOnly?:boolean;
 // Workflow adapters consume dependencies' effective/open content, not legacy
 // historical parsers. Opt-in only; ordinary/public reads retain their contract.
 deferDependencyHistory?:boolean;allocationKey?:string};
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
  if(!previous)legacySources[key]=await put(value);
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
 // Serial module loading bounds transient allocation. Per-request body sharing
 // avoids duplicate R2 reads; no bucket handles/content survive a request.
 for(const [key,ref]of Object.entries(envelope.__processRecords.values)){if(options.keys&&!options.keys.includes(key))continue;deferVersions=key===options.allocationKey&&!allocationRef?false:!fullVersionReaders.has(key)||options.modelKey===key||!!options.deferDependencyHistory&&key!==options.modelKey;known.add(ref.sha256);const raw=await read(bucket,ref);
  if(key===options.modelKey&&!options.effectiveOnly){models.set(key,await visit(JSON.parse(raw)));values[key]=raw;}
  else values[key]=options.effectiveOnly?JSON.stringify(await visit(effectiveDeliveryValue(JSON.parse(raw)))):raw.includes('"__immutableBody"')?JSON.stringify(await visit(JSON.parse(raw))):raw;
 }
 if(envelope.maintenanceMode!==undefined)values.maintenanceMode=envelope.maintenanceMode;
  return{values,recordStorage:{envelope,originalValues:{...values},known,partial:!!options.keys||!!options.effectiveOnly,models,allocations} satisfies RecordStorage};
}
