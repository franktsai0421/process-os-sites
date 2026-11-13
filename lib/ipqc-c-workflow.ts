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
export type IpqcWorkflowCommand = DraftCommand & { moduleAction?:'create-error'|'create-item'|'delete-error'|'delete-item'|'revive-error'|'revive-item';
  localChanges?: Array<{moduleAction?:IpqcWorkflowCommand['moduleAction'];input?:IpqcWorkflowCommand['input'];patches?:DraftPatch[];guards?:DraftCommand['guards'];localId?:string}>;
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
  if(command.localChanges!==undefined) {
    if(command.action!=='save'||command.moduleAction||command.patches||!Array.isArray(command.localChanges)||command.localChanges.length>256)
      throw new DraftConflict('INVALID_LOCAL_SAVE',422);
    if(!context.allowed('view')||!context.allowed('edit'))throw new DraftConflict('FORBIDDEN',403);
    // Explicit comparison consent belongs to this exact pre-allocation revision.
    // Existing unpinned callers retain their original per-field guards.
    const revives=command.localChanges.some(change=>change?.moduleAction==='revive-error'||change?.moduleAction==='revive-item');
    if(revives&&command.restoreSaveId!==undefined)throw new DraftConflict('INVALID_LOCAL_SAVE',422);
    if(revives&&command.expectedRevision===undefined)throw new DraftConflict('DRAFT_REVISION_REQUIRED');
    if(command.expectedRevision!==undefined){
      if(!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0)throw new DraftConflict('DRAFT_REVISION_REQUIRED');
      if(command.generation!==control.workflow.generation)throw new DraftConflict('STALE_GENERATION');
      if(command.expectedRevision!==control.workflow.revision)throw new DraftConflict('DRAFT_REVISION_CHANGED_RECONFIRM');
    }
    // Build on a private aggregate. Nothing (including allocations or receipts)
    // escapes if any later edit, structural check or final Save fails.
    const candidate={...control,reservedErrorCodes:[...control.reservedErrorCodes],reservedItemCodes:[...control.reservedItemCodes],workflow:control.workflow};
    const ids=new Map<string,string>(),codes=new Map<string,string>();
    const remap=(value:unknown):unknown=>Array.isArray(value)?value.map(remap):value&&typeof value==='object'
      ?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,
        // Only server-owned numbering of a row created earlier in this batch is
        // normalized. All user fields and existing rows remain exact guards.
        key==='code'&&typeof (value as {id?:unknown}).id==='string'&&codes.has((value as {id:string}).id)?codes.get((value as {id:string}).id):
        ['id','errorId'].includes(key)&&typeof v==='string'&&ids.has(v)?ids.get(v):remap(v)])):value;
    const equipmentOrigins=new Map<string,{original:IpqcItem;current:IpqcItem}>();
    const snapshotProof=(row:IpqcItem)=>stableDraftJSON([Object.hasOwn(row,'equipmentSnapshot'),row.equipmentSnapshot]);
    const adaptDeletedRow=(value:unknown):unknown=>{
      if(!value||typeof value!=='object'||Array.isArray(value)||command.expectedRevision===undefined)return value;
      const row=value as IpqcItem,origin=equipmentOrigins.get(row.id);
      const matches=candidate.workflow!.working.items.filter(item=>item.id===row.id);
      if(!origin||matches.length!==1||matches[0].equipmentId!==origin.current.equipmentId||
          snapshotProof(row)!==snapshotProof(origin.original))return value;
      const adapted={...row};
      if(Object.hasOwn(origin.current,'equipmentSnapshot'))adapted.equipmentSnapshot=origin.current.equipmentSnapshot;
      else delete adapted.equipmentSnapshot;
      // No other value/property (including identity and sourceRow) is normalized.
      return stableDraftJSON(adapted)===stableDraftJSON(matches[0])?adapted:value;
    };
    const internalIds:string[]=[];
    const clientId='local-'+command.operationId.slice(0,80);
    for(const [index,raw] of command.localChanges.entries()) {
      if(!raw||Object.keys(raw).some(key=>!['moduleAction','input','patches','guards','localId'].includes(key)))throw new DraftConflict('INVALID_LOCAL_SAVE',422);
      const change=remap(raw) as typeof raw,operationId=command.operationId.slice(0,80)+'-local-'+index;
      if(change.moduleAction?.startsWith('create')) {
        if(!raw.localId||!/^local-[a-zA-Z0-9_-]{8,80}$/.test(raw.localId)||ids.has(raw.localId))throw new DraftConflict('INVALID_LOCAL_ID',422);
      } else if(raw.localId)throw new DraftConflict('INVALID_LOCAL_ID',422);
      const priorWorking=candidate.workflow!.working;
      if(change.moduleAction==='delete-item'||change.moduleAction==='delete-error') {
        change.guards=change.guards?.map(guard=>{
          if(change.moduleAction==='delete-item'&&stableDraftJSON(guard.path)===stableDraftJSON(['items',{id:change.input?.id}]))
            return {...guard,value:adaptDeletedRow(guard.value)};
          if(change.moduleAction==='delete-error'&&stableDraftJSON(guard.path)===stableDraftJSON(['items'])&&Array.isArray(guard.value))
            return {...guard,value:guard.value.map(adaptDeletedRow)};
          return guard;
        });
      }
      if(change.moduleAction?.startsWith('delete')) {
        const kind=change.moduleAction==='delete-error'?'errors':'items';
        if(!change.guards?.some(g=>stableDraftJSON(g.path)===stableDraftJSON([kind,{id:change.input?.id}])))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
        // A cascade must also guard the child set, so newly added children survive.
        if(kind==='errors'&&!change.guards?.some(g=>stableDraftJSON(g.path)===stableDraftJSON(['items'])))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
      }
      if(change.moduleAction==='revive-error'||change.moduleAction==='revive-item') {
        // Revival is deliberately local-Save-only: no public Apply exception and
        // no historical body or client replacement row can enter this path.
        if(raw.localId!==undefined||change.patches!==undefined||!change.input||
            Object.keys(change.input).some(key=>key!=='id')||typeof change.input.id!=='string'||!change.input.id)
          throw new DraftConflict('INVALID_LOCAL_SAVE',422);
        const working=candidate.workflow!.working,kind=change.moduleAction==='revive-error'?'errors':'items';
        for(const rows of [working.errors,working.items]) {
          if(rows.some(row=>!row||['id','code','productCode','stageCode'].some(key=>typeof row[key as keyof typeof row]!=='string'||!row[key as keyof typeof row]))||
              new Set(rows.map(row=>row.id)).size!==rows.length||new Set(rows.map(row=>row.code)).size!==rows.length)
            throw new DraftConflict('ENTITY_REMOVED_OR_AMBIGUOUS');
        }
        const originals=control.workflow.working[kind].filter(row=>row.id===raw.input?.id);
        const row=working[kind].find(row=>row.id===change.input!.id);
        if(raw.input?.id!==change.input.id||raw.input.id.startsWith('local-')||originals.length!==1||originals[0].deleted!==true||
            !row||row.deleted!==true||['id','code','productCode','stageCode','errorId','sourceRow'].some(key=>
              stableDraftJSON([Object.hasOwn(row,key),row[key as keyof typeof row]])!==
              stableDraftJSON([Object.hasOwn(originals[0],key),originals[0][key as keyof typeof row]])))
          throw new DraftConflict('ENTITY_REMOVED_OR_AMBIGUOUS');
        const guarded=(path:DraftPatch['path'])=>change.guards?.some(guard=>stableDraftJSON(guard.path)===stableDraftJSON(path));
        if(!guarded([kind,{id:row.id}]))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
        if(kind==='errors') {
          if(!guarded(['items']))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
        } else {
          const item=row as IpqcItem,parent=working.errors.find(error=>error.id===item.errorId);
          if(!parent||parent.deleted!==false||parent.productCode!==item.productCode||parent.stageCode!==item.stageCode)
            throw new DraftConflict('ENTITY_REMOVED_OR_AMBIGUOUS');
          if(!guarded(['errors',{id:parent.id}]))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
        }
        candidate.workflow=applyDraftCommand(candidate.workflow!,{action:'apply',generation:command.generation,clientId,
          sequence:index+1,operationId,guards:change.guards,
          patches:[{op:'set',path:[kind,{id:row.id},'deleted'],value:false}]},
          {...context,commandFingerprint:undefined,structure(content,previous){
            // Existing validation may normalize legacy equipment metadata. Revival
            // cannot silently repair retained content or predict server snapshots.
            const retained=stableDraftJSON(content);
            context.structure(content,previous);
            if(stableDraftJSON(content)!==retained)throw new DraftConflict('INVALID_STRUCTURE',422);
          }}).state;
      } else applyIpqcWorkflow(candidate,{action:'apply',generation:command.generation,clientId,sequence:index+1,operationId,
        ...(change.moduleAction?{moduleAction:change.moduleAction,input:change.input}: {patches:change.patches}),guards:change.guards},
        {...context,commandFingerprint:undefined});
      if(!change.moduleAction)for(const patch of change.patches||[]) {
        const [kind,entity,field]=patch.path;
        if(kind==='items'&&entity&&typeof entity==='object'&&field==='equipmentId') {
          const before=priorWorking.items.filter(row=>row.id===entity.id),after=candidate.workflow!.working.items.filter(row=>row.id===entity.id);
          if(before.length===1&&after.length===1)equipmentOrigins.set(entity.id,{original:equipmentOrigins.get(entity.id)?.original||copyIpqc(before[0]),current:copyIpqc(after[0])});
        }
      }
      internalIds.push(operationId);
      if(raw.localId){
        const kind=change.moduleAction==='create-error'?'errors':'items',id=(kind==='errors'?'error-':'item-')+operationId;
        ids.set(raw.localId,id);codes.set(raw.localId,candidate.workflow!.working[kind].find(row=>row.id===id)!.code);
      }
    }
    // Inner operations are implementation details; the original operation owns
    // the only durable receipt and is the only command recoverable/replayable.
    for(const id of internalIds)delete candidate.workflow!.receipts[id];
    delete candidate.workflow!.sequences[stableDraftJSON([context.actor.id,clientId])];
    const result=applyDraftCommand(candidate.workflow!,{...command,expectedRevision:undefined},{...context,commandFingerprint:fingerprint,
      allowed:permission=>permission==='save'?context.allowed('edit'):context.allowed(permission)});
    control.workflow=result.state;control.reservedErrorCodes=candidate.reservedErrorCodes;control.reservedItemCodes=candidate.reservedItemCodes;return result.receipt;
  }
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
        ...(raw.notApplicableReason!==undefined?{notApplicableReason:text(raw.notApplicableReason)}:{}),
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
    const fieldGuard=(command.guards || []).some(guard=>JSON.stringify(guard.path)===JSON.stringify(patch.path));
    // Optional legacy properties need an exact absence proof, not null/defaults.
    // The unchanged kernel compares this complete row before applying any patch.
    const absentRowGuard=collection==='items'&&['rule','notApplicable','notApplicableReason','equipmentGroupId','equipmentId'].includes(field)&&
      (command.guards || []).some(guard=>JSON.stringify(guard.path)===JSON.stringify([collection,entity])&&
        !!guard.value&&typeof guard.value==='object'&&!Array.isArray(guard.value)&&
        (guard.value as {id?:unknown}).id===entity.id&&!Object.hasOwn(guard.value,field));
    if(!fieldGuard&&!absentRowGuard)throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
  }
  const result = applyDraftCommand(control.workflow,command,context);
  control.workflow = result.state;
  return result.receipt;
}
