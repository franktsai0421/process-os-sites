import {applyDraftCommand,DraftConflict,cloneDraft,stableDraftJSON,type SharedDraft,type DraftIssue} from './shared-draft';
import {type WorkflowAdapter,type NumericVersion} from './versioned-shared-workflow';
import {removedMasterStages,stageReferences} from './master-stage-references';
import {assertStageTemplateAvailable} from './master-process-lock';
import {stageProcessLink,assertProcessLinkAvailable,checkPinnedStageProcessLink,activateStageProcessLink,type StageProcessLink} from './master-stage-link';
type Entity=Record<string,unknown>&{id:string};
type Snapshot=Record<string,unknown>;
type Version=NumericVersion<Snapshot>&{scope:string;parentVersionId?:string|null};
type Library={activeVersionId:string|null;versions:Version[];workflow?:SharedDraft<Snapshot>};
type Root={active:Record<string,Snapshot>;versions:Version[];workflowScopes?:Record<string,SharedDraft<Snapshot>>};
const rows=(v:unknown):Entity[]=>{if(!Array.isArray(v))throw new DraftConflict('CATALOG_ARRAY_REQUIRED',422);return v;};
const str=(v:unknown)=>typeof v==='string'?v:'';
const presets=['entry','manual','manual-inspection','machine-assembly','exit'];
// Stable IDs are additive V3 working metadata. Legacy version payloads are not rewritten.
export function normalizeMasterSnapshot(snapshot:Snapshot,scope:string):Snapshot{
 const next=cloneDraft(snapshot);
 if(scope!=='PROCESS'){
  for(const key of ['products','lines','categoryGroups']){
   const list=key==='categoryGroups'?next[key]||[]:next[key];
   next[key]=rows(list).map(row=>({...row,id:row.id||key+':'+(key==='categoryGroups'?JSON.stringify([row.line,row.name]):str(row.code)),
    ...(key==='lines'?{stages:rows(row.stages).map(stage=>({...stage,id:stage.id||'stage:'+str(stage.code)}))}:{})}));
  }
 }else for(const templates of Object.values(next))for(const template of rows(templates)){
   if(['machine-assembly','machine-setting'].includes(str(template.presetKey)))template.equipment ||= [];
 }
 return next;
}
export function masterWorkflowAdapter(scope:string):WorkflowAdapter<Snapshot,Library>{
 let root:Root,legacy=new Map<string,Version>(),values:Record<string,string>,linkedActivated=false;
 return{key:'masterDataControl',scope:'master:'+scope,empty:()=>scope==='PROCESS'?{}:{products:[],lines:[],categoryGroups:[]},photoIds:()=>[],photoPrefix:'master/photos/',
   preparedModel:true,permissionOnlyRead:true,
  parse(raw,prepared){if(!['AB','C','PROCESS'].includes(scope))throw new DraftConflict('SCOPE_INVALID',422);if(!raw)throw new DraftConflict('MASTER_INITIALIZATION_REQUIRED',422);
   root=(prepared||JSON.parse(raw)) as Root;if(!root.active?.[scope]||!Array.isArray(root.versions))throw new DraftConflict('MASTER_EXISTING_DATA_INVALID',422);
   // Each adapter belongs to one request. Keep untouched legacy snapshots by
   // reference; deep-copying every historical version here multiplies heap use.
   const versions=root.versions.filter(v=>v.scope===scope);legacy=new Map(versions.map(v=>[v.id,v]));
   const matchingActive=(v:Version)=>v.status==='approved'&&stableDraftJSON(v.snapshot)===stableDraftJSON(root.active[scope]);
   const active=versions.find(v=>v.id===root.workflowScopes?.[scope]?.active.id&&matchingActive(v))||versions.find(matchingActive);
   if(!active)throw new DraftConflict('MASTER_EFFECTIVE_BASELINE_CONFLICT',409);
   return{activeVersionId:active.id,versions:versions.map(v=>({...v,snapshot:v.id===active.id||['draft','pending'].includes(v.status)?normalizeMasterSnapshot(v.snapshot,scope):v.snapshot})),workflow:root.workflowScopes?.[scope]};
  },
  serialize(control){const cases=new Set(control.workflow?.cases.map(c=>c.id)||[]);
   root.versions=[...root.versions.filter(v=>v.scope!==scope),...control.versions.map(v=>({...v,scope,parentVersionId:v.baseVersionId??v.parentVersionId,
    snapshot:!v.id.startsWith('shared-')&&!cases.has(v.id)&&legacy.has(v.id)?legacy.get(v.id)!.snapshot:v.snapshot}))];
   if(control.activeVersionId)root.active[scope]=root.versions.find(v=>v.id===control.activeVersionId)!.snapshot;
   root.workflowScopes={...root.workflowScopes,[scope]:control.workflow!};return JSON.stringify(root);
  },
  projectValues():Record<string,string>{return scope==='PROCESS'||linkedActivated?{processMasterData:JSON.stringify(root.active.PROCESS)}:{};},
  beforeBegin(){if(scope==='PROCESS')assertProcessLinkAvailable(root);},
  requiresDelete(control,command){
   if(command.action==='restore')return true;
   if((command.patches||[]).some(p=>p.op==='set'&&p.path[0]==='categoryGroups'&&p.path.at(-1)==='defaultStages'&&rows(control.workflow!.working.categoryGroups).some(g=>typeof p.path[1]==='object'&&g.id===p.path[1].id&&Array.isArray(g.defaultStages)&&g.defaultStages.some(code=>!Array.isArray(p.value)||!p.value.includes(code)))))return true;
   return (command.patches||[]).some(p=>p.op==='set'&&p.path[0]==='products'&&p.path.at(-1)==='stages'&&
    rows(control.workflow!.working.products).some(row=>typeof p.path[1]==='object'&&row.id===p.path[1].id&&
     Array.isArray(row.stages)&&row.stages.some(stage=>!Array.isArray(p.value)||!p.value.includes(stage))));
  },
  context(control,state,base){
   values=state.recordStorage?.models.has('masterDataControl')?{...state.values,masterDataControl:JSON.stringify(root)}:state.values;
   const master=root;
   const stages=new Set(['AB','C'].flatMap(s=>rows(master.active[s]?.lines||[]).flatMap(l=>rows(l.stages).map(s=>str(s.code)))));
   return{...base,activeId:control.activeVersionId,
    semantic(content){const strip=(v:unknown):unknown=>Array.isArray(v)?v.map(strip):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='id').map(([k,x])=>[k,strip(x)])):v;return scope==='PROCESS'?content:strip(content);},
    structure(content,previous){
     const unique=(list:Entity[],field='id')=>{const seen=new Set<string>();for(const row of list){const key=str(row?.[field]);if(!key||seen.has(key))throw new DraftConflict('CATALOG_IDENTITY_INVALID',422);seen.add(key);}return seen;};
     if(scope==='PROCESS'){
      assertProcessLinkAvailable(root);
      const equipmentIds=new Set<string>();
      const previousEquipment=new Map(Object.values(previous).flatMap(v=>rows(v).flatMap(t=>rows(t.equipment||[]))).map(e=>[e.id,e]));
      for(const [stage,value]of Object.entries(content)){if(!stages.has(stage))throw new DraftConflict('STAGE_INVALID',422);const templates=rows(value);unique(templates);
       for(const template of templates){const old=rows(previous[stage]||[]).find(t=>t.id===template.id);if(old&&(old.presetKey!==template.presetKey||old.presetVersion!==template.presetVersion))throw new DraftConflict('PRESET_PROVENANCE_PROTECTED',422);
        if(typeof template.name!=='string'||template.mediaItems!==undefined&&!Array.isArray(template.mediaItems))throw new DraftConflict('PROCESS_TEMPLATE_INVALID',422);
        if(template.equipment!==undefined){if(!['machine-assembly','machine-setting'].includes(str(template.presetKey)))throw new DraftConflict('EQUIPMENT_PARENT_INVALID',422);const equipment=rows(template.equipment);unique(equipment);if(equipment.some(e=>e.stageCode!==stage||e.line!==stage.split('-')[0]||e.kind!==template.presetKey||typeof e.name!=='string'||typeof e.number!=='string'||!Array.isArray(e.mediaItems)||e.mediaItems.some(p=>!p||typeof p.src!=='string')))throw new DraftConflict('EQUIPMENT_PARENT_INVALID',422);
         for(const e of equipment){if(equipmentIds.has(e.id))throw new DraftConflict('EQUIPMENT_ID_RESERVED',422);equipmentIds.add(e.id);
          const priorEquipment=previousEquipment.get(e.id);
          if(priorEquipment&&stableDraftJSON(priorEquipment.source)!==stableDraftJSON(e.source))throw new DraftConflict('EQUIPMENT_SOURCE_PROTECTED',422);
         }
        }
       }
      }
     }else{
      // A line removal never implicitly removes its children, even when those
      // stages have no external references. Rechecked on each CAS attempt.
      const retainedLines=new Set(rows(content.lines).map(line=>str(line.id||line.code)));
      if(rows(previous.lines).some(line=>!retainedLines.has(str(line.id||line.code))&&rows(line.stages).length))
       throw new DraftConflict('LINE_HAS_STAGES',409);
      const removed=removedMasterStages(previous,content),impact=stageReferences(removed.length&&state.recordStorage?.models.has('masterDataControl')?{...state.values,masterDataControl:JSON.stringify(root)}:state.values,removed,previous);
      if(impact.total)throw new DraftConflict('STAGE_IN_USE',409,impact);
      assertStageTemplateAvailable(master,previous,content);
      const products=rows(content.products),lines=rows(content.lines),categories=rows(content.categoryGroups);unique(products);unique(products,'code');unique(lines);const lineCodes=unique(lines,'code');unique(categories);
      // UI duplicate checks are advisory. Recheck other scopes in the same CAS read,
      // including saved/pending/working values, so stale pages cannot claim their codes.
      const otherScope=scope==='AB'?'C':'AB';
      const otherCatalogs=[master.active[otherScope],master.workflowScopes?.[otherScope]?.working,
       master.workflowScopes?.[otherScope]?.saved?.content,
       ...master.versions.filter(v=>v.scope===otherScope&&['draft','pending'].includes(v.status)).map(v=>v.snapshot)].filter(Boolean) as Snapshot[];
      const otherProducts=new Set(otherCatalogs.flatMap(c=>rows(c.products||[]).map(p=>str(p.code))));
      const otherLines=new Set(otherCatalogs.flatMap(c=>rows(c.lines||[]).map(l=>str(l.code))));
      const otherStages=new Set(otherCatalogs.flatMap(c=>rows(c.lines||[]).flatMap(l=>rows(l.stages||[]).map(s=>str(s.code)))));
      if(products.some(p=>otherProducts.has(str(p.code))))throw new DraftConflict('PRODUCT_CODE_USED_IN_OTHER_SCOPE',409);
      if(lines.some(l=>otherLines.has(str(l.code))||rows(l.stages).some(s=>otherStages.has(str(s.code)))))throw new DraftConflict('LINE_STAGE_USED_IN_OTHER_SCOPE',409);
      const stageCodes=new Set<string>();for(const line of lines){if(typeof line.name!=='string')throw new DraftConflict('LINE_INVALID',422);const list=rows(line.stages);unique(list);for(const stage of list){if(typeof stage.code!=='string'||!stage.code||stageCodes.has(stage.code)||typeof stage.name!=='string')throw new DraftConflict('STAGE_INVALID',422);stageCodes.add(stage.code);}}
      for(const product of products){if(typeof product.name!=='string'||typeof product.category!=='string'||!lineCodes.has(str(product.line))||!Array.isArray(product.stages)||product.stages.some(code=>typeof code!=='string'||!rows(lines.find(l=>l.code===product.line)!.stages).some(s=>s.code===code)))throw new DraftConflict('PRODUCT_ROUTE_INVALID',422);}
      const categoryKeys=new Set<string>();for(const category of categories){const key=JSON.stringify([category.line,category.name]);if(typeof category.name!=='string'||!lineCodes.has(str(category.line))||categoryKeys.has(key))throw new DraftConflict('CATEGORY_INVALID',422);categoryKeys.add(key);
       if(category.defaultStages!==undefined&&category.defaultStages!==null){
        const route=category.defaultStages,available=rows(lines.find(l=>l.code===category.line)!.stages);
        if(!Array.isArray(route)||new Set(route).size!==route.length||route.some(code=>typeof code!=='string'||!available.some(s=>s.code===code)))throw new DraftConflict('GROUP_ROUTE_INVALID',422);
       }
      }
      for(const product of products){
       if(new Set(product.stages as string[]).size!==(product.stages as string[]).length)throw new DraftConflict('PRODUCT_ROUTE_INVALID',422);
       const group=categories.find(g=>g.line===product.line&&g.name===product.category);
       if(product.routeMode!==undefined&&!['group','exception'].includes(str(product.routeMode)))throw new DraftConflict('PRODUCT_ROUTE_MODE_INVALID',422);
       if(Array.isArray(group?.defaultStages)&&product.routeMode===undefined)throw new DraftConflict('GROUP_ROUTE_MEMBERSHIP_REQUIRED',409);
       if(product.routeMode==='group'&&(!Array.isArray(group?.defaultStages)||stableDraftJSON(product.stages)!==stableDraftJSON(group.defaultStages)))throw new DraftConflict('GROUP_ROUTE_PROJECTION_MISMATCH',409);
      }
     }
    },
    validate(content){const issues:DraftIssue[]=[];
     if(scope==='PROCESS'){
      for(const stage of stages){const templates=rows(content[stage]||[]);if(presets.some(key=>!templates.some(t=>t.presetKey===key)))issues.push({kind:'missing',path:[stage],message:'REQUIRED_PROCESS_PRESETS_MISSING'});for(const template of templates){if(!str(template.name).trim())issues.push({kind:'missing',path:[stage,{id:template.id},'name'],message:'NAME_REQUIRED'});for(const e of rows(template.equipment||[]))if(!str(e.name).trim())issues.push({kind:'missing',path:[stage,{id:template.id},'equipment',{id:e.id},'name'],message:'NAME_REQUIRED'});}}
     }else{
      assertStageTemplateAvailable(master,master.active[scope],content,control.workflow?.pendingId||undefined);
      for(const product of rows(content.products))if(!str(product.name).trim()||!rows(content.lines).some(l=>l.code===product.line)||!Array.isArray(product.stages)||!product.stages.length)issues.push({kind:'missing',path:['products',{id:product.id}],message:'PRODUCT_NAME_ROUTE_REQUIRED'});
      // Only necessary topology changes are linked. PROCESS drafts/pending and
      // another linked case remain authoritative locks, never automatically cleared.
      stageProcessLink(root,scope,content,values,control.workflow?.pendingId||undefined);
     }
     return issues;}
   };
  },
  apply(control,command,context){if(command.action==='apply')for(const p of command.patches||[]){
   const path=p.path,first=path[0],field=path.at(-1);if(typeof first!=='string'||scope!=='PROCESS'&&!['products','lines','categoryGroups'].includes(first))throw new DraftConflict('INVALID_COLLECTION',422);
   if(p.op==='set'&&(path.length<3||typeof path[1]!=='object'))throw new DraftConflict('COLLECTION_REPLACEMENT_FORBIDDEN',422);
   if(p.op==='set'&&(first==='lines'&&path.length===3&&field==='stages'||scope==='PROCESS'&&field==='equipment'))throw new DraftConflict('COLLECTION_REPLACEMENT_FORBIDDEN',422);
   if(p.op==='remove'&&(path.length<2||typeof field!=='object'))throw new DraftConflict('ENTITY_REMOVAL_REQUIRED',422);
   if(p.op==='set'&&(typeof field!=='string'||['id','presetKey','presetVersion'].includes(field)))throw new DraftConflict('IMMUTABLE_IDENTITY',422);
   if(p.op==='set'&&scope!=='PROCESS'){
    const allowed=first==='products'?['code','name','nameVi','category','line','unit','specification','stages','routeMode']:
     first==='categoryGroups'?['line','name','defaultStages']:path.length===5?['code','name','machine','assetNumber','operators']:['code','name'];
    if(!allowed.includes(str(field))||first!=='lines'&&path.length!==3||first==='lines'&&path.length!==3&&!(path.length===5&&path[2]==='stages'&&typeof path[3]==='object'))throw new DraftConflict('UNSUPPORTED_CATALOG_PATCH',422);
   }
   // Every existing-field update must retain its original value as a dependency guard.
   if(!control.workflow!.receipts[command.operationId]&&p.op!=='insert'&&!(command.guards||[]).some(g=>stableDraftJSON(g.path)===stableDraftJSON(path)))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
  }
   if(scope==='PROCESS')assertProcessLinkAvailable(root);
   const flow=control.workflow!,already=flow.receipts[command.operationId];
   type LinkedCase=typeof flow.cases[number]&{linkedProcess?:StageProcessLink};
   let link:StageProcessLink|null=null;
   if(!already&&scope!=='PROCESS'){
    if(command.action==='submit'&&flow.saved)link=stageProcessLink(root,scope,flow.saved.content,values);
    if(command.action==='approve'){
     const review=flow.cases.find(c=>c.id===command.caseId) as LinkedCase|undefined;
     if(review?.linkedProcess){link=review.linkedProcess;checkPinnedStageProcessLink(root,link,review.id);}
    }
   }
   const result=applyDraftCommand(flow,command,context);
   if(!already&&link&&command.action==='submit')(result.state.cases.at(-1) as LinkedCase).linkedProcess=link;
   if(!already&&link&&command.action==='approve'){activateStageProcessLink(root,link,command.caseId!,context.actor,context.at);linkedActivated=true;}
   return result;}
 };
}
