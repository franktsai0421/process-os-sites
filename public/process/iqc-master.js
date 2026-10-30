(function (host) {
  const displayDraftError = error => window.sharedDraftErrorMessage?.(error) ?? (typeof error === 'string' ? error : error?.message || String(error ?? ''));
  const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const copy = value => JSON.parse(JSON.stringify(value));
  const formText = (form, key) => { const value = new FormData(form).get(key); return typeof value === 'string' ? value : ''; };
  const apiUrl = '/api/iqc';
  const photoUrl = '/api/iqc/photo';
  const ui = { search: '', supplier: '', category: '', partCode: '', errorId: '', versionId: '', openItems: new Set(), busy: false, preview: null, previewError: '' };
  let control = null, revision = null, root = null, reviewRoot = null;
  let sharedClient=null,sharedActor='';const pollTimer=window.createForegroundPoll();let dialogBase=null,dialogGeneration=null;
  let loadSequence=0,mountSequence=0,reviewBindSequence=0,mutationSequence=0,readDenied=null,reviewContainer=null;
  let versionReadSequence=0,versionReadError=null,activeDeferredId='';
  // Private document-lifetime containment only: no reopen, serialize, discard or auto-apply.
  const editorOwners = new Set();
  function quarantineEditors() {
    for (const owner of editorOwners) owner.terminal = true;
    for (const owner of editorOwners) owner.detach();
  }
  host.addEventListener('process-delivery-invalidated', quarantineEditors);
  const photoViewerDisposers = new Set();
  function disposePhotoViewers() { const closing = Array.from(photoViewerDisposers); for (const close of closing) close(); }
  host.addEventListener('process-delivery-invalidated', disposePhotoViewers);
  function transport(){const actor=identity()?.id;if(!actor)throw Error('LOGIN_REQUIRED');
    if(sharedActor!==actor){sharedActor=actor;sharedClient=window.createSharedDraftClient({endpoint:apiUrl+'/workflow?caseMetadata=1',responseProjection:'iqc-edit-v1',legacyArchive:true,conditionalState:true,guardAccessResults:true,actorId:actor,headers:()=>({...window.ProcessSync?.platformHeaders?.(),'Content-Type':'application/json'}),permissionGates:{create:'#iqc-add-part,#iqc-add-error,[data-add-item],#iqc-list-add',edit:'#iqc-page [data-edit-item],#iqc-page [data-edit-error],#iqc-page [data-edit-part],#iqc-manage-suppliers,#iqc-manage-categories,#iqc-item-form button[type=submit],#iqc-error-form button[type=submit],#iqc-part-form button[type=submit],#iqc-list-save,#iqc-managed-rows [data-row-edit]',save:'#iqc-save',submit:'#iqc-submit',withdraw:'#iqc-withdraw,#iqc-review-withdraw',approve:'#iqc-review-approve',return:'#iqc-review-reject',history:'#iqc-case-history',delete:'#iqc-managed-rows [data-row-remove],#iqc-page [data-delete-item],#iqc-page [data-delete-error],#iqc-page [data-delete-part]'}});}
    return sharedClient;
  }
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function snapshotChanges(base,next){const patches=[],guards=[];
    for(const collection of ['categories','suppliers','parts','errors','items']){
      // Preserve first-match semantics and source order while avoiding quadratic ID scans.
      const indexed=base[collection].every(row=>typeof row.id==='string')&&next[collection].every(row=>typeof row.id==='string');
      const nextIds=indexed?new Set(next[collection].map(row=>row.id)):null,baseById=new Map();
      for(const old of indexed?base[collection]:[])if(!baseById.has(old.id))baseById.set(old.id,old);
      for(const old of base[collection])if(indexed?!nextIds.has(old.id):!next[collection].some(row=>row.id===old.id)){const path=[collection,{id:old.id}];patches.push({op:'remove',path});guards.push({path,value:old});}
      for(const row of next[collection]){const old=indexed?baseById.get(row.id):base[collection].find(value=>value.id===row.id);
        if(!old){patches.push({op:'insert',path:[collection],value:row});continue;}
        for(const [field,value]of Object.entries(row))if(field!=='equipmentSnapshot'&&value!==undefined&&!equal(value,old[field])){
          const path=[collection,{id:row.id},field];patches.push({op:'set',path,value});
          guards.push({path,value:old[field]});
        }
      }
    }return{patches,guards};
  }
  const identity = () => window.ProcessSync?.identity || (typeof currentUser !== 'undefined' ? currentUser : null);
  const mayEdit = () => !readDenied && !!identity() && (window.sharedDraftPermissionAllowed?.(sharedClient,'approval.submit')??true) && (typeof window.hasPermission !== 'function' || window.hasPermission('view:data'));
  const mayCreate=()=>mayEdit()&&sharedClient?.permission('create')===true;
  const mayDraftAction = action => !readDenied && !!identity() && sharedClient?.permission(action)===true && (control?.workflow||mayEdit());
  const mayWithdraw = () => !readDenied && !!identity() && (window.sharedDraftPermissionAllowed?.(sharedClient,'withdraw')??true) && (typeof window.hasPermission !== 'function' || window.hasPermission('view:data') || window.hasPermission('approval.withdraw'));
  const mayReview = (permission='approval.approve') => !readDenied && !!identity() && (window.sharedDraftPermissionAllowed?.(sharedClient,permission)??true) && (typeof window.hasPermission !== 'function' || window.hasPermission(permission));
  const lastEdit = version => [...(version?.history||[])].reverse().find(event=>!['submit','approve','reject','withdraw'].includes(event.action));
  const translations = new Map();
  const t = (zh, vi) => { translations.set(zh, vi); return document.documentElement.lang === 'vi' ? vi : zh; };
  const ruleKindLabel = rule => ({ aql: 'AQL', fixed_count: t('固定件數','Số mẫu cố định'), batch_quantity: t('批次數量','Số lượng lô'), week: t('週','Tuần'), month: t('月','Tháng'), quarter: t('季','Quý'), half_year: t('半年','Nửa năm'), year: t('年','Năm'), custom: rule.nameVi || t('自訂','Tùy chỉnh') })[rule.kind] || rule.kind;
  function switchLabels() {
    const toVi = document.documentElement.lang === 'vi';
    const pairs = [...translations].sort((a,b) => Math.max(b[0].length,b[1].length)-Math.max(a[0].length,a[1].length));
    for (const area of [root, ...document.querySelectorAll('.iqc-dialog-overlay,.iqc-lightbox')]) {
      if (!area?.isConnected) continue;
      for(const element of area.querySelectorAll('[placeholder],[title],[aria-label]'))for(const attr of ['placeholder','title','aria-label']){const value=element.getAttribute(attr);if(value===null)continue;const pair=pairs.find(([zh,vi])=>value===(toVi?zh:vi));if(pair)element.setAttribute(attr,toVi?pair[1]:pair[0]);}
      const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const skipped = node.parentElement?.closest('[data-i18n-skip]');
        if (skipped && skipped !== area) continue;
        let value = node.nodeValue;
        for (const [zh,vi] of pairs) value = value.split(toVi ? zh : vi).join(toVi ? vi : zh);
        if (node.nodeValue !== value) node.nodeValue = value;
      }
    }
  }
  window.addEventListener('process-language-change', switchLabels);
  const status = value => ({ draft: t('草稿 · 未送審', 'Bản nháp · Chưa gửi'), pending: t('主管審核中', 'Đang chờ quản lý duyệt'), approved: t('已核准', 'Đã phê duyệt'), superseded: t('歷史核准', 'Bản đã duyệt trước') })[value] || value;
  const notice = message => { const toast = document.querySelector('#toast'); if (toast) { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 5000); } };
  const date = value => window.VersionDraftUI?.date(value) || '—';
  const selected = () => control?.versions.find(v => v.id === ui.versionId) || control?.versions.find(v => v.status === 'draft') || control?.versions.find(v => v.status === 'pending') || control?.versions.find(v => v.id === control.activeVersionId) || control?.versions[0] || null;
  const active = () => control?.versions.find(v => v.id === control.activeVersionId) || null;
  const draft = () => selected()?.status === 'draft' ? selected() : null;
  const snap = () => selected()?.snapshot || { categories: [], suppliers: [], parts: [], errors: [], items: [] };
  const name = (rows, id) => rows.find(item => item.id === id)?.nameVi || '';
  function nameIndex(rows) {
    if(!rows.every(row=>typeof row.id==='string'))return id=>name(rows,id);
    const first=new Map();for(const row of rows)if(!first.has(row.id))first.set(row.id,row.nameVi);
    return id=>first.get(id)||'';
  }
  function sharedStatus(){const flow=control?.workflow;if(!flow)return '';
    const saved=flow.saved,unsaved=!saved||!equal(flow.working,saved.content);
    return `<section class="iqc-panel" id="iqc-shared-status" role="status"><b>${t('共用範圍：IQC 全庫','Phạm vi chung: toàn bộ IQC')}</b> · ${flow.pendingId?t('待審鎖定','Khóa chờ duyệt'):unsaved?t('已同步 · 尚未手動儲存','Đã đồng bộ · chưa lưu thủ công'):t('已儲存','Đã lưu')}<br>${saved?`${t('儲存者','Người lưu')}: ${h(saved.actor.name)} · ${h(date(saved.at))} · ${h(saved.id)}`:t('尚無成功儲存快照','Chưa có bản chụp lưu thành công')}${sharedClient?.hasUnknown()?`<p role="alert">${t('上次操作結果未知，請查證後再繼續','Kết quả thao tác trước chưa rõ; kiểm tra trước khi tiếp tục')}</p><button id="iqc-operation-check">${t('查詢結果','Kiểm tra kết quả')}</button><button id="iqc-operation-retry">${t('重試同一操作','Thử lại cùng thao tác')}</button>`:''}</section>`;
  }

  function renderReadDenied() {
    if(!readDenied)return false;
    const message=displayDraftError(readDenied)+(readDenied.operationAcknowledged?' · '+t('操作已確認；重新讀取遭拒，沒有重送。','Thao tác đã xác nhận; đọc lại bị từ chối, không gửi lại.'):'');
    for(const node of new Set([root,reviewRoot]))if(node?.isConnected){
      node.innerHTML=`<section class="iqc-panel iqc-alert" role="alert">${h(message)} <button id="iqc-read-retry">${t('重新載入','Tải lại')}</button></section>`;
      const button=node.querySelector('#iqc-read-retry');if(button)button.onclick=async()=>{try{if(node===reviewRoot&&reviewContainer)await bindReview(reviewContainer);else {await load();render();}}catch(error){notice(displayDraftError(error));renderReadDenied();}};
    }
    return true;
  }
  function denyRead(error){
    readDenied=error;navigationError=error;quarantineEditors();disposePhotoViewers();renderReadDenied();
  }
  const completeSnapshot=value=>value&&['categories','suppliers','parts','errors','items'].every(key=>Array.isArray(value[key]));
  function validateIqcPayload(data,permissionsRequired){
    const value=data.control,flow=value?.workflow,projection=data.iqcProjection;
    const deferred=projection?.version===1&&projection.activeVersionId===value?.activeVersionId&&flow?.active?.id===value?.activeVersionId;
    const deferredVersion=version=>deferred&&version?.id===value.activeVersionId&&version.snapshotDeferred==='iqc-active-v1'&&!Object.hasOwn(version,'snapshot');
    if(projection&&(!deferred||!Array.isArray(value?.versions)||value.versions.filter(version=>version?.id===value.activeVersionId).length!==1||!deferredVersion(value.versions.find(version=>version?.id===value.activeVersionId))||flow.active.contentDeferred!=='iqc-active-v1'||Object.hasOwn(flow.active,'content'))||!Number.isInteger(data.revision)||value?.schemaVersion!==1||!['versions','issues','reservedErrorCodes','reservedCheckNos'].every(key=>Array.isArray(value[key]))||!value.versions.every(version=>completeSnapshot(version?.snapshot)||deferredVersion(version))||flow&&(typeof flow.generation!=='string'||!flow.generation||!Number.isInteger(flow.revision)||!Object.hasOwn(flow,'saved')||!completeSnapshot(flow.working)||!(completeSnapshot(flow.active?.content)||deferred&&flow.active.contentDeferred==='iqc-active-v1'&&!Object.hasOwn(flow.active,'content'))||flow.saved&&!completeSnapshot(flow.saved.content)||!Array.isArray(flow.cases))){const error=Error('IQC 載入失敗');denyRead(error);throw error;}
    if(permissionsRequired){if(!['view','edit','save','submit','withdraw','approve','return','history','delete'].every(key=>typeof data.permissions?.[key]==='boolean')){const error=Object.assign(Error('IQC_PERMISSION_PAYLOAD_INVALID'),{status:403});denyRead(error);throw error;}if(data.permissions.view!==true){const error=Object.assign(Error('FORBIDDEN'),{status:403});denyRead(error);throw error;}}
  }
  async function hydrateVersion(id,selectionCurrent=()=>true){
    const version=control?.versions.find(v=>v.id===id);if(!version||!version.snapshotDeferred&&id!==activeDeferredId)return;
    const sequence=++versionReadSequence,ownedControl=control,ownedRevision=revision,actor=identity(),epoch=window.ProcessSync?.identityGeneration?.(),delivery=window.ProcessSync?.captureDelivery?.(),generation=loadSequence;
    const current=()=>sequence===versionReadSequence&&control===ownedControl&&revision===ownedRevision&&loadSequence===generation&&identity()===actor&&(typeof epoch!=='number'||window.ProcessSync?.identityGeneration?.()===epoch)&&!window.ProcessSync?.requiresReload&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery)!==false)&&selectionCurrent();
    versionReadError=null;
    try{
      const data=await transport().version(id,{isCurrent:current,requireAcceptedAccess:true});if(!current())return;
      if(data.revision!==ownedRevision||data.activeVersionId!==id||data.generation!==ownedControl.workflow?.generation||data.version?.id!==id)throw Error('IQC_VERSION_CHANGED_RELOAD');
      if(!['view','edit','save','submit','withdraw','approve','return','history','delete'].every(key=>typeof data.permissions?.[key]==='boolean')||data.permissions.view!==true)throw Object.assign(Error('IQC_PERMISSION_PAYLOAD_INVALID'),{status:403});
      if(!completeSnapshot(data.version.snapshot))throw Object.assign(Error('IQC_VERSION_PAYLOAD_INVALID'),{status:403});
      const {contentDeferred:_deferred,...activeMetadata}=ownedControl.workflow.active;
      control={...ownedControl,versions:ownedControl.versions.map(v=>v.id===id?data.version:v),workflow:{...ownedControl.workflow,active:{...activeMetadata,content:copy(data.version.snapshot)}}};
      versionReadError=null;navigationError=null;
    }catch(error){if(!current())return;if(error.status===401||error.status===403)denyRead(error);else {versionReadError=error;navigationError=error;}throw error;}
  }
  async function selectVersion(id){
    if(ui.busy||document.querySelector('.iqc-dialog-overlay,.iqc-lightbox')){notice(t('請先完成或關閉目前編輯，再切換版本。','Hoàn tất hoặc đóng cửa sổ sửa trước khi đổi phiên bản.'));render();return;}
    versionReadSequence++;versionReadError=null;ui.versionId=id;ui.partCode='';ui.errorId='';
    if(id===activeDeferredId){control={...control,versions:control.versions.map(v=>{if(v.id!==id)return v;const {snapshot:_snapshot,...metadata}=v;return{...metadata,snapshotDeferred:'iqc-active-v1'};})};}
    render();
    try{await hydrateVersion(id,()=>ui.versionId===id);if(ui.versionId===id)render();}catch(error){if(ui.versionId===id){render();notice(displayDraftError(error));}}
  }
  async function retrySelectedVersion(){
    if(ui.busy||document.querySelector('.iqc-dialog-overlay,.iqc-lightbox'))return;
    if(versionReadError?.message!=='IQC_VERSION_CHANGED_RELOAD'){await selectVersion(selected().id);return;}
    const id=ui.versionId,sequence=++versionReadSequence;
    const owner={assert(){if(sequence!==versionReadSequence||ui.versionId!==id||document.querySelector('.iqc-dialog-overlay,.iqc-lightbox'))throw Error('DELIVERY_SUPERSEDED');}};
    versionReadError=null;
    try{await load(owner);if(ui.versionId===id)render();}catch(error){if(ui.versionId===id&&error.message!=='DELIVERY_SUPERSEDED'){versionReadError=error;render();notice(displayDraftError(error));}}
  }
  async function load(owner) {
    owner?.assert();
    const sequence=++loadSequence,actor=identity(),actorId=actor?.id,epoch=window.ProcessSync?.identityGeneration?.();
    const delivery=window.ProcessSync?.captureDelivery?.(),client=transport();
    const assertCurrent=()=>{
      owner?.assert();
      if(sequence!==loadSequence||window.ProcessSync?.requiresReload||identity()?.id!==actorId||
        (typeof epoch==='number'?window.ProcessSync?.identityGeneration?.()!==epoch:identity()!==actor)||
        delivery&&window.ProcessSync.isCurrentDelivery(delivery)===false)throw Error('DELIVERY_SUPERSEDED');
    };
    // The fresh workflow response authorizes this owner; admit control only
    // after validating the complete permission contract and response shape.
    const isCurrent=()=>{try{assertCurrent();return true;}catch{return false;}};
    const rejectRead=error=>{if(isCurrent()&&(error.status===401||error.status===403))denyRead(error);throw error;};
    // Full fresh workflow response includes both authorized control and permissions.
    // No conditional token or cached grant is admitted on this load boundary.
    const data=await client.read(undefined,{isCurrent,requireAcceptedAccess:true}).catch(rejectRead);
    assertCurrent();
    validateIqcPayload(data,true);
    readDenied=null;navigationError=null;control=data.control;revision=data.revision;activeDeferredId=data.iqcProjection?.activeVersionId||'';
    if(selected()?.snapshotDeferred){const id=selected().id;await hydrateVersion(id,()=>selected()?.id===id);}
    return data;
  }
  async function post(action, extra = {}, owner) {
    owner?.assert();
    if(readDenied)throw readDenied;
    if (ui.busy) throw Error('IQC 資料儲存中，請稍候');
    if (!Number.isInteger(revision)) throw Error('IQC 後端尚未載入，沒有寫入空資料');
    mutationSequence++;ui.busy = true; render();
    try {
      // Pending pre-V3 cases retain their exact legacy content until concluded.
      if(action!=='import'&&(control.workflow||!control.versions.some(v=>v.status==='pending'))){
        const client=transport();if(client.hasUnknown()){await client.resolveUnknown();owner?.assert();await load(owner);owner?.assert();}
        if(!control.workflow&&['save','submit'].includes(action)&&!mayEdit())throw Error(t('舊版草稿須由具編輯權限者先啟用共用草稿','Bản nháp cũ cần người có quyền sửa chuyển sang bản nháp chung'));
        if(!control.workflow||action==='begin'){
          owner?.assert();const started=await client.begin();owner?.assert();try{validateIqcPayload(started,false);}catch(error){error.operationAcknowledged=true;if(readDenied===error)readDenied.operationAcknowledged=true;throw error;}versionReadSequence++;control=started.control;revision=started.revision;activeDeferredId=started.iqcProjection?.activeVersionId||'';ui.versionId=control.versions.find(v=>v.status==='draft')?.id||'';
          if(dialogBase&&!dialogGeneration)dialogGeneration=control.workflow.generation;
          if(owner&&!owner.generation)owner.generation=control.workflow.generation;
          if(action==='begin')return started;
        }
        let commandAction=action,detail={};const flow=control.workflow;
        if(action==='applySnapshot'){commandAction='apply';detail=snapshotChanges(extra.base,extra.snapshot);if(!detail.patches.length)return {control,revision};}
        else if(['createError','createItem'].includes(action)){commandAction='apply';detail={moduleAction:action,input:extra};}
        else if(action==='save'){await client.flush();if(document.querySelector('.iqc-dialog-overlay')&&!confirm(t('只儲存共用草稿，不包含尚未套用的彈窗輸入。','Chỉ lưu bản nháp chung, không gồm nội dung cửa sổ chưa áp dụng.')))return;}
        else if(action==='submit'){
          if(!flow.saved)throw Error(t('請先成功儲存草稿','Hãy lưu bản nháp thành công trước'));
          const reason=await window.VersionDraftUI.confirmSubmit(window.VersionDraftUI.reasonFor(selected(),flow),'IQC');if(!reason)return;

          detail={savedId:flow.saved.id,reason};
        }else if(['approve','reject','withdraw'].includes(action)){
          commandAction=action==='reject'?'return':action;const caseId=extra.versionId||flow.pendingId,c=flow.cases.find(c=>c.id===caseId);
          const answer=await window.VersionDraftUI.confirmReview({action,scope:'IQC · '+caseId,reason:extra.comment||'',selfReview:action!=='withdraw'&&c?.actor.id===identity()?.id});if(!answer)return;
          detail={caseId,...answer};
        }
        owner?.assert();
        const result=await client.command(['applySnapshot','createError','createItem'].includes(action)?owner?.generation||dialogGeneration||flow.generation:flow.generation,commandAction,detail);
        owner?.assert();
        if(result.control){try{validateIqcPayload(result,false);}catch(error){error.operationAcknowledged=true;if(readDenied===error)readDenied.operationAcknowledged=true;throw error;}versionReadSequence++;control=result.control;revision=result.revision;activeDeferredId=result.iqcProjection?.activeVersionId||'';}else {try{await load(owner);}catch(error){error.operationAcknowledged=true;if(readDenied===error)readDenied.operationAcknowledged=true;throw error;}}
        owner?.assert();
        ui.versionId=control.versions.find(v=>['draft','pending'].includes(v.status))?.id||control.activeVersionId||'';
        window.dispatchEvent(new CustomEvent('quality-equipment-references-updated'));return result;
      }
      owner?.assert();
      const response = await fetch(apiUrl, { method: 'POST', headers: window.ProcessSync?.platformHeaders?.() || { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, baseRevision: revision, ...extra }) });
      const data = await response.json();
      owner?.assert();
      if (!response.ok || !data.control || !Number.isInteger(data.revision))
        throw Error(data.problems?.length ? `${data.error}：${data.problems.slice(0, 3).join('；')}` : data.error || `HTTP ${response.status}`);
      control = data.control; revision = data.revision;
      void window.ProcessSync?.refresh?.().catch(() => { /* Dedicated CAS response already confirms the write. */ });
      window.dispatchEvent(new CustomEvent('quality-equipment-references-updated'));
      if (action === 'begin' || action === 'withdraw' || action === 'reject')
        ui.versionId = control.versions.find(version => version.status === 'draft')?.id || '';
      return data;
    } finally { ui.busy = false; if(readDenied||!owner||owner.current())render(); }
  }
  function versionBar() {
    const v = selected();
    if (!v) return `<section class="iqc-panel iqc-version"><div><h2>IQC</h2><p class="iqc-muted">${t('尚無 IQC 草稿或生效版本', 'Chưa có bản nháp hoặc phiên bản IQC')}</p></div></section>`;
    return `<section class="iqc-panel iqc-version"><div><small>IQC MASTER CONTROL</small><h2>IQC · V${v.number} <span class="iqc-status">${status(v.status)}</span></h2><p class="iqc-muted">${t('最後編輯', 'Người sửa cuối')}: <span data-i18n-skip="true">${h(lastEdit(v)?.actorName || v.creatorName)}</span> · ${date(lastEdit(v)?.at || v.createdAt)}<br>${t('目前生效', 'Đang hiệu lực')}: ${active() ? `V${active().number}` : t('尚無', 'Chưa có')}${v.submittedBy?`<br>${t('送審者','Người gửi')}: ${h(v.submittedBy)} · ${date(v.submittedAt)}`:''}${v.reviewedBy ? `<br>${t('確認／發回者', 'Người duyệt/trả')}: <span data-i18n-skip="true">${h(v.reviewedBy)}</span> · ${date(v.reviewedAt)} · <span data-i18n-skip="true">${h(v.reviewComment || '')}</span>` : ''}</p></div>${v.status === 'draft' && !control.workflow && !mayEdit() ? `<p role="status" class="iqc-muted">${t('此舊版草稿須由具編輯權限者先啟用共用草稿，之後才能依獨立儲存／送審權限操作。','Bản nháp cũ cần người có quyền sửa chuyển sang bản nháp chung trước khi dùng quyền lưu/gửi riêng.')}</p>` : ''}<div class="iqc-actions"><label>${t('選擇版本', 'Chọn phiên bản')}<select id="iqc-version">${[...control.versions].sort((a,b)=>b.number-a.number).map(item => `<option value="${h(item.id)}" ${v.id === item.id ? 'selected' : ''}>V${item.number} · ${status(item.status)} · ${h(lastEdit(item)?.actorName || item.creatorName)} · ${date(lastEdit(item)?.at || item.createdAt)}</option>`).join('')}</select></label>${v.status === 'approved' && mayEdit() ? `<button class="button signal" id="iqc-begin">${t('開始修改','Bắt đầu sửa')}</button>` : ''}${v.status === 'draft' && mayDraftAction('save') ? `<button class="button ghost" id="iqc-save" ${ui.busy ? 'disabled' : ''}>${t('儲存草稿','Lưu bản nháp')}</button>` : ''}${v.status === 'draft' && mayDraftAction('submit') ? `<button class="button signal" id="iqc-submit" ${ui.busy ? 'disabled' : ''}>${t('送出主管審核','Gửi quản lý duyệt')}</button>` : ''}${v.status === 'pending' && mayWithdraw() ? `<button class="button ghost" id="iqc-withdraw">${t('撤回送審','Rút hồ sơ')}</button>` : ''}</div></section>`;
  }
  function issuesPanel() {
    const issues = control?.issues || [];
    if (!issues.length) return '';
    return `<section class="iqc-panel iqc-alert"><b>${t('匯入待確認事項', 'Các mục nhập cần xác nhận')} · ${issues.length}</b><details><summary>${t('查看待確認清單', 'Xem danh sách cần xác nhận')}</summary><ul class="iqc-alert-list">${issues.map((issue, index) => `<li>${issue.row ? `${t('列', 'Dòng')} ${issue.row} · ` : ''}<span data-i18n-skip="true">${h(issue.partCode || '')} ${h(issue.message || issue.type)}</span>${issue.partCode ? `<button type="button" class="button ghost iqc-small" data-iqc-issue-index="${index}">${t('前往修正', 'Đi đến sửa')}</button>` : ''}</li>`).join('')}</ul></details></section>`;
  }
  function historyPanel() {
    const v=selected();if(!v)return '';
    return `<details class="iqc-panel iqc-work-history"><summary>${t('歷史操作','Lịch sử thao tác')} · ${(v.history||[]).length}</summary>${(v.history||[]).slice().reverse().map(event=>`<p>${h(event.action)} · ${h(event.actorName)} · ${date(event.at)} ${h(event.comment||'')}</p>`).join('')||`<p>${t('尚無操作紀錄','Chưa có thao tác')}</p>`}</details>`;
  }
  function pendingPanel() {
    if(!draft())return '';
    const data=snap(),pending=[];
    for(const part of data.parts.filter(part=>!part.isDeleted)) {
      const missing=[];
      if(!part.nameVi?.trim())missing.push(t('零件名稱','Tên linh kiện'));
      if(!part.supplierIds?.length)missing.push(t('供應商','Nhà cung cấp'));
      if(!data.categories.some(category=>category.id===part.categoryId))missing.push(t('類別','Nhóm'));
      if(missing.length)pending.push({partCode:part.code,label:part.code,missing});
    }
    for(const item of data.items.filter(item=>!item.isDeleted)) {
      const missing=[];
      if(!item.nameVi?.trim())missing.push(t('檢查項目','Hạng mục kiểm tra'));
      if(!item.methodVi?.trim())missing.push(t('檢測方法','Phương pháp kiểm tra'));
      if(item.inspectionMode==='equipment'&&!item.equipmentId)missing.push(t('檢具','Thiết bị'));
      if(!(item.rules||[]).some(rule=>['batch','time'].includes(rule.cadence)))missing.push(t('正式頻率','Tần suất chính thức'));
      if(missing.length)pending.push({partCode:item.partCode,itemId:item.id,label:item.checkNo,missing});
    }
    if(!pending.length)return '';
    return `<details class="iqc-panel iqc-alert iqc-pending"><summary>${t('待補項目','Mục cần bổ sung')} · ${pending.length}</summary><ul class="iqc-alert-list">${pending.slice(0,40).map(row=>`<li><b data-i18n-skip="true">${h(row.label)}</b> · ${h(row.missing.join('、'))}<button type="button" class="button ghost iqc-small" data-iqc-pending="${h(row.itemId||row.partCode)}">${t('前往修正','Đến sửa')}</button></li>`).join('')}${pending.length>40?`<li>${t('其餘待補請依零件篩選','Các mục còn lại hãy lọc theo linh kiện')} · ${pending.length-40}</li>`:''}</ul></details>`;
  }
  function importPanel() { return ''; }
  function filteredParts() {
    const data = snap();
    return data.parts.filter(part => !part.isDeleted &&
      (!ui.search || `${part.code} ${part.nameVi}`.toLocaleLowerCase().includes(ui.search.toLocaleLowerCase())) &&
      (!ui.category || part.categoryId === ui.category) &&
      (!ui.supplier || part.supplierIds.includes(ui.supplier)));
  }
  function partRows(data=snap(),parts=filteredParts()) {
    const supplierName=nameIndex(data.suppliers),categoryName=nameIndex(data.categories);
    return parts.map(part => `<div class="iqc-part ${ui.partCode === part.code ? 'active' : ''}" data-select-part="${h(part.code)}" tabindex="0" role="button" aria-label="${h(part.code)} ${h(part.nameVi)}"><div class="iqc-part-media">${part.photos[0] ? `<button class="iqc-thumb-button" data-photo-part="${h(part.code)}" aria-label="${t('查看全部照片', 'Xem tất cả ảnh')}"><img decoding="async" loading="lazy" class="iqc-part-thumb" src="${h(part.photos[0].src)}" alt="${t('零件照片', 'Ảnh linh kiện')}"></button>` : `<div class="iqc-part-thumb iqc-empty">${t('無圖', 'Không ảnh')}</div>`}${draft() && mayEdit() ? `<div class="iqc-part-tools"><button class="button ghost iqc-small" data-edit-part="${h(part.code)}">${t('修改', 'Sửa')}</button><button class="button iqc-danger iqc-small" data-delete-part="${h(part.code)}">${t('刪除', 'Xóa')}</button></div>` : ''}</div><div class="iqc-part-copy"><strong data-i18n-skip="true">${h(part.code)} ${h(part.nameVi)}</strong><span class="iqc-source"><b>${t('供應商', 'Nhà cung cấp')}:</b> <span data-i18n-skip="true">${h(part.supplierIds.length ? part.supplierIds.map(id => supplierName(id)).join(' → ') : t('待核對','Cần đối chiếu'))}</span></span><span class="iqc-category-label"><b>${t('類別', 'Nhóm')}:</b> <span data-i18n-skip="true">${h(categoryName(part.categoryId) || '—')}</span></span></div></div>`).join('') || `<div class="iqc-empty">${t('沒有符合條件的零件', 'Không có linh kiện phù hợp')}</div>`;
  }
  function listPanel() {
    const data = snap(), parts = filteredParts(),activeCount=data.parts.filter(part=>!part.isDeleted).length;
    const supplierOptions = [...data.suppliers].sort((a,b) => {
      const rank = x => x.nameVi === 'NƯỚC NGOÀI' ? 0 : x.nameVi === 'CÔNG TY' ? 1 : 2;
      return rank(a) - rank(b) || a.nameVi.localeCompare(b.nameVi, 'vi');
    });
    return `<section class="iqc-panel iqc-list"><div class="iqc-field-head"><h3>${t('零件清單', 'Danh sách linh kiện')} (${activeCount})</h3>${mayCreate() ? `<button class="button signal iqc-small" id="iqc-add-part">${t('＋新增零件','＋Thêm linh kiện')}</button>` : ''}</div><div class="iqc-field"><label for="iqc-search">${t('搜尋零件編號或名稱', 'Tìm mã hoặc tên linh kiện')}</label><input id="iqc-search" value="${h(ui.search)}" placeholder="${t('搜尋零件編號或名稱', 'Tìm mã hoặc tên linh kiện')}"></div><div class="iqc-field"><div class="iqc-field-head"><label for="iqc-supplier">${t('供應商', 'Nhà cung cấp')}</label>${mayEdit() ? `<button class="button ghost iqc-small" id="iqc-manage-suppliers">${t('修改供應商清單','Sửa danh sách nhà cung cấp')}</button>` : ''}</div><select id="iqc-supplier"><option value="">${t('所有供應商', 'Tất cả nhà cung cấp')}</option>${supplierOptions.map(item => `<option value="${h(item.id)}" ${ui.supplier === item.id ? 'selected' : ''} data-i18n-skip="true">${h(item.nameVi)}</option>`).join('')}</select></div><div class="iqc-field"><div class="iqc-field-head"><label for="iqc-category">${t('零件類別', 'Nhóm linh kiện')}</label>${mayEdit() ? `<button class="button ghost iqc-small" id="iqc-manage-categories">${t('修改類別清單','Sửa danh sách nhóm')}</button>` : ''}</div><select id="iqc-category"><option value="">${t('所有類別', 'Tất cả nhóm')}</option>${data.categories.map(item => `<option value="${h(item.id)}" ${ui.category === item.id ? 'selected' : ''} data-i18n-skip="true">${h(item.nameVi)}</option>`).join('')}</select></div><p class="iqc-muted iqc-match-count" aria-live="polite">${t('符合', 'Phù hợp')} ${parts.length} / ${activeCount} ${t('個零件', 'linh kiện')}</p><div class="iqc-part-list">${partRows(data,parts)}</div></section>`;
  }
  function detailPanel(data = snap(), state = ui, readOnly = false) {
    const part = data.parts.find(row => row.code === state.partCode && (readOnly || !row.isDeleted));
    if (!part) return `<section class="iqc-panel iqc-detail iqc-empty">${t('從左側選擇零件查看內容', 'Chọn linh kiện bên trái để xem chi tiết')}</section>`;
    const errors = data.errors.filter(row => row.partCode === part.code && !row.isDeleted);
    if (!errors.some(row => row.id === state.errorId)) state.errorId = errors[0]?.id || '';
    const error = errors.find(row => row.id === state.errorId);
    const items = data.items.filter(row => row.errorId === error?.id && !row.isDeleted);
    const frequency = item => {
      const formal = item.rules.filter(rule => rule.cadence === 'batch' || rule.cadence === 'time');
      return formal.length ? formal.map(rule => `${rule.cadence === 'batch' ? t('按批次','Theo lô') : t('按時間','Theo thời gian')} / ${ruleKindLabel(rule)}${rule.cadence === 'batch' && rule.value ? ` · ${rule.value}` : ''}`).join('；') : t('待確認', 'Chờ xác nhận');
    };
    const itemCard = item => {
      const photos = item.mediaItems || [];
      const equipment = item.equipmentSnapshot;
      const equipmentPhoto = equipment?.photoId ? `/api/routine-equipment/photo?id=${encodeURIComponent(equipment.photoId)}` : '';
      return `<article class="iqc-item">
        <div class="iqc-item-head"><span class="iqc-item-number"><b data-i18n-skip="true">${h(item.checkNo)}</b><span class="iqc-status">${item.isEnabled ? t('啟用','Đang dùng') : t('停用','Tạm ngưng')}</span></span><span class="iqc-item-title" data-i18n-skip="true">${h(item.nameVi || '—')}</span><span class="iqc-item-meta">${t('正式檢查頻率','Tần suất kiểm tra chính thức')}: ${h(frequency(item))}</span></div>
        <div class="iqc-item-body"><p><b>${t('檢測方法','Phương pháp kiểm tra')}:</b> <span data-i18n-skip="true">${h(item.methodVi || '—')}</span></p>
        ${item.inspectionSpecVi && item.inspectionSpecVi !== item.methodVi ? `<p class="iqc-compat-note"><b>${t('舊檢查規格待確認', 'Quy cách cũ cần xác nhận')}:</b> <span data-i18n-skip="true">${h(item.inspectionSpecVi)}</span></p>` : ''}
        <p><b>${t('正式檢查頻率','Tần suất kiểm tra chính thức')}:</b> ${h(frequency(item))}</p>
        <div class="iqc-equipment-inline"><b>${t('檢具／設備','Dụng cụ / thiết bị')}:</b>${item.equipmentId ? `<span class="iqc-equipment-chip">${equipmentPhoto ? `<img src="${h(equipmentPhoto)}" alt="">` : '<span class="iqc-equipment-no-photo">◇</span>'}<span><strong data-i18n-skip="true">${h(equipment?.assetCode || '')}／${h(equipment?.pieceMark || '')}</strong><br><span data-i18n-skip="true">${h(equipment?.name || '')}</span><br>${t('生效設備', 'Thiết bị hiệu lực')}</span></span>` : `<span>${item.inspectionMode === 'visual' ? t('目視檢查','Kiểm tra bằng mắt') : t('尚未設定','Chưa thiết lập')}</span>`}</div>
        <div class="iqc-item-photo-line"><b>${t('檢查照片', 'Ảnh kiểm tra')}:</b> ${photos.length ? `<button type="button" data-item-photo="${h(item.id)}" data-photo-index="0"><img src="${h(photos[0].src)}" alt=""><span>${t('照片','Ảnh')} ${photos.length} ${t('張','tấm')}</span></button>` : t('無照片','Không ảnh')}</div>
        ${!readOnly && draft() && mayEdit() ? `<div class="iqc-row-actions"><button class="button ghost iqc-small" data-edit-item="${h(item.id)}">${t('修改檢查項目','Sửa hạng mục')}</button><button class="button iqc-danger iqc-small" data-delete-item="${h(item.id)}">${t('刪除','Xóa')}</button></div>` : ''}</div></article>`;
    };
    const supplierNames = part.supplierIds.map(id => name(data.suppliers, id));
    return `<div class="iqc-detail">
      <section class="iqc-panel iqc-part-summary"><div class="iqc-detail-header"><div><h2 data-i18n-skip="true">${h(part.code)} ${h(part.nameVi)}</h2><p><b>${t('規格','Quy cách')}:</b> <span data-i18n-skip="true">${h(part.specificationVi || '—')}</span></p></div><span class="iqc-status" data-i18n-skip="true">${h(name(data.categories,part.categoryId))}</span></div><p><b>${t('供應商','Nhà cung cấp')}:</b> ${supplierNames.length ? supplierNames.map((supplier,index) => `<span class="iqc-supplier-tag"><b>${index+1}</b> <span data-i18n-skip="true">${h(supplier)}</span></span>`).join(' ') : t('待核對','Cần đối chiếu')}</p><div class="iqc-photo-strip">${part.photos.map((photo,index) => `<button data-photo-part="${h(part.code)}" data-photo-index="${index}"><img src="${h(photo.src)}" alt="${t('零件照片','Ảnh linh kiện')} ${index+1}"></button>`).join('') || t('原檔無圖','Tệp gốc không có ảnh')}</div></section>
      <section class="iqc-panel iqc-error-list"><div class="iqc-detail-header"><h3>${t('錯誤代碼','Mã lỗi')}</h3>${!readOnly && draft() && mayCreate() ? `<button class="button signal iqc-small" id="iqc-add-error">${t('＋新增錯誤代碼','＋Thêm mã lỗi')}</button>` : ''}</div><details open><summary>${t('選擇錯誤代碼','Chọn mã lỗi')} · ${errors.length}</summary><div class="iqc-error-options">${errors.map(row => `<div class="iqc-error-entry"><button type="button" class="iqc-error-choice ${row.id === state.errorId ? 'active' : ''}" data-select-error="${h(row.id)}"><b data-i18n-skip="true">${h(row.code)}</b><span data-i18n-skip="true">${h(row.nameVi)}</span></button>${!readOnly && draft() && mayEdit() ? `<div class="iqc-row-actions"><button class="button ghost iqc-small" data-edit-error="${h(row.id)}">${t('修改','Sửa')}</button><button class="button iqc-danger iqc-small" data-delete-error="${h(row.id)}">${t('刪除','Xóa')}</button></div>` : ''}</div>`).join('') || t('尚無錯誤代碼','Chưa có mã lỗi')}</div></details></section>
      <section class="iqc-panel iqc-checks"><div class="iqc-detail-header"><h3>${t('檢查項目','Hạng mục kiểm tra')}</h3>${error && !readOnly && draft() && mayCreate() ? `<button class="button signal iqc-small" data-add-item="${h(error.id)}">${t('＋新增檢查項目','＋Thêm hạng mục')}</button>` : ''}</div>${error ? `${items.map(itemCard).join('') || `<p class="iqc-muted">${t('尚無檢查項目','Chưa có hạng mục')}</p>`}` : `<p>${t('請先選擇錯誤代碼','Hãy chọn mã lỗi')}</p>`}</section>
    </div>`;
  }
  function render() {
    if(renderReadDenied())return;
    if (!root?.isConnected) return;
    if (!control) return;
    if(selected()?.snapshotDeferred){
      root.innerHTML=`${versionBar()}<section class="iqc-panel" role="${versionReadError?'alert':'status'}">${h(versionReadError?displayDraftError(versionReadError):t('正在讀取生效版本…','Đang đọc phiên bản hiệu lực…'))}<button id="iqc-active-retry">${t('重新讀取','Đọc lại')}</button></section>`;
      root.querySelectorAll('button:not(#iqc-active-retry)').forEach(button=>button.disabled=true);
      root.querySelector('#iqc-version')?.addEventListener('change',event=>{void selectVersion(event.target.value);});
      root.querySelector('#iqc-active-retry')?.addEventListener('click',()=>{void retrySelectedVersion();});return;
    }
    const listScroll = root.querySelector('.iqc-part-list')?.scrollTop || 0;
    const pageScroll = window.scrollY;
    root.innerHTML = `${versionBar()}${sharedStatus()}${issuesPanel()}${historyPanel()}${pendingPanel()}${importPanel()}<div class="iqc-grid">${listPanel()}${detailPanel()}</div>`;
    for(const [id,action]of [['iqc-operation-check','resolveUnknown'],['iqc-operation-retry','retryUnknown']])root.querySelector('#'+id)?.addEventListener('click',async()=>{try{await transport()[action]();await load();render();}catch(error){notice(displayDraftError(error));}});
    bind();
    if(control.workflow&&(window.sharedDraftPermissionAllowed?.(sharedClient,'approval.compare')??true)&&window.hasPermission?.('approval.compare')){
      const button=document.createElement('button');button.id='iqc-case-history';button.className='button ghost';button.textContent=t('送審案件','Hồ sơ gửi duyệt');root.querySelector('.iqc-version')?.append(button);
      button.onclick=()=>window.openSharedDraftHistory({client:transport(),editable:()=>!!draft()&&mayEdit(),onApplied:async()=>{await load();render();notice(t('已还原至草稿，尚未儲存','Đã khôi phục vào bản nháp, chưa lưu'));}}).catch(error=>notice(displayDraftError(error)));
    }
    const list = root.querySelector('.iqc-part-list');
    if (list) list.scrollTop = listScroll;
    sharedClient?.gatePermissions?.();
    window.renderSharedDraftValidation?.({client:sharedClient,flow:control?.workflow,after:root.querySelector('#iqc-shared-status'),language:document.documentElement.lang,onLocate:issue=>{
      if(['categories','suppliers'].includes(issue.path?.[0])&&mayEdit()){
        manageList(issue.path[0]);document.querySelectorAll('[data-row-edit]').forEach(button=>{if(button.dataset.rowEdit===issue.path[1]?.id)button.click();});return;
      }
      const id=issue.path?.[1]?.id,item=snap().items.find(row=>row.id===id),part=snap().parts.find(row=>row.id===id),error=snap().errors.find(row=>row.id===id);
      const partCode=item?.partCode||part?.code||error?.partCode;if(!partCode||!mayEdit())return;
      ui.search='';ui.supplier='';ui.category='';ui.partCode=partCode;ui.errorId=item?.errorId||error?.id||'';render();if(item)editItem(item.id);else if(part)editPart(partCode);else editError(error.id);
    }});
    window.VersionDraftUI?.mount(root,{header:'.iqc-version',historyClient:transport,module:'IQC',scope:t('IQC 全庫','Toàn bộ IQC'),version:selected(),versions:control.versions,active:active(),flow:control.workflow,busy:ui.busy,failed:sharedClient?.hasUnknown(),actions:{begin:'#iqc-begin',save:'#iqc-save',submit:'#iqc-submit',withdraw:'#iqc-withdraw'},review:()=>{state.view='approval';state.approvalTab='quality';window.render();},errors:'[data-shared-issue-kind="error"]',missing:'.iqc-alert,[data-shared-issue-kind="missing"]',checked:{missing:!!draft()},history:['.iqc-work-history','#iqc-case-history','[data-shared-issue-kind="warning"]'],status:['#iqc-shared-status']});
    window.scrollTo(0, pageScroll);
  }
  // Search updates only the results. Replacing a focused input on every keystroke
  // can replay a key/IME composition and turn a single "3" into "33".
  function refreshPartRows() {
    const list = root.querySelector('.iqc-part-list');
    if (!list) return;
    const data=snap(),parts=filteredParts();
    list.innerHTML = partRows(data,parts);
    root.querySelector('.iqc-match-count').textContent = `${t('符合', 'Phù hợp')} ${parts.length} / ${snap().parts.filter(part => !part.isDeleted).length} ${t('個零件', 'linh kiện')}`;
    bindPartRows();
  }
  function html() { return '<section class="iqc-page" id="iqc-page" data-i18n-skip="true"><div class="iqc-panel">正在載入 IQC 資料…</div></section>'; }
  async function mount(container) {
    root = container.querySelector('#iqc-page');
    if (!root) return;
    const mountToken=++mountSequence,mountLoadSequence=loadSequence+1,mountIdentity=identity(),mountEpoch=window.ProcessSync?.identityGeneration?.(),ownedRoot=root,delivery=window.ProcessSync?.captureDelivery?.(),current=()=>mountToken===mountSequence&&loadSequence===mountLoadSequence&&identity()===mountIdentity&&(typeof mountEpoch!=='number'||window.ProcessSync?.identityGeneration?.()===mountEpoch)&&!window.ProcessSync?.requiresReload&&root===ownedRoot&&ownedRoot.isConnected&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));
    navigationError=null;try { await load();if(!current())return; render(); } catch (error) {if(!current())return;navigationError=error; root.innerHTML = `<section class="iqc-panel iqc-alert" role="alert">${h(displayDraftError(error))} <button class="button ghost" id="iqc-retry">${t('重新載入','Tải lại')}</button></section>`; root.querySelector('#iqc-retry').onclick = () => mount(container); }
    if(current())scheduleRefresh();
  }
  function scheduleRefresh(){const pollScheduleOwner=pollTimer.capture();const delivery=window.ProcessSync?.captureDelivery?.(),current=()=>pollTimer.isCurrent(pollScheduleOwner)&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));pollTimer.schedule(async()=>{
    if(!current())return;
    if(!root?.isConnected&&!reviewRoot?.isConnected)return;
    const actor=identity(),epoch=window.ProcessSync?.identityGeneration?.(),loadOwner=loadSequence,mutationOwner=mutationSequence;
    let ownedControl=control,ownedRevision=revision;
    const ownerCurrent=()=>current()&&!ui.busy&&!window.ProcessSync?.requiresReload&&identity()===actor&&(typeof epoch!=='number'||window.ProcessSync?.identityGeneration?.()===epoch)&&loadSequence===loadOwner&&mutationSequence===mutationOwner;
    const modelCurrent=()=>ownerCurrent()&&control===ownedControl&&revision===ownedRevision;
    try{if(!ui.busy&&identity()?.id&&document.visibilityState!=='hidden'&&transport().canPoll('state')){
      const flow=control?.workflow,result=await transport().read(flow?`${flow.generation}:${flow.revision}`:'',{isCurrent:modelCurrent,requireAcceptedAccess:true});
      if(!modelCurrent())return;if(!result.unchanged&&result.control){const wasOpen=['draft','pending'].includes(selected()?.status);validateIqcPayload(result,true);if(!modelCurrent())return;versionReadSequence++;control=result.control;revision=result.revision;activeDeferredId=result.iqcProjection?.activeVersionId||'';
        ownedControl=control;ownedRevision=revision;
        if(wasOpen)ui.versionId=control.versions.find(v=>['draft','pending'].includes(v.status))?.id||control.activeVersionId||'';
        if(selected()?.snapshotDeferred&&!document.querySelector('.iqc-dialog-overlay,.iqc-lightbox')){
          const id=selected().id,hydration=hydrateVersion(id,()=>modelCurrent()&&selected()?.id===id),hydrationSequence=versionReadSequence;
          await hydration;
          // Hydration legitimately replaces control; only its unchanged owner may render it.
          if(!ownerCurrent()||revision!==ownedRevision||versionReadSequence!==hydrationSequence||selected()?.id!==id)return;
          ownedControl=control;
        }
        if(!modelCurrent())return;
        if(!document.querySelector('.iqc-dialog-overlay')&&!root?.contains(document.activeElement))render();
        else {const status=root?.querySelector('#iqc-shared-status');if(status)status.textContent=t('共用內容已更新；彈窗輸入保留，套用時核對來源。','Nội dung chung đã cập nhật; giữ dữ liệu cửa sổ và kiểm tra nguồn khi áp dụng.');}
      }
    }}catch(error){if(!modelCurrent())return;const status=root?.querySelector('#iqc-shared-status');if(status)status.textContent=t('同步讀取失敗；未覆蓋目前內容。','Không đọc được dữ liệu đồng bộ; giữ nguyên nội dung.')+' '+displayDraftError(error);}
    // A superseded model must not cancel this still-owned foreground scheduler.
    finally{if(current())scheduleRefresh();}
  });}
  function twoConfirm(label) {
    return confirm(`${label}？`) && confirm(`${label}。此操作會寫入 IQC 草稿，請再次確認。`);
  }
  function dialog(content) {
    if(readDenied)throw readDenied;
    if(host.ProcessSync?.requiresReload)throw Error('DELIVERY_INVALIDATED_REOPEN_REQUIRED');
    if(!document.querySelector('.iqc-dialog-overlay')){dialogBase=copy(snap());dialogGeneration=control?.workflow?.generation||null;}
    const opener = document.activeElement, actor = identity(), delivery = host.ProcessSync?.captureDelivery?.();
    const overlay = document.createElement('div'); overlay.className = 'iqc-dialog-overlay'; overlay.dataset.i18nSkip = 'true';
    overlay.innerHTML = `<div class="iqc-dialog" role="dialog" aria-modal="true">${content}</div>`;
    if(control?.workflow){
      overlay.querySelectorAll('[name="nameVi"],[name="categoryId"]').forEach(input=>input.removeAttribute('required'));
      overlay.querySelectorAll('button[type="submit"]').forEach(button=>button.textContent=t('套用修改 · 尚未儲存','Áp dụng thay đổi · chưa lưu'));
    }
    document.body.append(overlay);
    sharedClient?.gatePermissions?.();
    overlay.style.zIndex = String(100010 + document.querySelectorAll('.iqc-dialog-overlay').length);
    const owner = { overlay, base:dialogBase, generation:dialogGeneration, terminal:false,
      detach(){overlay.inert=true;document.removeEventListener('keydown',esc);overlay.remove();},
      current(){
        if(owner.terminal)return false;
        if(host.ProcessSync?.requiresReload||identity()!==actor||(delivery&&host.ProcessSync?.isCurrentDelivery?.(delivery)===false)){
          owner.terminal=true;owner.detach();return false;
        }
        return overlay.isConnected;
      },
      assert(){if(!owner.current())throw Error('DELIVERY_INVALIDATED_REOPEN_REQUIRED');}
    };
    editorOwners.add(owner);
    const close = () => { if(!owner.current())return;owner.terminal=true;editorOwners.delete(owner);overlay.remove();if(!document.querySelector('.iqc-dialog-overlay')){dialogBase=null;dialogGeneration=null;render();} document.removeEventListener('keydown', esc); if (opener?.isConnected) opener.focus({preventScroll:true}); };
    const esc = event => {
      if(!owner.current())return;
      if ([...document.querySelectorAll('.iqc-dialog-overlay')].at(-1) !== overlay || document.querySelector('.iqc-lightbox')) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const nodes=[...overlay.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(node=>!node.disabled&&node.getClientRects().length);
        const edge=event.shiftKey?nodes[0]:nodes.at(-1);
        if (document.activeElement===edge || !overlay.contains(document.activeElement)) {event.preventDefault();(event.shiftKey?nodes.at(-1):nodes[0])?.focus({preventScroll:true});}
      }
    };
    document.addEventListener('keydown', esc);
    overlay.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
    overlay.querySelector('input:not([readonly]),textarea,select,button')?.focus({preventScroll:true});
    return { overlay, close, owner };
  }
  async function saveSnapshot(next, success = 'IQC 草稿已同步', owner) {
    owner?.assert();
    const v = draft(); if (!v) throw Error('IQC 草稿不是可修改狀態');
    await post('applySnapshot', { base:copy(owner?.base||dialogBase||v.snapshot),snapshot:next }, owner);
    owner?.assert();
    notice(t('已同步至共用草稿，尚未手動儲存','Đã đồng bộ vào bản nháp chung, chưa lưu thủ công')+' · '+success.replaceAll('已儲存','已套用').replaceAll('Đã lưu','Đã áp dụng'));
  }
  async function withDraft(action) {
    try {
      if (!mayEdit()) return;
      const pending = control.versions.find(v => v.status === 'pending');
      if (pending) return notice(t('目前版本已送審，請先撤回或發回再修改。','Phiên bản đang chờ duyệt; hãy rút hoặc trả lại trước khi sửa.'));
      if (!draft()) {
        const existing = control.versions.find(v => v.status === 'draft');
        if (existing) { ui.versionId = existing.id; render(); }
        else await post('begin');
      }
      action();
    } catch (error) { notice(displayDraftError(error)); }
  }
  async function mutateSnapshot(change, success, owner) {
    owner?.assert();
    const next = copy(owner?.base||dialogBase||draft().snapshot); change(next); await saveSnapshot(next, success, owner);
  }
  async function upload(file, owner) {
    if(readDenied)throw readDenied;
    owner?.assert();
    const response = await fetch(photoUrl, { method: 'PUT', headers: { ...window.ProcessSync?.platformHeaders?.(), 'Content-Type': file.type }, body: file });
    owner?.assert();
    const data = await response.json();
    owner?.assert();
    if (!response.ok || !data.id) throw Error(data.error || '照片保存失敗');
    return { id: data.id, src: data.url, name: file.name };
  }
  function photoViewerPhotos(photos, start = 0, label = t('照片', 'Ảnh')) {
    const owner = host.ProcessSync?.captureDelivery?.();
    if (!photos.length || host.ProcessSync?.requiresReload || owner && host.ProcessSync?.isCurrentDelivery?.(owner) !== true) return;
    let index = start, closed = false;
    const overlay = document.createElement('div'); overlay.className = 'iqc-lightbox'; overlay.dataset.i18nSkip = 'true'; document.body.append(overlay);
    const current = () => !closed && !host.ProcessSync?.requiresReload && (!owner || host.ProcessSync?.isCurrentDelivery?.(owner) === true);
    const draw = () => { if (!current()) { close(); return; } overlay.innerHTML = `<div class="iqc-lightbox-content"><div class="iqc-actions"><button class="button ghost" id="iqc-photo-prev">←</button><b>${index+1} / ${photos.length}</b><button class="button ghost" id="iqc-photo-next">→</button><button class="button ghost" id="iqc-photo-close">${t('關閉','Đóng')}</button></div><img src="${h(photos[index].src)}" alt="${h(label)}"><p data-i18n-skip="true">${h(photos[index].note || photos[index].name || '')}</p></div>`; overlay.querySelector('#iqc-photo-prev').onclick = () => { if (!current()) { close(); return; } index = (index - 1 + photos.length) % photos.length; draw(); }; overlay.querySelector('#iqc-photo-next').onclick = () => { if (!current()) { close(); return; } index = (index + 1) % photos.length; draw(); }; overlay.querySelector('#iqc-photo-close').onclick = close; };
    const key = event => { if (!current()) { close(); return; } if (event.key === 'Escape') close(); if (event.key === 'ArrowLeft') { index = (index - 1 + photos.length) % photos.length; draw(); } if (event.key === 'ArrowRight') { index = (index + 1) % photos.length; draw(); } };
    const close = () => { if (closed) return; closed = true; document.removeEventListener('keydown', key); overlay.querySelectorAll('button').forEach(button => button.onclick = null); overlay.querySelectorAll('img').forEach(image => image.removeAttribute('src')); overlay.replaceChildren(); overlay.remove(); photoViewerDisposers.delete(close); photos = []; };
    photoViewerDisposers.add(close); document.addEventListener('keydown', key); draw();
  }
  function photoViewer(partCode, start = 0) {
    const part = snap().parts.find(item => item.code === partCode);
    photoViewerPhotos(part?.photos || [], start, t('零件照片', 'Ảnh linh kiện'));
  }
  function itemPhotoViewer(itemId, start = 0) {
    const item = snap().items.find(row => row.id === itemId);
    photoViewerPhotos(item?.mediaItems || [], start, t('檢查項目照片', 'Ảnh hạng mục'));
  }

  function bindPartRows() {
    const list = root?.querySelector('.iqc-part-list');
    if (!list) return;
    list.querySelectorAll('[data-select-part]').forEach(row => {
      const select = () => { ui.partCode = row.dataset.selectPart; ui.errorId = ''; render(); };
      row.addEventListener('click', event => { if (!event.target.closest('button')) select(); });
      row.addEventListener('keydown', event => { if (event.target === row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(); } });
    });
    list.querySelectorAll('[data-photo-part]').forEach(button => button.onclick = event => { event.stopPropagation(); photoViewer(button.dataset.photoPart, 0); });
    list.querySelectorAll('[data-edit-part]').forEach(button => button.onclick = event => { event.stopPropagation(); editPart(button.dataset.editPart); });
    list.querySelectorAll('[data-delete-part]').forEach(button => button.onclick = async event => {
      event.stopPropagation(); const code = button.dataset.deletePart;
      if (!twoConfirm(`${t('刪除零件', 'Xóa linh kiện')} ${code}`)) return;
      try { await mutateSnapshot(next => { next.parts.find(item => item.code === code).isDeleted = true; }, t('零件已標記刪除於草稿','Đã đánh dấu xóa linh kiện trong bản nháp')); if (ui.partCode === code) ui.partCode = ''; render(); }
      catch (error) { notice(displayDraftError(error)); }
    });
  }

  function bind() {
    const on = (selector, event, handler) => root.querySelectorAll(selector).forEach(node => node.addEventListener(event, handler));
    on('#iqc-version', 'change', event => { void selectVersion(event.target.value); });
    const updateSearch = event => { if (event.isComposing || ui.search === event.target.value) return; ui.search = event.target.value; refreshPartRows(); };
    on('#iqc-search', 'input', updateSearch);
    on('#iqc-search', 'compositionend', updateSearch);
    on('#iqc-supplier', 'change', event => { ui.supplier = event.target.value; render(); });
    on('#iqc-category', 'change', event => { ui.category = event.target.value; render(); });
    bindPartRows();
    on('[data-select-error]', 'click', event => { ui.errorId = event.currentTarget.dataset.selectError; render(); });
    on('[data-iqc-issue-index]', 'click', event => {
      const issue = control.issues[Number(event.currentTarget.dataset.iqcIssueIndex)];
      if (!issue?.partCode) return;
      const code = issue.partCode;
      ui.search = ''; ui.supplier = ''; ui.category = ''; ui.partCode = code; ui.errorId = '';
      const checkNo = String(issue.message || '').match(/[A-Za-z0-9]+-IQC-L\d+-\d+/)?.[0];
      const issueItem = checkNo ? snap().items.find(item => item.checkNo === checkNo) : null;
      if (issueItem) { ui.errorId = issueItem.errorId; ui.openItems.add(issueItem.id); }
      render(); root.querySelector('.iqc-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!draft() || !mayEdit()) return;
      if (issueItem) editItem(issueItem.id);
      else if (issue.type === 'NO_SOURCE_IMAGE' || String(issue.type).startsWith('SUPPLIER_')) editPart(code);
    });
    on('[data-iqc-pending]', 'click', event => {
      const id=event.currentTarget.dataset.iqcPending;
      const item=snap().items.find(row=>row.id===id),partCode=item?.partCode||id;
      ui.search='';ui.supplier='';ui.category='';ui.partCode=partCode;ui.errorId=item?.errorId||'';
      render();root.querySelector('.iqc-detail')?.scrollIntoView({behavior:'smooth',block:'start'});
      if(!mayEdit())return;
      if(item)editItem(item.id);else editPart(partCode);
    });
    on('.iqc-detail [data-photo-part]', 'click', event => photoViewer(event.currentTarget.dataset.photoPart, Number(event.currentTarget.dataset.photoIndex || 0)));
    on('.iqc-detail [data-item-photo]', 'click', event => { event.preventDefault(); event.stopPropagation(); itemPhotoViewer(event.currentTarget.dataset.itemPhoto, Number(event.currentTarget.dataset.photoIndex || 0)); });
    on('[data-item-details]', 'toggle', event => { const id = event.currentTarget.dataset.itemDetails; if (event.currentTarget.open) ui.openItems.add(id); else ui.openItems.delete(id); });
    on('#iqc-preview', 'click', async () => { try { const response = await fetch('/process/iqc-source.json', { cache: 'no-store' }); if (!response.ok) throw Error('IQC 來源預覽尚未建立'); const preview = await response.json(); if (preview.snapshot?.parts?.length !== 187) throw Error('IQC 來源筆數不符，沒有提供匯入'); ui.preview = preview; ui.previewError = preview.ready ? '' : '類別對照檔尚未核對完成；可預覽來源，但不能匯入草稿'; } catch (error) { ui.previewError = error.message; } render(); });
    on('#iqc-import', 'click', importPreview);
    on('#iqc-begin', 'click', async () => { try { await post('begin'); notice(t('IQC 草稿已開啟','Đã mở bản nháp IQC')); } catch (error) { notice(displayDraftError(error)); } });
    on('#iqc-save', 'click', async () => { try { await post('save');notice(t('已儲存全員已同步的 IQC 草稿','Đã lưu toàn bộ bản nháp IQC đã đồng bộ của mọi người')); } catch (error) { notice(displayDraftError(error)); } });
    on('#iqc-submit', 'click', async () => { if (!confirm(t('確定送出審核？送審後將無法編輯，須先撤回或發回。','Gửi duyệt? Sau khi gửi sẽ không thể chỉnh sửa cho đến khi rút hoặc được trả lại.'))) return; const v = draft(); try { await post('submit', { versionId: v.id, versionRevision: v.revision, snapshot: copy(v.snapshot) }); notice(t('IQC 草稿已送出主管審核','Đã gửi bản nháp IQC để quản lý duyệt')); } catch (error) { notice(displayDraftError(error)); } });
    on('#iqc-withdraw', 'click', async () => { try { await post('withdraw'); void window.RoutineEquipmentUI?.reconcilePendingReplacements?.(); notice(t('IQC 送審已撤回，仍保留同一草稿','Đã rút hồ sơ IQC; bản nháp được giữ lại')); } catch (error) { notice(displayDraftError(error)); } });
    on('#iqc-to-review', 'click', () => { document.querySelector('[data-dual-view="approval"]')?.click(); setTimeout(() => document.querySelector('#approval-tab-quality')?.click(), 0); });
    on('#iqc-manage-suppliers', 'click', () => withDraft(() => manageList('suppliers')));
    on('#iqc-manage-categories', 'click', () => withDraft(() => manageList('categories')));
    on('#iqc-add-part', 'click', () => withDraft(() => editPart()));
    on('#iqc-add-error', 'click', () => editError());
    on('[data-edit-error]', 'click', event => editError(event.currentTarget.dataset.editError));
    on('[data-delete-error]', 'click', async event => { const id = event.currentTarget.dataset.deleteError; const error = snap().errors.find(item => item.id === id); if (snap().items.some(item => item.errorId === id && !item.isDeleted)) return notice(t('請先刪除所屬檢查項目','Hãy xóa các hạng mục thuộc mã lỗi trước')); if (!twoConfirm(`${t('刪除錯誤代碼', 'Xóa mã lỗi')} ${error.code}`)) return; try { await mutateSnapshot(next => { next.errors.find(item => item.id === id).isDeleted = true; }, t('錯誤代碼已標記刪除','Đã đánh dấu xóa mã lỗi')); } catch (failure) { notice(displayDraftError(failure)); } });
    on('[data-add-item]', 'click', event => editItem('', event.currentTarget.dataset.addItem));
    on('[data-edit-item]', 'click', event => editItem(event.currentTarget.dataset.editItem));
    on('[data-delete-item]', 'click', async event => { const id = event.currentTarget.dataset.deleteItem, item = snap().items.find(row => row.id === id); if (!twoConfirm(`${t('刪除檢查項目', 'Xóa hạng mục')} ${item.checkNo}`)) return; try { await mutateSnapshot(next => { next.items.find(row => row.id === id).isDeleted = true; }, t('檢查項目已標記刪除','Đã đánh dấu xóa hạng mục')); } catch (failure) { notice(displayDraftError(failure)); } });
  }

  async function importPreview() {
    const source = ui.preview;
    if (!source?.ready || !mayEdit()) return;
    if (!confirm(`${t('確認匯入', 'Xác nhận nhập')} ${source.snapshot.parts.length} ${t('個零件至未核准草稿？', 'linh kiện vào bản nháp chưa duyệt?')}`)) return;
    const data = copy(source);
    const photos = data.snapshot.parts.flatMap(part => part.photos);
    let cursor = 0;
    const worker = async () => { while (cursor < photos.length) { const photo = photos[cursor++]; const response = await fetch(photo.webPath); if (!response.ok) throw Error(`${photo.webPath} 讀取失敗`); const bytes = await response.blob(); const uploaded = await upload(new File([bytes], photo.name || 'iqc-source.jpg', { type: 'image/jpeg' })); if (uploaded.id !== photo.id) throw Error(`${photo.webPath} 圖片校驗失敗`); photo.src = uploaded.src; delete photo.webPath; } };
    try { await Promise.all(Array.from({ length: 6 }, worker)); await post('import', { source: data }); ui.preview = null; notice('IQC Excel 已匯入未核准草稿'); }
    catch (error) { notice(`IQC 匯入未完成：${displayDraftError(error)}`); }
  }

  function manageList(kind) {
    const title = kind === 'categories' ? t('修改類別清單', 'Sửa danh sách nhóm') : t('修改供應商清單', 'Sửa danh sách nhà cung cấp');
    const rows = copy(draft().snapshot[kind]);
    const sorted = () => [...rows].sort((a,b) => {
      const rank = item => kind === 'suppliers' ? item.nameVi === 'NƯỚC NGOÀI' ? 0 : item.nameVi === 'CÔNG TY' ? 1 : 2 : 0;
      return rank(a)-rank(b) || a.nameVi.localeCompare(b.nameVi, 'vi');
    });
    const { overlay, close, owner } = dialog(`<div class="iqc-dialog-title"><h3>${title}</h3><button type="button" class="button ghost" data-close>${t('關閉', 'Đóng')}</button></div><label for="iqc-list-search">${t('搜尋清單', 'Tìm trong danh sách')}</label><input id="iqc-list-search" aria-label="${t('搜尋清單', 'Tìm trong danh sách')}"><div id="iqc-managed-rows" class="iqc-managed-list"></div><div class="iqc-list-add"><label for="iqc-list-new">${t('新增越文名稱', 'Thêm tên tiếng Việt')}</label><div class="iqc-inline"><input id="iqc-list-new" placeholder="${t('越文名稱', 'Tên tiếng Việt')}" data-i18n-skip="true"><button class="button ghost" id="iqc-list-add">${t('新增', 'Thêm')}</button></div></div><p class="iqc-error" id="iqc-list-error" role="alert"></p><footer><button class="button ghost" data-close>${t('取消', 'Hủy')}</button><button class="button signal" id="iqc-list-save">${t('儲存草稿', 'Lưu bản nháp')}</button></footer>`);
    const search = overlay.querySelector('#iqc-list-search');
    const applySearch = () => {if(!owner.current())return;overlay.querySelectorAll('[data-row-id]').forEach(row => {
      row.hidden = !rows.find(item => item.id === row.dataset.rowId)?.nameVi.toLocaleLowerCase().includes(search.value.toLocaleLowerCase());
    });};
    search.oninput = applySearch;
    const draw = () => {
      overlay.querySelector('#iqc-managed-rows').innerHTML = sorted().map(item => `<div class="iqc-managed-row" data-row-id="${h(item.id)}"><strong data-row-label data-i18n-skip="true">${h(item.nameVi)}</strong><input data-row-name="${h(item.id)}" value="${h(item.nameVi)}" aria-label="${t('越文名稱', 'Tên tiếng Việt')}" data-i18n-skip="true" hidden><button type="button" class="button ghost iqc-small" data-row-edit="${h(item.id)}">${t('修改', 'Sửa')}</button><button type="button" class="button iqc-danger iqc-small" data-row-remove="${h(item.id)}">${t('刪除', 'Xóa')}</button></div>`).join('');
      overlay.querySelectorAll('[data-row-edit]').forEach(button => button.onclick = () => { if(!owner.current())return; const row = button.closest('[data-row-id]'), input = row.querySelector('[data-row-name]'), label = row.querySelector('[data-row-label]'); const editing = input.hidden; input.hidden = !editing; label.hidden = editing; button.textContent = editing ? t('完成', 'Xong') : t('修改','Sửa'); if (editing) { input.focus(); input.select(); } });
      overlay.querySelectorAll('[data-row-name]').forEach(input => input.oninput = () => { if(!owner.current())return; const item = rows.find(row => row.id === input.dataset.rowName); item.nameVi = input.value; input.closest('[data-row-id]').querySelector('[data-row-label]').textContent = input.value; });
      overlay.querySelectorAll('[data-row-remove]').forEach(button => button.onclick = () => { if(!owner.current())return;
        const item = rows.find(row => row.id === button.dataset.rowRemove);
        const references = draft().snapshot.parts.filter(part => kind === 'categories' ? part.categoryId === item.id : part.supplierIds.includes(item.id));
        if (references.length) { overlay.querySelector('#iqc-list-error').textContent = `${references.length} ${t('個零件仍在使用，請先改派', 'linh kiện đang sử dụng; hãy chuyển trước')}`; return; }
        if (!twoConfirm(`${t('刪除', 'Xóa')} ${item.nameVi}`)) return;
        rows.splice(rows.indexOf(item),1); draw();
      });
      applySearch();
      sharedClient?.gatePermissions?.();
    };
    draw();
    overlay.querySelector('#iqc-list-add').onclick = () => { if(!owner.current()||!mayCreate())return; const input = overlay.querySelector('#iqc-list-new'); const value = input.value.trim(); if (!value) return; if (rows.some(item => item.nameVi === value)) { overlay.querySelector('#iqc-list-error').textContent = t('名稱不可重複','Tên không được trùng'); return; } rows.push({ id: crypto.randomUUID(), nameVi: value }); input.value = ''; search.value = ''; draw(); };
    overlay.querySelector('#iqc-list-save').onclick = async () => { if(!owner.current())return; if (rows.some(item => !item.nameVi.trim()) || new Set(rows.map(item => item.nameVi.trim())).size !== rows.length) { overlay.querySelector('#iqc-list-error').textContent = t('名稱不可空白或重複', 'Tên không được trống hoặc trùng'); return; } try { await mutateSnapshot(next => { next[kind] = rows; }, `${title}已儲存`, owner); close(); } catch (error) { if(!owner.current())return;overlay.querySelector('#iqc-list-error').textContent = displayDraftError(error); } };
  }

  function editPart(code = '') {
    if(!code&&!mayCreate())return notice(t('沒有新增權限','Không có quyền thêm'));
    const formActor=identity(),formActorId=formActor?.id,formGeneration=control?.workflow?.generation,formVersionId=selected()?.id;
    const formCurrent=()=>owner.current()&&identity()===formActor&&formActor?.id===formActorId&&control?.workflow?.generation===formGeneration&&selected()?.id===formVersionId;
    const assertFormCurrent=()=>{if(!formCurrent())throw Error('DEPENDENCY_CHANGED_RECONFIRM');if(control?.workflow?.pendingId||transport().permission('edit')===false)throw Error('PENDING_OR_PERMISSION_LOCKED');};
    const data = draft().snapshot, old = data.parts.find(item => item.code === code), suppliers = [...data.suppliers].sort((a,b) => {
      const rank = x => x.nameVi === 'NƯỚC NGOÀI' ? 0 : x.nameVi === 'CÔNG TY' ? 1 : 2;
      return rank(a)-rank(b) || a.nameVi.localeCompare(b.nameVi,'vi');
    });
    const supplierIds = [...(old?.supplierIds || [])], photos = copy(old?.photos || []);
    const rawSupplierNote = old?.supplierRaw && old.supplierRaw !== supplierIds.map(id => name(data.suppliers,id)).join(' → ') ? `<details class="iqc-source-note"><summary>${t('匯入供應商備註', 'Ghi chú nhà cung cấp gốc')}</summary><p data-i18n-skip="true">${h(old.supplierRaw)}</p></details>` : '';
    const { overlay, close, owner } = dialog(`<h3>${old ? t('修改零件', 'Sửa linh kiện') : t('新增零件', 'Thêm linh kiện')}</h3><form id="iqc-part-form"><div class="iqc-form-grid"><div class="iqc-field"><label>${t('零件編號', 'Mã linh kiện')}</label><input name="code" required value="${h(old?.code || '')}" ${old ? 'readonly' : ''} data-i18n-skip="true"></div><div class="iqc-field"><label>${t('零件名稱（越文）', 'Tên linh kiện (tiếng Việt)')}</label><input name="nameVi" required value="${h(old?.nameVi || '')}" data-i18n-skip="true"></div></div><div class="iqc-field"><label>${t('規格（越文）', 'Quy cách (tiếng Việt)')}</label><textarea name="specificationVi" data-i18n-skip="true">${h(old?.specificationVi || '')}</textarea></div><div class="iqc-field"><label>${t('零件類別', 'Nhóm linh kiện')}</label><select name="categoryId" required><option value="">${t('選擇類別', 'Chọn nhóm')}</option>${data.categories.map(item => `<option value="${h(item.id)}" ${old?.categoryId === item.id ? 'selected' : ''} data-i18n-skip="true">${h(item.nameVi)}</option>`).join('')}</select></div><div class="iqc-field"><label>${t('第一、第二及後續供應商（依順序）', 'Nhà cung cấp thứ nhất, thứ hai và tiếp theo (theo thứ tự)')}</label><div id="iqc-part-suppliers"></div><button type="button" class="button ghost" id="iqc-part-add-supplier">${t('＋新增供應商位置', '＋Thêm vị trí nhà cung cấp')}</button></div>${rawSupplierNote}<div class="iqc-field"><label>${t('零件照片（可多張）', 'Ảnh linh kiện (nhiều ảnh)')}</label><input type="file" id="iqc-part-file" accept="image/jpeg,image/png,image/webp,image/gif" multiple><div id="iqc-part-photos"></div></div><p class="iqc-error" id="iqc-part-error" role="alert"></p><footer><button type="button" class="button ghost" data-close>${t('取消', 'Hủy')}</button><button class="button signal" type="submit">${window.VersionDraftUI.t('apply')}</button></footer></form>`);
    const showError = error => {if(owner.current())overlay.querySelector('#iqc-part-error').textContent = displayDraftError(error);};
    const drawSuppliers = () => { overlay.querySelector('#iqc-part-suppliers').innerHTML = supplierIds.map((id,index) => `<div class="iqc-supplier-row"><label>${t('供應商', 'Nhà cung cấp')} ${index+1}<select data-supplier-index="${index}"><option value="">${t('選擇供應商', 'Chọn nhà cung cấp')}</option>${suppliers.map(item => `<option value="${h(item.id)}" ${item.id === id ? 'selected' : ''} data-i18n-skip="true">${h(item.nameVi)}</option>`).join('')}</select></label><button type="button" class="button ghost" data-supplier-up="${index}" ${index ? '' : 'disabled'} aria-label="${t('向前移動','Chuyển lên')}">↑</button><button type="button" class="button ghost" data-supplier-down="${index}" ${index < supplierIds.length-1 ? '' : 'disabled'} aria-label="${t('向後移動','Chuyển xuống')}">↓</button><button type="button" class="button iqc-danger" data-supplier-remove="${index}">${t('移除', 'Bỏ')}</button></div>`).join(''); overlay.querySelectorAll('[data-supplier-index]').forEach(select => select.onchange = () => { if(!owner.current())return; supplierIds[Number(select.dataset.supplierIndex)] = select.value; }); overlay.querySelectorAll('[data-supplier-up]').forEach(button => button.onclick = () => { if(!owner.current())return; const i=Number(button.dataset.supplierUp); [supplierIds[i-1],supplierIds[i]]=[supplierIds[i],supplierIds[i-1]]; drawSuppliers(); }); overlay.querySelectorAll('[data-supplier-down]').forEach(button => button.onclick = () => { if(!owner.current())return; const i=Number(button.dataset.supplierDown); [supplierIds[i+1],supplierIds[i]]=[supplierIds[i],supplierIds[i+1]]; drawSuppliers(); }); overlay.querySelectorAll('[data-supplier-remove]').forEach(button => button.onclick = () => { if(!owner.current())return; const i=Number(button.dataset.supplierRemove); if (!twoConfirm(`${t('移除供應商', 'Bỏ nhà cung cấp')} ${i+1}`)) return; supplierIds.splice(i,1); drawSuppliers(); }); };
    const drawPhotos = () => { overlay.querySelector('#iqc-part-photos').innerHTML = photos.map((photo,index) => `<div class="iqc-photo-edit"><img src="${h(photo.src)}" alt="${t('零件照片', 'Ảnh linh kiện')}"><span>${index+1}</span><button type="button" class="button ghost" data-photo-up="${index}" ${index ? '' : 'disabled'}>↑</button><button type="button" class="button ghost" data-photo-down="${index}" ${index < photos.length-1 ? '' : 'disabled'}>↓</button><button type="button" class="button iqc-danger" data-photo-remove="${index}">${t('移除', 'Bỏ')}</button></div>`).join(''); overlay.querySelectorAll('[data-photo-up]').forEach(button => button.onclick = () => { if(!owner.current())return; const i=Number(button.dataset.photoUp); [photos[i-1],photos[i]]=[photos[i],photos[i-1]]; drawPhotos(); }); overlay.querySelectorAll('[data-photo-down]').forEach(button => button.onclick = () => { if(!owner.current())return; const i=Number(button.dataset.photoDown); [photos[i+1],photos[i]]=[photos[i],photos[i+1]]; drawPhotos(); }); overlay.querySelectorAll('[data-photo-remove]').forEach(button => button.onclick = () => { if(!owner.current())return; const i=Number(button.dataset.photoRemove); if (!twoConfirm(`${t('移除照片', 'Bỏ ảnh')} ${i+1}`)) return; photos.splice(i,1); drawPhotos(); }); };
    overlay.querySelector('#iqc-part-form').insertAdjacentHTML('afterbegin',`<label class="iqc-enabled"><input type="checkbox" name="partEnabled" ${old?.isEnabled!==false?'checked':''}>${t('啟用此 IQC 零件','Kích hoạt linh kiện IQC')}</label>`);
    drawSuppliers(); drawPhotos();
    overlay.querySelector('#iqc-part-add-supplier').onclick = () => { if(!owner.current())return; supplierIds.push(''); drawSuppliers(); };
    overlay.querySelector('#iqc-part-file').onchange = async event => { if(!owner.current())return; const files = [...event.target.files]; for (const file of files) { try { assertFormCurrent(); const photo=await upload(file,owner); assertFormCurrent(); photos.push(photo); drawPhotos(); } catch (error) { showError(error); return; } } if(owner.current())event.target.value = ''; };
    overlay.querySelector('#iqc-part-form').onsubmit = async event => { event.preventDefault();if(!owner.current())return; const form = event.currentTarget; try { assertFormCurrent(); } catch(error) { showError(error); return; } if(!old&&!mayCreate())return showError(t('沒有新增權限','Không có quyền thêm')); const partCode = formText(form, 'code').trim(); const nameVi = formText(form, 'nameVi'); const categoryId = formText(form, 'categoryId'); if (!partCode || !nameVi.trim()) return showError(t('請填寫零件編號及越文名稱','Hãy nhập mã và tên tiếng Việt của linh kiện')); if (!categoryId) return showError(t('請選擇零件類別','Hãy chọn nhóm linh kiện')); if (supplierIds.some(id => !id) || new Set(supplierIds).size !== supplierIds.length) return showError(t('供應商不可空白或重複','Nhà cung cấp không được trống hoặc trùng')); if (!old && data.parts.some(item => item.code === partCode)) return showError(t('零件編號已存在','Mã linh kiện đã tồn tại')); try { await mutateSnapshot(next => { const part = old ? next.parts.find(item => item.id === old.id) : { id: crypto.randomUUID(), code: partCode, supplierRaw: '', standardCode: '', sourceRow: undefined }; Object.assign(part, { isEnabled:form.elements.partEnabled.checked, nameVi, specificationVi: formText(form, 'specificationVi'), categoryId, supplierIds, photos }); if (!old) next.parts.push(part); }, t('零件已儲存至 IQC 草稿','Đã lưu linh kiện vào bản nháp IQC'), owner); if(formCurrent()){ui.partCode = partCode; close(); render();} } catch (error) { showError(error); } };
  }

  function previewNumber(prefix, reserved = [], width = 0) {
    const numbers = reserved.filter(code => code.startsWith(prefix)).map(code => Number(code.slice(prefix.length))).filter(Number.isInteger);
    return prefix + String(Math.max(0, ...numbers) + 1).padStart(width, '0');
  }
  function editError(id = '') {
    if(!id&&!mayCreate())return notice(t('沒有新增權限','Không có quyền thêm'));
    const old = snap().errors.find(item => item.id === id);
    const { overlay, close, owner } = dialog(`<h3>${old ? t('修改錯誤代碼', 'Sửa mã lỗi') : t('新增錯誤代碼', 'Thêm mã lỗi')}</h3><form id="iqc-error-form"><div class="iqc-field"><label>${t('錯誤代碼', 'Mã lỗi')}</label><input value="${h(old?.code || previewNumber(`${ui.partCode}-IQC-L`, control.reservedErrorCodes))}" readonly></div><div class="iqc-field"><label>${t('錯誤名稱（越文）', 'Tên lỗi (tiếng Việt)')}</label><input name="nameVi" required value="${h(old?.nameVi || '')}" data-i18n-skip="true"></div><p class="iqc-error" id="iqc-error-message"></p><footer><button type="button" class="button ghost" data-close>${t('取消', 'Hủy')}</button><button class="button signal" type="submit">${window.VersionDraftUI.t('apply')}</button></footer></form>`);
    overlay.querySelector('form').onsubmit = async event => { event.preventDefault();if(!owner.current())return; const value = formText(event.currentTarget, 'nameVi').trim(); try { if(!old&&!mayCreate())throw Error('FORBIDDEN'); if (old) await mutateSnapshot(next => { next.errors.find(item => item.id === id).nameVi = value; }, t('錯誤代碼已套用','Đã áp dụng mã lỗi'), owner); else { const v = draft(); await post('createError', { versionId: v.id, versionRevision: v.revision, partCode: ui.partCode, nameVi: value }, owner); if(!owner.current())return;notice(t('新增錯誤代碼已同步，尚未手動儲存','Đã đồng bộ mã lỗi mới, chưa lưu thủ công')); } close(); } catch (error) { if(!owner.current())return;overlay.querySelector('#iqc-error-message').textContent = displayDraftError(error); } };
  }

  function editItem(id = '', errorId = '') {
    if(!id&&!mayCreate())return notice(t('沒有新增權限','Không có quyền thêm'));
    const formActor=identity(),formActorId=formActor?.id,formGeneration=control?.workflow?.generation,formVersionId=selected()?.id;
    const formCurrent=()=>owner.current()&&identity()===formActor&&formActor?.id===formActorId&&control?.workflow?.generation===formGeneration&&selected()?.id===formVersionId;
    const assertFormCurrent=()=>{if(!formCurrent())throw Error('DEPENDENCY_CHANGED_RECONFIRM');if(control?.workflow?.pendingId||transport().permission('edit')===false)throw Error('PENDING_OR_PERMISSION_LOCKED');};
    const old = snap().items.find(item => item.id === id), error = snap().errors.find(item => item.id === (old?.errorId || errorId));
    if (!error) return;
    const rules = copy(old?.rules || [{ id: crypto.randomUUID(), cadence: 'batch', kind: 'aql', value: '', nameVi: '' }]);
    const photos = copy(old?.mediaItems || []);
    let equipmentChoices = [];
    let selectedEqId = old?.equipmentId || '';
    let selectedEq = old?.equipmentSnapshot || null;
    const initialMode = selectedEqId ? 'equipment' : old?.inspectionMode === 'visual' || !old ? 'visual' : '';
    const { overlay, close, owner } = dialog(`<form id="iqc-item-form" class="iqc-item-form"><header class="iqc-item-form-header"><div><h3>${old ? t('修改檢查項目', 'Sửa hạng mục kiểm tra') : t('新增檢查項目', 'Thêm hạng mục kiểm tra')}</h3><small data-i18n-skip="true">${h(old?.checkNo || previewNumber(`${error.code}-`, control.reservedCheckNos, 2))}</small><div class="iqc-parent-error"><b>${t('錯誤代碼','Mã lỗi')}</b><code>${h(error.code)}</code><span data-i18n-skip="true">${h(error.nameVi)}</span></div></div><button type="button" class="button ghost" data-close>${t('返回', 'Quay lại')}</button></header><div class="iqc-item-form-body">
      <section class="iqc-item-form-section"><h4>${t('基本資料','Thông tin cơ bản')}</h4><div class="iqc-field"><label>${t('檢查項目', 'Hạng mục kiểm tra')}</label><textarea name="nameVi" required data-i18n-skip="true">${h(old?.nameVi || '')}</textarea></div><div class="iqc-field"><label>${t('檢測方法','Phương pháp kiểm tra')}</label><textarea name="methodVi" data-i18n-skip="true">${h(old?.methodVi || '')}</textarea></div></section>
      <section class="iqc-item-form-section"><h4>${t('檢查工具／設備','Dụng cụ / thiết bị kiểm tra')}</h4><div class="iqc-tool-options"><label><input type="radio" name="inspectionMode" value="visual" ${initialMode === 'visual' ? 'checked' : ''}>${t('目視檢查','Kiểm tra bằng mắt')}</label><label><input type="radio" name="inspectionMode" value="equipment" ${initialMode === 'equipment' ? 'checked' : ''}>${t('檢具與測試設備','Dụng cụ và thiết bị thử')}</label></div><p class="iqc-muted" id="iqc-tool-pending" ${initialMode ? 'hidden' : ''}>${t('尚未指定正式檢查工具；原始資料保留在來源紀錄。','Chưa chỉ định dụng cụ chính thức; dữ liệu gốc vẫn được lưu trong nguồn.')}</p><div id="iqc-equipment-box" ${initialMode === 'equipment' ? '' : 'hidden'}><div id="iqc-selected-equipment"></div><div class="iqc-actions"><button type="button" class="button ghost" id="iqc-equipment-change">${t('選擇檢具與測試設備','Chọn dụng cụ / thiết bị đo')}</button><button type="button" class="button ghost" id="iqc-equipment-clear">${t('清除關聯','Xóa liên kết')}</button></div></div></section>
      <section class="iqc-item-form-section iqc-item-photo-editor"><h4>${t('檢查方式照片（可多張）','Ảnh cách kiểm tra (nhiều ảnh)')}</h4><input type="file" id="iqc-item-file" accept="image/jpeg,image/png,image/webp,image/gif" multiple><div id="iqc-item-photo-list"></div></section>
      <section class="iqc-item-form-section iqc-status-section"><h4>${t('標準狀態','Trạng thái tiêu chuẩn')}</h4><label class="iqc-enabled"><input type="checkbox" name="isEnabled" ${old?.isEnabled !== false ? 'checked' : ''}>${t('啟用此檢查項目','Kích hoạt hạng mục này')}</label></section>
      <section class="iqc-item-form-section iqc-rules-section"><h4>${t('檢查規則','Quy tắc kiểm tra')}</h4><div id="iqc-rule-rows"></div><button type="button" class="button ghost" id="iqc-rule-add">${t('＋增加正式規則', '＋Thêm quy tắc chính thức')}</button></section>
      <p class="iqc-error" id="iqc-item-error" role="alert"></p></div><footer><button type="button" class="button ghost" data-close>${t('取消', 'Hủy')}</button><button class="button signal" type="submit">${window.VersionDraftUI.t('apply')}</button></footer></form>`);
    const equipmentPhoto = eq => eq?.photoId ? `/api/routine-equipment/photo?id=${encodeURIComponent(eq.photoId)}` : eq?.photoPath || eq?.photoSource?.webPath || '';
    const equipmentName = eq => eq?.name || eq?.nameVi || eq?.nameZh || '';
    const searchKey = value => String(value || '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    function openEquipmentPicker() {
      if(!owner.current())return;
      const { overlay: picker, close: closePicker, owner: pickerOwner } = dialog(`<div class="iqc-equipment-picker"><header><h3>${t('選擇檢具與測試設備','Chọn dụng cụ / thiết bị đo')}</h3><button type="button" class="button ghost" data-close>${t('返回','Quay lại')}</button></header><div class="iqc-equipment-picker-body"><p id="iqc-picker-status" role="status">${t('載入目前生效設備…','Đang tải thiết bị đang hiệu lực…')}</p><div id="iqc-picker-filters" hidden><label>${t('類別','Nhóm')}<select id="iqc-picker-category"></select></label><label>${t('子類別','Phân nhóm')}<select id="iqc-picker-subcategory"></select></label><label>${t('規格群組','Nhóm quy cách')}<select id="iqc-picker-group"></select></label><label>${t('搜尋設備','Tìm thiết bị')}<input type="search" id="iqc-picker-search" placeholder="${t('編號、名稱、規格…','Mã, tên, quy cách…')}"></label></div><div id="iqc-picker-list"></div></div><footer><button type="button" class="button ghost" data-close>${t('取消','Hủy')}</button></footer></div>`);
      const status = picker.querySelector('#iqc-picker-status');
      const list = picker.querySelector('#iqc-picker-list');
      const category = picker.querySelector('#iqc-picker-category');
      const subcategory = picker.querySelector('#iqc-picker-subcategory');
      const group = picker.querySelector('#iqc-picker-group');
      const search = picker.querySelector('#iqc-picker-search');
      let catalog, selectedCategory = '', selectedSubcategory = '', selectedGroup = '';
      const option = (value, label, selected) => `<option value="${h(value)}" ${value === selected ? 'selected' : ''} ${value ? 'data-i18n-skip="true"' : ''}>${h(label)}</option>`;
      function drawSubcategories() {
        if(!owner.current()||!pickerOwner.current())return;
        subcategory.innerHTML = option('', t('全部子類別','Tất cả phân nhóm'), selectedSubcategory) + catalog.subcategories.filter(row => !selectedCategory || row.categoryId === selectedCategory).map(row => option(row.id, row.name || row.nameVi || row.id, selectedSubcategory)).join('');
      }
      function drawGroups() {
        if(!owner.current()||!pickerOwner.current())return;
        group.innerHTML = option('', t('全部規格群組','Tất cả nhóm quy cách'), selectedGroup) + catalog.groups.filter(row => (!selectedCategory || row.categoryId === selectedCategory) && (!selectedSubcategory || row.subcategoryId === selectedSubcategory)).map(row => option(row.id, row.name || row.nameVi || row.id, selectedGroup)).join('');
      }
      function drawList() {
        if(!owner.current()||!pickerOwner.current())return;
        const query = searchKey(search.value.trim());
        const filtered = equipmentChoices.filter(eq => (!selectedCategory || eq.categoryId === selectedCategory) && (!selectedSubcategory || eq.subcategoryId === selectedSubcategory) && (!selectedGroup || eq.groupId === selectedGroup) && (!query || searchKey(`${eq.assetCode} ${eq.pieceMark} ${equipmentName(eq)} ${eq.spec || ''}`).includes(query)));
        status.textContent = `${t('符合','Phù hợp')} ${filtered.length} / ${equipmentChoices.length} ${t('筆設備','thiết bị')}`;
        list.innerHTML = filtered.map(eq => { const photo = equipmentPhoto(eq), enabled = eq.enabled !== false; return `<article class="iqc-picker-item ${eq.id === selectedEqId ? 'selected' : ''} ${enabled ? '' : 'unavailable'}"><div class="iqc-picker-thumb">${photo ? `<img decoding="async" loading="lazy" src="${h(photo)}" alt="">` : '◇'}</div><div class="iqc-picker-info"><strong>${h(eq.assetCode || '')}／${h(eq.pieceMark || '')}</strong><span class="iqc-picker-availability">${enabled ? t('可選','Có thể chọn') : t('未啟用','Chưa kích hoạt')}</span><span data-i18n-skip="true">${h(equipmentName(eq))}</span><small data-i18n-skip="true">${h(eq.spec || '')}</small></div><button type="button" class="button ${eq.id === selectedEqId ? 'ghost' : 'signal'}" data-iqc-select-equipment="${h(eq.id)}" ${enabled ? '' : 'disabled'}>${eq.id === selectedEqId ? t('目前所選','Đã chọn') : t('選擇此設備','Chọn thiết bị')}</button></article>`; }).join('') || `<p class="iqc-muted">${t('無符合條件的設備','Không có thiết bị phù hợp')}</p>`;
        list.querySelectorAll('[data-iqc-select-equipment]').forEach(button => button.onclick = () => { if(!owner.current()||!pickerOwner.current())return;
          const eq = equipmentChoices.find(row => row.id === button.dataset.iqcSelectEquipment && row.enabled !== false);
          if (!eq) return;
          selectedEqId = eq.id; selectedEq = eq; drawSelectedEquipment(); closePicker();
        });
      }
      async function load() {
        if(!owner.current()||!pickerOwner.current())return;
        status.textContent = t('載入目前生效設備…','Đang tải thiết bị đang hiệu lực…');
        try {
          const response = await fetch('/api/routine-equipment', { cache: 'no-store' });
          if(!owner.current()||!pickerOwner.current())return;
          const data = await response.json();
          if(!owner.current()||!pickerOwner.current())return;
          if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
          const version = data.control?.versions?.find(row => row.id === data.control.activeVersionId && row.status === 'approved');
          if (!version) throw Error(t('目前沒有生效檢具版本','Chưa có phiên bản thiết bị hiệu lực'));
          if(!owner.current()||!pickerOwner.current())return;
          catalog = { categories: version.categories || [], subcategories: version.subcategories || [], groups: version.groups || [] };
          equipmentChoices = version.equipment || [];
          const current = equipmentChoices.find(eq => eq.id === selectedEqId);
          if (current) { selectedEq = current; selectedCategory = current.categoryId || ''; selectedSubcategory = current.subcategoryId || ''; selectedGroup = current.groupId || ''; drawSelectedEquipment(); }
          category.innerHTML = option('', t('全部類別','Tất cả nhóm'), selectedCategory) + catalog.categories.map(row => option(row.id, `${row.code || ''} · ${row.name || row.nameVi || row.id}`, selectedCategory)).join('');
          drawSubcategories(); drawGroups(); picker.querySelector('#iqc-picker-filters').hidden = false; drawList();
        } catch (error) {
          if(!owner.current()||!pickerOwner.current())return;
          status.textContent = `${t('設備載入失敗','Không tải được thiết bị')}: ${displayDraftError(error)}`;
          list.innerHTML = `<button type="button" class="button ghost" id="iqc-picker-retry">${t('重新載入設備','Tải lại thiết bị')}</button>`;
          list.querySelector('#iqc-picker-retry').onclick = load;
        }
      }
      category.onchange = () => { if(!owner.current()||!pickerOwner.current())return; selectedCategory = category.value; selectedSubcategory = ''; selectedGroup = ''; drawSubcategories(); drawGroups(); drawList(); };
      subcategory.onchange = () => { if(!owner.current()||!pickerOwner.current())return; selectedSubcategory = subcategory.value; selectedGroup = ''; drawGroups(); drawList(); };
      group.onchange = () => { if(!owner.current()||!pickerOwner.current())return; selectedGroup = group.value; drawList(); };
      search.oninput = drawList;
      void load();
    }
    function drawSelectedEquipment() {
      if(!owner.current())return;
      const card = overlay.querySelector('#iqc-selected-equipment');
      const photo = equipmentPhoto(selectedEq);
      card.innerHTML = selectedEqId && selectedEq ? `<article class="iqc-equipment-card"><div class="iqc-equipment-thumb">${photo ? `<img src="${h(photo)}" alt="">` : '◇'}</div><div class="iqc-equipment-meta" data-i18n-skip="true"><strong>${h(selectedEq.assetCode || '')}／${h(selectedEq.pieceMark || '')}</strong><span>${h(equipmentName(selectedEq))}</span><small>${h(selectedEq.spec || '')}</small></div></article>` : '';
      overlay.querySelector('#iqc-equipment-clear').hidden = !selectedEqId;
      overlay.querySelector('#iqc-equipment-change').textContent = selectedEqId ? t('選擇／更換檢具','Chọn / đổi thiết bị') : t('選擇檢具與測試設備','Chọn dụng cụ / thiết bị đo');
    }
    const updateMode = () => {
      if(!owner.current())return;
      const mode = overlay.querySelector('input[name="inspectionMode"]:checked')?.value;
      overlay.querySelector('#iqc-equipment-box').hidden = mode !== 'equipment';
      overlay.querySelector('#iqc-tool-pending').hidden = Boolean(mode);
      drawSelectedEquipment();
    };
    overlay.querySelectorAll('input[name="inspectionMode"]').forEach(input => input.onchange = updateMode);
    overlay.querySelector('#iqc-equipment-change').onclick = openEquipmentPicker;
    overlay.querySelector('#iqc-equipment-clear').onclick = () => { if(!owner.current())return;
      selectedEqId = ''; selectedEq = null;
      overlay.querySelectorAll('input[name="inspectionMode"]').forEach(input => { input.checked = false; });
      updateMode();
    };
    updateMode();
    if (selectedEqId) {
      const currentId = selectedEqId;
      void fetch('/api/routine-equipment', { cache: 'no-store' }).then(response => owner.current()&&response.ok ? response.json() : null).then(data => {
        if (!owner.current() || selectedEqId !== currentId) return;
        const version = data?.control?.versions?.find(row => row.id === data.control.activeVersionId && row.status === 'approved');
        const current = version?.equipment?.find(eq => eq.id === currentId);
        if (current) { selectedEq = current; drawSelectedEquipment(); }
      }).catch(() => { /* Keep the saved snapshot if the catalog is temporarily unavailable. */ });
    }
    function drawItemPhotos() {
      const list = overlay.querySelector('#iqc-item-photo-list');
      list.innerHTML = photos.map((photo,index) => `<div class='iqc-photo-edit'><img src='${h(photo.src)}' alt=''><span>${index+1}</span><input data-item-photo-note='${index}' value='${h(photo.note || '')}' placeholder='${t('照片備註','Ghi chú ảnh')}' data-i18n-skip='true'><button type='button' data-item-photo-first='${index}' ${index ? '' : 'disabled'}>${t('設為首圖','Ảnh đầu')}</button><button type='button' data-item-photo-up='${index}' ${index ? '' : 'disabled'}>↑</button><button type='button' data-item-photo-down='${index}' ${index < photos.length-1 ? '' : 'disabled'}>↓</button><button type='button' data-item-photo-remove='${index}'>${t('移除','Xóa')}</button></div>`).join('');
      list.querySelectorAll('[data-item-photo-note]').forEach(input => input.oninput = () => { if(!owner.current())return; photos[Number(input.dataset.itemPhotoNote)].note = input.value; });
      list.querySelectorAll('[data-item-photo-first]').forEach(button => button.onclick = () => { if(!owner.current())return; photos.unshift(photos.splice(Number(button.dataset.itemPhotoFirst),1)[0]); drawItemPhotos(); });
      list.querySelectorAll('[data-item-photo-up]').forEach(button => button.onclick = () => { if(!owner.current())return; const i=Number(button.dataset.itemPhotoUp); [photos[i-1],photos[i]]=[photos[i],photos[i-1]]; drawItemPhotos(); });
      list.querySelectorAll('[data-item-photo-down]').forEach(button => button.onclick = () => { if(!owner.current())return; const i=Number(button.dataset.itemPhotoDown); [photos[i+1],photos[i]]=[photos[i],photos[i+1]]; drawItemPhotos(); });
      list.querySelectorAll('[data-item-photo-remove]').forEach(button => button.onclick = () => { if(!owner.current())return; const i=Number(button.dataset.itemPhotoRemove); if(twoConfirm(`${t('移除檢查照片','Xóa ảnh hạng mục')} ${i+1}`)){photos.splice(i,1);drawItemPhotos();} });
    }
    drawItemPhotos();
    overlay.querySelector('#iqc-item-file').onchange = async event => { if(!owner.current())return;
      for (const file of event.target.files) {
        try { assertFormCurrent(); const photo=await upload(file,owner); assertFormCurrent(); photos.push({ ...photo, note: '' }); drawItemPhotos(); }
        catch (error) { if(!owner.current())return;overlay.querySelector('#iqc-item-error').textContent = displayDraftError(error); break; }
      }
      if(owner.current())event.target.value = '';
    };
    const kinds = rule => rule.cadence === 'batch' ? [['aql','AQL'],['fixed_count',t('固定件數','Số mẫu cố định')],['batch_quantity',t('批次數量','Số lượng lô')],['custom',t('自訂','Tùy chỉnh')]] : [['week',t('週','Tuần')],['month',t('月','Tháng')],['quarter',t('季','Quý')],['half_year',t('半年','Nửa năm')],['year',t('年','Năm')],['custom',t('自訂','Tùy chỉnh')]];
    const drawRules = () => {
      const body = overlay.querySelector('.iqc-item-form-body');
      const scroll = body.scrollTop;
      const opened = new Set([...overlay.querySelectorAll('[data-rule-card]')].filter(card => card.open).map(card => Number(card.dataset.ruleCard)));
      const formal = rules.map((rule,index) => ({rule,index})).filter(({rule}) => rule.cadence !== 'source');
      overlay.querySelector('#iqc-rule-rows').innerHTML = formal.map(({rule,index},position) => `<details class="iqc-rule-card" data-rule-card="${index}" ${opened.has(index) || !opened.size ? 'open' : ''}>
        <summary>${t('檢查規則','Quy tắc kiểm tra')} ${position+1} · ${rule.cadence === 'batch' ? t('按批次','Theo lô') : t('按時間','Theo thời gian')}</summary>
        <div class="iqc-rule-fields"><label>${t('方式','Cách')}<select data-rule-cadence="${index}"><option value="batch" ${rule.cadence==='batch'?'selected':''}>${t('按批次','Theo lô')}</option><option value="time" ${rule.cadence==='time'?'selected':''}>${t('按時間','Theo thời gian')}</option></select></label>
        <label>${rule.cadence === 'batch' ? t('取樣方式','Cách lấy mẫu') : t('頻率','Tần suất')}<select data-rule-kind="${index}">${kinds(rule).map(([value,label]) => `<option value="${value}" ${rule.kind===value?'selected':''}>${label}</option>`).join('')}</select></label>
        ${rule.cadence === 'batch' && rule.kind === 'custom' ? `<label>${t('自訂項目名稱（必填）','Tên mục tùy chỉnh (bắt buộc)')}<input data-rule-name="${index}" value="${h(rule.nameVi||'')}" data-i18n-skip="true"></label>` : ''}
        ${rule.cadence === 'batch' ? `<label>${rule.kind === 'custom' ? t('對應數量或文字內容（必填）','Số lượng hoặc nội dung (bắt buộc)') : t('對應數值（必填）','Giá trị (bắt buộc)')}<input data-rule-value="${index}" value="${h(rule.value||'')}" ${rule.kind === 'custom' ? '' : 'inputmode="decimal"'} data-i18n-skip="true"></label>` : rule.kind === 'custom' ? `<label>${t('自訂週期內容（必填）','Nội dung chu kỳ tùy chỉnh (bắt buộc)')}<input data-rule-name="${index}" value="${h(rule.nameVi||'')}" data-i18n-skip="true"></label>` : `<p class="iqc-muted">${t('按時間不填數量','Theo thời gian không nhập số lượng')}</p>`}
        </div><button type="button" class="button iqc-danger iqc-small iqc-rule-remove" data-rule-remove="${index}" ${rules.length === 1 ? 'disabled' : ''}>${t('移除規則','Xóa quy tắc')}</button></details>`).join('');
      overlay.querySelectorAll('[data-rule-cadence]').forEach(select => select.onchange = () => { if(!owner.current())return; const rule=rules[Number(select.dataset.ruleCadence)]; rule.cadence=select.value; rule.kind=select.value==='batch'?'aql':'week'; rule.value=''; rule.nameVi=''; drawRules(); });
      overlay.querySelectorAll('[data-rule-kind]').forEach(select => select.onchange = () => { if(!owner.current())return; const rule=rules[Number(select.dataset.ruleKind)]; rule.kind=select.value; rule.value=''; rule.nameVi=''; drawRules(); });
      overlay.querySelectorAll('[data-rule-value]').forEach(input => input.oninput = () => { if(!owner.current())return; rules[Number(input.dataset.ruleValue)].value=input.value; });
      overlay.querySelectorAll('[data-rule-name]').forEach(input => input.oninput = () => { if(!owner.current())return; rules[Number(input.dataset.ruleName)].nameVi=input.value; });
      overlay.querySelectorAll('[data-rule-remove]').forEach(button => button.onclick = () => { if(!owner.current())return; if (rules.length === 1) { overlay.querySelector('#iqc-item-error').textContent = t('至少保留一條檢查規則', 'Phải giữ ít nhất một quy tắc'); return; } const index=Number(button.dataset.ruleRemove); if(!twoConfirm(`${t('移除檢查規則','Bỏ quy tắc kiểm tra')} ${index+1}`))return; rules.splice(index,1); drawRules(); });
      body.scrollTop = scroll;
    };
    drawRules();
    overlay.querySelector('#iqc-rule-add').onclick = () => { if(!owner.current())return; rules.push({ id: crypto.randomUUID(), cadence: 'batch', kind: 'aql', value: '', nameVi: '' }); drawRules(); overlay.querySelector(`[data-rule-card="${rules.length-1}"]`).open = true; };
    overlay.querySelector('form').onsubmit = async event => {
      event.preventDefault();if(!owner.current())return;
      const form = event.currentTarget;
      const nameVi = formText(form, 'nameVi');
      const toolVi = old?.toolVi || '';
      const methodVi = formText(form, 'methodVi');
      const inspectionSpecVi = old?.inspectionSpecVi || '';
      const isEnabled = Boolean(new FormData(form).get('isEnabled'));
      const chosenMode = formText(form, 'inspectionMode');
      const selectedId = selectedEqId;
      const chosen = equipmentChoices.find(eq => eq.id === selectedId) || (selectedId === old?.equipmentId ? old.equipmentSnapshot : null);
      const errorBox = overlay.querySelector('#iqc-item-error');
      try { assertFormCurrent(); } catch(error) { errorBox.textContent=displayDraftError(error); return; }
      if (!control.workflow&&!nameVi.trim()) { errorBox.textContent = t('請填寫越文檢查項目','Nhập hạng mục tiếng Việt'); return; }
      if (!control.workflow&&!rules.length) { errorBox.textContent = t('至少需要一條檢查規則','Cần ít nhất một quy tắc'); return; }
      if (!old && !chosenMode) { errorBox.textContent = t('請選擇目視檢查或檢具','Chọn kiểm tra bằng mắt hoặc thiết bị'); return; }
      if (chosenMode === 'equipment' && (!selectedId || !chosen && selectedId !== old?.equipmentId || chosen?.enabled === false)) {
        errorBox.textContent = t('請選擇目前生效且啟用的檢具','Chọn thiết bị đang hiệu lực và đã kích hoạt'); return;
      }
      for (const rule of rules) {
        if (control.workflow||rule.cadence === 'source') continue; // Business completeness is checked on the saved submission snapshot.
        if (rule.cadence === 'batch' && rule.kind === 'custom' && (!String(rule.nameVi || '').trim() || !String(rule.value || '').trim())) { errorBox.textContent = t('批次自訂須填名稱與對應數量或文字','Tùy chỉnh theo lô cần tên và số lượng hoặc nội dung'); return; }
        if (rule.cadence === 'batch' && rule.kind !== 'custom' && (!String(rule.value || '').trim() || !Number.isFinite(Number(rule.value)) || Number(rule.value) <= 0)) { errorBox.textContent = t('按批次須填有效數值','Theo lô cần giá trị hợp lệ'); return; }
        if (rule.cadence === 'time' && rule.kind === 'custom' && !String(rule.nameVi || '').trim()) { errorBox.textContent = t('自訂時間須填名稱','Chu kỳ tùy chỉnh cần tên'); return; }
      }
      const payload = { nameVi, toolVi, methodVi, inspectionSpecVi, isEnabled, rules, mediaItems: photos,
        inspectionMode: chosenMode || undefined,
        equipmentId: chosenMode === 'equipment' ? selectedId : '',
        equipmentSnapshot: chosenMode === 'equipment' ? chosen ? { id: chosen.id, assetCode: chosen.assetCode || '', pieceMark: chosen.pieceMark || '', name: chosen.name || chosen.nameVi || '', spec: chosen.spec || '' } : old?.equipmentSnapshot : null };
      try {
        if (old) await mutateSnapshot(next => { Object.assign(next.items.find(row => row.id === id), payload); }, t('檢查項目已儲存','Hạng mục đã lưu'), owner);
        else { const v = draft(); await post('createItem', { versionId: v.id, versionRevision: v.revision, errorId: error.id, ...payload }, owner);if(!owner.current())return;notice(t('新檢查項目已同步，尚未手動儲存','Đã đồng bộ hạng mục mới, chưa lưu thủ công')); }
        if(formCurrent())close();
      } catch (failure) { if(!owner.current())return;errorBox.textContent = displayDraftError(failure); }
    };
  }

  function reviewHTML() {
    if(readDenied)return `<section class="iqc-review" role="alert">${h(displayDraftError(readDenied))}</section>`;
    const pending = (control?.versions || []).filter(v => v.status === 'pending');
    const history = (control?.versions || []).filter(v => ['approved','superseded','rejected','withdrawn'].includes(v.status)).slice().reverse();
    const caseButton = v => `<button class="iqc-review-case" data-iqc-review="${h(v.id)}"><strong>V${v.number} · ${status(v.status)}</strong><span data-i18n-skip="true">${h(v.creatorName)} · ${date(v.submittedAt || v.updatedAt)}</span></button>`;
    return `<section class="iqc-review"><h3>IQC · ${t('待確認','Chờ duyệt')} ${pending.length}</h3><div class="quality-review-pending-list">${pending.map(caseButton).join('') || `<p>${t('目前沒有待確認 IQC 案件','Không có hồ sơ IQC chờ duyệt')}</p>`}</div><details class="quality-review-history"><summary>${t('確認歷史與內容','Lịch sử duyệt và nội dung')} · ${history.length}</summary>${history.map(caseButton).join('') || `<p>${t('尚無確認歷史','Chưa có lịch sử duyệt')}</p>`}</details><div class="iqc-review-detail"></div></section>`;
  }
  function bindReview(panel) {
    const initial = panel.querySelector('.iqc-review'), requestIdentity=identity(), requestActor=requestIdentity?.id, requestEpoch=window.ProcessSync?.identityGeneration?.(), requestDelivery=window.ProcessSync?.captureDelivery?.(), bindToken=++reviewBindSequence,reviewLoadSequence=loadSequence+1;
    reviewRoot = initial;reviewContainer=panel;
    if (!initial) return;
    const ownsInitial=()=>bindToken===reviewBindSequence&&loadSequence===reviewLoadSequence&&reviewRoot===initial&&initial.isConnected&&panel.querySelector('.iqc-review')===initial&&identity()===requestIdentity&&identity()?.id===requestActor&&(typeof requestEpoch!=='number'||window.ProcessSync?.identityGeneration?.()===requestEpoch)&&(!requestDelivery||window.ProcessSync?.isCurrentDelivery?.(requestDelivery)!==false)&&!window.ProcessSync?.requiresReload;
    initial.querySelectorAll('[data-iqc-review]').forEach(button => { button.disabled = true; });
    const ready = async () => {
      await load(); if (!ownsInitial()) return;
      navigationError=null;
      initial.outerHTML = reviewHTML(); const current = panel.querySelector('.iqc-review'); reviewRoot = current;
      const count = document.querySelector('#approval-tab-quality .approval-tab-count');
      if (count) count.textContent = String((window.FQCMasterUI?.pendingCount?.() || 0) + (window.RoutineEquipmentUI?.pendingCount?.() || 0) + pendingCount());
      let detailVersionId='';
      current.querySelectorAll('[data-iqc-review]').forEach(button => button.onclick = async () => {
        if (!current.isConnected || identity()?.id !== requestActor) return;
        const id=button.dataset.iqcReview;detailVersionId=id;versionReadSequence++;
        const detail = current.querySelector('.iqc-review-detail');
        if(control.versions.find(item=>item.id===id)?.snapshotDeferred||id===activeDeferredId){detail.textContent=t('正在讀取生效版本…','Đang đọc phiên bản hiệu lực…');try{await hydrateVersion(id,()=>detailVersionId===id&&current.isConnected);}catch(error){if(detailVersionId===id&&current.isConnected)detail.textContent=displayDraftError(error);return;}}
        if(detailVersionId!==id||!current.isConnected||identity()?.id!==requestActor)return;
        const v=control.versions.find(item=>item.id===id);if(!v||v.snapshotDeferred)return;
        detail.innerHTML = `<h4>IQC V${v.number} · ${status(v.status)}</h4><p>${t('零件','Linh kiện')} ${v.snapshot.parts.filter(item=>!item.isDeleted).length} · ${t('錯誤代碼','Mã lỗi')} ${v.snapshot.errors.filter(item=>!item.isDeleted).length} · ${t('檢查項目','Hạng mục')} ${v.snapshot.items.filter(item=>!item.isDeleted).length}</p><p>${t('修改者','Người sửa')}: <span data-i18n-skip="true">${h(v.creatorName)}</span> · ${date(v.updatedAt)}<br>${t('送審者','Người gửi')}: <span data-i18n-skip="true">${h(v.submittedBy||'')}</span> · ${date(v.submittedAt)}${v.reviewedBy?`<br>${t('確認者','Người duyệt')}: ${h(v.reviewedBy)} · ${date(v.reviewedAt)}`:''}${v.reviewComment?`<br>${t('審核意見','Ý kiến')}: ${h(v.reviewComment)}`:''}</p>${(mayReview()||mayReview('approval.reject'))&&v.status==='pending' ? `<label>${t('審核意見（選填）','Ý kiến duyệt (không bắt buộc)')}<textarea id="iqc-review-comment" rows="3"></textarea></label><div class="iqc-actions"><button class="button ghost" id="iqc-review-reject">${t('發回','Trả lại')}</button><button class="button signal" id="iqc-review-approve">${t('確認','Duyệt')}</button></div>` : ''}`;
        if(v.status==='pending'&&mayWithdraw())detail.insertAdjacentHTML('beforeend',`<button class="button ghost" id="iqc-review-withdraw">${t('撤回送審','Rút hồ sơ')}</button>`);
        detail.insertAdjacentHTML('beforeend', `<button type="button" class="button ghost" id="iqc-review-content">${t('查看固定內容／前後差異','Xem nội dung / thay đổi')}</button>`);
        detail.querySelector('#iqc-review-content').onclick = async () => {
          try {
            const client = transport(); await client.permissions();
            if (!current.isConnected || identity()?.id !== requestActor) return;
            const isCase = control.workflow?.cases.some(c => c.id === v.id);
            await window.openSharedDraftHistory({client, editable:()=>false, onApplied:async()=>{}, ...(isCase ? {caseId:v.id} : {legacyFirst:true,legacyVersionId:v.id})});
          } catch (error) { if(current.isConnected) notice(displayDraftError(error)); }
        };
        sharedClient?.gatePermissions?.();
        for (const action of ['reject','approve','withdraw']) detail.querySelector(`#iqc-review-${action}`)?.addEventListener('click',async()=>{
          const comment=action==='approve' ? detail.querySelector('#iqc-review-comment')?.value?.trim() || '' : '';
          try { const result=await post(action,{versionId:v.id,versionRevision:v.revision,comment});if(!result)return; void window.RoutineEquipmentUI?.reconcilePendingReplacements?.(); reviewRoot=panel.querySelector('.iqc-review'); if(reviewRoot){reviewRoot.outerHTML=reviewHTML();/* bindReview retains its existing owned load/error UI; success notice stays immediate. */void bindReview(panel);} notice(action==='approve'?t('IQC 版本已核准','Đã duyệt phiên bản IQC'):action==='withdraw'?t('IQC 送審已撤回','Đã rút hồ sơ IQC'):t('IQC 版本已發回','Đã trả lại phiên bản IQC')); }
          catch(error){notice(displayDraftError(error));}
        });
      });
      current.querySelector('.quality-review-pending-list [data-iqc-review]')?.click();
    };
    return ready().catch(error => { if(ownsInitial()){navigationError=error;if(readDenied){renderReadDenied();return;}initial.innerHTML = `<p role="alert">${h(displayDraftError(error))}</p>`;} });
  }
  function pendingCount() { return readDenied?0:(control?.versions || []).filter(v => v.status === 'pending').length; }
  function renderApprovedDetail(area,data,partId,onPhoto){if(readDenied){area.innerHTML=`<p role="alert">${h(displayDraftError(readDenied))}</p>`;return;}const part=data.parts.find(p=>p.id===partId),state={partCode:part?.code||'',errorId:''};function draw(){area.innerHTML=detailPanel(data,state,true);area.querySelectorAll('[data-select-error]').forEach(b=>b.onclick=()=>{state.errorId=b.dataset.selectError;draw();});area.querySelectorAll('[data-photo-part]').forEach(b=>b.onclick=()=>onPhoto(part.photos[Number(b.dataset.photoIndex)]?.src));area.querySelectorAll('[data-item-photo]').forEach(b=>b.onclick=()=>onPhoto(data.items.find(i=>i.id===b.dataset.itemPhoto)?.mediaItems?.[Number(b.dataset.photoIndex)]?.src));}draw();}
  let navigationError=null;
  host.IQCMasterUI = { navigation:{requiresSave:()=>!!root?.isConnected&&window.sharedDraftNeedsSave?.(control?.workflow),saveForDeparture:()=>post('save'),canLeave:()=>!ui.busy&&!document.querySelector('.iqc-dialog-overlay,.iqc-lightbox'),error:()=>navigationError,reset(){versionReadSequence++;versionReadError=null;activeDeferredId='';loadSequence++;mountSequence++;reviewBindSequence++;readDenied=null;reviewContainer=null;disposePhotoViewers();pollTimer.cancel();root=null;reviewRoot=null;control=null;revision=null;dialogBase=null;dialogGeneration=null;ui.versionId='';ui.preview=null;ui.openItems.clear();navigationError=null;}}, html, mount, reviewHTML, bindReview, pendingCount, renderApprovedDetail };
})(window);
