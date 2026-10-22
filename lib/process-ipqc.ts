import {DraftConflict,stableDraftJSON,type DraftIssue} from './shared-draft';
import type {Workspace,Operation} from './process-authoring-workflow';
import type {AbControl,AbError} from './ipqc-ab';
import type {IpqcControl,IpqcError} from './ipqc-c';

export type IPQCAssignment={source:'AB'|'C';scope:string;itemId:string;sourceVersionId:string;productCodes:string[]};
type Product={code:string;line:string;category:string;stages:string[]};
export type IPQCChoice=IPQCAssignment&{code:string;errorId:string;errorCode:string;errorName:string;standard:string;description:string;inspection:string;equipment:unknown;rules:unknown[];frequency:string;photos:{id:string;name:string;note:string}[]};
const read=<T>(values:Record<string,string>,key:string,fallback:T):T=>values[key]?JSON.parse(values[key]):fallback;
export const assignmentKey=(a:Pick<IPQCAssignment,'source'|'scope'|'itemId'>)=>JSON.stringify([a.source,a.scope,a.itemId]);
const operationNumber=(op:Operation)=>typeof op.number==='string'||typeof op.number==='number'?String(op.number):op.id;
export function ipqcChoices(values:Record<string,string>,w:Pick<Workspace,'line'|'category'>,stage:string,selected:string[]){
 const master=read(values,'masterDataControl',{active:{} as Record<string,{products?:Product[]}>});
 const source=w.line==='C'?'C':'AB',scope=source==='C'?'C':`${w.line}:${w.category}`;
 const products=(master.active?.[source]?.products||[]).filter(p=>p.line===w.line&&p.category===w.category&&p.stages?.includes(stage)&&selected.includes(p.code)).map(p=>p.code);
 const choices:IPQCChoice[]=[];
 if(source==='AB'){
  const control=read<AbControl|null>(values,'ipqcABMasterControl',null),s=control?.scopes?.[scope],v=s?.versions.find(v=>v.id===s.activeVersionId&&v.status==='approved');
  if(!v)return{source,scope,reason:'SOURCE_NOT_APPROVED',choices};
  if(!Array.isArray(v.snapshot?.items)||!Array.isArray(v.snapshot?.errors))throw Error('IPQC_SOURCE_UNAVAILABLE');
  for(const i of v.snapshot.items){const e=v.snapshot.errors.find((e:AbError)=>e.id===i.errorId&&!e.deleted&&e.stageCode===stage&&e.line===w.line&&e.group===w.category),codes=i.productCodes.filter(p=>products.includes(p));
   if(!e||i.deleted||!i.isEnabled||!codes.length)continue;
   choices.push({source,scope,itemId:i.id,sourceVersionId:v.id,productCodes:codes,code:i.code,errorId:e.id,errorCode:e.code,errorName:e.name,standard:i.standard,description:i.methodText,inspection:[i.sourceTool,i.sourceMethod].filter(Boolean).join(' · '),equipment:i.equipmentSnapshot,rules:i.rules,frequency:i.sourceFrequency||'',photos:[...i.standardPhotos,...i.methodPhotos]});
  }
 }else{
  const c=read<IpqcControl|null>(values,'ipqcCMasterControl',null),v=c?.versions.find(v=>v.id===c.activeVersionId&&v.status==='approved');
  if(!v)return{source,scope,reason:'SOURCE_NOT_APPROVED',choices};
  if(!Array.isArray(v.snapshot?.items)||!Array.isArray(v.snapshot?.errors))throw Error('IPQC_SOURCE_UNAVAILABLE');
  for(const i of v.snapshot.items){const e=v.snapshot.errors.find((e:IpqcError)=>e.id===i.errorId&&!e.deleted&&e.stageCode===stage&&e.productCode===i.productCode);
   if(!e||i.deleted||i.notApplicable||!i.standardEnabled||i.stageCode!==stage||!products.includes(i.productCode))continue;
   choices.push({source,scope,itemId:i.id,sourceVersionId:v.id,productCodes:[i.productCode],code:i.code,errorId:e.id,errorCode:e.code,errorName:e.name,standard:i.standard,description:i.description,inspection:[i.tool,i.method].filter(Boolean).join(' · '),equipment:i.equipmentSnapshot,rules:i.rule?[i.rule]:[],frequency:i.frequency,photos:i.mediaItems});
  }
 }
 return{source,scope,reason:products.length?choices.length?'':'NO_MATCHING_ITEMS':'NO_PRODUCTS',choices};
}
export const assignments=(op:Operation):IPQCAssignment[]=>op.ipqcAssignments as IPQCAssignment[]||[];
export function validateIPQCAssignments(workspaces:Workspace[],previous:Workspace[],values:Record<string,string>){
 for(const w of workspaces)for(const [stage,ops]of Object.entries(w.stages)){
  const occupied=new Map<string,Operation>();
  for(const op of ops){
   if(op.ipqcAssignments!==undefined&&!Array.isArray(op.ipqcAssignments))throw new DraftConflict('IPQC_ASSIGNMENT_INVALID',422);
   const old=previous.find(p=>p.id===w.id)?.stages[stage]?.find(p=>p.id===op.id);
   let choices:IPQCChoice[]|undefined;
   for(const a of assignments(op)){
    if(!a||!['AB','C'].includes(a.source)||typeof a.scope!=='string'||!a.scope||typeof a.itemId!=='string'||!a.itemId||typeof a.sourceVersionId!=='string'||!a.sourceVersionId||!Array.isArray(a.productCodes)||a.productCodes.some(p=>typeof p!=='string'))throw new DraftConflict('IPQC_ASSIGNMENT_INVALID',422);
    const key=assignmentKey(a),owner=occupied.get(key);
    if(owner)throw new DraftConflict(`IPQC_ALREADY_ASSIGNED: ${operationNumber(owner)} · ${owner.name}`,409);
    occupied.set(key,op);
    // Preserve an unchanged historical link, even if its source/route was removed.
    if(old&&assignments(old).some(p=>stableDraftJSON(p)===stableDraftJSON(a)))continue;
    choices??=ipqcChoices(values,w,stage,op.productCodes).choices;
    const choice=choices.find(c=>assignmentKey(c)===key&&c.sourceVersionId===a.sourceVersionId);
    if(!choice||stableDraftJSON([...choice.productCodes].sort())!==stableDraftJSON([...a.productCodes].sort()))throw new DraftConflict('IPQC_SOURCE_CHANGED: Nguồn hoặc sản phẩm đã thay đổi / 來源或適用產品已變更，請重新選取',409);
   }
  }
 }
}
export function ipqcIssues(workspaces:Workspace[],values:Record<string,string>):DraftIssue[]{
 const issues:DraftIssue[]=[];
 for(const w of workspaces)for(const [stage,ops]of Object.entries(w.stages)){
  const found=ipqcChoices(values,w,stage,[...new Set(ops.flatMap(o=>o.productCodes||[]))]);
  const all=ops.flatMap(assignments),path:DraftIssue['path']=['workspaces',{id:w.id},'stages',stage];
  if(values[w.line==='C'?'ipqcCMasterControl':'ipqcABMasterControl']&&ops.some(o=>o.productCodes?.length)&&found.reason==='SOURCE_NOT_APPROVED')issues.push({kind:'missing',path,message:'IPQC_SOURCE_NOT_APPROVED'});
  for(const c of found.choices)if(!all.some(a=>assignmentKey(a)===assignmentKey(c)))issues.push({kind:'missing',path,message:'IPQC_UNASSIGNED:'+c.code});
  for(const op of ops)for(const a of assignments(op)){
   const c=ipqcChoices(values,w,stage,op.productCodes).choices.find(c=>assignmentKey(c)===assignmentKey(a));
   if(!c||c.sourceVersionId!==a.sourceVersionId||stableDraftJSON([...c.productCodes].sort())!==stableDraftJSON([...a.productCodes].sort()))issues.push({kind:'missing',path:[...path,{id:op.id}],message:'IPQC_REFERENCE_CHANGED:'+a.itemId});
  }
 }
 return issues;
}
export type ProcessReference={source:string;scope:string;itemId:string;line:string;category:string;stage:string;operationId:string;number:string;name:string;versionId:string;versionNumber:number|string;status:string;saved:boolean;productCodes:string[]};
export function referencesFor(workspaces:Workspace[],version:{id:string;number:number|string;status:string;saved:boolean}):ProcessReference[]{
 return workspaces.flatMap(w=>Object.entries(w.stages).flatMap(([stage,ops])=>ops.flatMap(op=>assignments(op).map(a=>({source:a.source,scope:a.scope,itemId:a.itemId,line:w.line,category:w.category,stage,operationId:op.id,number:operationNumber(op),name:op.name,versionId:version.id,versionNumber:version.number,status:version.status,saved:version.saved,productCodes:a.productCodes})))));
}
export function legacyWorkspace(value:{category:string;line:string;stages:Workspace['stages']}):Workspace{return{...value,id:JSON.stringify([value.category,value.line])};}
