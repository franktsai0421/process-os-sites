import {env} from 'cloudflare:workers';
import {approvedVersion,approvedVersionEvidence,approvedVersions} from './approved-history';
import {recordJSONResponse} from './state-records-response';
import type {VersionedControl,NumericVersion,WorkflowAdapter} from './versioned-shared-workflow';
import type {SharedDraft} from './shared-draft';
type Snapshot=Record<string,unknown>;
type Page='AB'|'C'|'LINES';
type Root={versions:(NumericVersion<Snapshot>&{scope:string})[];workflowScopes?:Record<string,SharedDraft<Snapshot>>};
const owner=(page:Page)=>page==='LINES'?'LINES':page+'.catalog';
export const legacyMasterPageId=(page:Page,sourceScope:string,id:string)=>'legacy-master-page:'+JSON.stringify([page,sourceScope,id]);
export function parseLegacyMasterPageId(id:string){if(!id.startsWith('legacy-master-page:'))return null;try{const row=JSON.parse(id.slice(19));return Array.isArray(row)&&row.length===3&&['AB','C','LINES'].includes(row[0])&&['AB','C'].includes(row[1])&&typeof row[2]==='string'&&row[2].length>0&&row[2].length<=500?{page:row[0] as Page,scope:row[1] as string,id:row[2] as string}:null;}catch{return null;}}
// Projection identities exist only in responses. No page baseline, writer,
// combined LINES approval, or persistent alias is created from legacy history.
export function createMasterPageApprovedHistory(page:Page,getRoot:()=>unknown):NonNullable<WorkflowAdapter<Snapshot,VersionedControl<Snapshot>>['approvedHistory']>{
 const control=(scope:string):VersionedControl<Snapshot>=>{const root=getRoot() as Root;return {versions:root.versions.filter(v=>v.scope===scope),activeVersionId:root.workflowScopes?.[scope]?.active.id||null,workflow:root.workflowScopes?.[scope]};};
 const rows=()=>{
  const modern=control(owner(page)),modernIds=new Set(modern.versions.map(v=>v.id));
  const metadata=(c:VersionedControl<Snapshot>)=>{const counts=new Map<string,number>();for(const row of c.versions)counts.set(row.id,(counts.get(row.id)||0)+1);return approvedVersions(c,true).filter(v=>counts.get(v.id)===1&&approvedVersionEvidence(c,v,true)?.kind!=='formal-baseline').map(v=>({id:v.id,number:v.number,status:v.id===c.activeVersionId?'approved':'superseded',creatorName:v.creatorName,createdAt:v.createdAt,approvalEvidence:approvedVersionEvidence(c,v,true)}));};
  const legacy=(page==='LINES'?['AB','C']:[page]).flatMap(scope=>metadata(control(scope)).filter(v=>!modernIds.has(legacyMasterPageId(page,scope,v.id))).map(v=>({...v,id:legacyMasterPageId(page,scope,v.id),sourceScope:'master:'+scope,sourceVersionId:v.id,sourcePart:scope})));
  return [...legacy,...metadata(modern)].reverse();
 };
 return {metadata:rows,async version(id){
  const row=rows().find(row=>row.id===id);if(!row)return null;
  const selected=parseLegacyMasterPageId(id);
  if(!selected)return approvedVersion(control(owner(page)),id,true);
  if(selected.page!==page||page!=='LINES'&&selected.scope!==page)return null;
  const original=approvedVersion(control(selected.scope),selected.id,true);if(!original||original.approvalEvidence.kind==='formal-baseline')return null;
  // Exactly one chosen legacy body; metadata above never visits snapshots.
  const body=JSON.parse(await recordJSONResponse({snapshot:original.snapshot},env.STATE_ARCHIVE,{}).text()).snapshot as Snapshot;
  if(!body||typeof body!=='object'||Array.isArray(body))return null;
  const snapshot=page==='LINES'?{[selected.scope]:{lines:body.lines}}:{products:body.products,...(Object.hasOwn(body,'categoryGroups')?{categoryGroups:body.categoryGroups}:{})};
  return {...original,id,sourceScope:'master:'+selected.scope,sourceVersionId:selected.id,snapshot};
 }};
}
