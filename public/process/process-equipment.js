/* Equipment belongs to the PROCESS version snapshot, not a separate live database. */
(function (host) {
  'use strict';
  const unifiedKind = 'machine-assembly',
    legacyKind = 'machine-setting',
    machineKinds = [unifiedKind, legacyKind],
    t = (zh, vi) => document.documentElement.lang === 'vi' ? vi : zh,
    h = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    copy = value => JSON.parse(JSON.stringify(value));
  let committing = false;
  let search = '', lineFilter = '', stageFilter = '', editing = null, repaintGeneration = 0;

  function isMachineTemplate(template) {
    return machineKinds.includes(template?.presetKey);
  }
  function entries(snapshot) {
    return Object.entries(snapshot || {}).flatMap(([stage, templates]) =>
      (templates || []).flatMap(template => (template.equipment || []).map(equipment => ({stage, template, equipment}))),
    );
  }
  function uniqueEntries(snapshot) {
    const ids = new Set();
    return entries(snapshot).filter(row => row.equipment?.id && !ids.has(row.equipment.id) && ids.add(row.equipment.id));
  }
  function targetTemplate(snapshot, stageCode) {
    const list = snapshot?.[stageCode] || [];
    return list.find(template => template.presetKey === unifiedKind) || list.find(template => template.presetKey === legacyKind);
  }
  function currentEquipmentMount(area, content, owner) {
    return !!area?.isConnected && document.querySelector('#data-content') === area &&
      area.querySelector('#equipment-panel') === content && !host.ProcessSync?.requiresReload &&
      (!owner || host.ProcessSync?.isCurrentDelivery?.(owner) === true);
  }
  function repaint(showDialog = false, focusSearch = false, focusField = '') {
    const area = document.querySelector('#data-content');
    if (!area) return;
    const top = scrollY, owner = host.ProcessSync?.captureDelivery?.(), generation = ++repaintGeneration;
    area.innerHTML = processMasterView();
    bindDataInner('process-master');
    const content = area.querySelector('#equipment-panel'), input = area.querySelector('#equipment-search'),
      dialog = area.querySelector('#equipment-editor-dialog'),
      field = focusField ? area.querySelector(`[data-equipment-field="${CSS.escape(focusField)}"]`) : null;
    requestAnimationFrame(() => {
      if (generation !== repaintGeneration || !currentEquipmentMount(area, content, owner) || host.ProcessNavigationForms?.composing?.() ||
          input && (!input.isConnected || area.querySelector('#equipment-search') !== input) ||
          showDialog && dialog && (!dialog.isConnected || area.querySelector('#equipment-editor-dialog') !== dialog)) return;
      scrollTo(0, top);
      if (showDialog && dialog?.isConnected && area.querySelector('#equipment-editor-dialog') === dialog) {
        dialog.showModal();
        if (field?.isConnected && dialog.contains(field)) field.focus({preventScroll:true});
      }
      if (focusSearch && input?.isConnected && area.querySelector('#equipment-search') === input) {
        input.focus({preventScroll:true});
        try { input.setSelectionRange(input.value.length, input.value.length); } catch {}
      }
    });
  }
  function bindEquipmentRows(area) {
    area.querySelectorAll('[data-equipment-edit]').forEach(button => button.onclick = () => openEditor(button.dataset.equipmentEdit));
  }
  function refreshEquipmentSearch(area, input, content, owner) {
    if (!currentEquipmentMount(area, content, owner) || !input.isConnected || area.querySelector('#equipment-search') !== input) return;
    const summary = area.querySelector('#equipment-panel .equipment-summary');
    if (!summary) return;
    const template = document.createElement('template');
    template.innerHTML = panel();
    const next = template.content.querySelector('.equipment-summary');
    if (!next) return;
    summary.innerHTML = next.innerHTML;
    bindEquipmentRows(summary);
  }
  function validate(snapshot) {
    const errors = [], ids = new Set();
    Object.entries(snapshot || {}).forEach(([stage, templates]) => (templates || []).forEach(template => {
      if (template.equipment === undefined) return;
      if (!isMachineTemplate(template) || !Array.isArray(template.equipment)) {
        errors.push(`${stage}：設備清單格式不正確`);
        return;
      }
      template.equipment.forEach(item => {
        if (!item || typeof item !== 'object' || !item.id || !item.name || ids.has(item.id) ||
          item.stageCode !== stage || item.line !== stage.split('-')[0] ||
          !machineKinds.includes(item.kind) || typeof item.number !== 'string' || !Array.isArray(item.mediaItems))
          errors.push(`${stage}：設備資料缺漏或重複`);
        if (item?.id) ids.add(item.id);
      });
    }));
    return errors;
  }
  function cardButton(template) {
    return template?.presetKey === unifiedKind
      ? `<button type="button" class="button ghost equipment-card-button" data-equipment-open>${t('設備總表','Danh sách máy')}</button>`
      : '';
  }
  function approvedUsage(equipment) {
    const found = new Map(), equipmentNumber = String(equipment?.number || '').trim();
    (approvalVersions || []).filter(version => version.status === 'approved').forEach(version => {
      Object.entries(version.stages || {}).forEach(([stageCode, operations]) => (operations || []).forEach(operation => {
        const direct = (operation.machineIds || []).includes(equipment.id),
          snapshot = (operation.machineDetails || []).some(machine =>
            machine?.id === equipment.id || machine?.no === equipment.id ||
            (equipmentNumber && String(machine?.number || machine?.no || '') === equipmentNumber)),
          legacyNumber = equipmentNumber && (operation.machineIds || []).includes(equipmentNumber);
        if (!direct && !snapshot && !legacyNumber) return;
        const key = `${version.id}:${stageCode}:${operation.id}`;
        found.set(key, {
          line: version.line || stageCode.split('-')[0],
          stageCode,
          category: version.category || '',
          number: operation.number || '',
          name: operation.name || '',
          version: version.number || '',
        });
      }));
    });
    return [...found.values()];
  }
  function usageText(equipment) {
    const usage = approvedUsage(equipment);
    return usage.length
      ? [...new Set(usage.map(item => item.number).filter(Boolean))].join('、')
      : t('開啟設備查看引用','Mở thiết bị để xem tham chiếu');
  }
  function thumbnail(equipment) {
    const photo = equipment.mediaItems?.[0];
    return photo
      ? `<img decoding="async" src="${h(photo.src)}" alt="${h(equipment.number || equipment.name)}" loading="lazy">`
      : `<span aria-hidden="true">—</span>`;
  }
  function modalField(key, label, value, editable, wide = false) {
    return `<label class="${wide ? 'equipment-modal-wide' : ''}"><span>${label}</span><input data-equipment-field="${key}" value="${h(value)}" ${editable ? '' : 'disabled'}></label>`;
  }
  function editorModal(editable) {
    if (!editing) return '';
    const e = editing.record, usage = approvedUsage(e), canRemove = editable && canDeleteProcessMaster();
    return `<dialog id="equipment-editor-dialog" class="equipment-editor-dialog" data-i18n-skip="true"><div class="equipment-dialog-head"><div><small>${editing.isNew ? t('新增設備','Thêm máy') : t('設備資料','Dữ liệu máy')}</small><h3>${h(e.number || e.name || t('尚未命名','Chưa đặt tên'))}</h3></div><button type="button" data-equipment-close aria-label="${t('關閉','Đóng')}">×</button></div><div class="equipment-dialog-body"><section class="equipment-dialog-photos"><h4>${t('設備照片','Ảnh thiết bị')}</h4><div class="equipment-modal-photo-grid">${(e.mediaItems || []).map((photo,index) => `<figure><button type="button" class="equipment-photo-preview" data-lightbox-src="${h(photo.src)}" data-lightbox-type="${h(photo.type || 'image/jpeg')}" data-lightbox-title="${h(`${e.number || e.name} · ${index === 0 ? t('主要照片','Ảnh chính') : `${t('照片','Ảnh')} ${index + 1}`}`)}" data-lightbox-group="equipment-${h(e.id)}"><img src="${h(photo.src)}" alt="${h(e.number || e.name)}"></button><figcaption>${index === 0 ? t('主要照片','Ảnh chính') : `${t('照片','Ảnh')} ${index + 1}`}</figcaption>${canRemove ? `<button type="button" data-equipment-remove-photo="${index}" aria-label="${t('移除照片','Xóa ảnh')}">×</button>` : ''}</figure>`).join('') || `<p>${t('尚無照片','Chưa có ảnh')}</p>`}</div>${editable ? `<div class="equipment-photo-actions"><label class="button ghost"><input type="file" data-equipment-photo-replace accept="image/*"><span>${t('更換主要照片','Đổi ảnh chính')}</span></label><label class="button ghost"><input type="file" data-equipment-photo-add accept="image/*" multiple><span>${t('＋ 增加照片','＋ Thêm ảnh')}</span></label></div><small>${t('點擊照片可放大查看；新照片會自動壓縮。','Nhấn ảnh để phóng to; ảnh mới sẽ tự động nén.')}</small>` : ''}</section><section class="equipment-dialog-fields">${modalField('number',t('機器編號','Mã máy'),e.number,editable)}${modalField('name',t('機器名稱（中文）','Tên máy (Trung)'),e.name,editable)}${modalField('nameVi',t('機器名稱（越南文）','Tên máy (Việt)'),e.nameVi,editable)}<label><span>${t('產線／工段','Chuyền / Công đoạn')}</span><select data-equipment-stage ${editable ? '' : 'disabled'}>${routing.lines.flatMap(line => line.stages.map(stage => `<option value="${h(stage.code)}" ${stage.code === e.stageCode ? 'selected' : ''}>${h(line.code)} · ${h(stage.code)} · ${h(stage.name)}</option>`)).join('')}</select></label>${modalField('machineType',t('機器類型','Loại máy'),e.machineType || '',editable)}${modalField('purpose',t('用途（中文）','Công dụng (Trung)'),e.purpose || '',editable)}${modalField('purposeVi',t('用途（越南文）','Công dụng (Việt)'),e.purposeVi || '',editable,true)}<label class="equipment-modal-wide"><span>${t('備註','Ghi chú')}</span><textarea data-equipment-field="note" ${editable ? '' : 'disabled'}>${h(e.note || '')}</textarea></label><div class="equipment-approved-usage equipment-modal-wide"><b>${t('已核准使用流程','Quy trình đã duyệt sử dụng')}</b>${usage.length ? `<ul>${usage.map(item => `<li>${h(`${item.number} ${item.name} · V${item.version}`)}</li>`).join('')}</ul>` : `<p>${t('目前留空。製程編輯台的方塊通過主管確認後，這裡會自動顯示流程名稱。','Hiện đang trống. Sau khi ô quy trình được duyệt, tên quy trình sẽ tự động hiển thị tại đây.')}</p>`}</div><small class="equipment-modal-wide">${t('來源','Nguồn')}: ${h(e.source?.sheet || t('手動新增','Thêm thủ công'))}${e.source?.row ? ` · ${t('第','Dòng')} ${e.source.row}` : ''}</small></section></div><div class="equipment-dialog-actions">${canRemove && !editing.isNew ? `<button type="button" class="button ghost danger" data-equipment-delete>${t('刪除設備','Xóa máy')}</button>` : '<span></span>'}<div><button type="button" class="button ghost" data-equipment-close>${t('取消','Hủy')}</button>${editable ? `<button type="button" class="button signal" data-equipment-save>${t('套用設備內容','Áp dụng thiết bị')}</button>` : ''}</div></div></dialog>`;
  }
  function panel() {
    const editable = Boolean(editableProcessMasterData()),
      sourceButton = '',
      rows = uniqueEntries(currentProcessMasterData()).filter(row => isMachineTemplate(row.template)),
      lines = [...new Set(rows.map(row => row.equipment.line).filter(Boolean))].sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }),
      availableStages = [...new Set(rows.filter(row => !lineFilter || row.equipment.line === lineFilter).map(row => row.equipment.stageCode).filter(Boolean))].sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }),
      lowered = search.trim().toLowerCase(),
      shown = rows.filter(({equipment:e}) => (!lineFilter || e.line === lineFilter) && (!stageFilter || e.stageCode === stageFilter) && (!lowered || [e.number,e.name,e.nameVi,e.stageCode,e.line,e.machineType,e.purpose,e.purposeVi].join(' ').toLowerCase().includes(lowered)))
        .sort((a,b) => `${a.equipment.line}-${a.equipment.stageCode}-${a.equipment.number}`.localeCompare(`${b.equipment.line}-${b.equipment.stageCode}-${b.equipment.number}`)),
      groups = new Map();
    shown.forEach(row => { const key = `${row.equipment.line}\u0000${row.equipment.stageCode}`; (groups.get(key) || groups.set(key,[]).get(key)).push(row.equipment); });
    const groupHtml = [...groups.entries()].map(([key, equipment]) => {
      const [line, stageCode] = key.split('\u0000'), stage = stageFor(stageCode);
      return `<section class="equipment-stage-group"><header><div><span class="line-badge">${h(line)}</span><h4>${h(stageCode)} · ${h(stage?.name || stageCode)}</h4></div><small>${equipment.length} ${t('台設備','máy')}</small></header><div class="equipment-table-wrap"><table class="equipment-summary-table"><thead><tr><th>${t('照片','Ảnh')}</th><th>${t('機器編號','Mã máy')}</th><th>${t('機器名稱','Tên máy')}</th><th>${t('線別／工段','Chuyền / Công đoạn')}</th><th>${t('已核准流程','Quy trình đã duyệt')}</th><th>${t('操作','Thao tác')}</th></tr></thead><tbody>${equipment.map(e => `<tr data-equipment-id="${h(e.id)}"><td><button type="button" class="equipment-thumb" data-equipment-edit="${h(e.id)}">${thumbnail(e)}</button></td><td><code>${h(e.number || t('待補編號','Chưa có mã'))}</code></td><td><b>${h(t(e.name || e.nameVi,e.nameVi || e.name))}</b></td><td>${h(e.line)} · ${h(e.stageCode)}</td><td><span class="equipment-usage-summary ${approvedUsage(e).length ? 'used' : ''}">${h(usageText(e))}</span></td><td><button type="button" class="button ghost compact" data-equipment-edit="${h(e.id)}">${editable ? t('編輯','Sửa') : t('查看','Xem')}</button></td></tr>`).join('')}</tbody></table></div></section>`;
    }).join('');
    return `<section class="equipment-panel" id="equipment-panel" data-i18n-skip="true"><header class="equipment-panel-head"><div><p class="eyebrow">EQUIPMENT MASTER</p><h3>${t('機器設定 · 設備總表','Cài đặt máy · Danh sách thiết bị')}</h3><p>${t('依線別與工段分類。流程欄只顯示已通過主管確認的製程方塊。','Phân loại theo chuyền và công đoạn. Cột quy trình chỉ hiển thị các ô đã được duyệt.')} ${rows.length} ${t('台','máy')}</p></div><div class="equipment-actions">${editable && host.ProcessPermissions?.can('templates.create') ? `<button type="button" class="button signal" id="add-equipment">${t('＋ 新增設備','＋ Thêm máy')}</button>` : ''}${sourceButton}</div></header><div class="equipment-filters"><label><span>${t('搜尋設備','Tìm thiết bị')}</span><input id="equipment-search" value="${h(search)}" placeholder="${t('機器編號、名稱或工段','Mã máy, tên hoặc công đoạn')}" type="search"></label><label><span>${t('線別','Chuyền')}</span><select id="equipment-line-filter"><option value="">${t('全部線別','Tất cả chuyền')}</option>${lines.map(line => `<option value="${h(line)}" ${line === lineFilter ? 'selected' : ''}>LINE ${h(line)}</option>`).join('')}</select></label><label><span>${t('工段','Công đoạn')}</span><select id="equipment-stage-filter"><option value="">${t('全部工段','Tất cả công đoạn')}</option>${availableStages.map(code => `<option value="${h(code)}" ${code === stageFilter ? 'selected' : ''}>${h(code)} · ${h(stageFor(code)?.name || code)}</option>`).join('')}</select></label><button type="button" class="button ghost" id="equipment-filter-clear">${t('清除篩選','Xóa bộ lọc')}</button></div><div class="equipment-summary">${groupHtml || `<div class="equipment-empty"><b>${t('沒有符合條件的設備','Không có thiết bị phù hợp')}</b><p>${t('請調整搜尋或篩選條件。','Hãy đổi điều kiện tìm kiếm hoặc bộ lọc.')}</p></div>`}</div>${editorModal(editable)}</section>`;
  }
  async function saveVersion(label,before,next) {
    const draft = processMasterDraft();
    if (!draft || !editableProcessMasterData()) return false;
    const errors = validate(next||draft.snapshot);
    if (errors.length) { toast(errors[0]); return false; }
    try{if(before&&next){const delta=window.MasterDataWorkflow.shared.diff(before,next);await window.MasterDataWorkflow.shared.patch('PROCESS',delta.patches,delta.guards);}
      else{recordProcessMasterVersion(draft,label);await persistProcessMasterControl();}
    }catch(error){toast(error.message);return false;}
    toast(t('設備已同步至共用草稿；尚未手動儲存','Đã đồng bộ thiết bị vào bản nháp chung; chưa lưu thủ công'));
    return true;
  }
  function openEditor(id = '', focusField = '') {
    const row = uniqueEntries(currentProcessMasterData()).find(item => item.equipment.id === id),
      stageCode = row?.equipment.stageCode || routing.lines[0]?.stages[0]?.code || '';
    editing = row
      ? {record:copy(row.equipment), originalId:id, isNew:false}
      : {record:{id:`EQ-${crypto.randomUUID()}`,number:'',name:t('新設備','Máy mới'),nameVi:'',line:stageCode.split('-')[0],stageCode,kind:unifiedKind,machineType:'',mediaItems:[],purpose:'',purposeVi:'',note:''},originalId:'',isNew:true};
    editing.base=copy(editableProcessMasterData()||currentProcessMasterData());
    editing.initial=JSON.stringify(editing.record);
    repaint(true, false, focusField);
    const target=editing,box=document.querySelector('#equipment-editor-dialog .equipment-approved-usage'),actor=host.ProcessSync?.identity;
    if(box&&!target.isNew){
      box.textContent=t('正在查詢引用…','Đang kiểm tra tham chiếu…');
      fetch('/api/master/references?scope=PROCESS&kind=equipment&id='+encodeURIComponent(id),{headers:host.ProcessSync?.platformHeaders?.(),signal:AbortSignal.timeout(15000)}).then(async response=>{
        if(!response.ok)throw Error('REFERENCE_CHECK_FAILED');const result=await response.json();
        if(editing!==target||!box.isConnected||actor!==host.ProcessSync?.identity)return;
        box.innerHTML='<b>'+t('引用位置','Vị trí tham chiếu')+'</b>'+(result.total?'<ul>'+result.references.map(ref=>'<li>'+h([ref.products.join(', '),ref.line,ref.category,ref.stage,ref.number,ref.name,ref.status].filter(Boolean).join(' · '))+'</li>').join('')+'</ul>':'<p>'+t('目前沒有使用中的引用','Không có tham chiếu đang dùng')+'</p>')+(result.detailsRestricted?'<p>'+t('有引用，請交由有查看權限者處理。','Có tham chiếu; nhờ người có quyền xem xử lý.')+'</p>':'');
      }).catch(()=>{if(editing===target&&box.isConnected)box.textContent=t('引用查詢失敗；請重新開啟設備重試。刪除時仍會重新檢查。','Không tra được tham chiếu; mở lại để thử. Khi xóa vẫn kiểm tra lại.');});
    }
  }
  async function commitEditor() {
    if (!editableProcessMasterData() || !editing || committing || editing.uploading) return;
    const target = editing, submittedRecord = JSON.stringify(target.record);
    const snapshot=copy(target.base);
    const item = copy(target.record), template = targetTemplate(snapshot,item.stageCode);
    item.number = String(item.number || '').trim();
    item.name = String(item.name || '').trim();
    item.nameVi = String(item.nameVi || '').trim();
    item.line = item.stageCode.split('-')[0];
    item.kind = unifiedKind;
    delete item.quantity;
    delete item.process;
    if (!item.name) { toast(t('請填寫機器名稱','Vui lòng nhập tên máy')); return; }
    if (!template) { toast(`${item.stageCode}：${t('找不到機器設定流程','Không tìm thấy quy trình cài đặt máy')}`); return; }
    entries(snapshot).forEach(row => { row.template.equipment = (row.template.equipment || []).filter(e => e.id !== item.id); });
    (template.equipment ||= []).push(item);
    committing=true;
    try { if (!(await saveVersion(target.isNew ? t('新增設備','Thêm máy') : t('修改設備資料','Sửa dữ liệu máy'),target.base,snapshot))) return; } finally { committing=false; }
    if (editing !== target) return;
    if (JSON.stringify(target.record) !== submittedRecord) { target.base = copy(snapshot); return; }
    editing = null;
    repaint();
  }
  async function loadSource() {
    if(window.MasterDataWorkflow?.shared){toast(t('非 BOM 匯入入口已停用','Đã tắt nhập dữ liệu ngoài BOM'));return;}
    const draft = processMasterDraft();
    if (!draft || !editableProcessMasterData() || !canExchangeProcessMaster('master.import')) return;
    try {
      const response = await fetch('data/process-equipment-source.json?v=20260911-5900');
      if (!response.ok) throw new Error(t('設備來源讀取失敗','Không đọc được nguồn thiết bị'));
      const source = await response.json(), next = typeof normalizeProcessMasterPresetCatalog === 'function'
        ? normalizeProcessMasterPresetCatalog(draft.snapshot) : copy(draft.snapshot);
      let removed = 0;
      Object.values(next).flat().forEach(template => {
        if (!isMachineTemplate(template) || !Array.isArray(template.equipment)) return;
        const before = template.equipment.length;
        template.equipment = template.equipment.filter(item => !item.source?.sheet);
        removed += before - template.equipment.length;
      });
      for (const raw of source.records || []) {
        const template = targetTemplate(next,raw.stageCode);
        if (!template) throw new Error(`${raw.stageCode}：${t('找不到對應工段','Không tìm thấy công đoạn')}`);
        const record = copy(raw);
        record.kind = unifiedKind;
        delete record.quantity;
        delete record.process;
        (template.equipment ||= []).push(record);
      }
      const errors = validate(next);
      if (errors.length) throw new Error(errors[0]);
      if (!confirm(t(`將以新版 Excel 的 ${source.records.length} 台設備取代 ${removed} 筆舊匯入資料；手動新增設備會保留。確定繼續？`,`Thay ${removed} mục đã nhập cũ bằng ${source.records.length} máy từ Excel mới; máy thêm thủ công được giữ lại. Tiếp tục?`))) return;
      if (draft !== processMasterDraft() || !editableProcessMasterData()) return;
      draft.snapshot = next;
      if(!(await saveVersion(t('重新匯入新版設備 Excel','Nhập lại Excel thiết bị mới'))))return;
      repaint();
    } catch (error) { toast(error.message || t('設備匯入失敗','Nhập thiết bị thất bại')); }
  }
  async function updatePhotos(mode, files) {
    const target = editing, working = editableProcessMasterData(), draft = processMasterDraft();
    const dialog = document.querySelector('#equipment-editor-dialog');
    const actor = host.ProcessSync?.identity || (typeof currentUser === 'undefined' ? null : currentUser);
    const actorId = actor?.id;
    if (!target || target.uploading || !files?.length || !working || !dialog?.open || !dialog.isConnected) return;
    target.uploading=true;dialog.querySelector('.equipment-photo-retry')?.remove();
    const status=document.createElement('p');status.setAttribute('role','status');status.textContent=t('照片處理中…','Đang xử lý ảnh…');dialog.querySelector('.equipment-dialog-photos').append(status);
    const pendingFiles=[...files];
    try {
      const {items} = await prepareMediaUploads(pendingFiles);
      const currentActor = host.ProcessSync?.identity || (typeof currentUser === 'undefined' ? null : currentUser);
      if (editing !== target || editableProcessMasterData() !== working || processMasterDraft() !== draft ||
          currentActor !== actor || currentActor?.id !== actorId || !dialog.open || !dialog.isConnected ||
          document.querySelector('#equipment-editor-dialog') !== dialog) return;
      if (mode === 'replace') target.record.mediaItems = [items[0], ...(target.record.mediaItems || []).slice(1)];
      else target.record.mediaItems = [...(target.record.mediaItems || []), ...items];
      repaint(true);
    } catch (error) { toast(error.message);if(editing===target&&dialog.isConnected){const retry=document.createElement('button');retry.type='button';retry.className='button ghost equipment-photo-retry';retry.textContent=t('重試照片上傳','Thử tải ảnh lại');retry.onclick=()=>updatePhotos(mode,pendingFiles);dialog.querySelector('.equipment-dialog-photos').append(retry);}}finally{target.uploading=false;status.remove();}
  }
  function bind() {
    document.querySelectorAll('[data-equipment-open]').forEach(button => button.onclick = () => document.querySelector('#equipment-panel')?.scrollIntoView({block:'start',behavior:'smooth'}));
    document.querySelector('#add-equipment')?.addEventListener('click',() => openEditor());
    bindEquipmentRows(document);
    const searchInput = document.querySelector('#equipment-search');
    if (searchInput) {
      const area = document.querySelector('#data-content'), content = area?.querySelector('#equipment-panel'), owner = host.ProcessSync?.captureDelivery?.();
      let composing = false;
      const updateSearch = event => {
        if (composing || event.isComposing || !currentEquipmentMount(area, content, owner) || !searchInput.isConnected || area.querySelector('#equipment-search') !== searchInput || search === searchInput.value) return;
        search = searchInput.value;
        refreshEquipmentSearch(area, searchInput, content, owner);
      };
      searchInput.oncompositionstart = () => { composing = true; };
      searchInput.oncompositionend = event => { composing = false; updateSearch(event); };
      searchInput.oninput = updateSearch;
    }
    document.querySelector('#equipment-line-filter')?.addEventListener('change',event => { lineFilter = event.target.value; stageFilter = ''; repaint(); });
    document.querySelector('#equipment-stage-filter')?.addEventListener('change',event => { stageFilter = event.target.value; repaint(); });
    document.querySelector('#equipment-filter-clear')?.addEventListener('click',() => { search = lineFilter = stageFilter = ''; repaint(); });
    const closeEditor = () => {
      if (committing || editing?.uploading) return;
      if (editing && JSON.stringify(editing.record)!==editing.initial && !confirm(t('設備內容尚未套用，確定放棄變更？','Nội dung máy chưa áp dụng. Bỏ thay đổi?'))) return;
      document.querySelector('#equipment-editor-dialog')?.close(); editing=null;
    };
    document.querySelectorAll('[data-equipment-close]').forEach(button => button.onclick = closeEditor);
    document.querySelector('#equipment-editor-dialog')?.addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
    document.querySelectorAll('[data-equipment-field]').forEach(input => input.oninput = () => { if (editing) editing.record[input.dataset.equipmentField] = input.value; });
    document.querySelector('[data-equipment-stage]')?.addEventListener('change',event => { if (editing) { editing.record.stageCode = event.target.value; editing.record.line = event.target.value.split('-')[0]; } });
    document.querySelector('[data-equipment-photo-add]')?.addEventListener('change',event => updatePhotos('add',event.target.files));
    document.querySelector('[data-equipment-photo-replace]')?.addEventListener('change',event => updatePhotos('replace',event.target.files));
    document.querySelectorAll('[data-equipment-remove-photo]').forEach(button => button.onclick = () => { editing?.record.mediaItems.splice(Number(button.dataset.equipmentRemovePhoto),1); repaint(true); });
    document.querySelector('[data-equipment-save]')?.addEventListener('click',commitEditor);
    document.querySelector('[data-equipment-delete]')?.addEventListener('click',async() => {
      if (!editableProcessMasterData() || !editing || !canDeleteProcessMaster()) return;
      const target = editing, snapshot=copy(target.base);
      try{if(!await confirmProcessMasterRemoval('equipment',target.record.id,target.record.number||target.record.name))return;}catch(error){toast(error.message);return;}
      entries(snapshot).forEach(row => { row.template.equipment = (row.template.equipment || []).filter(item => item.id !== target.record.id); });
      if(!(await saveVersion(t('刪除設備','Xóa máy'),target.base,snapshot)))return;
      if (editing !== target) return;
      editing = null; repaint();
    });
    bindLightbox();
  }
  function asMachine(equipment) { return {...equipment,no:equipment.id,asset:'',people:1}; }
  function find(id,operation) {
    return operation?.machineDetails?.find(item => item.no === id || item.id === id) ||
      uniqueEntries(processMaster).map(row => asMachine(row.equipment)).find(item => item.no === id) ||
      machines.find(item => item.no === id);
  }
  function choices(operation,template) {
    const machineFlow = isMachineTemplate(template) || ['機器設定','機器組裝'].includes(operation?.name);
    const available = machineFlow
      ? uniqueEntries(processMaster).filter(row => row.stage === operation.stageCode && row.equipment.line === state.editorLine).map(row => asMachine(row.equipment))
      : machines.filter(item => item.line === state.editorLine && (!template?.machineIds?.length || template.machineIds.includes(item.no)));
    for (const id of operation.machineIds || (operation.machineId ? [operation.machineId] : [])) {
      if (available.some(item => item.no === id)) continue;
      const old = find(id,operation);
      available.push({...old,no:id,name:old?.name || t('歷史設備','Thiết bị lịch sử'),historical:true});
    }
    return available;
  }
  function selector(operation,available) {
    const selected = operation.machineIds || [], others = Object.values(ensureCategoryEditor()).flat().filter(item => item.id !== operation.id);
    return `<fieldset class="machine-multi" data-i18n-skip="true"><legend>${t('工段設備 · 可複選','Máy công đoạn · Chọn nhiều')}</legend><p>${h(operation.stageCode)} · ${t('同一台機器可在不同方塊重複選取；右側會顯示使用位置。','Một máy có thể được chọn trong nhiều ô; vị trí sử dụng hiển thị bên phải.')}</p><div class="multi-actions"><button type="button" id="select-all-machines">${t('全選','Chọn tất cả')}</button><button type="button" id="clear-machines">${t('清除','Xóa chọn')}</button><span>${t('已選','Đã chọn')} ${selected.length}</span></div><div class="check-list machine-multi-list">${available.map(machine => {
      const used = others.filter(item => (item.machineIds || []).some(id => id === machine.no || (machine.number && find(id,item)?.number === machine.number))).map(item => item.number), approved = approvedUsage(machine).map(item => item.number), current = selected.includes(machine.no), otherNumbers = [...new Set([...used,...approved])].filter(number => number && number !== operation.number), usageParts = [];
      if (current) usageParts.push(t('本方塊被選取','Đã chọn trong ô này'));
      if (otherNumbers.length) usageParts.push(`${t('其他方塊','Ô khác')}：${otherNumbers.map(h).join('、')}`);
      const usage = usageParts.join(' · ') || t('尚未在其他方塊使用','Chưa dùng ở ô khác');
      return `<label class="equipment-choice ${current ? 'is-current' : ''}"><input type="checkbox" data-operation-machine="${h(machine.no)}" ${current ? 'checked' : ''}>${machine.mediaItems?.[0] ? `<img decoding="async" src="${h(machine.mediaItems[0].src)}" alt="${h(machine.number || machine.name)}" loading="lazy">` : ''}<span><code>${h(machine.number || (machine.no.startsWith('EQ-') ? t('待補編號','Chưa có mã') : machine.no))}</code><b>${h(t(machine.name || machine.nameVi,machine.nameVi || machine.name))}</b>${machine.historical ? `<small>${t('原已選設備；已不在目前工段清單，可取消。','Thiết bị cũ; có thể bỏ chọn.')}</small>` : ''}</span><small class="equipment-used">${usage}</small></label>`;
    }).join('') || `<p>${t('此工段尚無已核准設備，請先在流程資料載入設備並完成送審。','Công đoạn này chưa có máy được duyệt.')}</p>`}</div></fieldset>`;
  }
  async function portable(snapshot) {
    const next = copy(snapshot), cache = new Map(), resources = [];
    async function embed(item) {
      if (!item.src) return;
      const original = item.src;
      if (cache.has(original)) { item.src = await cache.get(original); return; }
      const promise = (async () => {
        let content = original;
        if (!original.startsWith('data:')) {
          const url = new URL(original,location.href);
          if (url.origin !== location.origin) throw new Error(t('外部照片需先上傳，才能完整匯出','Tải ảnh bên ngoài lên trước khi xuất'));
          const response = await fetch(url);
          if (!response.ok) throw new Error(t('照片讀取失敗，未匯出不完整檔案','Không đọc được ảnh'));
          const blob = await response.blob();
          content = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
        }
        const id = `process-photo:${resources.length + 1}`;
        resources.push({id,original:original.startsWith('data:') ? '' : original,content});
        return id;
      })();
      cache.set(original,promise); item.src = await promise;
    }
    for (const templates of Object.values(next)) for (const template of templates) {
      template.mediaItems = processTemplateMediaItems(template);
      for (const photo of template.mediaItems) await embed(photo);
      setProcessTemplateMedia(template,template.mediaItems);
      for (const equipment of template.equipment || []) for (const photo of equipment.mediaItems || []) await embed(photo);
    }
    Object.defineProperty(next,'__photoResources',{value:resources});
    return next;
  }
  function exportSheets(workbook,snapshot) {
    const rows = [], photos = [];
    uniqueEntries(snapshot).forEach(({stage,template,equipment:e}) => {
      const extra = {...e};
      ['id','number','line','stageCode','kind','name','nameVi','process','quantity','machineType','purpose','purposeVi','note','mediaItems'].forEach(key => delete extra[key]);
      rows.push({'工段編號':stage,'流程編號':template.id,'設備識別碼':e.id,'機器編號':e.number,'生產線':e.line,'機器名稱中文':e.name,'機器名稱越南文':e.nameVi || '','機器類型':e.machineType || '','用途中文':e.purpose || '','用途越南文':e.purposeVi || '','已核准使用流程':usageText(e),'備註':e.note || '','其他資料JSON':JSON.stringify(extra)});
      (e.mediaItems || []).forEach((photo,index) => { const count = Math.max(1,Math.ceil(photo.src.length / 28000)); for (let part = 0; part < count; part++) photos.push({'設備識別碼':e.id,'照片順序':index + 1,'檔名':photo.name || '','類型':photo.type || 'image/jpeg','分段順序':part + 1,'分段總數':count,'照片資料':photo.src.slice(part * 28000,(part + 1) * 28000)}); });
    });
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(rows),'設備資料');
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(photos),'設備照片');
    const resources = [];
    for (const photo of snapshot.__photoResources || []) { const count = Math.ceil(photo.content.length / 28000); for (let part = 0; part < count; part++) resources.push({'照片識別碼':photo.id,'原始位置':photo.original,'分段順序':part + 1,'分段總數':count,'照片資料':photo.content.slice(part * 28000,(part + 1) * 28000)}); }
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(resources),'照片內容');
  }
  function readSheets(workbook,snapshot,version) {
    if (version < 2) return;
    if (!workbook.Sheets['設備資料'] || !workbook.Sheets['設備照片']) throw new Error('Excel 缺少設備資料／設備照片分頁');
    Object.values(snapshot).flat().forEach(template => { if (isMachineTemplate(template)) template.equipment = []; });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['設備資料'],{defval:''}), photoRows = XLSX.utils.sheet_to_json(workbook.Sheets['設備照片'],{defval:''}), groups = new Map(), ids = new Set();
    for (const photo of photoRows) { const key = `${photo['設備識別碼']}\u0000${photo['照片順序']}`; if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(photo); }
    for (const row of rows) {
      const stage = String(row['工段編號']), id = String(row['設備識別碼']), template = targetTemplate(snapshot,stage);
      if (!template || !id || ids.has(id)) throw new Error(`${id || stage}：設備對應流程不存在或識別碼重複`);
      ids.add(id);
      const mediaItems = [...groups.entries()].filter(([key]) => key.startsWith(id + '\u0000')).sort((a,b) => Number(a[0].split('\u0000')[1]) - Number(b[0].split('\u0000')[1])).map(([,parts]) => {
        parts.sort((a,b) => Number(a['分段順序']) - Number(b['分段順序'])); const count = Number(parts[0]['分段總數']);
        if (parts.length !== count || parts.some((part,index) => Number(part['分段順序']) !== index + 1 || Number(part['分段總數']) !== count)) throw new Error(`${id}：設備照片分段不完整`);
        return {src:parts.map(part => part['照片資料']).join(''),name:String(parts[0]['檔名']),type:String(parts[0]['類型'])};
      });
      let extra = {};
      try { extra = JSON.parse(row['其他資料JSON'] || '{}'); } catch { throw new Error(`${id}：其他資料 JSON 格式錯誤`); }
      delete extra.quantity; delete extra.process;
      const equipment = {...extra,id,number:String(row['機器編號']),line:String(row['生產線'] || stage.split('-')[0]),stageCode:stage,kind:unifiedKind,name:String(row['機器名稱中文']),nameVi:String(row['機器名稱越南文']),machineType:String(row['機器類型'] || ''),purpose:String(row['用途中文']),purposeVi:String(row['用途越南文']),note:String(row['備註']),mediaItems};
      (template.equipment ||= []).push(equipment);
    }
    if (photoRows.some(photo => !ids.has(String(photo['設備識別碼'])))) throw new Error('設備照片有找不到的設備識別碼');
    const errors = validate(snapshot); if (errors.length) throw new Error(errors[0]);
  }
  async function restorePhotos(workbook,snapshot,version) {
    if (version < 2) return;
    if (!workbook.Sheets['照片內容']) throw new Error('Excel 缺少照片內容分頁');
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['照片內容'],{defval:''}), groups = new Map(), resolved = new Map();
    for (const row of rows) { const id = String(row['照片識別碼']); if (!groups.has(id)) groups.set(id,[]); groups.get(id).push(row); }
    for (const [id,parts] of groups) {
      parts.sort((a,b) => Number(a['分段順序']) - Number(b['分段順序'])); const count = Number(parts[0]['分段總數']);
      if (parts.length !== count || parts.some((part,index) => Number(part['分段順序']) !== index + 1 || Number(part['分段總數']) !== count)) throw new Error(`${id}：照片內容分段不完整`);
      const content = parts.map(part => part['照片資料']).join('');
      if (!content.startsWith('data:image/') && !content.startsWith('data:video/')) throw new Error(`${id}：照片格式不正確`);
      let src = content; const original = String(parts[0]['原始位置'] || '');
      if (original.startsWith('assets/')) try { const response = await fetch(original); if (response.ok) { const blob = await response.blob(), data = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); if (data.split(',')[1] === content.split(',')[1]) src = original; } } catch {}
      resolved.set(id,src);
    }
    const restore = photo => { if (!photo.src?.startsWith('process-photo:')) return; if (!resolved.has(photo.src)) throw new Error('照片內容遺漏'); photo.src = resolved.get(photo.src); };
    for (const template of Object.values(snapshot).flat()) { for (const photo of template.mediaItems || []) restore(photo); setProcessTemplateMedia(template,template.mediaItems || []); for (const equipment of template.equipment || []) for (const photo of equipment.mediaItems || []) restore(photo); }
  }
  function display(id,operation) { const machine = find(id,operation); return machine ? {...machine,no:machine.number || machine.no,asset:machine.asset || '—'} : undefined; }
  function locate(id, field = 'name') {
    if (!uniqueEntries(currentProcessMasterData()).some(row => row.equipment.id === id)) return;
    search = lineFilter = stageFilter = '';
    openEditor(id, field);
  }
  host.ProcessEquipment = {cardButton,panel,bind,validate,entries,choices,selector,find,display,portable,exportSheets,readSheets,restorePhotos,loadSource,approvedUsage,locate};
  host.addEventListener('process-language-change',() => { if (document.querySelector('#equipment-panel')) repaint(Boolean(editing)); });
  const baseView = processMasterView, baseBind = bindDataInner;
  processMasterView = function () { return baseView() + panel(); };
  bindDataInner = function (tab) { baseBind(tab); if (tab === 'process-master') bind(); };
})(window);
