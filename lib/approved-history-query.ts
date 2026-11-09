import {DraftConflict} from './shared-draft';

// Exact route/scope opt-in. Presentation reads never adopt, migrate, save or
// weaken writer access. Routing selectors are validated with the envelope.
export function approvedHistoryQuery(request:Request,key:string,scope:string){
 const {pathname,searchParams:q}=new URL(request.url);
 if(!q.has('approvedOnly'))return false;
 const single:Record<string,[string,string]>={
  '/api/bom/workflow':['bomMasterControl','bom'],
  '/api/fqc/workflow':['qualityMasterControl','fqc'],
  '/api/iqc/workflow':['iqcMasterControl','iqc'],
  '/api/tooling/workflow':['toolingMasterControl','tooling'],
  '/api/routine-equipment/workflow':['routineEquipmentControl','routine-equipment'],
  '/api/process-authoring/workflow':['processAuthoringControl','process:platform'],
 };
 const routing:string[]=[];
 let matches=single[pathname]?.[0]===key&&single[pathname]?.[1]===scope;
 if(pathname==='/api/master/workflow'){
  matches=key==='masterDataControl'&&['AB','C','PROCESS'].includes(q.get('scope')||'')&&scope==='master:'+q.get('scope');routing.push('scope');
 }
 if(pathname==='/api/ipqc-ab/workflow'){
  const wholeModule=q.get('module')==='1',group=q.get('scope');
  matches=key==='ipqcABMasterControl'&&(wholeModule?scope==='ipqc-ab:module'&&!q.has('scope'):!!group&&group.length<=500&&!q.has('module')&&scope==='ipqc-ab:'+group);
  routing.push(wholeModule?'module':'scope');
 }
 const listing=q.has('uiHistory'),detail=q.has('versionId'),idLimit=pathname==='/api/ipqc-ab/workflow'&&q.get('module')==='1'?1024:512;
 const allowed=new Set(['approvedOnly','caseMetadata','compact',...routing,...(listing?['uiHistory','versionBefore']:['versionId'])]);
 if(!matches||q.get('approvedOnly')!=='1'||listing===detail||[...q.keys()].some(k=>!allowed.has(k)||q.getAll(k).length!==1)||listing&&q.get('uiHistory')!=='1'||detail&&(!q.get('versionId')||q.get('versionId')!.length>idLimit)||q.has('caseMetadata')&&q.get('caseMetadata')!=='1'||q.has('compact')&&q.get('compact')!=='1'||(q.get('versionBefore')?.length||0)>idLimit)throw new DraftConflict('INVALID_APPROVED_HISTORY_QUERY',422);
 return true;
}
