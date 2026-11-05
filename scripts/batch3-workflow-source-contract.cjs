/* Fixture-only exact third-batch opt-in inverses. Historical hashes/offsets remain
 * in workflow-begin-source-contract.cjs and the original AB/BOM helpers.
 * These complete-source pins reject any unreviewed byte before projection. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contracts=[
  {
    "name": "equipment-source",
    "beforeHash": "8734ac32aa54f02f2d19b94bd7b0ecbec849907867a9638a4f5afd34a4e244d1",
    "afterHash": "3d5e661d60d994ab1768f67ee2f0fd2aef70ef77431333148d62ff0824212d27",
    "rules": [
      {
        "offset": 14969,
        "before": "    if(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'){defaults.save=defaults.save||defaults.edit;permissions.save=permissions.save||permissions.edit;}\r\n",
        "after": "    if(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'||adapter.key==='routineEquipmentControl'&&adapter.scope==='routine-equipment'){defaults.save=defaults.save||defaults.edit;permissions.save=permissions.save||permissions.edit;}\n"
      },
      {
        "offset": 32269,
        "before": "          if(begin){if(!['fqc','iqc','process:platform'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n",
        "after": "          if(begin){if(!['fqc','iqc','process:platform','routine-equipment'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n"
      },
      {
        "offset": 37224,
        "before": "        if(begin&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\n",
        "after": "        // Equipment may acknowledge its exact full Save POST without another GET. Recheck session after immutable storage.\n        if((begin||adapter.key==='routineEquipmentControl'&&adapter.scope==='routine-equipment')&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\n"
      }
    ]
  },
  {
    "name": "process-source",
    "beforeHash": "8734ac32aa54f02f2d19b94bd7b0ecbec849907867a9638a4f5afd34a4e244d1",
    "afterHash": "e7bd6769bb56db70b8d64799bdbc0915ead1b40dfd369a9c1c73742ab2a69434",
    "rules": [
      {
        "offset": 14969,
        "before": "    if(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'){defaults.save=defaults.save||defaults.edit;permissions.save=permissions.save||permissions.edit;}\r\n",
        "after": "    if(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'||adapter.key==='masterDataControl'&&['master:AB','master:C','master:PROCESS'].includes(adapter.scope)){defaults.save=defaults.save||defaults.edit;permissions.save=permissions.save||permissions.edit;}\n"
      },
      {
        "offset": 32293,
        "before": "          if(begin){if(!['fqc','iqc','process:platform'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n",
        "after": "          if(begin){if(!['fqc','iqc','process:platform','master:AB','master:C','master:PROCESS'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n"
      }
    ]
  },
  {
    "name": "batch3-union",
    "beforeHash": "30f7e9c9d5de3207bb89eba34fb3b82d23b965d4e77d3d191b5fa5115be309d9",
    "afterHash": "d1246a4b451206a4091afbc66e3c066c5f04fa4de0da319e5120b0a339a7f01e",
    "rules": [
      {
        "offset": 6365,
        "before": "",
        "after": "  requiresCreate?:(control:C,command:Pick<ModuleDraftCommand,'action'|'patches'|'moduleAction'|'input'>)=>boolean;\n"
      },
      {
        "offset": 15084,
        "before": "    if(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'||adapter.key==='bomMasterControl'&&adapter.scope==='bom'||adapter.key==='toolingMasterControl'&&adapter.scope==='tooling'||adapter.key==='masterDataControl'&&['master:AB','master:C'].includes(adapter.scope)){defaults.save=defaults.save||defaults.edit;permissions.save=permissions.save||permissions.edit;}\n",
        "after": "    if(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'||adapter.key==='bomMasterControl'&&adapter.scope==='bom'||adapter.key==='toolingMasterControl'&&adapter.scope==='tooling'||adapter.key==='masterDataControl'&&['master:AB','master:C','master:PROCESS'].includes(adapter.scope)||adapter.key==='routineEquipmentControl'&&adapter.scope==='routine-equipment'){defaults.save=defaults.save||defaults.edit;permissions.save=permissions.save||permissions.edit;}\n"
      },
      {
        "offset": 15899,
        "before": "    if(adapter.key==='qualityMasterControl'&&adapter.scope==='fqc')limited.save=limited.save||limited.edit;\n",
        "after": "    if(adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'||adapter.key==='ipqcABMasterControl'&&adapter.scope==='ipqc-ab:module')limited.save=limited.save||limited.edit;\n"
      },
      {
        "offset": 32679,
        "before": "          if(begin){if(!['fqc','iqc','tooling','bom','process:platform','master:AB','master:C'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n",
        "after": "          if(begin){if(!['fqc','iqc','tooling','bom','process:platform','master:AB','master:C','master:PROCESS','routine-equipment','ipqc-ab:module'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n"
      },
      {
        "offset": 34451,
        "before": "          const workflowModule=moduleForURL(request.url),creates=command.moduleAction?.startsWith('create')||command.moduleAction?.startsWith('add')||command.patches?.some(p=>p.op==='insert');\r\n",
        "after": "          const workflowModule=moduleForURL(request.url),creates=adapter.requiresCreate?.(control,command)||command.moduleAction?.startsWith('create')||command.moduleAction?.startsWith('add')||command.patches?.some(p=>p.op==='insert');\n"
      },
      {
        "offset": 37749,
        "before": "        if((begin||adapter.key==='bomMasterControl'&&adapter.scope==='bom'&&body.command?.action==='save'&&body.command.moduleAction==='save-local-v1')&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\n",
        "after": "        // Recheck session after immutable storage for original Begin, BOM atomic Save and exact equipment workflow.\n        if((begin||adapter.key==='bomMasterControl'&&adapter.scope==='bom'&&body.command?.action==='save'&&body.command.moduleAction==='save-local-v1'||adapter.key==='routineEquipmentControl'&&adapter.scope==='routine-equipment')&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\n"
      }
    ]
  }
];
function withoutBatch3OptIns(bytes,file){
 assert(Buffer.isBuffer(bytes),'Begin-v1 projection requires raw source bytes');
 if(file!=='lib/versioned-shared-workflow.ts')return bytes;
 const contract=contracts.find(c=>c.afterHash===hash(bytes));if(!contract)return bytes;
 let result=Buffer.from(bytes);
 for(const {offset,before,after}of [...contract.rules].reverse()){
  const expected=Buffer.from(after);assert.deepEqual(result.subarray(offset,offset+expected.length),expected,'Exact batch3 source offset changed');
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+expected.length)]);
 }
 assert.equal(hash(result),contract.beforeHash,'Batch3 projection changed pinned predecessor bytes');return result;
}
module.exports={withoutBatch3OptIns};
