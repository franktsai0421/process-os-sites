import {approvedVersion,approvedVersionEvidence,approvedVersions} from './approved-history';
import type {AbModuleRoot,AbModuleSnapshot} from './ipqc-ab-module-workflow';
import type {AbSharedScope} from './ipqc-ab-workflow';
import type {NumericVersion} from './versioned-shared-workflow';
export const legacyAbId=(scope:string,id:string)=>'legacy-ab:'+JSON.stringify([scope,id]);
export function parseLegacyAbId(id:string|null){if(!id?.startsWith('legacy-ab:'))return null;try{const value=JSON.parse(id.slice(10));return Array.isArray(value)&&value.length===2&&value.every(v=>typeof v==='string'&&v.length>0&&v.length<500)?{scope:value[0] as string,id:value[1] as string}:null;}catch{return null;}}
// A read-only union. Never append these projection IDs/cases to stored controls.
export function abApprovedMetadata(root:AbModuleRoot,strict=false){
 const moduleControl=root.moduleDraft,ids=new Set(moduleControl?.versions.map(v=>v.id)||[]);
 const legacy=Object.entries(root.scopes).flatMap(([key,s])=>approvedVersions(s as AbSharedScope,strict).filter(v=>!strict||approvedVersionEvidence(s as AbSharedScope,v,true)?.kind!=='formal-baseline').filter(v=>!ids.has(v.id)&&!(v as NumericVersion<unknown>&{wholeModuleCaseId?:string}).wholeModuleCaseId).map(v=>({id:legacyAbId(key,v.id),number:v.number,status:v.status,creatorName:v.creatorName,createdAt:v.createdAt,sourceScope:key,sourceVersionId:v.id,approvalEvidence:approvedVersionEvidence(s as AbSharedScope,v,strict)})));
 const modern=(moduleControl?approvedVersions(moduleControl,strict).filter(v=>!strict||approvedVersionEvidence(moduleControl,v,true)?.kind!=='formal-baseline'):[]).map(v=>({id:v.id,number:v.number,status:v.status,creatorName:v.creatorName,createdAt:v.createdAt,approvalEvidence:approvedVersionEvidence(moduleControl!,v,strict)}));
 return [...legacy,...modern].reverse();
}
export function legacyAbVersion(root:AbModuleRoot,id:string,strict=false){const selected=parseLegacyAbId(id),scope=selected&&Object.hasOwn(root.scopes,selected.scope)?root.scopes[selected.scope]:null;if(!selected||!scope||root.moduleDraft?.versions.some(v=>v.id===selected.id))return null;const v=approvedVersion(scope as AbSharedScope,selected.id,strict);if(!v||strict&&v.approvalEvidence.kind==='formal-baseline'||(v as typeof v&{wholeModuleCaseId?:string}).wholeModuleCaseId)return null;
 const snapshot:AbModuleSnapshot={scopes:{[selected.scope]:v.snapshot},bases:{[selected.scope]:v.baseVersionId||null}};
 return {...v,id,sourceVersionId:v.id,sourceScope:selected.scope,snapshot};
}
