// Exact independently reviewed deltas only. Historical pins are unchanged.
// Missing, duplicate, moved, inside/outside-byte and EOL changes fail closed.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contracts={
  "lib/process-state.ts": {
    "baselineCommit": "b62526ce3e471e5da8658896beaf786e06af6839",
    "baselineHash": "d4c7d5b1ab1e002a56b5826ae8508ae842408e84da857d387ee3e3b5607903e1",
    "candidateHash": "7c85447d20338e23811c1d041bd9b7bd0a39a5841e3b8ddc5616845d81c655f9",
    "outsideMarker": "export async function identity(",
    "rules": [
      {
        "name": "exact records read permission phase factory only",
        "offset": 18435,
        "before": "",
        "after": "// Exact records-backed read phases only. This reuses pure policy evaluation,\n// never session/revocation results across fences, requests, or selected States.\n// The older AB phase above and all ordinary can() callers remain unchanged.\nexport async function createScopedWorkflowReadPermissionPhase(request:Request,state:State){\n  const url=request.url,method=request.method,path=new URL(url).pathname;\n  if(method!=='GET'||!['/api/ipqc-c/workflow','/api/routine-fqc'].includes(path)||!state.deliveryOnly||!state.recordStorage?.partial)throw Error('INVALID_SCOPED_READ_PERMISSION_PHASE');\n  const keys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];\n  const auth=keys.map(key=>state.values[key]),revision=state.revision;\n  const headers=['cookie','oai-authenticated-user-email','oai-authenticated-user-id','x-process-admin-id','x-process-admin-password'];\n  const credentials=headers.map(key=>request.headers.get(key));\n  const basisCurrent=()=>request.url===url&&request.method===method&&state.deliveryOnly===true&&state.recordStorage?.partial===true&&state.revision===revision&&keys.every((key,index)=>state.values[key]===auth[index])&&headers.every((key,index)=>request.headers.get(key)===credentials[index]);\n  const initial=await identity(request,state),actor=basisCurrent()&&initial?Object.freeze(initial):null;\n  const allowed=permissionEvaluator(request,state,actor);\n  return Object.freeze({actor,allowed:(key:string)=>basisCurrent()&&allowed(key),async current(){\n    if(!actor||!basisCurrent())return false;\n    // Same selected snapshot, not a newly selected authority row. Each fence\n    // still independently checks signature/expiry/per-token revocation storage.\n    const fresh=await identity(request,state);\n    return basisCurrent()&&!!fresh&&fresh.id===actor.id&&fresh.name===actor.name&&fresh.role===actor.role&&fresh.primary===actor.primary&&fresh.authMode===actor.authMode&&fresh.sessionType===actor.sessionType;\n  }});\n}\n"
      }
    ]
  },
  "app/api/ipqc-c/workflow/route.ts": {
    "baselineCommit": "b62526ce3e471e5da8658896beaf786e06af6839",
    "baselineHash": "36c205d2f618cd05579362dea758a4a3c72230fd3f7398a55a007f14865802b9",
    "candidateHash": "41a778f188c7dde87952f30c4e862aef1461eb6217dc908d206f8450d0dcdc3a",
    "outsideMarker": "export async function POST(",
    "rules": [
      {
        "name": "GET scope import",
        "offset": 0,
        "before": "import {readScopedWorkflowState} from '@/lib/scoped-workflow-read';\n",
        "after": "import {readScopedWorkflowState,scopedWorkflowPermissionPhase} from '@/lib/scoped-workflow-read';\n"
      },
      {
        "name": "default-preserving access checker",
        "offset": 1353,
        "before": "async function access(request:Request,state:State) {\r\n  const rights=await workflowAccess(request,state);\r\n  return {...rights,restore:rights.edit&&await restoreAllowed(request,state),create:rights.edit&&await can(request,state,'ipqc-c.create'),delete:rights.edit&&await can(request,state,'ipqc-c.delete')};\r\n}\r\n",
        "after": "async function access(request:Request,state:State,allowed=(key:string):boolean|Promise<boolean>=>can(request,state,key)) {\n  const rights=await workflowAccess(request,state,allowed);\n  return {...rights,restore:rights.edit&&await restoreAllowed(request,state,allowed),create:rights.edit&&await allowed('ipqc-c.create'),delete:rights.edit&&await allowed('ipqc-c.delete')};\n}\r\n"
      },
      {
        "name": "GET phase and terminal JSON fence",
        "offset": 4221,
        "before": "export async function GET(request:Request) {\r\n  try {\r\n    const query=new URL(request.url).searchParams;\r\n    const state=(request.method==='GET'?await readScopedWorkflowState(request,'ipqc-c-workflow'):null)||await readState({...(query.has('permissions')?{keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode']}:{}),modelKey:KEY,deferDependencyHistory:true,deferHistory:true,caseId:query.get('caseId'),saveId:query.get('restoreSaveId'),versionId:query.get('versionId')||query.get('legacyVersionId')}),actor=await identity(request,state),permissions=await access(request,state);\n    if(!actor||!permissions.view)return reply({error:'FORBIDDEN'},403);\r\n    if(query.has('permissions'))return reply({permissions,revision:state.revision,otherReviewerAvailable:otherReviewerAvailable(state,actor.id)});\r\n    const control=readControl(state),flow=control.workflow;\r\n    if(query.has('uiHistory'))return permissions.history?reply(workflowInterfaceMetadata(control,query)):reply({error:'FORBIDDEN'},403);\r\n    if(query.has('versionId')){if(!permissions.history)return reply({error:'FORBIDDEN'},403);const version=control.versions.find(v=>v.id===query.get('versionId'));return version?reply({version}):reply({error:'VERSION_NOT_FOUND'},404);}\r\n    if(query.has('legacyHistory')||query.has('legacyVersionId')){\r\n      if(!permissions.history)return reply({error:'FORBIDDEN'},403);\r\n      const caseIds=new Set(flow?.cases.map(c=>c.id)||[]),rows=control.versions.filter(v=>!v.id.startsWith('shared-')&&!caseIds.has(v.id)).slice().reverse();\r\n      if(query.has('legacyVersionId')){const version=rows.find(v=>v.id===query.get('legacyVersionId'));return version?reply({legacyVersion:version}):reply({error:'VERSION_NOT_FOUND'},404);}\r\n      const before=query.get('before'),start=before?rows.findIndex(v=>v.id===before)+1:0;if(before&&!start)return reply({error:'HISTORY_CURSOR_INVALID'},409);\r\n      return reply({versions:rows.slice(start,start+20).map(v=>({id:v.id,number:v.number,status:v.status,creatorId:v.creatorId,creatorName:v.creatorName,createdAt:v.createdAt,updatedAt:v.updatedAt})),next:rows.length>start+20?rows[start+19].id:null,total:rows.length});\r\n    }\r\n    if(query.has('restoreSaveId')){\r\n      if(!permissions.history||!permissions.restore)return reply({error:'FORBIDDEN'},403);\r\n      if(!flow||openIpqc(control)?.status!=='draft')return reply({error:flow?.pendingId?'PENDING_LOCKED':'BEGIN_REQUIRED'},409);\r\n      const saved=flow.saves.find(s=>s.id===query.get('restoreSaveId'));if(!saved)return reply({error:'SAVE_NOT_FOUND'},404);\r\n      const context=ipqcWorkflowContext(control,{actor:{id:actor.id,name:actor.name,admin:actor.role==='admin'},at:new Date().toISOString(),id:()=>crypto.randomUUID(),allowed:p=>permissions[p]},[]);\r\n      const after=context.restoreContent!(copyIpqc(saved.content),flow.working);\r\n      await assertRestoreAccess(request,state,flow.working,after);\r\n      return reply({generation:flow.generation,expectedRevision:flow.revision,restoreSaveId:saved.id,before:flow.working,after,source:{actor:saved.actor,at:saved.at}});\r\n    }\r\n    if(query.get('history')==='cases') {\r\n      if(!permissions.history)return reply({error:'FORBIDDEN'},403);\r\n      const cases=[...(flow?.cases||[])].reverse(),before=query.get('before');\r\n      const start=before?cases.findIndex(c=>c.id===before)+1:0;\r\n      if(before&&!start)return reply({error:'HISTORY_CURSOR_INVALID'},409);\r\n      const rows=cases.slice(start,start+20);\r\n      return reply({cases:rows.map(c=>({id:c.id,savedId:c.savedId,baseId:c.baseId,actor:c.actor,at:c.at,reason:c.reason,status:c.status,result:c.result})),\r\n        next:cases.length>start+20?rows.at(-1)?.id:null,total:cases.length});\r\n    }\r\n    if(query.has('caseId')) {\r\n      if(!permissions.history)return reply({error:'FORBIDDEN'},403);\r\n      const reviewCase=flow?.cases.find(c=>c.id===query.get('caseId'));\r\n      return reviewCase?reply({reviewCase,currentDraftId:openIpqc(control)?.id||null}):reply({error:'CASE_NOT_FOUND'},404);\r\n    }\r\n    const operationId=query.get('operationId');\r\n    if(operationId) {\r\n      const receipt=flow?.receipts[operationId];\r\n      if(!receipt)return reply({error:'OPERATION_NOT_FOUND'},404);\r\n      const action=JSON.parse(receipt.fingerprint).action;\r\n      const permission=action==='apply'||action==='restore'?'edit':action;\r\n      if(receipt.actorId!==actor.id||!permissions[permission as DraftPermission]||action==='restore'&&!permissions.restore)return reply({error:'FORBIDDEN'},403);\r\n      return reply({receipt:receipt.result});\r\n    }\r\n    const since=new URL(request.url).searchParams.get('since');\r\n    if(flow&&since===`${flow.generation}:${flow.revision}`)return reply({revision:state.revision,permissions,unchanged:true});\r\n    return reply({revision:state.revision,permissions,workflow:flow ? {\r\n      scope:flow.scope,generation:flow.generation,revision:flow.revision,working:flow.working,\r\n      saved:flow.saved ? {id:flow.saved.id,revision:flow.saved.revision,actor:flow.saved.actor,at:flow.saved.at}:null,\r\n      pendingId:flow.pendingId,activeId:flow.active.id,contributors:flow.contributors,\r\n      editable:openIpqc(control)?.status==='draft',\r\n    }:null});\r\n  } catch(error) {return error instanceof DraftConflict?reply({error:error.code},error.status):reply({error:'WORKFLOW_LOAD_FAILED'},503);}\r\n}\r\n",
        "after": "export async function GET(request:Request) {\r\n  let phase:ReturnType<typeof scopedWorkflowPermissionPhase>=null;\n  const deliver=async(body:unknown,status=200)=>{\n    try{if(phase&&!await phase.current())return reply({error:'FORBIDDEN'},403);return reply(body,status);}\n    catch{return reply({error:'WORKFLOW_LOAD_FAILED'},503);}\n  };\n  try {\r\n    const query=new URL(request.url).searchParams;\r\n    const state=(request.method==='GET'?await readScopedWorkflowState(request,'ipqc-c-workflow'):null)||await readState({...(query.has('permissions')?{keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode']}:{}),modelKey:KEY,deferDependencyHistory:true,deferHistory:true,caseId:query.get('caseId'),saveId:query.get('restoreSaveId'),versionId:query.get('versionId')||query.get('legacyVersionId')});phase=scopedWorkflowPermissionPhase(request,state);const actor=phase?phase.actor:await identity(request,state),permissions=await access(request,state,phase?.allowed);\n    if(!actor||!permissions.view)return deliver({error:'FORBIDDEN'},403);\n    if(query.has('permissions'))return deliver({permissions,revision:state.revision,otherReviewerAvailable:otherReviewerAvailable(state,actor.id)});\n    const control=readControl(state),flow=control.workflow;\r\n    if(query.has('uiHistory'))return permissions.history?deliver(workflowInterfaceMetadata(control,query)):deliver({error:'FORBIDDEN'},403);\n    if(query.has('versionId')){if(!permissions.history)return deliver({error:'FORBIDDEN'},403);const version=control.versions.find(v=>v.id===query.get('versionId'));return version?deliver({version}):deliver({error:'VERSION_NOT_FOUND'},404);}\n    if(query.has('legacyHistory')||query.has('legacyVersionId')){\r\n      if(!permissions.history)return deliver({error:'FORBIDDEN'},403);\n      const caseIds=new Set(flow?.cases.map(c=>c.id)||[]),rows=control.versions.filter(v=>!v.id.startsWith('shared-')&&!caseIds.has(v.id)).slice().reverse();\r\n      if(query.has('legacyVersionId')){const version=rows.find(v=>v.id===query.get('legacyVersionId'));return version?deliver({legacyVersion:version}):deliver({error:'VERSION_NOT_FOUND'},404);}\n      const before=query.get('before'),start=before?rows.findIndex(v=>v.id===before)+1:0;if(before&&!start)return deliver({error:'HISTORY_CURSOR_INVALID'},409);\n      return deliver({versions:rows.slice(start,start+20).map(v=>({id:v.id,number:v.number,status:v.status,creatorId:v.creatorId,creatorName:v.creatorName,createdAt:v.createdAt,updatedAt:v.updatedAt})),next:rows.length>start+20?rows[start+19].id:null,total:rows.length});\n    }\r\n    if(query.has('restoreSaveId')){\r\n      if(!permissions.history||!permissions.restore)return deliver({error:'FORBIDDEN'},403);\n      if(!flow||openIpqc(control)?.status!=='draft')return deliver({error:flow?.pendingId?'PENDING_LOCKED':'BEGIN_REQUIRED'},409);\n      const saved=flow.saves.find(s=>s.id===query.get('restoreSaveId'));if(!saved)return deliver({error:'SAVE_NOT_FOUND'},404);\n      const context=ipqcWorkflowContext(control,{actor:{id:actor.id,name:actor.name,admin:actor.role==='admin'},at:new Date().toISOString(),id:()=>crypto.randomUUID(),allowed:p=>permissions[p]},[]);\r\n      const after=context.restoreContent!(copyIpqc(saved.content),flow.working);\r\n      await assertRestoreAccess(request,state,flow.working,after,phase?.allowed);\n      return deliver({generation:flow.generation,expectedRevision:flow.revision,restoreSaveId:saved.id,before:flow.working,after,source:{actor:saved.actor,at:saved.at}});\n    }\r\n    if(query.get('history')==='cases') {\r\n      if(!permissions.history)return deliver({error:'FORBIDDEN'},403);\n      const cases=[...(flow?.cases||[])].reverse(),before=query.get('before');\r\n      const start=before?cases.findIndex(c=>c.id===before)+1:0;\r\n      if(before&&!start)return deliver({error:'HISTORY_CURSOR_INVALID'},409);\n      const rows=cases.slice(start,start+20);\r\n      return deliver({cases:rows.map(c=>({id:c.id,savedId:c.savedId,baseId:c.baseId,actor:c.actor,at:c.at,reason:c.reason,status:c.status,result:c.result})),\n        next:cases.length>start+20?rows.at(-1)?.id:null,total:cases.length});\r\n    }\r\n    if(query.has('caseId')) {\r\n      if(!permissions.history)return deliver({error:'FORBIDDEN'},403);\n      const reviewCase=flow?.cases.find(c=>c.id===query.get('caseId'));\r\n      return reviewCase?deliver({reviewCase,currentDraftId:openIpqc(control)?.id||null}):deliver({error:'CASE_NOT_FOUND'},404);\n    }\r\n    const operationId=query.get('operationId');\r\n    if(operationId) {\r\n      const receipt=flow?.receipts[operationId];\r\n      if(!receipt)return deliver({error:'OPERATION_NOT_FOUND'},404);\n      const action=JSON.parse(receipt.fingerprint).action;\r\n      const permission=action==='apply'||action==='restore'?'edit':action;\r\n      if(receipt.actorId!==actor.id||!permissions[permission as DraftPermission]||action==='restore'&&!permissions.restore)return deliver({error:'FORBIDDEN'},403);\n      return deliver({receipt:receipt.result});\n    }\r\n    const since=new URL(request.url).searchParams.get('since');\r\n    if(flow&&since===`${flow.generation}:${flow.revision}`)return deliver({revision:state.revision,permissions,unchanged:true});\n    return deliver({revision:state.revision,permissions,workflow:flow ? {\n      scope:flow.scope,generation:flow.generation,revision:flow.revision,working:flow.working,\r\n      saved:flow.saved ? {id:flow.saved.id,revision:flow.saved.revision,actor:flow.saved.actor,at:flow.saved.at}:null,\r\n      pendingId:flow.pendingId,activeId:flow.active.id,contributors:flow.contributors,\r\n      editable:openIpqc(control)?.status==='draft',\r\n    }:null});\r\n  } catch(error) {return error instanceof DraftConflict?deliver({error:error.code},error.status):deliver({error:'WORKFLOW_LOAD_FAILED'},503);}\n}\r\n"
      }
    ]
  },
  "lib/scoped-workflow-read.ts": {
    "baselineCommit": "b62526ce3e471e5da8658896beaf786e06af6839",
    "baselineHash": "20fece5fbebd7e5ce5c0d5a0d983c2aae177e465490d25006ae5e47398f35dfa",
    "candidateHash": "3b1bed28bd4f04f88684e9a12f50a335319e612b5b01aa431ab47a6da7877442",
    "outsideMarker": "// Server-owned GET scopes only. No caller-supplied keys, projection, authority",
    "rules": [
      {
        "name": "exact phase delta 1",
        "offset": 0,
        "before": "import {env} from 'cloudflare:workers';\nimport {identity,can,type State} from './process-state';\nimport {decodeRecordValues,isImmutableRecordBody} from './state-records';\nimport {DraftConflict} from './shared-draft';\n",
        "after": "import {env} from 'cloudflare:workers';\nimport {createScopedWorkflowReadPermissionPhase,type State} from './process-state';\nimport {decodeRecordValues,isImmutableRecordBody} from './state-records';\nimport {DraftConflict} from './shared-draft';\n"
      },
      {
        "name": "exact phase delta 2",
        "offset": 325,
        "before": "// cache, writer capability or background integrity operation.\nexport type ScopedWorkflowRead='ipqc-c-workflow'|'routine-fqc';\nconst authKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];\nconst object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);\n",
        "after": "// cache, writer capability or background integrity operation.\nexport type ScopedWorkflowRead='ipqc-c-workflow'|'routine-fqc';\ntype ReadPhase=Awaited<ReturnType<typeof createScopedWorkflowReadPermissionPhase>>;\nconst phases=new WeakMap<State,{request:Request;phase:ReadPhase}>();\nexport function scopedWorkflowPermissionPhase(request:Request,state:State):ReadPhase|null{\n const binding=phases.get(state);\n if(!binding){if(state.deliveryOnly&&state.recordStorage?.partial)throw Error('MISSING_SCOPED_READ_PERMISSION_PHASE');return null;}\n if(binding.request!==request)throw Error('SCOPED_READ_PERMISSION_REQUEST_MISMATCH');\n return binding.phase;\n}\nconst authKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];\nconst object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);\n"
      },
      {
        "name": "exact phase delta 3",
        "offset": 3352,
        "before": " const state:State={revision:row.revision,...auth,deliveryOnly:true},query=new URL(request.url).searchParams;\n const keys=scope==='ipqc-c-workflow'?(query.has('permissions')?[]:['ipqcCMasterControl']):['routineFqcEnabled','routineFqcControl','qualityMasterControl','masterDataControl'];\n if(keys.length){\n  // These are additional pre-body gates, not replacements for each route's\n  // original post-body identity/access checks (including late revocation).\n  const actor=await identity(request,state);\n  if(!actor)throw new DraftConflict(scope==='routine-fqc'?'LOGIN_REQUIRED':'FORBIDDEN',scope==='routine-fqc'?401:403);\n  if(!await can(request,state,scope==='routine-fqc'?'routine.view':'ipqc-c.view'))throw new DraftConflict('FORBIDDEN',403);\n  const target=await decodeRecordValues(env.STATE_ARCHIVE,envelope,scope==='ipqc-c-workflow'?{\n   keys,modelKey:'ipqcCMasterControl',deferDependencyHistory:true,deferHistory:true,\n",
        "after": " const state:State={revision:row.revision,...auth,deliveryOnly:true},query=new URL(request.url).searchParams;\n const keys=scope==='ipqc-c-workflow'?(query.has('permissions')?[]:['ipqcCMasterControl']):['routineFqcEnabled','routineFqcControl','qualityMasterControl','masterDataControl'];\n const phase=await createScopedWorkflowReadPermissionPhase(request,state);\n const stale=()=>new DraftConflict(scope==='routine-fqc'?'LOGIN_REQUIRED':'FORBIDDEN',scope==='routine-fqc'?401:403);\n if(!phase.actor)throw stale();\n if(!phase.allowed(scope==='routine-fqc'?'routine.view':'ipqc-c.view'))throw new DraftConflict('FORBIDDEN',403);\n if(keys.length){\n  // Fresh prebody gate is distinct from initial pure permissions and from the\n  // postbody and final JSON-delivery fences. No business GET precedes this.\n  if(!await phase.current())throw stale();\n  const target=await decodeRecordValues(env.STATE_ARCHIVE,envelope,scope==='ipqc-c-workflow'?{\n   keys,modelKey:'ipqcCMasterControl',deferDependencyHistory:true,deferHistory:true,\n"
      },
      {
        "name": "exact phase delta 4",
        "offset": 4770,
        "before": "  state.values={...auth.values,...target.values};\n  state.recordStorage={...target.recordStorage,originalValues:{...state.values},known:new Set([...auth.recordStorage.known,...target.recordStorage.known]),partial:true};\n }\n const required=[...authKeys,...keys];\n // No body/identity/session data. Unread references are not declared healthy;\n",
        "after": "  state.values={...auth.values,...target.values};\n  state.recordStorage={...target.recordStorage,originalValues:{...state.values},known:new Set([...auth.recordStorage.known,...target.recordStorage.known]),partial:true};\n  if(!await phase.current())throw stale();\n }\n phases.set(state,{request,phase});\n const required=[...authKeys,...keys];\n // No body/identity/session data. Unread references are not declared healthy;\n"
      }
    ]
  },
  "lib/draft-restore-access.ts": {
    "baselineCommit": "b62526ce3e471e5da8658896beaf786e06af6839",
    "baselineHash": "7c92948cd0ed62583ec352bffc17b414abcd63a914456bfc3b5535f96dd4ea96",
    "candidateHash": "e5aa777e64ba240e15d9fc7dbc281b1767a63b590a438e74ef6ebb3c2cecce6f",
    "outsideMarker": "import {can, type State} from './process-state';",
    "rules": [
      {
        "name": "exact phase delta 1",
        "offset": 2172,
        "before": "  return !!moduleId&&accessKeys.includes(moduleId+'.restore')&&await allowed(moduleId+'.view')&&await allowed(moduleId+'.edit')&&await allowed(moduleId+'.restore');\n}\nexport async function assertRestoreAccess(request:Request,state:State,before:unknown,after:unknown){\n  if(!await restoreAllowed(request,state))throw new DraftConflict('RESTORE_PERMISSION_REQUIRED',403);\n  const moduleId=moduleForURL(request.url)!,effects=restoreEffects(before,after);\n  for(const op of ['create','delete'] as const)if(effects[op]&&accessKeys.includes(moduleId+'.'+op)&&!await can(request,state,moduleId+'.'+op))throw new DraftConflict(op==='delete'?'RESTORE_DELETE_PERMISSION_REQUIRED':'RESTORE_CREATE_PERMISSION_REQUIRED',403);\n  return effects;\n}\n",
        "after": "  return !!moduleId&&accessKeys.includes(moduleId+'.restore')&&await allowed(moduleId+'.view')&&await allowed(moduleId+'.edit')&&await allowed(moduleId+'.restore');\n}\nexport async function assertRestoreAccess(request:Request,state:State,before:unknown,after:unknown,allowed=(key:string):boolean|Promise<boolean>=>can(request,state,key)){\n  if(!await restoreAllowed(request,state,allowed))throw new DraftConflict('RESTORE_PERMISSION_REQUIRED',403);\n  const moduleId=moduleForURL(request.url)!,effects=restoreEffects(before,after);\n  for(const op of ['create','delete'] as const)if(effects[op]&&accessKeys.includes(moduleId+'.'+op)&&!await allowed(moduleId+'.'+op))throw new DraftConflict(op==='delete'?'RESTORE_DELETE_PERMISSION_REQUIRED':'RESTORE_CREATE_PERMISSION_REQUIRED',403);\n  return effects;\n}\n"
      }
    ]
  },
  "app/api/routine-fqc/route.ts": {
    "baselineCommit": "b62526ce3e471e5da8658896beaf786e06af6839",
    "baselineHash": "84bce0d1523a5c858c7e7363335464d293f7752b7c1ae940315405ae8a8bd584",
    "candidateHash": "0ade5fb273fde73806b8c51bdba1d65917d459b6542e16f5f18365cde313383d",
    "outsideMarker": "  stateRevisionIsCurrent,",
    "rules": [
      {
        "name": "exact phase delta 1",
        "offset": 0,
        "before": "import {readScopedWorkflowState} from '@/lib/scoped-workflow-read';\nimport { env } from 'cloudflare:workers';\nimport {workflowAccess} from '@/lib/versioned-shared-workflow';\n",
        "after": "import {readScopedWorkflowState,scopedWorkflowPermissionPhase} from '@/lib/scoped-workflow-read';\nimport { env } from 'cloudflare:workers';\nimport {workflowAccess} from '@/lib/versioned-shared-workflow';\n"
      },
      {
        "name": "exact phase delta 2",
        "offset": 759,
        "before": "  request: Request,\n  state: Awaited<ReturnType<typeof readState>>,\n) {\n  const granular=await workflowAccess(request,state);\n  return {...granular,settings:granular.view&&await can(request,state,'routine.settings'),revoke:granular.approve&&await can(request,state,'approval.revoke'),revise:granular.edit&&await can(request,state,'approval.revise')};\n}\nconst reply = (body: unknown, status = 200) =>\n",
        "after": "  request: Request,\n  state: Awaited<ReturnType<typeof readState>>,\n  allowed=(key:string):boolean|Promise<boolean>=>can(request,state,key),\n) {\n  const granular=await workflowAccess(request,state,allowed);\n  return {...granular,settings:granular.view&&await allowed('routine.settings'),revoke:granular.approve&&await allowed('approval.revoke'),revise:granular.edit&&await allowed('approval.revise')};\n}\nconst reply = (body: unknown, status = 200) =>\n"
      },
      {
        "name": "exact phase delta 3",
        "offset": 1480,
        "before": "  state.values.routineFqcEnabled === '1';\nexport async function GET(request: Request) {\n  try {\n    const state = (request.method==='GET'?await readScopedWorkflowState(request,'routine-fqc'):null) || await readState({\n        deferHistory: true,\n        deferDependencyHistory: true,\n      }),\n      actor = await identity(request, state),\n      permissions = await access(request, state);\n    if (!actor) return reply({ error: 'LOGIN_REQUIRED' }, 401);\n    if (!permissions.view) return reply({ error: 'FORBIDDEN' }, 403);\n    const c = parseRoutine(state.values[RF_KEY]),\n      sources = routineSources(state),\n      query = new URL(request.url).searchParams;\n    if (query.has('availability'))\n      return reply({ enabled: enabled(request, state) });\n    if (!enabled(request, state))\n      return reply({ error: 'FQC_NOT_ENABLED' }, 404);\n    // Search is a read-only projection under routine.view. It does not grant\n    // schedule settings access and never persists preview jobs.\n",
        "after": "  state.values.routineFqcEnabled === '1';\nexport async function GET(request: Request) {\n  let phase:ReturnType<typeof scopedWorkflowPermissionPhase>=null;\n  const deliver=async(body:unknown,status=200)=>{\n    try{if(phase&&!await phase.current())return reply({error:'LOGIN_REQUIRED'},401);return reply(body,status);}\n    catch{return reply({error:'FQC_READ_FAILED'},503);}\n  };\n  try {\n    const state = (request.method==='GET'?await readScopedWorkflowState(request,'routine-fqc'):null) || await readState({\n        deferHistory: true,\n        deferDependencyHistory: true,\n      });\n    phase=scopedWorkflowPermissionPhase(request,state);\n    const actor = phase?phase.actor:await identity(request, state),\n      permissions = await access(request, state,phase?.allowed);\n    if (!actor) return deliver({ error: 'LOGIN_REQUIRED' }, 401);\n    if (!permissions.view) return deliver({ error: 'FORBIDDEN' }, 403);\n    const c = parseRoutine(state.values[RF_KEY]),\n      sources = routineSources(state),\n      query = new URL(request.url).searchParams;\n    if (query.has('availability'))\n      return deliver({ enabled: enabled(request, state) });\n    if (!enabled(request, state))\n      return deliver({ error: 'FQC_NOT_ENABLED' }, 404);\n    // Search is a read-only projection under routine.view. It does not grant\n    // schedule settings access and never persists preview jobs.\n"
      },
      {
        "name": "exact phase delta 4",
        "offset": 3723,
        "before": "          .filter((j) => j.end > today).slice(0, 1);\n      });\n      return reply({ jobs, revision: c.revision,\n        unresolved: sources.filter((source) => !source.frequency) });\n    }\n    if (query.has('preview')) {\n      if (!permissions.settings) return reply({ error: 'FORBIDDEN' }, 403);\n      const start = query.get('start') || c.startDate || companyDate();\n      const jobs = sources.flatMap((source) => {\n",
        "after": "          .filter((j) => j.end > today).slice(0, 1);\n      });\n      return deliver({ jobs, revision: c.revision,\n        unresolved: sources.filter((source) => !source.frequency) });\n    }\n    if (query.has('preview')) {\n      if (!permissions.settings) return deliver({ error: 'FORBIDDEN' }, 403);\n      const start = query.get('start') || c.startDate || companyDate();\n      const jobs = sources.flatMap((source) => {\n"
      },
      {
        "name": "exact phase delta 5",
        "offset": 4403,
        "before": "        return schedulePreview(c, [source], start, horizon);\n      });\n      return reply({ jobs, unresolved: sources.filter((s) => !s.frequency) });\n    }\n    if (query.has('operationId')) {\n      const receipt = c.receipts[query.get('operationId')!];\n      if (!receipt || receipt.actorId !== actor.id)\n        return reply({ error: 'OPERATION_NOT_FOUND' }, 404);\n      return reply({ result: receipt.result, revision: c.revision });\n    }\n    const documents = c.documents.map((d) => ({\n",
        "after": "        return schedulePreview(c, [source], start, horizon);\n      });\n      return deliver({ jobs, unresolved: sources.filter((s) => !s.frequency) });\n    }\n    if (query.has('operationId')) {\n      const receipt = c.receipts[query.get('operationId')!];\n      if (!receipt || receipt.actorId !== actor.id)\n        return deliver({ error: 'OPERATION_NOT_FOUND' }, 404);\n      return deliver({ result: receipt.result, revision: c.revision });\n    }\n    const documents = c.documents.map((d) => ({\n"
      },
      {
        "name": "exact phase delta 6",
        "offset": 5544,
        "before": "    }));\n    if (query.has('export')) {\n      if (!permissions.history) return reply({ error: 'FORBIDDEN' }, 403);\n      const d = documents.find((d) => d.id === query.get('export'));\n      if (!d || docStatus(d) !== 'approved')\n        return reply({ error: 'FORMAL_DOCUMENT_REQUIRED' }, 409);\n      return reply({\n        document: d,\n        content: d.flow.active.content,\n",
        "after": "    }));\n    if (query.has('export')) {\n      if (!permissions.history) return deliver({ error: 'FORBIDDEN' }, 403);\n      const d = documents.find((d) => d.id === query.get('export'));\n      if (!d || docStatus(d) !== 'approved')\n        return deliver({ error: 'FORMAL_DOCUMENT_REQUIRED' }, 409);\n      return deliver({\n        document: d,\n        content: d.flow.active.content,\n"
      },
      {
        "name": "exact phase delta 7",
        "offset": 6077,
        "before": "      });\n    }\n    return reply({\n      control: {\n        ...c,\n",
        "after": "      });\n    }\n    return deliver({\n      control: {\n        ...c,\n"
      },
      {
        "name": "exact phase delta 8",
        "offset": 6493,
        "before": "    });\n  } catch (error) {\n    return reply(\n      {\n        error: error instanceof DraftConflict ? error.code : 'FQC_READ_FAILED',\n",
        "after": "    });\n  } catch (error) {\n    return deliver(\n      {\n        error: error instanceof DraftConflict ? error.code : 'FQC_READ_FAILED',\n"
      }
    ]
  }
};
function inverse(file,bytes,baseline){
 const spec=contracts[file];assert(spec,'Unexpected exact contract file');
 if(baseline)assert.equal(hash(baseline),spec.baselineHash,'Exact contract baseline changed');
 assert.equal(hash(bytes),spec.candidateHash,'Exact contract candidate changed');
 let restored=Buffer.from(bytes);
 for(const rule of [...spec.rules].reverse()){
  const after=Buffer.from(rule.after),before=Buffer.from(rule.before),at=rule.offset;
  assert(after.length>0);assert.deepEqual(restored.subarray(at,at+after.length),after,'Exact span content/position changed: '+rule.name);
  assert.equal(restored.indexOf(after),at,'Exact span not at unique position');assert.equal(restored.indexOf(after,at+1),-1,'Exact span repeated');
  restored=Buffer.concat([restored.subarray(0,at),before,restored.subarray(at+after.length)]);
 }
 assert.equal(hash(restored),spec.baselineHash,'Unreviewed bytes outside exact spans');if(baseline)assert.deepEqual(restored,baseline);return restored;
}
function negatives(file,bytes,baseline){
 const spec=contracts[file];baseline ||= inverse(file,bytes);
 assert.deepEqual(inverse(file,bytes,baseline),baseline);let count=0;
 const reject=changed=>{assert.throws(()=>inverse(file,changed,baseline));count++;};
 for(const rule of spec.rules){
  const at=rule.offset,after=Buffer.from(rule.after),left=bytes.subarray(0,at),right=bytes.subarray(at+after.length),mutated=Buffer.from(after);mutated[0]^=1;
  reject(Buffer.concat([left,mutated,right]));reject(Buffer.concat([left,right]));reject(Buffer.concat([left,after,after,right]));reject(at===0?Buffer.concat([left,right,after]):Buffer.concat([after,left,right]));
 }
 const outside=bytes.indexOf(Buffer.from(spec.outsideMarker));assert(outside>=0&&spec.rules.every(rule=>outside<rule.offset||outside>=rule.offset+Buffer.byteLength(rule.after)));
 const changed=Buffer.from(bytes);changed[outside]^=1;reject(changed);reject(Buffer.from(bytes.toString().includes('\r\n')?bytes.toString().replace(/\r\n/g,'\n'):bytes.toString().replace(/\n/g,'\r\n')));
 assert.throws(()=>inverse(file,bytes,Buffer.concat([baseline,Buffer.from(' ')])));count++;
 return count;
}
module.exports={withoutScopedReadPermissionPhase:inverse,assertScopedReadPermissionPhaseContract:negatives,phaseSourcePaths:Object.keys(contracts)};
