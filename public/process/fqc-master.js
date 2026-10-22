(function (host) {
  const displayDraftError = error => window.sharedDraftErrorMessage?.(error) ?? (typeof error === 'string' ? error : error?.message || String(error ?? ''));
  // FormData yields native strings/Files; preserve the historical File tag conversion.
  function nativeFormValueText(value) {
    if (typeof value === 'string') return value;
    if (value === null) return '';
    return Object.prototype.toString.call(value);
  }

  const STORAGE = 'qualityMasterControl';
  const dbKeys = ['fqc', 'iqc', 'ipqc', 'routineReports'];
  const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const clone = value => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  let control = null, hostElement = null, mountSequence = 0;
  let sharedClient,sharedActor='',syncBase=null,syncGeneration=null,sharedPoll;
  const sharedFields={errors:['name','isDeleted'],items:['name','description','errorId','tool','equipmentId','equipmentSnapshot','mediaItems','isEnabled','rule','isMonthly','isQuarterly','isYearly','isCustomPeriod','customPeriodText','productCodes','productRefs','products','reason','note','isDeleted']};
  function transport(){const id=identity()?.id;if(!id)throw Error('LOGIN_REQUIRED');if(sharedActor!==id){sharedActor=id;sharedClient=window.createSharedDraftClient({endpoint:'/api/fqc/workflow?caseMetadata=1',legacyArchive:true,actorId:id,headers:()=>window.ProcessSync?.platformHeaders?.()||{'Content-Type':'application/json'},permissionGates:{edit:'#fqc-page .matrix-cell,#fqc-add-item,#fqc-add-error,#fqc-page [data-edit-item],#fqc-page [data-edit-error],.fqc-modal-form button[type=submit]',save:'#fqc-save',submit:'#fqc-submit',withdraw:'#fqc-withdraw,#quality-withdraw',history:'#fqc-cases',approve:'#quality-approve',return:'#quality-reject',delete:'#fqc-page [data-delete-item],#fqc-page [data-delete-error]'}});}return sharedClient;}
  function adopt(result){if(!result.control)return;const wasOpen=!selected()||['draft','pending'].includes(selected()?.status);ensureControl().libraries.fqc=result.control;if(wasOpen)ui.selectedVersionId=result.control.versions.find(v=>['draft','pending'].includes(v.status))?.id||result.control.activeVersionId||'';syncBase=clone(result.control.workflow?.working||selected()?.snapshot||{errors:[],items:[]});syncGeneration=result.control.workflow?.generation||null;}
  async function loadShared(isCurrent=()=>true){const r=await transport().read();if(isCurrent())adopt(r);return r;}
  function changes(base,next){const patches=[],guards=[];for(const collection of ['errors','items'])for(const row of next[collection]){const old=base[collection].find(r=>r.id===row.id);if(!old){patches.push({op:'insert',path:[collection],value:row});continue;}
    for(const field of sharedFields[collection])if(row[field]!==undefined&&JSON.stringify(row[field])!==JSON.stringify(old[field])&&!(row[field]===''&&old[field]==null)){const path=[collection,{id:row.id},field];patches.push({op:'set',path,value:row[field]});guards.push({path,value:old[field]});}
  }return{patches,guards};}
  async function sharedAction(action,detail={}){if(ui.saving)throw Error('OPERATION_IN_PROGRESS');ui.saving=true;
    // A request must become visibly busy before its first await. Do not rebuild
    // the open item form just to acknowledge Save (its input is still unsaved).
    hostElement?.querySelectorAll('#fqc-save,#fqc-submit').forEach(button=>{button.disabled=true;});
    const saveButton=hostElement?.querySelector('#fqc-save');if(saveButton&&action==='save')saveButton.textContent=isVi()?'Đang lưu…':'儲存中…';
    try{
    const client=transport();if(client.hasUnknown())throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');
    const local=clone(editable()?.snapshot||library().workflow?.working||{errors:[],items:[]}),base=clone(syncBase||local),generation=syncGeneration;
    if(!library().workflow||action==='begin'){adopt(await client.begin());if(action==='begin'){render();return true;}}
    if(action==='apply'){detail=changes(base,local);if(!detail.patches.length)return true;}
    if(action==='save'){await client.flush();if(document.querySelector('.fqc-modal-overlay')&&!confirm(isVi()?'Chỉ lưu nội dung đã đồng bộ; không bao gồm biểu mẫu chưa áp dụng. Tiếp tục?':'只儲存已同步內容，不包含未套用表單。繼續？'))return false;}
    const formVersion=action==='save'&&document.querySelector('.fqc-modal-overlay')?editable():null;
    const result=await client.command(action==='apply'?generation||library().workflow.generation:library().workflow.generation,action,detail);adopt(result);
    // Save acknowledges synchronized content only; a still-open form retains its
    // original object and diff base so its later Apply cannot silently disappear.
    if(formVersion){const index=library().versions.findIndex(v=>v.id===formVersion.id);if(index>=0)library().versions[index]=formVersion;syncBase=base;syncGeneration=generation;}
    ui.lastError=null;
    window.dispatchEvent(new CustomEvent('fqc-equipment-references-updated'));return result;
  }catch(error){ui.lastError=error.message;throw error;}finally{ui.saving=false;render();}}
  function pollShared(){clearTimeout(sharedPoll);sharedPoll=setTimeout(async()=>{if(!fqcTabIsActive())return;try{if(!ui.saving&&document.visibilityState!=='hidden'){
    const flow=library().workflow,r=await transport().read(flow?flow.generation+':'+flow.revision:'');if(!r.unchanged&&r.control){if(document.querySelector('.fqc-modal-overlay')||document.activeElement?.matches('input,textarea,select')){const status=document.querySelector('#fqc-shared-status');if(status)status.textContent=isVi()?'Nội dung chung đã cập nhật; giữ biểu mẫu đang nhập.':'共用內容已更新；保留正在輸入的表單。';}else{adopt(r);render();}}
  }}catch(error){ui.lastError=error.message;}finally{pollShared();}},4000);}
  const ui = { line: '', category: '', search: '', selectedErrorId: '', matrixOpen: true, problemsOpen: false, selectedVersionId: '', saving: false, lastError: null };

  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
  function identity() { return window.ProcessSync?.identity || (typeof currentUser !== 'undefined' ? currentUser : null); }
  function actor() { const user = identity(); return { id: user?.id || 'unknown', name: user?.name || user?.id || '未記錄' }; }
  function canonicalRecords() { return read('canonicalQuality', { fqc: [] })?.fqc || []; }
  let equipmentCache = null, equipmentLoadError = null;
  async function loadEquipmentCatalog({ force = false } = {}) {
    if (equipmentCache && !force) return equipmentCache;
    try {
      const res = await fetch('/api/routine-equipment', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw Error(json.error || `HTTP ${res.status}`);
      const activeVersionId = json.control?.activeVersionId;
      const emptyControl = json.control;
      if (res.status === 200 && emptyControl?.schemaVersion === 1 && activeVersionId === null &&
          Array.isArray(emptyControl.versions) && emptyControl.versions.length === 0 &&
          Array.isArray(emptyControl.issues) && emptyControl.reservedMarks &&
          typeof emptyControl.reservedMarks === 'object' && !Array.isArray(emptyControl.reservedMarks)) {
        equipmentCache = { activeVersionId: null, equipment: [], categories: [], subcategories: [], groups: [], issues: emptyControl.issues };
        equipmentLoadError = null;
        return equipmentCache;
      }
      const ver = json.control?.versions?.find(v => v.id === activeVersionId && v.status === 'approved');
      if (!ver) throw Error(isVi() ? 'Không tìm thấy phiên bản thiết bị đang có hiệu lực' : '找不到目前生效的檢具版本');
      equipmentCache = {
        activeVersionId,
        equipment: ver.equipment || [],
        categories: ver.categories || [],
        subcategories: ver.subcategories || [],
        groups: ver.groups || [],
        issues: ver.issues || json.control?.issues || []
      };
      equipmentLoadError = null;
      return equipmentCache;
    } catch (e) {
      console.error('[FQC] Failed to load routine equipment', e);
      equipmentLoadError = e instanceof Error ? e : Error(String(e));
      throw equipmentLoadError;
    }
  }
  function getCachedEquipment(id) {
    return equipmentCache?.equipment?.find(e => e.id === id) || null;
  }
  function eqPhotoUrl(item) {
    if (!item) return '';
    if (item.photoId) return `/api/routine-equipment/photo?id=${encodeURIComponent(item.photoId)}`;
    if (item.photoPath) return item.photoPath;
    if (item.photoSource?.webPath) return item.photoSource.webPath;
    return '';
  }
  function equipmentUnavailableReason(item) {
    const vi = isVi();
    if (item.enabled === false) return vi ? 'Thiết bị chưa kích hoạt' : '設備未啟用';
    // FQC's existing selectable rule is the active approved equipment version plus enabled state.
    // Verification/source/calibration fields remain visible in equipment details, but do not add a
    // new exclusion rule here: all imported Local equipment currently retains pending verification.
    return '';
  }
  let masterCatalogCache = null, masterCatalogActor = '', masterCatalogSequence = 0;
  async function loadMasterCatalog(isCurrent = () => true) {
    const owner = identity()?.id, sequence = ++masterCatalogSequence;
    masterCatalogCache = null; masterCatalogActor = '';
    if (!owner) throw Error('LOGIN_REQUIRED');
    const client = window.createSharedDraftClient({ endpoint: '/api/master/workflow?scope=AB&caseMetadata=1', legacyArchive: true, actorId: owner, headers: () => window.ProcessSync?.platformHeaders?.() || { 'Content-Type': 'application/json' } });
    const result = await client.read();
    if (!isCurrent()) return null;
    if (identity()?.id !== owner) throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
    if (sequence !== masterCatalogSequence) throw Error('MASTER_CATALOG_READ_SUPERSEDED');
    const current = result.control, active = Array.isArray(current?.versions) ? current.versions.filter(version => version && version.id === current.activeVersionId && version.status === 'approved') : [];
    const snapshot = active.length === 1 ? active[0].snapshot : null;
    if (result.permissions?.view !== true || typeof current?.activeVersionId !== 'string' || !current.activeVersionId || !snapshot ||
        !Array.isArray(snapshot.products) || !Array.isArray(snapshot.lines) || !Array.isArray(snapshot.categoryGroups))
      throw Error(isVi() ? 'Không thể đọc danh mục AB đang có hiệu lực' : '無法讀取目前生效的 AB 主檔');
    masterCatalogCache = clone(snapshot); masterCatalogActor = owner;
    return masterCatalogCache;
  }
  function catalog() {
    const active = masterCatalogActor === identity()?.id && masterCatalogCache ? { AB: masterCatalogCache } : {};
    const comparisonReady = Array.isArray(active.AB?.products);
    const baseProducts = comparisonReady ? active.AB.products : [];
    const productMap = new Map(baseProducts.map(item => [item.code, {
      code: item.code,
      name: item.name || '',
      specification: item.specification || '',
      category: item.category || '',
      line: item.line || (window.routing?.productRoutes?.[item.code]?.line || ''),
      kind: 'product'
    }]));

    const categoryGroups = active.AB?.categoryGroups || [];
    const catMap = new Map();
    categoryGroups.forEach(g => {
      if (g.name) catMap.set(g.name, { name: g.name, line: g.line || '' });
    });
    baseProducts.forEach(p => {
      if (p.category && !catMap.has(p.category)) {
        catMap.set(p.category, { name: p.category, line: p.line || '' });
      }
    });
    const categories = [...catMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    return { products: [...productMap.values()], categories, productMap, comparisonReady };
  }
  function snapshotFromCanonical() {
    const records = canonicalRecords().filter(record => !record.deletedAt);
    return {
      errors: records.filter(record => record.type === 'error-code').map(record => clone(record.data || record)),
      items: records.filter(record => record.type === 'check-item').map(record => clone(record.data || record)),
    };
  }
  function blankControl() {
    const libraries = Object.fromEntries(dbKeys.map(key => [key, { activeVersionId: null, versions: [] }]));
    const base = snapshotFromCanonical(), timestamp = now();
    if (base.items.length || base.errors.length) {
      const version = { id: 'fqc-v1-approved', number: 'V1', status: 'approved', snapshot: base, source: { sha256: window.FQCExcel?.SOURCE_SHA256 || '', fileName: 'FQC標準 FQC-C TRIL 1.xlsx' }, createdAt: timestamp, updatedAt: timestamp, creatorId: 'canonical-import', creatorName: 'Canonical FQC 匯入', revision: 1, history: [{ action: 'imported', label: '由核對後的 Excel 標準資料建立', actor: 'Canonical FQC 匯入', at: timestamp }] };
      libraries.fqc.versions.push(version); libraries.fqc.activeVersionId = version.id;
    }
    return { schemaVersion: 1, libraries };
  }
  function ensureControl() {
    if (control) return control;
    control = read(STORAGE, null);
    if (!control) control = blankControl();
    control.libraries ||= {};
    dbKeys.forEach(key => { control.libraries[key] ||= { activeVersionId: null, versions: [] }; });
    return control;
  }
  function library() { return ensureControl().libraries.fqc; }
  function versions() { return [...library().versions].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')); }
  function selected() {
    const list = versions();
    return list.find(version => version.id === ui.selectedVersionId) || list.find(version => version.status === 'draft') || list.find(version => version.status === 'pending') || list.find(version => version.id === library().activeVersionId) || list[0] || null;
  }
  function editable() { const version = selected(); return version?.status === 'draft' ? version : null; }
  function approved() { return library().versions.find(version => version.id === library().activeVersionId) || null; }
  function statusLabel(status) { return (isVi() ? { draft:'Bản nháp', pending:'Đang chờ quản lý duyệt', approved:'Đã duyệt', superseded:'Lịch sử đã duyệt' } : { draft:'草稿', pending:'主管審核中', approved:'已核准', superseded:'歷史核准' })[status] || status; }
  function displayScalar(...values) {
    for(const value of values){if(typeof value==='string'&&value.trim())return value;if(typeof value==='number'&&Number.isFinite(value))return String(value);}
    return '';
  }
  function reviewActor(version) { return displayScalar(version?.reviewedBy,version?.reviewerName,version?.reviewerId); }
  function historyDisplay(event) {
    const labels=isVi()?{submit:'Gửi duyệt',approved:'Đã duyệt',returned:'Đã trả lại',withdrawn:'Đã rút'}:{submit:'送出審核',approved:'已核准',returned:'已發回',withdrawn:'已撤回'};
    return {label:displayScalar(event?.label,labels[event?.action],event?.action),actor:displayScalar(event?.actorName,event?.actor),note:typeof event?.comment==='string'?event.comment:displayScalar(event?.note)};
  }
  function lastEdit(version) { return [...(version?.history||[])].reverse().find(event=>!['submit','submitted','approved','returned','revision-requested','withdrawn'].includes(event.action)); }
  function record(version, action, label, note = '') { const who = actor(); version.history ||= []; version.history.push({ action, label, note, actor: who.name, actorId: who.id, at: now() }); version.updatedAt = now(); version.updatedBy = who.id; version.revision = (version.revision || 0) + 1; }
  async function persist(message = '草稿已儲存') {
    if(library().workflow||selected()?.status==='draft')return sharedAction('apply');
    if (window.ProcessSync?.loadError) throw Error('後端資料載入失敗，已停止寫入以保護既有草稿');
    ui.saving = true; render();
    localStorage.setItem(STORAGE, JSON.stringify(control));
    try {
      const ok = await window.ProcessSync?.flush?.();
      ui.saving = false;
      if (ok !== true) {
        const err = window.ProcessSync?.status === 'conflict' ? '資料已由其他分頁更新；舊草稿未覆蓋新資料' : '伺服器尚未完成儲存，輸入仍保留在目前頁面';
        ui.lastError = err;
        render();
        throw Error(err);
      }
      ui.lastError = null;
      window.dispatchEvent(new CustomEvent('fqc-equipment-references-updated', {
        detail: { versionId: selected()?.id || '', revision: window.ProcessSync?.revision || null }
      }));
      render();
      toast(message);
      return true;
    } catch (error) {
      ui.saving = false;
      ui.lastError = error.message || '儲存失敗';
      render();
      throw error;
    }
  }
  const canEditDraft=()=>!!identity()&&(window.sharedDraftPermissionAllowed?.(sharedClient,'edit')??(typeof window.hasPermission==='function'?window.hasPermission('view:data'):identity()?.role==='admin'));
  const canWithdrawDraft=()=>!!identity()&&(window.sharedDraftPermissionAllowed?.(sharedClient,'withdraw')??(typeof window.hasPermission==='function'?window.hasPermission('view:data')||window.hasPermission('approval.withdraw'):identity()?.role==='admin'));
  async function beginDraft() {
    if (!canEditDraft()) return toast('沒有編輯 FQC 草稿權限');
    try{return await sharedAction('begin');}catch(error){toast(displayDraftError(error));return;}
  }
  async function submitDraft() {
    const version = editable(); if (!version) return;
    try{if(!library().workflow)await sharedAction('begin');const saved=library().workflow.saved;if(!saved)throw Error('SUCCESSFUL_SAVE_REQUIRED');
      const reason=await window.VersionDraftUI.confirmSubmit(window.VersionDraftUI.reasonFor(version,library().workflow), 'FQC');if(!reason)return;

      await sharedAction('submit',{savedId:saved.id,reason});return;
    }catch(error){toast(displayDraftError(error));return;}
  }
  async function withdrawDraft() {
    const version = selected();
    if (!version || version.status !== 'pending') return;
    if(library().workflow){try{const answer=await window.VersionDraftUI.confirmReview({action:'withdraw',scope:'FQC · '+version.id});if(answer)await sharedAction('withdraw',{caseId:version.id,...answer});}catch(error){toast(displayDraftError(error));}return;}
    const user = identity();
    if (!user || (user.role !== 'admin' && user.id !== version.submittedBy && user.id !== version.creatorId)) {
      return toast(isVi() ? 'Không có quyền rút hồ sơ' : '沒有解除送審權限');
    }
    if (!confirm(isVi() ? `Xác nhận rút hồ sơ FQC ${version.number} và khôi phục bản nháp để tiếp tục sửa?` : `確定解除送審 FQC ${version.number} 並恢復原草稿編輯？`)) return;
    version.status = 'draft';
    version.submittedAt = '';
    record(version, 'withdrawn', '解除送審，恢復草稿', '');
    try {
      await persist(isVi() ? 'FQC đã rút hồ sơ, tiếp tục sửa' : 'FQC 已解除送審，恢復草稿可編輯');
    } catch (err) {
      toast(displayDraftError(err));
    }
  }
  function effectiveProducts(category) { return catalog().products.filter(product => product.category === category); }
  function filteredCategories(_version) {
    const cats = catalog().categories;
    return cats.filter(item => !ui.line || item.line === ui.line).sort((a, b) => a.name.localeCompare(b.name));
  }
  function categoryName(version) {
    const options = filteredCategories(version);
    if (!options.some(item => item.name === ui.category)) {
      ui.category = options.find(item => (version?.snapshot.errors || []).some(error => !error.isDeleted && error.category === item.name))?.name || options[0]?.name || '';
    }
    return ui.category;
  }
  function errorRows(version, category) { return (version?.snapshot.errors || []).filter(error => !error.isDeleted && error.category === category); }
  function itemRows(version, category, errorId = '') { return (version?.snapshot.items || []).filter(item => !item.isDeleted && item.category === category && (!errorId || item.errorId === errorId)); }
  function uncovered(version, category) {
    const enabled = itemRows(version, category).filter(item => item.isEnabled);
    return effectiveProducts(category).filter(product => !enabled.some(item => (item.productCodes || []).includes(product.code)));
  }
  function formatDate(value) { return window.VersionDraftUI?.date(value) || '—'; }
  function getItemRule(item) {
    if (item.rule) {
      return item.rule;
    }
    const periods = [];
    if (item.isMonthly) periods.push('monthly');
    if (item.isQuarterly) periods.push('quarterly');
    if (item.isYearly) periods.push('yearly');
    if (item.isCustomPeriod && (item.customPeriodText || '').trim()) periods.push('custom');

    if (periods.length === 0) {
      return { cadence: 'none' };
    }
    if (periods.length === 1) {
      const p = periods[0];
      return {
        cadence: 'time',
        timeFrequency: p,
        customTimeText: p === 'custom' ? (item.customPeriodText || '') : ''
      };
    }
    return {
      cadence: 'pending_confirmation',
      legacyPeriods: periods,
      customPeriodText: item.customPeriodText || ''
    };
  }

  function ruleSummaryHTML(item) {
    const rule = getItemRule(item);
    const vi = isVi();
    if (rule.cadence === 'pending_confirmation') {
      return `<span class="fqc-rule-badge pending" title="${vi ? 'Nhiều chu kỳ cũ, cần chọn một quy tắc đơn' : '包含多個舊週期，請確認並選定單一檢查規則'}">⚠️ ${vi ? 'Chờ xác nhận quy tắc' : '待確認單一檢查規則'}</span>`;
    }
    if (rule.cadence === 'none' || !rule.cadence) {
      return `<span class="fqc-rule-badge none">${vi ? 'Chưa thiết lập' : '未設定'}</span>`;
    }
    if (rule.cadence === 'batch') {
      let desc = '';
      if (rule.batchKind === 'aql') desc = `AQL ${rule.aqlValue || ''}`;
      else if (rule.batchKind === 'fixed_count') desc = vi ? `Cố định ${rule.fixedCount} cái` : `固定件數 ${rule.fixedCount} 件`;
      else if (rule.batchKind === 'batch_quantity') desc = vi ? `Số lượng lô ${rule.batchQuantity}` : `批次數量 ${rule.batchQuantity}`;
      else if (rule.batchKind === 'custom') desc = `${vi ? 'Tùy chỉnh' : '自訂'} (${rule.customBatchText || ''}：${rule.customBatchValue || ''})`;
      else desc = vi ? 'Theo lô' : '按批次';
      return `<span class="fqc-rule-badge batch" title="${h(desc)}">${vi ? 'Theo lô' : '按批次'} · ${h(desc)}</span>`;
    }
    if (rule.cadence === 'time') {
      const freqLabels = {
        weekly: vi ? 'Hàng tuần' : '每週',
        monthly: vi ? 'Hàng tháng' : '每月',
        quarterly: vi ? 'Hàng quý' : '每季',
        half_yearly: vi ? 'Nửa năm' : '每半年',
        yearly: vi ? 'Hàng năm' : '每年',
        custom: (vi ? 'Tùy chỉnh: ' : '自訂: ') + (rule.customTimeText || '')
      };
      const desc = freqLabels[rule.timeFrequency] || (vi ? 'Theo thời gian' : '按時間');
      return `<span class="fqc-rule-badge time" title="${h(desc)}">${vi ? 'Theo thời gian' : '按時間'} · ${h(desc)}</span>`;
    }
    return `<span class="fqc-rule-badge none">${vi ? 'Chưa thiết lập' : '未設定'}</span>`;
  }

  function getVersionProblems(version) {
    const list = [];
    if (ui.lastError) {
      list.push({
        id: 'runtime-error',
        type: 'error',
        target: isVi() ? 'Lỗi hệ thống / lưu trữ' : '系統／儲存錯誤',
        message: ui.lastError,
        action: 'retry',
        actionText: isVi() ? 'Thử lại' : '重試'
      });
    }
    const cat = catalog();
    const abProductMap = cat.productMap;
    const vi = isVi();
    const items = version?.snapshot?.items || [];
    if (!cat.comparisonReady) {
      list.push({
        id: 'ab-catalog-unavailable',
        type: 'warning',
        target: vi ? 'Danh mục sản phẩm AB' : 'AB 產品主檔',
        message: vi ? 'Không tải được phiên bản AB đang có hiệu lực; đã tạm dừng đối chiếu liên kết sản phẩm.' : '目前生效的 AB 產品主檔尚未載入，產品關聯比對已暫停。',
        advice: vi ? 'Tải lại trang sau khi danh mục AB hoạt động bình thường. Hệ thống sẽ không tự xóa liên kết.' : '請在 AB 主檔恢復後重新整理；系統不會自動移除任何產品關聯。'
      });
    }
    items.forEach(item => {
      if (item.isDeleted) return;
      const rule = getItemRule(item);
      if (rule.cadence === 'pending_confirmation') {
        const periodNames = (rule.legacyPeriods || []).map(p => ({
          monthly: vi ? 'Tháng' : '月',
          quarterly: vi ? 'Quý' : '季',
          yearly: vi ? 'Năm' : '年',
          custom: vi ? 'Tùy chỉnh' : '自訂'
        })[p] || p).join('、');
        list.push({
          id: `pending-rule-${item.id}`,
          type: 'pending',
          itemId: item.id,
          category: item.category,
          errorId: item.errorId,
          checkNo: item.checkNo,
          name: item.name,
          target: `${item.category} / ${item.checkNo} · ${item.name}`,
          message: vi ? `Thiết lập nhiều chu kỳ cũ (${periodNames}), cần chọn một quy tắc đơn.` : `歷史資料包含多個週期（${periodNames}），請確認並選定單一有效檢查規則。`,
          advice: vi ? 'Nhấn "Đến sửa" để chọn một nhóm quy tắc Theo lô hoặc Theo thời gian rồi lưu lại.' : '請點擊「前往修正」，選擇「按批次」或「按時間」之單一檢查規則後儲存草稿。',
          action: 'fix',
          actionText: vi ? 'Đến sửa' : '前往修正'
        });
      }

      // Check product code associations against approved AB master data
      if (cat.comparisonReady) (item.productCodes || []).forEach(code => {
        const abProd = abProductMap.get(code);
        if (!abProd) {
          list.push({
            id: `prod-not-in-ab-${item.id}-${code}`,
            type: 'warning',
            itemId: item.id,
            category: item.category,
            errorId: item.errorId,
            checkNo: item.checkNo,
            target: `${item.category} / ${item.checkNo} · 產品 ${code}`,
            message: vi ? `Mã SP ${code} không tồn tại trong danh mục AB đã duyệt (có thể là bán thành phẩm hoặc mã cũ).` : `產品編號【${code}】未存在於目前已核准之 AB 產品主檔中（可能為半成品或歷史編號）。`,
            advice: vi ? 'Nhấn "Đến sửa" để xem lại và điều chỉnh danh sách sản phẩm áp dụng.' : '請點擊「前往修正」，檢視此項目並視需要從包含產品中移除。',
            action: 'fix',
            actionText: vi ? 'Đến sửa' : '前往修正'
          });
        } else if (abProd.category && abProd.category !== item.category) {
          list.push({
            id: `prod-cat-mismatch-${item.id}-${code}`,
            type: 'warning',
            itemId: item.id,
            category: item.category,
            errorId: item.errorId,
            checkNo: item.checkNo,
            target: `${item.category} / ${item.checkNo} · 產品 ${code}`,
            message: vi ? `Sản phẩm ${code} trong nguồn AB thuộc nhóm 【${abProd.category}】, không khớp với tiêu chuẩn nhóm 【${item.category}】.` : `產品【${code}】在 AB 主檔中屬於類別【${abProd.category}】，與此標準類別【${item.category}】不符。`,
            advice: vi ? 'Nhấn "Đến sửa" để điều chỉnh liên kết sản phẩm này.' : '請點擊「前往修正」調整產品關聯。',
            action: 'fix',
            actionText: vi ? 'Đến sửa' : '前往修正'
          });
        }
      });

      // Check equipment association
      if (item.equipmentId && equipmentCache) {
        const eq = getCachedEquipment(item.equipmentId);
        if (!eq) {
          list.push({
            id: `eq-missing-${item.id}`,
            type: 'warning',
            itemId: item.id,
            category: item.category,
            errorId: item.errorId,
            checkNo: item.checkNo,
            target: `${item.category} / ${item.checkNo}`,
            message: vi ? `Thiết bị liên kết (ID: ${item.equipmentId}) không tồn tại trong danh mục thiết bị.` : `關聯之檢具 (ID: ${item.equipmentId}) 不存在於設備清單中。`,
            advice: vi ? 'Nhấn "Đến sửa" để chọn lại thiết bị kiểm tra hoặc chuyển sang kiểm tra bằng mắt.' : '請點擊「前往修正」重新選擇有效檢具或切換為目視檢查。',
            action: 'fix',
            actionText: vi ? 'Đến sửa' : '前往修正'
          });
        } else if (eq.enabled === false) {
          list.push({
            id: `eq-disabled-${item.id}`,
            type: 'warning',
            itemId: item.id,
            category: item.category,
            errorId: item.errorId,
            checkNo: item.checkNo,
            target: `${item.category} / ${item.checkNo} · ${eq.assetCode}/${eq.pieceMark}`,
            message: vi ? `Thiết bị 【${eq.assetCode}/${eq.pieceMark}】 đã ngưng kích hoạt.` : `關聯檢具【${eq.assetCode}／${eq.pieceMark}】已被設為未啟用。`,
            advice: vi ? 'Nhấn "Đến sửa" để thay thế bằng thiết bị còn hiệu lực.' : '請點擊「前往修正」替換為有效檢具。',
            action: 'fix',
            actionText: vi ? 'Đến sửa' : '前往修正'
          });
        }
      }
    });
    return list;
  }

  function problemsCardHTML(version, kind = 'missing') {
    const problems = getVersionProblems(version).filter(problem => (problem.type === 'error') === (kind === 'error'));
    const vi = isVi();
    const isOpen = ui.problemsOpen;
    if (!problems.length) return '';
    return `
      <details class="master-history fqc-problems-card has-issues" data-fqc-issue-kind="${kind}" ${isOpen ? 'open' : ''} id="${kind === 'error' ? 'fqc-errors-details' : 'fqc-problems-details'}">
        <summary>⚠️ <b>${kind === 'error' ? (vi ? 'Lỗi' : '報錯') : (vi ? 'Cần bổ sung / xác nhận' : '待補／待確認')} · ${problems.length} ${vi ? 'mục cần xử lý' : '項待處理'}</b></summary>
        <div class="fqc-problems-banner">
          <p>${vi ? 'Các mục dưới đây cần xác nhận hoặc xử lý theo hướng dẫn:' : '以下項目需要確認或依說明修正，完成後請儲存草稿：'}</p>
        </div>
        <div class="fqc-problems-list">
          ${problems.map(p => `
            <div class="fqc-problem-item">
              <div class="fqc-problem-item-info">
                <b>${h(p.target)}</b>
                <p>${h(p.id === 'runtime-error' ? displayDraftError(p.message) : p.message)}</p>
                ${p.advice ? `<small style="color:#03543f">💡 ${h(p.advice)}</small>` : ''}
              </div>
              ${p.action === 'fix' ? `
                <button type="button" class="fqc-action-fix" data-fix-item="${h(p.itemId)}" data-fix-cat="${h(p.category)}" data-fix-err="${h(p.errorId)}">
                  ${h(p.actionText)}
                </button>
              ` : p.action === 'retry' ? `
                <button type="button" class="fqc-action-fix" id="fqc-retry-save">
                  ${h(p.actionText)}
                </button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </details>
    `;
  }

  function displayName(item) {
    return item?.name || item?.nameVi || item?.nameZh || '';
  }
  function toolCellHTML(item) {
    const vi = isVi();
    if (item.equipmentId) {
      const eq = getCachedEquipment(item.equipmentId) || item.equipmentSnapshot;
      const photoSrc = eqPhotoUrl(eq);
      const code = eq ? `${eq.assetCode}／${eq.pieceMark}` : (item.tool || '檢具');
      const name = eq ? (displayName(eq) || eq.name || '') : '';
      return `<div class="fqc-tool-cell">
        ${photoSrc ? `<img src="${h(photoSrc)}" alt="" class="fqc-tool-thumb">` : '<span class="fqc-tool-thumb placeholder">◇</span>'}
        <div class="fqc-tool-meta">
          <a href="javascript:void(0)" class="fqc-eq-link" data-view-eq-id="${h(item.equipmentId)}" title="${vi ? 'Xem chi tiết thiết bị' : '查看檢具詳細資訊'}"><b>${h(code)}</b></a>
          ${name ? `<small class="fqc-tool-name" data-i18n-skip="true">${h(name)}</small>` : ''}
        </div>
      </div>`;
    }
    if (item.tool && !/^(Mắt|目視檢查|Kiểm tra bằng mắt)/i.test(item.tool)) {
      return `<span class="fqc-tool-text" data-i18n-skip="true">${h(item.tool)}</span>`;
    }
    return `<span class="fqc-tool-visual">👁 ${vi ? 'Kiểm tra bằng mắt' : '目視檢查'}</span>`;
  }
  function html() { return '<section class="fqc-page" id="fqc-page" data-i18n-skip="true"><div class="fqc-loading">'+(isVi()?'Đang tải dữ liệu FQC…':'正在載入 FQC 標準資料…')+'</div></section>'; }
  function render() {
    const focused=hostElement?.contains(document.activeElement)?document.activeElement:null,focusId=focused?.id,selectionStart=focused?.selectionStart,selectionEnd=focused?.selectionEnd;
    if (!fqcTabIsActive()) return;
    const matrixScroll = hostElement.querySelector('.fqc-matrix-scroll');
    const scroll = { x:matrixScroll?.scrollLeft || 0, y:matrixScroll?.scrollTop || 0, page:window.scrollY };
    ensureControl(); const version = selected();
    if (!version) { hostElement.innerHTML = emptyHTML(); bindEvents(); return; }
    const category = categoryName(version), errors = errorRows(version, category);
    if (!errors.some(error => error.id === ui.selectedErrorId)) ui.selectedErrorId = errors[0]?.id || '';
    const selectedError = errors.find(error => error.id === ui.selectedErrorId), items = itemRows(version, category, ui.selectedErrorId);
    const products = effectiveProducts(category), uncoveredProducts = uncovered(version, category), canEdit = version.status === 'draft' && canEditDraft() && (window.sharedDraftPermissionAllowed?.(sharedClient,'edit')??true);
    hostElement.innerHTML = `<section class="fqc-page" id="fqc-page">
      <section class="master-version-bar fqc-version-bar">
        <div>
          <small>FQC MASTER CONTROL</small>
          <h2>FQC - ${h(version.number)} <span class="master-status fqc-status ${h(version.status)}">${h(statusLabel(version.status))}</span></h2>
          <p>${isVi()?'Người sửa cuối':'最後編輯'}：${h(displayScalar(historyDisplay(lastEdit(version)).actor,version.creatorName)||'—')} · ${formatDate(lastEdit(version)?.at || version.createdAt)}<br>${isVi()?'Đang có hiệu lực':'目前生效'}：${h(approved()?.number || (isVi()?'Chưa có':'尚無'))}${version.submittedBy?`<br>${isVi()?'Người gửi':'送審者'}：${h(version.submittedBy)} · ${formatDate(version.submittedAt)}`:''}${reviewActor(version)?`<br>${isVi()?'Người duyệt':'確認／發回者'}：${h(reviewActor(version))} · ${formatDate(version.reviewedAt)}`:''}</p>
        </div>
        <div class="master-version-actions fqc-version-actions">
          <div class="fqc-version-select-wrap">
            <label>選擇版本／草稿</label>
            <select id="fqc-version">${versions().map(item => `<option value="${h(item.id)}" ${item.id === version.id ? 'selected' : ''}>${h(item.number)} · ${h(statusLabel(item.status))} · ${h(displayScalar(historyDisplay(lastEdit(item)).actor,item.creatorName))} · ${formatDate(lastEdit(item)?.at || item.createdAt)}</option>`).join('')}</select>
          </div>
          ${version.status === 'approved' && canEditDraft() ? '<button class="button signal" id="fqc-begin">開始修改／刪除資料</button>' : ''}
          ${canEdit ? `<button class="button ghost" id="fqc-save" ${ui.saving ? 'disabled' : ''}>${ui.saving ? '儲存中…' : '儲存草稿'}</button><button class="button signal" id="fqc-submit">送出主管審核</button>` : ''}
          ${version.status === 'pending' && canWithdrawDraft() ? '<button class="button ghost" id="fqc-withdraw">解除送審</button>' : ''}
        </div>
      </section>
      ${problemsCardHTML(version, 'error')}${problemsCardHTML(version)}
      <details class="master-history fqc-activity"><summary>${isVi()?'Lịch sử thao tác':'歷史操作'} · ${(version.history||[]).length}</summary>${(version.history||[]).slice().reverse().map(event=>{const entry=historyDisplay(event);return `<p>${h(entry.label)} · ${h(entry.actor)} · ${formatDate(event.at)} ${entry.note?h(entry.note):''}</p>`;}).join('') || `<p>${isVi()?'Chưa có thao tác':'尚無操作紀錄'}</p>`}</details>
      <section class="master-toolbar fqc-toolbar">
        <div class="field">
          <label>線別</label>
          <select id="fqc-line"><option value="">全部線別</option>${['A','B','C'].map(line => `<option ${ui.line === line ? 'selected' : ''}>${line}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>產品類別</label>
          <select id="fqc-category">${filteredCategories(version).map(item => `<option value="${h(item.name)}" ${item.name === category ? 'selected' : ''}>${h(item.name)}${item.line ? ` · ${h(item.line)}線` : ''}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>搜尋產品</label>
          <input id="fqc-search" value="${h(ui.search)}" placeholder="編號或名稱" data-i18n-skip="true">
        </div>
        <div class="actions">
          ${canEdit ? '<button class="button signal" id="fqc-add-error">＋ 新增錯誤代碼</button>' : ''}
        </div>
      </section>
      <div class="master-summary fqc-summary">
        <span>${errors.length} 個錯誤代碼</span>
        <span>${itemRows(version, category).length} 個檢查項目</span>
        <span>${products.length} 個類別產品</span>
        <span>${uncoveredProducts.length} 個未涵蓋</span>
      </div>
      <section class="panel">
        <div class="panel-head">
          <h3>錯誤代碼</h3>
        </div>
        <div class="fqc-table-wrap">
          <table class="fqc-table fqc-error-table">
            <thead><tr><th class="col-error-code">錯誤代碼</th><th class="col-error-name">名稱</th><th class="col-error-count">檢查項目</th><th class="col-error-actions">操作</th></tr></thead>
            <tbody>
              ${errors.map(error => `<tr data-error-id="${h(error.id)}" class="${error.id === ui.selectedErrorId ? 'selected' : ''}"><td class="col-error-code"><code>${h(error.code)}</code></td><td class="col-error-name"><span data-i18n-skip="true">${h(error.name)}</span></td><td class="col-error-count">${itemRows(version, category, error.id).length}</td><td class="col-error-actions"><div class="master-row-actions">${canEdit ? `<button class="master-small" data-edit-error="${h(error.id)}">修改</button><button class="master-small danger" data-delete-error="${h(error.id)}">刪除</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="4">此類別尚無錯誤代碼</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head">
          <h3><span data-i18n-skip="true">${h(selectedError?.name || '未選擇錯誤代碼')}</span> · 檢查項目 ${selectedError ? `(<code>${h(selectedError.code)}</code>)` : ''}</h3>
          ${canEdit && selectedError ? '<button class="button signal" id="fqc-add-item">＋ 新增檢查項目</button>' : ''}
        </div>
        <div class="fqc-table-wrap">
          <table class="fqc-table fqc-item-table">
            <thead><tr><th class="col-item-no">檢查編號／項目</th><th class="col-item-photo">圖片</th><th class="col-item-tool">檢查工具</th><th class="col-item-rule">${isVi() ? 'Quy tắc kiểm tra' : '檢查規則'}</th><th class="col-item-products">包含產品</th><th class="col-item-status">${isVi() ? 'Trạng thái' : '標準狀態'}</th><th class="col-item-actions">操作</th></tr></thead>
            <tbody>
              ${items.map(item => {
                const photo = (item.mediaItems || [])[0];
                const photoCount = (item.mediaItems || []).length;
                const isEnabled = item.isEnabled !== false;
                return `<tr>
                  <td class="col-item-no">
                    <div class="fqc-item-title-group">
                      <code>${h(item.checkNo)}</code>
                      <b data-i18n-skip="true">${h(item.name)}</b>
                    </div>
                    ${item.description ? `<p class="fqc-item-desc" data-i18n-skip="true">${h(item.description)}</p>` : ''}
                  </td>
                  <td class="col-item-photo">
                    ${photo ? `
                      <button type="button" class="fqc-thumb-trigger" data-view-item="${h(item.id)}" aria-label="${h(photo.name || (isVi() ? 'Xem ảnh' : '查看圖片'))}">
                        <img src="${h(photo.src)}" alt="" class="fqc-thumb-img">
                        ${photoCount > 1 ? `<span class="fqc-thumb-count">${photoCount}</span>` : ''}
                      </button>
                    ` : '<span class="fqc-no-photo-text">無</span>'}
                  </td>
                  <td class="col-item-tool">
                    ${toolCellHTML(item)}
                  </td>
                  <td class="col-item-rule">
                    ${ruleSummaryHTML(item)}
                  </td>
                  <td class="col-item-products">
                    <div class="fqc-item-products-tags">
                      ${(item.productCodes || []).map(code => `<code>${h(code)}</code>`).join(' ')}
                    </div>
                  </td>
                  <td class="col-item-status">
                    <span class="fqc-status-tag ${isEnabled ? 'enabled' : 'disabled'}">
                      ${isEnabled ? (isVi() ? 'Đang dùng' : '啟用中') : (isVi() ? 'Đã tắt' : '已停用')}
                    </span>
                  </td>
                  <td class="col-item-actions">
                    <div class="master-row-actions">
                      <button class="master-small" data-routine-history="${h(item.id)}">${isVi()?'Lịch sử kiểm tra':'例行檢查回查'}</button>
                      ${canEdit ? `
                        <button class="master-small" data-edit-item="${h(item.id)}">修改</button>
                        <button class="master-small danger" data-delete-item="${h(item.id)}">刪除</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>`;
              }).join('') || '<tr><td colspan="7">此錯誤代碼尚無檢查項目</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
      <details class="master-history fqc-matrix" ${ui.matrixOpen ? 'open' : ''}>
        <summary>產品與檢查項目矩陣 · ${category}</summary>
        ${matrixHTML(version, category, products, canEdit)}
      </details>
      <section class="panel fqc-uncovered-panel">
        <div class="panel-head">
          <h3>未涵蓋產品 · ${uncoveredProducts.length} 個</h3>
        </div>
        <div class="fqc-table-wrap">
          <table class="fqc-table fqc-uncovered-table">
            <thead>
              <tr>
                <th style="width: 140px;">產品編號</th>
                <th style="min-width: 180px;">產品名稱</th>
                <th>規格</th>
              </tr>
            </thead>
            <tbody>
              ${uncoveredProducts.map(p => `
                <tr>
                  <td><code>${h(p.code)}</code></td>
                  <td><span data-i18n-skip="true">${h(p.name)}</span></td>
                  <td><span data-i18n-skip="true">${h(p.specification || '—')}</span></td>
                </tr>
              `).join('') || '<tr><td colspan="3">目前所有產品皆已涵蓋於有效標準</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </section>`;
    bindEvents();
    if(library().workflow){const flow=library().workflow,bar=document.createElement('section');bar.className='master-version-bar';bar.innerHTML=`<p id="fqc-shared-status" role="status">${h(ui.lastError ? displayDraftError(ui.lastError) : `${isVi()?'Bản nháp chung toàn bộ FQC':'FQC 全庫共用草稿'} · ${flow.saved&&JSON.stringify(flow.saved.content)===JSON.stringify(flow.working)?(isVi()?'Đã lưu':'已儲存'):(isVi()?'Chưa lưu':'尚未儲存')} · ${isVi()?'Người lưu':'儲存者'}: ${flow.saved?.actor.name||'—'}`)}</p><button id="fqc-cases" class="button ghost">${isVi()?'Hồ sơ gửi duyệt':'送審案件'}</button>${transport().hasUnknown()?'<button id="fqc-check-result">'+(isVi()?'Kiểm tra kết quả':'查詢前次結果')+'</button>':''}`;hostElement.querySelector('#fqc-page').prepend(bar);
      bar.querySelector('#fqc-cases').onclick=()=>window.openSharedDraftHistory({client:transport(),editable:()=>!!editable()&&identity()?.role==='admin',onApplied:async r=>{adopt(r);render();}}).catch(e=>toast(displayDraftError(e)));
      bar.querySelector('#fqc-check-result')?.addEventListener('click',async()=>{try{await transport().resolveUnknown();await loadShared();render();}catch(e){toast(displayDraftError(e));}});
    }
    const matrix = hostElement.querySelector('.fqc-matrix-scroll');
    if (matrix) { matrix.scrollLeft = scroll.x; matrix.scrollTop = scroll.y; }
    sharedClient?.gatePermissions?.();
    window.renderSharedDraftValidation?.({client:sharedClient,flow:library().workflow,after:hostElement.querySelector('#fqc-shared-status')?.parentElement,language:isVi()?'vi':'zh',onLocate:issue=>{
      const id=issue.path?.[1]?.id,version=editable();if(!version)return;
      const item=version.snapshot.items.find(row=>row.id===id),error=version.snapshot.errors.find(row=>row.id===(item?.errorId||id));
      ui.search='';if(error){ui.category=error.category;ui.selectedErrorId=error.id;}render();if(item)openItemModal(item.id,'',true);else if(error)openErrorModal(error.id);
    }});
    window.VersionDraftUI?.mount(hostElement,{header:'.fqc-version-bar',historyClient:transport,module:'FQC',scope:isVi()?'Toàn bộ FQC':'FQC 全庫',version,versions:versions(),active:approved(),flow:library().workflow,busy:ui.busy,failed:!!ui.lastError||sharedClient?.hasUnknown(),actions:{begin:'#fqc-begin',save:'#fqc-save',submit:'#fqc-submit',withdraw:'#fqc-withdraw'},review:()=>{state.view='approval';state.approvalTab='quality';window.render();},errors:'[data-fqc-issue-kind="error"],[data-shared-issue-kind="error"]',missing:'[data-fqc-issue-kind="missing"],[data-shared-issue-kind="missing"]',checked:{errors:true,missing:true},history:['.fqc-activity','#fqc-cases','[data-shared-issue-kind="warning"]'],status:['#fqc-shared-status']});
    if(focusId){const field=hostElement.querySelector('#'+CSS.escape(focusId));field?.focus({preventScroll:true});if(field?.setSelectionRange&&Number.isInteger(selectionStart))try{field.setSelectionRange(selectionStart,selectionEnd);}catch{/* Select controls do not support text selection. */}}
    window.scrollTo(0, scroll.page);
  }
  function emptyHTML() { return `<section class="fqc-page"><section class="panel fqc-empty"><h2>FQC 標準資料尚未同步</h2><p>請先執行 data:sync 匯入經核對的 Canonical FQC 標準資料。</p>${canEditDraft() ? '<button id="fqc-begin-empty" class="button signal">建立空白 FQC 草稿</button>' : ''}</section></section>`; }
  function matrixHTML(version, category, products, canEdit) {
    const visibleProducts = products.filter(product => !ui.search || `${product.code} ${product.name}`.toLowerCase().includes(ui.search.toLowerCase()));
    const items = itemRows(version, category);
    return `<div class="fqc-matrix-scroll"><table class="fqc-matrix-table"><thead><tr><th class="fqc-matrix-corner"><span class="fqc-matrix-corner-label">FQC 檢查編號／名稱</span></th>${visibleProducts.map(product => `<th class="fqc-matrix-prod-th" title="${h(`${product.code} ${product.name} ${product.specification || ''}`)}"><div class="matrix-prod-code"><code>${h(product.code)}</code></div><div class="matrix-prod-name" data-i18n-skip="true">${h(product.name)}</div>${product.specification ? `<div class="matrix-prod-spec" data-i18n-skip="true">${h(product.specification)}</div>` : ''}${product.kind === 'semi-finished' ? '<div class="matrix-prod-tag"><span class="semi-tag">半成品</span></div>' : ''}</th>`).join('')}</tr></thead><tbody>${items.map(item => `<tr><th class="fqc-matrix-item-th"><code class="fqc-matrix-item-code">${h(item.checkNo)}</code><span class="fqc-matrix-item-name" data-i18n-skip="true">${h(item.name)}</span></th>${visibleProducts.map(product => { const included = (item.productCodes || []).includes(product.code); const symbol = included ? (item.isEnabled ? '✓' : '停用') : '—'; return `<td><button class="matrix-cell ${included ? 'included' : ''} ${item.isEnabled ? '' : 'disabled-item'}" data-matrix-item="${h(item.id)}" data-matrix-product="${h(product.code)}" ${canEdit ? '' : 'disabled'} aria-label="${h(item.checkNo)} ${h(product.code)} ${symbol}">${symbol}</button></td>`; }).join('')}</tr>`).join('') || `<tr><td colspan="${visibleProducts.length + 1}">尚無檢查項目</td></tr>`}</tbody></table></div>`;
  }
  function bindEvents() {
    const root = hostElement.querySelector('#fqc-page') || hostElement;
    root.querySelectorAll('[data-matrix-item]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.classList.contains('included')));
      if (ui.saving) button.disabled = true;
    });
    root.querySelector('#fqc-begin')?.addEventListener('click', beginDraft);
    root.querySelector('#fqc-begin-empty')?.addEventListener('click', beginDraft);
    root.querySelector('#fqc-save')?.addEventListener('click', async () => { try { await sharedAction('save'); } catch (error) { toast(displayDraftError(error)); } });
    root.querySelector('#fqc-submit')?.addEventListener('click', submitDraft);
    root.querySelector('#fqc-withdraw')?.addEventListener('click', withdrawDraft);
    root.querySelector('#fqc-approval')?.addEventListener('click', () => { state.approvalTab = 'quality'; navigate('approval'); });
    root.querySelector('#fqc-version')?.addEventListener('change', event => { ui.selectedVersionId = event.target.value; render(); });
    root.querySelector('#fqc-line')?.addEventListener('change', event => { ui.line = event.target.value; ui.category = ''; ui.selectedErrorId = ''; render(); });
    root.querySelector('#fqc-category')?.addEventListener('change', event => { ui.category = event.target.value; ui.selectedErrorId = ''; render(); });
    root.querySelector('#fqc-search')?.addEventListener('input', event => { ui.search = event.target.value; render(); });
    root.querySelector('.fqc-matrix')?.addEventListener('toggle', event => { ui.matrixOpen = event.target.open; });
    root.querySelector('#fqc-problems-details')?.addEventListener('toggle', event => { ui.problemsOpen = event.target.open; });
    root.querySelector('#fqc-retry-save')?.addEventListener('click', async () => {
      try {
        ui.lastError = null;
        await persist('草稿重新儲存成功');
      } catch (err) {
        ui.lastError = err.message;
        render();
      }
    });
    root.querySelectorAll('[data-fix-item]').forEach(button => {
      button.onclick = () => {
        const itemId = button.dataset.fixItem;
        const cat = button.dataset.fixCat;
        const err = button.dataset.fixErr;
        const version = editable();
        if (!version) {
          return toast(isVi() ? 'Phiên bản đang khóa hoặc chưa mở bản nháp để sửa' : '目前為主管審核中或已核准版本，請先在頂部建立或恢復草稿再修改');
        }
        if (cat && ui.category !== cat) ui.category = cat;
        ui.search = '';
        if (err) ui.selectedErrorId = err;
        render();
        setTimeout(() => {
          openItemModal(itemId, '', true);
        }, 60);
      };
    });
    root.querySelectorAll('[data-error-id]').forEach(row => row.addEventListener('click', event => { if (event.target.closest('button')) return; ui.selectedErrorId = row.dataset.errorId; render(); }));
    root.querySelector('#fqc-add-error')?.addEventListener('click', () => openErrorModal());
    root.querySelectorAll('[data-edit-error]').forEach(button => button.onclick = () => openErrorModal(button.dataset.editError));
    root.querySelectorAll('[data-delete-error]').forEach(button => button.onclick = () => deleteError(button.dataset.deleteError));
    root.querySelector('#fqc-add-item')?.addEventListener('click', () => openItemModal());
    root.querySelectorAll('[data-edit-item]').forEach(button => button.onclick = () => openItemModal(button.dataset.editItem));
    root.querySelectorAll('[data-routine-history]').forEach(button => button.onclick = () => window.RoutineFQCUI?.historyForItem?.(button.dataset.routineHistory));
    root.querySelectorAll('[data-delete-item]').forEach(button => button.onclick = () => deleteItem(button.dataset.deleteItem));
    root.querySelectorAll('[data-matrix-item]').forEach(button => button.onclick = async () => {
      const version = editable();
      if (!version || ui.saving || !canEditDraft()) return;
      const item = version.snapshot.items.find(row => row.id === button.dataset.matrixItem);
      if (!item || item.isDeleted) return;
      const code = button.dataset.matrixProduct;
      const product = catalog().products.find(row => row.code === code);
      if (!product) return;
      const codes = new Set(item.productCodes || []);
      const included = !codes.has(code);
      if (included) codes.add(code); else codes.delete(code);
      item.productCodes = [...codes];
      item.productRefs = item.productCodes.map(value => {
        const row = catalog().products.find(entry => entry.code === value);
        return { code:value, kind:row?.kind || 'unresolved', name:row?.name || '', specification:row?.specification || '' };
      });
      if (item.products) item.products = clone(item.productRefs);
      record(version, 'item-products-updated', `${item.checkNo} · ${code} · ${included ? '加入' : '移除'}`);
      try { await persist(isVi() ? 'Đã lưu liên kết sản phẩm' : '產品關聯已儲存'); }
      catch (error) { toast(displayDraftError(error)); }
    });
    root.querySelectorAll('[data-add-existing]').forEach(button => button.onclick = () => openExistingModal(button.dataset.addExisting));
    root.querySelectorAll('[data-add-new-product]').forEach(button => button.onclick = () => openItemModal('', button.dataset.addNewProduct));
    root.querySelectorAll('[data-view-item]').forEach(button => {
      button.onclick = () => {
        const item = selected()?.snapshot.items.find(it => it.id === button.dataset.viewItem);
        if (item && item.mediaItems?.length) openPhotoViewer(item, 0);
      };
    });
    root.querySelectorAll('[data-view-eq-id]').forEach(link => {
      link.onclick = (e) => {
        e.preventDefault();
        void openEquipmentViewModal(link.dataset.viewEqId);
      };
    });
  }
  function nextErrorCode(category, errors) {
    const same = errors.filter(error => error.category === category), sample = same.map(error => error.code).find(code => /-FQC-L\d+$/i.test(code));
    const prefix = sample ? sample.replace(/\d+$/, '') : `${category.replace(/[-/()]/g, '')}-FQC-L`;
    const max = Math.max(0, ...same.map(error => Number(error.code.match(/(\d+)$/)?.[1]) || 0)); return `${prefix}${String(max + 1).padStart(2, '0')}`;
  }
  function nextCheckNo(error, items) {
    const same = items.filter(item => item.errorId === error.id), match = error.code.match(/^(.*-FQC-L)0?(\d+)$/i), prefix = match ? `${match[1]}${Number(match[2])}-` : `${error.code}-`;
    const max = Math.max(0, ...same.map(item => Number(item.checkNo.match(/-(\d+)$/)?.[1]) || 0)); return `${prefix}${String(max + 1).padStart(2, '0')}`;
  }
  function isVi() {
    const tabLanguage = String(document.documentElement.lang || '').toLowerCase();
    if (tabLanguage === 'vi') return true;
    if (tabLanguage === 'zh' || tabLanguage.startsWith('zh-')) return false;
    return localStorage.getItem('processUILanguage') === 'vi';
  }
  function clearModalErrors(overlay) {
    overlay.querySelectorAll('.fqc-field.has-error').forEach(f => f.classList.remove('has-error'));
    overlay.querySelectorAll('.fqc-field-error').forEach(e => { e.textContent = ''; e.classList.remove('show'); });
    const alertEl = overlay.querySelector('.fqc-modal-alert');
    if (alertEl) { alertEl.textContent = ''; alertEl.className = 'fqc-modal-alert'; }
  }
  function showModalFieldError(overlay, fieldName, message) {
    const field = overlay.querySelector(`[data-field-wrap="${fieldName}"]`);
    if (!field) return;
    field.classList.add('has-error');
    let errorEl = field.querySelector(`[data-field-error="${fieldName}"]`);
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'fqc-field-error';
      errorEl.setAttribute('data-field-error', fieldName);
      field.append(errorEl);
    }
    errorEl.textContent = message;
    errorEl.classList.add('show');
    field.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const input = field.querySelector('input, textarea, select');
    if (input) input.focus();
  }
  function showModalAlert(overlay, type, message) {
    const displayMessage = type === 'error' ? displayDraftError(message) : message; const alertEl = overlay.querySelector('.fqc-modal-alert');
    if (alertEl) {
      alertEl.textContent = displayMessage;
      alertEl.className = `fqc-modal-alert ${type}`;
    }
    toast(displayMessage);
  }
  function modal(inner) { const overlay = document.createElement('div'); overlay.className = 'fqc-modal-overlay'; overlay.innerHTML = `<div class="fqc-modal" role="dialog" aria-modal="true">${inner}</div>`; document.body.append(overlay); document.body.classList.add('fqc-modal-open'); sharedClient?.gatePermissions?.(); return overlay; }
  function closeModal(overlay) { overlay.remove(); document.body.classList.remove('fqc-modal-open'); }
  function openErrorModal(id = '') {
    const version = editable(), errors = version.snapshot.errors, existing = errors.find(error => error.id === id), category = categoryName(version), code = existing?.code || nextErrorCode(category, errors);
    const vi = isVi();
    const overlay = modal(`<form class="fqc-modal-form"><header><h2>${existing ? (vi ? 'Sửa mã lỗi' : '修改錯誤代碼') : (vi ? 'Thêm mã lỗi mới' : '新增錯誤代碼')}</h2><button type="button" class="button ghost" data-close>${vi ? 'Quay lại' : '返回'}</button></header><div class="fqc-modal-body">
      <div class="fqc-field"><label class="fqc-label">${vi ? 'Nhóm sản phẩm' : '產品類別'}</label><input value="${h(existing?.category || category)}" readonly data-i18n-skip="true" class="fqc-input fqc-readonly"></div>
      <div class="fqc-field"><label class="fqc-label">${vi ? 'Mã lỗi (tự động)' : '錯誤代碼（自動接續）'}</label><input value="${h(code)}" readonly data-i18n-skip="true" class="fqc-input fqc-readonly"></div>
      <div class="fqc-field" data-field-wrap="name"><label class="fqc-label">${vi ? 'Tên lỗi' : '錯誤名稱'}</label><input name="name" value="${h(existing?.name || '')}" required data-i18n-skip="true" class="fqc-input"><div class="fqc-field-error" data-field-error="name"></div></div>
    </div><footer><div class="fqc-modal-alert" role="alert"></div><button class="button signal" type="submit">${window.VersionDraftUI.t('apply')}</button><button type="button" class="button ghost" data-close>${vi ? 'Hủy' : '取消'}</button></footer></form>`);

    overlay.querySelectorAll('[data-close]').forEach(button => button.onclick = () => closeModal(overlay));
    overlay.querySelectorAll('input, textarea').forEach(input => {
      input.addEventListener('input', () => {
        const wrap = input.closest('.fqc-field');
        if (wrap) {
          wrap.classList.remove('has-error');
          const err = wrap.querySelector('.fqc-field-error');
          if (err) { err.textContent = ''; err.classList.remove('show'); }
        }
      });
    });

    overlay.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      clearModalErrors(overlay);
      const form = new FormData(event.target), name = nativeFormValueText(form.get('name') || '').trim();
      if (!name) {
        showModalFieldError(overlay, 'name', vi ? 'Vui lòng nhập tên lỗi' : '請輸入錯誤名稱');
        return;
      }
      const value = existing || { id: `fqc-error:${crypto.randomUUID()}`, category, line: filteredCategories(version).find(item => item.name === category)?.line || '', code, isDeleted: false };
      Object.assign(value, { name });
      if (!existing) errors.push(value);
      record(version, existing ? 'error-updated' : 'error-created', `${existing ? '修改' : '新增'}錯誤代碼 ${code}`, '');
      try {
        await persist();
        closeModal(overlay);
      } catch (error) {
        showModalAlert(overlay, 'error', error.message || (vi ? 'Lưu thất bại' : '儲存失敗'));
      }
    };
  }
  function selectedEqCardHTML(eq) {
    const vi = isVi();
    if (!eq) {
      return `
        <div class="fqc-eq-picker-empty">
          <button type="button" class="button ghost fqc-pick-eq-btn" id="fqc-pick-eq-trigger">
            🔍 ${vi ? 'Chọn dụng cụ / thiết bị đo' : '選擇檢具與測試設備'}
          </button>
        </div>
      `;
    }
    const photoSrc = eqPhotoUrl(eq);
    const code = `${eq.assetCode}／${eq.pieceMark}`;
    const name = displayName(eq) || eq.name || '';
    return `
      <div class="fqc-eq-selected-card">
        <div class="fqc-eq-card-thumb">
          ${photoSrc ? `<img src="${h(photoSrc)}" alt="">` : '<span class="placeholder">◇</span>'}
        </div>
        <div class="fqc-eq-card-meta">
          <b>${h(code)}</b>
          <span data-i18n-skip="true">${h(name)}</span>
          ${eq.spec ? `<small data-i18n-skip="true">${h(eq.spec)}</small>` : ''}
        </div>
        <div class="fqc-eq-card-actions">
          <button type="button" class="master-small" id="fqc-change-eq-trigger">${vi ? 'Thay đổi' : '更換'}</button>
          <button type="button" class="master-small danger" id="fqc-clear-eq-trigger">${vi ? 'Xóa' : '清除'}</button>
        </div>
      </div>
    `;
  }

  function openEquipmentPickerLoadError(currentSelectedId, onSelect, error) {
    const vi = isVi();
    const overlay = modal(`
      <div class="fqc-modal-form fqc-eq-picker-modal">
        <header>
          <h2>${vi ? 'Không thể tải danh mục thiết bị' : '檢具清單載入失敗'}</h2>
          <button type="button" class="button ghost" data-close>${vi ? 'Đóng' : '關閉'}</button>
        </header>
        <div class="fqc-modal-body">
          <div class="fqc-modal-alert error show" role="alert">${h(error?.message || equipmentLoadError?.message || (vi ? 'Không thể tải dữ liệu thiết bị' : '無法讀取目前生效的檢具資料'))}</div>
          <p class="fqc-empty-hint">${vi ? 'Danh sách trống không được dùng thay cho lỗi tải dữ liệu.' : '系統不會以空清單取代載入失敗；請重新載入。'}</p>
        </div>
        <footer>
          <button type="button" class="button signal" id="fqc-picker-retry">${vi ? 'Tải lại' : '重新載入'}</button>
          <button type="button" class="button ghost" data-close>${vi ? 'Hủy' : '取消'}</button>
        </footer>
      </div>
    `);
    overlay.querySelectorAll('[data-close]').forEach(button => button.onclick = () => closeModal(overlay));
    overlay.querySelector('#fqc-picker-retry').onclick = () => {
      closeModal(overlay);
      openEquipmentPickerModal(currentSelectedId, onSelect).catch(error => toast(displayDraftError(error)));
    };
  }

  async function openEquipmentPickerModal(currentSelectedId, onSelect) {
    const vi = isVi();
    let catalog;
    try {
      catalog = await loadEquipmentCatalog({ force: true });
    } catch (error) {
      openEquipmentPickerLoadError(currentSelectedId, onSelect, error);
      return;
    }
    let pickerCat = '';
    let pickerSub = '';
    let pickerGrp = '';
    let pickerSearch = '';

    const initialEq = catalog.equipment.find(e => e.id === currentSelectedId);
    if (initialEq) {
      pickerCat = initialEq.categoryId || '';
      pickerSub = initialEq.subcategoryId || '';
      pickerGrp = initialEq.groupId || '';
    }

    const overlay = modal(`
      <div class="fqc-modal-form fqc-eq-picker-modal">
        <header>
          <h2>${vi ? 'Chọn thiết bị đo & Dưỡng kiểm' : '選擇檢具與測試設備'}</h2>
          <button type="button" class="button ghost" data-close>${vi ? 'Quay lại' : '返回'}</button>
        </header>
        <div class="fqc-modal-body">
          <div class="fqc-picker-filters">
            <div class="fqc-field">
              <label class="fqc-label">${vi ? 'Nhóm (Category)' : '類別'}</label>
              <select id="fqc-picker-cat" class="fqc-select">
                <option value="">${vi ? 'Tất cả nhóm' : '全部類別'}</option>
                ${catalog.categories.map(c => `<option value="${h(c.id)}" ${c.id === pickerCat ? 'selected' : ''}>${h(c.code)} · ${h(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="fqc-field">
              <label class="fqc-label">${vi ? 'Phân nhóm (Subcategory)' : '子類別'}</label>
              <select id="fqc-picker-sub" class="fqc-select">
                <option value="">${vi ? 'Tất cả phân nhóm' : '全部子類別'}</option>
              </select>
            </div>
            <div class="fqc-field">
              <label class="fqc-label">${vi ? 'Nhóm quy cách (Group)' : '規格群組'}</label>
              <select id="fqc-picker-grp" class="fqc-select">
                <option value="">${vi ? 'Tất cả quy cách' : '全部規格群組'}</option>
              </select>
            </div>
            <div class="fqc-field">
              <label class="fqc-label">${vi ? 'Tìm kiếm' : '搜尋設備'}</label>
              <input type="search" id="fqc-picker-search" class="fqc-input" placeholder="${vi ? 'Mã, tên, quy cách...' : '編號、名稱、規格...'}">
            </div>
          </div>
          <div class="fqc-picker-list-wrap">
            <div id="fqc-picker-list" class="fqc-picker-list"></div>
          </div>
        </div>
        <footer>
          <button type="button" class="button ghost" data-close>${vi ? 'Hủy' : '取消'}</button>
        </footer>
      </div>
    `);

    overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeModal(overlay));

    const catSelect = overlay.querySelector('#fqc-picker-cat');
    const subSelect = overlay.querySelector('#fqc-picker-sub');
    const grpSelect = overlay.querySelector('#fqc-picker-grp');
    const searchInput = overlay.querySelector('#fqc-picker-search');
    const listEl = overlay.querySelector('#fqc-picker-list');

    function updateSubOptions() {
      const subs = catalog.subcategories.filter(s => !pickerCat || s.categoryId === pickerCat);
      subSelect.innerHTML = `<option value="">${vi ? 'Tất cả phân nhóm' : '全部子類別'}</option>` +
        subs.map(s => `<option value="${h(s.id)}" ${s.id === pickerSub ? 'selected' : ''}>${h(s.name)}</option>`).join('');
    }

    function updateGrpOptions() {
      const grps = catalog.groups.filter(g => {
        if (pickerSub && g.subcategoryId !== pickerSub) return false;
        if (pickerCat && g.categoryId !== pickerCat) return false;
        return true;
      });
      grpSelect.innerHTML = `<option value="">${vi ? 'Tất cả quy cách' : '全部規格群組'}</option>` +
        grps.map(g => `<option value="${h(g.id)}" ${g.id === pickerGrp ? 'selected' : ''}>${h(g.name || g.id)}</option>`).join('');
    }

    function renderList() {
      const q = pickerSearch.trim().toLowerCase();
      const filtered = catalog.equipment.filter(eq => {
        if (pickerCat && eq.categoryId !== pickerCat && eq.categoryCode !== pickerCat) return false;
        if (pickerSub && eq.subcategoryId !== pickerSub) return false;
        if (pickerGrp && eq.groupId !== pickerGrp) return false;
        if (q) {
          const str = `${eq.assetCode} ${eq.pieceMark} ${displayName(eq)} ${eq.spec || ''}`.toLowerCase();
          if (!str.includes(q)) return false;
        }
        return true;
      });

      if (!filtered.length) {
        listEl.innerHTML = `<p class="fqc-empty-hint">${vi ? 'Không tìm thấy thiết bị phù hợp' : '無符合條件之檢具與設備'}</p>`;
        return;
      }

      listEl.innerHTML = filtered.map(eq => {
        const photoSrc = eqPhotoUrl(eq);
        const isSelected = eq.id === currentSelectedId;
        const unavailableReason = equipmentUnavailableReason(eq, catalog);
        const isAvailable = !unavailableReason;
        return `
          <div class="fqc-picker-item ${isSelected ? 'selected' : ''} ${isAvailable ? '' : 'unavailable'}">
            <div class="fqc-picker-thumb">
              ${photoSrc ? `<img src="${h(photoSrc)}" alt="">` : '<span class="placeholder">◇</span>'}
            </div>
            <div class="fqc-picker-info">
              <div class="fqc-picker-code">
                <b>${h(eq.assetCode)}／${h(eq.pieceMark)}</b>
                <span class="fqc-picker-status ${isAvailable ? 'active' : 'inactive'}">
                  ${isAvailable ? (vi ? 'Có thể chọn' : '可選') : (vi ? 'Không thể chọn' : '不可選')}
                </span>
              </div>
              <div class="fqc-picker-name" data-i18n-skip="true">${h(displayName(eq))}</div>
              ${eq.spec ? `<div class="fqc-picker-spec" data-i18n-skip="true">${h(eq.spec)}</div>` : ''}
              ${unavailableReason ? `<div class="fqc-picker-unavailable-reason">${h(unavailableReason)}</div>` : ''}
            </div>
            <div class="fqc-picker-action">
              <button type="button" class="button ${isSelected ? 'ghost' : 'signal'} master-small" data-select-eq="${h(eq.id)}" ${isAvailable ? '' : 'disabled'}>
                ${isSelected ? (vi ? 'Đã chọn' : '目前所選') : isAvailable ? (vi ? 'Chọn' : '選擇此設備') : (vi ? 'Không thể chọn' : '不可選')}
              </button>
            </div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('[data-select-eq]').forEach(btn => {
        btn.onclick = () => {
          const id = btn.dataset.selectEq;
          const eq = catalog.equipment.find(e => e.id === id);
          if (eq && !equipmentUnavailableReason(eq, catalog)) {
            onSelect(eq);
            closeModal(overlay);
          }
        };
      });
    }

    catSelect.onchange = () => {
      pickerCat = catSelect.value;
      pickerSub = '';
      pickerGrp = '';
      updateSubOptions();
      updateGrpOptions();
      renderList();
    };

    subSelect.onchange = () => {
      pickerSub = subSelect.value;
      pickerGrp = '';
      updateGrpOptions();
      renderList();
    };

    grpSelect.onchange = () => {
      pickerGrp = grpSelect.value;
      renderList();
    };

    searchInput.oninput = () => {
      pickerSearch = searchInput.value;
      renderList();
    };

    updateSubOptions();
    updateGrpOptions();
    renderList();
  }

  async function refreshEquipmentReferencePanel(overlay, eqId) {
    const panel = overlay?.querySelector?.('[data-fqc-equipment-refs]');
    if (!panel) return;
    const vi = isVi();
    panel.innerHTML = `<div class="routine-ref-loading"><small>${vi ? 'Đang tải tham chiếu tiêu chuẩn...' : '載入各品質系統標準引用中…'}</small></div>`;
    try {
      const api = window.RoutineEquipmentUI;
      if (!api?.getEquipmentReferences || !api?.referencesHTML) throw Error(vi ? 'Chức năng tham chiếu chưa sẵn sàng' : '反向引用查詢尚未就緒');
      const refs = await api.getEquipmentReferences(eqId, { refresh: true });
      if (!panel.isConnected) return;
      panel.innerHTML = api.referencesHTML(eqId, refs, 'view');
      api.bindReferenceActions?.(panel);
    } catch (error) {
      if (!panel.isConnected) return;
      panel.innerHTML = `<div class="fqc-modal-alert error show" role="alert">${h(error?.message || (vi ? 'Không thể tải tham chiếu' : '反向引用載入失敗'))}</div><button type="button" class="button ghost master-small" data-fqc-refs-retry>${vi ? 'Tải lại' : '重新載入'}</button>`;
      panel.querySelector('[data-fqc-refs-retry]')?.addEventListener('click', () => refreshEquipmentReferencePanel(overlay, eqId));
    }
  }

  async function openEquipmentViewModal(eqId) {
    try { await loadEquipmentCatalog({ force: true }); } catch { /* retain the last verified catalog for saved references */ }
    const eq = getCachedEquipment(eqId);
    const vi = isVi();
    if (!eq) {
      toast(vi ? 'Không tìm thấy thông tin thiết bị' : '查無此檢具詳細資料');
      return;
    }
    const photoSrc = eqPhotoUrl(eq);
    const overlay = modal(`
      <div class="fqc-modal-form fqc-eq-view-dialog">
        <header>
          <h2>${vi ? 'Chi tiết thiết bị đo' : '檢具與測試設備詳細資訊'} · ${h(eq.assetCode)}／${h(eq.pieceMark)}</h2>
          <button type="button" class="button ghost" data-close>${vi ? 'Đóng' : '關閉'}</button>
        </header>
        <div class="fqc-modal-body">
          <div class="fqc-eq-view-body">
            <div class="fqc-eq-view-photo">
              ${photoSrc ? `<img src="${h(photoSrc)}" alt="">` : `<span class="fqc-photo-empty">${vi ? 'Chưa có ảnh' : '尚無照片'}</span>`}
            </div>
            <div class="fqc-eq-view-grid">
              <div class="routine-view-row"><b>${vi ? 'Mã TSCĐ' : '固定資產編號'}</b><span>${h(eq.assetCode)}</span></div>
              <div class="routine-view-row"><b>${vi ? 'Ký hiệu' : '個別設備標記'}</b><span>${h(eq.pieceMark)}</span></div>
              <div class="routine-view-row"><b>${vi ? 'Tên thiết bị' : '檢具名稱'}</b><span data-i18n-skip="true">${h(displayName(eq) || '—')}</span></div>
              <div class="routine-view-row"><b>${vi ? 'Trạng thái' : '設備狀態'}</b><span>${eq.enabled !== false ? (vi ? 'Đang dùng' : '啟用') : (vi ? 'Chưa kích hoạt' : '未啟用')}</span></div>
              <div class="routine-view-row"><b>${vi ? 'Nhóm quy cách' : '所屬規格群組'}</b><span>${h(eq.groupId || '—')}</span></div>
              <div class="routine-view-row"><b>${vi ? 'Phương thức hiệu chuẩn' : '校正方式'}</b><span>${h(eq.calibrationMethod || '—')}</span></div>
              <div class="routine-view-row full"><b>${vi ? 'Quy cách' : '規格／常用檢測用途'}</b><span data-i18n-skip="true">${h(eq.spec || '—')}</span></div>
              <div class="routine-view-row full"><b>${vi ? 'Ghi chú' : '備註'}</b><span data-i18n-skip="true">${h(eq.notes || '—')}</span></div>
            </div>
            <div class="fqc-eq-view-references" data-fqc-equipment-refs="${h(eqId)}"></div>
          </div>
        </div>
        <footer>
          <button type="button" class="button signal" data-close>${vi ? 'Đóng' : '關閉'}</button>
        </footer>
      </div>
    `);
    overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeModal(overlay));
    void refreshEquipmentReferencePanel(overlay, eqId);
  }

  function openItemReadOnlyView(versionId, itemId) {
    const vi = isVi();
    const ctrl = ensureControl();
    const lib = ctrl.libraries?.fqc;
    const ver = lib?.versions.find(v => v.id === versionId) || lib?.versions.find(v => v.id === lib.activeVersionId);
    const item = ver?.snapshot?.items.find(it => it.id === itemId);
    if (!item) {
      toast(vi ? 'Không tìm thấy hạng mục tiêu chuẩn' : '查無此標準項目');
      return;
    }
    const error = ver?.snapshot?.errors.find(e => e.id === item.errorId);
    const photos = item.mediaItems || [];
    const overlay = modal(`
      <div class="fqc-modal-form fqc-readonly-item-modal">
        <header>
          <h2>${vi ? 'Xem tiêu chuẩn FQC' : '查閱 FQC 檢驗標準'} · ${h(item.checkNo)} <span class="master-status fqc-status ${h(ver.status)}">${h(statusLabel(ver.status))} (V${ver.number})</span></h2>
          <button type="button" class="button ghost" data-close>${vi ? 'Đóng' : '關閉'}</button>
        </header>
        <div class="fqc-modal-body">
          <div class="fqc-readonly-grid">
            <div><b>${vi ? 'Nhóm sản phẩm' : '產品類別'}：</b><span>${h(item.category || error?.category || '—')}</span></div>
            <div><b>${vi ? 'Mã lỗi' : '錯誤代碼'}：</b><span><code>${h(error?.code || '—')}</code> · ${h(error?.name || '—')}</span></div>
            <div><b>${vi ? 'Hạng mục' : '檢查項目'}：</b><b data-i18n-skip="true">${h(item.name)}</b></div>
            <div><b>${vi ? 'Trạng thái' : '標準狀態'}：</b><span>${item.isEnabled !== false ? (vi ? 'Đang dùng' : '啟用中') : (vi ? 'Đã tắt' : '已停用')}</span></div>
            <div><b>${vi ? 'Quy tắc' : '檢查規則'}：</b>${ruleSummaryHTML(item)}</div>
            <div><b>${vi ? 'Dụng cụ' : '檢查工具'}：</b>${toolCellHTML(item)}</div>
          </div>
          ${item.description ? `
            <div class="fqc-readonly-desc">
              <b>${vi ? 'Mô tả phương pháp kiểm' : '檢查方式敘述'}：</b>
              <p data-i18n-skip="true">${h(item.description)}</p>
            </div>
          ` : ''}
          ${photos.length ? `
            <div class="fqc-readonly-photos">
              <b>${vi ? 'Ảnh phương pháp kiểm' : '檢查方式圖片'} (${photos.length} 張)：</b>
              <div class="fqc-photo-list">
                ${photos.map((p, idx) => `
                  <div class="fqc-photo-card" style="cursor:pointer;" data-view-idx="${idx}">
                    <div class="fqc-photo-preview"><img src="${h(p.src)}" alt=""></div>
                    ${p.note ? `<div class="fqc-photo-meta"><small data-i18n-skip="true">${h(p.note)}</small></div>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          <div class="fqc-readonly-products">
            <b>${vi ? 'Sản phẩm áp dụng' : '包含產品'} (${(item.productCodes || []).length} 項)：</b>
            <div class="fqc-item-products-tags">
              ${(item.productCodes || []).map(code => `<code>${h(code)}</code>`).join(' ')}
            </div>
          </div>
        </div>
        <footer>
          <button type="button" class="button signal" data-close>${vi ? 'Đóng' : '關閉'}</button>
        </footer>
      </div>
    `);
    overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeModal(overlay));
    overlay.querySelectorAll('[data-view-idx]').forEach(card => {
      card.onclick = () => openPhotoViewer(item, Number(card.dataset.viewIdx));
    });
  }

  function openItemModal(id = '', preselectCode = '', focusRule = false) {
    const formActor=identity(),formActorId=formActor?.id,formGeneration=library().workflow?.generation,formVersionId=editable()?.id;
    const formCurrent=()=>overlay.isConnected&&identity()===formActor&&formActor?.id===formActorId&&library().workflow?.generation===formGeneration&&editable()?.id===formVersionId;
    const assertFormCurrent=()=>{if(!formCurrent())throw Error('DEPENDENCY_CHANGED_RECONFIRM');if(library().workflow?.pendingId||transport().permission('edit')===false)throw Error('PENDING_OR_PERMISSION_LOCKED');};
    const version = editable(), errors = errorRows(version, categoryName(version)), items = version.snapshot.items, existing = items.find(item => item.id === id), error = errors.find(item => item.id === (existing?.errorId || ui.selectedErrorId)) || errors[0]; if (!error) return;
    const productCodes = new Set(existing?.productCodes || []); if (preselectCode) productCodes.add(preselectCode);
    const products = effectiveProducts(error.category), checkNo = existing?.checkNo || nextCheckNo(error, items);
    const currentMedia = clone(existing?.mediaItems || []).map(m => ({ ...m, id: m.id || (`fqc-media:${crypto.randomUUID()}`), note: m.note || '' }));
    const initialMediaJSON=JSON.stringify(currentMedia),initialEquipmentId=existing?.equipmentId||'';
    const vi = isVi();
    const currentRule = existing ? getItemRule(existing) : { cadence: 'none' };

    let selectedEqId = existing?.equipmentId || '';
    let selectedEq = getCachedEquipment(selectedEqId) || existing?.equipmentSnapshot || null;
    const legacyTool = !selectedEqId && existing?.tool && !/^(Mắt|目視|Kiểm tra bằng mắt)/i.test(existing.tool) ? existing.tool : '';
    let initialToolType = legacyTool ? '' : 'visual';
    if (selectedEqId) {
      initialToolType = 'equipment';
    }
    let toolType = initialToolType;

    const overlay = modal(`<form class="fqc-modal-form fqc-item-form"><header><h2>${existing ? (vi ? 'Sửa hạng mục kiểm tra' : '修改檢查項目') : (vi ? 'Thêm hạng mục kiểm tra mới' : '新增檢查項目')} · ${h(checkNo)}</h2><button type="button" class="button ghost" data-close>${vi ? 'Quay lại' : '返回'}</button></header><div class="fqc-modal-body">
      <div class="fqc-form-grid">
        <div class="fqc-field"><label class="fqc-label">${vi ? 'Mã lỗi' : '錯誤代碼'}</label><select name="errorId" class="fqc-select">${errors.map(item => `<option value="${h(item.id)}" ${item.id === error.id ? 'selected' : ''}>${h(item.code)} · ${h(item.name)}</option>`).join('')}</select></div>
        <div class="fqc-field"><label class="fqc-label">${vi ? 'Mã kiểm tra FQC (tự động)' : 'FQC 檢查編號（自動）'}</label><input value="${h(checkNo)}" readonly data-i18n-skip="true" class="fqc-input fqc-readonly"></div>
      </div>
      <div class="fqc-field" data-field-wrap="name"><label class="fqc-label">${vi ? 'Hạng mục kiểm tra' : '檢查項目'}</label><input name="name" value="${h(existing?.name || '')}" required data-i18n-skip="true" class="fqc-input"><div class="fqc-field-error" data-field-error="name"></div></div>
      <div class="fqc-field"><label class="fqc-label">${vi ? 'Mô tả phương pháp kiểm' : '檢查方式敘述'}</label><textarea name="description" data-i18n-skip="true" class="fqc-textarea">${h(existing?.description || '')}</textarea></div>

      <!-- 檢查工具與檢具選擇 -->
      <div class="fqc-field fqc-tool-picker-field">
        <label class="fqc-label">${vi ? 'Công cụ / Dụng cụ kiểm tra' : '檢查工具／設備'}</label>
        <div class="fqc-tool-radios">
          <label class="fqc-radio-item">
            <input type="radio" name="toolType" value="visual" ${toolType === 'visual' ? 'checked' : ''}>
            <span>👁 ${vi ? 'Kiểm tra bằng mắt' : '目視檢查（無工具）'}</span>
          </label>
          <label class="fqc-radio-item">
            <input type="radio" name="toolType" value="equipment" ${toolType === 'equipment' ? 'checked' : ''}>
            <span>🔧 ${vi ? 'Dụng cụ & Thiết bị đo' : '檢具與測試設備'}</span>
          </label>
        </div>
        ${legacyTool ? `<p class="fqc-legacy-tool-note">${vi ? 'Nội dung dụng cụ cũ' : '舊工具文字'}：<b>${h(legacyTool)}</b><br>${vi ? 'Vui lòng chọn Kiểm tra bằng mắt hoặc một thiết bị hợp lệ. Nếu chưa chọn, nội dung cũ sẽ được giữ lại khi lưu.' : '請改選「目視」或有效檢具；尚未選擇時儲存，會保留舊文字等待後續對應。'}</p>` : ''}
        <div id="fqc-tool-eq-block" style="${toolType === 'equipment' ? '' : 'display:none;'}">
          <div id="fqc-selected-eq-container">
            ${selectedEqCardHTML(selectedEq)}
          </div>
        </div>
      </div>
      <div class="fqc-photo-section">
        <div class="fqc-photo-head">
          <label class="fqc-label">${vi ? 'Ảnh phương pháp kiểm (nhiều ảnh, thêm mới không ghi đè)' : '檢查方式圖片（可多選，追加不覆蓋）'}</label>
          <input name="photos" id="fqc-file-input" type="file" accept="image/*" multiple>
        </div>
        <div id="fqc-modal-photo-list" class="fqc-photo-list"></div>
      </div>

      <!-- 一、標準狀態（獨立區塊） -->
      <div class="fqc-status-section">
        <label class="fqc-label">${vi ? 'Trạng thái tiêu chuẩn' : '標準狀態'}</label>
        <label class="fqc-check-card"><input type="checkbox" name="enabled" ${existing?.isEnabled !== false ? 'checked' : ''}><span class="fqc-check-text">${vi ? 'Kích hoạt tiêu chuẩn này (chỉ tiêu chuẩn được kích hoạt mới tính vào độ phủ sản phẩm)' : '啟用此標準（啟用之標準才計入產品有效覆蓋）'}</span></label>
      </div>

      <!-- 二、檢查規則卡片（單一有效規則） -->
      <div class="fqc-rule-card" id="fqc-rule-card-section">
        <div class="fqc-rule-card-head">
          <span class="fqc-label">${vi ? 'Quy tắc kiểm tra (chỉ 1 nhóm quy tắc)' : '檢查規則（每項限一組）'}</span>
          <small class="fqc-muted-hint">${vi ? 'Chọn 未設定, Theo lô hoặc Theo thời gian; mỗi hạng mục chỉ có 1 nhóm quy tắc' : '同一項目最多只能有一組有效規則，不能同時按批次及按時間'}</small>
        </div>
        <div class="fqc-rule-card-body">
          <div class="fqc-field" data-field-wrap="ruleCadence">
            <label class="fqc-label">${vi ? 'Cách kiểm tra' : '方式'}</label>
            <select name="ruleCadence" id="fqc-rule-cadence" class="fqc-select">
              <option value="none" ${currentRule.cadence === 'none' || currentRule.cadence === 'pending_confirmation' ? 'selected' : ''}>${vi ? 'Chưa thiết lập' : '未設定'}</option>
              <option value="batch" ${currentRule.cadence === 'batch' ? 'selected' : ''}>${vi ? 'Theo lô' : '按批次'}</option>
              <option value="time" ${currentRule.cadence === 'time' ? 'selected' : ''}>${vi ? 'Theo thời gian' : '按時間'}</option>
            </select>
          </div>

          <!-- 按批次區塊 -->
          <div id="fqc-batch-subwrap" class="fqc-rule-subwrap" style="${currentRule.cadence === 'batch' ? '' : 'display:none;'}">
            <div class="fqc-field" data-field-wrap="batchKind">
              <label class="fqc-label">${vi ? 'Cách lấy mẫu' : '取樣方式'}</label>
              <select name="batchKind" id="fqc-batch-kind" class="fqc-select">
                <option value="aql" ${currentRule.batchKind === 'aql' || !currentRule.batchKind ? 'selected' : ''}>AQL</option>
                <option value="fixed_count" ${currentRule.batchKind === 'fixed_count' ? 'selected' : ''}>${vi ? 'Số lượng cố định' : '固定件數'}</option>
                <option value="batch_quantity" ${currentRule.batchKind === 'batch_quantity' ? 'selected' : ''}>${vi ? 'Số lượng lô' : '批次數量'}</option>
                <option value="custom" ${currentRule.batchKind === 'custom' ? 'selected' : ''}>${vi ? 'Tùy chỉnh' : '自訂'}</option>
              </select>
            </div>

            <div id="fqc-batch-aql-wrap" class="fqc-field" data-field-wrap="aqlValue" style="${currentRule.cadence === 'batch' && (currentRule.batchKind === 'aql' || !currentRule.batchKind) ? '' : 'display:none;'}">
              <label class="fqc-label">${vi ? 'Giá trị AQL (ví dụ: 0.25, 0.4, 1.0)' : 'AQL 值（如 0.25, 0.4, 1.0）'}</label>
              <input type="text" name="aqlValue" id="fqc-batch-aql" class="fqc-input" value="${h(currentRule.aqlValue || '')}" placeholder="${vi ? 'Nhập giá trị AQL' : '請輸入 AQL 值'}" data-i18n-skip="true">
              <div class="fqc-field-error" data-field-error="aqlValue"></div>
            </div>

            <div id="fqc-batch-fixed-wrap" class="fqc-field" data-field-wrap="fixedCount" style="${currentRule.cadence === 'batch' && currentRule.batchKind === 'fixed_count' ? '' : 'display:none;'}">
              <label class="fqc-label">${vi ? 'Số mẫu mỗi lô (cái, số nguyên dương)' : '每批取樣件數（單位：件，須為正整數）'}</label>
              <div class="fqc-input-unit-wrap">
                <input type="number" min="1" step="1" name="fixedCount" id="fqc-batch-fixed" class="fqc-input" value="${h(currentRule.fixedCount || '')}" placeholder="5" data-i18n-skip="true">
                <span class="fqc-unit-tag">${vi ? 'cái' : '件'}</span>
              </div>
              <div class="fqc-field-error" data-field-error="fixedCount"></div>
            </div>

            <div id="fqc-batch-qty-wrap" class="fqc-field" data-field-wrap="batchQuantity" style="${currentRule.cadence === 'batch' && currentRule.batchKind === 'batch_quantity' ? '' : 'display:none;'}">
              <label class="fqc-label">${vi ? 'Mức số lượng lô (cái/lô)' : '批次數量基準（單位：件/批）'}</label>
              <div class="fqc-input-unit-wrap">
                <input type="number" min="1" step="1" name="batchQuantity" id="fqc-batch-qty" class="fqc-input" value="${h(currentRule.batchQuantity || '')}" placeholder="100" data-i18n-skip="true">
                <span class="fqc-unit-tag">${vi ? 'cái' : '件'}</span>
              </div>
              <div class="fqc-field-error" data-field-error="batchQuantity"></div>
            </div>

            <div id="fqc-batch-custom-wrap" class="fqc-field" data-field-wrap="customBatchText" style="${currentRule.cadence === 'batch' && currentRule.batchKind === 'custom' ? '' : 'display:none;'}">
              <label class="fqc-label">${vi ? 'Tên mục tùy chỉnh (bắt buộc)' : '自訂項目名稱（必填）'}</label>
              <input type="text" name="customBatchText" id="fqc-batch-custom" class="fqc-input" value="${h(currentRule.customBatchText || '')}" placeholder="${vi ? 'Nhập tên mục' : '請輸入自訂項目名稱'}" data-i18n-skip="true">
              <div class="fqc-field-error" data-field-error="customBatchText"></div>
              <label class="fqc-label">${vi ? 'Số lượng hoặc nội dung (bắt buộc)' : '對應數量或文字內容（必填）'}</label>
              <input type="text" name="customBatchValue" id="fqc-batch-custom-value" class="fqc-input" value="${h(currentRule.customBatchValue || '')}" placeholder="${vi ? 'Nhập số lượng hoặc nội dung' : '請輸入數量或文字內容'}" data-i18n-skip="true">
              <div class="fqc-field-error" data-field-error="customBatchValue"></div>
            </div>
          </div>

          <!-- 按時間區塊 -->
          <div id="fqc-time-subwrap" class="fqc-rule-subwrap" style="${currentRule.cadence === 'time' ? '' : 'display:none;'}">
            <div class="fqc-field" data-field-wrap="timeFrequency">
              <label class="fqc-label">${vi ? 'Tần suất' : '頻率'}</label>
              <select name="timeFrequency" id="fqc-time-frequency" class="fqc-select">
                <option value="weekly" ${currentRule.timeFrequency === 'weekly' ? 'selected' : ''}>${vi ? 'Hàng tuần' : '每週'}</option>
                <option value="monthly" ${currentRule.timeFrequency === 'monthly' || !currentRule.timeFrequency ? 'selected' : ''}>${vi ? 'Hàng tháng' : '每月'}</option>
                <option value="quarterly" ${currentRule.timeFrequency === 'quarterly' ? 'selected' : ''}>${vi ? 'Hàng quý' : '每季'}</option>
                <option value="half_yearly" ${currentRule.timeFrequency === 'half_yearly' ? 'selected' : ''}>${vi ? 'Nửa năm' : '每半年'}</option>
                <option value="yearly" ${currentRule.timeFrequency === 'yearly' ? 'selected' : ''}>${vi ? 'Hàng năm' : '每年'}</option>
                <option value="custom" ${currentRule.timeFrequency === 'custom' ? 'selected' : ''}>${vi ? 'Tùy chỉnh' : '自訂'}</option>
              </select>
            </div>

            <div id="fqc-time-custom-wrap" class="fqc-field" data-field-wrap="customTimeText" style="${currentRule.cadence === 'time' && currentRule.timeFrequency === 'custom' ? '' : 'display:none;'}">
              <label class="fqc-label">${vi ? 'Mô tả chu kỳ tùy chỉnh (bắt buộc)' : '自訂週期說明（自訂內容不可空白）'}</label>
              <input type="text" name="customTimeText" id="fqc-time-custom" class="fqc-input" value="${h(currentRule.customTimeText || '')}" placeholder="${vi ? 'Nhập mô tả chu kỳ' : '請輸入自訂時間週期說明'}" data-i18n-skip="true">
              <div class="fqc-field-error" data-field-error="customTimeText"></div>
            </div>
          </div>
        </div>
      </div>

      <fieldset class="fqc-products-fieldset">
        <legend class="fqc-label">${vi ? 'Sản phẩm áp dụng' : '包含產品'}</legend>
        <div class="fqc-products">${products.map(product => `<label class="fqc-product-card"><input type="checkbox" name="product" value="${h(product.code)}" ${productCodes.has(product.code) ? 'checked' : ''}><div class="fqc-product-body"><div class="fqc-prod-head"><code class="fqc-prod-code">${h(product.code)}</code>${product.kind === 'semi-finished' ? `<span class="semi-tag">${vi ? 'Bán TP' : '半成品'}</span>` : ''}</div><div class="fqc-prod-name" data-i18n-skip="true">${h(product.name)}</div>${product.specification ? `<div class="fqc-prod-spec" data-i18n-skip="true">${h(product.specification)}</div>` : ''}</div></label>`).join('') || `<p class="fqc-empty-hint">${vi ? 'Nhóm này chưa có dữ liệu sản phẩm' : '此類別尚無產品主資料'}</p>`}</div>
      </fieldset>
      <div class="fqc-field"><label class="fqc-label">${vi ? 'Ghi chú' : '備註'}</label><textarea name="note" data-i18n-skip="true" class="fqc-textarea">${h(existing?.note || '')}</textarea></div>
      <p class="fqc-system-note">${vi ? 'Phiên bản' : '版本'} ${h(version.number)} · ${vi ? 'Tài khoản sửa' : '修改帳號'} ${h(actor().id)} · ${vi ? 'Thời gian lưu do máy chủ ghi nhận' : '儲存時間由伺服器完成後記錄'}</p>
    </div><footer><div class="fqc-modal-alert" role="alert"></div><button class="button signal" type="submit">${vi ? 'Lưu vào bản nháp' : '儲存至草稿'}</button><button type="button" class="button ghost" data-close>${vi ? 'Hủy' : '取消'}</button></footer></form>`);

    overlay.querySelectorAll('[data-close]').forEach(button => button.onclick = () => closeModal(overlay));

    // 規則卡片切換處理
    const ruleCadenceSelect = overlay.querySelector('#fqc-rule-cadence');
    const batchSubwrap = overlay.querySelector('#fqc-batch-subwrap');
    const timeSubwrap = overlay.querySelector('#fqc-time-subwrap');
    const batchKindSelect = overlay.querySelector('#fqc-batch-kind');
    const batchAqlWrap = overlay.querySelector('#fqc-batch-aql-wrap');
    const batchFixedWrap = overlay.querySelector('#fqc-batch-fixed-wrap');
    const batchQtyWrap = overlay.querySelector('#fqc-batch-qty-wrap');
    const batchCustomWrap = overlay.querySelector('#fqc-batch-custom-wrap');
    const timeFreqSelect = overlay.querySelector('#fqc-time-frequency');
    const timeCustomWrap = overlay.querySelector('#fqc-time-custom-wrap');

    ruleCadenceSelect.onchange = () => {
      const val = ruleCadenceSelect.value;
      batchSubwrap.style.display = val === 'batch' ? '' : 'none';
      timeSubwrap.style.display = val === 'time' ? '' : 'none';
      clearModalErrors(overlay);
    };

    batchKindSelect.onchange = () => {
      const kind = batchKindSelect.value;
      batchAqlWrap.style.display = kind === 'aql' ? '' : 'none';
      batchFixedWrap.style.display = kind === 'fixed_count' ? '' : 'none';
      batchQtyWrap.style.display = kind === 'batch_quantity' ? '' : 'none';
      batchCustomWrap.style.display = kind === 'custom' ? '' : 'none';
      clearModalErrors(overlay);
    };

    timeFreqSelect.onchange = () => {
      timeCustomWrap.style.display = timeFreqSelect.value === 'custom' ? '' : 'none';
      clearModalErrors(overlay);
    };

    if (focusRule) {
      setTimeout(() => {
        const ruleCard = overlay.querySelector('#fqc-rule-card-section');
        if (ruleCard) {
          ruleCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          ruleCard.classList.add('highlight-rule');
          ruleCadenceSelect?.focus();
          setTimeout(() => ruleCard.classList.remove('highlight-rule'), 3000);
        }
      }, 100);
    }

    function renderPhotoList() {
      const container = overlay.querySelector('#fqc-modal-photo-list');
      if (!container) return;
      if (!currentMedia.length) {
        container.innerHTML = `<p class="fqc-no-photos">${vi ? 'Chưa tải lên ảnh phương pháp kiểm' : '尚未上傳檢查方式照片'}</p>`;
        return;
      }
      container.innerHTML = currentMedia.map((media, idx) => `
        <div class="fqc-photo-card" data-photo-index="${idx}">
          <div class="fqc-photo-preview">
            <img src="${h(media.src)}" alt="${h(media.name || `照片 ${idx + 1}`)}">
            <span class="fqc-photo-tag ${idx === 0 ? 'primary-tag' : ''}">${idx === 0 ? (vi ? 'Ảnh đầu' : '首圖') : `#${idx + 1}`}</span>
          </div>
          <div class="fqc-photo-meta">
            <input type="text" class="fqc-photo-note" data-photo-note="${idx}" value="${h(media.note || '')}" placeholder="${vi ? 'Ghi chú ảnh' : '照片備註'}" data-i18n-skip="true">
            <div class="fqc-photo-actions">
              ${idx > 0 ? `<button type="button" class="master-small" data-photo-primary="${idx}">${vi ? 'Đặt làm ảnh đầu' : '設為首圖'}</button><button type="button" class="master-small" data-photo-up="${idx}">▲ ${vi ? 'Lên' : '上移'}</button>` : ''}
              ${idx < currentMedia.length - 1 ? `<button type="button" class="master-small" data-photo-down="${idx}">▼ ${vi ? 'Xuống' : '下移'}</button>` : ''}
              <button type="button" class="master-small danger" data-photo-remove="${idx}">${vi ? 'Xóa ảnh' : '刪除照片'}</button>
            </div>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('[data-photo-note]').forEach(input => {
        input.oninput = e => {
          const i = Number(e.target.dataset.photoNote);
          if (currentMedia[i]) currentMedia[i].note = e.target.value;
        };
      });
      container.querySelectorAll('[data-photo-primary]').forEach(btn => {
        btn.onclick = () => {
          const i = Number(btn.dataset.photoPrimary);
          const [moved] = currentMedia.splice(i, 1);
          currentMedia.unshift(moved);
          renderPhotoList();
        };
      });
      container.querySelectorAll('[data-photo-up]').forEach(btn => {
        btn.onclick = () => {
          const i = Number(btn.dataset.photoUp);
          if (i > 0) {
            const temp = currentMedia[i - 1];
            currentMedia[i - 1] = currentMedia[i];
            currentMedia[i] = temp;
            renderPhotoList();
          }
        };
      });
      container.querySelectorAll('[data-photo-down]').forEach(btn => {
        btn.onclick = () => {
          const i = Number(btn.dataset.photoDown);
          if (i < currentMedia.length - 1) {
            const temp = currentMedia[i + 1];
            currentMedia[i + 1] = currentMedia[i];
            currentMedia[i] = temp;
            renderPhotoList();
          }
        };
      });
      container.querySelectorAll('[data-photo-remove]').forEach(btn => {
        btn.onclick = () => {
          const i = Number(btn.dataset.photoRemove);
          currentMedia.splice(i, 1);
          renderPhotoList();
        };
      });
    }

    renderPhotoList();

    overlay.querySelector('#fqc-file-input').onchange = async e => {
      const files = [...(e.target.files || [])];
      try {
        for (const file of files) {
          assertFormCurrent();
          const src = await fileData(file);
          assertFormCurrent();
          currentMedia.push({ id: `fqc-media:${crypto.randomUUID()}`, name: file.name, type: file.type, src, note: '' });
          renderPhotoList();
        }
      } catch(error) { showModalAlert(overlay,'error',error.message||String(error)); }
      finally { e.target.value=''; }
    };

    overlay.querySelectorAll('input[name="toolType"]').forEach(r => {
      r.addEventListener('change', () => {
        toolType = r.value;
        const eqBlock = overlay.querySelector('#fqc-tool-eq-block');
        if (eqBlock) eqBlock.style.display = toolType === 'equipment' ? '' : 'none';
      });
    });

    function bindEqCardActions() {
      const container = overlay.querySelector('#fqc-selected-eq-container');
      if (!container) return;
      container.querySelector('#fqc-pick-eq-trigger')?.addEventListener('click', () => {
        openEquipmentPickerModal(selectedEqId, (chosenEq) => {
          selectedEq = chosenEq;
          selectedEqId = chosenEq.id;
          container.innerHTML = selectedEqCardHTML(selectedEq);
          bindEqCardActions();
        }).catch(error => toast(displayDraftError(error)));
      });
      container.querySelector('#fqc-change-eq-trigger')?.addEventListener('click', () => {
        openEquipmentPickerModal(selectedEqId, (chosenEq) => {
          selectedEq = chosenEq;
          selectedEqId = chosenEq.id;
          container.innerHTML = selectedEqCardHTML(selectedEq);
          bindEqCardActions();
        }).catch(error => toast(displayDraftError(error)));
      });
      container.querySelector('#fqc-clear-eq-trigger')?.addEventListener('click', () => {
        selectedEq = null;
        selectedEqId = '';
        container.innerHTML = selectedEqCardHTML(null);
        bindEqCardActions();
      });
    }
    bindEqCardActions();

    overlay.querySelectorAll('input, textarea, select').forEach(input => {
      input.addEventListener('input', () => {
        const wrap = input.closest('.fqc-field');
        if (wrap) {
          wrap.classList.remove('has-error');
          const err = wrap.querySelector('.fqc-field-error');
          if (err) { err.textContent = ''; err.classList.remove('show'); }
        }
      });
    });

    overlay.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      clearModalErrors(overlay);
      try { assertFormCurrent(); } catch(error) { showModalAlert(overlay,'error',error.message); return; }
      const form = new FormData(event.target);
      const name = nativeFormValueText(form.get('name') || '').trim();
      if (!name) {
        showModalFieldError(overlay, 'name', vi ? 'Vui lòng nhập tên hạng mục kiểm tra' : '請輸入檢查項目名稱');
        return;
      }

      // 工具與設備驗證
      let finalTool = '';
      let finalEqId = null;
      let finalEqSnapshot = null;
      if (toolType === 'visual') {
        finalTool = vi ? 'Kiểm tra bằng mắt' : '目視檢查';
      } else if (toolType === 'equipment') {
        if (!selectedEqId || !selectedEq) {
          showModalAlert(overlay, 'error', vi ? 'Vui lòng chọn thiết bị đo hoặc chuyển sang kiểm tra bằng mắt' : '請選擇檢具設備，或切換為目視檢查');
          return;
        }
        finalEqId = selectedEqId;
        finalEqSnapshot = {
          id: selectedEq.id,
          assetCode: selectedEq.assetCode,
          pieceMark: selectedEq.pieceMark,
          name: displayName(selectedEq) || selectedEq.name || '',
          spec: selectedEq.spec || '',
          photoUrl: eqPhotoUrl(selectedEq),
          enabled: selectedEq.enabled !== false
        };
        finalTool = `${selectedEq.pieceMark || selectedEq.assetCode}`;
      } else if (legacyTool) {
        finalTool = legacyTool;
      } else {
        showModalAlert(overlay, 'error', vi ? 'Vui lòng chọn Kiểm tra bằng mắt hoặc một thiết bị hợp lệ' : '請選擇目視檢查或有效檢具設備');
        return;
      }

      // 檢查規則驗證
      const ruleCadence = nativeFormValueText(form.get('ruleCadence') || 'none');
      const batchKind = nativeFormValueText(form.get('batchKind') || 'aql');
      const aqlValue = nativeFormValueText(form.get('aqlValue') || '').trim();
      const fixedCount = nativeFormValueText(form.get('fixedCount') || '').trim();
      const batchQuantity = nativeFormValueText(form.get('batchQuantity') || '').trim();
      const customBatchText = typeof form.get('customBatchText') === 'string' ? form.get('customBatchText').trim() : '';
      const customBatchValue = typeof form.get('customBatchValue') === 'string' ? form.get('customBatchValue').trim() : '';
      const timeFrequency = nativeFormValueText(form.get('timeFrequency') || 'monthly');
      const customTimeText = nativeFormValueText(form.get('customTimeText') || '').trim();

      let finalRule = { cadence: ruleCadence };

      if (ruleCadence === 'batch') {
        if (batchKind === 'aql') {
          if (!aqlValue) {
            showModalFieldError(overlay, 'aqlValue', vi ? 'Vui lòng nhập giá trị AQL' : '請輸入 AQL 值');
            return;
          }
          finalRule = { cadence: 'batch', batchKind: 'aql', aqlValue };
        } else if (batchKind === 'fixed_count') {
          const num = Number(fixedCount);
          if (!fixedCount || !Number.isInteger(num) || num <= 0) {
            showModalFieldError(overlay, 'fixedCount', vi ? 'Vui lòng nhập số mẫu là số nguyên dương' : '每批取樣件數須為正整數');
            return;
          }
          finalRule = { cadence: 'batch', batchKind: 'fixed_count', fixedCount: num };
        } else if (batchKind === 'batch_quantity') {
          const num = Number(batchQuantity);
          if (!batchQuantity || isNaN(num) || num <= 0) {
            showModalFieldError(overlay, 'batchQuantity', vi ? 'Vui lòng nhập số lượng lô hợp lệ' : '請輸入有效的批次數量基準');
            return;
          }
          finalRule = { cadence: 'batch', batchKind: 'batch_quantity', batchQuantity: num };
        } else if (batchKind === 'custom') {
          if (!customBatchText) {
            showModalFieldError(overlay, 'customBatchText', vi ? 'Vui lòng nhập tên mục tùy chỉnh' : '自訂項目名稱不可空白');
            return;
          }
          if (!customBatchValue) {
            showModalFieldError(overlay, 'customBatchValue', vi ? 'Vui lòng nhập số lượng hoặc nội dung' : '對應數量或文字內容不可空白');
            return;
          }
          finalRule = { cadence: 'batch', batchKind: 'custom', customBatchText, customBatchValue };
        }
      } else if (ruleCadence === 'time') {
        if (timeFrequency === 'custom') {
          if (!customTimeText) {
            showModalFieldError(overlay, 'customTimeText', vi ? 'Vui lòng nhập mô tả chu kỳ' : '自訂週期說明不可空白');
            return;
          }
          finalRule = { cadence: 'time', timeFrequency: 'custom', customTimeText };
        } else {
          finalRule = { cadence: 'time', timeFrequency };
        }
      }

      const selectedProducts = form.getAll('product').map(String);
      const isEnabled = Boolean(form.get('enabled'));
      const note = nativeFormValueText(form.get('note') || '');
      const reason = existing?.reason || '';

      const beforeSave = clone(version);
      const selectedError = errors.find(item => item.id === form.get('errorId')) || error;
      const value = version.snapshot.items.find(row=>row.id===existing?.id) || { id: `fqc-item:${crypto.randomUUID()}`, checkNo, isDeleted: false };
      Object.assign(value, {
        errorId: selectedError.id, category: selectedError.category, line: selectedError.line, name,
        description: nativeFormValueText(form.get('description') || ''),
        tool: finalTool,
        equipmentId: finalEqId,
        equipmentSnapshot: finalEqSnapshot,
        mediaItems: currentMedia, isEnabled,
        rule: finalRule,
        isMonthly: ruleCadence === 'time' && timeFrequency === 'monthly',
        isQuarterly: ruleCadence === 'time' && timeFrequency === 'quarterly',
        isYearly: ruleCadence === 'time' && timeFrequency === 'yearly',
        isCustomPeriod: ruleCadence === 'time' && timeFrequency === 'custom',
        customPeriodText: ruleCadence === 'time' && timeFrequency === 'custom' ? customTimeText : '',
        productCodes: selectedProducts, productRefs: selectedProducts.map(code => {
          const product = catalog().products.find(item => item.code === code);
          return { code, kind: product?.kind || 'unresolved', name: product?.name || '', specification: product?.specification || '' };
        }),
        reason, note
      });
      if(existing){
        const original=beforeSave.snapshot.items.find(row=>row.id===existing.id),keep=fields=>{for(const field of fields){if(Object.hasOwn(original,field))value[field]=clone(original[field]);else delete value[field];}};
        if(toolType===initialToolType&&selectedEqId===initialEquipmentId)keep(['tool','equipmentId','equipmentSnapshot']);
        if(JSON.stringify(finalRule)===JSON.stringify(currentRule))keep(['rule','isMonthly','isQuarterly','isYearly','isCustomPeriod','customPeriodText']);
        if(JSON.stringify(selectedProducts)===JSON.stringify(original.productCodes||[]))keep(['productCodes','productRefs','products']);
        if(JSON.stringify(currentMedia)===initialMediaJSON)keep(['mediaItems']);
      }
      if (!existing) version.snapshot.items.push(value);
      record(version, existing ? 'item-updated' : 'item-created', `${existing ? '修改' : '新增'}檢查項目 ${checkNo}`, note);
      try {
        await persist();
        if(formCurrent())closeModal(overlay);
      } catch (error) {
        Object.keys(version).forEach(key => delete version[key]);
        Object.assign(version, beforeSave);
        if(!library().workflow)localStorage.setItem(STORAGE, JSON.stringify(control));
        render();
        showModalAlert(overlay, 'error', error.message || (vi ? 'Lưu thất bại' : '儲存失敗'));
      }
    };
  }
  function openPhotoViewer(item, initialIndex = 0) {
    const photos = item.mediaItems || [];
    if (!photos.length) return;
    let currentIndex = Math.max(0, Math.min(initialIndex, photos.length - 1));

    const overlay = document.createElement('div');
    overlay.className = 'fqc-modal-overlay fqc-viewer-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    function renderViewer() {
      const photo = photos[currentIndex];
      overlay.innerHTML = `<div class="fqc-modal fqc-viewer-modal">
        <header>
          <h2>圖片檢視 · ${h(item.checkNo)} <small>(${currentIndex + 1} / ${photos.length})</small></h2>
          <button type="button" class="button ghost" data-close>關閉 (Esc)</button>
        </header>
        <div class="fqc-viewer-stage">
          ${photos.length > 1 ? '<button type="button" class="fqc-viewer-nav prev" id="fqc-viewer-prev" title="上一張 (←)" aria-label="上一張">‹</button>' : ''}
          <div class="fqc-viewer-frame">
            <img src="${h(photo.src)}" alt="${h(photo.name || `照片 ${currentIndex + 1}`)}" class="fqc-viewer-img">
          </div>
          ${photos.length > 1 ? '<button type="button" class="fqc-viewer-nav next" id="fqc-viewer-next" title="下一張 (→)" aria-label="下一張">›</button>' : ''}
        </div>
        <footer class="fqc-viewer-footer">
          <div class="fqc-viewer-info" data-i18n-skip="true">
            <b>${h(photo.name || `照片 ${currentIndex + 1}`)}</b>
            ${photo.note ? `<p class="fqc-viewer-note">${h(photo.note)}</p>` : '<p class="fqc-viewer-note muted">無備註</p>'}
          </div>
          <div class="fqc-viewer-actions">
            ${photos.length > 1 ? '<button type="button" class="button ghost" id="fqc-viewer-btn-prev">上一張</button><button type="button" class="button ghost" id="fqc-viewer-btn-next">下一張</button>' : ''}
            <button type="button" class="button signal" data-close>關閉</button>
          </div>
        </footer>
      </div>`;

      overlay.querySelectorAll('[data-close]').forEach(btn => btn.onclick = closeViewer);
      overlay.querySelector('#fqc-viewer-prev')?.addEventListener('click', () => {
        currentIndex = (currentIndex - 1 + photos.length) % photos.length;
        renderViewer();
      });
      overlay.querySelector('#fqc-viewer-next')?.addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % photos.length;
        renderViewer();
      });
      overlay.querySelector('#fqc-viewer-btn-prev')?.addEventListener('click', () => {
        currentIndex = (currentIndex - 1 + photos.length) % photos.length;
        renderViewer();
      });
      overlay.querySelector('#fqc-viewer-btn-next')?.addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % photos.length;
        renderViewer();
      });
    }

    function keyHandler(e) {
      if (e.key === 'Escape') {
        closeViewer();
      } else if (e.key === 'ArrowLeft' && photos.length > 1) {
        currentIndex = (currentIndex - 1 + photos.length) % photos.length;
        renderViewer();
      } else if (e.key === 'ArrowRight' && photos.length > 1) {
        currentIndex = (currentIndex + 1) % photos.length;
        renderViewer();
      }
    }

    function closeViewer() {
      window.removeEventListener('keydown', keyHandler);
      overlay.remove();
      document.body.classList.remove('fqc-modal-open');
    }

    window.addEventListener('keydown', keyHandler);
    document.body.append(overlay);
    document.body.classList.add('fqc-modal-open');
    renderViewer();
  }
  function fileData(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
  function openExistingModal(productCode) {
    const version = editable();
    const cat = categoryName(version);
    const allItems = itemRows(version, cat);
    const product = catalog().products.find(p => p.code === productCode) || {
      code: productCode,
      kind: 'product',
      name: productCode,
      specification: ''
    };

    const overlay = modal(`<form class="fqc-modal-form" id="fqc-batch-existing-form">
      <header>
        <h2>${isVi() ? 'Thêm vào hạng mục kiểm tra hiện có' : '加入既有檢查項目'}</h2>
        <button type="button" class="button ghost" data-close>${isVi() ? 'Quay lại' : '返回'}</button>
      </header>
      <div class="fqc-modal-body">
        <div class="fqc-modal-product-summary">
          <span class="prod-code"><code>${h(product.code)}</code></span>
          <span class="prod-name" data-i18n-skip="true">${h(product.name)}</span>
          ${product.specification ? `<span class="prod-spec" data-i18n-skip="true">${h(product.specification)}</span>` : ''}
          ${product.kind === 'semi-finished' ? '<span class="semi-tag">半成品</span>' : '<span class="kind-tag">成品</span>'}
        </div>
        <div class="fqc-modal-toolbar">
          <div class="fqc-selection-controls">
            <button type="button" class="button ghost master-small" id="fqc-select-all">${isVi() ? 'Chọn tất cả' : '全選'}</button>
            <button type="button" class="button ghost master-small" id="fqc-deselect-all">${isVi() ? 'Bỏ chọn tất cả' : '取消全選'}</button>
          </div>
          <div class="fqc-selection-count">
            ${isVi() ? 'Đã chọn' : '已選取'} <b id="fqc-selected-count">0</b> / ${allItems.length} ${isVi() ? 'mục' : '項'}
          </div>
        </div>
        <div class="fqc-batch-table-wrap">
          <table class="fqc-batch-table">
            <thead>
              <tr>
                <th class="fqc-batch-col-check"><input type="checkbox" id="fqc-batch-toggle-all" title="${isVi() ? 'Chọn tất cả' : '全選'}"></th>
                <th class="fqc-batch-col-no">${isVi() ? 'Mã kiểm tra FQC' : '完整檢查編號'}</th>
                <th class="fqc-batch-col-name">${isVi() ? 'Hạng mục kiểm tra' : '檢查名稱'}</th>
                <th class="fqc-batch-col-status">${isVi() ? 'Trạng thái' : '啟用狀態'}</th>
              </tr>
            </thead>
            <tbody>
              ${allItems.map(item => {
                const isAlreadyIncluded = (item.productCodes || []).includes(product.code);
                return `<tr class="fqc-batch-row ${isAlreadyIncluded ? 'selected-row' : ''}" data-item-id="${h(item.id)}">
                  <td class="fqc-batch-col-check">
                    <input type="checkbox" name="itemCheck" value="${h(item.id)}" ${isAlreadyIncluded ? 'checked' : ''}>
                  </td>
                  <td class="fqc-batch-col-no">
                    <code>${h(item.checkNo)}</code>
                  </td>
                  <td class="fqc-batch-col-name">
                    <span data-i18n-skip="true">${h(item.name)}</span>
                  </td>
                  <td class="fqc-batch-col-status">
                    <span class="fqc-status-badge ${item.isEnabled ? 'enabled' : 'disabled'}">
                      ${item.isEnabled ? (isVi() ? 'Kích hoạt' : '啟用') : (isVi() ? 'Vô hiệu hóa' : '停用')}
                    </span>
                  </td>
                </tr>`;
              }).join('') || `<tr><td colspan="4" class="fqc-empty-hint">${isVi() ? 'Nhóm sản phẩm này chưa có hạng mục kiểm tra nào' : '此類別尚無任何檢查項目'}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      <footer>
        <div class="fqc-modal-alert" role="alert"></div>
        <button class="button signal" type="submit" id="btn-batch-add">${window.VersionDraftUI.t('apply')}</button>
        <button type="button" class="button ghost" data-close>${isVi() ? 'Hủy' : '取消'}</button>
      </footer>
    </form>`);

    overlay.querySelectorAll('[data-close]').forEach(button => button.onclick = () => closeModal(overlay));

    const checkInputs = Array.from(overlay.querySelectorAll('input[name="itemCheck"]'));
    const countEl = overlay.querySelector('#fqc-selected-count');
    const toggleAllMaster = overlay.querySelector('#fqc-batch-toggle-all');

    function updateCount() {
      const checkedCount = checkInputs.filter(cb => cb.checked).length;
      if (countEl) countEl.textContent = String(checkedCount);
      if (toggleAllMaster) {
        toggleAllMaster.checked = checkedCount > 0 && checkedCount === checkInputs.length;
        toggleAllMaster.indeterminate = checkedCount > 0 && checkedCount < checkInputs.length;
      }
      checkInputs.forEach(cb => {
        const row = cb.closest('tr');
        if (row) row.classList.toggle('selected-row', cb.checked);
      });
    }

    updateCount();

    overlay.querySelectorAll('.fqc-batch-row').forEach(row => {
      row.addEventListener('click', event => {
        if (event.target.tagName.toLowerCase() === 'input') return;
        const cb = row.querySelector('input[name="itemCheck"]');
        if (cb) {
          cb.checked = !cb.checked;
          updateCount();
        }
      });
    });

    checkInputs.forEach(cb => {
      cb.addEventListener('change', updateCount);
    });

    overlay.querySelector('#fqc-select-all')?.addEventListener('click', () => {
      checkInputs.forEach(cb => cb.checked = true);
      updateCount();
    });

    overlay.querySelector('#fqc-deselect-all')?.addEventListener('click', () => {
      checkInputs.forEach(cb => cb.checked = false);
      updateCount();
    });

    if (toggleAllMaster) {
      toggleAllMaster.addEventListener('change', () => {
        const checked = toggleAllMaster.checked;
        checkInputs.forEach(cb => cb.checked = checked);
        updateCount();
      });
    }

    overlay.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      clearModalErrors(overlay);
      const checkedIds = checkInputs.filter(cb => cb.checked).map(cb => cb.value);
      if (!checkedIds.length) {
        showModalAlert(overlay, 'error', isVi() ? 'Vui lòng chọn ít nhất một hạng mục kiểm tra' : '請至少勾選一個檢查項目');
        return;
      }

      let _addedCount = 0;
      checkedIds.forEach(itemId => {
        const item = version.snapshot.items.find(it => it.id === itemId);
        if (!item) return;
        item.productCodes = item.productCodes || [];
        item.products = item.products || [];
        if (!item.productCodes.includes(product.code)) {
          item.productCodes.push(product.code);
          item.products.push({
            code: product.code,
            kind: product.kind || 'unresolved',
            name: product.name || '',
            specification: product.specification || ''
          });
          _addedCount++;
        }
      });

      record(version, 'items-batch-assigned', `將產品 ${product.code} 加入 ${checkedIds.length} 個既有檢查項目`, '');
      try {
        await persist();
        closeModal(overlay);
      } catch (error) {
        showModalAlert(overlay, 'error', error.message || (isVi() ? 'Lưu thất bại' : '儲存失敗'));
      }
    };
  }
  async function deleteError(id) {
    const version = editable(), error = version?.snapshot?.errors.find(item => item.id === id);
    if (!error) return;
    if (itemRows(version, error.category, id).length) return toast(isVi() ? 'Vui lòng xóa hoặc chuyển các hạng mục con trước' : '請先刪除或移轉所屬子項目');
    if (!confirm(isVi() ? `Xác nhận xóa mã lỗi ${error.code} - ${error.name}?` : `確定從草稿刪除錯誤代碼 ${error.code} · ${error.name}？`)) return;
    const beforeSave = clone(version);
    error.isDeleted = true;
    record(version, 'error-deleted', `刪除錯誤代碼 ${error.code}`, '');
    try {
      await persist(isVi() ? 'Mã lỗi đã xóa trong bản nháp' : '錯誤代碼已於草稿刪除');
    } catch (err) {
      Object.keys(version).forEach(key => delete version[key]);
      Object.assign(version, beforeSave);
      if(!library().workflow)localStorage.setItem(STORAGE, JSON.stringify(control));
      render();
      toast(displayDraftError(err));
    }
  }
  async function deleteItem(id) {
    const version = editable(), item = version?.snapshot?.items.find(value => value.id === id);
    if (!item) return;
    if (!confirm(isVi() ? `Xác nhận xóa hạng mục kiểm tra ${item.checkNo} - ${item.name}?` : `確定從草稿刪除檢查項目 ${item.checkNo} · ${item.name}？`)) return;
    const beforeSave = clone(version);
    item.isDeleted = true;
    record(version, 'item-deleted', `刪除檢查項目 ${item.checkNo}`, '');
    try {
      await persist(isVi() ? 'Hạng mục kiểm tra đã xóa trong bản nháp' : '檢查項目已於草稿刪除');
    } catch (err) {
      Object.keys(version).forEach(key => delete version[key]);
      Object.assign(version, beforeSave);
      if(!library().workflow)localStorage.setItem(STORAGE, JSON.stringify(control));
      render();
      toast(displayDraftError(err));
    }
  }
  function bind(element) {
    const sequence=++mountSequence;
    clearTimeout(sharedPoll);
    hostElement = element;
    ensureControl();
    hostElement.innerHTML=html();
    const current=()=>sequence===mountSequence&&hostElement===element&&fqcTabIsActive();
    loadShared(current).then(async()=>{if(!current())return;await loadMasterCatalog(current);if(!current())return;render();pollShared();return loadEquipmentCatalog();}).then(()=>{if(current()&&!hostElement.contains(document.activeElement))render();}).catch(error=>{if(!current())return;hostElement.innerHTML=`<section class="fqc-page"><p role="alert">${h(error.message)}</p><button id="fqc-load-retry">${isVi()?'Tải lại':'重新載入'}</button></section>`;hostElement.querySelector('#fqc-load-retry').onclick=()=>bind(hostElement);});
  }
  function fqcTabIsActive() {
    const content = document.querySelector('#data-content');
    // The tab is marked before SPA navigation pushes its URL. Its live host and
    // active data-tab marker are the source of truth during that transition.
    return hostElement === content && content?.isConnected && content.dataset.activeTab === 'quality-fqc';
  }
  function reviewHTML() {
    const all = library().versions.filter(version => ['pending','approved','superseded'].includes(version.status)).slice().reverse();
    const pending = all.filter(version => version.status === 'pending');
    const current = all.find(version => version.status === 'approved');
    const history = all.filter(version => version !== current && version.status !== 'pending');
    const caseButton = version => `<button data-quality-review="${h(version.id)}"><b>FQC ${h(version.number)} · ${h(statusLabel(version.status))}</b><span>${h(version.creatorName)} · ${formatDate(version.submittedAt || version.updatedAt)}</span></button>`;
    return `<section class="quality-review"><div class="review-list"><h3>FQC · ${isVi()?'Chờ duyệt':'待確認'} ${pending.length}</h3>${[...pending,...(current?[current]:[])].map(caseButton).join('') || `<p>${isVi()?'Chưa có hồ sơ FQC':'目前沒有 FQC 審核紀錄'}</p>`}${history.length?`<details><summary>${isVi()?'Lịch sử':'歷史版本'} · ${history.length}</summary>${history.map(caseButton).join('')}</details>`:''}</div><div id="quality-review-detail" class="review-detail"></div></section>`;
  }
  function bindReview(panel) {
    if(!library().workflow)loadShared().then(()=>{if(panel.isConnected&&library().workflow)refreshReviewUI(panel);}).catch(e=>toast(displayDraftError(e)));
    panel.querySelectorAll('[data-quality-review]').forEach(button => button.onclick = () => {
      const version = library().versions.find(item => item.id === button.dataset.qualityReview);
      if (!version) return;
      const base = library().versions.find(item => item.id === version.baseVersionId);
      const detail = panel.querySelector('#quality-review-detail');
      const before = base?.snapshot || { errors: [], items: [] };
      const after = version.snapshot;
      const canReview = version.status === 'pending' && (identity()?.role === 'admin'||typeof window.hasPermission==='function'&&(window.hasPermission('approval.approve')||window.hasPermission('approval.reject')));
      const canWithdraw = version.status === 'pending' && canWithdrawDraft();

      detail.innerHTML = `
        <h3>FQC ${h(version.number)} · ${h(statusLabel(version.status))}</h3>
        <p>${isVi()?'Mã lỗi':'錯誤代碼'}：${before.errors.filter(item => !item.isDeleted).length} → ${after.errors.filter(item => !item.isDeleted).length}<br>${isVi()?'Hạng mục kiểm tra':'檢查項目'}：${before.items.filter(item => !item.isDeleted).length} → ${after.items.filter(item => !item.isDeleted).length}</p>
        <div class="quality-diff">
          ${[...(version.history || [])].reverse().map(item => {const entry=historyDisplay(item);return `<p><b>${h(entry.label)}</b><span>${entry.note ? h(entry.note) + ' · ' : ''}${h(entry.actor)} · ${formatDate(item.at)}</span></p>`;}).join('')}
        </div>
        ${version.reviewedAt?`<p>${isVi()?'Người duyệt':'確認者'}：${h(reviewActor(version)||'—')} · ${formatDate(version.reviewedAt)}${version.reviewComment?`<br>${isVi()?'Ý kiến':'審核意見'}：${h(version.reviewComment)}`:''}</p>`:''}
        ${canReview?`<label>${isVi()?'Ý kiến duyệt (không bắt buộc)':'審核意見（選填）'}<textarea id="quality-review-comment" rows="3"></textarea></label>`:''}
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
          ${canReview ? `
            <button id="quality-reject" class="button ghost">${isVi()?'Trả lại':'發回'}</button>
            <button id="quality-approve" class="button signal">${isVi()?'Duyệt':'確認'}</button>
          ` : ''}
          ${canWithdraw ? `
            <button id="quality-withdraw" class="button ghost">解除送審（恢復草稿）</button>
          ` : ''}
        </div>
      `;

      sharedClient?.gatePermissions?.();
      detail.querySelector('#quality-reject')?.addEventListener('click', async () => {
        if(library().workflow){await reviewShared('return',version,panel);return;}
        if (!confirm(`確定將 FQC ${version.number} 發回修改？將恢復同一草稿可繼續編輯。`)) return;
        version.status = 'draft';
        version.reviewedAt = now();
        version.reviewerId = actor().id;
        record(version, 'revision-requested', '主管發回修改', '');
        try {
          await persist('FQC 版本已發回修改');
          void window.RoutineEquipmentUI?.reconcilePendingReplacements?.();
          refreshReviewUI(panel);
        } catch (err) { toast(displayDraftError(err)); }
      });

      detail.querySelector('#quality-approve')?.addEventListener('click', async () => {
        if(library().workflow){await reviewShared('approve',version,panel);return;}
        if (!confirm(`確定核准並生效 FQC ${version.number}？`)) return;
        const old = approved();
        if (old && old.id !== version.id) old.status = 'superseded';
        version.status = 'approved';
        version.reviewerId = actor().id;
        version.reviewerName = actor().name;
        version.reviewedAt = now();
        version.reviewComment = detail.querySelector('#quality-review-comment')?.value?.trim() || '';
        library().activeVersionId = version.id;
        record(version, 'approved', '主管確認版本', version.reviewComment);
        try {
          await persist('FQC 版本已核准生效');
          void window.RoutineEquipmentUI?.reconcilePendingReplacements?.();
          refreshReviewUI(panel);
        } catch (err) { toast(displayDraftError(err)); }
      });

      detail.querySelector('#quality-withdraw')?.addEventListener('click', async () => {
        if(library().workflow){await reviewShared('withdraw',version,panel);return;}
        if (!confirm(`確定解除送審 FQC ${version.number}？將恢復同一草稿可繼續編輯。`)) return;
        version.status = 'draft';
        version.submittedAt = '';
        record(version, 'withdrawn', '解除送審，恢復草稿', '');
        try {
          await persist('FQC 已解除送審，恢復草稿可編輯');
          void window.RoutineEquipmentUI?.reconcilePendingReplacements?.();
          refreshReviewUI(panel);
        } catch (err) { toast(displayDraftError(err)); }
      });
    });
    panel.querySelector('[data-quality-review]')?.click();
  }

  function refreshReviewUI(panel) {
    const reviewRoot = panel.querySelector('.quality-review');
    if (reviewRoot) {
      reviewRoot.outerHTML = reviewHTML();
      bindReview(panel);
    }
    const count = document.querySelector('#approval-tab-quality .approval-tab-count');
    if (count) count.textContent = String(pendingCount() + (window.IQCMasterUI?.pendingCount?.() || 0) + (window.RoutineEquipmentUI?.pendingCount?.() || 0));
    if (typeof render === 'function') render();
  }
  async function reviewShared(action,version,panel){try{
    const c=library().workflow.cases.find(c=>c.id===version.id);
    const answer=await window.VersionDraftUI.confirmReview({action:action==='return'?'reject':action,scope:'FQC · '+version.id,reason:panel.querySelector('#quality-review-comment')?.value||'',selfReview:action!=='withdraw'&&c?.actor.id===identity()?.id});
    if(!answer)return;
    await sharedAction(action,{caseId:version.id,...answer});refreshReviewUI(panel);
  }catch(error){toast(displayDraftError(error));}}

  function pendingCount() { return ensureControl().libraries.fqc.versions.filter(version => version.status === 'pending').length; }
  host.FQCMasterUI = { html, bind, reviewHTML, bindReview, pendingCount, get control() { return ensureControl(); } };
  host.FQCQualityAPI = {
    getEquipmentReferences(eqId) {
      const refs = [];
      const seen = new Set();
      if (!eqId) return refs;
      const ctrl = ensureControl();
      const lib = ctrl.libraries?.fqc;
      if (!Array.isArray(lib?.versions)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      const activeVerId = lib.activeVersionId;
      lib.versions.forEach(v => {
        if (!Array.isArray(v?.snapshot?.items)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
        const items = v.snapshot.items;
        const errors = v.snapshot?.errors || [];
        const errorMap = new Map(errors.map(e => [e.id, e]));
        items.forEach(it => {
          if (!it.isDeleted && it.equipmentId === eqId) {
            const relationKey = `${v.id}:${it.id}`;
            if (seen.has(relationKey)) return;
            seen.add(relationKey);
            const err = errorMap.get(it.errorId);
            refs.push({
              moduleId: 'fqc',
              moduleName: 'FQC',
              versionId: v.id,
              versionNumber: v.number,
              status: v.status,
              isActive: v.id === activeVerId && v.status === 'approved',
              category: it.category,
              errorId: it.errorId,
              errorCode: err?.code || '',
              errorName: err?.name || '',
              itemId: it.id,
              checkNo: it.checkNo,
              itemName: it.name,
              isEnabled: it.isEnabled !== false
            });
          }
        });
      });
      return refs;
    },
    openItemView(versionId, itemId) {
      openItemReadOnlyView(versionId, itemId);
    },
    async transferEquipment({ sourceEquipmentId, targetEquipment, itemIds, targetDraftId }) {
      const client=transport();let current=await client.read();
      if(current.control?.workflow){
        if(document.querySelector('.fqc-modal-overlay'))throw Error('FORM_OPEN_APPLY_OR_CANCEL_FIRST');
        if(current.control.workflow.pendingId)throw Error('PENDING_LOCKED');
        if(!current.control.versions.some(v=>v.status==='draft'))current=await client.begin();
        if(targetDraftId&&!current.control.versions.some(v=>v.id===targetDraftId&&v.status==='draft'))throw Error('DRAFT_CHANGED_RECONFIRM');
        const patches=[],guards=[];
        for(const id of itemIds){const item=current.control.workflow.working.items.find(row=>row.id===id&&!row.isDeleted);if(!item||item.equipmentId!==sourceEquipmentId)throw Error('DEPENDENCY_CHANGED');
          const path=['items',{id},'equipmentId'];patches.push({op:'set',path,value:targetEquipment.id});guards.push({path,value:sourceEquipmentId});}
        const result=await client.command(current.control.workflow.generation,'apply',{patches,guards});adopt(result);
        window.dispatchEvent(new CustomEvent('fqc-equipment-references-updated'));
        return{success:true,results:itemIds.map(itemId=>({itemId,status:'applied'})),saved:false};
      }
      if (targetDraftId) throw Error('請先重新預覽草稿版本，避免覆蓋既有修改');
      if (await window.ProcessSync?.flush?.() !== true) throw Error('FQC 尚有未完成的同步');
      const endpoint = `/api/quality-equipment-replacement?sourceId=${encodeURIComponent(sourceEquipmentId)}`;
      const previewResponse = await fetch(endpoint, { cache: 'no-store' });
      const preview = await previewResponse.json();
      if (!previewResponse.ok) throw Error(preview.error || '檢具替換預覽失敗');
      const response = await fetch('/api/quality-equipment-replacement', {
        method: 'POST', headers: { ...window.ProcessSync?.platformHeaders?.(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', baseRevision: preview.revision, moduleId: 'fqc',
          sourceEquipmentId, targetEquipmentId: targetEquipment.id, itemIds })
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'FQC 替換失敗');
      await window.ProcessSync?.refresh?.();
      return { success: !result.results.some(row => row.status === 'conflict'), results: result.results };
    }
  };

  window.addEventListener('process-language-change',()=>{if(fqcTabIsActive()&&!document.querySelector('.fqc-modal-overlay'))render();});
  window.addEventListener('process-shared-state-updated', () => {
    if(library().workflow){if(!document.querySelector('.fqc-modal-overlay'))loadShared().then(()=>{if(fqcTabIsActive())render();}).catch(e=>{ui.lastError=e.message;});return;}
    control = read(STORAGE, null);
    equipmentCache = null;
    equipmentLoadError = null;
    if (fqcTabIsActive()) {
      render();
      loadEquipmentCatalog({ force: true }).then(() => {
        if (fqcTabIsActive()) render();
      }).catch(() => {
        if (fqcTabIsActive()) render();
      });
    }
  });
  window.addEventListener('routine-equipment-updated', () => {
    equipmentCache = null;
    equipmentLoadError = null;
    if (fqcTabIsActive()) {
      loadEquipmentCatalog({ force: true }).then(() => { if (fqcTabIsActive()) render(); }).catch(() => { if (fqcTabIsActive()) render(); });
    }
  });
  window.addEventListener('fqc-equipment-references-updated', () => {
    document.querySelectorAll('[data-fqc-equipment-refs]').forEach(panel => {
      const overlay = panel.closest('.fqc-modal-overlay');
      if (overlay) void refreshEquipmentReferencePanel(overlay, panel.dataset.fqcEquipmentRefs);
    });
  });
})(window);
