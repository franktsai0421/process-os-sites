/* Pinned inverse of this candidate's IPQC C atomic-save route spans.
 * Existing historical read/performance proofs still run on the exact prior bytes. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contracts={
  "app/api/ipqc-c/workflow/route.ts": {
    "beforeHash": "8e02233a3928309f28d478814610e4862fc8b331f20e273292f4f87f24c8eb07",
    "afterHash": "87c8e3246f8aad02378962e5a0be29562d484665ff3a0dccbf5cd7ee710d6ce3",
    "rules": [
      {
        "offset": 1495,
        "before": "  return {...rights,restore:rights.edit&&await restoreAllowed(request,state),create:rights.edit&&await can(request,state,'ipqc-c.create'),delete:rights.edit&&await can(request,state,'ipqc-c.delete')};\r\n",
        "after": "  return {...rights,save:rights.edit||rights.save,restore:rights.edit&&await restoreAllowed(request,state),create:rights.edit&&await can(request,state,'ipqc-c.create'),delete:rights.edit&&await can(request,state,'ipqc-c.delete')};\n"
      },
      {
        "offset": 11500,
        "before": "",
        "after": "    if(body.command?.localChanges!==undefined){\n      const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);\n      const path=(value:unknown)=>Array.isArray(value)&&value.length>0&&value.every(part=>typeof part==='string'||object(part)&&Object.keys(part).length===1&&typeof part.id==='string');\n      const changes:unknown=body.command.localChanges;\n      const valid=Array.isArray(changes)&&changes.length<=256&&changes.every(change=>object(change)&&\n        Object.keys(change).every(key=>['moduleAction','input','patches','guards','localId'].includes(key))&&\n        (change.moduleAction===undefined||typeof change.moduleAction==='string'&&['create-error','create-item','delete-error','delete-item'].includes(change.moduleAction))&&\n        (change.input===undefined||object(change.input)&&(change.input.item===undefined||object(change.input.item)))&&\n        (change.localId===undefined||typeof change.localId==='string')&&\n        (change.patches===undefined||Array.isArray(change.patches)&&change.patches.every(patch=>object(patch)&&patch.op==='set'&&path(patch.path)&&Object.hasOwn(patch,'value')))&&\n        (change.guards===undefined||Array.isArray(change.guards)&&change.guards.every(guard=>object(guard)&&path(guard.path)&&Object.hasOwn(guard,'value'))));\n      if(!valid)return reply({error:'INVALID_LOCAL_SAVE',requestId},422);\n    }\n"
      },
      {
        "offset": 13422,
        "before": "      const state=createMutationState||saveMutationState||await readState({modelKey:KEY,deferDependencyHistory:true,deferHistory:true,allocationKey:['create-error','create-item'].includes(body.command?.moduleAction||'')?KEY:undefined,caseId:body.command?.caseId,saveId:body.command?.restoreSaveId}),actor=await identity(request,state);streamRecords=!!state.recordStorage;\r\n",
        "after": "      const state=createMutationState||saveMutationState||await readState({modelKey:KEY,deferDependencyHistory:true,deferHistory:true,allocationKey:body.command?.localChanges||['create-error','create-item'].includes(body.command?.moduleAction||'')?KEY:undefined,caseId:body.command?.caseId,saveId:body.command?.restoreSaveId}),actor=await identity(request,state);streamRecords=!!state.recordStorage;\n"
      },
      {
        "offset": 19111,
        "before": "",
        "after": "        for(const change of body.command.localChanges||[]) {\n          if(change.moduleAction?.startsWith('create')&&!permissions.create||change.moduleAction?.startsWith('delete')&&!permissions.delete)return reply({error:'FORBIDDEN'},403);\n          if(change.moduleAction==='create-error'&&!master.active?.C?.products?.some(p=>p.code===change.input?.productCode&&p.stages.includes(change.input?.stageCode||'')))return reply({error:'PRODUCT_STAGE_INVALID'},422);\n        }\n"
      },
      {
        "offset": 19978,
        "before": "        if(!alreadyAccepted&&body.command.action==='apply'){const effects=restoreEffects(beforeChange,control.workflow!.working);if(effects.create&&!permissions.create||effects.delete&&!permissions.delete)return reply({error:'FORBIDDEN'},403);}\r\n",
        "after": "        if(!alreadyAccepted&&(body.command.action==='apply'||body.command.localChanges)){const effects=restoreEffects(beforeChange,control.workflow!.working);if(effects.create&&!permissions.create||effects.delete&&!permissions.delete)return reply({error:'FORBIDDEN'},403);}\n"
      },
      {
        "offset": 21335,
        "before": "      if(ipqcCCreateCommand(body.command)&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\r\n",
        "after": "      if((body.command?.localChanges||ipqcCCreateCommand(body.command))&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\n"
      }
    ]
  },
  "lib/ipqc-c-workflow.ts": {
    "beforeHash": "f1080fd018d4cf4c6ecef84e7b8a5e324e30873e7929a5b9afd51044a7956cc7",
    "afterHash": "86cb0cb494ede542868a740ee95881d949e46ac8e2652a9edef81fefc5199065",
    "rules": [
      {
        "offset": 1424,
        "before": "",
        "after": "  localChanges?: Array<{moduleAction?:IpqcWorkflowCommand['moduleAction'];input?:IpqcWorkflowCommand['input'];patches?:DraftPatch[];guards?:DraftCommand['guards'];localId?:string}>;\n"
      },
      {
        "offset": 4354,
        "before": "",
        "after": "  if(command.localChanges!==undefined) {\n    if(command.action!=='save'||command.moduleAction||command.patches||!Array.isArray(command.localChanges)||command.localChanges.length>256)\n      throw new DraftConflict('INVALID_LOCAL_SAVE',422);\n    if(!context.allowed('view')||!context.allowed('edit'))throw new DraftConflict('FORBIDDEN',403);\n    // Build on a private aggregate. Nothing (including allocations or receipts)\n    // escapes if any later edit, structural check or final Save fails.\n    const candidate={...control,reservedErrorCodes:[...control.reservedErrorCodes],reservedItemCodes:[...control.reservedItemCodes],workflow:control.workflow};\n    const ids=new Map<string,string>();\n    const remap=(value:unknown):unknown=>Array.isArray(value)?value.map(remap):value&&typeof value==='object'\n      ?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,['id','errorId'].includes(key)&&typeof v==='string'&&ids.has(v)?ids.get(v):remap(v)])):value;\n    const internalIds:string[]=[];\n    const clientId='local-'+command.operationId.slice(0,80);\n    for(const [index,raw] of command.localChanges.entries()) {\n      if(!raw||Object.keys(raw).some(key=>!['moduleAction','input','patches','guards','localId'].includes(key)))throw new DraftConflict('INVALID_LOCAL_SAVE',422);\n      const change=remap(raw) as typeof raw,operationId=command.operationId.slice(0,80)+'-local-'+index;\n      if(change.moduleAction?.startsWith('create')) {\n        if(!raw.localId||!/^local-[a-zA-Z0-9_-]{8,80}$/.test(raw.localId)||ids.has(raw.localId))throw new DraftConflict('INVALID_LOCAL_ID',422);\n      } else if(raw.localId)throw new DraftConflict('INVALID_LOCAL_ID',422);\n      if(change.moduleAction?.startsWith('delete')) {\n        const kind=change.moduleAction==='delete-error'?'errors':'items';\n        if(!change.guards?.some(g=>stableDraftJSON(g.path)===stableDraftJSON([kind,{id:change.input?.id}])))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);\n        // A cascade must also guard the child set, so newly added children survive.\n        if(kind==='errors'&&!change.guards?.some(g=>stableDraftJSON(g.path)===stableDraftJSON(['items'])))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);\n      }\n      applyIpqcWorkflow(candidate,{action:'apply',generation:command.generation,clientId,sequence:index+1,operationId,\n        ...(change.moduleAction?{moduleAction:change.moduleAction,input:change.input}: {patches:change.patches}),guards:change.guards},\n        {...context,commandFingerprint:undefined});\n      internalIds.push(operationId);\n      if(raw.localId)ids.set(raw.localId,(change.moduleAction==='create-error'?'error-':'item-')+operationId);\n    }\n    // Inner operations are implementation details; the original operation owns\n    // the only durable receipt and is the only command recoverable/replayable.\n    for(const id of internalIds)delete candidate.workflow!.receipts[id];\n    delete candidate.workflow!.sequences[stableDraftJSON([context.actor.id,clientId])];\n    const result=applyDraftCommand(candidate.workflow!,{...command,expectedRevision:undefined},{...context,commandFingerprint:fingerprint,\n      allowed:permission=>permission==='save'?context.allowed('edit'):context.allowed(permission)});\n    control.workflow=result.state;control.reservedErrorCodes=candidate.reservedErrorCodes;control.reservedItemCodes=candidate.reservedItemCodes;return result.receipt;\n  }\n"
      }
    ]
  }
};
function withoutLocalAtomicSave(bytes,file='app/api/ipqc-c/workflow/route.ts'){
 const {beforeHash,afterHash,rules}=contracts[file];
 assert.equal(hash(bytes),afterHash,'Local Save source differs from pinned bytes');let result=Buffer.from(bytes);
 for(const {offset,before,after}of [...rules].reverse()){
  const expected=Buffer.from(after);assert.deepEqual(result.subarray(offset,offset+expected.length),expected);
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+expected.length)]);
 }
 assert.equal(hash(result),beforeHash,'Local Save inverse changed historical source');return result;
}
module.exports={withoutLocalAtomicSave};
