import {cloneDraft,DraftConflict,sameDraftValue} from './shared-draft';
import {assertMasterPageContent} from './master-page-boundary';
type Page='AB'|'C'|'LINES';
type Root={active?:Record<string,Record<string,unknown>>;versions?:Record<string,unknown>[];workflowScopes?:Record<string,{active?:{id?:string|null;content?:unknown}}>};
// Every referenced owner is independently resolved against its own original
// approved body, pointer and unique version identity. A companion active value
// alone is never approval evidence, even when the requested page is consistent.
export function approvedMasterPageSource(root:Root,page:Page) {
 const scope=page==='LINES'?'LINES':page+'.catalog',content=root.active?.[scope],flow=root.workflowScopes?.[scope],id=flow?.active?.id;
 const fail=():never=>{throw new DraftConflict('MASTER_EFFECTIVE_BASELINE_CONFLICT',409);};
 if(flow&&(!flow.active||typeof id!=='string'||!id||!Object.hasOwn(flow.active,'content')))fail();
 const versions=root.versions?.filter(version=>version.scope===scope&&version.status==='approved'&&sameDraftValue(version.snapshot,content))||[];
 const version=id?versions.find(entry=>entry.id===id):versions.length===1?versions[0]:null;
 if(!content||!version||typeof version.id!=='string'||!version.id||root.versions!.filter(entry=>entry.id===version.id).length!==1||flow&&!sameDraftValue(flow.active!.content,content))fail();
 assertMasterPageContent(page,content!);
 return {scope:'master:'+scope,content:cloneDraft(content!),versionId:version!.id as string};
}
// This reference composition is not a new immutable approved version.
export function approvedMasterPageCatalog(root:Root,page:'AB'|'C') {
 const catalog=approvedMasterPageSource(root,page),lines=approvedMasterPageSource(root,'LINES'),partition=lines.content[page] as Record<string,unknown>;
 return {kind:'approved-page-composition-v1' as const,sources:{catalog:{scope:catalog.scope,versionId:catalog.versionId},
   lines:{scope:lines.scope,versionId:lines.versionId}},content:cloneDraft({...catalog.content,lines:partition.lines})};
}
