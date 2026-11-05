/* Exact inverse of the four AB opt-in extensions over PR77 0af6d57.
 * Restores its immutable bytes before the existing Begin-v1 historical inverse.
 * This is fixture-only source reconstruction, never a runtime adapter or migration. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contract={
  "beforeHash": "8734ac32aa54f02f2d19b94bd7b0ecbec849907867a9638a4f5afd34a4e244d1",
  "afterHash": "6dabbf318c0b7beba90cac8fc4d1d9f923f6841921d56d864e40aecb23e83028",
  "rules": [
    {
      "offset": 6365,
      "before": "",
      "after": "  requiresCreate?:(control:C,command:Pick<ModuleDraftCommand,'action'|'patches'|'moduleAction'|'input'>)=>boolean;\n"
    },
    {
      "offset": 15598,
      "before": "    if(adapter.key==='qualityMasterControl'&&adapter.scope==='fqc')limited.save=limited.save||limited.edit;\n",
      "after": "    if(adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'||adapter.key==='ipqcABMasterControl'&&adapter.scope==='ipqc-ab:module')limited.save=limited.save||limited.edit;\n"
    },
    {
      "offset": 32378,
      "before": "          if(begin){if(!['fqc','iqc','process:platform'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n",
      "after": "          if(begin){if(!['fqc','iqc','process:platform','ipqc-ab:module'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n"
    },
    {
      "offset": 34074,
      "before": "          const workflowModule=moduleForURL(request.url),creates=command.moduleAction?.startsWith('create')||command.moduleAction?.startsWith('add')||command.patches?.some(p=>p.op==='insert');\r\n",
      "after": "          const workflowModule=moduleForURL(request.url),creates=adapter.requiresCreate?.(control,command)||command.moduleAction?.startsWith('create')||command.moduleAction?.startsWith('add')||command.patches?.some(p=>p.op==='insert');\n"
    }
  ]
};
function withoutABLocalAtomicSave(bytes){
 assert.equal(hash(bytes),contract.afterHash,'AB Local Save source differs from pinned bytes');let result=Buffer.from(bytes);
 for(const {offset,before,after}of [...contract.rules].reverse()){
  const expected=Buffer.from(after);assert.deepEqual(result.subarray(offset,offset+expected.length),expected);
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+expected.length)]);
 }
 assert.equal(hash(result),contract.beforeHash,'AB Local Save inverse changed historical source');return result;
}
module.exports={withoutABLocalAtomicSave,afterHash:contract.afterHash};
