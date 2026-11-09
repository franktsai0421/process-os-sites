import {DraftConflict,cloneDraft,stableDraftJSON,createSharedDraft,applyDraftCommand,type DraftPatch,type DraftContext} from './shared-draft';
import {abWorkflowAdapter,type AbSharedScope} from './ipqc-ab-workflow';
import {openAb,activeAb,type AbControl,type AbSnapshot} from './ipqc-ab';
import {projectSharedVersion,type ModuleDraftCommand} from './versioned-shared-workflow';
import type {State} from './process-state';

type Guard={path:DraftPatch['path'];value:unknown};
export type AbLocalChange={moduleAction?:string;input?:Record<string,unknown>;patches?:DraftPatch[];guards?:Guard[];localId?:string};
export type AbLocalScope={scope:string;generation:string|null;baseId:string|null;changes:AbLocalChange[]};
const equal=(a:unknown,b:unknown)=>stableDraftJSON(a)===stableDraftJSON(b);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const path=(v:unknown)=>Array.isArray(v)&&v.length>0&&v.length<=3&&v.every(step=>typeof step==='string'?!!step&&!['__proto__','constructor','prototype'].includes(step):object(step)&&Object.keys(step).length===1&&typeof step.id==='string'&&!!step.id);
export function abLocalScopes(command:ModuleDraftCommand):AbLocalScope[]{
 if(command.action!=='save'||command.moduleAction!=='save-local-v1'||command.patches||command.guards||!object(command.input)||Object.keys(command.input).some(k=>!['scopes','stateRevision'].includes(k))||command.input.stateRevision!==undefined&&(!Number.isSafeInteger(command.input.stateRevision)||Number(command.input.stateRevision)<1)||!Array.isArray(command.input.scopes)||command.input.scopes.length>128)throw new DraftConflict('INVALID_AB_LOCAL_SAVE',422);
 const scopes=command.input.scopes as AbLocalScope[],seen=new Set<string>();let size=0,restores=0;
 for(const entry of scopes){
  if(!object(entry)||Object.keys(entry).some(k=>!['scope','generation','baseId','changes'].includes(k))||typeof entry.scope!=='string'||! /^[AB]:\S.*$/.test(entry.scope)||seen.has(entry.scope)||!(entry.generation===null||typeof entry.generation==='string'&&!!entry.generation)||!(entry.baseId===null||typeof entry.baseId==='string')||!Array.isArray(entry.changes))throw new DraftConflict('INVALID_AB_LOCAL_SAVE',422);
  seen.add(entry.scope);size+=entry.changes.length;
  for(const change of entry.changes){if(!object(change)||Object.keys(change).some(k=>!['moduleAction','input','patches','guards','localId'].includes(k))||change.moduleAction&&!['create-error','create-item','delete-error','delete-item','restore-item-local-v1'].includes(change.moduleAction)||change.moduleAction&&change.patches||!change.moduleAction&&!Array.isArray(change.patches)||change.input!==undefined&&!object(change.input)||change.localId!==undefined&&typeof change.localId!=='string'||change.patches!==undefined&&(!Array.isArray(change.patches)||!change.patches.every(p=>object(p)&&p.op==='set'&&path(p.path)&&Object.hasOwn(p,'value')))||change.guards!==undefined&&(!Array.isArray(change.guards)||!change.guards.every(g=>object(g)&&path(g.path)&&Object.hasOwn(g,'value'))))throw new DraftConflict('INVALID_AB_LOCAL_SAVE',422);
   if(change.moduleAction==='restore-item-local-v1'&&++restores>1)throw new DraftConflict('INVALID_AB_ITEM_RESTORE',422);
  }
 }
 if(size>256)throw new DraftConflict('LOCAL_SAVE_LIMIT',422);return scopes;
}
/** Translate only changed membership cells. A peer's other cells/fields survive. */
export function mergeAbLocalFields(content:AbSnapshot,change:AbLocalChange):AbLocalChange{
 const next=cloneDraft(change);if(next.moduleAction)return next;
 for(const patch of next.patches||[]){
  if(!object(patch)||patch.op!=='set'||!Array.isArray(patch.path)||patch.path.length!==3||!object(patch.path[1])||typeof patch.path[1].id!=='string')throw new DraftConflict('INVALID_AB_LOCAL_SAVE',422);
  const [kind,entity,field]=patch.path;if(typeof kind!=='string'||!['errors','items'].includes(kind)||typeof field!=='string')throw new DraftConflict('INVALID_AB_LOCAL_SAVE',422);
  const rows=content[kind as keyof AbSnapshot].filter(r=>r.id===entity.id),row=rows[0];
  if(rows.length!==1||row.deleted)throw new DraftConflict('ENTITY_REMOVED_OR_AMBIGUOUS',409,{path:patch.path,rowState:rows.length>1?'ambiguous':row?'deleted':'missing'});
  const guards=next.guards?.filter(g=>equal(g.path,patch.path));if(guards?.length!==1)throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
  const guard=guards[0],current=(row as unknown as Record<string,unknown>)[field];
  if(kind==='items'&&field==='productCodes'){
   const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(x=>typeof x==='string')&&new Set(v).size===v.length;
   if(!strings(guard.value)||!strings(patch.value)||!strings(current))throw new DraftConflict('INVALID_AB_MATRIX',422);
   const before=new Set(guard.value),wanted=new Set(patch.value),merged=new Set(current);
   for(const code of new Set([...before,...wanted]))if(before.has(code)!==wanted.has(code)){if(wanted.has(code))merged.add(code);else merged.delete(code);}
   patch.value=[...merged];guard.value=cloneDraft(current);
  }else if(equal(current,patch.value))guard.value=cloneDraft(current);
 }
 return next;
}
/** Request-private root. Caller publishes it only with the final module Save CAS. */
export function applyAbLocalScopes(root:AbControl,command:ModuleDraftCommand,state:State,base:Omit<DraftContext<AbSnapshot>,'structure'|'validate'|'semantic'|'activeId'>,restoreAuthorized=false):AbControl{
 const entries=abLocalScopes(command),candidate=cloneDraft(root);let index=0;
 for(const entry of entries){
  const adapter=abWorkflowAdapter(entry.scope,'legacy-origin'),scope=adapter.parse('{}',candidate) as AbSharedScope;
  if(scope.activeVersionId!==entry.baseId||(scope.workflow?.generation||null)!==entry.generation)throw new DraftConflict('DRAFT_GENERATION_CHANGED');
  adapter.beforeBegin?.(scope,state);
  if(openAb(scope)&&openAb(scope)?.status!=='draft')throw new DraftConflict('PENDING_LOCKED');
  if(!scope.workflow){const content=openAb(scope)?.snapshot||activeAb(scope)?.snapshot||{errors:[],items:[]};scope.workflow=createSharedDraft('ipqc-ab:'+entry.scope,content,scope.activeVersionId,base.id());}
  const context=adapter.context(scope,state,base),ids=new Map<string,string>(),codes=new Map<string,string>(),restored:string[]=[];
  const remap=(value:unknown):unknown=>Array.isArray(value)?value.map(remap):object(value)?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='code'&&typeof value.id==='string'&&codes.has(value.id)?codes.get(value.id):['id','errorId'].includes(k)&&typeof v==='string'&&ids.has(v)?ids.get(v):remap(v)])):value;
  for(const raw of entry.changes){
   let change:AbLocalChange;
   try{change=mergeAbLocalFields(scope.workflow.working,remap(raw) as AbLocalChange);}catch(error){if(error instanceof DraftConflict)throw new DraftConflict(error.code,error.status,{...(object(error.details)?error.details:{}),scope:entry.scope});throw error;}
   const operationId=command.operationId+'-ab-'+index++,clientId='ab-local-'+command.operationId;
   if(change.moduleAction?.startsWith('create')){if(!raw.localId||!/^local-[a-zA-Z0-9_-]{8,80}$/.test(raw.localId)||ids.has(raw.localId))throw new DraftConflict('INVALID_LOCAL_ID',422);}
   else if(raw.localId)throw new DraftConflict('INVALID_LOCAL_ID',422);
   if(change.moduleAction?.startsWith('delete')){const kind=change.moduleAction==='delete-error'?'errors':'items';if(!change.guards?.some(g=>equal(g.path,[kind,{id:change.input?.id}])))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);}
   let result:ReturnType<typeof adapter.apply>;try{
    if(change.moduleAction==='restore-item-local-v1'){
     if(!restoreAuthorized)throw new DraftConflict('RESTORE_PERMISSION_REQUIRED',403);
     const input=change.input||{},origin=input.origin,fields=input.fields;const current:AbSnapshot['items']=scope.workflow.working.items.filter(r=>r.id===input.id),row:AbSnapshot['items'][number]=current[0],editable=['standard','methodText','inspectionMode','equipmentId','isEnabled','rules','standardPhotos','methodPhotos','productCodes','reason'];
     if(Object.keys(input).some(k=>!['id','origin','fields'].includes(k))||typeof input.id!=='string'||!object(origin)||origin.deleted!==false||!object(fields)||!Object.keys(fields).length||Object.keys(fields).some(k=>!editable.includes(k))||!Object.keys(fields).some(k=>!equal(origin[k],fields[k])))throw new DraftConflict('INVALID_AB_ITEM_RESTORE',422);
     if(current.length!==1||row.deleted!==true)throw new DraftConflict('RESTORE_TARGET_CHANGED',409,{path:['items',{id:input.id}]});
     if(['id','code','errorId','sourceRows','sourceTool','sourceMethod','sourceFrequency','sourceVersion','sourceChangedAt','sourceReason','sourceCreator','sourceNote'].some(k=>!equal((row as unknown as Record<string,unknown>)[k],origin[k])))throw new DraftConflict('RESTORE_IDENTITY_CHANGED',409,{path:['items',{id:input.id}]});
     const parents=scope.workflow.working.errors.filter(e=>e.id===row.errorId);if(parents.length!==1||parents[0].deleted!==false)throw new DraftConflict('RESTORE_PARENT_UNAVAILABLE',409,{path:['items',{id:input.id}]});
     for(const p of [['items',{id:row.id}],['errors',{id:row.errorId}]] as DraftPatch['path'][])if(change.guards?.filter(g=>equal(g.path,p)).length!==1)throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
     result=applyDraftCommand(scope.workflow,{action:'apply',generation:scope.workflow.generation,operationId,clientId,sequence:index,guards:change.guards,patches:[{op:'set',path:['items',{id:row.id},'deleted'],value:false},...Object.entries(fields).map(([field,value])=>({op:'set' as const,path:['items',{id:row.id},field],value}))]},context);restored.push(row.id);
    }else result=adapter.apply(scope,{action:'apply',generation:scope.workflow.generation,operationId,clientId,sequence:index,...change},{...context,commandFingerprint:undefined});
   }catch(error){if(error instanceof DraftConflict){const kind=change.moduleAction==='delete-error'?'errors':change.moduleAction==='delete-item'?'items':null,rows=kind?scope.workflow.working[kind].filter(r=>r.id===change.input?.id):[];
    throw new DraftConflict(error.code,error.status,{...(object(error.details)?error.details:{}),...(error.code==='ENTITY_REMOVED_OR_AMBIGUOUS'&&kind?{path:[kind,{id:change.input?.id}],rowState:rows.length>1?'ambiguous':rows[0]?.deleted?'deleted':'missing'}:{}),scope:entry.scope});}throw error;}
   if(result instanceof Promise)throw new DraftConflict('ASYNC_AB_ADAPTER_UNSUPPORTED',500);
   scope.workflow=result.state;delete scope.workflow.receipts[operationId];delete scope.workflow.sequences[stableDraftJSON([base.actor.id,clientId])];
   if(raw.localId){const kind=change.moduleAction==='create-error'?'errors':'items',id=(kind==='errors'?'error-':'item-')+operationId;ids.set(raw.localId,id);codes.set(raw.localId,scope.workflow.working[kind].find(r=>r.id===id)!.code);}
  }
  projectSharedVersion(scope,base.actor,base.at);if(restored.length)openAb(scope)!.history.push({action:'restore-item',actorId:base.actor.id,actorName:base.actor.name,at:base.at,comment:restored.join(',')+'; operation '+command.operationId});adapter.serializeModel!(scope);
 }
 return candidate;
}
