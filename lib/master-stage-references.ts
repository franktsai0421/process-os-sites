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
// Read every protected source from the same CAS revision. Client route cleanup
// cannot erase the evidence that a stage is still in use.
export function stageReferences(values:Record<string,string>,codes:string[],previous?:unknown){
  if(!codes.length)return {total:0,references:[],truncated:false};
  const wanted=new Set(codes),result:{stage:string;source:string;id:string;kind:string}[]=[],seen=new Set<string>();
  const add=(stage:string,source:string,id:string,kind:string)=>{const key=JSON.stringify([stage,source,id,kind]);if(wanted.has(stage)&&!seen.has(key)){seen.add(key);result.push({stage,source,id,kind});}};
  const catalog=(value:unknown,source:string)=>{for(const p of rows(object(value).products))for(const stage of Array.isArray(p.stages)?p.stages:[])add(str(stage),source,str(p.code||p.id),'product-route');
    for(const group of rows(object(value).categoryGroups))for(const stage of Array.isArray(group.defaultStages)?group.defaultStages:[])add(str(stage),source,str(group.id||group.name),'group-route');};
  const operations=(value:unknown,source:string)=>{const record=object(value);for(const [stage,list]of Object.entries(object(record.stages)))for(const op of rows(list))add(stage,source,str(op.id||op.number),'operation');
    for(const workspace of rows(record.workspaces))operations(workspace,source+'/'+str(workspace.id));};
  const master=object(parse(values.masterDataControl));
  for(const [scope,content]of Object.entries(object(master.active)))if(scope!=='PROCESS')catalog(content,'master:active:'+scope);
  for(const v of rows(master.versions))if(['draft','pending','pending-test'].includes(String(v.status)))catalog(v.snapshot,'master:'+String(v.id));
  for(const [scope,value]of Object.entries(object(master.workflowScopes))){const flow=object(value);catalog(flow.working,'master:working:'+scope);catalog(object(flow.saved).content,'master:saved:'+scope);}
  if(previous)catalog(previous,'master:previous-working');
  if(!values.processAuthoringControl){
    for(const version of rows(parse(values.approvalVersions)))if(['approved','draft','pending','pending-test'].includes(String(version.status)))operations(version,'editor:'+String(version.status)+':'+String(version.id));
    for(const [key,raw]of Object.entries(values))if(key.startsWith('processEditor:'))operations(parse(raw),key);
  }
  const authoring=object(parse(values.processAuthoringControl)),flow=object(authoring.workflow);
  for(const [label,content]of Object.entries({active:object(flow.active).content,working:flow.working,saved:object(flow.saved).content}))if(content)operations(content,'authoring:'+label);
  for(const c of rows(flow.cases))if(c.status==='pending')operations(c.content,'authoring:pending:'+str(c.id));
  return {total:result.length,references:result.slice(0,100),truncated:result.length>100};
}
