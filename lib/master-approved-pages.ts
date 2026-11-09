import {cloneDraft,DraftConflict,sameDraftValue} from './shared-draft';
type Root={active?:Record<string,Record<string,unknown>>;versions?:Record<string,unknown>[];workflowScopes?:Record<string,{active?:{id?:string}}>};
// An approved reference composition is not a new immutable approved version.
// Each source points to its own original page version and exact snapshot.
export function approvedMasterPageCatalog(root:Root,page:'AB'|'C') {
  const approved=(scope:string)=>{
    const content=root.active?.[scope],id=root.workflowScopes?.[scope]?.active?.id;
    const versions=root.versions?.filter(version=>version.scope===scope&&version.status==='approved'&&sameDraftValue(version.snapshot,content))||[];
    const version=id?versions.find(entry=>entry.id===id):versions.length===1?versions[0]:null;
    if(!content||!version||typeof version.id!=='string'||!version.id||root.versions!.filter(entry=>entry.id===version.id).length!==1)
      throw new DraftConflict('MASTER_EFFECTIVE_BASELINE_CONFLICT',409);
    return {content,id:version.id};
  };
  const catalog=approved(page+'.catalog'),lines=approved('LINES'),partition=lines.content[page] as Record<string,unknown>|undefined;
  if(!Array.isArray(catalog.content.products)||!Array.isArray(catalog.content.categoryGroups)||!Array.isArray(partition?.lines))
    throw new DraftConflict('MASTER_EXISTING_DATA_INVALID',422);
  return {kind:'approved-page-composition-v1' as const,sources:{catalog:{scope:'master:'+page+'.catalog',versionId:catalog.id},
    lines:{scope:'master:LINES',versionId:lines.id}},content:cloneDraft({...catalog.content,lines:partition.lines})};
}
