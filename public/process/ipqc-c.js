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
  const permitted = key => !readAccessBlocked()&&(window.sharedDraftPermissionAllowed?.(sharedClient,key)??true)&&(typeof window.hasPermission === 'function' ? window.hasPermission(key==='approval.submit'?'view:data':key) : identity()?.role === 'admin');
  const headers = () => ({...(window.ProcessSync?.platformHeaders?.() || { 'Content-Type':'application/json' }),'X-IPQC-C-Save-Projection':'1'});
  let host = null, reviewHost = null, control = null, catalog = { products:[], stages:[] }, equipmentGroups = [], equipment = [], revision = null;
  let working = null, selectedVersionId = '', productCode = '', stageCode = '', errorId = '', search = '';
  let localSaveAttempt=null;
  let historyDisplayEpoch=0;
  const historyAllowsMutation=()=>!approvedHistoryView?.blocked;
  let localChanges=[],localGeneration=null,localBase=null;const localPhotos=new Map();
  function clearLocal(){saveChoice?.finish(null);localSaveAttempt=null;localChanges=[];localGeneration=null;localBase=null;for(const photo of localPhotos.values())if(photo.preview)URL.revokeObjectURL(photo.preview);localPhotos.clear();}
  let saveChoice=null;
  let busy = false, message = '', modal = null, viewer = null, conflict = null;
  let equipmentCategories = [], equipmentSubcategories = [], picker = null;
  let caseHistory=null;
  let sharedClient=null, sharedActor='';let mountSequence=0, readSequence=0, readRecoveryNeeded=false, readAccessBlock=null, readAckContext=null, readQuarantinedDraft=null, saveInputNotice=null;
  const saveInputNoticePending=()=>{if(saveInputNotice&&!saveInputNotice.noticeOwns())saveInputNotice=null;return !!saveInputNotice;};
  const ownsQuarantinedDraft=()=>!!readQuarantinedDraft&&readQuarantinedDraft.actor===identity()&&readQuarantinedDraft.id===identity()?.id&&readQuarantinedDraft.epoch===window.ProcessSync?.identityGeneration?.();
  const readAccessBlocked=()=>!!readAccessBlock;
  const readBlockedHTML=()=>`<section class="ipqcc-page" id="ipqcc-page"><div class="ipqcc-message" role="alert">${sharedClient?.hasUnknown()?t('Kết quả thao tác mới nhất chưa xác định; không gửi lại.','最新操作結果尚未確認；請勿重送。'):readAckContext&&readAckContext.actor===identity()&&readAckContext.id===identity()?.id&&readAckContext.epoch===window.ProcessSync?.identityGeneration?.()?t('Thao tác đã được máy chủ xác nhận, nhưng đọc lại bị từ chối. Không gửi lại thao tác.','操作已由伺服器確認，但重新讀取遭拒；請勿重送操作。'):t('Đọc dữ liệu bị từ chối; dữ liệu riêng được giữ lại nhưng tạm khóa.','讀取資料遭拒；私有草稿保留但暫時隔離。')} ${t('Đọc lại dữ liệu và quyền để tiếp tục.','請重新讀取資料與權限後繼續。')} <button type="button" id="ipqcc-read-retry" class="button ghost">${t('Đọc lại dữ liệu và quyền','重新讀取資料與權限')}</button></div></section>`;
  function bindReadRetry(root){const boundDisplayEpoch=historyDisplayEpoch;root?.querySelector('#ipqcc-read-retry')?.addEventListener('click',async(event)=>{
    if(busy||!historyAllowsMutation()||boundDisplayEpoch!==historyDisplayEpoch)return;const owned=editorOwner(),displayEpoch=historyDisplayEpoch,current=()=>owned()&&displayEpoch===historyDisplayEpoch;const button=event.currentTarget;if(button.disabled)return;if(saveInputNoticePending()&&!confirm(t('Tải lại sẽ bỏ nội dung chưa áp dụng. Tiếp tục?','重新載入將放棄未套用輸入，是否繼續？')))return;button.disabled=true;
    try{await read(false,current,false,true);if(!current())return;message='';draw();reviewDraw();}catch(error){if(isReadSuperseded(error)||!current())return;message=error.message;draw();reviewDraw();}
    finally{if(current()&&button.isConnected)button.disabled=false;}
  });}
  const readErrorOwners=new WeakMap();
  const isReadSuperseded=error=>(error?.code||error?.message)==='IPQCC_READ_SUPERSEDED'||
    !!(error&&typeof error==='object'&&readErrorOwners.has(error)&&!readErrorOwners.get(error)());
  // Server-confirmed operation cells; unknown, revoked or another actor fails closed.
  const operationAllowed = operation => historyAllowsMutation()&&!readAccessBlocked()&&!!identity()?.id && sharedActor===identity().id &&
    !window.ProcessSync?.requiresReload && sharedClient?.permission(operation)===true;
  function sharedTransport() {
    const actor=identity()?.id;
    if(!actor)throw Error(t('Cần đăng nhập','請先登入'));
    if(sharedActor!==actor||sharedClient?.isRuntimeCurrent?.()===false){sharedActor=actor;sharedClient=window.createSharedDraftClient({durableBegin:true,endpoint:`${API}/workflow?caseMetadata=1`,externalDurableBounded:{scope:'IPQC-C'},allowUnknownDeparture:true,actorId:actor,headers,guardAccessResults:true,permissionGates:{restore:'#ipqcc-case-restore',edit:'#ipqcc-begin,#ipqcc-case-restore,[data-ipqcc-add],#ipqcc-editor button[type=submit],[data-ipqcc-edit-item],[data-ipqcc-edit-error]',save:'#ipqcc-save',submit:'#ipqcc-submit',withdraw:'#ipqcc-withdraw,[data-ipqcc-review="withdraw"]',approve:'[data-ipqcc-review="approve"]',return:'[data-ipqcc-review="reject"]',history:'#ipqcc-case-history',delete:'[data-ipqcc-delete-item],[data-ipqcc-delete-error]'}});}
    return sharedClient;
  }
  // Legacy local-form records are never restored, rebased, deleted or rewritten.
  // This lazy session is only a lease-protected reader of original receipt IDs.
  let legacyReceiptSession=null;
  function editorOwner(){
    const actor=identity(),epoch=window.ProcessSync?.identityGeneration?.(),mount=mountSequence,delivery=window.ProcessSync?.captureDelivery?.();
    return()=>historyAllowsMutation()&&identity()===actor&&identity()?.id===actor?.id&&window.ProcessSync?.identityGeneration?.()===epoch&&mountSequence===mount&&!window.ProcessSync?.requiresReload&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));
  }
  async function legacyReceipts(){
    if(legacyReceiptSession?.owned())return legacyReceiptSession;
    legacyReceiptSession?.session.close();
    const owned=editorOwner(),state={owned,session:null};
    state.session=window.LocalDraftRecoverySession.create({current:owned,getContext:()=>({
      actorId:identity()?.id,scope:'IPQC-C:error-form',epoch:window.ProcessSync?.identityGeneration?.(),
      baseVersion:JSON.stringify([control?.workflow?.generation,control?.workflow?.revision,control?.workflow?.saved?.id||null,selectedVersionId]),
      canView:owned()&&!readAccessBlocked()&&sharedClient?.permission('view')===true,
      canEdit:false,pending:!!control?.workflow?.pendingId,verified:false,hasLocalChanges:true,localRevision:0,writeState:'unknown'
    })});
    legacyReceiptSession=state;await state.session.ready;
    if(legacyReceiptSession!==state||!owned())throw Error('RECOVERY_CONTEXT_CHANGED');
    return state;
  }
  async function queryLegacyReceipt(key){
    if(!historyAllowsMutation())throw Error('APPROVED_HISTORY_READ_ONLY');const displayEpoch=historyDisplayEpoch;
    const state=await legacyReceipts(),client=sharedTransport();
    const current=()=>displayEpoch===historyDisplayEpoch&&historyAllowsMutation()&&legacyReceiptSession===state&&state.owned()&&sharedClient===client&&!readAccessBlocked();
    const claim=await state.session.claim(key);
    if(!current())throw Error('RECOVERY_CONTEXT_CHANGED');if(!claim.ok)throw Error(claim.code);
    const preview=state.session.preview(key);
    // A local payload is not displayed or fed into any form or write path.
    if(!preview.ok||!['unknown','resolved'].includes(preview.kind)||!preview.receipt)throw Error('RECEIPT_REQUIRED');
    const result=await client.receipt(preview.receipt.operationId,preview.receipt.generation);
    if(!current())throw Error('RECOVERY_CONTEXT_CHANGED');
    // Do not adopt a snapshot or clear newer RAM input when querying an old receipt.
    return result;
  }
  async function openLegacyReceipts(){
    if(busy||!historyAllowsMutation())return;const displayEpoch=historyDisplayEpoch;const owned=editorOwner(),state=await legacyReceipts();
    const current=()=>displayEpoch===historyDisplayEpoch&&historyAllowsMutation()&&owned()&&state===legacyReceiptSession&&state.owned()&&state.session.status().ready===true;
    if(!current())throw Error('RECOVERY_CONTEXT_CHANGED');
    const inventory=state.session.discover();if(!current())throw Error('RECOVERY_CONTEXT_CHANGED');
    const overlay=document.createElement('div');overlay.className='ipqcc-overlay';overlay.innerHTML=`<section class="ipqcc-dialog" role="dialog" aria-modal="true"><header><h3>${t('Biên nhận thao tác cũ','舊操作收據')}</h3></header><div class="ipqcc-dialog-body"><p>${t('Chỉ kiểm tra biên nhận gốc, không gửi lại. Nội dung chưa lưu không được khôi phục; dữ liệu cũ được giữ nguyên.','僅查原操作收據，不重送。未存輸入不會恢復；舊儲存紀錄保留原樣。')}</p><p data-receipt-message role="status"></p><div data-receipt-list></div></div><footer><button type="button" data-receipt-close>${t('Đóng','關閉')}</button></footer></section>`;if(!current())throw Error('RECOVERY_CONTEXT_CHANGED');document.body.append(overlay);
    const note=overlay.querySelector('[data-receipt-message]'),list=overlay.querySelector('[data-receipt-list]');note.textContent=inventory.ok?'':inventory.code;
    for(const item of inventory.items||[]){
      const row=document.createElement('p'),button=document.createElement('button');row.textContent=item.runtimeId||t('Bản cũ','舊紀錄');button.type='button';button.textContent=t('Kiểm tra biên nhận','查原收據');
      const active=()=>current()&&overlay.isConnected&&button.isConnected;
      button.onclick=async()=>{if(!active())return;button.disabled=true;try{
        if(state!==legacyReceiptSession||!state.owned())throw Error('RECOVERY_CONTEXT_CHANGED');
        await queryLegacyReceipt(item.key);
        if(!active())return;
        note.textContent=t('Đã kiểm tra biên nhận gốc; không gửi lại hoặc khôi phục biểu mẫu.','已查證原收據；未重送或恢復表單。');
      }catch(error){if(active())note.textContent=error.message==='RECEIPT_REQUIRED'?t('Bản này không có biên nhận; không khôi phục nội dung chưa lưu.','此紀錄沒有操作收據；不恢復未存內容。'):error.message;}finally{if(active())button.disabled=false;}};
      row.append(button);list.append(row);
    }
    overlay.querySelector('[data-receipt-close]').onclick=()=>overlay.remove();if(!current()){overlay.remove();throw Error('RECOVERY_CONTEXT_CHANGED');}overlay.querySelector('[data-receipt-close]').focus();
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
  const savePermissionKeys=['view','edit','save','submit','withdraw','approve','return','history','delete','create','restore'];
  function captureSaveProjection(transport){
    const actor=identity(),epoch=window.ProcessSync?.identityGeneration?.(),delivery=window.ProcessSync?.captureDelivery?.(),displayEpoch=historyDisplayEpoch,base=control,flow=control?.workflow,local=working,
      mount=mountSequence,read=readSequence,baseRevision=revision,flowJSON=JSON.stringify(flow?.working),localJSON=JSON.stringify(local),snapshot=flowJSON?JSON.parse(flowJSON):null,journal=localChanges,journalJSON=JSON.stringify(localChanges),journalGeneration=localGeneration,
      permissions=Object.fromEntries(savePermissionKeys.map(key=>[key,transport.permission(key)])),input=modal,inputJSON=JSON.stringify(modal&&{fields:modal.fields,photos:modal.photos,pendingInsert:modal.pendingInsert,dirty:modal.dirty});
    return {base,flow,snapshot,permissions,actorId:actor?.id,revision:baseRevision,generation:flow?.generation,
      noticeOwns:()=>historyAllowsMutation()&&displayEpoch===historyDisplayEpoch&&identity()===actor&&identity()?.id===actor?.id&&window.ProcessSync?.identityGeneration?.()===epoch&&!window.ProcessSync?.requiresReload&&mountSequence===mount&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery)),
      inputsChanged:()=>working!==local||JSON.stringify(working)!==localJSON||localChanges!==journal||JSON.stringify(localChanges)!==journalJSON||localGeneration!==journalGeneration||modal!==input||JSON.stringify(modal&&{fields:modal.fields,photos:modal.photos,pendingInsert:modal.pendingInsert,dirty:modal.dirty})!==inputJSON,
      owns:()=>historyAllowsMutation()&&displayEpoch===historyDisplayEpoch&&identity()===actor&&identity()?.id===actor?.id&&window.ProcessSync?.identityGeneration?.()===epoch&&!window.ProcessSync?.requiresReload&&mountSequence===mount&&readSequence===read&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery)),
      current:()=>control===base&&control?.workflow===flow&&revision===baseRevision&&working===local&&JSON.stringify(flow?.working)===flowJSON&&JSON.stringify(working)===localJSON};
  }
  function showSaveInputNotice(capture,readError){
    saveInputNotice=capture;
    host?.querySelector('[data-ipqcc-save-input-notice]')?.remove();
    const note=document.createElement('div');note.dataset.ipqccSaveInputNotice='1';note.setAttribute('role','alert');
    note.textContent=t('Bản chụp trước đã được lưu. Nội dung mới đang nhập chưa được lưu; không gửi lại thao tác cũ.','先前快照儲存已確認；等待期間的新輸入尚未儲存，請勿重送舊操作。');
    if(readError){const detail=document.createElement('span');detail.textContent=' · '+displayDraftError(readError);note.append(detail);}
    const button=document.createElement('button');button.type='button';button.textContent=t('Kiểm tra và tải lại','核對並重新載入');
    button.addEventListener('click',async()=>{if(busy||!capture.noticeOwns()||control?.workflow?.generation!==capture.generation)return;if(!confirm(t('Tải lại sẽ bỏ nội dung chưa áp dụng. Hãy sao chép hoặc đối chiếu trước. Tiếp tục?','重新載入將放棄尚未套用的新輸入，請先複製或核對內容。是否繼續？')))return;button.disabled=true;
      try{await read(false,()=>capture.noticeOwns()&&control?.workflow?.generation===capture.generation,false,true);if(!capture.noticeOwns())return;modal=null;viewer=null;picker=null;message='';draw();reviewDraw();}catch(error){if(isReadSuperseded(error)||!capture.noticeOwns())return;message=error.message;if(readAccessBlocked()){draw();reviewDraw();}else showSaveInputNotice(capture,error);}finally{button.disabled=false;}
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
  function captureOperationQuery(){
    const client=sharedTransport(),actor=identity(),epoch=window.ProcessSync?.identityGeneration?.(),mount=mountSequence,delivery=window.ProcessSync?.captureDelivery?.(),displayEpoch=historyDisplayEpoch,attempt=localSaveAttempt;
    let changes=localChanges,input=JSON.stringify({localChanges,working}),generation=localGeneration;
    const owner=()=>historyAllowsMutation()&&displayEpoch===historyDisplayEpoch&&client===sharedClient&&actor===identity()&&epoch===window.ProcessSync?.identityGeneration?.()&&mount===mountSequence&&!window.ProcessSync?.requiresReload&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));
    let pinnedGeneration=generation;
    const current=()=>owner()&&localChanges===changes&&JSON.stringify({localChanges,working})===input&&localGeneration===pinnedGeneration;
    return {client,owner,current,assert(){if(!current())throw Error('IPQCC_READ_SUPERSEDED');},settleSave(recovered){
      this.assert();const receipt=recovered?.receipt;
      if(!attempt||receipt?.operationId!==attempt.operationId||!receipt.savedId||receipt.generation!==attempt.generation||!client.verifiedReadback?.(recovered,attempt.operationId)||
        attempt.changes!==localChanges||attempt.raw!==JSON.stringify(localChanges))return;
      clearLocal();working=open()?.status==='draft'?copy(open().snapshot):null;
      changes=localChanges;input=JSON.stringify({localChanges,working});generation=localGeneration;pinnedGeneration=localGeneration;
    },pin(recovered){this.assert();if(localChanges.length&&!localGeneration)localGeneration=recovered.receipt.generation;pinnedGeneration=localGeneration;}};
  }
  async function checkPreviousOperation(retry=false){
    if(busy||!historyAllowsMutation())return;const query=captureOperationQuery(),requestMount=mountSequence,recoveringBegin=query.client.hasUnknownBegin?.()===true;busy=true;
    try{const recovered=await (retry?query.client.retryUnknown():query.client.resolveUnknown());query.assert();if(recoveringBegin)query.pin(recovered);else query.settleSave(recovered);await read(false,query.current);if(!query.owner())throw Error('IPQCC_READ_SUPERSEDED');message=t('Đã xác minh kết quả từ máy chủ','已向伺服器查證結果');}
    catch(error){if(query.owner()&&!isReadSuperseded(error))message=error.message;}
    finally{if(requestMount===mountSequence)busy=false;if(query.owner())draw();}
  }
  async function writeShared(action,detail={},closeModal=false) {
    if(!historyAllowsMutation())return null;
    if(busy)return null;if(['save','submit'].includes(action)&&modal&&!modal.readonly){message=t('Hãy áp dụng hoặc hủy biểu mẫu trước khi lưu hoặc gửi duyệt.','請先套用或取消目前表單，再儲存或送審。');toast(message);return null;}if(saveInputNoticePending()){showSaveInputNotice(saveInputNotice);return null;}readAckContext=null;busy=true;message='';const restoreView=window.VersionDraftUI.preserveView(host,reviewHost),requestActor=identity(),requestActorId=requestActor?.id,requestEpoch=window.ProcessSync?.identityGeneration?.(),requestMount=mountSequence,requestDisplayEpoch=historyDisplayEpoch,delivery=window.ProcessSync?.captureDelivery?.(),
      targetModal=closeModal?modal:null,
      editorState=()=>targetModal?JSON.stringify({fields:targetModal.fields,photos:targetModal.photos,pendingInsert:targetModal.pendingInsert}):'',
      submittedState=editorState(),sameActor=()=>historyAllowsMutation()&&requestDisplayEpoch===historyDisplayEpoch&&identity()===requestActor && identity()?.id===requestActorId&&requestEpoch===window.ProcessSync?.identityGeneration?.()&&requestMount===mountSequence&&!window.ProcessSync?.requiresReload&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));let cancelled=false,refreshCurrent=false,readWasSuperseded=false,preserveInputs=false,submittedCommand=null;
    const cancelResponse=()=>{cancelled=true;refreshCurrent=sameActor();return null;};
    if(action==='save'){const button=host?.querySelector('#ipqcc-save');if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.textContent=t('Đang lưu…','存取中…');}}
    try {
      if(readAccessBlocked())throw Error('READ_ACCESS_RECHECK_REQUIRED');
      const transport=sharedTransport();
      if(closeModal&&modal?.generation&&modal.generation!==control.workflow?.generation)throw Error('STALE_GENERATION');
      if(transport.hasUnknown()) {
        if(!transport.hasUnknownBegin?.()&&closeModal && targetModal && !targetModal.existingId && ['create-item','create-error'].includes(action))targetModal.creationIdentityUnknown=true;
        const recoveringBegin=transport.hasUnknownBegin?.()===true,query=recoveringBegin?captureOperationQuery():null;
        const recovered=await transport.resolveUnknown();
        if(!sameActor() || closeModal && modal!==targetModal){return cancelResponse();}
        if(recoveringBegin)query.pin(recovered);
        if(!recoveringBegin)clearLocal();await read(false,recoveringBegin?query.current:sameActor);
        if(recoveringBegin)return null; // Begin acknowledgement never continues the interrupted action.
        if(action==='save')return null; // Recovery is receipt-only; never replay the local batch.
        if(!sameActor() || closeModal && modal!==targetModal){return cancelResponse();}
        if(closeModal)throw Error('STALE_GENERATION');
      }
      const operation=['save','submit'].includes(action)?action:['approve','reject','withdraw'].includes(action)?null:'edit';
      if(operation&&!operationAllowed(operation))throw Error('FORBIDDEN');
      let comparedSave=null;const saveDecisionVersion=action==='save'?transport.comparisonVersion():null;
      if(action==='save'){comparedSave=await prepareComparedSave(transport,sameActor);if(!comparedSave)return null;}
      if(action!=='save'&&(!control.workflow||action==='begin')) {
        if(!operationAllowed('edit'))throw Error('FORBIDDEN');
        const beginQuery=captureOperationQuery(),started=await transport.begin();if(!sameActor() || closeModal && (modal!==targetModal || editorState()!==submittedState)){return cancelResponse();}beginQuery.assert();
        if(started.control){control=started.control;revision=started.revision;}else await read(false,beginQuery.current);
        if(!sameActor())return cancelResponse();
        if(started.recoveryKind==='begin-v1'&&control.workflow?.generation!==started.receipt.generation)throw Error('STALE_GENERATION');
        selectedVersionId=open()?.id||active()?.id||selectedVersionId;
        if(!localChanges.length)working=open()?.status==='draft'?copy(open().snapshot):null;
        if(localChanges.length&&!localGeneration)localGeneration=control.workflow?.generation;
        if(modal&&!modal.generation)modal.generation=control.workflow?.generation;
        if(action==='begin'){toast(t('Đang sửa bản nháp chung · toàn bộ IPQC-C','正在編輯共用草稿 · 全部 IPQC-C'));return started;}
      }
      const flow=control.workflow;let commandAction=action,fields={},submissionGeneration=null;
      if(action==='save') {
        fields=comparedSave;
      } else if(action==='submit') {
        if(localChanges.length)throw Error('UNSAVED_CHANGES_SAVE_REQUIRED');
        const submission=window.captureSharedDraftSubmission(flow);submissionGeneration=flow.generation;
        const reason=await window.VersionDraftUI.confirmSubmit(window.VersionDraftUI.reasonFor(version(),flow), 'IPQC-C',{savedVersion:{id:submission.savedId,revision:submission.expectedRevision,at:flow.saved.at,actor:flow.saved.actor?.name}});if(!reason)return null;
        if(!sameActor())return cancelResponse();
        if(control?.workflow?.generation!==submissionGeneration||control.workflow.revision!==submission.expectedRevision||control.workflow.saved?.id!==submission.savedId)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
        fields={...submission,reason};
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
      if(['save','submit'].includes(action)&&modal&&!modal.readonly)throw Error(t('Hãy áp dụng hoặc hủy biểu mẫu trước khi lưu hoặc gửi duyệt.','請先套用或取消目前表單，再儲存或送審。'));
      if(action==='save'&&transport.comparisonVersion()!==saveDecisionVersion)throw Error('SAVE_COMPARISON_RETIRED');
      const saveCapture=action==='save'?captureSaveProjection(transport):null;
      if(saveCapture&&fields.expectedRevision===undefined)fields={...fields,expectedRevision:saveCapture.flow.revision};
      const command=transport.prepare(submissionGeneration||saveCapture?.flow.generation||flow.generation,commandAction,fields,saveCapture?()=>sameActor()&&saveCapture.owns()&&saveCapture.current()&&!saveCapture.inputsChanged():undefined);submittedCommand=command;if(action==='save'&&fields.localChanges)localSaveAttempt={operationId:command.operationId,generation:command.generation,changes:localChanges,raw:JSON.stringify(localChanges)};const result=await transport.sendPrepared(command);
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
      const verifiedReadback=transport.verifiedReadback?.(result,command.operationId),postFlow=result.control?.workflow;
      const postIsStale=verifiedReadback&&(postFlow&&(verifiedReadback.workflow.generation!==postFlow.generation||verifiedReadback.workflow.revision>postFlow.revision)||result.cSaveProjection&&(verifiedReadback.workflow.generation!==result.cSaveProjection.generation||verifiedReadback.workflow.revision>result.cSaveProjection.flowRevision));
      if(action==='save')clearLocal();
      if(postIsStale)await read(false,sameActor);
      else if(saveCapture&&acceptSaveProjection(result,saveCapture,command,transport)){}
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
        !sharedClient?.hasUnknownBegin?.()&&(sharedClient?.hasUnknown() || error.message==='RESULT_UNKNOWN_CHECK_BEFORE_RETRY'))targetModal.creationIdentityUnknown=true;
      if(action==='save'&&submittedCommand?.localChanges&&error.message==='DEPENDENCY_CHANGED_RECONFIRM'&&
        !sharedClient?.hasUnknown()&&sharedClient?.isConfirmedRejection(error,submittedCommand)){
        const rejectedInput=JSON.stringify({working,localChanges,localGeneration});
        conflict={items:[],localSave:true,owns:()=>sameActor()&&!sharedClient?.hasUnknown()&&
          JSON.stringify({working,localChanges,localGeneration})===rejectedInput};
      }
      const terms=workflowErrors[error.message];message=terms?t(...terms):error.message;
    }return null;}
    finally {if(requestMount===mountSequence)busy=false;if(!readWasSuperseded&&!preserveInputs&&sameActor()){
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
  const photoUrl = photo => photo.preview || localPhotos.get(photo.id)?.preview || `${API}/photo?id=${encodeURIComponent(photo.id)}`;
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
    if(!historyAllowsMutation())throw Error('IPQCC_READ_SUPERSEDED');
    if(saveInputNoticePending()&&!allowSaveNotice)throw Error('IPQCC_SAVE_INPUT_RECHECK_REQUIRED');
    const sequence=++readSequence,mount=mountSequence,displayEpoch=historyDisplayEpoch,priorControl=control,priorRevision=revision,requestActor=identity(),requestActorId=requestActor?.id,requestEpoch=window.ProcessSync?.identityGeneration?.(),
      delivery=window.ProcessSync?.captureDelivery?.(),owns=()=>displayEpoch===historyDisplayEpoch&&historyAllowsMutation()&&(allowSaveNotice||!saveInputNoticePending())&&!window.ProcessSync?.requiresReload&&identity()===requestActor&&identity()?.id===requestActorId&&requestEpoch===window.ProcessSync?.identityGeneration?.()&&sequence===readSequence&&mount===mountSequence&&control===priorControl&&revision===priorRevision&&isCurrent()&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));
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
    if ((!preserve && !localChanges.length) || !working) working = open()?.status === 'draft' ? copy(open().snapshot) : null;
    syncSelection();
  }
  function stageLocal(action,detail,closeModal){
    if(busy)throw Error(t('Đang xử lý; vui lòng chờ rồi thử hoàn tất lại.','操作處理中，請稍後再按完成。'));
    if(closeModal&&modal?.recoveryOwned?.()===false)throw Error('RECOVERY_CONTEXT_CHANGED');
    if(!editing())throw Error('FORBIDDEN');
    if(sharedClient?.hasUnknown())throw Error(t('Kết quả thao tác trước chưa xác định; hãy đóng biểu mẫu và kiểm tra kết quả trước khi hoàn tất.','前次操作結果尚未確認；請先關閉表單並查證操作結果，再按完成。'));
    if(action.startsWith('create')&&!operationAllowed('create')||action.startsWith('delete')&&!operationAllowed('delete'))throw Error('FORBIDDEN');
    if(localChanges.length>=256)throw Error('LOCAL_SAVE_LIMIT');
    if(action.startsWith('delete')&&detail.id?.startsWith('local-')){
      const ids=new Set([detail.id,...(action==='delete-error'?working.items.filter(row=>row.errorId===detail.id).map(row=>row.id):[])]);
      localChanges=localChanges.filter(change=>!ids.has(change.localId)&&!ids.has(change.input?.errorId)&&!ids.has(change.input?.id)&&!change.patches?.some(patch=>ids.has(patch.path[1]?.id)));
      working.errors=working.errors.filter(row=>!ids.has(row.id));working.items=working.items.filter(row=>!ids.has(row.id));
      draw();return {local:true};
    }
    if(!localBase)localBase=copy(working);
    const change=action==='apply'?copy(detail):{moduleAction:action,input:copy(detail)};
    if(action==='apply')for(const patch of change.patches){
      const row=working[patch.path[0]].find(row=>row.id===patch.path[1].id);
      if(!row||row.deleted)throw Error('ENTITY_REMOVED_OR_AMBIGUOUS');
      row[patch.path[2]]=copy(patch.value);
    }
    else if(action.startsWith('create')){
      change.localId='local-'+crypto.randomUUID();
      if(action==='create-error'){
        working.errors.push({id:change.localId,code:t('Chưa lưu','尚未存取'),...detail,reason:'',deleted:false});errorId=change.localId;
      }else{
        const parent=working.errors.find(row=>row.id===detail.errorId&&!row.deleted);if(!parent)throw Error('ERROR_CODE_REMOVED');
        working.items.push({id:change.localId,code:t('Chưa lưu','尚未存取'),errorId:parent.id,productCode:parent.productCode,stageCode:parent.stageCode,
          standard:'',description:'',note:'',reason:'',tool:'',method:'',frequency:'',standardEnabled:true,cpkEnabled:false,notApplicable:false,deleted:false,equipmentId:'',equipmentGroupId:'',equipmentSnapshot:null,mediaItems:[],...detail.item});
      }
    }else{
      const kind=action==='delete-error'?'errors':'items',row=working[kind].find(row=>row.id===detail.id&&!row.deleted);
      if(!row)throw Error('ENTITY_REMOVED_OR_AMBIGUOUS');
      change.guards=[{path:[kind,{id:row.id}],value:copy(row)}];
      if(kind==='errors'){change.guards.push({path:['items'],value:copy(working.items)});for(const child of working.items)if(child.errorId===row.id)child.deleted=true;}
      row.deleted=true;
    }
    localGeneration ||= control.workflow?.generation || null;localChanges.push(change);
    if(closeModal)closeEditor(true,false);
    message='';draw();toast(t('Đã cập nhật cục bộ · bấm Lưu để chia sẻ','已更新本機輸入 · 按存取後共用'));return {local:true};
  }
  async function prepareLocalSave(isCurrent,selected=localChanges){
    if(localGeneration&&localGeneration!==control.workflow.generation)throw Error('STALE_GENERATION');
    const changes=copy(selected),ids=new Map();
    const referenced=new Set();
    const collect=value=>{if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object'){if(localPhotos.has(value.id))referenced.add(value.id);Object.values(value).forEach(collect);}};collect(changes);
    for(const id of referenced){
      const photo=localPhotos.get(id);if(photo.uploadUnknown)throw Error('PHOTO_UPLOAD_RESULT_UNKNOWN');
      if(!photo.uploaded){try{photo.uploaded=await upload(photo.file);}catch(error){photo.uploadUnknown=true;throw error;}}
      if(!isCurrent())throw Error('SAVE_INPUT_CHANGED_RECONFIRM');ids.set(id,photo.uploaded);
    }
    const replace=value=>Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='id'&&ids.has(v)?ids.get(v):replace(v)])):value;
    return replace(changes);
  }
  async function prepareComparedSave(transport,isCurrent){
    const base=control,flow=control?.workflow,local=working,journal=localChanges,decisionVersion=transport.comparisonVersion(),displayEpoch=historyDisplayEpoch;
    let raw=JSON.stringify({working,localChanges,localGeneration});
    const photoPins=new Map([...localPhotos].map(([id,photo])=>[id,{photo,file:photo.file,preview:photo.preview}]));
    const mediaCurrent=()=>[...photoPins].every(([id,pin])=>localPhotos.get(id)===pin.photo&&pin.photo.file===pin.file&&pin.photo.preview===pin.preview);
    const inputsCurrent=()=>mediaCurrent()&&historyAllowsMutation()&&displayEpoch===historyDisplayEpoch&&isCurrent()&&transport.comparisonVersion()===decisionVersion&&working===local&&localChanges===journal&&JSON.stringify({working,localChanges,localGeneration})===raw&&!(modal&&!modal.readonly)&&!transport.hasUnknown();
    const owns=()=>inputsCurrent()&&control===base;
    const check=()=>{if(!owns())throw Error('SAVE_INPUT_CHANGED_RECONFIRM');};
    await transport.flush();check();
    const latest=await transport.read(null,{isCurrent:owns,requireAcceptedAccess:true});check();
    if(!Number.isSafeInteger(latest.revision)||latest.revision<0||latest.permissions?.view!==true||latest.permissions?.save!==true||(!flow||journal.length)&&latest.permissions?.edit!==true)throw Error('FORBIDDEN');
    const next=latest.workflow;
    let remote,legacy;
    if(next){
      if(next.scope!=='ipqc-c'||!Number.isSafeInteger(next.revision)||next.revision<0||!Array.isArray(next.working?.errors)||!Array.isArray(next.working?.items))throw Error('AUTHORITATIVE_READBACK_REQUIRED');
      if(!flow||next.generation!==flow.generation||localGeneration&&localGeneration!==next.generation)throw Error('STALE_GENERATION');
      if(next.revision<flow.revision)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
      if(next.pendingId)throw Error('PENDING_LOCKED');if(next.editable!==true)throw Error('FORBIDDEN');
      remote=next.working;
    }else{
      if(flow||localGeneration)throw Error('STALE_GENERATION');
      // The projected workflow GET does not contain the legacy snapshot. Pair a
      // full read by global revision AND Begin basis; never combine two epochs.
      const response=await fetch(API+'?caseMetadata=1',{cache:'no-store',headers:headers()});
      const body=await response.json();check();if(!response.ok)throw Object.assign(Error(body.error||'AUTHORITATIVE_READBACK_REQUIRED'),{status:response.status});
      legacy=body.control;const draft=legacy?.versions?.find(v=>['draft','pending','pending-test'].includes(v.status));
      const basis={generation:legacy?.workflow?.generation??null,activeVersionId:legacy?.activeVersionId??null,openVersionId:draft?.id??null,openVersionStatus:draft?.status??null,openVersionRevision:draft?.revision??null};
      if(body.revision!==latest.revision||legacy?.workflow||!same(basis,latest.beginBasis))throw Error('BEGIN_COMPARISON_CHANGED');
      if(draft?.status!=='draft')throw Error(draft?'PENDING_LOCKED':'INITIAL_BUILD_REQUIRED');
      remote=draft.snapshot;
    }
    const original=localBase||flow?.working||base.versions.find(v=>v.status==='draft')?.snapshot;
    if(!original||!Array.isArray(remote?.errors)||!Array.isArray(remote?.items))throw Error('AUTHORITATIVE_READBACK_REQUIRED');
    const candidate=structuralSaveCandidate(original,local,remote,journal)||scalarSaveCandidate(original,local,remote,journal)||cascadeSaveCandidate(original,local,remote,journal)||itemDeleteSaveCandidate(original,local,remote,journal)||combinedSaveCandidate(original,local,remote,journal)||creationSaveCandidate(original,local,remote,journal);
    let selected=copy(journal);
    if(candidate){
      selected=candidate.clashes.length?await chooseSaveCandidate(candidate,owns):candidate.changes();check();
      if(selected===null)return null;
      if(candidate.clashes.length){
        // A choice is consent for the compared version only. Reread before any
        // Begin, upload, allocation or Save; changed authority starts a fresh
        // comparison of the original private journal, never retries a write.
        const fresh=await transport.read(null,{isCurrent:owns,requireAcceptedAccess:true});check();
        if(!same({revision:latest.revision,workflow:latest.workflow,beginBasis:latest.beginBasis,permissions:latest.permissions},{revision:fresh.revision,workflow:fresh.workflow,beginBasis:fresh.beginBasis,permissions:fresh.permissions}))return prepareComparedSave(transport,isCurrent);
      }
    }else if(!same(original,remote)&&journal.length&&!unchangedJournalCanMerge(original,local,remote,journal)){
      // Dependent/structural journals keep all original guards. Never silently
      // turn an unsupported conflict into an overwrite or discard local changes.
      throw Error(t('Xung đột ở trường phụ thuộc chưa hỗ trợ lựa chọn; nội dung cục bộ vẫn giữ.','相依欄位衝突尚未支援選擇；本機修改仍保留。'));
    }
    if(selected.length>256)throw Error('LOCAL_SAVE_LIMIT');
    if(selected.some(change=>change.guards?.some(guard=>!Object.hasOwn(guard,'value'))))throw Error(t('Trường cũ chưa tồn tại cần hợp đồng bảo vệ riêng; chưa gửi thay đổi.','舊資料缺少此欄位，尚需缺值保護契約；本次未送出修改。'));
    check();let expectedRevision=next?.revision;
    if(!next){
      const started=await transport.beginCompared(latest,()=>mediaCurrent()&&historyAllowsMutation()&&displayEpoch===historyDisplayEpoch&&isCurrent()&&transport.comparisonVersion()===decisionVersion&&working===local&&localChanges===journal&&JSON.stringify({working,localChanges,localGeneration})===raw&&!(modal&&!modal.readonly)&&control===base);check();
      const begun=started.workflow,receipt=started.receipt;
      if(journal.length&&receipt?.generation){localGeneration=receipt.generation;raw=JSON.stringify({working,localChanges,localGeneration});}
      if(!begun||begun.generation!==receipt?.generation||begun.revision!==receipt.revision||!same(begun.working,remote)||begun.pendingId)throw Error('BEGIN_COMPARISON_CHANGED');
      // Adopt the normal full model only after exact Begin receipt/readback.
      await read(true,inputsCurrent);
      if(!inputsCurrent()||control.workflow?.generation!==receipt.generation||control.workflow.revision!==receipt.revision||!same(control.workflow.working,remote))throw Error('BEGIN_COMPARISON_CHANGED');
      expectedRevision=receipt.revision;
    }
    if(!inputsCurrent())throw Error('SAVE_INPUT_CHANGED_RECONFIRM');
    const changes=selected.length?await prepareLocalSave(inputsCurrent,selected):[];
    if(!inputsCurrent())throw Error('SAVE_INPUT_CHANGED_RECONFIRM');
    return {...(journal.length?{localChanges:changes}:{}),expectedRevision};
  }
  // Preserve original ordered creation/patch journals when every original guard
  // still matches. Reconstruct RAM first; this is not a snapshot overwrite.
  function unchangedJournalCanMerge(base,local,latest,journal){
    const a=copy(base),b=copy(latest),at=(content,path)=>{let value=content;for(const part of path||[])value=typeof part==='string'?value?.[part]:Array.isArray(value)?value.find(row=>row.id===part?.id):undefined;return value;};
    for(const change of journal){
      for(const guard of change.guards||[])if(!Object.hasOwn(guard,'value')||!same(at(a,guard.path),guard.value)||!same(at(b,guard.path),guard.value))return false;
      if(change.moduleAction?.startsWith('create')){
        if(!change.localId?.startsWith('local-')||[...a.errors,...a.items,...b.errors,...b.items].some(row=>row.id===change.localId))return false;
        const detail=change.input;let value,kind;
        if(change.moduleAction==='create-error'){kind='errors';value={id:change.localId,code:t('Chưa lưu','尚未存取'),...detail,reason:'',deleted:false};}
        else if(change.moduleAction==='create-item'){
          kind='items';const parent=a.errors.find(row=>row.id===detail.errorId&&!row.deleted),remote=b.errors.find(row=>row.id===detail.errorId&&!row.deleted);
          if(!parent||!remote||['id','code','productCode','stageCode'].some(key=>!same(parent[key],remote[key])))return false;
          value={id:change.localId,code:t('Chưa lưu','尚未存取'),errorId:parent.id,productCode:parent.productCode,stageCode:parent.stageCode,standard:'',description:'',note:'',reason:'',tool:'',method:'',frequency:'',standardEnabled:true,cpkEnabled:false,notApplicable:false,deleted:false,equipmentId:'',equipmentGroupId:'',equipmentSnapshot:null,mediaItems:[],...detail.item};
        }else return false;
        a[kind].push(copy(value));b[kind].push(copy(value));
      }else if(change.moduleAction){
        if(!['delete-error','delete-item'].includes(change.moduleAction))return false;
        const kind=change.moduleAction==='delete-error'?'errors':'items';
        for(const content of [a,b]){const row=content[kind].find(row=>row.id===change.input.id&&!row.deleted);if(!row)return false;row.deleted=true;if(kind==='errors')for(const child of content.items)if(child.errorId===row.id)child.deleted=true;}
      }else{
        if(!Array.isArray(change.patches))return false;
        for(const patch of change.patches){if(patch.op!=='set'||patch.path?.length!==3)return false;for(const content of [a,b]){const row=content[patch.path[0]]?.find(row=>row.id===patch.path[1]?.id&&!row.deleted);if(!row)return false;row[patch.path[2]]=copy(patch.value);}}
      }
    }
    return same(a,local);
  }
  // C-only structural comparison. Prove the complete original journal before
  // adapting any guard. New IDs originate only in that journal; tombstones are
  // revived by the server under the same ID, never copied or inserted here.
  function structuralSaveCandidate(base,local,latest,journal){
    if(!journal.length)return null;
    const fields={errors:['name','note','reason'],items:['standard','description','note','reason','tool','method','frequency','standardEnabled','cpkEnabled','notApplicable','notApplicableReason','rule','equipmentGroupId','equipmentId','mediaItems']};
    const at=(content,kind,id)=>content[kind].find(row=>row.id===id);
    const immutable=(a,b)=>['id','code','errorId','productCode','stageCode','sourceRow'].every(key=>Object.hasOwn(a,key)===Object.hasOwn(b,key)&&same(a[key],b[key]));
    for(const content of [base,local,latest]){
      if(!content||Object.keys(content).some(key=>!['errors','items'].includes(key)))return null;
      const ids=new Set();
      for(const kind of ['errors','items']){
        if(!Array.isArray(content[kind]))return null;
        for(const row of content[kind]){if(!row||typeof row.id!=='string'||ids.has(row.id)||typeof row.deleted!=='boolean')return null;ids.add(row.id);}
      }
    }
    const replay=copy(base),scalarLocal=copy(base),scalars=[],creates=[],created=new Set(),deletes=[],touched=new Map();
    for(const change of journal){
      if(!change||typeof change!=='object'||Array.isArray(change))return null;
      if(change.moduleAction?.startsWith('create')){
        if(Object.keys(change).some(key=>!['moduleAction','input','localId'].includes(key))||!/^local-[a-zA-Z0-9_-]{8,80}$/.test(change.localId)||[...replay.errors,...replay.items,...latest.errors,...latest.items].some(row=>row.id===change.localId))return null;
        const input=change.input;if(!input||typeof input!=='object'||Array.isArray(input))return null;let kind,row;
        if(change.moduleAction==='create-error'){
          if(Object.keys(input).some(key=>!['productCode','stageCode','name','note'].includes(key)))return null;
          kind='errors';row={id:change.localId,code:t('Chưa lưu','尚未存取'),...copy(input),reason:'',deleted:false};
        }else if(change.moduleAction==='create-item'){
          if(Object.keys(input).some(key=>!['errorId','item'].includes(key))||!input.item||Object.keys(input.item).some(key=>!fields.items.includes(key)))return null;
          const parent=at(replay,'errors',input.errorId);if(!parent||parent.deleted)return null;
          kind='items';row={id:change.localId,code:t('Chưa lưu','尚未存取'),errorId:parent.id,productCode:parent.productCode,stageCode:parent.stageCode,
            standard:'',description:'',note:'',reason:'',tool:'',method:'',frequency:'',standardEnabled:true,cpkEnabled:false,notApplicable:false,deleted:false,equipmentId:'',equipmentGroupId:'',equipmentSnapshot:null,mediaItems:[],...copy(input.item)};
        }else return null;
        replay[kind].push(row);created.add(row.id);creates.push({kind,change:copy(change)});
      }else if(change.moduleAction){
        if(!['delete-error','delete-item'].includes(change.moduleAction)||Object.keys(change).some(key=>!['moduleAction','input','guards'].includes(key))||!change.input||Object.keys(change.input).some(key=>!['id',...(change.moduleAction==='delete-error'?['cascade']:[])].includes(key)))return null;
        const kind=change.moduleAction==='delete-error'?'errors':'items',id=change.input.id,row=at(replay,kind,id);
        if(!row||row.deleted||created.has(id)||kind==='errors'&&change.input.cascade!==true)return null;
        if(!same(change.guards,[{path:[kind,{id}],value:row},...(kind==='errors'?[{path:['items'],value:replay.items}]:[])]))return null;
        deletes.push({kind,id,input:copy(change.input)});row.deleted=true;
        if(kind==='errors')for(const item of replay.items)if(item.errorId===id)item.deleted=true;
      }else{
        if(Object.keys(change).some(key=>!['patches','guards'].includes(key))||!Array.isArray(change.patches)||!change.patches.length||!Array.isArray(change.guards)||change.guards.length!==change.patches.length)return null;
        const seen=new Set(),existing={patches:[],guards:[]};
        for(const patch of change.patches){
          const path=patch?.path;if(patch.op!=='set'||Object.keys(patch).some(key=>!['op','path','value'].includes(key))||!Object.hasOwn(patch,'value')||!Array.isArray(path)||path.length!==3)return null;
          const [kind,entity,field]=path;if(!fields[kind]?.includes(field)||!entity||typeof entity!=='object'||Object.keys(entity).length!==1||typeof entity.id!=='string')return null;
          const key=JSON.stringify(path),matches=change.guards.filter(guard=>same(guard.path,path)),row=at(replay,kind,entity.id);
          if(seen.has(key)||matches.length!==1||!row||row.deleted||Object.keys(matches[0]).some(key=>!['path','value'].includes(key))||!same(matches[0].value,row[field]))return null;
          seen.add(key);row[field]=copy(patch.value);
          if(!created.has(entity.id)){
            const original=at(scalarLocal,kind,entity.id);if(!original||original.deleted)return null;
            original[field]=copy(patch.value);existing.patches.push(copy(patch));existing.guards.push(copy(matches[0]));
            const target=touched.get(entity.id)||{kind,id:entity.id,fields:new Set()};target.fields.add(field);touched.set(entity.id,target);
          }
        }
        if(existing.patches.length)scalars.push(existing);
      }
    }
    if(!same(replay,local))return null;
    const underDelete=(kind,id)=>deletes.some(entry=>entry.kind===kind&&entry.id===id||entry.kind==='errors'&&kind==='items'&&at(base,'items',id)?.errorId===entry.id);
    for(const kind of ['errors','items'])for(const original of base[kind]){
      const remote=at(latest,kind,original.id);if(!remote||!immutable(original,remote))return null;
    }
    const normalized=copy(latest),revivals=new Map(),dependencies=new Map();
    const needLive=(kind,id,dependent)=>{
      const original=at(base,kind,id),remote=at(latest,kind,id);if(!original||original.deleted||!remote||!immutable(original,remote))return false;
      if(remote.deleted){
        const entry=revivals.get(id)||{kind,id,original,remote,dependents:new Set()};entry.dependents.add(dependent);revivals.set(id,entry);
        at(normalized,kind,id).deleted=false;
      }
      if(kind==='items')return needLive('errors',original.errorId,dependent);return true;
    };
    for(const entry of touched.values()){
      const original=at(base,entry.kind,entry.id),mine=at(scalarLocal,entry.kind,entry.id);
      if([...entry.fields].some(field=>!same(original[field],mine[field]))&&!needLive(entry.kind,entry.id,entry.id))return null;
    }
    for(const {kind,change}of creates)if(kind==='items'&&!created.has(change.input.errorId)){
      if(!at(local,'errors',change.input.errorId).deleted&&!needLive('errors',change.input.errorId,change.localId))return null;
    }
    // Reverted local edits do not resurrect a peer-deleted row. Normalize only
    // for the pure scalar comparison; those rows produce no outgoing patches.
    for(const entry of touched.values()){
      at(normalized,entry.kind,entry.id).deleted=false;
      if(entry.kind==='items'){const parent=at(normalized,'errors',at(base,'items',entry.id).errorId);if(!parent)return null;parent.deleted=false;}
    }
    const scalar=scalars.length?scalarSaveCandidate(base,scalarLocal,normalized,scalars):{clashes:[],changes:()=>[]};if(!scalar)return null;
    const structures=[];
    for(const entry of deletes){
      if(entry.kind==='items'&&deletes.some(value=>value.kind==='errors'&&value.id===at(base,'items',entry.id).errorId))continue;
      const original=at(base,entry.kind,entry.id),remote=at(latest,entry.kind,entry.id),children=entry.kind==='errors'?base.items.filter(row=>row.errorId===entry.id):[],current=entry.kind==='errors'?latest.items.filter(row=>row.errorId===entry.id):[];
      const cell={location:[original.productCode,original.stageCode,original.code,entry.id].join(' / '),original:JSON.stringify({row:original,children}),
        mine:t('Xóa nhóm/mục đã so sánh cùng các mục: ','刪除已比較群組／項目及子項：')+JSON.stringify({row:remote,children:current}),remote:JSON.stringify({row:remote,children:current})};
      structures.push({...entry,cell,conflict:!remote.deleted&&(!same(original,remote)||!same(children,current))});
    }
    const locallyLive=id=>[...local.errors,...local.items].some(row=>row.id===id&&!row.deleted);
    for(const entry of revivals.values()){
      entry.keepDeleted=underDelete(entry.kind,entry.id)||entry.kind==='errors'&&![...entry.dependents].some(locallyLive);
      entry.cell={location:[entry.remote.productCode,entry.remote.stageCode,entry.remote.code,entry.id].join(' / '),original:JSON.stringify(entry.original),
        mine:(entry.keepDeleted?t('Giữ trạng thái xóa và các trường/ô đánh dấu cục bộ: ','保留刪除狀態及本機欄位與勾選：'):t('Khôi phục đúng ID; chỉ các mục có thay đổi cục bộ được chọn, giữ nguyên ô đánh dấu: ','恢復同一 ID；僅恢復有本機修改的選定項目並保留勾選：'))+JSON.stringify({row:at(scalarLocal,entry.kind,entry.id),selected:[...entry.dependents]}),
        remote:t('Giữ trạng thái đã xóa; vẫn lưu các thay đổi độc lập.','保留刪除狀態；仍存取其他獨立修改。')+JSON.stringify(entry.remote)};
      for(const id of entry.dependents){const values=dependencies.get(id)||[];values.push(entry);dependencies.set(id,values);}
    }
    const clashes=[...structures.filter(entry=>entry.conflict).map(entry=>entry.cell),...[...revivals.values()].map(entry=>entry.cell),...scalar.clashes];
    return {clashes,changes(choices=new Map()){
      const state=copy(latest),changes=[],kept=id=>!(dependencies.get(id)||[]).some(entry=>choices.get(entry.cell)==='peer');
      for(const kind of ['errors','items'])for(const entry of revivals.values())if(entry.kind===kind&&choices.get(entry.cell)!=='peer'&&[...entry.dependents].some(kept)){
        const row=at(state,kind,entry.id);if(!row.deleted)continue;
        changes.push({moduleAction:kind==='errors'?'revive-error':'revive-item',input:{id:entry.id},guards:[{path:[kind,{id:entry.id}],value:copy(row)},kind==='errors'?{path:['items'],value:copy(state.items)}:{path:['errors',{id:row.errorId}],value:copy(at(state,'errors',row.errorId))}]});row.deleted=false;
      }
      const selected=scalar.changes(choices);if(!selected)return null;
      for(const change of selected){
        const patches=change.patches.filter(patch=>kept(patch.path[1].id)&&!at(state,patch.path[0],patch.path[1].id).deleted);
        const guards=change.guards.filter(guard=>patches.some(patch=>guard.path[0]===patch.path[0]&&guard.path[1].id===patch.path[1].id&&(guard.path.length===2||same(guard.path,patch.path))));
        if(patches.length){changes.push({patches,guards});for(const patch of patches)at(state,patch.path[0],patch.path[1].id)[patch.path[2]]=copy(patch.value);}
      }
      // Keep field-before-delete order. The private server batch may reconcile
      // only equipment snapshots with an exact accepted earlier patch origin;
      // all other full-row/child-set guard bytes remain exact.
      const deleteSelected=entry=>!at(state,entry.kind,entry.id).deleted&&choices.get(entry.cell)!=='peer';
      for(const entry of structures)if(deleteSelected(entry)){
        changes.push({moduleAction:entry.kind==='errors'?'delete-error':'delete-item',input:copy(entry.input),guards:[{path:[entry.kind,{id:entry.id}],value:copy(at(state,entry.kind,entry.id))},...(entry.kind==='errors'?[{path:['items'],value:copy(state.items)}]:[])]});
        at(state,entry.kind,entry.id).deleted=true;if(entry.kind==='errors')for(const row of state.items)if(row.errorId===entry.id)row.deleted=true;
      }
      // A parent needed only to validate fields of an ultimately deleted child
      // must keep the peer's deletion. No unrelated ancestor becomes live.
      for(const entry of revivals.values())if(entry.kind==='errors'&&entry.keepDeleted&&!at(state,'errors',entry.id).deleted&&![...entry.dependents].some(id=>kept(id)&&locallyLive(id))){
        changes.push({moduleAction:'delete-error',input:{id:entry.id,cascade:true},guards:[{path:['errors',{id:entry.id}],value:copy(at(state,'errors',entry.id))},{path:['items'],value:copy(state.items)}]});at(state,'errors',entry.id).deleted=true;for(const item of state.items)if(item.errorId===entry.id)item.deleted=true;
      }
      for(const {kind,change}of creates){
        const row=at(local,kind,change.localId);if(row.deleted||!kept(row.id)||kind==='items'&&(!created.has(row.errorId)&&at(state,'errors',row.errorId).deleted))continue;
        if(kind==='errors'){
          changes.push({moduleAction:'create-error',localId:row.id,input:{productCode:row.productCode,stageCode:row.stageCode,name:row.name,note:row.note}});
        }else{
          const item={};for(const field of ['standard','description','note','frequency','standardEnabled','cpkEnabled','notApplicableReason','rule','equipmentId','equipmentGroupId','mediaItems'])if(Object.hasOwn(row,field))item[field]=copy(row[field]);
          changes.push({moduleAction:'create-item',localId:row.id,input:{errorId:row.errorId,item}});
        }
        const patches=[],guards=[];
        for(const field of kind==='errors'?['reason']:['reason','tool','method','notApplicable']){
          const before=field==='notApplicable'?false:'';if(same(row[field],before))continue;const path=[kind,{id:row.id},field];patches.push({op:'set',path,value:copy(row[field])});guards.push({path:copy(path),value:before});
        }
        if(patches.length)changes.push({patches,guards});
      }
      return changes;
    }};
  }
  // Independent new rows keep their original local IDs and ordered server
  // allocation. Existing-row choices cannot rewrite these creation commands.
  function creationSaveCandidate(base,local,latest,journal){
    const creates=journal.filter(change=>change.moduleAction?.startsWith('create'));
    if(!creates.length||journal.some(change=>change.moduleAction&&!creates.includes(change)))return null;
    const edits=journal.filter(change=>!change.moduleAction),ids=new Set(creates.map(change=>change.localId));
    if(!edits.length||edits.some(change=>change.patches?.some(patch=>ids.has(patch.path?.[1]?.id))))return null;
    if(!unchangedJournalCanMerge(base,local,base,journal))return null;
    const existing=copy(local);for(const kind of ['errors','items'])existing[kind]=existing[kind].filter(row=>!ids.has(row.id));
    const candidate=scalarSaveCandidate(base,existing,latest,edits);if(!candidate)return null;
    // All existing parents must remain the same live structural identity.
    for(const change of creates)if(change.moduleAction==='create-item'&&!ids.has(change.input.errorId)){
      const a=base.errors.find(row=>row.id===change.input.errorId),b=latest.errors.find(row=>row.id===change.input.errorId);
      if(!a||!b||b.deleted||['id','code','productCode','stageCode'].some(key=>!same(a[key],b[key])))return null;
    }
    return {clashes:candidate.clashes,changes(choices=new Map()){return [...candidate.changes(choices),...copy(creates)];}};
  }
  function itemDeleteSaveCandidate(base,local,latest,journal){
    if(journal.length!==1)return null;
    const change=journal[0],id=change.input?.id;
    if(change.moduleAction!=='delete-item'||Object.keys(change).some(key=>!['moduleAction','input','guards'].includes(key))||Object.keys(change.input).some(key=>key!=='id')||typeof id!=='string'||id.startsWith('local-'))return null;
    const original=base.items.filter(row=>row.id===id),remote=latest.items.filter(row=>row.id===id);
    if(original.length!==1||remote.length!==1||original[0].deleted||['id','code','errorId','productCode','stageCode'].some(key=>!same(original[0][key],remote[0][key]))||!same(change.guards,[{path:['items',{id}],value:original[0]}]))return null;
    const expected=copy(base);expected.items.find(row=>row.id===id).deleted=true;if(!same(expected,local))return null;
    const cell={location:[original[0].productCode,original[0].stageCode,original[0].code,id].join(' / '),original:JSON.stringify(original[0]),mine:t('Xóa mục đã so sánh: ','刪除已比較項目：')+JSON.stringify(remote[0]),remote:JSON.stringify(remote[0])};
    return {clashes:!remote[0].deleted&&!same(original[0],remote[0])?[cell]:[],changes(choices=new Map()){return remote[0].deleted||choices.get(cell)==='peer'?[]:[{moduleAction:'delete-item',input:{id},guards:[{path:['items',{id}],value:copy(remote[0])}]}];}};
  }
  // One whole-group deletion may coexist with independent scalar changes.
  // Verify every original preimage and reconstruct the complete local result.
  function combinedSaveCandidate(base,local,latest,journal){
    const deletes=journal.filter(change=>['delete-error','delete-item'].includes(change.moduleAction));
    if(deletes.length!==1||journal.some(change=>change.moduleAction&&change!==deletes[0]))return null;
    const deletion=deletes[0],kind=deletion.moduleAction==='delete-error'?'errors':'items',id=deletion.input?.id,ids=new Set(kind==='errors'?base.items.filter(row=>row.errorId===id).map(row=>row.id):[]);
    const scalars=journal.filter(change=>change!==deletion);
    if(!scalars.length||scalars.some(change=>change.patches?.some(patch=>patch.path?.[1]?.id===id||ids.has(patch.path?.[1]?.id))))return null;
    const replay=copy(base),scalarLocal=copy(base);
    for(const change of journal){
      if(change===deletion){
        const row=replay[kind].find(row=>row.id===id);if(!row||row.deleted||!same(change.guards,[{path:[kind,{id}],value:row},...(kind==='errors'?[{path:['items'],value:replay.items}]:[])]))return null;
        row.deleted=true;if(kind==='errors')for(const item of replay.items)if(item.errorId===id)item.deleted=true;
      }else for(const patch of change.patches||[]){
        const row=replay[patch.path?.[0]]?.find(row=>row.id===patch.path?.[1]?.id),scalar=scalarLocal[patch.path?.[0]]?.find(row=>row.id===patch.path?.[1]?.id);
        if(!row||!scalar)return null;row[patch.path[2]]=copy(patch.value);scalar[patch.path[2]]=copy(patch.value);
      }
    }
    if(!same(replay,local))return null;
    const deletionOnly=copy(base);deletionOnly[kind].find(row=>row.id===id).deleted=true;if(kind==='errors')for(const item of deletionOnly.items)if(item.errorId===id)item.deleted=true;
    const a=scalarSaveCandidate(base,scalarLocal,latest,scalars),b=(kind==='errors'?cascadeSaveCandidate:itemDeleteSaveCandidate)(base,deletionOnly,latest,[{...copy(deletion),guards:[{path:[kind,{id}],value:copy(base[kind].find(row=>row.id===id))},...(kind==='errors'?[{path:['items'],value:copy(base.items)}]:[])]}]);
    if(!a||!b)return null;
    return {clashes:[...a.clashes,...b.clashes],changes(choices=new Map()){
      // Deletion guards the exact compared child set before independent patches.
      // Never predict equipment snapshots that only the server may normalize.
      return [...b.changes(choices),...a.changes(choices)];
    }};
  }
  // Photo identity is immutable. Merge presence and scalar fields separately;
  // retain independent additions from both sides and anchor them to the chosen
  // order. Only delete-vs-edit or incompatible ordering needs global consent.
  function photoListSavePlan(entry,a,b,c){
    if(![a,b,c].every(rows=>Array.isArray(rows)&&rows.every(row=>row&&typeof row.id==='string')&&new Set(rows.map(row=>row.id)).size===rows.length))return null;
    const ids=rows=>rows.map(row=>row.id),index=rows=>new Map(rows.map(row=>[row.id,row])),before=index(a),mine=index(b),peer=index(c),all=[...new Set([...ids(c),...ids(b),...ids(a)])],deletedConflicts=new Set();
    for(const id of ids(a))if(!mine.has(id)&&peer.has(id)&&!same(before.get(id),peer.get(id))||mine.has(id)&&!peer.has(id)&&!same(before.get(id),mine.get(id)))deletedConflicts.add(id);
    const common=ids(a).filter(id=>mine.has(id)&&peer.has(id)),baseOrder=common,mineOrder=ids(b).filter(id=>common.includes(id)),peerOrder=ids(c).filter(id=>common.includes(id)),mineMoved=!same(baseOrder,mineOrder),peerMoved=!same(baseOrder,peerOrder);
    const sharedNew=ids(b).some(id=>!before.has(id)&&peer.has(id)),shared=all.filter(id=>mine.has(id)&&peer.has(id));
    const orderConflict=mineMoved&&peerMoved&&!same(mineOrder,peerOrder)||sharedNew&&!same(ids(b).filter(id=>shared.includes(id)),ids(c).filter(id=>shared.includes(id)));
    const structural=deletedConflicts.size||orderConflict?{...entry,mediaStructure:true,forceClash:true,before:ids(a),own:ids(b),peer:ids(c),original:JSON.stringify(a),mine:JSON.stringify(b),remote:JSON.stringify(c),location:[entry.original.productCode,entry.original.stageCode,entry.original.code,entry.id,t('Thứ tự / thêm xóa ảnh','照片順序／增刪')].join(' / ')}:null;
    const cells=structural?[structural]:[];
    for(const id of all){if(!mine.has(id)||!peer.has(id))continue;const origin=before.get(id),own=mine.get(id),remote=peer.get(id);
      for(const field of ['name','note','afterParagraph'])if(!same(origin?.[field],own[field]))cells.push({...entry,mediaPlanField:true,photoId:id,photoField:field,before:origin?.[field],own:own[field],peer:remote[field],original:JSON.stringify(origin?.[field]??null),mine:JSON.stringify(own[field]??null),remote:JSON.stringify(remote[field]??null),location:[entry.original.productCode,entry.original.stageCode,entry.original.code,entry.id,id,field].join(' / ')});
    }
    return{cells,build(choices){
      const side=structural&&choices.get(structural)==='peer'?'peer':'mine',rows=new Map();
      for(const id of all){const origin=before.get(id),own=mine.get(id),remote=peer.get(id);let selected;
        if(!origin)selected=remote||own;else if(own&&remote)selected=remote;else if(deletedConflicts.has(id))selected=side==='peer'?remote:own;
        if(selected)rows.set(id,copy(selected));
      }
      for(const cell of cells)if(cell.mediaPlanField&&rows.has(cell.photoId)){const value=same(cell.own,cell.before)||choices.get(cell)==='peer'?cell.peer:cell.own,photo=rows.get(cell.photoId);if(value===undefined)delete photo[cell.photoField];else photo[cell.photoField]=copy(value);}
      const primary=orderConflict?side==='mine'?b:c:mineMoved?b:c,secondary=primary===b?c:b,ordered=ids(primary).filter(id=>rows.has(id));
      // Add only absent identities, adjacent to their nearest surviving anchor.
      // Use the next anchor first so independent inserts preserve source order.
      const others=ids(secondary);for(let n=0;n<others.length;n++){const id=others[n];if(!rows.has(id)||ordered.includes(id))continue;const next=others.slice(n+1).find(value=>ordered.includes(value));if(next!==undefined)ordered.splice(ordered.indexOf(next),0,id);else{const previous=others.slice(0,n).reverse().find(value=>ordered.includes(value));if(previous!==undefined)ordered.splice(ordered.indexOf(previous)+1,0,id);else ordered.push(id);}}
      return ordered.map(id=>rows.get(id));
    }};
  }
  // Independent fields stay independent. A validated rule is one object,
  // equipment is a validated pair; photos compare identity, presence, order
  // and individual fields.
  // Server-owned equipment snapshots are guards/context, never client patches.
  function scalarSaveCandidate(base,local,latest,journal){
    if(!journal.length)return null;
    const groups={errors:[['name'],['note'],['reason']],items:[['note'],['reason'],['tool'],['method'],
      ['standard'],['standardEnabled'],['cpkEnabled'],['notApplicable'],['notApplicableReason'],
      ['frequency'],['rule'],['description'],['mediaItems'],['equipmentGroupId','equipmentId']]};
    const row=(content,kind,id)=>{const rows=content?.[kind]?.filter(value=>value.id===id);return rows?.length===1&&!rows[0].deleted?rows[0]:null;};
    const values=(entity,fields)=>Object.fromEntries(fields.filter(key=>Object.hasOwn(entity,key)).map(key=>[key,copy(entity[key])]));
    const pathKey=path=>JSON.stringify(path),touched=new Map(),simulated=copy(base);
    for(const change of journal){
      if(Object.keys(change).some(key=>!['patches','guards'].includes(key))||!Array.isArray(change.patches)||!change.patches.length||!Array.isArray(change.guards)||change.guards.length!==change.patches.length)return null;
      const seen=new Set();
      for(const patch of change.patches){
        const path=patch.path;if(patch.op!=='set'||Object.keys(patch).some(key=>!['op','path','value'].includes(key))||!Array.isArray(path)||path.length!==3||!Object.hasOwn(patch,'value'))return null;
        const [kind,entity,field]=path,fields=groups[kind]?.find(group=>group.includes(field));
        if(!fields||!entity||typeof entity!=='object'||Array.isArray(entity)||Object.keys(entity).length!==1||typeof entity.id!=='string'||entity.id.startsWith('local-'))return null;
        const key=pathKey(path),guards=change.guards.filter(guard=>pathKey(guard.path)===key);
        if(seen.has(key)||guards.length!==1)return null;seen.add(key);
        const guard=guards[0],current=row(simulated,kind,entity.id),original=row(base,kind,entity.id),remote=row(latest,kind,entity.id);
        if(Object.keys(guard).some(key=>!['path','value'].includes(key))||!current||!original||!remote||!same(current[field],guard.value))return null;
        if(['id','code','errorId','productCode','stageCode','deleted'].some(key=>Object.hasOwn(original,key)!==Object.hasOwn(remote,key)||!same(original[key],remote[key])))return null;
        if(kind==='items'&&!row(latest,'errors',remote.errorId))return null;
        const groupKey=JSON.stringify([kind,entity.id,fields]);
        if(!touched.has(groupKey))touched.set(groupKey,{kind,id:entity.id,fields,original,remote});
        current[field]=copy(patch.value);
      }
    }
    if(!same(simulated,local))return null;
    const cells=[],photoPlans=[];
    for(const entry of touched.values()){
      const mine=row(local,entry.kind,entry.id),before=values(entry.original,entry.fields),own=values(mine,entry.fields),peer=values(entry.remote,entry.fields);
      // There is no supported unset patch. Do not fabricate a replacement for
      // an absent legacy property just to make a "mine" choice dispatchable.
      if(Object.keys(peer).some(key=>!Object.hasOwn(own,key))&&!same(own,before))return null;
      if(entry.fields[0]==='rule'&&!same(own,before)&&!same(peer,before)&&!same(own,peer)){
        const a=before.rule,b=own.rule,c=peer.rule,variant=value=>value&&[value.cadence,value.batchKind??null,value.timeFrequency??null];
        if(a&&b&&c&&same(variant(a),variant(b))&&same(variant(a),variant(c))){
          for(const field of new Set([...Object.keys(a),...Object.keys(b),...Object.keys(c)])){
            if(same(a[field],b[field]))continue;if(!Object.hasOwn(b,field)&&Object.hasOwn(c,field))return null;
            cells.push({...entry,rule:true,ruleField:field,before:a[field],own:b[field],peer:c[field],original:JSON.stringify(a[field]),mine:JSON.stringify(b[field]),remote:JSON.stringify(c[field]),location:[entry.original.productCode,entry.original.stageCode,entry.original.code,entry.id,'rule',field].join(' / ')});
          }
          continue;
        }
      }
      if(entry.fields[0]==='mediaItems'){
        const plan=photoListSavePlan(entry,before.mediaItems,own.mediaItems,peer.mediaItems);if(!plan)return null;
        photoPlans.push({...plan,id:entry.id});cells.push(...plan.cells);continue;
      }
      const cell={...entry,before,own,peer,original:JSON.stringify(before),mine:JSON.stringify(own),remote:JSON.stringify(peer),
        location:[entry.original.productCode,entry.original.stageCode,entry.original.code,entry.id,entry.fields.join(' + ')].join(' / ')};
      cells.push(cell);
    }
    const clashes=cells.filter(cell=>cell.forceClash||!same(cell.own,cell.before)&&!same(cell.peer,cell.before)&&!same(cell.own,cell.peer));
    return {clashes,changes(choices=new Map()){
      const patches=[],guards=[],media=new Map(),rules=new Map();
      for(const cell of cells){if(cell.mediaPlanField||cell.mediaStructure)continue;const chosen=same(cell.own,cell.before)||choices.get(cell)==='peer'?cell.peer:cell.own;
        if(cell.rule){
          if(same(chosen,cell.peer))continue;if(!rules.has(cell.id))rules.set(cell.id,copy(row(latest,'items',cell.id).rule));
          rules.get(cell.id)[cell.ruleField]=copy(chosen);continue;
        }
        if(cell.media){
          if(same(chosen,cell.peer))continue;
          if(!media.has(cell.id))media.set(cell.id,copy(row(latest,'items',cell.id).mediaItems));
          media.get(cell.id).find(photo=>photo.id===cell.photoId)[cell.photoField]=copy(chosen);continue;
        }
        for(const field of cell.fields){if(!Object.hasOwn(chosen,field)||same(chosen[field],cell.peer[field]))continue;
          const path=[cell.kind,{id:cell.id},field];patches.push({op:'set',path,value:copy(chosen[field])});if(Object.hasOwn(cell.peer,field))guards.push({path:copy(path),value:copy(cell.peer[field])});
          else if(cell.kind==='items'&&['rule','notApplicable','notApplicableReason','equipmentGroupId','equipmentId'].includes(field)){
            const rowPath=['items',{id:cell.id}];if(!guards.some(guard=>same(guard.path,rowPath)))guards.push({path:rowPath,value:copy(row(latest,'items',cell.id))});
          }else return null;
        }
      }
      for(const [id,value]of rules){const path=['items',{id},'rule'];patches.push({op:'set',path,value});guards.push({path:copy(path),value:copy(row(latest,'items',id).rule)});}
      for(const plan of photoPlans){const value=plan.build(choices);if(!same(value,row(latest,'items',plan.id).mediaItems))media.set(plan.id,value);}
      for(const [id,value]of media){const path=['items',{id},'mediaItems'];patches.push({op:'set',path,value});guards.push({path:copy(path),value:copy(row(latest,'items',id).mediaItems)});}
      return patches.length?[{patches,guards}]:[];
    }};
  }
  // One recognized local group deletion only. Reconstruct its exact preimage
  // before adapting guards; never discard extra guards or trust a snapshot patch.
  function cascadeSaveCandidate(base,local,latest,journal){
    if(journal.length!==1)return null;
    const change=journal[0],input=change.input;
    if(change.moduleAction!=='delete-error'||Object.keys(change).some(key=>!['moduleAction','input','guards'].includes(key))||!input||Object.keys(input).some(key=>!['id','cascade'].includes(key))||input.cascade!==true||typeof input.id!=='string'||input.id.startsWith('local-')||!Array.isArray(change.guards)||change.guards.length!==2)return null;
    for(const content of [base,local,latest])for(const kind of ['errors','items']){
      const rows=content?.[kind];if(!Array.isArray(rows)||rows.some(row=>!row||typeof row.id!=='string')||new Set(rows.map(row=>row.id)).size!==rows.length)return null;
    }
    const parent=base.errors.find(row=>row.id===input.id),remote=latest.errors.find(row=>row.id===input.id);
    if(!parent||parent.deleted||!remote||['id','code','productCode','stageCode'].some(key=>!same(parent[key],remote[key])))return null;
    const expected=[{path:['errors',{id:input.id}],value:parent},{path:['items'],value:base.items}];
    if(!expected.every(guard=>change.guards.filter(value=>same(value,guard)).length===1))return null;
    const mine=copy(base);mine.errors.find(row=>row.id===input.id).deleted=true;
    for(const child of mine.items)if(child.errorId===input.id)child.deleted=true;
    if(!same(mine,local))return null;
    const children=base.items.filter(row=>row.errorId===input.id),ids=new Set(base.items.map(row=>row.id)),current=latest.items.filter(row=>row.errorId===input.id);
    const added=current.filter(row=>!ids.has(row.id));
    const describe=rows=>rows.map(row=>`${row.code} (${row.id})`).join(', ')||t('Không có','無');
    const cell={location:[parent.productCode,parent.stageCode,parent.code,parent.id].join(' / '),
      original:JSON.stringify({parent,children}),
      mine:t('Xóa toàn bộ nhóm và các mục: ','刪除整個群組及子項：')+`${parent.code} · ${describe(current.filter(row=>!row.deleted))}`,
      remote:t('Giữ nhóm và các mục: ','保留群組及子項：')+JSON.stringify({parent:remote,children:current})};
    return {clashes:!remote.deleted&&(!same(parent,remote)||!same(children,current)||added.length)?[cell]:[],changes(choices=new Map()){
      if(remote.deleted||choices.get(cell)==='peer')return [];
      return [{moduleAction:'delete-error',input:copy(input),guards:[{path:['errors',{id:input.id}],value:copy(remote)},{path:['items'],value:copy(latest.items)}]}];
    }};
  }
  function chooseSaveCandidate(candidate,owns){
    return new Promise(resolve=>{
      const previous=document.activeElement,overlay=document.createElement('div'),choices=new Map();overlay.className='ipqcc-overlay';
      overlay.innerHTML=`<section class="ipqcc-dialog ipqcc-save-choice" role="dialog" aria-modal="true" aria-labelledby="ipqcc-choice-title"><header><h3 id="ipqcc-choice-title">${t('Chọn nội dung xung đột','選擇衝突內容')}</h3><button type="button" data-save-cancel aria-label="${t('Đóng','關閉')}">×</button></header><div class="ipqcc-dialog-body"><p>${t('Chọn một lần cho mọi xung đột để tiếp tục lưu. Giữ thay đổi không xung đột; nếu dữ liệu chung đổi, đối chiếu lại.','一次選擇全部衝突後繼續此次存取，保留雙方非衝突修改；共享版本變更時重新比較。')}</p>${candidate.clashes.map(cell=>`<article><h4 style="overflow-wrap:anywhere">${h(cell.location)}</h4><dl><dt>${t('Ban đầu','原值')}</dt><dd style="white-space:pre-wrap;overflow-wrap:anywhere">${h(cell.original)}</dd><dt>${t('Của tôi','我的')}</dt><dd style="white-space:pre-wrap;overflow-wrap:anywhere">${h(cell.mine)}</dd><dt>${t('Của người khác','對方')}</dt><dd style="white-space:pre-wrap;overflow-wrap:anywhere">${h(cell.remote)}</dd></dl></article>`).join('')}</div><footer><button type="button" data-save-choice="mine" aria-pressed="false">${t('Dùng của tôi','用我的')}</button><button type="button" data-save-choice="peer" aria-pressed="false">${t('Dùng của người khác','用對方的')}</button><button type="button" data-save-cancel>${t('Hủy','取消')}</button></footer></section>`;
      const state={owns,finish(value){if(saveChoice!==state)return;saveChoice=null;overlay.remove();if(previous?.isConnected&&owns())previous.focus({preventScroll:true});resolve(value);}};
      saveChoice?.finish(null);saveChoice=state;
      overlay.querySelectorAll('[data-save-cancel]').forEach(button=>button.addEventListener('click',()=>state.finish(null)));
      overlay.querySelectorAll('[data-save-choice]').forEach(button=>button.addEventListener('click',()=>{
        if(!owns()){state.finish(null);return;}
        for(const cell of candidate.clashes)choices.set(cell,button.dataset.saveChoice);
        state.finish(candidate.changes(choices));
      }));
      overlay.addEventListener('keydown',event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();state.finish(null);}
        if(event.key==='Tab'){const nodes=[...overlay.querySelectorAll('button')].filter(node=>!node.disabled),first=nodes[0],last=nodes.at(-1);if(!overlay.contains(document.activeElement)||document.activeElement===(event.shiftKey?first:last)){event.preventDefault();(event.shiftKey?last:first).focus();}}
      });
      document.body.append(overlay);overlay.querySelector('[data-save-cancel]').focus({preventScroll:true});
    });
  }
  async function write(action, detail = {}, closeModal = false) {
    if(!historyAllowsMutation())return null;
    if(['apply','create-item','create-error','delete-item','delete-error'].includes(action)){try{return stageLocal(action,detail,closeModal);}catch(error){message=error.message;draw();return null;}}
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
  // A local equipmentId patch deliberately does not rewrite the server snapshot.
  // Reuse a snapshot only for its own ID; otherwise preview the selected registry row.
  function equipmentForDisplay(item) {
    if(!item.equipmentId)return null;
    return item.equipmentSnapshot?.id===item.equipmentId?item.equipmentSnapshot:equipment.find(row=>row.id===item.equipmentId)||null;
  }
  function equipmentDetailHTML(item) {
    const eq=equipmentForDisplay(item);
    return `<div class="ipqcc-selected-equipment">${item.equipmentId?eq?`${eq.photoId?`<img decoding="async" loading="lazy" src="/api/routine-equipment/photo?id=${h(eq.photoId)}" alt="">`:''}<span>${h(eq.assetCode||'')} / ${h(eq.pieceMark||'')} · ${h(eq.name||'')}</span>`:`<span>${h(item.equipmentId)}</span>`:t('Kiểm tra trực quan','目視檢查')}</div>`;
  }
  function equipmentListPreview(item) {
    if (!item.equipmentId) return '';
    const eq=equipmentForDisplay(item);
    if (!eq) return '';
    return `<a class="ipqcc-equipment-preview" href="/process/?system=quality&view=data&dataTab=quality-routine-equipment&equipmentId=${encodeURIComponent(item.equipmentId)}" target="_blank" rel="noopener" title="${h(t('Xem thiết bị','查看檢具資訊'))}">${eq.photoId?`<img decoding="async" loading="lazy" src="/api/routine-equipment/photo?id=${h(eq.photoId)}" alt="${h(eq.name||'')}">`:'◇'}<span><b>${h(eq.assetCode)} / ${h(eq.pieceMark)}</b><small>${h(eq.name||'')}</small></span></a>`;
  }
  function caseRowsById(rows){
    if(!rows.every(row=>typeof row.id==='string'))return id=>rows.find(row=>row.id===id);
    const index=new Map();for(const row of rows)if(!index.has(row.id))index.set(row.id,row);
    return id=>index.get(id);
  }
  function caseComparison(before,after){
    if(!before)return null;
    const prior=caseRowsById(before.items),changedItems=after.items.filter(item=>JSON.stringify(item)!==JSON.stringify(prior(item.id)));
    return {errorsBefore:before.errors.filter(row=>!row.deleted).length,errorsAfter:after.errors.filter(row=>!row.deleted).length,
      itemsBefore:before.items.filter(row=>!row.deleted).length,itemsAfter:after.items.filter(row=>!row.deleted).length,
      changed:changedItems.length,changedItems};
  }
  function approvedItemStatus(item){return item.deleted?t('Đã xóa','已刪除'):item.standardEnabled?t('Đang dùng','使用中'):t('Tạm ngưng','停用');}

  // C-only display lease, derived from e460d76's reviewed BOM design.
  // Historical snapshots never become a writer basis or settle a receipt.
  let approvedHistoryView=null;
  function retireApprovedHistory(){historyDisplayEpoch++;saveChoice?.finish(null);approvedHistoryView?.retire();}
  function mountApprovedHistory(shell,log,empty){
    approvedHistoryView?.retire();empty?.remove();
    const client=sharedTransport(),root=host,pageRoot=root?.querySelector('#ipqcc-page'),mount=mountSequence,actor=identity(),epoch=window.ProcessSync?.identityGeneration?.(),delivery=window.ProcessSync?.captureDelivery?.();
    if(!pageRoot||!client.approvedHistory||!client.approvedVersion)return;
    const owner=()=>host===root&&root.isConnected&&shell.isConnected&&root.querySelector('.vd-shell')===shell&&mountSequence===mount&&identity()===actor&&sharedClient===client&&Number.isSafeInteger(epoch)&&epoch>=0&&epoch===window.ProcessSync?.identityGeneration?.()&&!window.ProcessSync?.requiresReload&&delivery!==undefined&&delivery!==null&&window.ProcessSync?.isCurrentDelivery?.(delivery)===true&&client.isRuntimeCurrent()!==false;
    const allowed=()=>owner()&&client.permission('view')===true&&client.permission('history')===true;
    const choice=document.createElement('select');choice.id='ipqcc-approved-version';choice.setAttribute('aria-label',t('Phiên bản đã duyệt / bản nháp hiện tại','已核准版本／當前共用草稿'));shell.querySelector('.vd-choice')?.append(choice);
    const notice=document.createElement('p');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.setAttribute('data-approved-notice','true');shell.querySelector('.vd-card')?.append(notice);
    const display=document.createElement('section');display.setAttribute('data-ipqcc-approved-view','true');display.hidden=true;shell.after(display);
    let sequence=0,retired=false,blocked=false,selecting=false,loading=false,loaded=false,cursor=null,selected=null,observedRevision=-1,unwatch=()=>{},hidden=[];
    const known=new Map(),title=shell.querySelector('.vd-top h3');let currentTitle=title?.textContent;
    const live=()=>!retired&&approvedHistoryView===view&&owner();
    const hideWorking=()=>{if(hidden.length)return;const card=shell.querySelector('.vd-card');const nodes=[...pageRoot.children].filter(n=>n!==shell&&n!==display).concat([...shell.children].filter(n=>!n.matches('.vd-heading,.vd-card')),[...(card?.children||[])].filter(n=>!n.matches('.vd-top')&&n!==notice));hidden=nodes.map(node=>[node,node.hidden]);for(const [node]of hidden)node.hidden=true;};
    const restoreWorking=()=>{for(const [node,wasHidden]of hidden)node.hidden=wasHidden;hidden=[];if(title)title.textContent=currentTitle;display.hidden=true;display.replaceChildren();};
    const controls=()=>{if(live())choice.disabled=!owner()||client.permission('view')===false||client.permission('history')===false;};
    const paint=()=>{choice.innerHTML=`<option value="">${t('Bản nháp chung hiện tại','當前共用草稿')}</option>`;for(const row of known.values()){const option=document.createElement('option');option.value=row.id;option.textContent=`V${row.number} · ${t('Đã duyệt · chỉ đọc','已核准 · 唯讀')} · ${date(row.approvalEvidence.approvedAt)}`;choice.append(option);}if(cursor){const more=document.createElement('option');more.value='__more';more.textContent=t('Xem thêm phiên bản đã duyệt…','載入更多已核准版本…');choice.append(more);}if(selecting&&loading&&!blocked){const option=document.createElement('option');option.value='__loading';option.textContent=t('Đang tải phiên bản…','正在載入版本…');option.disabled=true;choice.prepend(option);}if(blocked){const option=document.createElement('option');option.value='__blocked';option.textContent=t('Chọn lại bản nháp hiện tại sau khi kiểm tra quyền','核權後請重新選擇當前共用草稿');choice.prepend(option);}choice.value=blocked?'__blocked':selecting&&loading?'__loading':selected?.id||'';controls();};
    const erase=()=>{historyDisplayEpoch++;saveChoice?.finish(null);sequence++;blocked=true;selecting=true;loading=false;selected=null;known.clear();cursor=null;loaded=false;display.replaceChildren();display.hidden=true;hideWorking();notice.textContent=t('Quyền hoặc trang đã thay đổi. Hãy mở lại và kiểm tra.','權限或頁面已變更，請重新開啟核對。');paint();};
    const retire=()=>{if(retired)return;retired=true;sequence++;unwatch();for(const event of events)window.removeEventListener(event,invalidate);restoreWorking();choice.remove();notice.remove();display.remove();if(approvedHistoryView===view)approvedHistoryView=null;};
    const invalidate=()=>{if(!live()){erase();return;}if(!allowed())erase();else controls();};
    const events=['process-delivery-invalidated','process-sync-status','pagehide'],view={retire,relabel(){if(!live())return;shell.refreshLabels?.();currentTitle=title?.textContent;paint();if(selected)paintSnapshot();},get blocked(){return blocked||selecting||!!selected||!live();}};approvedHistoryView=view;
    for(const event of events)window.addEventListener(event,invalidate);unwatch=client.watchApprovedAccess(invalidate);
    const begin=()=>{if(!live())throw Error('APPROVED_HISTORY_SUPERSEDED');loading=true;const ticket=++sequence;return ()=>live()&&sequence===ticket;};
    const authority=result=>{if(!allowed()||!Number.isSafeInteger(result?.revision)||result.revision<observedRevision||!['view','edit','save','submit','withdraw','approve','return','history','delete'].every(key=>typeof result.permissions?.[key]==='boolean')||result.permissions.view!==true||result.permissions.history!==true)throw Error('APPROVED_HISTORY_AUTHORITY_REQUIRED');observedRevision=result.revision;};
    const evidence=value=>value&&((value.kind==='legacy-approval'&&value.caseId===null&&value.savedId===null)||(value.kind==='approved-case'&&typeof value.caseId==='string'&&!!value.caseId&&typeof value.savedId==='string'&&!!value.savedId.trim()&&typeof value.approvedBy==='string'&&!!value.approvedBy.trim()))&&typeof value.approvedAt==='string'&&Number.isFinite(Date.parse(value.approvedAt));
    const validRow=row=>row&&typeof row.id==='string'&&!!row.id&&!['__more','__blocked','__loading'].includes(row.id)&&!row.id.startsWith('shared-')&&Number.isSafeInteger(row.number)&&row.number>=1&&['approved','superseded'].includes(row.status)&&evidence(row.approvalEvidence)&&(row.approvalEvidence.kind!=='approved-case'||row.approvalEvidence.caseId===row.id);
    const fail=(error,current)=>{if(current())notice.textContent=t('Không đọc được phiên bản','無法讀取版本')+' · '+displayDraftError(error);};
    const paintSnapshot=()=>{
      hideWorking();display.hidden=false;if(title)title.textContent=`V${selected.number} · ${t('Đã duyệt · chỉ đọc','已核准 · 唯讀')}`;
      const names={id:['Mã định danh','識別'],code:['Mã','編號'],name:['Tên','名稱'],note:['Ghi chú','備註'],standard:['Tiêu chuẩn','檢查標準'],description:['Cách kiểm tra','方式敘述'],productCode:['Sản phẩm','產品'],stageCode:['Công đoạn','工段'],errorId:['Mã lỗi','錯誤代碼'],equipmentId:['Thiết bị','檢具'],equipmentSnapshot:['Thông tin thiết bị','檢具資訊'],frequency:['Tần suất','檢查頻率'],rule:['Quy tắc','頻率規則'],standardEnabled:['Dùng tiêu chuẩn','啟用標準'],cpkEnabled:['Dùng CPK','啟用 CPK'],deleted:['Đã xóa','已刪除'],mediaItems:['Ảnh','圖片']};
      const fields=row=>`<dl>${Object.entries(row).map(([key,value])=>{if(key==='equipmentSnapshot'&&row.equipmentId&&value?.id!==row.equipmentId)value=t('Thiếu ảnh chụp thiết bị lịch sử đã xác minh','缺少可核對的歷史檢具快照');return `<dt>${h(names[key]?t(...names[key]):key)}</dt><dd style="white-space:pre-wrap;overflow-wrap:anywhere">${h(typeof value==='object'?JSON.stringify(value,null,2):value)}</dd>`;}).join('')}</dl>`;
      display.innerHTML=`<p>${t('Chỉ đọc. Chọn bản nháp hiện tại trong cùng bộ lọc để quay lại.','唯讀。請於同一篩選器選擇當前共用草稿切回。')}</p><p>${h(selected.approvalEvidence.approvedBy||'')} · ${h(date(selected.approvalEvidence.approvedAt))}</p><h3>${t('Mã lỗi','錯誤代碼')} · ${selected.snapshot.errors.length}</h3>${selected.snapshot.errors.map(row=>`<article class="ipqcc-card">${fields(row)}</article>`).join('')}<h3>${t('Hạng mục kiểm tra','檢查項目')} · ${selected.snapshot.items.length}</h3>${selected.snapshot.items.map(row=>`<article class="ipqcc-card"><h4>${h(row.code||row.id)} · ${h(approvedItemStatus(row))}</h4>${fields(row)}${row.equipmentId&&row.equipmentSnapshot?.id!==row.equipmentId?`<p role="note">${t('Thiếu ảnh chụp thiết bị lịch sử; không dùng danh mục hiện tại để thay thế.','缺少歷史檢具快照；不以現行檢具資料補代。')}</p>`:''}${(row.mediaItems||[]).map(photo=>{const url=client.mediaURL(photo);return url?`<figure><img style="max-width:100%;height:auto" src="${h(url)}" alt="${h(photo.name||'')}" loading="lazy"><figcaption>${h(photo.note||photo.name||'')}</figcaption></figure>`:`<p role="note">${t('Thiếu dữ liệu ảnh lịch sử đã xác minh','缺少可核對的歷史圖片資料')}</p>`;}).join('')}</article>`).join('')}`;
      const displayed=selected;for(const img of display.querySelectorAll('img'))img.onerror=()=>{if(live()&&selected===displayed){const caption=img.parentElement?.querySelector('figcaption');if(caption)caption.textContent=t('Không đọc được ảnh của phiên bản lịch sử','無法讀取此歷史版本圖片');}};
    };
    async function load(){if(loading)return;const current=begin();try{notice.textContent=t('Đang tải…','載入中…');const permission=await client.permissions({isCurrent:current,requireAcceptedAccess:true});if(!current())return;authority(permission);const result=await client.approvedHistory({versionBefore:cursor||''},{isCurrent:current});if(!current())return;authority(result);const data=result.versions;if(result.approvedOnly!==true||!data||!Array.isArray(data.rows)||data.rows.length>20||!data.rows.every(validRow)||new Set(data.rows.map(row=>row.id)).size!==data.rows.length||!Number.isSafeInteger(data.total)||data.total<data.rows.length||!(data.next===null||typeof data.next==='string'&&!!data.next)||data.next===cursor&&cursor!==null)throw Error('APPROVED_HISTORY_INVALID');for(const row of data.rows)known.set(row.id,copy(row));cursor=data.next;loaded=true;notice.textContent=data.total?'':t('Chưa có phiên bản đã duyệt','尚無已核准版本');paint();}catch(error){fail(error,current);}finally{if(current()){loading=false;paint();}}}
    async function choose(id){if(!live())return;if(busy){choice.value=selected?.id||'';return;}if(id==='__blocked'||id==='__loading')return;if(id==='__more'){choice.value=selected?.id||'';return load();}if(id&&!known.has(id)||id&&!allowed())return;historyDisplayEpoch++;selecting=true;const current=begin();hideWorking();paint();try{notice.textContent=t('Đang tải…','載入中…');if(!id){const permission=await client.permissions({isCurrent:current,requireAcceptedAccess:true});if(!current())return;authority(permission);selected=null;blocked=false;selecting=false;restoreWorking();notice.textContent='';paint();bind();return;}
      const result=await client.approvedVersion(id,{isCurrent:current});if(!current())return;authority(result);const value=result.version;if(result.approvedOnly!==true||!validRow(value)||value.id!==id||!Array.isArray(value.snapshot?.errors)||!value.snapshot.errors.every(row=>row&&typeof row==='object'&&!Array.isArray(row))||!Array.isArray(value.snapshot?.items)||!value.snapshot.items.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&(!row.mediaItems||Array.isArray(row.mediaItems)&&row.mediaItems.every(photo=>photo&&typeof photo==='object'))))throw Error('APPROVED_HISTORY_INVALID');selected=copy(value);blocked=false;notice.textContent='';paint();paintSnapshot();
    }catch(error){if(current()&&!selected){blocked=true;hideWorking();}fail(error,current);}finally{if(current()){loading=false;selecting=false;paint();}}}
    choice.onchange=()=>choose(choice.value);choice.onfocus=()=>{if(!loaded)return load();};paint();
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
        <div class="ipqcc-header-actions"><button type="button" id="ipqcc-legacy-receipts" class="button ghost">${t('Biên nhận thao tác cũ','舊操作收據')}</button><span>${t('Nội dung đang làm','目前工作內容')}</span>
          ${v ? `<span class="ipqcc-state">V${v.number} · ${h(status(v.status))}</span>`:''}
          ${!open() && operationAllowed('edit') ? `<button class="button signal" id="ipqcc-begin">${t('Bắt đầu sửa','開始修改')}</button>`:''}
          ${draftOpen() && operationAllowed('save') && (control?.workflow||operationAllowed('edit')) ? `<button class="button ghost" id="ipqcc-save" ${busy?'disabled':''}>${t('Lưu','存取')}</button>`:''}
          ${draftOpen() && operationAllowed('submit') && (control?.workflow||operationAllowed('edit')) ? `<button class="button signal" id="ipqcc-submit" ${busy?'disabled':''}>${t('Gửi duyệt','送出審核')}</button>`:''}
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
              <p><b>${t('Dụng cụ / thiết bị','工具／設備')}</b><span data-i18n-skip="true">${formatted(h(i.tool))}</span></p>${equipmentDetailHTML(i)}<p><b>${t('Phương pháp','方法')}</b><span data-i18n-skip="true">${formatted(h(i.method))}</span></p><p><b>CPK</b>${i.cpkEnabled?t('Bật','啟用'):t('Không','關閉')}</p>
              </div></details>`).join('') || `<p class="ipqcc-empty">${t('Chưa có hạng mục','尚無檢查項目')}</p>`) : `<p class="ipqcc-empty">${t('Chọn mã lỗi để xem hạng mục','選擇錯誤代碼查看項目')}</p>`}
          </section></div></div></div><details class="ipqcc-history"><summary>${t('Lịch sử và nguồn dữ liệu','歷程與資料來源')}</summary><p>${t('Nguồn','來源')}: ${h(control?.source?.fileName || '—')} · SHA-256 ${h(control?.source?.sha256 || '—')}</p>${(v.history||[]).slice().reverse().map(event=>`<p>${h(event.action)} · ${h(event.actorName)} · ${h(date(event.at))} ${h(event.comment||'')}</p>`).join('')}</details>`}
      ${modal ? editorHTML():''}${picker ? equipmentPickerHTML():''}${viewer?viewerHTML():''}
    </section>`;
  }
  function draw() {
    const content = document.querySelector('#data-content');
    if (host !== content || !content?.isConnected || content.dataset.activeTab !== 'quality-ipqc-c') return;
    retireApprovedHistory();
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
    window.VersionDraftUI?.mount(host,{header:'.ipqcc-header',historyClient:sharedTransport,mountApprovedHistory,module:'IPQC-C',scope:t('Toàn bộ IPQC-C','IPQC-C 全庫'),version:version(),versions:control?.versions,active:control?.versions.find(v=>v.id===control.activeVersionId),flow:control?.workflow,localUnsaved:!!localChanges.length||!!modal?.dirty,busy,failed:sharedClient?.hasUnknown(),actions:{begin:'#ipqcc-begin',save:'#ipqcc-save',submit:'#ipqcc-submit',withdraw:'#ipqcc-withdraw'},review:()=>{state.view='approval';state.approvalTab='quality';window.render();},errors:'[data-shared-issue-kind="error"]',missing:'.ipqcc-pending,[data-shared-issue-kind="missing"]',checked:{missing:true},history:['.ipqcc-history','#ipqcc-case-history','[data-shared-issue-kind="warning"]'],status:['#ipqcc-shared-status'],remove:['.ipqcc-meta']});
    const saveButton=host?.querySelector('#ipqcc-save');if(saveButton)saveButton.textContent=t('Lưu','存取');
    if(focusId){const field=document.getElementById(focusId);field?.focus({preventScroll:true});if(field?.setSelectionRange&&Number.isInteger(selectionStart))try{field.setSelectionRange(selectionStart,selectionEnd);}catch{/* Non-text controls have no selection range. */}}
    if (scroll) window.scrollTo(0,scroll);
  }
  function refreshProducts() {
    const results = host?.querySelector('#ipqcc-product-results');
    if (results) results.innerHTML = productRows();
  }
  async function upload(file) {
    const owner=editorOwner(),displayEpoch=historyDisplayEpoch,current=()=>owner()&&historyDisplayEpoch===displayEpoch&&operationAllowed('edit');
    if(!current())throw Error('FORBIDDEN');
    if (!file || file.size > 5_000_000) throw Error(t('Ảnh tối đa 5 MB','圖片限 5 MB'));
    const response = await fetch(`${API}/photo`, { method:'PUT', headers:{...headers(),'Content-Type':file.type}, body:file });
    if(!current())throw Error('IPQCC_READ_SUPERSEDED');
    const body = await response.json().catch(() => ({}));
    if(!current())throw Error('IPQCC_READ_SUPERSEDED');
    if (!response.ok || !/^[a-f0-9]{64}$/.test(body.id || '')) throw Error(body.error || t('Tải ảnh thất bại','圖片上傳失敗'));
    return body.id;
  }
  function startEditor(kind, existing = null, readonly = false) {
    if(!historyAllowsMutation())return;
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
      photos: kind === 'item' ? copy(existing?.mediaItems || []) : [], pendingInsert:null, dirty:false, readonly, recoveryOwned:editorOwner() };
    picker = null;
    draw();
    const body = host.querySelector('#ipqcc-editor .ipqcc-dialog-body');
    if (body) body.scrollTop = 0;
    if (!readonly) host.querySelector('.ipqcc-dialog input:not([readonly]),.ipqcc-dialog textarea')?.focus({preventScroll:true});
  }
  function closeEditor(force = false, redraw = true) {
    if(!force&&!historyAllowsMutation())return;
    if (modal?.dirty && !force && !confirm(t('Bỏ thay đổi chưa lưu?','放棄尚未儲存的修改？'))) return;
    modal?.photos.forEach(photo => { if (photo.preview && ![...localPhotos.values()].some(p=>p.preview===photo.preview)) URL.revokeObjectURL(photo.preview); });
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
      </fieldset></div><footer><button type="button" id="ipqcc-cancel" class="button ghost">${modal.readonly?t('Đóng','關閉'):t('Hủy','取消')}</button>${modal.readonly?'':`<button type="submit" class="button signal" ${busy?'disabled':''}>${t('Xong','完成')}</button>`}</footer></form></div>`;
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
      for(const photo of photos)if(photo.file){const id=photo.id||'photo-local-'+crypto.randomUUID();localPhotos.set(id,{file:photo.file,preview:photo.preview});photo.id=id;delete photo.file;}
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
  let currentBinding=null;
  function bind() {
    const root = host?.querySelector('#ipqcc-page'); if (!root) return;
    currentBinding?.();const listeners=[];currentBinding=()=>{for(const [node,type,callback]of listeners)node.removeEventListener?.(type,callback);};
    const listen=(node,type,callback)=>{if(node){node.addEventListener(type,callback);listeners.push([node,type,callback]);}};
    const boundOwner=editorOwner(),boundDisplayEpoch=historyDisplayEpoch,current=()=>boundDisplayEpoch===historyDisplayEpoch&&boundOwner()&&root===host?.querySelector('#ipqcc-page')&&historyAllowsMutation();
    const guard=callback=>function(event){if(!current())return;return callback.call(this,event);};
    listen(root.querySelector('#ipqcc-legacy-receipts'),'click',guard(()=>{const owned=editorOwner();void openLegacyReceipts().catch(error=>{if(owned()){message=error.message;draw();}});}));
    listen(root.querySelector('#ipqcc-begin'),'click',guard(()=>write('begin')));
    listen(root.querySelector('#ipqcc-save'),'click',guard(()=>write('save',{snapshot:working})));
    listen(root.querySelector('#ipqcc-submit'),'click',guard(()=>void write('submit')));
    listen(root.querySelector('#ipqcc-withdraw'),'click',guard(()=>write('withdraw')));
    for(const [selector,retry] of [['#ipqcc-check-operation',false],['#ipqcc-retry-operation',true]])listen(root.querySelector(selector),'click',guard(async()=>{
      if(busy)return;await checkPreviousOperation(retry);
    }));
    listen(root.querySelector('#ipqcc-reload'),'click',guard(async()=>{
      if(conflict?.localSave){
        const rejected=conflict,client=sharedClient;
        if(busy||modal||!rejected.owns()||client.hasUnknown())return;
        const priorControl=control,priorRevision=revision;
        const current=()=>conflict===rejected&&sharedClient===client&&rejected.owns();
        if(!confirm(t('Bỏ phần nhập chưa lưu và tải phiên bản mới?','放棄尚未儲存的輸入並載入最新版？')))return;
        if(!current()||control!==priorControl||revision!==priorRevision)return;
        busy=true;
        try{
          // Read owns the actor, delivery, revision and local input until adoption.
          // Do not erase local edits if either permissions or the read fails.
          await read(true,()=>current()&&control===priorControl&&revision===priorRevision);
          if(!current())return;
          clearLocal();working=open()?.status==='draft'?copy(open().snapshot):null;
          conflict=null;message='';syncSelection();
        }catch(error){if(!isReadSuperseded(error)&&current())message=error.message;}
        finally{if(current()||conflict===null&&sharedClient===client){busy=false;draw();}}
        return;
      }
      if(!confirm(t('Bỏ phần nhập chưa lưu và tải phiên bản mới?','放棄尚未儲存的輸入並載入最新版？')))return;
      conflict=null;modal=null;working=null;selectedVersionId='';message='';
      try{await read(false);draw();}catch(error){if(isReadSuperseded(error))return;message=error.message;draw();}
    }));
    bindReadRetry(root);
    const searchBox=root.querySelector('#ipqcc-search');
    listen(searchBox,'input',guard(event=>{ search=event.target.value; if(!event.isComposing) refreshProducts(); }));
    listen(searchBox,'compositionend',guard(event=>{ search=event.target.value; refreshProducts(); }));
    listen(root,'click', guard(async event => {
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
    }));
    listen(root.querySelector('#ipqcc-editor'),'submit',guard(submitEditor));
    listen(root.querySelector('#ipqcc-equipment-search'),'input',guard(event=>{picker.query=event.target.value;filterEquipment();}));
    root.querySelectorAll('[data-ipqcc-filter]').forEach(select=>select.onchange=guard(()=>{
      const field=select.dataset.ipqccFilter;picker[field]=select.value;
      if(field==='category'){picker.subcategory='';picker.group='';}
      if(field==='subcategory')picker.group='';
      draw();
    }));
    filterEquipment();
    listen(root.querySelector('#ipqcc-editor'),'input',guard(event=>{
      if(!modal)return;modal.dirty=true;
      if(event.target.dataset.photoNote!==undefined) modal.photos[Number(event.target.dataset.photoNote)].note=event.target.value;
      else if(event.target.dataset.photoPosition!==undefined) modal.photos[Number(event.target.dataset.photoPosition)].afterParagraph=Number(event.target.value);
      else if(event.target.name) modal.fields[event.target.name]=event.target.type==='checkbox'?event.target.checked:event.target.value;
    }));
    listen(root.querySelector('#ipqcc-editor'),'change',guard(event=>{
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
    }));
    listen(root.querySelector('#ipqcc-photo-input'),'change',guard(event=>{
      if(!modal)return;
      if(!event.target.files.length){modal.pendingInsert=null;return;}
      if(modal.pendingInsert?.description!==null&&modal.pendingInsert?.description!==undefined)
        modal.fields.description=modal.pendingInsert.description;
      const afterParagraph=modal.pendingInsert?.afterParagraph ?? paragraphs(modal.fields.description).length;
      for(const file of event.target.files) modal.photos.push({id:'',name:file.name,note:'',afterParagraph,file,preview:URL.createObjectURL(file)});
      modal.pendingInsert=null;
      modal.dirty=true;draw();
    }));
  }
  async function mount(element) {
    retireApprovedHistory(false);const sequence=++mountSequence;clearLocal();
    const current=()=>sequence===mountSequence&&host===element;
    host=element;navigationError=null; message=''; conflict=null; modal=null; caseHistory=null; host.innerHTML=`<section class="ipqcc-page"><p>${t('Đang tải IPQC-C…','正在載入 IPQC-C…')}</p></section>`;
    try { await read(false,current,true);if(!current())return;draw(); } catch(error) {if(!current()||isReadSuperseded(error))return;navigationError=error;message=error.message; host.innerHTML=`<section class="ipqcc-page"><p role="alert">${h(displayDraftError(message))}</p><button type="button" class="button signal" id="ipqcc-load-retry">${t('Tải lại dữ liệu','重新載入資料')}</button></section>`;host.querySelector('#ipqcc-load-retry').onclick=()=>mount(element); }
  }
  function pendingCount() { return control?.versions.filter(v=>v.status==='pending').length||0; }
  function reviewHTML() { if(readAccessBlocked())return `<section class="ipqcc-review">${readBlockedHTML()}</section>`;return `<section class="ipqcc-review"><h3>IPQC-C · ${t('Chờ duyệt','待審')}</h3><div class="ipqcc-review-body">${t('Đang tải…','載入中…')}</div></section>`; }
  async function bindReview(panel) {
    reviewHost=panel?.querySelector('.ipqcc-review');if(!reviewHost)return;
    const target=reviewHost,delivery=window.ProcessSync?.captureDelivery?.(),owns=()=>reviewHost===target&&target.isConnected&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));
    try { await read(false,owns);if(owns())reviewDraw(); } catch(error) {if(owns()&&!isReadSuperseded(error)){navigationError=error;if(readAccessBlocked()){target.innerHTML=readBlockedHTML();bindReadRetry(target);}else target.querySelector('.ipqcc-review-body').textContent=displayDraftError(error);}}
  }
  function reviewDraw() {
    if(!reviewHost?.isConnected)return;
    if(readAccessBlocked()){reviewHost.innerHTML=readBlockedHTML();bindReadRetry(reviewHost);return;}
    const restoreView=window.VersionDraftUI.preserveView(reviewHost);
    const comments=new Map([...reviewHost.querySelectorAll('[data-ipqcc-review-comment]')].map(input=>[input.dataset.ipqccReviewComment,input.value]));
    const focused=document.activeElement?.dataset?.ipqccReviewComment,caret=document.activeElement?.selectionStart;
    const pending=control?.versions.filter(v=>v.status==='pending')||[];
    // Current pending reviews are operational, not selectable historical drafts.
    const cases=pending;
    reviewHost.querySelector('.ipqcc-review-body').innerHTML=cases.length?cases.map(v=>{
      const base=control.versions.find(x=>x.id===v.baseVersionId);
      const fixed=control.workflow?.cases?.find(row=>row.id===v.id);
      const before=fixed?.before||base?.snapshot||(!v.baseVersionId?{errors:[],items:[]}:null),after=v.snapshot;
      const comparison=caseComparison(before,after);
      return `<article class="vd-review-case"><details data-case-id="${h(v.id)}"><summary><b>IPQC-C · V${v.number} · ${status(v.status)}</b> · ${t('Xem nội dung','展開內容')}</summary><p>${t('Người sửa','修改者')} ${h(v.creatorName)} · ${t('Gửi duyệt','送審')} ${h(date(v.submittedAt))}${v.reviewedBy?`<br>${t('Người duyệt','確認者')} ${h(v.reviewedBy)} · ${h(date(v.reviewedAt))}`:''}${v.reviewComment?`<br>${t('Ý kiến','意見')} ${h(v.reviewComment)}`:''}</p>
        ${comparison?`<p>${t('Mã lỗi','錯誤代碼')} ${comparison.errorsBefore} → ${comparison.errorsAfter} · ${t('Hạng mục','檢查項目')} ${comparison.itemsBefore} → ${comparison.itemsAfter} · ${t('Thay đổi','變動')} ${comparison.changed}</p>`:`<p>${t('Chưa tải bản gốc; xem hồ sơ cố định để đối chiếu.','基準版尚未載入，請查看固定案件核對。')}</p>`}
        <details><summary>${t('Xem thay đổi và lịch sử','查看差異與歷程')}</summary>${(comparison?.changedItems||[]).slice(0,100).map(item=>`<p><code>${h(item.code)}</code> · ${h(item.standard)} · ${item.mediaItems.length} ${t('ảnh','張圖')}</p>`).join('')}${v.history.map(event=>`<p>${h(event.action)} · ${h(event.actorName)} · ${h(date(event.at))}</p>`).join('')}</details>
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
    if(approvedHistoryView?.blocked){approvedHistoryView.relabel();return;}
    if(modal?.dirty){const form=host?.querySelector('#ipqcc-editor');if(form){for(const [key,value] of new FormData(form)) modal.fields[key]=value;}}
    retireApprovedHistory(false);draw();reviewDraw();
  });
  window.addEventListener('keydown',event=>{
    if(approvedHistoryView&&host?.querySelector('[data-ipqcc-approved-view]')?.hidden===false)return;
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
  let moduleDeparture;
  window.IPQCCUI={historyDisplay:{epoch:()=>historyDisplayEpoch,current:historyAllowsMutation},navigation:{get departure(){return moduleDeparture ||= Object.assign(window.VersionDraftUI.createDeparture({
    root:()=>host,flow:()=>control?.workflow,sharedDirty:()=>false,sharedOwned:()=>false,ownsRuntimeLocal:()=>true,
    context:()=>[mountSequence,selectedVersionId,control?.workflow?.generation,operationAllowed('save'),operationAllowed('edit')],
    // This describes permission to browse, never whether a write succeeded.
    // Original transport markers and mutation admission survive navigation.
    current:()=>!readAccessBlocked()&&sharedActor===identity()?.id,busy:()=>busy&&sharedClient?.hasUnknownBegin?.()===true,unknown:()=>sharedClient?.hasUnknownBegin?.()===true,failed:()=>false,
    unknownTransports:()=>[sharedClient],unknownReady:()=>!busy,discardUnknown:()=>{closeEditor(true,false);clearLocal();working=null;},
    local:()=>false,
    canSave:()=>draftOpen()&&operationAllowed('save'),canDiscard:()=>editing(),save:()=>write('save',{snapshot:working}),
    dialogs:()=>[...document.querySelectorAll('.ipqcc-overlay')],
    discard(){closeEditor(true,false);viewer=null;working=open()?.status==='draft'?copy(open().snapshot):null;draw();},
    closeClean(){modal=null;picker=null;clearLocal();viewer=null;working=null;},
  }),{autoAbandon:true});},requiresSave:()=>false,saveForDeparture:()=>write('save',{snapshot:working}),canLeave:()=>true,error:()=>navigationError,reset(){retireApprovedHistory(false);currentBinding?.();currentBinding=null;clearLocal();busy=false;modal=null;picker=null;viewer=null;legacyReceiptSession?.session.close();legacyReceiptSession=null;mountSequence++;saveInputNotice=null;readRecoveryNeeded=false;host=null;reviewHost=null;control=null;revision=null;working=null;catalog={products:[],stages:[]};equipment=[];equipmentGroups=[];equipmentCategories=[];equipmentSubcategories=[];selectedVersionId='';caseHistory=null;navigationError=null;}},html:()=>`<section class="ipqcc-page">${t('Đang tải IPQC-C…','正在載入 IPQC-C…')}</section>`,mount,reviewHTML,bindReview,pendingCount};
})();
