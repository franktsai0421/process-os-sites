import { env } from 'cloudflare:workers';
import { readState, identity, can, sameOrigin, encodeValues, stateRevisionIsCurrent, parse, responseHeaders as headers } from '@/lib/process-state';
import { activeReplacementVersion, equipmentSnapshot, itemName, itemNumber, liveItems,
  openReplacementVersion, replacementModules, replacementSelectionId,
  type PendingReplacement, type ReplacementItem, type ReplacementLibrary,
  type ReplacementModule, type ReplacementVersion } from '@/lib/quality-equipment-replacement';
import { parseAbControl, type AbControl } from '@/lib/ipqc-ab';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
type Equipment = { id: string; assetCode?: string; pieceMark?: string; name?: string; nameVi?: string;
  spec?: string; photoId?: string; enabled?: boolean };
type EquipmentControl = { activeVersionId?: string | null; versions: Array<{ id: string; status: string;
  equipment: Equipment[] }>; pendingReplacements?: PendingReplacement[] };
type QualityControl = { libraries?: { fqc?: ReplacementLibrary } };
type Body = { action?: 'apply' | 'reconcile'; baseRevision?: number; moduleId?: ReplacementModule;
  sourceEquipmentId?: string; targetEquipmentId?: string; itemIds?: string[];
  overrideItemIds?: string[] };

function controls(values: Record<string, string>,preparedAb?:unknown) {
  const routine = parse(values.routineEquipmentControl, null) as EquipmentControl | null;
  if (!routine || !Array.isArray(routine.versions)) throw Error('檢具資料無法讀取，沒有進行替換');
  const quality = parse(values.qualityMasterControl, null) as QualityControl | null;
  const iqc = parse(values.iqcMasterControl, null) as ReplacementLibrary | null;
  const ipqcC = parse(values.ipqcCMasterControl, null) as ReplacementLibrary | null;
  let ipqcAB: AbControl | null = null;
  try { if (values.ipqcABMasterControl) ipqcAB=parseAbControl(values.ipqcABMasterControl,preparedAb); }
  catch { /* Fail closed for AB without disabling the other adapters. */ }
  const libraries: Record<string, ReplacementLibrary | null | undefined> = {
    fqc: quality?.libraries?.fqc, iqc, 'ipqc-c': ipqcC,
  };
  return { routine, quality, libraries, ipqcAB };
}

function libraryFor(libraries: Record<string, ReplacementLibrary | null | undefined>, moduleId: ReplacementModule) {
  const library = libraries[moduleId];
  return library && Array.isArray(library.versions) ? library : null;
}

function effectiveEquipment(routine: EquipmentControl, id: string) {
  const version = routine.versions.find(row => row.id === routine.activeVersionId && row.status === 'approved');
  return version?.equipment.find(row => row.id === id);
}

function readableReferenceVersion(version: ReplacementVersion | undefined) {
  if (!version) return true;
  if (!version.id || !Array.isArray(version.snapshot?.items)) return false;
  const seen = new Map<string, ReplacementItem>();
  for (const item of version.snapshot.items) {
    if (!item || typeof item.id !== 'string' || !item.id) return false;
    const prior = seen.get(item.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(item)) return false;
    seen.set(item.id, item);
  }
  return true;
}

function describe(moduleId: ReplacementModule, library: ReplacementLibrary | null,
  sourceId: string, pending: PendingReplacement[], scopeKey = '', moduleSaved?: {id:string;items:ReplacementItem[]}) {
  const active = library ? activeReplacementVersion(library) : undefined;
  const open = library ? openReplacementVersion(library) : undefined;
  if (!library || !(library.activeVersionId === null || typeof library.activeVersionId === 'string') || (library.activeVersionId && !active) ||
      !readableReferenceVersion(active) || !readableReferenceVersion(open)) {
    return { moduleId, connected: false, label: replacementModules[moduleId].label,
      items: [], reason: '模組標準資料未接入或讀取不完整' };
  }
  const flow=(library as ReplacementLibrary & {workflow?:{generation:string}}).workflow;
  const saved = moduleId==='ipqc-ab' ? moduleSaved : (library as ReplacementLibrary & {workflow?:{saved?:{id:string;content?:{items?:ReplacementItem[]}}}}).workflow?.saved;
  const savedItems = saved && ('items' in saved ? saved.items : saved.content?.items);
  const savedMap = new Map((Array.isArray(savedItems)?savedItems:[]).filter(row=>!row.isDeleted&&!row.deleted).map(row=>[row.id,row]));
  const activeMap = new Map(liveItems(active).map(item => [item.id, item]));
  const draftMap = new Map(liveItems(open).map(item => [item.id, item]));
  const ids = new Set([...activeMap, ...draftMap]
    .filter(([, item]) => item.equipmentId === sourceId).map(([id]) => id));
  const scopedPending = pending.filter(row => (row.scopeKey || '') === scopeKey);
  return { moduleId, scopeKey, connected: true, label: replacementModules[moduleId].label,
    activeVersion: active ? { id: active.id, number: active.number, status: active.status } : null,
    openVersion: open ? { id: open.id, number: open.number, status: open.status, revision: open.revision } : null,
    workflow: flow ? {generation:flow.generation,editable:open?.status==='draft'} : null,
    items: [...ids].map(id => {
      const effective = activeMap.get(id), draft = draftMap.get(id), savedItem=savedMap.get(id);
      return { id: replacementSelectionId(moduleId,id,scopeKey), itemId:id, scopeKey,
        savedChoice: savedItem && saved ? {id:saved.id,equipmentId:savedItem.equipmentId||'',mode:savedItem.inspectionMode,tool:savedItem.tool}:null,
        effectiveReference: active && effective?.equipmentId === sourceId ? {
          versionId: active.id, versionNumber: active.number, itemId: id, scope: scopeKey,
          checkNo: itemNumber(effective), itemName: itemName(effective), status: active.status
        } : null,
        code: itemNumber(draft || effective || { id }), name: itemName(draft || effective || { id }),
        activeEquipmentId: effective?.equipmentId || '', draftEquipmentId: draft?.equipmentId || '',
        activeInspectionMode:effective?.inspectionMode,draftInspectionMode:draft?.inspectionMode,
        ...(moduleId==='fqc'?{activeTool:effective?.tool,draftTool:draft?.tool}:{}),
        openStatus: open?.status || '', openVersionId: open?.id || '', openVersionNumber: open?.number || '',
        selectable: !['pending','pending-test'].includes(open?.status || ''),
        unavailableReason: ['pending','pending-test'].includes(open?.status || '') ? '待審範圍已鎖定；結案後請重新選取' : '',
        pending: scopedPending.filter(row => row.moduleId === moduleId && row.itemId === id &&
          (row.sourceEquipmentId === sourceId || row.targetEquipmentId === sourceId) && row.status !== 'applied') };
    }) };
}

function createDraft(moduleId: ReplacementModule, library: ReplacementLibrary,
  actor: { id: string; name: string }, at: string): ReplacementVersion {
  const active = activeReplacementVersion(library);
  const next = Math.max(0, ...library.versions.map(row => Number(String(row.number).replace(/\D/g, '')) || 0)) + 1;
  const version: ReplacementVersion = {
    id: moduleId === 'fqc' ? `fqc-${crypto.randomUUID()}` : crypto.randomUUID(),
    number: moduleId === 'fqc' ? `V${next}` : next, status: 'draft',
    snapshot: clone(active?.snapshot || { errors: [], items: [] }),
    baseVersionId: active?.id || null, revision: 1,
    creatorId: actor.id, creatorName: actor.name, updatedAt: at,
    history: [{ action: 'begin', actorId: actor.id, actorName: actor.name, at }],
  };
  // FQC stores creation metadata/source on the version itself.
  (version as ReplacementVersion & { createdAt?: string; source?: unknown }).createdAt = at;
  if (moduleId === 'fqc') (version as ReplacementVersion & { source?: unknown }).source = clone(
    (active as ReplacementVersion & { source?: unknown } | undefined)?.source || {});
  library.versions.push(version);
  return version;
}

function updateItem(item: ReplacementItem, moduleId: ReplacementModule, target: Equipment) {
  item.equipmentId = target.id;
  item.equipmentSnapshot = equipmentSnapshot(target);
  if (moduleId === 'iqc' || moduleId === 'ipqc-ab') item.inspectionMode = 'equipment';
  // Original Excel tool/method text and IPQC-C equipmentGroupId are provenance,
  // not an equipment identity. Do not overwrite them while replacing a tool.
}

export async function GET(request: Request) {
  try {
    const state = await readState({modelKey:'ipqcABMasterControl',deferHistory:true,deferDependencyHistory:true});
    const actor = await identity(request, state);
    if (!actor || (request.headers.has('X-Process-Expected-Actor') && request.headers.get('X-Process-Expected-Actor')!==actor.id) || !(await can(request, state, 'view:data'))) return reply({ error: '沒有查看資料的權限' }, 403);
    const query = new URL(request.url).searchParams;
    const sourceId = query.get('sourceId') || '';
    const { routine, libraries, ipqcAB } = controls(state.values,state.recordStorage?.models.get('ipqcABMasterControl'));
    if(query.has('referenceModule')){
      const moduleId=query.get('referenceModule') as ReplacementModule;
      if(!Object.hasOwn(replacementModules,moduleId) || !sourceId || !query.get('itemId') || !query.get('versionId'))return reply({error:'INVALID_REFERENCE_LOCATOR'},400);
      if(moduleId!=='ipqc-ab' && !await can(request,state,moduleId+'.view'))return reply({error:'FORBIDDEN'},403);
      if(query.get('revision')!==String(state.revision))return reply({error:'REFERENCE_REVISION_CHANGED'},409);
      const scope=query.get('scope')||'';
      const library=moduleId==='ipqc-ab'?ipqcAB?.scopes[scope]:libraryFor(libraries,moduleId);
      if(!library)return reply({error:'REFERENCE_UNAVAILABLE'},503);
      const version=query.get('referenceState')==='open'?openReplacementVersion(library):activeReplacementVersion(library);
      if(!version || version.id!==query.get('versionId'))return reply({error:'REFERENCE_CHANGED'},409);
      if(!readableReferenceVersion(version))return reply({error:'REFERENCE_UNAVAILABLE'},503);
      const item=liveItems(version).find(row=>row.id===query.get('itemId') && row.equipmentId===sourceId);
      if(!item)return reply({error:'REFERENCE_CHANGED'},409);
      const parentId=(item as {errorId?:string}).errorId;
      const errors=(version.snapshot as {errors?:{id:string}[]}).errors;
      if(!Array.isArray(errors))return reply({error:'REFERENCE_UNAVAILABLE'},503);
      return reply({revision:state.revision,version:{id:version.id,number:version.number,status:version.status,
        snapshot:{items:[item],errors:errors.filter(row=>row.id===parentId)}}});
    }
    const pending = routine.pendingReplacements || [];
    const modules = (Object.keys(replacementModules) as ReplacementModule[]).map(moduleId => {
      if (moduleId !== 'ipqc-ab') return describe(moduleId, libraryFor(libraries,moduleId),sourceId,pending);
      const saved = (ipqcAB as import('@/lib/ipqc-ab-module-workflow').AbModuleRoot | null)?.moduleDraft?.workflow?.saved;
      const scopes = Object.entries(ipqcAB?.scopes || {}).map(([key,scope]) =>
        describe(moduleId,scope,sourceId,pending,key,saved?{id:saved.id,items:saved.content.scopes[key]?.items||[]}:undefined));
      return {moduleId,connected:!!ipqcAB && !Array.isArray(ipqcAB.scopes) && scopes.every(scope=>scope.connected),label:'IPQC-AB',items:scopes.flatMap(scope=>scope.items),
        scopes,reason:ipqcAB?'':'尚未接入正式版本與草稿'};
    });
    const editable=await can(request,state,'approval.submit');
    const abPending=!!(ipqcAB as AbControl & {moduleDraft?:{workflow?:{pendingId?:string|null}}} | null)?.moduleDraft?.workflow?.pendingId;
    for (const entry of modules) {
      // Preview consumes existing V3 edit capability; it grants no access and
      // never enables an item disabled by a pending case. AB adoption is scoped.
      if (entry.moduleId==='ipqc-ab' && 'scopes' in entry) {
        const v3Editable=await can(request,state,'ipqc-ab.view') && await can(request,state,'ipqc-ab.edit');
        for (const scope of entry.scopes) for (const item of scope.items) {
          if (abPending && item.selectable) {
            item.selectable=false;item.unavailableReason='待審範圍已鎖定；結案後請重新選取';
          }
          if (!(scope.workflow?v3Editable:editable) && item.selectable) {
            item.selectable=false;item.unavailableReason='沒有目標模組草稿編輯權限';
          }
        }
        continue;
      }
      if ((entry.moduleId==='fqc'||entry.moduleId==='iqc'||entry.moduleId==='ipqc-c') && 'workflow' in entry && entry.workflow) {
        const allowed=await can(request,state,entry.moduleId+'.view') && await can(request,state,entry.moduleId+'.edit');
        if (!allowed) for (const item of entry.items) if (item.selectable) {
          item.selectable=false;item.unavailableReason='沒有目標模組草稿編輯權限';
        }
        continue;
      }
      // Non-adopted replacement and its POST retain their legacy policy.
      const allowed = editable && (entry.moduleId!=='fqc' || actor.role==='admin');
      if (!allowed) for (const item of entry.items) {
        item.selectable=false;item.unavailableReason='沒有目標模組草稿編輯權限';
      }
    }
    const readableModules = await Promise.all(modules.map(async entry => {
      const referenceVisible = entry.moduleId === 'ipqc-ab' || await can(request,state,entry.moduleId+'.view');
      if (!referenceVisible) for (const item of entry.items) {item.effectiveReference = null;item.savedChoice=null;}
      return {...entry, referenceVisible};
    }));
    const relatedPending = pending.filter(row =>
      (row.sourceEquipmentId === sourceId || row.targetEquipmentId === sourceId) && row.status !== 'applied')
      .map(row => {
        const library = row.moduleId === 'ipqc-ab' ? ipqcAB?.scopes[row.scopeKey || ''] : libraryFor(libraries, row.moduleId);
        const item = liveItems(openReplacementVersion(library || { versions: [] })).find(entry => entry.id === row.itemId) ||
          liveItems(activeReplacementVersion(library || { versions: [] })).find(entry => entry.id === row.itemId);
        return { ...row, pendingVersionNumber: row.pendingVersionNumber ||
          library?.versions.find(version => version.id === row.pendingVersionId)?.number || '',
          itemCode: row.itemCode || (item ? itemNumber(item) : row.itemId),
          itemName: row.itemName || (item ? itemName(item) : '') };
      });
    return reply({ revision: state.revision, referenceSourceId:sourceId, source: effectiveEquipment(routine, sourceId) || null,
      equipment: routine.versions.find(row => row.id === routine.activeVersionId && row.status === 'approved')?.equipment || [],
      modules: readableModules, pending: relatedPending });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : '替換預覽載入失敗' }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: '來源不允許' }, 403);
  try {
    const state = await readState({modelKey:'ipqcABMasterControl',deferHistory:true,deferDependencyHistory:true});
    const actor = await identity(request, state);
    const body = await request.json() as Body;
    if (!actor || !(await can(request, state, 'view:data')) || !(await can(request, state, 'approval.submit')))
      return reply({ error: '沒有建立品質草稿的權限' }, 403);
    // V3 never schedules a write behind a pending case. Existing queue records
    // remain historical evidence, not authorization for a later automatic edit.
    if (body.action === 'reconcile') return reply({error:'待處理自動替換已停用，請重新預覽並確認選取',code:'REPLACEMENT_RECONFIRM_REQUIRED'},409);
    if (state.values.maintenanceMode === '1') return reply({ error: '系統還原中，暫停替換' }, 503);
    if (!Number.isInteger(body.baseRevision) || body.baseRevision !== state.revision)
      return reply({ error: '資料已更新，請先重新預覽差異', revision: state.revision }, 409);
    const moduleId = body.moduleId;
    if (!moduleId || !Object.hasOwn(replacementModules,moduleId))
      return reply({ error: '此模組尚未接入正式草稿' }, 422);
    if (moduleId === 'fqc' && actor.role !== 'admin')
      return reply({ error: 'FQC 草稿依既有規則僅允許 ADMIN 修改' }, 403);
    const { routine, quality, libraries, ipqcAB } = controls(state.values,state.recordStorage?.models.get('ipqcABMasterControl'));
    const library = libraryFor(libraries, moduleId);
    if (library && 'workflow' in library)
      return reply({error:'此範圍已使用 V3 共用草稿，請使用共用草稿檢具操作；舊替換入口不可覆寫',code:'WORKFLOW_V3_REQUIRED'},409);
    if (moduleId === 'ipqc-ab' ? !ipqcAB : !library)
      return reply({ error: `${replacementModules[moduleId].label} 尚未接入可用版本，其他模組不受影響` }, 422);
    const sourceId = String(body.sourceEquipmentId || ''), targetId = String(body.targetEquipmentId || '');
    const target = effectiveEquipment(routine, targetId);
    if (!sourceId || !target || targetId === sourceId || target.enabled === false)
      return reply({ error: '目標必須是不同且目前生效、啟用的檢具' }, 422);
    if (!effectiveEquipment(routine, sourceId)) return reply({ error: '來源設備不在生效檢具版本' }, 422);
    const at = new Date().toISOString();
    const ids = [...new Set(body.itemIds || [])];
    if (body.action !== 'apply') return reply({ error: '不支援的操作' }, 400);
    if (body.action === 'apply' && (!ids.length || ids.length > 1000 || ids.some(id => typeof id !== 'string')))
      return reply({ error: '請勾選有效檢查項目' }, 422);
    const selectedAB = new Map<string,string[]>();
    if (moduleId === 'ipqc-ab' && body.action === 'apply') for (const id of ids) {
      let pair: unknown;
      try { pair = JSON.parse(id); } catch { return reply({error:'IPQC-AB 項目須包含有效群組身分'},422); }
      if (!Array.isArray(pair) || pair.length !== 2 || pair.some(value=>typeof value !== 'string') ||
          !ipqcAB || !Object.hasOwn(ipqcAB.scopes,pair[0])) return reply({error:'IPQC-AB 群組身分無效'},422);
      const rows=selectedAB.get(pair[0]) || []; rows.push(pair[1]); selectedAB.set(pair[0],rows);
    }
    const contexts: Array<[string,ReplacementLibrary]> = moduleId === 'ipqc-ab'
      ? Object.entries(ipqcAB!.scopes) : [['',library!]];
    if(contexts.some(([key,scope])=>'workflow'in scope&&(moduleId!=='ipqc-ab'||selectedAB.has(key))))
      return reply({error:'WORKFLOW_V3_REQUIRED',code:'WORKFLOW_V3_REQUIRED'},409);
    const overrides = new Set(body.overrideItemIds || []);
    const results: Array<{ itemId: string; scopeKey?: string; status: string; reason?: string }> = [];
    const versionUpdates: Array<{scopeKey:string;id:string;revision:number}> = [];
    let lastOpen: ReplacementVersion | undefined;
    let changed = false;
    for (const [scopeKey, scopedLibrary] of contexts) {
    const requested = moduleId === 'ipqc-ab' ? selectedAB.get(scopeKey) || [] : ids;
    if (!requested.length) continue;
    const previousVersions=clone(scopedLibrary.versions);
    const previouslyChanged: boolean=changed;
    const resultStart=results.length;
    const active=activeReplacementVersion(scopedLibrary);
    let open=openReplacementVersion(scopedLibrary);
    const activeMap=new Map(liveItems(active).map(item=>[item.id,item]));
    const draftMap=new Map(liveItems(open).map(item=>[item.id,item]));
    for (const itemId of requested) {
      const effective = activeMap.get(itemId), draftItem = draftMap.get(itemId);
      if (body.action === 'apply' && effective?.equipmentId &&
          effective.equipmentId !== sourceId && effective.equipmentId !== targetId) {
        results.push({ itemId, status: 'conflict', reason: '生效檢具已變更，需重新核對' }); continue;
      }
      if (!effective && !draftItem) {
        results.push({ itemId, status: 'conflict', reason: '檢查項目已不存在' }); continue;
      }
      if (body.action === 'apply' && effective?.equipmentId !== sourceId && draftItem?.equipmentId !== sourceId &&
          draftItem?.equipmentId !== targetId) {
        results.push({ itemId, status: 'conflict', reason: '生效與草稿均未引用來源檢具' }); continue;
      }
      if (open && ['pending','pending-test'].includes(open.status)) {
        results.push({ itemId, status: 'conflict', reason: '待審範圍已鎖定；未建立延後替換，結案後請重新選取' });
        continue;
      }
      const visual = (moduleId === 'iqc' || moduleId === 'ipqc-ab') && draftItem?.inspectionMode === 'visual';
      if (draftItem?.equipmentId === targetId && !visual) {
        results.push({ itemId, status: 'unchanged' });
        continue;
      }
      if (draftItem && (draftItem.equipmentId !== sourceId || visual) && !overrides.has(replacementSelectionId(moduleId,itemId,scopeKey))) {
        const reason = visual ? '草稿已改為目視' : draftItem.equipmentId ? `草稿已改選其他設備（${draftItem.equipmentId}）` : '草稿已清空檢具';
        results.push({ itemId, status: 'conflict', reason: reason + '，未覆蓋' });
        continue;
      }
      if (!open) { open = createDraft(moduleId, scopedLibrary, actor, at); changed = true;
        draftMap.clear(); for (const item of liveItems(open)) draftMap.set(item.id, item); }
      const item = draftMap.get(itemId);
      if (!item) {
        results.push({ itemId, status: 'conflict', reason: '草稿檢查項目已刪除' }); continue;
      }
      updateItem(item, moduleId, target);
      results.push({ itemId, status: 'applied' }); changed = true;
    }
    const contextResults=results.slice(resultStart);
    if (scopeKey) contextResults.forEach(result=>{result.scopeKey=scopeKey;});
    if (contextResults.some(row=>row.status==='conflict')) {
      scopedLibrary.versions=previousVersions;
      changed=previouslyChanged;
      for (const result of contextResults) if (result.status==='applied') {
        result.status='conflict'; result.reason='同草稿其他項目衝突，本草稿整批未套用';
      }
      continue;
    }
    if (contextResults.some(row=>row.status==='applied') && open?.status === 'draft') {
      open.revision = (open.revision || 0) + 1; open.updatedAt = at;
      open.history ||= [];
      open.history.push({ action: 'equipment-replaced', actorId: actor.id, actorName: actor.name,
        at, comment: `${sourceId} → ${targetId}; ${contextResults.filter(row => row.status === 'applied').length} items` });
      versionUpdates.push({scopeKey,id:open.id,revision:open.revision});
    }
    lastOpen=open;
    }
    if (!changed) return reply({ revision: state.revision, results, unchanged: true });
    const values: Record<string, string> = { ...state.values, routineEquipmentControl: JSON.stringify(routine) };
    if (moduleId === 'fqc') values.qualityMasterControl = JSON.stringify(quality);
    else values[replacementModules[moduleId].key] = JSON.stringify(moduleId==='ipqc-ab'?ipqcAB:library);
    if(!await stateRevisionIsCurrent(state))
      return reply({error:'修訂衝突，沒有儲存',revision:(await readState()).revision},409);
    const update = await env.DB.prepare('UPDATE shared_state SET revision=?, "values"=?, updated_at=? WHERE id=1 AND revision=?')
      .bind(state.revision + 1, await encodeValues(values,state), at, state.revision).run();
    if (update.meta.changes !== 1) return reply({ error: '修訂衝突，沒有儲存', revision: (await readState()).revision }, 409);
    return reply({ revision: state.revision + 1, results, versionId: lastOpen?.id || '', versionRevision: lastOpen?.revision || 0, versionUpdates });
  } catch (error) {
    console.error('[equipment-replacement] write failed', error);
    return reply({ error: error instanceof Error ? error.message : '檢具替換失敗' }, 500);
  }
}
