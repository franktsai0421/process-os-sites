/* Exact Begin-v1 inverse to cfb542926fa004392a3180b16aa887291fa74d4f handlers.
 * Historic source bytes/hashes are preserved; unrelated changes fail closed. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contracts={
  "app/api/ipqc-c/workflow/route.ts": {
    "beforeHash": "87c8e3246f8aad02378962e5a0be29562d484665ff3a0dccbf5cd7ee710d6ce3",
    "afterHash": "2f525bf7751aeedb80e34532c33a637f6c4f48a1882845a7592da72e4607a676",
    "rules": [
      {
        "offset": 0,
        "before": "",
        "after": "import {parseBeginIdentity,replayBegin,assertBeginBasis,recordBegin} from '@/lib/workflow-begin';\n"
      },
      {
        "offset": 9067,
        "before": "      const permission=action==='apply'||action==='restore'?'edit':action;\r\n",
        "after": "      const permission=action==='apply'||action==='restore'||action==='begin-v1'?'edit':action;\n"
      },
      {
        "offset": 9326,
        "before": "      return reply({receipt:receipt.result});\r\n",
        "after": "      return reply({receipt:receipt.result,...(action==='begin-v1'?{operationKind:'begin-v1'}:{})});\n"
      },
      {
        "offset": 11495,
        "before": "    const body=JSON.parse(raw) as {action?:'begin';command?:IpqcWorkflowCommand};\r\n",
        "after": "    const body=JSON.parse(raw) as {action?:'begin'|'begin-v1';begin?:unknown;command?:IpqcWorkflowCommand};\n    const begin=parseBeginIdentity(body);\n"
      },
      {
        "offset": 18068,
        "before": "      let receipt;\r\n      if(body.action==='begin') {\r\n",
        "after": "      let receipt;let beginAlreadyOpen=false;\n      if(body.action==='begin'||begin) {\n"
      },
      {
        "offset": 18224,
        "before": "        if(control.workflow&&openIpqc(control))return reply({revision:state.revision,control:publicIpqcWorkflow(control,permissions.history,caseMetadata),unchanged:true});\r\n",
        "after": "        if(begin){const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}\n        beginAlreadyOpen=!!control.workflow&&!!openIpqc(control);\n        if(!begin&&control.workflow&&openIpqc(control))return reply({revision:state.revision,control:publicIpqcWorkflow(control,permissions.history,caseMetadata),unchanged:true});\n"
      },
      {
        "offset": 21226,
        "before": "      projection(control,actor,at,body.command?.action==='approve');\r\n",
        "after": "      if(!beginAlreadyOpen)projection(control,actor,at,body.command?.action==='approve');\n      if(begin)receipt=recordBegin(control,begin,actor.id,beginAlreadyOpen);\n"
      },
      {
        "offset": 21982,
        "before": "      if((body.command?.localChanges||ipqcCCreateCommand(body.command))&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\n",
        "after": "      if((begin||body.command?.localChanges||ipqcCCreateCommand(body.command))&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\n"
      },
      {
        "offset": 23674,
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
function withoutDurableBegin(bytes,file){
 const {beforeHash,afterHash,rules}=contracts[file];
 assert.equal(hash(bytes),afterHash,'Begin-v1 source differs from pinned bytes');let result=Buffer.from(bytes);
 for(const {offset,before,after} of [...rules].reverse()){
  const expected=Buffer.from(after);assert.deepEqual(result.subarray(offset,offset+expected.length),expected);
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+expected.length)]);
 }
 assert.equal(hash(result),beforeHash,'Begin-v1 inverse changed historical source');return result;
}
module.exports={withoutDurableBegin};
