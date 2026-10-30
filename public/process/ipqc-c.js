(() => {
  const displayDraftError = error => window.sharedDraftErrorMessage?.(error) ?? (typeof error === 'string' ? error : error?.message || String(error ?? ''));
  const API = '/api/ipqc-c';
  const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const copy = value => JSON.parse(JSON.stringify(value));
  const fold = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
  let language = document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'vi';
  const t = (vi, zh) => language === 'zh' ? zh : vi;
  const date = value => window.VersionDraftUI?.date(value) || '—';
  const status = value => ({ draft:t('Bản nháp','草稿'), pending:t('Chờ duyệt','待審'),
    approved:t('Có hiệu lực','已生效'), superseded:t('Lịch sử','歷史版'),
    returned:t('Đã trả lại','已發回'), withdrawn:t('Đã rút lại','已撤回') })[value] || value;
  const lastEdit = version => [...(version?.history||[])].reverse().find(event=>!['submit','approve','reject','withdraw'].includes(event.action));
  const identity = () => window.ProcessSync?.identity || (typeof currentUser !== 'undefined' ? currentUser : null);
  const permitted = key => !readAccessBlocked()&&(window.sharedDraftPermissionAllowed?.(sharedClient,key)??true)&&(typeof window.hasPermission === 'function' ? window.hasPermission(key==='approval.submit'?'view:data':key) || key==='approval.withdraw'&&window.hasPermission('view:data') : identity()?.role === 'admin');
  const headers = () => ({...(window.ProcessSync?.platformHeaders?.() || { 'Content-Type':'application/json' }),'X-IPQC-C-Save-Projection':'1'});
  let host = null, reviewHost = null, control = null, catalog = { products:[], stages:[] }, equipmentGroups = [], equipment = [], revision = null;
  let working = null, selectedVersionId = '', productCode = '', stageCode = '', errorId = '', search = '';
  let busy = false, message = '', modal = null, viewer = null, conflict = null;
  let equipmentCategories = [], equipmentSubcategories = [], picker = null;
  let caseHistory=null;
  let sharedClient=null, sharedActor='';const pollTimer=window.createForegroundPoll();let mountSequence=0, readSequence=0, readRecoveryNeeded=false, readAccessBlock=null, readAckContext=null, readQuarantinedDraft=null, saveInputNotice=null;
  const saveInputNoticePending=()=>{if(saveInputNotice&&!saveInputNotice.noticeOwns())saveInputNotice=null;return !!saveInputNotice;};
  const ownsQuarantinedDraft=()=>!!readQuarantinedDraft&&readQuarantinedDraft.actor===identity()&&readQuarantinedDraft.id===identity()?.id&&readQuarantinedDraft.epoch===window.ProcessSync?.identityGeneration?.();
  const readAccessBlocked=()=>!!readAccessBlock;
  const readBlockedHTML=()=>`<section class="ipqcc-page" id="ipqcc-page"><div class="ipqcc-message" role="alert">${sharedClient?.hasUnknown()?t('Kết quả thao tác mới nhất chưa xác định; không gửi lại.','最新操作結果尚未確認；請勿重送。'):readAckContext&&readAckContext.actor===identity()&&readAckContext.id===identity()?.id&&readAckContext.epoch===window.ProcessSync?.identityGeneration?.()?t('Thao tác đã được máy chủ xác nhận, nhưng đọc lại bị từ chối. Không gửi lại thao tác.','操作已由伺服器確認，但重新讀取遭拒；請勿重送操作。'):t('Đọc dữ liệu bị từ chối; dữ liệu riêng được giữ lại nhưng tạm khóa.','讀取資料遭拒；私有草稿保留但暫時隔離。')} ${t('Đọc lại dữ liệu và quyền để tiếp tục.','請重新讀取資料與權限後繼續。')} <button type="button" id="ipqcc-read-retry" class="button ghost">${t('Đọc lại dữ liệu và quyền','重新讀取資料與權限')}</button></div></section>`;
  function bindReadRetry(root){root?.querySelector('#ipqcc-read-retry')?.addEventListener('click',async(event)=>{
    if(busy)return;const button=event.currentTarget;if(button.disabled)return;if(saveInputNoticePending()&&!confirm(t('Tải lại sẽ bỏ nội dung chưa áp dụng. Tiếp tục?','重新載入將放棄未套用輸入，是否繼續？')))return;button.disabled=true;
    try{await read(false,()=>true,false,true);message='';draw();reviewDraw();}catch(error){if(isReadSuperseded(error))return;message=error.message;draw();reviewDraw();}
    finally{if(button.isConnected)button.disabled=false;}
  });}
  const readErrorOwners=new WeakMap();
  const isReadSuperseded=error=>(error?.code||error?.message)==='IPQCC_READ_SUPERSEDED'||
    !!(error&&typeof error==='object'&&readErrorOwners.has(error)&&!readErrorOwners.get(error)());
  // Server-confirmed operation cells; unknown, revoked or another actor fails closed.
  const operationAllowed = operation => !readAccessBlocked()&&!!identity()?.id && sharedActor===identity().id &&
    !window.ProcessSync?.requiresReload && sharedClient?.permission(operation)===true;
  function sharedTransport() {
    const actor=identity()?.id;
    if(!actor)throw Error(t('Cần đăng nhập','請先登入'));
    if(sharedActor!==actor){sharedActor=actor;sharedClient=window.createSharedDraftClient({endpoint:`${API}/workflow?caseMetadata=1`,legacyArchive:true,actorId:actor,headers,guardAccessResults:true,permissionGates:{edit:'#ipqcc-begin,#ipqcc-case-restore,[data-ipqcc-add],#ipqcc-editor button[type=submit],[data-ipqcc-edit-item],[data-ipqcc-edit-error]',save:'#ipqcc-save',submit:'#ipqcc-submit',withdraw:'#ipqcc-withdraw,[data-ipqcc-review="withdraw"]',approve:'[data-ipqcc-review="approve"]',return:'[data-ipqcc-review="reject"]',history:'#ipqcc-case-history',delete:'[data-ipqcc-delete-item],[data-ipqcc-delete-error]'}});}
    return sharedClient;
  }
  const workflowErrors={
    PENDING_LOCKED:['Hồ sơ đang chờ duyệt; không thể chỉnh sửa','待審中，禁止修改'],
    SAVED_VERSION_CHANGED_RECONFIRM:['Bản đã lưu thay đổi. Vui lòng xác nhận lại','已儲存版本改變，請重新確認'],
    SUCCESSFUL_SAVE_REQUIRED:['Cần lưu thành công trước khi gửi duyệt','請先成功儲存再送審'],
    NO_SUBSTANTIVE_CHANGE:['Không có thay đổi so với bản có hiệu lực','相對正式版沒有實質差異'],
    VALIDATION_FAILED:['Bản đã lưu chưa đủ điều kiện gửi duyệt','已儲存快照尚未通過送審驗證'],
    STALE_GENERATION:['Vòng chỉnh sửa đã thay đổi; giữ lại phần nhập để đối chiếu','編輯輪次已改變，保留輸入供核對'],
    
    RESULT_UNKNOWN_CHECK_BEFORE_RETRY:['Chưa xác định kết quả. Kiểm tra thao tác trước khi thử lại','結果未知，請先查證操作再重試'],
  };
  const savePermissionKeys=['view','edit','save','submit','withdraw','approve','return','history','delete'];
  function captureSaveProjection(transport){
    const actor=identity(),epoch=window.ProcessSync?.identityGeneration?.(),delivery=window.ProcessSync?.captureDelivery?.(),base=control,flow=control?.workflow,local=working,
      mount=mountSequence,read=readSequence,baseRevision=revision,flowJSON=JSON.stringify(flow?.working),localJSON=JSON.stringify(local),snapshot=flowJSON?JSON.parse(flowJSON):null,
      permissions=Object.fromEntries(savePermissionKeys.map(key=>[key,transport.permission(key)])),input=modal,inputJSON=JSON.stringify(modal&&{fields:modal.fields,photos:modal.photos,pendingInsert:modal.pendingInsert,dirty:modal.dirty});
    return {base,flow,snapshot,permissions,actorId:actor?.id,revision:baseRevision,generation:flow?.generation,
      noticeOwns:()=>identity()===actor&&identity()?.id===actor?.id&&window.ProcessSync?.identityGeneration?.()===epoch&&!window.ProcessSync?.requiresReload&&mountSequence===mount&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery)),
      inputsChanged:()=>working!==local||JSON.stringify(working)!==localJSON||modal!==input||JSON.stringify(modal&&{fields:modal.fields,photos:modal.photos,pendingInsert:modal.pendingInsert,dirty:modal.dirty})!==inputJSON,
      owns:()=>identity()===actor&&identity()?.id===actor?.id&&window.ProcessSync?.identityGeneration?.()===epoch&&!window.ProcessSync?.requiresReload&&mountSequence===mount&&readSequence===read&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery)),
      current:()=>control===base&&control?.workflow===flow&&revision===baseRevision&&working===local&&JSON.stringify(flow?.working)===flowJSON&&JSON.stringify(working)===localJSON};
  }
  function blockSaveNoticeAccess(error,capture){
    if(!capture?.noticeOwns()||saveInputNotice!==capture||![401,403].includes(error?.status))return;
    const actor=identity();readAccessBlock={actor,id:actor.id,epoch:window.ProcessSync?.identityGeneration?.(),status:error.status};
    if(!ownsQuarantinedDraft())readQuarantinedDraft={actor,id:actor.id,epoch:window.ProcessSync?.identityGeneration?.(),revision,working:working?copy(working):null,modal};
    modal=null;viewer=null;picker=null;caseHistory=null;conflict=null;draw();reviewDraw();
  }
  async function refreshSaveNoticeAccess(capture){
    const transport=sharedTransport();if(!transport.canPoll('permissions'))return;
    try{await transport.permissions({isCurrent:()=>capture.noticeOwns()&&saveInputNotice===capture});}
    catch(error){blockSaveNoticeAccess(error,capture);throw error;}
  }
  function showSaveInputNotice(capture){
    saveInputNotice=capture;
    host?.querySelector('[data-ipqcc-save-input-notice]')?.remove();
    const note=document.createElement('div');note.dataset.ipqccSaveInputNotice='1';note.setAttribute('role','alert');
    note.textContent=t('Bản chụp trước đã được lưu. Nội dung mới đang nhập chưa được lưu; không gửi lại thao tác cũ.','先前快照儲存已確認；等待期間的新輸入尚未儲存，請勿重送舊操作。');
    const button=document.createElement('button');button.type='button';button.textContent=t('Kiểm tra và tải lại','核對並重新載入');
    button.addEventListener('click',async()=>{if(busy||!capture.noticeOwns()||control?.workflow?.generation!==capture.generation)return;if(!confirm(t('Tải lại sẽ bỏ nội dung chưa áp dụng. Hãy sao chép hoặc đối chiếu trước. Tiếp tục?','重新載入將放棄尚未套用的新輸入，請先複製或核對內容。是否繼續？')))return;button.disabled=true;
      try{await read(false,()=>capture.noticeOwns()&&control?.workflow?.generation===capture.generation,false,true);if(!capture.noticeOwns())return;modal=null;viewer=null;picker=null;message='';draw();reviewDraw();}catch(error){if(isReadSuperseded(error)||!capture.noticeOwns())return;message=error.message;draw();reviewDraw();if(!readAccessBlocked())showSaveInputNotice(capture);}finally{button.disabled=false;}
    });note.append(button);host?.append(note);
  }
  function acceptSaveProjection(result,capture,command,transport){
    const p=result?.cSaveProjection,r=result?.receipt,f=capture.flow,d=p?.draft,s=p?.saved;
    if(!capture.owns()||!capture.current()||transport.hasUnknown()||!p||p.version!==1||!f||!capture.snapshot||!r||
      r.operationId!==command.operationId||r.generation!==f.generation||r.caseId!==null||typeof r.unchanged!=='boolean'||
      p.baseStateRevision!==capture.revision||p.baseFlowRevision!==command.expectedRevision||p.baseFlowRevision!==f.revision||p.generation!==f.generation||
      !Number.isSafeInteger(result.revision)||result.revision!==capture.revision+1||p.flowRevision!==r.revision||r.revision!==f.revision+(r.unchanged?0:1)||
      p.activeVersionId!==capture.base.activeVersionId||!s||typeof s.id!=='string'||s.id!==r.savedId||!Number.isSafeInteger(s.revision)||
      !d||d.id!=='shared-'+f.generation||d.status!=='draft'||d.revision!==r.revision||f.pendingId!==null||
      'content' in s||'snapshot' in d||!p.contributors||typeof p.contributors!=='object'||
      !savePermissionKeys.every(key=>typeof capture.permissions[key]==='boolean'&&result.permissions?.[key]===capture.permissions[key]&&transport.permission(key)===capture.permissions[key]))return false;
    const drafts=capture.base.versions.filter(v=>v.status==='draft'||v.status==='pending');
    if(drafts.length!==1||drafts[0].id!==d.id||drafts[0].status!=='draft'||typeof d.updatedAt!=='string'||
      ['number','baseVersionId','creatorId','creatorName','createdAt'].some(key=>d[key]!==drafts[0][key])||JSON.stringify(d.history)!==JSON.stringify(drafts[0].history)||
      typeof s.at!=='string'||!s.actor||typeof s.actor.id!=='string'||typeof s.actor.name!=='string'||!s.contributors||typeof s.contributors!=='object'||
      !r.unchanged&&(s.revision!==f.revision||s.actor.id!==capture.actorId))return false;
    if(r.unchanged&&(!f.saved||f.saved.id!==s.id||JSON.stringify({...f.saved,content:undefined})!==JSON.stringify({...s,content:undefined})))return false;
    const next={...capture.base,versions:capture.base.versions.map(v=>v.id===d.id?{...d,snapshot:copy(capture.snapshot)}:v),workflow:{...f,revision:r.revision,saved:{...s,content:copy(capture.snapshot)},contributors:copy(p.contributors)}};
    control=next;revision=result.revision;return true;
  }
  async function writeShared(action,detail={},closeModal=false) {
    if(busy)return null;if(saveInputNoticePending()){showSaveInputNotice(saveInputNotice);return null;}readAckContext=null;busy=true;message='';const restoreView=window.VersionDraftUI.preserveView(host,reviewHost),requestActor=identity(),requestActorId=requestActor?.id,
      targetModal=closeModal?modal:null,
      editorState=()=>targetModal?JSON.stringify({fields:targetModal.fields,photos:targetModal.photos,pendingInsert:targetModal.pendingInsert}):'',
      submittedState=editorState(),sameActor=()=>identity()===requestActor && identity()?.id===requestActorId;let cancelled=false,refreshCurrent=false,readWasSuperseded=false,preserveInputs=false;
    const cancelResponse=()=>{cancelled=true;refreshCurrent=sameActor();return null;};
    try {
      if(readAccessBlocked())throw Error('READ_ACCESS_RECHECK_REQUIRED');
      const transport=sharedTransport();
      if(closeModal&&modal?.generation&&modal.generation!==control.workflow?.generation)throw Error('STALE_GENERATION');
      if(transport.hasUnknown()) {
        if(closeModal && targetModal && !targetModal.existingId && ['create-item','create-error'].includes(action))targetModal.creationIdentityUnknown=true;
        await transport.resolveUnknown();
        if(!sameActor() || closeModal && modal!==targetModal){return cancelResponse();}
        await read(false,sameActor);
        if(!sameActor() || closeModal && modal!==targetModal){return cancelResponse();}
        if(closeModal)throw Error('STALE_GENERATION');
      }
      const operation=['save','submit'].includes(action)?action:['approve','reject','withdraw'].includes(action)?null:'edit';
      if(operation&&!operationAllowed(operation))throw Error('FORBIDDEN');
      if(!control.workflow||action==='begin') {
        if(!operationAllowed('edit'))throw Error('FORBIDDEN');
        const started=await transport.begin();if(!sameActor() || closeModal && (modal!==targetModal || editorState()!==submittedState)){return cancelResponse();}control=started.control;revision=started.revision;
        selectedVersionId=open()?.id||active()?.id||selectedVersionId;working=open()?.status==='draft'?copy(open().snapshot):null;
        if(modal&&!modal.generation)modal.generation=control.workflow?.generation;
        if(action==='begin'){toast(t('Đang sửa bản nháp chung · toàn bộ IPQC-C','正在編輯共用草稿 · 全部 IPQC-C'));return started;}
      }
      const flow=control.workflow;let commandAction=action,fields={};
      if(action==='save') {
        if(modal?.dirty&&!confirm(t('Chỉ lưu nội dung đã áp dụng vào bản nháp chung; không bao gồm cửa sổ đang nhập. Tiếp tục?','僅儲存已套用的共用內容，不包含彈窗輸入。繼續？')))return null;
        await transport.flush();
      } else if(action==='submit') {
        if(!flow.saved)throw Error('SUCCESSFUL_SAVE_REQUIRED');
        const reason=await window.VersionDraftUI.confirmSubmit(window.VersionDraftUI.reasonFor(version(),flow), 'IPQC-C');if(!reason)return null;

        fields={savedId:flow.saved.id,reason};
      } else if(['approve','reject','withdraw'].includes(action)) {
        commandAction=action==='reject'?'return':action;
        const caseId=detail.versionId||flow.pendingId;
        const reviewCase=flow.cases.find(row=>row.id===caseId);
        const selfReview=action!=='withdraw'&&reviewCase?.actor.id===requestActor.id;
        const answer=await window.VersionDraftUI.confirmReview({action,scope:`IPQC-C · ${caseId}`,reason:detail.comment||'',selfReview});if(!answer){cancelled=true;return null;}
        if(identity()!==requestActor)throw Error('IDENTITY_CHANGED');fields={caseId,...answer};
      } else if(action==='apply') fields=detail;
      else {commandAction='apply';fields={moduleAction:action,input:detail};}
      const requestWorking=working,requestGeneration=control?.workflow?.generation,
        createdCollection=action==='create-item'?'items':action==='create-error'?'errors':null;
      if(!sameActor())return cancelResponse();
      if(operation&&!operationAllowed(operation))throw Error('FORBIDDEN');
      const saveCapture=action==='save'?captureSaveProjection(transport):null;
      if(saveCapture)fields={...fields,expectedRevision:saveCapture.flow.revision};
      const command=transport.prepare(saveCapture?.flow.generation||flow.generation,commandAction,fields);
      const result=await transport.sendPrepared(command);
      if(saveCapture&&!saveCapture.owns()){readWasSuperseded=true;return null;}
      if(saveCapture&&control?.workflow?.generation!==saveCapture.generation){readWasSuperseded=true;return null;}
      if(saveCapture&&saveCapture.inputsChanged()){
        preserveInputs=true;readAckContext={actor:requestActor,id:requestActorId,epoch:window.ProcessSync?.identityGeneration?.(),action,operationId:result.receipt?.operationId};
        message=t('Bản chụp trước đã lưu; nội dung mới chưa lưu.','先前快照已儲存；新輸入尚未儲存。');showSaveInputNotice(saveCapture);return result;
      }
      if(!sameActor() || closeModal && (working!==requestWorking || control?.workflow?.generation!==requestGeneration)){return cancelResponse();}
      const operationId=result.receipt?.operationId,
        createdId=createdCollection && typeof operationId==='string' && /^[a-zA-Z0-9_-]{8,100}$/.test(operationId)?
          (createdCollection==='errors'?'error-':'item-')+operationId:null;
      if(closeModal && result.control?.workflow?.generation && result.control.workflow.generation!==requestGeneration)return cancelResponse();
      if(saveCapture&&acceptSaveProjection(result,saveCapture,command,transport)){}
      else if(result.control){control=result.control;revision=result.revision;}
      else {if(result.receipt)readAckContext={actor:requestActor,id:requestActorId,epoch:window.ProcessSync?.identityGeneration?.(),action,operationId:result.receipt.operationId};await read(false,sameActor);}
      if(!sameActor() || closeModal && control?.workflow?.generation!==requestGeneration)return cancelResponse();
      selectedVersionId=open()?.id||active()?.id||selectedVersionId;working=open()?.status==='draft'?copy(open().snapshot):null;
      if(action==='create-error' && createdId && working?.errors.some(row=>row.id===createdId))errorId=createdId;
      if(closeModal && modal===targetModal){
        if(editorState()===submittedState)closeEditor(true,false);
        else {
          const rows=targetModal.kind==='error'?working?.errors:working?.items;
          if(!targetModal.existingId && createdCollection){
            if(createdId)targetModal.existingId=createdId;
            else targetModal.creationIdentityUnknown=true;
          }
          const row=rows?.find(item=>item.id===targetModal.existingId);
          if(row)targetModal.base=copy(row);
          targetModal.generation=control?.workflow?.generation;
        }
      }
      syncSelection();window.dispatchEvent(new CustomEvent('quality-equipment-references-updated'));
      const success=action==='save'?t('Đã lưu bản chụp chung trên máy chủ','共用快照已成功儲存至伺服器'):
        ['apply','create-item','create-error','delete-item','delete-error'].includes(action)?t('Đã đồng bộ · chưa lưu','已同步 · 尚未手動儲存'):t('Thao tác đã được máy chủ xác nhận','操作已由伺服器確認');
      message='';toast(success);return result;
    } catch(error) {if(isReadSuperseded(error)){readWasSuperseded=true;return null;}if(sameActor()){
      if(closeModal && targetModal && !targetModal.existingId && ['create-item','create-error'].includes(action) &&
        (sharedClient?.hasUnknown() || error.message==='RESULT_UNKNOWN_CHECK_BEFORE_RETRY'))targetModal.creationIdentityUnknown=true;
      const terms=workflowErrors[error.message];message=terms?t(...terms):error.message;
    }return null;}
    finally {busy=false;if(!readWasSuperseded&&!preserveInputs&&sameActor()){
      if(!cancelled || refreshCurrent){draw();reviewDraw();}
      if(!closeModal || !modal || modal===targetModal && editorState()===submittedState)restoreView();
    }}
  }
  const open = () => control?.versions.find(v => v.status === 'draft' || v.status === 'pending');
  const active = () => control?.versions.find(v => v.id === control.activeVersionId);
  const version = () => control?.versions.find(v => v.id === selectedVersionId) || open() || active() || control?.versions[0];
  const snapshot = () => version()?.status === 'draft' && working && version()?.id === open()?.id ? working : version()?.snapshot;
  const draftOpen = () => version()?.status === 'draft' && !!working && !control?.workflow?.pendingId;
  const editing = () => draftOpen() && operationAllowed('edit');
  const pendingItems = () => (version()?.status === 'draft' ? snapshot()?.items || [] : []).filter(item=>!item.deleted).map(item=>{
    const missing=[];
    if(!item.description?.trim())missing.push(t('Mô tả cách kiểm tra','檢查方式敘述'));
    if(!item.standard?.trim()&&!item.notApplicable)missing.push(t('Tiêu chuẩn','檢查標準'));
    if((!item.frequency?.trim()&&!item.rule||item.rule?.cadence==='none')&&!item.notApplicable)missing.push(t('Tần suất (không chặn gửi/duyệt)','檢查頻率（不阻擋送審／核准）'));
    return {item,missing};
  }).filter(row=>row.missing.length);
  const coverageIssues=()=>{
    if(version()?.status!=='draft')return [];
    const items=snapshot()?.items||[];
    // Preserve the former strict-equality behavior for malformed/non-string keys.
    if(items.some(item=>typeof item.productCode!=='string'||typeof item.stageCode!=='string')||
      catalog.products.some(product=>typeof product.code!=='string'||(product.stages||[]).some(stage=>typeof stage!=='string')))
      return catalog.products.flatMap(p=>(p.stages||[]).filter(stage=>!(snapshot()?.items||[]).some(i=>!i.deleted&&i.standardEnabled&&!i.notApplicable&&i.productCode===p.code&&i.stageCode===stage)).map(stage=>({product:p.code,stage})));
    // Rebuild per call: working edits, product routes and permissions may change.
    // Nested Sets preserve exact product/stage identity without delimiter collisions.
    const covered=new Map();
    for(const item of items) {
      if(item.deleted||!item.standardEnabled||item.notApplicable)continue;
      let stages=covered.get(item.productCode);
      if(!stages){stages=new Set();covered.set(item.productCode,stages);}
      stages.add(item.stageCode);
    }
    return catalog.products.flatMap(product=>(product.stages||[])
      .filter(stage=>!covered.get(product.code)?.has(stage))
      .map(stage=>({product:product.code,stage})));
  };
  const photoUrl = photo => photo.preview || `${API}/photo?id=${encodeURIComponent(photo.id)}`;
  const same = (left,right) => JSON.stringify(left) === JSON.stringify(right);
  function mergeDraft(base, local, latest) {
    const clashes = [];
    const mergeRows = kind => {
      const before = new Map((base?.[kind]||[]).map(row=>[row.id,row]));
      const changed = new Map((local?.[kind]||[]).map(row=>[row.id,row]));
      const rows = (latest?.[kind]||[]).map(remote=>{
        const old=before.get(remote.id), mine=changed.get(remote.id);
        if(!old||!mine)return remote;
        const mineChanged=!same(mine,old), serverChanged=!same(remote,old);
        if(mineChanged&&serverChanged&&!same(mine,remote))
          clashes.push({kind,id:remote.id,code:remote.code,local:copy(mine),remote:copy(remote)});
        return mineChanged?mine:remote;
      });
      for(const mine of changed.values())if(!rows.some(row=>row.id===mine.id))
        clashes.push({kind,id:mine.id,code:mine.code,local:copy(mine),remote:null});
      return rows;
    };
    return {snapshot:{errors:mergeRows('errors'),items:mergeRows('items')},clashes};
  }
  const product = () => catalog.products.find(p => p.code === productCode);
  const errorsFor = () => (snapshot()?.errors || []).filter(e => !e.deleted && e.productCode === productCode && e.stageCode === stageCode);
  const itemsFor = () => (snapshot()?.items || []).filter(i => !i.deleted && i.errorId === errorId);
  const chosenError = () => (snapshot()?.errors || []).find(e => e.id === errorId && !e.deleted);
  const formatted = value => value || `<span class="ipqcc-missing">${t('Chờ bổ sung','待補')}</span>`;
  const paragraphs = value => String(value||'').split(/\n\s*\n/);
  function instructionHTML(item) {
    const chunks=paragraphs(item.description), end=chunks.length, photos=item.mediaItems||[];
    const photoAt=index=>{
      const content=photos.filter(photo=>Math.min(Number.isInteger(photo.afterParagraph)?photo.afterParagraph:end,end)===index)
        .map(photo=>`<button type="button" data-ipqcc-view="${h(item.id)}" data-index="${photos.indexOf(photo)}"><img decoding="async" loading="lazy" src="${h(photoUrl(photo))}" alt="${h(photo.name)}"><small>${h(photo.note||photo.name)}</small></button>`).join('');
      return content?`<div class="ipqcc-photos">${content}</div>`:'';
    };
    return `<div class="ipqcc-instruction"><b>${t('Mô tả cách kiểm tra','檢查方式敘述')}</b>${photoAt(0)}${chunks.map((chunk,index)=>`<p data-i18n-skip="true">${formatted(h(chunk))}</p>${photoAt(index+1)}`).join('')}</div>`;
  }

  function syncSelection() {
    const data = snapshot();
    if (!catalog.products.some(p => p.code === productCode))
      productCode = data?.errors.find(e => !e.deleted)?.productCode || catalog.products[0]?.code || '';
    const routes = product()?.stages || [];
    if (!routes.includes(stageCode)) stageCode = routes.find(code => data?.errors.some(e => !e.deleted && e.productCode === productCode && e.stageCode === code)) || routes[0] || '';
    if (!errorsFor().some(e => e.id === errorId)) errorId = errorsFor()[0]?.id || '';
  }
  async function read(preserve = false, isCurrent=()=>true, parallelAccess=false,allowSaveNotice=false) {
    if(saveInputNoticePending()&&!allowSaveNotice)throw Error('IPQCC_SAVE_INPUT_RECHECK_REQUIRED');
    const sequence=++readSequence,mount=mountSequence,priorControl=control,priorRevision=revision,requestActor=identity(),requestActorId=requestActor?.id,requestEpoch=window.ProcessSync?.identityGeneration?.(),
      delivery=window.ProcessSync?.captureDelivery?.(),owns=()=>(allowSaveNotice||!saveInputNoticePending())&&!window.ProcessSync?.requiresReload&&identity()===requestActor&&identity()?.id===requestActorId&&requestEpoch===window.ProcessSync?.identityGeneration?.()&&sequence===readSequence&&mount===mountSequence&&control===priorControl&&revision===priorRevision&&isCurrent()&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));
    if(readQuarantinedDraft&&!ownsQuarantinedDraft())readQuarantinedDraft=null;
    if(readAckContext&&(readAckContext.actor!==requestActor||readAckContext.id!==requestActorId||readAckContext.epoch!==requestEpoch))readAckContext=null;
    const quarantineDenied=error=>{if(!owns())return;if([401,403].includes(error?.status)){readAccessBlock={actor:requestActor,id:requestActorId,epoch:requestEpoch,status:error.status};if(!ownsQuarantinedDraft())readQuarantinedDraft={actor:requestActor,id:requestActorId,epoch:requestEpoch,revision:priorRevision,working:working?copy(working):null,modal};modal=null;viewer=null;picker=null;caseHistory=null;conflict=null;}if(readAccessBlocked())reviewDraw();};
    let body;
    try {
    const loadData=async()=>{
      const response=await fetch(API+'?caseMetadata=1',{cache:'no-store',headers:headers()});
      const value=await response.json().catch(()=>({}));
      if(!owns())throw Error('IPQCC_READ_SUPERSEDED');
      if(!response.ok||!value.control||!Number.isInteger(value.revision))throw Object.assign(Error(value.error||t('Không tải được IPQC-C','IPQC-C 載入失敗')),{status:response.status});
      return value;
    };
    if(parallelAccess){
      const settled=await Promise.allSettled([loadData().catch(error=>{quarantineDenied(error);throw error;}),Promise.resolve().then(()=>sharedTransport().permissions({isCurrent:owns})).catch(error=>{quarantineDenied(error);throw error;})]);
      if(!owns())throw Error('IPQCC_READ_SUPERSEDED');
      // A current denial wins even when the other leg failed transiently.
      const denied=settled.find(result=>result.status==='rejected'&&[401,403].includes(result.reason?.status));
      if(denied)throw denied.reason;
      const failed=settled.find(result=>result.status==='rejected');if(failed)throw failed.reason;
      body=settled[0].value;
    }else{body=await loadData();await sharedTransport().permissions({isCurrent:owns});}
    if(!owns())throw Error('IPQCC_READ_SUPERSEDED');
    } catch(error) {if(!owns())throw Error('IPQCC_READ_SUPERSEDED');quarantineDenied(error);if(error&&typeof error==='object')readErrorOwners.set(error,owns);if((error?.code||error?.message)==='ACCESS_READ_SUPERSEDED')readRecoveryNeeded=true;throw error;}
    readRecoveryNeeded=false;readAccessBlock=null;readAckContext=null;saveInputNotice=null;
    control = body.control; revision = body.revision; catalog = body.catalog || catalog;
    equipmentGroups = body.equipmentGroups || [];
    equipment = body.equipment || [];
    equipmentCategories = body.equipmentCategories || [];
    equipmentSubcategories = body.equipmentSubcategories || [];
    if (!control.versions.some(v => v.id === selectedVersionId)) selectedVersionId = open()?.id || active()?.id || '';
    if (!preserve || !working) working = open()?.status === 'draft' ? copy(open().snapshot) : null;
    syncSelection();
  }
  async function write(action, detail = {}, closeModal = false) {
    if(readAccessBlocked()){message='READ_ACCESS_RECHECK_REQUIRED';draw();reviewDraw();return null;}
    // Keep existing pending cases on their verified legacy review path. All new
    // editing rounds and adopted drafts use V3 without silently saving content.
    if(control?.workflow||!['approve','reject','withdraw'].includes(action))return writeShared(action,detail,closeModal);
    if (busy) return null;
    if (conflict) { message=t('Cần xử lý xung đột trước khi lưu','請先處理修訂衝突'); draw(); return null; }
    busy = true; message = '';const restoreView=window.VersionDraftUI.preserveView(host,reviewHost),requestActor=identity();let cancelled=false;
    try {
      if(['approve','reject','withdraw'].includes(action)){
        const target=control.versions.find(v=>v.id===(detail.versionId||open()?.id)),selfReview=action!=='withdraw'&&target?.creatorId===requestActor.id;
        const answer=await window.VersionDraftUI.confirmReview({action,scope:`IPQC-C · V${target?.number}`,reason:detail.comment||'',selfReview});if(!answer){cancelled=true;return null;}
        if(identity()!==requestActor)throw Error('IDENTITY_CHANGED');detail={...detail,versionId:target?.id,versionRevision:target?.revision,comment:answer.reason,reason:answer.reason,selfReviewConfirmed:answer.selfReviewConfirmed};
      }
      let response, body;
      for (let attempt=0;attempt<2;attempt++) {
        const prior = open(), priorActive = control?.activeVersionId;
        response = await fetch(API, { method:'POST', headers:headers(), body:JSON.stringify({ action,
          baseRevision:revision, versionId:prior?.id, versionRevision:prior?.revision, ...detail }) });
        body = await response.json().catch(() => ({}));
        if (response.status !== 409 || attempt === 1) break;
        const oldSnapshot = prior?.snapshot;
        await read(true);
        const latest = open();
        if (prior?.id === latest?.id && prior?.revision === latest?.revision && priorActive === control.activeVersionId) continue;
        if (prior?.id === latest?.id && latest?.status === 'draft' && priorActive === control.activeVersionId) {
          const merged=mergeDraft(oldSnapshot,working||oldSnapshot,latest.snapshot);
          working=merged.snapshot;
          if (!merged.clashes.length) {
            if (detail.snapshot) detail.snapshot=working;
            continue;
          }
          conflict={items:merged.clashes,statusChanged:false};
          throw Error(`${t('Cùng một mục đã được sửa ở nơi khác','同一項目已在其他位置修改')}。${t('Nội dung không xung đột vẫn được giữ; hãy đối chiếu từng mục trước khi lưu','未衝突內容已保留；請逐項核對後再儲存')}。`);
        }
        conflict={items:[],statusChanged:true};
        throw Error(`${t('Trạng thái phiên bản đã thay đổi','版本狀態已改變')}。${t('Đã giữ nguyên phần nhập chưa lưu của bạn','未儲存輸入已保留')}。`);
      }
      if (!response.ok || !body.control || !Number.isInteger(body.revision))
        throw Error([body.error, ...(body.errors || [])].filter(Boolean).join('\n') || `HTTP ${response.status}`);
      control = body.control; revision = body.revision;
      selectedVersionId = open()?.id || active()?.id || selectedVersionId;
      working = open()?.status === 'draft' ? copy(open().snapshot) : null;
      if (action === 'create-error') errorId = working?.errors.at(-1)?.id || errorId;
      if (closeModal) closeEditor(true);
      syncSelection();
      void window.ProcessSync?.refresh?.().catch(() => { /* This dedicated CAS response already confirmed the write. */ });
      window.dispatchEvent(new CustomEvent('quality-equipment-references-updated'));
      if (['approve', 'reject', 'withdraw'].includes(action))
        void window.RoutineEquipmentUI?.reconcilePendingReplacements?.();
      message = '';toast(t('Đã lưu trên máy chủ','已由伺服器保存'));
      return body;
    } catch (error) {
      if(isReadSuperseded(error)){cancelled=true;return null;}
      message = error.message || t('Không lưu được','儲存失敗');
      return null;
    } finally { busy = false;if(!cancelled){draw();reviewDraw();restoreView();} }
  }
  const productRows = () => {
    const query = fold(search.trim());
    const filtered = catalog.products.filter(p => !query || fold(`${p.code} ${p.name}`).includes(query));
    return `<p class="ipqcc-count">${filtered.length} / ${catalog.products.length} ${t('sản phẩm','個產品')}</p>${filtered.map(p =>
      `<button type="button" class="ipqcc-product ${p.code === productCode ? 'selected':''}" data-ipqcc-product="${h(p.code)}"><code>${h(p.code)}</code><span data-i18n-skip="true">${h(p.name)}</span></button>`).join('') || `<p>${t('Không tìm thấy sản phẩm','找不到產品')}</p>`}`;
  };
  function equipmentListPreview(item) {
    if (!item.equipmentId) return '';
    const eq=item.equipmentSnapshot || equipment.find(row=>row.id===item.equipmentId);
    if (!eq) return '';
    return `<a class="ipqcc-equipment-preview" href="/process/?system=quality&view=data&dataTab=quality-routine-equipment&equipmentId=${encodeURIComponent(item.equipmentId)}" target="_blank" rel="noopener" title="${h(t('Xem thiết bị','查看檢具資訊'))}">${eq.photoId?`<img decoding="async" loading="lazy" src="/api/routine-equipment/photo?id=${h(eq.photoId)}" alt="${h(eq.name||'')}">`:'◇'}<span><b>${h(eq.assetCode)} / ${h(eq.pieceMark)}</b><small>${h(eq.name||'')}</small></span></a>`;
  }
  async function loadCaseHistory(before='') {
    const state=caseHistory||{cases:[],next:null,total:0,reviewCase:null,itemPage:0};
    caseHistory=state;state.loading=true;state.error='';draw();
    try {const result=await sharedTransport().history(before);if(caseHistory!==state)return;Object.assign(state,result,{reviewCase:null,itemPage:0});}
    catch(error){state.error=error.message;}
    finally{state.loading=false;if(caseHistory===state){draw();host?.querySelector('#ipqcc-case-close')?.focus({preventScroll:true});}}
  }
  async function loadCase(id) {
    const state=caseHistory;if(!state)return;state.loading=true;state.error='';draw();
    try{const result=await sharedTransport().reviewCase(id);if(caseHistory===state)Object.assign(state,result,{itemPage:0});}
    catch(error){state.error=error.message;}
    finally{state.loading=false;if(caseHistory===state)draw();}
  }
  function caseHistoryHTML() {
    const state=caseHistory,c=state.reviewCase;
    const ids=c?[...new Set([...c.before.items,...c.content.items].map(i=>i.id))]:[];
    const changes=ids.map(id=>({id,before:c.before.items.find(i=>i.id===id),after:c.content.items.find(i=>i.id===id)})).filter(row=>state.showAll||!same(row.before,row.after));
    const errors=c?[...new Set([...c.before.errors,...c.content.errors].map(e=>e.id))].map(id=>({before:c.before.errors.find(e=>e.id===id),after:c.content.errors.find(e=>e.id===id)})).filter(row=>state.showAll||!same(row.before,row.after)):[];
    const itemHTML=item=>!item?`<p>${t('Không tồn tại','不存在')}</p>`:`<p><code>${h(item.code)}</code> · ${item.deleted?t('Đã xóa','已刪除'):t('Đang dùng','使用中')}</p><dl><dt>${t('Tiêu chuẩn','標準')}</dt><dd>${h(item.standard)}</dd><dt>${t('Cách kiểm tra','檢查方式')}</dt><dd>${h(item.description)}</dd><dt>${t('Thiết bị','檢具')}</dt><dd>${h(item.equipmentSnapshot?.name||item.equipmentId||t('Bằng mắt','目視'))}</dd><dt>${t('Quy tắc','規則')}</dt><dd>${h(ruleSummary(item.rule,item.frequency))}</dd><dt>${t('Ghi chú','備註')}</dt><dd>${h(item.note)}</dd></dl><div class="ipqcc-case-photos">${(item.mediaItems||[]).map(photo=>`<a href="${h(photoUrl(photo))}" target="_blank" rel="noopener"><img decoding="async" loading="lazy" src="${h(photoUrl(photo))}" alt="${h(photo.note||photo.name)}"><span>${h(photo.note||photo.name)}</span></a>`).join('')}</div>`;
    return `<div class="ipqcc-overlay"><section class="ipqcc-dialog ipqcc-case-dialog" id="ipqcc-case-dialog" role="dialog" aria-modal="true" aria-labelledby="ipqcc-case-title"><header><h3 id="ipqcc-case-title">${t('Hồ sơ gửi duyệt cố định','固定送審案件')}</h3><button type="button" id="ipqcc-case-close" aria-label="${t('Đóng','關閉')}">×</button></header><div class="ipqcc-dialog-body">
      <p>${t('Chỉ đọc: nội dung và ảnh tại thời điểm gửi. Thay đổi bản nháp không sửa hồ sơ này. Giờ Việt Nam (UTC+7).','唯讀：送審當時內容與圖片；後續草稿修改不改写此案件。越南時間（UTC+7）。')}</p>
      ${state.error?`<p class="ipqcc-message" role="alert">${h(state.error)}</p>`:''}${state.loading?`<p role="status">${t('Đang tải…','載入中…')}</p>`:''}
      ${c?`<div class="ipqcc-case-meta"><div><b>${t('Mã hồ sơ','案件編號')}</b><code>${h(c.id)}</code></div><div><b>${t('Trạng thái','狀態')}</b>${h(status(c.status))}</div><div><b>${t('Người gửi / thời gian','送審人／時間')}</b>${h(c.actor.name)} · ${h(date(c.at))}</div><div><b>${t('Bản đã lưu / bản gốc','儲存版／基準版')}</b><code>${h(c.savedId)} / ${h(c.baseId||'—')}</code></div><div><b>${t('Lý do gửi','送審理由')}</b>${h(c.reason)}</div><div><b>${t('Kết quả xét duyệt','處理結果')}</b>${c.result?`${h(c.result.actor.name)} · ${h(date(c.result.at))}<br>${h(c.result.reason)}${c.result.selfReview?` · ${t('Tự xét duyệt','本人自審')}`:''}`:'—'}</div></div>
      <button type="button" class="button ghost" id="ipqcc-case-all">${state.showAll?t('Chỉ xem thay đổi','僅查看變更'):t('Xem cả nội dung không thay đổi','包含未變更內容')}</button>
      <h4>${t('Mã lỗi','錯誤代碼')} · ${errors.length}</h4>${errors.map(row=>`<p><code>${h(row.after?.code||row.before?.code)}</code> · ${h(row.before?.name||'—')} → ${h(row.after?.name||'—')}${row.after?.deleted?` · ${t('Đã xóa','已刪除')}`:''}</p>`).join('')}
      <h4>${state.showAll?t('Tất cả hạng mục','全部項目'):t('Hạng mục thay đổi','變更項目')} · ${changes.length}</h4>${changes.slice(state.itemPage*10,state.itemPage*10+10).map(row=>`<article class="ipqcc-case-diff"><section><h4>${t('Trước khi gửi','送審前正式內容')}</h4>${itemHTML(row.before)}</section><section><h4>${t('Nội dung đã gửi','送審固定內容')}</h4>${itemHTML(row.after)}</section></article>`).join('')}
      <div class="ipqcc-case-pages"><button class="button ghost" id="ipqcc-case-items-prev" ${state.itemPage===0?'disabled':''}>${t('Trang trước','上一頁')}</button><span>${state.itemPage+1} / ${Math.max(1,Math.ceil(changes.length/10))}</span><button class="button ghost" id="ipqcc-case-items-next" ${(state.itemPage+1)*10>=changes.length?'disabled':''}>${t('Trang sau','下一頁')}</button></div>`:
      `<div class="ipqcc-case-table"><table><thead><tr><th>${t('Thời gian / người gửi','時間／送審人')}</th><th>${t('Trạng thái','狀態')}</th><th>${t('Lý do','理由')}</th><th>${t('Hồ sơ','案件')}</th></tr></thead><tbody>${state.cases.map(row=>`<tr><td>${h(date(row.at))}<br>${h(row.actor.name)}</td><td>${h(status(row.status))}</td><td>${h(row.reason)}</td><td><button class="button ghost" data-ipqcc-case="${h(row.id)}">${t('Xem hồ sơ','查看案件')}</button></td></tr>`).join('')}</tbody></table></div><p>${state.total} ${t('hồ sơ','件案件')}</p><div class="ipqcc-case-pages"><button class="button ghost" id="ipqcc-case-first">${t('Mới nhất','最新案件')}</button><button class="button ghost" id="ipqcc-case-next" ${!state.next?'disabled':''}>${t('Trang sau','下一頁')}</button></div>`}
      </div><footer><button type="button" class="button ghost" id="ipqcc-case-legacy">${t('Phiên bản cũ · chỉ đọc','舊版本封存 · 唯讀')}</button>${c?`<button type="button" class="button ghost" id="ipqcc-case-back">${t('Danh sách hồ sơ','案件清單')}</button>`:''}<button type="button" class="button signal" id="ipqcc-case-current">${t('Về phạm vi hiện tại','返回目前範圍')}</button></footer></section></div>`;
  }
  function mainHTML() {
    if(readAccessBlocked())return readBlockedHTML();
    syncSelection(); const v = version(), data = snapshot(), pending = pendingItems();
    const selectedError = chosenError();
    return `<section class="ipqcc-page" id="ipqcc-page" data-i18n-skip="true">
      ${ownsQuarantinedDraft()?`<p class="ipqcc-message" role="status">${t('Sau khi đọc lại thành công, hiển thị dữ liệu máy chủ; nội dung chưa áp dụng không tự động được đưa trở lại.','重新讀取成功後顯示伺服器資料；未套用輸入不會自動帶回。')}</p>`:''}
      ${readRecoveryNeeded?`<div class="ipqcc-message" role="alert">${t('Trạng thái quyền đã thay đổi; cần đọc lại để tiếp tục. Không tự động gửi lại.','權限讀取狀態已改變，請重新讀取後繼續；不會自動重送。')} <button type="button" id="ipqcc-read-retry" class="button ghost">${t('Đọc lại dữ liệu và quyền','重新讀取資料與權限')}</button></div>`:''}
      <header class="ipqcc-header"><div><p class="eyebrow">IPQC-C</p><h2>${t('Tiêu chuẩn kiểm tra công đoạn C','C 線製程檢查標準')}</h2>
        <p>${t('Dữ liệu sản phẩm và công đoạn lấy từ danh mục hiện hành','產品與工段讀取現行主檔')}</p></div>
        <div class="ipqcc-header-actions"><label>${t('Phiên bản','版本')}<select id="ipqcc-version">${(control?.versions || []).slice().reverse().map(row => `<option value="${h(row.id)}" ${row.id === v?.id ? 'selected':''}>V${row.number} · ${h(status(row.status))} · ${h(lastEdit(row)?.actorName || row.creatorName)} · ${h(date(lastEdit(row)?.at || row.createdAt))}</option>`).join('')}</select></label>
          ${v ? `<span class="ipqcc-state">V${v.number} · ${h(status(v.status))}</span>`:''}
          ${!open() && operationAllowed('edit') ? `<button class="button signal" id="ipqcc-begin">${t('Bắt đầu sửa','開始修改')}</button>`:''}
          ${draftOpen() && operationAllowed('save') && (control?.workflow||operationAllowed('edit')) ? `<button class="button ghost" id="ipqcc-save" ${busy?'disabled':''}>${t('Lưu bản nháp','儲存草稿')}</button>`:''}
          ${draftOpen() && operationAllowed('submit') && (control?.workflow||operationAllowed('edit')) ? `<button class="button signal" id="ipqcc-submit" ${busy?'disabled':''}>${t('Gửi duyệt','送出審核')}</button>`:''}
          ${control?.workflow&&permitted('approval.compare')?`<button class="button ghost" id="ipqcc-case-history">${t('Hồ sơ gửi duyệt','送審案件')}</button>`:''}
          ${v?.status === 'pending' && permitted('approval.withdraw') ? `<button class="button ghost" id="ipqcc-withdraw" ${busy?'disabled':''}>${t('Rút hồ sơ','撤回送審')}</button>`:''}
        </div></header>
      <section class="ipqcc-meta" id="ipqcc-shared-status" role="status"><span>${t('Phạm vi: toàn bộ IPQC-C — bộ lọc không thu hẹp phạm vi lưu/gửi','範圍：全部 IPQC-C — 篩選不縮小儲存／送審範圍')}</span>${control?.workflow?`<span>${control.workflow.pendingId?t('Chờ duyệt · khóa toàn bộ','待審 · 全部鎖定'):control.workflow.saved&&same(control.workflow.working,control.workflow.saved.content)?t('Đã lưu','已儲存'):t('Đã đồng bộ · chưa lưu','已同步 · 尚未儲存')}</span>${control.workflow.saved?`<span>${t('Người lưu','儲存者')}: ${h(control.workflow.saved.actor.name)} · ${h(date(control.workflow.saved.at))}</span>`:''}`:''}</section>
      ${sharedClient?.hasUnknown()?`<div class="ipqcc-message"><button class="button ghost" id="ipqcc-check-operation">${t('Kiểm tra kết quả thao tác','查證操作結果')}</button><button class="button ghost" id="ipqcc-retry-operation">${t('Thử lại cùng thao tác','重試同一操作')}</button></div>`:''}
      ${message ? `<div class="ipqcc-message" role="alert">${h(displayDraftError(message))}${conflict?`<div class="ipqcc-conflicts">${conflict.items.map(row=>`<article><b>${h(row.code)}</b>${Object.keys({...row.local,...row.remote}).filter(key=>!same(row.local?.[key],row.remote?.[key])&&!['id','code','sourceRow'].includes(key)).map(key=>`<p><strong>${h(key)}</strong><br>${t('Của bạn','你的版本')}: ${h(JSON.stringify(row.local?.[key]??null))}<br>${t('Trên máy chủ','伺服器版本')}: ${h(JSON.stringify(row.remote?.[key]??null))}</p>`).join('')}<button type="button" data-ipqcc-restore="${h(row.id)}" class="button ghost">${t('Khôi phục mục này từ máy chủ','將此項還原至伺服器版本')}</button></article>`).join('')}</div><button type="button" id="ipqcc-reload" class="button ghost">${t('Tải toàn bộ phiên bản mới','載入完整最新版')}</button>`:''}</div>`:''}
      ${v ? `<section class="ipqcc-meta"><span>${t('Người sửa cuối','最後編輯')}: ${h(lastEdit(v)?.actorName || v.creatorName)} · ${h(date(lastEdit(v)?.at || v.createdAt))}</span><span>${t('Gửi duyệt','送審')}: ${h(v.submittedBy || '—')} · ${h(date(v.submittedAt))}</span><span>${t('Xét duyệt','審核')}: ${h(v.reviewedBy || '—')} · ${h(date(v.reviewedAt))}</span>${v.reviewComment ? `<span>${t('Ý kiến','意見')}: ${h(v.reviewComment)}</span>`:''}</section>`:''}
      ${pending.length?`<details class="ipqcc-pending"><summary>${t('Mục cần bổ sung','待補項目')} · ${pending.length}</summary><div>${pending.slice(0,40).map(({item,missing})=>`<p><b>${h(item.code)}</b> · ${h(missing.join('、'))} ${editing()?`<button type="button" class="button ghost" data-ipqcc-fix-item="${h(item.id)}">${t('Đến sửa','前往修正')}</button>`:''}</p>`).join('')}${pending.length>40?`<p>${t('Còn','其餘')} ${pending.length-40} ${t('mục; lọc theo sản phẩm để sửa','項，請依產品篩選修正')}</p>`:''}</div></details>`:''}
      ${!v ? `<section class="ipqcc-empty">${t('Chưa có phiên bản IPQC-C','尚無 IPQC-C 版本')}</section>` :
      `<div class="ipqcc-layout"><aside class="ipqcc-products"><label for="ipqcc-search">${t('Tìm mã hoặc tên sản phẩm','搜尋產品代碼或名稱')}</label>
        <input id="ipqcc-search" type="search" value="${h(search)}" autocomplete="off" placeholder="${t('Tìm mã hoặc tên sản phẩm','搜尋產品代碼或名稱')}"><div id="ipqcc-product-results">${productRows()}</div></aside>
        <div class="ipqcc-work"><div class="ipqcc-product-head"><div><h3><code>${h(productCode)}</code> <span data-i18n-skip="true">${h(product()?.name || '')}</span></h3><p>${t('Tuyến công đoạn hiện hành','現行工段路線')}</p></div><div class="ipqcc-stages">${(product()?.stages || []).map(code => `<button type="button" data-ipqcc-stage="${h(code)}" class="${code===stageCode?'selected':''}">${h(code)} <small>${h(catalog.stages.find(s=>s.code===code)?.name || '')}</small></button>`).join('')}</div></div>
          <div class="ipqcc-columns"><section class="ipqcc-card"><header><h3>${t('Mã lỗi','錯誤代碼')} <small>${errorsFor().length}</small></h3>${editing() && stageCode ? `<button class="button ghost" data-ipqcc-add="error">＋ ${t('Thêm mã lỗi','新增錯誤代碼')}</button>`:''}</header>
            <div class="ipqcc-error-list">${errorsFor().map(e => `<article class="ipqcc-error ${e.id===errorId?'selected':''}" data-ipqcc-error="${h(e.id)}"><div><code>${h(e.code)}</code><strong data-i18n-skip="true">${h(e.name || t('Chờ bổ sung','待補'))}</strong><small>${(data?.items || []).filter(i=>!i.deleted&&i.errorId===e.id).length} ${t('hạng mục','項目')}</small></div><div class="ipqcc-row-actions"><button type="button" data-ipqcc-view-error="${h(e.id)}">${t('Xem','查看')}</button>${editing()?`<button type="button" data-ipqcc-edit-error="${h(e.id)}">${t('Sửa','修改')}</button><button type="button" data-ipqcc-delete-error="${h(e.id)}">${t('Xóa','刪除')}</button>`:''}</div></article>`).join('') || `<p class="ipqcc-empty">${t('Chưa có mã lỗi trong công đoạn này','此工段尚無錯誤代碼')}</p>`}</div></section>
          <section class="ipqcc-card"><header><h3>${t('Hạng mục kiểm tra','檢查項目')} <small>${itemsFor().length}</small></h3>${editing()&&selectedError?`<button class="button ghost" data-ipqcc-add="item">＋ ${t('Thêm hạng mục','新增檢查項目')}</button>`:''}</header>
            ${selectedError ? (itemsFor().map(i => `<details class="ipqcc-item"><summary><code>${h(i.code)}</code>${equipmentListPreview(i)}<span class="ipqcc-list-standard" data-i18n-skip="true">${h(i.standard || t('Chờ bổ sung','待補'))}</span>${i.mediaItems?.[0]?`<button type="button" class="ipqcc-cover" data-ipqcc-view="${h(i.id)}" data-index="0"><img decoding="async" loading="lazy" src="${h(photoUrl(i.mediaItems[0]))}" alt="${h(i.mediaItems[0].note||i.mediaItems[0].name)}"></button>`:''}<span class="ipqcc-status ${i.standardEnabled?'on':'off'}">${i.standardEnabled?t('Đang dùng','啟用'):t('Tạm ngưng','停用')}</span><span class="ipqcc-row-actions"><button type="button" data-ipqcc-view-item="${h(i.id)}">${t('Xem','查看')}</button>${editing()?`<button type="button" data-ipqcc-edit-item="${h(i.id)}">${t('Sửa','修改')}</button><button type="button" data-ipqcc-delete-item="${h(i.id)}">${t('Xóa','刪除')}</button>`:''}</span><span class="process-ipqc-frequency">${t('Tần suất kiểm tra','檢查頻率')}: ${h(ruleSummary(i.rule,i.frequency))}</span>${window.ProcessIPQC.referenceMarkup('C','C',i.id)}</summary>
              <div class="ipqcc-item-body"><p><b>${t('Tiêu chuẩn kiểm tra','檢查標準')}</b><span data-i18n-skip="true">${formatted(h(i.standard))}</span></p>${instructionHTML(i)}
              <p><b>${t('Dụng cụ / thiết bị','工具／設備')}</b><span data-i18n-skip="true">${formatted(h(i.tool))}</span></p><div class="ipqcc-selected-equipment">${i.equipmentId?`${i.equipmentSnapshot?.photoId?`<img decoding="async" loading="lazy" src="/api/routine-equipment/photo?id=${h(i.equipmentSnapshot.photoId)}" alt="">`:''}<span>${h(i.equipmentSnapshot?.assetCode||'')} / ${h(i.equipmentSnapshot?.pieceMark||'')} · ${h(i.equipmentSnapshot?.name||'')}</span>`:t('Kiểm tra trực quan','目視檢查')}</div><p><b>${t('Phương pháp','方法')}</b><span data-i18n-skip="true">${formatted(h(i.method))}</span></p><p><b>CPK</b>${i.cpkEnabled?t('Bật','啟用'):t('Không','關閉')}</p>
              </div></details>`).join('') || `<p class="ipqcc-empty">${t('Chưa có hạng mục','尚無檢查項目')}</p>`) : `<p class="ipqcc-empty">${t('Chọn mã lỗi để xem hạng mục','選擇錯誤代碼查看項目')}</p>`}
          </section></div></div></div><details class="ipqcc-history"><summary>${t('Lịch sử và nguồn dữ liệu','歷程與資料來源')}</summary><p>${t('Nguồn','來源')}: ${h(control?.source?.fileName || '—')} · SHA-256 ${h(control?.source?.sha256 || '—')}</p>${(v.history||[]).slice().reverse().map(event=>`<p>${h(event.action)} · ${h(event.actorName)} · ${h(date(event.at))} ${h(event.comment||'')}</p>`).join('')}</details>`}
      ${modal ? editorHTML():''}${picker ? equipmentPickerHTML():''}${viewer?viewerHTML():''}${caseHistory?caseHistoryHTML():''}
    </section>`;
  }
  function draw() {
    const content = document.querySelector('#data-content');
    if (host !== content || !content?.isConnected || content.dataset.activeTab !== 'quality-ipqc-c') return;
    const scroll = window.scrollY;
    const focused=host.contains(document.activeElement)?document.activeElement:null;
    const focusId=focused?.id,selectionStart=focused?.selectionStart,selectionEnd=focused?.selectionEnd;
    const selectors = ['.ipqcc-products','.ipqcc-card:nth-child(1)','.ipqcc-card:nth-child(2)','#ipqcc-editor .ipqcc-dialog-body','#ipqcc-equipment-dialog .ipqcc-dialog-body'];
    const positions = selectors.map(selector=>host.querySelector(selector)?.scrollTop || 0);
    host.innerHTML = mainHTML();
    const coverage=readAccessBlocked()?[]:coverageIssues();if(coverage.length)host.querySelector('.ipqcc-header')?.insertAdjacentHTML('afterend',`<details class="ipqcc-pending"><summary>${t('Sản phẩm chưa được bao phủ · không chặn gửi/duyệt','適用產品尚未完整涵蓋 · 不阻擋送審／核准')} · ${coverage.length}</summary>${coverage.map(row=>`<p>${h(row.product)} / ${h(row.stage)} <button type="button" data-ipqcc-coverage="${h(row.product)}" data-stage="${h(row.stage)}">${t('Đến sửa','前往修正')}</button></p>`).join('')}</details>`);
    selectors.forEach((selector,index)=>{const node=host.querySelector(selector);if(node)node.scrollTop=positions[index];});
    bind();
    if(readAccessBlocked())return;
    void window.ProcessIPQC.mountReferences(host);
    sharedClient?.gatePermissions?.();
    window.renderSharedDraftValidation?.({client:sharedClient,flow:control?.workflow,after:host.querySelector('#ipqcc-shared-status'),language,onLocate:issue=>{
      const id=issue.path?.[1]?.id,item=snapshot().items.find(row=>row.id===id),error=snapshot().errors.find(row=>row.id===id),row=item||error;if(!row||!editing())return;
      search='';productCode=row.productCode;stageCode=row.stageCode;errorId=item?.errorId||error.id;startEditor(item?'item':'error',row);
    }});
    window.VersionDraftUI?.mount(host,{header:'.ipqcc-header',historyClient:sharedTransport,module:'IPQC-C',scope:t('Toàn bộ IPQC-C','IPQC-C 全庫'),version:version(),versions:control?.versions,active:control?.versions.find(v=>v.id===control.activeVersionId),flow:control?.workflow,busy,failed:sharedClient?.hasUnknown(),actions:{begin:'#ipqcc-begin',save:'#ipqcc-save',submit:'#ipqcc-submit',withdraw:'#ipqcc-withdraw'},review:()=>{state.view='approval';state.approvalTab='quality';window.render();},errors:'[data-shared-issue-kind="error"]',missing:'.ipqcc-pending,[data-shared-issue-kind="missing"]',checked:{missing:true},history:['.ipqcc-history','#ipqcc-case-history','[data-shared-issue-kind="warning"]'],status:['#ipqcc-shared-status'],remove:['.ipqcc-meta']});
    if(focusId){const field=document.getElementById(focusId);field?.focus({preventScroll:true});if(field?.setSelectionRange&&Number.isInteger(selectionStart))try{field.setSelectionRange(selectionStart,selectionEnd);}catch{/* Non-text controls have no selection range. */}}
    if (scroll) window.scrollTo(0,scroll);
  }
  function refreshProducts() {
    const results = host?.querySelector('#ipqcc-product-results');
    if (results) results.innerHTML = productRows();
  }
  async function upload(file) {
    if(!operationAllowed('edit'))throw Error('FORBIDDEN');
    if (!file || file.size > 5_000_000) throw Error(t('Ảnh tối đa 5 MB','圖片限 5 MB'));
    const response = await fetch(`${API}/photo`, { method:'PUT', headers:{...headers(),'Content-Type':file.type}, body:file });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !/^[a-f0-9]{64}$/.test(body.id || '')) throw Error(body.error || t('Tải ảnh thất bại','圖片上傳失敗'));
    return body.id;
  }
  function startEditor(kind, existing = null, readonly = false) {
    if (!editing() && !readonly) return;
    message='';
    const fields = existing ? copy(existing) : {};
    if (kind === 'item') Object.assign(fields, {
      ruleCadence:existing?.rule?.cadence || (existing ? 'legacy' : 'batch'),
      batchKind:existing?.rule?.batchKind || 'aql',
      timeFrequency:existing?.rule?.timeFrequency || 'monthly',
      ...existing?.rule,
    });
    modal = { kind, existingId:existing?.id || '', generation:control?.workflow?.generation, base:existing?copy(existing):null, fields,
      photos: kind === 'item' ? copy(existing?.mediaItems || []) : [], pendingInsert:null, dirty:false, readonly };
    picker = null;
    draw();
    const body = host.querySelector('#ipqcc-editor .ipqcc-dialog-body');
    if (body) body.scrollTop = 0;
    if (!readonly) host.querySelector('.ipqcc-dialog input:not([readonly]),.ipqcc-dialog textarea')?.focus({preventScroll:true});
  }
  function closeEditor(force = false, redraw = true) {
    if (modal?.dirty && !force && !confirm(t('Bỏ thay đổi chưa lưu?','放棄尚未儲存的修改？'))) return;
    modal?.photos.forEach(photo => { if (photo.preview) URL.revokeObjectURL(photo.preview); });
    modal = null; picker = null; if(redraw)draw();
  }
  function ruleSummary(rule, legacy = '') {
    if (!rule) return legacy || t('Chưa thiết lập','未設定');
    if (rule.cadence === 'none') return t('Chưa thiết lập','未設定');
    if (rule.cadence === 'time') {
      const names = {weekly:t('Hàng tuần','每週'),monthly:t('Hàng tháng','每月'),quarterly:t('Hàng quý','每季'),
        half_yearly:t('Nửa năm','每半年'),yearly:t('Hàng năm','每年'),custom:rule.customTimeText};
      return `${t('Theo thời gian','按時間')} · ${names[rule.timeFrequency]||''}`;
    }
    const names = {aql:`AQL ${rule.aqlValue||''}`,fixed_count:`${t('Cố định','固定件數')} ${rule.fixedCount||''}`,
      batch_quantity:`${t('Số lượng lô','批次數量')} ${rule.batchQuantity||''}`,
      custom:`${rule.customBatchText||''}: ${rule.customBatchValue||''}`};
    return `${t('Theo lô','按批次')} · ${names[rule.batchKind]||''}`;
  }
  function ruleEditorHTML(f) {
    const select = (name, values) => `<select name="${name}">${values.map(([value,label])=>`<option value="${value}" ${f[name]===value?'selected':''}>${label}</option>`).join('')}</select>`;
    const input = (name,label) => `<label>${label}<input name="${name}" value="${h(f[name]||'')}" data-i18n-skip="true"></label>`;
    return `<section class="ipqcc-rule-editor"><h4>${t('Tần suất kiểm tra','檢查頻率')}</h4>
      <label>${t('Cách áp dụng','方式')}${select('ruleCadence',[
        ...(modal.existingId&&!f.rule?[['legacy',t('Giữ tần suất cũ','保留原始頻率')]]:[]),
        ['none',t('Chưa thiết lập','未設定')],['batch',t('Theo lô','按批次')],['time',t('Theo thời gian','按時間')]])}</label>
      <div data-rule-block="legacy" ${f.ruleCadence==='legacy'?'':'hidden'}>${input('frequency',t('Tần suất gốc','原始頻率'))}</div>
      <div data-rule-block="batch" ${f.ruleCadence==='batch'?'':'hidden'}><label>${t('Cách lấy mẫu','取樣方式')}${select('batchKind',[
        ['aql','AQL'],['fixed_count',t('Số lượng cố định','固定件數')],['batch_quantity',t('Số lượng lô','批次數量')],['custom',t('Tùy chỉnh','自訂')]])}</label>
        <div data-batch-kind="aql" ${f.batchKind==='aql'?'':'hidden'}>${input('aqlValue','AQL')}</div>
        <div data-batch-kind="fixed_count" ${f.batchKind==='fixed_count'?'':'hidden'}>${input('fixedCount',t('Số lượng cố định','固定件數'))}</div>
        <div data-batch-kind="batch_quantity" ${f.batchKind==='batch_quantity'?'':'hidden'}>${input('batchQuantity',t('Số lượng lô','批次數量'))}</div>
        <div data-batch-kind="custom" ${f.batchKind==='custom'?'':'hidden'}>${input('customBatchText',t('Tên tùy chỉnh','自訂項目名稱'))}${input('customBatchValue',t('Số lượng / nội dung','對應數量或內容'))}</div></div>
      <div data-rule-block="time" ${f.ruleCadence==='time'?'':'hidden'}><label>${t('Tần suất','頻率')}${select('timeFrequency',[
        ['weekly',t('Hàng tuần','每週')],['monthly',t('Hàng tháng','每月')],['quarterly',t('Hàng quý','每季')],
        ['half_yearly',t('Nửa năm','每半年')],['yearly',t('Hàng năm','每年')],['custom',t('Tùy chỉnh','自訂')]])}</label>
        <div data-time-custom ${f.timeFrequency==='custom'?'':'hidden'}>${input('customTimeText',t('Mô tả chu kỳ','自訂週期說明'))}</div></div></section>`;
  }
  function editorHTML() {
    const isError = modal.kind === 'error', f = modal.fields;
    const parent = chosenError();
    const field = (key,label,textarea=false) => `<label class="ipqcc-field-${key}">${label}${textarea ? `<textarea name="${key}" data-i18n-skip="true" ${modal.readonly?'readonly':''}>${h(f[key]||'')}</textarea>` : `<input name="${key}" value="${h(f[key]||'')}" data-i18n-skip="true" ${modal.readonly?'readonly':''}>`}</label>`;
    return `<div class="ipqcc-overlay"><form class="ipqcc-dialog" id="ipqcc-editor" role="dialog" aria-modal="true"><header><h3>${modal.readonly?t('Xem','查看'):modal.existingId?t('Sửa','修改'):t('Thêm','新增')} ${isError?t('mã lỗi','錯誤代碼'):t('hạng mục kiểm tra','檢查項目')}</h3><button type="button" id="ipqcc-close" aria-label="Close">×</button></header><div class="ipqcc-dialog-body"><fieldset class="ipqcc-view-fields" ${modal.readonly?'disabled':''}>
      ${message?`<p class="ipqcc-message" role="alert">${h(displayDraftError(message))}</p>`:''}
      <section class="ipqcc-editor-context"><div><b>${t('Sản phẩm','產品')}</b><code>${h(productCode)}</code><span>${h(product()?.name||'')}</span></div><div><b>${t('Công đoạn','工段')}</b><code>${h(stageCode)}</code><span>${h(catalog.stages.find(s=>s.code===stageCode)?.name||'')}</span></div>${!isError?`<div><b>${t('Mã lỗi / tên','錯誤代碼／名稱')}</b><code>${h(parent?.code||'—')}</code><span>${h(parent?.name||'—')}</span></div>`:''}<div><b>${t('Mã do hệ thống cấp','系統編號')}</b><code>${h(f.code || (isError?'C-…-L…':`${parent?.code||'…'}-…`))}</code></div></section>
      ${isError ? `${field('name',t('Tên mã lỗi','錯誤名稱'))}${field('note',t('Ghi chú','備註'),true)}` :
        `<div class="ipqcc-checks"><label><input type="checkbox" name="standardEnabled" ${f.standardEnabled!==false?'checked':''}>${t('Bật tiêu chuẩn','啟用標準')}</label><label><input type="checkbox" name="cpkEnabled" ${f.cpkEnabled?'checked':''}>${t('Bật CPK','啟用 CPK')}</label></div>${field('standard',t('Tiêu chuẩn kiểm tra','檢查標準'),true)}
        ${field('description',t('Mô tả cách kiểm tra (bắt buộc)','檢查方式敘述（必填）'),true)}
        <section class="ipqcc-photo-editor"><h4>${t('Ảnh kiểm tra','檢查圖片')}</h4><button type="button" id="ipqcc-insert-photo" class="button ghost">＋ ${t('Chèn ảnh tại con trỏ mô tả','在敘述游標處插入圖片')}</button><input type="file" id="ipqcc-photo-input" accept="image/jpeg,image/png,image/webp,image/gif" multiple><div class="ipqcc-photo-grid">${modal.photos.map((photo,index)=>`<div class="ipqcc-photo-row"><img src="${h(photoUrl(photo))}" alt="${h(photo.name)}"><input data-photo-note="${index}" value="${h(photo.note||'')}" placeholder="${t('Ghi chú ảnh','圖片備註')}"><label>${t('Vị trí','位置')}<select data-photo-position="${index}">${Array.from({length:paragraphs(modal.fields.description).length+1},(_,place)=>`<option value="${place}" ${place===(Number.isInteger(photo.afterParagraph)?Math.min(photo.afterParagraph,paragraphs(modal.fields.description).length):paragraphs(modal.fields.description).length)?'selected':''}>${place===0?t('Trước văn bản','文字前'):place===paragraphs(modal.fields.description).length?t('Sau văn bản','文字後'):`${t('Sau đoạn','第')} ${place} ${t('','段後')}`}</option>`).join('')}</select></label><div><button type="button" data-photo-cover="${index}" ${index===0?'disabled':''}>${index===0?t('Ảnh bìa','列表圖'):t('Chọn ảnh bìa','設為列表圖')}</button><button type="button" data-photo-up="${index}" ${index===0?'disabled':''}>↑</button><button type="button" data-photo-down="${index}" ${index===modal.photos.length-1?'disabled':''}>↓</button><button type="button" data-photo-remove="${index}">×</button></div></div>`).join('')}</div></section>${equipmentEditorHTML(f)}${ruleEditorHTML(f)}${window.ProcessIPQC.referenceMarkup('C','C',modal.existingId)}${field('note',t('Ghi chú','備註'),true)}`}
      </fieldset></div><footer><button type="button" id="ipqcc-cancel" class="button ghost">${modal.readonly?t('Đóng','關閉'):t('Hủy','取消')}</button>${modal.readonly?'':`<button type="submit" class="button signal" ${busy?'disabled':''}>${window.VersionDraftUI.t('apply')}</button>`}</footer></form></div>`;
  }
  function equipmentEditorHTML(f) {
    const eq = equipment.find(e=>e.id===f.equipmentId) || f.equipmentSnapshot;
    const mode = f.inspectionMode || (f.equipmentId ? 'equipment' : 'visual');
    return `<section class="ipqcc-equipment-picker"><h4>${t('Cách kiểm tra / thiết bị','檢查方式／檢具設備')}</h4><div class="ipqcc-tool-options"><label><input type="radio" name="inspectionMode" value="visual" ${mode==='visual'?'checked':''}>${t('Kiểm tra trực quan','目視檢查')}</label><label><input type="radio" name="inspectionMode" value="equipment" ${mode==='equipment'?'checked':''}>${t('Dụng cụ và thiết bị thử','檢具與測試設備')}</label></div><div id="ipqcc-equipment-box" ${mode==='equipment'?'':'hidden'}>${eq?`<article class="ipqcc-selected-equipment">${eq.photoId?`<img src="/api/routine-equipment/photo?id=${h(eq.photoId)}" alt="">`:''}<div><strong>${h(eq.assetCode)} / ${h(eq.pieceMark)}</strong><p>${h(eq.name)}</p><small>${h(eq.spec||'')}</small></div></article>`:`<p>${t('Chưa chọn thiết bị','尚未選擇設備')}</p>`}<button type="button" id="ipqcc-select-equipment" class="button ghost">${t('Chọn / đổi thiết bị','選擇／更換設備')}</button></div></section>`;
  }
  function equipmentPickerHTML() {
    const select = (field,label,rows) => `<label>${label}<select data-ipqcc-filter="${field}"><option value="">${t('Tất cả','全部')}</option>${rows.map(row=>`<option value="${h(row.id)}" ${picker[field]===row.id?'selected':''}>${h(row.name||row.id)}</option>`).join('')}</select></label>`;
    return `<div class="ipqcc-overlay ipqcc-picker-overlay"><section class="ipqcc-dialog" id="ipqcc-equipment-dialog" role="dialog" aria-modal="true"><header><h3>${t('Chọn dụng cụ và thiết bị thử','選擇檢具與測試設備')}</h3><button type="button" data-ipqcc-picker-close aria-label="${t('Đóng','關閉')}">×</button></header><div class="ipqcc-dialog-body"><div class="ipqcc-picker-filters">${select('category',t('Nhóm','類別'),equipmentCategories)}${select('subcategory',t('Phân nhóm','子類別'),equipmentSubcategories.filter(s=>!picker.category||s.categoryId===picker.category))}${select('group',t('Nhóm quy cách','規格群組'),equipmentGroups.filter(g=>(!picker.category||g.categoryId===picker.category)&&(!picker.subcategory||g.subcategoryId===picker.subcategory)))}</div><label>${t('Tìm thiết bị','搜尋設備')}<input id="ipqcc-equipment-search" type="search" value="${h(picker.query||'')}" placeholder="${t('Mã, tên, quy cách','編號、名稱、規格')}"></label><p id="ipqcc-equipment-count" role="status"></p><div class="ipqcc-equipment-results">${equipment.map(eq=>`<button type="button" data-ipqcc-equipment="${h(eq.id)}" ${eq.available?'':'disabled'}>${eq.photoId?`<img decoding="async" loading="lazy" src="/api/routine-equipment/photo?id=${h(eq.photoId)}" alt="">`:'◇'}<span><b>${h(eq.assetCode)} / ${h(eq.pieceMark)}</b><span>${h(eq.name)}</span><small>${h(eq.spec)} · ${h(equipmentGroups.find(g=>g.id===eq.groupId)?.name||'')}</small><small>${eq.available?t('Có thể chọn','可選取'):t('Chưa kích hoạt','設備未啟用')}</small></span></button>`).join('') || `<p>${t('Chưa có thiết bị hiệu lực','目前沒有生效設備')}</p>`}</div></div><footer><button type="button" data-ipqcc-picker-close class="button ghost">${t('Hủy','取消')}</button></footer></section></div>`;
  }
  function filterEquipment() {
    if (!picker) return;
    let count = 0;
    host.querySelectorAll('[data-ipqcc-equipment]').forEach(button=>{
      const eq = equipment.find(e=>e.id===button.dataset.ipqccEquipment);
      button.hidden=!!(picker.category&&eq.categoryId!==picker.category || picker.subcategory&&eq.subcategoryId!==picker.subcategory || picker.group&&eq.groupId!==picker.group || picker.query&&!fold(`${eq.assetCode} ${eq.pieceMark} ${eq.name} ${eq.spec}`).includes(fold(picker.query)));
      if (!button.hidden) count++;
    });
    const counter=host.querySelector('#ipqcc-equipment-count');
    if (counter) counter.textContent=`${count} / ${equipment.length} ${t('thiết bị','筆設備')}`;
  }
  function viewerHTML() {
    const photo = viewer.item.mediaItems[viewer.index];
    return `<div class="ipqcc-overlay ipqcc-viewer"><div role="dialog" aria-modal="true"><header><strong>${h(viewer.item.code)} · ${viewer.index+1}/${viewer.item.mediaItems.length}</strong><button type="button" id="ipqcc-view-close">×</button></header><div><button type="button" id="ipqcc-view-prev" ${viewer.item.mediaItems.length<2?'disabled':''}>‹</button><img src="${h(photoUrl(photo))}" alt="${h(photo.name)}"><button type="button" id="ipqcc-view-next" ${viewer.item.mediaItems.length<2?'disabled':''}>›</button></div><p>${h(photo.note || photo.name)}</p></div></div>`;
  }
  async function submitEditor(event) {
    event.preventDefault(); if (!modal || modal.readonly || busy) return;
    if(modal.creationIdentityUnknown){message=t('Đã xác nhận tạo mới; giữ nội dung nhập và mở lại mục để đối chiếu trước khi áp dụng.','新增已確認；請保留輸入並重新開啟項目核對後再套用。');draw();return;}
    const target=modal, requestActor=identity(), requestActorId=requestActor?.id, requestWorking=working,
      requestGeneration=control?.workflow?.generation,
      editorState=()=>JSON.stringify({fields:target.fields,photos:target.photos,pendingInsert:target.pendingInsert}),
      submittedState=editorState(),
      isCurrent=()=>modal===target && identity()===requestActor && identity()?.id===requestActorId &&
        working===requestWorking && control?.workflow?.generation===requestGeneration && !target.readonly &&
        editing() && sharedClient?.permission('edit')!==false && !control?.workflow?.pendingId && editorState()===submittedState;
    if(!isCurrent())return;
    const form = event.currentTarget, input = Object.fromEntries(new FormData(form).entries());
    const isError = target.kind === 'error', fields = { ...target.fields, ...input };
    fields.reason ||= '';
    if (!isError) {
      fields.standardEnabled = form.elements.standardEnabled.checked;
      fields.cpkEnabled = form.elements.cpkEnabled.checked;
      fields.notApplicable = target.existingId ? fields.notApplicable === true : false;
      fields.notApplicableReason ||= '';
      if (fields.inspectionMode === 'visual') { fields.equipmentId=''; fields.equipmentSnapshot=null; }
      if (fields.inspectionMode === 'equipment' && !fields.equipmentId)
        return message=t('Cần chọn thiết bị','請選擇檢具設備'), draw();
      delete fields.inspectionMode;
      const cadence = fields.ruleCadence;
      if (cadence !== 'legacy') {
        let rule;
        if (cadence === 'none') rule = { cadence:'none' };
        else if (cadence === 'time') {
          if (fields.timeFrequency === 'custom' && !String(fields.customTimeText||'').trim())
            return message=t('Cần mô tả chu kỳ tùy chỉnh','請填自訂週期說明'), draw();
          rule = { cadence:'time',timeFrequency:fields.timeFrequency,
            ...(fields.timeFrequency==='custom'?{customTimeText:String(fields.customTimeText).trim()}:{}) };
        } else if (cadence === 'batch') {
          const kind=fields.batchKind, key={aql:'aqlValue',fixed_count:'fixedCount',batch_quantity:'batchQuantity'}[kind];
          if (key && !String(fields[key]||'').trim()) return message=t('Cần giá trị lấy mẫu','請填取樣值'), draw();
          if (['fixed_count','batch_quantity'].includes(kind) && !/^[1-9]\d*$/.test(String(fields[key]||'').trim()))
            return message=t('Số lượng phải là số nguyên dương','數量必須是正整數'), draw();
          if (kind==='custom' && (!String(fields.customBatchText||'').trim() || !String(fields.customBatchValue||'').trim()))
            return message=t('Cần tên và nội dung tùy chỉnh','請填自訂名稱與內容'), draw();
          rule={cadence:'batch',batchKind:kind,
            ...(key?{[key]:String(fields[key]).trim()}:{}),
            ...(kind==='custom'?{customBatchText:String(fields.customBatchText).trim(),customBatchValue:String(fields.customBatchValue).trim()}: {})};
        }
        fields.rule=rule;
      }
      for (const key of ['ruleCadence','batchKind','aqlValue','fixedCount','batchQuantity',
        'customBatchText','customBatchValue','timeFrequency','customTimeText']) delete fields[key];
      const photos=target.photos.map(photo=>({...photo}));
      try {
        for (const photo of photos) if (photo.file) {
          const id=await upload(photo.file);
          if(!isCurrent())return;
          photo.id=id;delete photo.file;
        }
      } catch (error) { if(isCurrent()){message=error.message;draw();}return; }
      if(!isCurrent())return;
      const end=paragraphs(fields.description).length;
      fields.mediaItems = photos.map(photo => ({ id:photo.id, name:photo.name, note:photo.note||'',
        afterParagraph:Math.min(Number.isInteger(photo.afterParagraph)?photo.afterParagraph:end,end) }));
    }
    if (target.existingId) {
      const list = isError ? working.errors : working.items;
      const index = list.findIndex(row => row.id === target.existingId);
      if (index < 0) return message=t('Dữ liệu đã thay đổi','資料已變更'), draw();
      const allowed=isError?['name','note','reason']:['standard','description','note','reason','tool','method','frequency','cpkEnabled','standardEnabled','notApplicable','notApplicableReason','equipmentGroupId','equipmentId','mediaItems','rule'];
      const changed=allowed.filter(key=>fields[key]!==undefined&&
        !(['equipmentId','equipmentGroupId'].includes(key)?same(fields[key]||'',target.base?.[key]||''):same(fields[key],target.base?.[key])));
      const patches=changed.map(key=>({op:'set',path:[isError?'errors':'items',{id:target.existingId},key],value:fields[key]}));
      const guards=changed.map(key=>({path:[isError?'errors':'items',{id:target.existingId},key],value:target.base?.[key]}));
      await write('apply', { patches,guards }, true);
    } else if (isError) await write('create-error', { productCode, stageCode,
      name:fields.name, note:fields.note||'', reason:fields.reason }, true);
    else await write('create-item', { errorId, item:fields }, true);
  }
  function bind() {
    const root = host?.querySelector('#ipqcc-page'); if (!root) return;
    root.querySelector('#ipqcc-version')?.addEventListener('change', event => { selectedVersionId=event.target.value; working=open()?.status==='draft'&&selectedVersionId===open()?.id?copy(open().snapshot):null; draw(); });
    root.querySelector('#ipqcc-begin')?.addEventListener('click',()=>write('begin'));
    root.querySelector('#ipqcc-save')?.addEventListener('click',()=>write('save',{snapshot:working}));
    root.querySelector('#ipqcc-case-history')?.addEventListener('click',()=>loadCaseHistory());
    const closeCase=()=>{caseHistory=null;draw();root.querySelector('#ipqcc-case-history')?.focus({preventScroll:true});};
    root.querySelector('#ipqcc-case-close')?.addEventListener('click',closeCase);
    root.querySelector('#ipqcc-case-current')?.addEventListener('click',()=>{selectedVersionId=open()?.id||active()?.id||selectedVersionId;closeCase();});
    root.querySelector('#ipqcc-case-legacy')?.addEventListener('click',async()=>{closeCase();try{await window.openSharedDraftHistory({client:sharedTransport(),legacyFirst:true,editable:()=>false,onApplied:()=>{}});}catch(error){if(isReadSuperseded(error))return;message=error.message;draw();}});
    root.querySelector('#ipqcc-case-first')?.addEventListener('click',()=>loadCaseHistory());
    root.querySelector('#ipqcc-case-next')?.addEventListener('click',()=>loadCaseHistory(caseHistory.next));
    root.querySelector('#ipqcc-case-back')?.addEventListener('click',()=>{caseHistory.reviewCase=null;draw();});
    root.querySelector('#ipqcc-case-all')?.addEventListener('click',()=>{caseHistory.showAll=!caseHistory.showAll;caseHistory.itemPage=0;draw();});
    const caseFooter=root.querySelector('#ipqcc-case-dialog footer');
    if(caseFooter&&caseHistory?.reviewCase&&operationAllowed('edit')&&permitted('approval.compare')){
      const button=document.createElement('button');button.type='button';button.id='ipqcc-case-restore';button.className='button ghost';
      button.textContent=t('Xem trước khôi phục','預覽還原');button.disabled=open()?.status!=='draft'||busy;caseFooter.prepend(button);
      button.onclick=async()=>{try{await window.previewSharedDraftRestore({client:sharedTransport(),savedId:caseHistory.reviewCase.savedId,onApplied:async()=>{caseHistory=null;await read(false);message=t('Đã khôi phục vào bản nháp · chưa lưu','已還原至草稿 · 尚未儲存');draw();}});}catch(error){if(isReadSuperseded(error))return;caseHistory.error=error.message;draw();}};
    }
    root.querySelectorAll('[data-ipqcc-case]').forEach(button=>button.addEventListener('click',()=>loadCase(button.dataset.ipqccCase)));
    for(const [id,delta] of [['prev',-1],['next',1]])root.querySelector(`#ipqcc-case-items-${id}`)?.addEventListener('click',()=>{caseHistory.itemPage+=delta;draw();});
    root.querySelector('#ipqcc-submit')?.addEventListener('click',()=>void write('submit'));
    root.querySelector('#ipqcc-withdraw')?.addEventListener('click',()=>write('withdraw'));
    for(const [selector,retry] of [['#ipqcc-check-operation',false],['#ipqcc-retry-operation',true]])root.querySelector(selector)?.addEventListener('click',async()=>{
      if(busy)return;busy=true;
      try{await (retry?sharedTransport().retryUnknown():sharedTransport().resolveUnknown());await read(false);message=t('Đã xác minh kết quả từ máy chủ','已向伺服器查證結果');}
      catch(error){if(!isReadSuperseded(error))message=error.message;}finally{busy=false;draw();}
    });
    root.querySelector('#ipqcc-reload')?.addEventListener('click',async()=>{
      if(!confirm(t('Bỏ phần nhập chưa lưu và tải phiên bản mới?','放棄尚未儲存的輸入並載入最新版？')))return;
      conflict=null;modal=null;working=null;selectedVersionId='';message='';
      try{await read(false);draw();}catch(error){if(isReadSuperseded(error))return;message=error.message;draw();}
    });
    bindReadRetry(root);
    const searchBox=root.querySelector('#ipqcc-search');
    searchBox?.addEventListener('input',event=>{ search=event.target.value; if(!event.isComposing) refreshProducts(); });
    searchBox?.addEventListener('compositionend',event=>{ search=event.target.value; refreshProducts(); });
    root.addEventListener('click', async event => {
      const button=event.target.closest('button');
      if(!button){const row=event.target.closest('[data-ipqcc-error]');if(row){errorId=row.dataset.ipqccError;draw();}return;}
      if(button.closest('summary')){event.preventDefault();event.stopPropagation();}
      if(button.id==='ipqcc-select-equipment'&&modal&&!modal.readonly){picker={category:'',subcategory:'',group:'',query:''};draw();return;}
      if(button.hasAttribute('data-ipqcc-picker-close')){picker=null;draw();return;}
      if(button.dataset.ipqccEquipment&&picker&&modal){
        const eq=equipment.find(e=>e.id===button.dataset.ipqccEquipment);
        if(!eq?.available)return;
        modal.fields.equipmentId=eq.id;modal.fields.equipmentSnapshot=copy(eq);modal.fields.inspectionMode='equipment';
        modal.dirty=true;picker=null;draw();return;
      }
      if(button.id==='ipqcc-insert-photo'&&modal){
        const area=root.querySelector('textarea[name="description"]'),position=area.selectionStart;
        const before=area.value.slice(0,position),after=area.value.slice(position);
        modal.pendingInsert={afterParagraph:before?paragraphs(before).length-(/\n\s*\n$/.test(before)?1:0):0,
          description:before&&!/\n\s*\n$/.test(before)&&after&&!/^\n\s*\n/.test(after)
            ?`${before}\n\n${after}`:null};
        root.querySelector('#ipqcc-photo-input')?.click();return;
      }
      if(button.dataset.ipqccRestore&&conflict){
        const row=conflict.items.find(item=>item.id===button.dataset.ipqccRestore);
        if(!row||!row.remote)return;
        const list=working?.[row.kind],index=list?.findIndex(item=>item.id===row.id);
        if(index<0)return;list[index]=copy(row.remote);
        if(modal?.existingId===row.id){modal.fields=copy(row.remote);modal.photos=copy(row.remote.mediaItems||[]);modal.dirty=false;}
        conflict.items=conflict.items.filter(item=>item.id!==row.id);
        if(!conflict.items.length){conflict=null;message=t('Đã xử lý xung đột; hãy lưu bản nháp','衝突已處理，請儲存草稿');}
        draw();return;
      }
      if(button.dataset.ipqccCoverage){search='';productCode=button.dataset.ipqccCoverage;stageCode=button.dataset.stage;errorId='';draw();return;}
      if(button.dataset.ipqccProduct){productCode=button.dataset.ipqccProduct;stageCode='';errorId='';draw();return;}
      if(button.dataset.ipqccFixItem){const item=snapshot().items.find(row=>row.id===button.dataset.ipqccFixItem);if(!item)return;
        search='';productCode=item.productCode;stageCode=item.stageCode;errorId=item.errorId;startEditor('item',item);return;}
      if(button.dataset.ipqccStage){stageCode=button.dataset.ipqccStage;errorId='';draw();return;}
      if(button.dataset.ipqccError){errorId=button.dataset.ipqccError;draw();return;}
      if(button.dataset.ipqccAdd){startEditor(button.dataset.ipqccAdd);return;}
      if(button.dataset.ipqccViewError){startEditor('error',snapshot().errors.find(e=>e.id===button.dataset.ipqccViewError),true);return;}
      if(button.dataset.ipqccViewItem){startEditor('item',snapshot().items.find(i=>i.id===button.dataset.ipqccViewItem),true);return;}
      if(button.dataset.ipqccEditError){startEditor('error',snapshot().errors.find(e=>e.id===button.dataset.ipqccEditError));return;}
      if(button.dataset.ipqccEditItem){startEditor('item',snapshot().items.find(i=>i.id===button.dataset.ipqccEditItem));return;}
      if(button.dataset.ipqccDeleteItem){const item=snapshot().items.find(i=>i.id===button.dataset.ipqccDeleteItem);
        if(confirm(`${t('Xóa hạng mục','刪除檢查項目')} ${item.code}?`)&&confirm(t('Xác nhận lần nữa; lịch sử vẫn được giữ.','再次確認；歷史資料會保留。')))
          await write('delete-item',{id:item.id});return;}
      if(button.dataset.ipqccDeleteError){const error=snapshot().errors.find(e=>e.id===button.dataset.ipqccDeleteError),count=snapshot().items.filter(i=>i.errorId===error.id&&!i.deleted).length;
        if(confirm(`${t('Xóa mã lỗi','刪除錯誤代碼')} ${error.code}? ${count} ${t('hạng mục bị ảnh hưởng','個子項目受影響')}`)&&confirm(t('Xác nhận xóa toàn bộ nhóm? Lịch sử vẫn được giữ.','再次確認整組刪除？歷史資料仍保留。')))
          await write('delete-error',{id:error.id,cascade:true});return;}
      if(button.dataset.ipqccView){viewer={item:snapshot().items.find(i=>i.id===button.dataset.ipqccView),index:Number(button.dataset.index)||0};draw();return;}
      if(button.id==='ipqcc-view-close'){viewer=null;draw();return;}
      if(button.id==='ipqcc-view-prev'||button.id==='ipqcc-view-next'){viewer.index=(viewer.index+(button.id==='ipqcc-view-next'?1:-1)+viewer.item.mediaItems.length)%viewer.item.mediaItems.length;draw();return;}
      if(button.id==='ipqcc-close'||button.id==='ipqcc-cancel'){closeEditor();return;}
      const action=['cover','up','down','remove'].find(key=>button.dataset[`photo${key[0].toUpperCase()}${key.slice(1)}`]!==undefined);
      if(action&&modal){const index=Number(button.dataset[`photo${action[0].toUpperCase()}${action.slice(1)}`]);
        if(action==='remove'){if(!confirm(t('Xóa ảnh khỏi bản nháp?','從草稿移除圖片？')))return;const removed=modal.photos.splice(index,1)[0];if(removed?.preview)URL.revokeObjectURL(removed.preview);}
        else if(action==='cover')modal.photos.unshift(modal.photos.splice(index,1)[0]);
        else {const other=index+(action==='up'?-1:1);[modal.photos[index],modal.photos[other]]=[modal.photos[other],modal.photos[index]];}
        modal.dirty=true;draw();}
    });
    root.querySelector('#ipqcc-editor')?.addEventListener('submit',submitEditor);
    root.querySelector('#ipqcc-equipment-search')?.addEventListener('input',event=>{picker.query=event.target.value;filterEquipment();});
    root.querySelectorAll('[data-ipqcc-filter]').forEach(select=>select.onchange=()=>{
      const field=select.dataset.ipqccFilter;picker[field]=select.value;
      if(field==='category'){picker.subcategory='';picker.group='';}
      if(field==='subcategory')picker.group='';
      draw();
    });
    filterEquipment();
    root.querySelector('#ipqcc-editor')?.addEventListener('input',event=>{
      if(!modal)return;modal.dirty=true;
      if(event.target.dataset.photoNote!==undefined) modal.photos[Number(event.target.dataset.photoNote)].note=event.target.value;
      else if(event.target.dataset.photoPosition!==undefined) modal.photos[Number(event.target.dataset.photoPosition)].afterParagraph=Number(event.target.value);
      else if(event.target.name) modal.fields[event.target.name]=event.target.type==='checkbox'?event.target.checked:event.target.value;
    });
    root.querySelector('#ipqcc-editor')?.addEventListener('change',event=>{
      if (modal && event.target.name==='inspectionMode') {
        modal.fields.inspectionMode=event.target.value;modal.dirty=true;
        if(event.target.value==='equipment')picker={category:'',subcategory:'',group:'',query:''};
        draw();return;
      }
      if (!modal || !['ruleCadence','batchKind','timeFrequency'].includes(event.target.name)) return;
      modal.fields[event.target.name]=event.target.value;modal.dirty=true;
      const form=event.currentTarget;
      form.querySelectorAll('[data-rule-block]').forEach(block=>{block.hidden=block.dataset.ruleBlock!==form.elements.ruleCadence.value;});
      form.querySelectorAll('[data-batch-kind]').forEach(block=>{block.hidden=block.dataset.batchKind!==form.elements.batchKind.value;});
      form.querySelector('[data-time-custom]').hidden=form.elements.timeFrequency.value!=='custom';
    });
    root.querySelector('#ipqcc-photo-input')?.addEventListener('change',event=>{
      if(!modal)return;
      if(!event.target.files.length){modal.pendingInsert=null;return;}
      if(modal.pendingInsert?.description!==null&&modal.pendingInsert?.description!==undefined)
        modal.fields.description=modal.pendingInsert.description;
      const afterParagraph=modal.pendingInsert?.afterParagraph ?? paragraphs(modal.fields.description).length;
      for(const file of event.target.files) modal.photos.push({id:'',name:file.name,note:'',afterParagraph,file,preview:URL.createObjectURL(file)});
      modal.pendingInsert=null;
      modal.dirty=true;draw();
    });
  }
  async function mount(element) {
    const sequence=++mountSequence;pollTimer.cancel();
    const current=()=>sequence===mountSequence&&host===element;
    host=element;navigationError=null; message=''; conflict=null; modal=null; caseHistory=null; host.innerHTML=`<section class="ipqcc-page"><p>${t('Đang tải IPQC-C…','正在載入 IPQC-C…')}</p></section>`;
    try { await read(false,current,true);if(!current())return;draw();scheduleSharedRefresh(); } catch(error) {if(!current()||isReadSuperseded(error))return;navigationError=error;message=error.message; host.innerHTML=`<section class="ipqcc-page"><p role="alert">${h(displayDraftError(message))}</p><button type="button" class="button signal" id="ipqcc-load-retry">${t('Tải lại dữ liệu','重新載入資料')}</button></section>`;host.querySelector('#ipqcc-load-retry').onclick=()=>mount(element); }
  }
  function scheduleSharedRefresh() {const pollScheduleOwner=pollTimer.capture();
    const sequence=mountSequence;
    pollTimer.schedule(async()=>{
      const visible=host?.isConnected&&host.dataset.activeTab==='quality-ipqc-c';
      if(!visible&&!reviewHost?.isConnected)return;
      try {
        if(!busy&&identity()?.id&&document.visibilityState!=='hidden'&&sharedTransport().canPoll('state')) {
          if(saveInputNoticePending()){await refreshSaveNoticeAccess(saveInputNotice);return;}
          const flow=control?.workflow;
          const update=await sharedTransport().read(flow?`${flow.generation}:${flow.revision}`:'');
          if(sequence!==mountSequence||!pollTimer.isCurrent(pollScheduleOwner))return;
          if(saveInputNoticePending()){await refreshSaveNoticeAccess(saveInputNotice);return;}
          if(caseHistory && !update.permissions?.history) {
            caseHistory=null;
            message=t('Quyền xem lịch sử đã thay đổi; đã đóng hồ sơ.','歷史查閱權限已變更，已關閉案件。');
            await read(false,()=>sequence===mountSequence);if(sequence!==mountSequence||!pollTimer.isCurrent(pollScheduleOwner))return;draw();
          }
          if(!update.unchanged&&update.workflow&&(!flow||flow.generation!==update.workflow.generation||flow.revision!==update.workflow.revision)) {
            await read(false,()=>sequence===mountSequence);if(sequence!==mountSequence||!pollTimer.isCurrent(pollScheduleOwner))return;
            if(!modal&&!picker&&!viewer&&!caseHistory)draw();
            else {const status=host?.querySelector('#ipqcc-shared-status');if(status)status.textContent=t('Bản nháp chung đã cập nhật. Nội dung cửa sổ đang nhập được giữ nguyên; sẽ kiểm tra lại khi áp dụng.','共用草稿已更新。彈窗輸入保留，套用時會重新核對。');}
            reviewDraw();
          }
        }
      }catch(error){
        if(sequence!==mountSequence||isReadSuperseded(error))return;
        if(saveInputNoticePending())blockSaveNoticeAccess(error,saveInputNotice);
        if(caseHistory&&[401,403].includes(error.status)){caseHistory=null;host?.querySelector('#ipqcc-case-dialog')?.closest('.ipqcc-overlay')?.remove();}
        const status=host?.querySelector('#ipqcc-shared-status');if(status)status.textContent=t('Không đồng bộ được; giữ nguyên dữ liệu đang xem.','同步讀取失敗，保留目前資料。')+' '+displayDraftError(error);
      }
      finally{if(sequence===mountSequence&&pollTimer.isCurrent(pollScheduleOwner))scheduleSharedRefresh();}
    });
  }
  function pendingCount() { return control?.versions.filter(v=>v.status==='pending').length||0; }
  function reviewHTML() { if(readAccessBlocked())return `<section class="ipqcc-review">${readBlockedHTML()}</section>`;return `<section class="ipqcc-review"><h3>IPQC-C · ${t('Chờ duyệt','待審')}</h3><div class="ipqcc-review-body">${t('Đang tải…','載入中…')}</div></section>`; }
  async function bindReview(panel) {
    reviewHost=panel?.querySelector('.ipqcc-review');if(!reviewHost)return;
    const target=reviewHost,delivery=window.ProcessSync?.captureDelivery?.(),owns=()=>reviewHost===target&&target.isConnected&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));
    try { await read(false,owns);if(owns())reviewDraw(); } catch(error) {if(owns()&&!isReadSuperseded(error)){navigationError=error;if(readAccessBlocked()){target.innerHTML=readBlockedHTML();bindReadRetry(target);}else target.querySelector('.ipqcc-review-body').textContent=displayDraftError(error);}}
    if(owns())scheduleSharedRefresh();
  }
  function reviewDraw() {
    if(!reviewHost?.isConnected)return;
    if(readAccessBlocked()){reviewHost.innerHTML=readBlockedHTML();bindReadRetry(reviewHost);return;}
    const restoreView=window.VersionDraftUI.preserveView(reviewHost);
    const comments=new Map([...reviewHost.querySelectorAll('[data-ipqcc-review-comment]')].map(input=>[input.dataset.ipqccReviewComment,input.value]));
    const focused=document.activeElement?.dataset?.ipqccReviewComment,caret=document.activeElement?.selectionStart;
    const pending=control?.versions.filter(v=>v.status==='pending')||[];
    const history=control?.versions.filter(v=>['approved','superseded','returned','withdrawn'].includes(v.status)).slice(-3).reverse()||[];
    const cases=[...pending,...history];
    reviewHost.querySelector('.ipqcc-review-body').innerHTML=cases.length?cases.map(v=>{
      const base=control.versions.find(x=>x.id===v.baseVersionId);
      const before=base?.snapshot||{errors:[],items:[]},after=v.snapshot;
      const changed=after.items.filter(item=>JSON.stringify(item)!==JSON.stringify(before.items.find(x=>x.id===item.id))).length;
      return `<article class="vd-review-case"><details data-case-id="${h(v.id)}"><summary><b>IPQC-C · V${v.number} · ${status(v.status)}</b> · ${t('Xem nội dung','展開內容')}</summary><p>${t('Người sửa','修改者')} ${h(v.creatorName)} · ${t('Gửi duyệt','送審')} ${h(date(v.submittedAt))}${v.reviewedBy?`<br>${t('Người duyệt','確認者')} ${h(v.reviewedBy)} · ${h(date(v.reviewedAt))}`:''}${v.reviewComment?`<br>${t('Ý kiến','意見')} ${h(v.reviewComment)}`:''}</p>
        <p>${t('Mã lỗi','錯誤代碼')} ${before.errors.filter(x=>!x.deleted).length} → ${after.errors.filter(x=>!x.deleted).length} · ${t('Hạng mục','檢查項目')} ${before.items.filter(x=>!x.deleted).length} → ${after.items.filter(x=>!x.deleted).length} · ${t('Thay đổi','變動')} ${changed}</p>
        <details><summary>${t('Xem thay đổi và lịch sử','查看差異與歷程')}</summary>${after.items.filter(item=>JSON.stringify(item)!==JSON.stringify(before.items.find(x=>x.id===item.id))).slice(0,100).map(item=>`<p><code>${h(item.code)}</code> · ${h(item.standard)} · ${item.mediaItems.length} ${t('ảnh','張圖')}</p>`).join('')}${v.history.map(event=>`<p>${h(event.action)} · ${h(event.actorName)} · ${h(date(event.at))}</p>`).join('')}</details>
        ${v.contentIssues?.issues.length?`<details><summary>${t('Cần bổ sung · không chặn gửi/duyệt','待補 · 不阻擋送審／核准')} · ${v.contentIssues.issues.length}</summary>${v.contentIssues.issues.map(i=>`<p>${h(i.message)} · ${h(i.path.map(p=>typeof p==='string'?p:p.id).join(' / '))}</p>`).join('')}</details>`:''}
        </details>${v.status==='pending'&&(permitted('approval.approve')||permitted('approval.reject')||permitted('approval.withdraw'))?`<label>${t('Ý kiến duyệt (không bắt buộc)','審核意見（選填）')}<textarea data-ipqcc-review-comment="${h(v.id)}"></textarea></label><div class="vd-actions">${permitted('approval.withdraw')?`<button type="button" data-ipqcc-review="withdraw" data-id="${h(v.id)}" class="button ghost">${t('Rút hồ sơ','撤回送審')}</button>`:''}${permitted('approval.reject')?`<button type="button" data-ipqcc-review="reject" data-id="${h(v.id)}" class="button ghost">${t('Trả lại','發回')}</button>`:''}${permitted('approval.approve')?`<button type="button" data-ipqcc-review="approve" data-id="${h(v.id)}" class="button signal">${t('Duyệt','確認')}</button>`:''}</div>`:''}</article>`;
    }).join(''):`<p>${t('Không có hồ sơ chờ duyệt','目前沒有待審案件')}</p>`;
    if(message)reviewHost.querySelector('.ipqcc-review-body').insertAdjacentHTML('afterbegin',`<p class="ipqcc-message" role="alert">${h(displayDraftError(message))}</p>`);
    reviewHost.querySelectorAll('[data-ipqcc-review]').forEach(button=>button.onclick=async()=>{
      const v=control.versions.find(x=>x.id===button.dataset.id);
      const comment=button.dataset.ipqccReview==='approve' ? reviewHost.querySelector(`[data-ipqcc-review-comment="${v.id}"]`)?.value?.trim() || '' : '';
      await write(button.dataset.ipqccReview,{versionId:v.id,versionRevision:v.revision,comment});
    });
    reviewHost.querySelectorAll('[data-ipqcc-review-comment]').forEach(input=>{const id=input.dataset.ipqccReviewComment;if(comments.has(id))input.value=comments.get(id);if(id===focused){input.focus({preventScroll:true});if(Number.isInteger(caret))input.setSelectionRange(caret,caret);}});
    restoreView();
    const count=document.querySelector('#approval-tab-quality .approval-tab-count');
    if(count)count.textContent=String((window.FQCMasterUI?.pendingCount?.()||0)+(window.RoutineEquipmentUI?.pendingCount?.()||0)+pendingCount());
  }
  window.addEventListener('process-language-change',event=>{
    language=event.detail?.language==='zh'?'zh':'vi';
    if(modal?.dirty){const form=host?.querySelector('#ipqcc-editor');if(form){for(const [key,value] of new FormData(form)) modal.fields[key]=value;}}
    draw();reviewDraw();
  });
  window.addEventListener('keydown',event=>{
    if(caseHistory&&['Escape','Tab'].includes(event.key)) {
      if(event.key==='Escape'){event.preventDefault();caseHistory=null;draw();host?.querySelector('#ipqcc-case-history')?.focus({preventScroll:true});return;}
      const dialog=host?.querySelector('#ipqcc-case-dialog'),nodes=[...(dialog?.querySelectorAll('button:not(:disabled),a[href]')||[])].filter(n=>n.getClientRects().length);
      if(nodes.length&&(document.activeElement===(event.shiftKey?nodes[0]:nodes.at(-1))||!dialog.contains(document.activeElement))){event.preventDefault();(event.shiftKey?nodes.at(-1):nodes[0]).focus({preventScroll:true});}return;
    }
    if(host?.dataset.activeTab==='quality-ipqc-c'&&modal&&!viewer){
      const dialog=host.querySelector(picker?'#ipqcc-equipment-dialog':'#ipqcc-editor');
      if(event.key==='Escape'){event.preventDefault();if(picker){picker=null;draw();host.querySelector('#ipqcc-select-equipment')?.focus({preventScroll:true});}else closeEditor();return;}
      if(event.key==='Tab'&&dialog){
        const nodes=[...dialog.querySelectorAll('button,input,select,textarea')].filter(node=>!node.disabled&&node.getClientRects().length);
        if(document.activeElement===(event.shiftKey?nodes[0]:nodes.at(-1)) || !dialog.contains(document.activeElement)){event.preventDefault();(event.shiftKey?nodes.at(-1):nodes[0])?.focus({preventScroll:true});}
      }
    }
    if(viewer&&['Escape','ArrowLeft','ArrowRight'].includes(event.key)){
      event.preventDefault();if(event.key==='Escape')viewer=null;
      else viewer.index=(viewer.index+(event.key==='ArrowRight'?1:-1)+viewer.item.mediaItems.length)%viewer.item.mediaItems.length;draw();
    }
  });
  let navigationError=null;
  window.IPQCCUI={navigation:{requiresSave:()=>!!host?.isConnected&&window.sharedDraftNeedsSave?.(control?.workflow),saveForDeparture:()=>write('save',{snapshot:working}),canLeave:()=>!busy&&!modal&&!saveInputNoticePending(),error:()=>navigationError,reset(){mountSequence++;saveInputNotice=null;readRecoveryNeeded=false;pollTimer.cancel();host=null;reviewHost=null;control=null;revision=null;working=null;catalog={products:[],stages:[]};equipment=[];equipmentGroups=[];equipmentCategories=[];equipmentSubcategories=[];selectedVersionId='';caseHistory=null;navigationError=null;}},html:()=>`<section class="ipqcc-page">${t('Đang tải IPQC-C…','正在載入 IPQC-C…')}</section>`,mount,reviewHTML,bindReview,pendingCount};
})();
