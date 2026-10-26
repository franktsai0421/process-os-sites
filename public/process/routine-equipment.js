(() => {
  const displayDraftError = error => window.sharedDraftErrorMessage?.(error) ?? (typeof error === 'string' ? error : error?.message || String(error ?? ''));
  const api = '/api/routine-equipment';
  const query = new URL(location.href).searchParams.get('manage') === '1' ? '?manage=1' : '';
  const endpoint = api + query;
  const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const clone = value => JSON.parse(JSON.stringify(value));
  const date = value => window.VersionDraftUI?.date(value) || '—';
  const lastEdit = version => [...(version?.history||[])].reverse().find(event=>!['submit','approve','reject','withdraw'].includes(event.action));
  const pendingPhotos = new Map();
  const photo = item => pendingPhotos.get(item?.id)?.url || (item?.photoHidden ? '' : item?.photoId ? `${api}/photo?id=${item.photoId}` : item?.photoSource?.webPath || '');
  const vietnamToday = () => {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()); }
    catch { return new Date().toISOString().slice(0, 10); }
  };
  const lang = () => {
    const tabLanguage = String(document.documentElement.lang || '').toLowerCase();
    if (tabLanguage === 'vi') return 'vi';
    if (tabLanguage === 'zh' || tabLanguage.startsWith('zh-')) return 'zh';
    return localStorage.getItem('processUILanguage') === 'vi' ? 'vi' : 'zh';
  };
  const t = (zh, vi) => lang() === 'vi' ? vi : zh;
  const norm = str => String(str || '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const naturalSort = (a, b) => {
    const codeA = String(a.assetCode || '');
    const codeB = String(b.assetCode || '');
    const cmp = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    const markA = Number(a.pieceMark) || 0;
    const markB = Number(b.pieceMark) || 0;
    if (markA !== markB) return markA - markB;
    return String(a.pieceMark || '').localeCompare(String(b.pieceMark || ''));
  };

  let host = null, control = null, revision = null, working = null, readUnavailable = false, controlActor = '';
  let selectedVersionId = '', selectedCategory = '', selectedSubcategory = '', selectedGroup = '';
  let selectedEquipmentId = '', editingEquipmentId = '', search = '', busy = false, message = '', reviewHost = null;
  let equipmentPage = 1, submitProblems = [], openErrors = false, composing = false;
  let equipmentEditRequest = 0;
  let problemSnapshot = null;
  let nodeDialog = null, viewDialog = null, formSnapshot = null, addingEquipment = false, newEquipmentForm = null, newEquipmentOwner = null, equipmentReadAttempt = null, transferDialog = null;
  const equipmentRefCache = new Map();
  let sharedClient=null,sharedActor='',syncBase=null,syncGeneration=null,sharedPoll;
  function sharedTransport(){const id=identity()?.id;if(!id)throw Error('LOGIN_REQUIRED');if(sharedActor!==id){sharedActor=id;sharedClient=window.createSharedDraftClient({endpoint:api+'/workflow?caseMetadata=1',legacyArchive:true,conditionalState:true,actorId:id,headers,permissionGates:{edit:'#routine-add,#routine-begin,#routine-form-apply,#routine-add-submit,[data-equipment-edit],[data-node-add],[data-node-edit],#routine-dialog-confirm,[data-issue-result],[data-issue-resolve]',save:'#routine-save',submit:'#routine-submit',withdraw:'#routine-withdraw,[data-routine-review="withdraw"]',approve:'[data-routine-review="approve"]',return:'[data-routine-review="reject"]',history:'#routine-case-history',delete:'#routine-delete,[data-equipment-delete],[data-node-delete]'}});}return sharedClient;}
  function snapshotChanges(base,next){const patches=[],guards=[],fields={equipment:['name','unit','spec','owner','enabled','calibrationMethod','calibrationCycle','customCycle','calibratedAt','expiresAt','notes','intakeDate','confirmed','photoId','photoHidden','groupId'],groups:['name','nameZh','nameVi','photoId','spec','notes','categoryId','subcategoryId'],categories:['name','photoId'],subcategories:['name','categoryId','photoId'],issues:['status','resolution']};
    for(const collection of Object.keys(fields)){
      for(const old of base[collection]||[])if(!(next[collection]||[]).some(r=>r.id===old.id)){const path=[collection,{id:old.id}];patches.push({op:'remove',path});guards.push({path,value:old});}
      for(const row of next[collection]||[]){const old=(base[collection]||[]).find(r=>r.id===row.id);if(!old){patches.push({op:'insert',path:[collection],value:row});continue;}
        for(const field of fields[collection])if(row[field]!==undefined&&JSON.stringify(row[field])!==JSON.stringify(old[field])&&!(row[field]===''&&old[field]==null)){const path=[collection,{id:row.id},field];patches.push({op:'set',path,value:row[field]});guards.push({path,value:old[field]});}
      }
    }return{patches,guards};
  }
  async function writeShared(action,more={}){
    if(readUnavailable||controlActor!==identity()?.id){message=t('資料讀取失敗；保留目前內容，請先重新載入核對。','Không tải được dữ liệu; giữ nội dung hiện tại, hãy tải lại và đối chiếu trước.');render();return null;}
    if(busy)return null;busy=true;
    const priorFocusedId=host?.contains(document.activeElement)?document.activeElement.id:'';
    host?.querySelectorAll('#routine-save,#routine-submit').forEach(button=>{button.disabled=true;});
    const saveButton=host?.querySelector('#routine-save');if(saveButton&&action==='save')saveButton.textContent=t('儲存中…','Đang lưu…');
    try{
      const client=sharedTransport();if(client.hasUnknown()){await client.resolveUnknown();throw Error(t('已查證前次操作，請重新載入核對後繼續','Đã xác minh thao tác trước; tải lại và đối chiếu trước khi tiếp tục'));}
      const local=working&&clone(working),base=syncBase||open()&&snapshotOf(open());
      if(!control.workflow||action==='begin'){const r=await client.begin();control=r.control;revision=r.revision;if(!syncGeneration)syncGeneration=control.workflow.generation;if(action==='begin'){selectedVersionId=open()?.id;working=snapshotOf(open());syncBase=clone(working);return r;}}
      const flow=control.workflow;let commandAction=action,detail={};
      if(action==='apply'){
        for(const [id,pending]of pendingPhotos){const row=['equipment','categories','subcategories','groups'].flatMap(k=>local[k]).find(r=>r.id===id);if(row)row.photoId=await uploadImage(pending.file);}
        detail=snapshotChanges(base||flow.working,local);if(!detail.patches.length)return{control,revision};
      }else if(action==='save'){
        await client.flush();if((editingEquipmentId||nodeDialog||addingEquipment)&&!confirm(t('只儲存已同步內容，不包含未套用表單。繼續？','Chỉ lưu nội dung đã đồng bộ, không gồm biểu mẫu chưa áp dụng. Tiếp tục?')))return null;
      }else if(action==='submit'){
        if(!flow.saved)throw Error('SUCCESSFUL_SAVE_REQUIRED');const reason=await window.VersionDraftUI.confirmSubmit(window.VersionDraftUI.reasonFor(selected(),flow),t('檢具全庫','Toàn bộ thiết bị'));if(!reason)return null;
        detail={savedId:flow.saved.id,reason};
      }else if(['approve','reject','withdraw'].includes(action)){
        commandAction=action==='reject'?'return':action;const caseId=more.versionId||flow.pendingId,c=flow.cases.find(c=>c.id===caseId);
        const answer=await window.VersionDraftUI.confirmReview({action,scope:t('檢具全庫','Toàn bộ thiết bị')+' · '+caseId,reason:more.comment||'',selfReview:action!=='withdraw'&&c?.actor.id===identity()?.id});if(!answer)return null;detail={caseId,...answer};
      }
      const result=await client.command(action==='apply'?syncGeneration||flow.generation:flow.generation,commandAction,detail);
      if(result.control){control=result.control;revision=result.revision;}else await read();selectedVersionId=open()?.id||active()?.id||'';
      if(action!=='apply'){submitProblems=[];problemSnapshot=null;openErrors=false;}
      if(action!=='save'||!editingEquipmentId&&!nodeDialog&&!addingEquipment){working=open()?.status==='draft'?snapshotOf(open()):null;syncBase=working&&clone(working);syncGeneration=control.workflow.generation;}
      if(action==='apply'){for(const p of pendingPhotos.values())URL.revokeObjectURL(p.url);pendingPhotos.clear();}
      message=action==='save'?t('共用快照已儲存至伺服器','Đã lưu bản chụp chung trên máy chủ'):action==='apply'?t('已同步 · 尚未手動儲存','Đã đồng bộ · chưa lưu thủ công'):t('操作已由伺服器確認','Máy chủ đã xác nhận');
      window.dispatchEvent(new CustomEvent('routine-equipment-updated',{detail:{revision,activeVersionId:control.activeVersionId,action}}));return result;
    }catch(error){
      message=error.message;
      if(Array.isArray(error.details?.issues)){
        const flow=control.workflow;
        problemSnapshot={kind:action==='submit'?'saved':'case',id:action==='submit'?flow.saved?.id:more.versionId||flow.pendingId,generation:flow.generation};
        submitProblems=error.details.issues.map(issue=>({kind:issue.kind,id:issue.path?.[0]==='equipment'?issue.path[1]?.id||'':'',field:issue.path?.[2]||(issue.message==='EQUIPMENT_STILL_REFERENCED'?'enabled':''),message:issue.message,requestId:error.requestId}));
        openErrors=true;
        message=t('已儲存的送審內容未通過驗證，請查看報錯與待補。修正後須手動儲存再送審。','Nội dung đã lưu để gửi duyệt chưa đạt kiểm tra. Xem lỗi và mục cần bổ sung; sửa rồi lưu thủ công trước khi gửi lại.');
      }
      return null;
    }finally{busy=false;if(action==='apply'&&document.activeElement?.matches('[data-issue-result]')){const status=host?.querySelector('#routine-shared-status');if(status)status.textContent=displayDraftError(message);}else{
      const focusedId=host?.contains(document.activeElement)?document.activeElement.id:priorFocusedId,scrollX=window.scrollX,scrollY=window.scrollY;
      render();if(focusedId){document.getElementById(focusedId)?.focus({preventScroll:true});window.scrollTo(scrollX,scrollY);}
    }}
  }
  // Preserve this unapplied drawer; renewal reads never acknowledge or replay it.
  function captureAddEquipmentInput() {
    if (!addingEquipment || !newEquipmentForm || !routineTabIsActive()) return;
    const fields = {assetCode:'asset-code',name:'name',unit:'unit',owner:'owner',calibrationMethod:'calibration-method',calibrationCycle:'calibration-cycle',customCycle:'custom-cycle',calibratedAt:'calibrated-at',expiresAt:'expires-at',intakeDate:'intake-date',spec:'spec',notes:'notes',groupId:'group-select'};
    for (const [field, id] of Object.entries(fields)) {
      const input = host.querySelector('#routine-add-' + id);
      if (input) newEquipmentForm[field] = input.value;
    }
    for (const field of ['enabled','confirmed']) {
      const input = host.querySelector('#routine-add-' + field);
      if (input) newEquipmentForm[field] = input.value === 'true';
    }
    // pendingPhoto retains the exact File and object URL; never clone/revoke/upload.
  }
  function bindAddEquipmentInput() {
    const drawer = host?.querySelector('#routine-add-modal'), page = host, form = newEquipmentForm, owner = newEquipmentOwner;
    if (!drawer || drawer.dataset.routineInputBound || !form || !owner) return;
    const capture = event => {
      if (!drawer.isConnected || !drawer.contains(event.target) || !routineTabIsActive() || host !== page ||
          newEquipmentForm !== form || newEquipmentOwner !== owner || identity()?.id !== owner.actor ||
          window.ProcessSync?.identityGeneration?.() !== owner.epoch) return;
      captureAddEquipmentInput();
    };
    drawer.dataset.routineInputBound = 'true';
    drawer.addEventListener('input', capture);
    drawer.addEventListener('change', capture);
  }
  function showEquipmentReadRecovery(error) {
    readUnavailable = true;
    message = displayDraftError(error);
    if (!routineTabIsActive()) return;
    window.VersionDraftUI?.updateSync?.(host, busy, true);
    const status = host.querySelector('#routine-shared-status');
    if (status) status.textContent = t('同步失敗；保留目前內容：','Đồng bộ thất bại; giữ nội dung: ') + message;
    host.querySelectorAll('#routine-add-submit,#routine-save,#routine-submit,#routine-begin').forEach(button => {button.disabled = true;});
    if (!addingEquipment || !newEquipmentForm) return;
    const footer = host.querySelector('#routine-add-modal .routine-modal-footer');
    if (!footer) return;
    let button = footer.querySelector('#routine-add-load-retry');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button'; button.id = 'routine-add-load-retry'; button.className = 'button signal';
      button.addEventListener('click', recoverAddEquipmentRead);
      footer.prepend(button);
    }
    button.textContent = t('重新載入並保留輸入','Tải lại và giữ dữ liệu đang nhập');
    button.disabled = busy;
  }
  async function recoverAddEquipmentRead() {
    if (busy || equipmentReadAttempt || !addingEquipment || !newEquipmentForm || !routineTabIsActive()) return;
    const actor = identity()?.id, epoch = window.ProcessSync?.identityGeneration?.(), page = host,
      form = newEquipmentForm, draft = working, base = syncBase, generation = syncGeneration,
      flowGeneration = control?.workflow?.generation, pendingId = control?.workflow?.pendingId,
      versionId = selectedVersionId, previousRevision = revision, client = sharedClient;
    const ownsAttempt = () => equipmentReadAttempt === attempt && routineTabIsActive() && host === page && identity()?.id === actor &&
      window.ProcessSync?.identityGeneration?.() === epoch && controlActor === actor &&
      newEquipmentForm === form && addingEquipment && !!client && sharedClient === client &&
      newEquipmentOwner?.actor === actor && newEquipmentOwner?.epoch === epoch;
    const sameContext = () => ownsAttempt() && working === draft && syncBase === base &&
      syncGeneration === generation && control?.workflow?.generation === flowGeneration &&
      control?.workflow?.pendingId === pendingId && selectedVersionId === versionId &&
      newEquipmentOwner?.generation === generation;
    captureAddEquipmentInput();
    const attempt = {};
    equipmentReadAttempt = attempt;
    busy = true;
    try {
      if (!actor || !Number.isSafeInteger(epoch) || !sameContext()) throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      if (generation !== flowGeneration) throw Error('DEPENDENCY_CHANGED_RECONFIRM');
      if (client.hasUnknown() || client.hasSyncFailures()) throw Error('PREVIOUS_OPERATION_UNKNOWN');
      showEquipmentReadRecovery(message);
      // Existing normal projection authenticates the cookie on the server. No identity/token mutation.
      const response = await fetch('/api/shared-state', {cache:'no-store',headers:headers(),signal:AbortSignal.timeout(15000)});
      const freshIdentity = await response.json();
      if (!sameContext()) throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      if (!response.ok || freshIdentity.identity?.id !== actor || freshIdentity.identity?.sessionType !== 'platform') throw Error('LOGIN_REQUIRED');
      const result = await client.read();
      if (!sameContext()) throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      if (client.hasUnknown() || client.hasSyncFailures()) throw Error('PREVIOUS_OPERATION_UNKNOWN');
      const access = result.permissions;
      if (!access || ['view','edit','save','submit','withdraw','approve','return','history','delete'].some(key => typeof access[key] !== 'boolean') || access.view !== true || access.edit !== true) throw Error('FORBIDDEN');
      const validSnapshot = value => value && typeof value === 'object' && !Array.isArray(value) &&
        ['equipment','groups','categories','subcategories','issues'].every(key => Array.isArray(value[key]) &&
          value[key].every(row => row && typeof row === 'object' && !Array.isArray(row)));
      if (!result.control?.workflow || !Number.isSafeInteger(result.revision) || !Number.isSafeInteger(result.control.workflow.revision) ||
          !Array.isArray(result.control.versions) || !validSnapshot(result.control.workflow.working) ||
          !result.control.versions.every(version => version && typeof version.id === 'string' && typeof version.status === 'string' &&
            Array.isArray(version.equipment) && Array.isArray(version.groups) && validSnapshot(version.snapshot))) throw Error('INVALID_WORKFLOW_RESPONSE');
      if (result.revision < previousRevision || result.revision < revision || result.control.workflow.revision < control.workflow.revision ||
          result.control.workflow.generation !== flowGeneration || result.control.workflow.pendingId !== pendingId ||
          !result.control.versions.some(version => version.id === versionId && version.status === 'draft')) throw Error('DEPENDENCY_CHANGED_RECONFIRM');
      captureAddEquipmentInput();
      control = result.control; revision = result.revision;
      // Keep working, syncBase, syncGeneration, group selection and guarded field baselines unchanged.
      readUnavailable = false;
      message = t('已載入最新版，未套用輸入與照片仍保留；套用時重新核對來源。','Đã tải bản mới; giữ đầu vào và ảnh chưa áp dụng, kiểm tra nguồn khi áp dụng.');
      busy = false;
      render();
    } catch (error) {
      // A changed owner/page must never redraw the preserved form into another context.
      if (ownsAttempt()) showEquipmentReadRecovery(error);
    } finally {
      if (equipmentReadAttempt === attempt) {
        const updateUI = ownsAttempt();
        equipmentReadAttempt = null;
        busy = false;
        if (updateUI) {
          const button = host.querySelector('#routine-add-load-retry');
          if (button) button.disabled = false;
        }
      }
    }
  }

  function pollShared(){clearTimeout(sharedPoll);const delivery=window.ProcessSync?.captureDelivery?.(),owns=()=>!delivery||window.ProcessSync.isCurrentDelivery(delivery);sharedPoll=setTimeout(async()=>{
    if(!owns())return;
    if(!routineTabIsActive())return;
    try{if(!busy&&document.visibilityState!=='hidden'){
      const flow=control?.workflow,result=await sharedTransport().read(flow?`${flow.generation}:${flow.revision}`:'');
      if(!owns())return;if(!result.unchanged&&result.control){const wasOpen=['draft','pending'].includes(selected()?.status);control=result.control;revision=result.revision;
        if(editingEquipmentId||nodeDialog||addingEquipment||document.activeElement?.matches('input,textarea,select')){const status=host?.querySelector('#routine-shared-status');if(status)status.textContent=t('共用內容已更新，保留目前輸入，套用時核對來源。','Nội dung chung đã cập nhật; giữ dữ liệu đang nhập và kiểm tra nguồn khi áp dụng.');}
        else{if(wasOpen){selectedVersionId=open()?.id||active()?.id;working=open()?.status==='draft'?snapshotOf(open()):null;syncBase=working&&clone(working);syncGeneration=control.workflow?.generation||null;}render();}
      }
    }}catch(e){if(owns())showEquipmentReadRecovery(e);}
    finally{if(owns())pollShared();}
  },4000);}
  const unitLabels = { '個': ['個','Cái'], '支': ['支','Cây'], '台': ['台','Máy'], '組': ['組','Bộ'] };

  function computeNextPieceMark(assetCode) {
    const code = String(assetCode || '').trim().toUpperCase();
    if (!code) return '01';
    const reserved = new Set(control?.reservedMarks?.[code] || []);
    for (const item of (working?.equipment || visible()?.equipment || [])) {
      if (String(item.assetCode || '').trim().toUpperCase() === code && item.pieceMark) {
        reserved.add(String(item.pieceMark).trim().toUpperCase());
      }
    }
    const maximum = [...reserved].reduce((max, mark) => /^\d+$/.test(mark) ? Math.max(max, Number(mark)) : max, 0);
    return String(maximum + 1).padStart(2, '0');
  }
  const methodLabels = { none: ['不校正','Không hiệu chuẩn'], internal: ['內部校正','Hiệu chuẩn nội bộ'], external: ['外部校正','Hiệu chuẩn bên ngoài'] };
  const cycleLabels = { weekly: ['每週','Hằng tuần'], monthly: ['每月','Hằng tháng'], quarterly: ['每季','Hằng quý'], halfyear: ['每半年','Mỗi nửa năm'], yearly: ['每年','Hằng năm'], custom: ['自訂','Tùy chỉnh'] };
  const label = map => t(...map);
  const methodCode = value => /^(none|不校正|Không hiệu chuẩn)/i.test(value || '') ? 'none' : /^(internal|內部校正|Hiệu chuẩn nội bộ)/i.test(value || '') && !String(value).includes('＋') ? 'internal' : /^(external|外部校正|Hiệu chuẩn bên ngoài)/i.test(value || '') ? 'external' : 'legacy-conflict';
  const unitCode = value => Object.keys(unitLabels).find(key => String(value || '').startsWith(key)) || value;
  const displayName = item => item?.name || item?.nameVi || item?.nameZh || '';
  const groupLabel = group => String(group?.name || group?.nameVi || group?.nameZh || group?.id || '').replace(/^(?:獨立|候選)\s*[／/]\s*/, '').replace(/候選$/, '').trim();

  function structure(version) {
    const categories = clone(version?.categories || []), subcategories = clone(version?.subcategories || []);
    const groups = (version?.groups || []).map(group => ({ ...group }));
    for (const group of groups) {
      const code = String(group.categoryCode || ''), categoryName = String(group.category || '');
      let category = categories.find(item => item.id === group.categoryId) || categories.find(item => item.code === code);
      if (!category && code) { category = { id: `legacy-category:${encodeURIComponent(code)}`, code, name: categoryName || code }; categories.push(category); }
      if (!category) continue;
      group.categoryId = category.id;
      let sub = subcategories.find(item => item.id === group.subcategoryId) || subcategories.find(item => item.categoryId === category.id && item.name === group.subcategory);
      if (!sub && group.subcategory) { sub = { id: `legacy-subcategory:${encodeURIComponent(category.id)}:${encodeURIComponent(group.subcategory)}`, categoryId: category.id, name: group.subcategory }; subcategories.push(sub); }
      if (sub) group.subcategoryId = sub.id;
      group.name ||= group.nameVi || group.nameZh || group.id;
    }
    return { categories, subcategories, groups };
  }

  function fillRepresentativePhotos(version) {
    if (!version) return;
    const tree = structure(version);
    const eligibleCategoryCodes = new Set(['C01', 'C02', 'C03', 'C04', 'C05', 'C06']);
    const eligibleCategories = tree.categories.filter(c => eligibleCategoryCodes.has(c.code));
    const eligibleCatIds = new Set(eligibleCategories.map(c => c.id));

    // 1. Fill Groups under C01~C06
    for (const group of version.groups || []) {
      if (!eligibleCatIds.has(String(group.categoryId || ''))) continue;
      if (group.photoId) continue;
      const items = (version.equipment || []).filter(e => e.groupId === group.id && (e.photoId || e.photoSource?.webSha256) && !e.photoHidden);
      if (!items.length) continue;
      const best = items.find(e => e.pieceMark === '01') || items[0];
      const pid = best?.photoId || (best?.photoSource?.webSha256 ? best.photoSource.webSha256 : '');
      if (pid) group.photoId = pid;
    }

    // 2. Fill Subcategories under C01~C06
    for (const sub of version.subcategories || []) {
      if (!eligibleCatIds.has(sub.categoryId)) continue;
      if (sub.photoId) continue;
      const subGroups = (version.groups || []).filter(g => g.subcategoryId === sub.id);
      const grp = subGroups.find(g => g.photoId);
      if (grp?.photoId) {
        sub.photoId = grp.photoId;
      } else {
        const items = (version.equipment || []).filter(e => e.subcategoryId === sub.id && (e.photoId || e.photoSource?.webSha256) && !e.photoHidden);
        const best = items.find(e => e.pieceMark === '01') || items[0];
        const pid = best?.photoId || (best?.photoSource?.webSha256 ? best.photoSource.webSha256 : '');
        if (pid) sub.photoId = pid;
      }
    }
  }

  const snapshotOf = version => {
    if(control?.workflow&&version.snapshot)return clone(version.snapshot);
    const tree = structure(version);
    const snap = clone({ equipment: version.equipment, ...tree, issues: (version.issues || control?.issues || []).map((issue,index)=>({...issue,id:issue.id||'source-issue-'+index})) });
    fillRepresentativePhotos(snap);
    return snap;
  };

  const isDirty = () => !!working && JSON.stringify(working) !== JSON.stringify(snapshotOf(selected()));
  const identity = () => window.ProcessSync?.identity || (typeof currentUser !== 'undefined' ? currentUser : null);
  const permitted = key => (window.sharedDraftPermissionAllowed?.(sharedClient,key)??true)&&(typeof window.hasPermission === 'function' ? window.hasPermission(key==='approval.submit'?'view:data':key) || key==='approval.withdraw'&&window.hasPermission('view:data') : identity()?.role === 'admin');
  const open = () => control?.versions.find(version => ['draft','pending'].includes(version.status));
  const active = () => control?.versions.find(version => version.id === control.activeVersionId);
  const selected = () => control?.versions.find(version => version.id === selectedVersionId) || open() || active() || control?.versions[0];
  const visible = () => selected()?.id === open()?.id && working ? working : selected();
  const editable = () => !readUnavailable && selected()?.status === 'draft' && !!working && permitted('approval.submit');
  const status = value => ({
    draft: t('待確認草稿', 'Bản nháp chờ xác nhận'),
    pending: t('主管審核中', 'Quản lý đang duyệt'),
    approved: t('已核准生效', 'Đã phê duyệt có hiệu lực'),
    superseded: t('歷史生效版', 'Bản hiệu lực trước')
  })[value] || value;
  const actionName = act => ({
    begin: t('開始修改', 'Bắt đầu sửa'),
    create: t('新增設備', 'Thêm thiết bị'),
    save: t('儲存草稿', 'Lưu bản nháp'),
    submit: t('送出審核', 'Gửi duyệt'),
    approve: t('主管核准', 'Quản lý phê duyệt'),
    reject: t('發回修改', 'Trả lại để sửa'),
    withdraw: t('撤回送審', 'Rút hồ sơ'),
    approved: t('主管核准', 'Quản lý phê duyệt'),
    returned: t('發回修改', 'Trả lại để sửa'),
    withdrawn: t('撤回送審', 'Rút hồ sơ'),
    delete: t('刪除草稿設備', 'Xóa thiết bị nháp'),
    import: t('匯入來源主檔', 'Nhập nguồn chính')
  })[act] || act;

  const details = item => item ? `${item.assetCode}／${item.pieceMark} · ${displayName(item) || t('未命名', 'Chưa đặt tên')}` : '';
  const failed = error => { message = error?.message || t('操作失敗', 'Thao tác thất bại'); render(); };
  const headers = () => window.ProcessSync?.platformHeaders?.() || { 'Content-Type': 'application/json' };

  async function read(preserveInput=false) {
    const actor=identity()?.id,delivery=window.ProcessSync?.captureDelivery?.(),owns=()=>!delivery||window.ProcessSync.isCurrentDelivery(delivery);
    try {
    const response = await fetch(endpoint+(endpoint.includes('?')?'&':'?')+'caseMetadata=1', { cache: 'no-store', headers: headers() });
    const body = await response.json().catch(() => ({}));
    if(!owns())throw Error('DELIVERY_SUPERSEDED');
    if(actor!==identity()?.id)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
    if (!response.ok || !body.control || !Number.isInteger(body.revision)) throw Error(body.error || t('後端資料載入失敗', 'Không thể tải dữ liệu máy chủ'));
    if(controlActor!==actor){submitProblems=[];problemSnapshot=null;openErrors=false;}
    control = body.control; revision = body.revision;controlActor=actor;
    readUnavailable=false;
    await sharedTransport().permissions();
    if(!owns())throw Error('DELIVERY_SUPERSEDED');
    const version = selected();
    if (!selectedVersionId || !control.versions.some(item => item.id === selectedVersionId)) selectedVersionId = version?.id || '';
    if(!preserveInput){working = selected()?.status === 'draft' ? snapshotOf(selected()) : null;
    syncBase=working&&clone(working);syncGeneration=control.workflow?.generation||null;}
    }catch(error){if(owns())readUnavailable=true;throw error;}
  }

  async function write(action, more = {}, preserve = false) {
    if(readUnavailable){message=t('請先重新載入資料核對後操作。','Hãy tải lại dữ liệu và đối chiếu trước khi thao tác.');render();return null;}
    if(control?.workflow||open()?.status!=='pending')return writeShared(action==='save'?'apply':action,more);
    if (busy) return null;
    busy = true; message = ''; render();
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: headers(), body: JSON.stringify({ action, baseRevision: revision, ...more }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        submitProblems = body.problems || [];
        if (!submitProblems.length && body.error) {
          submitProblems = [{ id: '', field: '', message: body.error, advice: t('請核對欄位或重新操作', 'Vui lòng kiểm tra lại các trường hoặc thử lại') }];
        }
        throw Error([body.error, ...(body.errors || [])].filter(Boolean).join('\n') || `HTTP ${response.status}`);
      }
      submitProblems = [];
      openErrors = false;
      if (!body.control || !Number.isInteger(body.revision)) throw Error(t('後端未回傳保存確認', 'Máy chủ không phản hồi xác nhận lưu'));
      control = body.control; revision = body.revision;
      if (!preserve) working = open()?.status === 'draft' ? snapshotOf(open()) : null;
      selectedVersionId = open()?.id || active()?.id || '';
      window.dispatchEvent(new CustomEvent('routine-equipment-updated', {
        detail: { revision, activeVersionId: control.activeVersionId || null, action }
      }));
      try { await window.ProcessSync?.refresh?.(); } catch { /* CAS succeeded */ }
      return body;
    } catch (error) { failed(error); return null; }
    finally { busy = false; render(); }
  }

  async function uploadImage(file) {
    if (!file || file.size > 5_000_000) throw Error(t('照片限 5 MB', 'Ảnh giới hạn 5 MB'));
    const response = await fetch(`${api}/photo${query}`, {
      method: 'PUT', headers: { ...headers(), 'Content-Type': file.type || 'image/jpeg' }, body: file,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !/^[a-f0-9]{64}$/.test(body.id || '')) throw Error(body.error || t('照片未上傳成功', 'Tải ảnh không thành công'));
    return body.id;
  }

  async function importSource() {
    if (busy) return;
    busy = true; message = t('讀取來源 Excel 對照及照片…', 'Đang đọc đối chiếu và ảnh Excel nguồn…'); render();
    try {
      const response = await fetch('/process/routine-source.json', { cache: 'no-store' });
      if (!response.ok) throw Error(t('來源資料檔無法讀取', 'Không thể đọc tệp dữ liệu nguồn'));
      const source = await response.json();
      if (source.equipment.length !== 119 || source.issues.length !== 37) throw Error(t('來源核對筆數不符', 'Số lượng đối chiếu nguồn không khớp'));
      let next = 0;
      const uploadWorker = async () => {
        while (next < source.equipment.length) {
          const index = next++;
          const item = source.equipment[index];
          const imageResponse = await fetch(item.photoSource.webPath);
          if (!imageResponse.ok) throw Error(`第 ${item.sourceRow} 列照片讀取失敗`);
          const blob = await imageResponse.blob();
          item.photoId = await uploadImage(blob);
          if ((index + 1) % 10 === 0) { message = `照片上傳中：${index + 1}／119`; render(); }
        }
      };
      await Promise.all(Array.from({ length: 6 }, uploadWorker));
      message = t('照片已保存；正在建立待確認草稿…', 'Ảnh đã lưu; đang tạo bản nháp chờ xác nhận…'); render();
      const result = await fetch(endpoint, { method: 'POST', headers: headers(),
        body: JSON.stringify({ action: 'import', baseRevision: revision, source }) });
      const body = await result.json().catch(() => ({}));
      if (!result.ok || !body.control || !Number.isInteger(body.revision)) throw Error(body.error || t('匯入未完成', 'Nhập chưa hoàn tất'));
      control = body.control; revision = body.revision; selectedVersionId = open()?.id || '';
      working = open()?.status === 'draft' ? snapshotOf(open()) : null;
      message = t(`已匯入 ${open()?.equipment.length || 0} 筆待確認草稿、37 筆來源待確認事項；沒有建立生效版。`, `Đã nhập ${open()?.equipment.length || 0} bản nháp, 37 mục chờ đối soát; chưa tạo bản hiệu lực.`);
      try { await window.ProcessSync?.refresh?.(); } catch { /* keep dirty edits */ }
    } catch (error) { message = error.message || t('匯入失敗', 'Nhập thất bại'); }
    finally { busy = false; render(); }
  }

  function itemUse(item, version) {
    const estimated = version?.status !== 'approved' && version?.status !== 'superseded';
    const show = value => estimated ? `${t('預估：', 'Dự kiến: ')}${value}` : value;
    if (!item.enabled) return show(t('未啟用', 'Chưa kích hoạt'));
    if (!item.confirmed) return show(t('待核對', 'Chờ đối soát'));
    if ((version?.issues || control?.issues || []).some(issue => issue.sourceRow === item.sourceRow && issue.status !== 'resolved')) return show(t('來源疑點未處理', 'Vấn đề nguồn chưa xử lý'));
    const method = methodCode(item.calibrationMethod);
    if (method === 'legacy-conflict') return show(t('校正方式待確認', 'Cần xác nhận hiệu chuẩn'));
    if (method === 'none') return show(t('不需校正', 'Không cần hiệu chuẩn'));
    const today = vietnamToday();
    if (!item.calibratedAt || !item.expiresAt) return show(t('缺校正日期', 'Thiếu ngày hiệu chuẩn'));
    if (item.expiresAt < today) return show(t('校正逾期', 'Hết hạn hiệu chuẩn'));
    return show(t('可用', 'Khả dụng'));
  }

  function validateEquipmentItem(item) {
    const problems = [];
    const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    const prefix = `${item.assetCode || item.id}/${item.pieceMark || '01'}`;

    if (!String(item.name || item.nameVi || item.nameZh || '').trim()) {
      problems.push({ id: item.id, field: 'name', message: `${prefix}: ${t('檢具名稱必填', 'Tên thiết bị bắt buộc')}`, advice: t('請輸入完整之檢具名稱。', 'Vui lòng nhập tên thiết bị đầy đủ.') });
    }
    if (!item.groupId?.trim()) {
      problems.push({ id: item.id, field: 'groupId', message: `${prefix}: ${t('規格群組必選', 'Nhóm quy cách bắt buộc')}`, advice: t('請選擇所屬規格群組。', 'Vui lòng chọn nhóm quy cách.') });
    }
    const method = methodCode(item.calibrationMethod);
    if (method === 'legacy-conflict') {
      problems.push({ id: item.id, field: 'calibrationMethod', message: `${prefix}: ${t('舊雙軌校正需先選擇單一方式', 'Hai luồng cũ cần chọn một cách')}`, advice: t('請選擇「不校正」、「內部校正」或「外部校正」。', 'Chọn không hiệu chuẩn, nội bộ hoặc bên ngoài.') });
    }
    if (method !== 'none') {
      const cycle = String(item.calibrationCycle || '').trim();
      if (!cycle || (cycle === 'custom' && !String(item.customCycle || '').trim())) {
        problems.push({ id: item.id, field: cycle === 'custom' ? 'customCycle' : 'calibrationCycle', message: `${prefix}: ${t('校正週期必填', 'Chu kỳ hiệu chuẩn bắt buộc')}`, advice: t('請選擇校正週期，或自訂週期說明。', 'Chọn chu kỳ hiệu chuẩn hoặc chu kỳ tùy chỉnh.') });
      }
      if (!item.calibratedAt) {
        problems.push({ id: item.id, field: 'calibratedAt', message: `${prefix}: ${t('最近校正日期必填', 'Ngày hiệu chuẩn bắt buộc')}`, advice: t('請填寫有效之最近校正日期（YYYY-MM-DD）。', 'Nhập ngày hiệu chuẩn hợp lệ (YYYY-MM-DD).') });
      } else if (!validDay(item.calibratedAt)) {
        problems.push({ id: item.id, field: 'calibratedAt', message: `${prefix}: ${t('最近校正日期格式不合法', 'Ngày hiệu chuẩn không hợp lệ')}`, advice: t('請使用 YYYY-MM-DD 格式。', 'Dùng định dạng YYYY-MM-DD.') });
      }
      if (!item.expiresAt) {
        problems.push({ id: item.id, field: 'expiresAt', message: `${prefix}: ${t('校正有效期限必填', 'Hạn hiệu chuẩn bắt buộc')}`, advice: t('請填寫有效之校正有效期限（YYYY-MM-DD）。', 'Nhập hạn hiệu chuẩn hợp lệ (YYYY-MM-DD).') });
      } else if (!validDay(item.expiresAt)) {
        problems.push({ id: item.id, field: 'expiresAt', message: `${prefix}: ${t('校正有效期限格式不合法', 'Hạn hiệu chuẩn không hợp lệ')}`, advice: t('請使用 YYYY-MM-DD 格式。', 'Dùng định dạng YYYY-MM-DD.') });
      }
      if (item.calibratedAt && item.expiresAt && validDay(item.calibratedAt) && validDay(item.expiresAt) && item.expiresAt < item.calibratedAt) {
        problems.push({ id: item.id, field: 'expiresAt', message: `${prefix}: ${t('有效期限不能早於校正日期', 'Hạn hiệu chuẩn không thể trước ngày hiệu chuẩn')}`, advice: t('請確認有效期限晚於或等於校正日期。', 'Xác nhận hạn hiệu chuẩn sau ngày hiệu chuẩn.') });
      }
    }
    return problems;
  }

  function getProblem(itemId, fieldName) {
    return (submitProblems || []).find(p => {
      if (p.id !== itemId) return false;
      if (p.field === fieldName) return true;
      if (fieldName === 'calibrationCycle' && p.field === 'customCycle') return true;
      if (fieldName === 'groupId' && p.field === 'name' && String(p.message).includes('群組')) return true;
      return false;
    });
  }

  function problemMessage(problem) {
    const translations={
      EQUIPMENT_STILL_REFERENCED:['仍有正式標準引用此檢具，不能停用或刪除。','Thiết bị vẫn được tiêu chuẩn chính thức sử dụng; không thể ngừng dùng hoặc xóa.'],
      '編號、名稱與群組必填':['編號、名稱與群組必填','Mã, tên và nhóm thiết bị là bắt buộc'],
      '舊雙軌校正需先選擇單一方式':['舊雙軌校正需先選擇單一方式','Hai luồng hiệu chuẩn cũ cần chọn một phương thức'],
      '校正週期必填':['校正週期必填','Chu kỳ hiệu chuẩn là bắt buộc'],
      '校正日期及有效期限必填':['校正日期及有效期限必填','Ngày hiệu chuẩn và hạn hiệu chuẩn là bắt buộc'],
      '有效期限不能早於校正日期':['有效期限不能早於校正日期','Hạn hiệu chuẩn phải hợp lệ và không trước ngày hiệu chuẩn'],
    };
    let message=String(problem.message||'');
    for(const [source,labels]of Object.entries(translations))message=message.replace(source,t(...labels));
    return message;
  }

  function renderEditCalibrationFields(item, can) {
    const isNoCalib = methodCode(item.calibrationMethod) === 'none';
    const cycleValue = String(item.calibrationCycle || '');
    if (isNoCalib) {
      return `<div class="wide routine-message" style="margin:0">${t('此設備為「不需校正」，無需填寫週期與效期。', 'Thiết bị này không cần hiệu chuẩn, không cần nhập chu kỳ và hạn dùng.')}</div>`;
    }
    const cycleProb = getProblem(item.id, 'calibrationCycle');
    const customProb = getProblem(item.id, 'customCycle');
    const calProb = getProblem(item.id, 'calibratedAt');
    const expProb = getProblem(item.id, 'expiresAt');

    return `
      <label>${t('校正週期', 'Chu kỳ hiệu chuẩn')}${cycleProb ? `<span class="routine-field-error">⚠️ ${h(problemMessage(cycleProb).replace(/^.*?:\s*/, ''))}</span>` : ''}
        <select data-select="calibrationCycle" class="${cycleProb ? 'has-error' : ''}" ${can ? '' : 'disabled'}>
          <option value="" ${!cycleValue ? 'selected' : ''}>${t('請選擇週期', 'Chọn chu kỳ')}</option>
          ${cycleValue && !Object.keys(cycleLabels).includes(cycleValue) ? `<option data-i18n-skip="true" value="${h(cycleValue)}" selected>${h(cycleValue)}</option>` : ''}
          ${Object.entries(cycleLabels).map(([code, labels]) => `<option value="${code}" ${code === cycleValue ? 'selected' : ''}>${label(labels)}</option>`).join('')}
        </select>
      </label>
      ${item.calibrationCycle === 'custom' ? `
        <label>${t('自訂週期', 'Chu kỳ tùy chỉnh')}${customProb ? `<span class="routine-field-error">⚠️ ${h(problemMessage(customProb).replace(/^.*?:\s*/, ''))}</span>` : ''}
          <input data-field="customCycle" data-i18n-skip="true" type="text" class="${customProb ? 'has-error' : ''}" value="${h(item.customCycle || '')}" ${can ? '' : 'disabled'}>
        </label>` : ''}
      <label>${t('最近校正日期', 'Ngày hiệu chuẩn gần nhất')}${calProb ? `<span class="routine-field-error">⚠️ ${h(problemMessage(calProb).replace(/^.*?:\s*/, ''))}</span>` : ''}
        <input data-field="calibratedAt" type="date" class="${calProb ? 'has-error' : ''}" value="${h(item.calibratedAt || '')}" ${can ? '' : 'disabled'}>
      </label>
      <label>${t('校正有效期限（含當天有效）', 'Hạn hiệu chuẩn')}${expProb ? `<span class="routine-field-error">⚠️ ${h(problemMessage(expProb).replace(/^.*?:\s*/, ''))}</span>` : ''}
        <input data-field="expiresAt" type="date" class="${expProb ? 'has-error' : ''}" value="${h(item.expiresAt || '')}" ${can ? '' : 'disabled'}>
      </label>
    `;
  }

  function form(item) {
    if (!item) return '';
    const can = editable(), tree = structure(visible()), groups = tree.groups;
    const currentGroup = groups.find(group => group.id === item.groupId);
    const categoryId = item.categoryId || currentGroup?.categoryId || '';
    const subcategoryId = item.subcategoryId || currentGroup?.subcategoryId || '';
    const field = (label, key, type = 'text', readonly = false, extra = '') => {
      const prob = getProblem(item.id, key);
      return `<label>${label}${prob ? `<span class="routine-field-error">⚠️ ${h(problemMessage(prob).replace(/^.*?:\s*/, ''))}</span>` : ''}<input data-field="${key}" class="${prob ? 'has-error' : ''}" data-i18n-skip="true" type="${type}" value="${h(item[key] ?? '')}" ${!can || readonly ? 'disabled' : ''} ${extra}></label>`;
    };
    const text = (label, key) =>
      `<label class="wide">${label}<textarea data-field="${key}" data-i18n-skip="true" ${can ? '' : 'disabled'}>${h(item[key] || '')}</textarea></label>`;

    const availableGroups = groups.filter(group => group.subcategoryId === subcategoryId);
    const nameConflict = !item.name && item.nameZh && item.nameVi && item.nameZh.trim() !== item.nameVi.trim();
    const original = selected()?.equipment.find(value => value.id === item.id);
    const moved = !!original && original.groupId !== item.groupId;
    const calibration = methodCode(item.calibrationMethod);

    const nameProb = getProblem(item.id, 'name');
    const groupProb = getProblem(item.id, 'groupId');
    const methodProb = getProblem(item.id, 'calibrationMethod');

    return `<div class="routine-modal-backdrop" id="routine-backdrop"><section class="routine-card routine-modal routine-editor" id="routine-editor" role="dialog" aria-modal="true" aria-label="${t('編輯檢具', 'Sửa thiết bị')}">
        <div class="routine-modal-header">
          <div>
            <h3 data-i18n-skip="true">${h(details(item))}</h3>
            <p class="routine-source">ID：${h(item.id)}　${t('來源列：', 'Dòng nguồn: ')}${h(item.sourceRow || t('本次新增', 'Thêm mới lần này'))}</p>
          </div>
          <div class="routine-modal-tools"><button type="button" id="routine-language-toggle">${t('切換語言', 'Đổi ngôn ngữ')}</button><button type="button" id="routine-close" title="${t('關閉', 'Đóng')}">✕</button></div>
        </div>

        <div class="routine-modal-body">
          ${nameConflict ? `<div class="routine-message">${t('舊中越名稱內容不同，原文已保留。請核對後在單一名稱欄輸入確認結果。', 'Hai tên cũ khác nhau và đã được giữ nguyên. Hãy xác nhận trong ô tên duy nhất.')}</div>` : ''}
          ${moved ? `<div class="routine-validation">${t('此檢具的分類／群組已變更：', 'Phân loại / nhóm của thiết bị đã thay đổi: ')}<span data-i18n-skip="true">${h(original.groupId)} → ${h(item.groupId || '—')}</span>。${t('下列 Excel 文字關聯僅供核對；目前沒有正式標準關聯模型，也不會改寫歷史報告。', 'Liên kết văn bản Excel dưới đây chỉ để đối soát; chưa có mô hình liên kết tiêu chuẩn chính thức và không sửa báo cáo lịch sử.')}</div>` : ''}
          ${submitProblems.filter(problem => problem.id === item.id).map(problem => `<p class="routine-validation" data-error-field="${h(problem.field)}">${problemSnapshot?h(t('送審快照：','Bản gửi duyệt: ')):''}${h(problemMessage(problem))}</p>`).join('')}
          <div class="routine-edit-grid">
            ${field(t('固定資產編號（唯讀）', 'Mã TSCĐ (Chỉ đọc)'), 'assetCode', 'text', true)}
            ${field(t('個別設備標記（分件號）', 'Ký hiệu thiết bị'), 'pieceMark', 'text', true)}
            <label>${t('名稱', 'Tên')}${nameProb ? `<span class="routine-field-error">⚠️ ${h(problemMessage(nameProb).replace(/^.*?:\s*/, ''))}</span>` : ''}
              <input data-field="name" class="${nameProb ? 'has-error' : ''}" data-i18n-skip="true" type="text" value="${h(displayName(item))}" ${can ? '' : 'disabled'}>
            </label>

            <label>${t('類別', 'Nhóm')}<select id="routine-edit-category" ${can ? '' : 'disabled'}>
              <option value="">${t('請選擇類別', 'Chọn nhóm')}</option>
              ${tree.categories.map(cat => `<option data-i18n-skip="true" value="${h(cat.id)}" ${cat.id === categoryId ? 'selected' : ''}>${h(cat.code)} · ${h(cat.name)}</option>`).join('')}
            </select></label>

            <label>${t('子類別', 'Phân nhóm')}<select id="routine-edit-subcategory" ${can ? '' : 'disabled'}>
              <option value="">${t('請選擇子類別', 'Chọn phân nhóm')}</option>
              ${tree.subcategories.filter(sub => sub.categoryId === categoryId).map(sub => `<option data-i18n-skip="true" value="${h(sub.id)}" ${sub.id === subcategoryId ? 'selected' : ''}>${h(sub.name)}</option>`).join('')}
            </select></label>

            <label class="wide">${t('規格群組', 'Nhóm quy cách')}${groupProb ? `<span class="routine-field-error">⚠️ ${h(problemMessage(groupProb).replace(/^.*?:\s*/, ''))}</span>` : ''}
              <select id="routine-edit-group" class="${groupProb ? 'has-error' : ''}" ${can ? '' : 'disabled'}>
                <option value="">${t('請選擇群組', 'Chọn nhóm quy cách')}</option>
                ${availableGroups.map(g => `<option data-i18n-skip="true" value="${h(g.id)}" ${g.id === item.groupId ? 'selected' : ''}>${h(g.id)} · ${h(g.name || g.nameVi || g.nameZh)}</option>`).join('')}
              </select>
            </label>

            ${field(t('數量（固定 1）', 'Số lượng (Cố định 1)'), 'quantity', 'number', true)}
            <label>${t('單位', 'Đơn vị')}<select data-select="unit" ${can ? '' : 'disabled'}>
              ${Object.entries(unitLabels).map(([code, labels]) => `<option value="${code}" ${code === unitCode(item.unit) ? 'selected' : ''}>${label(labels)}</option>`).join('')}
            </select></label>
            ${field(t('擁有人／保管部門', 'Người sở hữu / Bộ phận'), 'owner')}

            <label>${t('設備狀態', 'Trạng thái thiết bị')}<select data-select="enabled" ${can ? '' : 'disabled'}>
              <option value="true" ${item.enabled ? 'selected' : ''}>${t('啟用', 'Đang dùng')}</option>
              <option value="false" ${item.enabled ? '' : 'selected'}>${t('未啟用', 'Chưa kích hoạt')}</option>
            </select></label>

            <label>${t('資料核對', 'Đối soát dữ liệu')}<select data-select="confirmed" ${can ? '' : 'disabled'}>
              <option value="false" ${item.confirmed ? '' : 'selected'}>${t('待確認', 'Chờ xác nhận')}</option>
              <option value="true" ${item.confirmed ? 'selected' : ''}>${t('已核對', 'Đã đối soát')}</option>
            </select></label>

            <label class="wide">${t('校正方式', 'Phương thức hiệu chuẩn')}${methodProb ? `<span class="routine-field-error">⚠️ ${h(problemMessage(methodProb).replace(/^.*?:\s*/, ''))}</span>` : ''}
              <select data-select="calibrationMethod" id="routine-edit-calibration-method" class="${methodProb ? 'has-error' : ''}" ${can ? '' : 'disabled'}>
                ${calibration === 'legacy-conflict' ? `<option data-i18n-skip="true" value="${h(item.calibrationMethod)}" selected>${t('舊雙軌／待選單一方式', 'Hai luồng cũ / cần chọn một cách')}</option>` : ''}
                ${Object.entries(methodLabels).map(([code, labels]) => `<option value="${code}" ${code === calibration ? 'selected' : ''}>${label(labels)}</option>`).join('')}
              </select>
            </label>

            <div id="routine-edit-calibration-container" class="wide" style="display:contents">
              ${renderEditCalibrationFields(item, can)}
            </div>

            ${field(t('入庫日期', 'Ngày nhập kho'), 'intakeDate', 'date')}
            ${text(t('規格／常用檢測用途／參考條件', 'Quy cách / Mục đích kiểm tra'), 'spec')}
            <div class="wide">${equipmentReferencesSectionHTML(item.id, 'edit')}</div>
            ${text(t('備註', 'Ghi chú'), 'notes')}

            <div class="routine-photo-field">
              ${photo(item) ? `<img src="${h(photo(item))}" alt="${t('設備照片', 'Ảnh thiết bị')}">` : `<span class="routine-photo-empty">${t('尚無照片', 'Chưa có ảnh')}</span>`}
              <div>${can ? `<label>${t('替換照片', 'Thay ảnh')}<input type="file" id="routine-photo-input" accept="image/*"></label>${photo(item) ? `<button type="button" id="routine-photo-remove">${t('從草稿移除照片', 'Xóa ảnh khỏi bản nháp')}</button>` : ''}` : ''}</div>
            </div>

            <div class="routine-source-box">
              <b>${t('原始來源欄位', 'Trường dữ liệu nguồn gốc')}</b>
              <p>${t('來源狀態：', 'Trạng thái nguồn: ')}<span data-i18n-skip="true">${h(item.sourceStatus || '—')}</span>　|　${t('來源對照：', 'Đối chiếu: ')}<span data-i18n-skip="true">${h(item.sourceReference || '—')}</span><br>
              ${t('來源標準關聯：', 'Tiêu chuẩn liên kết nguồn: ')}<span data-i18n-skip="true">${h(item.sourceStandardLinks || '—')}</span><br>
              ${t('來源產品關聯：', 'Sản phẩm liên kết nguồn: ')}<span data-i18n-skip="true">${h(item.sourceProductLinks || '—')}</span></p>
              <p style="color:#8a4d12;margin:0;font-size:.78rem">※ ${t('修改群組或分類時，上述來源關聯僅供人工核對，系統尚未進行自動跨模組改寫。', 'Khi đổi nhóm hoặc phân loại, liên kết trên chỉ để đối soát thủ công, hệ thống chưa tự động viết lại qua các module khác.')}</p>
            </div>
          </div>
        </div>

        <div class="routine-modal-footer">
          ${can ? `<button type="button" class="button ghost" id="routine-delete">${t('刪除檢具', 'Xóa thiết bị')}</button>` : ''}
          <button type="button" class="button ghost" id="routine-form-cancel">${t('關閉', 'Đóng')}</button>
          ${can ? `<button type="button" class="button signal" id="routine-form-apply">${window.VersionDraftUI.t('apply')}</button>` : ''}
        </div>
      </section></div>`;
  }

  function syncHierarchy() {
    if (!working) return;
    for (const group of working.groups) {
      const sub = working.subcategories.find(item => item.id === group.subcategoryId);
      const cat = working.categories.find(item => item.id === group.categoryId);
      if (cat && sub) Object.assign(group, { categoryCode: cat.code, category: cat.name, subcategory: sub.name });
    }
    for (const item of working.equipment) {
      const group = working.groups.find(value => value.id === item.groupId);
      if (group) Object.assign(item, { categoryId: group.categoryId, subcategoryId: group.subcategoryId,
        categoryCode: group.categoryCode, category: group.category, subcategory: group.subcategory });
    }
  }

  function hierarchyCard(kind, item, title, active, image = '') {
    return `<div class="routine-node">
      <button type="button" data-node-select="${kind}" data-id="${h(item.id)}" class="routine-node-select ${active ? 'active' : ''}" aria-pressed="${active}">
        ${image ? `<img decoding="async" loading="lazy" src="${h(image)}" alt="" style="object-fit:cover">` : '<span class="routine-tile-placeholder">◇</span>'}
        <span data-i18n-skip="true"><b>${h(title)}</b>${kind !== 'subcategory' ? `<small>${h(item.code || item.id)}</small>` : ''}</span>
      </button>
      <div class="routine-node-actions">
        <button type="button" data-node-view="${kind}" data-id="${h(item.id)}" title="${t('查看完整資訊', 'Xem thông tin')}">${t('查看資訊', 'Xem thông tin')}</button>
        ${editable() ? `
          <button type="button" data-node-edit="${kind}" data-id="${h(item.id)}">${t('修改', 'Sửa')}</button>
          <button type="button" data-node-delete="${kind}" data-id="${h(item.id)}">${t('刪除', 'Xóa')}</button>
        ` : ''}
      </div>
    </div>`;
  }

  function hierarchyHTML(data, rows) {
    const tree = structure(data);
    const children = tree.subcategories.filter(item => item.categoryId === selectedCategory);
    const groups = tree.groups.filter(item => item.subcategoryId === selectedSubcategory);

    const nodeImg = (item, fallbackRows) =>
      pendingPhotos.get(item?.id)?.url || (item?.photoId ? `${api}/photo?id=${item.photoId}` : '') || photo(fallbackRows);

    return `<section class="routine-hierarchy">
      <div class="routine-section-head"><h3>1. ${t('類別', 'Nhóm cha')}</h3>${editable() ? `<button type="button" data-node-add="category">＋${t('新增類別', 'Thêm nhóm')}</button>` : ''}</div>
      <div class="routine-tiles">${tree.categories.map(cat => hierarchyCard('category', cat, `${cat.code} · ${cat.name}`, selectedCategory === cat.id, nodeImg(cat, rows.find(item => item.categoryCode === cat.code)))).join('') || `<p>${t('尚無類別', 'Chưa có nhóm')}</p>`}</div>
      ${selectedCategory ? `<div class="routine-section-head"><h3>2. ${t('子類別', 'Phân nhóm')}</h3>${editable() ? `<button type="button" data-node-add="subcategory">＋${t('新增子類別', 'Thêm phân nhóm')}</button>` : ''}</div>
      <div class="routine-tiles">${children.map(sub => hierarchyCard('subcategory', sub, sub.name, selectedSubcategory === sub.id, nodeImg(sub, rows.find(item => item.subcategoryId === sub.id)))).join('') || `<p>${t('此類別尚無子類別，可在此新增。', 'Nhóm này chưa có phân nhóm; có thể thêm tại đây.')}</p>`}</div>` : ''}
      ${selectedSubcategory ? `<div class="routine-section-head"><h3>3. ${t('規格群組', 'Nhóm quy cách')}</h3>${editable() ? `<button type="button" data-node-add="group">＋${t('新增規格群組', 'Thêm nhóm quy cách')}</button>` : ''}</div>
      <div class="routine-groups">${groups.map(group => hierarchyCard('group', group, groupLabel(group), selectedGroup === group.id, nodeImg(group, rows.find(item => item.groupId === group.id)))).join('') || `<p>${t('此子類別尚無規格群組，可在此新增。', 'Phân nhóm này chưa có nhóm quy cách; có thể thêm tại đây.')}</p>`}</div>` : ''}
    </section>`;
  }

  function matchingRows(rows) {
    const needle = norm(search);
    return rows.filter(item => {
      if (!needle) {
        if (selectedGroup) { if (item.groupId !== selectedGroup) return false; }
        else if (selectedSubcategory) { if (item.subcategoryId !== selectedSubcategory && !structure(visible()).groups.some(group => group.id === item.groupId && group.subcategoryId === selectedSubcategory)) return false; }
        else if (selectedCategory) { if (item.categoryId !== selectedCategory && !structure(visible()).groups.some(group => group.id === item.groupId && group.categoryId === selectedCategory)) return false; }
        else return false;
      }
      const group = (visible()?.groups || []).find(value => value.id === item.groupId);
      return !needle || norm(`${item.assetCode} ${item.pieceMark} ${displayName(item)} ${item.nameZh} ${item.nameVi} ${item.groupId} ${group?.name || group?.nameVi || group?.nameZh || ''} ${item.spec} ${item.owner} ${item.category} ${item.subcategory}`).includes(needle);
    }).sort(naturalSort);
  }

  function equipmentListHTML(rows, version) {
    const filtered = matchingRows(rows);
    const pages = Math.max(1, Math.ceil(filtered.length / 20));
    equipmentPage = Math.min(equipmentPage, pages);
    const shown = filtered.slice((equipmentPage - 1) * 20, equipmentPage * 20);
    return `<section class="routine-card" id="routine-list-card">
      <div class="routine-card-head"><div><h3>4. ${t('檢具清單', 'Danh sách thiết bị')} · ${filtered.length} ${t('筆', 'mục')}</h3>
        <small>${search ? t('搜尋目前版本全部檢具', 'Tìm trong toàn bộ thiết bị của phiên bản này') : selectedGroup ? t('目前群組', 'Nhóm hiện tại') : t('請依序選擇類別、子類別與群組', 'Hãy chọn nhóm, phân nhóm và nhóm quy cách')}</small></div>
        ${editable() ? `<button type="button" class="button signal" id="routine-add">＋${t('新增檢具', 'Thêm thiết bị')}</button>` : ''}
      </div>
      ${search && editable() ? `<p class="routine-hint">${t('搜尋期間請清空搜尋並先選群組，再新增檢具。', 'Khi tìm kiếm, xóa từ khóa và chọn nhóm trước khi thêm thiết bị.')}</p>` : ''}
      <div class="routine-equipment-list">${shown.map(record => `<div class="routine-equipment-card ${record.id === selectedEquipmentId ? 'active' : ''}">
        <button type="button" class="routine-equipment-select" data-equipment-select="${h(record.id)}">
          ${photo(record) ? `<img decoding="async" src="${h(photo(record))}" loading="lazy" alt="">` : '<span class="routine-tile-placeholder">◇</span>'}
          <span><b data-i18n-skip="true">${h(record.assetCode)}</b><small>${t('固定分件號：', 'Ký hiệu cố định: ')}<em data-i18n-skip="true">${h(record.pieceMark)}</em> · ${t('第幾件：', 'Thiết bị thứ: ')}<em data-i18n-skip="true">${h(record.pieceIndex || t('待核對', 'Chờ đối soát'))}</em></small><small data-i18n-skip="true">${h(displayName(record))}</small><small>${h(itemUse(record, version))}</small></span>
        </button>
        <div class="routine-equipment-actions">
          <button type="button" data-equipment-view="${h(record.id)}" title="${t('查看完整資訊', 'Xem thông tin')}">${t('查看資訊', 'Xem thông tin')}</button>
          <button type="button" data-equipment-transfer="${h(record.id)}" title="${t('替換設備／標準移轉', 'Thay thế thiết bị')}">${t('替換設備', 'Thay thế')}</button>
          ${editable() ? `
            <button type="button" data-equipment-edit="${h(record.id)}">${t('修改', 'Sửa')}</button>
            <button type="button" data-equipment-delete="${h(record.id)}">${t('刪除', 'Xóa')}</button>
          ` : ''}
        </div>
      </div>`).join('') || `<p>${t('沒有符合條件的檢具', 'Không có thiết bị phù hợp')}</p>`}</div>
      ${pages > 1 ? `<div class="routine-pagination"><button type="button" data-equipment-page="previous" ${equipmentPage === 1 ? 'disabled' : ''}>${t('上一頁', 'Trang trước')}</button><span>${equipmentPage}／${pages}</span><button type="button" data-equipment-page="next" ${equipmentPage === pages ? 'disabled' : ''}>${t('下一頁', 'Trang sau')}</button></div>` : ''}
    </section>`;
  }

  function renderEquipmentResults() {
    const target = host?.querySelector('#routine-list-card');
    if (!target) return;
    target.outerHTML = equipmentListHTML(visible()?.equipment || [], visible());
    bindList();
    sharedClient?.gatePermissions?.();
  }

  async function saveDraft(action) {
    if (!editable() || busy) return null;
    if(control?.workflow||open()?.status!=='pending')return writeShared(action);
    try {
      if (pendingPhotos.size) {
        busy = true; message = t('正在保存照片…', 'Đang lưu ảnh…'); render();
        for (const [id, pending] of pendingPhotos) {
          const item = (working.equipment || []).find(value => value.id === id) ||
                       (working.categories || []).find(value => value.id === id) ||
                       (working.subcategories || []).find(value => value.id === id) ||
                       (working.groups || []).find(value => value.id === id);
          if (item) item.photoId = await uploadImage(pending.file);
        }
        busy = false;
      }
      syncHierarchy();
      for (const item of working.equipment) item.unit = unitCode(item.unit);

      // Always save draft changes to server FIRST
      const saveResult = await write('save', {
        versionId: selected().id,
        versionRevision: selected().revision,
        snapshot: working
      }, true);

      if (!saveResult) return null;

      if (action === 'save') {
        for (const pending of pendingPhotos.values()) URL.revokeObjectURL(pending.url);
        pendingPhotos.clear();
        if (submitProblems && submitProblems.length > 0) {
          const updatedProblems = [];
          for (const p of submitProblems) {
            if (p.id) {
              const eq = working.equipment.find(e => e.id === p.id);
              if (eq) {
                const eqProbs = validateEquipmentItem(eq);
                const matching = eqProbs.find(ep => ep.field === p.field);
                if (matching) updatedProblems.push(matching);
              }
            } else if (p.retryAction) {
              if (p.retryAction !== 'save') updatedProblems.push(p);
            } else {
              updatedProblems.push(p);
            }
          }
          submitProblems = updatedProblems;
          if (submitProblems.length === 0) openErrors = false;
        }
        message = t('後端已保存草稿。', 'Máy chủ đã lưu bản nháp.');
        render();
        return saveResult;
      }

      // If action is 'submit', now submit the saved draft version
      const submitResult = await write('submit', {
        versionId: selected().id,
        versionRevision: selected().revision,
        snapshot: working
      });

      if (submitResult) {
        for (const pending of pendingPhotos.values()) URL.revokeObjectURL(pending.url);
        pendingPhotos.clear();
        submitProblems = [];
        openErrors = false;
        message = t('後端已保存並送審。', 'Máy chủ đã lưu và gửi duyệt.');
        render();
        return submitResult;
      } else {
        openErrors = true;
        render();
        const errCard = host?.querySelector('#routine-errors-details');
        errCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return null;
      }
    } catch (error) {
      busy = false;
      message = error.message || t('操作失敗，可重試。', 'Thao tác thất bại, có thể thử lại.');
      if (!submitProblems.length) {
        submitProblems = [{
          id: '',
          field: '',
          message: error.message || t('操作失敗，請檢查網路連線或重試。', 'Thao tác thất bại, vui lòng kiểm tra kết nối mạng hoặc thử lại.'),
          advice: t('請確認伺服器或網路狀態後，點擊「重試」。', 'Vui lòng kiểm tra kết nối rồi nhấn "Thử lại".'),
          retryAction: ['save', 'submit'].includes(action) ? action : '',
          timestamp: new Date().toLocaleTimeString(),
        }];
        openErrors = true;
      }
      render();
      return null;
    }
  }

  function nodeDialogHTML() {
    if (!nodeDialog) return '';
    const { kind, id, parentCategory, parentSubcategory, parentGroup, name, spec, error, pendingPhoto, photoId, photoRemoved } = nodeDialog;
    const titles = {
      category: id ? t('修改類別', 'Sửa nhóm') : t('新增類別', 'Thêm nhóm'),
      subcategory: id ? t('修改子類別', 'Sửa phân nhóm') : t('新增子類別', 'Thêm phân nhóm'),
      group: id ? t('修改規格群組', 'Sửa nhóm quy cách') : t('新增規格群組', 'Thêm nhóm quy cách'),
    };
    const photoPreview = pendingPhoto?.url || (!photoRemoved && photoId ? `${api}/photo?id=${photoId}` : '');

    return `<div class="routine-dialog-backdrop" id="routine-node-dialog-backdrop">
      <div class="routine-dialog" role="dialog" aria-modal="true" aria-label="${h(titles[kind])}">
        <div class="routine-dialog-head">
          <h3>${h(titles[kind])}</h3>
          <button type="button" id="routine-dialog-close" style="border:none;background:transparent;font-size:1.2rem;cursor:pointer">✕</button>
        </div>
        <div class="routine-dialog-body">
          ${error ? `<div class="routine-validation">${h(error)}</div>` : ''}
          ${parentCategory ? `<p class="routine-source"><b>${t('所屬類別：', 'Nhóm cha: ')}</b>${h(parentCategory)}</p>` : ''}
          ${parentSubcategory ? `<p class="routine-source"><b>${t('所屬子類別：', 'Phân nhóm: ')}</b>${h(parentSubcategory)}</p>` : ''}
          ${parentGroup ? `<p class="routine-source"><b>${t('所屬規格群組：', 'Nhóm quy cách: ')}</b>${h(parentGroup)}</p>` : ''}

          <label>${t('名稱', 'Tên')}<input type="text" id="routine-dialog-name" value="${h(name)}" placeholder="${t('請輸入名稱（保留原文）', 'Nhập tên')}" autofocus></label>
          ${kind === 'group' ? `<label>${t('規格／能力（可留空）', 'Quy cách / Năng lực (có thể để trống)')}<input type="text" id="routine-dialog-spec" value="${h(spec)}" placeholder="${t('規格說明', 'Mô tả quy cách')}"></label>` : ''}

          <div class="routine-photo-field wide" style="margin-top:8px">
            ${photoPreview ? `<img src="${h(photoPreview)}" alt="" style="max-width:180px;max-height:140px;object-fit:cover;border-radius:6px;border:1px solid #d5e2d9">` : `<span class="routine-photo-empty">${t('尚無照片', 'Chưa có ảnh')}</span>`}
            <div>
              <label>${photoPreview ? t('替換照片', 'Thay ảnh') : t('上傳照片', 'Tải ảnh')}
                <input type="file" id="routine-dialog-photo-input" accept="image/*">
              </label>
              ${photoPreview ? `<button type="button" id="routine-dialog-photo-remove" style="margin-top:6px;display:block">${t('移除照片', 'Xóa ảnh')}</button>` : ''}
            </div>
          </div>
        </div>
        <div class="routine-dialog-foot">
          <button type="button" class="button ghost" id="routine-dialog-cancel">${t('取消', 'Hủy')}</button>
          <button type="button" class="button signal" id="routine-dialog-confirm">${t('確定', 'Xác nhận')}</button>
        </div>
      </div>
    </div>`;
  }

  function renderAddCalibrationFields(form) {
    const isNoCalib = form.calibrationMethod === 'none';
    if (isNoCalib) {
      return `<div class="wide routine-message" style="margin:0">${t('此設備為「不需校正」，無需填寫週期與效期。', 'Thiết bị này không cần hiệu chuẩn, không cần nhập chu kỳ và hạn dùng.')}</div>`;
    }
    return `
      <label>
        ${t('校正週期', 'Chu kỳ hiệu chuẩn')}
        <select id="routine-add-calibration-cycle">
          <option value="" ${!form.calibrationCycle ? 'selected' : ''}>${t('請選擇週期', 'Chọn chu kỳ')}</option>
          ${Object.entries(cycleLabels).map(([code, labels]) => `<option value="${code}" ${code === form.calibrationCycle ? 'selected' : ''}>${label(labels)}</option>`).join('')}
        </select>
      </label>
      ${form.calibrationCycle === 'custom' ? `
        <label>
          ${t('自訂週期', 'Chu kỳ tùy chỉnh')}
          <input type="text" id="routine-add-custom-cycle" data-i18n-skip="true" value="${h(form.customCycle || '')}" placeholder="${t('例如：每 45 天', 'Ví dụ: mỗi 45 ngày')}">
        </label>` : ''}
      <label>
        ${t('最近校正日期（草稿可留白，送審必填）', 'Ngày hiệu chuẩn gần nhất')}
        <input type="date" id="routine-add-calibrated-at" value="${h(form.calibratedAt || '')}">
      </label>
      <label>
        ${t('校正有效期限（含當天有效）', 'Hạn hiệu chuẩn')}
        <input type="date" id="routine-add-expires-at" value="${h(form.expiresAt || '')}">
      </label>
    `;
  }

  function addEquipmentDrawerHTML() {
    if (!addingEquipment || !newEquipmentForm || newEquipmentOwner?.actor !== identity()?.id ||
        newEquipmentOwner?.epoch !== window.ProcessSync?.identityGeneration?.()) return '';
    const tree = structure(visible());
    const group = tree.groups.find(g => g.id === selectedGroup);
    const cat = tree.categories.find(c => c.id === (group?.categoryId || selectedCategory));
    const sub = tree.subcategories.find(s => s.id === (group?.subcategoryId || selectedSubcategory));

    const form = newEquipmentForm;
    const computedMark = computeNextPieceMark(form.assetCode);

    return `<div class="routine-modal-backdrop" id="routine-add-backdrop"><section class="routine-card routine-modal routine-editor" id="routine-add-modal" role="dialog" aria-modal="true" aria-label="${t('新增檢具', 'Thêm thiết bị')}">
      <div class="routine-modal-header">
        <div>
          <h3>${t('新增檢具', 'Thêm thiết bị')}</h3>
          <p class="routine-source">
            ${t('所屬類別：', 'Nhóm cha: ')}${h(cat ? `${cat.code} · ${cat.name}` : '—')}　|　
            ${t('所屬子類別：', 'Phân nhóm: ')}${h(sub?.name || '—')}　|　
            ${t('所屬規格群組：', 'Nhóm quy cách: ')}${h(group ? `${group.id} · ${group.name || group.nameVi || group.nameZh || ''}` : '—')}
          </p>
        </div>
        <div class="routine-modal-tools">
          <button type="button" id="routine-add-close" title="${t('關閉', 'Đóng')}">✕</button>
        </div>
      </div>

      <div class="routine-modal-body">
        ${form.error ? `<div class="routine-validation">${h(form.error)}</div>` : ''}

        <div class="routine-edit-grid">
          <label>
            ${t('固定資產編號（必填）', 'Mã TSCĐ (Bắt buộc)')}
            <input type="text" id="routine-add-asset-code" data-i18n-skip="true" value="${h(form.assetCode)}" placeholder="例：G7T001" autofocus>
          </label>

          <label>
            ${t('個別設備標記（分件號，由系統分配）', 'Ký hiệu thiết bị (Hệ thống tự cấp)')}
            <input type="text" id="routine-add-piece-mark-input" data-i18n-skip="true" value="${h(computedMark)}" disabled class="routine-readonly">
          </label>

          <label class="wide">
            ${t('名稱（必填）', 'Tên (Bắt buộc)')}
            <input type="text" id="routine-add-name" data-i18n-skip="true" value="${h(form.name)}" placeholder="${t('請輸入檢具名稱（保留原文）', 'Nhập tên thiết bị')}">
          </label>

          <label class="wide">
            ${t('所屬規格群組（必填）', 'Nhóm quy cách (Bắt buộc)')}
            <select id="routine-add-group-select">
              ${tree.groups.filter(g => g.subcategoryId === selectedSubcategory).map(g => `<option value="${h(g.id)}" ${g.id === (form.groupId || selectedGroup) ? 'selected' : ''}>${h(g.id)} · ${h(g.name || g.nameVi || g.nameZh || '')}</option>`).join('')}
            </select>
          </label>

          <label>
            ${t('數量（固定 1）', 'Số lượng (Cố định 1)')}
            <input type="number" value="1" disabled class="routine-readonly">
          </label>

          <label>
            ${t('單位（必填）', 'Đơn vị (Bắt buộc)')}
            <select id="routine-add-unit">
              ${Object.entries(unitLabels).map(([code, labels]) => `<option value="${code}" ${code === form.unit ? 'selected' : ''}>${label(labels)}</option>`).join('')}
            </select>
          </label>

          <label>
            ${t('擁有人／保管部門', 'Người sở hữu / Bộ phận')}
            <input type="text" id="routine-add-owner" data-i18n-skip="true" value="${h(form.owner)}" placeholder="${t('保管人或部門名稱', 'Người giữ hoặc bộ phận')}">
          </label>

          <label>
            ${t('設備狀態', 'Trạng thái thiết bị')}
            <select id="routine-add-enabled">
              <option value="true" ${form.enabled ? 'selected' : ''}>${t('啟用', 'Đang dùng')}</option>
              <option value="false" ${!form.enabled ? 'selected' : ''}>${t('未啟用', 'Chưa kích hoạt')}</option>
            </select>
          </label>

          <label>
            ${t('資料核對', 'Đối soát dữ liệu')}
            <select id="routine-add-confirmed">
              <option value="false" ${!form.confirmed ? 'selected' : ''}>${t('待確認', 'Chờ xác nhận')}</option>
              <option value="true" ${form.confirmed ? 'selected' : ''}>${t('已核對', 'Đã đối soát')}</option>
            </select>
          </label>

          <label class="wide">
            ${t('校正方式', 'Phương thức hiệu chuẩn')}
            <select id="routine-add-calibration-method">
              ${Object.entries(methodLabels).map(([code, labels]) => `<option value="${code}" ${code === form.calibrationMethod ? 'selected' : ''}>${label(labels)}</option>`).join('')}
            </select>
          </label>

          <div id="routine-add-calibration-container" class="wide" style="display:contents">
            ${renderAddCalibrationFields(form)}
          </div>

          <label>
            ${t('入庫日期', 'Ngày nhập kho')}
            <input type="date" id="routine-add-intake-date" value="${h(form.intakeDate)}">
          </label>

          <label class="wide">
            ${t('規格／常用檢測用途／參考條件', 'Quy cách / Mục đích kiểm tra')}
            <textarea id="routine-add-spec" data-i18n-skip="true">${h(form.spec)}</textarea>
          </label>

          <label class="wide">
            ${t('備註', 'Ghi chú')}
            <textarea id="routine-add-notes" data-i18n-skip="true">${h(form.notes)}</textarea>
          </label>

          <div class="routine-photo-field wide">
            ${form.pendingPhoto ? `<img src="${h(form.pendingPhoto.url)}" alt="${t('設備照片', 'Ảnh thiết bị')}">` : `<span class="routine-photo-empty">${t('尚無照片', 'Chưa có ảnh')}</span>`}
            <div>
              <label>${t('上傳照片', 'Tải ảnh')}<input type="file" id="routine-add-photo-input" accept="image/*"></label>
              ${form.pendingPhoto ? `<button type="button" id="routine-add-photo-remove">${t('移除照片', 'Xóa ảnh')}</button>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="routine-modal-footer">
        <button type="button" class="button ghost" id="routine-add-cancel">${t('取消', 'Hủy')}</button>
        <button type="button" class="button signal" id="routine-add-submit" ${busy || !editable() ? 'disabled' : ''}>${t('新增至草稿', 'Thêm vào bản nháp')}</button>
      </div>
    </section></div>`;
  }

  function openNodeDialog(kind, id = '') {
    if (!editable()) return;
    const tree = structure(visible());
    if (kind === 'subcategory' && !selectedCategory) {
      message = t('請先選取上層類別，再新增子類別。', 'Vui lòng chọn nhóm cha trước.');
      render();
      return;
    }
    if (kind === 'group' && !selectedSubcategory) {
      message = t('請先選取上層子類別，再新增規格群組。', 'Vui lòng chọn phân nhóm trước.');
      render();
      return;
    }

    let prior = null;
    if (id) {
      const collection = kind === 'category' ? working.categories : kind === 'subcategory' ? working.subcategories : working.groups;
      prior = collection.find(item => item.id === id);
    }

    const parentCat = tree.categories.find(c => c.id === selectedCategory);
    const parentSub = tree.subcategories.find(s => s.id === selectedSubcategory);
    const parentGrp = tree.groups.find(g => g.id === selectedGroup);

    equipmentEditRequest++;
    nodeDialog = {
      kind,
      id,
      prior,
      parentCategory: parentCat ? `${parentCat.code} · ${parentCat.name}` : '',
      parentSubcategory: parentSub?.name || '',
      parentGroup: parentGrp ? `${parentGrp.id} · ${parentGrp.name || parentGrp.nameVi || parentGrp.nameZh || ''}` : '',
      name: prior?.name || prior?.nameVi || prior?.nameZh || '',
      spec: prior?.spec || '',
      photoId: prior?.photoId || '',
      pendingPhoto: pendingPhotos.get(prior?.id) || null,
      photoRemoved: false,
      error: '',
    };
    render();
  }

  function cancelNodeDialog() {
    const url = nodeDialog?.pendingPhoto?.url;
    // Applied/unknown writes may still own this preview; only release an
    // untransferred dialog preview, never the pending draft's recovery data.
    if (url && ![...pendingPhotos.values()].some(photo => photo.url === url)) URL.revokeObjectURL(url);
    nodeDialog = null;
    render();
  }

  async function confirmNodeDialog() {
    if (!nodeDialog || !editable()) return;
    const { kind, prior } = nodeDialog;

    const nameInput = host.querySelector('#routine-dialog-name');
    const specInput = host.querySelector('#routine-dialog-spec');
    const name = String(nameInput?.value || '').trim();
    const spec = String(specInput?.value || '').trim();

    if (!name) {
      nodeDialog.error = t('名稱不可空白', 'Tên không được để trống');
      render();
      return;
    }

    const collection = kind === 'category' ? working.categories : kind === 'subcategory' ? working.subcategories : working.groups;
    if (prior) {
      prior.name = name;
      if (kind === 'group') prior.spec = spec;
      if (nodeDialog.pendingPhoto) {
        pendingPhotos.set(prior.id, nodeDialog.pendingPhoto);
        prior.photoId = '';
      } else if (nodeDialog.photoRemoved) {
        pendingPhotos.delete(prior.id);
        prior.photoId = '';
      }
    } else if (kind === 'category') {
      const maximum = working.categories.reduce((max, item) => Math.max(max, Number(String(item.code).match(/^C(\d+)$/)?.[1]) || 0), 0);
      const code = `C${String(maximum + 1).padStart(2, '0')}`;
      const newId = crypto.randomUUID();
      const rec = { id: newId, code, name, photoId: '' };
      if (nodeDialog.pendingPhoto) pendingPhotos.set(newId, nodeDialog.pendingPhoto);
      collection.push(rec);
      selectedCategory = newId; selectedSubcategory = ''; selectedGroup = '';
    } else if (kind === 'subcategory') {
      const newId = crypto.randomUUID();
      const rec = { id: newId, categoryId: selectedCategory, name, photoId: '' };
      if (nodeDialog.pendingPhoto) pendingPhotos.set(newId, nodeDialog.pendingPhoto);
      collection.push(rec);
      selectedSubcategory = newId; selectedGroup = '';
    } else {
      const newId = crypto.randomUUID();
      const rec = { id: newId, categoryId: selectedCategory, subcategoryId: selectedSubcategory, name, spec, notes: '', photoId: '' };
      if (nodeDialog.pendingPhoto) pendingPhotos.set(newId, nodeDialog.pendingPhoto);
      collection.push(rec);
      selectedGroup = newId;
    }

    syncHierarchy();
    if(!await writeShared('apply'))return;
    nodeDialog = null;
    render();
  }

  async function deleteNode(kind, id) {
    if (!editable()) return;
    const collection = kind === 'category' ? working.categories : kind === 'subcategory' ? working.subcategories : working.groups;
    const item = collection.find(value => value.id === id);
    if (!item) return;
    const children = kind === 'category' ? (working.subcategories || []).filter(value => value.categoryId === id) :
      kind === 'subcategory' ? (working.groups || []).filter(value => value.subcategoryId === id) : (working.equipment || []).filter(value => value.groupId === id);
    if (children.length) {
      const kindNames = {
        category: t('子類別', 'phân nhóm'),
        subcategory: t('規格群組', 'nhóm quy cách'),
        group: t('檢具設備', 'thiết bị'),
      };
      const itemName = item.code ? `${item.code} · ${item.name}` : (item.name || item.nameVi || item.nameZh || item.id);
      message = t(`下階已有資料，故不能刪除。「${itemName}」仍有 ${children.length} 筆${kindNames[kind]}（含未啟用、待確認及被篩選隱藏的資料）。`, `Không thể xóa vì cấp dưới đã có dữ liệu. "${itemName}" còn ${children.length} mục ${kindNames[kind]} (bao gồm chưa kích hoạt, chờ xác nhận và bị ẩn lọc).`);
      render();
      return;
    }
    const displayNameStr = item.code ? `${item.code} · ${item.name}` : (item.name || item.nameVi || item.nameZh || item.id);
    if (!confirm(t(`確定刪除【${displayNameStr}】？`, `Bạn có chắc muốn xóa 【${displayNameStr}】?`))) return;
    if (!confirm(t(`再次確認：將從目前草稿刪除【${displayNameStr}】，是否繼續？`, `Xác nhận lần nữa: sẽ xóa 【${displayNameStr}】 khỏi bản nháp hiện tại, tiếp tục?`))) return;
    collection.splice(collection.indexOf(item), 1);
    pendingPhotos.delete(id);
    if (kind === 'category') { selectedCategory = ''; selectedSubcategory = ''; selectedGroup = ''; }
    if (kind === 'subcategory') { selectedSubcategory = ''; selectedGroup = ''; }
    if (kind === 'group') selectedGroup = '';
    message = t(`已從目前草稿刪除【${displayNameStr}】，尚未保存至伺服器。`, `Đã xóa 【${displayNameStr}】 khỏi bản nháp hiện tại, chưa lưu lên máy chủ.`);
    await writeShared('apply');
    render();
  }

  async function deleteEquipment(id) {
    if (!editable() || !permitted('master.delete')) return;
    const item = (working?.equipment || []).find(record => record.id === id);
    if (!item) return;
    const actorId = identity()?.id, originalWorking = working,
      originalGeneration = syncGeneration, originalVersion = selectedVersionId;
    const sameContext = () => identity()?.id === actorId && controlActor === actorId &&
      working === originalWorking && syncGeneration === originalGeneration &&
      selectedVersionId === originalVersion && editable() && permitted('master.delete') &&
      working.equipment.find(record => record.id === id) === item;
    let refs;
    try {
      // A display cache may be stale or partial; destructive actions require a
      // complete fresh check and retain their original actor/draft context.
      refs = await queryAllQualityReferences(id, { strict: true });
    } catch {
      if (sameContext()) {
        message = t('無法確認品質標準引用；保留草稿，請重新載入核對後再操作。', 'Không thể xác minh tham chiếu tiêu chuẩn; giữ bản nháp, hãy tải lại và đối chiếu trước khi tiếp tục.');
        render();
      }
      return;
    }
    if (!sameContext()) return;
    equipmentRefCache.set(id, refs);
    const hasActiveRefs = (refs.fqc.active.length + refs.iqc.active.length + refs.ipqcC.active.length + refs.ipqcAB.active.length) > 0;
    const hasPendingRefs = (refs.fqc.pending.length + refs.iqc.pending.length + refs.ipqcC.pending.length + refs.ipqcAB.pending.length) > 0;
    const hasDraftRefs = (refs.fqc.draft.length + refs.iqc.draft.length + refs.ipqcC.draft.length + refs.ipqcAB.draft.length) > 0;

    if (hasActiveRefs || hasPendingRefs || hasDraftRefs) {
      const refList = [];
      if (refs.fqc.active.length || refs.fqc.pending.length || refs.fqc.draft.length) {
        const fItems = [...refs.fqc.active, ...refs.fqc.pending, ...refs.fqc.draft].map(it => `${it.checkNo} (${status(it.status)})`).join('、');
        refList.push(`FQC：${fItems}`);
      }
      if (refs.iqc.active.length || refs.iqc.pending.length || refs.iqc.draft.length) {
        const iItems = [...refs.iqc.active, ...refs.iqc.pending, ...refs.iqc.draft].map(it => `${it.checkNo} (${status(it.status)})`).join('、');
        refList.push(`IQC：${iItems}`);
      }
      if (refs.ipqcC.active.length || refs.ipqcC.pending.length || refs.ipqcC.draft.length) {
        const cItems = [...refs.ipqcC.active, ...refs.ipqcC.pending, ...refs.ipqcC.draft].map(it => `${it.checkNo} (${status(it.status)})`).join('、');
        refList.push(`IPQC-C：${cItems}`);
      }
      if (refs.ipqcAB.active.length || refs.ipqcAB.pending.length || refs.ipqcAB.draft.length) {
        const abItems = [...refs.ipqcAB.active, ...refs.ipqcAB.pending, ...refs.ipqcAB.draft].map(it => `${it.checkNo} (${status(it.status)})`).join('、');
        refList.push(`IPQC-AB：${abItems}`);
      }
      alert(t(
        `該設備目前仍被下列品質標準引用（生效／待審／草稿），禁止刪除！\n\n${refList.join('\n')}\n\n請先使用「替換設備」將標準移轉至其他設備後再進行操作。`,
        `Thiết bị này đang được tham chiếu bởi các tiêu chuẩn sau, không thể xóa!\n\n${refList.join('\n')}\nVui lòng chuyển tiêu chuẩn trước.`
      ));
      return;
    }

    const cannotDelete = !!item.sourceRow || !!item.effectiveAt || (active()?.equipment || []).some(record => record.id === id);
    if (cannotDelete) {
      message = t(
        '已生效或來源檢具不可刪除；如已停用，請於編輯表單中將設備狀態改為「未啟用」。',
        'Thiết bị đã hiệu lực hoặc từ nguồn không thể xóa; nếu ngưng dùng, hãy đổi trạng thái thành "Chưa kích hoạt" trong biểu mẫu.'
      );
      render();
      return;
    }

    const title = `${item.assetCode} · ${displayName(item) || item.pieceMark}`;
    if (!confirm(t(`確定刪除【${title}】？`, `Bạn có chắc muốn xóa 【${title}】?`))) return;
    if (!confirm(t(`再次確認：將從目前草稿刪除【${title}】，是否繼續？`, `Xác nhận lần nữa: sẽ xóa 【${title}】 khỏi bản nháp hiện tại, tiếp tục?`))) return;
    if (!sameContext()) return;
    const idx = working.equipment.findIndex(record => record.id === id);
    if (idx !== -1) working.equipment.splice(idx, 1);
    pendingPhotos.delete(id);
    if (selectedEquipmentId === id) selectedEquipmentId = '';
    if (editingEquipmentId === id) { editingEquipmentId = ''; formSnapshot = null; }
    message = t(`已從目前草稿刪除【${title}】，尚未保存至伺服器。`, `Đã xóa 【${title}】 khỏi bản nháp hiện tại, chưa lưu lên máy chủ.`);
    await writeShared('apply');
    render();
  }

  async function openEditEquipment(id) {
    if (!editable() || !routineTabIsActive() || editingEquipmentId || addingEquipment || nodeDialog || viewDialog || transferDialog) return;
    if (!(visible()?.equipment || []).some(record => record.id === id)) return;
    const request = ++equipmentEditRequest, actor = identity()?.id, epoch = window.ProcessSync?.identityGeneration?.(), page = host,
      versionId = selectedVersionId, generation = syncGeneration, workflowGeneration = control?.workflow?.generation;
    await loadEquipmentReferences(id, { renderAfter: false });
    if (request !== equipmentEditRequest || host !== page || !routineTabIsActive() || identity()?.id !== actor ||
        window.ProcessSync?.identityGeneration?.() !== epoch || controlActor !== actor || selectedVersionId !== versionId ||
        syncGeneration !== generation || control?.workflow?.generation !== workflowGeneration || !editable() ||
        editingEquipmentId || addingEquipment || nodeDialog || viewDialog || transferDialog) return;
    const item = (visible()?.equipment || []).find(record => record.id === id);
    if (!item) return;
    addingEquipment = false;
    newEquipmentForm = null;
    editingEquipmentId = id;
    selectedEquipmentId = id;
    formSnapshot = clone(item);
    render();
  }

  function openAddEquipmentDialog() {
    if (!editable()) return;
    const tree = structure(visible());
    if (!selectedCategory) {
      alert(t('請先選取上方類別與子類別，再新增檢具。', 'Vui lòng chọn nhóm và phân nhóm trước khi thêm thiết bị.'));
      host.querySelector('.routine-hierarchy')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!selectedSubcategory) {
      alert(t('請先選取上方子類別，再新增檢具。', 'Vui lòng chọn phân nhóm trước khi thêm thiết bị.'));
      host.querySelector('.routine-hierarchy')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const availableGroups = tree.groups.filter(g => g.subcategoryId === selectedSubcategory);
    if (!availableGroups.length) {
      alert(t('目前子類別尚無規格群組，請先點擊上方「＋新增規格群組」後再新增檢具。', 'Phân nhóm này chưa có nhóm quy cách, vui lòng thêm nhóm quy cách trước.'));
      host.querySelector('.routine-hierarchy')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!selectedGroup || !availableGroups.some(g => g.id === selectedGroup)) {
      selectedGroup = availableGroups[0].id;
    }
    equipmentEditRequest++;
    editingEquipmentId = '';
    formSnapshot = null;
    addingEquipment = true;
    newEquipmentOwner = {actor:identity()?.id,epoch:window.ProcessSync?.identityGeneration?.(),generation:syncGeneration};
    newEquipmentForm = {
      groupId: selectedGroup,
      assetCode: '',
      name: '',
      quantity: 1,
      unit: '個',
      owner: '',
      enabled: true,
      confirmed: false,
      calibrationMethod: 'none',
      calibrationCycle: '',
      customCycle: '',
      calibratedAt: '',
      expiresAt: '',
      intakeDate: '',
      spec: '',
      notes: '',
      pendingPhoto: null,
      error: '',
    };
    render();
  }

  async function confirmAddEquipment() {
    if (!addingEquipment || !newEquipmentForm || !editable() || busy) return;
    const root = host;

    const assetCode = String(root.querySelector('#routine-add-asset-code')?.value || '').trim().toUpperCase();
    const name = String(root.querySelector('#routine-add-name')?.value || '').trim();
    const unit = root.querySelector('#routine-add-unit')?.value || '個';
    const owner = String(root.querySelector('#routine-add-owner')?.value || '').trim();
    const enabled = root.querySelector('#routine-add-enabled')?.value === 'true';
    const confirmed = root.querySelector('#routine-add-confirmed')?.value === 'true';
    const calibrationMethod = root.querySelector('#routine-add-calibration-method')?.value || 'none';
    const calibrationCycle = root.querySelector('#routine-add-calibration-cycle')?.value || '';
    const customCycle = String(root.querySelector('#routine-add-custom-cycle')?.value || '').trim();
    const calibratedAt = String(root.querySelector('#routine-add-calibrated-at')?.value || '');
    const expiresAt = String(root.querySelector('#routine-add-expires-at')?.value || '');
    const intakeDate = String(root.querySelector('#routine-add-intake-date')?.value || '');
    const spec = String(root.querySelector('#routine-add-spec')?.value || '').trim();
    const notes = String(root.querySelector('#routine-add-notes')?.value || '').trim();

    Object.assign(newEquipmentForm, {
      assetCode, name, unit, owner, enabled, confirmed,
      calibrationMethod, calibrationCycle, customCycle,
      calibratedAt, expiresAt, intakeDate, spec, notes
    });

    if (!/^[A-Z0-9-]{2,40}$/.test(assetCode)) {
      newEquipmentForm.error = t('固定資產編號格式錯誤（需為 2-40 碼英數字／橫線）', 'Mã TSCĐ không đúng định dạng (2-40 ký tự chữ số/gạch nối)');
      render();
      return;
    }
    if (!name) {
      newEquipmentForm.error = t('名稱不可空白', 'Tên không được để trống');
      render();
      return;
    }
    if (!['個', '支', '台', '組'].includes(unit)) {
      newEquipmentForm.error = t('請選擇有效單位', 'Vui lòng chọn đơn vị hợp lệ');
      render();
      return;
    }
    if (calibrationMethod !== 'none') {
      if (calibratedAt && !/^\d{4}-\d{2}-\d{2}$/.test(calibratedAt)) {
        newEquipmentForm.error = t('最近校正日期格式錯誤', 'Ngày hiệu chuẩn không đúng định dạng');
        render();
        return;
      }
      if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
        newEquipmentForm.error = t('有效期限格式錯誤', 'Hạn hiệu chuẩn không đúng định dạng');
        render();
        return;
      }
    }

    busy = true;
    try {
      const tree = structure(visible());
      const chosenGroup = root.querySelector('#routine-add-group-select')?.value || selectedGroup;
      const group = tree.groups.find(g => g.id === chosenGroup) || tree.groups.find(g => g.id === selectedGroup);
      if (!group) throw new Error(t('所選規格群組無效', 'Nhóm quy cách không hợp lệ'));
      selectedGroup = group.id;

      const mark = computeNextPieceMark(assetCode);
      const newId = crypto.randomUUID();

      const newRecord = {
        id: newId,
        assetCode,
        pieceMark: mark,
        groupId: selectedGroup,
        categoryId: group.categoryId || selectedCategory,
        subcategoryId: group.subcategoryId || selectedSubcategory,
        categoryCode: group.categoryCode || '',
        category: group.category || '',
        subcategory: group.subcategory || '',
        name,
        quantity: 1,
        unit,
        owner,
        enabled,
        confirmed,
        calibrationMethod,
        calibrationCycle: calibrationMethod === 'none' ? '' : calibrationCycle,
        customCycle: calibrationMethod === 'none' || calibrationCycle !== 'custom' ? '' : customCycle,
        calibratedAt: calibrationMethod === 'none' ? '' : calibratedAt,
        expiresAt: calibrationMethod === 'none' ? '' : expiresAt,
        intakeDate,
        spec,
        notes,
        photoId: '',
        sourceRow: null,
        effectiveAt: null,
      };

      if (newEquipmentForm.pendingPhoto) {
        pendingPhotos.set(newId, newEquipmentForm.pendingPhoto);
      }

      if (!control.reservedMarks) control.reservedMarks = {};
      if (!control.reservedMarks[assetCode]) control.reservedMarks[assetCode] = [];
      if (!control.reservedMarks[assetCode].includes(mark)) {
        control.reservedMarks[assetCode].push(mark);
      }

      working.equipment.push(newRecord);
      syncHierarchy();
      busy=false;
      if(!await writeShared('apply')){working.equipment=working.equipment.filter(e=>e.id!==newId);newEquipmentForm.error=message;return;}

      addingEquipment = false;
      newEquipmentForm = null;
      selectedEquipmentId = newId;
      editingEquipmentId = '';
      formSnapshot = null;
      message = t('新增檢具已同步，尚未手動儲存。', 'Đã đồng bộ thiết bị mới, chưa lưu thủ công.');
      render();
    } catch (err) {
      newEquipmentForm.error = err.message || t('新增失敗', 'Thêm thất bại');
      render();
    } finally {
      busy = false;
    }
  }

  const isFormDirty = () => {
    if (!formSnapshot || !host) return false;
    const curName = host.querySelector('#routine-editor [data-field="name"]')?.value?.trim();
    if (curName !== undefined && curName !== String(displayName(formSnapshot)).replace(/[\r\n]/g, '').trim()) return true;
    const curGroup = host.querySelector('#routine-edit-group')?.value;
    if (curGroup && curGroup !== formSnapshot.groupId) return true;
    const curUnit = host.querySelector('#routine-editor [data-select="unit"]')?.value;
    if (curUnit && curUnit !== unitCode(formSnapshot.unit)) return true;
    const curOwner = host.querySelector('#routine-editor [data-field="owner"]')?.value?.trim();
    if (curOwner !== undefined && curOwner !== (formSnapshot.owner || '')) return true;
    const curEnabled = host.querySelector('#routine-editor [data-select="enabled"]')?.value;
    if (curEnabled && (curEnabled === 'true') !== !!formSnapshot.enabled) return true;
    const curConfirmed = host.querySelector('#routine-editor [data-select="confirmed"]')?.value;
    if (curConfirmed && (curConfirmed === 'true') !== !!formSnapshot.confirmed) return true;
    const curMethod = host.querySelector('#routine-editor [data-select="calibrationMethod"]')?.value;
    if (curMethod && curMethod !== methodCode(formSnapshot.calibrationMethod)) return true;
    const curCalAt = host.querySelector('#routine-editor [data-field="calibratedAt"]')?.value;
    if (curCalAt !== undefined && curCalAt !== (formSnapshot.calibratedAt || '')) return true;
    const curExpAt = host.querySelector('#routine-editor [data-field="expiresAt"]')?.value;
    if (curExpAt !== undefined && curExpAt !== (formSnapshot.expiresAt || '')) return true;
    const curSpec = host.querySelector('#routine-editor [data-field="spec"]')?.value;
    if (curSpec !== undefined && curSpec !== (formSnapshot.spec || '')) return true;
    const curNotes = host.querySelector('#routine-editor [data-field="notes"]')?.value;
    if (curNotes !== undefined && curNotes !== (formSnapshot.notes || '')) return true;
    return false;
  };

  function locateEquipment(id, field = '') {
    if (!editable()) {
      alert(t('目前非可編輯草稿狀態，無法修改設備。', 'Hiện không ở trạng thái nháp có thể sửa, không thể chỉnh sửa thiết bị.'));
      return;
    }
    const item = (visible()?.equipment || []).find(value => value.id === id);
    if (!item) {
      alert(t('找不到該設備資料', 'Không tìm thấy dữ liệu thiết bị'));
      return;
    }

    if (editingEquipmentId && editingEquipmentId !== id && isFormDirty()) {
      if (!confirm(t('目前表單尚有未套用的修改，確定放棄並前往修正其他設備？', 'Biểu mẫu hiện tại có thay đổi chưa áp dụng, bạn có chắc muốn hủy để sửa thiết bị khác?'))) {
        return;
      }
      const curEditing = (working?.equipment || []).find(e => e.id === editingEquipmentId);
      if (curEditing && formSnapshot) Object.assign(curEditing, formSnapshot);
    }

    equipmentEditRequest++;
    if (search) {
      const matchesSearch = matchingRows(visible()?.equipment || []).some(e => e.id === id);
      if (!matchesSearch) {
        search = '';
        const searchInput = host.querySelector('#routine-search');
        if (searchInput) searchInput.value = '';
      }
    }

    const group = structure(visible()).groups.find(value => value.id === item.groupId);
    if (group) {
      selectedCategory = group.categoryId || '';
      selectedSubcategory = group.subcategoryId || '';
      selectedGroup = group.id || '';
    }

    selectedEquipmentId = id;
    editingEquipmentId = id;
    addingEquipment = false;
    newEquipmentForm = null;
    formSnapshot = clone(item);
    render();

    requestAnimationFrame(() => {
      const drawer = host.querySelector('#routine-editor');
      if (!drawer) return;
      let targetEl = null;
      if (field) {
        targetEl = drawer.querySelector(`[data-field="${field}"]`) ||
                   drawer.querySelector(`[data-select="${field}"]`) ||
                   (field === 'groupId' ? drawer.querySelector('#routine-edit-group') : null) ||
                   (field === 'calibrationMethod' ? drawer.querySelector('#routine-edit-calibration-method') : null);
      }
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetEl.focus?.();
        targetEl.classList.add('routine-field-highlight');
        setTimeout(() => {
          targetEl.classList.remove('routine-field-highlight');
        }, 3000);
      } else {
        drawer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  async function queryAllQualityReferences(eqId, { strict = false } = {}) {
    const result = {
      fqc: { active: [], pending: [], draft: [], superseded: [] },
      iqc: { active: [], pending: [], draft: [], superseded: [] },
      ipqcC: { active: [], pending: [], draft: [], superseded: [] },
      ipqcAB: { active: [], pending: [], draft: [], superseded: [] }
    };
    if (!eqId) return result;
    const addUnique = (bucket, ref) => {
      const key = JSON.stringify([ref.scope || '', ref.versionId, ref.itemId]);
      if (!bucket.some(item => JSON.stringify([item.scope || '', item.versionId, item.itemId]) === key)) bucket.push(ref);
    };

    // 1. FQC
    try {
      if (window.FQCQualityAPI?.getEquipmentReferences) {
        const fqcRefs = window.FQCQualityAPI.getEquipmentReferences(eqId);
        fqcRefs.forEach(ref => {
          if (ref.status === 'approved' && ref.isActive) addUnique(result.fqc.active, ref);
          else if (ref.status === 'pending') addUnique(result.fqc.pending, ref);
          else if (ref.status === 'draft') addUnique(result.fqc.draft, ref);
          else addUnique(result.fqc.superseded, ref);
        });
      } else {
        const fqcCtrl = JSON.parse(localStorage.getItem('qualityMasterControl') || '{}');
        const lib = fqcCtrl.libraries?.fqc;
        if (!Array.isArray(lib?.versions)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
        (lib?.versions || []).forEach(v => {
          if (!Array.isArray(v?.snapshot?.items)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
          v.snapshot.items.forEach(it => {
            if (!it.isDeleted && it.equipmentId === eqId) {
              const ref = {
                moduleId: 'fqc', moduleName: 'FQC', versionId: v.id, versionNumber: v.number,
                status: v.status, itemId: it.id, checkNo: it.checkNo, itemName: it.name, isEnabled: it.isEnabled !== false
              };
              if (v.id === lib.activeVersionId && v.status === 'approved') addUnique(result.fqc.active, ref);
              else if (v.status === 'pending') addUnique(result.fqc.pending, ref);
              else if (v.status === 'draft') addUnique(result.fqc.draft, ref);
              else addUnique(result.fqc.superseded, ref);
            }
          });
        });
      }
    } catch (e) {
      if (strict) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      result.fqc.unavailable = true;
      console.error('Error querying FQC references', e);
    }

    // 2. IQC
    try {
      const res = await fetch('/api/iqc');
      if (!res.ok) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      if (res.ok) {
        const data = await res.json();
        if (!Array.isArray(data.control?.versions)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
        (data.control?.versions || []).forEach(v => {
          if (!Array.isArray(v?.snapshot?.items)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
          v.snapshot.items.forEach(it => {
            const matchId = it.equipmentId === eqId;
            if (!it.isDeleted && matchId) {
              const ref = {
                moduleId: 'iqc', moduleName: 'IQC', versionId: v.id, versionNumber: v.number,
                status: v.status, itemId: it.id, checkNo: it.checkNo, itemName: it.nameVi || it.name, isEnabled: it.isEnabled !== false
              };
              if (v.id === data.control.activeVersionId && v.status === 'approved') addUnique(result.iqc.active, ref);
              else if (v.status === 'pending') addUnique(result.iqc.pending, ref);
              else if (v.status === 'draft') addUnique(result.iqc.draft, ref);
              else addUnique(result.iqc.superseded, ref);
            }
          });
        });
      }
    } catch (e) {
      if (strict) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      result.iqc.unavailable = true;
      console.error('Error querying IQC references', e);
    }

    // 3. IPQC-C: only a stable equipmentId is a confirmed relationship.
    try {
      const res = await fetch('/api/ipqc-c');
      if (!res.ok) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      if (res.ok) {
        const data = await res.json();
        if (!Array.isArray(data.control?.versions)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
        (data.control?.versions || []).forEach(v => {
          if (!Array.isArray(v?.snapshot?.items)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
          v.snapshot.items.forEach(it => {
            const matchId = it.equipmentId === eqId;
            if (!it.deleted && matchId) {
              const ref = {
                moduleId: 'ipqc-c', moduleName: 'IPQC-C', versionId: v.id, versionNumber: v.number,
                status: v.status, itemId: it.id, checkNo: it.code || it.id, itemName: it.name || it.description?.slice(0, 30) || '檢查項目', isEnabled: true
              };
              if (v.id === data.control.activeVersionId && v.status === 'approved') addUnique(result.ipqcC.active, ref);
              else if (v.status === 'pending') addUnique(result.ipqcC.pending, ref);
              else if (v.status === 'draft') addUnique(result.ipqcC.draft, ref);
              else addUnique(result.ipqcC.superseded, ref);
            }
          });
        });
      }
    } catch (e) {
      if (strict) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      result.ipqcC.unavailable = true;
      console.error('Error querying IPQC-C references', e);
    }

    // IPQC-AB references are versioned per line and group. A stable equipmentId,
    // not the source Excel tool text, is the only confirmed relationship.
    try {
      const res = await fetch('/api/ipqc-ab');
      if (!res.ok) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      if (res.ok) {
        const data = await res.json();
        if (!data.control?.scopes || typeof data.control.scopes !== 'object' || Array.isArray(data.control.scopes)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
        Object.entries(data.control?.scopes || {}).forEach(([scopeKey, scope]) => {
          scope.versions.forEach(v => {
            v.snapshot.items.forEach(it => {
              if (it.deleted || it.equipmentId !== eqId) return;
              const ref = { moduleId: 'ipqc-ab', moduleName: 'IPQC-AB', scope: scopeKey, line: scope.line, group: scope.group, versionId: v.id,
                versionNumber: v.number, status: v.status, itemId: it.id, checkNo: it.code,
                itemName: it.standard || it.code, isEnabled: it.isEnabled };
              if (v.id === scope.activeVersionId && v.status === 'approved') addUnique(result.ipqcAB.active, ref);
              else if (v.status === 'pending' || v.status === 'pending-test') addUnique(result.ipqcAB.pending, ref);
              else if (v.status === 'draft') addUnique(result.ipqcAB.draft, ref);
              else addUnique(result.ipqcAB.superseded, ref);
            });
          });
        });
      }
    } catch (e) { if (strict) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED'); result.ipqcAB.unavailable = true; console.error('Error querying IPQC-AB references', e); }

    try {
      const response = await fetch(`/api/quality-equipment-replacement?sourceId=${encodeURIComponent(eqId)}`);
      if (!response.ok) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      if (response.ok) {
        const data = await response.json();
        if (!Array.isArray(data.pending) || !Array.isArray(data.modules)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
        for (const record of data.pending || []) {
          const bucket = record.moduleId === 'ipqc-c' ? result.ipqcC : record.moduleId === 'ipqc-ab' ? result.ipqcAB : result[record.moduleId];
          if (!bucket) continue;
          bucket.planned ||= [];
          const targetModule = data.modules.find(row => row.moduleId === record.moduleId);
          const item = targetModule?.items.find(row => row.id === record.itemId);
          addUnique(bucket.planned, { scope: record.scopeKey || '', versionId: record.pendingVersionId, itemId: record.itemId,
            checkNo: record.itemCode || item?.code || record.itemId,
            itemName: record.itemName || item?.name || '', versionNumber: record.pendingVersionNumber || '—',
            status: record.status, reason: record.reason, moduleId: record.moduleId });
        }
      }
    } catch (error) { if (strict) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED'); result.plannedUnavailable = true; console.error('Error querying planned replacements', error); }

    return result;
  }

  async function loadEquipmentReferences(id, { renderAfter = true } = {}) {
    if (!id) return;
    const actorId = identity()?.id;
    const refs = await queryAllQualityReferences(id);
    if (identity()?.id !== actorId) return;
    equipmentRefCache.set(id, refs);
    if (renderAfter && routineTabIsActive()) updateEquipmentReferenceSections(id);
    return refs;
  }

  function updateEquipmentReferenceSections(id) {
    if (!routineTabIsActive()) return;
    for (const section of host.querySelectorAll('[data-routine-reference-id]')) {
      if (section.dataset.routineReferenceId !== id) continue;
      section.outerHTML = equipmentReferencesSectionHTML(id, section.dataset.referenceMode);
    }
    bindReferenceActions(host);
    sharedClient?.gatePermissions();
  }

  function renderRefItems(mRef, moduleName) {
    if (mRef.unavailable) return `<p class="routine-ref-empty-note" role="alert">${t('查詢未完成；請關閉後重新開啟設備資訊重試。', 'Tra cứu chưa hoàn tất; đóng rồi mở lại thông tin thiết bị để thử lại.')}</p>`;
    const active = mRef.active || [];
    const pending = mRef.pending || [];
    const draft = mRef.draft || [];
    const superseded = mRef.superseded || [];
    const planned = mRef.planned || [];

    if (!active.length && !pending.length && !draft.length && !superseded.length && !planned.length) {
      return `<p class="routine-ref-empty-note">${t('此設備在該模組尚無任何標準引用。', 'Thiết bị này chưa có tham chiếu tiêu chuẩn nào.')}</p>`;
    }

    const renderList = (items, badgeClass, badgeLabel) => `
      <div class="routine-ref-subgroup">
        <span class="routine-ref-badge ${badgeClass}">${badgeLabel} (${items.length})</span>
        <div class="routine-ref-item-rows">
          ${items.map(it => `
            <div class="routine-ref-row">
              <a href="javascript:void(0)" class="routine-standard-link" data-std-module="${moduleName}" data-std-vid="${h(it.versionId)}" data-std-iid="${h(it.itemId)}" data-std-scope="${h(it.scope || '')}">
                <code>${h(it.checkNo)}</code>
              </a>
              <span class="routine-ref-row-name" data-i18n-skip="true">${h(it.itemName)}</span>
              <small class="routine-ref-ver">V${h(String(it.versionNumber || '—').replace(/^V/i, ''))}</small>
              ${it.reason ? `<small class="routine-ref-reason">${h(it.reason)}</small>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    return `
      <div class="routine-ref-groups-wrap">
        ${active.length ? renderList(active, 'active', t('目前生效中', 'Đang hiệu lực')) : ''}
        ${pending.length ? renderList(pending, 'pending', t('主管審核中', 'Chờ duyệt')) : ''}
        ${draft.length ? renderList(draft, 'draft', t('草稿中', 'Bản nháp')) : ''}
        ${planned.length ? renderList(planned, 'pending', t('待處理替換', 'Thay thế chờ xử lý')) : ''}
        ${superseded.length ? renderList(superseded, 'superseded', t('歷史核准版', 'Bản lịch sử')) : ''}
      </div>
    `;
  }

  function equipmentReferencesSectionHTML(eqId, mode) {
    if (!eqId) return '';
    const refs = equipmentRefCache.get(eqId);
    if (!refs) {
      void loadEquipmentReferences(eqId);
      return `<div class="routine-ref-loading" data-routine-reference-id="${h(eqId)}" data-reference-mode="${h(mode)}"><small>${t('載入各品質系統標準引用中…', 'Đang tải tham chiếu tiêu chuẩn...')}</small></div>`;
    }

    const fqcTotal = refs.fqc.active.length + refs.fqc.pending.length + refs.fqc.draft.length;
    const iqcTotal = refs.iqc.active.length + refs.iqc.pending.length + refs.iqc.draft.length;
    const ipqcCTotal = refs.ipqcC.active.length + refs.ipqcC.pending.length + refs.ipqcC.draft.length;
    const ipqcABTotal = refs.ipqcAB.active.length + refs.ipqcAB.pending.length + refs.ipqcAB.draft.length;

    const fqcOpen = mode === 'edit' && (refs.fqc.active.length > 0 || refs.fqc.pending.length > 0);
    const iqcOpen = mode === 'edit' && (refs.iqc.active.length > 0 || refs.iqc.pending.length > 0);
    const ipqcCOpen = mode === 'edit' && (refs.ipqcC.active.length > 0 || refs.ipqcC.pending.length > 0);

    return `
      <div class="routine-ref-section" data-routine-reference-id="${h(eqId)}" data-reference-mode="${h(mode)}">
        <h4 class="routine-ref-main-title">${t('四種品質標準反向引用', 'Tham chiếu ngược 4 tiêu chuẩn chất lượng')}</h4>
        ${refs.plannedUnavailable ? `<p role="alert">${t('待處理替換查詢未完成；請重新開啟設備資訊重試。', 'Tra cứu thay thế chưa hoàn tất; mở lại thông tin thiết bị để thử lại.')}</p>` : ''}

        <!-- 1. FQC -->
        <details class="routine-ref-box" ${fqcOpen ? 'open' : ''}>
          <summary>
            <div class="routine-ref-summary-left">
              <span class="routine-ref-icon">📋</span>
              <b>FQC ${t('標準引用', 'Tham chiếu tiêu chuẩn')}</b>
              <span class="routine-ref-count ${fqcTotal > 0 ? 'highlight' : ''}">${refs.fqc.unavailable ? t('查詢未完成', 'Tra cứu chưa hoàn tất') : fqcTotal > 0 ? `· ${fqcTotal} ${t('筆', 'mục')}` : t('· 尚無引用 (0)', '· Chưa có (0)')}</span>
            </div>
            ${mode === 'edit' && !refs.fqc.unavailable && fqcTotal > 0 && permitted('approval.submit') ? `
              <button type="button" class="button ghost master-small routine-ref-transfer-btn" data-transfer-module="fqc" data-source-eq="${h(eqId)}">
                ${t('移轉 FQC 標準', 'Chuyển tiêu chuẩn FQC')}
              </button>
            ` : ''}
          </summary>
          <div class="routine-ref-content">
            ${renderRefItems(refs.fqc, 'fqc')}
          </div>
        </details>

        <!-- 2. IPQC-AB -->
        <details class="routine-ref-box">
          <summary>
            <div class="routine-ref-summary-left">
              <span class="routine-ref-icon">⚙️</span>
              <b>IPQC-AB ${t('標準引用', 'Tham chiếu tiêu chuẩn')}</b>
              <span class="routine-ref-count ${ipqcABTotal > 0 ? 'highlight' : ''}">${refs.ipqcAB.unavailable ? t('查詢未完成', 'Tra cứu chưa hoàn tất') : `· ${ipqcABTotal} ${t('筆', 'mục')}`}</span>
            </div>
          </summary>
          <div class="routine-ref-content">
            ${renderRefItems(refs.ipqcAB, 'ipqc-ab')}
          </div>
        </details>

        <!-- 3. IPQC-C -->
        <details class="routine-ref-box" ${ipqcCOpen ? 'open' : ''}>
          <summary>
            <div class="routine-ref-summary-left">
              <span class="routine-ref-icon">🔍</span>
              <b>IPQC-C ${t('標準引用', 'Tham chiếu tiêu chuẩn')}</b>
              <span class="routine-ref-count ${ipqcCTotal > 0 ? 'highlight' : ''}">${refs.ipqcC.unavailable ? t('查詢未完成', 'Tra cứu chưa hoàn tất') : ipqcCTotal > 0 ? `· ${ipqcCTotal} ${t('筆', 'mục')}` : t('尚無引用 (0)', 'Chưa có (0)')}</span>
            </div>
            ${mode === 'edit' && !refs.ipqcC.unavailable && ipqcCTotal > 0 && permitted('approval.submit') ? `
              <button type="button" class="button ghost master-small routine-ref-transfer-btn" data-transfer-module="ipqc-c" data-source-eq="${h(eqId)}">
                ${t('移轉 IPQC-C 標準', 'Chuyển tiêu chuẩn IPQC-C')}
              </button>
            ` : ''}
          </summary>
          <div class="routine-ref-content">
            ${renderRefItems(refs.ipqcC, 'ipqc-c')}
          </div>
        </details>

        <!-- 4. IQC -->
        <details class="routine-ref-box" ${iqcOpen ? 'open' : ''}>
          <summary>
            <div class="routine-ref-summary-left">
              <span class="routine-ref-icon">📦</span>
              <b>IQC ${t('標準引用', 'Tham chiếu tiêu chuẩn')}</b>
              <span class="routine-ref-count ${iqcTotal > 0 ? 'highlight' : ''}">${refs.iqc.unavailable ? t('查詢未完成', 'Tra cứu chưa hoàn tất') : iqcTotal > 0 ? `· ${iqcTotal} ${t('筆', 'mục')}` : t('尚無引用 (0)', 'Chưa có (0)')}</span>
            </div>
            ${mode === 'edit' && !refs.iqc.unavailable && iqcTotal > 0 && permitted('approval.submit') ? `
              <button type="button" class="button ghost master-small routine-ref-transfer-btn" data-transfer-module="iqc" data-source-eq="${h(eqId)}">
                ${t('移轉 IQC 標準', 'Chuyển tiêu chuẩn IQC')}
              </button>
            ` : ''}
          </summary>
          <div class="routine-ref-content">
            ${renderRefItems(refs.iqc, 'iqc')}
          </div>
        </details>
      </div>
    `;
  }

  function openStandardItemView(moduleName, versionId, itemId, requestedScope = '') {
    if (moduleName === 'fqc' && window.FQCQualityAPI?.openItemView) {
      window.FQCQualityAPI.openItemView(versionId, itemId);
      return;
    }
    if (moduleName === 'ipqc-ab' && window.IPQCABUI?.openItemView) {
      window.IPQCABUI.openItemView(versionId, itemId, requestedScope);
      return;
    }
    alert(t(`正在查閱 ${moduleName.toUpperCase()} 標準項目 ${itemId}（版本：${versionId}）`, `Đang xem mục tiêu chuẩn ${itemId}`));
  }

  function bindReferenceActions(root) {
    if (!root) return;
    root.querySelectorAll('[data-transfer-module]').forEach(button => button.onclick = event => {
      event.stopPropagation();
      openTransferModal(button.dataset.sourceEq, button.dataset.transferModule);
    });
    root.querySelectorAll('[data-std-module]').forEach(link => link.onclick = event => {
      event.stopPropagation();
      openStandardItemView(link.dataset.stdModule, link.dataset.stdVid, link.dataset.stdIid, link.dataset.stdScope);
    });
  }

  function openTransferModal(sourceId) {
    if (editingEquipmentId && isFormDirty()) {
      if (!confirm(t('編輯表單有未儲存的變更，移轉標準前請先儲存，或取消移轉繼續編輯。確定要開啟移轉視窗？', 'Biểu mẫu có thay đổi chưa lưu, vui lòng lưu trước khi chuyển tiêu chuẩn. Tiếp tục mở?'))) {
        return;
      }
    }
    const refs = equipmentRefCache.get(sourceId) || {
      fqc: { active: [], draft: [] },
      iqc: { active: [], draft: [] },
      ipqcC: { active: [], draft: [] }, ipqcAB: { active: [], draft: [] }
    };
    const fqcItems = [...refs.fqc.active, ...refs.fqc.draft];
    const iqcItems = [...refs.iqc.active, ...refs.iqc.draft];
    const ipqcCItems = [...refs.ipqcC.active, ...refs.ipqcC.draft];

    equipmentEditRequest++;
    transferDialog = {
      sourceId,
      targetEqId: '',
      targetCat: '',
      selection: {
        fqc: new Set(fqcItems.map(it => it.itemId)),
        iqc: new Set(iqcItems.map(it => it.itemId)),
        ipqcC: new Set(ipqcCItems.map(it => it.itemId)), ipqcAB: new Set()
      },
      moduleStatus: { fqc: 'idle', iqc: 'idle', ipqcC: 'idle', ipqcAB: 'idle' },
      moduleMessages: { fqc: '', iqc: '', ipqcC: '', ipqcAB: '' },
      preview: null, previewError: ''
    };
    render();
    void loadTransferPreview();
  }

  async function loadTransferPreview() {
    const dialog = transferDialog;
    if (!dialog) return;
    try {
      const response = await fetch(`/api/quality-equipment-replacement?sourceId=${encodeURIComponent(dialog.sourceId)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
      if (transferDialog !== dialog) return;
      const firstPreview = !dialog.preview;
      dialog.preview = data;
      dialog.previewError = '';
      if (firstPreview) for (const [uiKey, apiKey] of [['fqc','fqc'],['iqc','iqc'],['ipqcC','ipqc-c'],['ipqcAB','ipqc-ab']])
        dialog.selection[uiKey] = new Set(data.modules.find(row => row.moduleId === apiKey)?.items.filter(item=>item.selectable!==false).map(item => item.id) || []);
      render();
    } catch (error) {
      if (transferDialog !== dialog) return;
      dialog.previewError = error.message;
      render();
    }
  }

  async function executeTransfer(uiKey) {
    const dialog = transferDialog;
    if (!dialog || !dialog.preview) return;
    const moduleId = uiKey === 'ipqcC' ? 'ipqc-c' : uiKey === 'ipqcAB' ? 'ipqc-ab' : uiKey;
    const ids = [...dialog.selection[uiKey]];
    if (!ids.length) { dialog.moduleMessages[uiKey] = t('請先勾選檢查項目', 'Hãy chọn hạng mục'); render(); return; }
    const selected=dialog.preview.modules.find(row=>row.moduleId===moduleId)?.items.filter(row=>ids.includes(row.id)) || [];
    const overrides=selected.filter(row=>row.openStatus==='draft' && row.draftEquipmentId && row.draftEquipmentId!==dialog.sourceId && row.draftEquipmentId!==dialog.targetEqId).map(row=>row.id);
    if (selected.some(row=>row.selectable===false)) {dialog.moduleMessages[uiKey]=t('包含不可編輯項目，請重新選取','Có hạng mục không thể sửa; hãy chọn lại');render();return;}
    if (!confirm(t(`確認移轉 ${ids.length} 筆 ${moduleId.toUpperCase()} 標準至草稿？僅更換檢具，照片與其他設定保留。${overrides.length?`其中 ${overrides.length} 筆草稿已改選其他檢具，將以這次選擇取代。`:''}同草稿全部成功才套用；待審項目不可移轉，也不會延後自動套用。`, `Chuyển ${ids.length} tiêu chuẩn ${moduleId.toUpperCase()} sang bản nháp? Chỉ thay thiết bị; giữ ảnh và các thiết lập khác. ${overrides.length?`Ghi đè ${overrides.length} lựa chọn thiết bị trong bản nháp.`:''} Mỗi bản nháp được xử lý toàn bộ hoặc không thay đổi. Không chuyển hồ sơ chờ duyệt và không tự áp dụng sau.`))) return;
    dialog.moduleStatus[uiKey] = 'saving'; render();
    try {
      // FQC's legacy editor persists through shared-state. Its pending local writes
      // must finish before the dedicated CAS route reads the same key.
      if (window.ProcessSync?.flush && await window.ProcessSync.flush() !== true)
        throw Error(t('本頁尚有未保存資料，請先處理同步狀態', 'Dữ liệu trang này chưa được lưu'));
      const refreshed = await fetch(`/api/quality-equipment-replacement?sourceId=${encodeURIComponent(dialog.sourceId)}`, { cache: 'no-store' });
      const current = await refreshed.json();
      if (!refreshed.ok) throw Error(current.error || `HTTP ${refreshed.status}`);
      const latest=current.modules.find(row=>row.moduleId===moduleId)?.items || [];
      if (selected.length!==ids.length || selected.some(row=>{
        const after=latest.find(item=>item.id===row.id);
        return !after || after.selectable===false || ['activeEquipmentId','draftEquipmentId','activeInspectionMode','draftInspectionMode','activeTool','draftTool','openStatus','openVersionId'].some(key=>after[key]!==row[key]);
      })) {dialog.preview=current;throw Error(t('項目已變更，請核對最新清單後再次確認移轉','Hạng mục đã thay đổi; kiểm tra danh sách mới rồi xác nhận lại'));}
      const flow=current.modules.find(row=>row.moduleId===moduleId)?.workflow;
      let data;
      if(moduleId==='ipqc-ab'){
        const rows=latest.filter(row=>ids.includes(row.id));data={results:[]};
        for(const scopeKey of new Set(rows.map(row=>row.scopeKey))){const group=rows.filter(row=>row.scopeKey===scopeKey);
          try{const client=window.createSharedDraftClient({endpoint:'/api/ipqc-ab/workflow?scope='+encodeURIComponent(scopeKey)+'&caseMetadata=1',actorId:identity()?.id,headers:()=>({...window.ProcessSync?.platformHeaders?.(),'Content-Type':'application/json'})});
            if(client.hasUnknown())throw Error('PREVIOUS_OPERATION_UNKNOWN');const started=await client.begin(),patches=[],guards=[];
            for(const row of group)for(const field of ['equipmentId','inspectionMode']){const path=['items',{id:row.itemId},field];patches.push({op:'set',path,value:field==='equipmentId'?dialog.targetEqId:'equipment'});guards.push({path,value:field==='equipmentId'?(row.openStatus==='draft'?row.draftEquipmentId:row.activeEquipmentId):(row.openStatus==='draft'?row.draftInspectionMode:row.activeInspectionMode)});}
            await client.command(started.control.workflow.generation,'apply',{patches,guards});data.results.push(...group.map(row=>({itemId:row.itemId,scopeKey,status:'applied'})));
          }catch(error){data.results.push(...group.map(row=>({itemId:row.itemId,scopeKey,status:'conflict',reason:error.message})));}
        }
      } else if(['ipqc-c','iqc','fqc'].includes(moduleId) && flow) {
        // Reuse the shared-draft transport and guarded atomic patch endpoint.
        // This syncs working content only; the successful manual save is untouched.
        const client=window.createSharedDraftClient({endpoint:`/api/${moduleId}/workflow?caseMetadata=1`,actorId:identity()?.id,
          headers:()=>({...window.ProcessSync?.platformHeaders?.(),'Content-Type':'application/json'})});
        if(client.hasUnknown())throw Error(t('前次結果待查證，請到目標模組查詢結果後再操作','Kết quả trước chưa rõ; mở mô-đun đích để kiểm tra trước khi tiếp tục'));
        const targetGeneration=!flow.editable?(await client.begin()).control.workflow.generation:flow.generation;
        const rows=latest.filter(row=>ids.includes(row.id));
        const patches=rows.map(row=>({op:'set',path:['items',{id:row.itemId},'equipmentId'],value:dialog.targetEqId}));
        const guards=rows.map(row=>({path:['items',{id:row.itemId},'equipmentId'],value:flow.editable?row.draftEquipmentId:row.activeEquipmentId}));
        if(moduleId==='iqc')for(const row of rows){const path=['items',{id:row.itemId},'inspectionMode'];patches.push({op:'set',path,value:'equipment'});guards.push({path,value:flow.editable?row.draftInspectionMode:row.activeInspectionMode});}
        if(moduleId==='fqc'){const target=control?.versions.find(v=>v.id===control.activeVersionId)?.equipment.find(e=>e.id===dialog.targetEqId);if(!target||target.enabled===false)throw Error('EQUIPMENT_UNAVAILABLE');for(const row of rows){const path=['items',{id:row.itemId},'tool'];patches.push({op:'set',path,value:target.pieceMark||target.assetCode});guards.push({path,value:flow.editable?row.draftTool:row.activeTool});}}
        await client.command(targetGeneration,'apply',{patches,guards});
        data={results:rows.map(row=>({itemId:row.itemId,status:row.draftEquipmentId===dialog.targetEqId?'unchanged':'applied'}))};
      } else {
      const response = await fetch('/api/quality-equipment-replacement', {
        method: 'POST', headers: { ...window.ProcessSync?.platformHeaders?.(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', baseRevision: current.revision, moduleId,
          sourceEquipmentId: dialog.sourceId, targetEquipmentId: dialog.targetEqId,
          itemIds: ids, overrideItemIds: overrides })
      });
      data = await response.json();
      if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
      }
      const counts = { applied: 0, unchanged: 0, waiting: 0, conflict: 0 };
      for (const row of data.results || []) counts[row.status] = (counts[row.status] || 0) + 1;
      dialog.moduleStatus[uiKey] = counts.conflict ? 'error' : counts.waiting ? 'pending' : 'success';
      dialog.moduleMessages[uiKey] = `${t('已套用', 'Đã áp dụng')} ${counts.applied} · ${t('已相同', 'Không đổi')} ${counts.unchanged} · ${t('待處理', 'Chờ xử lý')} ${counts.waiting} · ${t('衝突', 'Xung đột')} ${counts.conflict}` +
        (data.results || []).filter(row => row.reason && row.status === 'conflict').map(row => `\n${row.scopeKey?row.scopeKey+' / ':''}${row.itemId}: ${row.reason}`).join('');
      if((flow||moduleId==='ipqc-ab') && (!counts.conflict||counts.applied))dialog.moduleMessages[uiKey]+=' · '+t(`成功項目已同步，尚未手動儲存；請到 ${moduleId.toUpperCase()} 儲存草稿`,`Các hạng mục thành công đã đồng bộ, chưa lưu thủ công; hãy lưu bản nháp tại ${moduleId.toUpperCase()}`);
      await window.ProcessSync?.refresh?.();
      equipmentRefCache.delete(dialog.sourceId); equipmentRefCache.delete(dialog.targetEqId);
      await loadEquipmentReferences(dialog.sourceId, { renderAfter: false });
      await loadTransferPreview();
    } catch (error) {
      dialog.moduleStatus[uiKey] = 'error';
      dialog.moduleMessages[uiKey] = error.message || t('替換失敗', 'Thay thế thất bại');
    }
    if (transferDialog === dialog) render();
  }

  function transferDialogHTML() {
    if (!transferDialog) return '';
    const { sourceId, targetEqId } = transferDialog;
    const tree = structure(visible());
    const allEq = visible()?.equipment || [];
    const sourceEq = allEq.find(e => e.id === sourceId) || (working?.equipment || []).find(e => e.id === sourceId);
    if (!sourceEq) return '';

    const approvedVer = control?.versions?.find(v => v.id === control.activeVersionId && v.status === 'approved');
    const availableTargets = (approvedVer?.equipment || []).filter(e => e.id !== sourceId && e.enabled !== false && (!transferDialog.targetCat || e.categoryId === transferDialog.targetCat || e.categoryCode === transferDialog.targetCat));
    const targetEq = (approvedVer?.equipment || []).find(e => e.id === targetEqId);

    const previewItems = moduleId => transferDialog.preview?.modules?.find(row => row.moduleId === moduleId)?.items || [];
    const fqcItems = previewItems('fqc');
    const iqcItems = previewItems('iqc');
    const ipqcCItems = previewItems('ipqc-c');
    const ipqcABItems = previewItems('ipqc-ab');
    const replacementRow = (it, key) => `
      <div class="routine-transfer-item-row">
        <label><input type="checkbox" data-transfer-check="${key}" value="${h(it.id)}" ${it.selectable===false?'disabled':transferDialog.selection[key].has(it.id) ? 'checked' : ''}>${t('選取', 'Chọn')}</label>
        <code>${h(it.code)}</code><span class="name" data-i18n-skip="true">${h(it.name)}</span>${it.scopeKey?`<small>${h(it.scopeKey)}</small>`:''}
        <small>${t('生效', 'Hiệu lực')}: ${h(it.activeEquipmentId || '—')} · ${t('草稿', 'Bản nháp')}: ${h(it.draftEquipmentId || '—')} · ${h(it.openStatus || '—')}</small>
        ${it.selectable===false?`<small role="status">${h(t(it.unavailableReason || '目前不可編輯',['pending','pending-test'].includes(it.openStatus)?'Phạm vi đang chờ duyệt; hãy chọn lại sau khi kết thúc.':it.unavailableReason?.includes('V3')?'Phạm vi dùng bản nháp chung V3; hãy chọn thiết bị trong bản nháp chung.':'Không có quyền sửa bản nháp của mô-đun đích.'))}</small>`:''}
        ${it.draftEquipmentId && it.draftEquipmentId !== sourceId && it.draftEquipmentId !== targetEqId ?
          `<small class="routine-transfer-warning">${t('草稿已改選其他設備；確認移轉時會提示取代。', 'Bản nháp đã chọn thiết bị khác; xác nhận chuyển sẽ thông báo ghi đè.')}</small>` : ''}
        ${(it.pending || []).map(row => `<small>${t('歷史待處理紀錄（不自動套用）', 'Yêu cầu lịch sử (không tự áp dụng)')}: ${h(row.reason)} · ${h(row.pendingVersionId)}</small>`).join('')}
      </div>`;

    const sourcePhoto = photo(sourceEq);
    const targetPhoto = targetEq ? photo(targetEq) : '';

    return `
      <div class="routine-dialog-backdrop" id="routine-transfer-backdrop">
        <div class="routine-view-dialog routine-transfer-dialog" role="dialog" aria-modal="true" aria-label="${t('設備替換與標準批次移轉', 'Thay thế thiết bị & Chuyển tiêu chuẩn')}">
          <div class="routine-dialog-head">
            <h3>${t('設備替換／標準批次移轉', 'Thay thế thiết bị & Chuyển tiêu chuẩn')}</h3>
            <button type="button" id="routine-transfer-close" style="border:none;background:transparent;font-size:1.2rem;cursor:pointer">✕</button>
          </div>
          <div class="routine-view-body routine-transfer-body">
            ${transferDialog.previewError ? `<p role="alert">${h(transferDialog.previewError)}</p>` : ''}
            ${!transferDialog.preview ? `<p>${t('載入生效與草稿差異中…', 'Đang tải khác biệt phiên bản…')}</p>` : ''}
            <!-- 1. 原設備 vs 目標設備 對照卡片 -->
            <div class="routine-transfer-compare-grid">
              <div class="routine-transfer-box source">
                <h4>${t('原檢具設備（來源）', 'Thiết bị gốc (Nguồn)')}</h4>
                <div class="routine-transfer-eq-card">
                  <div class="routine-transfer-thumb">
                    ${sourcePhoto ? `<img src="${h(sourcePhoto)}" alt="">` : '<span>◇</span>'}
                  </div>
                  <div class="routine-transfer-meta">
                    <b>${h(sourceEq.assetCode)}／${h(sourceEq.pieceMark)}</b>
                    <span data-i18n-skip="true">${h(displayName(sourceEq))}</span>
                    <small data-i18n-skip="true">${h(sourceEq.spec || '—')}</small>
                  </div>
                </div>
              </div>

              <div class="routine-transfer-arrow">➔</div>

              <div class="routine-transfer-box target">
                <h4>${t('替換目標設備（請選擇）', 'Thiết bị thay thế (Vui lòng chọn)')}</h4>
                <div class="routine-transfer-picker-controls">
                  <select id="routine-target-cat" class="routine-select">
                    <option value="">${t('全部類別', 'Tất cả nhóm')}</option>
                    ${tree.categories.map(c => `<option value="${h(c.id)}" ${transferDialog.targetCat === c.id ? 'selected' : ''}>${h(c.code)} · ${h(c.name)}</option>`).join('')}
                  </select>
                  <select id="routine-target-eq-select" class="routine-select">
                    <option value="">${t('請選擇目標設備…', 'Chọn thiết bị đích…')}</option>
                    ${availableTargets.map(e => `
                      <option value="${h(e.id)}" ${e.id === targetEqId ? 'selected' : ''} data-i18n-skip="true">
                        ${h(e.assetCode)}／${h(e.pieceMark)} · ${h(displayName(e))}
                      </option>
                    `).join('')}
                  </select>
                </div>
                ${targetEq ? `
                  <div class="routine-transfer-eq-card target-selected">
                    <div class="routine-transfer-thumb">
                      ${targetPhoto ? `<img src="${h(targetPhoto)}" alt="">` : '<span>◇</span>'}
                    </div>
                    <div class="routine-transfer-meta">
                      <b>${h(targetEq.assetCode)}／${h(targetEq.pieceMark)}</b>
                      <span data-i18n-skip="true">${h(displayName(targetEq))}</span>
                      <small data-i18n-skip="true">${h(targetEq.spec || '—')}</small>
                    </div>
                  </div>
                ` : `<p class="routine-transfer-unselected-hint">${t('尚未選定替換目標設備', 'Chưa chọn thiết bị thay thế')}</p>`}
              </div>
            </div>

            <!-- 2. 逐模組確認移轉清單 -->
            <div class="routine-transfer-modules">
              <h4>${t('移轉標準清單（採逐模組確認保存）', 'Danh sách tiêu chuẩn (Lưu riêng từng module)')}</h4>

              <!-- FQC Module -->
              <div class="routine-transfer-module-card ${transferDialog.moduleStatus.fqc}">
                <div class="routine-transfer-module-head">
                  <div>
                    <b>FQC 最終品質檢驗</b>
                    <small>（${fqcItems.length} ${t('筆標準引用', 'mục tham chiếu')}）</small>
                  </div>
                  <div class="routine-transfer-module-action">
                    ${transferDialog.moduleStatus.fqc === 'success' ? `
                      <span class="routine-transfer-success-tag">✓ ${t('已成功移轉至草稿', 'Đã chuyển thành công')}</span>
                    ` : `
                      <button type="button" class="button signal master-small" id="routine-confirm-transfer-fqc" ${!targetEq || !fqcItems.length || transferDialog.moduleStatus.fqc === 'saving' ? 'disabled' : ''}>
                        ${transferDialog.moduleStatus.fqc === 'saving' ? t('儲存中…', 'Đang lưu...') : t('確認移轉至 FQC 草稿', 'Xác nhận chuyển sang FQC')}
                      </button>
                    `}
                  </div>
                </div>
                ${transferDialog.moduleMessages.fqc ? `<p class="routine-transfer-mod-msg">${h(transferDialog.moduleMessages.fqc)}</p>` : ''}
                ${fqcItems.length ? `
                  <div class="routine-transfer-item-table">
                    ${fqcItems.map(it => replacementRow(it, 'fqc')).join('')}
                  </div>
                ` : `<p class="routine-empty-hint">${t('無引用 FQC 標準', 'Không có tiêu chuẩn FQC tham chiếu')}</p>`}
              </div>

              <!-- IPQC-C Module -->
              <div class="routine-transfer-module-card ${transferDialog.moduleStatus.ipqcC}">
                <div class="routine-transfer-module-head">
                  <div>
                    <b>IPQC-C 製程品質檢驗</b>
                    <small>（${ipqcCItems.length} ${t('筆標準引用', 'mục tham chiếu')}）</small>
                  </div>
                  <div class="routine-transfer-module-action">
                    ${transferDialog.moduleStatus.ipqcC === 'success' ? `
                      <span class="routine-transfer-success-tag">✓ ${t('已成功移轉至草稿', 'Đã chuyển thành công')}</span>
                    ` : `
                      <button type="button" class="button signal master-small" id="routine-confirm-transfer-ipqc-c" ${!targetEq || !ipqcCItems.length || transferDialog.moduleStatus.ipqcC === 'saving' ? 'disabled' : ''}>
                        ${transferDialog.moduleStatus.ipqcC === 'saving' ? t('儲存中…', 'Đang lưu...') : t('確認移轉至 IPQC-C 草稿', 'Xác nhận chuyển sang IPQC-C')}
                      </button>
                    `}
                  </div>
                </div>
                ${transferDialog.moduleMessages.ipqcC ? `<p class="routine-transfer-mod-msg">${h(transferDialog.moduleMessages.ipqcC)}</p>` : ''}
                ${ipqcCItems.length ? `
                  <div class="routine-transfer-item-table">
                    ${ipqcCItems.map(it => replacementRow(it, 'ipqcC')).join('')}
                  </div>
                ` : `<p class="routine-empty-hint">${t('無引用 IPQC-C 標準', 'Không có tiêu chuẩn IPQC-C tham chiếu')}</p>`}
              </div>

              <!-- IQC Module -->
              <div class="routine-transfer-module-card ${transferDialog.moduleStatus.iqc}">
                <div class="routine-transfer-module-head">
                  <div>
                    <b>IQC 進料品質檢驗</b>
                    <small>（${iqcItems.length} ${t('筆標準引用', 'mục tham chiếu')}）</small>
                  </div>
                  <div class="routine-transfer-module-action">
                    ${transferDialog.moduleStatus.iqc === 'success' ? `
                      <span class="routine-transfer-success-tag">✓ ${t('已成功移轉至草稿', 'Đã chuyển thành công')}</span>
                    ` : `
                      <button type="button" class="button signal master-small" id="routine-confirm-transfer-iqc" ${!targetEq || !iqcItems.length || transferDialog.moduleStatus.iqc === 'saving' ? 'disabled' : ''}>
                        ${transferDialog.moduleStatus.iqc === 'saving' ? t('儲存中…', 'Đang lưu...') : t('確認移轉至 IQC 草稿', 'Xác nhận chuyển sang IQC')}
                      </button>
                    `}
                  </div>
                </div>
                ${transferDialog.moduleMessages.iqc ? `<p class="routine-transfer-mod-msg">${h(transferDialog.moduleMessages.iqc)}</p>` : ''}
                ${iqcItems.length ? `
                  <div class="routine-transfer-item-table">
                    ${iqcItems.map(it => replacementRow(it, 'iqc')).join('')}
                  </div>
                ` : `<p class="routine-empty-hint">${t('無引用 IQC 標準', 'Không có tiêu chuẩn IQC tham chiếu')}</p>`}
              </div>
              <div class="routine-transfer-module-card ${transferDialog.moduleStatus.ipqcAB}">
                <div class="routine-transfer-module-head"><div><b>IPQC-AB</b><small>（${ipqcABItems.length} ${t('筆標準引用','mục tham chiếu')}）</small></div>
                  <button type="button" class="button signal master-small" id="routine-confirm-transfer-ipqc-ab" ${!targetEq||!ipqcABItems.length||transferDialog.moduleStatus.ipqcAB==='saving'?'disabled':''}>${transferDialog.moduleStatus.ipqcAB==='saving'?t('儲存中…','Đang lưu...'):t('確認移轉至 IPQC-AB 草稿','Xác nhận chuyển sang IPQC-AB')}</button></div>
                ${transferDialog.moduleMessages.ipqcAB?`<p class="routine-transfer-mod-msg">${h(transferDialog.moduleMessages.ipqcAB)}</p>`:''}
                ${ipqcABItems.length?`<div class="routine-transfer-item-table">${ipqcABItems.map(it=>replacementRow(it,'ipqcAB')).join('')}</div>`:`<p class="routine-empty-hint">${t('無引用 IPQC-AB 標準','Không có tiêu chuẩn IPQC-AB tham chiếu')}</p>`}
              </div>
            </div>
          </div>

          <div class="routine-dialog-foot">
            <button type="button" class="button ghost" id="routine-transfer-dismiss">
              ${Object.values(transferDialog.moduleStatus).some(s => s === 'success') ? t('完成並關閉', 'Hoàn tất và đóng') : t('取消', 'Hủy')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function viewDialogHTML() {
    if (!viewDialog) return '';
    const { kind, data } = viewDialog;
    const tree = structure(visible());
    const rows = visible()?.equipment || [];

    let title = '';
    let imgSrc = '';
    let content = '';

    if (kind === 'category') {
      title = `${t('類別資訊', 'Thông tin nhóm')} · ${data.code} ${data.name}`;
      imgSrc = pendingPhotos.get(data.id)?.url || (data.photoId ? `${api}/photo?id=${data.photoId}` : '') || photo(rows.find(e => e.categoryCode === data.code));
      const subCount = tree.subcategories.filter(s => s.categoryId === data.id).length;
      const grpCount = tree.groups.filter(g => g.categoryId === data.id).length;
      const eqCount = rows.filter(e => e.categoryId === data.id || e.categoryCode === data.code).length;
      content = `
        <div class="routine-view-row"><b>${t('類別編號', 'Mã nhóm')}</b><span>${h(data.code)}</span></div>
        <div class="routine-view-row"><b>${t('類別名稱', 'Tên nhóm')}</b><span>${h(data.name)}</span></div>
        <div class="routine-view-row"><b>${t('子類別數量', 'Số phân nhóm')}</b><span>${subCount} ${t('個', 'mục')}</span></div>
        <div class="routine-view-row"><b>${t('規格群組數量', 'Số nhóm quy cách')}</b><span>${grpCount} ${t('個', 'mục')}</span></div>
        <div class="routine-view-row full"><b>${t('所屬檢具總數', 'Tổng thiết bị')}</b><span>${eqCount} ${t('件', 'thiết bị')}</span></div>
      `;
    } else if (kind === 'subcategory') {
      title = `${t('子類別資訊', 'Thông tin phân nhóm')} · ${data.name}`;
      const parentCat = tree.categories.find(c => c.id === data.categoryId);
      imgSrc = pendingPhotos.get(data.id)?.url || (data.photoId ? `${api}/photo?id=${data.photoId}` : '') || photo(rows.find(e => e.subcategoryId === data.id));
      const grpCount = tree.groups.filter(g => g.subcategoryId === data.id).length;
      const eqCount = rows.filter(e => e.subcategoryId === data.id).length;
      content = `
        <div class="routine-view-row"><b>${t('上層類別', 'Nhóm cha')}</b><span>${h(parentCat ? `${parentCat.code} · ${parentCat.name}` : '—')}</span></div>
        <div class="routine-view-row"><b>${t('子類別名稱', 'Tên phân nhóm')}</b><span>${h(data.name)}</span></div>
        <div class="routine-view-row"><b>${t('規格群組數量', 'Số nhóm quy cách')}</b><span>${grpCount} ${t('個', 'mục')}</span></div>
        <div class="routine-view-row"><b>${t('所屬檢具總數', 'Tổng thiết bị')}</b><span>${eqCount} ${t('件', 'thiết bị')}</span></div>
      `;
    } else if (kind === 'group') {
      title = `${t('規格群組資訊', 'Thông tin nhóm quy cách')} · ${data.name || data.id}`;
      const parentCat = tree.categories.find(c => c.id === data.categoryId);
      const parentSub = tree.subcategories.find(s => s.id === data.subcategoryId);
      imgSrc = pendingPhotos.get(data.id)?.url || (data.photoId ? `${api}/photo?id=${data.photoId}` : '') || photo(rows.find(e => e.groupId === data.id));
      const eqCount = rows.filter(e => e.groupId === data.id).length;
      content = `
        <div class="routine-view-row"><b>${t('群組編號', 'Mã nhóm')}</b><span>${h(data.id)}</span></div>
        <div class="routine-view-row"><b>${t('群組名稱', 'Tên nhóm quy cách')}</b><span>${h(groupLabel(data) || '—')}</span></div>
        <div class="routine-view-row"><b>${t('上層類別', 'Nhóm cha')}</b><span>${h(parentCat ? `${parentCat.code} · ${parentCat.name}` : '—')}</span></div>
        <div class="routine-view-row"><b>${t('上層子類別', 'Phân nhóm')}</b><span>${h(parentSub ? parentSub.name : '—')}</span></div>
        <div class="routine-view-row full"><b>${t('規格／能力說明', 'Quy cách / Năng lực')}</b><span>${h(data.spec || '—')}</span></div>
        <div class="routine-view-row full"><b>${t('所屬檢具總數', 'Tổng thiết bị')}</b><span>${eqCount} ${t('件', 'thiết bị')}</span></div>
      `;
    } else if (kind === 'equipment') {
      title = `${t('檢具詳細資訊', 'Chi tiết thiết bị')} · ${data.assetCode}／${data.pieceMark}`;
      const parentCat = tree.categories.find(c => c.id === data.categoryId) || tree.categories.find(c => c.code === data.categoryCode);
      const parentSub = tree.subcategories.find(s => s.id === data.subcategoryId);
      const parentGrp = tree.groups.find(g => g.id === data.groupId);
      imgSrc = photo(data);
      const method = methodCode(data.calibrationMethod);
      const methodStr = methodLabels[method] ? label(methodLabels[method]) : (data.calibrationMethod || '—');
      const cycleStr = data.calibrationCycle === 'custom' ? `${t('自訂：', 'Tùy chỉnh: ')}${data.customCycle || '—'}` : (cycleLabels[data.calibrationCycle] ? label(cycleLabels[data.calibrationCycle]) : (data.calibrationCycle || '—'));
      content = `
        <div class="routine-view-row"><b>${t('固定資產編號', 'Mã TSCĐ')}</b><span>${h(data.assetCode)}</span></div>
        <div class="routine-view-row"><b>${t('個別設備標記（分件號）', 'Ký hiệu thiết bị')}</b><span>${h(data.pieceMark)}</span></div>
        <div class="routine-view-row"><b>${t('檢具名稱', 'Tên thiết bị')}</b><span>${h(displayName(data) || '—')}</span></div>
        <div class="routine-view-row"><b>${t('設備狀態', 'Trạng thái')}</b><span>${data.enabled ? t('啟用', 'Đang dùng') : t('未啟用', 'Chưa kích hoạt')}</span></div>
        <div class="routine-view-row"><b>${t('所屬類別', 'Nhóm cha')}</b><span>${h(parentCat ? `${parentCat.code} · ${parentCat.name}` : data.category || '—')}</span></div>
        <div class="routine-view-row"><b>${t('所屬子類別', 'Phân nhóm')}</b><span>${h(parentSub ? parentSub.name : data.subcategory || '—')}</span></div>
        <div class="routine-view-row full"><b>${t('所屬規格群組', 'Nhóm quy cách')}</b><span>${h(parentGrp ? `${parentGrp.id} · ${groupLabel(parentGrp)}` : data.groupId || '—')}</span></div>
        <div class="routine-view-row"><b>${t('數量與單位', 'Số lượng và đơn vị')}</b><span>${h(data.quantity || 1)} ${h(data.unit || '個')}</span></div>
        <div class="routine-view-row"><b>${t('保管人／部門', 'Người giữ / Bộ phận')}</b><span>${h(data.owner || '—')}</span></div>
        <div class="routine-view-row"><b>${t('資料核對狀態', 'Đối soát')}</b><span>${data.confirmed ? t('已核對', 'Đã đối soát') : t('待確認', 'Chờ xác nhận')}</span></div>
        <div class="routine-view-row"><b>${t('校正方式', 'Phương thức hiệu chuẩn')}</b><span>${h(methodStr)}</span></div>
        ${method !== 'none' ? `
          <div class="routine-view-row"><b>${t('校正週期', 'Chu kỳ')}</b><span>${h(cycleStr)}</span></div>
          <div class="routine-view-row"><b>${t('最近校正日期', 'Ngày hiệu chuẩn')}</b><span>${h(data.calibratedAt || '—')}</span></div>
          <div class="routine-view-row"><b>${t('校正有效期限', 'Hạn hiệu chuẩn')}</b><span>${h(data.expiresAt || '—')}</span></div>
        ` : ''}
        <div class="routine-view-row"><b>${t('入庫日期', 'Ngày nhập kho')}</b><span>${h(data.intakeDate || '—')}</span></div>
        <div class="routine-view-row full"><b>${t('規格／常用檢測用途', 'Quy cách / Mục đích')}</b><span>${h(data.spec || '—')}</span></div>
        <div class="routine-view-row full routine-view-refs-row">${equipmentReferencesSectionHTML(data.id, 'view')}</div>
        <div class="routine-view-row full"><b>${t('備註', 'Ghi chú')}</b><span>${h(data.notes || '—')}</span></div>
        ${data.sourceRow ? `
          <div class="routine-view-row full" style="border-top:1px dashed #d5e2d9;padding-top:6px;margin-top:6px">
            <b>${t('來源對照資訊', 'Thông tin đối chiếu nguồn')}</b>
            <small style="color:#52695d">${t('來源列：', 'Dòng nguồn: ')}${h(data.sourceRow)}　${t('來源對照：', 'Đối chiếu: ')}${h(data.sourceReference || '—')}　${t('來源標準：', 'Tiêu chuẩn: ')}${h(data.sourceStandardLinks || '—')}</small>
          </div>
        ` : ''}
      `;
    }

    return `
      <div class="routine-dialog-backdrop" id="routine-view-modal-backdrop">
        <div class="routine-view-dialog" role="dialog" aria-modal="true" aria-label="${h(title)}">
          <div class="routine-dialog-head">
            <h3>${h(title)}</h3>
            <button type="button" id="routine-view-close" style="border:none;background:transparent;font-size:1.2rem;cursor:pointer">✕</button>
          </div>
          <div class="routine-view-body">
            <div class="routine-view-photo">
              ${imgSrc ? `<img src="${h(imgSrc)}" alt="${h(title)}" loading="lazy">` : `<span class="routine-photo-empty">${t('尚無照片', 'Chưa có ảnh')}</span>`}
            </div>
            <div class="routine-view-grid">
              ${content}
            </div>
          </div>
          <div class="routine-dialog-foot">
            <button type="button" class="button ghost" id="routine-view-dismiss">${t('關閉', 'Đóng')}</button>
          </div>
        </div>
      </div>
    `;
  }

  function problemsCardHTML() {
    if (!submitProblems || submitProblems.length === 0) return '';
    return ['error','missing','warning'].map(kind=>{
    const problems=submitProblems.filter(p=>(p.kind||(p.id&&p.field?'missing':'error'))===kind);
    if(!problems.length)return '';
    const title=kind==='missing'?t('待補','Cần bổ sung'):kind==='warning'?t('提醒','Lưu ý'):t('報錯','Lỗi');
    return `
      <details class="routine-card routine-errors-card" data-routine-issue-kind="${kind}" data-vd-source="${problemSnapshot?'snapshot':'working'}" ${openErrors ? 'open' : ''} id="routine-${kind==='error'?'errors':kind}-details">
        <summary>
          <span class="routine-errors-summary">
            <span class="routine-alert-icon">⚠️</span>
            <b>${title} · ${problems.length} ${t('項待處理', 'mục cần xử lý')}</b>
          </span>
        </summary>
        <div class="routine-errors-banner">
          <p>${problemSnapshot?h(t('驗證對象：送審快照 ','Đối tượng kiểm tra: bản gửi duyệt ')+problemSnapshot.id+' · '+t('工作內容的補填不會更新此快照，請手動儲存後重新送審。','Sửa nội dung đang làm không cập nhật bản này; hãy lưu thủ công rồi gửi lại.')):t('請依建議核對及修正。','Vui lòng kiểm tra và sửa theo gợi ý.')}</p>
        </div>
        <div class="routine-errors-list">
          ${problems.map(p => {
            const eq = p.id ? (visible()?.equipment || []).find(e => e.id === p.id) : null;
            const itemTitle = eq ? details(eq) : (p.itemTitle || (p.id ? `ID: ${p.id}` : t('系統提示', 'Thông báo hệ thống')));
            let advice = p.advice || '';
            if (!advice) {
              if(p.message==='EQUIPMENT_STILL_REFERENCED')advice=t('請恢復啟用，或依既有審核流程先處理正式標準引用。','Hãy khôi phục trạng thái sử dụng hoặc xử lý liên kết tiêu chuẩn chính thức theo quy trình duyệt hiện có.');
              else if (p.field === 'calibratedAt' || String(p.message).includes('校正日期')) advice = t('請在編輯表單填寫有效之最近校正日期（YYYY-MM-DD）。', 'Vui lòng nhập ngày hiệu chuẩn gần nhất hợp lệ (YYYY-MM-DD).');
              else if (p.field === 'expiresAt' || String(p.message).includes('期限')) advice = t('請填寫有效之校正有效期限（YYYY-MM-DD），且不可早於校正日期。', 'Vui lòng nhập hạn hiệu chuẩn hợp lệ (YYYY-MM-DD) và không được trước ngày hiệu chuẩn.');
              else if (p.field === 'calibrationCycle' || String(p.message).includes('週期')) advice = t('請選擇校正週期，或如不需校正請改選「不校正」。', 'Vui lòng chọn chu kỳ hoặc chuyển sang "Không hiệu chuẩn".');
              else if (p.field === 'name' || String(p.message).includes('名稱')) advice = t('請輸入完整之檢具名稱與所屬群組。', 'Vui lòng nhập tên thiết bị và nhóm quy cách.');
              else if (p.field === 'calibrationMethod' || String(p.message).includes('雙軌')) advice = t('舊雙軌校正需在編輯表單中改選「不校正」、「內部校正」或「外部校正」。', 'Hai luồng cũ cần chọn lại không hiệu chuẩn, nội bộ hoặc bên ngoài.');
              else advice = t('請點選右側「前往修正」修改欄位內容後再送審。', 'Vui lòng nhấn "Đến sửa" để cập nhật thông tin.');
            }
            const canFix = editable() && eq;
            const isLocked = !editable() && p.id;
            return `
              <div class="routine-error-item">
                <div class="routine-error-item-info">
                  <b>${h(itemTitle)}</b>
                  <p>${h(problemMessage(p))}</p>
                  <small>${kind==='warning'?t('僅提醒，不阻擋送審','Chỉ nhắc nhở, không chặn gửi duyệt'):t('阻擋送審','Chặn gửi duyệt')}</small>
                  <small style="color:#206a4e">💡 ${t('修正建議：', 'Gợi ý sửa: ')}${h(advice)}</small>
                  ${p.requestId?`<small>${t('查詢編號：','Mã tra cứu: ')}${h(p.requestId)}</small>`:''}
                </div>
                ${canFix ? `
                  <button type="button" class="routine-error-action" data-fix-equipment="${h(p.id)}" data-fix-field="${h(p.field || '')}">
                    ${t('前往修正', 'Đến sửa')}
                  </button>
                ` : isLocked ? `
                  <span class="routine-error-locked">${t('草稿鎖定中（審核中或已核准）', 'Bản nháp đang khóa')}</span>
                ` : p.retryAction ? `
                  <button type="button" class="routine-error-action routine-retry-action" data-retry-action="${h(p.retryAction)}">
                    ${t('重試', 'Thử lại')}
                  </button>
                ` : `
                  <span style="color:#6b7280;font-size:.82rem">${t('請依上述說明操作', 'Vui lòng thực hiện theo hướng dẫn')}</span>
                `}
              </div>
            `;
          }).join('')}
        </div>
      </details>
    `;
    }).join('');
  }

  function bindList() {
    host.querySelectorAll('[data-equipment-page]').forEach(button => button.onclick = () => { equipmentPage += button.dataset.equipmentPage === 'next' ? 1 : -1; renderEquipmentResults(); });
    host.querySelectorAll('[data-equipment-select]').forEach(button => button.onclick = () => {
      selectedEquipmentId = button.dataset.equipmentSelect;
      render();
    });
    host.querySelectorAll('[data-equipment-view]').forEach(button => button.onclick = async event => {
      event.stopPropagation();
      const id = button.dataset.equipmentView;
      const item = (visible()?.equipment || []).find(e => e.id === id);
      if (item) {
        equipmentEditRequest++;
        await loadEquipmentReferences(id, { renderAfter: false });
        viewDialog = { kind: 'equipment', data: item };
        render();
      }
    });
    host.querySelectorAll('[data-equipment-edit]').forEach(button => button.onclick = async event => {
      event.stopPropagation();
      await openEditEquipment(button.dataset.equipmentEdit);
    });
    host.querySelectorAll('[data-equipment-delete]').forEach(button => button.onclick = event => {
      event.stopPropagation();
      deleteEquipment(button.dataset.equipmentDelete).catch(failed);
    });
    host.querySelectorAll('[data-equipment-transfer]').forEach(button => button.onclick = event => {
      event.stopPropagation();
      openTransferModal(button.dataset.equipmentTransfer);
    });
    host.querySelector('#routine-add')?.addEventListener('click', openAddEquipmentDialog);
  }

  function routineTabIsActive() {
    const content = document.querySelector('#data-content');
    return host === content && content?.isConnected && content.dataset.activeTab === 'quality-routine-equipment';
  }

  function render() {
    if (!routineTabIsActive()) return;
    if (!control || controlActor!==identity()?.id) {
      const loadError = message;
      host.innerHTML = `<section class="routine-page" data-i18n-skip="true">
        <div class="routine-card">
          <p>${h(loadError ? displayDraftError(loadError) : t('正在載入檢具資料…', 'Đang tải dữ liệu thiết bị…'))}</p>
          ${loadError ? `<button type="button" class="button signal" id="routine-load-retry">${t('重新載入', 'Tải lại')}</button>` : ''}
        </div>
      </section>`;
      host.querySelector('#routine-load-retry')?.addEventListener('click', async () => {
        message = '';
        render();
        try { await read(); render(); } catch (error) { message = error.message; render(); }
      });
      return;
    }
    captureAddEquipmentInput();
    const version = selected(), data = visible();
    if(problemSnapshot&&(problemSnapshot.generation!==control.workflow?.generation||problemSnapshot.kind==='saved'&&problemSnapshot.id!==control.workflow?.saved?.id)){
      submitProblems=[];problemSnapshot=null;openErrors=false;
      message=t('共用快照已變更，先前驗證結果已失效；請重新送審驗證。','Bản chụp chung đã thay đổi; kết quả kiểm tra trước không còn áp dụng. Hãy gửi lại để kiểm tra.');
    }
    const rows = data?.equipment || [], tree = structure(data);
    if (selectedCategory && !tree.categories.some(item => item.id === selectedCategory)) selectedCategory = '';
    if (selectedSubcategory && !tree.subcategories.some(item => item.id === selectedSubcategory && item.categoryId === selectedCategory)) selectedSubcategory = '';
    if (selectedGroup && !tree.groups.some(item => item.id === selectedGroup && item.subcategoryId === selectedSubcategory)) selectedGroup = '';
    const editingItem = editingEquipmentId ? rows.find(record => record.id === editingEquipmentId) : null;
    if (editingEquipmentId && !editingItem) { editingEquipmentId = ''; formSnapshot = null; }
    const canEdit = editable();
    const changes = version?.history || [];

    host.innerHTML = `<section class="routine-page" id="routine-page" data-i18n-skip="true">
      <div class="routine-top">
        <div>
          <p class="eyebrow">QUALITY DATABASE / ROUTINE</p>
          <h2>${t('檢具與測試設備管理', 'Quản lý Dưỡng kiểm và Thiết bị đo')}</h2>
          <p>${t('類別 → 子類別 → 規格群組 → 檢具。來源原文、Excel 列與照片對照均保留。', 'Nhóm → Phân nhóm → Nhóm quy cách → Thiết bị. Giữ nguyên nguồn, dòng Excel và ảnh.')}</p>
        </div>
        <span class="routine-count">${rows.length} ${t('筆設備', 'thiết bị')}</span>
      </div>

      ${message ? `<div class="routine-message" role="${readUnavailable?'alert':'status'}">${h(displayDraftError(message))}</div>` : ''}
      ${readUnavailable?`<button type="button" class="button signal" id="routine-load-retry">${t('重新載入並保留輸入','Tải lại và giữ dữ liệu đang nhập')}</button>`:''}

      ${!version ? `<section class="routine-card">
        <h3>${t('尚未匯入來源', 'Chưa nhập nguồn')}</h3>
        <p>${t('原始 Excel 的 119 筆設備、119 張對應照片及 37 筆待確認事項會建立為未核准草稿；不影響現有生效版。', '119 thiết bị, 119 ảnh và 37 mục chờ đối soát sẽ được tạo thành bản nháp; không ảnh hưởng bản hiệu lực.')}</p>
        ${permitted('master.import') ? `<button class="button signal" id="routine-import" ${busy ? 'disabled' : ''}>${t('匯入來源 Excel（待確認草稿）', 'Nhập Excel nguồn (Bản nháp)')}</button>` : `<p>${t('目前帳號沒有匯入權限。', 'Tài khoản không có quyền nhập.')}</p>`}
      </section>` : `
      <!-- 1. 設備資料版本／草稿 -->
      <section class="routine-card routine-version">
        <div>
          <small>${t('設備資料版本', 'Phiên bản dữ liệu')}</small>
          <h3>V${version.number} <span class="routine-status">${h(status(version.status))}</span></h3>
          <p>${t('目前生效：', 'Hiệu lực hiện tại: ')}${active() ? `V${active().number}` : t('尚無生效版本', 'Chưa có bản hiệu lực')} · ${t('最後編輯', 'Người sửa cuối')} ${h(lastEdit(version)?.actorName || version.creatorName)} · ${h(date(lastEdit(version)?.at || version.createdAt))}</p>
          <p>${t('送審者', 'Người gửi')} ${h(version.submittedBy || '—')} · ${h(date(version.submittedAt))}；${t('審核者', 'Người duyệt')} ${h(version.reviewedBy || '—')} · ${h(date(version.reviewedAt))}；${t('意見', 'Ý kiến')} ${h(version.reviewComment || '—')}</p>
        </div>
        <div class="routine-version-actions">
          <label>${t('查看版本／草稿', 'Xem phiên bản / bản nháp')}<select id="routine-version-select">${[...control.versions].reverse().map(record => `<option value="${h(record.id)}" ${record.id === version.id ? 'selected' : ''}>V${record.number} · ${h(status(record.status))} · ${h(lastEdit(record)?.actorName || record.creatorName)} · ${h(date(lastEdit(record)?.at || record.createdAt))}</option>`).join('')}</select></label>
          ${!open() && active() && permitted('approval.submit') ? `<button class="button signal" id="routine-begin" ${busy ? 'disabled' : ''}>${t('開始修改', 'Bắt đầu sửa')}</button>` : ''}
          ${canEdit ? `<button class="button ghost" id="routine-save" ${busy ? 'disabled' : ''}>${t('儲存草稿', 'Lưu bản nháp')}</button><button class="button signal" id="routine-submit" ${busy ? 'disabled' : ''}>${t('送出審核', 'Gửi duyệt')}</button>` : ''}
          ${version.status === 'pending' && permitted('approval.withdraw') ? `<button class="button ghost" id="routine-withdraw" ${busy ? 'disabled' : ''}>${t('撤回送審', 'Rút hồ sơ')}</button>` : ''}
        </div>
      </section>

      <!-- 2. 問題提醒（有錯誤才顯示，無錯誤時隱藏） -->
      ${problemsCardHTML()}

      <!-- 3. 待補／來源待確認清單（獨立卡片） -->
      <details class="routine-card routine-issues-card"><summary>${t('來源待確認清單', 'Danh sách chờ đối soát nguồn')} · ${(data.issues || control.issues).filter(issue => issue.status !== 'resolved').length} ${t('筆未完成', 'mục chưa xong')}</summary>
        <div class="routine-issues">
          ${(data.issues || control.issues).map((issue, index) => `
            <div>
              <div class="routine-issue-head">
                <b data-i18n-skip="true">${h(issue.assetCode)}／${h(issue.pieceMark)} · ${h(issue.type)}</b>
                <button type="button" class="routine-issue-action" data-jump-asset="${h(issue.assetCode)}" data-jump-mark="${h(issue.pieceMark)}">${t('前往核對', 'Đến kiểm tra')}</button>
              </div>
              <p data-i18n-skip="true">${h(issue.detail)}</p>
              <small>${t('來源列', 'Dòng nguồn')} ${h(issue.sourceRow)} · ${h(issue.status === 'resolved' ? t('已處理', 'Đã xử lý') : t('待確認', 'Chờ xác nhận'))} · USER <span data-i18n-skip="true">${h(issue.resolvedById || '—')} / ${h(issue.resolvedBy || '—')}</span> · ${h(date(issue.resolvedAt))}</small>
              ${editable() ? `<label>${t('處理結果', 'Kết quả xử lý')}<input data-issue-result="${index}" data-i18n-skip="true" value="${h(issue.resolution || '')}" placeholder="${t('填寫核對依據與結果', 'Nhập căn cứ và kết quả')}"></label><button type="button" data-issue-resolve="${index}">${issue.status === 'resolved' ? t('改回待確認', 'Chuyển lại chờ xác nhận') : t('標記已處理', 'Đánh dấu đã xử lý')}</button>` : `<p data-i18n-skip="true">${h(issue.resolution || '')}</p>`}
            </div>
          `).join('')}
        </div>
      </details>

      <details class="routine-card routine-history-card"><summary>${t('歷史操作', 'Lịch sử thao tác')} · ${changes.length}</summary><div>${changes.slice().reverse().map(event=>`<p>${h(actionName(event.action))} · ${h(event.actorName)} · ${h(date(event.at))} ${h(event.comment||'')}</p>`).join('')||`<p>${t('尚無操作紀錄','Chưa có thao tác')}</p>`}</div></details>

      <!-- 4. 搜尋工具列 -->
      <div class="routine-toolbar">
        <label>${t('搜尋檢具', 'Tìm thiết bị')}<input id="routine-search" type="search" value="${h(search)}" placeholder="${t('資產編號、分件號、名稱、群組、規格、保管人', 'Mã TSCĐ, ký hiệu, tên, nhóm, quy cách, người giữ')}"></label>
      </div>

      <!-- 5. 分類層級 -->
      ${hierarchyHTML(data, rows)}

      <!-- 6. 檢具清單 -->
      ${equipmentListHTML(rows, data)}

      <!-- 彈窗與抽屜 -->
      ${form(editingItem)}
      ${addEquipmentDrawerHTML()}
      ${nodeDialogHTML()}
      ${viewDialogHTML()}
      ${transferDialogHTML()}
      `}</section>`;
    bind();
    host.querySelector('#routine-load-retry')?.addEventListener('click',async()=>{if(addingEquipment&&newEquipmentForm){await recoverAddEquipmentRead();return;}const preserveInput=isDirty()||pendingPhotos.size>0;try{await read(preserveInput);message=preserveInput?t('已載入最新版，未套用輸入仍保留；套用時重新核對來源。','Đã tải bản mới; giữ đầu vào chưa áp dụng, kiểm tra nguồn khi áp dụng.'):'';render();}catch(error){message=error.message;render();}});
    if(readUnavailable)host.querySelectorAll('#routine-save,#routine-submit,#routine-begin').forEach(button=>{button.disabled=true;});
    if(control.workflow){const flow=control.workflow,panel=document.createElement('section');panel.className='routine-card';panel.id='routine-shared-status';panel.setAttribute('role','status');panel.innerHTML=`<b>${t('共用範圍：檢具全庫','Phạm vi chung: toàn bộ thiết bị')}</b><p>${flow.pendingId?t('待審鎖定','Khóa chờ duyệt'):!flow.saved||JSON.stringify(flow.saved.content)!==JSON.stringify(flow.working)?t('已同步 · 尚未手動儲存','Đã đồng bộ · chưa lưu thủ công'):t('已儲存','Đã lưu')}</p>${flow.saved?`<p>${t('儲存者','Người lưu')}: ${h(flow.saved.actor.name)} · ${h(flow.saved.at)}</p>`:''}`;host.querySelector('#routine-page')?.prepend(panel);
      if(permitted('approval.compare')){const b=document.createElement('button');b.id='routine-case-history';b.className='button ghost';b.textContent=t('送審案件','Hồ sơ gửi duyệt');b.onclick=()=>window.openSharedDraftHistory({client:sharedTransport(),editable:()=>open()?.status==='draft'&&permitted('approval.submit'),onApplied:async()=>{await read();render();}}).catch(failed);panel.append(b);}
      if(sharedClient?.hasUnknown())for(const [label,method]of [[t('查詢上次操作','Kiểm tra thao tác trước'),'resolveUnknown'],[t('重試同一操作','Thử lại cùng thao tác'),'retryUnknown']]){const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{try{await sharedTransport()[method]();await read();render();}catch(e){failed(e);}};panel.append(b);}
    }
    sharedClient?.gatePermissions?.();
    if(readUnavailable)showEquipmentReadRecovery(message);
    window.VersionDraftUI?.mount(host,{header:'.routine-version',historyClient:sharedTransport,module:t('檢具與測試設備','Dưỡng kiểm và thiết bị đo'),scope:t('檢具全庫','Toàn bộ thiết bị'),version,versions:control.versions,active:active(),flow:control.workflow,busy,failed:readUnavailable||sharedClient?.hasUnknown(),actions:{begin:'#routine-begin',save:'#routine-save',submit:'#routine-submit',withdraw:'#routine-withdraw'},review:()=>{state.view='approval';state.approvalTab='quality';window.render();},errors:'[data-routine-issue-kind="error"]',missing:'.routine-issues-card,[data-routine-issue-kind="missing"]',history:['.routine-history-card','#routine-case-history','[data-routine-issue-kind="warning"]'],status:['#routine-shared-status'],remove:['.routine-top']});
  }

  function bind() {
    const root = host;
    root.querySelector('#routine-import')?.addEventListener('click', importSource);
    root.querySelector('#routine-begin')?.addEventListener('click', () => write('begin'));
    root.querySelector('#routine-save')?.addEventListener('click', () => saveDraft('save'));
    root.querySelector('#routine-submit')?.addEventListener('click', () => { void saveDraft('submit'); });
    root.querySelector('#routine-withdraw')?.addEventListener('click', () => write('withdraw'));

    root.querySelector('#routine-version-select')?.addEventListener('change', event => {
      if (editable() && isDirty() &&
          !confirm(t('尚有未儲存的草稿修改；確定切換版本？', 'Còn thay đổi chưa lưu; bạn có chắc muốn chuyển phiên bản?'))) { event.target.value = selected().id; return; }
      equipmentEditRequest++;
      selectedVersionId = event.target.value;
      working = selected().status === 'draft' ? snapshotOf(selected()) : null;
      selectedEquipmentId = '';
      editingEquipmentId = '';
      formSnapshot = null;
      submitProblems = [];
      problemSnapshot = null;
      openErrors = false;
      render();
    });

    const searchInput = root.querySelector('#routine-search');
    searchInput?.addEventListener('compositionstart', () => { composing = true; });
    searchInput?.addEventListener('compositionend', event => { composing = false; search = event.target.value; equipmentPage = 1; renderEquipmentResults(); });
    searchInput?.addEventListener('input', event => { search = event.target.value; if (!composing) { equipmentPage = 1; renderEquipmentResults(); } });
    bindList();

    root.querySelectorAll('[data-node-select]').forEach(button => button.onclick = () => {
      equipmentEditRequest++;
      const id = button.dataset.id;
      if (button.dataset.nodeSelect === 'category') { selectedCategory = id; selectedSubcategory = ''; selectedGroup = ''; }
      if (button.dataset.nodeSelect === 'subcategory') {
        selectedSubcategory = id;
        const groupsUnderSub = structure(visible()).groups.filter(g => g.subcategoryId === id);
        selectedGroup = groupsUnderSub.length === 1 ? groupsUnderSub[0].id : '';
      }
      if (button.dataset.nodeSelect === 'group') selectedGroup = id;
      editingEquipmentId = '';
      selectedEquipmentId = '';
      addingEquipment = false;
      newEquipmentForm = null;
      formSnapshot = null;
      equipmentPage = 1; render();
    });
    root.querySelectorAll('[data-node-view]').forEach(button => button.onclick = event => {
      event.stopPropagation();
      const kind = button.dataset.nodeView;
      const id = button.dataset.id;
      const collection = kind === 'category' ? structure(visible()).categories :
                         kind === 'subcategory' ? structure(visible()).subcategories :
                         structure(visible()).groups;
      const item = collection.find(c => c.id === id);
      if (item) {
        equipmentEditRequest++;
        viewDialog = { kind, data: item };
        render();
      }
    });
    root.querySelectorAll('[data-node-add]').forEach(button => button.onclick = () => openNodeDialog(button.dataset.nodeAdd));
    root.querySelectorAll('[data-node-edit]').forEach(button => button.onclick = event => { event.stopPropagation(); openNodeDialog(button.dataset.nodeEdit, button.dataset.id); });
    root.querySelectorAll('[data-node-delete]').forEach(button => button.onclick = event => { event.stopPropagation(); deleteNode(button.dataset.nodeDelete, button.dataset.id).catch(failed); });

    // Node dialog bindings
    root.querySelector('#routine-dialog-close')?.addEventListener('click', cancelNodeDialog);
    root.querySelector('#routine-dialog-cancel')?.addEventListener('click', cancelNodeDialog);
    root.querySelector('#routine-dialog-confirm')?.addEventListener('click', confirmNodeDialog);
    root.querySelector('#routine-node-dialog-backdrop')?.addEventListener('click', event => {
      if (event.target?.id === 'routine-node-dialog-backdrop') cancelNodeDialog();
    });
    root.querySelector('#routine-dialog-photo-input')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 5_000_000) { alert(t('照片限 5 MB', 'Ảnh giới hạn 5 MB')); return; }
      nodeDialog.name = root.querySelector('#routine-dialog-name')?.value || '';
      if (nodeDialog.kind === 'group') nodeDialog.spec = root.querySelector('#routine-dialog-spec')?.value || '';
      if (nodeDialog.pendingPhoto) URL.revokeObjectURL(nodeDialog.pendingPhoto.url);
      nodeDialog.pendingPhoto = { file, url: URL.createObjectURL(file) };
      nodeDialog.photoRemoved = false;
      render();
    });
    root.querySelector('#routine-dialog-photo-remove')?.addEventListener('click', () => {
      nodeDialog.name = root.querySelector('#routine-dialog-name')?.value || '';
      if (nodeDialog.kind === 'group') nodeDialog.spec = root.querySelector('#routine-dialog-spec')?.value || '';
      if (nodeDialog.pendingPhoto) URL.revokeObjectURL(nodeDialog.pendingPhoto.url);
      nodeDialog.pendingPhoto = null;
      nodeDialog.photoId = '';
      nodeDialog.photoRemoved = true;
      render();
    });

    // View dialog bindings
    root.querySelector('#routine-view-close')?.addEventListener('click', () => { viewDialog = null; render(); });
    root.querySelector('#routine-view-dismiss')?.addEventListener('click', () => { viewDialog = null; render(); });
    root.querySelector('#routine-view-modal-backdrop')?.addEventListener('click', event => {
      if (event.target?.id === 'routine-view-modal-backdrop') { viewDialog = null; render(); }
    });

    // Transfer dialog bindings
    root.querySelector('#routine-transfer-close')?.addEventListener('click', () => { transferDialog = null; render(); });
    root.querySelector('#routine-transfer-dismiss')?.addEventListener('click', () => { transferDialog = null; render(); });
    root.querySelector('#routine-transfer-backdrop')?.addEventListener('click', event => {
      if (event.target?.id === 'routine-transfer-backdrop') { transferDialog = null; render(); }
    });

    root.querySelector('#routine-target-cat')?.addEventListener('change', event => {
      if (!transferDialog) return;
      transferDialog.targetCat = event.target.value;
      transferDialog.targetEqId = '';
      render();
    });

    root.querySelector('#routine-target-eq-select')?.addEventListener('change', event => {
      if (!transferDialog) return;
      transferDialog.targetEqId = event.target.value;
      render();
    });

    root.querySelectorAll('[data-transfer-check]').forEach(chk => {
      chk.onchange = () => {
        if (!transferDialog) return;
        const mod = chk.dataset.transferCheck;
        const id = chk.value;
        if (chk.checked) transferDialog.selection[mod]?.add(id);
        else transferDialog.selection[mod]?.delete(id);
      };
    });

    root.querySelector('#routine-confirm-transfer-fqc')?.addEventListener('click', () => executeTransfer('fqc'));
    root.querySelector('#routine-confirm-transfer-iqc')?.addEventListener('click', () => executeTransfer('iqc'));
    root.querySelector('#routine-confirm-transfer-ipqc-c')?.addEventListener('click', () => executeTransfer('ipqcC'));
    root.querySelector('#routine-confirm-transfer-ipqc-ab')?.addEventListener('click', () => executeTransfer('ipqcAB'));

    bindReferenceActions(root);

    root.querySelectorAll('[data-jump-asset]').forEach(btn => btn.onclick = () => {
      const asset = btn.dataset.jumpAsset, mark = btn.dataset.jumpMark;
      const target = (visible().equipment || []).find(e => e.assetCode === asset && e.pieceMark === mark) ||
                     (visible().equipment || []).find(e => e.assetCode === asset);
      if (target) {
        locateEquipment(target.id);
      } else {
        alert(t(`未找到對應設備 ${asset}／${mark}`, `Không tìm thấy thiết bị ${asset}／${mark}`));
      }
    });
    root.querySelectorAll('[data-fix-equipment]').forEach(button => button.onclick = () => locateEquipment(button.dataset.fixEquipment, button.dataset.fixField));
    root.querySelectorAll('[data-retry-action]').forEach(button => button.onclick = () => {
      const act = button.dataset.retryAction;
      if (act === 'submit' || act === 'save') {
        saveDraft(act).catch(failed);
      }
    });
    root.querySelectorAll('[data-issue-result]').forEach(input => input.oninput = () => { if (working?.issues?.[Number(input.dataset.issueResult)]) working.issues[Number(input.dataset.issueResult)].resolution = input.value; });
    root.querySelectorAll('[data-issue-result]').forEach(input=>input.onchange=async()=>{await writeShared('apply');});
    root.querySelectorAll('[data-issue-resolve]').forEach(button => button.onclick = async () => {
      const issue = working?.issues?.[Number(button.dataset.issueResolve)];
      if (!issue) return;
      if (issue.status !== 'resolved' && !String(issue.resolution || '').trim()) { alert(t('請先填寫處理結果與依據', 'Hãy nhập kết quả và căn cứ trước')); return; }
      issue.status = issue.status === 'resolved' ? 'pending' : 'resolved';
      await writeShared('apply');render();
    });

    // Form handlers
    const item = working?.equipment.find(record => record.id === editingEquipmentId);
    const closeForm = () => { equipmentEditRequest++; editingEquipmentId = ''; formSnapshot = null; render(); };
    const tryCloseForm = () => {
      if (formSnapshot && isFormDirty()) {
        if (!confirm(t('尚有未套用的修改，確定關閉？', 'Có thay đổi chưa áp dụng, bạn có chắc muốn đóng?'))) return;
        if (item && formSnapshot) Object.assign(item, formSnapshot);
      }
      if(control?.workflow&&open()?.status==='draft'){working=snapshotOf(open());syncBase=clone(working);syncGeneration=control.workflow.generation;}
      closeForm();
    };

    root.querySelector('#routine-close')?.addEventListener('click', tryCloseForm);
    root.querySelector('#routine-form-cancel')?.addEventListener('click', tryCloseForm);
    root.querySelector('#routine-backdrop')?.addEventListener('click', event => {
      if (event.target?.id === 'routine-backdrop') tryCloseForm();
    });
    root.querySelector('#routine-language-toggle')?.addEventListener('click', () => document.querySelector('.top-actions .language-switch')?.click());

    if (item) {
      const bindCalibrationInputs = () => {
        const calContainer = root.querySelector('#routine-edit-calibration-container');
        if (!calContainer) return;
        const cycleSelect = calContainer.querySelector('[data-select="calibrationCycle"]');
        if (cycleSelect) {
          cycleSelect.onchange = () => {
            item.calibrationCycle = cycleSelect.value;
            calContainer.innerHTML = renderEditCalibrationFields(item, editable());
            bindCalibrationInputs();
          };
        }
        calContainer.querySelectorAll('[data-field]').forEach(input => {
          input.oninput = () => { item[input.dataset.field] = input.value; };
        });
      };
      bindCalibrationInputs();

      root.querySelectorAll('#routine-editor [data-field]').forEach(input => {
        input.oninput = () => {
          item[input.dataset.field] = input.type === 'number' ? Number(input.value) : input.value;
        };
      });

      root.querySelectorAll('#routine-editor [data-select]').forEach(select => {
        select.onchange = () => {
          if (select.dataset.select === 'calibrationMethod') {
            item.calibrationMethod = select.value;
            const calContainer = root.querySelector('#routine-edit-calibration-container');
            if (calContainer) {
              calContainer.innerHTML = renderEditCalibrationFields(item, editable());
              bindCalibrationInputs();
            }
          } else {
            item[select.dataset.select] = ['enabled','confirmed'].includes(select.dataset.select) ? select.value === 'true' : select.value;
          }
        };
      });

      root.querySelector('#routine-edit-category')?.addEventListener('change', event => {
        item.categoryId = event.target.value;
        const cat = working.categories.find(value => value.id === item.categoryId);
        item.categoryCode = cat?.code || ''; item.category = cat?.name || '';
        if (!working.groups.some(g => g.categoryId === item.categoryId && g.id === item.groupId)) { item.groupId = ''; item.subcategoryId = ''; item.subcategory = ''; }
        render();
      });

      root.querySelector('#routine-edit-subcategory')?.addEventListener('change', event => {
        item.subcategoryId = event.target.value;
        item.subcategory = working.subcategories.find(value => value.id === item.subcategoryId)?.name || '';
        if (!working.groups.some(g => g.subcategoryId === item.subcategoryId && g.id === item.groupId)) item.groupId = '';
        render();
      });

      root.querySelector('#routine-edit-group')?.addEventListener('change', event => {
        const group = working.groups.find(value => value.id === event.target.value);
        if (group) { item.groupId = group.id; item.categoryId = group.categoryId; item.subcategoryId = group.subcategoryId;
          item.categoryCode = group.categoryCode; item.category = group.category; item.subcategory = group.subcategory; }
        render();
      });

      root.querySelector('#routine-photo-input')?.addEventListener('change', event => {
        const file = event.target.files?.[0]; if (!file) return;
        if (file.size > 5_000_000) { alert(t('照片限 5 MB', 'Ảnh giới hạn 5 MB')); return; }
        const prior = pendingPhotos.get(item.id); if (prior) URL.revokeObjectURL(prior.url);
        pendingPhotos.set(item.id, { file, url: URL.createObjectURL(file) });
        item.photoHidden = false;
        message = t('照片僅在本頁預覽；套用表單時才上傳及同步，儲存不包含未套用照片。', 'Ảnh chỉ được xem trước; tải lên và đồng bộ khi áp dụng biểu mẫu. Lưu không gồm ảnh chưa áp dụng.'); render();
      });
      root.querySelector('#routine-photo-remove')?.addEventListener('click', () => {
        if (!confirm(t('確定從目前草稿移除照片？舊版本照片不會刪除。', 'Xóa ảnh khỏi bản nháp hiện tại? Ảnh phiên bản cũ vẫn được giữ.'))) return;
        const pending = pendingPhotos.get(item.id); if (pending) URL.revokeObjectURL(pending.url);
        pendingPhotos.delete(item.id); item.photoId = ''; item.photoHidden = true;
        message = t('照片已從本頁草稿移除，尚未保存。', 'Ảnh đã xóa khỏi bản nháp trên trang, chưa lưu.'); render();
      });

      root.querySelector('#routine-form-apply')?.addEventListener('click', async () => {
        const nameInput = root.querySelector('#routine-editor [data-field="name"]');
        if (nameInput) item.name = nameInput.value.trim();
        const groupSelect = root.querySelector('#routine-edit-group');
        if (groupSelect && groupSelect.value) {
          item.groupId = groupSelect.value;
          const group = working.groups.find(g => g.id === item.groupId);
          if (group) {
            item.categoryId = group.categoryId;
            item.subcategoryId = group.subcategoryId;
            item.categoryCode = group.categoryCode;
            item.category = group.category;
            item.subcategory = group.subcategory;
          }
        }
        const unitSelect = root.querySelector('#routine-editor [data-select="unit"]');
        if (unitSelect) item.unit = unitSelect.value;
        const ownerInput = root.querySelector('#routine-editor [data-field="owner"]');
        if (ownerInput) item.owner = ownerInput.value.trim();
        const enabledSelect = root.querySelector('#routine-editor [data-select="enabled"]');
        if (enabledSelect) item.enabled = enabledSelect.value === 'true';
        const confirmedSelect = root.querySelector('#routine-editor [data-select="confirmed"]');
        if (confirmedSelect) item.confirmed = confirmedSelect.value === 'true';
        const methodSelect = root.querySelector('#routine-editor [data-select="calibrationMethod"]');
        if (methodSelect) item.calibrationMethod = methodSelect.value;
        const cycleSelect = root.querySelector('#routine-editor [data-select="calibrationCycle"]');
        if (cycleSelect) item.calibrationCycle = cycleSelect.value;
        const customCycleInput = root.querySelector('#routine-editor [data-field="customCycle"]');
        if (customCycleInput) item.customCycle = customCycleInput.value.trim();
        const calAtInput = root.querySelector('#routine-editor [data-field="calibratedAt"]');
        if (calAtInput) item.calibratedAt = calAtInput.value;
        const expAtInput = root.querySelector('#routine-editor [data-field="expiresAt"]');
        if (expAtInput) item.expiresAt = expAtInput.value;
        const intakeInput = root.querySelector('#routine-editor [data-field="intakeDate"]');
        if (intakeInput) item.intakeDate = intakeInput.value;
        const specInput = root.querySelector('#routine-editor [data-field="spec"]');
        if (specInput) item.spec = specInput.value;
        const notesInput = root.querySelector('#routine-editor [data-field="notes"]');
        if (notesInput) item.notes = notesInput.value;

        syncHierarchy();

        if (!problemSnapshot && submitProblems && submitProblems.length > 0) {
          const remainingProblemsForThisItem = validateEquipmentItem(item);
          submitProblems = submitProblems.filter(p => p.id !== item.id).concat(remainingProblemsForThisItem);
          if (submitProblems.length === 0) {
            openErrors = false;
          }
        }

        if(!await writeShared('apply'))return;
        closeForm();
      });

      root.querySelector('#routine-delete')?.addEventListener('click', () => {
        if (item) deleteEquipment(item.id).catch(failed);
      });
    }

    if (addingEquipment && newEquipmentForm) {
      bindAddEquipmentInput();
      const syncAddFormFromDOM = () => {
        if (!newEquipmentForm) return;
        const code = root.querySelector('#routine-add-asset-code')?.value;
        if (code !== undefined) newEquipmentForm.assetCode = code.trim().toUpperCase();
        const nm = root.querySelector('#routine-add-name')?.value;
        if (nm !== undefined) newEquipmentForm.name = nm.trim();
        const un = root.querySelector('#routine-add-unit')?.value;
        if (un !== undefined) newEquipmentForm.unit = un;
        const ow = root.querySelector('#routine-add-owner')?.value;
        if (ow !== undefined) newEquipmentForm.owner = ow.trim();
        const en = root.querySelector('#routine-add-enabled')?.value;
        if (en !== undefined) newEquipmentForm.enabled = en === 'true';
        const cf = root.querySelector('#routine-add-confirmed')?.value;
        if (cf !== undefined) newEquipmentForm.confirmed = cf === 'true';
        const cm = root.querySelector('#routine-add-calibration-method')?.value;
        if (cm !== undefined) newEquipmentForm.calibrationMethod = cm;
        const cc = root.querySelector('#routine-add-calibration-cycle')?.value;
        if (cc !== undefined) newEquipmentForm.calibrationCycle = cc;
        const ccy = root.querySelector('#routine-add-custom-cycle')?.value;
        if (ccy !== undefined) newEquipmentForm.customCycle = ccy.trim();
        const ca = root.querySelector('#routine-add-calibrated-at')?.value;
        if (ca !== undefined) newEquipmentForm.calibratedAt = ca;
        const ea = root.querySelector('#routine-add-expires-at')?.value;
        if (ea !== undefined) newEquipmentForm.expiresAt = ea;
        const idt = root.querySelector('#routine-add-intake-date')?.value;
        if (idt !== undefined) newEquipmentForm.intakeDate = idt;
        const sp = root.querySelector('#routine-add-spec')?.value;
        if (sp !== undefined) newEquipmentForm.spec = sp.trim();
        const nt = root.querySelector('#routine-add-notes')?.value;
        if (nt !== undefined) newEquipmentForm.notes = nt.trim();
      };

      const bindAddCalibrationInputs = () => {
        const calContainer = root.querySelector('#routine-add-calibration-container');
        if (!calContainer) return;
        const cycleSelect = calContainer.querySelector('#routine-add-calibration-cycle');
        if (cycleSelect) {
          cycleSelect.onchange = () => {
            newEquipmentForm.calibrationCycle = cycleSelect.value;
            calContainer.innerHTML = renderAddCalibrationFields(newEquipmentForm);
            bindAddCalibrationInputs();
          };
        }
        calContainer.querySelectorAll('input').forEach(input => {
          input.oninput = () => {
            if (input.id === 'routine-add-custom-cycle') newEquipmentForm.customCycle = input.value;
            if (input.id === 'routine-add-calibrated-at') newEquipmentForm.calibratedAt = input.value;
            if (input.id === 'routine-add-expires-at') newEquipmentForm.expiresAt = input.value;
          };
        });
      };
      bindAddCalibrationInputs();

      const assetCodeInput = root.querySelector('#routine-add-asset-code');
      const pieceMarkInput = root.querySelector('#routine-add-piece-mark-input');

      assetCodeInput?.addEventListener('input', () => {
        const val = assetCodeInput.value.trim().toUpperCase();
        newEquipmentForm.assetCode = val;
        if (pieceMarkInput) pieceMarkInput.value = computeNextPieceMark(val);
      });

      root.querySelector('#routine-add-name')?.addEventListener('input', e => {
        newEquipmentForm.name = e.target.value;
      });

      root.querySelector('#routine-add-photo-input')?.addEventListener('change', event => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 5_000_000) { alert(t('照片限 5 MB', 'Ảnh giới hạn 5 MB')); return; }
        syncAddFormFromDOM();
        if (newEquipmentForm.pendingPhoto) URL.revokeObjectURL(newEquipmentForm.pendingPhoto.url);
        newEquipmentForm.pendingPhoto = { file, url: URL.createObjectURL(file) };
        render();
      });

      root.querySelector('#routine-add-photo-remove')?.addEventListener('click', () => {
        syncAddFormFromDOM();
        if (newEquipmentForm.pendingPhoto) URL.revokeObjectURL(newEquipmentForm.pendingPhoto.url);
        newEquipmentForm.pendingPhoto = null;
        render();
      });

      root.querySelector('#routine-add-calibration-method')?.addEventListener('change', event => {
        syncAddFormFromDOM();
        newEquipmentForm.calibrationMethod = event.target.value;
        const calContainer = root.querySelector('#routine-add-calibration-container');
        if (calContainer) {
          calContainer.innerHTML = renderAddCalibrationFields(newEquipmentForm);
          bindAddCalibrationInputs();
        }
      });

      const cancelAdd = () => {
        syncAddFormFromDOM();
        const hasInput = (newEquipmentForm.assetCode || '').trim() ||
                         (newEquipmentForm.name || '').trim();
        if (hasInput && !confirm(t('確定取消新增檢具？已填寫的資料將不會保留。', 'Hủy thêm thiết bị? Dữ liệu đã nhập sẽ không được giữ lại.'))) return;
        if (newEquipmentForm?.pendingPhoto) URL.revokeObjectURL(newEquipmentForm.pendingPhoto.url);
        addingEquipment = false;
        newEquipmentForm = null;
        render();
      };

      root.querySelector('#routine-add-close')?.addEventListener('click', cancelAdd);
      root.querySelector('#routine-add-cancel')?.addEventListener('click', cancelAdd);
      root.querySelector('#routine-add-backdrop')?.addEventListener('click', event => {
        if (event.target?.id === 'routine-add-backdrop') cancelAdd();
      });

      root.querySelector('#routine-add-submit')?.addEventListener('click', confirmAddEquipment);
    }
  }

  function html() { return `<section class="routine-page" data-i18n-skip="true"><p>${t('正在載入檢具與測試設備…', 'Đang tải dưỡng kiểm và thiết bị đo…')}</p></section>`; }
  async function reconcilePendingReplacements() {
    // Compatibility hook for old approval callers: refresh references only.
    // Historical waiting records never authorize automatic V3 writes.
    equipmentRefCache.clear();
  }
  async function mount(element) {
    equipmentEditRequest++;navigationError=null;
    const delivery=window.ProcessSync?.captureDelivery?.(),owns=()=>host===element&&element.isConnected&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));
    clearTimeout(sharedPoll);
    const preserve = controlActor===identity()?.id&&(isDirty() || pendingPhotos.size > 0 || addingEquipment && newEquipmentForm);
    host = element;
    if (preserve) { message = t('本頁仍有未儲存草稿，已保留於工作區；請儲存或送審。', 'Trang này còn bản nháp chưa lưu; đã giữ trong vùng làm việc.'); render(); pollShared(); return; }
    message = ''; render();
    try {
      await read();if(!owns())return;
      const linkedId=new URL(location.href).searchParams.get('equipmentId');
      if (linkedId) {
        const effective=active(), item=effective?.equipment.find(row=>row.id===linkedId);
        if (item) {
          selectedVersionId=effective.id;selectedEquipmentId=item.id;selectedGroup=item.groupId;
          const group=structure(effective).groups.find(row=>row.id===item.groupId);
          selectedCategory=group?.categoryId || '';selectedSubcategory=group?.subcategoryId || '';
          equipmentPage=1;
          await loadEquipmentReferences(item.id,{renderAfter:false});if(!owns())return;
          viewDialog={kind:'equipment',data:item};
        } else message=t('此設備已不在目前生效版本，請核對歷史資料。','Thiết bị không còn trong phiên bản hiệu lực; kiểm tra lịch sử.');
      }
      render();pollShared();if(!linkedId)void reconcilePendingReplacements();
    } catch (error) {if(!owns())return;navigationError=error; message = error.message; render(); }
  }
  window.addEventListener('beforeunload', event => {
    if (isDirty() || pendingPhotos.size) {
      event.preventDefault();
      // oxlint-disable-next-line typescript/no-deprecated -- Chrome still requires this for the native unsaved-changes prompt.
      event.returnValue = '';
    }
  });
  function pendingCount() { return control?.versions.filter(version => version.status === 'pending').length || 0; }
  function reviewHTML() { return `<section class="routine-review routine-card" data-i18n-skip="true"><h3>${t('檢具與測試設備 · 待確認', 'Dưỡng kiểm và thiết bị đo · Chờ duyệt')}</h3><div class="routine-review-body">${t('正在載入…', 'Đang tải…')}</div></section>`; }
  async function bindReview(element) {
    reviewHost = element?.querySelector('.routine-review'); if (!reviewHost) return;
    const target=reviewHost,delivery=window.ProcessSync?.captureDelivery?.(),owns=()=>reviewHost===target&&target.isConnected&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));
    try { await read();if(owns())reviewRender(); } catch (error) {if(owns()){navigationError=error; target.querySelector('.routine-review-body').textContent = displayDraftError(error);}}
  }

  function reviewRender() {
    if (!reviewHost?.isConnected) return;
    reviewHost.querySelector('h3').textContent = t('檢具與測試設備 · 待確認', 'Dưỡng kiểm và thiết bị đo · Chờ duyệt');
    const pending = control?.versions.filter(version => version.status === 'pending') || [];
    const base = active();
    const body = reviewHost.querySelector('.routine-review-body');
    body.innerHTML = pending.length ? pending.map(version => {
      // Compute diff vs baseline
      const baseMap = new Map((base?.equipment || []).map(e => [e.id, e]));
      const added = version.equipment.filter(e => !baseMap.has(e.id));
      const disabled = version.equipment.filter(e => baseMap.has(e.id) && baseMap.get(e.id).enabled && !e.enabled);
      const modified = version.equipment.filter(e => {
        const old = baseMap.get(e.id);
        if (!old) return false;
        return ['categoryId','subcategoryId','groupId','calibrationMethod','calibrationCycle','calibratedAt','expiresAt','unit','spec','name','nameVi','notes','photoId','photoHidden','confirmed','enabled'].some(k => old[k] !== e[k]);
      });
      const snapshotDiff = (title, before, after) => {
        const beforeMap = new Map((before || []).map(item => [item.id, item]));
        const changes = (after || []).filter(item => JSON.stringify(item) !== JSON.stringify(beforeMap.get(item.id)));
        return `<details><summary>${title} · ${changes.length}</summary>${changes.map(item => `<p data-i18n-skip="true">${h(item.id)} · ${h(item.name || item.nameVi || item.nameZh || '')} ${beforeMap.has(item.id) ? '(修改)' : '(新增)'}</p>`).join('') || `<p>${t('無變更', 'Không thay đổi')}</p>`}</details>`;
      };
      const fields = { categoryId: t('類別', 'Nhóm'), subcategoryId: t('子類別', 'Phân nhóm'), groupId: t('規格群組', 'Nhóm quy cách'),
        name: t('名稱', 'Tên'), spec: t('規格', 'Quy cách'), photoId: t('照片', 'Ảnh'), photoHidden: t('照片移除狀態', 'Trạng thái ảnh'), calibrationMethod: t('校正方式', 'Phương thức hiệu chuẩn'),
        calibrationCycle: t('校正週期', 'Chu kỳ hiệu chuẩn'), calibratedAt: t('最近校正', 'Ngày hiệu chuẩn'), expiresAt: t('期限', 'Hạn'),
        confirmed: t('資料核對', 'Đối soát'), enabled: t('啟用', 'Kích hoạt') };
      const fieldValue = (key, value, sourceVersion) => {
        const collection = key === 'categoryId' ? sourceVersion?.categories : key === 'subcategoryId' ? sourceVersion?.subcategories : key === 'groupId' ? sourceVersion?.groups : null;
        return (collection?.find(record => record.id === value)?.name || value) ?? '—';
      };
      const itemDiff = [...added, ...modified].map(item => {
        const before = baseMap.get(item.id);
        const changedFields = before ? Object.keys(fields).filter(key => String(before[key] ?? '') !== String(item[key] ?? '')) : Object.keys(fields);
        return `<details><summary data-i18n-skip="true">${h(item.assetCode)}／${h(item.pieceMark)} · ${h(displayName(item))}</summary>
          ${changedFields.map(key => `<p><b>${fields[key]}</b>：<span data-i18n-skip="true">${h(fieldValue(key, before?.[key], base))} → ${h(fieldValue(key, item[key], version))}</span></p>`).join('')}
          ${photo(item) ? `<img decoding="async" src="${h(photo(item))}" loading="lazy" alt="${t('送審照片', 'Ảnh gửi duyệt')}" class="routine-review-photo">` : ''}
        </details>`;
      }).join('');

      return `<article>
        <h4>${t('檢具與測試設備', 'Dưỡng kiểm và Thiết bị')} · V${version.number}</h4>
        <p>${t('修改者', 'Người sửa')} ${h(version.creatorName)} · ${t('送審者', 'Người gửi')} ${h(version.submittedBy)} · ${h(date(version.submittedAt))}</p>
        <div class="routine-review-diff">
          <b>${t('變更比對清單（Diff）：', 'So sánh thay đổi (Diff):')}</b><br>
          ${!base ? `<span class="routine-diff-badge routine-diff-add">${t('首次匯入全量新增', 'Nhập nguồn mới toàn bộ')} (${version.equipment.length} ${t('筆', 'mục')})</span>` : `
            <span class="routine-diff-badge routine-diff-add">${t('新增設備', 'Thêm mới')} ${added.length} ${t('筆', 'mục')}</span>
            <span class="routine-diff-badge routine-diff-edit">${t('修改設備', 'Đã sửa')} ${modified.length} ${t('筆', 'mục')}</span>
            <span class="routine-diff-badge routine-diff-disable">${t('停用設備', 'Vô hiệu hóa')} ${disabled.length} ${t('筆', 'mục')}</span>
          `}
        </div>
        ${snapshotDiff(t('類別', 'Nhóm'), base?.categories, version.categories)}
        ${snapshotDiff(t('子類別', 'Phân nhóm'), base?.subcategories, version.subcategories)}
        ${snapshotDiff(t('規格群組', 'Nhóm quy cách'), base?.groups, version.groups)}
        <details><summary>${t('來源疑點處理差異', 'Thay đổi xử lý vấn đề nguồn')}</summary>${(version.issues || []).filter((issue, index) => JSON.stringify(issue) !== JSON.stringify((base?.issues || control.issues)[index])).map(issue => `<p data-i18n-skip="true">${h(issue.assetCode)}／${h(issue.pieceMark)} · ${h(issue.type)} · ${h(issue.status)} · ${h(issue.resolution || '')}</p>`).join('') || `<p>${t('無變更', 'Không thay đổi')}</p>`}</details>
        <details><summary>${t('設備與照片／校正／核對差異', 'Thay đổi thiết bị, ảnh, hiệu chuẩn, đối soát')} · ${added.length + modified.length}</summary>${itemDiff || `<p>${t('無變更', 'Không thay đổi')}</p>`}</details>
        <p>${t('設備總計', 'Tổng thiết bị')} ${version.equipment.length} ${t('筆', 'mục')}；${t('來源待確認', 'Chờ đối soát')} ${control.issues.length} ${t('筆。', 'mục.')}</p>
        <p>${t('歷程：', 'Nhật ký: ')}${version.history.map(event => `${h(actionName(event.action))} ${h(event.actorName)} ${h(date(event.at))} ${h(event.comment || '')}`).join('／')}</p>
        ${permitted('approval.approve') || permitted('approval.reject') ? `
          <label>${t('審核意見（選填）', 'Ý kiến duyệt (không bắt buộc)')}<textarea data-routine-review-comment="${h(version.id)}"></textarea></label>
          <div class="routine-review-actions">
            ${permitted('approval.reject') ? `<button class="button ghost" data-routine-review="reject" data-version="${h(version.id)}">${t('發回', 'Trả lại')}</button>` : ''}
            ${permitted('approval.approve') ? `<button class="button signal" data-routine-review="approve" data-version="${h(version.id)}">${t('確認', 'Duyệt')}</button>` : ''}
          </div>` : ''}
        ${permitted('approval.withdraw')?`<button class="button ghost" data-routine-review="withdraw" data-version="${h(version.id)}">${t('撤回送審','Rút hồ sơ')}</button>`:''}
      </article>`;
    }).join('') : `<p>${t('檢具與測試設備目前沒有待確認案件', 'Hiện không có hồ sơ thiết bị nào chờ duyệt')}</p>`;
    const latestApproved = control?.versions.filter(version=>['approved','superseded'].includes(version.status)).slice(-3).reverse() || [];
    body.insertAdjacentHTML('beforeend', latestApproved.map(version=>`<article><h4>${t('檢具與測試設備', 'Dưỡng kiểm và thiết bị')} · V${version.number} · ${t('已確認', 'Đã duyệt')}</h4><p>${t('確認者', 'Người duyệt')} ${h(version.reviewedBy || '—')} · ${h(date(version.reviewedAt))}${version.reviewComment?`<br>${t('審核意見', 'Ý kiến')}: ${h(version.reviewComment)}`:''}</p></article>`).join(''));

    body.querySelectorAll('[data-routine-review]').forEach(button => button.onclick = async () => {
      const version = control.versions.find(item => item.id === button.dataset.version);
      const comment = button.dataset.routineReview === 'approve' ? body.querySelector(`[data-routine-review-comment="${version.id}"]`)?.value?.trim() || '' : '';
      const result = await write(button.dataset.routineReview, { versionId: version.id, versionRevision: version.revision, comment });
      if (result) { reviewRender(); document.querySelector('#approval-panel-quality .approval-tab-count')?.replaceChildren(String(pendingCount())); }
    });
    const count = document.querySelector('#approval-tab-quality .approval-tab-count'); if (count) count.textContent = String((window.FQCMasterUI?.pendingCount?.() || 0) + pendingCount());
  }

  window.addEventListener('process-language-change', () => {
    if (routineTabIsActive()) render();
    if (reviewHost?.isConnected) reviewRender();
  });
  async function refreshOpenEquipmentReferences() {
    equipmentRefCache.clear();
    const openIds = new Set([
      editingEquipmentId,
      viewDialog?.kind === 'equipment' ? viewDialog.data?.id : ''
    ].filter(Boolean));
    await Promise.all([...openIds].map(id => loadEquipmentReferences(id, { renderAfter: false })));
    if (routineTabIsActive()) for (const id of openIds) updateEquipmentReferenceSections(id);
  }
  window.addEventListener('fqc-equipment-references-updated', refreshOpenEquipmentReferences);
  window.addEventListener('quality-equipment-references-updated', refreshOpenEquipmentReferences);

  let navigationError=null;
  window.RoutineEquipmentUI = {
    navigation:{canLeave:()=>!busy&&!isDirty()&&!isFormDirty()&&!pendingPhotos.size&&!nodeDialog&&!transferDialog&&!addingEquipment,error:()=>navigationError,reset(){equipmentEditRequest++;clearTimeout(sharedPoll);equipmentReadAttempt=null;host=null;reviewHost=null;control=null;revision=null;working=null;controlActor='';readUnavailable=false;selectedVersionId='';editingEquipmentId='';selectedEquipmentId='';syncBase=null;syncGeneration=null;viewDialog=null;formSnapshot=null;problemSnapshot=null;equipmentRefCache.clear();navigationError=null;}},
    html,
    mount,
    reviewHTML,
    bindReview,
    pendingCount,
    async reconcilePendingReplacements() {
      if (isDirty() || pendingPhotos.size) return;
      try { await read(); await reconcilePendingReplacements(); }
      catch (error) { console.error('待處理替換暫未套用；紀錄仍保留', error); }
    },
    async getEquipmentReferences(eqId, { refresh = false } = {}) {
      if (!refresh && equipmentRefCache.has(eqId)) return equipmentRefCache.get(eqId);
      return loadEquipmentReferences(eqId, { renderAfter: false });
    },
    referencesHTML(eqId, refs, mode = 'view') {
      if (refs) equipmentRefCache.set(eqId, refs);
      return equipmentReferencesSectionHTML(eqId, mode);
    },
    bindReferenceActions
  };
})();
