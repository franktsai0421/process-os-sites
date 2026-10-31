import {visibleStageReferences} from '@/lib/master-stage-reference-response';
import {legacyJsonValueText,type JsonValue} from '@/lib/legacy-login-json';
import {companyReader,companyState} from '@/lib/process-state';
import {permitsAny} from '@/lib/site-security.mjs';
import {accessKeys} from '@/public/process/access-policy.mjs';
import type {LegacyMasterControl,LegacyMasterSnapshot,LegacyMasterCatalog,LegacyCodeRow,LegacyProcessCatalog,LegacyProcessEquipment,LegacyApprovalVersion} from '@/lib/legacy-master-types';
import { env } from 'cloudflare:workers';
import { mediaState, restoreMediaUpdates, writeReceipt } from '@/lib/state-media';
import { stateRevisionIsCurrent } from '@/lib/process-state';
import {DraftConflict,stableDraftJSON} from '@/lib/shared-draft';
import {validateIPQCAssignments,legacyWorkspace} from '@/lib/process-ipqc';
import {removedMasterStages,stageReferences,removesLineWithStages} from '@/lib/master-stage-references';
import {assertStageTemplateAvailable} from '@/lib/master-process-lock';
import {assertProcessLinkAvailable} from '@/lib/master-stage-link';
import {
  readState,
  readPlatformUsers,
  encodeValues,
  identity,
  can,
  publicState,
  sameOrigin,
  allowedKey,
  parse,
  demoEnabled,
  responseHeaders as headers,
} from '@/lib/process-state';

const normalizeUserId = (value: unknown) => legacyJsonValueText((value || '') as JsonValue).trim().toLowerCase();
// Generic legacy writes have no fixed Save token. Keep existing pending cases
// reviewable, but do not let an old client create a new submission by replacing
// the aggregate. Only the changed workflow key is inspected, never all state.
function hasNewLegacySubmission(key:string,beforeRaw:string|undefined,afterRaw:string|null){
  if(!['masterDataControl','qualityMasterControl','approvalVersions'].includes(key)||afterRaw===null)return false;
  const before=parse(beforeRaw,null),after=parse(afterRaw,null);
  type Version={id?:unknown;scope?:unknown;status?:unknown};
  const pending=(row:Version)=>row?.status==='pending'||row?.status==='pending-test';
  const newPending=(old:unknown,next:unknown,scoped=false)=>{
    if(!Array.isArray(next))return false;
    const prior=new Set((Array.isArray(old)?old:[]).filter(pending).map((row:Version)=>JSON.stringify([scoped?row.scope:null,row.id])));
    return next.some((row:Version)=>pending(row)&&!prior.has(JSON.stringify([scoped?row.scope:null,row.id])));
  };
  if(key==='approvalVersions')return newPending(before,after);
  if(key==='masterDataControl')return newPending(before?.versions,after?.versions,true);
  return Object.entries(after?.libraries||{}).some(([name,library])=>newPending(before?.libraries?.[name]?.versions,(library as {versions?:unknown})?.versions));
}
const processPresetKeys = [
  'entry',
  'manual',
  'manual-inspection',
  'machine-assembly',
  'exit',
];
const validProcessCatalog = (
  catalog: unknown,
  requiredStages: string[] = [],
) => {
  if (!catalog || Array.isArray(catalog) || typeof catalog !== 'object')
    return false;
  const entries = Object.entries(catalog as Record<string, unknown>),
    validStages = new Set(requiredStages);
  if (
    requiredStages.some((stage) => !(stage in catalog)) ||
    entries.some(([stage]) => validStages.size > 0 && !validStages.has(stage))
  )
    return false;
  const equipmentIds = new Set<string>();
  return entries.every(([stage, items]) => {
    if (!Array.isArray(items)) return false;
    const ids = new Set<string>();
    const presets = new Set<string>();
    for (const item of items) {
      if (!item || typeof item !== 'object') return false;
      const template = item as Record<string, unknown>;
      const id = legacyJsonValueText((template.id || '') as JsonValue).trim();
      const name = legacyJsonValueText((template.name || '') as JsonValue).trim();
      if (!id || !name || ids.has(id)) return false;
      ids.add(id);
      if (template.presetKey) presets.add(legacyJsonValueText((template.presetKey) as JsonValue));
      if (
        template.mediaItems !== undefined &&
        !Array.isArray(template.mediaItems)
      )
        return false;
      if (template.equipment !== undefined) {
        if (!['machine-assembly', 'machine-setting'].includes(String(template.presetKey)) || !Array.isArray(template.equipment)) return false;
        for (const e of template.equipment as LegacyProcessEquipment[]) {
          if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id || equipmentIds.has(e.id) ||
            typeof e.name !== 'string' || !e.name.trim() || typeof e.number !== 'string' ||
            e.stageCode !== stage || e.line !== stage.split('-')[0] || e.kind !== template.presetKey ||
            !Array.isArray(e.mediaItems) || e.mediaItems.some((p) => !p || typeof p.src !== 'string')) return false;
          equipmentIds.add(e.id);
        }
      }
    }
    return processPresetKeys.every((key) => presets.has(key));
  });
};
const historicalUserReference = (values: Record<string, string>, userId: string) => {
  const identityFields = new Set(['creatorId','reviewerId','actorId','userId','submittedBy','createdBy','updatedBy','ownerId']);
  const visit = (value: unknown, key = ''): boolean => {
    if (Array.isArray(value)) return value.some((item) => visit(item));
    if (!value || typeof value !== 'object')
      return identityFields.has(key) && normalizeUserId(value) === userId;
    return Object.entries(value).some(([childKey, child]) => visit(child, childKey));
  };
  return Object.entries(values).some(([key, raw]) =>
    key !== 'platformUsers' && visit(parse(raw, null)),
  );
};

export async function GET(request: Request) {
  const auth=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});
  const reader=await companyReader(request,auth);
  if(!reader)return Response.json({error:'LOGIN_REQUIRED'},{status:401,headers});
  if(!await permitsAny(accessKeys.filter(key=>key.endsWith('.view')),reader.canRead))return Response.json({error:'FORBIDDEN'},{status:403,headers});
  const state=await readState({deferHistory:true,deferDependencyHistory:true});
  const projected=await companyState(request,state);
  const user=await identity(request,state);
  if(!user)return Response.json({error:'LOGIN_REQUIRED'},{status:401,headers});
  // Ordinary reads never create or prune backups; deferred media may still cache.
  return Response.json(
    { ...(request.headers.get('X-Process-Media') === 'deferred-v1' ? await mediaState(state,user.id,projected) : projected), identity: user, serverProtected: true, demoEnabled: demoEnabled(request) },
    { headers },
  );
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: '來源不允許' }, { status: 403, headers });
  const state = await readState({deferHistory:true,deferDependencyHistory:true}),
    user = await identity(request, state);
  if (!user)
    return Response.json(
      { error: '目前是唯讀模式；請由 ADMIN 帳號進入後再修改。' },
      { status: 401, headers },
    );
  if (state.values.maintenanceMode === '1')
    return Response.json(
      { error: '系統正在進行整站還原，暫停新增與修改資料。' },
      { status: 503, headers },
    );
  let body: {updates?:Record<string,string|null>;baseRevision?:unknown};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '資料格式錯誤' }, { status: 400, headers });
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !body.updates ||
    Array.isArray(body.updates) ||
    typeof body.updates !== 'object'
  )
    return Response.json({ error: '資料格式錯誤' }, { status: 400, headers });
  if (body.baseRevision !== state.revision)
    return Response.json(publicState(state,user.id), { status: 409, headers });
  const values = { ...state.values };
  for (const [key, value] of Object.entries(body.updates)) {
    if (!allowedKey(key) || !(value === null || typeof value === 'string'))
      return Response.json(
        { error: '不允許的資料欄位' },
        { status: 400, headers },
      );
    if (value !== null) {
      try {
        JSON.parse(value as string);
      } catch {
        return Response.json(
          { error: '資料 JSON 損壞，未儲存' },
          { status: 400, headers },
        );
      }
    }
    if (value === state.values[key]) continue;
    if(key==='bomOverrides'&&state.values.bomMasterControl)
      return Response.json({error:'WORKFLOW_V3_REQUIRED'},{status:409,headers});
    if(state.values.processAuthoringControl&&(key==='approvalVersions'||key==='publishedProcess'||key.startsWith('processEditor:')))
      return Response.json({error:'WORKFLOW_V3_REQUIRED'},{status:409,headers});
    if(key==='qualityMasterControl'&&parse(state.values[key],null)?.libraries?.fqc?.workflow)
      return Response.json({error:'WORKFLOW_V3_REQUIRED'},{status:409,headers});
    const adoptedMaster=parse(state.values.masterDataControl,null);
    if(adoptedMaster&&(key==='processMasterData'||key==='masterDataControl'&&
      stableDraftJSON(parse(value as string,null)?.active?.PROCESS)!==stableDraftJSON(adoptedMaster.active?.PROCESS))){
      try{assertProcessLinkAvailable(adoptedMaster);}catch(error){return Response.json({error:(error as {code?:unknown}).code,details:(error as {details?:unknown}).details},{status:409,headers});}
    }
    if(key==='masterDataControl'&&adoptedMaster?.workflowScopes){
      const incoming=parse(value as string,null),scopes=Object.keys(adoptedMaster.workflowScopes);
      if(!incoming||stableDraftJSON(incoming.workflowScopes)!==stableDraftJSON(adoptedMaster.workflowScopes)||scopes.some(scope=>
        stableDraftJSON(incoming.active?.[scope])!==stableDraftJSON(adoptedMaster.active?.[scope])||
        stableDraftJSON(incoming.versions?.filter((v:{scope:string})=>v.scope===scope))!==stableDraftJSON(adoptedMaster.versions.filter((v:{scope:string})=>v.scope===scope))))
        return Response.json({error:'WORKFLOW_V3_REQUIRED'},{status:409,headers});
    }
    if(key==='processMasterData'&&adoptedMaster?.workflowScopes?.PROCESS)
      return Response.json({error:'WORKFLOW_V3_REQUIRED'},{status:409,headers});
    if (['platformUsers','processCustomRoles','processRoleTemplateOverrides'].includes(key))
      return Response.json({error:'帳號與角色請使用管理介面的專用操作儲存'}, {status:403,headers});
    const required = [
      'platformUsers',
      'processCustomRoles',
      'processRoleTemplateOverrides',
    ].includes(key)
      ? 'admin'
      : key === 'bomOverrides'
        ? 'master.import'
        : key === 'dispatchBoard'
          ? 'dispatch.edit'
          : key === 'approvalVersions'
            ? 'view:approval'
            : key.startsWith('processEditor:')
              ? 'view:editor'
              : 'view:data';
    if(key==='dispatchBoard'&&!await can(request,state,'dispatch.view'))return Response.json({error:'FORBIDDEN'},{status:403,headers});
    if (
      required === 'admin'
        ? user.role !== 'admin'
        : !(await can(request, state, required))
    )
      return Response.json(
        { error: '目前角色沒有修改此資料的權限' },
        { status: 403, headers },
      );
    if(hasNewLegacySubmission(key,state.values[key],value))
      return Response.json({error:'WORKFLOW_V3_REQUIRED',code:'WORKFLOW_V3_REQUIRED',details:{reason:'LEGACY_SUBMIT_CANNOT_VERIFY_SAVED_VERSION'}},{status:409,headers});
    if (value === null) delete values[key];
    else values[key] = value as string;
  }
  if (Object.values(body.updates).some(value=>typeof value==='string'&&value.includes('/api/state-media?id='))) {
    try {
      for (const [key,value] of Object.entries(await restoreMediaUpdates(body.updates, state.values))) if(value!==null)values[key]=value;
    } catch {
      return Response.json({error:'媒體讀取失敗，未儲存；請重試。'}, {status:503,headers});
    }
  }
  try {
    for(const key of Object.keys(body.updates)) {
      if(key.startsWith('processEditor:')&&values[key])validateIPQCAssignments([legacyWorkspace(JSON.parse(values[key]))],state.values[key]?[legacyWorkspace(JSON.parse(state.values[key]))]:[],state.values);
      if(key==='approvalVersions'&&values[key])for(const version of JSON.parse(values[key])) {
        const previous=JSON.parse(state.values[key]||'[]').find((v:{id:string})=>v.id===version.id);
        validateIPQCAssignments([legacyWorkspace(version)],previous?[legacyWorkspace(previous)]:[],state.values);
      }
    }
  } catch(error) {
    return Response.json({error:error instanceof DraftConflict?error.code:error instanceof Error?error.message:'IPQC_ASSIGNMENT_INVALID'},{status:error instanceof DraftConflict?error.status:422,headers});
  }
  const master:LegacyMasterControl|null = parse(values.masterDataControl, null);
  if (
    master &&
    (!master.active?.AB || !master.active?.C || !Array.isArray(master.versions))
  )
    return Response.json(
      { error: '主資料缺少版本或產線，未儲存' },
      { status: 400, headers },
    );
  if (master)
    for (const scope of ['AB', 'C'] as const) {
      const catalog = master.active[scope];
      if (
        !Array.isArray(catalog.products) ||
        !Array.isArray(catalog.lines) ||
        catalog.products.some(
          (p) => !p.code || !Array.isArray(p.stages),
        ) ||
        catalog.lines.some((l) => !l.code || !Array.isArray(l.stages))
      )
        return Response.json(
          { error: '主資料結構不完整' },
          { status: 400, headers },
        );
    }
  const processStages = master
    ? (['AB', 'C'] as const).flatMap((scope) =>
        master.active[scope].lines.flatMap((line) =>
          line.stages.map((stage) => String(stage.code || '')),
        ),
      )
    : [];
  if (
    master?.active?.PROCESS &&
    !validProcessCatalog(master.active.PROCESS, processStages)
  )
    return Response.json(
      { error: '流程資料結構不完整' },
      { status: 400, headers },
    );
  if (
    master?.versions?.some(
      (version) =>
        version.scope === 'PROCESS' &&
        !validProcessCatalog(version.snapshot),
    )
  )
    return Response.json(
      { error: '流程資料版本結構不完整' },
      { status: 400, headers },
    );
  const prior:LegacyMasterControl|null = parse(state.values.masterDataControl, null);
  if (prior && master && JSON.stringify(prior) !== JSON.stringify(master)) {
    const removedChildLine=(['AB','C'] as const).some(scope=>removesLineWithStages(prior.active?.[scope],master.active?.[scope]))
      ||(master.versions||[]).some(version=>['AB','C'].includes(version.scope)&&['draft','pending','approved'].includes(version.status)
        &&removesLineWithStages(prior.versions?.find(v=>v.id===version.id)?.snapshot||prior.active?.[version.scope],version.snapshot));
    if(removedChildLine)return Response.json({error:'LINE_HAS_STAGES'},{status:409,headers});
    const removedStages=new Set<string>();
    for(const scope of ['AB','C'] as const)removedMasterStages(prior.active?.[scope],master.active?.[scope]).forEach(code=>removedStages.add(code));
    for(const version of master.versions||[]){if(!['AB','C'].includes(version.scope)||!['draft','pending','approved'].includes(version.status))continue;
      const old=prior.versions?.find((v:{id:string})=>v.id===version.id);
      removedMasterStages(old?.snapshot||prior.active?.[version.scope],version.snapshot).forEach(code=>removedStages.add(code));}
    const impact=stageReferences(state.values,[...removedStages]);
    if(impact.total)return Response.json({error:'STAGE_IN_USE',details:await visibleStageReferences(request,impact)},{status:409,headers});
    try{
      for(const scope of ['AB','C'] as const)assertStageTemplateAvailable(prior,prior.active?.[scope],master.active?.[scope]);
      for(const version of master.versions||[]){if(!['AB','C'].includes(version.scope)||!['draft','pending','approved'].includes(version.status))continue;
        const old=prior.versions?.find((v:{id:string})=>v.id===version.id);
        assertStageTemplateAvailable(prior,old?.snapshot||prior.active?.[version.scope],version.snapshot);
      }
    }catch(error){if(error instanceof Error&&error.message==='PROCESS_TEMPLATE_SCOPE_BUSY')return Response.json({error:error.message,details:(error as {details?:unknown}).details},{status:409,headers});throw error;}
    const processScopeInitialization = Boolean(
      !prior.active?.PROCESS &&
        master.active?.PROCESS &&
        JSON.stringify(prior.active?.AB) === JSON.stringify(master.active?.AB) &&
        JSON.stringify(prior.active?.C) === JSON.stringify(master.active?.C) &&
        JSON.stringify(master.active.PROCESS) ===
          JSON.stringify(parse(state.values.processMasterData, {})),
    );
    if (
      JSON.stringify(prior.active) !== JSON.stringify(master.active) &&
      !processScopeInitialization &&
      !(await can(request, state, 'approval.approve'))
    )
      return Response.json(
        { error: '只有主管核准才能變更生效資料' },
        { status: 403, headers },
      );
    const removed = (a: LegacyCodeRow[], b: LegacyCodeRow[]) =>
      a.some((x) => !b.some((y) => y.code === x.code));
    let deletion = false;
    for (const v of master.versions) {
      const before:{snapshot?:LegacyMasterSnapshot;status?:string} = prior.versions.find((p) => p.id === v.id) || {
        snapshot: prior.active[v.scope],
      };
      if (before?.snapshot && v.snapshot) {
        if (v.scope === 'PROCESS') {
          const nextEquipment = new Set(Object.values(v.snapshot).flatMap((items) => items.flatMap((item) => (item.equipment || []).map((e) => e.id))));
          deletion ||= Object.values((before.snapshot as LegacyProcessCatalog)).some((items) => items.some((item) => (item.equipment || []).some((e) => !nextEquipment.has(e.id))));
          deletion ||= Object.entries((before.snapshot as LegacyProcessCatalog)).some(
            ([stage, items]) =>
              !Array.isArray(v.snapshot[stage]) ||
              items.some(
                (item) =>
                  !v.snapshot[stage].some((next) => next.id === item.id),
              ),
          );
        } else {
          deletion ||=
            removed((before.snapshot as LegacyMasterCatalog).products || [], v.snapshot.products || []) ||
            removed((before.snapshot as LegacyMasterCatalog).lines || [], v.snapshot.lines || []) ||
            removed(
              ((before.snapshot as LegacyMasterCatalog).lines || []).flatMap((l) => l.stages || []),
              (v.snapshot.lines || []).flatMap((l) => l.stages || []),
            );
          deletion ||=
            ((before.snapshot as LegacyMasterCatalog).products || []).some((p) => {
              const next = (v.snapshot.products || []).find(
                (n) => n.code === p.code,
              );
              return (
                next &&
                (p.stages || []).some(
                  (code: string) => !next.stages.includes(code),
                )
              );
            }) ||
            ((before.snapshot as LegacyMasterCatalog).categoryGroups || []).some(
              (g) =>
                !(v.snapshot.categoryGroups || []).some(
                  (n) => n.line === g.line && n.name === g.name,
                ),
            );
        }
      }
      if (
        before &&
        before.status !== 'approved' &&
        v.status === 'approved' &&
        !(await can(request, state, 'approval.approve'))
      )
        return Response.json(
          { error: '沒有主管核准權限' },
          { status: 403, headers },
        );
    }
    if (
      deletion &&
      (!(await can(request, state, 'master.delete')) ||
        prior.versions.some((v) => v.status === 'pending'))
    )
      return Response.json(
        { error: '無刪除權限，或仍有送審案件' },
        { status: 403, headers },
      );
  }
  if (values.processMasterData !== state.values.processMasterData) {
    const before:LegacyProcessCatalog = parse(state.values.processMasterData, {}),
      after:LegacyProcessCatalog = parse(values.processMasterData, {});
    if (
      master?.active?.PROCESS &&
      JSON.stringify(after) !== JSON.stringify(master.active.PROCESS)
    )
      return Response.json(
        { error: '流程資料必須先送審並由主管核准' },
        { status: 403, headers },
      );
    const removed = Object.entries(before).some(([stage, items]) =>
      items.some(
        (item) =>
          !(after[stage] || []).some((next) => next.id === item.id),
      ),
    );
    const approvingProcessDeletion = Boolean(
      prior &&
        master &&
        (await can(request, state, 'approval.approve')) &&
        master.versions.some((version) => {
          const previous = prior.versions.find(
            (item) => item.id === version.id,
          );
          return (
            version.scope === 'PROCESS' &&
            previous?.status === 'pending' &&
            version.status === 'approved' &&
            JSON.stringify(version.snapshot) ===
              JSON.stringify(master.active.PROCESS) &&
            JSON.stringify(version.snapshot) === JSON.stringify(after)
          );
        }),
    );
    if (
      removed &&
      (!(await can(request, state, 'master.delete')) ||
        (prior?.versions?.some((v) => v.status === 'pending') &&
          !approvingProcessDeletion))
    )
      return Response.json(
        { error: '流程範本刪除已鎖定：需刪除權限且不可有送審案件' },
        { status: 403, headers },
      );
  }
  if (values.approvalVersions !== state.values.approvalVersions) {
    const before:LegacyApprovalVersion[] = parse(state.values.approvalVersions, []),
      after:LegacyApprovalVersion[] = parse(values.approvalVersions, []);
    if (!Array.isArray(after))
      return Response.json(
        { error: '版本資料格式錯誤' },
        { status: 400, headers },
      );
    if (
      after.some(
        (v) =>
          v.status === 'approved' &&
          before.find((p) => p.id === v.id)?.status !== 'approved',
      ) &&
      !(await can(request, state, 'approval.approve'))
    )
      return Response.json(
        { error: '沒有主管核准權限' },
        { status: 403, headers },
      );
  }
  if (Object.prototype.hasOwnProperty.call(body.updates, 'platformUsers') && values.platformUsers) {
    const users = readPlatformUsers(values.platformUsers),
      old = readPlatformUsers(state.values.platformUsers);
    if (!Array.isArray(users))
      return Response.json({ error: '使用者資料格式錯誤' }, { status: 400, headers });
    const ids = users.map((u) => normalizeUserId(u.id));
    if (ids.some((id: string) => !id || !/^[a-z0-9._-]{1,80}$/.test(id)))
      return Response.json({ error: '帳號只可使用英文字母、數字、點、底線及連字號' }, { status: 400, headers });
    if (new Set(ids).size !== ids.length)
      return Response.json({ error: '英文帳號不分大小寫且不可重複' }, { status: 409, headers });
    const normalized = users.map((u, index: number) => {
      const id = ids[index], previous = old.find((o) => normalizeUserId(o.id) === id);
      return {
        ...u,
        id,
        name: String(u.name || '').trim(),
        role: id === 'admin' ? 'admin' : (u.role || 'staff'),
        enabled: u.enabled !== false,
        inheritRole: u.inheritRole !== false,
        lines: Array.isArray(u.lines) ? u.lines : [],
        views: Array.isArray(u.views) ? u.views : [],
        permissions: Array.isArray(u.permissions) ? u.permissions : [],
        password: u.password || previous?.password,
      };
    });
    if (normalized.some((u) => !u.name || !u.password))
      return Response.json({ error: '使用者姓名與密碼不可空白' }, { status: 400, headers });
    if (!normalized.some((u) => u.role === 'admin' && u.enabled !== false))
      return Response.json({ error: '不可停用或刪除最後一位 ADMIN' }, { status: 409, headers });
    const deleted = old.filter((u) => !normalized.some((n) => n.id === normalizeUserId(u.id)));
    const protectedUser = deleted.find((u) => historicalUserReference(state.values, normalizeUserId(u.id)));
    if (protectedUser)
      return Response.json({ error: `帳號 ${normalizeUserId(protectedUser.id)} 已有歷史紀錄，只能停用` }, { status: 409, headers });
    values.platformUsers = JSON.stringify(
      normalized,
    );
  }
  // Multiple open browser tabs can repeat an already-applied localStorage write.
  // Treat an identical snapshot as a successful no-op so it does not create a
  // backup or consume a revision number on every polling cycle.
  if (Object.keys(values).length === Object.keys(state.values).length &&
      Object.entries(values).every(([key, value]) => value === state.values[key]))
    return Response.json(request.headers.get('X-Process-Receipt') === 'sha256' ? await writeReceipt(state, request, body.updates) : publicState(state,user.id), { headers });
  if (!await stateRevisionIsCurrent(state))
    return Response.json(publicState(await readState(),user.id), { status: 409, headers });
  const next = { revision: state.revision + 1, values };
  const result = await env.DB.prepare(
    'UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?',
  )
    .bind(
      next.revision,
      await encodeValues(values,state),
      new Date().toISOString(),
      state.revision,
    )
    .run();
  if (!result.meta.changes)
    return Response.json(publicState(await readState(),user.id), {
      status: 409,
      headers,
    });
  return Response.json(request.headers.get('X-Process-Receipt') === 'sha256' ? await writeReceipt(next, request, body.updates) : publicState(next,user.id), { headers });
}
