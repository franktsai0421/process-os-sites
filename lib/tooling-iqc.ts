import type {IqcControl,IqcPart} from './iqc';
import type {ToolingSnapshot} from './tooling';
import type {DraftIssue} from './shared-draft';
export type ToolingIqcPart=IqcPart&{sourceStatus:'active'|'disabled'|'removed';sourceVersionId:string};
export function toolingIqcSource(control:Pick<IqcControl,'activeVersionId'|'versions'>){
 const active=control.versions.find(v=>v.id===control.activeVersionId&&v.status==='approved');
 if(!active)return null;
 const parts:ToolingIqcPart[]=active.snapshot.parts.map(p=>({...p,sourceStatus:p.isDeleted?'removed':p.isEnabled===false?'disabled':'active',sourceVersionId:active.id}));
 const ids=new Set(parts.map(p=>p.id));
 for(const version of control.versions.filter(v=>['approved','superseded'].includes(v.status)).slice().sort((a,b)=>b.number-a.number))for(const p of version.snapshot.parts)if(!ids.has(p.id)){ids.add(p.id);parts.push({...p,sourceStatus:'removed',sourceVersionId:version.id});}
 return {versionId:active.id,parts,categories:active.snapshot.categories,suppliers:active.snapshot.suppliers};
}
export function toolingIqcIssues(content:ToolingSnapshot,parts:Pick<ToolingIqcPart,'id'|'sourceStatus'>[]):DraftIssue[]{
 const available=new Set(parts.filter(p=>p.sourceStatus==='active').map(p=>p.id));
 return content.tools.flatMap(t=>t.iqcIds.filter(id=>!available.has(id)).map(id=>({kind:'missing' as const,code:'TOOLING_IQC_SOURCE_UNAVAILABLE',path:['tools',{id:t.id},'iqcIds'],message:(parts.some(p=>p.id===id&&p.sourceStatus==='disabled')?'IQC đã ngưng / IQC 已停用':'IQC đã bị gỡ; cần đối chiếu lại / IQC 來源已移除／待重新對應')+' · '+id})));
}
