// Offline operational view. Originals/global backups stay in the pinned local
// snapshot. This module has no live bindings, cleanup, login or upload action.
import {sha256,validateSnapshot} from './snapshot-contract.mjs';
import {cleanJson} from './snapshot-redaction.mjs';
const encode=v=>new TextEncoder().encode(JSON.stringify(v)),fail=(v,c)=>{if(!v)throw Error(c);};
const hex=/^[a-f0-9]{64}$/;
export async function createOperationalSelection({parentHandoff,normalizationPlan:parent,tables,programCommit,expectedParentManifestSha256}){
 fail(/^[a-f0-9]{40}$/.test(programCommit||'')&&hex.test(expectedParentManifestSha256||''),'OPERATIONAL_PROVENANCE');
 const input=parentHandoff.manifest;validateSnapshot(input);
 fail(await sha256(encode(input))===expectedParentManifestSha256&&parentHandoff.manifestSha256===expectedParentManifestSha256,'OPERATIONAL_PARENT_PIN');
 const {planSha256,manifest,...core}=parent;fail(parent.format==='PROCESS_OS_NORMALIZATION_PLAN_V1'&&await sha256(encode(core))===planSha256&&JSON.stringify(manifest)===JSON.stringify(input)&&input.normalization.planSha256===planSha256&&input.normalization.sourceManifestSha256===parentHandoff.sourceManifestSha256,'OPERATIONAL_PLAN_PIN');
 fail(tables&&Object.keys(tables).sort().join()==='shared_state,state_backups,web_feedback_store'&&tables.shared_state.length===1&&tables.web_feedback_store.length===1&&Array.isArray(tables.state_backups),'OPERATIONAL_TABLES');
 fail(JSON.stringify(cleanJson(tables))===JSON.stringify(tables),'OPERATIONAL_CREDENTIAL_FIELDS');
 for(const table of Object.keys(tables)){const bytes=encode(tables[table]),parts=input.chunks.filter(c=>c.resource==='db/'+table);fail(parts.length&&parts[0].totalBytes===bytes.length,'OPERATIONAL_TABLE_PIN');for(const c of parts)fail(await sha256(bytes.subarray(c.offset,c.offset+c.bytes))===c.sha256,'OPERATIONAL_TABLE_PIN');}
 const resources=new Map();for(const c of input.chunks)if(!resources.has(c.resource))resources.set(c.resource,{name:c.resource,bytes:c.totalBytes,metadata:c.metadata});
 const r2=[...resources.keys()].filter(n=>n.startsWith('r2/')),known=new Set(r2.map(n=>n.slice(3))),hashTargets=new Map(),sourceTargets=new Map(parent.sourceMappings.map(r=>[r.sourceResource,r.targetResource])),graph=new Map();
 function digest(d,name){if(!hex.test(d||''))return;const set=hashTargets.get(d)||new Set();set.add(name);hashTargets.set(d,set);known.add(d);}
 for(const name of r2)digest(name.match(/(?:^|\/)([a-f0-9]{64})(?:\.json)?$/)?.[1],name);
 for(const recipe of parent.recipes){fail(resources.has(recipe.targetResource),'OPERATIONAL_RECIPE_COVERAGE');if(!recipe.targetResource.startsWith('r2/'))continue;digest(recipe.sha256,recipe.targetResource);const deps=new Set(recipe.dependencies.map(k=>sourceTargets.get('r2/'+k)||'r2/'+k));fail([...deps].every(k=>resources.has(k)),'OPERATIONAL_REFERENCE_MISSING');graph.set(recipe.targetResource,deps);}
 fail(graph.size===r2.length,'OPERATIONAL_RECIPE_COVERAGE');
 function refs(value){const found=new Set();cleanJson(value,{knownKeys:known,references:found});const out=new Set();for(const key of found){if(hashTargets.has(key)){for(const name of hashTargets.get(key))out.add(name);}else out.add('r2/'+key);}fail([...out].every(n=>resources.has(n)),'OPERATIONAL_REFERENCE_MISSING');return out;}
 const currentRoots=refs(tables.shared_state),feedbackRoots=refs(tables.web_feedback_store);
 // Feedback IDs/URLs and private-image paths are resolved by existing adapters,
 // not always literal object keys. Keep all feedback/private mappings and ALL
 // standalone media conservatively; don't guess that an unreferenced photo is
 // disposable. Current business version/approval records remain reachable.
 const roots=new Set([...currentRoots,...feedbackRoots,...r2.filter(n=>n.startsWith('r2/web-feedback/v1/')||n.startsWith('r2/company-assets/')||resources.get(n).metadata?.encoding==='binary')]);
 const retained=new Set(),queue=[...roots];while(queue.length){const n=queue.pop();if(retained.has(n))continue;fail(resources.has(n),'OPERATIONAL_REFERENCE_MISSING');retained.add(n);for(const dep of graph.get(n)||[])queue.push(dep);}
 const historyBytes=encode([]),historyHash=await sha256(historyBytes),chunks=[],reads=[];let historyWritten=false;
 for(const c of input.chunks){if(c.resource.startsWith('r2/')&&!retained.has(c.resource))continue;
  if(c.resource==='db/state_backups'){if(historyWritten)continue;historyWritten=true;const id='c'+chunks.length;chunks.push({...c,id,offset:0,totalBytes:historyBytes.length,bytes:historyBytes.length,sha256:historyHash});reads.push({id,inlineEmptyHistory:true});}
  else{const id='c'+chunks.length;chunks.push({...c,id});reads.push({id,parentId:c.id});}
 }
 fail(historyWritten,'OPERATIONAL_TABLES');
 const selectionCore={format:'PROCESS_OS_OPERATIONAL_SELECTION_V1',programCommit,parentManifestSha256:expectedParentManifestSha256,originalSourceManifestSha256:parentHandoff.sourceManifestSha256,policy:'current-business-and-all-media-global-backups-offline-v1',offlineGlobalBackupRows:tables.state_backups.length,onlineGlobalBackupRows:0,retainedResources:[...retained].sort(),reads};
 const selectionSha256=await sha256(encode(selectionCore)),output={...input,chunks,normalization:{...input.normalization,programCommit,planSha256:selectionSha256}},summary=validateSnapshot(output);
 const parentMapping=new Map(parentHandoff.mapping.map(r=>[r.id,r])),mapping=[],deltaReads=[];
 for(const read of reads){if(read.inlineEmptyHistory){mapping.push({id:read.id,delta:true});deltaReads.push(read);continue;}const old=parentMapping.get(read.parentId);fail(old,'OPERATIONAL_MAPPING_MISSING');if(old.delta){mapping.push({id:read.id,delta:true});deltaReads.push(read);}else{fail(/^c\d+$/.test(old.sourceId||''),'OPERATIONAL_MAPPING_MISSING');mapping.push({id:read.id,sourceId:old.sourceId});}}
 const deltaBytes=deltaReads.reduce((n,r)=>n+chunks[Number(r.id.slice(1))].bytes,0);fail(deltaBytes<=16*1024*1024,'OPERATIONAL_DELTA_LIMIT');
 return{...selectionCore,selectionSha256,manifest:output,manifestSha256:await sha256(encode(output)),mapping,deltaReads,deltaBytes,summary,excludedObjects:r2.length-retained.size,originalLogicalBytes:input.chunks.reduce((s,c)=>s+c.bytes,0),retainedMediaObjects:r2.filter(n=>resources.get(n).metadata?.encoding==='binary').length,readiness:'OFFLINE_SELECTION_REQUIRES_PAYLOAD_AUDIT_AND_RUNTIME_QA'};
}
export function operationalSource(selection,readParentChunk){
 fail(selection?.format==='PROCESS_OS_OPERATIONAL_SELECTION_V1'&&typeof readParentChunk==='function','OPERATIONAL_SOURCE');const reads=new Map(selection.reads.map(r=>[r.id,r])),descriptors=new Map(selection.manifest.chunks.map(c=>[c.id,c]));
 return{scope:'private-snapshot',async manifest(){return selection.manifest;},async readChunk(id){const read=reads.get(id),c=descriptors.get(id);fail(read&&c,'OPERATIONAL_CHUNK');const raw=read.inlineEmptyHistory?encode([]):await readParentChunk(read.parentId);fail(raw instanceof Uint8Array&&raw.length===c.bytes&&await sha256(raw)===c.sha256,'OPERATIONAL_CHUNK_INTEGRITY');return raw;}};
}
export function operationalHandoff(selection,parentHandoff,pins){
 fail(pins.manifestSha256===selection.manifestSha256&&['projectId','origin','ownerId','targetFingerprint'].every(k=>pins[k]===parentHandoff[k]),'OPERATIONAL_TARGET');
 return{format:'PROCESS_OS_BROWSER_UPLOAD_V1',...pins,sourceManifestSha256:parentHandoff.sourceManifestSha256,manifest:selection.manifest,mapping:selection.mapping,deltaBytes:selection.deltaBytes,operational:{format:selection.format,selectionSha256:selection.selectionSha256,parentManifestSha256:selection.parentManifestSha256,offlineGlobalBackupRows:selection.offlineGlobalBackupRows,onlineGlobalBackupRows:0,allStandaloneMediaRetained:true}};
}
