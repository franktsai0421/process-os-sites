import {parse} from './process-state';
import {applyDraftCommand,DraftConflict,sameDraftValue,type DraftIssue} from './shared-draft';
import {type WorkflowAdapter,type VersionedControl} from './versioned-shared-workflow';
import {effectiveAccess} from './user-access';
import {validateIPQCAssignments,ipqcIssues} from './process-ipqc';
import {assertEditorIntegrity,editorIntegrity,editorKind} from './process-editor-integrity';

type Step={text:string;standard:string};
export type Operation=Record<string,unknown>&{id:string;stageCode:string;name:string;productCodes:string[];nextIds:string[];mode?:string;machineIds?:string[];instructionSteps?:Step[];instructions?:string;ipqc?:string;bomSelections?:Record<string,string[]>;bomProductCode?:string;bomItems?:string[];mediaItems?:{src:string}[]};
export type Workspace={id:string;category:string;line:string;stages:Record<string,Operation[]>};
type Content={workspaces:Workspace[]};
export type AuthoringControl=VersionedControl<Content>;
export const AUTHORING_ADVISORY_CODES=['PRODUCT_MISSING','NAME_REQUIRED','MACHINE_REQUIRED','INSTRUCTIONS_REQUIRED','STEP_STANDARD_REQUIRED','SINGLE_SUCCESSOR_REQUIRED','CONNECTION_TARGET_MISSING','DISCONNECTED_OPERATIONS','PRODUCT_ROUTE_CHANGED','PRODUCT_STAGE_REQUIRED','BOM_ASSIGNMENT_REQUIRED','EQUIPMENT_REFERENCE_MISSING','IPQC_UNASSIGNED','IPQC_REFERENCE_CHANGED','IPQC_SOURCE_NOT_APPROVED','EDITOR_LEGACY_REVIEW','PRODUCT_SELECTION_REQUIRED','ENTRY_REQUIRED','EXIT_REQUIRED'] as const;
const equal=sameDraftValue;
// Compatibility references still resolved by app.js's original machine catalog.
const legacyMachineIds=['M-A-001','M-A-003','M-A-006','M-B-002','M-C-004'];
const rows=<T>(v:unknown):T[]=>{if(!Array.isArray(v))throw new DraftConflict('AUTHORING_ARRAY_REQUIRED',422);return v;};
const norm=(v:unknown)=>(typeof v==='string'?v:typeof v==='number'?String(v):'').trim().toUpperCase();
export function bomRootReader(values:Record<string,string>){
 type BomRow={level:number;itemCode:string;id?:string;relativeLevel?:number};
 // A code-only clone must not fall back to a bundled business BOM. An imported
 // complete baseline is required; sparse legacy overrides cannot prove it.
 const overrides=parse(values.bomOverrides,null);
 if(!overrides||overrides.replaceAll!==true||!overrides.data||typeof overrides.data!=='object'||Array.isArray(overrides.data))throw new DraftConflict('BOM_COMPLETE_SOURCE_REQUIRED',409);
 const bom:Record<string,BomRow[]>={...overrides.data};
 return(code:string)=>{
 const own=Object.entries(bom).find(([key])=>norm(key)===norm(code))?.[1]||[];
 if(!Array.isArray(own))throw new DraftConflict('BOM_SOURCE_INVALID',422);
 if(overrides.__format==='PROCESS_OS_BOM_OCCURRENCES_V3')return own.filter(r=>r.level===1).map(r=>norm(r.id));
 const direct=own.filter(r=>Number(r.level)===1);if(direct.length)return direct.map(r=>norm(r.itemCode));
 const branches:BomRow[][]=[];
 for(const list of Object.values(bom))if(Array.isArray(list))list.forEach((row,index)=>{if(norm(row.itemCode)!==norm(code))return;const branch=[];
  for(let i=index+1;i<list.length&&Number(list[i].level)>Number(row.level);i++)branch.push({...list[i],relativeLevel:Number(list[i].level)-Number(row.level)});branches.push(branch);});
 return (branches.sort((a,b)=>b.length-a.length)[0]||[]).filter(r=>r.relativeLevel===1).map(r=>norm(r.itemCode));
 };
}
export function processAuthoringAdapter():WorkflowAdapter<Content,AuthoringControl>{
 return{key:'processAuthoringControl',scope:'process:platform',recordMutation:'process-save',processFlowMutation:true,empty:()=>({workspaces:[]}),photoIds:()=>[],photoPrefix:'',deletePermission:'approval.submit',preparedModel:true,permissionOnlyRead:true,
  parse(raw,prepared){if(!raw&&!prepared)throw new DraftConflict('AUTHORING_CONVERSION_REQUIRED',409);const c=prepared||JSON.parse(raw!);if(!c.workflow||c.workflow.scope!=='process:platform'||!Array.isArray(c.versions))throw new DraftConflict('AUTHORING_CONTROL_INVALID',422);return c;},
  async access(_request,_state,p){return p;},
  context(control,state,base){const master=parse(state.values.masterDataControl,null);if(!master?.active)throw new DraftConflict('MASTER_SOURCE_REQUIRED',422);
   const user=parse(state.values.platformUsers,[]).find((u:Parameters<typeof effectiveAccess>[0])=>u.id===base.actor.id),access=user?effectiveAccess(user,state.values):null;
   const products=['AB','C'].flatMap(s=>master.active[s]?.products||[]),lines=['AB','C'].flatMap(s=>master.active[s]?.lines||[]);
   const equipmentIds=new Set([...legacyMachineIds,...Object.values(master.active.PROCESS||{}).flatMap(templates=>(templates as {equipment?:{id:string}[];machineIds?:string[]}[]).flatMap(t=>[...(t.equipment||[]).map(e=>e.id),...(t.machineIds||[])]))]);
   // Dependencies are fixed for this context/CAS attempt. Construct at the
   // original validation boundary so malformed-source precedence is retained.
   let contextBom:((code:string)=>string[])|undefined;
   const getBomRoots=()=>{
    if(!contextBom){const read=bomRootReader(state.values),roots=new Map<string,string[]>();contextBom=code=>{const normalized=norm(code);if(!roots.has(normalized))roots.set(normalized,read(code));return roots.get(normalized)!;};}
    return contextBom;
   };
   return{...base,activeId:control.activeVersionId,semantic:content=>content,advisoryCodes:AUTHORING_ADVISORY_CODES,
    structure(content,previous){const ids=new Set<string>();for(const w of rows<Workspace>(content.workspaces)){
      if(typeof w.category!=='string'||typeof w.line!=='string'||w.id!==JSON.stringify([w.category,w.line])||ids.has(w.id))throw new DraftConflict('AUTHORING_SCOPE_INVALID',422);ids.add(w.id);
      if(!w.stages||Array.isArray(w.stages)||typeof w.stages!=='object')throw new DraftConflict('AUTHORING_STAGES_INVALID',422);
      const prior=previous.workspaces.find(p=>p.id===w.id);if(equal(w,prior))continue;
      if(!base.actor.admin&&!access?.lines.includes(w.line))throw new DraftConflict('LINE_EDIT_FORBIDDEN',403);
      const stageCodes=new Set((lines.find(l=>l.code===w.line)?.stages||[]).map((s:{code:string})=>s.code)),operationIds=new Set<string>();
      for(const [stage,list]of Object.entries(w.stages)){if(!stageCodes.has(stage)&&!equal(list,prior?.stages[stage]))throw new DraftConflict('STAGE_INVALID',422);
       for(const op of rows<Operation>(list)){if(!op||typeof op.id!=='string'||!op.id||operationIds.has(op.id))throw new DraftConflict('OPERATION_ID_INVALID',422);operationIds.add(op.id);
        const old=prior?.stages[stage]?.find(o=>o.id===op.id);if(equal(old,op))continue;
        if(op.stageCode!==stage||typeof op.name!=='string'||!Array.isArray(op.productCodes)||!Array.isArray(op.nextIds)||op.nextIds.some(id=>typeof id!=='string')||op.machineIds!==undefined&&(!Array.isArray(op.machineIds)||op.machineIds.some(id=>typeof id!=='string'))||op.instructionSteps!==undefined&&(!Array.isArray(op.instructionSteps)||op.instructionSteps.some(s=>!s||typeof s.text!=='string'||typeof s.standard!=='string'))||op.instructions!==undefined&&typeof op.instructions!=='string'||op.ipqc!==undefined&&typeof op.ipqc!=='string')throw new DraftConflict('OPERATION_STRUCTURE_INVALID',422);
        if(op.productCodes.some((code:string)=>!products.some(p=>p.code===code&&p.category===w.category&&p.line===w.line&&(p.stages||[]).includes(stage))))throw new DraftConflict('OPERATION_PRODUCT_ROUTE_INVALID',422);
        if(op.mediaItems!==undefined&&(!Array.isArray(op.mediaItems)||op.mediaItems.some(m=>!m||typeof m.src!=='string'||!m.src)))throw new DraftConflict('OPERATION_MEDIA_INVALID',422);
       }
      }
     }
     if(!base.actor.admin&&previous.workspaces.some(w=>!content.workspaces.some(next=>next.id===w.id)&&!access?.lines.includes(w.line)))throw new DraftConflict('LINE_EDIT_FORBIDDEN',403);
     assertEditorIntegrity(content.workspaces,previous.workspaces,master.active.PROCESS||{},getBomRoots());
     validateIPQCAssignments(content.workspaces,previous.workspaces,state.values,master);
    },
    validate(content){const issues:DraftIssue[]=[],bomRoots=getBomRoots();for(const w of content.workspaces){const all=Object.entries(w.stages).flatMap(([stage,ops])=>ops.map(op=>({op,stage}))),participating=new Set(all.flatMap(({op})=>op.productCodes||[]));
     const add=(stage:string,op:Operation|undefined,message:string,kind:DraftIssue['kind']='missing')=>issues.push({kind,path:['workspaces',{id:w.id},'stages',stage,...(op?[{id:op.id}]:[])],message});
     for(const [stage,ops]of Object.entries(w.stages)){if(ops.length){for(const endpoint of ['entry','exit'])if(!ops.some(o=>editorKind(o,master.active.PROCESS||{})===endpoint))add(stage,undefined,endpoint==='entry'?'ENTRY_REQUIRED':'EXIT_REQUIRED');for(const op of ops)if(!['entry','exit'].includes(editorKind(op,master.active.PROCESS||{}))&&!op.productCodes.length)add(stage,op,'PRODUCT_SELECTION_REQUIRED');}const used=ops.filter(op=>op.productCodes?.length),ids=new Set(used.map(op=>op.id)),edges=new Map(used.map(op=>[op.id,new Set<string>()]));
      for(const op of used){for(const code of op.productCodes)if(!products.some(p=>p.code===code))add(stage,op,'PRODUCT_MISSING:'+code);
       if(!op.name.trim())add(stage,op,'NAME_REQUIRED');if(op.mode==='machine'&&!op.machineIds?.length)add(stage,op,'MACHINE_REQUIRED');
       for(const id of op.machineIds||[])if(!equipmentIds.has(id)&&!(Array.isArray(op.machineDetails)&&op.machineDetails.some(m=>m&&(m.id===id||m.no===id))))add(stage,op,'EQUIPMENT_REFERENCE_MISSING:'+id);
       const steps=op.instructionSteps?.length?op.instructionSteps:op.instructions?.trim()?[{text:op.instructions,standard:op.ipqc||'依核准標準檢查'}]:[];
       if(!steps.some(s=>s.text?.trim()))add(stage,op,'INSTRUCTIONS_REQUIRED');if(steps.some(s=>s.text?.trim()&&!s.standard?.trim()))add(stage,op,'STEP_STANDARD_REQUIRED');
       if(op.nextIds.length>1&&editorKind(op,master.active.PROCESS||{})!=='entry')add(stage,op,'SINGLE_SUCCESSOR_REQUIRED','error');
       for(const id of op.nextIds){if(!ids.has(id))add(stage,op,'CONNECTION_TARGET_MISSING','error');else{edges.get(op.id)!.add(id);edges.get(id)!.add(op.id);}}
      }
      if(used.length>1){const seen=new Set<string>(),queue=[used[0].id];while(queue.length){const id=queue.pop()!;if(seen.has(id))continue;seen.add(id);queue.push(...edges.get(id)!);}if(seen.size!==used.length)add(stage,undefined,'DISCONNECTED_OPERATIONS','error');}
     }
     for(const code of participating){const product=products.find(p=>p.code===code&&p.category===w.category&&p.line===w.line);if(!product){if(products.some(p=>p.code===code))add('',undefined,'PRODUCT_ROUTE_CHANGED','error');continue;}
      for(const stage of product.stages||[])if(!w.stages[stage]?.some(op=>op.productCodes.includes(code)))add(stage,undefined,'PRODUCT_STAGE_REQUIRED:'+code);
      const related=all.filter(({stage,op})=>product.stages.includes(stage)&&op.productCodes?.includes(code)),used=new Set(related.flatMap(({op})=>op.bomSelections?.[code]||(op.bomProductCode===code?op.bomItems||[]:[])).map(norm));
      if(bomRoots(String(code)).some(item=>item&&!used.has(item)))add('',undefined,'BOM_ASSIGNMENT_REQUIRED:'+code);
     }
    }return [...issues,...editorIntegrity(content.workspaces,master.active.PROCESS||{},bomRoots).map(i=>({kind:'missing' as const,path:['workspaces',{id:i.workspace},'stages',i.stage,{id:i.operation}],message:'EDITOR_LEGACY_REVIEW:'+i.code+':'+i.detail})),...ipqcIssues(content.workspaces,state.values,master)];}
   };
  },
  apply(control,command,ctx){if(command.action==='apply')for(const p of command.patches||[]){
   const emptyStage=p.op==='set'&&p.path.length===4&&p.path[2]==='stages'&&Array.isArray(p.value)&&p.value.length===0;
   if(p.path[0]!=='workspaces'||p.op==='set'&&!emptyStage&&(p.path.length<6||p.path[2]!=='stages'||typeof p.path[4]!=='object'))throw new DraftConflict('AUTHORING_PATCH_INVALID',422);
   const last=p.path.at(-1),field=typeof last==='string'?last:'';
   if(p.op==='set'&&['id','stageCode'].includes(field))throw new DraftConflict('IMMUTABLE_IDENTITY',422);
   if(!control.workflow!.receipts[command.operationId]&&p.op!=='insert'&&!(command.guards||[]).some(g=>equal(g.path,p.path)))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
  }return applyDraftCommand(control.workflow!,command,ctx);},
 };
}
