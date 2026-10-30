import {restoreEffects} from '@/lib/draft-restore-access';
import { env } from 'cloudflare:workers';
import { readState, identity, can, sameOrigin, encodeValues, parse, maintenanceCredential, responseHeaders as headers } from '@/lib/process-state';
import {readIqcImportSource} from '@/lib/iqc-import-source';
import { parseIqcWorkflow } from '@/lib/iqc-workflow';
import { visibleSharedControl } from '@/lib/versioned-shared-workflow';
import {recordJSONResponse} from '@/lib/state-records-response';
import { emptyIqcControl, emptyIqcSnapshot, activeIqcVersion, openIqcVersion,
  checkedIqcSnapshot, iqcSubmitBlockingErrors, nextIqcErrorCode, nextIqcCheckNo,
  type IqcControl, type IqcSnapshot, type IqcVersion } from '@/lib/iqc';

const KEY = 'iqcMasterControl';
const SOURCE_SHA = '48c84341d537c3030610ab8e0dab589c5a02e02c228b11e69c4bd27b68640136';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const event = (actor: { id: string; name: string }, action: string, comment = '') =>
  ({ actorId: actor.id, actorName: actor.name, action, at: new Date().toISOString(), ...(comment ? { comment } : {}) });

function controlFrom(raw: string | undefined): IqcControl {
  if (raw === undefined) return emptyIqcControl();
  const value = parse(raw, null);
  if (value?.schemaVersion !== 1 || !Array.isArray(value.versions) || !Array.isArray(value.issues) ||
      !Array.isArray(value.reservedErrorCodes) || !Array.isArray(value.reservedCheckNos) ||
      !value.versions.every((version: IqcVersion) => version?.snapshot &&
        ['categories','suppliers','parts','errors','items'].every(key =>
          Array.isArray(version.snapshot[key as keyof IqcSnapshot]))))
    throw Error('IQC 資料已存在但格式無法讀取；已停止寫入');
  return value;
}

type Source = { sha256?: string; mappingSha256?: string; fileName?: string;
  snapshot?: IqcSnapshot; issues?: IqcControl['issues'] };
type Body = { action?: string; baseRevision?: number; versionId?: string; versionRevision?: number;
  snapshot?: unknown; source?: Source; partCode?: string; errorId?: string;
  nameVi?: string; toolVi?: string; methodVi?: string; rules?: unknown; comment?: string;
  inspectionSpecVi?: string; inspectionMode?: string; equipmentId?: string;
  mediaItems?: unknown; isEnabled?: boolean };

function checkEquipment(snapshot: IqcSnapshot, previous: IqcSnapshot, values: Record<string, string>) {
  const routine = parse(values.routineEquipmentControl, null) as
    { activeVersionId?: string; versions?: { id: string; status: string; equipment?: {
      id: string; enabled?: boolean; assetCode?: string; pieceMark?: string; name?: string; nameVi?: string; spec?: string; photoId?: string
    }[] }[] } | null;
  const effective = routine?.versions?.find(version => version.id === routine.activeVersionId && version.status === 'approved');
  const equipment = new Map((effective?.equipment || []).map(item => [item.id, item]));
  const old = new Map(previous.items.map(item => [item.id, item]));
  for (const item of snapshot.items) {
    if (!item.equipmentId) { item.equipmentSnapshot = null; continue; }
    const previousItem = old.get(item.id);
    if (previousItem?.equipmentId === item.equipmentId) {
      // Never trust a client-supplied snapshot for an unchanged association.
      item.equipmentSnapshot = previousItem.equipmentSnapshot || null;
      continue;
    }
    const selected = equipment.get(item.equipmentId);
    if (!selected || selected.enabled === false) throw Error(`${item.checkNo} 的檢具不是目前生效且啟用的設備`);
    item.equipmentSnapshot = { id: selected.id, assetCode: selected.assetCode || '',
      pieceMark: selected.pieceMark || '', name: selected.name || selected.nameVi || '', spec: selected.spec || '',
      ...(selected.photoId ? { photoId: selected.photoId } : {}) };
  }
}

export async function GET(request: Request) {
  try {
    const caseMetadata=new URL(request.url).searchParams.get('caseMetadata')==='1';
    const state = await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode',KEY],modelKey:KEY,deferHistory:true,deferDependencyHistory:true});
    const actor = await identity(request, state);
    if (!actor || !(await can(request, state, 'iqc.view')))
      return reply({ error: '沒有查看 IQC 資料的權限' }, 403);
    const body={ revision: state.revision, control: visibleSharedControl(parseIqcWorkflow(state.values[KEY],state.recordStorage?.models.get(KEY)),await can(request,state,'approval.compare'),caseMetadata) };
    return state.recordStorage&&!caseMetadata?recordJSONResponse(body,env.STATE_ARCHIVE,headers):reply(body);
  } catch (error) {
    console.error('[iqc] load failed', error);
    return reply({ error: 'IQC 資料載入失敗；沒有建立空資料或覆蓋原資料' }, 503);
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
    const body = await request.json() as Body;
    if (!Number.isInteger(body?.baseRevision) || body.baseRevision !== state.revision)
      return reply({ error: '資料已由其他分頁更新，請重新載入後核對', revision: state.revision }, 409);
    const action = String(body.action || '');
    if(action==='import'&&!await maintenanceCredential(request))return reply({error:'NON_BOM_IMPORT_MAINTENANCE_ONLY'},403);
    const required:Record<string,string[]>={import:['edit','exchange'],begin:['edit'],save:['edit','save'],submit:['edit','save','submit'],createError:['edit','create'],createItem:['edit','create'],withdraw:['withdraw'],approve:['approve'],reject:['return']};
    if(!required[action])return reply({error:'不支援的操作'},400);
    if(!await can(request,state,'iqc.view')||!(await Promise.all(required[action].map(op=>can(request,state,'iqc.'+op)))).every(Boolean))return reply({error:'FORBIDDEN'},403);

    const prepared=state.recordStorage?.models.get(KEY) as {workflow?:unknown}|undefined;
    if(prepared?.workflow||parse(state.values[KEY],{}).workflow)return reply({error:'WORKFLOW_V3_REQUIRED'},409);
    if(state.recordStorage){state=await readState();if(state.revision!==body.baseRevision)return reply({error:'資料已更新，請重新核對'},409);}
    const control = clone(controlFrom(state.values[KEY]));
    if ('workflow' in control) return reply({error:'WORKFLOW_V3_REQUIRED'},409);
    const time = new Date().toISOString();
    let version = openIqcVersion(control);
    const active = activeIqcVersion(control);
    const who = { id: actor.id, name: actor.name };
    if (action === 'import') {
      let sourceManifest;
      try{sourceManifest=await readIqcImportSource(env.STATE_ARCHIVE,{key:env.PROCESS_IQC_IMPORT_SOURCE_KEY,sha256:env.PROCESS_IQC_IMPORT_SOURCE_SHA256});}
      catch{return reply({error:'IQC 已核對來源尚未在私人儲存設定或無法驗證；沒有匯入',code:'IQC_IMPORT_SOURCE_UNAVAILABLE'},503);}
      const source = body.source;
      if (!sourceManifest.ready || source?.sha256 !== SOURCE_SHA ||
          source.mappingSha256 !== sourceManifest.mappingSha256 ||
          !Array.isArray(source.issues) || !source.snapshot)
        return reply({ error: 'IQC 來源或類別對照版本不完整；沒有匯入' }, 400);
      if (control.source?.sha256 === SOURCE_SHA && control.source.mappingSha256 === source.mappingSha256)
        return reply({ revision: state.revision, control, unchanged: true });
      if (control.source || version || active) return reply({ error: '已存在 IQC 資料；不自動覆蓋已核對修改' }, 409);
      const snapshot = checkedIqcSnapshot(emptyIqcSnapshot(), source.snapshot);
      const expectedParts = new Map(sourceManifest.snapshot.parts.map(part => [part.code, part]));
      if (snapshot.parts.some(part => {
        const expected = expectedParts.get(part.code);
        return !expected || part.nameVi !== expected.nameVi || part.categoryId !== expected.categoryId ||
          part.supplierRaw !== expected.supplierRaw ||
          JSON.stringify(part.supplierIds) !== JSON.stringify(expected.supplierIds) ||
          JSON.stringify(part.photos.map(photo => [photo.id, photo.sourceRow, photo.sourceColumn])) !==
            JSON.stringify(expected.photos.map(photo => [photo.id, photo.sourceRow, photo.sourceColumn]));
      }) || JSON.stringify(snapshot.categories) !== JSON.stringify(sourceManifest.snapshot.categories) ||
          JSON.stringify(snapshot.errors) !== JSON.stringify(sourceManifest.snapshot.errors) ||
          JSON.stringify(snapshot.items) !== JSON.stringify(sourceManifest.snapshot.items))
        return reply({ error: 'IQC 匯入內容與核對過的來源清單不符' }, 422);
      const unresolvedCategories = new Set(source.issues
        .filter(issue => ['CATEGORY_MAPPING_MISSING_PART', 'CATEGORY_NAME_MISMATCH', 'CATEGORY_UNKNOWN'].includes(issue.type))
        .map(issue => issue.partCode));
      if (snapshot.parts.length !== 187 || snapshot.errors.length !== 538 || snapshot.items.length !== 538 ||
          snapshot.parts.some(part => !part.categoryId && !unresolvedCategories.has(part.code)) ||
          !snapshot.parts.some(part => !!part.categoryId) || snapshot.categories.length !== 8)
        return reply({ error: 'IQC 匯入筆數或八類對照不符' }, 422);
      for (const part of snapshot.parts) {
        if (part.photos.some(photo => photo.sourceColumn !== 4 || !photo.sourceRow ||
            photo.src !== `/api/iqc/photo?id=${photo.id}` || !/^[a-f0-9]{64}$/.test(photo.id)))
          return reply({ error: `${part.code} 圖片來源關聯不符` }, 422);
        for (const photo of part.photos)
          if (!(await env.STATE_ARCHIVE.head(`iqc/photos/${photo.id}`)))
            return reply({ error: `${part.code} 來源照片尚未保存` }, 422);
      }
      version = { id: crypto.randomUUID(), number: 1, status: 'draft', snapshot, baseVersionId: null,
        creatorId: actor.id, creatorName: actor.name, createdAt: time, updatedAt: time,
        revision: 1, history: [event(who, 'import', 'Excel 與類別對照匯入待確認草稿；尚未生效')] };
      control.versions.push(version);
      control.source = { fileName: String(source.fileName || ''), sha256: SOURCE_SHA,
        mappingSha256: String(source.mappingSha256) };
      control.issues = source.issues;
      control.reservedErrorCodes = snapshot.errors.map(item => item.code);
      control.reservedCheckNos = snapshot.items.map(item => item.checkNo);
    } else if (action === 'begin') {
      if (version?.status === 'pending') return reply({ error: 'IQC 案件送審中，不能修改' }, 409);
      if (version) return reply({ revision: state.revision, control, unchanged: true });
      version = { id: crypto.randomUUID(), number: Math.max(0, ...control.versions.map(item => item.number)) + 1,
        status: 'draft', snapshot: clone(active?.snapshot || emptyIqcSnapshot()),
        baseVersionId: active?.id || null, creatorId: actor.id, creatorName: actor.name,
        createdAt: time, updatedAt: time, revision: 1, history: [event(who, 'begin')] };
      control.versions.push(version);
    } else if (action === 'save' || action === 'submit') {
      if (!version || version.status !== 'draft') return reply({ error: '目前沒有可編輯的 IQC 草稿' }, 409);
      if (body.versionId !== version.id || body.versionRevision !== version.revision)
        return reply({ error: 'IQC 草稿已更新；請重新載入後核對' }, 409);
      let snapshot: IqcSnapshot;
      try { snapshot = checkedIqcSnapshot(version.snapshot, body.snapshot); checkEquipment(snapshot, version.snapshot, state.values); }
      catch (error) { return reply({ error: error instanceof Error ? error.message : 'IQC 草稿驗證失敗' }, 422); }
      const effects=restoreEffects(version.snapshot,snapshot);
      for(const op of ['create','delete'] as const)if(effects[op]&&!await can(request,state,'iqc.'+op))return reply({error:'FORBIDDEN'},403);
      const priorErrorIds = new Set(version.snapshot.errors.map(item => item.id));
      const priorItemIds = new Set(version.snapshot.items.map(item => item.id));
      if (snapshot.errors.some(item => !priorErrorIds.has(item.id)) || snapshot.items.some(item => !priorItemIds.has(item.id)))
        return reply({ error: '新增編號須由伺服器分配' }, 422);
      const oldPhotos = new Set([
        ...version.snapshot.parts.flatMap(item => item.photos.map(photo => photo.id)),
        ...version.snapshot.items.flatMap(item => (item.mediaItems || []).map(photo => photo.id)),
      ]);
      for (const photo of [
        ...snapshot.parts.flatMap(item => item.photos),
        ...snapshot.items.flatMap(item => item.mediaItems || []),
      ])
        if (!oldPhotos.has(photo.id) && !(await env.STATE_ARCHIVE.head(`iqc/photos/${photo.id}`)))
          return reply({ error: '新照片尚未保存，草稿沒有寫入' }, 422);
      if (action === 'submit') {
        if (version.baseVersionId !== (active?.id || null)) return reply({ error: '生效版本已更新' }, 409);
        const problems = iqcSubmitBlockingErrors(snapshot);
        if (problems.length) return reply({ error: 'IQC 送審檢查未通過', problems }, 422);
        version.status = 'pending'; version.submittedBy = actor.name; version.submittedAt = time;
      }
      version.snapshot = snapshot;
      version.history.push(event(who, action));
    } else if (action === 'createError' || action === 'createItem') {
      if (!version || version.status !== 'draft' || body.versionId !== version.id ||
          body.versionRevision !== version.revision) return reply({ error: '請先載入最新 IQC 草稿' }, 409);
      const nameVi = String(body.nameVi || '').trim();
      if (!nameVi) return reply({ error: '越文名稱不可空白' }, 422);
      if (action === 'createError') {
        const part = version.snapshot.parts.find(item => item.code === body.partCode && !item.isDeleted);
        if (!part) return reply({ error: '找不到零件' }, 422);
        const code = nextIqcErrorCode(control, part.code);
        version.snapshot.errors.push({ id: crypto.randomUUID(), partCode: part.code, code, nameVi });
        control.reservedErrorCodes.push(code);
      } else {
        const error = version.snapshot.errors.find(item => item.id === body.errorId && !item.isDeleted);
        if (!error) return reply({ error: '找不到錯誤代碼' }, 422);
        const checkNo = nextIqcCheckNo(control, error.code);
        const rules = Array.isArray(body.rules) ? body.rules : [];
        const candidate = { id: crypto.randomUUID(), partCode: error.partCode, errorId: error.id,
          checkNo, nameVi, toolVi: String(body.toolVi || ''), methodVi: String(body.methodVi || ''),
          frequencyRaw: '', rules, isEnabled: body.isEnabled !== false,
          inspectionSpecVi: String(body.inspectionSpecVi || ''),
          inspectionMode: body.inspectionMode === 'equipment' ? 'equipment' as const : 'visual' as const,
          equipmentId: String(body.equipmentId || ''),
          equipmentSnapshot: body.equipmentId ? { id: String(body.equipmentId), assetCode: '', pieceMark: '', name: '', spec: '' } : null,
          mediaItems: Array.isArray(body.mediaItems) ? body.mediaItems : [] };
        let checked: IqcSnapshot;
        try {
          checked = checkedIqcSnapshot(version.snapshot, { ...version.snapshot, items: [...version.snapshot.items, candidate] });
          checkEquipment(checked, version.snapshot, state.values);
          for (const photo of candidate.mediaItems as { id: string }[])
            if (!(await env.STATE_ARCHIVE.head(`iqc/photos/${photo.id}`))) throw Error('新照片尚未保存');
        }
        catch (error) { return reply({ error: error instanceof Error ? error.message : '檢查項目格式錯誤' }, 422); }
        const created = checked.items[checked.items.length - 1];
        const problems = iqcSubmitBlockingErrors({ ...version.snapshot, items: [created] });
        if (problems.length) return reply({ error: problems[0] }, 422);
        version.snapshot.items.push(created);
        control.reservedCheckNos.push(checkNo);
      }
      version.history.push(event(who, action));
    } else if (action === 'withdraw') {
      if (!version || version.status !== 'pending') return reply({ error: 'IQC 案件不是待審狀態' }, 409);
      if (actor.id !== version.creatorId && actor.role !== 'admin') return reply({ error: '只能撤回自己的案件' }, 403);
      version.status = 'draft'; version.history.push(event(who, 'withdraw'));
    } else if (action === 'approve' || action === 'reject') {
      if (!version || version.status !== 'pending' || body.versionId !== version.id ||
          body.versionRevision !== version.revision) return reply({ error: '審核畫面已過期' }, 409);
      const comment = String(body.comment || '').trim();
      if (action === 'approve') {
        if (active) active.status = 'superseded';
        version.status = 'approved'; control.activeVersionId = version.id;
      } else version.status = 'draft';
      version.reviewedBy = actor.name; version.reviewedAt = time; version.reviewComment = comment;
      version.history.push(event(who, action, comment));
    }
    if (version) { version.updatedAt = time; version.revision += 1; }
    const values = { ...state.values, [KEY]: JSON.stringify(control) };
    const result = await env.DB.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?')
      .bind(state.revision + 1, await encodeValues(values,state), time, state.revision).run();
    if (result.meta.changes !== 1) return reply({ error: '修訂衝突；沒有儲存', revision: (await readState()).revision }, 409);
    return reply({ revision: state.revision + 1, control });
  } catch (error) {
    console.error('[iqc] write failed', error);
    return reply({ error: error instanceof Error ? error.message : 'IQC 寫入失敗；沒有顯示成功' }, 500);
  }
}
