/* Exact composition of reviewed performance/Save changes with #44 rights.
 * Git blobs are byte-exact; callers retain their separate working/HEAD CRLF
 * guard. Reverse only these seven named, fixed-position spans, then execute
 * the unchanged #44 rights contracts and historical byte proofs. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const route='app/api/ipqc-c/workflow/route.ts';
const native44Hash='53e5da1a4e77b704cbc8268d90659029ef1a09f459f1c02a9018acdadb401bee',combinedHash='5f79d4070f7e6028ab3916e52d4c04caf8a32ed5017be16f42023af578473d5b';
const rules=[
  {
    "name": "bounded Save import and exact merged import EOL",
    "offset": 0,
    "before": "import {restoreAllowed,assertRestoreAccess,restoreEffects} from '@/lib/draft-restore-access';\r\n",
    "after": "import {ipqcCSaveCommand,readIpqcCSaveMutationState,encodeIpqcCSaveMutationState} from '@/lib/ipqc-c-save-record-mutation';\r\nimport {restoreAllowed,assertRestoreAccess,restoreEffects} from '@/lib/draft-restore-access';\n"
  },
  {
    "name": "bounded canonical Save state read",
    "offset": 10951,
    "before": "      const state=await readState({modelKey:KEY,deferDependencyHistory:true,deferHistory:true,allocationKey:['create-error','create-item'].includes(body.command?.moduleAction||'')?KEY:undefined,caseId:body.command?.caseId,saveId:body.command?.restoreSaveId}),actor=await identity(request,state);streamRecords=!!state.recordStorage;\r\n",
    "after": "      const saveMutationState=body.action===undefined&&Object.keys(body).every(key=>key==='command')&&ipqcCSaveCommand(body.command)?await readIpqcCSaveMutationState(body.command):null;\r\n      const state=saveMutationState||await readState({modelKey:KEY,deferDependencyHistory:true,deferHistory:true,allocationKey:['create-error','create-item'].includes(body.command?.moduleAction||'')?KEY:undefined,caseId:body.command?.caseId,saveId:body.command?.restoreSaveId}),actor=await identity(request,state);streamRecords=!!state.recordStorage;\r\n"
  },
  {
    "name": "first-match validation index",
    "offset": 13182,
    "before": "",
    "after": "        // Build once per validation call; preserve Array.find first-match semantics.\r\n        const priorById=new Map<string,typeof previous.items[number]>();\r\n        const stringIds=previous.items.every(item=>typeof item.id==='string')&&content.items.every(item=>typeof item.id==='string');\r\n        if(stringIds)for(const item of previous.items)if(!priorById.has(item.id))priorById.set(item.id,item);\r\n"
  },
  {
    "name": "indexed prior lookup",
    "offset": 13632,
    "before": "          const old=previous.items.find(i=>i.id===item.id);\r\n",
    "after": "          const old=stringIds?priorById.get(item.id):previous.items.find(i=>i.id===item.id);\r\n"
  },
  {
    "name": "Save projection capture",
    "offset": 14676,
    "before": "",
    "after": "      const saveProjectionBase=request.headers.get('X-IPQC-C-Save-Projection')==='1'&&ipqcCSaveCommand(body.command)&&body.command.expectedRevision===control.workflow?.revision&&control.workflow?.pendingId===null&&new Set(control.versions.map(v=>v.id)).size===control.versions.length&&control.versions.filter(v=>v.status==='draft'||v.status==='pending').length===1&&openIpqc(control)?.id==='shared-'+control.workflow.generation&&openIpqc(control)?.status==='draft'\r\n        ?{revision:state.revision,flowRevision:control.workflow.revision,generation:control.workflow.generation,activeVersionId:control.activeVersionId,draftId:openIpqc(control)!.id,others:control.versions.filter(v=>v.id!==openIpqc(control)!.id).map(v=>{const {snapshot,...metadata}=v;return{id:v.id,snapshot,metadata:JSON.stringify(metadata)};})}:null;\r\n"
  },
  {
    "name": "bounded canonical Save encoding",
    "offset": 18267,
    "before": "        .bind(state.revision+1,await encodeValues(values,state,prepared),at,state.revision).run();\r\n",
    "after": "        .bind(state.revision+1,await (saveMutationState?encodeIpqcCSaveMutationState(state,values,prepared):encodeValues(values,state,prepared)),at,state.revision).run();\r\n"
  },
  {
    "name": "Save projection delivery",
    "offset": 18484,
    "before": "",
    "after": "      const saved=control.workflow?.saved,draft=openIpqc(control),currentOthers=saveProjectionBase?control.versions.filter(v=>v.id!==saveProjectionBase.draftId):[];\r\n      if(saveProjectionBase&&receipt&&saved&&draft?.status==='draft'&&draft.id===saveProjectionBase.draftId&&control.workflow?.generation===saveProjectionBase.generation&&control.activeVersionId===saveProjectionBase.activeVersionId&&control.workflow.pendingId===null&&control.versions.length===saveProjectionBase.others.length+1&&saveProjectionBase.others.every((old,index)=>{const current=currentOthers[index];if(!current||current.id!==old.id||current.snapshot!==old.snapshot)return false;const {snapshot:_snapshot,...metadata}=current;return JSON.stringify(metadata)===old.metadata;})){\r\n        const {content:_savedContent,...savedMetadata}=saved,{snapshot:_draftSnapshot,...draftMetadata}=draft;\r\n        return reply({revision:state.revision+1,receipt,requestId,permissions,cSaveProjection:{version:1,baseStateRevision:saveProjectionBase.revision,baseFlowRevision:saveProjectionBase.flowRevision,generation:saveProjectionBase.generation,activeVersionId:saveProjectionBase.activeVersionId,flowRevision:control.workflow.revision,saved:savedMetadata,contributors:control.workflow.contributors,draft:draftMetadata}});\r\n      }\r\n"
  }
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function withoutComposedPerformance(bytes){
 assert.equal(hash(bytes),combinedHash,'Composed C source differs from exact reviewed bytes');
 let result=Buffer.from(bytes);
 for(const rule of [...rules].reverse()){
  const after=Buffer.from(rule.after),before=Buffer.from(rule.before),at=rule.offset;
  assert.deepEqual(result.subarray(at,at+after.length),after,'Composed C span position/content changed: '+rule.name);
  assert.equal(result.indexOf(after),at,'Composed C span not at its unique position: '+rule.name);
  assert.equal(result.indexOf(after,at+after.length),-1,'Composed C span repeated: '+rule.name);
  result=Buffer.concat([result.subarray(0,at),before,result.subarray(at+after.length)]);
 }
 assert.equal(hash(result),native44Hash,'Composed C inverse differs from exact native #44 bytes');
 return result;
}
function assertComposedPerformanceContract(bytes){
 const result=withoutComposedPerformance(bytes);let negatives=0;
 const reject=changed=>{assert.throws(()=>withoutComposedPerformance(changed),/Composed C source differs/);negatives++;};
 for(const rule of rules){
  const after=Buffer.from(rule.after),at=rule.offset,left=bytes.subarray(0,at),right=bytes.subarray(at+after.length);
  const mutated=Buffer.from(after);mutated[0]^=1;
  reject(Buffer.concat([left,mutated,right]));
  reject(Buffer.concat([left,right]));
  reject(Buffer.concat([left,after,after,right]));
  // Move the exact bytes out of position, without changing their content.
  reject(Buffer.concat([left,right,after]));
 }
 const outside=bytes.indexOf(Buffer.from('sameOrigin'));assert(outside>=0);
 assert(rules.every(rule=>outside<rule.offset||outside>=rule.offset+Buffer.byteLength(rule.after)));
 const changed=Buffer.from(bytes);changed[outside]^=1;reject(changed);
 return {route,spans:rules.length,negativeCases:negatives,native44Hash,combinedHash,normalized:result};
}
module.exports={withoutComposedPerformance,assertComposedPerformanceContract,native44Hash,combinedHash};
