type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown) => typeof value === 'string' ? value : '';
export type MasterReferenceTarget = {kind:'template'|'equipment';id:string;stage?:string;number?:string};
export type MasterReference = {source:string;status:string;versionId:string;line:string;category:string;stage:string;operationId:string;number:string;name:string;products:string[]};
export function processMasterTargets(snapshot:unknown):MasterReferenceTarget[] {
 return Object.entries(object(snapshot)).flatMap(([stage,list])=>rows(list).flatMap(template=>[
  {kind:'template' as const,id:text(template.id),stage},
  ...rows(template.equipment).map(e=>({kind:'equipment' as const,id:text(e.id),number:text(e.number),stage}))
 ]));
}
export function removedProcessMasterTargets(before:unknown,after:unknown) {
 const next=new Set(processMasterTargets(after).map(t=>t.kind+':'+t.id));
 return processMasterTargets(before).filter(t=>!next.has(t.kind+':'+t.id));
}
// Current consumers only. Closed immutable cases and saves retain their own
// historical snapshots; deleting a catalog entry never rewrites those bodies.
export function processMasterReferences(values:Record<string,string>,targets:MasterReferenceTarget[]) {
 const references:MasterReference[]=[],seen=new Set<string>();
 if(!targets.length)return {total:0,references,truncated:false};
 const templates=new Set(targets.filter(t=>t.kind==='template').map(t=>t.id));
 const equipment=targets.filter(t=>t.kind==='equipment');
 walkReferences(values, (op,stage,meta,source,status,versionId) => {
   const ids=Array.isArray(op.machineIds)?op.machineIds:[op.machineId].filter(Boolean);
   const match=templates.has(text(op.templateId))||equipment.some(e=>
    ids.includes(e.id)||!!e.number&&ids.includes(e.number)&&(e.stage===stage)||
    rows(op.machineDetails).some(m=>m.id===e.id||m.no===e.id||!!e.number&&e.stage===stage&&(m.number===e.number||m.no===e.number)));
   if(!match)return;
   const key=JSON.stringify([source,versionId,meta.id,stage,op.id]);
   if(seen.has(key))return;seen.add(key);
   references.push({source,status,versionId,line:text(meta.line)||stage.split('-')[0],category:text(meta.category),stage,operationId:text(op.id),number:text(op.number),name:text(op.name),products:Array.isArray(op.productCodes)?op.productCodes.filter((p):p is string=>typeof p==='string'):[]});
 });
 return {total:references.length,references:references.slice(0,100),truncated:references.length>100};
}

type Visitor = (op:Row,stage:string,meta:Row,source:string,status:string,versionId:string)=>void;
function walkReferences(values:Record<string,string>, consume:Visitor, display:'summary'|'detail'|null=null) {
 const parse=(key:string):unknown=>values[key]?JSON.parse(values[key]):null;
 function visit(value:unknown,source:string,status:string,versionId='',parent:Row={}) {
  if(display==='summary'&&!['active','approved','effective-fallback'].includes(status))return;
  const current=object(value),meta={...parent,...current};
  for(const [stage,list]of Object.entries(object(current.stages)))for(const op of rows(list)){
   consume(op,stage,meta,source,status,versionId);
  }
  for(const workspace of rows(current.workspaces))visit(workspace,source,status,versionId,meta);
 }
 const authoring=object(parse('processAuthoringControl')),flow=object(authoring.workflow);
 if(authoring.workflow){
  visit(object(flow.active).content,'authoring','active',text(object(flow.active).id));
  visit(flow.working,'authoring','working');
  if(!display||flow.working==null)visit(object(flow.saved).content,'authoring','saved',text(object(flow.saved).id));
  for(const c of rows(flow.cases))if(c.status==='pending')visit(c.content,'authoring','pending',text(c.id));
 }else{
  const versions=rows(parse('approvalVersions')),effectiveScopes=new Set(versions.filter(v=>v.status==='approved').map(v=>JSON.stringify([v.category,v.line])));
  const fallback=new Map<string,Row>();
  for(const v of versions){
   if(['approved','draft','pending','pending-test'].includes(text(v.status)))visit(v,'legacy',text(v.status),text(v.id));
   const scope=JSON.stringify([v.category,v.line]);
   if(v.status==='superseded'&&!effectiveScopes.has(scope)&&(!fallback.has(scope)||Number(v.number)>Number(fallback.get(scope)!.number)))fallback.set(scope,v);
  }
  for(const v of fallback.values())visit(v,'legacy','effective-fallback',text(v.id));
  if(display!=='summary')for(const [key,value]of Object.entries(values))if(key.startsWith('processEditor:'))visit(JSON.parse(value),key,'working');
 }
 // Published dispatch snapshots can remain live after a new authoring draft.
 if(display==='summary')return;
 const published=parse('publishedProcess');
 if(Array.isArray(published))for(const v of published)visit(v,'published','active',text(object(v).id));
 else {visit(published,'published','active');for(const v of Object.values(object(published)))if(v&&typeof v==='object')visit(v,'published','active',text(object(v).id));}
}

export type MissingEquipmentReference = Pick<MasterReference,'line'|'category'|'stage'|'operationId'|'number'> & {machine:string};

/** Read-only display projection. The removal guard still scans working AND saved. */
export function equipmentReferenceIndex(values:Record<string,string>,targets:MasterReferenceTarget[],mode:'summary'|'detail',catalog=targets,missing?:Map<string,MissingEquipmentReference>) {
 const index=new Map<string,Map<string,MasterReference>>();
 const numbers=new Map<string,Set<string>>();
 const stageNumber=(stage:string,number:string)=>JSON.stringify([stage,number]);
 const catalogIds=new Set(catalog.filter(t=>t.kind==='equipment').map(t=>t.id));
 for(const target of targets)if(target.kind==='equipment')index.set(target.id,new Map());
 for(const target of catalog){
  if(target.kind!=='equipment')continue;
  if(!target.number||!target.stage)continue;
  const key=stageNumber(target.stage,target.number), ids=numbers.get(key)??new Set<string>();
  ids.add(target.id);numbers.set(key,ids);
 }
 walkReferences(values,(op,stage,workspace,source,status,versionId)=>{
  const matched=new Set<string>();
  const line=text(workspace.line)||stage.split('-')[0],category=text(workspace.category);
  const operationId=text(op.id),number=text(op.number);
  const details=rows(op.machineDetails),seenDetails=new Set<Row>();
  function match(raw:string,detail?:Row){
   if(!raw)return;
   const pinned=text(detail?.id),key=pinned||raw;
   let resolved=catalogIds.has(key)?key:undefined;
   if(!resolved&&!pinned){
    const candidates=new Set<string>();
    for(const number of [raw,text(detail?.number),text(detail?.no)])if(number){
     for(const id of numbers.get(stageNumber(stage,number))||[])candidates.add(id);
    }
    if(candidates.size===1)resolved=candidates.values().next().value;
   }
   if(resolved){if(index.has(resolved))matched.add(resolved);}
   else if(missing)missing.set(JSON.stringify([line,category,stage,operationId||number,raw]),{line,category,stage,operationId,number,machine:raw});
  }
  for(const value of Array.isArray(op.machineIds)?op.machineIds:[op.machineId]){
   const raw=text(value);if(!raw)continue;
   const detail=details.find(m=>m.id===raw)||details.find(m=>m.no===raw||m.number===raw);
   if(detail)seenDetails.add(detail);
   match(raw,detail);
  }
  for(const detail of details)if(!seenDetails.has(detail))match(text(detail.id)||text(detail.no)||text(detail.number),detail);
  if(!matched.size)return;
  const ref={source,status,versionId,line,category,stage,operationId:text(op.id),number:text(op.number),name:text(op.name),
   products:mode==='detail'&&Array.isArray(op.productCodes)?op.productCodes.filter((p):p is string=>typeof p==='string'):[]};
  const key=JSON.stringify([line,category,text(workspace.id),stage,ref.operationId||ref.number,
   ...(mode==='detail'?[source,status,versionId]:[])]);
  for(const id of matched){
   const items=index.get(id)!, prior=items.get(key);
   if(!prior)items.set(key,ref);
   else if(mode==='detail')items.set(key,{...prior,products:[...new Set([...prior.products,...ref.products])]});
  }
 },mode);
 return index;
}
