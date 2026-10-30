// Structured relationships only. Never search display text, credentials or logs.
type Row=Record<string,unknown>;
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):[];
const text=(v:unknown)=>typeof v==='string'?v:'';
const sources:Record<string,string>={processAuthoringControl:'editor',approvalVersions:'editor',qualityMasterControl:'fqc',ipqcABMasterControl:'ipqc-ab',ipqcCMasterControl:'ipqc-c',iqcMasterControl:'iqc',routineEquipmentControl:'equipment',toolingMasterControl:'tooling',routineFqcControl:'routine',bomMasterControl:'bom',bomOverrides:'bom',dispatchBoard:'dispatch'};
export type CatalogReference={code:string;module:string;path:string;id:string;stage:string;kind:string};
export function visibleCatalogReferences<T extends {references:CatalogReference[]}>(impact:T,cells:Record<string,boolean>):T {
 return {...impact,references:impact.references.map(ref=>ref.module==='catalog'||cells[ref.module+'.view']&&(!/^(approvalVersions)(?:\/|$)|\/(versions|cases|saves)\//.test(ref.path)||cells[ref.module+'.history'])?ref:{code:ref.code,module:ref.module,path:'',id:'',stage:'',kind:'restricted-reference'})};
}
export function catalogReferences(values:Record<string,string>,codes:string[],categories:{line:string;name:string}[]=[]) {
 const wanted=new Set(codes),references:CatalogReference[]=[],seen=new Set<string>();
 const add=(code:string,module:string,path:string,row:Row,kind:string)=>{
  const entry={code,module,path,id:text(row.id)||text(row.code),stage:text(row.stageCode),kind},key=JSON.stringify(entry);
  if(!seen.has(key)){seen.add(key);references.push(entry);}
 };
 function visit(value:unknown,module:string,path:string) {
  if(Array.isArray(value)){value.forEach((row,i)=>visit(row,module,path+'/'+i));return;}
  if(!value||typeof value!=='object')return;
  const row=object(value);
  // A reference envelope means the caller failed to request complete history.
  if(Object.hasOwn(row,'__immutableBody'))throw Error('REFERENCE_HISTORY_NOT_LOADED');
  for(const category of categories)if(row.line===category.line&&(row.category===category.name||row.group===category.name))add(category.line+'/'+category.name,module,path,row,'category');
  for(const [key,child]of Object.entries(row)){
   if(['productCode','bomProductCode'].includes(key)&&wanted.has(text(child)))add(text(child),module,path+'/'+key,row,key);
   if(key==='productCodes'&&Array.isArray(child))for(const code of child)if(wanted.has(text(code)))add(text(code),module,path+'/'+key,row,key);
   if(['bomSelections','productInstructions','productInstructionSteps','productMediaItems','bom'].includes(key))for(const code of Object.keys(object(child)))if(wanted.has(code))add(code,module,path+'/'+key,row,key);
   if(module==='bom'&&key==='itemCode'&&wanted.has(text(child)))add(text(child),module,path+'/'+key,row,'bom-component');
   // Routine FQC freezes product rows inside its source snapshot.
   if(module==='routine'&&key==='products'&&Array.isArray(child))for(const product of rows(child))if(wanted.has(text(product.code)))add(text(product.code),module,path+'/products',product,'snapshot-product');
   if(child&&typeof child==='object')visit(child,module,path+'/'+key);
  }
 }
 for(const [key,raw]of Object.entries(values)){
  const moduleName=key.startsWith('processEditor:')?'editor':sources[key];if(!moduleName||!raw)continue;
  const value:unknown=JSON.parse(raw);
  if(key==='dispatchBoard')for(const [line,items]of Object.entries(object(value)))for(const code of Array.isArray(items)?items:[])if(wanted.has(text(code)))add(text(code),moduleName,line,{},'dispatch');
  if(key==='bomOverrides')for(const code of Object.keys(object(object(value).data??value)))if(wanted.has(code))add(code,moduleName,'bom/'+code,{},'bom-root');
  visit(value,moduleName,key);
 }
 return {total:references.length,references:references.slice(0,100),truncated:references.length>100};
}
export function removedCatalogReferences(values:Record<string,string>,previous:Row,next:Row) {
 const products=new Set(rows(next.products).map(p=>text(p.code)));
 const removed=rows(previous.products).map(p=>text(p.code)).filter(code=>!products.has(code));
 const groups=rows(next.categoryGroups);
 const categories=rows(previous.categoryGroups).filter(g=>!groups.some(n=>n.line===g.line&&n.name===g.name)).map(g=>({line:text(g.line),name:text(g.name)}));
 const impact=catalogReferences(values,removed,categories);
 // A single destructive command must not erase its own dependency evidence.
 // Removing products/routes first is a separate explicit, guarded action.
 for(const group of rows(previous.categoryGroups).filter(g=>!groups.some(n=>n.id===g.id&&n.id||n.line===g.line&&n.name===g.name))){
  for(const product of rows(previous.products))if(product.line===group.line&&product.category===group.name){impact.total++;impact.references.push({code:text(group.line)+'/'+text(group.name),module:'catalog',path:'products',id:text(product.code),stage:'',kind:'category-product'});}
  if(Array.isArray(group.defaultStages)&&group.defaultStages.length){impact.total++;impact.references.push({code:text(group.line)+'/'+text(group.name),module:'catalog',path:'categoryGroups/defaultStages',id:text(group.id),stage:'',kind:'category-route'});}
 }
 for(const group of categories)for(const product of rows(next.products))if(product.line===group.line&&product.category===group.name){impact.total++;if(impact.references.length<100)impact.references.push({code:group.line+'/'+group.name,module:'catalog',path:'products',id:text(product.code),stage:'',kind:'category-product'});else impact.truncated=true;}
 impact.truncated ||= impact.references.length>100;impact.references=impact.references.slice(0,100);return impact;
}
