/* Test-only inverse of the three reviewed BOM opt-ins on the PR77 route.
 * Admit only exact raw bytes, verify each span, and recover the original
 * Begin-v1 pin before the existing Begin inverse checks its historical output.
 * Runtime/product source is never transformed by this fixture. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contract={
  "beforeHash": "8734ac32aa54f02f2d19b94bd7b0ecbec849907867a9638a4f5afd34a4e244d1",
  "afterHash": "6a85a7a3617f1c8b912d83a5291e2ad4babfa747eba42d2c7da7809556e985e0",
  "rules": [
    {
      "offset": 14969,
      "before": "    if(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'){defaults.save=defaults.save||defaults.edit;permissions.save=permissions.save||permissions.edit;}\r\n",
      "after": "    if(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'||adapter.key==='bomMasterControl'&&adapter.scope==='bom'){defaults.save=defaults.save||defaults.edit;permissions.save=permissions.save||permissions.edit;}\n"
    },
    {
      "offset": 32248,
      "before": "          if(begin){if(!['fqc','iqc','process:platform'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n",
      "after": "          if(begin){if(!['fqc','iqc','bom','process:platform'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n"
    },
    {
      "offset": 37189,
      "before": "        if(begin&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\n",
      "after": "        if((begin||adapter.key==='bomMasterControl'&&adapter.scope==='bom'&&body.command?.action==='save'&&body.command.moduleAction==='save-local-v1')&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\n"
    }
  ]
};
function withoutBomWorkflowOptIn(bytes,file='lib/versioned-shared-workflow.ts'){
 assert.equal(file,'lib/versioned-shared-workflow.ts','BOM projection file is not reviewed');
 assert(Buffer.isBuffer(bytes),'BOM projection requires raw source bytes');
 const {beforeHash,afterHash,rules}=contract;
 assert.equal(hash(bytes),afterHash,'BOM opt-in source differs from pinned bytes');
 let result=Buffer.from(bytes);
 for(const {offset,before,after} of [...rules].reverse()){
  const expected=Buffer.from(after);
  assert.deepEqual(result.subarray(offset,offset+expected.length),expected,'BOM opt-in span differs from reviewed bytes');
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+expected.length)]);
 }
 assert.equal(hash(result),beforeHash,'BOM inverse changed pinned Begin-v1 source');
 return result;
}
module.exports={withoutBomWorkflowOptIn};
