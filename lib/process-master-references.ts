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
 const parse=(key:string):unknown=>values[key]?JSON.parse(values[key]):null;
 function visit(value:unknown,source:string,status:string,versionId='',parent:Row={}) {
  const current=object(value),meta={...parent,...current};
  for(const [stage,list]of Object.entries(object(current.stages)))for(const op of rows(list)){
   const ids=Array.isArray(op.machineIds)?op.machineIds:[op.machineId].filter(Boolean);
   const match=templates.has(text(op.templateId))||equipment.some(e=>
    ids.includes(e.id)||!!e.number&&ids.includes(e.number)&&(e.stage===stage)||
    rows(op.machineDetails).some(m=>m.id===e.id||m.no===e.id||!!e.number&&e.stage===stage&&(m.number===e.number||m.no===e.number)));
   if(!match)continue;
   const key=JSON.stringify([source,versionId,meta.id,stage,op.id]);
   if(seen.has(key))continue;seen.add(key);
   references.push({source,status,versionId,line:text(meta.line)||stage.split('-')[0],category:text(meta.category),stage,operationId:text(op.id),number:text(op.number),name:text(op.name),products:Array.isArray(op.productCodes)?op.productCodes.filter((p):p is string=>typeof p==='string'):[]});
  }
  for(const workspace of rows(current.workspaces))visit(workspace,source,status,versionId,meta);
 }
 const authoring=object(parse('processAuthoringControl')),flow=object(authoring.workflow);
 if(authoring.workflow){
  visit(object(flow.active).content,'authoring','active',text(object(flow.active).id));
  visit(flow.working,'authoring','working');
  visit(object(flow.saved).content,'authoring','saved',text(object(flow.saved).id));
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
  for(const [key,value]of Object.entries(values))if(key.startsWith('processEditor:'))visit(JSON.parse(value),key,'working');
 }
 // Published dispatch snapshots can remain live after a new authoring draft.
 const published=parse('publishedProcess');
 if(Array.isArray(published))for(const v of published)visit(v,'published','active',text(object(v).id));
 else {visit(published,'published','active');for(const v of Object.values(object(published)))if(v&&typeof v==='object')visit(v,'published','active',text(object(v).id));}
 return {total:references.length,references:references.slice(0,100),truncated:references.length>100};
}
