/* Exact Begin-v1 inverse to cfb542926fa004392a3180b16aa887291fa74d4f handlers.
 * Historic source bytes/hashes are preserved; unrelated changes fail closed. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contracts={
  "app/api/ipqc-c/workflow/route.ts": {
    "beforeHash": "87c8e3246f8aad02378962e5a0be29562d484665ff3a0dccbf5cd7ee710d6ce3",
    "afterHash": "58d065893bd14239095b0bd292dd5224b28b4299132a196f8ba6e31ca89f6ae1",
    "rules": [
      {
        "offset": 0,
        "before": "",
        "after": "import {beginBasis,parseBeginIdentity,replayBegin,assertBeginBasis,recordBegin} from '@/lib/workflow-begin';\n"
      },
      {
        "offset": 9078,
        "before": "      const permission=action==='apply'||action==='restore'?'edit':action;\r\n",
        "after": "      const permission=action==='apply'||action==='restore'||action==='begin-v1'?'edit':action;\n"
      },
      {
        "offset": 9337,
        "before": "      return reply({receipt:receipt.result});\r\n",
        "after": "      return reply({receipt:receipt.result,...(action==='begin-v1'?{operationKind:'begin-v1'}:{})});\n"
      },
      {
        "offset": 9638,
        "before": "    return reply({revision:state.revision,permissions,workflow:flow ? {\r\n",
        "after": "    return reply({revision:state.revision,permissions,beginBasis:beginBasis(control),workflow:flow ? {\n"
      },
      {
        "offset": 11536,
        "before": "    const body=JSON.parse(raw) as {action?:'begin';command?:IpqcWorkflowCommand};\r\n",
        "after": "    const body=JSON.parse(raw) as {action?:'begin'|'begin-v1';begin?:unknown;command?:IpqcWorkflowCommand};\n    const begin=parseBeginIdentity(body);\n"
      },
      {
        "offset": 18109,
        "before": "      let receipt;\r\n      if(body.action==='begin') {\r\n",
        "after": "      let receipt;let beginAlreadyOpen=false;\n      if(body.action==='begin'||begin) {\n"
      },
      {
        "offset": 18265,
        "before": "        if(control.workflow&&openIpqc(control))return reply({revision:state.revision,control:publicIpqcWorkflow(control,permissions.history,caseMetadata),unchanged:true});\r\n",
        "after": "        if(begin){const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n        beginAlreadyOpen=!!control.workflow&&!!openIpqc(control);\n        if(!begin&&control.workflow&&openIpqc(control))return reply({revision:state.revision,control:publicIpqcWorkflow(control,permissions.history,caseMetadata),unchanged:true});\n"
      },
      {
        "offset": 21267,
        "before": "      projection(control,actor,at,body.command?.action==='approve');\r\n",
        "after": "      if(!beginAlreadyOpen)projection(control,actor,at,body.command?.action==='approve');\n      if(begin)receipt=recordBegin(control,begin,actor.id,beginAlreadyOpen);\n"
      },
      {
        "offset": 22023,
        "before": "      if((body.command?.localChanges||ipqcCCreateCommand(body.command))&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\n",
        "after": "      if((begin||body.command?.localChanges||ipqcCCreateCommand(body.command))&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\n"
      },
      {
        "offset": 23715,
        "before": "      return reply({revision:state.revision+1,control:publicIpqcWorkflow(control,permissions.history,caseMetadata),receipt,requestId});\r\n",
        "after": "      return reply({revision:state.revision+1,control:publicIpqcWorkflow(control,permissions.history,caseMetadata),receipt,requestId,...(begin?{operationKind:'begin-v1'}:{})});\n"
      }
    ]
  },
  "lib/versioned-shared-workflow.ts": {
    "beforeHash": "8a35f8bd71a194773363bfa6d702f645ebc35a9a826b7aab96c209500eda15aa",
    "afterHash": "8734ac32aa54f02f2d19b94bd7b0ecbec849907867a9638a4f5afd34a4e244d1",
    "rules": [
      {
        "offset": 0,
        "before": "",
        "after": "import {parseBeginIdentity,replayBegin,assertBeginBasis,recordBegin} from './workflow-begin';\n"
      },
      {
        "offset": 13790,
        "before": "  const body=JSON.parse(raw) as {action?:'begin';command?:ModuleDraftCommand};\r\n",
        "after": "  const body=JSON.parse(raw) as {action?:'begin'|'begin-v1';begin?:unknown;command?:ModuleDraftCommand};\n  parseBeginIdentity(body);\n"
      },
      {
        "offset": 22086,
        "before": "        const action=JSON.parse(receipt.fingerprint).action,permission=action==='apply'||action==='restore'?'edit':action;\r\n        if(receipt.actorId!==actor.id||!permissions[permission as DraftPermission]||action==='restore'&&!permissions.restore)return reply({error:'FORBIDDEN'},403);return reply({receipt:receipt.result});}\r\n",
        "after": "        const action=JSON.parse(receipt.fingerprint).action,permission=action==='apply'||action==='restore'||action==='begin-v1'?'edit':action;\n        if(receipt.actorId!==actor.id||!permissions[permission as DraftPermission]||action==='restore'&&!permissions.restore)return reply({error:'FORBIDDEN'},403);return reply({receipt:receipt.result,...(action==='begin-v1'?{operationKind:'begin-v1'}:{})});}\n"
      },
      {
        "offset": 31940,
        "before": "        const knownPhotos=new Set(adapter.photoIds(previous));let receipt;\r\n        if(body.action==='begin'){\r\n",
        "after": "        const knownPhotos=new Set(adapter.photoIds(previous));let receipt;const begin=parseBeginIdentity(body);let beginAlreadyOpen=false;\n        if(body.action==='begin'||begin){\n"
      },
      {
        "offset": 32192,
        "before": "",
        "after": "          if(begin){if(!['fqc','iqc','process:platform'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n"
      },
      {
        "offset": 32610,
        "before": "          if(control.workflow&&open)return reply({revision:state.revision,control:visibleSharedControl(control,permissions.history,caseMetadata,adapter.draftMissing),unchanged:true});\r\n          if(open&&open.status!=='draft')throw new DraftConflict('LEGACY_PENDING_REQUIRES_REVIEW');\r\n",
        "after": "          if(!begin&&control.workflow&&open)return reply({revision:state.revision,control:visibleSharedControl(control,permissions.history,caseMetadata,adapter.draftMissing),unchanged:true});\n          beginAlreadyOpen=!!control.workflow&&!!open;\n          if(!beginAlreadyOpen&&open&&open.status!=='draft')throw new DraftConflict('LEGACY_PENDING_REQUIRES_REVIEW');\n"
      },
      {
        "offset": 35464,
        "before": "        projectSharedVersion(control,actor,at,body.command?.action==='approve');\r\n",
        "after": "        if(!beginAlreadyOpen)projectSharedVersion(control,actor,at,body.command?.action==='approve');\n        if(begin)receipt=recordBegin(control,begin,actor.id,beginAlreadyOpen);\n"
      },
      {
        "offset": 37127,
        "before": "",
        "after": "        if(begin&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\n"
      },
      {
        "offset": 37509,
        "before": "        return reply({revision:state.revision+1,control:visibleSharedControl(control,permissions.history,caseMetadata,adapter.draftMissing),receipt,requestId});\r\n",
        "after": "        return reply({revision:state.revision+1,control:visibleSharedControl(control,permissions.history,caseMetadata,adapter.draftMissing),receipt,requestId,...(begin?{operationKind:'begin-v1'}:{})});\n"
      }
    ]
  }
};
// Reviewed successor a3edb52: only master:AB/master:C edit-implies-Save and
// identified Begin scope admission changed. Peeling these two exact lines must
// recover the original pinned afterHash before the historical inverse runs.
// This is a test-only source projection; production handlers are never rewritten.
const reviewedABScopeOptIn={
  "lib/versioned-shared-workflow.ts": {
    "sourceHash": "58a2c3af63a4e681df036b63e1223cf1f3e881a70b2fceec44fa60dfd9079847",
    "rules": [
      {
        "before": "    if(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'){defaults.save=defaults.save||defaults.edit;permissions.save=permissions.save||permissions.edit;}\r\n",
        "after": "    if(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'||adapter.key==='masterDataControl'&&['master:AB','master:C'].includes(adapter.scope)){defaults.save=defaults.save||defaults.edit;permissions.save=permissions.save||permissions.edit;}\n"
      },
      {
        "before": "          if(begin){if(!['fqc','iqc','process:platform'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n",
        "after": "          if(begin){if(!['fqc','iqc','process:platform','master:AB','master:C'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n"
      }
    ]
  }
};
// PROCESS successor peels only its two exact scoped lines back to the reviewed
// AB/C source, then preserves every original hash and historical byte offset.
const reviewedProcessScopeOptIn={
  "sourceHash": "e7bd6769bb56db70b8d64799bdbc0915ead1b40dfd369a9c1c73742ab2a69434",
  "rules": [
    {
      "before": "    if(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'||adapter.key==='masterDataControl'&&['master:AB','master:C'].includes(adapter.scope)){defaults.save=defaults.save||defaults.edit;permissions.save=permissions.save||permissions.edit;}\n",
      "after": "    if(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'||adapter.key==='masterDataControl'&&['master:AB','master:C','master:PROCESS'].includes(adapter.scope)){defaults.save=defaults.save||defaults.edit;permissions.save=permissions.save||permissions.edit;}\n"
    },
    {
      "before": "          if(begin){if(!['fqc','iqc','process:platform','master:AB','master:C'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n",
      "after": "          if(begin){if(!['fqc','iqc','process:platform','master:AB','master:C','master:PROCESS'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n"
    }
  ]
};
function historicalBeginSource(bytes,file){
 const contract=contracts[file];assert.ok(contract,'Unknown Begin-v1 source contract');
 if(hash(bytes)===contract.afterHash)return bytes;
 const reviewed=reviewedABScopeOptIn[file];
 if(file==='lib/versioned-shared-workflow.ts'&&hash(bytes)===reviewedProcessScopeOptIn.sourceHash){
  let projected=Buffer.from(bytes);
  for(const {before,after}of reviewedProcessScopeOptIn.rules){const expected=Buffer.from(after),offset=projected.indexOf(expected);assert.ok(offset>=0&&projected.lastIndexOf(expected)===offset,'Reviewed PROCESS source span must occur exactly once');projected=Buffer.concat([projected.subarray(0,offset),Buffer.from(before),projected.subarray(offset+expected.length)]);}
  assert.equal(hash(projected),reviewed.sourceHash,'PROCESS projection changed reviewed AB/C source');bytes=projected;
 }
 assert.ok(reviewed&&hash(bytes)===reviewed.sourceHash,'Begin-v1 source differs from pinned bytes');
 let result=Buffer.from(bytes);
 for(const {before,after}of reviewed.rules){
  const expected=Buffer.from(after),offset=result.indexOf(expected);
  assert.ok(offset>=0&&result.lastIndexOf(expected)===offset,'Reviewed AB/C source span must occur exactly once');
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+expected.length)]);
 }
 assert.equal(hash(result),contract.afterHash,'AB/C projection changed the original Begin-v1 source');return result;
}
function withoutDurableBegin(bytes,file){
 bytes=historicalBeginSource(bytes,file);
 const {beforeHash,afterHash,rules}=contracts[file];
 assert.equal(hash(bytes),afterHash,'Begin-v1 source differs from pinned bytes');let result=Buffer.from(bytes);
 for(const {offset,before,after} of [...rules].reverse()){
  const expected=Buffer.from(after);assert.deepEqual(result.subarray(offset,offset+expected.length),expected);
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+expected.length)]);
 }
 assert.equal(hash(result),beforeHash,'Begin-v1 inverse changed historical source');return result;
}
module.exports={withoutDurableBegin};
