import { calibrationEquipmentDependency } from './equipment-catalog.mjs';
import { DraftConflict, sameDraftValue } from './shared-draft';

// Transport view used only by the equipment dialog. It still follows a fresh
// permission check and the original operation's receipt for settlement.
export function equipmentTransferMetadata(control:{
  activeVersionId?:string|null;versions:{id:string;revision?:number;status:string}[];
  workflow?:{scope:string;generation:string;revision:number;pendingId:string|null;saved?:{id:string}|null};
}) {
  const flow=control.workflow;
  return {activeVersionId:control.activeVersionId??null,
    versions:control.versions.filter(v=>v.id===control.activeVersionId||['draft','pending','pending-test'].includes(v.status))
      .map(({id,revision,status})=>({id,revision,status})),
    workflow:flow?{scope:flow.scope,generation:flow.generation,revision:flow.revision,pendingId:flow.pendingId,
      saved:flow.saved?{id:flow.saved.id}:null}:null};
}
export const equipmentTransferView=(request:Request)=>request.headers.get('X-Process-Equipment-Transfer')==='metadata-v1';

export function equipmentTransferRead(request:Request){
  if(!equipmentTransferView(request))return false;
  const query=new URL(request.url).searchParams;
  return [...query.keys()].every(key=>['caseMetadata','compact','module','operationId','accessEvent'].includes(key)&&query.getAll(key).length===1);
}

export type TransferProof={revision:number;reverseKeys:string[]};
type ReceiptRecord={result:{generation:string;savedId:string|null};equipmentTransfer?:TransferProof};
type Version = {id:string;status:string;snapshot?:unknown;baseVersionId?:string|null;wholeModuleCaseId?:string};
type Control = {activeVersionId?:string|null;versions?:Version[];workflow?:{working?:unknown;contributors?:Record<string,unknown>;saved?:{id?:string;content?:unknown}|null;generation?:string;receipts?:Record<string,ReceiptRecord>;active?:{id?:string|null;content?:unknown};pendingId?:string|null}};
type GroupRoot = {scopes?:Record<string,Control>;moduleDraft?:Control};

export type TransferDraftState = 'ready'|'pending'|'open-required'|'unverified';

// The native shared Save includes previously applied edits in every covered AB group.
// Check the complete scope and its approved bases before accepting that Save.
export function transferDraftState(control:Control|undefined, ab?:GroupRoot):TransferDraftState {

  const pending=(c:Control)=>!!c.workflow?.pendingId||c.versions?.some(v=>v.status==='pending'||v.status==='pending-test');
  if (control && pending(control)) return 'pending';
  if (ab && (!ab.scopes || Object.values(ab.scopes).some(group=>!Array.isArray(group.versions)))) return 'unverified';
  if (ab && Object.values(ab.scopes!).some(pending)) return 'pending';
  if (!control || !Array.isArray(control.versions)) return 'open-required';
  const flow=control.workflow;
  if (!flow || !control.versions.some(v=>v.status==='draft')) return 'open-required';
  const baseline=flow.saved ? flow.saved.content : flow.active?.content;
  if (!record(baseline) || !record(flow.working)) return 'unverified';
  if (!ab && (!Array.isArray(baseline.items)||!Array.isArray(baseline.errors))) return 'unverified';
  if (!record(flow.contributors)) return 'unverified';
  if (!ab && (!Array.isArray(flow.working.items)||!Array.isArray(flow.working.errors))) return 'unverified';
  if (ab) {
    if(!record(baseline.scopes)||!record(baseline.bases))return 'unverified';
    const bases:Record<string,unknown>={};
    for (const [key,g] of Object.entries(ab.scopes!)) {
      const active=g.versions!.find(v=>v.id===g.activeVersionId&&v.status==='approved');
      const draft=g.versions!.find(v=>v.status==='draft');
      if ((g.activeVersionId&&!active) || (draft&&!draft.snapshot) || (active&&!active.snapshot) || (g.workflow&&!g.workflow.working)) return 'unverified';
      const content=g.workflow?.working??draft?.snapshot??active?.snapshot??{errors:[],items:[]};
      if (!record(content)||!Array.isArray(content.errors)||!Array.isArray(content.items)) return 'unverified';
      // On module approval the case carries its prior group bases, while
      // each newly approved group is stamped with that case's ID. Only this
      // exact native projection may reconcile the system-owned basis here.
      const approvedByModule=!flow.saved && !!active && !!flow.active?.id &&
        active.id===flow.active.id && active.wholeModuleCaseId===active.id &&
        active.baseVersionId===baseline.bases[key] && sameDraftValue(active.snapshot,baseline.scopes[key]);
      bases[key]=approvedByModule?active.baseVersionId:g.activeVersionId??null;
    }
    if (!sameDraftValue(bases,baseline.bases)) return 'unverified';
  }
  return 'ready';
}

export function requireTransferDraft(revision:number,expected:number,state:TransferDraftState, opening=false) {
  if (!Number.isSafeInteger(expected) || expected<1 || expected!==revision || state!==(opening?'open-required':'ready'))
    throw new DraftConflict('DRAFT_REVISION_CHANGED_RECONFIRM',409,{transferDraft:state});
}

// First adoption has no workflow generation yet. Bind it to the same fenced
// snapshot as the preview so a lost response can replay the original Save.
export function firstTransferGeneration(scope:string,revision:number) {
  return 'equipment-transfer-'+scope+'-'+revision;
}

export function transferChoiceKey(scope:string,itemId:string,from:string,to:string) {
  return JSON.stringify([scope,itemId,from,to]);
}

export function reversibleTransferRows(control:Control|undefined,revision:number):Set<string> {
  const flow=control?.workflow;
  if (flow?.saved?.id) for (const record of Object.values(flow.receipts??{})) {
    if (record.equipmentTransfer?.revision===revision && record.result.generation===flow.generation && record.result.savedId===flow.saved.id)
      return new Set(record.equipmentTransfer.reverseKeys);
  }
  return new Set();
}

const record=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
const invalid=():never=>{throw new DraftConflict('INVALID_LOCAL_SAVE',422);};
function fields(body:Record<string,unknown>,allowed:string[]) {
  if(Object.keys(body).some(key=>!allowed.includes(key)))invalid();
}

export function planCleanTransfer(module:string,control:Control,ab:GroupRoot|undefined,command:unknown,revision:number,catalogRaw:string|undefined):TransferProof {
  if(!record(command)||command.action!=='save')return invalid();
  const common=['action','clientId','operationId','sequence','generation','expectedRevision','equipmentTransferRevision','equipmentTransferOpen'];
  const lists:{scope:string;patches:unknown;guards:unknown}[]=[];
  const collect=(scope:string,changes:unknown)=>{
    if(!Array.isArray(changes)||!changes.length)return invalid();
    for(const change of changes) {
      if(!record(change))return invalid();
      fields(change,['patches','guards']);lists.push({scope,patches:change.patches,guards:change.guards});
    }
  };
  if(module==='ipqc-ab:module'){
    fields(command,[...common,'moduleAction','input']);
    const input=command.input;if(!record(input)||!Array.isArray(input.scopes)||!input.scopes.length)return invalid();
    fields(input,['scopes','stateRevision']);
    for(const group of input.scopes){if(!record(group)||typeof group.scope!=='string'||!Object.hasOwn(ab?.scopes??{},group.scope))return invalid();collect(group.scope,group.changes);}
  }else if(module==='ipqc-c'){
    fields(command,[...common,'localChanges']);collect('',command.localChanges);
  }else{
    fields(command,[...common,'patches','guards','moduleAction','input']);
    if(!record(command.input))return invalid();
    fields(command.input,module==='fqc'?['matrixCells']:[]);
    if(module==='fqc'&&(!Array.isArray(command.input.matrixCells)||command.input.matrixCells.length))return invalid();
    lists.push({scope:'',patches:command.patches,guards:command.guards});
  }
  const allowed=module==='fqc'?['equipmentId','tool']:module==='ipqc-c'?['equipmentId']:['equipmentId','inspectionMode'];
  const seen=new Set<string>(),targets=new Set<string>(),reverseKeys:string[]=[];
  const prior=reversibleTransferRows(control,revision);
  const toolValues=new Set<string>();
  for(const list of lists){
    const scoped=ab?.scopes?.[list.scope]??control;
    const active=scoped.versions?.find(v=>v.id===scoped.activeVersionId&&v.status==='approved')?.snapshot;
    const current=scoped.workflow?.working??scoped.versions?.find(v=>v.status==='draft')?.snapshot??active;
    if(!record(current)||!Array.isArray(current.items)||!Array.isArray(list.patches)||!Array.isArray(list.guards)||!list.patches.length||list.patches.length!==list.guards.length)return invalid();
    const columns=new Map<string,Set<string>>();
    for(const p of list.patches){
      if(!record(p)||p.op!=='set'||!Array.isArray(p.path)||p.path.length!==3||p.path[0]!=='items'||!record(p.path[1])||typeof p.path[1].id!=='string'||typeof p.path[2]!=='string'||!allowed.includes(p.path[2]))return invalid();
      const id=p.path[1].id,col=p.path[2];const cell=JSON.stringify([list.scope,id,col]);
      if(seen.has(cell)||list.guards.filter(g=>record(g)&&sameDraftValue(g.path,p.path)).length!==1)return invalid();
      seen.add(cell);const cols=columns.get(id)??new Set();cols.add(col);columns.set(id,cols);
      if(col==='tool'){if(typeof p.value!=='string')return invalid();toolValues.add(p.value);}
      if(col==='inspectionMode'&&p.value!=='equipment')return invalid();
      if(col!=='equipmentId')continue;
      const to=p.value;const workingRows=current.items.filter(r=>record(r)&&r.id===id);
      if(typeof to!=='string'||!to||workingRows.length!==1)return invalid();
      const from=workingRows[0].equipmentId??'';
      if(typeof from!=='string')return invalid();
      const formal=record(active)&&Array.isArray(active.items)?active.items.filter(r=>record(r)&&r.id===id):[];
      if(formal.length>1)return invalid();
      if(from!==to&&formal[0]?.equipmentId===to&&!prior.has(transferChoiceKey(list.scope,id,from,to)))
        throw new DraftConflict('DRAFT_REVISION_CHANGED_RECONFIRM',409,{transferDraft:'undo-unverified'});
      targets.add(to);reverseKeys.push(transferChoiceKey(list.scope,id,to,from));
    }
    if([...columns.values()].some(cols=>cols.size!==allowed.length))return invalid();
  }
  if(targets.size!==1||reverseKeys.length>256)return invalid();
  const catalog:unknown=calibrationEquipmentDependency(JSON.parse(catalogRaw??'null'));
  const version=record(catalog)&&Array.isArray(catalog.versions)?catalog.versions.find(v=>v.id===catalog.activeVersionId&&v.status==='approved'):null;
  const equipment=version&&Array.isArray(version.equipment)?version.equipment.filter((v:{id?:string;enabled?:boolean})=>v.id===[...targets][0]&&v.enabled!==false):[];
  if(equipment.length!==1 || (module==='fqc'&&(toolValues.size!==1||!toolValues.has(equipment[0].pieceMark||equipment[0].assetCode))))
    throw new DraftConflict('EQUIPMENT_UNAVAILABLE',422);
  return {revision:revision+1,reverseKeys};
}
