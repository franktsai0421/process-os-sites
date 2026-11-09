import { applyDraftCommand, cloneDraft, DraftConflict, sameDraftValue, stableDraftJSON,
  type DraftContext, type DraftPatch, type DraftPath, type SharedDraft } from './shared-draft';
import { masterWorkflowAdapter } from './master-workflow';
import { assertMasterPageContent, assertMasterPageSave } from './master-page-boundary';
import { stageProcessLink, checkPinnedStageProcessLink, activateStageProcessLink, type StageProcessLink } from './master-stage-link';
import { type WorkflowAdapter, type NumericVersion, type VersionedControl } from './versioned-shared-workflow';

type Snapshot = Record<string, unknown>;
type Page = 'AB' | 'C' | 'LINES';
type Version = NumericVersion<Snapshot> & {scope:string};
type Root = {pageDraftLayout?:string;active:Record<string,Snapshot>;versions:Version[];workflowScopes?:Record<string,SharedDraft<Snapshot>>;[key:string]:unknown};
type Control = VersionedControl<Snapshot> & {page:Page;references:Snapshot};
const owner = (page:Page) => page === 'LINES' ? 'LINES' : page + '.catalog';
const scopes = ['AB', 'C'] as const;
const array = (value:unknown):Record<string,unknown>[] => {
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || Array.isArray(row)))
    throw new DraftConflict('MASTER_PAGE_CONTENT_INVALID',422);
  return value;
};
function flatten(value:Snapshot):Snapshot {
  return {lines:scopes.flatMap(scope => array((value[scope] as Snapshot)?.lines))};
}
function snapshot(root:Root,page:Page):Snapshot {
  const selected=root.active[owner(page)];
  assertMasterPageContent(page,selected);
  return selected;
}
function uniqueSelectors(path:DraftPath) {
  for (const step of path) if (typeof step !== 'string' && (!step || typeof step !== 'object' ||
    Reflect.ownKeys(step).length !== 1 || typeof step.id !== 'string' || !step.id))
    throw new DraftConflict('MASTER_PAGE_SELECTOR_INVALID',422);
}
function admitPatch(page:Page,patch:DraftPatch) {
  const path=patch.path;uniqueSelectors(path);
  const prefix=page==='LINES'?1:0,collection=path[prefix];
  if(page==='LINES'&&((typeof path[0]!=='string'||!['AB','C'].includes(path[0]))||collection!=='lines'))throw new DraftConflict('MASTER_PAGE_OWNERSHIP_VIOLATION',422);
  if(page!=='LINES'&&(typeof collection!=='string'||!['products','categoryGroups'].includes(collection)))throw new DraftConflict('MASTER_PAGE_OWNERSHIP_VIOLATION',422);
  const nested=page==='LINES'&&path[prefix+2]==='stages',base=prefix+(nested?3:1);
  if(patch.op==='set'){
    const fields=page==='LINES'?(nested?['code','name','machine','assetNumber','operators']:['code','name']):collection==='products'?['code','name','nameVi','category','line','unit','specification','stages','routeMode']:['line','name','defaultStages'];
    if(path.length!==base+2||typeof path[base]!=='object'||typeof path.at(-1)!=='string'||!fields.includes(path.at(-1) as string))throw new DraftConflict('UNSUPPORTED_CATALOG_PATCH',422);
  }else if(patch.op==='remove'){
    if(path.length!==base+1||typeof path.at(-1)!=='object')throw new DraftConflict('ENTITY_REMOVAL_REQUIRED',422);
  }else if(!['insert','order'].includes(patch.op)||path.length!==base)throw new DraftConflict('UNSUPPORTED_CATALOG_PATCH',422);
}
function reservedEntity(source:SharedDraft<Snapshot>,path:DraftPath,id:string) {
  const find=(content:unknown):boolean=>{
    let current=content;
    for(const step of path){if(typeof step==='string')current=current&&typeof current==='object'?(current as Snapshot)[step]:undefined;
      else current=Array.isArray(current)?current.find(row=>row?.id===step.id):undefined;}
    return Array.isArray(current)&&current.filter(row=>row?.id===id).length===1;
  };
  return [source.active.content,...source.saves.map(save=>save.content)].some(find);
}
function atomicSave(page:Page,flow:SharedDraft<Snapshot>, command:Parameters<typeof applyDraftCommand<Snapshot>>[1] & {input?:Record<string,unknown>}, context:DraftContext<Snapshot>) {
  if (flow.receipts[command.operationId]) return applyDraftCommand(flow,command,context);
  if (!context.allowed('view') || !context.allowed('edit') || !context.allowed('save')) throw new DraftConflict('FORBIDDEN',403);
  if(!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision!==flow.revision)throw new DraftConflict('DRAFT_REVISION_CHANGED_RECONFIRM',409);
  const batches=command.input!.batches as {patches:DraftPatch[];guards:{path:DraftPath;value:unknown}[]}[];
  let staged=flow;
  const intents=new Map<string,{before:unknown;after:unknown}>();
  for (const batch of batches) {
    for (const patch of batch.patches) {
      admitPatch(page,patch);
      if(patch.op==='insert'){
        const key=stableDraftJSON([...patch.path,{id:patch.value?.id}]);
        if(staged.tombstones.includes(key)&&typeof patch.value?.id==='string'&&reservedEntity(flow,patch.path,patch.value.id))
          staged={...staged,tombstones:staged.tombstones.filter(marker=>marker!==key)};
      }
      const exact=batch.guards.find(row => row && Array.isArray(row.path) && sameDraftValue(row.path,patch.path));
      const last=patch.path.at(-1),guard=exact || (patch.op==='set'&&typeof last==='string' ? batch.guards.find(row=>row&&sameDraftValue(row.path,patch.path.slice(0,-1))&&row.value&&typeof row.value==='object'&&!Object.hasOwn(row.value,last)):undefined);
      if (patch.op !== 'insert' && !guard) throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
      if (patch.op === 'set') {
        const key=stableDraftJSON(patch.path),prior=intents.get(key);
        intents.set(key,{before:prior ? prior.before : exact?.value,after:patch.value});
      }
    }
    for (const guard of batch.guards) {
      if(!guard||!Array.isArray(guard.path)||!Object.hasOwn(guard,'value'))throw new DraftConflict('INVALID_LOCAL_SAVE',422);
      uniqueSelectors(guard.path);
      if(page==='LINES'?(typeof guard.path[0]!=='string'||!['AB','C'].includes(guard.path[0]))||guard.path[1]!=='lines':(typeof guard.path[0]!=='string'||!['products','categoryGroups'].includes(guard.path[0])))throw new DraftConflict('MASTER_PAGE_OWNERSHIP_VIOLATION',422);
    }
    if(page!=='LINES'&&batch.patches.some(patch=>patch.path[0]==='categoryGroups'&&(patch.op==='insert'||patch.path.at(-1)==='defaultStages'))&&!batch.guards.some(guard=>sameDraftValue(guard.path,['products'])))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
    staged=applyDraftCommand(staged,{...command,action:'apply',patches:batch.patches,guards:batch.guards},context).state;
    staged={...staged,revision:flow.revision,receipts:flow.receipts,sequences:flow.sequences};
  }
  const contributors={...staged.contributors};
  for (const [key,intent] of intents) if (sameDraftValue(intent.before,intent.after)) {
    if (Object.hasOwn(flow.contributors,key)) contributors[key]=flow.contributors[key]; else delete contributors[key];
  }
  const result=applyDraftCommand({...staged,contributors},command,context);
  result.receipt.unchanged=sameDraftValue(flow.working,result.state.working) && result.receipt.unchanged;
  if (!result.receipt.unchanged && result.state.revision === flow.revision) result.state.revision++;
  result.receipt.revision=result.state.revision;
  result.state.receipts[command.operationId].result=cloneDraft(result.receipt);
  return result;
}

// The layout is a trusted stored-data cutover marker, never a query/env opt-in.
// This adapter does not adopt legacy drafts, generate baselines, or delete data.
export function masterPageWorkflowAdapter(page:Page):WorkflowAdapter<Snapshot,Control> {
  let root:Root,linkedActivated=false;
  let referenceValues:Record<string,string>={};
  const scope=owner(page);
  function serializeModel(control:Control) {
    root.versions=[...root.versions.filter(version => version.scope !== scope),...control.versions.map(version => ({...version,scope}))];
    root.workflowScopes={...root.workflowScopes,[scope]:control.workflow!};
    const active=control.versions.find(version => version.id === control.activeVersionId);
    if (!active || active.status !== 'approved') throw new DraftConflict('MASTER_PAGE_BASELINE_REQUIRED',409);
    root.active[scope]=active.snapshot;
    // Reference consumers see only the independently approved page projections.
    // Never compose from either page's working/saved/pending body.
    const topology=snapshot(root,'LINES');
    for (const part of scopes) root.active[part]={...root.active[part],...snapshot(root,part),lines:(topology[part] as Snapshot).lines};
    return root;
  }
  return {
    key:'masterDataControl',scope:'master:'+scope,preparedModel:true,permissionOnlyRead:true,
    needsReferenceHistory:()=>true,needsFullHistory:()=>true,
    empty:()=>page === 'LINES' ? {AB:{lines:[]},C:{lines:[]}} : {products:[],categoryGroups:[]},
    photoIds:()=>[],photoPrefix:'master/photos/',
    parse(raw,prepared) {
      if (!['AB','C','LINES'].includes(page)) throw new DraftConflict('SCOPE_INVALID',422);
      root=(prepared || (raw ? JSON.parse(raw) : {})) as Root;
      if (root.pageDraftLayout !== 'page-v1') throw new DraftConflict('MASTER_PAGE_CUTOVER_REQUIRED',409);
      if (!root.active || !Array.isArray(root.versions)) throw new DraftConflict('MASTER_EXISTING_DATA_INVALID',422);
      for (const target of ['AB','C','LINES'] as const) snapshot(root,target);
      if(['AB','C'].some(scope=>root.workflowScopes?.[scope]?.pendingId||root.workflowScopes?.[scope]?.cases.some(review=>review.status==='pending'))||root.versions.some(version=>['AB','C'].includes(version.scope)&&['pending','pending-test'].includes(version.status)))
        throw new DraftConflict('MASTER_LEGACY_PENDING_REQUIRES_RESOLUTION',409);
      const versions=root.versions.filter(version => version.scope === scope),flow=root.workflowScopes?.[scope];
      const active=versions.filter(version => version.status === 'approved' && sameDraftValue(version.snapshot,snapshot(root,page)));
      const selected=flow ? active.find(version => version.id === flow.active.id) : active.length === 1 ? active[0] : undefined;
      if (!selected || root.versions.filter(version=>version.id===selected.id).length!==1 || new Set(versions.map(version => version.id)).size !== versions.length || flow && (flow.scope !== 'master:'+scope || !sameDraftValue(flow.active.content,selected.snapshot)))
        throw new DraftConflict('MASTER_PAGE_BASELINE_REQUIRED',409);
      if (flow) for (const content of [flow.active.content,flow.working,...(flow.saved ? [flow.saved.content] : [])]) assertMasterPageContent(page,content);
      const open=versions.filter(version=>['draft','pending','pending-test'].includes(version.status));
      if(open.length>1||flow&&(flow.pendingId?(open[0]?.id!==flow.pendingId||open[0].status!=='pending'||!sameDraftValue(open[0].snapshot,flow.working)):open.length>0&&(open[0].status!=='draft'||open[0].revision!==flow.revision||!sameDraftValue(open[0].snapshot,flow.working))))throw new DraftConflict('MASTER_PAGE_OWNER_MISMATCH',409);
      return {page,activeVersionId:selected.id,versions,workflow:flow,
        references:page === 'LINES' ? {} : {lines:cloneDraft((snapshot(root,'LINES')[page] as Snapshot).lines)}};
    },
    serialize:control=>JSON.stringify(serializeModel(control)),serializeModel,
    projectValues:():Record<string,string>=>linkedActivated ? {processMasterData:JSON.stringify(root.active.PROCESS)} : {},
    beforeCommand(control,command) {
      if (control.workflow && control.workflow.scope !== 'master:'+scope) throw new DraftConflict('MASTER_PAGE_OWNER_MISMATCH',409);
      if (command.action === 'save') assertMasterPageSave(page,command);
      else if (command.action === 'apply' || command.action === 'restore' || command.moduleAction || command.input || command.patches?.length)
        throw new DraftConflict('MASTER_PAGE_EXPLICIT_SAVE_REQUIRED',422);
    },
    requiresCreate:(control,command)=>!!command.patches?.some(patch=>patch.op==='insert'&&!(control.workflow&&
      control.workflow.tombstones.includes(stableDraftJSON([...patch.path,{id:patch.value?.id}]))&&typeof patch.value?.id==='string'&&reservedEntity(control.workflow,patch.path,patch.value.id))),
    requiresDelete:(_control,command)=>!!command.patches?.some(patch=>patch.op==='remove'||patch.op==='set'&&['stages','defaultStages'].some(field=>field===patch.path.at(-1))&&
      Array.isArray(command.input?.batches)&&(command.input.batches as {guards:{path:DraftPath;value:unknown}[]}[]).some(batch=>batch.guards.some(guard=>sameDraftValue(guard.path,patch.path)&&Array.isArray(guard.value)&&guard.value.some(value=>!Array.isArray(patch.value)||!patch.value.includes(value))))),
    context(control,state,base) {
      referenceValues=state.values;
      const topology=snapshot(root,'LINES');
      // Reuse established catalog/source/reference checks with approved
      // companion content. Validation copies never enter persistence or receipts.
      const validators=scopes.map(part => {
        const legacy=masterWorkflowAdapter(part),validation=cloneDraft(root);
        delete validation.pageDraftLayout;
        validation.versions=validation.versions.filter(version=>!['AB','C'].includes(version.scope)||!['draft','pending','pending-test'].includes(version.status));
        // Structural validators ignore only this exact fixed case's own link;
        // the actual approval separately rechecks its pinned PROCESS source.
        // Other page/case links remain locks. Nothing is removed from real root.
        const own=control.workflow?.pendingId;
        if(own&&validation.workflowScopes?.[scope])for(const review of validation.workflowScopes[scope].cases)
          if(review.id===own)delete (review as typeof review&{linkedProcess?:unknown}).linkedProcess;
        const active={...snapshot(root,part),lines:(topology[part] as Snapshot).lines};
        validation.active[part]=active;
        const version:Version={id:'validation:'+scope+':'+part,scope:part,number:0,status:'approved',snapshot:active,revision:0,
          creatorId:'',creatorName:'',createdAt:'',updatedAt:'',history:[]};
        validation.versions=[...validation.versions.filter(row=>row.scope !== part),version];
        // Legacy workflows are retained for receipts/history in the real root;
        // cutover must have resolved their reviews, not made their drafts current.
        if (validation.workflowScopes) {
          delete validation.workflowScopes.AB;delete validation.workflowScopes.C;
          const other=part==='AB'?'C':'AB';
          if(root.workflowScopes?.[other+'.catalog'])validation.workflowScopes[other]=root.workflowScopes[other+'.catalog'];
        }
        const parsed=legacy.parse(JSON.stringify(validation),validation);
        const ctx=legacy.context(parsed,{...state,values:{...state.values,masterDataControl:JSON.stringify(validation)}},base);
        return {part,ctx,combine:(content:Snapshot)=>page === 'LINES'
          ? {...snapshot(root,part),lines:(content[part] as Snapshot).lines}
          : {...content,lines:(topology[part] as Snapshot).lines}};
      });
      const validateStructure=(after:Snapshot,before:Snapshot) => {
        assertMasterPageContent(page,after); assertMasterPageContent(page,before);
        if (page === 'LINES') {
          const codes=new Set<string>(),stageCodes=new Set<string>();
          for (const part of scopes) for (const line of array((after[part] as Snapshot).lines)) {
            const prior=array((before[part] as Snapshot).lines).find(row=>row.id === line.id);
            if (typeof line.code !== 'string' || codes.has(line.code) || (!prior || prior.code !== line.code) && !/^[A-Za-z0-9_-]+$/.test(line.code)) throw new DraftConflict('LINE_CODE_INVALID',422);
            if (typeof line.name !== 'string' || (!prior || prior.name !== line.name) && !line.name.trim()) throw new DraftConflict('NAME_REQUIRED',422);
            codes.add(line.code);
            for (const stage of array(line.stages)) {
              const old=prior && array(prior.stages).find(row=>row.id === stage.id);
              if (typeof stage.code !== 'string' || stageCodes.has(stage.code) || (!old || old.code !== stage.code) && !/^[A-Za-z0-9_-]+$/.test(stage.code)) throw new DraftConflict('STAGE_CODE_INVALID',422);
              if (typeof stage.name !== 'string' || (!old || old.name !== stage.name) && !stage.name.trim()) throw new DraftConflict('NAME_REQUIRED',422);
              stageCodes.add(stage.code);
            }
          }
        }
        for (const {part,ctx,combine} of validators) if (page === 'LINES' || part === page) ctx.structure(combine(after),combine(before));
      };
      return {...base,activeId:control.activeVersionId,commandFingerprint:undefined,
        allowed:permission=>permission === 'save' ? base.allowed('save') || base.allowed('edit') : base.allowed(permission),
        semantic:content=>page === 'LINES' ? content : validators.find(row=>row.part === page)!.ctx.semantic({...content,lines:[]}),
        structure:validateStructure,
        validate(content) {
          validateStructure(content,snapshot(root,page));
          const issues=page === 'LINES' ? [] : validators.find(row=>row.part === page)!.ctx.validate(validators.find(row=>row.part === page)!.combine(content));
          return issues;
        }};
    },
    apply(control,command,context) {
      if (command.action === 'save') assertMasterPageSave(page,command);
      const flow=control.workflow!,already=flow.receipts[command.operationId];
      const assertIDs=(rows:{id:string}[])=>{if(rows.some(row=>typeof row?.id!=='string'||!row.id)||new Set(rows.map(row=>row.id)).size!==rows.length)throw new DraftConflict('MASTER_PAGE_OWNER_MISMATCH',409);};
      assertIDs(flow.saves);assertIDs(flow.cases);
      if(flow.saved&&!flow.saves.some(save=>sameDraftValue(save,flow.saved)))throw new DraftConflict('MASTER_PAGE_CASE_SAVE_MISMATCH',409);
      for(const content of [flow.active.content,flow.working,...flow.saves.map(save=>save.content),...flow.cases.flatMap(review=>[review.before,review.content])])assertMasterPageContent(page,content);
      for(const review of flow.cases){const saved=flow.saves.find(save=>save.id===review.savedId);if(!saved||!sameDraftValue(saved.content,review.content))throw new DraftConflict('MASTER_PAGE_CASE_SAVE_MISMATCH',409);}
      const pending=flow.cases.filter(review=>review.status==='pending');
      if(flow.pendingId?(pending.length!==1||pending[0].id!==flow.pendingId||pending[0].savedId!==flow.saved?.id||!sameDraftValue(pending[0].content,flow.working)):pending.length>0)throw new DraftConflict('MASTER_PAGE_CASE_SAVE_MISMATCH',409);
      let link:StageProcessLink|null=null;
      type Review=typeof flow.cases[number]&{linkedProcess?:StageProcessLink};
      const linkRoot={...root,active:{...root.active,LINES:flatten(snapshot(root,'LINES'))}};
      if (!already && page === 'LINES') {
        if (command.action === 'submit' && flow.saved) link=stageProcessLink(linkRoot,'LINES',flatten(flow.saved.content),referenceValues,flow.pendingId || undefined);
        if (command.action === 'approve') {link=(flow.cases.find(review=>review.id === command.caseId) as Review|undefined)?.linkedProcess || null;if (link) checkPinnedStageProcessLink(root,link,command.caseId!);}
      }
      if (!already && command.action === 'save') context.structure(flow.working,flow.working);
      const result=command.action === 'save' ? atomicSave(page,flow,command,{...context,commandFingerprint:context.commandFingerprint||stableDraftJSON(command)}) : applyDraftCommand(flow,command,context);
      if (!already && link && command.action === 'submit') (result.state.cases.at(-1) as Review).linkedProcess=link;
      if (!already && link && command.action === 'approve') {activateStageProcessLink(root,link,command.caseId!,context.actor,context.at);linkedActivated=true;}
      return result;
    },
  };
}
