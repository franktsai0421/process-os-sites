// Isolated preparation only: no DB/R2 writes and no automatic Local adoption.
// Legacy versions remain an exact recovery archive, not rewritten V3 cases.
import {createSharedDraft,stableDraftJSON} from './shared-draft';
import type {AuthoringControl,Workspace,Operation} from './process-authoring-workflow';
type Row=Record<string,unknown>;
const str=(v:unknown)=>typeof v==='string'?v:typeof v==='number'?String(v):'';
type Source={id:string;kind:string;category:string;line:string;stages:Record<string,Operation[]>;updatedAt:string};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
const scopeId=(category:string,line:string)=>JSON.stringify([category,line]);
function stages(value:unknown):Record<string,Operation[]>{const data=object(value),result:Record<string,Operation[]>={};if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_EDITOR_STAGES');for(const [key,list]of Object.entries(data)){if(!Array.isArray(list)||list.some(op=>!op||typeof op.id!=='string'))throw Error('INVALID_EDITOR_STAGES');result[key]=list;}return result;}
function summary(source:Source){return{id:source.id,kind:source.kind,updatedAt:source.updatedAt,stages:Object.keys(source.stages).length,operations:Object.values(source.stages).reduce<number>((n,v)=>n+(v as unknown[]).length,0)};}
function differences(a:Source,b:Source){
 const flatten=(s:Source)=>new Map(Object.entries(s.stages).flatMap(([stage,list])=>(list as Row[]).map(op=>[JSON.stringify([stage,op.id]),op] as const))),before=flatten(a),after=flatten(b);
 return [...new Set([...before.keys(),...after.keys()])].flatMap(key=>{const old=before.get(key),next=after.get(key);if(stableDraftJSON(old)===stableDraftJSON(next))return [];
  return[{stage:JSON.parse(key)[0],id:str((next||old)?.id),number:str((next||old)?.number),name:str((next||old)?.name),change:!old?'added':!next?'removed':'changed',
    fields:old&&next?[...new Set([...Object.keys(old),...Object.keys(next)])].filter(k=>stableDraftJSON(old[k])!==stableDraftJSON(next[k])):Object.keys(next||old||{})}];});
}
export function authoringControlFromPlan(plan:Awaited<ReturnType<typeof prepareProcessAuthoringConversion>>):AuthoringControl{
 if(!plan.ready||!plan.workflow)throw Error('CONVERSION_CONTENT_UNRESOLVED');
 const flow=plan.workflow,stamp='';
 // This baseline records an imported aggregate, not a fabricated review case or
 // successful manual save. Original dated versions stay in the recovery archive.
 return{activeVersionId:flow.active.id,workflow:flow,versions:[{id:flow.active.id!,number:0,status:'approved',snapshot:flow.active.content,revision:0,creatorId:'legacy-import',creatorName:'Legacy preservation',createdAt:stamp,updatedAt:stamp,history:[]},
  {id:'shared-'+flow.generation,number:1,status:'draft',snapshot:flow.working,revision:0,creatorId:'legacy-import',creatorName:'Legacy preservation',createdAt:stamp,updatedAt:stamp,history:[]}]};
}
async function contentEvidence(a:Source,b:Source){
 const photos=async(op:Row|undefined)=>{
  const found:{path:string;sha256:string;characters:number}[]=[];
  const walk=async(v:unknown,path:string)=>{if(typeof v==='string'&&(/^(data:(?:image|video)\/|\/api\/(?:.*photo|state-media)|assets\/|\/process\/assets\/)/.test(v))){found.push({path,sha256:await digest(v),characters:v.length});return;}
   if(v&&typeof v==='object')for(const [key,value]of Object.entries(v))await walk(value,path+'/'+key);};
  await walk(op,'');return found;
 };
 const lookup=(s:Source,stage:string,id:string)=>(s.stages[stage] as Row[]||[]).find(o=>o.id===id);
 return Promise.all(differences(a,b).map(async change=>{const old=lookup(a,change.stage,change.id),next=lookup(b,change.stage,change.id);
  const links=(op:Row|undefined)=>op?Object.fromEntries(['templateId','productCodes','nextIds','bomSelections','machines','machineDetails'].filter(k=>op[k]!==undefined).map(k=>[k,op[k]])):null;
  return{...change,coordinates:Object.fromEntries(['x','y'].filter(k=>change.fields.includes(k)).map(k=>[k,{before:old?.[k]??null,after:next?.[k]??null}])),photos:{before:await photos(old),after:await photos(next)},relationships:{before:links(old),after:links(next)}};
 }));
}
export async function prepareProcessAuthoringConversion(values:Record<string,string>,revision:number,resolutions:Record<string,{working?:string;active?:string}>={}){
 const raw=values.approvalVersions;if(!raw)throw Error('LEGACY_VERSIONS_REQUIRED');const versions:Row[]=JSON.parse(raw);if(!Array.isArray(versions))throw Error('INVALID_EDITOR_VERSIONS');
 const recoveryValues:Record<string,string>={approvalVersions:raw};if(values.publishedProcess!==undefined)recoveryValues.publishedProcess=values.publishedProcess;
 const groups=new Map<string,Source[]>(),add=(source:Source)=>{if(!source.category||!source.line)throw Error('INVALID_EDITOR_SCOPE');const key=scopeId(source.category,source.line),list=groups.get(key)||[];list.push(source);groups.set(key,list);};
 for(const version of versions)add({id:'version:'+str(version.id),kind:str(version.status),category:str(version.category),line:str(version.line),stages:stages(version.stages),updatedAt:str(version.updatedAt||version.createdAt)});
 for(const [key,value]of Object.entries(values))if(key.startsWith('processEditor:')){
   recoveryValues[key]=value;const cache=object(JSON.parse(value)),suffix=key.slice('processEditor:'.length),separator=suffix.lastIndexOf(':');
   const category=suffix.slice(0,separator),line=suffix.slice(separator+1);if(separator<0||cache.category&&cache.category!==category||cache.line&&cache.line!==line)throw Error('EDITOR_CACHE_SCOPE_MISMATCH');
   add({id:key,kind:'workspace',category,line,stages:stages(cache.stages),updatedAt:str(cache.savedAt)});
 }
 const sourceHashes:Record<string,string>={};for(const [key,value]of Object.entries(recoveryValues))sourceHashes[key]=await digest(value);
 const sourceDigest=await digest(stableDraftJSON(sourceHashes)),active:Workspace[]=[],working:Workspace[]=[],inventory:unknown[]=[],contentComparisons:unknown[]=[],preservedSavedDrafts:unknown[]=[],conflicts:{scope:string;kind:string;choices:ReturnType<typeof summary>[];differences?:{from:string;to:string;changes:ReturnType<typeof differences>}[]}[]=[];
 for(const [id,sources]of groups){
   const pending=sources.filter(s=>['pending','pending-test'].includes(s.kind));if(pending.length)conflicts.push({scope:id,kind:'PENDING_CASE_REQUIRES_COMPLETION',choices:pending.map(summary)});
   const approved=sources.filter(s=>s.kind==='approved'),fallback=sources.filter(s=>s.kind==='superseded').sort((a,b)=>sources.indexOf(a)-sources.indexOf(b));
   // Legacy runtime chooses highest version number, not the newest timestamp.
   fallback.sort((a,b)=>Number(versions.find(v=>'version:'+v.id===b.id)?.number||0)-Number(versions.find(v=>'version:'+v.id===a.id)?.number||0));
   const activeChoices=approved.length?approved:fallback.slice(0,1),choice=resolutions[id];
   const select=(candidates:Source[],selection:string|undefined,kind:string)=>{
     if(selection){const chosen=candidates.find(s=>s.id===selection);if(!chosen)throw Error('INVALID_CONVERSION_RESOLUTION');return chosen;}
     if(candidates.length<2||candidates.every(s=>stableDraftJSON(s.stages)===stableDraftJSON(candidates[0].stages)))return candidates[0];
     conflicts.push({scope:id,kind,choices:candidates.map(summary),differences:candidates.slice(1).map(s=>({from:candidates[0].id,to:s.id,changes:differences(candidates[0],s)}))});return undefined;
   };
   const formal=select(activeChoices,choice?.active,'MULTIPLE_EFFECTIVE_CONTENTS');
   const savedDrafts=sources.filter(s=>s.kind==='draft'),caches=sources.filter(s=>s.kind==='workspace');
   for(const draft of savedDrafts){preservedSavedDrafts.push({scope:id,sourceId:draft.id,updatedAt:draft.updatedAt,stages:draft.stages,legacyVersion:versions.find(v=>'version:'+v.id===draft.id)});
    for(const cache of caches)contentComparisons.push({scope:id,from:draft.id,to:cache.id,fromTimestamp:draft.updatedAt,toTimestamp:cache.updatedAt,timestampAuthority:'legacy-client-fields-not-server-save-receipts',changes:await contentEvidence(draft,cache)});
   }
   const draftChoices=sources.filter(s=>s.kind==='draft'||s.kind==='workspace');
   // A workspace that retains every saved operation unchanged except canvas
   // coordinates is a compatible *unsaved* continuation, never a new saved cut.
   const compatible=savedDrafts.length===1&&caches.length===1&&differences(savedDrafts[0],caches[0]).every(d=>d.change==='added'||d.change==='changed'&&d.fields.every(k=>['x','y'].includes(k)));
   const selected=compatible&&!choice?.working?caches[0]:select(draftChoices,choice?.working,'DRAFT_WORKSPACE_CONTENT_CONFLICT')||(!draftChoices.length?formal:undefined);
   const base={id,category:sources[0].category,line:sources[0].line};
   if(formal)active.push({...base,stages:formal.stages});if(selected)working.push({...base,stages:selected.stages});
   inventory.push({scope:id,sources:sources.map(summary),activeSource:formal?.id||null,workingSource:selected?.id||null,workingIsUnsaved:!!selected,compatibleUnsavedContinuation:compatible,legacySupersededFallback:!approved.length&&!!formal});
 }
 const flow=conflicts.length?null:createSharedDraft('process:platform',{workspaces:active},'legacy-baseline:'+sourceDigest,'conversion:'+sourceDigest);
 if(flow)flow.working={workspaces:working};
 return{format:'process-platform-conversion-v1',sourceRevision:revision,sourceDigest,sourceHashes,inventory,conflicts,
   ready:!conflicts.length,recoveryValues,preservedSavedDrafts,contentComparisons,workflow:flow,legacyVersionsPreserved:versions.length,legacyDraftsPreserved:versions.filter(v=>v.status==='draft').length};
}
