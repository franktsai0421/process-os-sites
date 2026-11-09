import type {VersionedControl,NumericVersion} from './versioned-shared-workflow';

// Presentation evidence only: metadata reads must not hydrate immutable bodies.
// A superseded shared draft is never approval evidence. Strict BOM reads also
// require an immutable reviewed-case stamp; other consumers retain their policy.
export function approvedVersionEvidence<T>(control:VersionedControl<T>,v:NumericVersion<T>,strict=false){
 const c=control.workflow?.cases.find(c=>c.id===v.id);
 if(c){
  if(strict&&(!['approved','superseded'].includes(v.status)||typeof c.savedId!=='string'||!c.savedId.trim()||typeof c.result?.actor?.id!=='string'||!c.result.actor.id.trim()||typeof c.result.actor.name!=='string'||!c.result.actor.name.trim()||typeof c.result.at!=='string'||!Number.isFinite(Date.parse(c.result.at))))return null;
  if(c.status!=='approved'||v.creatorId!==c.actor.id||v.baseVersionId!==c.baseId||v.createdAt!==c.at)return null;
  return {kind:'approved-case' as const,caseId:c.id,savedId:c.savedId,approvedBy:c.result?.actor.name||null,approvedAt:c.result?.at||null};
 }
 if(v.id.startsWith('shared-')||!['approved','superseded'].includes(v.status))return null;
 const event=v.history?.find(e=>['approve','approved'].includes(e.action)&&e.actorId&&e.at);
 if(event&&(!strict||Number.isFinite(Date.parse(event.at))))return {kind:'legacy-approval' as const,caseId:null,savedId:null,approvedBy:event.actorName||null,approvedAt:event.at};
 // The authoritative current formal pointer is a baseline, not a fabricated review.
 if(v.id===control.activeVersionId)return {kind:'formal-baseline' as const,caseId:null,savedId:null,approvedBy:null,approvedAt:null};
 return null;
}
export function approvedVersions<T>(control:VersionedControl<T>,strict=false){return control.versions.filter(v=>approvedVersionEvidence(control,v,strict));}
export function approvedVersion<T>(control:VersionedControl<T>,id:string,strict=false){
 const v=control.versions.find(v=>v.id===id);if(!v)return null;
 const evidence=approvedVersionEvidence(control,v,strict);if(!evidence)return null;
 const c=evidence.caseId?control.workflow?.cases.find(c=>c.id===evidence.caseId):null;
 // For workflow approvals the immutable case is the source of displayed content,
 // never an unrelated projection or the mutable working aggregate.
 return {...v,status:v.id===control.activeVersionId?'approved':'superseded',...(c?{snapshot:c.content,contentIssues:c.contentIssues}:{}),approvalEvidence:evidence};
}

export type LegacyProcessVersion={id:string;number:number;status:string;category:string;line:string;stages:unknown;creatorId?:string;creatorName?:string;createdAt?:string;updatedAt?:string;history?:{action?:string;actor?:string;actorId?:string;actorName?:string;at?:string}[]};
export function legacyProcessEvidence(v:LegacyProcessVersion){
 if(v.id.startsWith('shared-')||!['approved','superseded'].includes(v.status))return null;
 const event=v.history?.find(e=>['approved','approve'].includes(e.action||'')&&e.at&&(e.actorId||e.actorName||e.actor));
 return event?{kind:'legacy-approval' as const,caseId:null,savedId:null,approvedBy:event.actorName||event.actor||null,approvedAt:event.at||null}:null;
}
export function legacyProcessProjection(v:LegacyProcessVersion){const evidence=legacyProcessEvidence(v);if(!evidence)return null;return {id:'legacy-process:'+v.id,number:v.number,status:'superseded',snapshot:{workspaces:[{id:JSON.stringify([v.category,v.line]),category:v.category,line:v.line,stages:v.stages}]},revision:0,creatorId:v.creatorId||'',creatorName:v.creatorName||'',createdAt:v.createdAt||'',updatedAt:v.updatedAt||'',history:[],category:v.category,line:v.line,approvalEvidence:evidence};}
