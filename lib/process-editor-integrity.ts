import {legacyJsonValueText,type JsonValue} from './legacy-login-json';
import {DraftConflict,stableDraftJSON} from './shared-draft';
import type {Workspace,Operation} from './process-authoring-workflow';

type Master=Record<string,{id?:string;presetKey?:string;equipment?:{id:string}[]}[]>;
export type EditorIssue={code:string;workspace:string;stage:string;operation:string;detail:string;key:string};
const key=(v:unknown)=>legacyJsonValueText((v??'') as JsonValue).trim().toUpperCase();
export function editorKind(op:Operation,master:Master){
 const code=legacyJsonValueText((op.editorType||master[op.stageCode]?.find(t=>t.id===op.templateId)?.presetKey||op.presetKey||(op.mode==='machine'?'machine':'')) as JsonValue);
 if(code==='entry'||code==='exit')return code;
 if(['machine-assembly','machine-setting','machine'].includes(code))return 'machine';
 return code||'custom';
}
export function editorIntegrity(workspaces:Workspace[],master:Master,bom:(code:string)=>string[]):EditorIssue[]{
 const issues:EditorIssue[]=[],owners=new Map<string,{w:Workspace;stage:string;op:Operation}[]>();
 const add=(w:Workspace,stage:string,op:Operation,code:string,detail:string)=>issues.push({code,workspace:w.id,stage,operation:op.id,detail,key:JSON.stringify([w.id,stage,op.id,code,detail])});
 for(const w of workspaces)for(const [stage,ops]of Object.entries(w.stages)){
  const byId=new Map(ops.map(op=>[op.id,op]));
  // Valid JSON graph rows can share one stage-local incoming lookup. Preserve
  // original includes/filter semantics for every nonstandard legacy shape.
  const incomingById=ops.every(op=>typeof op.id==='string'&&Array.isArray(op.nextIds)&&op.nextIds.every(id=>typeof id==='string'))?new Map<string,Operation[]>():null;
  if(incomingById)for(const source of ops)for(const target of new Set(source.nextIds)){const list=incomingById.get(target)||[];list.push(source);incomingById.set(target,list);}
  for(const kind of ['entry','exit']){const found=ops.filter(o=>editorKind(o,master)===kind);if(found.length>1)for(const o of found)add(w,stage,o,'DUPLICATE_ENDPOINT',kind+':'+found.map(x=>x.id).sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }).join(','));}
  for(const op of ops){const kind=editorKind(op,master),next=Array.isArray(op.nextIds)?op.nextIds:[],incoming=incomingById?incomingById.get(op.id)||[]:ops.filter(o=>o.nextIds?.includes(op.id));
   if(kind==='entry'&&incoming.length)add(w,stage,op,'ENTRY_HAS_INPUT',incoming.map(o=>o.id).sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }).join(','));
   if(kind==='exit'&&(next.length||incoming.length>1))add(w,stage,op,'EXIT_CONNECTION_INVALID',JSON.stringify([next,incoming.map(o=>o.id).sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; })]));
   if(kind!=='entry'&&next.length>1)add(w,stage,op,'SINGLE_SUCCESSOR_REQUIRED',JSON.stringify(next));
   if(new Set(next).size!==next.length)add(w,stage,op,'DUPLICATE_CONNECTION',JSON.stringify(next));
   for(const id of next){if(id===op.id)add(w,stage,op,'SELF_CONNECTION',id);else if(!byId.has(id))add(w,stage,op,'CONNECTION_TARGET_INVALID',id);
    else {const seen=new Set<string>(),queue=[id];while(queue.length){const at=queue.pop()!;if(at===op.id){add(w,stage,op,'CONNECTION_CYCLE',id);break;}if(seen.has(at))continue;seen.add(at);queue.push(...(byId.get(at)?.nextIds||[]));}}
   }
   const selectedMachines=op.machineIds||[];
   if(kind!=='machine'&&selectedMachines.length)add(w,stage,op,'MACHINE_TYPE_INVALID',JSON.stringify(selectedMachines));
   const machineSource=new Set((master[stage]||[]).flatMap(t=>(t.equipment||[]).map(e=>e.id)));
   for(const machine of selectedMachines)if(!machineSource.has(machine))add(w,stage,op,'MACHINE_SOURCE_INVALID',machine);
   const selections=op.bomSelections??(op.bomProductCode?{[op.bomProductCode]:op.bomItems||[]}:{});
   if(!selections||Array.isArray(selections)||typeof selections!=='object'){add(w,stage,op,'BOM_SELECTION_INVALID','shape');continue;}
   for(const [product,codes]of Object.entries(selections)){
    if(!Array.isArray(codes)||codes.some(c=>typeof c!=='string')){add(w,stage,op,'BOM_SELECTION_INVALID',product);continue;}
    let source:string[];try{source=bom(product).map(key);}catch{source=[];add(w,stage,op,'BOM_SOURCE_INVALID',product);}
    const counts=new Map<string,number>();for(const c of source)counts.set(c,(counts.get(c)||0)+1);
    const selected=new Set<string>();for(const raw of codes){const code=key(raw),pair=JSON.stringify([product,code]);
     if(!code||!op.productCodes.includes(product)||!source.includes(code))add(w,stage,op,'BOM_REFERENCE_INVALID',product+':'+code);
     if((counts.get(code)||0)>1)add(w,stage,op,'BOM_SOURCE_DUPLICATE',product+':'+code);
     if(selected.has(code))add(w,stage,op,'BOM_SELECTION_DUPLICATE',product+':'+code);selected.add(code);
     if(!owners.has(pair))owners.set(pair,[]);owners.get(pair)!.push({w,stage,op});
    }
   }
   if(['entry','exit'].includes(kind)){
    const fields={products:op.productCodes||[],bom:selections,machines:op.machineIds||[],ipqc:op.ipqcAssignments||[]};
    if(fields.products.length||Object.values(selections).flat().length||fields.machines.length||(Array.isArray(fields.ipqc)&&fields.ipqc.length))add(w,stage,op,'ENDPOINT_LEGACY_FIELDS',stableDraftJSON(fields));
   }
  }
 }
 for(const [pair,list]of owners){const unique=new Map(list.map(x=>[JSON.stringify([x.w.id,x.stage,x.op.id]),x]));if(unique.size>1){const detail=pair+':'+[...unique.keys()].sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }).join('|');for(const {w,stage,op}of unique.values())add(w,stage,op,'BOM_OCCUPIED',detail);}}
 return issues;
}
export function assertEditorIntegrity(next:Workspace[],previous:Workspace[],master:Master,bom:(code:string)=>string[]){
 const old=new Set(editorIntegrity(previous,master,bom).map(i=>i.key));
 const added=editorIntegrity(next,master,bom).filter(i=>!old.has(i.key));
 if(added.length)throw new DraftConflict('EDITOR_INTEGRITY_CONFLICT',409,{issues:added.map(i=>({kind:'error',path:['workspaces',{id:i.workspace},'stages',i.stage,{id:i.operation}],message:i.code+':'+i.detail}))});
}
