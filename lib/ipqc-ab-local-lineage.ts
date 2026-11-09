import {stableDraftJSON,type SharedDraft} from './shared-draft';
import {type AbControl,type AbScope,type AbSnapshot,type AbVersion} from './ipqc-ab';

/** Server-authored initialization witness. Never accepted from a command/input. */
export type AbColdOriginV1={kind:'ipqc-ab-cold-origin-v1';scope:string;generation:string;activeVersionId:string|null;originVersionId:string|null;originBaseVersionId:string|null;originRevision:number|null;sourceKey:string};
export type AbColdOriginV2=Omit<AbColdOriginV1,'kind'>&{kind:'ipqc-ab-cold-origin-v2';initialActiveBasis:'legacy-origin'};
export type AbColdOrigin=AbColdOriginV1|AbColdOriginV2;
export type AbColdOriginInput=Omit<AbColdOriginV1,'generation'>|Omit<AbColdOriginV2,'generation'>;
type Scope=AbScope&{workflow?:SharedDraft<AbSnapshot>;coldOrigin?:AbColdOrigin};
type Root=AbControl&{moduleDraft?:{activeVersionId:string|null;versions:{id:string;status:string;snapshot:unknown}[];workflow?:SharedDraft<unknown>}};
export type AbScopeLineageV1={generation:string|null;anchor:string|null;originRevision:number|null;originDigest:string|null;reason:string|null};
export type AbLocalLineageV1={kind:'ipqc-ab-local-lineage-v1';revision:number;businessBase:string|null;groups:Record<string,AbScopeLineageV1>};
const empty=():AbSnapshot=>({errors:[],items:[]});
const content=(v:unknown):v is AbSnapshot=>!!v&&typeof v==='object'&&Array.isArray((v as AbSnapshot).errors)&&Array.isArray((v as AbSnapshot).items);
const fingerprint=async(v:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableDraftJSON(v)))),n=>n.toString(16).padStart(2,'0')).join('');
const one=(versions:AbVersion[],id:string|null)=>id===null?null:versions.filter(v=>v.id===id).length===1?versions.find(v=>v.id===id)!:undefined;

export function captureAbColdOrigin(root:AbControl,key:string,scope:Scope,initialActiveBasis:'approved'|'legacy-origin'='approved'):AbColdOriginInput|null{
 if(scope.workflow)return null;
 const opens=scope.versions.filter(v=>['draft','pending','pending-test'].includes(v.status)),active=one(scope.versions,scope.activeVersionId);
 if(active===undefined||opens.length>1||opens[0]&&opens[0].status!=='draft')return null;
 const origin=opens[0]||active;
 if(origin&&(!Number.isSafeInteger(origin.revision)||origin.revision<0||!content(origin.snapshot)))return null;
 const witness={scope:key,activeVersionId:scope.activeVersionId,originVersionId:origin?.id??null,originBaseVersionId:origin?.baseVersionId??null,originRevision:origin?.revision??null,sourceKey:stableDraftJSON(root.source??null)};
 return initialActiveBasis==='legacy-origin'?{kind:'ipqc-ab-cold-origin-v2',initialActiveBasis:'legacy-origin',...witness}:{kind:'ipqc-ab-cold-origin-v1',...witness};
}

/** Read-only digests; global revision is intentionally not a business lineage. */
export async function abLocalLineage(root:Root,revision:number,catalogKeys:string[],resolve:(value:unknown)=>Promise<unknown>=async value=>value):Promise<AbLocalLineageV1>{
 const keys=[...new Set([...catalogKeys,...Object.keys(root.scopes)])].sort(),groups:AbLocalLineageV1['groups']={},business:unknown[]=[];let businessValid=true;
 for(const key of keys){
  const scope=(root.scopes[key]||{line:key.slice(0,1),group:key.slice(2),activeVersionId:null,versions:[]}) as Scope,active=one(scope.versions,scope.activeVersionId),flow=scope.workflow;
  const activeContent=await resolve(active?.snapshot??empty()),validActive=active!==undefined&&content(activeContent)&&(!active||active.status==='approved');
  if(!validActive)businessValid=false;
  const activeDigest=validActive?await fingerprint(activeContent):'INVALID_ACTIVE';business.push([key,scope.activeVersionId,activeDigest]);
  const origin=flow?scope.coldOrigin:captureAbColdOrigin(root,key,scope);let reason:string|null=null;
  if(!validActive)reason='ACTIVE_IDENTITY_UNSUPPORTED';
  else if(flow&&(!origin||!(origin.kind==='ipqc-ab-cold-origin-v1'&&Object.keys(origin).sort().join(',')==='activeVersionId,generation,kind,originBaseVersionId,originRevision,originVersionId,scope,sourceKey'||origin.kind==='ipqc-ab-cold-origin-v2'&&origin.initialActiveBasis==='legacy-origin'&&Object.keys(origin).sort().join(',')==='activeVersionId,generation,initialActiveBasis,kind,originBaseVersionId,originRevision,originVersionId,scope,sourceKey')||scope.coldOrigin?.generation!==flow.generation))reason='INITIALIZATION_WITNESS_UNAVAILABLE';
  if(origin&&(origin.scope!==key||origin.activeVersionId!==scope.activeVersionId||origin.sourceKey!==stableDraftJSON(root.source??null)))reason='SOURCE_LINEAGE_CHANGED';
  const version=origin?one(scope.versions,origin.originVersionId):undefined;
  const originContent=await resolve(version?.snapshot??empty());
  if(!reason&&(!origin||version===undefined||version&&(version.revision!==origin.originRevision||(version.baseVersionId??null)!==origin.originBaseVersionId||!content(originContent))||!version&&(origin.originRevision!==null||origin.activeVersionId!==null)))reason='ORIGIN_IDENTITY_UNAVAILABLE';
  // Only new module-local adoption records the original legacy initializer,
  // before applying its journal. Historical v1 never gains this exception.
  if(!reason&&flow){const initial=await resolve(flow.active.content),expected=origin?.kind==='ipqc-ab-cold-origin-v2'?originContent:activeContent;if(flow.baseId!==scope.activeVersionId||flow.active.id!==scope.activeVersionId||!content(initial)||await fingerprint(initial)!==await fingerprint(expected))reason='ACTIVE_LINEAGE_CHANGED';}
  const originDigest=reason?null:await fingerprint(originContent),anchor=reason||!origin?null:await fingerprint([key,origin.sourceKey,scope.activeVersionId,activeDigest,origin.originVersionId,origin.originBaseVersionId]);
  groups[key]={generation:flow?.generation??null,anchor,originRevision:reason?null:origin?.originRevision??null,originDigest,reason};
 }
 const moduleDraft=root.moduleDraft,moduleId=moduleDraft?.activeVersionId??null,moduleVersions=moduleId===null?[]:moduleDraft?.versions.filter(v=>v.id===moduleId)||[];let moduleDigest:string|null=null;
 if(moduleId!==null){if(moduleVersions.length!==1||moduleVersions[0].status!=='approved')businessValid=false;else moduleDigest=await fingerprint(await resolve(moduleVersions[0].snapshot));}
 if(moduleDraft?.workflow&&(moduleDraft.workflow.baseId!==moduleId||moduleDraft.workflow.active.id!==moduleId||moduleDigest!==null&&await fingerprint(await resolve(moduleDraft.workflow.active.content))!==moduleDigest))businessValid=false;
 return{kind:'ipqc-ab-local-lineage-v1',revision,businessBase:businessValid?await fingerprint([stableDraftJSON(root.source??null),moduleId,moduleDigest,business]):null,groups};
}
