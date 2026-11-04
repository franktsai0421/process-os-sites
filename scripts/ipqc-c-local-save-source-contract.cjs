/* Pinned inverse of this candidate's IPQC C atomic-save route spans.
 * Existing historical read/performance proofs still run on the exact prior bytes. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const beforeHash="8e02233a3928309f28d478814610e4862fc8b331f20e273292f4f87f24c8eb07",afterHash="e0997b91ca3e0fee5963fbe1a58cf38a81261ba3972ee198427a8ee6d5c0d29f";
const rules=[
  {
    "offset": 1495,
    "before": "  return {...rights,restore:rights.edit&&await restoreAllowed(request,state),create:rights.edit&&await can(request,state,'ipqc-c.create'),delete:rights.edit&&await can(request,state,'ipqc-c.delete')};\r\n",
    "after": "  return {...rights,save:rights.edit||rights.save,restore:rights.edit&&await restoreAllowed(request,state),create:rights.edit&&await can(request,state,'ipqc-c.create'),delete:rights.edit&&await can(request,state,'ipqc-c.delete')};\n"
  },
  {
    "offset": 11500,
    "before": "",
    "after": "    if(body.command?.localChanges!==undefined&&(!Array.isArray(body.command.localChanges)||body.command.localChanges.length>256))return reply({error:'INVALID_LOCAL_SAVE'},422);\n"
  },
  {
    "offset": 12188,
    "before": "      const state=createMutationState||saveMutationState||await readState({modelKey:KEY,deferDependencyHistory:true,deferHistory:true,allocationKey:['create-error','create-item'].includes(body.command?.moduleAction||'')?KEY:undefined,caseId:body.command?.caseId,saveId:body.command?.restoreSaveId}),actor=await identity(request,state);streamRecords=!!state.recordStorage;\r\n",
    "after": "      const state=createMutationState||saveMutationState||await readState({modelKey:KEY,deferDependencyHistory:true,deferHistory:true,allocationKey:body.command?.localChanges||['create-error','create-item'].includes(body.command?.moduleAction||'')?KEY:undefined,caseId:body.command?.caseId,saveId:body.command?.restoreSaveId}),actor=await identity(request,state);streamRecords=!!state.recordStorage;\n"
  },
  {
    "offset": 17877,
    "before": "",
    "after": "        for(const change of body.command.localChanges||[]) {\n          if(change.moduleAction?.startsWith('create')&&!permissions.create||change.moduleAction?.startsWith('delete')&&!permissions.delete)return reply({error:'FORBIDDEN'},403);\n          if(change.moduleAction==='create-error'&&!master.active?.C?.products?.some(p=>p.code===change.input?.productCode&&p.stages.includes(change.input?.stageCode||'')))return reply({error:'PRODUCT_STAGE_INVALID'},422);\n        }\n"
  },
  {
    "offset": 18744,
    "before": "        if(!alreadyAccepted&&body.command.action==='apply'){const effects=restoreEffects(beforeChange,control.workflow!.working);if(effects.create&&!permissions.create||effects.delete&&!permissions.delete)return reply({error:'FORBIDDEN'},403);}\r\n",
    "after": "        if(!alreadyAccepted&&(body.command.action==='apply'||body.command.localChanges)){const effects=restoreEffects(beforeChange,control.workflow!.working);if(effects.create&&!permissions.create||effects.delete&&!permissions.delete)return reply({error:'FORBIDDEN'},403);}\n"
  },
  {
    "offset": 20101,
    "before": "      if(ipqcCCreateCommand(body.command)&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\r\n",
    "after": "      if((body.command?.localChanges||ipqcCCreateCommand(body.command))&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\n"
  }
];
function withoutLocalAtomicSave(bytes){
 assert.equal(hash(bytes),afterHash,'Local Save source differs from pinned bytes');let result=Buffer.from(bytes);
 for(const {offset,before,after}of [...rules].reverse()){
  const expected=Buffer.from(after);assert.deepEqual(result.subarray(offset,offset+expected.length),expected);
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+expected.length)]);
 }
 assert.equal(hash(result),beforeHash,'Local Save inverse changed historical source');return result;
}
module.exports={withoutLocalAtomicSave};
