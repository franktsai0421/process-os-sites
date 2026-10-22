import { applyDraftCommand, createSharedDraft, DraftConflict, stableDraftJSON, type DraftCommand, type DraftContext, type DraftPatch, type SharedDraft } from './shared-draft';
import { activeIpqc, openIpqc, checkedIpqcSnapshot, checkedIpqcRule, nextErrorCode, nextItemCode, submitIpqcIssues, copyIpqc, type IpqcControl, type IpqcSnapshot, type IpqcItem, type IpqcError } from './ipqc-c';

export type IpqcWorkflowControl = IpqcControl & { workflow?: SharedDraft<IpqcSnapshot> };
// Never expose recovery commands or client streams through ordinary library reads.
// Historical snapshots have a separate permission, including legacy projections.
export function publicIpqcWorkflow(control: IpqcWorkflowControl, history: boolean, caseMetadata=false): IpqcWorkflowControl {
  const flow = control.workflow;
  if (!flow) return control;
  const open = openIpqc(control);
  return {...control,
    versions: history&&!caseMetadata ? control.versions : control.versions.filter(v=>v.id===control.activeVersionId || v.id===open?.id),
    workflow: {...flow, receipts:{}, sequences:{}, saves:[],
      cases: (history ? flow.cases : flow.cases.filter(c=>c.id===flow.pendingId)).map(c=>caseMetadata?(({content:_content,before:_before,...metadata})=>metadata)(c) as typeof c:c),
    },
  };
}
export type IpqcWorkflowCommand = DraftCommand & { moduleAction?:'create-error'|'create-item'|'delete-error'|'delete-item';
  input?: {productCode?:string;stageCode?:string;name?:string;note?:string;errorId?:string;id?:string;cascade?:boolean;item?:Partial<IpqcItem>} };
export function beginIpqcWorkflow(control: IpqcWorkflowControl, context: DraftContext<IpqcSnapshot>) {
  if (control.workflow) return control.workflow;
  const open = openIpqc(control), active = activeIpqc(control);
  if (open?.status === 'pending') throw new DraftConflict('LEGACY_PENDING_REQUIRES_REVIEW');
  const state = createSharedDraft('ipqc-c', active?.snapshot || { errors: [], items: [] }, active?.id || null, context.id());
  // An existing draft is retained as working content, never silently called saved.
  if (open) state.working = copyIpqc(open.snapshot);
  control.workflow = state;
  return state;
}
export function ipqcWorkflowContext(control: IpqcWorkflowControl, context: Omit<DraftContext<IpqcSnapshot>, 'structure' | 'validate' | 'semantic' | 'activeId'>,
  products: { code: string; stages: string[] }[]): DraftContext<IpqcSnapshot> {
  const active = activeIpqc(control);
  return { ...context, activeId:active?.id || null,advisoryPolicy:'ipqc-completeness-v1',
    restoreContent(historical,current){
      for(const kind of ['errors','items'] as const)for(const row of current[kind])
        if(!historical[kind].some(old=>old.id===row.id)) (historical[kind] as typeof current[typeof kind]).push({...copyIpqc(row),deleted:true} as never);
      return historical;
    },
    semantic: content => ({ errors:content.errors.filter(e=>!e.deleted),items:content.items.filter(i=>!i.deleted) }),
    structure(content, previous) {
      // Reuse the existing schema and identity validator. Additions are allocated by
      // module commands; arbitrary client insertion/removal is not allowed here.
      const version = openIpqc(control) || active;
      if (!version) throw new DraftConflict('INITIAL_BUILD_REQUIRED');
      checkedIpqcSnapshot({...version,snapshot:previous},content);
    },
    validate(content) {
      const version = openIpqc(control) || active;
      if (!version) return [{kind:'error',path:[],message:'INITIAL_BUILD_REQUIRED'}];
      return submitIpqcIssues({...version,snapshot:content},active,products);
    },
  };
}
export function applyIpqcWorkflow(control: IpqcWorkflowControl, command: IpqcWorkflowCommand, context: DraftContext<IpqcSnapshot>) {
  if (!control.workflow) throw new DraftConflict('BEGIN_REQUIRED');
  const fingerprint=context.commandFingerprint||stableDraftJSON(command);
  // Check retries before allocating any new reserved number.
  if(control.workflow.receipts[command.operationId])return applyDraftCommand(control.workflow,command,{...context,commandFingerprint:fingerprint}).receipt;
  if(command.moduleAction) {
    if(!['create-error','create-item','delete-error','delete-item'].includes(command.moduleAction))
      throw new DraftConflict('INVALID_MODULE_ACTION',422);
    if(command.action!=='apply')throw new DraftConflict('INVALID_MODULE_ACTION',422);
    const input=command.input||{},working=control.workflow.working,patches:DraftPatch[]=[];
    const text=(value:unknown)=>typeof value==='string'?value:'';
    let newError:IpqcError|undefined,newItem:IpqcItem|undefined;
    if(command.moduleAction==='create-error') {
      if(!input.productCode||!input.stageCode)throw new DraftConflict('PRODUCT_STAGE_REQUIRED',422);
      newError={id:'error-'+command.operationId,code:nextErrorCode(control,input.productCode,input.stageCode,context.allocationIndex),productCode:input.productCode,
        stageCode:input.stageCode,name:text(input.name),note:text(input.note),reason:'',deleted:false};
      patches.push({op:'insert',path:['errors'],value:newError});
    } else if(command.moduleAction==='create-item') {
      const parent=working.errors.find(e=>e.id===input.errorId&&!e.deleted);if(!parent)throw new DraftConflict('ERROR_CODE_REMOVED');
      const raw=input.item||{};
      newItem={id:'item-'+command.operationId,code:nextItemCode(control,parent.code,context.allocationIndex),errorId:parent.id,productCode:parent.productCode,stageCode:parent.stageCode,
        standard:text(raw.standard),description:text(raw.description),note:text(raw.note),reason:'',tool:'',method:'',frequency:text(raw.frequency),
        standardEnabled:raw.standardEnabled!==false,cpkEnabled:raw.cpkEnabled===true,notApplicable:false,deleted:false,
        equipmentId:text(raw.equipmentId),equipmentGroupId:text(raw.equipmentGroupId),equipmentSnapshot:null,
        mediaItems:raw.mediaItems||[],...(raw.rule?{rule:checkedIpqcRule(raw.rule)}:{})};
      patches.push({op:'insert',path:['items'],value:newItem});
    } else {
      const isError=command.moduleAction==='delete-error',kind=isError?'errors':'items';
      const row=working[kind].find(r=>r.id===input.id&&!r.deleted);if(!row)throw new DraftConflict('ENTITY_REMOVED_OR_AMBIGUOUS');
      const children=isError?working.items.filter(i=>i.errorId===row.id&&!i.deleted):[];
      if(children.length&&!input.cascade)throw new DraftConflict('CASCADE_CONFIRM_REQUIRED');
      for(const item of children)patches.push({op:'set',path:['items',{id:item.id},'deleted'],value:true});
      patches.push({op:'set',path:[kind,{id:row.id},'deleted'],value:true});
    }
    const result=applyDraftCommand(control.workflow,{...command,patches},{...context,commandFingerprint:fingerprint,
      structure(content,previous){context.structure(content,{errors:[...previous.errors,...(newError?[newError]:[])],
        items:[...previous.items,...(newItem?[{...newItem,equipmentId:'',equipmentSnapshot:null}]:[])]});}});
    control.workflow=result.state;return result.receipt;
  }
  if (command.action === 'apply') for (const patch of command.patches || []) {
    const [collection, entity, field] = patch.path;
    const fields = collection === 'errors' ? ['name','note','reason'] : ['standard','description','note','reason','tool','method','frequency',
      'cpkEnabled','standardEnabled','notApplicable','notApplicableReason','equipmentGroupId','equipmentId','mediaItems','rule'];
    if (patch.op !== 'set' || patch.path.length !== 3 || typeof collection!=='string' || !['errors','items'].includes(collection) ||
        !entity || typeof entity === 'string' || typeof field!=='string' || !fields.includes(field)) throw new DraftConflict('UNSUPPORTED_ITEM_PATCH',422);
    const rows=collection==='errors'?control.workflow.working.errors:control.workflow.working.items;
    if(!rows.some(row=>row.id===entity.id&&!row.deleted))throw new DraftConflict('ENTITY_REMOVED_OR_AMBIGUOUS');
    if (!(command.guards || []).some(guard=>JSON.stringify(guard.path)===JSON.stringify(patch.path)))
      throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
  }
  const result = applyDraftCommand(control.workflow,command,context);
  control.workflow = result.state;
  return result.receipt;
}
