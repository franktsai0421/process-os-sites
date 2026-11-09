import {can} from './process-state';
import {applyDraftCommand,cloneDraft,DraftConflict,stableDraftJSON,type DraftPatch} from './shared-draft';
import {effectiveVersion,type VersionedControl,type WorkflowAdapter,type ModuleDraftCommand} from './versioned-shared-workflow';
import * as Bom from '../public/process/bom-domain.mjs';

export type BomRow={id:string;parentId:string|null;rootCode:string;level:number;levelLabel:string;ordinal:string;itemCode:string;itemName:string;specification:string;unit:string;quantity:string;denominator:string;waste:string;path:{ordinal:string;itemCode:string}[];source?:unknown};
export type BomSnapshot={bom:Record<string,BomRow[]>;referenceIssues:unknown[]};
export type BomControl=VersionedControl<BomSnapshot>&{schemaVersion:1};
export const emptyBom=():BomSnapshot=>({bom:{},referenceIssues:[]});
export function parseBom(raw?:string,prepared?:unknown):BomControl {
 const value=(prepared||(raw?JSON.parse(raw):{schemaVersion:1,activeVersionId:null,versions:[]})) as BomControl;
 if(value.schemaVersion!==1||!Array.isArray(value.versions))throw new DraftConflict('BOM_CONTROL_INVALID',422);
 return value;
}
const guarded=(command:{guards?:{path:unknown[];value?:unknown}[]},path:unknown[])=>command.guards?.some(g=>stableDraftJSON(g.path)===stableDraftJSON(path));
export const bomWorkflowAdapter:WorkflowAdapter<BomSnapshot,BomControl>={
 key:'bomMasterControl',scope:'bom',parse:parseBom,empty:emptyBom,preparedModel:true,permissionOnlyRead:true,photoPrefix:'',photoIds:()=>[],
 async access(request,state,p){return {...p,history:p.view,import:p.edit&&await can(request,state,'bom.exchange')};},
 context(control,state,base){return {...base,activeId:control.activeVersionId,semantic:s=>Bom.semantic(s.bom),
  structure(s){try{Bom.validate(s.bom);s.referenceIssues=Bom.auditReferences(state.values,s.bom);}catch(e){throw new DraftConflict((e as Error).message,422);}},
  validate(s){return Bom.auditReferences(state.values,s.bom).map((issue:{path:string;root:string;reference:string;status:string})=>({kind:'missing' as const,code:'BOM_REFERENCE_REVIEW',path:['bom'],message:issue.status+' · '+issue.root+' · '+issue.reference+' · '+issue.path}));}
 };},
 beforeCommand(_control,command,state){
  // The ordinary shared-state endpoint may not mutate this catalog during an import/review.
  if(command.action==='approve'&&state.values.maintenanceMode==='1')throw new DraftConflict('MAINTENANCE',503);
 },
 projectValues(control):Record<string,string>{const active=effectiveVersion(control);return active?{bomOverrides:JSON.stringify({__format:'PROCESS_OS_BOM_OCCURRENCES_V3',replaceAll:true,data:active.snapshot.bom})}:{};},
 async apply(control,command,context){
  const flow=control.workflow!;
  if(flow.receipts[command.operationId])return applyDraftCommand(flow,command,context);
  if(command.action==='save'&&command.moduleAction==='save-local-v1'){
   if(!context.allowed('edit'))throw new DraftConflict('FORBIDDEN',403);
   const operations=command.input?.operations;
   if(command.patches!==undefined||command.guards!==undefined||!Array.isArray(operations)||operations.length>4096)throw new DraftConflict('BOM_LOCAL_SAVE_INVALID',422);
   // Optional BOM-only occurrence plan. Original operations/digests stay on
   // the wire; derive the candidate again here before the existing one-CAS Save.
   if(command.input?.reconciliation!==undefined){
    const proof=command.input.reconciliation as {base?:unknown;candidateDigest?:unknown;decision?:unknown};
    if(Object.keys(command.input).some(key=>!['operations','reconciliation'].includes(key))||!proof||typeof proof!=='object'||Array.isArray(proof)||Object.keys(proof).some(key=>!['base','candidateDigest','decision'].includes(key))||!Object.hasOwn(proof,'base')||!Object.hasOwn(proof,'candidateDigest')||typeof proof.candidateDigest!=='string'||!/^[a-f0-9]{64}$/.test(proof.candidateDigest))throw new DraftConflict('BOM_OCCURRENCE_PLAN_INVALID',422);
    if(command.expectedRevision===undefined||command.expectedRevision!==flow.revision)throw new DraftConflict('DRAFT_REVISION_CHANGED_RECONFIRM',409);
    if(!context.allowed('import' as never))throw new DraftConflict('FORBIDDEN',403);
    let next;
    try{next=(await Bom.reconcileOccurrenceSave(proof.base,operations,flow.working.bom,proof.decision)).next;}catch(e){throw new DraftConflict((e as Error).message,409);}
    if(await Bom.candidateDigest(next)!==proof.candidateDigest)throw new DraftConflict('BOM_OCCURRENCE_CANDIDATE_CHANGED',409);
    const fingerprint=context.commandFingerprint||stableDraftJSON(command),applied=applyDraftCommand(flow,{...command,action:'apply',expectedRevision:undefined,patches:[{op:'set',path:['bom'],value:next}]},{...context,commandFingerprint:fingerprint});
    return applyDraftCommand({...applied.state,receipts:flow.receipts,sequences:flow.sequences},{...command,expectedRevision:undefined},{...context,commandFingerprint:fingerprint});
   }
   // Replay the confirmed operations against request-local state only. Each
   // original field guard/import digest checks the result of the preceding op.
   // The route persists only the final Save through its existing single CAS.
   const staged={...control,workflow:flow},fingerprint=context.commandFingerprint||stableDraftJSON(command);
   for(const operation of operations){
    if(!operation||typeof operation!=='object'||Array.isArray(operation)||Object.keys(operation).some(key=>!['patches','guards','moduleAction','input'].includes(key)))throw new DraftConflict('BOM_LOCAL_SAVE_INVALID',422);
    if(operation.moduleAction!==undefined&&operation.moduleAction!=='import-digiwin')throw new DraftConflict('BOM_ACTION_INVALID',422);
    const applied=await bomWorkflowAdapter.apply(staged,{...operation,...command,action:'apply',moduleAction:operation.moduleAction,input:operation.input,patches:operation.patches,guards:operation.guards,expectedRevision:undefined} as ModuleDraftCommand,{...context,commandFingerprint:fingerprint});
    staged.workflow={...applied.state,receipts:flow.receipts,sequences:flow.sequences};
   }
   // expectedRevision, if supplied, applies to the original request basis.
   if(command.expectedRevision!==undefined&&command.expectedRevision!==flow.revision)throw new DraftConflict('DRAFT_REVISION_CHANGED_RECONFIRM',409);
   return applyDraftCommand(staged.workflow,{...command,expectedRevision:undefined},{...context,commandFingerprint:fingerprint});
  }
  if(command.moduleAction&&command.action!=='apply')throw new DraftConflict('BOM_ACTION_INVALID',422);
  if(command.action!=='apply')return applyDraftCommand(flow,command,context);
  let patches:DraftPatch[];
  if(command.moduleAction==='import-digiwin'){
   if(!context.allowed('import' as never))throw new DraftConflict('FORBIDDEN',403);
   const input=command.input as {sheets?:{name:string;rows:unknown[][]}[];file?:string;base?:unknown;baseDigest?:string;importMode?:string;decisions?:{decision:string;value?:string}[];initialize?:boolean};
   if(!input?.sheets||!Array.isArray(input.decisions))throw new DraftConflict('BOM_IMPORT_REQUIRED',422);
   if(input.importMode!==undefined&&input.importMode!=='incremental-v1')throw new DraftConflict('BOM_IMPORT_MODE_INVALID',422);
   if(input.baseDigest!==undefined?(!/^[a-f0-9]{64}$/.test(input.baseDigest)||input.baseDigest!==await Bom.semanticDigest(flow.working.bom)):stableDraftJSON(input.base)!==stableDraftJSON(Bom.semantic(flow.working.bom)))throw new DraftConflict('BOM_IMPORT_BASE_CHANGED',409);
   if(input.initialize&&(control.activeVersionId||Object.keys(flow.working.bom).length))throw new DraftConflict('BOM_INITIALIZATION_ALREADY_STARTED',409);
   let incoming,batch,next;
   try{
    incoming=Bom.parseMatrices(input.sheets,{file:input.file});
    batch=Bom.compare(flow.working.bom,incoming,{replaceAll:!!input.initialize,incremental:input.importMode==='incremental-v1'});
    if(batch.changes.length!==input.decisions.length)throw Error('BOM_IMPORT_DECISIONS_CHANGED');
    batch.changes.forEach((change:Record<string,unknown>,i:number)=>{change.decision=input.decisions![i].decision;change.value=input.decisions![i].value;});
    // Already-open clients retain their original comparison/operation IDs.
    // Their accepted group updates still cannot delete omitted occurrences.
    if(!input.initialize&&input.importMode===undefined)for(const change of batch.changes)if(change.kind==='structure')change.after=Bom.mergeOccurrences(change.before,change.after);
    next=Bom.applyComparison(flow.working.bom,batch);
   }catch(e){throw new DraftConflict((e as Error).message,422);}
   patches=[{op:'set',path:['bom'],value:next}];
  }else{
   if(command.moduleAction)throw new DraftConflict('BOM_ACTION_INVALID',422);
   patches=cloneDraft(command.patches||[]);
   for(const patch of patches){
    const [collection,root,index,field]=patch.path;
    if(patch.op!=='set'||collection!=='bom'||typeof root!=='string'||!index||typeof index==='string'||typeof field!=='string'||patch.path.length!==4||!Bom.editableFields.includes(field))throw new DraftConflict('BOM_MANUAL_STRUCTURE_FORBIDDEN',422);
    const row=flow.working.bom[root]?.find(r=>r.id===index.id);
    if(!row||row.level>1&&Bom.numericFields.includes(field)||typeof patch.value!=='string')throw new DraftConflict('BOM_EDIT_FIELD_INVALID',422);
    if(!guarded(command,patch.path))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
   }
  }
  return applyDraftCommand(flow,{...command,patches},{...context,commandFingerprint:context.commandFingerprint||stableDraftJSON(command)});
 }
};
