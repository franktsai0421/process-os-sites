import {restoreEffects} from '@/lib/draft-restore-access';
import { env } from 'cloudflare:workers';
import { readState, identity, can, sameOrigin, encodeValues, parse, maintenanceCredential, responseHeaders as headers } from '@/lib/process-state';
import { emptyEquipmentControl, activeVersion, openVersion, reserveMarks, nextPieceMark, checkedSnapshot, submitProblems, hierarchy, fillRepresentativePhotos, type EquipmentControl, type Equipment, type EquipmentGroup } from '@/lib/routine-equipment';
import {parseEquipmentWorkflow} from '@/lib/equipment-workflow';
import {visibleSharedControl} from '@/lib/versioned-shared-workflow';
import {recordJSONResponse} from '@/lib/state-records-response';
import {decodeRecordValues} from '@/lib/state-records';
import {identityKeys} from '@/lib/delivery-read-plan.mjs';
import {equipmentCatalog,projectEquipmentCatalog} from '@/lib/equipment-catalog.mjs';

const KEY = 'routineEquipmentControl';
const SOURCE_SHA = '07f85af6965e987da5e598f73b2ca592a23a20243fb69ad05429628393b3b2d0';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const actorRecord = (actor: { id: string; name: string }, action: string, comment = '') =>
  ({ action, actorId: actor.id, actorName: actor.name, at: new Date().toISOString(), ...(comment ? { comment } : {}) });
const controlFrom = (raw: string | undefined): EquipmentControl => {
  if (raw === undefined) return emptyEquipmentControl();
  const parsed = parse(raw, null);
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.versions) ||
      !Array.isArray(parsed.issues) || !parsed.reservedMarks || typeof parsed.reservedMarks !== 'object' ||
      !parsed.versions.every((version: unknown) => version && typeof version === 'object' &&
        Array.isArray((version as { equipment?: unknown }).equipment) &&
        Array.isArray((version as { groups?: unknown }).groups)))
    throw Error('檢具資料已存在但格式無法讀取；已停止寫入以保護原資料');
  for (const version of parsed.versions) {
    if (!Array.isArray(version.issues)) version.issues = clone(parsed.issues);
    if (version.status === 'draft'&&!parsed.workflow) fillRepresentativePhotos(version);
  }
  return parsed;
};
type WriteBody = {
  action?: string; baseRevision?: number; versionId?: string; versionRevision?: number;
  snapshot?: unknown; assetCode?: string; groupId?: string; unit?: string; id?: string; comment?: string;
  source?: { sha256?: string; fileName?: string; equipment?: Equipment[];
    groups?: EquipmentGroup[]; issues?: Record<string, unknown>[] };
};

// A narrow read-only FQC dependency, never a workflow/write baseline. Authorize
// before records I/O; keep the same pinned snapshot semantics as the full GET.
async function effectiveCatalog(request: Request) {
  const auth = await readState({keys:[...identityKeys]}), actor = await identity(request, auth);
  if (!actor || !(await can(request, auth, 'view:data')) && !(await can(request, auth, 'view:approval')))
    return reply({error:'沒有查看檢具資料的權限'},403);
  const values = auth.recordStorage
    ? (await decodeRecordValues(env.STATE_ARCHIVE,auth.recordStorage.envelope,{keys:[KEY],projectValue:projectEquipmentCatalog})).values
    : auth.values;
  const control = equipmentCatalog(values[KEY]);
  // The full GET checks the session after hydration. Retain that timing for
  // expiry/revoked tokens, without rereading global state or rejecting unrelated
  // writes. Data rights stay those of the one pinned snapshot, as before.
  const after = await identity(request,auth);
  if (!after || after.id !== actor.id) return reply({error:'沒有查看檢具資料的權限'},403);
  return reply({revision:auth.revision,control});
}

export async function GET(request: Request) {
  try {
    if (new URL(request.url).searchParams.get('catalog') === 'effective') return await effectiveCatalog(request);
    const caseMetadata=new URL(request.url).searchParams.get('caseMetadata')==='1';
    const state = await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode',KEY],modelKey:KEY,deferHistory:true,deferDependencyHistory:true});
    const actor = await identity(request, state);
    if (!actor || !(await can(request, state, 'equipment.view')))
      return reply({ error: '沒有查看檢具資料的權限' }, 403);
    const prepared=state.recordStorage?.models.get(KEY),control=prepared?parseEquipmentWorkflow(state.values[KEY],prepared):controlFrom(state.values[KEY]);
    const body={ revision: state.revision, control:'workflow'in control?visibleSharedControl(parseEquipmentWorkflow(state.values[KEY],prepared),await can(request,state,'approval.compare'),caseMetadata):control };
    return state.recordStorage&&!caseMetadata?recordJSONResponse(body,env.STATE_ARCHIVE,headers):reply(body);
  } catch (error) {
    console.error('[routine-equipment] load failed', error);
    return reply({ error: '檢具資料載入失敗；沒有初始化或覆蓋既有資料' }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: '來源不允許' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 2_000_000)
    return reply({ error: '單次送出資料過大' }, 413);
  try {
    let state = await readState({modelKey:KEY,deferHistory:true,deferDependencyHistory:true});
    const actor = await identity(request, state);
    if (!actor) return reply({ error: '請先登入' }, 401);
    if (state.values.maintenanceMode === '1') return reply({ error: '系統還原中，暫停編輯' }, 503);
    const body = await request.json() as WriteBody;
    if (!body || !Number.isInteger(body.baseRevision) || body.baseRevision !== state.revision)
      return reply({ error: '資料已由其他分頁更新，請重新載入後核對', revision: state.revision }, 409);
    const action = String(body.action || '');
    if(['import','workbookImport'].includes(action)&&!await maintenanceCredential(request))return reply({error:'NON_BOM_IMPORT_MAINTENANCE_ONLY'},403);
    const required:Record<string,string[]>={import:['edit','exchange'],workbookImport:['edit','save','exchange','create'],begin:['edit'],save:['edit','save'],submit:['edit','save','submit'],create:['edit','create'],delete:['edit','delete'],withdraw:['withdraw'],approve:['approve'],reject:['return']};
    if(!required[action])return reply({error:'不支援的操作'},400);
    if(!await can(request,state,'equipment.view')||!(await Promise.all(required[action].map(op=>can(request,state,'equipment.'+op)))).every(Boolean))return reply({error:'FORBIDDEN'},403);

    // Keep legacy Save and existing pending review available, but require the
    // shared workflow to establish a fixed saved snapshot before new submission.
    if(action==='submit')return reply({error:'WORKFLOW_V3_REQUIRED',code:'WORKFLOW_V3_REQUIRED',details:{reason:'LEGACY_SUBMIT_CANNOT_VERIFY_SAVED_VERSION'}},409);

    const prepared=state.recordStorage?.models.get(KEY) as {workflow?:unknown}|undefined;
    if(prepared?.workflow||parse(state.values[KEY],{}).workflow)return reply({error:'WORKFLOW_V3_REQUIRED'},409);
    if(state.recordStorage){state=await readState();if(state.revision!==body.baseRevision)return reply({error:'資料已更新，請重新核對'},409);}
    const control = clone(controlFrom(state.values[KEY]));
    if('workflow'in control)return reply({error:'WORKFLOW_V3_REQUIRED'},409);
    const time = new Date().toISOString();
    let version = openVersion(control);
    const active = activeVersion(control);
    if (action === 'import') {
      const source = body.source;
      if (source?.sha256 !== SOURCE_SHA || !Array.isArray(source.equipment) || source.equipment.length !== 119 ||
          !Array.isArray(source.groups) || !Array.isArray(source.issues) || source.issues.length !== 37)
        return reply({ error: '來源版本或筆數不符，沒有匯入' }, 400);
      if (control.source?.sha256 === SOURCE_SHA)
        return reply({ revision: state.revision, control, unchanged: true });
      const ids = new Set<string>();
      for (const item of source.equipment) {
        if (typeof item.id !== 'string' || !/^xlsx-row-\d+$/.test(item.id) || ids.has(item.id) ||
            item.sourceRow !== Number(item.id.slice(9)) || !/^[a-f0-9]{64}$/.test(item.photoId || '') ||
            item.photoSource?.workbookRow !== item.sourceRow || item.photoSource?.column !== 18 ||
            item.photoSource?.webSha256 !== item.photoId ||
            !(await env.STATE_ARCHIVE.head(`routine-equipment/photos/${item.photoId}`)))
          return reply({ error: `第 ${item.sourceRow || '?'} 列來源或照片對應失敗，沒有匯入` }, 400);
        ids.add(item.id);
      }
      if (!version) {
        version = {
          id: crypto.randomUUID(), number: active ? active.number + 1 : 1,
          status: 'draft', equipment: clone(active?.equipment || []), groups: clone(active?.groups || []),
          categories: clone(active?.categories || []), subcategories: clone(active?.subcategories || []), issues: clone(active?.issues || []),
          creatorId: actor.id, creatorName: actor.name, createdAt: time, updatedAt: time,
          revision: 1, history: [actorRecord(actor, 'import', '來源 Excel 匯入待確認草稿；未生效、未核准')],
        };
        control.versions.push(version);
      } else if (version.status !== 'draft') return reply({ error: '已有送審案件；不能覆蓋' }, 409);
      const existing = new Set(version.equipment.map(item => item.id));
      version.equipment.push(...source.equipment.filter(item => !existing.has(item.id)));
      const groupIds = new Set(version.groups.map(group => group.id));
      version.groups.push(...source.groups.filter(group => !groupIds.has(group.id)));
      control.issues = source.issues;
      version.issues = clone(source.issues);
      const importedHierarchy = hierarchy(version);
      version.categories = importedHierarchy.categories;
      version.subcategories = importedHierarchy.subcategories;
      version.groups = importedHierarchy.groups;
      control.source = { fileName: String(source.fileName || ''), sha256: SOURCE_SHA };
      reserveMarks(control, version.equipment);
    } else if (action === 'begin') {
      if (version?.status === 'pending') return reply({ error: '送審中不能編輯' }, 409);
      if (!version) {
        version = {
          id: crypto.randomUUID(), number: active ? active.number + 1 : 1,
          status: 'draft', equipment: clone(active?.equipment || []), groups: clone(active?.groups || []),
          categories: clone(active?.categories || []), subcategories: clone(active?.subcategories || []),
          issues: clone(active?.issues || control.issues),
          creatorId: actor.id, creatorName: actor.name, createdAt: time, updatedAt: time,
          revision: 1, history: [actorRecord(actor, 'begin')],
        };
        control.versions.push(version);
      } else return reply({ revision: state.revision, control, unchanged: true });
    } else if (action === 'save' || action === 'submit' || action === 'workbookImport') {
      if (!version || version.status !== 'draft') return reply({ error: '目前沒有可編輯的草稿' }, 409);
      if (body.versionId !== version.id || body.versionRevision !== version.revision)
        return reply({ error: '草稿已更新；請重新載入後核對', revision: state.revision }, 409);
      if (action === 'workbookImport') {
        if (!(await can(request, state, 'master.import'))) return reply({ error: '沒有匯入權限' }, 403);
        const payload = body.snapshot as { equipment?: Equipment[]; groups?: EquipmentGroup[] } | null;
        if (!payload || !Array.isArray(payload.equipment) || !Array.isArray(payload.groups)) return reply({ error: '匯入格式錯誤' }, 422);
        const existing = new Set(version.equipment.map(item => item.id));
        const groupIds = new Set(payload.groups.map(group => group.id));
        reserveMarks(control, control.versions.flatMap(item => item.equipment));
        for (const item of payload.equipment) {
          if (existing.has(item.id)) continue;
          if (!/^[a-f0-9-]{36}$/i.test(item.id || '') || !/^[A-Z0-9-]{2,40}$/i.test(String(item.assetCode || '')) ||
              !groupIds.has(item.groupId) || !['個','支','台','組'].includes(String(item.unit)) ||
              !String(item.name || '').trim() || item.quantity !== 1 || item.sourceRow || item.effectiveAt || item.photoSource ||
              item.nameZh || item.nameVi || item.calibrationChannels || !['none','internal','external'].includes(String(item.calibrationMethod || 'none')))
            return reply({ error: `匯入新增檢具 ${item.id || item.assetCode || '?'} 缺少穩定 ID、名稱、群組或單位` }, 422);
          item.pieceMark = nextPieceMark(control, item.assetCode);
          version.equipment.push({ ...item, pieceMark: item.pieceMark, enabled: !!item.enabled, confirmed: false,
            calibrationMethod: String(item.calibrationMethod || 'none'), calibratedAt: String(item.calibratedAt || ''), expiresAt: String(item.expiresAt || '') });
          existing.add(item.id);
        }
      }
      let snapshot: ReturnType<typeof checkedSnapshot>;
      try { snapshot = checkedSnapshot(version, body.snapshot); }
      catch (error) { return reply({ error: error instanceof Error ? error.message : '草稿驗證失敗' }, 422); }
      const effects=restoreEffects({equipment:version.equipment,groups:version.groups,categories:version.categories,subcategories:version.subcategories},snapshot);
      for(const op of ['create','delete'] as const)if(effects[op]&&!await can(request,state,'equipment.'+op))return reply({error:'FORBIDDEN'},403);
      const previousPhotos = new Map(version.equipment.map(item => [item.id, item.photoId]));
      for (const item of snapshot.equipment) if (item.photoId && (action === 'workbookImport' || item.photoId !== previousPhotos.get(item.id)) &&
          !(await env.STATE_ARCHIVE.head(`routine-equipment/photos/${item.photoId}`)))
        return reply({ error: `${item.assetCode}/${item.pieceMark} 照片尚未保存，草稿沒有寫入` }, 422);
      if (action === 'workbookImport') for (const item of snapshot.equipment) {
        const previous = version.equipment.find(record => record.id === item.id);
        const mutable = ['name','unit','spec','owner','enabled','calibrationMethod','calibrationCycle','customCycle','calibratedAt','expiresAt','notes','photoId','photoHidden','groupId'];
        if (previous?.confirmed && mutable.some(field => item[field] !== previous[field]))
          return reply({ error: `${item.assetCode}/${item.pieceMark} 已核對資料有差異；匯入不可覆蓋` }, 409);
      }
      version.equipment = snapshot.equipment;
      version.groups = snapshot.groups;
      version.categories = snapshot.categories;
      version.subcategories = snapshot.subcategories;
      reserveMarks(control, snapshot.equipment);
      version.issues = snapshot.issues.map((issue, index) => {
        const prior = version!.issues?.[index];
        if (issue.status === prior?.status && issue.resolution === prior?.resolution) return issue;
        return { ...issue, resolvedBy: actor.name, resolvedById: actor.id, resolvedAt: time };
      });
      if (action === 'submit') {
        const problems = submitProblems(version, active).filter(problem=>problem.blocking);
        if (problems.length) return reply({ error: '送審檢查未通過', errors: problems.map(problem => problem.message), problems }, 422);
        version.status = 'pending';
        version.submittedBy = actor.name;
        version.submittedAt = time;
      }
      version.history.push(actorRecord(actor, action));
    } else if (action === 'create') {
      if (!version || version.status !== 'draft') return reply({ error: '請先開始修改' }, 409);
      const code = String(body.assetCode || '').trim().toUpperCase();
      if (!/^[A-Z0-9-]{2,40}$/.test(code)) return reply({ error: '固定資產編號格式錯誤' }, 400);
      const group = version.groups.find(item => item.id === body.groupId);
      if (!group) return reply({ error: '請先選擇規格群組，再新增檢具' }, 422);
      const unit = String(body.unit || '').trim();
      if (!['個','支','台','組'].includes(unit)) return reply({ error: '新增檢具須選擇單位' }, 422);
      reserveMarks(control, control.versions.flatMap(item => item.equipment));
      const mark = nextPieceMark(control, code);
      version.equipment.push({ id: crypto.randomUUID(), assetCode: code, pieceMark: mark,
        categoryCode: group.categoryCode || '', category: group.category || '', subcategory: group.subcategory || '',
        categoryId: group.categoryId || '', subcategoryId: group.subcategoryId || '', groupId: group.id, name: '',
        quantity: 1, unit, spec: '', owner: '', sourceStatus: '', enabled: true,
        calibrationMethod: 'none', calibrationCycle: '', calibratedAt: '',
        expiresAt: '', notes: '', intakeDate: '', confirmed: false, photoId: '' });
      version.history.push(actorRecord(actor, 'create', `${code}/${mark}`));
    } else if (action === 'delete') {
      if (!version || version.status !== 'draft') return reply({ error: '請先開始修改' }, 409);
      const item = version.equipment.find(record => record.id === body.id);
      if (!item || item.sourceRow || item.effectiveAt || active?.equipment.some(record => record.id === item.id))
        return reply({ error: '只有本次新增且未生效的設備可以刪除；其他設備請停用' }, 403);
      version.equipment = version.equipment.filter(record => record.id !== item.id);
      version.history.push(actorRecord(actor, 'delete', `${item.assetCode}/${item.pieceMark}`));
    } else if (action === 'withdraw') {
      if (!version || version.status !== 'pending') return reply({ error: '案件不在待審狀態' }, 409);
      if (actor.id !== version.creatorId && actor.role !== 'admin') return reply({ error: '只能撤回自己的送審' }, 403);
      version.status = 'draft';
      version.history.push(actorRecord(actor, 'withdraw'));
    } else if (action === 'approve' || action === 'reject') {
      if (!version || version.status !== 'pending' || body.versionId !== version.id)
        return reply({ error: '案件已不在待審狀態' }, 409);
      if (body.versionRevision !== version.revision) return reply({ error: '審核畫面已過期' }, 409);
      const comment = String(body.comment || '').trim();
      if (action === 'approve') {
        if (active) active.status = 'superseded';
        version.status = 'approved';
        version.equipment.forEach(item => item.effectiveAt ||= time);
        control.activeVersionId = version.id;
      } else version.status = 'draft';
      version.reviewedBy = actor.name;
      version.reviewedAt = time;
      version.reviewComment = comment;
      version.history.push(actorRecord(actor, action, comment));
    }
    if (version) { version.updatedAt = time; version.revision += 1; }
    const values = { ...state.values, [KEY]: JSON.stringify(control) };
    const result = await env.DB.prepare('UPDATE shared_state SET revision=? ,"values"=? ,updated_at=? WHERE id=1 AND revision=?')
      .bind(state.revision + 1, await encodeValues(values,state), time, state.revision).run();
    if (result.meta.changes !== 1) return reply({ error: '修訂衝突；沒有儲存', revision: (await readState()).revision }, 409);
    return reply({ revision: state.revision + 1, control });
  } catch (error) {
    console.error('[routine-equipment] write failed', error);
    return reply({ error: error instanceof Error ? error.message : '檢具寫入失敗；沒有顯示成功' }, 500);
  }
}
