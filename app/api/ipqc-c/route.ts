import {restoreEffects} from '@/lib/draft-restore-access';
import { env } from 'cloudflare:workers';
import { readState, identity, can, sameOrigin, encodeValues, parse, maintenanceCredential, responseHeaders as headers } from '@/lib/process-state';
import { activeIpqc, checkedIpqcRule, checkedIpqcSnapshot, copyIpqc, nextErrorCode, nextItemCode,
  openIpqc, parseIpqcControl, submitIpqcErrors,submitIpqcIssues, type IpqcError,
  type IpqcItem, type IpqcSnapshot } from '@/lib/ipqc-c';
import { hierarchy, equipmentGroupLabel, type EquipmentVersion } from '@/lib/routine-equipment';
import { publicIpqcWorkflow } from '@/lib/ipqc-c-workflow';
import {recordJSONResponse} from '@/lib/state-records-response';

const KEY = 'ipqcCMasterControl';
// Hosted GET only: local historicalCodes and every write retain full-state reads.
const readKeys = ['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode',KEY,'masterDataControl','routineEquipmentControl'];
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const record = (actor: { id: string; name: string }, action: string, comment = '') =>
  ({ action, actorId: actor.id, actorName: actor.name, at: new Date().toISOString(), ...(comment ? { comment } : {}) });
const localHost = (request: Request) => ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname);
type MasterProduct = { code: string; name?: string; category?: string; stages?: string[] };
type MasterStage = { code: string; name?: string };
type MasterLine = { stages?: MasterStage[] };
type MasterC = { products?: MasterProduct[]; lines?: MasterLine[] };
type EquipmentControl = { activeVersionId?: string; versions?: EquipmentVersion[] };
function checkEquipment(snapshot: IpqcSnapshot, previous: IpqcSnapshot, values: Record<string, string>) {
  const catalog = parse(values.routineEquipmentControl, null) as EquipmentControl | null;
  const effective = catalog?.versions?.find(row => row.id === catalog.activeVersionId && row.status === 'approved');
  const choices = new Map((effective?.equipment || []).map(row => [row.id, row]));
  const old = new Map(previous.items.map(row => [row.id, row]));
  for (const item of snapshot.items) {
    if (!item.equipmentId) { item.equipmentSnapshot = null; continue; }
    const prior = old.get(item.id);
    if (prior?.equipmentId === item.equipmentId) {
      item.equipmentSnapshot = prior.equipmentSnapshot || null;
      continue;
    }
    const selected = choices.get(item.equipmentId);
    if (!selected || selected.enabled === false) throw Error(`${item.code} 的檢具不是目前生效且啟用的設備`);
    item.equipmentSnapshot = { id: selected.id, assetCode: selected.assetCode || '',
      pieceMark: selected.pieceMark || '', name: selected.name || selected.nameVi || '',
      spec: typeof selected.spec === 'string' ? selected.spec : '', ...(selected.photoId ? { photoId: selected.photoId } : {}) };
  }
}
const master = (values: Record<string, string>) =>
  (parse(values.masterDataControl, null) as { active?: { C?: MasterC } } | null)?.active?.C;
const catalog = (values: Record<string, string>) => {
  const c = master(values);
  return {
    products: (c?.products || []).map(p => ({ code: String(p.code), name: String(p.name || ''),
      category: String(p.category || ''), stages: Array.isArray(p.stages) ? p.stages : [] })),
    stages: (c?.lines || []).flatMap(l => l.stages || []).map(s => ({ code: s.code, name: s.name })),
  };
};
const historicCodes = (values: Record<string, string>) => {
  const found = new Set<string>();
  for (const [key, raw] of Object.entries(values)) {
    if (key === KEY || key === 'platformUsers') continue;
    for (const match of raw.matchAll(/C-[A-Z0-9]+-[A-Z0-9-]+-L\d+(?:-\d+)?/g)) found.add(match[0]);
  }
  return [...found];
};
const clean = (value: unknown) => typeof value === 'string' ? value : '';

export async function GET(request: Request) {
  try {
    const caseMetadata=new URL(request.url).searchParams.get('caseMetadata')==='1';
    const state = await readState({modelKey:KEY,deferHistory:true,deferDependencyHistory:true,...(!localHost(request)?{keys:readKeys}:{})});
    const actor = await identity(request, state);
    if (!actor || !(await can(request, state, 'ipqc-c.view')))
      return reply({ error: '沒有查看 IPQC-C 的權限' }, 403);
    const equipment = parse(state.values.routineEquipmentControl, null) as EquipmentControl | null;
    const effective = equipment?.versions?.find(v => v.id === equipment.activeVersionId && v.status === 'approved');
    const tree = effective ? hierarchy(effective) : { categories:[], subcategories:[], groups:[] };
    const groups = tree.groups.map(g => ({ ...g, name: equipmentGroupLabel(g.name || g.nameVi || g.nameZh || g.id) }));
    const equipmentChoices = (effective?.equipment || []).map(item => ({ id:item.id,
      assetCode:item.assetCode || '',pieceMark:item.pieceMark || '',name:item.name || item.nameVi || '',
      photoId:item.photoId || '',groupId:item.groupId || '',spec:typeof item.spec === 'string' ? item.spec : '',
      categoryId:groups.find(g => g.id === item.groupId)?.categoryId || '',
      subcategoryId:groups.find(g => g.id === item.groupId)?.subcategoryId || '',
      available:item.enabled !== false }));
    const body={ revision: state.revision, control: publicIpqcWorkflow(parseIpqcControl(state.values[KEY],state.recordStorage?.models.get(KEY)),await can(request,state,'approval.compare'),caseMetadata),
      catalog: catalog(state.values), equipmentGroups: groups, equipment:equipmentChoices,
      equipmentCategories:tree.categories, equipmentSubcategories:tree.subcategories,
      ...(localHost(request) && actor.role === 'admin' ? { historicalCodes: historicCodes(state.values) } : {}) };
    return state.recordStorage&&!caseMetadata?recordJSONResponse(body,env.STATE_ARCHIVE,headers):reply(body);
  } catch (error) {
    console.error('[ipqc-c] load failed', error);
    return reply({ error: 'IPQC-C 載入失敗；沒有以空資料覆蓋既有資料' }, 503);
  }
}
type Body = {
  action?: string; baseRevision?: number; versionId?: string; versionRevision?: number;
  snapshot?: IpqcSnapshot; id?: string; errorId?: string; productCode?: string; stageCode?: string;
  name?: string; note?: string; reason?: string; comment?: string; cascade?: boolean;
  item?: Partial<IpqcItem>; source?: { fileName?: string; sha256?: string; rows?: number; records?: Array<{ error: IpqcError; item: IpqcItem }> };
};

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: '來源不允許' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 5_000_000) return reply({ error: '資料量超過單次限制' }, 413);
  try {
    let state = await readState({modelKey:KEY,deferHistory:true,deferDependencyHistory:true});
    const actor = await identity(request, state);
    if (!actor) return reply({ error: '請先登入' }, 401);
    if (state.values.maintenanceMode === '1') return reply({ error: '系統還原中，暫停編輯' }, 503);
    const body = await request.json() as Body;
    if (!body || !Number.isInteger(body.baseRevision) || body.baseRevision !== state.revision)
      return reply({ error: '共用資料已更新，請重新載入並核對差異', revision: state.revision }, 409);
    const action = String(body.action || '');
    const seed = action === 'seed';
    if(seed&&!await maintenanceCredential(request))return reply({error:'NON_BOM_IMPORT_MAINTENANCE_ONLY'},403);
    const edit = ['begin','save','submit','create-error','create-item','delete-error','delete-item','withdraw'].includes(action);
    const review = ['approve','reject'].includes(action);
    if (seed) {
      if (!localHost(request) || actor.role !== 'admin' || !(await can(request, state, 'master.import')))
        return reply({ error: '首次建置僅允許 Local ADMIN' }, 403);
    } else if (edit) {
      const data=await can(request,state,'ipqc-c.view');
      // Legacy Save/Submit replace body.snapshot, unlike V3's separate working,
      // saved and fixed case commands. Require every operation they perform.
      const required=action==='save'?['edit','save']:action==='submit'?['edit','save','submit']:action.startsWith('create')?['edit','create']:['edit'];
      const allowed=action==='withdraw'
        ? data&&await can(request,state,'ipqc-c.withdraw')
        : data&&(await Promise.all(required.map(op=>can(request,state,'ipqc-c.'+op)))).every(Boolean);
      if (!allowed)
        return reply({ error: '沒有 IPQC-C 編輯權限' }, 403);
      if (action.startsWith('delete') && !(await can(request, state, 'master.delete')))
        return reply({ error: '沒有刪除權限' }, 403);
    } else if (review) {
      if (!(await can(request, state, 'ipqc-c.view')) ||
          !(await can(request, state, action === 'approve' ? 'approval.approve' : 'approval.reject')))
        return reply({ error: '沒有審核權限' }, 403);
    } else return reply({ error: '不支援的操作' }, 400);

    // The legacy submit body also replaces content; it cannot attest a fixed Save.
    if(action==='submit')return reply({error:'WORKFLOW_V3_REQUIRED',code:'WORKFLOW_V3_REQUIRED',details:{reason:'LEGACY_SUBMIT_CANNOT_VERIFY_SAVED_VERSION'}},409);
    const prepared=state.recordStorage?.models.get(KEY) as {workflow?:unknown}|undefined;
    if(prepared?.workflow||parse(state.values[KEY],{}).workflow)return reply({error:'WORKFLOW_V3_REQUIRED',code:'WORKFLOW_V3_REQUIRED'},409);
    if(state.recordStorage){state=await readState();if(state.revision!==body.baseRevision)return reply({error:'資料已更新，請重新核對'},409);}
    const control = copyIpqc(parseIpqcControl(state.values[KEY]));
    if ('workflow' in control)
      return reply({ error: '此範圍已使用 V3 共用草稿，舊版整份寫入已停止；請保留未同步輸入並使用共用草稿入口', code:'WORKFLOW_V3_REQUIRED' },409);
    const current = openIpqc(control);
    const active = activeIpqc(control);
    const data = catalog(state.values);
    const route = new Map<string, Set<string>>(data.products.map(p => [p.code, new Set<string>(p.stages)]));
    const at = new Date().toISOString();
    let version = current;
    if (seed) {
      const source = body.source;
      if (!source || !/^[a-f0-9]{64}$/.test(source.sha256 || '') || !Array.isArray(source.records) || !source.records.length ||
          !Number.isInteger(source.rows) || source.rows! < source.records.length || !source.fileName)
        return reply({ error: '建置來源格式錯誤' }, 422);
      if (control.source?.sha256 === source.sha256)
        return reply({ revision: state.revision, control, unchanged: true });
      if (control.versions.length || state.values[KEY] !== undefined)
        return reply({ error: '已有 IPQC-C 版本；首次建置不得覆寫' }, 409);
      const historical = new Set(historicCodes(state.values));
      const seenErrors = new Set<string>(), seenItems = new Set<string>(), seenRows = new Set<number>();
      for (const pair of source.records) {
        const e = pair?.error, i = pair?.item;
        if (!e || !i || !Number.isInteger(e.sourceRow) || e.sourceRow! < 2 || e.sourceRow! > source.rows! + 1 ||
            e.sourceRow !== i.sourceRow || seenRows.has(e.sourceRow!) ||
            !e.code || !i.code || i.code !== `${e.code}-${i.code.slice(e.code.length + 1)}` ||
            !i.code.startsWith(`${e.code}-`) || e.productCode !== i.productCode ||
            e.stageCode !== i.stageCode || e.id !== `ipqc-c-error-row-${e.sourceRow}` ||
            i.id !== `ipqc-c-item-row-${i.sourceRow}` || i.errorId !== e.id ||
            !route.get(e.productCode)?.has(e.stageCode) || seenErrors.has(e.code) || seenItems.has(i.code) ||
            historical.has(e.code) || historical.has(i.code) ||
            typeof e.name !== 'string' || typeof i.standard !== 'string' ||
            typeof i.cpkEnabled !== 'boolean' || typeof i.standardEnabled !== 'boolean' ||
            !Array.isArray(i.mediaItems) || i.mediaItems.length)
          return reply({ error: `來源第 ${e?.sourceRow || '?'} 列無效或與現行資料衝突` }, 422);
        seenRows.add(e.sourceRow!); seenErrors.add(e.code); seenItems.add(i.code);
      }
      version = {
        id: crypto.randomUUID(), number: 1, status: 'approved', origin: 'initial-build',
        snapshot: { errors: source.records.map(pair => ({ ...pair.error, deleted: false })),
          items: source.records.map(pair => ({ ...pair.item, deleted: false, notApplicable: false })) },
        baseVersionId: null, revision: 1, creatorId: actor.id, creatorName: actor.name,
        createdAt: at, updatedAt: at,
        history: [record(actor, 'initial-build', `Local source SHA-256 ${source.sha256}; ${source.records.length}/${source.rows} rows; no supervisor approval event`) ],
      };
      control.versions.push(version); control.activeVersionId = version.id;
      control.source = { fileName: source.fileName, sha256: source.sha256!, rows: source.rows!,
        imported: source.records.length, builtAt: at, environment: 'local' };
      control.reservedErrorCodes = [...seenErrors]; control.reservedItemCodes = [...seenItems];
    } else if (action === 'begin') {
      if (version?.status === 'pending') return reply({ error: '送審中，不能修改' }, 409);
      if (version) return reply({ revision: state.revision, control, unchanged: true });
      version = { id: crypto.randomUUID(), number: (active?.number || 0) + 1, status: 'draft',
        snapshot: copyIpqc(active?.snapshot || { errors: [], items: [] }), baseVersionId: active?.id || null,
        revision: 1, creatorId: actor.id, creatorName: actor.name, createdAt: at, updatedAt: at,
        history: [record(actor, 'begin')] };
      control.versions.push(version);
    } else {
      if (!version || body.versionId !== version.id || body.versionRevision !== version.revision)
        return reply({ error: '版本已由其他畫面更新，請重新載入後核對', revision: state.revision }, 409);
      if (review || action === 'withdraw') {
        if (version.status !== 'pending') return reply({ error: '案件已不在待審狀態' }, 409);
      } else if (version.status !== 'draft') return reply({ error: '目前沒有可編輯草稿' }, 409);
      if (action === 'save' || action === 'submit') {
        let snapshot: IpqcSnapshot;
        try { snapshot = checkedIpqcSnapshot(version, body.snapshot); }
        catch (error) { return reply({ error: error instanceof Error ? error.message : '草稿格式錯誤' }, 422); }
        try { checkEquipment(snapshot, version.snapshot, state.values); }
        catch (error) { return reply({ error: error instanceof Error ? error.message : '檢具關聯無效' }, 422); }
        const effects=restoreEffects(version.snapshot,snapshot);
        for(const op of ['create','delete'] as const)if(effects[op]&&!await can(request,state,'ipqc-c.'+op))return reply({error:'FORBIDDEN'},403);
        const previousPhotos = new Set(version.snapshot.items.flatMap(item => item.mediaItems.map(photo => photo.id)));
        for (const photo of snapshot.items.flatMap(item => item.mediaItems))
          if (!previousPhotos.has(photo.id) && !await env.STATE_ARCHIVE.head(`ipqc-c/photos/${photo.id}`))
            return reply({ error: `圖片 ${photo.id} 尚未保存，草稿沒有寫入` }, 422);
        version.snapshot = snapshot;
        if (action === 'submit') {
          if (version.baseVersionId !== control.activeVersionId)
            return reply({ error: '生效版本已變更，請先核對衝突' }, 409);
          const issues = submitIpqcErrors(version, active, data.products);
          if (issues.length) return reply({ error: '送審驗證未通過', errors: issues }, 422);
          version.contentIssues={policy:'ipqc-completeness-v1',issues:submitIpqcIssues(version,active,data.products).filter(i=>i.kind==='missing')};
          version.status = 'pending'; version.submittedBy = actor.name; version.submittedAt = at;
        }
      } else if (action === 'create-error') {
        const product = clean(body.productCode), stage = clean(body.stageCode);
        if (!route.get(product)?.has(stage) || !clean(body.name).trim())
          return reply({ error: '請選有效的產品、工段並填寫錯誤名稱' }, 422);
        const code = nextErrorCode(control, product, stage);
        version.snapshot.errors.push({ id: crypto.randomUUID(), code, productCode: product, stageCode: stage,
          name: clean(body.name), note: clean(body.note), reason: clean(body.reason), deleted: false });
      } else if (action === 'create-item') {
        const parent = version.snapshot.errors.find(e => e.id === body.errorId && !e.deleted);
        if (!parent) return reply({ error: '請先選擇有效錯誤代碼' }, 422);
        const raw = body.item || {};
        if (typeof raw.standard !== 'string' || typeof raw.description !== 'string' || typeof raw.cpkEnabled !== 'boolean' || typeof raw.standardEnabled !== 'boolean')
          return reply({ error: '檢查項目資料不完整' }, 422);
        const photos = Array.isArray(raw.mediaItems) ? raw.mediaItems : [];
        if (photos.some(photo => !photo || !/^[a-f0-9]{64}$/.test(photo.id) ||
            typeof photo.name !== 'string' || typeof photo.note !== 'string' ||
            (photo.afterParagraph !== undefined && (!Number.isInteger(photo.afterParagraph) || photo.afterParagraph < 0))))
          return reply({ error: '圖片參照格式錯誤' }, 422);
        for (const photo of photos) if (!await env.STATE_ARCHIVE.head(`ipqc-c/photos/${photo.id}`))
          return reply({ error: '圖片尚未保存，項目沒有新增' }, 422);
        let rule;
        try { rule = checkedIpqcRule(raw.rule); }
        catch (error) { return reply({ error: error instanceof Error ? error.message : '檢查規則無效' }, 422); }
        const code = nextItemCode(control, parent.code);
        version.snapshot.items.push({ id: crypto.randomUUID(), code, errorId: parent.id,
          productCode: parent.productCode, stageCode: parent.stageCode,
          standard: raw.standard, cpkEnabled: raw.cpkEnabled, standardEnabled: raw.standardEnabled,
          description: clean(raw.description), tool: clean(raw.tool), method: clean(raw.method),
          frequency: clean(raw.frequency), ...(rule !== undefined ? { rule } : {}),
          note: clean(raw.note), reason: clean(raw.reason),
          notApplicable: raw.notApplicable === true, notApplicableReason: clean(raw.notApplicableReason),
          equipmentGroupId: clean(raw.equipmentGroupId), equipmentId: clean(raw.equipmentId),
          equipmentSnapshot: null, mediaItems: photos, deleted: false });
        try { checkEquipment(version.snapshot, { ...version.snapshot, items: version.snapshot.items.slice(0, -1) }, state.values); }
        catch (error) { return reply({ error: error instanceof Error ? error.message : '檢具關聯無效' }, 422); }
      } else if (action === 'delete-item') {
        const item = version.snapshot.items.find(i => i.id === body.id && !i.deleted);
        if (!item) return reply({ error: '檢查項目不存在' }, 404);
        item.deleted = true;
      } else if (action === 'delete-error') {
        const error = version.snapshot.errors.find(e => e.id === body.id && !e.deleted);
        if (!error) return reply({ error: '錯誤代碼不存在' }, 404);
        const children = version.snapshot.items.filter(i => i.errorId === error.id && !i.deleted);
        if (children.length && body.cascade !== true)
          return reply({ error: `此代碼有 ${children.length} 個檢查項目；需確認整組刪除`, count: children.length }, 422);
        error.deleted = true; children.forEach(i => { i.deleted = true; });
      } else if (action === 'withdraw') {
        if (actor.id !== version.creatorId && actor.role !== 'admin') return reply({ error: '只能撤回自己的送審' }, 403);
        version.status = 'draft';
      } else if (action === 'approve' || action === 'reject') {
        const comment = clean(body.comment).trim();
        if (action === 'approve') {
          const issues=submitIpqcErrors(version,active,data.products);if(issues.length)return reply({error:'核准驗證未通過',errors:issues},422);
          if (active) active.status = 'superseded';
          version.status = 'approved'; control.activeVersionId = version.id;
        } else version.status = 'draft';
        version.reviewedBy = actor.name; version.reviewedAt = at; version.reviewComment = comment;
      }
      version.history.push(record(actor, action, clean(body.comment)));
      version.updatedAt = at; version.revision += 1;
    }
    const values = { ...state.values, [KEY]: JSON.stringify(control) };
    const updated = await env.DB.prepare('UPDATE shared_state SET revision=?, "values"=?, updated_at=? WHERE id=1 AND revision=?')
      .bind(state.revision + 1, await encodeValues(values,state), at, state.revision).run();
    if (updated.meta.changes !== 1) return reply({ error: '修訂衝突，沒有儲存', revision: (await readState()).revision }, 409);
    return reply({ revision: state.revision + 1, control });
  } catch (error) {
    console.error('[ipqc-c] write failed', error);
    return reply({ error: error instanceof Error ? error.message : 'IPQC-C 寫入失敗' }, 500);
  }
}
