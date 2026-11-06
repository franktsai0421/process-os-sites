/* Fixture-only exact inverse of the A/B performance opt-in. Preserve each
 * existing historical byte/hash check; unknown sources are never projected. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contracts=[
  {
    "file": "lib/versioned-shared-workflow.ts",
    "beforeHash": "b220a014deff38f2a0e47ba3cb01ec36084ff34f49cb46f1bf51ce6ccfafbb7e",
    "afterHash": "1cd73fa50c975d33c743ec89052cedf98f970197263a81d81daf5717e5eb6ff3",
    "rules": [
      {
        "offset": 907,
        "before": "import { readState, identity, can, createMasterABPermissionPhase, createFqcPermissionPhase, sameOrigin, encodeValues, stateRevisionIsCurrent, responseHeaders, type State } from './process-state';\r\n",
        "after": "import { readState, identity, can, createMasterABPermissionPhase, createFqcPermissionPhase, createIpqcABPermissionPhase, sameOrigin, encodeValues, stateRevisionIsCurrent, responseHeaders, type State } from './process-state';\n"
      },
      {
        "offset": 14176,
        "before": "export function versionedWorkflowRoute<T,C extends VersionedControl<T>>(adapter:WorkflowAdapter<T,C>){\r\n  const phaseFor=(request:Request,state:State)=>adapter.key==='masterDataControl'&&adapter.scope==='master:AB'&&new URL(request.url).pathname==='/api/master/workflow'&&new URL(request.url).searchParams.get('scope')==='AB'?createMasterABPermissionPhase(request,state):adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'&&new URL(request.url).pathname==='/api/fqc/workflow'&&!new URL(request.url).searchParams.has('scope')?createFqcPermissionPhase(request,state):null;\r\n",
        "after": "export function versionedWorkflowRoute<T,C extends VersionedControl<T>>(adapter:WorkflowAdapter<T,C>){\n  const isIpqcAB=(request:Request)=>adapter.key==='ipqcABMasterControl'&&new URL(request.url).pathname==='/api/ipqc-ab/workflow'&&(adapter.scope==='ipqc-ab:module'||adapter.scope.startsWith('ipqc-ab:'));\n  const phaseFor=(request:Request,state:State)=>adapter.key==='masterDataControl'&&adapter.scope==='master:AB'&&new URL(request.url).pathname==='/api/master/workflow'&&new URL(request.url).searchParams.get('scope')==='AB'?createMasterABPermissionPhase(request,state):adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'&&new URL(request.url).pathname==='/api/fqc/workflow'&&!new URL(request.url).searchParams.has('scope')?createFqcPermissionPhase(request,state):isIpqcAB(request)?createIpqcABPermissionPhase(request,state):null;\n"
      },
      {
        "offset": 17071,
        "before": "      const fqcReadAhead=adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'&&new URL(request.url).pathname==='/api/fqc/workflow'&&!selectors.has('scope');\n",
        "after": "      const fqcReadAhead=isIpqcAB(request)||adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'&&new URL(request.url).pathname==='/api/fqc/workflow'&&!selectors.has('scope');\n"
      },
      {
        "offset": 30523,
        "before": "        const state=requiredState||mutationState||processSaveState||processFlowState||fqcLifecycle8State||await readState({aggregateReadAhead:body.action===undefined&&Object.keys(body).every(key=>key==='command')&&fqcAggregateReadAheadCommand(body.command)&&adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'&&new URL(request.url).pathname==='/api/fqc/workflow'&&!query.has('scope'),deferDependencyHistory:!adapter.needsReferenceHistory?.(body.command),modelKey:adapter.preparedModel?adapter.key:undefined,deferHistory:!adapter.needsReferenceHistory?.(body.command),allocationKey:adapter.needsFullHistory?.(body.command)?adapter.key:undefined,caseId:body.command?.caseId,saveId:body.command?.restoreSaveId}),phase=requiredPhase||await phaseFor(request,state),actor=phase?phase.actor:await identity(request,state);streamRecords=!!state.recordStorage;if(!actor)return reply({error:'LOGIN_REQUIRED'},401);\n",
        "after": "        const state=requiredState||mutationState||processSaveState||processFlowState||fqcLifecycle8State||await readState({aggregateReadAhead:body.action===undefined&&Object.keys(body).every(key=>key==='command')&&(isIpqcAB(request)&&['save','submit','withdraw'].includes(body.command?.action||'')||fqcAggregateReadAheadCommand(body.command)&&adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'&&new URL(request.url).pathname==='/api/fqc/workflow'&&!query.has('scope')),deferDependencyHistory:!adapter.needsReferenceHistory?.(body.command),modelKey:adapter.preparedModel?adapter.key:undefined,deferHistory:!adapter.needsReferenceHistory?.(body.command),allocationKey:adapter.needsFullHistory?.(body.command)?adapter.key:undefined,caseId:body.command?.caseId,saveId:body.command?.restoreSaveId}),phase=requiredPhase||await phaseFor(request,state),actor=phase?phase.actor:await identity(request,state);streamRecords=!!state.recordStorage;if(!actor)return reply({error:'LOGIN_REQUIRED'},401);\n"
      }
    ]
  },
  {
    "file": "lib/process-state.ts",
    "beforeHash": "a9ac65e8a0cac0b7346b88e7b33271aa0b10dcdf69ebd99c616c96a220d66937",
    "afterHash": "250d2bec2fe6df929fb5cff0793401136da9e9a7f278b4c7cc99196e7949e7bd",
    "rules": [
      {
        "offset": 17797,
        "before": "",
        "after": "// Exact A/B workflow only. Each selected snapshot and CAS retry gets its own\n// phase; the shared route retains fresh checks before returning/persisting.\nexport async function createIpqcABPermissionPhase(request:Request,state:State){\n  if(new URL(request.url).pathname!=='/api/ipqc-ab/workflow')throw Error('INVALID_PERMISSION_PHASE');\n  return createWorkflowPermissionPhase(request,state);\n}\n"
      }
    ]
  },
  {
    "file": "app/api/ipqc-ab/route.ts",
    "beforeHash": "40dfa3b4886559ae9006b42448475e24e67440a6a659c620b267bbe13113184d",
    "afterHash": "daa0cf04164c5602ccef161b24f8bb8a5bed3e76de2e11d86de024429006057c",
    "rules": [
      {
        "offset": 7760,
        "before": "    const state=await readState({keys,modelKey:equipmentOnly?undefined:KEY,deferHistory:true,deferDependencyHistory:true}),actor=await identity(request,state);\n",
        "after": "    const state=await readState({aggregateReadAhead:true,keys,modelKey:equipmentOnly?undefined:KEY,deferHistory:true,deferDependencyHistory:true}),actor=await identity(request,state);\n"
      }
    ]
  },
  {
    "file": "app/api/ipqc-ab/photo/route.ts",
    "beforeHash": "f748661a1198fd9f9f01bc9794e3d79f15c9e3182aa65850832327c07f258e59",
    "afterHash": "aeb32ece43651da36de270fcdc2b81e5e583c34a1685091e46c31e638e56fd04",
    "rules": [
      {
        "offset": 696,
        "before": "    const state = await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});\n",
        "after": "    const state = await readState({aggregateReadAhead:true,keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});\n"
      },
      {
        "offset": 1566,
        "before": "    const state = await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});\n",
        "after": "    const state = await readState({aggregateReadAhead:true,keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});\n"
      }
    ]
  }
];
function withoutIpqcABSpeed(bytes,file){
 assert(Buffer.isBuffer(bytes),'A/B speed projection requires raw source bytes');
 const contract=contracts.find(c=>c.file===file&&c.afterHash===hash(bytes));if(!contract)return bytes;
 let result=Buffer.from(bytes);
 for(const {offset,before,after}of [...contract.rules].reverse()){
  const expected=Buffer.from(after);assert.deepEqual(result.subarray(offset,offset+expected.length),expected);
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+expected.length)]);
 }
 assert.equal(hash(result),contract.beforeHash,'A/B speed inverse changed pinned predecessor bytes');return result;
}
module.exports={withoutIpqcABSpeed,contracts};
