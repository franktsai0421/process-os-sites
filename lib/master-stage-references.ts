type Row=Record<string,unknown>;
const str=(v:unknown)=>typeof v==='string'?v:typeof v==='number'?String(v):'';
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):[];
const parse=(raw:string|undefined):unknown=>raw?JSON.parse(raw):null;
export function masterStageCodes(catalog:unknown):string[]{
  return rows(object(catalog).lines).flatMap(line=>rows(line.stages).map(stage=>str(stage.code))).filter(Boolean);
}
export function removedMasterStages(before:unknown,after:unknown):string[]{
  const next=new Set(masterStageCodes(after));return masterStageCodes(before).filter(code=>!next.has(code));
}
export function removesLineWithStages(previous:unknown,next:unknown){
 const retained=new Set(rows(object(next).lines).map(line=>str(line.id||line.code)));
 return rows(object(previous).lines).some(line=>!retained.has(str(line.id||line.code))&&rows(line.stages).length>0);
}
// Read every protected source from the same CAS revision. Client route cleanup
// cannot erase the evidence that a stage is still in use.
type ReferenceRow={stage:string;source:string;id:string;kind:string;module:string;recordId?:string};
function collectReferences(values:Record<string,string>,codes:string[],previous?:unknown,preparedMaster?:unknown,onRecord?:(row:ReferenceRow,record:Row,context:Row)=>void){
  if(!codes.length)return {total:0,references:[],truncated:false};
  const wanted=new Set(codes),result:ReferenceRow[]=[],seen=new Set<string>();
  const add=(stage:string,source:string,id:string,kind:string,module:string,record:Row,context:Row={})=>{const key=JSON.stringify([stage,source,id,kind]);if(wanted.has(stage)&&!seen.has(key)){seen.add(key);const row={stage,source,id,kind,module,recordId:str(record.id||id)};result.push(row);onRecord?.(row,record,context);}};
  const catalog=(value:unknown,source:string,module:string)=>{for(const p of rows(object(value).products))for(const stage of Array.isArray(p.stages)?p.stages:[])add(str(stage),source,str(p.code||p.id),'product-route',module,p);
    for(const group of rows(object(value).categoryGroups))for(const stage of Array.isArray(group.defaultStages)?group.defaultStages:[])add(str(stage),source,str(group.id||group.name),'group-route',module,group);};
  const operations=(value:unknown,source:string)=>{const record=object(value);for(const [stage,list]of Object.entries(object(record.stages)))for(const op of rows(list))add(stage,source,str(op.id||op.number),'operation','editor',op,record);
    for(const workspace of rows(record.workspaces))operations(workspace,source+'/'+str(workspace.id));};
  const master=object(preparedMaster??parse(values.masterDataControl));
  for(const [scope,content]of Object.entries(object(master.active)))if(scope!=='PROCESS')catalog(content,'master:active:'+scope,scope.toLowerCase());
  for(const v of rows(master.versions))if(['draft','pending','pending-test'].includes(String(v.status)))catalog(v.snapshot,'master:'+String(v.id),str(v.scope).toLowerCase());
  for(const [scope,value]of Object.entries(object(master.workflowScopes))){const flow=object(value);catalog(flow.working,'master:working:'+scope,scope.toLowerCase());catalog(object(flow.saved).content,'master:saved:'+scope,scope.toLowerCase());}
  if(previous)catalog(previous,'master:previous-working','current');
  if(!values.processAuthoringControl){
    for(const version of rows(parse(values.approvalVersions)))if(['approved','draft','pending','pending-test'].includes(String(version.status)))operations(version,'editor:'+String(version.status)+':'+String(version.id));
    for(const [key,raw]of Object.entries(values))if(key.startsWith('processEditor:'))operations(parse(raw),key);
  }
  const authoring=object(parse(values.processAuthoringControl)),flow=object(authoring.workflow);
  for(const [label,content]of Object.entries({active:object(flow.active).content,working:flow.working,saved:object(flow.saved).content}))if(content)operations(content,'authoring:'+label);
  for(const c of rows(flow.cases))if(c.status==='pending')operations(c.content,'authoring:pending:'+str(c.id));
  return {total:result.length,references:result.slice(0,100),truncated:result.length>100};
}

export function stageReferences(values:Record<string,string>,codes:string[],previous?:unknown,preparedMaster?:unknown){return collectReferences(values,codes,previous,preparedMaster);}
// Resolve the exact current protected source, never substitute another snapshot
// when a history record or workspace no longer matches the link.
export function stageReferenceRecord(values:Record<string,string>,selector:{stage:string;source:string;recordId:string;kind:string}){
 let found:{reference:ReferenceRow;record:Row;context:Row}|undefined;
 collectReferences(values,[selector.stage],undefined,undefined,(reference,record,context)=>{
  if(reference.source===selector.source&&reference.recordId===selector.recordId&&reference.kind===selector.kind)found={reference,record,context};
 });return found;
}
