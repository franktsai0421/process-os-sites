import { env } from 'cloudflare:workers';
import { readState, identity, can, sameOrigin, encodeValues, parse, maintenanceCredential,
  responseHeaders as headers } from '@/lib/process-state';
import { activeAb, catalogFromMaster, checkedAbSnapshot, copyAb, nextAbCode,abDraftIssues,
  openAb, parseAbControl, scopeKey, submissionIssues, type AbCatalog, type AbControl,
  type AbError, type AbItem, type AbScope, type AbSnapshot } from '@/lib/ipqc-ab';
import { hierarchy, equipmentGroupLabel, type EquipmentVersion } from '@/lib/routine-equipment';
import { mergeAbImport, type AbImportPayload } from '@/lib/ipqc-ab-import';
import {visibleSharedControl} from '@/lib/versioned-shared-workflow';
import {recordJSONResponse} from '@/lib/state-records-response';
import type {AbModuleRoot} from '@/lib/ipqc-ab-module-workflow';
import type {AbSharedScope} from '@/lib/ipqc-ab-workflow';

const KEY = 'ipqcABMasterControl';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });
const clean = (value: unknown) => typeof value === 'string' ? value : '';
const local = (request: Request) => ['localhost','127.0.0.1'].includes(new URL(request.url).hostname);
const event = (actor: { id: string; name: string }, action: string, at: string, comment = '') =>
  ({ action, actorId: actor.id, actorName: actor.name, at, ...(comment ? { comment } : {}) });
type Body = { action?: string; baseRevision?: number; line?: string; group?: string;
  import?: AbImportPayload;
  versionId?: string; versionRevision?: number; snapshot?: AbSnapshot; id?: string; errorId?: string;
  stageCode?: string; name?: string; comment?: string; reason?: string;
  source?: { fileName?: string; sha256?: string; rows?: number; errors?: AbError[]; items?: AbItem[] } };

function equipmentCatalog(values: Record<string,string>) {
  const control = parse(values.routineEquipmentControl, null) as { activeVersionId?: string;
    versions?: EquipmentVersion[] } | null;
  const active = control?.versions?.find(v => v.id === control.activeVersionId && v.status === 'approved');
  return (active?.equipment || []).filter(e => e.enabled !== false);
}
function equipmentChoices(values: Record<string,string>) {
  const control = parse(values.routineEquipmentControl, null) as { activeVersionId?: string;
    versions?: EquipmentVersion[] } | null;
  const active = control?.versions?.find(v => v.id === control.activeVersionId && v.status === 'approved');
  if (!active) return [];
  const tree = hierarchy(active);
  return active.equipment.map(e => {
    const group = tree.groups.find(g => g.id === e.groupId);
    return { id:e.id, assetCode:e.assetCode || '', pieceMark:e.pieceMark || '',
      name:e.name || e.nameVi || '', photoId:e.photoId || '', spec:e.spec || '',
      categoryId:group?.categoryId || '', subcategoryId:group?.subcategoryId || '', groupId:e.groupId,
      category:tree.categories.find(c => c.id === group?.categoryId)?.name || e.category || '',
      subcategory:tree.subcategories.find(c => c.id === group?.subcategoryId)?.name || e.subcategory || '',
      group:equipmentGroupLabel(group?.name || group?.nameVi || ''), available:e.enabled !== false };
  });
}
function validateEquipment(next: AbSnapshot, previous: AbSnapshot, values: Record<string,string>) {
  const available = new Map(equipmentCatalog(values).map(e => [e.id,e]));
  const prior = new Map(previous.items.map(i => [i.id,i]));
  for (const item of next.items) {
    if (item.inspectionMode === 'visual') { item.equipmentId = ''; item.equipmentSnapshot = null; continue; }
    if (!item.equipmentId) { item.equipmentSnapshot = null; continue; }
    const old = prior.get(item.id);
    if (old?.equipmentId === item.equipmentId && old.equipmentSnapshot) {
      item.equipmentSnapshot = old.equipmentSnapshot;
      continue;
    }
    const equipment = available.get(item.equipmentId);
    if (!equipment) throw Error(`${item.code} 的檢具不是目前生效且啟用的設備`);
    item.equipmentSnapshot = { id: equipment.id, assetCode: equipment.assetCode || '',
      pieceMark: equipment.pieceMark || '', name: equipment.name || equipment.nameVi || '',
      ...(equipment.photoId ? { photoId: equipment.photoId } : {}) };
  }
}
async function validatePhotos(next: AbSnapshot, previous: AbSnapshot) {
  const existing = new Set(previous.items.flatMap(i => [...i.standardPhotos, ...i.methodPhotos].map(p => p.id)));
  for (const photo of next.items.flatMap(i => [...i.standardPhotos, ...i.methodPhotos]))
    if (!existing.has(photo.id) && !await env.STATE_ARCHIVE.head(`ipqc-ab/photos/${photo.id}`))
      throw Error(`照片 ${photo.id} 尚未保存；草稿沒有寫入`);
}
function scopeMatches(catalog: AbCatalog, line: string, group: string) {
  return catalog.groups.some(g => g.line === line && g.name === group);
}
function seedValidate(source: NonNullable<Body['source']>, catalog: AbCatalog, control: AbControl) {
  if (!source.fileName || !/^[a-f0-9]{64}$/.test(source.sha256 || '') ||
      !Number.isInteger(source.rows) || !Array.isArray(source.errors) || !Array.isArray(source.items))
    throw Error('來源格式錯誤');
  if (!source.errors.length || !source.items.length) throw Error('來源沒有可建立的錯誤代碼或檢查項目');
  const errors = new Map<string,AbError>(), items = new Set<string>();
  const reserved = new Set([...control.reservedErrorCodes, ...control.reservedItemCodes]);
  for (const error of source.errors) {
    if (!error.id || !error.code || errors.has(error.id) || reserved.has(error.code) ||
        !scopeMatches(catalog,error.line,error.group) ||
        !catalog.stages.some(s => s.line === error.line && s.code === error.stageCode) ||
        !error.code.startsWith(`${error.line}-${error.group}-${error.stageCode.slice(2)}-L`) ||
        !Array.isArray(error.sourceRows) || !error.sourceRows.length)
      throw Error(`來源錯誤代碼 ${error.code || '?'} 無效或碰撞`);
    errors.set(error.id,error);
  }
  for (const item of source.items) {
    const parent = errors.get(item.errorId);
    if (!parent || !item.code.startsWith(`${parent.code}-`) || items.has(item.code) || reserved.has(item.code) ||
        item.inspectionMode !== 'visual' || item.equipmentId || item.equipmentSnapshot || !item.isEnabled ||
        !Array.isArray(item.standardPhotos) || item.standardPhotos.length ||
        !Array.isArray(item.methodPhotos) || item.methodPhotos.length ||
        !Array.isArray(item.productCodes) || !item.productCodes.length ||
        item.productCodes.some(code => !catalog.products.some(p => p.code === code && p.line === parent.line &&
          p.category === parent.group && p.stages.includes(parent.stageCode))) ||
        !Array.isArray(item.sourceRows) || !item.sourceRows.length)
      throw Error(`來源項目 ${item.code || '?'} 無效或主資料不匹配`);
    items.add(item.code);
  }
}

export async function GET(request: Request) {
  try {
    const caseMetadata=new URL(request.url).searchParams.get('caseMetadata')==='1';
    const state = await readState({modelKey:KEY,deferHistory:true,deferDependencyHistory:true}), actor = await identity(request,state);
    if (!actor || !(await can(request,state,'view:data')) && !(await can(request,state,'view:approval')))
      return reply({ error:'沒有查看 IPQC-AB 權限' },403);
    const catalog = catalogFromMaster(state.values.masterDataControl);
    const equipment = equipmentChoices(state.values);
    const control=parseAbControl(state.values[KEY],state.recordStorage?.models.get(KEY)),history=await can(request,state,'approval.compare');
    for(const [key,scope]of Object.entries(control.scopes))control.scopes[key]=visibleSharedControl(scope as AbSharedScope,history,caseMetadata);
    const moduleControl=(control as AbModuleRoot).moduleDraft;if(moduleControl)(control as AbModuleRoot).moduleDraft=visibleSharedControl(moduleControl,history,caseMetadata);
    const body={ revision:state.revision, control, catalog, equipment };
    return state.recordStorage&&!caseMetadata?recordJSONResponse(body,env.STATE_ARCHIVE,headers):reply(body);
  } catch (error) {
    console.error('[ipqc-ab] load failed',error);
    return reply({ error:'IPQC-AB 載入失敗；未以空資料覆蓋' },503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error:'來源不允許' },403);
  if (Number(request.headers.get('content-length') || 0) > 5_000_000)
    return reply({ error:'資料量超過單次限制' },413);
  try {
    let state = await readState({modelKey:KEY,deferHistory:true,deferDependencyHistory:true});const actor = await identity(request,state);
    if (!actor) return reply({ error:'請先登入' },401);
    if (state.values.maintenanceMode === '1') return reply({ error:'系統還原中，暫停編輯' },503);
    const rawBody = await request.text();
    if(new TextEncoder().encode(rawBody).length>5_000_000) return reply({error:'資料量超過單次限制'},413);
    const body = JSON.parse(rawBody) as Body;
    if (!Number.isInteger(body.baseRevision) || body.baseRevision !== state.revision)
      return reply({ error:'共用資料已更新，請重新載入核對', revision:state.revision },409);
    const action = clean(body.action);
    if(['seed','reimport'].includes(action)&&!await maintenanceCredential(request))return reply({error:'NON_BOM_IMPORT_MAINTENANCE_ONLY'},403);
    if(action==='submit-test')return reply({error:'TEST_SUBMISSION_REMOVED'},410);
    const editing = ['begin','save','submit','submit-test','create-error','create-item','delete-error','delete-item','withdraw'].includes(action);
    const reviewing = ['approve','reject'].includes(action);
    if (action === 'seed' || action === 'reimport') {
      if (!local(request) || actor.role !== 'admin' || !(await can(request,state,'master.import')))
        return reply({ error:'僅限隔離 Local ADMIN 建置' },403);
    } else if (editing) {
      if (!(await can(request,state,'view:data')) ||
          !(await can(request,state,action === 'withdraw' ? 'approval.withdraw':'approval.submit')))
        return reply({ error:'沒有 IPQC-AB 編輯權限' },403);
      if (action.startsWith('delete') && !(await can(request,state,'master.delete')))
        return reply({ error:'沒有刪除權限' },403);
    } else if (reviewing) {
      if (!(await can(request,state,'view:approval')) ||
          !(await can(request,state,action === 'approve' ? 'approval.approve':'approval.reject')))
        return reply({ error:'沒有審核權限' },403);
    } else return reply({ error:'不支援的操作' },400);
    const prepared=(state.recordStorage?.models.get(KEY)||parse(state.values[KEY],{})) as {moduleDraft?:unknown;scopes?:Record<string,{workflow?:unknown}>};
    if(prepared.moduleDraft)return reply({error:'WHOLE_MODULE_ACTION_REQUIRED'},409);
    if(prepared.scopes?.[scopeKey(clean(body.line),clean(body.group))]?.workflow||['seed','reimport'].includes(action)&&Object.values(prepared.scopes||{}).some(s=>s.workflow))return reply({error:'WORKFLOW_V3_REQUIRED'},409);
    if(state.recordStorage){state=await readState();if(state.revision!==body.baseRevision)return reply({error:'資料已更新，請重新核對'},409);}
    const control = copyAb(parseAbControl(state.values[KEY]));
    if(['seed','reimport'].includes(action)&&Object.values(control.scopes).some(s=>'workflow'in s))return reply({error:'WORKFLOW_V3_REQUIRED'},409);
    if('workflow'in(control.scopes[scopeKey(clean(body.line),clean(body.group))]||{}))return reply({error:'WORKFLOW_V3_REQUIRED'},409);
    const catalog = catalogFromMaster(state.values.masterDataControl);
    const at = new Date().toISOString();
    let importReport: ReturnType<typeof mergeAbImport> | undefined;
    if (action === 'reimport') {
      if (!body.import) return reply({error:'缺少新版匯入資料'},422);
      importReport=mergeAbImport(control,catalog,body.import,actor,at);
      if(!importReport.changed) return reply({revision:state.revision,control,unchanged:true,
        importReport:{...importReport,control:undefined}});
      Object.assign(control,importReport.control);
    } else if (action === 'seed') {
      const source = body.source;
      if (!source) return reply({ error:'缺少來源' },422);
      if (control.source?.sha256 === source.sha256) return reply({ revision:state.revision, control, unchanged:true });
      if (control.source || Object.keys(control.scopes).length) return reply({ error:'已有 IPQC-AB 版本；首次匯入不能覆寫' },409);
      seedValidate(source,catalog,control);
      const byScope = new Map<string,{ errors:AbError[]; items:AbItem[] }>();
      for (const error of source.errors!) {
        const key = scopeKey(error.line,error.group);
        if (!byScope.has(key)) byScope.set(key,{errors:[],items:[]});
        byScope.get(key)!.errors.push(error);
      }
      const errorMap = new Map(source.errors!.map(e => [e.id,e]));
      for (const item of source.items!) {
        const parent = errorMap.get(item.errorId)!;
        byScope.get(scopeKey(parent.line,parent.group))!.items.push(item);
      }
      for (const [key, snapshot] of byScope) {
        const first = snapshot.errors[0];
        const version = { id:crypto.randomUUID(), number:1, status:'draft' as const, revision:1,
          snapshot, baseVersionId:null, creatorId:actor.id, creatorName:actor.name,
          createdAt:at, updatedAt:at, history:[event(actor,'initial-import',at,source.sha256)] };
        control.scopes[key] = { line:first.line, group:first.group, activeVersionId:null, versions:[version] };
      }
      control.reservedErrorCodes = source.errors!.map(e => e.code);
      control.reservedItemCodes = source.items!.map(i => i.code);
      control.source = { fileName:source.fileName!, sha256:source.sha256!, rows:source.rows!,
        importedRelations:source.items!.reduce((count,item) => count + item.productCodes.length,0), builtAt:at };
    } else {
      const line = clean(body.line), group = clean(body.group), key = scopeKey(line,group);
      if (!scopeMatches(catalog,line,group)) return reply({ error:'中控主資料沒有此線別與群組' },422);
      const scope: AbScope = control.scopes[key] || { line,group,activeVersionId:null,versions:[] };
      const opened = openAb(scope), active = activeAb(scope);
      if (action === 'begin') {
        if (opened?.status !== 'draft' && opened) return reply({ error:'此類別正在送審' },409);
        if (opened) return reply({ revision:state.revision,control,unchanged:true });
        scope.versions.push({ id:crypto.randomUUID(), number:Math.max(0,...scope.versions.map(v => v.number)) + 1,
          status:'draft', revision:1, snapshot:copyAb(active?.snapshot || {errors:[],items:[]}),
          baseVersionId:active?.id || null, creatorId:actor.id, creatorName:actor.name,
          createdAt:at, updatedAt:at, history:[event(actor,'begin',at)] });
        control.scopes[key] = scope;
      } else {
        if (!opened || body.versionId !== opened.id || body.versionRevision !== opened.revision)
          return reply({ error:'版本已更新，請重新載入核對', revision:state.revision },409);
        if (reviewing || action === 'withdraw') {
          if (!['pending','pending-test'].includes(opened.status)) return reply({ error:'案件已不在待審狀態' },409);
        } else if (opened.status !== 'draft') return reply({ error:'此類別沒有可編輯草稿' },409);
        if (['save','submit','submit-test'].includes(action)) {
          let snapshot:AbSnapshot;
          try { snapshot=checkedAbSnapshot(opened,body.snapshot,catalog,line,group,action==='save'); }
          catch(error) { return reply({error:error&&typeof error==='object'&&'message'in error&&typeof error.message==='string'?error.message:'草稿格式錯誤'},422); }
          validateEquipment(snapshot,opened.snapshot,state.values);
          await validatePhotos(snapshot,opened.snapshot);
          opened.snapshot = snapshot;
          if (action !== 'save') {
            if (opened.baseVersionId !== scope.activeVersionId)
              return reply({ error:'生效版本已變更，請核對草稿差異' },409);
            if (action === 'submit') {
              const issues = submissionIssues(snapshot,catalog,line,group);
              if (issues.some(i=>i.blocking)) return reply({ error:'送審驗證未通過', issues:issues.filter(i=>i.blocking) },422);
              opened.contentIssues={policy:'ipqc-completeness-v1',issues:abDraftIssues(snapshot,catalog,line,group).filter(i=>i.kind==='missing')};
            }
            if (JSON.stringify(snapshot) !== JSON.stringify(active?.snapshot || {errors:[],items:[]}) && !clean(body.reason).trim())
              return reply({ error:'有實際資料差異時需填寫變更理由' },422);
            opened.status = action === 'submit' ? 'pending':'pending-test';
            opened.submittedBy = actor.name; opened.submittedAt = at;
          }
        } else if (action === 'create-error') {
          const stageCode = clean(body.stageCode), name = clean(body.name).trim();
          if (!name || !catalog.stages.some(s => s.line === line && s.code === stageCode))
            return reply({ error:'請選有效工段並填錯誤名稱' },422);
          const code = nextAbCode(control,'error',`${line}-${group}-${stageCode.slice(2)}-L`);
          opened.snapshot.errors.push({ id:crypto.randomUUID(), code,line,group,stageCode,name,
            sourceRows:[],deleted:false });
        } else if (action === 'create-item') {
          const parent = opened.snapshot.errors.find(e => e.id === body.errorId && !e.deleted);
          if (!parent) return reply({ error:'請先選有效錯誤代碼' },422);
          const code = nextAbCode(control,'item',`${parent.code}-`);
          opened.snapshot.items.push({ id:crypto.randomUUID(), code,errorId:parent.id,standard:'',methodText:'',
            inspectionMode:'visual',equipmentId:'',equipmentSnapshot:null,isEnabled:true,rules:[],
            standardPhotos:[],methodPhotos:[],productCodes:[],sourceRows:[],sourceTool:'',
            sourceMethod:'',sourceFrequency:'',reason:'',deleted:false });
        } else if (action === 'delete-item') {
          const item = opened.snapshot.items.find(i => i.id === body.id && !i.deleted);
          if (!item) return reply({ error:'項目不存在' },404);
          item.deleted = true;
        } else if (action === 'delete-error') {
          const error = opened.snapshot.errors.find(e => e.id === body.id && !e.deleted);
          if (!error) return reply({ error:'代碼不存在' },404);
          const count = opened.snapshot.items.filter(i => i.errorId === error.id && !i.deleted).length;
          if (count) return reply({ error:`此錯誤代碼仍有 ${count} 個檢查項目，請先處理`, count },422);
          error.deleted = true;
        } else if (action === 'withdraw') {
          if (actor.id !== opened.creatorId && actor.role !== 'admin')
            return reply({ error:'只能撤回自己送審的版本' },403);
          opened.status = 'draft';
        } else if (reviewing) {
          if (action === 'approve' && opened.status === 'pending') {
            const issues=submissionIssues(opened.snapshot,catalog,line,group).filter(i=>i.blocking);if(issues.length)return reply({error:'核准驗證未通過',issues},422);
            if (active) active.status = 'superseded';
            opened.status = 'approved'; scope.activeVersionId = opened.id;
          } else if (action === 'approve') opened.status = 'tested';
          else opened.status = 'draft';
          opened.reviewedBy = actor.name; opened.reviewedAt = at;
          opened.reviewComment = clean(body.comment);
        }
        opened.updatedAt = at; opened.revision += 1;
        opened.history.push(event(actor,action,at,clean(body.comment) || clean(body.reason)));
      }
    }
    const nextValues = { ...state.values, [KEY]:JSON.stringify(control) };
    const updated = await env.DB.prepare('UPDATE shared_state SET revision=?, "values"=?, updated_at=? WHERE id=1 AND revision=?')
      .bind(state.revision + 1,await encodeValues(nextValues,state),at,state.revision).run();
    if (updated.meta.changes !== 1) return reply({ error:'修訂衝突，沒有儲存', revision:(await readState()).revision },409);
    return reply({ revision:state.revision + 1,control,
      ...(importReport?{importReport:{...importReport,control:undefined}}:{}) });
  } catch (error) {
    console.error('[ipqc-ab] write failed',error);
    return reply({ error:error instanceof Error ? error.message:'IPQC-AB 寫入失敗' },500);
  }
}
