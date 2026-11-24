/* Routine inspection owns one shared draft per document; never writes public state. */
(() => {
  const endpoint = '/api/routine-fqc',
    clone = (x) => JSON.parse(JSON.stringify(x)),
    id = () => crypto.randomUUID();
  const h = (x) =>
    String(x ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c],
    );
  const t = (zh, vi) => (document.documentElement.lang === 'vi' ? vi : zh);
  const labels = {
    pass: ['合格', 'Đạt'],
    fail: ['不合格', 'Không đạt'],
    abnormal: ['異常處理', 'Xử lý bất thường'],
    dispose: ['申請處置（舊制）', 'Đề nghị xử lý (quy trình cũ)'],
    unable: ['無法測試', 'Không thể thử'],
    undetermined: ['無法判定', 'Chưa xác định'],
    draft: ['草稿', 'Bản nháp'],
    pending: ['待審核', 'Chờ duyệt'],
    approved: ['正式核准', 'Đã duyệt'],
    cancelled: ['已捨棄', 'Đã bỏ'],
    open: ['待改善', 'Chờ cải thiện'],
    retest: ['複測中', 'Đang thử lại'],
    'ready-close': ['待確認結案', 'Chờ đóng hồ sơ'],
    closed: ['已結案', 'Đã đóng'],
    disposed: ['處置結案', 'Đã xử lý và đóng'],
    waived: ['本期免做', 'Miễn kỳ này'],
    plan: ['檢查計畫', 'Kế hoạch'],
    report: ['檢查報告', 'Báo cáo'],
    waiver: ['免做申請', 'Đề nghị miễn'],
    disposal: ['處置申請', 'Đề nghị xử lý'],
  };
  const label = (k) => (labels[k] ? t(...labels[k]) : k),
    tag = (k) => `<span class="rf-tag ${h(k)}">${h(label(k))}</span>`;
  Object.assign(labels, {
    unassigned: ['尚未安排', 'Chưa lập kế hoạch'],
    'correction-reopened': [
      '更正後重新確認結案',
      'Xác nhận đóng lại sau chỉnh sửa',
    ],
    unclosed: ['尚未結案', 'Chưa đóng'],
    'closed-failure': ['已結案的不合格紀錄', 'Lịch sử không đạt đã đóng'],
    correct: ['建立更正', 'Tạo bản sửa'],
    'revoke-plan': ['反確認計畫', 'Thu hồi xác nhận kế hoạch'],
    'resolve-impact': ['確認下游影響', 'Xác nhận ảnh hưởng'],
    close: ['確認結案', 'Xác nhận đóng'],
    improve: ['改善紀錄', 'Ghi cải thiện'],
    improvement: ['改善紀錄', 'Ghi cải thiện'],
    'retest-plan-approved': ['補測計畫核准', 'Kế hoạch thử bổ sung đã duyệt'],
  });
  const status = (d) =>
    d.cancelled ? 'cancelled' : d.flow.pendingId
      ? 'pending'
      : d.flow.active.id && !d.reopened
        ? 'approved'
        : 'draft';
  const content = (d) =>
    d.flow.pendingId
      ? d.flow.cases.find((c) => c.id === d.flow.pendingId).content
      : status(d) === 'approved' || d.cancelled?.status === 'approved'
        ? d.flow.active.content
        : d.flow.working;
  const photo = (p) =>
    `<a class="rf-photo" href="${endpoint}/photo?id=${h(p)}" target="_blank" rel="noopener"><img decoding="async" loading="lazy" src="${endpoint}/photo?id=${h(p)}" alt="${h(t('檢查照片', 'Ảnh kiểm tra'))}"></a>`;
  const s = {
    tab: 'sources',
    sourceLine: '', sourceCategory: '', sourceProduct: '',
    periodSearch: '', periodFrom: '', periodTo: '', periodOutcome: '',
    periodExpanded: new Set(), periodMore: new Map(),
    module: 'FQC',
    selected: null,
    checked: new Set(),
    query: '',
    line: '',
    category: '',
    item: '',
    outcome: '',
    review: '',
    caseState: '',
    highlight: '',
    from: '',
    to: '',
    dateMode: 'period',
    buffers: new Map(),
    bufferGenerations: new Map(),
    bases: new Map(),
    issues: [],
    busy: false,
    error: '',
    client: id(),
    seq: 0,
    scroll: 0,
    selectionNotice: '',
    reviewPlatform: false,
    reviewModule: 'FQC',
    documentKind: '',
    workState: '',
    approvedReportQuery: '', approvedReportLimit: 20,
    sampleOpen: new Map(),
    resultOpen: new Map(),
    selfReview: null,
    cancelConfirm: null,
  };
  let root,
    data,
    loading = false, mountOwner = null;
  let historyDisplayEpoch=0,approvedHistoryView=null,historyDocument=null;
  const historyClients=new Map();
  const historyAllowsMutation=()=>!approvedHistoryView?.blocked;
  const assertCurrentDisplay=()=>{if(!historyAllowsMutation())throw Error('APPROVED_HISTORY_READ_ONLY');};
  const captureHistoryDisplay=()=>{const epoch=historyDisplayEpoch,page=root,actor=data?.identity?.id,resetEpoch=window.RoutineReset?.epoch?.('fqc',actor);return()=>resetEpoch===window.RoutineReset?.epoch?.('fqc',actor)&&epoch===historyDisplayEpoch&&page===root&&historyAllowsMutation();};
  function retireApprovedHistory(){historyDisplayEpoch++;approvedHistoryView?.retire();approvedHistoryView=null;historyDocument=null;}
  function guardWorking(node,callback){const current=captureHistoryDisplay();return function(...args){if(!node?.isConnected||!current())return;const result=callback.apply(this,args);if(result&&typeof result.finally==='function')return result.finally(()=>approvedHistoryView?.refreshControls());approvedHistoryView?.refreshControls();return result;};}
  function guardDocumentCallbacks(){for(const node of root?.querySelector('.rf-document')?.querySelectorAll('input,select,textarea,button')||[])for(const property of ['onclick','oninput','onchange','onkeydown','oncompositionstart','oncompositionend'])if(typeof node[property]==='function')node[property]=guardWorking(node,node[property]);}
  function approvedClient(documentId){
    const prior=historyClients.get(documentId);if(prior?.isRuntimeCurrent())return prior;
    const sync=window.ProcessSync,actor=sync?.identity,epoch=sync?.identityGeneration?.(),delivery=sync?.captureDelivery?.(),watchers=new Set();let permissions={...data.permissions,delete:false};
    const current=()=>actor===window.ProcessSync?.identity&&actor?.id===data?.identity?.id&&epoch===window.ProcessSync?.identityGeneration?.()&&!window.ProcessSync?.requiresReload&&window.ProcessSync?.isCurrentDelivery?.(delivery)===true;
    async function get(query,options={}){const owns=()=>current()&&options.isCurrent?.()!==false;if(!owns())throw Error('APPROVED_HISTORY_SUPERSEDED');const params=new URLSearchParams({approvedOnly:'1',documentId,...query});let response,value;
      try{response=await fetch(endpoint+'?'+params,{cache:'no-store',headers:{...window.ProcessSync?.platformHeaders?.(),'X-Process-Expected-Actor':actor.id}});value=await response.json();if(!owns())throw Error('APPROVED_HISTORY_SUPERSEDED');if(!response.ok){if([401,403].includes(response.status)){permissions=Object.fromEntries(Object.keys(permissions).map(key=>[key,false]));for(const watch of watchers)watch();}throw Object.assign(Error(value.error||'FQC_READ_FAILED'),{status:response.status});}if(value.documentId!==documentId||value.actorId!==actor.id)throw Error('APPROVED_HISTORY_AUTHORITY_REQUIRED');permissions={...value.permissions};for(const watch of watchers)watch();return value;}
      catch(error){if(!owns())throw Error('APPROVED_HISTORY_SUPERSEDED');throw error;}
    }
    const client={isRuntimeCurrent:current,permission:key=>permissions[key],watchApprovedAccess(callback){watchers.add(callback);return()=>watchers.delete(callback);},permissions:options=>get({permissions:'1'},options),approvedHistory:(query,options)=>get({uiHistory:'1',...(query?.versionBefore?{versionBefore:query.versionBefore}:{})},options),approvedVersion:(id,options)=>get({versionId:id},options),mediaURL:photo=>{const id=typeof photo==='string'?photo:photo?.id;return /^[a-f0-9]{64}$/.test(id||'')?endpoint+'/photo?id='+id:'';}};
    historyClients.set(documentId,client);return client;
  }
  function mountApprovedHistory(shell,log,empty){
    const d=doc(),page=root,documentRoot=root.querySelector('.rf-document'),client=approvedClient(d.id);historyDocument=d.id;
    approvedHistoryView=window.ProcessCanvasHistory.createApprovedHistory({root:documentRoot,shell,client,empty,selectId:'routine-fqc-approved-version',cacheKey:d.flow.active.id||null,
      isCurrent:()=>root===page&&doc()?.id===d.id&&!s.reviewPlatform&&root.querySelector('.rf-document')===documentRoot,
      canChoose:()=>!s.busy&&!s.dialogOpen&&!inFlightMutation&&!generationRefresh?.current()&&!document.querySelector('.rf-modal[open]'),
      onBoundary(){historyDisplayEpoch++;},renderCurrent(){approvedHistoryView=null;historyDocument=null;paint();},
      validateSnapshot:value=>value&&typeof value.title==='string'&&typeof value.date==='string'&&Array.isArray(value.lines)&&value.lines.every(row=>row&&typeof row==='object'&&Array.isArray(row.results))&&Array.isArray(value.evidence),
      renderSnapshot(target,value,current){const {lines,...document}=value;window.ProcessCanvasHistory.renderApprovedCollections(target,{document:[document],lines:lines.map(window.RoutinePageApprovedHistory.displayLine)},{collections:['document','lines'],fields:{document:['核准文件','Hồ sơ đã duyệt'],title:['文件名稱','Tên hồ sơ'],date:['實際日期','Ngày thực tế'],notes:['備註','Ghi chú'],lines:['原核准項目與結果','Hạng mục và kết quả đã duyệt'],source:['原固定來源','Nguồn cố định'],results:['檢查結果','Kết quả'],evidence:['處置證據','Bằng chứng xử lý'],photos:['歷史照片','Ảnh lịch sử']},mediaFields:['evidence'],mediaURL:photo=>client.mediaURL(photo)},current);}
    });
  }
  const btn = (action, text, disabled = false, extra = '') =>
    `<button type="button" class="rf-btn ${extra}" data-action="${action}" ${disabled ? 'disabled' : ''}>${text}</button>`;
  function receiptFeedback(){
    const pin=receiptPin();
    if(!receiptOwnedPin(pin))return null;
    if(!receiptPresentation&&s.retry&&!receiptInvalid&&!receiptRecord?.terminal&&receiptRecord?.meta.actor===pin.actor&&
      receiptCollapsePreference(receiptRecord)){
      receiptPresentation={key:receiptRecord.key,actor:pin.actor,epoch:pin.epoch,status:'missing',collapsed:true,restored:true};
    }
    const feedback=receiptPresentation;
    if(!feedback||feedback.actor!==pin.actor||feedback.epoch!==pin.epoch)return null;
    if(receiptRecord?.key===feedback.key)return feedback;
    return !s.retry&&['querying','confirmed'].includes(feedback.status)?feedback:null;
  }
  function routineErrorBanner(){
    const feedback=receiptFeedback();
    if(feedback?.status==='confirmed'&&!s.error)
      return `<div class="rf-notice" data-rf-receipt-panel role="status">${t('原操作已確認，已讀取最新資料。','Đã xác nhận thao tác gốc và tải dữ liệu mới nhất.')}</div>`;
    if(!s.error&&!s.retry&&feedback?.status!=='querying')return '';
    const meta=receiptRecord?.meta;
    const reference=s.retry&&meta&&data?.identity?.id===meta.actor&&receiptOwnedPin(receiptPin())
      ? `<small class="rf-receipt-reference">${t('原操作編號','Mã thao tác gốc')} · <code>${h(meta.operationId)}</code></small>` : '';
    const minimize=feedback?.status==='missing';
    if(minimize&&feedback.collapsed)
      return `<section class="rf-notice rf-receipt-compact" data-rf-receipt-panel aria-label="${t('FQC 操作待查證','Thao tác FQC cần xác minh')}"><span role="status">${t('有 1 筆操作待查證','Có 1 thao tác cần xác minh')}</span><button type="button" class="rf-btn" data-action="receipt-show" aria-expanded="false">${t('查看','Xem')}</button>${reference}</section>`;
    const expanding=minimize?`<button type="button" class="rf-btn" data-action="receipt-minimize" aria-expanded="true">${t('稍後查證／收起提示','Xác minh sau / Thu gọn')}</button>`:'';
    const retire=minimize&&receiptRecord?.meta.action==='draft'&&['apply','save','submit'].includes(receiptRecord.meta.innerAction)?btn('reconcile-draft',t('核對最新文件並處理舊請求','Đối chiếu hồ sơ và xử lý yêu cầu cũ')):minimize&&receiptRecord?.meta.action==='create-plan'&&receiptRecord.meta.operationId.startsWith('plan-fqc-')?btn('recover-plan',t('查證或終止這筆建計畫','Kiểm tra hoặc dừng yêu cầu lập kế hoạch này')):minimize&&recoverableFirstStart()?btn('retire-first-start',t('處理未確認的首次啟動','Xử lý lần khởi động đầu chưa xác nhận')):'';
    const lookup=s.retry?btn('retry',t('查原操作收據（不重送）','Kiểm tra biên nhận (không gửi lại)')):'';
    let message=s.error||(receiptInvalid?receiptStorageNotice():receiptNotice());
    switch(feedback?.status){
      case 'querying': message=t('正在查詢原操作收據…','Đang tra biên nhận gốc…'); break;
      case 'missing': message=feedback.restored?
        t('上次查無原操作收據，寫入結果仍待確認。可再查詢原收據，不會重送。','Lần trước chưa tìm thấy biên nhận gốc; kết quả ghi vẫn chưa rõ. Có thể tra lại mà không gửi lại.'):
        receiptMissingNotice(); break;
      case 'readback': message=receiptReadbackNotice(); break;
      case 'failed': message=t('收據查詢失敗，原操作仍待查證。請稍後再查詢，不會重送。','Không thể tra biên nhận; thao tác gốc vẫn cần xác minh. Tra lại sau, không gửi lại.'); break;
    }
    return `<div class="rf-notice ${feedback?.status==='querying'?'':'error'}" data-rf-receipt-panel><span role="${s.retry||feedback?.status==='querying'?'status':'alert'}">${h(message)}</span> ${lookup}${retire}${expanding}${reference}</div>`;
  }
  function html() {
    return '<section id="routine-fqc-root" class="rf-app" data-i18n-skip="true"><div class="rf-empty" role="status">FQC · 載入中 / Đang tải…</div></section>';
  }
  // Only operation references are durable. Local report/plan/media buffers stay
  // in RAM; this namespace never contains a command, patch, reason or header.
  const routineReceiptPrefix='routine-fqc-receipt-v1:',receiptRuntime=id();
  const receiptActions=['queue','request','configure','generate','create-plan','create-report','draft','improve','followup','close','revoke-plan','discard-draft','delete-plan','restore-document','correct','resolve-impact'];
  const receiptDraftActions=['apply','restore','save','submit','approve','return','withdraw'];
  const receiptUUID=v=>typeof v==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v);
  const receiptText=v=>typeof v==='string'&&v.length>0&&v.length<=200;
  const receiptInt=v=>Number.isSafeInteger(v)&&v>=0;
  const receiptNullable=v=>v===null||receiptText(v);
  const receiptNotice=()=>t('有寫入結果待確認；請查原操作收據，不會重送。未送出的內容只保留在目前頁面。','Có kết quả ghi cần xác minh; kiểm tra biên nhận gốc, không gửi lại. Nội dung chưa gửi chỉ còn trong trang này.');
  const receiptMissingNotice=()=>t('目前查無原操作收據，寫入結果仍待確認。請保留原分頁，稍後可再查詢，不會重送。','Chưa tìm thấy biên nhận gốc, kết quả ghi chưa rõ. Giữ trang hiện tại và tra lại sau, không gửi lại.');
  const receiptReadbackNotice=()=>t('原操作收據已確認，最新文件狀態仍須核對。保留原輸入，請再查詢收據，不會重送。','Đã xác nhận biên nhận gốc; vẫn cần đối chiếu hồ sơ mới nhất. Đầu vào được giữ lại. Kiểm tra biên nhận, không gửi lại.');
  const receiptStorageNotice=()=>t('本機操作收據儲存不可用或已損壞；可閱讀，暫停新寫入，原資料不會刪除。','Kho biên nhận cục bộ không khả dụng hoặc hỏng; vẫn đọc được, tạm dừng ghi mới, không xóa dữ liệu cũ.');
  let receiptRecord=null,receiptInvalid=false,receiptLifecycle=0,receiptSuspended=false;
  // A user can retain the compact view of the last missing lookup. This preference
  // is separate from the original receipt and does not alter the write fence.
  let receiptPresentation=null;
  function receiptPin(actor=data?.identity?.id||window.ProcessSync?.identity?.id){const sync=window.ProcessSync;return {actor,epoch:sync?.identityGeneration?.(),delivery:sync?.captureDelivery?.(),page:root,life:receiptLifecycle,resetEpoch:window.RoutineReset?.epoch?.('fqc',actor)};}
  function receiptCurrent(pin){const sync=window.ProcessSync;return pin.resetEpoch===window.RoutineReset?.epoch?.('fqc',pin.actor)&&!receiptSuspended&&pin.life===receiptLifecycle&&pin.page===root&&receiptText(pin.actor)&&(!data?.identity||data.identity.id===pin.actor)&&(!sync?.identity||sync.identity.id===pin.actor)&&!sync?.requiresReload&&pin.epoch===sync?.identityGeneration?.()&&(!pin.delivery||typeof sync?.isCurrentDelivery==='function'&&sync.isCurrentDelivery(pin.delivery)===true);}
  function receiptOwnedPin(pin){const sync=window.ProcessSync;return receiptCurrent(pin)&&sync?.identity?.id===pin.actor&&receiptInt(pin.epoch)&&pin.delivery!==null&&pin.delivery!==undefined&&typeof sync?.isCurrentDelivery==='function'&&sync.isCurrentDelivery(pin.delivery)===true;}
  function receiptStore(){const storage=window.localStorage;if(!storage||!Number.isSafeInteger(storage.length)||storage.length<0||typeof storage.key!=='function')throw Error('ROUTINE_RECEIPT_STORAGE_UNAVAILABLE');return storage;}
  function receiptCollapsePreference(record,collapsed){
    const key='routine-fqc-receipt-collapsed-v1:'+record.key;
    try{
      const storage=receiptStore();
      if(collapsed===undefined)return storage.getItem(key)==='missing';
      if(collapsed)storage.setItem(key,'missing');
      else if(storage.getItem(key)!==null)storage.removeItem(key);
    }catch{/* Presentation can still change in this page. */}
    return false;
  }
  const receiptActorPrefix=actor=>routineReceiptPrefix+encodeURIComponent(actor)+':';
  function receiptValid(meta,key){
    if(!meta||Object.getPrototypeOf(meta)!==Object.prototype||Object.keys(meta).sort().join(',')!=='action,actor,aggregateRevision,caseId,documentId,documentRevision,endpoint,epoch,generation,globalRevision,innerAction,operationId,pendingId,protocol,requestedRevision,restoreSaveId,runtime,savedId,submitSavedId')return false;
    if(meta.protocol!==1||meta.endpoint!==endpoint||!receiptText(meta.actor)||!receiptUUID(meta.runtime)||typeof meta.operationId!=='string'||!/^[-\w]{8,100}$/.test(meta.operationId)||!receiptActions.includes(meta.action)||!receiptInt(meta.aggregateRevision)||!receiptInt(meta.globalRevision)||!(meta.epoch===null||receiptInt(meta.epoch))||key!==receiptActorPrefix(meta.actor)+meta.runtime+':'+meta.operationId)return false;
    if(!['documentId','generation','caseId','savedId','pendingId','submitSavedId','restoreSaveId'].every(k=>receiptNullable(meta[k]))||!(meta.requestedRevision===null||receiptInt(meta.requestedRevision)))return false;
    return meta.action==='draft'?receiptText(meta.documentId)&&receiptText(meta.generation)&&receiptInt(meta.documentRevision)&&receiptDraftActions.includes(meta.innerAction):meta.innerAction===null&&meta.documentRevision===null&&meta.generation===null;
  }
  function receiptRetry(meta){return {action:meta.action,operationId:meta.operationId,...(meta.documentId?{documentId:meta.documentId}:{}),...(meta.innerAction?{command:{action:meta.innerAction,operationId:meta.operationId,generation:meta.generation}}:{})};}
  function receiptDiscover(actor){
    const storage=receiptStore(),prefix=receiptActorPrefix(actor),keys=[];if(storage.length>10000)throw Error('ROUTINE_RECEIPT_STORAGE_INVALID');
    // Discover only keys first; other-account values are never read.
    for(let i=0;i<storage.length;i++){const key=storage.key(i);if(typeof key!=='string')throw Error('ROUTINE_RECEIPT_STORAGE_INVALID');if(key.startsWith(prefix))keys.push(key);}
    keys.sort();const records=[];
    for(const key of keys){const raw=storage.getItem(key);if(typeof raw!=='string'||raw.length>4096)throw Error('ROUTINE_RECEIPT_STORAGE_INVALID');let meta;try{meta=JSON.parse(raw);}catch{throw Error('ROUTINE_RECEIPT_STORAGE_INVALID');}if(!receiptValid(meta,key)||meta.actor!==actor)throw Error('ROUTINE_RECEIPT_STORAGE_INVALID');records.push({key,raw,meta,ram:null,terminal:null,pin:null,confirmed:null});}
    return records;
  }
  const parkedReceipts=new Map();
  let activeDeliveries=0;
  function independentReferences(command,records){
    if(!records.length||records.length>32||command.action!=='draft'||!['save','submit'].includes(command.command?.action))return null;
    const refs=[];
    for(const {meta} of records){
      if(meta.action!=='draft'||!['apply','save','submit'].includes(meta.innerAction)||
        meta.documentId===command.documentId||meta.operationId===command.operationId)return null;
      refs.push({documentId:meta.documentId,generation:meta.generation,action:meta.innerAction,operationId:meta.operationId});
    }
    return refs;
  }
  function receiptInstall(actor){
    if(receiptRecord&&receiptRecord.meta.actor!==actor){parkedReceipts.clear();receiptPresentation=null;receiptRecord=null;s.retry=null;s.retryOwner=null;s.retryDeparture=null;}
    try{const records=receiptDiscover(actor);if(receiptRecord&&!records.some(row=>row.key===receiptRecord.key&&row.raw===receiptRecord.raw)&&receiptStore().getItem(receiptRecord.key)!==null)throw Error('ROUTINE_RECEIPT_STORAGE_CHANGED');receiptInvalid=false;
      if(!receiptRecord){receiptRecord=records[0]||null;s.retry=receiptRecord?(receiptRecord.ram||receiptRetry(receiptRecord.meta)):null;s.retryOwner=null;s.retryDeparture=null;}
    }catch(error){receiptInvalid=true;if(!s.retry)s.retry={action:'receipt-unavailable'};throw error;}
  }
  function receiptWriteAllowed(body){const action=body.action==='draft'?(['apply','restore'].includes(body.command?.action)?'edit':body.command?.action):['close','resolve-impact'].includes(body.action)?'approve':'edit';return data?.permissions?.view===true&&data.permissions[action]===true;}
  function receiptCreate(body,pin){
    const flow=data?.control?.documents?.find(d=>d.id===body.documentId)?.flow,command=body.command;
    const meta={protocol:1,endpoint,actor:pin.actor,runtime:receiptRuntime,epoch:receiptInt(pin.epoch)?pin.epoch:null,operationId:body.operationId,action:body.action,documentId:body.documentId||null,innerAction:body.action==='draft'?command?.action:null,generation:body.action==='draft'?command?.generation:null,documentRevision:body.action==='draft'?flow?.revision:null,aggregateRevision:data?.control?.revision,globalRevision:data?.revision,caseId:command?.caseId||body.caseId||null,savedId:flow?.saved?.id||null,pendingId:flow?.pendingId||null,submitSavedId:command?.savedId||null,restoreSaveId:command?.restoreSaveId||null,requestedRevision:command?.expectedRevision??body.expectedRevision??null};
    const key=receiptActorPrefix(pin.actor)+receiptRuntime+':'+body.operationId,raw=JSON.stringify(meta);
    if(!receiptValid(meta,key)||raw.length>4096||body.action==='draft'&&(command.operationId!==body.operationId||flow?.scope!=='routine-fqc:'+body.documentId||flow.generation!==command.generation))throw Error('ROUTINE_RECEIPT_METADATA_INVALID');
    if(!receiptOwnedPin(pin))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
    const record={key,raw,meta,ram:body,pin,terminal:null,confirmed:null,notSent:true,rejectedCode:null};receiptPresentation=null;receiptRecord=record;s.retry=body;s.retryOwner=()=>receiptCurrent(pin);
    const storage=receiptStore();if(storage.getItem(key)!==null)throw Error('ROUTINE_RECEIPT_STORAGE_CHANGED');storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error('ROUTINE_RECEIPT_STORAGE_UNVERIFIED');
    if(!receiptOwnedPin(pin))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');return record;
  }
  function receiptTerminal(record,envelope,pin){
    if(!receiptOwnedPin(pin)||record!==receiptRecord)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
    const m=record.meta,r=envelope?.result;if(!Object.hasOwn(envelope||{},'result')||!receiptInt(envelope.revision)||envelope.revision<=m.aggregateRevision||!r||typeof r!=='object'||Array.isArray(r))throw Error('INVALID_OPERATION_RECEIPT');
    if(m.action==='draft'){
      const review=['approve','return','withdraw'].includes(m.innerAction);
      if(r.operationId!==m.operationId||!receiptText(r.generation)||(!review&&r.generation!==m.generation)||(review&&r.generation===m.generation)||!receiptInt(r.revision)||typeof r.unchanged!=='boolean'||!receiptNullable(r.savedId)||!receiptNullable(r.caseId)||r.revision<m.documentRevision+(r.unchanged?0:1)||(['submit','approve','return','withdraw'].includes(m.innerAction)&&r.unchanged))throw Error('INVALID_OPERATION_RECEIPT');
      if(['save','submit','restore'].includes(m.innerAction)&&m.requestedRevision!==null&&r.revision!==m.requestedRevision+(r.unchanged?0:1))throw Error('INVALID_OPERATION_RECEIPT');
      if(m.innerAction==='submit'?(r.savedId!==m.submitSavedId||!receiptText(r.caseId)):r.caseId!==null)throw Error('INVALID_OPERATION_RECEIPT');
      if(m.innerAction==='approve'?r.savedId!==null:m.innerAction==='save'?!receiptText(r.savedId)||(r.unchanged&&r.savedId!==m.savedId):m.innerAction!=='submit'&&(m.innerAction!=='apply'||r.revision===m.documentRevision+(r.unchanged?0:1))&&r.savedId!==m.savedId)throw Error('INVALID_OPERATION_RECEIPT');
    }else if(['request','create-plan','create-report','followup','correct','discard-draft','delete-plan'].includes(m.action)){
      if(!receiptText(r.documentId)||['discard-draft','delete-plan'].includes(m.action)&&r.documentId!==m.documentId)throw Error('INVALID_OPERATION_RECEIPT');
    }else if(m.action==='generate'?!(receiptInt(r.generated)||r.ok===true):r.ok!==true)throw Error('INVALID_OPERATION_RECEIPT');
    record.terminal={result:clone(r),aggregateRevision:envelope.revision,pin};return r;
  }
  function receiptClear(record,pin){
    if(!receiptOwnedPin(pin)||record!==receiptRecord)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
    const storage=receiptStore(),raw=storage.getItem(record.key);if(raw!==null&&raw!==record.raw)throw Error('ROUTINE_RECEIPT_STORAGE_CHANGED');if(raw!==null)storage.removeItem(record.key);if(storage.getItem(record.key)!==null)throw Error('ROUTINE_RECEIPT_CLEANUP_FAILED');
    receiptCollapsePreference(record,false);
    // A failed next-key discovery must keep the global unknown gate closed.
    let remaining;try{remaining=receiptDiscover(pin.actor);}catch(error){receiptRecord=null;receiptInvalid=true;s.retry={action:'receipt-unavailable'};throw error;}
    if(!receiptOwnedPin(pin))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
    record.confirmed?.(record.terminal?.result);parkedReceipts.delete(record.key);
    const next=remaining[0],held=next&&parkedReceipts.get(next.key);
    receiptRecord=held&&held.raw===next.raw?held:next||null;receiptInvalid=false;s.retry=receiptRecord?(receiptRecord.ram||receiptRetry(receiptRecord.meta)):null;s.retryOwner=null;s.retryDeparture=null;
  }
  function receiptSubmissionReviewed(meta,receipt,flow){
    if(meta.innerAction!=='submit'||!receiptText(receipt.savedId)||flow.revision<=receipt.revision||
      flow.pendingId===receipt.caseId||!Array.isArray(flow.cases))return false;
    // The matching, fixed submission in the fresh document proves that a
    // normal review advanced the generation. Other writes keep the strict fence.
    return flow.cases.some(row=>row.id===receipt.caseId&&row.savedId===receipt.savedId&&row.actor?.id===meta.actor&&
      ['approved','returned','withdrawn'].includes(row.status)&&receiptText(row.result?.actor?.id)&&
      typeof row.result?.at==='string'&&Number.isFinite(Date.parse(row.result.at)))===true;
  }
  function receiptObserveRead(next,pin){
    if(!receiptCurrent(pin)||next?.identity?.id!==pin.actor||next.permissions?.view!==true)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
    try{receiptInstall(pin.actor);}catch(error){s.error=receiptStorageNotice();if(receiptRecord?.terminal)throw error;return;}
    const record=receiptRecord,terminal=record?.terminal;if(!terminal)return;
    const m=record.meta,r=terminal.result,flow=next.control?.documents?.find(d=>d.id===m.documentId)?.flow;
    if(!receiptOwnedPin(terminal.pin)||!receiptInt(next.revision)||next.revision<=m.globalRevision||next.revision<(data?.revision||0)||!receiptInt(next.control?.revision)||next.control.revision<terminal.aggregateRevision||next.control.revision<(data?.control?.revision||0))throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
    if(m.action==='draft'){
      const scope='routine-fqc:'+m.documentId;
      if(!flow||flow.scope!==scope||!receiptText(flow.generation)||!receiptInt(flow.revision)||flow.revision<r.revision)
        throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
      const reviewed=flow.generation!==r.generation&&receiptSubmissionReviewed(m,r,flow);
      if(flow.generation!==r.generation&&!reviewed)throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
      const live=data?.control?.documents?.find(d=>d.id===m.documentId)?.flow;
      if(!live||live.scope!==scope||!receiptInt(live.revision)||live.revision>flow.revision||
        ![m.generation,r.generation,...(reviewed?[flow.generation]:[])].includes(live.generation))
        throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
      if(flow.revision===r.revision&&((flow.saved?.id||null)!==r.savedId||(flow.pendingId||null)!==r.caseId))
        throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
    }
    if(r.documentId&&!next.control.documents.some(d=>d.id===r.documentId))throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
    receiptClear(record,pin);
  }
  function receiptRejected(body,response,value){
    if(!receiptUUID(value?.requestId))return false;
    const status=response.status,code=value.error,has=(n,list)=>status===n&&list.split(',').includes(code),action=body.action,cmd=body.command;
    if(body.independentOf&&has(409,'FQC_SCOPE_CONFLICT'))return true;
    if(has(422,'BODY_REQUIRED,RESERVED_CONTENT,OPERATION_ID_REQUIRED,FQC_DATA_INVALID')||has(409,'CONCURRENT_CHANGE_RETRY,DOCUMENT_CANCELLED')||has(403,'FORBIDDEN'))return true;
    if(has(409,'WAIVER_CONVERSION_PENDING'))return true;
    if(body.documentId&&has(409,'EXPIRED_PLAN_READ_ONLY'))return true;
    if(action==='request'&&has(409,'WITHDRAW_RETEST_REVIEW_BEFORE_WAIVER,APPROVED_RETEST_CHANGED,FOLLOWUP_KIND_UNAVAILABLE,FOLLOWUP_APPROVED_RESULT_REQUIRED'))return true;
    if(action==='create-plan'&&has(422,'MIXED_INITIAL_RETEST_PLAN'))return true;
    if(action==='draft'&&['submit','approve'].includes(cmd?.action)&&has(409,'WAIVER_RETEST_CHANGED,WITHDRAW_RETEST_REVIEW_BEFORE_WAIVER,APPROVED_RETEST_CHANGED,FOLLOWUP_KIND_UNAVAILABLE,FOLLOWUP_APPROVED_RESULT_REQUIRED'))return true;
    if(action==='draft'&&['apply','save'].includes(cmd?.action)&&has(409,'STOPPED_ITEM_READ_ONLY,DISPOSAL_CORRECTION_RULE_REQUIRED,LEGACY_UNABLE_KEEP_EXISTING,LEGACY_INLINE_DISPOSAL_KEEP_EXISTING'))return true;
    if(body.documentId&&has(422,'PHOTO_NOT_UPLOADED'))return true;
    if(action==='draft'){
      if(!cmd||cmd.operationId!==body.operationId||!body.documentId)return false;
      if(has(404,'DOCUMENT_NOT_FOUND')||has(422,'COMMAND_REQUIRED,OPERATION_ID_MISMATCH,INVALID_OPERATION')||has(409,'FORMAL_DOCUMENT_IMMUTABLE,STALE_GENERATION,STALE_CLIENT_OPERATION'))return true;
      if(cmd.action!=='restore'&&receiptInt(cmd.expectedRevision)&&has(409,'DRAFT_REVISION_CHANGED_RECONFIRM'))return true;
      if(!['approve','return','withdraw'].includes(cmd.action)&&has(409,'PENDING_LOCKED'))return true;
      const guarded=cmd.action==='apply'||cmd.action==='save'&&cmd.moduleAction==='save-local-v1';
      if(guarded&&(has(422,'PATCH_NOT_ALLOWED,DEPENDENCY_GUARD_REQUIRED,INVALID_PATCHES,INVALID_PATH,INVALID_ENTITY_PATH,INVALID_FIELD,INVALID_VALUE')||has(409,'ENTITY_REMOVED_OR_AMBIGUOUS')))return true;
      if(guarded&&has(409,'DEPENDENCY_CHANGED_RECONFIRM'))return Array.isArray(value.details?.path)&&cmd.guards?.some(g=>JSON.stringify(g.path)===JSON.stringify(value.details.path))===true;
      if((guarded||cmd.action==='restore')&&has(422,'CONTENT_INVALID,TEXT_INVALID,PHOTO_ID_INVALID,DOCUMENT_ITEMS_IMMUTABLE,SOURCE_SNAPSHOT_IMMUTABLE,RETEST_REQUIREMENT_IMMUTABLE,DUPLICATE_LINE,RESULTS_INVALID,RESULT_ID_INVALID,RESULT_INVALID,SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE,SINGLE_SAMPLE_REQUIRED,RETEST_SAMPLE_FIXED,UNABLE_MUST_NOT_HAVE_SAMPLES,DISPOSAL_MUST_NOT_HAVE_SAMPLES'))return true;
      if(cmd.action==='restore'&&receiptText(cmd.restoreSaveId)&&receiptInt(cmd.expectedRevision)&&(has(409,'RESTORE_RECONFIRM')||has(404,'SAVE_NOT_FOUND')))return true;
      if(cmd.action==='save'&&cmd.moduleAction==='save-local-v1'&&has(409,'DRAFT_REVISION_REQUIRED'))return true;
      if(cmd.action==='submit'&&(has(422,'OVERDUE_REASON_REQUIRED,NEXT_DATE_REQUIRED,NEXT_PERIOD_REQUIRED,NEXT_DATE_FREQUENCY_TRANSITION,SKIP_REASON_REQUIRED')||has(409,'LEGACY_DOCUMENT_MAPPING_REQUIRED,NEXT_DATE_SOURCE_DISABLED,NEXT_DATE_EXISTING_PLAN_CONFLICT,SKIP_REVIEW_CONFLICT,JOB_ALREADY_ASSIGNED,LEGACY_UNABLE_KEEP_EXISTING,LEGACY_INLINE_DISPOSAL_KEEP_EXISTING,WITHDRAW_REPORT_BEFORE_VOID,APPROVED_REPORT_USE_CORRECTION')))return true;
      if(cmd.action==='approve'&&has(409,'NEXT_DATE_REVIEW_PIN_REQUIRED,NEXT_DATE_FREQUENCY_CHANGED,SKIP_REVIEW_CONFLICT,CASE_LINK_INVALID,WITHDRAW_REPORT_BEFORE_VOID,APPROVED_REPORT_USE_CORRECTION'))return true;
      if(cmd.action==='submit'&&(has(409,'DRAFT_REVISION_REQUIRED,SUCCESSFUL_SAVE_REQUIRED,SAVED_VERSION_CHANGED_RECONFIRM,UNSAVED_CHANGES_SAVE_REQUIRED,ACTIVE_VERSION_CHANGED')||has(422,'NO_SUBSTANTIVE_CHANGE,VALIDATION_FAILED')))return true;
      if(['submit','approve'].includes(cmd.action)&&(has(422,'CASE_LINK_REQUIRED,CASE_LINK_INVALID')||has(409,'CASE_CHANGED_USE_CURRENT_FLOW')))return true;
      if(['approve','return','withdraw'].includes(cmd.action)&&receiptText(cmd.caseId)&&(has(409,'CASE_NOT_PENDING')||cmd.action!=='withdraw'&&(has(409,'SELF_REVIEW_CONFIRM_REQUIRED')||has(403,'SELF_REVIEW_ADMIN_ONLY'))||cmd.action==='approve'&&(has(409,'ACTIVE_VERSION_CHANGED')||has(422,'VALIDATION_FAILED'))||cmd.action==='return'&&has(422,'REASON_REQUIRED')))return true;
      return false;
    }
    const table={queue:[['REVISION_CONFLICT','CALENDAR_POLICY_REQUIRED','JOB_NOT_ARRANGEABLE'],['ITEM_REQUIRED']],request:[['REVISION_CONFLICT','CALENDAR_POLICY_REQUIRED','JOB_ALREADY_ASSIGNED','CASE_CLOSED','FOLLOWUP_OPEN','WITHDRAW_REPORT_BEFORE_VOID','APPROVED_REPORT_USE_CORRECTION','APPROVED_PLAN_REQUIRED'],['KIND_INVALID','ITEM_REQUIRED','APPROVED_PLAN_REQUIRED']],configure:[['REVISION_CONFLICT','START_DATE_LOCKED'],['DATE_INVALID']],generate:[[],['DATE_INVALID','SCHEDULE_RANGE_TOO_LARGE']],'create-plan':[['REVISION_CONFLICT','JOB_ALREADY_ASSIGNED','EXPIRED_PERIOD_NO_NEW_PLAN','JOB_NOT_ARRANGEABLE','SOURCE_CHANGED_RELOAD'],['ITEM_REQUIRED','PLAN_DATES_REQUIRED','PLAN_DATES_OUTSIDE_PERIOD']],'create-report':[['REVISION_CONFLICT','LEGACY_DOCUMENT_MAPPING_REQUIRED','APPROVED_PLAN_REQUIRED','PLAN_NOT_CURRENTLY_ASSIGNED','REPORT_ALREADY_EXISTS'],['PLAN_ITEM_INVALID','WHOLE_PLAN_REPORT_REQUIRED']],improve:[['REVISION_CONFLICT','CASE_CLOSED'],['REASON_REQUIRED']],followup:[['REVISION_CONFLICT','CASE_CLOSED','FOLLOWUP_OPEN'],['KIND_INVALID','WAIVER_ONLY_UNABLE','OPEN_FAILURE_REQUIRES_RETEST_OR_DISPOSAL','DISPOSAL_ONLY_FAIL','IMPROVEMENT_REQUIRED']],close:[['REVISION_CONFLICT','APPROVED_PASS_RETEST_REQUIRED'],['REASON_REQUIRED']],'revoke-plan':[['REVISION_CONFLICT','USE_VOID_REQUEST','USE_CORRECTION_WITH_REPORTS'],['APPROVED_PLAN_REQUIRED','REASON_REQUIRED']],'discard-draft':[['REVISION_CONFLICT','WITHDRAW_BEFORE_DISCARD','DOCUMENT_HAS_DEPENDENCIES','DRAFT_ONLY'],[]],'delete-plan':[['REVISION_CONFLICT','USE_VOID_REQUEST','WITHDRAW_BEFORE_DISCARD','DOCUMENT_HAS_DEPENDENCIES'],['APPROVED_PLAN_REQUIRED']],'restore-document':[['REVISION_CONFLICT','RESTORE_DISABLED'],[]],correct:[['REVISION_CONFLICT','CORRECTION_OPEN','CASE_CHANGED_USE_CURRENT_FLOW'],['FORMAL_DOCUMENT_REQUIRED','REASON_REQUIRED','CASE_LINK_REQUIRED','CASE_LINK_INVALID']],'resolve-impact':[['REVISION_CONFLICT'],['REASON_REQUIRED','NO_OPEN_IMPACT']]};
    return !!table[action]&&(status===409&&table[action][0].includes(code)||status===422&&table[action][1].includes(code))||['discard-draft','delete-plan'].includes(action)&&receiptText(body.documentId)&&has(404,'DOCUMENT_NOT_FOUND');
  }
  window.addEventListener('pagehide',()=>{parkedReceipts.clear();receiptSuspended=true;receiptLifecycle++;if(receiptRecord){receiptRecord.terminal=null;receiptRecord.confirmed=null;}});
  window.addEventListener('pageshow',()=>{receiptSuspended=false;});
  let inFlightMutation=0,navigationError=null;
  const readPause=window.createScopedReadPause('例行 FQC / FQC định kỳ');
  const refreshErrorOwners = new WeakMap();
  // Bound the response body as well as the headers. A write timing out
  // remains uncertain and follows the existing receipt-only recovery path.
  async function routineJSON(url, options) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch(url, { ...options, signal: controller.signal });
          try {
            return { response, value: await response.json() };
          } catch (error) {
            throw Object.assign(Error('FQC_INVALID_RESPONSE'), { response, cause: error });
          }
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(Error('ROUTINE_REQUEST_TIMEOUT'));
            controller.abort();
          }, 15000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function read(query = '', accepts = () => true, options = {}, observeReceipt = true) {
    assertCurrentDisplay();const displayCurrent=captureHistoryDisplay();
    const owner=receiptPin(),delivery=window.ProcessSync?.captureDelivery?.(),pauseOwner=readPause.capture(),kind=query.includes('operationId=')?'receipt':query?'auxiliary':'state';
    const assertCurrent = () => {
      if (!displayCurrent() || !accepts() || (delivery && window.ProcessSync.isCurrentDelivery(delivery) === false))
        throw Error('DELIVERY_SUPERSEDED');
    };
    let r, v;
    assertCurrent();
    try {
      ({ response: r, value: v } = await routineJSON(endpoint + query, { cache: 'no-store', ...options }));
    } catch (error) {
      assertCurrent();
      if (error.response) {
        readPause.denied(kind, error.response.status, pauseOwner, () => read(query));
        if ([401, 403].includes(error.response.status)) error.status = error.response.status;
      }
      throw error;
    }
    assertCurrent();
    if (!r.ok){readPause.denied(kind,r.status,pauseOwner,()=>read(query));throw Object.assign(Error(v.error || 'FQC_READ_FAILED'),{status:r.status});}
    readPause.success(kind,pauseOwner);
    if(kind==='state'&&observeReceipt)receiptObserveRead(v,owner);
    // Observing a document enables per-tab attribution, but never claims its
    // existing contributors (including another tab using the same account).
    if(kind==='state')for(const d of v.control?.documents||[])if(d.flow?.scope==='routine-fqc:'+d.id)window.SharedDraftDeparture?.register?.(d.flow.scope);
    return v;
  }
  const issueNames = {
    FQC_OLD_OPERATION_RESET:['已核對最新 FQC 清單。這筆舊請求已由 Reset 停用；請重新選取要辦理的項目。','Đã kiểm tra danh sách FQC mới nhất. Yêu cầu cũ đã bị dừng khi Reset; vui lòng chọn lại hạng mục.'],
    FQC_CONFIRMATION_REQUIRED:['確認文字不符，未執行操作。','Nội dung xác nhận không khớp; chưa thực hiện.'],
    FQC_BACKUP_VERIFY_FAILED:['備份驗證失敗，沒有重置現有資料。','Không xác minh được bản sao lưu; chưa đặt lại dữ liệu.'],
    FQC_BACKUP_INTEGRITY_FAILED:['備份完整性檢查失敗，沒有還原。','Bản sao lưu không toàn vẹn; chưa khôi phục.'],
    FQC_BACKUP_NOT_FOUND:['找不到指定備份，請重新讀取。','Không tìm thấy bản sao lưu; tải lại.'],

    FQC_INVALID_RESPONSE: ['無法讀取伺服器回應。若有待確認操作，請查原操作回執。','Không đọc được phản hồi máy chủ. Nếu có thao tác chưa rõ, hãy kiểm tra biên nhận gốc.'],
    ROUTINE_REQUEST_TIMEOUT: ['等候伺服器回應逾時。若有待確認操作，請查原操作收據。','Hết thời gian chờ máy chủ. Nếu có thao tác chưa rõ, hãy kiểm tra biên nhận gốc.'],
    IMPROVEMENT_REQUIRED: ['請先記錄本次不合格的改善措施，再建立複測。','Ghi cải thiện cho lần không đạt này trước khi tạo thử lại.'],
    STOPPED_ITEM_READ_ONLY:['已終止項目的內容及照片僅供查看。','Nội dung và ảnh của hạng mục đã dừng chỉ được xem.'],
    MIXED_INITIAL_RETEST_PLAN:['初測與復測必須分開建立計畫。','Phải lập riêng kế hoạch lần đầu và thử lại.'],
    WAIVER_CONVERSION_PENDING:['轉免做正在審核，相關復測暫不可變更。','Đang duyệt chuyển miễn; tạm thời không sửa lần thử lại liên quan.'],
    WAIVER_RETEST_CHANGED:['原復測已有變更，請解除這份免做草稿後重新申請。','Lần thử lại đã thay đổi; bỏ bản nháp miễn này rồi tạo lại.'],
    WITHDRAW_RETEST_REVIEW_BEFORE_WAIVER:['請先撤回復測計畫或報告的待審案件，再申請轉免做。','Rút hồ sơ kế hoạch hoặc báo cáo thử lại đang chờ duyệt trước khi xin chuyển miễn.'],
    APPROVED_RETEST_CHANGED:['已有核准復測結果，請重新讀取目前異常狀態。','Đã có kết quả thử lại được duyệt; tải lại trạng thái bất thường.'],
    DISPOSAL_PROBLEM_REQUIRED: ['請填寫處置的問題說明。','Hãy mô tả vấn đề cần xử lý.'],
    DISPOSAL_REASON_REQUIRED: ['請填寫處置原因。','Hãy nhập lý do xử lý.'],
    DISPOSAL_MUST_NOT_HAVE_SAMPLES: ['申請處置沒有實測樣品。','Đề nghị xử lý không có mẫu thực thử.'],
    DISPOSAL_CORRECTION_RULE_REQUIRED: ['既有處置結果須保留。請從原流程處理；更正不能新增或取消處置結果。','Giữ kết quả xử lý hiện có. Bản sửa không thể thêm hoặc bỏ kết quả xử lý.'],
    LEGACY_UNABLE_KEEP_EXISTING: ['此報告請選擇合格、不合格或異常處理。','Chọn đạt, không đạt hoặc xử lý bất thường.'],
    LEGACY_INLINE_DISPOSAL_KEEP_EXISTING: ['保留舊制處置內容。重新送審前請選擇合格、不合格或異常處理。','Giữ nội dung xử lý cũ. Chọn đạt, không đạt hoặc xử lý bất thường trước khi gửi lại.'],
    FOLLOWUP_KIND_UNAVAILABLE: ['此結果不適用此申請，請從結果待辦選擇可用方式。','Kết quả này không áp dụng đề nghị này. Chọn cách xử lý trong danh sách kết quả.'],
    FOLLOWUP_APPROVED_RESULT_REQUIRED: ['找不到可安全對應的已核准結果。請先查看原報告。','Không tìm thấy kết quả đã duyệt có liên kết rõ ràng. Hãy xem báo cáo gốc.'],
    FOLLOWUP_OPEN: ['已有後續草稿或待審文件；請接續原文件，避免重複建立。','Có hồ sơ tiếp theo dạng nháp hoặc chờ duyệt; tiếp tục hồ sơ hiện có.'],
    JOB_ALREADY_ASSIGNED: [
      '項目已由其他人安排或完成；清單已更新，請接續原計畫。',
      'Hạng mục đã được lập kế hoạch hoặc hoàn thành; danh sách đã cập nhật. Tiếp tục kế hoạch gốc.',
    ],
    CASE_LINK_REQUIRED: [
      '此文件缺少原異常案件連結，請從原案件建立更正。',
      'Hồ sơ thiếu liên kết bất thường gốc. Tạo bản sửa từ hồ sơ gốc.',
    ],
    CASE_LINK_INVALID: [
      '原異常案件或項目連結不一致，請重新開啟原案件。',
      'Liên kết bất thường hoặc hạng mục không khớp. Mở lại hồ sơ gốc.',
    ],
    CASE_CHANGED_USE_CURRENT_FLOW: [
      '案件已有後續變更，請從目前狀態處理。',
      'Hồ sơ đã thay đổi tiếp theo; xử lý từ trạng thái hiện tại.',
    ],
    OPEN_FAILURE_REQUIRES_RETEST_OR_DISPOSAL: [
      '原不合格樣品仍未驗證通過，請補測或申請處置結案，不能免做。',
      'Mẫu không đạt chưa được xác minh đạt. Thử bổ sung hoặc đề nghị xử lý; không được miễn.',
    ],
    UPLOADED_PHOTO_REQUIRED: [
      '請成功上傳至少一張照片',
      'Tải thành công ít nhất một ảnh',
    ],
    EXPLANATION_REQUIRED: ['請填寫問題說明／原因', 'Nhập mô tả vấn đề / lý do'],
    SAMPLES_REQUIRED: [
      '請選擇該項目的實測樣品',
      'Chọn mẫu thực thử của hạng mục',
    ],
    APPROVED_DOWNSTREAM_RETAINED: ['已有核准的下游結果，將保留並與本次更正關聯。','Có kết quả tiếp theo đã duyệt; giữ nguyên và liên kết với lần sửa này.'],
    NEXT_DATE_FREQUENCY_CHANGED: ['下一期規則已變更，請重新核對申請。','Quy tắc kỳ tiếp theo đã đổi; kiểm tra lại đề nghị.'],
    PLAN_DATES_REQUIRED: ['請填有效計畫起迄日，迄日不得早於起日。','Nhập ngày bắt đầu và kết thúc hợp lệ; ngày kết thúc không được sớm hơn.'],
    PLAN_DATES_OUTSIDE_PERIOD: ['一般計畫起迄日必須在各項檢查週期內。','Ngày kế hoạch thường phải nằm trong kỳ của từng hạng mục.'],
    EXPIRED_PERIOD_NO_NEW_PLAN: ['舊期已逾期，不能補建一般計畫；可申請跳過。','Kỳ cũ đã quá hạn; không tạo kế hoạch bù, có thể đề nghị bỏ qua.'],
    JOB_NOT_ARRANGEABLE: ['此項目目前不能安排，請重新確認狀態。','Hiện không thể lập kế hoạch cho hạng mục; kiểm tra lại trạng thái.'],
    SOURCE_CHANGED_RELOAD: ['標準已變更，請重新讀取後安排。','Tiêu chuẩn đã thay đổi; tải lại trước khi lập kế hoạch.'],
    WHOLE_PLAN_REPORT_REQUIRED: ['請建立涵蓋整份有效計畫項目的報告。','Tạo báo cáo gồm toàn bộ hạng mục còn hiệu lực của kế hoạch.'],
    ONE_RESULT_PER_PRODUCT_REQUIRED: ['每個產品檢查項目須有一筆結果。','Mỗi hạng mục kiểm tra sản phẩm cần một kết quả.'],
    EXPIRED_PLAN_READ_ONLY: ['計畫已逾期，只能查看；不能修改或重新送審，下一期依原頻率安排。','Kế hoạch quá hạn, chỉ đọc; không sửa hoặc gửi lại, tiếp tục theo tần suất kỳ sau.'],
    OVERDUE_REASON_REQUIRED: ['已超過計畫迄日，送審須填逾期原因。','Đã quá hạn kế hoạch; nhập lý do khi gửi duyệt.'],
    NEXT_DATE_REQUIRED: ['請填有效的下一檢查日期。','Nhập ngày kiểm tra tiếp theo hợp lệ.'],
    NEXT_PERIOD_REQUIRED: ['下一檢查日期須屬於後續期別。','Ngày kiểm tra tiếp theo phải thuộc kỳ sau.'],
    SKIP_REASON_REQUIRED: ['請填寫中間期別的跳過原因。','Nhập lý do bỏ qua các kỳ ở giữa.'],
    DISPOSITION_RESULT_REQUIRED: ['請填實際處理結果。','Nhập kết quả xử lý thực tế.'],
    WITHDRAW_REPORT_BEFORE_VOID: ['報告正在審核，須先撤回才能申請作廢。','Báo cáo đang chờ duyệt; rút lại trước khi đề nghị hủy.'],
    APPROVED_REPORT_USE_CORRECTION: ['報告已核准，請使用報告更正。','Báo cáo đã duyệt; hãy dùng chức năng sửa báo cáo.'],
    LEGACY_DOCUMENT_MAPPING_REQUIRED: ['既存文件需先確認產品／結果對應，原內容保留，暫不新增送審。','Cần xác nhận liên kết sản phẩm/kết quả của hồ sơ cũ; giữ nội dung, chưa gửi mới.'],
    USE_VOID_REQUEST: ['已核准計畫須透過作廢申請。','Kế hoạch đã duyệt cần đề nghị hủy.'],
    USE_REVIEWED_FOLLOWUP_REQUEST: ['請從異常處理建立待審核申請。','Tạo đề nghị cần duyệt từ phần xử lý bất thường.'],
    CORRECTION_REQUIRES_IMPACT_REVIEW: ['此類更正影響尚未定義，請保留原紀錄。','Chưa xác định tác động sửa loại hồ sơ này; giữ nguyên bản gốc.'],
    ACTUAL_RESULT_REQUIRED: ['請填寫實測結果', 'Nhập kết quả thực tế'],
    RESULT_REQUIRED: ['請選擇檢查結果', 'Chọn kết quả kiểm tra'],
    SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE: ['樣品超出範圍或重複；同一項目各結果列不可選同一樣品。', 'Mẫu ngoài phạm vi hoặc trùng; không chọn cùng mẫu ở các dòng của một hạng mục.'],
    SINGLE_SAMPLE_REQUIRED: ['每列只能選一個實測樣品。','Mỗi dòng chỉ chọn một mẫu thực thử.'],
    RETEST_SAMPLE_FIXED: ['複測只能使用原報告固定的樣品。','Chỉ dùng mẫu gốc cố định khi thử lại.'],
    RETEST_REQUIRED_SAMPLES: [
      '複測須涵蓋上次未通過的樣品',
      'Thử lại phải gồm mẫu chưa đạt lần trước',
    ],
    TITLE_REQUIRED: ['請填文件名稱', 'Nhập tên hồ sơ'],
    DATE_REQUIRED: ['請填有效日期', 'Nhập ngày hợp lệ'],
    REASON_REQUIRED: ['請填原因', 'Nhập lý do'],
    DISPOSITION_REQUIRED: ['請填處置內容', 'Nhập nội dung xử lý'],
    EVIDENCE_REQUIRED: ['請上傳處置證據', 'Tải bằng chứng xử lý'],
    PHOTO_NOT_UPLOADED: ['照片尚未成功保存，請重新上傳', 'Ảnh chưa được lưu thành công; tải lại'],
  };
  function caseForLine(d, l) {
    return data.control.cases.find((a) => (a.jobId === l.jobId || a.lineageJobIds?.includes(l.jobId)) && (a.lineageJobIds?.includes(l.jobId) || (d.caseId ? a.id === d.caseId : d.correctionOf && a.reportIds.includes(d.correctionOf))));
  }
  function requiredForLine(d, l) {
    return [...new Set([...(l.requiredSamples || []), ...(caseForLine(d, l)?.requiredSamples || [])])];
  }
  function sampleNames(l, samples) {
    return samples.map(code => {
      const index = l.source.products.findIndex(product => product.code === code);
      return t('樣品','Mẫu') + (index >= 0 ? ' ' + (index + 1) : '');
    }).join(' / ');
  }
  function issueText(issue) {
    const ids = (issue.path || []).filter((p) => p && typeof p === 'object').map((p) => p.id),
      d = doc(), line = (s.buffers.get(d?.id) || d?.flow.working)?.lines.find((l) => l.id === ids[0]),
      row = line?.results.findIndex((r) => r.id === ids[1]);
    const prefix = line ? line.source.name + (row >= 0 ? ' · ' + t('結果列', 'Dòng kết quả') + ' ' + (row + 1) : '') + '：' : '';
    if (issue.message === 'RETEST_REQUIRED_SAMPLES' && line) {
      const missing = requiredForLine(d, line).filter((code) => !line.results.flatMap((r) => r.samples).includes(code));
      return prefix + t('尚未涵蓋上次未通過樣品：', 'Chưa bao gồm mẫu chưa đạt lần trước: ') + sampleNames(line, missing) + t('。請在此項目建立複測結果列，再填本次結果。', '. Tạo dòng thử lại của hạng mục rồi nhập kết quả lần này.');
    }
    return prefix + (issueNames[issue.message] ? t(...issueNames[issue.message]) : issue.message || issue.code);
  }
  function fault(e,receiptAttempt=false) {
    const owns = refreshErrorOwners.get(e);
    if(e?.message==='DELIVERY_SUPERSEDED' || (owns && !owns()))return;
    if(!receiptAttempt&&receiptFeedback()?.status==='missing'){
      receiptCollapsePreference(receiptRecord,false);
      receiptPresentation=null;
    }
    s.error =
      e.message === 'VALIDATION_FAILED'
        ? t(
            '無法送審：請完成下方標示的必要內容。原輸入及已存草稿保留。',
            'Không thể gửi duyệt: bổ sung các mục bên dưới. Giữ dữ liệu nhập và bản đã lưu.',
          )
        : e.message==='ROUTINE_RECEIPT_READBACK_REQUIRED'&&receiptRecord?.terminal
          ? receiptReadbackNotice()
          : e.message==='OPERATION_NOT_FOUND'&&s.retry
            ? receiptMissingNotice()
            : (issueNames[e.message] ? t(...issueNames[e.message]) : e.message) || String(e);
    s.issues = e.details?.issues || e.details || [];
    if (!Array.isArray(s.issues)) s.issues = [];
    if (!s.issues.length && e.message !== 'VALIDATION_FAILED') s.issues = [{ message: s.error, path: [] }];
    paint();
  }
  async function post(command, accepts) {
    inFlightMutation++;try{return await postOwned(command, accepts);}finally{inFlightMutation--;}
  }
  async function postOwned(command, accepts = () => true) {
    activeDeliveries++;
    try{return await dispatchOwned(command,accepts);}finally{activeDeliveries--;}
  }
  async function dispatchOwned(command,accepts){
    assertCurrentDisplay();const displayCurrent=captureHistoryDisplay();
    const pin=receiptPin();if(!receiptOwnedPin(pin))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
    receiptInstall(pin.actor);if(receiptInvalid)throw Error('ROUTINE_RECEIPT_STORAGE_INVALID');
    let original=receiptRecord,refs=null;
    if(original&&command?.operationId!==original.meta.operationId){
      const records=receiptDiscover(pin.actor);
      refs=independentReferences(command,records);
      if(!refs||activeDeliveries!==1||original.terminal||!records.some(row=>row.raw===original.raw&&row.key===original.key))throw Error('PREVIOUS_OPERATION_UNKNOWN');
      parkedReceipts.set(original.key,original);
      original=null;
    }
    if(original){
      if(command?.operationId!==original.meta.operationId)throw Error('PREVIOUS_OPERATION_UNKNOWN');
      if(original.ram&&JSON.stringify(command)!==JSON.stringify(original.ram))throw Error('OPERATION_ID_PAYLOAD_MISMATCH');
      if(original.notSent||original.rejectedCode){const message=original.rejectedCode||'ROUTINE_OPERATION_NOT_SENT_RETRY_ACTION';receiptClear(original,pin);throw Error(message);}
      const found=await read('?'+(original.meta.action==='draft'?'receiptDocument='+encodeURIComponent(original.meta.documentId)+'&':'')+'operationId='+encodeURIComponent(original.meta.operationId), accepts);
      if(found?.resetSettlement){
        const proof=found.resetSettlement;
        const owns=()=>accepts()&&displayCurrent()&&receiptOwnedPin(pin)&&receiptRecord===original&&receiptStore().getItem(original.key)===original.raw;
        if(!owns()||proof.scope!=='fqc'||proof.actorId!==pin.actor||proof.operationId!==original.meta.operationId||
          !receiptInt(proof.generationRevision)||proof.generationRevision<1||!receiptInt(found.revision)||found.revision<proof.generationRevision)
          throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
        const next=await read('',owns,{},false);
        if(!owns()||next.identity?.id!==pin.actor||next.permissions?.view!==true||
          !receiptInt(next.control?.resetGenerationRevision)||next.control.resetGenerationRevision<proof.generationRevision||
          !receiptInt(next.control.revision)||next.control.revision<Math.max(found.revision,next.control.resetGenerationRevision,data.control.revision)||
          !receiptInt(next.revision)||next.revision<data.revision)throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
        original.confirmed=null;
        receiptClear(original,pin);
        data=next;
        reconcileSelection();
        // Stop here: ordinary success handling could apply the old edit locally.
        throw Error('FQC_OLD_OPERATION_RESET');
      }
      return receiptTerminal(original,found,pin);
    }
    const body=clone({...command,...(refs?{independentOf:refs,expectedRevision:data.control.revision}:{}),...(data?.control?.resetGenerationRevision!==undefined&&command.expectedRevision===undefined?{expectedRevision:data.control.revision}:{}),operationId:command.operationId||id()});if(!receiptWriteAllowed(body))throw Error('FORBIDDEN');
    if(body.action==='create-plan'&&calendarMode()){
      body.operationId='plan-fqc-'+crypto.randomUUID();
      const {response,value}=await routineJSON('/api/routine-plan-intent?scope=fqc&id='+encodeURIComponent(body.operationId),{
        method:'POST',headers:{'Content-Type':'application/json','X-Process-Expected-Actor':pin.actor},body:JSON.stringify({action:'register',command:body})});
      if(!response.ok||value?.status!=='registered'||value.id!==body.operationId||value.scope!=='fqc'||value.actorId!==pin.actor||
        value.expectedRevision!==body.expectedRevision||!displayCurrent()||!receiptOwnedPin(pin))throw Error(value?.error||'PLAN_REGISTRATION_UNCONFIRMED');
      receiptInstall(pin.actor);
      if(receiptRecord||receiptInvalid)throw Error('PREVIOUS_OPERATION_UNKNOWN');
    }
    const record=receiptCreate(body,pin),current=()=>displayCurrent()&&receiptOwnedPin(pin)&&receiptRecord===record;
    const departureOwner=window.SharedDraftDeparture?.capture?.(),scope='routine-fqc:'+body.documentId;
    record.confirmed=result=>{const live=data?.control?.documents?.find(d=>d.id===body.documentId)?.flow;
      if(!current()||body.action!=='draft'||!['apply','restore'].includes(body.command?.action)||live?.scope!==scope||live.generation!==record.meta.generation||result?.unchanged!==false)return;
      window.SharedDraftDeparture?.register?.(scope);window.SharedDraftDeparture?.confirmed?.(scope,body.command,{receipt:result},departureOwner);
    };
    const receipt=async()=>{if(!current())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');const found=await read('?operationId='+encodeURIComponent(body.operationId), accepts);return receiptTerminal(record,found,pin);};
    let response,value;
    if(!current()||!receiptWriteAllowed(body)||receiptStore().getItem(record.key)!==record.raw)throw Error('ROUTINE_RECEIPT_DISPATCH_CHANGED');
    try{record.notSent=false;({response,value}=await routineJSON(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));}
    catch{try{return await receipt();}catch{throw Error(receiptNotice());}}
    if(!current())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
    if(!response.ok){
      // Only this actual first POST response can prove a narrow pre-CAS refusal.
      // GET/fetch throws and public error flags never enter this classifier.
      if(receiptRejected(body,response,value)){record.rejectedCode=value.error;receiptClear(record,pin);}
      else if(response.status>=500){try{return await receipt();}catch{/* Keep the exact uncertain operation. */}}
      throw Object.assign(Error(value?.error||'FQC_WRITE_FAILED'),{details:value?.details,status:response.status});
    }
    return receiptTerminal(record,value,pin);
  }
  // This token belongs to one explicit entry/update, never to an idle timer.
  // Pin the actual identity object as well as epoch/delivery: a replacement
  // object for the same account cannot inherit an earlier generation intent.
  let refreshSequence = 0, generationRefresh = null;
  const normalWork = () => root?.isConnected && root.matches?.('#routine-fqc-root') &&
    !s.reviewPlatform && s.module === 'FQC' && ['sources', 'jobs', 'plans', 'reports', 'failed', 'cases', 'documents'].includes(s.tab);
  async function refresh(generate = false, configured = false) {
    if (generate && generationRefresh?.current()) return;
    const pin = receiptPin(), identity = window.ProcessSync?.identity,
      sequence = ++refreshSequence, tab = s.tab, workModule = s.module, review = s.reviewPlatform,
      unknownAtStart = receiptInvalid || (!!s.retry && !(configured && receiptRecord?.meta.action === 'configure' &&
        receiptRecord.terminal && receiptOwnedPin(receiptRecord.terminal.pin)));
    let observed = data, view = data?.permissions?.view, edit = data?.permissions?.edit;
    const current = () => sequence === refreshSequence && receiptCurrent(pin) &&
      root?.isConnected && identity === window.ProcessSync?.identity &&
      s.tab === tab && s.module === workModule && s.reviewPlatform === review &&
      data === observed && data?.permissions?.view === view && data?.permissions?.edit === edit;
    const adopt = next => { data = observed = next; view = next.permissions.view; edit = next.permissions.edit; };
    const token = generate ? { current } : null;
    if (token) generationRefresh = token;
    try {
      if (token && data) paint();
      const next = await read('', current);
      if (!current()) return;
      // Both the aggregate and storage revision must remain monotonic. A newer
      // explicit read or local permission revocation also retires this intent.
      if (data && next.identity.id === data.identity.id &&
          (next.control.revision < data.control.revision || next.revision < data.revision)) return;
      if (data && next.identity.id !== data.identity.id) {
        s.buffers.clear();s.bufferGenerations.clear(); s.bases.clear(); s.selected = null;
      }
      adopt(next);
      reconcileSelection();
      if (generate && !unknownAtStart && current() && normalWork() && !s.retry && !receiptInvalid &&
          !readPause.state('state') && !inFlightMutation && data.enabled !== false &&
          data.permissions.view === true && data.permissions.edit === true && data.control.startDate) {
        // No buffer, basis, draft payload or client date is sent. The existing
        // server generates from its fresh authorized state/company date and CAS.
        await post({ action: 'generate' }, current);
        if (!current()) return;
        const generated = await read('', current);
        if (!current()) return;
        if (generated.control.revision >= data.control.revision && generated.revision >= data.revision) adopt(generated);
      }
      s.error = receiptInvalid ? receiptStorageNotice() : s.retry ? receiptNotice() : '';
      s.issues = [];
    } catch (error) {
      // A sent operation still owns its original receipt. Retiring its UI
      // intent only suppresses late error presentation, never marks it unsent.
      if (!current()) throw Error('DELIVERY_SUPERSEDED');
      if (error && typeof error === 'object') refreshErrorOwners.set(error, current);
      throw error;
    } finally {
      if (generationRefresh === token) generationRefresh = null;
      if (current()) paint();
    }
  }
  let historySearch, historyLanguage, pendingHistoryItem;
  async function ensureHistorySearch() {
    if (!historySearch) {
      const workflowModule = await import('/process/routine-fqc-search.mjs?v=20261123-item-display1');
      historySearch = workflowModule.createHistorySearch({getData: () => data, readPreview: () => read('?search-preview=1')});
    }
  }
  let pageDraftMode = false;
  async function mount(container, historyMode = false) {
    retireApprovedHistory();
    navigationError=null;
    s.reviewPlatform = false;
    root = container.matches?.('#routine-fqc-root')
      ? container
      : container.querySelector('#routine-fqc-root');
    if (!root) return;
    if (historyMode) s.tab = 'history';
    else { const q=new URLSearchParams(window.location?.search||''); if(q.get('system')==='quality'&&['sources','jobs','plans','reports','failed','cases'].includes(q.get('rfTab')))s.tab=q.get('rfTab'); }
    if (loading && mountOwner?.()) return;
    const pin = receiptPin(), identity = window.ProcessSync?.identity;
    const owns = () => receiptCurrent(pin) && root?.isConnected && identity === window.ProcessSync?.identity;
    let available = false;
    mountOwner = owns;
    loading = true;
    // Retained page DOM must not look actionable while fresh permissions and
    // review state are still being read on re-entry. Dirty buffers remain in RAM.
    root.innerHTML = `<div class="rf-empty" role="status">${t('正在讀取最新檢查狀態…','Đang tải trạng thái kiểm tra mới nhất…')}</div>`;
    try {
      const a = await read('?availability=1', owns);if(!owns())return;
      available = a.enabled === true;
      if (!available) {
        root.innerHTML = `<div class="rf-empty"><b>${t('例行檢查準備中', 'Đang chuẩn bị kiểm tra định kỳ')}</b>${t('3040 完成驗收後啟用', 'Kích hoạt sau nghiệm thu 3040')}</div>`;
        return;
      }
      if(a.pageDraftLayout==='page-v1'){
        if(s.busy||s.retry||s.dialogOpen||inFlightMutation||docs().some(dirty))throw Error('ROUTINE_PAGE_CUTOVER_RELOAD_REQUIRED');
        pageDraftMode=true;await window.RoutineFqcPage.mount(root,{review:false});return;
      }
      await ensureHistorySearch();if(!owns())return;
      await refresh(true);
    } catch (e) {
      if(owns()){navigationError=e;fault(e);}
    } finally {
      if (mountOwner === owns) {
        loading = false; mountOwner = null;
        if (owns() && available && data && !pageDraftMode) paint();
      }
    }
  }
  const docs = () => data?.control.documents || [],
    doc = () => docs().find((d) => d.id === s.selected),
    selectedCase = () => data?.control.cases.find((a) => a.id === s.selected);
  const liveDocs = () => docs().filter((d) => !d.cancelled);
  function primaryDocuments() {
    return liveDocs().filter((d) => (d.kind !== 'plan' || d.requestKind || d.caseId || data.control.jobs.some((j) => liveDocs().some((p) => p.id === j.planId && p.familyId === d.familyId))) && !liveDocs().some((o) => o.kind === d.kind && o.familyId === d.familyId && o.id !== d.id && o.createdAt > d.createdAt));
  }
  const reportSlots = (d) => d.reportAvailability || [];
  const documentTab = (d) => calendarMode()&&d&&!d.cancelled&&status(d)!=='approved'&&(d.retestApplicationCaseId||d.caseId&&['retest','disposal'].includes(d.requestKind)) ? requestContext(d) : (d.requestKind || calendarMode()&&['waiver','disposal'].includes(d.kind)) ? (calendarMode()?'history':'reports') : d.cancelled ? 'history' : d.kind === 'plan' ? 'plans' : 'reports';
  function reconcileSelection() {
    const removed = [];
    for (const key of s.checked) {
      const job = data.control.jobs.find((j) => j.id === key);
      if (!job || job.planId || job.completion || !data.permissions.edit) {
        s.checked.delete(key);
        removed.push(job?.source.name || key);
      }
    }
    if (removed.length)
      s.selectionNotice =
        t(
          '以下項目已安排或完成，已移出勾選：',
          'Đã bỏ chọn các hạng mục được lập kế hoạch / hoàn thành: ',
        ) + removed.join(' / ');
  }
  // Keep snapshots until after scoping: the same item can have several names
  // or categories over time. Current formal data wins only within its scope.
  const filterSources = () => [
    ...data.sources.map((v) => ({ ...v, historical: false })),
    ...data.control.jobs
      .slice()
      .reverse()
      .map((j) => ({
        ...j.source,
        historical: true,
      })),
  ];
  const withinScope = (v) =>
    (!s.line || v.line === s.line) &&
    (!s.category || v.category === s.category);
  function itemOptions(sources) {
    const candidates = new Map();
    for (const source of sources.filter(withinScope)) {
      if (!candidates.has(source.id)) candidates.set(source.id, source);
    }
    return [...candidates.values()];
  }
  function buffer(d) {
    if (!s.buffers.has(d.id)) {
      s.buffers.set(d.id, clone(d.flow.working));
      s.bases.set(d.id, clone(d.flow.working));
      s.bufferGenerations.set(d.id,d.flow.generation);
    }
    const working = s.buffers.get(d.id);
    if (d.kind === 'report' && status(d) === 'draft') for (const line of working.lines) {
      const required = requiredForLine(d,line);
      const used = new Set(line.results.flatMap(r => r.samples));
      for (const row of line.results) if (!row.samples.length && !['abnormal','unable','dispose'].includes(row.outcome)) {
        const original = required.find(code => !used.has(code));
        if (original) { row.samples = [original]; used.add(original); }
      }
    }
    return working;
  }
  function dirty(d) {
    return (
      s.buffers.has(d.id) &&
      JSON.stringify(s.buffers.get(d.id)) !== JSON.stringify(s.bases.get(d.id))
    );
  }
  const done = (a) => ['closed', 'disposed', 'waived'].includes(a.status) || (calendarMode() && a.workflowOutcome === 'pass');
  const caseMatches = (a) =>
    !s.caseState ||
    (s.caseState === 'unclosed' && !done(a)) ||
    (s.caseState === 'closed-failure' && done(a)) ||
    s.caseState === a.status;
  function caseVisible(a) {
    return (
      caseMatches(a) &&
      a.reportIds.some((id) => {
        const d = docs().find((d) => d.id === id);
        return (
          d &&
          matches(
            content(d).lines.filter((l) => l.jobId === a.jobId),
            { ...d, number: d.number + ' ' + a.number },
          )
        );
      })
    );
  }
  function frequencyNotice() {
    const items = data.sources.filter((i) => !i.frequency);
    return items.length
      ? `<details class="rf-notice"><summary>${t('待確認頻率', 'Cần xác nhận tần suất')} · ${items.length}</summary>${items.map((i) => `<p>${h(i.name + ' · ' + i.frequencyText)}</p>`).join('')}<p>${t('請於原 FQC 標準確認頻率後送審；不推算日期。', 'Xác nhận tần suất trong tiêu chuẩn FQC rồi gửi duyệt; không suy đoán ngày.')}</p></details>`
      : '';
  }
  const highlightLabel = (key) => ({
    jobs: t('尚待完成', 'Chưa hoàn thành'), documents: t('待審核', 'Chờ duyệt'),
    cases: t('異常未結案', 'Bất thường chưa đóng'), overdue: t('已逾期', 'Quá hạn'),
    fail: t('不合格', 'Không đạt'), open: t('未結案', 'Chưa đóng'),
    'closed-fail': t('已結案的不合格', 'Không đạt đã đóng'),
  })[key] || '';
  const highlightTone = () => s.highlight === 'jobs' ? 'blue' : s.highlight === 'documents' ? 'amber' : 'red';
  function caseFailed(a) {
    return a.result === 'fail' || a.unresolvedFailureSamples?.length > 0 || a.reportIds.some((key) => docs().find((d) => d.id === key)?.flow.active.content?.lines.some((l) => l.jobId === a.jobId && l.results.some((r) => r.outcome === 'fail')));
  }
  function highlighted(job, item) {
    const cases = data.control.cases.filter((a) => a.jobId === job?.id);
    if (s.highlight === 'jobs') return !!job && !job.completion;
    if (s.highlight === 'overdue') return !!job && !job.completion && job.end < data.today;
    if (s.highlight === 'documents') return item?.flow ? status(item) === 'pending' : liveDocs().some((d) => status(d) === 'pending' && content(d).lines.some((l) => l.jobId === job?.id));
    if (['cases', 'open'].includes(s.highlight)) return item?.reportIds ? !done(item) : cases.some((a) => !done(a));
    if (s.highlight === 'closed-fail') return item?.reportIds ? done(item) && caseFailed(item) : cases.some((a) => done(a) && caseFailed(a));
    return s.highlight === 'fail' && (item?.reportIds ? caseFailed(item) : !!job && jobSummary(job).results.some((r) => r.outcome === 'fail'));
  }
  function rowMark(job, item) {
    return s.highlight && highlighted(job, item) ? ' data-highlight="' + highlightTone() + '"' : '';
  }
  function markBadge(job, item) {
    return s.highlight && highlighted(job, item) ? '<span class="rf-mark-badge" data-tone="' + highlightTone() + '">' + h(highlightLabel(s.highlight)) + '</span>' : '';
  }
  function toggleHighlight(key, tab) {
    s.highlight = s.highlight === key ? '' : key;
    s.tab = tab; s.selected = null; s.cancelConfirm = null;
    s.review = ''; s.caseState = ''; s.outcome = ''; s.overdue = false;
    s.workState = ''; s.documentKind = '';
    paint();
  }
  function quickFilters() {
    return '<div class="rf-actions rf-mark-controls">' + ['fail', 'open', 'closed-fail'].map((key) => '<button type="button" class="rf-btn" data-action="filter-' + key + '" data-tone="red" aria-pressed="' + (s.highlight === key) + '">' + h(highlightLabel(key)) + '</button>').join('') + '</div>' + (s.highlight ? '<p class="rf-mark-legend" data-tone="' + highlightTone() + '" role="status">' + h(highlightLabel(s.highlight)) + ' · ' + t('同色項目已標記；其他項目保留，再點一次取消。搜尋條件仍適用。', 'Đánh dấu mục cùng màu; giữ các mục khác, bấm lại để bỏ. Vẫn áp dụng điều kiện tìm kiếm.') + '</p>' : '');
  }
  const searchText = (l) =>
    [
      l.source.name,
      l.source.code,
      l.source.errorCode,
      ...l.source.products.flatMap((p) => [p.code, p.name]),
    ]
      .join(' ')
      .toLowerCase();
  function matches(lines, d) {
    const q = s.query.trim().toLowerCase();
    return lines.some(
      (l) =>
        (!s.line || l.source.line === s.line) &&
        (!s.category || l.source.category === s.category) &&
        (!s.item || l.source.id === s.item) &&
        (!q ||
          searchText(l).includes(q) ||
          [d?.number, d ? displayNumber(d) : null, d?.flow?.working?.title]
            .join(' ')
            .toLowerCase()
            .includes(q)) &&
        (!s.outcome || l.results?.some((r) => r.outcome === s.outcome)) &&
        (!s.from ||
          ((s.dateMode === 'actual'
            ? d
              ? content(d).date
              : ''
            : data.control.jobs.find((j) => j.id === l.jobId)?.end) || '') >=
            s.from) &&
        (!s.to ||
          ((s.dateMode === 'actual'
            ? d
              ? content(d).date
              : ''
            : data.control.jobs.find((j) => j.id === l.jobId)?.start) || '') <=
            s.to),
    );
  }
  function filters() {
    const sources = filterSources(),
      catalog = data.catalog || { lines: [], categories: [] },
      categories = [
        ...catalog.categories,
        ...sources.map((v) => ({ name: v.category, line: v.line })),
      ],
      options = itemOptions(sources),
      selectedSource = sources.find((v) => v.id === s.item) || catalog.items?.find((v) => v.id === s.item);
    const select = (key, title, values) =>
      `<label>${title}<select data-filter="${String(key)}"><option value="">${t('全部', 'Tất cả')}</option>${[
        ...new Set(values),
      ]
        .filter(Boolean)
        .map(
          (v) =>
            `<option ${s[key] === v ? 'selected' : ''} value="${h(v)}">${h(v)}</option>`,
        )
        .join('')}</select></label>`;
    return `<div class="rf-toolbar"><label class="rf-query">${t('產品、錯誤代碼、項目或編號', 'Sản phẩm, mã lỗi, hạng mục, số hồ sơ')}<input data-filter="query" value="${h(s.query)}" placeholder="${t('搜尋涵蓋產品及歷史快照…', 'Tìm sản phẩm và bản chụp lịch sử…')}"></label>${select(
      'line',
      t('線別', 'Chuyền'),
      [...catalog.lines, ...sources.map((v) => v.line)].sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }),
    )}${select(
      'category',
      t('類別', 'Loại'),
      categories
        .filter((v) => !s.line || v.line === s.line)
        .map((v) => v.name)
        .sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }),
    )}<label>${t('檢查項目', 'Hạng mục')}<select data-filter="item"><option value="">${s.line || s.category ? t('所選範圍全部項目', 'Tất cả trong phạm vi') : t('跨線全部項目', 'Tất cả chuyền')}</option>${s.item && !options.some((v) => v.id === s.item) ? `<option value="${h(s.item)}" selected>${h([selectedSource?.name, selectedSource?.code, t('目前清單外的回查項目；可選全部解除', 'Hạng mục tra cứu ngoài danh sách hiện tại; chọn tất cả để bỏ lọc')].filter(Boolean).join(' · '))}</option>` : ''}${options
      .map(
        (v) =>
          `<option value="${h(v.id)}" ${s.item === v.id ? 'selected' : ''}>${h(v.name + ' · ' + v.line + ' · ' + v.category + ' · ' + v.errorCode + ' · ' + v.code + (v.historical ? t(' · 歷史版本', ' · Phiên bản lịch sử') : ''))}</option>`,
      )
      .join(
        '',
      )}</select></label></div>${sourceNotice()}<details class="rf-advanced"><summary>${t('結果、審核、異常與日期篩選', 'Lọc kết quả, phê duyệt, bất thường và ngày')}</summary><div class="rf-toolbar">${[
      ['outcome', Object.keys(labels).slice(0, 4)],
      ['review', ['draft', 'pending', 'approved']],
      [
        'caseState',
        [
          'unclosed',
          'closed-failure',
          'open',
          'retest',
          'ready-close',
          'closed',
          'disposed',
          'waived',
        ],
      ],
    ]
      .map(
        ([key, values]) =>
          `<label>${t('狀態', 'Trạng thái')}<select data-filter="${String(key)}"><option value="">${t('全部', 'Tất cả')}</option>${values.map((v) => `<option value="${v}" ${s[key] === v ? 'selected' : ''}>${label(v)}</option>`).join('')}</select></label>`,
      )
      .join(
        '',
      )}<label>${t('日期類型', 'Loại ngày')}<select data-filter="dateMode"><option value="period" ${s.dateMode === 'period' ? 'selected' : ''}>${t('應檢期別', 'Kỳ kiểm tra')}</option><option value="actual" ${s.dateMode === 'actual' ? 'selected' : ''}>${t('實際檢查日', 'Ngày kiểm tra')}</option></select></label><label>${t('從', 'Từ')}<input type="date" data-filter="from" value="${h(s.from)}"></label><label>${t('至', 'Đến')}<input type="date" data-filter="to" value="${h(s.to)}"></label>${btn('clear-filter', t('清除篩選', 'Xóa bộ lọc'))}</div></details>`;
  }
  function calendarReadiness() {
    const timed=data.sources.filter(source=>source.frequency);
    const mapped=timed.filter(source=>source.products.length);
    const unmapped=timed.length-mapped.length;
    const pairs=new Set(mapped.flatMap(source=>source.products.map(product=>
      JSON.stringify([source.line,product.code,source.id]))));
    const items=data.catalog?.items||[];
    const other=items.filter(item=>item.enabled&&!['time','pending_confirmation'].includes(item.cadence)).length;
    const disabled=items.filter(item=>!item.enabled).length;
    const timedIds=new Set(timed.map(source=>source.id));
    const unresolved=items.filter(item=>item.enabled&&['time','pending_confirmation'].includes(item.cadence)&&!timedIds.has(item.id)).length;
    return `<p class="rf-source-summary">${t('FQC 正式版本','Phiên bản FQC đã duyệt')} ${h(data.catalog?.version||'—')} · ${t('已核准標準時間項目','Hạng mục có tần suất chuẩn đã duyệt')} ${timed.length} · ${t('已指定產品的項目','Hạng mục đã gán sản phẩm')} ${mapped.length} · ${t('項目與產品配對','Cặp hạng mục và sản phẩm')} ${pairs.size} · ${t('未指定產品的項目','Hạng mục chưa gán sản phẩm')} ${unmapped} · ${t('非定期','Không định kỳ')} ${other} · ${t('停用','Đã tắt')} ${disabled} · ${t('頻率待確認','Chờ xác nhận tần suất')} ${unresolved}${unmapped?`<br>${t('未指定產品的時間項目不會產生期別。請在 FQC 資料後台指定產品並核准。','Hạng mục định kỳ chưa gán sản phẩm sẽ không tạo kỳ kiểm tra. Hãy gán sản phẩm trong dữ liệu FQC và duyệt thay đổi.')}`:''}${!timed.length?`<br>${t('請在 FQC 資料後台設定標準時間頻率與適用產品，並核准版本。','Hãy đặt tần suất chuẩn, gán sản phẩm áp dụng và duyệt phiên bản trong dữ liệu FQC.')}`:''}</p>`;
  }
  function sourceNotice() {
    if (!data.catalog) return '';
    const items = data.catalog.items.filter(withinScope),
      sources = data.sources.filter(withinScope),
      ready = sources.filter((v) => v.frequency).length,
      unresolved = sources.filter((v) => !v.frequency).length,
      disabled = items.filter((v) => !v.enabled).length,
      other = items.filter(
        (v) =>
          v.enabled &&
          v.cadence !== 'time' &&
          v.cadence !== 'pending_confirmation',
      ).length;
    return `<p class="rf-source-summary">${t('FQC正式版本', 'Tiêu chuẩn FQC đã duyệt')} ${h(data.catalog.version || '—')} · ${t('可排程時間項目', 'Hạng mục định kỳ')} ${ready} · ${t('非定期', 'Không định kỳ')} ${other} · ${t('停用', 'Đã tắt')} ${disabled} · ${t('頻率待確認', 'Chờ xác nhận tần suất')} ${unresolved}${!ready ? `<br>${t('此範圍尚無可排程項目；請在FQC後台設定時間頻率並核准。既有歷史仍保留。', 'Phạm vi này chưa có hạng mục định kỳ. Thiết lập tần suất và duyệt tại tiêu chuẩn FQC. Giữ nguyên lịch sử.')}` : ''}</p>`;
  }
  function holdFilterView() {
    // Keep enough page height to restore the viewport after filtering a long detail.
    root.style.minHeight = Math.max(0, window.innerHeight - root.getBoundingClientRect().top) + 'px';
  }
  function preserveRoutineView() {
    const positions = ['.rf-scroll', '.rf-detail-panel', '.rf-detail'].map((selector) => {
      const node = root.querySelector(selector);
      return {selector, top:node?.scrollTop || 0, left:node?.scrollLeft || 0};
    });
    const ancestors = []; for (let node = root.parentElement; node; node = node.parentElement) ancestors.push({node, top:node.scrollTop, left:node.scrollLeft});
    const x = window.scrollX, y = window.scrollY;
    return () => {
      for (const old of positions) { const node = root.querySelector(old.selector); if (node) { node.scrollTop = old.top; node.scrollLeft = old.left; } }
      for (const old of ancestors) { old.node.scrollTop = old.top; old.node.scrollLeft = old.left; }
      window.scrollTo(x, y);
    };
  }
  function keepListAnchor(control, resolve, resolveFocus) {
    if (!control?.getBoundingClientRect) return;
    const top = control.getBoundingClientRect().top;
    return () => {
      const next = resolve();
      if (!next?.getBoundingClientRect || next.getClientRects?.().length === 0) return;
      const focus = resolveFocus ? resolveFocus(next) : next;
      focus?.focus?.({preventScroll:true});
      const delta = next.getBoundingClientRect().top - top;
      if (Math.abs(delta) >= 1) window.scrollTo({left:window.scrollX,top:window.scrollY+delta,behavior:'instant'});
    };
  }
  function revealRoutineDetail(container) {
    const panel = container.querySelector('.rf-detail-panel');
    const back = panel?.querySelector('[data-action="back"],[data-ri-action="back"]');
    const heading = panel?.querySelector('h2,h3');
    const target = back?.getClientRects?.().length ? back : heading;
    if (!target?.getBoundingClientRect || target.getClientRects?.().length === 0) return;
    const topbarBottom = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
    const {top,bottom} = target.getBoundingClientRect();
    if(top < topbarBottom || bottom > window.innerHeight)target.scrollIntoView?.({block:'nearest',behavior:'instant'});
  }
  function calendarListOrigin(control, attribute) {
    if (!calendarMode() || s.reviewPlatform || !control) return;
    const row = control.closest('[data-period-id],.rf-calendar-document-list,.rf-period-older-alert');
    if (!row) return;
    const id = row.dataset.periodId, value = control.getAttribute(attribute), tab = s.tab;
    const restore = keepListAnchor(control, () => {
      const scope = id ? [...root.querySelectorAll('[data-period-id]')].find(node => node.dataset.periodId === id) : root;
      return [...(scope?.querySelectorAll('['+attribute+']') || [])].find(node => node.getAttribute(attribute) === value) ||
        scope?.querySelector('[data-job]:not([disabled]),.rf-period-history > summary');
    });
    if (restore) s.listReturn = {tab,restore,selection:value};
  }
  let flowConnectorObserver=null;
  function paint() {
    flowConnectorObserver?.disconnect();flowConnectorObserver=null;
    if (!root?.isConnected) return;
    if(pageDraftMode){window.RoutineFqcPage.repaint();return;}
    if(approvedHistoryView?.historical&&historyDocument===doc()?.id&&!s.reviewPlatform){approvedHistoryView.relabel();return;}approvedHistoryView?.retire();approvedHistoryView=null;historyDocument=null;
    for (const node of root.querySelectorAll('.rf-result[data-result-id]')) s.resultOpen.set(node.dataset.resultId,node.open);
    for (const node of root.querySelectorAll('.rf-samples[data-sample-key]')) s.sampleOpen.set(node.dataset.sampleKey,node.open);
    const restoreView = preserveRoutineView();
    if (!data) {
      root.innerHTML = `<div class="rf-notice error">${h(s.error)} ${btn('refresh', t('重試', 'Thử lại'))}</div>`;
      bind();
      return;
    }
    if (s.reviewPlatform) { paintReview(); restoreView(); return; }
    if((calendarMode()||calendarSetupAvailable())&&s.module==='FQC'){if(s.tab==='jobs')s.tab='sources';const tab=calendarActiveTab();const url=new URL(location.href);if(['sources','jobs','plans','reports','failed','cases'].includes(tab)&&url.searchParams.get('view')==='quality-inspections'&&url.searchParams.get('system')==='quality'&&url.searchParams.get('rfTab')!==tab){url.searchParams.set('rfTab',tab);window.ProcessDeliveryNavigation?.replaceDisplayURL?.(url.href);}root.innerHTML=calendarPage();mountFlowConnector();bind();guardDocumentCallbacks();mountDraft();if(s.busy||generationRefresh?.current())root.querySelectorAll('button').forEach(b=>b.disabled=true);restoreView();return;}
    if (pendingHistoryItem && historySearch) { historySearch.openForItem(pendingHistoryItem); pendingHistoryItem = null; }
    if (s.tab === 'history' && s.module === 'FQC' && root.querySelector('.rf-history') && historySearch && (historyLanguage === document.documentElement.lang || historySearch.composing)) {
      historySearch.update(); restoreView(); return;
    }
    historyLanguage = document.documentElement.lang;
    const c = data.control,
      p = data.permissions,
      pending = docs().filter((d) => status(d) === 'pending').length,
      open = c.cases.filter((a) => !done(a)).length,
      overdue = c.jobs.filter(
        (j) => !j.completion && j.end < data.today,
      ).length;
    root.innerHTML = `<header class="rf-hero"><div><div class="rf-eyebrow">QUALITY ASSURANCE / ROUTINE INSPECTION</div><h2>${t('例行檢查 · FQC', 'Kiểm tra định kỳ · FQC')}</h2><p>${t('從排程、檢查到改善結案，每一筆都有依據。', 'Theo dõi lịch kiểm tra, kết quả và cải thiện đến khi đóng hồ sơ.')}</p></div><div class="rf-actions">${normalWork() ? btn('update-current', t('更新', 'Cập nhật'), s.busy || loading) : ''}${btn('settings', t('⚙ 排程設定', '⚙ Lịch kiểm tra'), !p.settings, 'soft')}</div></header>${location.port === '3040' ? `<div class="rf-test">3040 · ${t('隔離測試環境 — 測試資料與日常資料分開', 'Môi trường thử nghiệm độc lập với dữ liệu hàng ngày')}</div>` : ''}<nav class="rf-modules">${['FQC', 'IQC', t('模具檢查', 'Kiểm tra khuôn'), t('檢具與測試設備校準', 'Hiệu chuẩn thiết bị')].map((m, i) => `<button data-module="${i}" class="${s.module === String(i) || (s.module === 'FQC' && i === 0) ? 'active' : ''}">${m}</button>`).join('')}</nav><div class="rf-main">${
      s.module !== 'FQC'
        ? `<div class="rf-empty"><span class="rf-icon">◇</span><b>${t('功能建置中', 'Đang xây dựng')}</b>${t('此入口尚未開始管理，原資料後台仍可使用。', 'Chưa bắt đầu quản lý; dữ liệu gốc vẫn sử dụng được.')}</div>`
        : `<nav class="rf-tabs">${[
            ['sources', t('應檢項目', 'Hạng mục cần kiểm tra')],
            ['jobs', t('應檢清單', 'Lịch cần kiểm tra')],
            ['plans', t('檢查計畫', 'Kế hoạch kiểm tra')],
            ['reports', t('報告與申請', 'Báo cáo & đề nghị')],
            ['cases', t('異常追蹤', 'Theo dõi bất thường')],
            ['history', t('搜尋與歷史', 'Tìm kiếm & lịch sử')],
          ]
            .map(
              ([v, l]) =>
                `<button data-tab="${v}" class="${s.tab === v ? 'active' : ''}">${l}</button>`,
            )
            .join('')}</nav>${s.tab === 'sources' ? sourcePicker() : s.tab === 'history' && historySearch ? historySearch.html() : `<div class="rf-stats">${[
            [
              'jobs',
              t('尚待完成', 'Chưa hoàn thành'),
              c.jobs.filter((j) => !j.completion).length,
              'blue',
            ],
            ['documents', t('待審核', 'Chờ duyệt'), pending, 'amber'],
            ['cases', t('異常未結案', 'Bất thường chưa đóng'), open, 'red'],
            ['overdue', t('已逾期', 'Quá hạn'), overdue, 'red'],
          ]
            .map(
              ([a, l, n, tone]) =>
                `<button class="rf-stat" data-stat="${a}" data-tone="${tone}" aria-pressed="${s.highlight === a}"><span>${l}</span><strong>${n}</strong></button>`,
            )
            .join(
              '',
            )}</div>${!c.startDate ? `<div class="rf-notice">${t('尚未開始管理。設定管理起始日並預覽後，才會產生應檢工作。', 'Chưa bắt đầu quản lý. Thiết lập ngày bắt đầu và xem trước lịch.')} ${btn('settings', t('設定起始日', 'Thiết lập ngày'), !p.settings)}</div>` : ''}${routineErrorBanner()}${frequencyNotice()}${quickFilters()}${filters()}<div class="rf-layout ${s.wide ? 'rf-wide' : ''} ${s.selected ? 'has-selection' : ''}"><section class="rf-panel rf-list-panel">${list()}</section><section class="rf-panel rf-detail-panel ${s.tab === 'jobs' && !s.selected ? 'rf-selection-panel' : ''}"><div class="rf-detail">${btn('back', t('← 返回清單', '← Về danh sách'), false, 'rf-back')}${detail()}</div></section></div><p class="rf-footer-note">Asia/Ho_Chi_Minh · ${t('涵蓋產品與實測樣品分開記錄。歷史以當次正式快照為準。', 'Sản phẩm bao phủ và mẫu thực thử được lưu riêng; lịch sử dùng bản chụp đã duyệt.')}</p>`}`
    }</div>`;
    bind();guardDocumentCallbacks();
    if (s.tab === 'history' && historySearch) historySearch.bind(root);
    else mountDraft();
    root.querySelectorAll('button').forEach((b) => {
      if (s.busy || generationRefresh?.current()) b.disabled = true;
    });
    restoreView();
  }
  const calendarMode = () => data?.control.calendarPolicy?.version === 2;
  const calendarSetupAvailable = () => {
    const c = data?.control;
    return !!c && !c.startDate && !c.calendarPolicy && !c.jobs.length && !c.documents.length && !c.cases.length;
  };
  function calendarSetup() {
    if (!calendarSetupAvailable()){
      if(!calendarMode()||!['sources','jobs'].includes(s.tab))return '';
      if(data.control.jobs.length)return `<details class="rf-source-readiness"><summary>${t('查看 FQC 排程來源','Xem nguồn lập lịch FQC')}</summary>${calendarReadiness()}</details>`;
      return `<section class="rf-empty">${data.control.startDate>data.today?`<p>${t('尚未到開始日期','Chưa đến ngày bắt đầu')} · ${h(data.control.startDate)}</p>`:''}${calendarReadiness()}</section>`;
    }
    return `<section class="rf-empty rf-calendar-setup">
      <h3>${t('FQC 排程尚未啟動','Lịch FQC chưa bắt đầu')}</h3>
      <p>${t('設定開始日期後，依已核准的時間頻率與指定產品產生期別。','Sau khi đặt ngày bắt đầu, hệ thống tạo kỳ theo tần suất đã duyệt và sản phẩm được gán.')}</p>
      ${calendarReadiness()}
      ${data.permissions.settings && data.permissions.edit ? '' : `<p>${t('請由有排程設定權限的使用者設定開始日期。','Nhờ người có quyền thiết lập lịch đặt ngày bắt đầu.')}</p>`}
    </section>`;
  }
  function startDateLocked() {
    const {startDate, calendarPolicy, documents, cases, jobs} = data.control;
    return !!(documents.length || cases.length || (calendarPolicy && startDate) || jobs.some(j => j.planId || j.completion));
  }
  function calendarAdministration() {
    if (!data.permissions.view) return '';
    const {startDate} = data.control;
    const locked = startDateLocked(), allowed=data.identity.role==='admin'&&data.permissions.settings&&data.permissions.edit;
    return `<details class="rf-fqc-administration" ${calendarSetupAvailable() ? 'open' : ''}>
      <summary>${t('FQC 特殊功能','Chức năng đặc biệt FQC')}</summary>
      <p>${t('開始日期','Ngày bắt đầu')}：${h(startDate || t('尚未啟動','Chưa bắt đầu'))}</p>
      ${btn('settings', locked ? t('已啟動 · 日期鎖定','Đã khởi động · Khóa ngày') : t('設定開始日期並啟動','Đặt ngày bắt đầu và khởi động'),locked||!allowed,'primary')}
      ${!allowed?`<small>${t(data.identity.role!=='admin'?'僅 Admin 可操作':'缺少模組設定權限',data.identity.role!=='admin'?'Chỉ Admin được sử dụng':'Thiếu quyền thiết lập mô-đun')}</small>`:''}
      ${locked ? `<small>${t('既有排程的開始日期已鎖定。頻率請在資料後台 FQC 變更並送審。','Ngày bắt đầu của lịch hiện có đã khóa. Thay đổi tần suất tại Quản lý dữ liệu FQC rồi gửi duyệt.')}</small>` : ''}
    </details>`;
  }
  const pendingWaiver = j => docs().find(d => !d.cancelled && d.flow.pendingId && d.waiverRetests?.jobIds.includes(j.id));
  const arrangeable = j => !!j.calendar && !j.planId && !j.completion && !j.calendar.stopped && !j.calendar.requestId && !pendingWaiver(j) && (!!j.calendar.retestCaseId || j.end >= data.today);
  const requestName = kind => ({disposal:t('申請處置','Đề nghị xử lý'),waiver:t('異常免做申請','Đề nghị miễn xử lý bất thường'),skip:t('免測／跳過申請','Đề nghị miễn kiểm tra / bỏ qua'),retest:t('再測申請','Đề nghị thử lại'),void:t('作廢申請','Đề nghị hủy')})[kind] || label(kind);
  function periodLabel(j){const year=j.start.slice(0,4),month=Number(j.start.slice(5,7)),f=j.calendar?.frequency||j.source.frequency;return f==='yearly'?year+t(' 年',' năm'):f==='quarterly'?year+' · '+t('第 '+Math.ceil(month/3)+' 季（'+(Math.floor((month-1)/3)*3+1)+'–'+(Math.floor((month-1)/3)*3+3)+' 月）','Quý '+Math.ceil(month/3)):f==='semiannual'?year+' · '+(month<=6?t('上半年度','Nửa đầu năm'):t('下半年度','Nửa cuối năm')):f==='monthly'?year+' · '+t(month+' 月','Tháng '+month):j.start+' — '+j.end;}
  function periodClosureLabel(j) {
    const reports=approvedPeriodReports(j).map(r=>r.lines.flatMap(l=>l.results)),latest=reports.at(-1)||[];
    if(latest.length&&latest.every(r=>r.outcome==='pass')&&reports.slice(0,-1).some(rows=>rows.some(r=>r.outcome==='fail')))
      return t('曾經不合格 · 最終合格結案','Từng không đạt · Cuối cùng đạt và đã đóng');
    if(jobCases(j).some(a=>a.status==='disposed')||j.completion?.kind==='disposal'||latest.some(r=>r.outcome==='dispose'))
      return t('處置核准 · 已結案','Đã duyệt xử lý · Đã đóng');
    return t('已結案','Đã đóng');
  }
  function calendarStage(j) {
    if (j.calendar?.stopped) return ['neutral', t('已停止安排','Ngừng lập lịch')];
    if (pendingWaiver(j)) return ['pending',t('轉免做審核中','Đang duyệt chuyển miễn')];
    if (j.calendar?.requestId) return ['pending', t('跳過申請審核中','Đề nghị bỏ qua đang chờ duyệt')];
    const active = jobDocuments(j).filter(d => !d.cancelledJobIds?.includes(j.id) && blocksCurrentWork(d)).at(-1);
    if (active) {
      return [status(active) === 'pending' ? 'pending' : 'progress',
        reportLabel(active) + ' · ' + label(status(active))];
    }
    const abnormal = jobCases(j)[0];
    if (j.completion) {
      if(jobCases(j).some(a=>a.status==='disposed'))return ['done',periodClosureLabel(j)];
      if (abnormal && j.completion.kind !== 'skip') return [done(abnormal) ? 'done' : 'alert', ['closed','disposed'].includes(abnormal.status)?periodClosureLabel(j):label(abnormal.status)];
      if(['pass','disposal'].includes(j.completion.kind))return ['done',periodClosureLabel(j)];
      const complete = {skip:t('核准跳過','Đã duyệt bỏ qua'),waiver:t('核准免做','Đã duyệt miễn'),disposal:t('核准處置','Đã duyệt xử lý')};
      return ['done', complete[j.completion.kind] || t('本期流程已完成','Quy trình kỳ này đã hoàn tất')];
    }
    const plan = docs().find(d => d.id === j.planId && !d.cancelled);
    if (plan) return ['progress', t('計畫','Kế hoạch') + ' · ' + label(status(plan))];
    if (j.start > data.today) return ['neutral',t('下一期尚未開始','Kỳ tiếp theo chưa bắt đầu')];
    if (j.end < data.today && !j.planId && !j.calendar?.retestCaseId) return ['alert', t('已逾期 · 尚未建立計畫','Quá hạn · Chưa lập kế hoạch')];
    return ['ready',t('尚未建立計畫','Chưa lập kế hoạch')];
  }
  const expiredPlan = d => !!d&&d.kind==='plan'&&d.calendarVersion===2&&!d.retestApplicationCaseId&&!d.requestKind&&status(d)==='draft'&&d.flow.working.lines.some(line=>{const job=data.control.jobs.find(j=>j.id===line.jobId);return !!job?.calendar&&!job.calendar.retestCaseId&&!job.calendar.stopped&&!job.completion&&job.end<data.today;});
  const overduePeriod = j => !!j.calendar&&!j.calendar.retestCaseId&&!j.calendar.stopped&&!j.completion&&!openJobCases(j).length&&j.end<data.today&&!docs().some(d=>d.id===j.planId&&!d.cancelled&&['pending','approved'].includes(status(d)));
  function periodCurrentWork(j) {
    const value=periodCurrentWorkState(j);
    return overduePeriod(j)&&!value.stage.startsWith(t('已逾期','Quá hạn'))?{...value,tone:'alert',stage:t('已逾期 · ','Quá hạn · ')+value.stage,page:value.documentId?t('檢查計畫（唯讀）；下一期依原頻率安排','Kế hoạch (chỉ đọc); kỳ tiếp theo theo tần suất hiện có'):value.page}:value;
  }
  function periodCurrentWorkState(j) {
    const ids=periodLineage(j),jobs=data.control.jobs.filter(job=>ids.has(job.id)&&!job.calendar?.stopped);
    const related=docs().filter(d=>!d.cancelled&&content(d).lines.some(l=>ids.has(l.jobId)&&!d.cancelledJobIds?.includes(l.jobId)));
    const active=related.filter(blocksCurrentWork).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')).at(-1);
    if(active)return {tone:status(active)==='pending'?'pending':'progress',documentId:active.id,stage:(active.kind==='disposal'?t('申請處置結案','Đề nghị xử lý đóng hồ sơ'):reportLabel(active))+' · '+label(status(active)),page:active.retestApplicationCaseId?label(requestContext(active)):active.kind==='plan'&&!active.requestKind?t('檢查計畫','Kế hoạch kiểm tra'):active.kind==='report'?t('檢查報告','Báo cáo kiểm tra'):active.kind==='disposal'?t('異常處理','Xử lý bất thường'):active.requestKind==='retest'?t('不合格／異常處理','Không đạt / Xử lý bất thường'):t('檢查項目的申請紀錄','Hồ sơ đề nghị của hạng mục')};
    const ready=related.find(d=>d.kind==='plan'&&!d.requestKind&&status(d)==='approved'&&reportSlots(d).some(slot=>ids.has(slot.jobId)&&slot.assigned&&!slot.reportIds.length));
    if(ready)return {tab:'reports',tone:'progress',stage:t('檢查報告 · 待填寫','Báo cáo kiểm tra · Chờ nhập'),page:t('檢查報告','Báo cáo kiểm tra')};
    const unplanned=jobs.find(job=>job.calendar?.retestCaseId&&!job.planId&&!job.completion);
    if(unplanned)return {tone:'progress',stage:t('復測計畫 · 待安排','Kế hoạch thử lại · Chờ lập'),page:t('檢查計畫','Kế hoạch kiểm tra')};
    const a=openJobCases(j)[0];if(a)return {caseId:a.id,tone:'alert',stage:label(a.status),page:caseOutcome(a)==='fail'?t('不合格','Không đạt'):t('異常處理','Xử lý bất thường')};
    if(canSkipOverdue(j))return {tone:'alert',stage:t('已逾期 · 尚未建立計畫','Quá hạn · Chưa lập kế hoạch'),page:t('保留本期逾期紀錄；下一期依原頻率安排，無須處理本期才能繼續','Giữ lịch sử quá hạn kỳ này; kỳ tiếp theo theo tần suất hiện có, không cần xử lý kỳ này để tiếp tục')};
    const [tone,stage]=calendarStage(j);return {tone,stage,page:j.completion||j.calendar?.stopped?t('本列流程歷史（唯讀）','Lịch sử trong dòng này (chỉ đọc)'):t('檢查項目勾選後建立檢查計畫','Chọn hạng mục rồi tạo kế hoạch kiểm tra')};
  }
  function periodResultSequence(j) {
    const attempts=new Map();
    for(const report of approvedPeriodReports(j)){
      if(report.review.id!==report.doc.flow.active?.id)continue;
      let origin=report.doc;const seen=new Set();
      while(origin.correctionOf&&!seen.has(origin.id)){seen.add(origin.id);const prior=docs().find(d=>d.id===origin.correctionOf);if(!prior)break;origin=prior;}
      attempts.set(origin.id,report);
    }
    const rows=[...attempts.values()],ordinal=n=>['一','二','三','四','五','六','七','八','九','十'][n-1]||String(n);
    const results=rows.map((r,i)=>{const outcomes=[...new Set(r.lines.flatMap(l=>l.results.map(row=>row.outcome)))];return (rows.length>1?t('第'+ordinal(i+1)+'次','Lần '+(i+1)+' '):'')+(outcomes.length?outcomes.map(outcome=>outcome==='dispose'?t('處置核准','Đã duyệt xử lý'):label(outcome)||t('未記錄結果','Chưa ghi kết quả')).join(' / '):t('未記錄結果','Chưa ghi kết quả'))+(r.doc.correctionOf?t('（已更正）',' (đã sửa)'):'');});
    const closed=jobCases(j).some(a=>['closed','disposed'].includes(a.status))||['pass','disposal'].includes(j.completion?.kind);
    if(closed)results.push(periodClosureLabel(j));
    else if(j.completion?.kind==='skip')results.push(t('當期已核准跳過','Kỳ này đã được duyệt bỏ qua'));
    return results.join(t('，',', '))||t('尚無已核准正式結果','Chưa có kết quả chính thức được duyệt');
  }
  function periodSelectionReason(j) {
    if (!data.permissions.edit) return t('沒有編輯權限','Không có quyền chỉnh sửa');
    if (pendingWaiver(j)) return t('轉免做正在審核','Đang duyệt chuyển miễn');
    if (j.calendar?.requestId) return t('已有申請正在審核','Đã có đề nghị đang chờ duyệt');
    if (j.calendar?.stopped) return t('工作已停止','Công việc đã dừng');
    if (j.completion && openJobCases(j).length)
      return t('已有流程，請由接續頁面繼續','Đã có quy trình, tiếp tục tại trang được chỉ dẫn');
    if (j.completion) return t('此期已有處理紀錄','Kỳ này đã được xử lý');
    if(overduePeriod(j))return t('已逾期，本期不能新建、修改或重新送審','Quá hạn; không thể lập, sửa hoặc gửi duyệt lại kỳ này');
    if (j.planId) return t('已加入既有計畫','Đã có trong kế hoạch hiện tại');
    if (!j.calendar) return t('歷史紀錄僅供查看','Lịch sử chỉ được xem');
    if (!arrangeable(j)) return t('週期已結束，無法新建計畫','Kỳ đã kết thúc, không thể lập kế hoạch');
    return '';
  }
  function calendarTransition(jobs){
    const scope=jobs.find(j=>j.calendar)?.calendar.scope,policy=data.control.calendarPolicy.scopes[scope];
    if(!policy)return '';
    const gap=policy.from>data.today&&!policy.until,overlap=jobs.some(j=>j.planId&&j.source.frequency!==policy.source.frequency);
    return `${gap?`<p class="rf-notice">${t('頻率轉換期間，無須另排；新週期開始：','Giai đoạn đổi tần suất, không cần lập thêm; kỳ mới bắt đầu: ')}${h(policy.from)}</p>`:''}${overlap?`<p class="rf-notice">${t('既有計畫保留原標準；新頻率任務另行安排，不能互相抵扣。','Giữ tiêu chuẩn cũ cho kế hoạch đã lập; lập riêng công việc tần suất mới, không thay thế lẫn nhau.')}</p>`:''}`;
  }
  const jobCases = j => data.control.cases.filter(a=>a.jobId===j.id||a.lineageJobIds?.includes(j.id)||a.id===j.calendar?.retestCaseId);
  const openJobCases = j => jobCases(j).filter(a=>!done(a));
  const legacyCalendarFollowup = d => calendarMode() &&
    (d.kind === 'waiver' || d.kind === 'disposal' && d.disposalPolicy !== 'skip-period');
  const blocksCurrentWork = d => !d.cancelled && status(d)!=='approved' &&
    (!legacyCalendarFollowup(d) || !!d.flow.pendingId);
  const jobDocuments = j => docs().filter(d=>content(d).lines.some(l=>l.jobId===j.id));
  const periodFinished = j => !!(j.completion||j.calendar?.stopped)&&!openJobCases(j).length&&!jobDocuments(j).some(d=>!d.cancelled&&!d.cancelledJobIds?.includes(j.id)&&blocksCurrentWork(d));
  const canExempt = j => !!j&&arrangeable(j)&&j.start<=data.today&&j.end>=data.today&&!j.calendar.retestCaseId&&!openJobCases(j).length;
  const canSkipOverdue = j => !!j?.calendar&&!j.planId&&!j.completion&&!j.calendar.stopped&&!j.calendar.requestId&&!j.calendar.retestCaseId&&j.end<data.today&&!openJobCases(j).length;
  function periodLineage(j){
    const itemCases=jobCases(j),caseIds=new Set(itemCases.map(a=>a.id));
    return new Set([j.id,...itemCases.flatMap(a=>[a.jobId,...(a.lineageJobIds || [])]),
      ...data.control.jobs.filter(other=>other.calendar?.originJobId===j.id||caseIds.has(other.calendar?.retestCaseId)).map(other=>other.id)]);
  }
  const hasPeriodLines = snapshot => Array.isArray(snapshot?.lines);
  function periodReviewSnapshot(d, review) {
    if (hasPeriodLines(review.content)) return review.content;
    // Normal entry defers terminal case bodies. The active snapshot is
    // already hydrated and belongs only to the exact matching review.
    return review.id === d.flow.active?.id ? d.flow.active.content : null;
  }
  function approvedPeriodReports(j, includeRetests = true) {
    const ids=includeRetests&&!j.calendar?.retestCaseId?periodLineage(j):new Set([j.id]);
    return docs().flatMap(d => {
      if(d.cancelled||d.kind!=='report')return [];
      const active=d.flow.active;
      const approvals=d.flow.cases.filter(review=>review.status==='approved'&&review.id!==active?.id);
      if(active?.id)approvals.push({id:active.id,content:active.content,
        result:d.flow.cases.find(review=>review.id===active.id)?.result});
      return approvals.flatMap(review=>{
        if (!hasPeriodLines(review.content)) return [];
        const lines=review.content.lines.filter(l=>ids.has(l.jobId)&&!d.cancelledJobIds?.includes(l.jobId));
        return lines.length?[{doc:d,review,lines}]:[];
      });
    }).sort((a,b)=>(a.review.result?.at||a.doc.createdAt||'').localeCompare(b.review.result?.at||b.doc.createdAt||''));
  }
  const dateMatchesPeriod = j => (!s.periodFrom||j.end>=s.periodFrom)&&(!s.periodTo||j.start<=s.periodTo);
  const periodFiltersActive = () => !!(s.periodFrom||s.periodTo||s.periodOutcome);
  function matchesPeriodOutcome(j) {
    if(!s.periodOutcome)return true;
    // Result filters list the origin period once. Its timeline includes all retests.
    if(j.calendar?.retestCaseId)return false;
    const reports=approvedPeriodReports(j);
    const failures=reports.filter(r=>r.lines.some(l=>l.results.some(row=>row.outcome==='fail')));
    if(s.periodOutcome==='ever-fail')return failures.length>0;
    const cases=jobCases(j).filter(item=>item.jobId===j.id);
    const proofAt=(report,item,outcome)=>report.review.result?.at||
      item.events?.find(event=>event.documentId===report.doc.id&&event.action===outcome)?.at;
    const before=(first,last)=>Number.isFinite(Date.parse(first))&&Number.isFinite(Date.parse(last))&&Date.parse(first)<Date.parse(last);
    for(const item of cases){
      const related=new Set([item.originReportId,...(item.reportIds||[])]);
      const prior=failures.filter(r=>related.has(r.doc.id));
      if(!prior.length)continue;
      const retestJobs=new Set([...(item.lineageJobIds||[]),
        ...data.control.jobs.filter(job=>job.calendar?.retestCaseId===item.id).map(job=>job.id)]);
      const order=item.reportIds||[];
      const ordered=(first,last)=>first.doc.id!==last.doc.id&&order.indexOf(first.doc.id)>=0&&order.indexOf(last.doc.id)>order.indexOf(first.doc.id);
      const retestLines=r=>r.doc.correctionOf||!related.has(r.doc.id)?[]:
        r.lines.filter(line=>retestJobs.has(line.jobId)||
          r.doc.caseId===item.id&&r.doc.id!==item.originReportId&&!!r.doc.planId&&line.jobId===item.jobId);
      if(s.periodOutcome==='retest-pass'){
        const resolved=reports.some(r=>{
          const lines=retestLines(r);
          if(!lines.length||!lines.every(line=>line.results.length&&line.results.every(row=>row.outcome==='pass')))return false;
          const passedSamples=new Set(lines.flatMap(line=>line.results.flatMap(row=>row.samples||[])));
          const passAt=proofAt(r,item,'pass');
          return prior.some(failed=>{
            const overlap=failed.lines.some(line=>line.results.some(row=>row.outcome==='fail'&&
              row.samples?.some(sample=>passedSamples.has(sample))));
            const failAt=proofAt(failed,item,'fail');
            return overlap&&(before(failAt,passAt)||(!(failAt&&passAt)&&ordered(failed,r)));
          });
        });
        if(resolved)return true;
      }else if(s.periodOutcome==='disposed-after-fail'){
        const retestDisposal=reports.some(report=>{
          if(!retestLines(report).some(line=>line.results.length===1&&line.results[0].outcome==='dispose'))return false;
          const disposalAt=proofAt(report,item,'dispose');
          return prior.some(failed=>{
            const failAt=proofAt(failed,item,'fail');
            return before(failAt,disposalAt)||(!(failAt&&disposalAt)&&ordered(failed,report));
          });
        });
        if(retestDisposal)return true;
        const resolved=docs().some(d=>{
          if(d.kind!=='disposal'||d.cancelled||d.caseId!==item.id||
            !d.flow.active.id||!d.flow.active.content.lines.some(line=>line.jobId===item.jobId))return false;
          const disposedAt=d.flow.cases.find(review=>review.id===d.flow.active.id)?.result?.at||
            item.events?.find(event=>event.documentId===d.id&&event.action==='disposal')?.at;
          return prior.some(failed=>before(proofAt(failed,item,'fail'),disposedAt));
        });
        if(resolved)return true;
      }
    }
    return false;
  }
  const historyActions = {
    returned: ['已退回','Đã trả lại'],
    withdrawn: ['已撤回','Đã rút'],
    'retest-request-approved': ['再測申請核准','Đã duyệt đề nghị thử lại'],
    'report-correction-closed': ['報告更正後結案','Đã đóng sau khi sửa báo cáo'],
    'discard-draft': ['已捨棄草稿','Đã bỏ bản nháp'],
    'approved-waiver': ['核准免做','Đã duyệt miễn'],
    'approved-void': ['核准作廢','Đã duyệt hủy'],
    dispose: ['報告核准 · 處置結案','Đã duyệt báo cáo · Đóng xử lý'],
  };
  function historyAction(code) {
    const [kind, ...reference] = String(code || '').split(':');
    const title = Object.hasOwn(historyActions,kind) ? t(...historyActions[kind]) : Object.hasOwn(labels,kind) ? label(kind) : kind;
    return reference.length ? title + ' · ' + reference.join(':') : title;
  }
  function periodHistory(j) {
    if(!data.permissions.history)return '';
    const lineage = periodLineage(j);
    const contains = value => hasPeriodLines(value) && value.lines.some(line => lineage.has(line.jobId));
    const documents = docs().filter(d=>[d.flow.working,d.flow.saved?.content,d.flow.active?.content,
      ...d.flow.cases.map(review=>periodReviewSnapshot(d,review))].some(contains));
    const events = [];
    for(const d of documents){
      events.push({doc:d,at:d.createdAt,title:reportLabel(d),actor:d.owner});
      for(const review of d.flow.cases){
        if(!contains(periodReviewSnapshot(d,review)))continue;
        events.push({doc:d,review,at:review.at,title:t('送出審核','Gửi duyệt'),actor:review.actor,reason:review.reason});
        if(review.result)events.push({doc:d,review,title:historyAction(review.status),...review.result});
      }
      for(const event of d.lifecycle||[]) events.push({doc:d,...event,title:historyAction(event.action)});
    }
    for(const item of jobCases(j))for(const event of item.events || []){
      if(event.documentId && documents.some(d=>d.id===event.documentId))continue;
      events.push({...event,title:[item.number,historyAction(event.action)].filter(Boolean).join(' · ')});
    }
    events.sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));
    return `<details class="rf-period-history"><summary>${t('流程歷史與結果（唯讀）','Lịch sử và kết quả (chỉ đọc)')}</summary><div class="rf-period-history-body">${events.length
      ? `<ol class="rf-period-events">${events.map(({doc,review,at,title,actor,reason})=>`<li>
        <time datetime="${h(at||'')}">${h(displayDateTime(at))}</time><strong>${h(title)}</strong>
        ${doc?`<button type="button" class="rf-btn" data-timeline-doc="${h(doc.id)}" data-timeline-review="${h(review?.id||'')}" data-timeline-job="${h(j.id)}" aria-haspopup="dialog">${h(displayNumber(doc))}</button>`:''}
        ${actor?.name?`<small>${h(actor.name)}</small>`:''}${reason?`<p>${h(reason)}</p>`:''}
      </li>`).join('')}</ol>`
      : `<p>${t('此期尚無流程紀錄','Kỳ này chưa có lịch sử')}</p>`}</div></details>`;
  }
  function historyDocumentBody(d, snapshot, lineage, stamp){
    const field = (name,value) => value ? `<div><dt>${name}</dt><dd>${h(value)}</dd></div>` : '';
    const row = (l,r) => `<li><strong>${h(label(r.outcome))}</strong>${r.samples?.length?`<span>${h(sampleNames(l,r.samples))}</span>`:''} ${r.value?`<p>${h(r.value)}</p>`:''}${r.disposalReason?`<p>${t('處置原因','Lý do xử lý')} · ${h(r.disposalReason)}</p>`:''}${r.notes?`<p>${h(r.notes)}</p>`:''}<div class="rf-photos">${(r.photos||[]).map(photo).join('')}</div></li>`;
    return `<section class="rf-history-snapshot"><h3>${h(snapshot.title||displayNumber(d))}</h3>
      <p>${h(reportLabel(d))} · ${h(stamp)}</p>
      <dl class="rf-plan-facts">
      ${field(t('來源計畫','Kế hoạch nguồn'),d.kind==='report'&&d.planId?linkedPlanNumber(d):'')}
      ${field(t('計畫起日','Ngày bắt đầu'),snapshot.planStart)}${field(t('計畫迄日','Hạn kết thúc'),snapshot.planEnd)}
      ${field(t('檢查日期','Ngày kiểm tra'),snapshot.date)}${field(t('原因','Lý do'),snapshot.reason)}
      ${field(t('問題說明／處置','Vấn đề / xử lý'),snapshot.disposition)}
      ${field(t('實際處理結果','Kết quả xử lý thực tế'),snapshot.dispositionResult)}
      ${field(t('下次檢查日期','Ngày kiểm tra tiếp theo'),snapshot.nextDate)}
      ${field(t('跳過原因','Lý do bỏ qua'),snapshot.skipReason)}${field(t('逾期原因','Lý do quá hạn'),snapshot.overdueReason)}
      ${field(t('備註','Ghi chú'),snapshot.notes)}</dl>
      ${snapshot.lines.filter(l=>!lineage||lineage.has(l.jobId)).map(l=>`<article class="rf-period-record"><header><strong>${h(l.source.name)}</strong><small>${h(l.source.code)} · ${t('版本','Phiên bản')} ${h(l.source.version)}</small></header>
      <p>${h(l.source.description)}</p>${l.results.length?`<ol>${l.results.map(r=>row(l,r)).join('')}</ol>`:''}</article>`).join('')}
      <div class="rf-photos">${(snapshot.evidence||[]).map(photo).join('')}</div></section>`;
  }
  function openTimelineDocument(button){
    if(!data.permissions.view || !data.permissions.history || s.dialogOpen || !button.isConnected)return;
    const d=docs().find(doc=>doc.id===button.dataset.timelineDoc);
    if(!d)return;
    const entry=button.dataset.timelineReview;
    const review=entry?d.flow.cases.find(item=>item.id===entry):null;
    const job=data.control.jobs.find(item=>item.id===button.dataset.timelineJob);
    if(entry&&!review || button.dataset.timelineJob&&!job)return;
    const formal=button.hasAttribute('data-timeline-formal');
    if(formal&&!d.flow.active.id)return;
    const snapshot=formal?d.flow.active.content:review?periodReviewSnapshot(d,review):content(d);
    const lineage=job?periodLineage(job):null;
    if(!hasPeriodLines(snapshot) || lineage&&!snapshot.lines.some(l=>lineage.has(l.jobId)))return;
    const el=document.createElement('dialog'),title=displayNumber(d)+' · '+t('唯讀明細','Chi tiết chỉ đọc');
    s.dialogOpen=true;
    el.className='rf-modal rf-timeline-dialog';
    el.dataset.i18nSkip='true';
    el.setAttribute('aria-label',title);
    el.innerHTML=`<header><h2>${h(title)}</h2><button type="button" data-cancel class="rf-btn">${t('返回列表','Về danh sách')}</button></header>${historyDocumentBody(d,snapshot,lineage,formal?label('approved'):entry?label(review.status):t('目前留存版本','Phiên bản hiện lưu')+' · '+label(status(d)))}`;
    const close=()=>{s.dialogOpen=false;el.close();el.remove();if(button.isConnected)button.focus({preventScroll:true});};
    el.querySelector('[data-cancel]').onclick=close;
    el.oncancel=event=>{event.preventDefault();close();};
    document.body.append(el);
    el.showModal();
  }
  const periodGroupKey = j => j.calendar?.scope || JSON.stringify([
    j.source.line,
    j.source.products.length === 1 ? j.source.products[0].code : j.source.products.map(p => p.code),
    j.itemId,
  ]);
  const periodKey = j => j.start + ':' + j.end;
  const periodsPerPage = 6;
  function calendarPeriodGroups() {
    const normalized = s.periodSearch.trim().normalize('NFKC').toLocaleLowerCase();
    const groups = new Map();
    for (const j of data.control.jobs) {
      // Retest attempts belong to the original period row; retain orphan history visibly.
      const origin=j.calendar?.originJobId||data.control.cases.find(a=>a.id===j.calendar?.retestCaseId)?.jobId;
      if(j.calendar?.retestCaseId&&data.control.jobs.some(parent=>parent.id===origin&&parent.id!==j.id))continue;
      const {source} = j;
      if (!(j.calendar || j.planId || j.completion) || !dateMatchesPeriod(j) || !matchesPeriodOutcome(j) ||
        s.sourceLine && source.line !== s.sourceLine ||
        s.sourceCategory && source.category !== s.sourceCategory ||
        s.sourceProduct && !source.products.some(p => p.code === s.sourceProduct)) continue;
      const searchText = [source.name,source.code,source.line,source.category,...source.products.flatMap(p => [p.code,p.name])]
        .join(' ').normalize('NFKC').toLocaleLowerCase();
      if (normalized && !normalized.split(/\s+/).every(word => searchText.includes(word))) continue;
      const key = periodGroupKey(j);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(j);
    }
    return groups;
  }

  function calendarWorkTable() {
    const groups = [...calendarPeriodGroups()];
    const labels=[['',t('全部結果','Tất cả kết quả')],
      ['ever-fail',t('曾有不合格','Từng không đạt')],
      ['retest-pass',t('不合格後復測合格','Thử lại đạt sau khi không đạt')],
      ['disposed-after-fail',t('不合格後處置結案','Đã xử lý và đóng sau khi không đạt')]];
    const dateInput=(name,label,value)=>`<label>${label}<input type="date" name="${name}" value="${h(value)}"></label>`;
    const controls = `<form class="rf-period-search" data-period-search>
      <label class="rf-period-query">${t('搜尋檢查項目','Tìm hạng mục kiểm tra')}
      <input name="query" type="search" value="${h(s.periodSearch)}" placeholder="${t('項目名稱、項目或產品編號','Tên hạng mục, mã hạng mục hoặc sản phẩm')}"></label>
      ${dateInput('from',t('檢查期別自','Kỳ kiểm tra từ'),s.periodFrom)}
      ${dateInput('to',t('檢查期別至','Kỳ kiểm tra đến'),s.periodTo)}
      <label class="rf-period-outcome">${t('歷史結果','Kết quả lịch sử')}<select name="outcome">${labels.map(([value,label])=>
        `<option value="${value}" ${value===s.periodOutcome?'selected':''}>${label}</option>`).join('')}</select></label>
      <div class="rf-period-filter-actions">
        <button class="rf-btn" type="submit">${t('搜尋','Tìm')}</button>
        ${s.periodSearch||periodFiltersActive()||s.sourceLine||s.sourceCategory||s.sourceProduct?`<button class="rf-btn" type="button" data-period-search-reset>${t('清除篩選','Xóa bộ lọc')}</button>`:''}
      </div><p data-period-filter-error role="alert" hidden></p>
    </form>${periodFiltersActive()?`<p class="rf-period-match">${t('符合篩選','Khớp bộ lọc')} · ${groups.length} ${t('項','hạng mục')}</p>`:''}`;
    return controls + `<div class="rf-calendar-work">${groups.map(([key,jobs])=>calendarPeriodGroup(key,jobs)).join('') ||
      `<div class="rf-empty">${t('此範圍沒有項目','Không có hạng mục trong phạm vi này')}</div>`}</div>`;
  }

  function readablePeriodText(value,limit=140){const text=String(value||'');return text.length>limit?`<details class="rf-long-text"><summary>${h(text.slice(0,limit))}… <span>${t('展開全文','Xem đầy đủ')}</span></summary><p>${h(text)}</p></details>`:h(text);}
  function calendarPeriodGroup(key, jobs) {
    jobs.sort((a,b) => b.start.localeCompare(a.start) || b.end.localeCompare(a.end));
    const filtered=periodFiltersActive();
    const byPeriod = [...new Set(jobs.filter(j => j.start <= data.today).map(periodKey))];
    const recent=new Set(byPeriod.slice(0,2));
    const current=jobs.find(j=>j.start<=data.today&&j.end>=data.today&&!j.calendar?.retestCaseId&&!j.calendar?.stopped);
    const previous=jobs.find(j=>{if(!current||j.end>=data.today||j.calendar?.retestCaseId)return false;const next=new Date(j.end+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);return Number.isFinite(next.getTime())&&next.toISOString().slice(0,10)===current.start;});
    const previousKey=previous?periodKey(previous):null;
    const currentKey=current?periodKey(current):byPeriod[0]||periodKey(jobs[0]);
    const unfinished=new Set(jobs.filter(j=>!periodFinished(j)&&!overduePeriod(j)));
    const visible=filtered?jobs:jobs.filter(j=>unfinished.has(j)||!periodSelectionReason(j)||periodKey(j)===currentKey||periodKey(j)===previousKey);
    const shown=new Set(visible);
    const older=filtered?[]:jobs.filter(j=>!shown.has(j));
    const candidates=filtered?visible:jobs;
    const latest=candidates.find(j=>j.start<=data.today&&!j.calendar?.stopped)||candidates.find(j=>j.start<=data.today)||jobs[0];
    const source=latest.source,{tone,stage}=periodCurrentWork(latest),expanded=s.periodExpanded.has(key);
    const sourceMeta=source.code+' · '+source.line+' / '+source.category,longSource=source.name.length>64||sourceMeta.length>100;
    const fullSource=longSource?`<details class="rf-period-source-full"><summary>${t('完整項目名稱與標準','Tên hạng mục và tiêu chuẩn đầy đủ')}</summary><p>${h(source.name)}</p><p>${h(sourceMeta)}</p></details>`:'';
    const selectionCount=jobs.filter(j=>s.checked.has(j.id)).length;
    const openOlder=filtered?[]:[...new Map([...unfinished].filter(j=>!recent.has(periodKey(j)))
      .flatMap(openJobCases).map(item=>[item.id,item])).values()];
    const olderAlerts=openOlder.length?`<div class="rf-period-older-alert"><strong>${t('較早期別有未結案異常','Kỳ trước có bất thường chưa đóng')}</strong>
      ${openOlder.map(item=>`<button class="rf-btn" data-case="${h(item.id)}">${h(item.number||item.id)} · ${h(label(item.status))}</button>`).join('')}
    </div>`:'';
    const showPage=(rows,limit)=>{
      const inPage=new Set([...new Set(rows.map(periodKey))].slice(0,limit));
      return rows.filter(j=>inPage.has(periodKey(j))).map(periodRow).join('');
    };
    const count=s.periodMore.get(key)||0,matchedCount=Math.max(periodsPerPage,count);
    const more=`<button class="rf-btn" data-period-more="${h(key)}">${t('載入更多','Xem thêm')}</button>`;
    const olderCount=new Set(older.map(periodKey)).size;
    const periodCount=new Set([...(filtered?visible:unfinished)].map(periodKey)).size;
    const collapseLabel=t('收合更早期別','Thu gọn các kỳ trước');
    const olderLabel=count?collapseLabel:t('顯示更多之前的列表','Hiển thị thêm danh sách trước đây')+' · '+olderCount;
    const body=!expanded?'':filtered
      ? showPage(visible,matchedCount)+(periodCount>matchedCount?more:'')
      : calendarTransition(jobs)+visible.map(periodRow).join('')+(olderCount?`<section class="rf-period-older">
        <div class="rf-period-older-actions">
          <button class="rf-btn" data-period-older-toggle="${h(key)}" aria-expanded="${count>0}">${olderLabel}</button>
        </div>
        ${count?showPage(older,count)+`<div class="rf-period-older-actions">
          ${olderCount>count?more:''}<button class="rf-btn" data-period-older-close="${h(key)}">${collapseLabel}</button>
        </div>`:''}
      </section>`:'');
    const countLabel=filtered?t('符合','Khớp'):t('待處理','Cần xử lý');
    return `<article class="rf-calendar-card rf-period-group" data-period-group="${h(key)}">
      <button class="rf-period-group-toggle" data-period-toggle="${h(key)}" aria-expanded="${expanded}">
        <span class="rf-period-group-title"><strong>${h(source.name.length>64?source.name.slice(0,64)+'…':source.name)}</strong><small>${h(sourceMeta.length>100?sourceMeta.slice(0,100)+'…':sourceMeta)}</small></span>
        <span class="rf-period-group-summary">
          <span>${countLabel} ${periodCount} ${t('期','kỳ')}</span>
          <span class="rf-period-chip ${tone}">${t('最新狀態','Mới nhất')} · ${h(stage)}</span>
          <span class="${selectionCount?'rf-period-picked':''}">${t('已選','Đã chọn')} ${selectionCount}</span>
        </span><span class="rf-period-chevron" aria-hidden="true">${expanded?'▴':'▾'}</span>
      </button>${fullSource}${olderAlerts}${body}
    </article>`;
  }

  function periodRow(j) {
    const reason=periodSelectionReason(j),reasonId='rf-period-lock-'+j.id,current=periodCurrentWork(j);
    return `<section class="rf-calendar-period rf-period-single" data-period-id="${h(j.id)}">
      <label class="rf-period-choice ${reason?'is-locked':''}">
        <input type="checkbox" data-job="${h(j.id)}" ${reason?`disabled aria-describedby="${h(reasonId)}"`:s.checked.has(j.id)?'checked':''}>
        <span class="rf-period-overview"><b>${h(periodLabel(j))}</b><span class="rf-period-lock" id="${h(reasonId)}">${reason?t('不可勾選','Không thể chọn')+' · '+h(reason):t('可勾選','Có thể chọn')}</span></span>
      </label>
      <div class="rf-period-location"><small>${t('目前狀態','Trạng thái hiện tại')}</small><span class="rf-period-chip ${current.tone}">${h(current.stage)}</span>${current.page?`<span>${t('接續頁面','Trang tiếp tục')}：${current.documentId?`<a href="#routine-document" class="rf-location-link" data-doc="${h(current.documentId)}">${h(current.page)}</a>`:current.caseId?`<button class="rf-btn rf-location-link" data-case="${h(current.caseId)}">${h(current.page)}</button>`:current.tab?`<button class="rf-btn rf-location-link" data-tab="${h(current.tab)}">${h(current.page)}</button>`:h(current.page)}</span>`:''}</div>
      <div class="rf-period-results"><small>${t('核准結果與結案','Kết quả đã duyệt và đóng hồ sơ')}</small><div>${readablePeriodText(periodResultSequence(j))}</div></div>
      ${s.tab==='sources'&&canExempt(j)?`<div class="rf-period-exemption"><button class="rf-btn" data-period-exempt="${h(j.id)}" ${data.permissions.edit?'':'disabled'}>${t('申請當期免測','Xin miễn kiểm tra kỳ này')}</button></div>`:''}
      ${periodHistory(j)}
    </section>`;
  }
  function approvedSourcePlan(d) {
    return d.kind === 'report' && d.planId
      ? docs().find(plan => plan.id === d.planId && plan.flow.active?.id)
      : null;
  }

  function integratedPlan(d) {
    if (d.kind !== 'report' || !d.planId) return '';
    const plan = approvedSourcePlan(d), snapshot = plan?.flow.active.content;
    const number = plan ? displayNumber(plan) : d.planId;
    const heading = '<h4>' + t('本報告的核准計畫','Kế hoạch đã duyệt của báo cáo') + '</h4>';
    if (!snapshot) return `<section class="rf-calendar-fields rf-integrated-plan">${heading}<strong>${h(number)}</strong><p>${t('原計畫快照未載入；不推測內容','Chưa tải bản chụp kế hoạch; không suy đoán nội dung')}</p></section>`;
    const dates = snapshot.planStart || snapshot.planEnd
      ? `${h(snapshot.planStart || '—')} – ${h(snapshot.planEnd || '—')}`
      : t('未記錄計畫起迄','Chưa ghi thời hạn kế hoạch');
    const title = snapshot.title && ![number,plan.number].includes(snapshot.title) ? `<p>${h(snapshot.title)}</p>` : '';
    const items = snapshot.lines.map(line => {
      const job = data.control.jobs.find(job => job.id === line.jobId);
      const standard = t('標準版本','Phiên bản tiêu chuẩn') + ' ' + (line.source.version || line.source.versionId || '—');
      const period = job?.start ? ' · ' + periodLabel(job) : '';
      return `<li><strong>${h(line.source.name)}</strong><small>${h(line.source.line)}</small><small>${h(standard + period)}</small></li>`;
    }).join('');
    return `<section class="rf-calendar-fields rf-integrated-plan">
      <header>${heading}${tag('approved')}</header><strong class="rf-plan-reference">${h(number)}</strong>${title}
      <dl class="rf-plan-facts"><div><dt>${t('計畫起迄','Thời hạn kế hoạch')}</dt><dd>${dates}</dd></div><div><dt>${t('計畫建立者','Người lập kế hoạch')}</dt><dd>${h(plan.owner?.name || '—')}</dd></div></dl>
      ${items ? `<ol class="rf-plan-items">${items}</ol>` : ''}${snapshot.notes ? `<p>${h(snapshot.notes)}</p>` : ''}
    </section>`;
  }
  const caseOutcome = a => Object.hasOwn(a,'workflowOutcome') ? a.workflowOutcome : a.result;
  const caseTab = a => calendarMode()&&a&&caseOutcome(a)==='fail' ? 'failed' : 'cases';
  const caseRetestWork = a => data.control.jobs.filter(j=>j.calendar?.retestCaseId===a.id&&!j.completion&&!j.calendar.stopped);
  const caseRequest = a => docs().find(d=>(d.caseId===a.id||d.retestApplicationCaseId===a.id)&&blocksCurrentWork(d));
  const pendingCases = tab => data.control.cases.filter(a=>!done(a)&&!caseRetestWork(a).some(j=>!docs().some(d=>d.id===j.planId&&d.retestApplicationCaseId&&status(d)!=='approved'))&&caseTab(a)===tab);
  function caseCanRequest(a,kind){
    if(!a||done(a)||caseRequest(a)||caseRetestWork(a).length)return false;
    const outcome=caseOutcome(a),abnormal=['abnormal','unable'].includes(outcome);
    return kind==='retest' ? outcome==='fail'||abnormal : kind==='disposal'&&abnormal;
  }
  function calendarCaseList(tab){
    return `<div class="rf-calendar-document-list">${pendingCases(tab).map(a=>{
      const job=data.control.jobs.find(j=>j.id===a.jobId),result=caseOutcome(a);
      return `<button class="rf-calendar-document ${s.selected===a.id||doc()?.retestApplicationCaseId===a.id||doc()?.caseId===a.id?'selected':''}" data-case="${h(a.id)}">
        <strong>${h(a.number)}</strong><span>${h(job?.source.name||t('歷史項目','Hạng mục lịch sử'))}</span>
        <small>${job?h(periodLabel(job)):''}</small>
        <span>${result?h(label(result)):t('結果待確認','Cần xác nhận kết quả')} · ${h(caseRequest(a)?label(status(caseRequest(a))):label(a.status))}</span></button>`;
    }).join('')||`<p class="rf-empty">${t('目前沒有待處理項目','Hiện không có hạng mục cần xử lý')}</p>`}</div>`;
  }
  function reportReviewTag(d){
    const latest=d.flow.cases.at(-1);
    return status(d)==='draft'&&latest?.status==='returned'
      ? `<span class="rf-tag">${t('已退回 · 草稿','Đã trả lại · Bản nháp')}</span>` : tag(status(d));
  }
  function approvedReportRouting(d){
    if(!calendarMode()||d.kind!=='report'||status(d)!=='approved')return '';
    const lines=d.flow.active.content.lines.filter(l=>!d.cancelledJobIds?.includes(l.jobId));
    const groups=[['pass',t('合格 · 已更新檢查項目','Đạt · Đã cập nhật hạng mục')],
      ['fail',t('不合格','Không đạt')],['abnormal',t('異常處理','Xử lý bất thường')],['dispose',t('處置核准 · 已結案','Đã duyệt xử lý · Đã đóng')],
      ['unable',t('既有無法測試 · 異常處理','Hồ sơ cũ không thể thử · Xử lý bất thường')],
      ['unknown',t('舊結果需確認','Cần xác nhận kết quả cũ')]];
    const groupFor=line=>{
      const outcomes=new Set(line.results.map(r=>r.outcome));
      const outcome=outcomes.values().next().value;
      return outcomes.size===1&&['pass','fail','abnormal','unable','dispose'].includes(outcome)?outcome:'unknown';
    };
    return `<div class="rf-approved-routing">${groups.map(([key,title])=>{
      const matching=lines.filter(l=>groupFor(l)===key);
      return matching.length?`<section data-approved-result="${key}"><h4>${title}</h4><ul>${matching.map(l=>{
        const job=data.control.jobs.find(j=>j.id===l.jobId),linked=job&&jobCases(job).find(a=>!done(a));
        return `<li><b>${h(l.source.name)}</b>
          ${linked&&key!=='pass'?`<button class="rf-btn" data-case="${h(linked.id)}">${h(linked.number)}</button>`:''}</li>`;
      }).join('')}</ul></section>`:'';
    }).join('')}</div>`;
  }
  function approvedReportList() {
    const query = s.approvedReportQuery.normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const rows = docs().flatMap(d => d.kind === 'report' && d.flow.active.id
      ? [{d, snapshot:d.flow.active.content, review:d.flow.cases.find(item=>item.id===d.flow.active.id)}] : [])
      .filter(({d,snapshot}) => {
        if (!query.length) return true;
        const text = [d.number,displayNumber(d),linkedPlanNumber(d),snapshot.title,
          ...snapshot.lines.flatMap(line => [line.source.name,line.source.code,...line.source.products.flatMap(p=>[p.code,p.name])])]
          .join(' ').normalize('NFKC').toLocaleLowerCase();
        return query.every(term=>text.includes(term));
      }).sort((a,b) => String(b.review?.result?.at||'').localeCompare(String(a.review?.result?.at||'')) || b.d.number.localeCompare(a.d.number));
    return `<section class="rf-approved-list" aria-label="${t('已核准報告歷史','Lịch sử báo cáo đã duyệt')}">
      <form data-approved-report-search>
        <label>${t('搜尋報告、計畫、檢查項目或產品','Tìm báo cáo, kế hoạch, hạng mục hoặc sản phẩm')}
          <input type="search" name="query" value="${h(s.approvedReportQuery)}">
        </label><button class="rf-btn" type="submit">${t('搜尋','Tìm')}</button>
      </form>
      <p role="status">${t('符合報告','Báo cáo phù hợp')} · ${rows.length}</p>
      <div class="rf-calendar-document-list">${rows.slice(0,s.approvedReportLimit).map(({d,snapshot,review})=>`
        <button type="button" class="rf-calendar-document" data-approved-report data-timeline-doc="${h(d.id)}" data-timeline-formal aria-haspopup="dialog">
          <strong>${h(displayNumber(d))}</strong><span>${h(snapshot.title)}</span>
          <small>${t('來源計畫','Kế hoạch nguồn')} · ${h(linkedPlanNumber(d)||'—')}</small>
          <small>${t('核准時間','Duyệt lúc')} · ${h(displayDateTime(review?.result?.at))}</small>
        </button>`).join('')||`<p class="rf-empty">${t('找不到符合條件的核准報告','Không tìm thấy báo cáo đã duyệt phù hợp')}</p>`}</div>
      ${rows.length>s.approvedReportLimit?`<button class="rf-btn" type="button" data-approved-report-more>${t('載入更多報告','Tải thêm báo cáo')}</button>`:''}
    </section>`;
  }
  function calendarDocumentList(){
    if(['failed','cases'].includes(s.tab))return calendarCaseList(s.tab);
    const tab=s.tab==='documents'?documentTab(doc()):s.tab;
    const rows=docs().filter(d=>tab==='history'||!d.cancelled&&(tab==='plans'?d.kind==='plan'&&!d.requestKind&&(!d.retestApplicationCaseId||status(d)==='approved'):d.kind==='report'&&(!d.planId||!docs().some(p=>p.id===d.planId&&(p.requestKind||status(p)!=='approved'||p.cancelled)))));
    const queue=tab==='reports'?rows.filter(d=>status(d)!=='approved'):rows;
    const filters=[['',tab==='reports'?t('全部待辦','Tất cả việc cần xử lý'):t('全部','Tất cả')],
      ['draft',t('草稿','Bản nháp')],['pending',t('待審核','Chờ duyệt')]];
    if(tab!=='reports')filters.push(['approved',tab==='plans'?t('已核准歷史','Lịch sử đã duyệt'):t('已核准','Đã duyệt')]);
    const canReadHistory=tab==='reports'&&data.permissions.history;
    const state=tab==='reports'&&(s.workState==='approved'||!canReadHistory&&s.workState==='approved-history')?'':s.workState;
    const history=state==='approved-history'&&canReadHistory;
    const filterBar=`<nav class="rf-calendar-tools rf-work-states" aria-label="${t('文件狀態','Trạng thái hồ sơ')}">
      ${filters.map(([key,title])=>`<button type="button" class="rf-btn ${state===key?'primary':''}" data-work-state="${key}">${title} · ${queue.filter(d=>!key||status(d)===key).length}</button>`).join('')}
      ${canReadHistory?`<button type="button" class="rf-btn ${history?'primary':''}" data-work-state="approved-history">${t('已核准報告歷史','Lịch sử báo cáo đã duyệt')}</button>`:''}
    </nav>`;
    if(history)return filterBar+approvedReportList();
    const visible=queue.filter(d=>state?status(d)===state:tab!=='plans'||status(d)!=='approved');
    const waiting=tab==='reports'&&!state?docs().filter(d=>!d.cancelled&&d.kind==='plan'&&!d.requestKind&&d.calendarVersion===2&&status(d)==='approved'&&reportSlots(d).some(a=>a.assigned&&!a.reportIds.length)):[];
    const groups=new Map();
    for(const d of [...visible,...waiting])for(const key of calendarOriginKeys(d)){
      if(!groups.has(key))groups.set(key,[]);
      if(!groups.get(key).some(x=>x.id===d.id))groups.get(key).push(d);
    }
    return filterBar+calendarRetestQueue(tab,state)+`<div class="rf-calendar-document-list">${[...groups].reverse().map(([key,items])=>{
      items.sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')||a.id.localeCompare(b.id));
      const origin=docs().find(d=>d.id===key),followups=items.filter(d=>retestCases(d).length),initial=items.filter(d=>!retestCases(d).length);
      const render=d=>calendarDocumentCard(d,waiting.includes(d),key);
      return `<article class="rf-document-family" data-family-origin="${h(key)}">${followups.length?`<header><b>${t('初測與再測','Lần đầu và thử lại')}</b>${origin?`<button class="rf-btn" ${status(origin)==='approved'?`data-timeline-doc="${h(origin.id)}" data-timeline-formal aria-haspopup="dialog"`:`data-doc="${h(origin.id)}"`} ${status(origin)==='approved'&&!data.permissions.history?'disabled':''}>${t('初測來源（查看）','Nguồn lần đầu (xem)')} · ${h(displayNumber(origin))} · ${h(label(status(origin)))}</button>`:`<span>${t('來源文件','Hồ sơ nguồn')} · ${h(key)}</span>`}</header>`:''}${initial.map(render).join('')}${followups.length?`<details open><summary>${t('再測及後續文件','Thử lại và hồ sơ tiếp theo')} · ${followups.length}</summary>${followups.map(render).join('')}</details>`:''}</article>`;
    }).join('')||empty()}</div>`;
  }
  function calendarRetestQueue(tab,state) {
    if(tab!=='plans'||state)return '';
    const jobs=data.control.jobs.filter(j=>j.calendar?.retestCaseId&&arrangeable(j));
    if(!jobs.length)return '';
    return `<section class="rf-retest-queue"><h3>${t('再測待建計畫','Thử lại chờ lập kế hoạch')} · ${jobs.length}</h3>${jobs.map(j=>`<article class="rf-family-entry" data-retest-work="${h(j.id)}"><strong>${h(j.source.name)}</strong><p>${t('再測申請已核准，請設定計畫起迄後繼續送審。','Đề nghị thử lại đã duyệt; đặt thời hạn kế hoạch rồi gửi duyệt.')}</p><button type="button" class="rf-btn primary" data-period-next="${h(j.id)}" ${data.permissions.edit?'':'disabled'}>${t('建立再測計畫','Lập kế hoạch thử lại')}</button><button type="button" class="rf-btn" data-case="${h(j.calendar.retestCaseId)}">${t('查看原不合格與申請歷史','Xem lịch sử không đạt và đề nghị')}</button></article>`).join('')}</section>`;
  }
  // Only recorded lineage identifies a family. Never merge by product/name/period label.
  function calendarOriginKeys(d,seen=new Set()){
    if(seen.has(d.id))return [d.id];seen.add(d.id);
    const cases=retestCases(d).map(id=>data.control.cases.find(a=>a.id===id)).filter(Boolean);
    if(cases.length)return [...new Set(cases.map(a=>a.originReportId||a.reportIds?.[0]||'case:'+a.id))];
    if(d.correctionOf){const original=docs().find(x=>x.id===d.correctionOf);return original?calendarOriginKeys(original,seen):[d.correctionOf];}
    if(d.kind==='plan'&&!d.requestKind){const reports=docs().filter(x=>x.kind==='report'&&x.planId===d.id&&!x.correctionOf);if(reports.length)return reports.map(x=>x.id);}
    return [d.id];
  }
  const reportDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function displayDateTime(value){
    if(!value)return '—';
    const date=new Date(value);if(!Number.isFinite(date.getTime()))return t('日期未記錄','Chưa ghi ngày');
    const parts=Object.fromEntries(reportDateTimeFormatter.formatToParts(date).map(p=>[p.type,p.value]));
    return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
  }
  function calendarDocumentCard(d,waiting,originKey){
    if(waiting)return `<section class="rf-family-entry"><button class="rf-calendar-document rf-report-ready ${isRetestPlan(d)?'rf-retest-report':'rf-initial-document'}" data-plan-report="${h(d.id)}" ${data.permissions.edit?'':'disabled'}><span class="rf-calendar-doc-top"><strong>${isRetestPlan(d)?t('再測報告','Báo cáo thử lại'):t('初測報告','Báo cáo lần đầu')}</strong><span class="rf-tag">${t('待填寫','Chờ nhập')}</span></span><small>${t('來源計畫','Kế hoạch nguồn')} · ${h(displayNumber(d))}</small>${content(d).planStart?`<small class="rf-card-date">${h(content(d).planStart)} — ${h(content(d).planEnd)}</small>`:`<small>${t('舊計畫未記錄起迄日','Kế hoạch cũ chưa ghi thời hạn')}</small>`}<span>${t('點選填寫報告','Nhấn để nhập báo cáo')} →</span><small>${t('報告編碼於建立草稿後產生','Mã báo cáo được tạo sau khi lập bản nháp')}</small></button></section>`;
    const cases=retestCases(d).map(id=>data.control.cases.find(a=>a.id===id)).filter(a=>a&&(a.originReportId||a.reportIds?.[0]||'case:'+a.id)===originKey);
    return `<section class="rf-family-entry">${`<button class="rf-calendar-document ${isRetestPlan(d)?'rf-retest-plan':isRetestReport(d)?'rf-retest-report':'rf-initial-document'} ${s.selected===d.id?'selected':''}" data-doc="${h(d.id)}"><span class="rf-calendar-doc-top"><strong>${h(displayNumber(d))}</strong>${reportReviewTag(d)}</span>${d.kind==='report'&&d.planId?`<small>${t('來源計畫','Kế hoạch nguồn')} · ${h(linkedPlanNumber(d))}</small>`:''}<span>${h(reportLabel(d))} · ${content(d).lines.length} ${t('項','hạng mục')}</span><span>${h(content(d).title===d.number?'':content(d).title)}</span>${content(d).planStart?`<small>${h(content(d).planStart)} — ${h(content(d).planEnd)}</small>`:''}</button>`}${cases.length?`<small>${t('原異常','Bất thường gốc')}：${cases.map(a=>`<button class="rf-btn" data-case="${h(a.id)}">${h(a.number||a.id)}</button>`).join(' ')}${calendarOriginKeys(d).length>1?t('（跨來源共用文件，保留各項關聯）',' (hồ sơ dùng chung nhiều nguồn; giữ liên kết từng mục)'):''}</small>`:''}<div class="rf-card-meta"><small>${t('建立','Tạo')} · ${h(displayDateTime(d.createdAt))}</small> ${d.kind==='report'&&content(d).date?`<small>${t('檢查日期','Ngày kiểm tra')} · ${h(content(d).date)}</small>`:''}</div>${d.requestKind==='retest'&&status(d)==='approved'?`<p>${t('再測申請已核准；下一步到檢查計畫建立再測計畫，計畫核准後才可填報。','Đề nghị thử lại đã duyệt; lập kế hoạch thử lại tại Kế hoạch kiểm tra. Chỉ nhập báo cáo sau khi kế hoạch được duyệt.')}</p><button class="rf-btn" data-tab="plans">${t('查看檢查計畫','Xem kế hoạch kiểm tra')}</button>`:''}${waiting?`<small>${t('已核准計畫 · 報告編碼於填報時建立','Kế hoạch đã duyệt · Mã báo cáo được tạo khi nhập')}</small><button class="rf-btn primary" data-plan-report="${h(d.id)}" ${data.permissions.edit?'':'disabled'}>${t('填寫報告','Nhập báo cáo')}</button>`:''}</section>`;
  }
  function calendarWorkflowNavigation(tab) {
    const steps=[['sources','1',t('檢查項目','Hạng mục kiểm tra')],['plans','2',t('檢查計畫','Kế hoạch kiểm tra')],['reports','3',t('檢查報告','Báo cáo kiểm tra')]];
    const result=(id,tone,icon,name)=>`<button type="button" class="rf-result-branch ${tone} ${tab===id?'active':''}" data-tab="${id}" aria-current="${tab===id?'page':'false'}"><span class="rf-branch-icon" aria-hidden="true">${icon}</span><strong>${name}</strong><span class="rf-flow-count">${pendingCases(id).length}</span><span aria-hidden="true">›</span></button>`;
    return `<nav class="rf-calendar-flow" aria-label="${t('FQC 檢查流程','Quy trình kiểm tra FQC')}">
      <div class="rf-flow-diagram"><svg class="rf-flow-connectors" aria-hidden="true"><defs><marker id="rf-flow-return-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a55331"/></marker></defs><path class="rf-flow-return-path"/><path class="rf-flow-join-path"/></svg><div class="rf-calendar-tabs">${steps.map(([id,num,name],i)=>`${i?'<span class="rf-flow-arrow step" aria-hidden="true"><span>→</span><span>↓</span></span>':''}<button type="button" data-tab="${id}" class="${tab===id?'active':''}" aria-current="${tab===id?'page':'false'}"><span class="rf-flow-number">${num}</span><span>${name}</span></button>`).join('')}</div>
      <p class="rf-flow-gate"><span aria-hidden="true">↓</span> ${t('報告核准後，依正式結果分流','Sau khi duyệt báo cáo, phân nhánh theo kết quả chính thức')}</p>
      <section class="rf-calendar-results" aria-label="${t('核准結果與後續流程','Kết quả đã duyệt và bước tiếp theo')}"><div class="rf-calendar-branches">
        <article class="rf-flow-lane pass"><div class="rf-result-branch pass"><span class="rf-branch-icon" aria-hidden="true">✓</span><strong>${t('合格','Đạt')}</strong></div><strong class="rf-flow-terminal">${t('已結案 · 更新檢查項目','Đã đóng · Cập nhật hạng mục')}</strong></article>
        <article class="rf-flow-lane fail">${result('failed','fail','!',t('不合格','Không đạt'))}</article>
        <article class="rf-flow-lane unable">${result('cases','unable','+',t('異常處理','Xử lý bất thường'))}<strong class="rf-flow-terminal">${t('處置核准 → 已結案','Duyệt xử lý → Đã đóng')}</strong></article>
      </div></section><div class="rf-retest-return"><span>${t('復測申請核准後','Sau khi duyệt đề nghị thử lại')}</span></div></div><details class="rf-flow-help"><summary>${t('復測與結案說明','Hướng dẫn thử lại và đóng hồ sơ')}</summary><p>${t('原不合格／異常頁按「開始復測」，填期間、原因、備註，系統自動準備計畫；儲存後送審。核准才移出原待辦並到檢查報告。','Thử lại: nhập thời hạn, lý do, ghi chú tại trang Không đạt / Bất thường; hệ thống tự tạo kế hoạch. Lưu rồi gửi duyệt. Chỉ sau khi duyệt mới rời việc gốc và đến báo cáo.')}</p><p>${t('待審、退回或撤回均留原待辦；復測再不合格回不合格待辦。合格或處置核准才結案，處置不等於合格。','Đang chờ, trả lại hoặc rút: giữ việc gốc. Thử lại không đạt quay về Không đạt. Chỉ kết quả đạt hoặc xử lý đã duyệt mới đóng; xử lý không có nghĩa là đạt.')}</p><p>${t('原結果、照片、申請及審核保留於項目流程歷史；復測合格顯示「曾經不合格」。','Giữ kết quả gốc, ảnh, đề nghị và phê duyệt trong lịch sử hạng mục; thử lại đạt vẫn ghi “Từng không đạt”.')}</p></details>
    </nav>`;
  }
  function mountFlowConnector(){
    const frame=root?.querySelector('.rf-flow-diagram');if(!frame?.getBoundingClientRect)return;
    const report=frame.querySelector('.rf-calendar-tabs [data-tab="reports"]'),fail=frame.querySelector('.rf-flow-lane.fail'),abnormal=frame.querySelector('.rf-flow-lane.unable'),branches=frame.querySelector('.rf-calendar-branches'),svg=frame.querySelector('svg');
    const draw=()=>{if(!frame.isConnected)return;const box=frame.getBoundingClientRect();if(!box.width||!report)return;
      const r=report.getBoundingClientRect(),f=fail.getBoundingClientRect(),a=abnormal.getBoundingClientRect(),b=branches.getBoundingClientRect();
      const rail=box.width-10,ry=r.top-box.top+r.height/2,rx=r.right-box.left+2,narrow=a.top>f.top+f.height/2;
      let main,join;
      if(narrow){const fy=f.top-box.top+f.height/2,ay=a.top-box.top+a.height/2;main=`M ${a.right-box.left} ${ay} H ${rail} V ${ry} H ${rx}`;join=`M ${f.right-box.left} ${fy} H ${rail}`;}
      else{const fy=f.bottom-box.top,ax=a.left-box.left+a.width/2,fx=f.left-box.left+f.width/2,base=b.bottom-box.top+25;main=`M ${fx} ${fy} V ${base} H ${rail} V ${ry} H ${rx}`;join=`M ${ax} ${a.bottom-box.top} V ${base}`;}
      svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);svg.querySelector('.rf-flow-return-path').setAttribute('d',main);svg.querySelector('.rf-flow-join-path').setAttribute('d',join);
    };draw();if(window.ResizeObserver){flowConnectorObserver=new window.ResizeObserver(draw);flowConnectorObserver.observe(frame);}
  }
  function requestContext(d) {
    if (d?.requestKind === 'skip') return 'sources';
    if (d?.requestKind === 'void') return 'plans';
    const abnormality = data.control.cases.find(item => item.id === (d?.retestApplicationCaseId||d?.caseId));
    return abnormality ? caseTab(abnormality) : 'reports';
  }
  function calendarActiveTab() {
    const current = doc();
    const selectedTab = s.tab === 'documents' && current ? documentTab(current) : s.tab;
    return selectedTab === 'history' ? requestContext(current) : selectedTab;
  }
  function calendarPage(){
    const tab = calendarActiveTab();
    const request = s.tab === 'history' && doc();
    const jobs=data.control.jobs,filterJobs=jobs,lines=[...new Set(filterJobs.map(j=>j.source.line))].sort((a,b)=>a.localeCompare(b));
    const scoped=filterJobs.filter(j=>!s.sourceLine||j.source.line===s.sourceLine),cats=[...new Set(scoped.map(j=>j.source.category))].sort((a,b)=>a.localeCompare(b));
    const products=[...new Map(scoped.filter(j=>!s.sourceCategory||j.source.category===s.sourceCategory).flatMap(j=>j.source.products).map(p=>[p.code,p])).values()];
    const select=(key,title,values)=>`<label>${title}<select data-source-filter="${key}"><option value="">${t('全部','Tất cả')}</option>${values.map(([value,text])=>`<option value="${h(value)}" ${s[key]===value?'selected':''}>${h(text)}</option>`).join('')}</select></label>`;
    const picked=[...s.checked].map(id=>jobs.find(j=>j.id===id)).filter(Boolean),canQueue=picked.length&&picked.every(arrangeable),canPlan=canQueue&&new Set(picked.map(j=>!!j.calendar.retestCaseId)).size===1;
    return `<header class="rf-calendar-hero"><div><span>FQC · ${t('例行品質管理','Quản lý chất lượng định kỳ')}</span><h2>${t('每項檢查，進度清楚','Theo dõi rõ từng hạng mục')}</h2></div><details><summary>${t('如何操作','Cách sử dụng')}</summary><p>${t('檢查項目勾選建計畫 → 計畫審核 → 填報 → 報告審核。審核前不寫入正式結果。','Chọn hạng mục lập kế hoạch → duyệt kế hoạch → báo cáo → duyệt kết quả. Chưa duyệt không đổi kết quả chính thức.')}</p><p>${t('舊期未安排不能補建；已建計畫可跨期填報，逾期送審需原因。','Không tạo bù kế hoạch kỳ cũ; kế hoạch đã tạo được báo cáo qua kỳ, gửi muộn cần lý do.')}</p></details>${calendarAdministration()}</header><nav class="rf-modules">${['FQC','IQC',t('模具檢查','Kiểm tra khuôn'),t('檢具與測試設備校準','Hiệu chuẩn thiết bị')].map((m,i)=>`<button data-module="${i}" class="${i===0?'active':''}">${m}</button>`).join('')}</nav><div class="rf-main rf-calendar">${calendarWorkflowNavigation(tab)}${routineErrorBanner()}${calendarSetup()}${s.busy&&receiptFeedback()?.status!=='querying'?`<p role="status">${t('正在保存，請稍候…','Đang lưu, vui lòng chờ…')}</p>`:''}${request?`<section class="rf-panel rf-detail-panel"><div class="rf-detail">${btn('back',t('返回來源','Về mục gốc'))}${documentDetail(request)}</div></section>`:['sources','jobs'].includes(s.tab)?`<div class="rf-source-filters">${select('sourceLine',t('線別','Dây chuyền'),lines.map(x=>[x,x]))}${select('sourceCategory',t('類別','Nhóm'),cats.map(x=>[x,x]))}${select('sourceProduct',t('產品','Sản phẩm'),products.map(p=>[p.code,p.code+' · '+p.name]))}</div><div class="rf-calendar-toolbar"><b>${t('已選','Đã chọn')} ${picked.length}</b>${btn('create-plan',t('建立檢查計畫','Tạo kế hoạch kiểm tra'),!canPlan||!data.permissions.edit,'primary')}${canQueue&&!canPlan?'<p>'+t('初測與復測請分開建立計畫。','Lập riêng kế hoạch lần đầu và thử lại.')+'</p>':''}${s.tab==='sources'?btn('calendar-skip',t('申請當期免測','Xin miễn kiểm tra kỳ này'),!picked.length||picked.some(j=>!canExempt(j))||!data.permissions.edit):''}${btn('clear-selection',t('清除選取','Bỏ chọn'),!picked.length)}</div>${calendarWorkTable()}`:`<div class="rf-layout ${s.wide?'rf-wide':''} ${s.tab==='reports'&&s.workState==='approved-history'&&data.permissions.history?'rf-approved-layout':''} ${s.selected?'has-selection':''}"><section class="rf-panel rf-list-panel">${calendarDocumentList()}</section><section class="rf-panel rf-detail-panel"><div class="rf-detail">${btn('back',s.listReturn?.tab==='sources'&&s.listReturn.selection===s.selected?t('返回檢查項目','Về hạng mục kiểm tra'):t('返回清單','Về danh sách'),false,s.listReturn?.selection===s.selected?'':'rf-back')}${detail()}</div></section></div>`}</div>`;
  }
  function correctionEvidence(d,c){
    if(d.waiverRetests?.jobIds?.length)return '<div class="rf-notice">'+t('轉免做：核准後終止以下復測；原不合格、照片與歷史保留。','Chuyển miễn: chỉ dừng các lần thử lại sau khi duyệt; giữ kết quả không đạt, ảnh và lịch sử.')+'<ul>'+d.waiverRetests.documents.map(p=>'<li>'+h(docs().find(x=>x.id===p.id)?.number||p.id)+'</li>').join('')+'</ul>'+h(d.waiverRetests.jobIds.length)+' '+t('項復測工作（含尚未建立計畫）','công việc thử lại (kể cả chưa lập kế hoạch)')+'</div>';
    if(!d.correctionOf)return '';
    const old=docs().find(x=>x.id===d.correctionOf),review=d.flow.cases.find(x=>x.id===d.flow.active.id);
    return `<section class="rf-calendar-fields"><b>${t('更正前後對照','Đối chiếu trước và sau sửa')}</b><p>${h(c.reason)}</p>${c.lines.map(l=>`<p>${h(l.source.name)}：${h((old?.flow.active.content.lines.find(x=>x.jobId===l.jobId)?.results||[]).map(r=>label(r.outcome)).join(' / '))} → ${h(l.results.map(r=>label(r.outcome)).join(' / '))}</p>`).join('')}<small>${t('申請人','Người đề nghị')}：${h(d.owner.name)} · ${h(d.createdAt)}</small>${review?.result?`<small>${t('核准人','Người duyệt')}：${h(review.result.actor.name)} · ${h(review.result.at)}</small>`:''}</section>`;
  }
  function calendarFields(d,c,edit){
    if(d.calendarVersion!==2)return calendarMode()?`<p class="rf-notice">${t('此既存文件的產品／結果或待審關聯尚不能安全轉換；原內容保留，可保存編輯，暫不新增送審。','Chưa thể chuyển an toàn liên kết sản phẩm/kết quả hoặc hồ sơ đang duyệt; giữ nội dung và cho phép lưu, chưa gửi mới.')}</p>`:'';
    const input=(key,title,type='textarea')=>`<label>${title}${type==='textarea'?`<textarea data-field="${key}" ${edit?'':'disabled'}>${h(c[key]||'')}</textarea>`:`<input type="${type}" data-field="${key}" value="${h(c[key]||'')}" ${edit?'':'disabled'}>`}</label>`;
    const plan = approvedSourcePlan(d)?.flow.active.content;
    const matchingDates = plan && (c.planStart || '') === (plan.planStart || '') && (c.planEnd || '') === (plan.planEnd || '');
    const dates = !matchingDates && (c.planStart || c.planEnd)
      ? `<dl class="rf-plan-facts"><div><dt>${t('計畫起日','Ngày bắt đầu')}</dt><dd>${h(c.planStart || '—')}</dd></div><div><dt>${t('計畫迄日','Hạn kết thúc')}</dt><dd>${h(c.planEnd || '—')}</dd></div></dl>` : '';
    const legacy = d.calendarLegacy?.unrecordedPlanDates && !matchingDates
      ? `<p class="rf-notice">${t('既有文件未記錄計畫起迄，保留原資料；不推算或補寫日期。新建計畫必須設定起迄。','Hồ sơ cũ không lưu ngày bắt đầu/kết thúc; giữ nguyên, không suy đoán ngày. Kế hoạch mới phải có thời hạn.')}</p>` : '';
    const fields = (d.retestApplicationCaseId ? input('planStart',t('檢查期間起日','Ngày bắt đầu kiểm tra'),'date') + input('planEnd',t('檢查期間迄日','Ngày kết thúc kiểm tra'),'date') : '') + (d.kind === 'report' && (c.planEnd < data.today || c.overdueReason) ? input('overdueReason',t('逾期送審原因','Lý do gửi quá hạn')) : '')
      + (d.requestKind || d.retestApplicationCaseId ? input('reason',t('申請原因','Lý do đề nghị')) : '')
      + (['waiver','disposal'].includes(d.kind) && d.disposalPolicy!=='skip-period' ? input('nextDate',t('下一檢查日期','Ngày kiểm tra tiếp theo'),'date') + input('skipReason',t('中間期別跳過原因（有跨期時必填）','Lý do bỏ qua các kỳ giữa (bắt buộc nếu có)')) : '')
      + (d.kind === 'disposal' && d.disposalPolicy!=='skip-period' ? input('dispositionResult',t('實際處理結果','Kết quả xử lý thực tế')) : '');
    return dates || legacy || fields ? `<section class="rf-calendar-fields">${legacy}${dates}${fields}</section>` : '';
  }
  // Read projection only. Job identity stays itemId + period, including all products.
  function sourcePickerRows() {
    return (data.catalog.items || []).filter(i => i.cadence === 'time').map(i => {
      const source = data.sources.find(a => a.id === i.id);
      const products = source?.products || (i.productCodes || []).map(code => ({code,name:code}));
      const jobs = source?.frequency && i.enabled ? data.control.jobs.filter(j => j.itemId === i.id && !j.planId && !j.completion) : [];
      return {...i, source, products, jobs};
    });
  }
  function sourcePicker() {
    const rows = sourcePickerRows(), scoped = rows.filter(i => (!s.sourceLine || i.line === s.sourceLine) && (!s.sourceCategory || i.category === s.sourceCategory) && (!s.sourceProduct || i.products.some(p => p.code === s.sourceProduct)));
    const options = values => [...new Set(values.filter(Boolean))].sort((a,b) => a.localeCompare(b)).map(v => [v,v]);
    const select = (key,title,values) => `<label>${title}<select data-source-filter="${key}"><option value="">${t('全部','Tất cả')}</option>${values.map(([v,label]) => `<option value="${h(v)}" ${s[key] === v ? 'selected' : ''}>${h(label)}</option>`).join('')}</select></label>`;
    const productRows = rows.filter(i => (!s.sourceLine || i.line === s.sourceLine) && (!s.sourceCategory || i.category === s.sourceCategory));
    const products = [...new Map(productRows.flatMap(i => i.products).map(p => [p.code,[p.code,p.code+' · '+p.name]])).values()];
    return `<section class="rf-source-picker"><h3>${t('應檢項目','Hạng mục cần kiểm tra')}</h3><p>${t('列出 FQC 正式版本的按時間項目。同項目涵蓋多產品時，每個期別只安排一筆工作，保留所有涵蓋產品。','Các hạng mục theo thời gian của phiên bản FQC chính thức. Mỗi hạng mục/kỳ là một công việc, giữ toàn bộ sản phẩm.')}</p><div class="rf-source-filters">${select('sourceLine',t('線別','Dây chuyền'),options(rows.map(i => i.line)))}${select('sourceCategory',t('類別','Nhóm'),options(rows.filter(i => !s.sourceLine || i.line === s.sourceLine).map(i => i.category)))}${select('sourceProduct',t('產品','Sản phẩm'),products)}</div>${routineErrorBanner()}<div class="rf-selection-bar"><b>${t('已選工作','Công việc đã chọn')} ${s.checked.size}</b>${btn('add-source-jobs',t('加入應檢清單','Thêm vào lịch cần kiểm tra'),!s.checked.size || !data.permissions.edit || !!s.retry,'primary')}<small>${t('勾選只暫存在本頁；加入後沿用應檢清單建立並保存計畫。已存在的工作不會重複新增。','Lựa chọn tạm trong trang; thêm vào lịch rồi tạo và lưu kế hoạch. Không tạo trùng công việc.')}</small></div><div class="rf-source-scroll"><table class="rf-table"><thead><tr><th>${t('項目／線別／類別','Hạng mục / dây chuyền / nhóm')}</th><th>${t('頻率','Tần suất')}</th><th>${t('可安排期別','Kỳ có thể lập kế hoạch')}</th></tr></thead><tbody>${scoped.map(i => `<tr><td><strong>${h(i.name)}</strong><small>${h(i.code+' · '+i.line+' / '+i.category)}</small></td><td>${h(({weekly:t('週','Tuần'),monthly:t('月','Tháng'),quarterly:t('季','Quý'),half_yearly:t('半年','Nửa năm'),semiannual:t('半年','Nửa năm'),yearly:t('年','Năm')})[i.frequency] || i.frequency)}</td><td>${i.jobs.length ? i.jobs.map(j => `<label><input type="checkbox" data-job="${h(j.id)}" aria-label="${h(i.code+' '+j.start+' — '+j.end)}" ${s.checked.has(j.id) ? 'checked' : ''} ${!data.permissions.edit || s.retry ? 'disabled' : ''}>${h(j.start+' — '+j.end)}</label>`).join('') : `<small>${!i.enabled ? t('已停用','Đã tắt') : !i.source?.frequency ? t('頻率待確認','Cần xác nhận tần suất') : t('無可安排工作（已安排／完成／尚未到期）。','Không có công việc khả dụng (đã lập / hoàn tất / chưa đến kỳ).')}</small>`}</td></tr>`).join('') || `<tr><td colspan="4">${t('沒有符合條件的時間項目','Không có hạng mục theo thời gian phù hợp')}</td></tr>`}</tbody></table></div></section>`;
  }
  function mountDraft() {
    const d = doc();
    if (d && ['plans', 'reports', 'documents', 'history', 'failed', 'cases'].includes(s.tab)) {
      const pending = d.flow.cases.find((x) => x.id === d.flow.pendingId);
      const v = {
        id: pending?.id || d.flow.active.id || d.id,
        number: d.flow.cases.length || 1,
        status: status(d),
        history: d.flow.saves.map((a) => ({
          action: 'save',
          actorName: a.actor.name,
          at: a.at,
        })),
      };
      window.VersionDraftUI?.mount(root.querySelector('.rf-document'), {
        header: '.rf-draft-header',
        ...(!s.reviewPlatform?{mountApprovedHistory}:{}),
        module: 'FQC · ' + reportLabel(d),
        scope: d.number,
        version: v,
        versions: [v],
        active: d.flow.active.id
          ? {
              number:
                d.flow.cases.filter((a) => a.status === 'approved').length || 1,
            }
          : null,
        flow: {
          ...d.flow,
          working: status(d) === 'draft' ? buffer(d) : d.flow.working,
        },
        actions: {
          save: '[data-action="save"]',
          submit: '[data-action="submit"]',
          review: '[data-action="review"]',
          withdraw: '[data-action="withdraw"]',
        },
        errors: '.rf-errors',
        missing: '.rf-missing',
        history: ['.rf-operation-log'],
        checked: { errors: true, missing: true },
      });
      const shell = root.querySelector('.rf-document .vd-shell');
      if (shell) {
        shell.classList.add('rf-compact-draft');
        const choice = shell.querySelector('.vd-choice'); if (choice && !choice.querySelector('select')) choice.remove();
        const meta = shell.querySelector('.vd-meta'), card = shell.querySelector('.vd-card');
        if (meta && card) { const details = document.createElement('details'), summary = document.createElement('summary'); details.className = 'rf-draft-meta'; summary.textContent = t('版本與儲存紀錄', 'Phiên bản và thông tin lưu'); details.append(summary, meta); card.querySelector('.vd-top')?.after(details); }
        for (const kind of ['errors', 'missing']) {
          const section = shell.querySelector('.vd-' + kind), count = section?.querySelectorAll('.rf-issue-row').length || 0;
          if (section) { section.classList.toggle('rf-no-issues', !count); section.querySelector('h3')?.append(document.createTextNode(' · ' + count)); }
        }
      }
      const discard = root.querySelector('.rf-document > .rf-actions [data-action="discard"]');
      if (discard) root.querySelector('.vd-actions')?.append(discard);
      const withdraw = root.querySelector('[data-action="withdraw"]');
      if (withdraw) withdraw.textContent = t('撤回送審', 'Rút hồ sơ gửi duyệt');
      if (s.reviewPlatform) root.querySelector('[data-action="review"]')?.remove();
    }
  }
  function planReportState(d,jobId) {
    const slots = reportSlots(d).filter((a) => !jobId || a.jobId === jobId);
    return {available:slots.filter((a) => a.assigned && !a.reportIds.length).length,
      related:[...new Map(slots.flatMap((a) => a.reportIds).map(preferredReport).filter(Boolean).map((r) => [r.id,r])).values()]};
  }
  function jumpListGroup(key) {
    const scroller = root.querySelector('.rf-scroll'), group = root.querySelector('[data-list-group="' + key + '"]');
    if (!scroller || !group) return;
    scroller.scrollTop += group.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    root.querySelectorAll('[data-list-jump]').forEach((b) => {
      b.setAttribute('aria-pressed',String(b.dataset.listJump === key));
    });
    group.querySelector('h4')?.focus({preventScroll:true});
  }
  function groupLinkLabel(key,title) {
    return ({
      'needs-report':t('待建立報告','Cần tạo báo cáo'),
      'has-report':t('已建立報告','Đã tạo báo cáo'),
      historical:t('歷史計畫','Lịch sử kế hoạch'),
      cancelled:t('已捨棄計畫','Kế hoạch đã bỏ'),
      initial:t('初測報告','Báo cáo lần đầu'),
      retest:s.tab === 'cases' ? title : t('複測報告 · RTS','Báo cáo thử lại · RTS'),
      waiver:t('免做申請','Đề nghị miễn'),
      disposal:t('處置申請','Đề nghị xử lý'),
      draft:s.tab === 'plans' ? t('計畫草稿','Kế hoạch nháp') : title,
      pending:s.tab === 'plans' ? t('計畫待審核','Kế hoạch chờ duyệt') : title,
    })[key] || title;
  }
  function groupedList(items,keyOf,render,groups,jobs = false) {
    const scoped = groups.filter(([key]) => !['plans','reports'].includes(s.tab) || (s.tab === 'plans' ? !['initial','retest','correction','waiver','disposal'].includes(key) : ['initial','retest','correction','waiver','disposal'].includes(key)));
    const sections = scoped.map(([key,title,tone]) => ({key,title,tone,items:items.filter((item) => keyOf(item) === key)}));
    const navigation = '<nav class="rf-group-jumps" aria-label="' + t('分類定位','Đi tới nhóm') + '">' + sections.map((a) => '<button type="button" class="rf-btn ' + a.tone + '" data-rf-tone="' + (['initial','retest','correction','waiver','disposal'].includes(a.key) && s.tab !== 'cases' ? a.key : s.tab === 'plans' ? 'plan' : '') + '" data-list-jump="' + a.key + '" aria-pressed="false" ' + (!a.items.length ? 'disabled' : '') + '>' + groupLinkLabel(a.key,a.title) + ' · ' + a.items.length + '</button>').join('') + '</nav>';
    const html = sections.map((a) => a.items.length ? '<section class="rf-list-group ' + a.tone + '" data-rf-tone="' + (['initial','retest','correction','waiver','disposal'].includes(a.key) && s.tab !== 'cases' ? a.key : s.tab === 'plans' ? 'plan' : '') + '" data-list-group="' + a.key + '"><h4 tabindex="-1">' + a.title + '<span>' + a.items.length + '</span></h4><table class="rf-table"><thead><tr>' + (jobs ? '<th>✓</th>' : '') + '<th>' + t('項目 / 文件','Hạng mục / hồ sơ') + (jobs ? ' · ' + t('狀態 / 下一步','Trạng thái / bước tiếp') : '</th><th>' + t('狀態 / 下一步','Trạng thái / bước tiếp')) + '</th></tr></thead><tbody>' + a.items.map(render).join('') + '</tbody></table></section>' : '').join('') || '<div class="rf-empty">' + t('沒有符合條件的資料','Không có dữ liệu phù hợp') + '</div>';
    return {navigation,html};
  }
  function jobGroup(j) {
    if (j.completion) return 'completed';
    if (!j.planId) return 'unassigned';
    const state = jobSummary(j);
    if (['draft','pending'].includes(state.review)) return state.review;
    const plan = liveDocs().find((d) => d.id === j.planId);
    return plan && planReportState(plan,j.id).available ? 'needs-report' : 'reporting';
  }
  function documentGroup(d) {
    if(d.requestKind)return 'waiver';
    if (d.kind !== 'plan') return d.kind === 'report' ? (d.caseId ? 'retest' : d.correctionOf ? 'correction' : 'initial') : d.kind;
    if (status(d) !== 'approved') return status(d);
    const state = planReportState(d);
    return state.available ? 'needs-report' : state.related.length ? 'has-report' : 'historical';
  }
  function list() {
    const c = data.control;
    let rows;
    if (s.tab === 'jobs') {
      const jobs = c.jobs.filter(
        (j) =>
          matches([
            { source: j.source, jobId: j.id, results: jobSummary(j).results },
          ]) &&
          (!s.caseState ||
            c.cases.some((a) => a.jobId === j.id && caseMatches(a))) &&
          (!s.review || jobSummary(j).review === s.review) &&
          (!s.overdue || (!j.completion && j.end < data.today)),
      );
      rows = groupedList(jobs,jobGroup,(j) => {
          const state = jobSummary(j);
          return `<tr data-id="${h(j.id)}" data-job-tone="${state.tone}"${rowMark(j)} class="${s.selected === j.id ? 'selected' : ''}"><td class="rf-job-pick"><input type="checkbox" data-job="${h(j.id)}" aria-label="${h(j.source.name)}" ${s.checked.has(j.id) ? 'checked' : ''} ${j.planId || j.completion || !data.permissions.edit ? 'disabled' : ''}>${j.planId ? `<span class="rf-pick-status ${state.review}">${h(state.reviewLabel)}</span>` : ''}</td><td><strong>${h(j.source.name)}</strong>${markBadge(j)}<small>${h(j.source.line + ' / ' + j.source.category + ' / ' + j.source.code)}</small><small>${h(j.start + ' — ' + j.end)}</small>${state.html}${!j.completion && j.end < data.today ? '<small>⌛ ' + t('原期已逾期', 'Kỳ gốc đã quá hạn') + '</small>' : ''}</td></tr>`;
        }, [['unassigned',t('尚未安排','Chưa lập kế hoạch'),'blue'],['draft',t('草稿待完成','Nháp cần hoàn tất'),'amber'],['pending',t('已送審待核准','Đã gửi chờ duyệt'),'amber'],['needs-report',t('需要建立報告','Cần tạo báo cáo'),'amber'],['reporting',t('填報中','Đang báo cáo'),'blue'],['completed',t('本期已完成','Đã hoàn thành kỳ này'),'green']],true);
    } else if (s.tab === 'cases') {
      rows = groupedList(c.cases.filter(caseVisible), (a) => a.status,
          (a) =>
            `<tr data-id="${a.id}"${rowMark(c.jobs.find((j) => j.id === a.jobId),a)} class="${s.selected === a.id ? 'selected' : ''}"><td><strong>${h(a.number)}</strong>${markBadge(c.jobs.find((j) => j.id === a.jobId),a)}<small>${h(c.jobs.find((j) => j.id === a.jobId).source.name)}</small><small>${h(c.jobs.find((j) => j.id === a.jobId).start)}</small></td><td>${tag(a.status)}<small>${t('歷次報告', 'Các báo cáo')} ${a.reportIds.length}</small></td></tr>`,
        [['open',t('待改善','Chờ cải thiện'),'amber'],['retest',t('複測中','Đang thử lại'),'blue'],['ready-close',t('待確認結案','Chờ xác nhận đóng'),'amber'],['closed',t('已結案','Đã đóng'),'green'],['disposed',t('處置結案','Đã đóng bằng xử lý'),'muted'],['waived',t('本期免做','Miễn kỳ này'),'muted']]);
    } else
      rows = groupedList((s.tab === 'history' ? docs() : [...new Map([...primaryDocuments(), ...(doc() ? [doc()] : [])].map((d) => [d.id,d])).values()])
        .filter(
          (d) =>
            d.id === s.selected || ((s.tab !== 'plans' || d.kind === 'plan' && !d.requestKind) &&
            (s.tab !== 'reports' || d.kind !== 'plan' || d.requestKind) &&
            (!s.documentKind || d.kind === s.documentKind) &&
            (!s.review || status(d) === s.review) &&
            (!s.caseState ||
              c.cases.some(
                (a) => a.reportIds.includes(d.id) && caseMatches(a),
              )) &&
            (!s.workState || status(d) === s.workState) && matches(content(d).lines, d)),
        )
        .slice()
        .reverse()
        .sort((a,b) => ({draft:0,pending:1,approved:2,cancelled:3}[status(a)] - {draft:0,pending:1,approved:2,cancelled:3}[status(b)]))
        , documentGroup,
          (d) =>
            `<tr data-id="${d.id}" data-document-kind="${d.kind}" data-rf-tone="${reportType(d)}"${s.highlight === 'documents' && status(d) === 'pending' ? ' data-highlight="amber"' : ''} aria-selected="${s.selected === d.id}" class="${s.selected === d.id ? 'selected' : ''}"><td>${kindTag(d)}<strong class="rf-number ${reportType(d)}">${h(displayNumber(d))}</strong>${legacyNumber(d)}${content(d).title !== d.number ? `<small>${h(content(d).title)}</small>` : ''}<small>${reportLabel(d)} · ${h(content(d).date)} · ${h(d.owner.name)}</small></td><td>${documentStage(d)}<small>${content(d).lines.length} ${t('項', 'hạng mục')}</small></td></tr>`,
        [['needs-report',t('核准計畫 · 需要建立報告','Kế hoạch đã duyệt · cần tạo báo cáo'),'amber'],['draft',t('計畫草稿 · 尚未送審','Kế hoạch nháp · chưa gửi'),'amber'],['pending',t('計畫 · 等待審核','Kế hoạch · chờ duyệt'),'amber'],['has-report',t('核准計畫 · 已建立報告','Kế hoạch đã duyệt · đã tạo báo cáo'),'green'],['historical',t('計畫歷史 · 無可填報項目','Lịch sử kế hoạch · không còn mục báo cáo'),'muted'],['cancelled',t('已捨棄計畫 · 歷史保留','Kế hoạch đã bỏ · giữ lịch sử'),'muted'],['initial',t('初測報告 · RPT','Báo cáo lần đầu · RPT'),'blue'],['retest',t('複測報告 · RTS','Báo cáo thử lại · RTS'),'purple'],['correction',t('更正報告 · COR','Báo cáo sửa đổi · COR'),'amber'],['waiver',t('免做申請 · WVR','Đề nghị miễn · WVR'),'amber'],['disposal',t('處置申請 · DSP','Đề nghị xử lý · DSP'),'purple']]);
    return `<div class="rf-panel-heading"><span>${t('工作清單', 'Danh sách công việc')}</span><small>${t('選取查看完整明細', 'Chọn để xem chi tiết')}</small></div>${s.tab === 'jobs' ? selectionBar() : s.tab === 'cases' ? '' : (s.tab === 'reports' ? reportKinds() : '') + workFilters()}${rows.navigation}${doc() ? '<div class="rf-current-document">' + t('正在查看：', 'Đang xem: ') + h(displayNumber(doc())) + ' · ' + reportLabel(doc()) + '</div>' : ''}<div class="rf-scroll">${rows.html}</div>`;

  }
  function jobSummary(j) {
    const plan = liveDocs().find((d) => d.id === j.planId),
      reports = liveDocs().filter(
        (d) =>
          d.kind === 'report' &&
          d.flow.active.id &&
          d.flow.active.content.lines.some((l) => l.jobId === j.id),
      ),
      latest = reports.at(-1),
      results =
        latest?.flow.active.content.lines.find((l) => l.jobId === j.id)
          ?.results || [],
      a = data.control.cases.filter((a) => a.jobId === j.id).at(-1),
      inProgress = liveDocs()
        .filter(
          (d) =>
            d.kind !== 'plan' &&
            status(d) !== 'approved' &&
            content(d).lines.some((l) => l.jobId === j.id),
        )
        .at(-1),
      outcomes = [...new Set(results.map((r) => r.outcome).filter(Boolean))];
    if (a?.status === 'disposed' && !outcomes.includes('fail'))
      outcomes.push('fail');
    const tone = outcomes.includes('fail')
      ? 'fail'
      : outcomes.includes('unable')
        ? 'unable'
        : outcomes.includes('undetermined')
          ? 'undetermined'
          : outcomes.includes('pass')
            ? 'pass'
            : 'unassigned';
    let tags = outcomes.map(tag).join('');
    if (a) tags += tag(a.status);
    // The plan stage below names its meaning explicitly.
    if (inProgress)
      tags += `<span class="rf-tag ${status(inProgress)}">${label(inProgress.kind)} · ${label(status(inProgress))}</span>`;
    if (!tags) tags = tag('unassigned');
    const locked = j.completion
        ? (inProgress ? t('本期檢查已完成；另有草稿／送審文件待處理。', 'Kiểm tra kỳ này đã hoàn tất; còn bản nháp / hồ sơ chờ duyệt.') : t('本期完成，不能重複安排。', 'Kỳ này đã hoàn thành; không lập lại.'))
        : j.planId
          ? t('已納入計畫，不能重複勾選。', 'Đã có kế hoạch; không chọn trùng.')
          : t(
              '尚未操作，可勾選一起建立計畫。',
              'Chưa thao tác; có thể chọn để lập kế hoạch chung.',
            ),
      next = inProgress
        ? `<button class="rf-report-link" data-doc="${h(inProgress.id)}">${t('接續', 'Tiếp tục')} ${label(inProgress.kind)}</button>`
        : a && !done(a)
          ? `<button class="rf-report-link" data-case="${h(a.id)}">${a.status === 'ready-close' ? t('確認結案', 'Xác nhận đóng') : t('接續異常／補測', 'Tiếp tục bất thường / thử lại')}</button>`
          : latest
            ? `<button class="rf-report-link" data-doc="${h(latest.id)}">${t('查看正式報告', 'Xem báo cáo chính thức')}</button>`
            : plan
              ? `<button class="rf-report-link" data-doc="${h(plan.id)}">${t('開啟計畫', 'Mở kế hoạch')}</button>`
              : '';
    return {
      tone,
      results,
      reviewLabel: inProgress ? label(inProgress.kind) + ' · ' + label(status(inProgress)) : latest ? t('報告核准','Báo cáo đã duyệt') : plan ? label('plan') + ' · ' + label(status(plan)) : '',
      review: inProgress
        ? status(inProgress)
        : latest
          ? 'approved'
          : plan
            ? status(plan)
            : '',
      html: `<div class="rf-job-status">${tags}</div>${inProgress ? documentStage(inProgress) : plan ? documentStage(plan, j.id) : ''}<small class="rf-lock-reason">${locked}</small>${next}`,
    };
  }
  function selectionBar() {
    const jobs = data.control.jobs.filter((j) => s.checked.has(j.id));
    return `<div class="rf-selection-bar">${s.selectionNotice ? `<p role="status">${h(s.selectionNotice)}</p>` : ''}<div><b>${t('已選項目', 'Đã chọn')} ${jobs.length}</b>${btn('create-plan', t('＋ 建立檢查計畫', '＋ Tạo kế hoạch'), !jobs.length || !data.permissions.edit, 'primary')}</div>${jobs.length ? `<details><summary>${t('檢查已選清單（含其他篩選範圍）', 'Xem các hạng mục đã chọn (gồm phạm vi khác)')}</summary><ul>${jobs.map((j) => `<li>${h(j.source.name + ' · ' + j.source.line + ' / ' + j.source.category + ' · ' + j.start)}</li>`).join('')}</ul>${btn('clear-selection', t('清除勾選', 'Bỏ chọn'))}</details>` : `<small>${t('只可勾選尚未安排的項目；已完成項目請看結果與下一步。', 'Chỉ chọn hạng mục chưa có kế hoạch; xem kết quả và bước tiếp của mục hoàn thành.')}</small>`}</div>`;
  }
  function jobDetail(j) {
    const a = data.control.cases.filter(
      (a) =>
        a.jobId !== j.id &&
        data.control.jobs.find((o) => o.id === a.jobId)?.itemId === j.itemId &&
        !done(a),
    );
    return (
      jobSummary(j).html +
      `<h3>${h(j.source.name)}</h3><p class="rf-subtle">${h(j.source.line + ' / ' + j.source.category + ' / ' + j.source.errorCode + ' / ' + j.source.code)}</p><div class="rf-kv"><div><small>${t('應檢期別', 'Kỳ kiểm tra')}</small><strong>${h(j.start + ' — ' + j.end)}</strong></div><div><small>${t('來源標準版本', 'Phiên bản tiêu chuẩn')}</small><strong>${h(j.source.version)}</strong></div></div><details class="rf-standard" open><summary>${t('檢查標準', 'Tiêu chuẩn kiểm tra')}</summary>${h(j.source.description)}</details>${a.length ? `<div class="rf-notice error">${t('前期仍有未結異常', 'Kỳ trước còn hồ sơ chưa đóng')}: ${a.map((x) => `<button class="rf-report-link" data-case="${x.id}">${h(x.number)}</button>`).join(' ')}</div>` : ''}${j.planId ? `<button class="rf-btn primary" data-doc="${h(j.planId)}">${t('開啟計畫', 'Mở kế hoạch')}</button>` : batch()}`
    );
  }
  function batch() {
    return `<h3>${t('批次安排檢查', 'Lập kế hoạch kiểm tra')}</h3><p class="rf-subtle">${t('勾選左侧應檢項目，建立同一份計畫。每項的涵蓋產品保留在來源快照中。', 'Chọn các hạng mục bên trái để tạo chung một kế hoạch. Lưu phạm vi sản phẩm theo tiêu chuẩn.')}</p><div class="rf-kv"><div><small>${t('已選項目', 'Đã chọn')}</small><strong>${s.checked.size}</strong></div><div><small>${t('負責人', 'Phụ trách')}</small><strong>${h(data.identity.name)}</strong></div></div>${btn('create-plan', t('＋ 建立檢查計畫', '＋ Tạo kế hoạch'), !s.checked.size || !data.permissions.edit, 'primary')}`;
  }
  const coverage = (src) =>
    `<div class="rf-coverage"><b>${t('涵蓋產品', 'Sản phẩm bao phủ')}</b><br>${src.products.map((p) => h(p.code + ' · ' + p.name)).join(' / ') || '—'}</div>`;
  function detail() {
    if (s.tab === 'jobs') {
      const j = data.control.jobs.find((j) => j.id === s.selected);
      return j ? jobDetail(j) : batch();
    }
    if (s.tab === 'cases' || s.tab === 'failed') {
      if (doc()) return documentDetail(doc());
      const a = selectedCase();
      return a ? caseDetail(a) : empty();
    }
    const d = doc();
    return d ? documentDetail(d) : empty();
  }
  const empty = () =>
    `<div class="rf-empty"><span class="rf-icon">▤</span><b>${t('選擇一筆工作開始', 'Chọn một hồ sơ')}</b>${t('明細、照片與歷史會顯示在這裡', 'Chi tiết, hình ảnh và lịch sử hiển thị tại đây')}</div>`;
  function documentDetail(d) {
    const frozen=expiredPlan(d);
    const edit = status(d) === 'draft' && data.permissions.edit&&!frozen,
      c = edit ? buffer(d) : content(d),
      p = frozen?{...data.permissions,edit:false,save:false,submit:false}:data.permissions;
    const jobs = c.lines.map((l) =>
      data.control.jobs.find((j) => j.id === l.jobId),
    );
    const linkedCase = d.caseId && data.control.cases.find(item=>item.id===d.caseId);
    const caseLine = linkedCase && c.lines.find(line=>line.jobId===linkedCase.jobId);
    const complete = jobs.filter((j) => j.completion).length;
    const _pending = d.flow.cases.find((a) => a.id === d.flow.pendingId);
    return `<article class="rf-document">${frozen?`<p class="rf-notice" role="status">${t('已逾期 · 計畫僅供查看，不能修改、刪除或重新送審；已保存內容與操作紀錄保留，下一期依原頻率安排。','Quá hạn · Kế hoạch chỉ đọc, không sửa, xóa hoặc gửi lại; giữ nội dung đã lưu và lịch sử, kỳ tiếp theo theo tần suất hiện có.')}</p>`:''}<div class="rf-draft-header"></div>${issuePanels(d, c)}<div class="rf-operation-log"><ol>${(d.lifecycle || []).map((a) => `<li>${h(a.at)} · ${h(a.actor.name)} · ${h(label(a.action))}</li>`).join('')}${d.flow.cases.map((a) => `<li>${h(a.at)} · ${h(a.actor.name)} · ${h(a.reason)} · ${h(a.status)}${a.result ? ` · ${h(a.result.actor?.name)} · ${h(a.result.at)}` : ''}</li>`).join('')}</ol></div><div class="rf-actions">${status(d) === 'draft' ? btn('save', t('儲存', 'Lưu'), !p.save, 'primary') + btn('submit', t('送審', 'Gửi duyệt'), !p.submit || !d.flow.saved || legacyCalendarFollowup(d) || (calendarMode()&&d.calendarVersion!==2)) : ''}${status(d) === 'draft' ? btn('discard', t('捨棄草稿', 'Bỏ bản nháp'), !p.edit || (!!d.flow.active.id && !p.revoke), 'danger') : ''}${status(d) === 'pending' ? btn('review', t('審核', 'Duyệt'), !p.approve && !p.return) + btn('withdraw', t('撤回', 'Rút lại'), !p.withdraw) : ''}</div>${cancellationPanel(d)}${approvalPanel(d)}<h3 class="rf-number ${reportType(d)}">${h(displayNumber(d))}</h3>${legacyNumber(d)}${retestLinks(d)}${btn('expand-report', s.wide ? t('回到左右明細', 'Về bố cục hai cột') : t('展開完整報告', 'Mở rộng báo cáo'))}<p class="rf-subtle">${reportLabel(d)} · ${h(d.owner.name)} · ${h(d.createdAt.slice(0, 16).replace('T', ' '))}</p>${d.correctionOf ? `<p>${t('更正來源', 'Sửa từ')} <button class="rf-report-link" data-doc="${h(d.correctionOf)}">${h(docs().find((o) => o.id === d.correctionOf)?.number)}</button></p>` : ''}${integratedPlan(d)}${approvedReportRouting(d)}${d.caseId ? `<div class="rf-notice"><button class="rf-report-link" data-case="${h(d.caseId)}">${h(data.control.cases.find((a) => a.id === d.caseId)?.number)} →</button><p>${t('應複測樣品（尚待驗證；不是本次實測）', 'Mẫu cần thử lại (chờ xác minh; không phải mẫu đã thử lần này)')}：${h(linkedCase ? sampleNames(caseLine||{source:{products:[]}},linkedCase.requiredSamples||[])||'—' : '—')}</p></div>` : ''}${d.kind === 'plan' ? `<div class="rf-progress"><span style="width:${(100 * complete) / Math.max(1, jobs.length)}%"></span></div><p class="rf-subtle">${t('計畫完成', 'Tiến độ kế hoạch')} ${complete}/${jobs.length} · ${d.calendarVersion===2?t('正式結果於報告核准後更新','Cập nhật kết quả sau khi báo cáo được duyệt'):t('異常是否結案另行確認', 'Đóng bất thường được xác nhận riêng')}</p>` : ''}<div class="rf-input-grid"><label>${t('文件名稱', 'Tên hồ sơ')}<input data-field="title" value="${h(c.title)}" ${edit ? '' : 'disabled'}></label>${d.kind==='plan'&&calendarMode()?'':`<label>${t('實際日期', 'Ngày thực tế')}<input type="date" data-field="date" value="${h(c.date)}" ${edit ? '' : 'disabled'}></label>`}</div>${calendarFields(d,c,edit)}${correctionEvidence(d,c)}${c.lines.map((l, index) => lineHTML(l, index, d, edit)).join('')}<div class="rf-edit"><label>${t('備註', 'Ghi chú')}<textarea data-field="notes" ${edit ? '' : 'disabled'}>${h(c.notes)}</textarea></label>${['waiver', 'disposal'].includes(d.kind) ? `<label>${d.disposalPolicy==='skip-period'?t('處置原因（必填）','Lý do xử lý (bắt buộc)'):t('申請原因','Lý do đề nghị')}<textarea data-field="reason" ${edit ? '' : 'disabled'}>${h(c.reason)}</textarea></label>` : ''}${d.kind === 'disposal' ? `<label>${d.disposalPolicy==='skip-period'?t('問題說明（必填）','Mô tả vấn đề (bắt buộc)'):t('處置內容','Nội dung xử lý')}<textarea data-field="disposition" ${edit ? '' : 'disabled'}>${h(c.disposition)}</textarea></label><div><label>${(d.calendarVersion===2?t('處置照片（選填）','Ảnh xử lý (không bắt buộc)'):t('處置照片（必填，至少一張成功上傳）', 'Ảnh xử lý (bắt buộc, tải thành công ít nhất một ảnh)'))}</label><div class="rf-photos">${c.evidence.map(p => draftPhoto(p,edit)).join('')}${edit ? upload('evidence') : ''}</div></div>` : ''}</div><div class="rf-actions">${status(d) === 'approved' ? btn('export', t('↓ 匯出正式文件', '↓ Xuất hồ sơ chính thức'), !p.history) : ''}${d.kind === 'plan' && status(d) === 'approved' ? planActions(d) : ''}</div>${d.impact?.length ? `<div class="rf-notice error">${t('下游影響追蹤', 'Theo dõi ảnh hưởng')} ${d.impact.map((a) => `<p><button class="rf-report-link" data-doc="${a.id}">${h(a.id)}</button> ${h(issueNames[a.reason]?t(...issueNames[a.reason]):a.reason)} ${a.resolvedAt ? '✓' : ''}</p>`).join('')}${btn('resolve-impact', t('確認影響處理', 'Xác nhận xử lý ảnh hưởng'), !p.approve || d.impact.every((a) => a.resolvedAt))}</div>` : ''}${data.control.cases
      .filter((a) => a.reportIds.includes(d.id))
      .map(
        (a) =>
          `<div class="rf-notice">${tag(a.status)} <button class="rf-report-link" data-case="${a.id}">${h(a.number)} →</button></div>`,
      )
      .join('')}</article>`;
  }
  const draftPhoto = (p, edit) => '<span class="rf-photo-entry">' + photo(p) + (edit ? '<button type="button" class="rf-btn danger rf-photo-remove" data-remove-photo="' + h(p) + '" aria-label="' + t('移除此照片','Gỡ ảnh này') + '">' + t('移除照片','Gỡ ảnh') + '</button>' : '') + '</span>';
  const upload = (key) =>
    `<label class="rf-upload" tabindex="0" role="button" aria-label="${h(t('上傳照片', 'Tải ảnh'))}" title="${h(t('上傳照片', 'Tải ảnh'))}">＋<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload="${key}" aria-label="${h(t('上傳照片', 'Tải ảnh'))}"></label>`;
  function lineHTML(l, index, d, edit) {
    if(d.calendarVersion===2&&d.cancelledJobIds?.includes(l.jobId))return `<section class="rf-item"><p>${h(l.source.name)} · ${t('此項已核准終止，保留歷史，不列入本次結果。','Hạng mục đã được duyệt dừng; giữ lịch sử, không tính vào kết quả này.')}</p></section>`+lineHTML(l,index,{...d,cancelledJobIds:d.cancelledJobIds.filter(id=>id!==l.jobId)},false);
    const now = data.sources.find((o) => o.id === l.source.id),
      changed = !now || now.versionId !== l.source.versionId;
    return `<section class="rf-item" data-line="${index}" data-line-id="${h(l.id)}"><div class="rf-item-head"><strong>${index + 1}. ${h(l.source.name)}</strong><small>${h(l.source.line + ' / ' + l.source.category + ' / ' + l.source.errorCode + ' / ' + l.source.code)} · ${t('版本', 'Phiên bản')} ${h(l.source.version)}</small>${changed ? `<small>⚠ ${t('來源已改版或停用；保留當次快照', 'Nguồn đã đổi hoặc tắt; giữ bản chụp gốc')}</small>` : ''}</div><div class="rf-item-body">${retestGuidance(d,l,index,edit)}<details class="rf-standard"><summary>${t('展開當次標準', 'Xem tiêu chuẩn tại thời điểm này')}</summary>${h(l.source.description)}</details>${d.kind === 'report' ? l.results.map((r, ri) => resultHTML(l, r, ri, edit, index)).join('') + (edit && d.calendarVersion!==2 ? btn('add-result:' + index, t('＋ 新增樣品結果列', '＋ Thêm dòng kết quả mẫu'), (requiredForLine(d,l).length ? requiredForLine(d,l) : l.source.products.map(p=>p.code)).every(code=>l.results.some(r=>r.samples.includes(code)))) : '') : ''}</div></section>`;
  }
  function resultHTML(l,r,ri,edit){
    const report=doc(),v2=report?.calendarVersion===2,disposing=r.outcome==='dispose';
    const required=requiredForLine(report,l),fixed=v2||required.length>0;
    const used=new Set(l.results.filter(row=>row.id!==r.id).flatMap(row=>row.samples));
    const abnormal=r.outcome==='abnormal', correction=!!report?.correctionOf;
    const outcomes=calendarMode()?['pass','fail','abnormal',...(disposing&&(!edit||correction)?['dispose']:[])]:['pass','fail','unable','undetermined'];
    const choices = disposing || abnormal ? '' : fixed ? '<p class="rf-fixed-sample">' + t('請用原樣品檢查：','Kiểm tra bằng mẫu gốc: ') + h(sampleNames(l,r.samples.length ? r.samples : required)) + '</p>' : '<details class="rf-samples" data-sample-key="' + h(r.id) + '" ' + (s.sampleOpen.get(r.id) ? 'open' : '') + '><summary>' + (edit ? t('實測樣品（只能選一個）','Mẫu thực thử (chọn một)') : t('實測樣品','Mẫu thực thử')) + ': ' + h(sampleNames(l,r.samples) || t('尚未選取','Chưa chọn')) + '</summary>' + (edit && r.outcome !== 'unable' ? '<input data-sample-search placeholder="' + t('搜尋樣品','Tìm mẫu') + '"><div class="rf-sample-options">' + l.source.products.map(p => '<label data-product-label><input type="radio" name="rf-sample-' + h(l.id + '-' + r.id) + '" data-sample="' + h(p.code) + '" ' + (r.samples.includes(p.code) ? 'checked ' : '') + (used.has(p.code) ? 'disabled ' : '') + '>' + h(sampleNames(l,[p.code])) + (used.has(p.code) ? ' · ' + t('其他結果列已選','Đã chọn ở dòng khác') : '') + '</label>').join('') + '</div>' : '<p>' + h(sampleNames(l,r.samples) || '—') + '</p>') + '</details>';
    const textarea=(field,title,value)=>`<label>${title}<textarea data-result-field="${field}" ${edit?'':'disabled'}>${h(value||'')}</textarea></label>`;
    const options=outcomes.map(outcome=>{
      const locked=!edit||(!v2&&outcome==='abnormal')||(correction&&(outcome==='dispose')!==disposing);
      return `<button type="button" aria-pressed="${r.outcome===outcome}" data-outcome="${outcome}" class="${r.outcome===outcome?'active':''}" ${locked?'disabled':''}>${label(outcome)}</button>`;
    }).join('');
    const fields=disposing
      ? textarea('disposalReason',t('處置原因（必填）','Lý do xử lý (bắt buộc)'),r.disposalReason)+
        textarea('notes',t('問題說明（必填）','Mô tả vấn đề (bắt buộc)'),r.notes)
      : abnormal
        ? textarea('notes',t('異常備註（選填）','Ghi chú bất thường (không bắt buộc)'),r.notes)
        : textarea('value',t('實測結果／數值','Kết quả / giá trị thực tế'),r.value)+textarea('notes',
        r.outcome==='pass'?t('備註（合格免填原因）','Ghi chú (đạt không cần lý do)'):t('問題說明／原因','Mô tả vấn đề / lý do'),r.notes);
    const evidenceHint=abnormal?t('報告核准後，可在異常處理申請復測或處置。','Sau khi duyệt báo cáo, có thể đề nghị thử lại hoặc xử lý trong mục bất thường.'):
      disposing?t('舊制處置資料已保留。','Đã giữ dữ liệu xử lý theo quy trình cũ.'):
      ['fail','undetermined'].includes(r.outcome)?(v2?t('送審需至少一張成功上傳照片。缺漏可先儲存。','Cần ít nhất một ảnh tải thành công để gửi duyệt. Có thể lưu khi còn thiếu.'):
        t('送審需說明及至少一張成功上傳照片。缺漏可先儲存。','Cần mô tả và ít nhất một ảnh tải thành công để gửi duyệt. Có thể lưu khi còn thiếu.')):'';
    return `<details class="rf-result" data-result="${ri}" data-result-id="${h(r.id)}" ${(s.resultOpen.get(r.id)??ri===0)?'open':''}>
      <summary class="rf-result-top"><b>${t('結果列','Dòng kết quả')} ${ri+1} · ${h((disposing||abnormal)?label(r.outcome):sampleNames(l,r.samples)||t('尚未選樣','Chưa chọn mẫu'))}</b></summary>
      <div class="rf-result-body">${edit&&l.results.length>1?btn('remove-result',t('移除列','Xóa dòng')):''}
        ${edit?`<p class="rf-select-hint">${t('請選取檢查結果','Vui lòng chọn kết quả kiểm tra')}</p>`:''}
        ${v2&&r.outcome==='undetermined'?`<p class="rf-notice">${t('原紀錄：無法判定（保留）；重新送審前請選擇新制結果。','Bản ghi gốc: chưa xác định (giữ nguyên); chọn kết quả mới trước khi gửi lại.')}</p>`:''}
        <div class="rf-choice" data-editable="${edit}">${options}</div>${choices}
        ${r.outcome==='unable'?`<p class="rf-notice">${calendarMode()?(edit&&v2?t('既有結果：無法測試。重送前請選擇新版結果。','Kết quả cũ: không thể thử. Chọn kết quả mới trước khi gửi lại.'):
          t('既有結果：無法測試','Kết quả cũ: không thể thử')):
          t('無法測試，不記錄虛擬樣品。','Không thể thử; không ghi mẫu giả.')}</p>`:''}
        <div class="rf-edit">${fields}</div><div class="rf-photos">${r.photos.map(p=>draftPhoto(p,edit)).join('')}${edit?upload('result'):''}</div>
        ${evidenceHint?`<p class="rf-subtle">${evidenceHint}</p>`:''}
      </div></details>`;
  }
  function followupState(a) {
    const open = liveDocs().find((d) => d.caseId === a.id && status(d) !== 'approved') || (a.status === 'retest' && liveDocs().find((d) => d.caseId === a.id && d.kind === 'plan' && status(d) === 'approved' && reportSlots(d).some((slot) => slot.assigned && !slot.reportIds.length))) || null;
    const retest = open && ['report', 'plan'].includes(open.kind) ? open : null;
    const lastFailure = [...a.events].reverse().find((e) => e.action === 'fail');
    const improvementNeeded = a.result === 'fail' && !a.improvements.some((i) => i.at >= (lastFailure?.at || ''));
    return {open, retest, improvementNeeded};
  }
  function retestActions(a) {
    const {open, retest, improvementNeeded} = followupState(a);
    const locked = done(a) || !data.permissions.edit;
    if (retest) {
      const draft = status(retest) === 'draft', approvedPlan = status(retest) === 'approved', blocked = (retest.dependencies?.documents?.length || retest.dependencies?.cases?.length || 0) > 0;
      return '<div class="rf-retest-state" role="status">' + btn(draft ? 'recall-retest' : 'open-retest', draft ? t('已建立複測 · 點擊收回草稿','Đã tạo thử lại · Bấm thu hồi nháp') : approvedPlan ? t('複測計畫已核准 · 開啟填報','Kế hoạch thử lại đã duyệt · Mở lập báo cáo') : t('複測已送審 · 開啟查看','Đã gửi thử lại · Mở xem'), draft && (locked || blocked || (!!retest.flow.active.id && !data.permissions.revoke))) +
        '<button class="rf-btn" data-doc="' + h(retest.id) + '">' + t('開啟複測','Mở thử lại') + ' · ' + h(retest.number) + '</button><p class="rf-subtle">' +
        (draft ? blocked ? t('已有相依文件，不能收回；請開啟複測查看。','Có hồ sơ phụ thuộc; không thể thu hồi. Mở thử lại để xem.') : t('尚未送審。收回會保留歷史，並讓案件回到待處理狀態。','Chưa gửi duyệt. Thu hồi giữ lịch sử và đưa hồ sơ về chờ xử lý.') : approvedPlan ? t('計畫已核准，請接續建立執行報告；正式版本保留。','Kế hoạch đã duyệt; tiếp tục tạo báo cáo thực hiện, giữ phiên bản chính thức.') : t('請先在原文件撤回送審，才能收回草稿。','Rút hồ sơ gửi duyệt trước khi thu hồi bản nháp.')) + '</p>' +
        (s.cancelConfirm === 'retest:' + retest.id ? '<div class="rf-inline-confirm">' + t('確認收回此複測草稿？原不合格及歷次報告保留，可從歷史復原。','Thu hồi bản nháp thử lại này? Giữ kết quả không đạt và các báo cáo; có thể khôi phục từ lịch sử.') + btn('confirm-recall-retest',t('確認收回複測','Xác nhận thu hồi thử lại'),locked || blocked || (!!retest.flow.active.id && !data.permissions.revoke),'danger') + btn('cancel-confirmation',t('取消','Hủy')) + '</div>' : '') + '</div>';
    }
    const blocked = locked || !!open || a.status === 'ready-close';
    return btn('followup-report',t('改善並建立複測','Cải thiện và tạo thử lại'),blocked,'primary') + '<p class="rf-subtle rf-retest-guidance">' +
      (open ? t('已有後續申請，請先完成或收回原草稿：','Có đề nghị tiếp theo; hoàn tất hoặc thu hồi bản nháp:') + '<button class="rf-report-link" data-doc="' + h(open.id) + '">' + h(open.number) + '</button>' :
        done(a) ? t('案件已結案。','Hồ sơ đã đóng.') : a.status === 'ready-close' ? t('複測合格已核准，請確認結案。','Thử lại đạt đã được duyệt; xác nhận đóng hồ sơ.') : improvementNeeded ? t('填寫本次改善措施後，一次記錄改善並建立複測。','Nhập biện pháp cải thiện, ghi nhận và tạo thử lại trong một bước.') : t('建立後會在此顯示複測編號，可開啟填寫或收回尚未送審草稿。','Sau khi tạo sẽ hiện số thử lại tại đây; có thể mở nhập hoặc thu hồi nháp chưa gửi.')) + '</p>';
  }
  function caseDetail(a) {
    if(calendarMode()){
      const j=data.control.jobs.find(j=>j.id===a.jobId);
      if(!j)return `<p class="rf-notice">${t('找不到可對應的歷史項目','Không tìm thấy hạng mục lịch sử tương ứng')}</p>`;
      const outcome=caseOutcome(a),request=caseRequest(a),retest=caseRetestWork(a)[0];
      const planned=docs().find(d=>d.id===retest?.planId&&!d.cancelled);
      const report=docs().find(d=>planned&&d.kind==='report'&&d.planId===planned.id&&!d.cancelled);
      const reportReady=planned&&status(planned)==='approved'&&reportSlots(planned).some(slot=>slot.jobId===retest.id&&slot.assigned&&!slot.reportIds.length);
      const result=t('最新已核准結果','Kết quả đã duyệt mới nhất')+' · '+(outcome?label(outcome):t('需確認原紀錄','Cần xác nhận hồ sơ gốc'));
      const entry=request?`<button class="rf-btn" data-doc="${h(request.id)}">${t('接續申請','Tiếp tục đề nghị')} · ${h(displayNumber(request))}</button>`:
        report?`<button class="rf-btn" data-doc="${h(report.id)}">${t('開啟復測報告','Mở báo cáo thử lại')} · ${h(displayNumber(report))}</button>`:
        reportReady?`<button class="rf-btn primary" data-plan-report="${h(planned.id)}" ${data.permissions.edit?'':'disabled'}>${t('填寫復測報告','Nhập báo cáo thử lại')}</button>`:
        planned?`<button class="rf-btn" data-doc="${h(planned.id)}">${t('查看復測計劃','Xem kế hoạch thử lại')} · ${h(displayNumber(planned))}</button>`:
        retest?`<button class="rf-btn primary" data-period-next="${h(retest.id)}" ${data.permissions.edit&&arrangeable(retest)?'':'disabled'}>${t('建立復測計劃','Tạo kế hoạch thử lại')}</button>`:'';
      const actions=['retest','disposal'].filter(kind=>caseCanRequest(a,kind))
        .map(kind=>btn('calendar-'+kind,kind==='retest'?t('開始復測','Bắt đầu thử lại'):requestName(kind),!data.permissions.edit)).join('');
      return `<h3>${h(a.number)}</h3>${tag(a.status)}<p>${h(j.source.name)}</p>
        <p>${h(periodLabel(j))}</p><p>${h(result)}</p>${done(a)?`<p class="rf-notice">${h(periodClosureLabel(j))}</p>`:''}<div class="rf-actions">${done(a)?'':entry+actions}</div>${periodHistory(j)}`;
    }
    const j = data.control.jobs.find((j) => j.id === a.jobId);
    return `<h3>${h(a.number)}</h3>${tag(a.status)} <p>${h(j.source.name)}</p><p class="rf-subtle">${h(j.start + ' — ' + j.end)} · ${t('原不合格與每次複測都會保留', 'Lưu kết quả ban đầu và mọi lần thử lại')}</p><div class="rf-actions">${retestActions(a)}${btn('followup-waiver', t('申請本期免做', 'Đề nghị miễn kỳ'), done(a) || a.result !== 'unable' || a.unresolvedFailureSamples?.length || !data.permissions.edit)}${btn('followup-disposal', t('申請處置結案', 'Đề nghị đóng xử lý'), done(a) || (a.result !== 'fail' && !a.unresolvedFailureSamples?.length) || !data.permissions.edit)}${btn('close', t('確認結案', 'Xác nhận đóng'), a.status !== 'ready-close' || !data.permissions.approve, 'primary')}</div>${s.busy ? '<p role="status">' + t('正在處理，請稍候…','Đang xử lý, vui lòng chờ…') + '</p>' : ''}${s.error ? '<div class="rf-notice error" role="alert">' + h(s.error) + (s.retry ? btn('retry',t('查原操作收據（不重送）','Kiểm tra biên nhận (không gửi lại)')) : '') + '</div>' : ''}<ol class="rf-timeline">${a.events.map((e) => `<li><b>${h(label(e.action))}</b><time>${h(e.at)} · ${h(e.actor.name)}</time><p>${h(e.reason)}</p>${e.documentId ? `<button class="rf-report-link" data-doc="${e.documentId}">${h(docs().find((d) => d.id === e.documentId)?.number || e.documentId)}</button>` : ''}</li>`).join('')}</ol>${a.improvements.map((i) => `<div class="rf-notice"><b>${t('改善紀錄', 'Ghi cải thiện')}</b><p>${h(i.notes)}</p><small>${h(i.actor.name + ' · ' + i.at)}</small><div class="rf-photos">${i.photos.map(photo).join('')}</div></div>`).join('')}`;
  }
  function choose(value, tab = s.tab) {
    retireApprovedHistory();
    const leavingReviewForCase = s.reviewPlatform && ['cases','failed'].includes(tab);
    if (tab !== s.tab) s.highlight = '';
    if(receiptRecord&&!receiptRecord.terminal&&!receiptInvalid&&!activeDeliveries&&!s.busy&&receiptOwnedPin(receiptPin())){
      const match=receiptDiscover(data.identity.id).find(row=>row.meta.documentId===value);
      if(match&&match.key!==receiptRecord.key){
        parkedReceipts.set(receiptRecord.key,receiptRecord);
        const held=parkedReceipts.get(match.key);
        receiptRecord=held?.raw===match.raw?held:match;receiptPresentation=null;
        s.retry=receiptRecord.ram||receiptRetry(receiptRecord.meta);s.retryDeparture=null;s.retryOwner=null;
      }
    }
    s.selected = value;
    s.tab = tab === 'documents' ? documentTab(docs().find((d) => d.id === value)) : tab;
    s.cancelConfirm = null;
    s.selfReview = null;
    if (doc() && s.documentKind && doc().kind !== s.documentKind) s.documentKind = '';
    if (doc() && s.workState && status(doc()) !== s.workState) s.workState = '';
    s.error = '';
    s.issues = [];
    if (leavingReviewForCase) {
      window.ProcessDualSystem.go('quality-inspections');
      return;
    }
    paint();
    if (calendarMode() && value) revealRoutineDetail(root);
    else if (value && window.matchMedia('(max-width: 760px)').matches) root.querySelector('.rf-detail-panel')?.scrollIntoView({block:'start'});
    else root.querySelector('.rf-table tr.selected')?.focus({preventScroll:true});
  }
  function bind() {
    if(!s.reviewPlatform && data?.identity)window.RoutineReset?.bind(root,'fqc',data.identity.id,t,
      ()=>normalWork() && !s.busy && !loading && !receiptInvalid && !inFlightMutation && !s.dialogOpen && !departureDocuments().length,
      ()=>refresh(false),{
        capture:()=>window.RoutineReset.markers(receiptDiscover(data.identity.id).map(row=>({...row,operationId:row.meta.operationId}))),
        invalidate:()=>{parkedReceipts.clear();receiptLifecycle++;historyDisplayEpoch++;refreshSequence++;if(receiptRecord){receiptRecord.terminal=null;receiptRecord.confirmed=null;}},
        settle:async receipt=>{
          const actor=data.identity.id,rows=receiptDiscover(actor).map(row=>({...row,operationId:row.meta.operationId,storage:receiptStore()}));
          await window.RoutineReset.settle('fqc',actor,receipt,()=>read(''),rows);
          if(receiptRecord&&receiptStore().getItem(receiptRecord.key)===null){receiptRecord=null;s.retry=null;s.retryOwner=null;s.retryDeparture=null;}
          receiptInstall(actor);
        }
      });
    root.querySelectorAll('[data-timeline-doc]').forEach(button=>button.onclick=()=>openTimelineDocument(button));
    root.querySelector('[data-approved-report-search]')?.addEventListener('submit',event=>{
      event.preventDefault();
      s.approvedReportQuery=event.currentTarget.querySelector('input').value.trim();
      s.approvedReportLimit=20;
      paint();
      root.querySelector('[data-approved-report-search] input')?.focus({preventScroll:true});
    });
    root.querySelector('[data-approved-report-more]')?.addEventListener('click',()=>{
      const nextIndex=s.approvedReportLimit;
      s.approvedReportLimit+=20;
      paint();
      root.querySelectorAll('[data-approved-report]')[nextIndex]?.focus();
    });
    root.querySelectorAll('[data-period-toggle]').forEach(button => button.onclick = () => {
      const key = button.dataset.periodToggle;
      const restore = keepListAnchor(button, () => [...root.querySelectorAll('[data-period-toggle]')].find(next => next.dataset.periodToggle === key));
      if (s.periodExpanded.has(key)) { s.periodExpanded.delete(key); s.periodMore.delete(key); }
      else s.periodExpanded.add(key);
      paint();
      restore?.();
    });
    const setOlderExpanded = (button, key, expanded) => {
      const restore = keepListAnchor(button, () => [...root.querySelectorAll('[data-period-older-toggle]')].find(next => next.dataset.periodOlderToggle === key));
      if (expanded) s.periodMore.set(key,periodsPerPage);
      else s.periodMore.delete(key);
      paint();
      restore?.();
    };
    root.querySelectorAll('[data-period-older-toggle]').forEach(button => button.onclick = () => {
      const key = button.dataset.periodOlderToggle;
      setOlderExpanded(button,key,!s.periodMore.has(key));
    });
    root.querySelectorAll('[data-period-older-close]').forEach(button => button.onclick = () => {
      setOlderExpanded(button,button.dataset.periodOlderClose,false);
    });
    root.querySelectorAll('[data-period-more]').forEach(button => button.onclick = () => {
      const key = button.dataset.periodMore;
      const anchor = [...root.querySelectorAll('[data-period-older-toggle],[data-period-toggle]')].find(next => (next.dataset.periodOlderToggle ?? next.dataset.periodToggle) === key);
      const restore = keepListAnchor(anchor, () => [...root.querySelectorAll('[data-period-older-toggle],[data-period-toggle]')].find(next => (next.dataset.periodOlderToggle ?? next.dataset.periodToggle) === key));
      const count = s.periodMore.get(key) || (periodFiltersActive() ? periodsPerPage : 0);
      s.periodMore.set(key,count+periodsPerPage);
      paint();
      restore?.();
    });
    root.querySelectorAll('[data-period-search]').forEach(form => form.onsubmit = event => {
      event.preventDefault();
      const from=form.querySelector('[name="from"]').value,to=form.querySelector('[name="to"]').value;
      if(from&&to&&from>to){
        const error=form.querySelector('[data-period-filter-error]');
        error.hidden=false;
        error.textContent=t('檢查期別起日不能晚於迄日。','Ngày bắt đầu kỳ không được sau ngày kết thúc.');
        return;
      }
      s.periodSearch=form.querySelector('[name="query"]').value.trim();
      s.periodFrom=from;s.periodTo=to;s.periodOutcome=form.querySelector('[name="outcome"]').value;
      s.periodMore.clear();
      paint();
      root.querySelector('[data-period-search] input')?.focus?.({preventScroll:true});
    });
    root.querySelectorAll('[data-period-search-reset]').forEach(button => button.onclick = () => {
      s.sourceLine=s.sourceCategory=s.sourceProduct='';
      s.periodSearch=s.periodFrom=s.periodTo=s.periodOutcome='';
      s.periodMore.clear();
      paint();
      root.querySelector('[data-period-search] input')?.focus?.({preventScroll:true});
    });
    root.querySelectorAll('[data-period-next]').forEach(b=>b.onclick=()=>{const j=data.control.jobs.find(j=>j.id===b.dataset.periodNext);if(!j||!arrangeable(j)||!data.permissions.edit)return;s.checked=new Set([j.id]);void act('create-plan');});
    root.querySelectorAll('[data-period-overdue-skip]').forEach(b=>b.onclick=()=>{const j=data.control.jobs.find(j=>j.id===b.dataset.periodOverdueSkip);if(!canSkipOverdue(j)||!data.permissions.edit)return;s.checked=new Set([j.id]);void act('calendar-overdue-skip');});
    root.querySelectorAll('[data-period-exempt]').forEach(b=>b.onclick=()=>{const j=data.control.jobs.find(j=>j.id===b.dataset.periodExempt);if(!j||!canExempt(j)||!data.permissions.edit)return;s.checked=new Set([j.id]);void act('calendar-skip');});
    root.querySelectorAll('[data-source-filter]').forEach(b => b.onchange = () => {
      s[b.dataset.sourceFilter] = b.value;
      if(b.dataset.sourceFilter === 'sourceLine') s.sourceCategory = '';
      if(b.dataset.sourceFilter !== 'sourceProduct') s.sourceProduct = '';
      paint();
    });
    root.querySelectorAll('[data-doc],[data-review-doc]').forEach(el => {
      const linked = docs().find(d => d.id === (el.dataset.doc || el.dataset.reviewDoc));
      if (linked) { el.dataset.rfTone = reportType(linked); el.classList.add('rf-document-link'); }
    });
    root
      .querySelectorAll('[data-action]')
      .forEach((b) => (b.onclick = () => act(b.dataset.action, b)));
    root.querySelectorAll('[data-tab]').forEach(
      (b) =>
        (b.onclick = () => {
          retireApprovedHistory();
          const leavingHistory = s.tab === 'history' && !calendarMode();
          if(s.tab!==b.dataset.tab)s.workState='';
          s.tab = b.dataset.tab;

          s.highlight = '';
          s.selected = null;
          s.listReturn = null;
          s.overdue = false;
          if (leavingHistory && s.tab !== 'history') void refresh(true).catch(fault);
          else paint();
        }),
    );
    root.querySelectorAll('[data-module]').forEach(
      (b) =>
        (b.onclick = () => {
          s.module = b.dataset.module === '0' ? 'FQC' : b.dataset.module;
          paint();
        }),
    );
    root.querySelectorAll('[data-work-state]').forEach((b) => {
      b.onpointerdown = (e) => e.preventDefault();
      b.onclick = () => { holdFilterView(); s.workState = b.dataset.workState; s.review = ''; s.selected = null; paint(); root.querySelector('[data-work-state="' + s.workState + '"]')?.focus({preventScroll:true}); };
    });
    root.querySelectorAll('[data-kind]').forEach((b) => {
      b.onpointerdown = (e) => e.preventDefault();
      b.onclick = () => { holdFilterView(); s.documentKind = b.dataset.kind; s.selected = null; paint(); root.querySelector('[data-kind="' + s.documentKind + '"]')?.focus({preventScroll:true}); };
    });
    root.querySelectorAll('[data-list-jump]').forEach((b) => {
      b.onpointerdown = (e) => e.preventDefault();
      b.onclick = () => jumpListGroup(b.dataset.listJump);
    });
    root.querySelectorAll('[data-plan-report]').forEach((b) => b.onclick = () => act('create-report', b));
    root.querySelectorAll('[data-review-module]').forEach((b) => b.onclick = () => { s.reviewModule = b.dataset.reviewModule; s.selected = null; paint(); });
    root.querySelectorAll('[data-issue-index]').forEach((b) => b.onclick = () => focusIssue(s.issueTargets[Number(b.dataset.issueIndex)]));
    root.querySelectorAll('[data-self-review]').forEach(b => b.onchange = () => {
      const current=doc();
      s.selfReview=b.checked?current?.flow.pendingId:null;
      for(const action of ['approve','return']){
        const button=root.querySelector(`[data-action="${action}"]`);
        if(button)button.disabled=s.busy||!!reviewBlock(current,action);
      }
      const status=root.querySelector('[data-rf-review-block]');
      if(status)status.textContent=reviewBlock(current,'approve');
    });
    root.querySelectorAll('[data-id]').forEach((b) => {
      b.tabIndex = 0;
      b.setAttribute('aria-selected', String(b.dataset.id === s.selected));
      b.onpointerdown = (e) => { if (!e.target.closest('input,button,a')) e.preventDefault(); };
      // Prevent browser focus scrolling before the explicit preventScroll focus in choose().
      b.onclick = (e) => {
        if (!e.target.closest('input,button,a')) choose(b.dataset.id);
      };
      b.onkeydown = (e) => {
        if (e.key === 'Enter' && e.target === b) choose(b.dataset.id);
      };
    });
    root.querySelectorAll('[data-job]').forEach(
      (b) =>
        (b.onchange = () => {
          s.selectionNotice = '';
          if (b.checked) { s.checked.add(b.dataset.job); } else { s.checked.delete(b.dataset.job); }
          paint();
        }),
    );
    root
      .querySelectorAll('[data-doc]')
      .forEach((b) => (b.onclick = event => {event?.preventDefault();calendarListOrigin(b,'data-doc');choose(b.dataset.doc, 'documents');}));
    root
      .querySelectorAll('[data-case]')
      .forEach((b) => (b.onclick = () => {calendarListOrigin(b,'data-case');choose(b.dataset.case,caseTab(data.control.cases.find(a=>a.id===b.dataset.case)));}));
    root.querySelectorAll('[data-filter]').forEach(
      (b) =>
        (b.onchange = () => {
          s[b.dataset.filter] = b.value;
          if (b.dataset.filter === 'line') {
            s.category = '';
            s.item = '';
          }
          if (b.dataset.filter === 'category') s.item = '';
          s.selected = null;
          paint();
        }),
    );
    root.querySelectorAll('[data-stat]').forEach(
      (b) =>
        (b.onclick = () => {
          toggleHighlight(b.dataset.stat, b.dataset.stat === 'overdue' ? 'jobs' : b.dataset.stat);
        }),
    );
    const d = doc();
    root.querySelectorAll('.rf-samples').forEach(el => el.ontoggle = () => { if (el.isConnected) s.sampleOpen.set(el.dataset.sampleKey,el.open); });
    root.querySelectorAll('.rf-result[data-result-id]').forEach(el => el.ontoggle = () => { if (el.isConnected) s.resultOpen.set(el.dataset.resultId,el.open); });
    if (!d || status(d) !== 'draft') return;
    const c = buffer(d),
      touch = () =>
        { window.VersionDraftUI?.updateSaved(root, { ...d.flow, working: c }); updateRoutineIssues(d,c); }
    root.querySelectorAll('[data-field]').forEach(
      (el) =>
        (el.oninput = () => {
          c[el.dataset.field] = el.value;
          touch();
        }),
    );
    const row = (el) =>
      c.lines[Number(el.closest('[data-line]').dataset.line)].results[
        Number(el.closest('[data-result]').dataset.result)
      ];
    root.querySelectorAll('[data-result-field]').forEach(
      (el) =>
        (el.oninput = () => {
          row(el)[el.dataset.resultField] = el.value;
          touch();
        }),
    );
    root.querySelectorAll('[data-outcome]').forEach(
      (el) =>
        (el.onclick = () => {
          if(el.disabled)return;
          const result = row(el);
          const outcome = el.dataset.outcome;
          result.outcome = outcome;
          if(d.calendarVersion===2)result.samples=['abnormal','unable','dispose'].includes(outcome)?[]:c.lines[Number(el.closest('[data-line]').dataset.line)].source.products.map(p=>p.code);
          else if (outcome === 'unable') result.samples = [];
          paint();
          const currentRow = [...root.querySelectorAll('[data-result-id]')].find(node => node.dataset.resultId === result.id);
          currentRow?.querySelector(`[data-outcome="${outcome}"]`)?.focus({preventScroll:true});
        }),
    );
    root.querySelectorAll('[data-sample]').forEach(el => el.onchange = () => {
      if (!el.checked) return;
      const r = row(el), line = c.lines[Number(el.closest('[data-line]').dataset.line)];
      if (requiredForLine(d,line).length || line.results.some(other => other.id !== r.id && other.samples.includes(el.dataset.sample))) return;
      r.samples = [el.dataset.sample];
      touch();
      root.querySelectorAll('[data-sample]').forEach(input => {
        const own = row(input), ownLine = c.lines[Number(input.closest('[data-line]').dataset.line)];
        input.disabled = ownLine.results.some(other => other.id !== own.id && other.samples.includes(input.dataset.sample));
      });
      el.closest('details').querySelector('summary').textContent = t('實測樣品（只能選一個）','Mẫu thực thử (chọn một)') + ': ' + sampleNames(line,r.samples);
    });
    root.querySelectorAll('[data-remove-photo]').forEach(el => el.onclick = () => {
      const photos = el.closest('[data-result]') ? row(el).photos : c.evidence;
      const index = photos.indexOf(el.dataset.removePhoto);
      if (index >= 0) photos.splice(index,1);
      touch(); paint();
    });
    root.querySelectorAll('[data-sample-search]').forEach(input=>{
      input.oninput=()=>{
        const products=c.lines[Number(input.closest('[data-line]').dataset.line)].source.products;
        const query=input.value.toLowerCase();
        for(const option of input.parentElement.querySelectorAll('[data-product-label]')){
          const code=option.querySelector('[data-sample]').dataset.sample;
          const product=products.find(product=>product.code===code);
          option.hidden=![option.textContent,code,product?.name].some(value=>value?.toLowerCase().includes(query));
        }
      };
    });
    root.querySelectorAll('[data-upload]').forEach(
      (el) =>
        (el.onchange = async () => {
          const uploadCurrent=captureHistoryDisplay(),uploadPin=receiptPin();
          const file = el.files[0];
          if (!file) return;
          const photos = el.dataset.upload === 'evidence' ? c.evidence : row(el).photos;
          s.busy = true;
          el.disabled = true;
          try {
            const r = await fetch(endpoint + '/photo', {
                method: 'PUT',
                headers: { 'content-type': file.type },
                body: file,
              }),
              v = await r.json();
            if(!uploadCurrent()||!receiptCurrent(uploadPin))return;
            if (!r.ok) throw Error(v.error || 'UPLOAD_FAILED');
            if (!photos.includes(v.id)) photos.push(v.id);
            touch();
            s.error = '';
          } catch (e) {
            if(!uploadCurrent()||!receiptCurrent(uploadPin))return;
            s.error =
              t(
                '照片上傳失敗，輸入保留：',
                'Tải ảnh thất bại; giữ dữ liệu nhập: ',
              ) + e.message;
          } finally {
            s.busy = false;
            if(uploadCurrent()&&receiptCurrent(uploadPin))paint();
          }
        }),
    );
    root.querySelectorAll('.rf-upload').forEach((el) => el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.querySelector('input').click(); } });
  }
  async function draft(action, extra = {}, target = doc()) {
    assertCurrentDisplay();
    const d = target,
      operationId = id();
    return post({
      action: 'draft',
      documentId: d.id,
      operationId,
      command: {
        action,
        operationId,
        generation: d.flow.generation,
        clientId: s.client,
        sequence: ++s.seq,
        ...extra,
      },
    });
  }
  async function confirmSubmission() {
    const d=doc();
    if(!d||status(d)!=='draft'||data.permissions.submit!==true)throw Error('FORBIDDEN');
    if(dirty(d))throw Error(t('目前輸入尚未儲存，請先儲存再送審；輸入仍保留。','Dữ liệu nhập chưa lưu; hãy lưu trước khi gửi duyệt. Dữ liệu được giữ lại.'));
    const snapshot=window.captureSharedDraftSubmission(d.flow),generation=d.flow.generation,documentId=d.id,actorId=data.identity.id,identity=window.ProcessSync?.identity,identityEpoch=window.ProcessSync?.identityGeneration?.(),delivery=window.ProcessSync?.captureDelivery?.(),page=root;
    const confirmed=await dialog(t('確認送審','Xác nhận gửi duyệt'),`<p>${h(d.number)}</p><p>${h(t('送審使用這份文件已儲存的固定版本；確認期間若有變更，請重新核對。','Gửi bản đã lưu cố định của hồ sơ này; nếu có thay đổi trong lúc xác nhận, hãy kiểm tra lại.'))}</p><small>${h(snapshot.savedId)} · ${snapshot.expectedRevision}</small><p>${h(t('儲存者','Người lưu'))}：${h(d.flow.saved.actor?.name||'—')} · ${h(t('儲存時間','Thời gian lưu'))}：${h(d.flow.saved.at||'—')}</p>`,t('送審','Gửi duyệt'));
    if(!confirmed)return null;
    if(root!==page||doc()?.id!==documentId||data?.identity?.id!==actorId||data.permissions.submit!==true||window.ProcessSync?.requiresReload||identity&&window.ProcessSync?.identity?.id!==actorId||(typeof identityEpoch==='number'?identityEpoch!==window.ProcessSync?.identityGeneration?.():identity!==window.ProcessSync?.identity)||delivery&&window.ProcessSync?.isCurrentDelivery?.(delivery)===false)throw Error('DELIVERY_SUPERSEDED');
    if(doc().flow.generation!==generation||doc().flow.revision!==snapshot.expectedRevision||doc().flow.saved?.id!==snapshot.savedId||dirty(doc()))throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
    return {...snapshot,generation,reason:''};
  }
  function sameRoutineValue(a,b) {
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
    if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>sameRoutineValue(value,b[index]));
    const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&sameRoutineValue(a[key],b[key]));
  }
  // Three-way comparison runs only as part of explicit Save. Collections
  // retain remote order and merge result identities; sample/photo arrays are
  // individual field values, never positional result-row replacements.
  function mergeSaveContent(base, mine, theirs, preference) {
    const conflicts = [], absent = Symbol('absent');
    const equal = (a,b) => a === absent || b === absent ? a === b : sameRoutineValue(a,b);
    const copy = value => value === absent ? absent : clone(value);
    function merge(b,m,r,path) {
      if (equal(m,b)) return copy(r);
      if (equal(r,b) || equal(m,r)) return copy(m);
      // Photo references are membership edits: independent immutable uploads
      // must survive either choice for an unrelated text/result conflict.
      // Single-sample selection and every other ordered field remain atomic.
      const photoRefs = value => Array.isArray(value) && value.every(id=>typeof id==='string') && new Set(value).size===value.length;
      if (['photos','evidence'].includes(path.at(-1)) && [b,m,r].every(photoRefs)) {
        const retained = new Set([...new Set([...b,...m,...r])].filter(id=>b.includes(id)?m.includes(id)&&r.includes(id):m.includes(id)||r.includes(id)));
        return [...new Set([...r,...m])].filter(id=>retained.has(id));
      }
      const records = value => Array.isArray(value) && value.every(row => row && typeof row.id === 'string') && new Set(value.map(row=>row.id)).size === value.length;
      if (records(b) && records(m) && records(r)) {
        const rows = new Map(), bm=new Map(b.map(row=>[row.id,row])), mm=new Map(m.map(row=>[row.id,row])), rm=new Map(r.map(row=>[row.id,row]));
        for (const id of new Set([...r.map(row=>row.id),...m.map(row=>row.id),...b.map(row=>row.id)])) {
          const value=merge(bm.get(id)??absent,mm.get(id)??absent,rm.get(id)??absent,[...path,{id}]);
          if(value!==absent)rows.set(id,value);
        }
        return [...rows.values()];
      }
      if ([b,m,r].every(value=>value!==absent && value && typeof value==='object' && !Array.isArray(value))) {
        const value={};
        for(const key of new Set([...Object.keys(r),...Object.keys(m),...Object.keys(b)])) {
          const merged=merge(Object.hasOwn(b,key)?b[key]:absent,Object.hasOwn(m,key)?m[key]:absent,Object.hasOwn(r,key)?r[key]:absent,[...path,key]);
          if(merged!==absent)value[key]=merged;
        }
        return value;
      }
      conflicts.push({path,mine:m===absent?null:copy(m),theirs:r===absent?null:copy(r)});
      return copy(preference==='theirs'?r:m);
    }
    return {content:merge(base,mine,theirs,[]),conflicts};
  }
  async function chooseSaveConflicts(conflicts, target) {
    const fields={title:t('文件名稱','Tên hồ sơ'),date:t('實際日期','Ngày thực tế'),notes:t('備註','Ghi chú'),reason:t('申請原因','Lý do đề nghị'),disposition:t('處置內容','Nội dung xử lý'),evidence:t('處置照片','Ảnh xử lý'),samples:t('實測樣品','Mẫu thực thử'),outcome:t('結果','Kết quả'),value:t('實測值','Giá trị thực thử'),photos:t('照片','Ảnh'),disposalReason:t('處置原因','Lý do xử lý')};
    const label=path=>{
      const line=target.flow.working.lines.find(line=>line.id===path[1]?.id),row=line?.results.findIndex(row=>row.id===path[3]?.id);
      return path[0]==='lines'?[line?.source.name||t('檢查項目','Hạng mục kiểm tra'),t('結果列','Dòng kết quả')+(row>=0?' '+(row+1):''),fields[path.at(-1)]||''].filter(Boolean).join(' · '):fields[path[0]]||t('文件內容','Nội dung hồ sơ');
    };
    const conflictSamples=(codes,path)=>sampleNames(target.flow.working.lines.find(line=>line.id===path[1]?.id)||{source:{products:[]}},codes);
    const value=(content,path)=>Array.isArray(content)&&path.at(-1)==='samples'?conflictSamples(content,path):content===null?t('已移除','Đã xóa'):Array.isArray(content)&&['photos','evidence'].includes(path.at(-1))?content.length+' '+t('張照片','ảnh'):typeof content==='object'&&!Array.isArray(content)?[content.samples&&conflictSamples(content.samples,path),content.outcome,content.value,content.notes,content.disposalReason].filter(Boolean).join(' · '):Array.isArray(content)?content.join(', '):String(content);
    const result=await dialog(t('儲存衝突','Xung đột khi lưu'),
      `<p>${h(t('以下欄位已被雙方修改。請一次選擇所有衝突使用我的或他人的值；雙方其他修改都會保留並立即儲存。','Các trường sau đã được cả hai bên sửa. Chọn giá trị của tôi hoặc người khác cho mọi xung đột; các thay đổi còn lại của cả hai được giữ và lưu ngay.'))}</p><ul>${conflicts.map(conflict=>`<li><b>${h(label(conflict.path))}</b><p>${h(t('我的','Của tôi'))}: ${h(value(conflict.mine,conflict.path))}</p><p>${h(t('他人的','Của người khác'))}: ${h(value(conflict.theirs,conflict.path))}</p></li>`).join('')}</ul>`,
      t('用我的','Dùng của tôi'), (el,close)=>{
        const theirs=document.createElement('button');theirs.type='button';theirs.className='rf-btn';theirs.setAttribute('data-rf-conflict-theirs','true');
        theirs.textContent=t('用對方的','Dùng của người khác');theirs.onclick=()=>close('theirs');el.querySelector('.rf-actions').append(theirs);
      });
    return result===null?null:result==='theirs'?'theirs':'mine';
  }
  async function save(target = doc()) {
    assertCurrentDisplay();const displayCurrent=captureHistoryDisplay();
    const d = target;
    if(!d||status(d)!=='draft'||data.permissions.save!==true||dirty(d)&&data.permissions.edit!==true)throw Error('FORBIDDEN');
    if(s.bufferGenerations.has(d.id)&&s.bufferGenerations.get(d.id)!==d.flow.generation)throw Error('STALE_GENERATION');
    const life=receiptLifecycle,page=root,identity=data.identity.id,syncIdentity=window.ProcessSync?.identity,epoch=window.ProcessSync?.identityGeneration?.(),delivery=window.ProcessSync?.captureDelivery?.(),generation=d.flow.generation;
    const current=()=>displayCurrent()&&!receiptSuspended&&life===receiptLifecycle&&root===page&&page?.isConnected!==false&&data?.identity?.id===identity&&syncIdentity===window.ProcessSync?.identity&&epoch===window.ProcessSync?.identityGeneration?.()&&!window.ProcessSync?.requiresReload&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery)!==false)&&docs().find(row=>row.id===d.id)?.flow.generation===generation;
    const c=clone(buffer(d)),base=clone(s.bases.get(d.id)),hasEdits=!sameRoutineValue(c,base);
    const fresh=async()=>{
      const next=await read('',current);if(!current())throw Error('DELIVERY_SUPERSEDED');
      const latest=next.control.documents.find(row=>row.id===d.id);
      if(next.identity.id!==identity||latest?.flow.generation!==generation)throw Error('STALE_GENERATION');
      if(next.revision<data.revision||next.control.revision<data.control.revision)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
      data=next;
      if(!latest||latest.cancelled||status(latest)!=='draft')throw Error('PENDING_LOCKED');
      if(data.permissions.save!==true||hasEdits&&data.permissions.edit!==true)throw Error('FORBIDDEN');
      return latest;
    };
    let latest=await fresh(),merged;
    for(let attempt=0;attempt<5;attempt++) {
      merged=mergeSaveContent(base,c,latest.flow.working);
      if(!merged.conflicts.length)break;
      const compared=clone(latest.flow),choice=await chooseSaveConflicts(merged.conflicts,d);
      if(!current())throw Error('DELIVERY_SUPERSEDED');
      if(choice===null)return null;
      latest=await fresh();
      if(compared.revision!==latest.flow.revision||compared.saved?.id!==latest.flow.saved?.id||!sameRoutineValue(compared.working,latest.flow.working)) {
        if(attempt===4)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
        continue;
      }
      merged=mergeSaveContent(base,c,latest.flow.working,choice);break;
    }
    if(!current())throw Error('DELIVERY_SUPERSEDED');
    const patches=[];
    for(const key of ['title','date','notes','reason','disposition','evidence',...(d.retestApplicationCaseId?['planStart','planEnd']:[]),...(d.calendarVersion===2?['overdueReason','nextDate','skipReason','dispositionResult']:[])])if(!sameRoutineValue(merged.content[key],latest.flow.working[key]))patches.push({op:'set',path:[key],value:merged.content[key]});
    // Lines and source snapshots are immutable; only existing result collections
    // can be edited. Row/cell merging above has already retained both sides.
    if(!sameRoutineValue(merged.content.lines.map(line=>({...line,results:[]})),latest.flow.working.lines.map(line=>({...line,results:[]}))))throw Error('DOCUMENT_ITEMS_IMMUTABLE');
    for(const line of merged.content.lines) {
      const remote=latest.flow.working.lines.find(row=>row.id===line.id);
      if(!sameRoutineValue(line.results,remote.results))patches.push({op:'set',path:['lines',{id:line.id},'results'],value:line.results});
    }
    const result=await draft('save',{moduleAction:'save-local-v1',expectedRevision:latest.flow.revision,patches,guards:patches.map(patch=>({path:patch.path,value:patch.path.length===1?latest.flow.working[patch.path[0]]:latest.flow.working.lines.find(line=>line.id===patch.path[1].id).results}))},latest);
    if(!current())throw Error('DELIVERY_SUPERSEDED');
    const next=await read('',current);if(!current())throw Error('DELIVERY_SUPERSEDED');
    if(next.control.revision>=data.control.revision)data=next;
    const saved=docs().find(row=>row.id===d.id)?.flow;
    if(!saved?.saved||saved.saved.id!==result.savedId||!sameRoutineValue(saved.saved.content,merged.content))throw Error('SAVE_RECHECK_REQUIRED');
    const local=s.buffers.get(d.id);
    if(sameRoutineValue(local,c)){s.buffers.delete(d.id);s.bases.delete(d.id);}
    else if(local){
      const rebased=mergeSaveContent(c,local,merged.content);
      // An ACK settles only the captured Save. Newer input still belongs to
      // its captured basis; never silently choose mine for a late conflict.
      // The next explicit Save must compare that intent and ask once again.
      if(rebased.conflicts.length)s.bases.set(d.id,clone(c));
      else{s.buffers.set(d.id,rebased.content);s.bases.set(d.id,clone(merged.content));}
    }
    return result;
  }
  function dialog(title, body, submit = t('確認', 'Xác nhận'), onready) {
    s.dialogOpen = true;
    return new Promise((resolve) => {
      const opener = document.activeElement,
        el = document.createElement('dialog');
      el.className = 'rf-modal';
      el.dataset.i18nSkip = 'true';
      el.setAttribute('aria-label', title);
      el.innerHTML = `<form><h2>${title}</h2>${body}<p class="rf-modal-error" role="alert"></p><div class="rf-actions"><button type="button" class="rf-btn" data-cancel>${t('取消', 'Hủy')}</button><button class="rf-btn primary" type="submit">${submit}</button></div></form>`;
      const close = (v) => {
        s.dialogOpen = false;
        el.close();
        el.remove();
        if (opener?.isConnected) opener.focus({preventScroll:true});
        resolve(v);
      };
      el.querySelector('[data-cancel]').onclick = () => close(null);
      el.oncancel = (e) => {
        e.preventDefault();
        close(null);
      };
      el.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const form = new FormData(e.target);
        if (el.querySelector('[name=job]') && !form.getAll('job').length) { el.querySelector('.rf-modal-error').textContent = t('請至少選取一個項目', 'Chọn ít nhất một hạng mục'); return; }
        close(form);
      };
      document.body.append(el);
      el.showModal();
      onready?.(el,close);
    });
  }
  async function reason(title) {
    const f = await dialog(
      title,
      `<label>${t('原因／說明', 'Lý do / mô tả')}<textarea name="reason" required rows="4"></textarea></label>`,
    );
    return f?.get('reason')?.trim();
  }
  function recoverableFirstStart(){
    const meta=receiptRecord?.meta;
    return !s.reviewPlatform&&receiptFeedback()?.status==='missing'&&meta?.action==='configure'&&
      meta.requestedRevision===0&&meta.aggregateRevision===0&&data?.permissions?.settings&&data?.permissions?.edit&&
      receiptOwnedPin(receiptPin())&&meta.actor===data.identity.id;
  }
  async function reconcileDraft(){
    const record=receiptRecord,m=record?.meta,pin=receiptPin(),display=captureHistoryDisplay();
    const owns=()=>display()&&receiptOwnedPin(pin)&&record===receiptRecord&&receiptStore().getItem(record.key)===record.raw;
    if(s.busy||!record||m.action!=='draft'||!['apply','save','submit'].includes(m.innerAction)||!owns())return;
    s.busy=true;
    try{
      const latest=await read('',owns),d=latest.control.documents.find(v=>v.id===m.documentId);
      if(!d||d.flow.scope!=='routine-fqc:'+m.documentId||latest.identity.id!==pin.actor||latest.control.revision<m.aggregateRevision)
        throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
      const saved=d.flow.saved?.content;
      const rows=(saved?.lines||[]).map(l=>'<li>'+h(l.source?.name||'')+' · '+h(l.source?.code||'')+'<ul>'+
        (l.results||[]).map(r=>'<li>'+h(label(r.outcome))+' '+h(r.value||'')+' '+h(r.notes||'')+'</li>').join('')+'</ul></li>').join('');
      const savedView=saved?'<details><summary>'+t('查看已存內容','Xem nội dung đã lưu')+'</summary><p>'+h(saved.title)+' · '+h(saved.date)+'</p><p>'+h(saved.notes||'')+'</p><ul>'+rows+'</ul></details>':'';
      const confirm=await dialog(t('核對最新 FQC 文件','Đối chiếu hồ sơ FQC mới nhất'),
        '<p>'+h(d.number||d.id)+' · '+h(d.flow.working.title)+' · '+h(label(status(d)))+'</p><p>'+t('目前修訂','Phiên bản hiện tại')+' '+h(d.flow.revision)+' · '+h(d.flow.saved?.at||'—')+'</p>'+savedView+'<p>'+
        t('原操作結果待確認。確認後只停止這筆舊請求；請核對已存內容，再決定是否需要新的操作。','Kết quả cũ chưa rõ. Chỉ dừng yêu cầu này; hãy kiểm tra nội dung đã lưu trước khi thực hiện thao tác mới.')+'</p>',
        t('已核對，處理舊請求','Đã đối chiếu, xử lý yêu cầu'));
      if(confirm===null||!owns())return;
      const stop={operationId:m.operationId,documentId:m.documentId,action:m.innerAction,generation:m.generation};
      const {response,value}=await routineJSON(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Process-Expected-Actor':pin.actor},
        body:JSON.stringify({action:'reconcile-draft',operationId:id(),documentId:m.documentId,expectedRevision:latest.control.revision,
          reviewedGeneration:d.flow.generation,reviewedDocumentRevision:d.flow.revision,stop})});
      if(!owns()||!response.ok)throw Error(value?.error||'ROUTINE_RECEIPT_READBACK_REQUIRED');
      const proof=value.result;
      if(proof?.actorId!==pin.actor||!receiptInt(value.revision)||value.revision<latest.control.revision||
        Object.keys(stop).some(k=>proof[k]!==stop[k]))throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
      if(proof.status==='committed')receiptTerminal(record,{result:proof.result,revision:value.revision},pin);
      else if(proof.status!=='fenced'||proof.priorOutcome!=='unknown')throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
      const next=await read('',owns),after=next.control.documents.find(v=>v.id===d.id);
      if(!display()||!receiptOwnedPin(pin)||next.identity.id!==pin.actor||next.control.revision<value.revision||!after)
        throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
      if(proof.status==='fenced'){
        if(!owns()||after.flow.generation!==d.flow.generation||after.flow.revision!==d.flow.revision||
          after.flow.saved?.id!==d.flow.saved?.id||after.flow.pendingId!==d.flow.pendingId)throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
        receiptClear(record,pin);
      }
      data=next;reconcileSelection();s.issues=[];
      s.error=proof.status==='fenced'?t('舊請求已停止，先前結果仍未知。請核對最新文件後再操作。','Đã dừng yêu cầu cũ; kết quả trước đây vẫn chưa rõ. Kiểm tra hồ sơ mới nhất trước khi tiếp tục.'):t('原操作已確認。','Đã xác nhận thao tác gốc.');
    }catch(e){if(display()&&receiptOwnedPin(pin))fault(e,true);}
    finally{s.busy=false;if(display()&&receiptOwnedPin(pin))paint();}
  }
  async function recoverPlan(){
    const record=receiptRecord,pin=receiptPin(),display=captureHistoryDisplay(),meta=record?.meta;
    if(s.busy||meta?.action!=='create-plan'||!meta.operationId.startsWith('plan-fqc-')||!receiptOwnedPin(pin))return;
    const owns=()=>display()&&receiptOwnedPin(pin)&&receiptRecord===record&&receiptStore().getItem(record.key)===record.raw;
    const url='/api/routine-plan-intent?scope=fqc&id='+encodeURIComponent(meta.operationId);
    const readIntent=async(options={})=>{
      const {response,value}=await routineJSON(url,{cache:'no-store',headers:{'Content-Type':'application/json','X-Process-Expected-Actor':pin.actor},...options});
      if(!owns()||!response.ok||value?.scope!=='fqc'||value.id!==meta.operationId||value.actorId!==pin.actor||value.expectedRevision!==meta.requestedRevision)throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
      return value.status;
    };
    s.busy=true;
    try{
      let status=await readIntent();
      if(status==='registered'){
        const yes=await dialog(t('終止這筆建計畫？','Dừng yêu cầu lập kế hoạch này?'),'<p>'+t('若原請求先完成，保留其計畫與收據；否則阻止該筆請求生效。','Nếu yêu cầu đã hoàn tất, kế hoạch và biên nhận được giữ lại. Nếu chưa, yêu cầu sẽ bị chặn.')+'</p>',t('確認終止','Xác nhận dừng'));
        if(!yes||!owns())return;
        await readIntent({method:'POST',body:JSON.stringify({action:'retire',confirm:'RETIRE FQC PLAN',expectedRevision:meta.requestedRevision})});
        status=await readIntent();
      }
      if(status==='committed'){const original=await read('?operationId='+encodeURIComponent(meta.operationId),owns);receiptTerminal(record,original,pin);}
      else if(status!=='retired')throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
      const next=await read('',owns);
      if(!owns()||next.identity?.id!==pin.actor||!Number.isSafeInteger(next.control?.revision)||next.control.revision<meta.requestedRevision)throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
      if(status==='retired'){receiptClear(record,pin);}else{receiptObserveRead(next,pin);}
      data=next;reconcileSelection();s.error=s.retry?receiptNotice():'';
    }catch(error){if(owns())fault(error,true);}
    finally{s.busy=false;if(display()&&receiptOwnedPin(pin))paint();}
  }
  async function resolveFirstStart(){
    if(!recoverableFirstStart())return;
    const record=receiptRecord,pin=receiptPin(),display=captureHistoryDisplay(),id=record.meta.operationId;
    const current=()=>display()&&receiptOwnedPin(pin)&&record===receiptRecord;
    const url='/api/routine-start-retirement',query='?scope=fqc&assessment=1&operationId='+encodeURIComponent(id);
    const check=async()=>{
      const {response,value}=await routineJSON(url+query,{cache:'no-store'});
      if(!current())throw Error('DELIVERY_SUPERSEDED');
      if(response.ok&&value?.status==='eligible'&&value.actorId===pin.actor&&value.scope==='fqc'&&value.id===id&&value.expectedRevision===0)return false;
      if(!response.ok||value?.status!=='retired'||value.id!==id||value.scope!=='fqc'||value.actorId!==pin.actor||
        value.expectedRevision!==0||value.fencedRevision!==1)throw Error(t('請再查原啟動與處理結果。','Kiểm tra lại biên nhận khởi động và kết quả xử lý.'));
      return true;
    };
    s.busy=true;
    try{
      if(!await check()){
        const confirmed=await dialog(t('終止舊的首次啟動請求','Chấm dứt yêu cầu khởi động đầu cũ'),
          '<p>'+t('若舊請求已生效，請查原收據。若尚未啟動，這將阻止所有基於同一舊版本的 FQC 首次啟動請求，包括其他分頁的請求。完成後需另行設定日期。','Nếu yêu cầu cũ đã có hiệu lực, hãy kiểm tra biên nhận gốc. Nếu chưa khởi động, mọi yêu cầu khởi động FQC lần đầu dựa trên cùng phiên bản cũ, kể cả từ thẻ khác, sẽ bị chặn. Sau đó cần đặt ngày riêng.')+'</p><code>'+h(id)+'</code>',
          t('終止舊啟動','Chấm dứt yêu cầu cũ'));
        if(!confirmed||!current())return;
        const {response}=await routineJSON(url,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({scope:'fqc',operationId:id,expectedRevision:0,action:'retire-first-start',confirm:'RETIRE FQC START'})});
        if(!current())throw Error('DELIVERY_SUPERSEDED');
        if(!response.ok||!await check())throw Error(t('請再查原啟動與處理結果。','Kiểm tra lại biên nhận khởi động và kết quả xử lý.'));
      }
      const next=await read('',current);
      if(!current()||next.identity?.id!==pin.actor||!Number.isSafeInteger(next.control?.revision)||
        next.control.revision<Math.max(1,data.control.revision)||!Number.isSafeInteger(next.revision)||next.revision<data.revision)
        throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
      record.confirmed=null;
      receiptClear(record,pin);
      data=next;
      reconcileSelection();
      s.error=s.retry?receiptNotice():'';
    }catch(error){if(current())fault(error,true);}
    finally{s.busy=false;if(display()&&receiptOwnedPin(pin))paint();}
  }
  async function act(action, el) {
    assertCurrentDisplay();
    if (s.busy || s.dialogOpen || generationRefresh?.current()) return;
    if(action==='reconcile-draft')return reconcileDraft();
    if(action==='recover-plan')return recoverPlan();
    if(action==='retire-first-start')return resolveFirstStart();
    if(action==='receipt-minimize'||action==='receipt-show'){
      const feedback=receiptFeedback();
      if(feedback?.status!=='missing')return;
      feedback.collapsed=action==='receipt-minimize';
      receiptCollapsePreference(receiptRecord,feedback.collapsed);
      paint();
      root.querySelector(feedback.collapsed?'[data-action="receipt-show"]':'[data-action="retry"]')?.focus({preventScroll:true});
      return;
    }
    let lookup=null,lookupOwner=null;
    try {
      if(expiredPlan(doc())&&['save','submit','discard','confirm-discard','delete-plan','restore-document','apply'].includes(action))throw Error('EXPIRED_PLAN_READ_ONLY');
      if (
        s.retry &&
        !(doc()&&!receiptInvalid&&independentReferences({action:'draft',documentId:doc().id,command:{action}},receiptDiscover(data.identity.id))) &&
        ![
          'retry',
          'back',
          'clear-filter',
          'expand-report',
          'refresh',
          'update-current',
          'export',
        ].includes(action)
      )
        throw Error(
          t(
            '請先查詢原操作收據。查詢不會重送原操作。',
            'Hãy kiểm tra biên nhận gốc. Việc kiểm tra không gửi lại thao tác.',
          ),
        );
      if (action === 'recall-retest') {
        const retest = followupState(selectedCase()).retest;
        if (!retest || status(retest) !== 'draft') throw Error(t('複測已更新，請重新開啟。','Thử lại đã thay đổi; mở lại.'));
        s.cancelConfirm = 'retest:' + retest.id; paint(); return;
      }
      if (action === 'open-retest') { const retest = followupState(selectedCase()).retest; if (retest) choose(retest.id,'documents'); return; }
      if (action === 'discard') { s.cancelConfirm = action + ':' + doc().id; paint(); return; }
      if (action === 'cancel-confirmation') { s.cancelConfirm = null; paint(); return; }
      if (action === 'expand-report') {
        s.wide = !s.wide;
        paint();
        return;
      }
      if (action === 'back') {
        if (s.listReturn && s.listReturn.selection === s.selected) {
          const {tab,restore} = s.listReturn;
          s.listReturn = null; s.wide = false;
          choose(null,tab);
          restore();
          return;
        }
        const request = calendarMode() && !s.reviewPlatform && s.tab === 'history' && doc();
        if (request) {
          const tab = requestContext(request);
          s.wide = false;
          choose(['failed','cases'].includes(tab) ? request.caseId : null,tab);
          return;
        }
        s.wide = false;
        s.selected = null;
        paint();
        return;
      }
      if (action.startsWith('filter-')) {
        toggleHighlight(action.slice(7), 'cases');
        return;
      }
      if (action === 'clear-selection') {
        s.checked.clear();
        s.selectionNotice = '';
        paint();
        return;
      }
      if (action === 'clear-filter') {
        for (const k of [
          'query',
          'line',
          'category',
          'item',
          'outcome',
          'review',
          'caseState',
          'from',
          'to',
        ])
          s[k] = '';
        s.overdue = false;
        s.highlight = '';
        paint();
        return;
      }
      if (action.startsWith('add-result:')) {
        const current = doc();
        if (!current || status(current) !== 'draft' || !data.permissions.edit) return;
        const line = buffer(current).lines[Number(action.split(':')[1])], required = requiredForLine(current,line);
        const available = (required.length ? required : line.source.products.map(p => p.code)).filter(code => !line.results.some(r => r.samples.includes(code)));
        if (!available.length || line.results.length >= 100) { s.error = t('已無可新增的樣品；同一項目不可重複選樣。','Không còn mẫu; không chọn trùng trong một hạng mục.'); paint(); return; }
        const next = {id:id(),samples:required.length ? [available[0]] : [],outcome:'',value:'',notes:'',photos:[]};
        line.results.push(next); s.resultOpen.set(next.id,true);
        paint(); return;
      }
      if (action === 'remove-result') {
        buffer(doc()).lines[
          Number(el.closest('[data-line]').dataset.line)
        ].results.splice(Number(el.closest('[data-result]').dataset.result), 1);
        paint();
        return;
      }
      if (action === 'settings') {
        await settings();
        return;
      }
      if (action === 'export') {
        await exportDocument();
        return;
      }
      if (action === 'add-source-jobs') {
        if (!normalWork() || s.tab !== 'sources' || !data.permissions.edit || !el?.isConnected || el.disabled) return;
        const eligible = new Set(sourcePickerRows().flatMap(i => i.jobs.map(j => j.id)));
        s.checked = new Set([...s.checked].filter(id => eligible.has(id)));
        s.tab = 'jobs'; s.selected = null;
        s.query = s.line = s.category = s.item = s.outcome = s.review = s.caseState = s.highlight = s.from = s.to = s.workState = '';
        s.selectionNotice = t('已加入既有應檢清單的選取；請建立並保存檢查計畫。','Đã chọn trong lịch hiện có; hãy tạo và lưu kế hoạch.');
        paint(); return;
      }
      let command, extra;
      if(action.startsWith('calendar-')){
        if(!calendarMode()||!data.permissions.edit)return;
        const overdueSkip=action==='calendar-overdue-skip',kind=overdueSkip?'skip':action.slice(9);
        if(['retest','waiver','disposal'].includes(kind)&&!caseCanRequest(selectedCase(),kind))return;
        if(kind==='skip'&&(!s.checked.size||[...s.checked].some(id=>!(overdueSkip?canSkipOverdue:canExempt)(data.control.jobs.find(j=>j.id===id)))))return;
        command=kind==='queue'?{action:'queue',jobIds:[...s.checked]}:{action:'request',requestKind:kind,retestPlan:kind==='retest',jobIds:kind==='skip'?[...s.checked]:undefined,caseId:['retest','waiver','disposal'].includes(kind)?selectedCase()?.id:undefined,documentId:kind==='void'?doc()?.id:undefined};
      }
      if (action === 'update-current') {
        // A retired normal-page button is not an authorization on review/history.
        if (!normalWork() || !el?.isConnected || !root.contains(el) || el.disabled) return;
        await refresh(true);
        return;
      }
      if (action === 'refresh') {
        await refresh();
        return;
      }
      if (action === 'retry') {
        command = s.retry;
        if (!command) return;
        lookupOwner=receiptPin();
        if(receiptRecord&&receiptOwnedPin(lookupOwner)&&receiptRecord.meta.actor===lookupOwner.actor){
          receiptCollapsePreference(receiptRecord,false);
          lookup={key:receiptRecord.key,actor:lookupOwner.actor,epoch:lookupOwner.epoch,status:'querying',collapsed:false};
          receiptPresentation=lookup;
        }
      } else if (action === 'create-plan') {
        if(calendarMode()){
          const jobs=[...s.checked].map(id=>data.control.jobs.find(j=>j.id===id));if(!jobs.length||jobs.some(j=>!arrangeable(j)))throw Error(t('選取包含不可安排的期別','Lựa chọn có kỳ không thể lập kế hoạch'));
          if(new Set(jobs.map(j=>!!j.calendar.retestCaseId)).size!==1)throw Error('MIXED_INITIAL_RETEST_PLAN');
          const regular=jobs.filter(j=>!j.calendar.retestCaseId),min=regular.map(j=>j.start).sort((a,b)=>a.localeCompare(b)).at(-1)||data.today,max=regular.map(j=>j.end).sort((a,b)=>a.localeCompare(b))[0]||'';
          const form=await dialog(t('建立檢查計畫','Tạo kế hoạch kiểm tra'),`<p>${t('確認項目後設定計畫起迄；一般例行不得跨出檢查週期。','Xác nhận hạng mục và ngày; kế hoạch thường phải trong kỳ kiểm tra.')}</p><ul>${jobs.map(j=>`<li>${h(j.source.name)}</li>`).join('')}</ul><label>${t('起日','Ngày bắt đầu')}<input type="date" name="start" required min="${h(min)}" ${max?`max="${h(max)}"`:''} value="${h([min,data.today].sort((a,b)=>a.localeCompare(b)).at(-1))}"></label><label>${t('迄日','Ngày kết thúc')}<input type="date" name="end" required min="${h(min)}" ${max?`max="${h(max)}"`:''} value="${h(max||data.today)}"></label>`);if(!form)return;
          command={action,jobIds:jobs.map(j=>j.id),startDate:form.get('start'),endDate:form.get('end')};
        }else command={action,jobIds:[...s.checked]};
      }
      else if (action === 'create-report') {
        const d = el?.dataset.planReport ? docs().find(plan => plan.id === el.dataset.planReport) : doc();
        if (!d || d.cancelled || d.kind !== 'plan' || d.requestKind || status(d) !== 'approved')
          throw Error('APPROVED_PLAN_REQUIRED');
        const available = content(d).lines.filter((l) => reportSlots(d).some((a) => a.jobId === l.jobId && a.assigned && !a.reportIds.length));
        if (!available.length)
          throw Error(
            t(
              '每項已有報告，請從計畫與報告繼續填寫。',
              'Đã có báo cáo cho mọi mục. Tiếp tục báo cáo hiện có.',
            ),
          );
        if(d.calendarVersion===2){command={action,documentId:d.id};}
        else {const f = await dialog(
          t('選擇本次填報項目', 'Chọn mục báo cáo lần này'),
          available
            .map(
              (l) =>
                `<label><span><input type="checkbox" name="job" value="${h(l.jobId)}" checked> ${h(l.source.name)}</span></label>`,
            )
            .join(''),
          t('建立執行報告', 'Tạo báo cáo'),
        );
        if (!f) return;
        command = { action, documentId: d.id, jobIds: f.getAll('job') };}
      } else if (
        [
          'correct',
          'revoke-plan',
          'resolve-impact',
          'close',
          'improve',
        ].includes(action)
      ) {
        const text = await reason(label(action) || action);
        if (!text) return;
        command = {
          action,
          documentId: doc()?.id,
          caseId: selectedCase()?.id,
          reason: text,
          notes: text,
        };
      } else if (action.startsWith('followup-')) {
        const a = selectedCase(), kind = action.slice(9);
        let notes;
        if (kind === 'report') {
          if (followupState(a).open || followupState(a).retest) throw Error('FOLLOWUP_OPEN');
          const f = await dialog(
            t('改善並建立複測', 'Cải thiện và tạo thử lại'),
            '<p>' + t('原不合格、原樣品與歷次報告保留；確認後同時記錄改善並建立複測草稿。', 'Giữ kết quả không đạt, mẫu gốc và các báo cáo; xác nhận để ghi cải thiện và tạo nháp thử lại cùng lúc.') + '</p><label>' + t('本次改善措施／複測準備（必填）', 'Biện pháp cải thiện / chuẩn bị thử lại (bắt buộc)') + '<textarea name="notes" required rows="4"></textarea></label>',
            t('記錄改善並建立複測', 'Ghi cải thiện và tạo thử lại'),
          );
          notes = f?.get('notes')?.trim();
          if (!notes) return;
        }
        command = {action:'followup',caseId:a.id,kind,...(notes ? {notes} : {})};
      }
      else if (action === 'submit') { if(doc()&&legacyCalendarFollowup(doc()))throw Error('FOLLOWUP_KIND_UNAVAILABLE');extra=await confirmSubmission();if(!extra)return; }
      else if (action === 'review') { openReview(doc()); return; }
      else if (action === 'approve' || action === 'return') {
        const pending = doc().flow.cases.find((c) => c.id === doc().flow.pendingId);
        if (!pending || (s.reviewCase && pending.id !== s.reviewCase)) throw Error(t('案件已更新，請重新開啟', 'Hồ sơ đã đổi; mở lại'));
        const self = pending.actor.id === data.identity.id;
        if (self && data.identity.role !== 'admin') throw Error('SELF_REVIEW_ADMIN_ONLY');
        if (self && s.selfReview !== pending.id) throw Error(t('請勾選確認自審此案件', 'Xác nhận tự duyệt hồ sơ này'));
        const reason = root.querySelector('[data-return-reason]')?.value.trim() || '';
        if (action === 'return' && !reason) throw Error(t('發回必須說明需修正內容', 'Trả lại cần mô tả nội dung cần sửa'));
        extra = { caseId: pending.id, selfReviewConfirmed: self && s.selfReview === pending.id, reason: action === 'return' ? reason : '' };
      } else if (action === 'withdraw') extra = { caseId: doc().flow.pendingId, reason: '' };
      else if (action === 'confirm-recall-retest') {
        const retest = followupState(selectedCase()).retest;
        if (!retest || status(retest) !== 'draft' || s.cancelConfirm !== 'retest:' + retest.id) throw Error(t('複測已更新，請重新確認。','Thử lại đã thay đổi; xác nhận lại.'));
        command = {action:'discard-draft', documentId:retest.id};
      }
      else if (action === 'confirm-cancel') command = { action: status(doc()) === 'approved' ? 'delete-plan' : 'discard-draft', documentId: doc().id };
      s.busy = true;
      paint();
      const mutationOwner=receiptPin(),mutationDocument=command?.documentId||doc()?.id;
      const result = command
        ? await post(
            action === 'retry'
              ? command
              : {
                  ...command,
                  expectedRevision:
                    command.expectedRevision ?? data.control.revision,
                },
          )
        : action === 'save'
          ? await save()
          : await draft(action, extra);
      const openingReport = command?.action === 'create-report';
      if (result?.documentId && !openingReport && !['followup-report','confirm-recall-retest'].includes(action) && !(action === 'retry' && s.tab === 'cases' && ['followup','discard-draft'].includes(command?.action))) {
        s.selected = result.documentId;
        s.tab = 'documents';
        s.checked.clear();
      }
      s.cancelConfirm = null;
      s.error = '';
      if(action.startsWith('admin-')){s.selected=null;s.checked.clear();s.buffers.clear();s.tab='sources';}
      if(action!=='save')await refresh();
      if(action==='calendar-queue'){s.checked.clear();s.tab='jobs';s.selected=null;}
      if(!receiptCurrent(mutationOwner))throw Error('DELIVERY_SUPERSEDED');
      if(lookup&&receiptPresentation===lookup&&!s.retry)lookup.status='confirmed';
      if (openingReport && result?.documentId) {
        const report = docs().find(d => d.id === result.documentId && d.kind === 'report' && d.planId === command.documentId);
        if (!report) throw Error('ROUTINE_RECEIPT_READBACK_REQUIRED');
        choose(report.id, 'reports');
      }
      if (['approve', 'return', 'withdraw'].includes(action)) {
        s.buffers.delete(mutationDocument);
        s.bases.delete(mutationDocument);
      }
      if (command?.action === 'discard-draft') { s.buffers.delete(command.documentId); s.bases.delete(command.documentId); }
      if (
        action === 'retry' &&
        command?.action === 'draft' &&
        command.command.action === 'apply'
      ) {
        const base = s.bases.get(command.documentId);
        if (base)
          for (const p of command.command.patches || []) {
            if (p.path.length === 1) base[p.path[0]] = clone(p.value);
            else
              base.lines.find((l) => l.id === p.path[1].id).results = clone(
                p.value,
              );
          }
      }
      if (action==='approve'&&doc()?.retestApplicationCaseId&&status(doc())==='approved') { s.selected=null; s.tab='reports'; paint(); }
      else if (action==='approve'&&doc()?.requestKind==='disposal'&&status(doc())==='approved') { s.selected=null; s.tab='sources'; paint(); }
      else if (doc()) { s.tab = documentTab(doc()); s.cancelConfirm = null; s.selfReview = null; paint(); }
    } catch (e) {
      if(lookup&&receiptPresentation===lookup&&receiptOwnedPin(lookupOwner)){
        if(receiptRecord?.key!==lookup.key)receiptPresentation=null;
        else if(e.message==='OPERATION_NOT_FOUND'&&e.status===404)lookup.status='missing';
        else lookup.status=receiptRecord.terminal?'readback':'failed';
      }
      if (['JOB_ALREADY_ASSIGNED','FOLLOWUP_OPEN','IMPROVEMENT_REQUIRED','REVISION_CONFLICT','REPORT_ALREADY_EXISTS'].includes(e.message)) {
        try {
          await refresh();
        } catch {
          /* Keep the original error and inputs. */
        }
      }
      fault(e,!!lookup);
    } finally {
      // Update owns no busy mutation; refresh/fault already paints its owner.
      // A retired Update must not repaint or unlock a different page's action.
      if (!['update-current', 'refresh'].includes(action)) { s.busy = false; paint(); }
    }
  }
  async function settings() {
    const locked = startDateLocked(), calendarSetup = calendarSetupAvailable();
    const f = await dialog(
      calendarSetup ? t('設定 FQC 開始日期', 'Đặt ngày bắt đầu FQC') : t('FQC 排程設定', 'Thiết lập lịch FQC'),
      `<p>${t('依公司曆週／月／季／半年／年安排。既有工作保留，未知頻率不推算。', 'Theo tuần / tháng / quý / nửa năm / năm. Giữ công việc cũ; không suy đoán tần suất.')}</p><label>${t('管理起始日', 'Ngày bắt đầu quản lý')}<input type="date" name="start" required value="${h(data.control.startDate || data.today)}" ${locked ? 'readonly' : ''}></label><button type="button" class="rf-btn" data-preview>${t('預覽首次應檢與下次頻率交接', 'Xem trước lịch và chuyển tần suất')}</button><div class="rf-preview" aria-live="polite"></div><p>${locked ? t('已有工作；起始日已鎖定。頻率請於原 FQC 標準核准變更。', 'Đã có công việc; khóa ngày bắt đầu. Đổi tần suất qua tiêu chuẩn FQC.') : t('必須預覽後確認啟用。', 'Phải xem trước trước khi kích hoạt.')}</p>`,
      locked ? t('關閉', 'Đóng') : t('確認啟用', 'Xác nhận kích hoạt'),
      (el) => {
        const submit = el.querySelector('[type=submit]'),
          date = el.querySelector('[name=start]'), output = el.querySelector('.rf-preview');
        let request = 0;
        const invalidate = () => {
          request++;
          submit.disabled = !locked;
          output.textContent = '';
        };
        invalidate();
        date.oninput = invalidate;
        el.querySelector('[data-preview]').onclick = async () => {
          invalidate();
          const ticket = request, requestedDate = date.value;
          const current = () => el.open && ticket === request && date.value === requestedDate;
          try {
            const preview = await read('?preview=1&start=' + encodeURIComponent(requestedDate) + (calendarSetup ? '&calendar=2' : ''));
            if (!current()) return;
            output.innerHTML =
              `<table class="rf-table"><tr><th>${t('項目','Hạng mục')}</th><th>${t('首次適用期別／期限', 'Kỳ áp dụng / hạn')}</th></tr>${preview.jobs.map((j) => `<tr><td>${h(j.source.name)}</td><td>${h(j.start + ' — ' + j.end)}</td></tr>`).join('')}</table>${preview.unresolved.map((v) => `<p>⚠ ${h(v.name + ' · ' + v.frequencyText)} · ${t('待確認頻率', 'Cần xác nhận tần suất')}</p>`).join('')}`;
            submit.disabled = false;
          } catch (e) {
            if (current()) output.textContent = e.message;
          }
        };
      },
    );
    if (!f || locked) return;
    s.busy = true;
    try {
      await post({
        action: 'configure',
        startDate: f.get('start'),
        ...(calendarSetupAvailable() ? {calendarVersion:2} : {}),
        expectedRevision: data.control.revision,
      });
      await refresh(true, true);
    } finally {
      s.busy = false;
      paint();
    }
  }
  async function exportDocument() {
    const out = await read('?export=' + encodeURIComponent(doc().id)),
      c = out.content;
    const all = [
        ...new Set([
          ...c.evidence,
          ...c.lines.flatMap((l) => l.results.flatMap((r) => r.photos)),
        ]),
      ],
      images = {};
    for (const p of all) {
      const r = await fetch(endpoint + '/photo?id=' + p);
      if (!r.ok) throw Error('EXPORT_PHOTO_FAILED');
      const blob = await r.blob();
      images[p] = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || Error('EXPORT_PHOTO_READ_FAILED'));
        reader.onabort = () => reject(Error('EXPORT_PHOTO_READ_ABORTED'));
        reader.readAsDataURL(blob);
      });
    }
    const page = `<!doctype html><html lang="${document.documentElement.lang}"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${h(displayNumber(out.document))}</title><style>body{font:15px system-ui;max-width:1100px;margin:40px auto;color:#234}section{border:1px solid #ccd;padding:20px;margin:20px 0}img{max-width:240px;max-height:200px}pre{white-space:pre-wrap}</style><h1>${h(displayNumber(out.document))}</h1>${legacyNumber(out.document)}<h2>${h(c.title)}</h2><p>${h(c.date)} · ${h(out.document.flow.active.id)} · Asia/Ho_Chi_Minh</p>${c.lines.map((l) => `<section><h2>${h(l.source.name)}</h2><p>${h(l.source.code + ' / ' + l.source.version)}</p>${coverage(l.source)}${l.requiredSamples?.length ? `<p>${t('本份文件應複測樣品（不代表本次已實測）', 'Mẫu cần thử lại của hồ sơ (không có nghĩa đã thử lần này)')}: ${h(l.requiredSamples.join(', '))}</p>` : ''}<pre>${h(l.source.description)}</pre>${l.results.map((r) => `<hr><b>${label(r.outcome)}</b><p>${t('實測樣品', 'Mẫu thực thử')}: ${h(r.samples.join(', ') || '—')}</p><pre>${h([r.value,r.disposalReason,r.notes].filter(Boolean).join('\n'))}</pre>${r.photos.map((p) => `<img src="${images[p]}" alt="${h(p)}">`).join('')}`).join('')}</section>`).join('')}<pre>${h(c.notes + '\n' + c.reason + '\n' + c.disposition)}</pre>${c.evidence.map((p) => `<img src="${images[p]}">`).join('')}<h2>${t('審核紀錄', 'Lịch sử duyệt')}</h2><pre>${h(
      JSON.stringify(
        out.document.flow.cases.map((a) => ({
          id: a.id,
          status: a.status,
          actor: a.actor,
          at: a.at,
          reason: a.reason,
          review: a.result,
        })),
        null,
        2,
      ),
    )}</pre></html>`;
    const a = document.createElement('a'),
      url = URL.createObjectURL(
        new Blob([page], { type: 'text/html;charset=utf-8' }),
      );
    a.href = url;
    a.download = out.document.number + '.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const reportType = (d) => d.kind !== 'report' ? d.kind : d.correctionOf ? 'correction' : isRetestReport(d) ? 'retest' : 'initial';
  const reportLabel = (d) => isRetestPlan(d)?t('再測計畫','Kế hoạch thử lại'):d.requestKind ? requestName(d.requestKind) : reportType(d) === 'retest' ? t('再測報告','Báo cáo thử lại') : reportType(d) === 'correction' ? t('更正報告','Báo cáo sửa đổi') : d.kind === 'report' ? t('初測報告','Báo cáo lần đầu') : label(d.kind);
  const retestCases = d => [...new Set(content(d).lines.map(l=>data.control.jobs.find(j=>j.id===l.jobId)?.calendar?.retestCaseId).filter(Boolean).concat(d.caseId?[d.caseId]:[]))];
  const isRetestReport = d => d.kind==='report'&&retestCases(d).length>0;
  const isRetestPlan = d => d.kind==='plan'&&!d.requestKind&&retestCases(d).length>0;
  const retestLinks = d => isRetestPlan(d)||isRetestReport(d)?'<div class="rf-notice rf-retest-links">'+retestCases(d).map(id=>{const a=data.control.cases.find(x=>x.id===id);return '<button class="rf-btn" data-case="'+h(id)+'">'+t('原異常','Bất thường gốc')+' · '+h(a?.number||id)+'</button>'+(a?.reportIds||[]).slice(0,1).map(r=>'<button class="rf-btn" data-doc="'+h(r)+'">'+t('原報告','Báo cáo gốc')+' · '+h(docs().find(x=>x.id===r)?.number||r)+'</button>').join('');}).join('')+'</div>':'';
  const linkedPlanNumber = d => {const plan=docs().find(p=>p.id===d.planId);return plan?displayNumber(plan):d.planId;};
  const displayNumber = (d) => isRetestPlan(d)?d.number.replace('FQC-PLN-', 'FQC-RPL-'):d.kind === 'report' && (isRetestReport(d) || d.correctionOf) ? d.number.replace('FQC-RPT-', d.correctionOf ? 'FQC-COR-' : 'FQC-RTS-') : d.number;
  const legacyNumber = (d) => displayNumber(d) !== d.number ? '<small class="rf-legacy-number">' + t('原編號：','Mã gốc: ') + h(d.number) + '</small>' : '';
  const kindTag = (d) => '<span class="rf-document-kind ' + reportType(d) + '">' + (d.kind === 'report' ? d.correctionOf ? 'COR' : isRetestReport(d) ? 'RTS' : 'RPT' : {plan:'PLN',disposal:'DSP',waiver:'WVR'}[d.kind]) + ' · ' + h(reportLabel(d)) + '</span>';
  function documentStage(d, jobId) {
    const state = status(d), name = reportLabel(d);
    let text, next = '', links = '';
    if (state === 'cancelled') text = name + ' · ' + t('已捨棄，歷史保留', 'Đã bỏ, giữ lịch sử');
    else if (state === 'draft') { text = name + ' · ' + t('草稿尚未送審', 'Bản nháp chưa gửi duyệt'); next = t('下一步：完成內容 → 儲存草稿 → 送出審核', 'Bước tiếp: hoàn tất → lưu bản nháp → gửi duyệt'); }
    else if (state === 'pending') { text = name + ' · ' + t('已送審，等待核准', 'Đã gửi, chờ duyệt'); next = t('下一步：等待審核；需修改時撤回送審', 'Bước tiếp: chờ duyệt; rút hồ sơ nếu cần sửa'); }
    else if (d.kind === 'plan') {
      const {related,available} = planReportState(d,jobId);
      text = available ? (related.length ? t('計畫已核准 · 部分報告尚待建立','Kế hoạch đã duyệt · còn mục chưa tạo báo cáo') : t('計畫已核准 · 尚未建立報告','Kế hoạch đã duyệt · chưa tạo báo cáo')) : related.length ? t('計畫已核准 · 已建立報告','Kế hoạch đã duyệt · đã tạo báo cáo') : t('計畫已核准 · 無可填報項目','Kế hoạch đã duyệt · không còn mục để báo cáo');
      links = (available ? '<button type="button" class="rf-btn rf-stage-create" data-plan-report="' + h(d.id) + '" ' + (!data.permissions.edit ? 'disabled' : '') + '>' + t('需要建立報告','Cần tạo báo cáo') + '</button>' : '') + related.map((r) => '<button type="button" class="rf-report-link" data-doc="' + h(r.id) + '">' + t('開啟報告','Mở báo cáo') + ' · ' + h(r.number) + '</button>').join('');
      next = available ? t('待建立執行報告：', 'Cần tạo báo cáo: ') + available + t(' 項', ' hạng mục') : related.some((r) => status(r) === 'draft') ? t('報告草稿未送審，請接續填寫', 'Bản nháp báo cáo chưa gửi, tiếp tục nhập') : related.some((r) => status(r) === 'pending') ? t('報告已送審，等待核准', 'Báo cáo đã gửi, chờ duyệt') : related.length ? t('報告已核准；異常結案另行確認', 'Báo cáo đã duyệt; đóng bất thường riêng') : t('請查看目前所屬計畫／異常後續', 'Xem kế hoạch hiện tại / theo dõi bất thường');
    } else {
      text = name + ' · ' + t('已完成審核', 'Đã hoàn tất duyệt');
      const cases = data.control.cases.filter((a) => a.reportIds.includes(d.id) || a.id === d.caseId);
      next = cases.some((a) => !done(a)) ? (cases.some((a) => a.status === 'ready-close') ? t('異常待確認結案', 'Bất thường chờ xác nhận đóng') : t('異常未結案，待改善／複測／處置', 'Bất thường chưa đóng, cần cải thiện / thử lại / xử lý')) : d.kind === 'waiver' ? t('本期已核准免做，免做不等於合格', 'Đã miễn kỳ này; miễn không có nghĩa đạt') : d.kind === 'disposal' ? t('處置已核准，保留原不合格紀錄', 'Xử lý đã duyệt, giữ lịch sử không đạt') : t('正式報告已留存', 'Đã lưu báo cáo chính thức');
    }
    return '<div class="rf-stage ' + state + '"><b>' + h(text) + '</b>' + (next ? '<small>' + h(next) + '</small>' : '') + (links ? '<div class="rf-stage-links">' + links + '</div>' : '') + '</div>';
  }
  function workFilters() {
    const rows = (s.tab === 'history' ? docs() : primaryDocuments()).filter((d) => (s.tab !== 'plans' || d.kind === 'plan' && !d.requestKind) && (s.tab !== 'reports' || d.kind !== 'plan' || d.requestKind) && (!s.documentKind || d.kind === s.documentKind) && matches(content(d).lines,d));
    return '<nav class="rf-work-filters" aria-label="' + t('完成進度','Tiến độ hoàn thành') + '">' + [['',t('全部','Tất cả')],['draft',t('草稿未送審','Nháp chưa gửi')],['pending',t('已送審','Đã gửi duyệt')],['approved',t('已完成審核','Đã duyệt')]].map(([key,text]) => '<button type="button" class="rf-btn ' + (s.workState === key ? 'primary' : '') + '" data-work-state="' + key + '">' + text + ' · ' + rows.filter((d) => !key || status(d) === key).length + '</button>').join('') + '</nav>';
  }
  function retestGuidance(d,l) {
    if (d.kind !== 'report') return '';
    const samples = requiredForLine(d,l), a = caseForLine(d,l), previous = docs().find(o => o.id === a?.originReportId || o.id === d.correctionOf);
    if (!samples.length && !previous) return '';
    return '<div class="rf-notice rf-required-samples"><b>' + t('請用原樣品檢查：','Kiểm tra bằng mẫu gốc: ') + h(sampleNames(l,samples) || '—') + '</b>' + (previous ? '<button class="rf-report-link" data-doc="' + h(previous.id) + '">' + t('查看原報告','Xem báo cáo gốc') + ' · ' + h(displayNumber(previous)) + '</button>' : '') + '<small>' + t('原樣品固定；本次結果另填，原報告保留。無法測試請填原因。','Giữ nguyên mẫu gốc; nhập kết quả lần này riêng, giữ báo cáo cũ. Nếu không thể thử, ghi lý do.') + '</small></div>';
  }
  function preferredReport(key) {
    const original = docs().find((o) => o.id === key);
    return liveDocs().filter((o) => o.kind === 'report' && o.familyId === original?.familyId).sort((a,b) => ({draft:0,pending:1,approved:2}[status(a)] - {draft:0,pending:1,approved:2}[status(b)]) || b.createdAt.localeCompare(a.createdAt))[0] || original;
  }
  function reportKinds() {
    return `<nav class="rf-kind-tabs" aria-label="${t('報告分類', 'Loại báo cáo')}">${[['', t('全部', 'Tất cả')], ['report', 'RPT · ' + label('report')], ['waiver', 'WVR · ' + label('waiver')], ['disposal', 'DSP · ' + label('disposal')]].map(([key, text]) => `<button type="button" class="rf-btn ${s.documentKind === key ? 'primary' : ''}" data-rf-tone="${key === 'report' ? 'initial' : key}" data-kind="${key}">${text}</button>`).join('')}</nav>`;
  }
  function localMissing(c, d) {
    const issues = [], add = (path, message) => issues.push({ path, message });
    if(d.calendarVersion===2){
      if(legacyCalendarFollowup(d)&&!d.flow.pendingId&&status(d)==='draft')add(['reason'],'FOLLOWUP_KIND_UNAVAILABLE');
      c={...c,lines:c.lines.filter(l=>!d.cancelledJobIds?.includes(l.jobId))};
      if(!c.title.trim())add(['title'],'TITLE_REQUIRED');
      if(!c.lines.length)add(['lines'],'ITEM_REQUIRED');
      if(d.requestKind){if(!c.reason.trim())add(['reason'],'REASON_REQUIRED');return issues;}
      if(d.kind==='plan'){if(d.retestApplicationCaseId&&!c.reason.trim())add(['reason'],'REASON_REQUIRED');if(d.calendarLegacy?.unrecordedPlanDates)return issues;if(!c.planStart||!c.planEnd||c.planStart>c.planEnd)add(['planStart'],'PLAN_DATES_REQUIRED');return issues;}
      if(d.kind==='report'){
        if(!c.date)add(['date'],'DATE_REQUIRED');
        if(status(d)==='draft'&&c.planEnd<data.today&&!c.overdueReason?.trim())add(['overdueReason'],'OVERDUE_REASON_REQUIRED');
        for(const l of c.lines){if(l.results.length!==1)add(['lines',{id:l.id}],'ONE_RESULT_PER_PRODUCT_REQUIRED');for(const r of l.results){const p=['lines',{id:l.id},'results',{id:r.id}];if(!['pass','fail','abnormal','unable','dispose'].includes(r.outcome))add([...p,'outcome'],'RESULT_REQUIRED');if(r.outcome==='dispose'){if(status(d)==='draft'&&!d.correctionOf)add([...p,'outcome'],'LEGACY_INLINE_DISPOSAL_KEEP_EXISTING');if(!r.disposalReason?.trim())add([...p,'disposalReason'],'DISPOSAL_REASON_REQUIRED');if(!r.notes?.trim())add([...p,'notes'],'DISPOSAL_PROBLEM_REQUIRED');}if(r.outcome==='fail'&&!r.photos.length)add([...p,'photos'],'UPLOADED_PHOTO_REQUIRED');if(r.outcome==='unable'&&status(d)==='draft')add([...p,'outcome'],'LEGACY_UNABLE_KEEP_EXISTING');}}
        return issues;
      }
      if(!c.reason.trim())add(['reason'],'REASON_REQUIRED');
      if(d.disposalPolicy!=='skip-period'&&!c.nextDate)add(['nextDate'],'NEXT_DATE_REQUIRED');
      if(d.kind==='disposal'){if(!c.disposition.trim())add(['disposition'],'DISPOSITION_REQUIRED');if(d.disposalPolicy!=='skip-period'&&!c.dispositionResult?.trim())add(['dispositionResult'],'DISPOSITION_RESULT_REQUIRED');}
      return issues;
    }
    if (!c.title.trim()) add(['title'], 'TITLE_REQUIRED');
    if (!c.date) add(['date'], 'DATE_REQUIRED');
    if (d.kind === 'report') for (const l of c.lines) for (const r of l.results) {
      const p = ['lines', { id: l.id }, 'results', { id: r.id }];
      if (!r.outcome) add([...p, 'outcome'], 'RESULT_REQUIRED');
      if (r.outcome !== 'unable' && !r.samples.length) add([...p, 'samples'], 'SAMPLES_REQUIRED');
      if (r.samples.length > 1) add([...p,'samples'],'SINGLE_SAMPLE_REQUIRED');
      if (r.outcome === 'pass' && !r.value.trim()) add([...p, 'value'], 'ACTUAL_RESULT_REQUIRED');
      if (['fail', 'unable', 'undetermined'].includes(r.outcome) && !r.notes.trim()) add([...p, 'notes'], 'EXPLANATION_REQUIRED');
      if (['fail', 'undetermined'].includes(r.outcome) && !r.photos.length) add([...p, 'photos'], 'UPLOADED_PHOTO_REQUIRED');
    }
    if (d.kind === 'report') for (const l of c.lines) {
      if (requiredForLine(d,l).length && l.results.some(r => r.samples.some(code => !requiredForLine(d,l).includes(code)))) add(['lines',{id:l.id},'samples'],'RETEST_SAMPLE_FIXED');
      if (!l.results.some((r) => ['unable','dispose'].includes(r.outcome)) && requiredForLine(d,l).some((code) => !l.results.flatMap((r) => r.samples).includes(code))) add(['lines',{id:l.id},'samples'],'RETEST_REQUIRED_SAMPLES');
      for (const r of l.results) if (new Set(r.samples).size !== r.samples.length || r.samples.some((code) => !l.source.products.some((p) => p.code === code) || l.results.some(other => other.id !== r.id && other.samples.includes(code)))) add(['lines',{id:l.id},'results',{id:r.id},'samples'],'SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE');
    }
    if (['waiver', 'disposal'].includes(d.kind) && !c.reason.trim()) add(['reason'], 'REASON_REQUIRED');
    if (d.kind === 'disposal') {
      if (!c.disposition.trim()) add(['disposition'], 'DISPOSITION_REQUIRED');
      if (!c.evidence.length) add(['evidence'], 'EVIDENCE_REQUIRED');
    }
    return issues;
  }
  function issuePanels(d, c) {
    s.issueTargets = [];
    const business = new Set(['TITLE_REQUIRED', 'DATE_REQUIRED', 'ITEM_REQUIRED', 'RESULT_REQUIRED', 'SAMPLES_REQUIRED', 'SINGLE_SAMPLE_REQUIRED', 'RETEST_SAMPLE_FIXED', 'ACTUAL_RESULT_REQUIRED', 'EXPLANATION_REQUIRED', 'UPLOADED_PHOTO_REQUIRED', 'RETEST_REQUIRED_SAMPLES', 'SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE', 'REASON_REQUIRED', 'DISPOSITION_REQUIRED', 'EVIDENCE_REQUIRED']);
    const invalid = new Set(['SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE','SINGLE_SAMPLE_REQUIRED','RETEST_SAMPLE_FIXED']);
    const local = localMissing(c,d).filter(i => status(d) !== 'approved' || !invalid.has(i.message)), missing = local.filter(i => !invalid.has(i.message)), errors = [...local.filter(i => invalid.has(i.message)), ...s.issues.filter(i => !business.has(i.message) || invalid.has(i.message))];
    for (const i of s.issues.filter((i) => business.has(i.message) && i.message !== 'RETEST_REQUIRED_SAMPLES' && !invalid.has(i.message))) if (!missing.some((m) => JSON.stringify(m.path) === JSON.stringify(i.path) && m.message === i.message)) missing.push(i);
    const render = (issues) => issues.map((i) => {
      const index = s.issueTargets.push(i) - 1;
      return `<div class="rf-issue-row"><span>${h(issueText(i))}</span>${btn('focus-issue', t('前往修改', 'Đến mục cần sửa'), !i.path?.length, '') .replace('data-action="focus-issue"', `data-issue-index="${index}"`)}</div>`;
    }).join('');
    return `<div class="rf-errors">${render(errors)}</div><div class="rf-missing">${render(missing)}${dirty(d) && d.savedIssues?.length ? `<p class="rf-subtle">${t('以上為目前輸入；已存草稿仍有待補項目，修正後請儲存再送審。', 'Nội dung trên là dữ liệu đang nhập; bản đã lưu còn thiếu. Lưu lại trước khi gửi duyệt.')}</p>` : ''}</div>`;
  }
  function updateRoutineIssues(d,c) {
    const temporary = document.createElement('div'); temporary.innerHTML = issuePanels(d,c);
    for (const kind of ['errors','missing']) {
      const node = root.querySelector('.rf-document .rf-' + kind), fresh = temporary.querySelector('.rf-' + kind);
      if (!node || !fresh) continue;
      node.replaceChildren(...fresh.childNodes);
      const section = node.closest('.vd-issues'), count = node.querySelectorAll('.rf-issue-row').length;
      section?.classList.toggle('rf-no-issues',!count);
      if (section?.querySelector('h3')) section.querySelector('h3').textContent = t(kind === 'errors' ? '報錯' : '待補資料',kind === 'errors' ? 'Lỗi' : 'Dữ liệu cần bổ sung') + ' · ' + count;
    }
    root.querySelectorAll('[data-issue-index]').forEach((button) => button.onclick = () => focusIssue(s.issueTargets[Number(button.dataset.issueIndex)]));
  }
  function focusIssue(issue) {
    const parts = issue?.path || [], ids = parts.filter((p) => typeof p === 'object').map((p) => p.id), field = parts.at(-1);
    let target = root.querySelector('.rf-document');
    if (ids[0]) target = [...root.querySelectorAll('[data-line-id]')].find((e) => e.dataset.lineId === ids[0]) || target;
    if (ids[1]) target = [...target.querySelectorAll('[data-result-id]')].find((e) => e.dataset.resultId === ids[1]) || target;
    if (target.matches?.('.rf-result')) target.open = true;
    let input;
    if (issue.message === 'RETEST_REQUIRED_SAMPLES') { const guidance = target.querySelector('.rf-required-samples'); input = guidance; }
    else if (field === 'samples') { const details = target.querySelector('.rf-samples'); if (details) details.open = true; input = target.querySelector('[data-sample-search], [data-sample]'); }
    else if (field === 'outcome') input = target.querySelector('[data-outcome]');
    else if (field === 'photos' || field === 'evidence') input = target.querySelector(field === 'evidence' ? '[data-upload="evidence"]' : '[data-upload="result"]');
    else input = [...target.querySelectorAll('[data-field], [data-result-field]')].find((e) => e.dataset.field === field || e.dataset.resultField === field);
    const focus = input?.matches('[data-upload]') ? input.closest('.rf-upload') : input || target;
    focus.tabIndex = focus.tabIndex < 0 ? 0 : focus.tabIndex;
    focus.scrollIntoView({ block: 'center', behavior: 'smooth' });
    focus.focus({ preventScroll: true });
    focus.classList.add('rf-needs-attention');
    setTimeout(() => focus.classList.remove('rf-needs-attention'), 2500);
  }
  function dependencyLinks(d, excluded = []) {
    return [...(d.dependencies?.documents || []).filter((key) => !excluded.includes(key)).map((key) => `<button class="rf-report-link" data-doc="${h(key)}">${h(docs().find((o) => o.id === key)?.number || key)}</button>`), ...(d.dependencies?.cases || []).map((key) => `<button class="rf-report-link" data-case="${h(key)}">${h(data.control.cases.find((o) => o.id === key)?.number || key)}</button>`)].join(' ');
  }
  function cancellationPanel(d) {
    if (status(d) === 'cancelled') return `<div class="rf-notice">${tag('cancelled')} ${t('此文件已捨棄，不能復原。請建立新文件。', 'Hồ sơ đã bỏ, không thể khôi phục. Hãy tạo hồ sơ mới.')}</div>`;
    if (s.cancelConfirm !== 'discard:' + d.id) return '';
    const blocked = (d.dependencies?.documents.length || d.dependencies?.cases.length);
    return `<div class="rf-inline-confirm">${blocked ? t('已有相依文件，無法刪除：', 'Có hồ sơ phụ thuộc; không thể xóa:') + dependencyLinks(d) : t('確認捨棄？捨棄後不能復原，可重新選取項目建立新文件。', 'Bỏ hồ sơ? Không thể khôi phục; có thể chọn hạng mục để tạo hồ sơ mới.')}${btn('confirm-cancel', t('確認捨棄', 'Xác nhận bỏ'), !!blocked, 'danger')}${btn('cancel-confirmation', t('取消', 'Hủy'))}</div>`;
  }
  function planActions(d) {
    if(d.requestKind)return '';
    if(calendarMode()||d.calendarVersion===2){const reports=docs().filter(x=>x.planId===d.id&&x.kind==='report'&&!x.cancelled);return reports.map(r=>`<button class="rf-btn primary" data-doc="${h(r.id)}">${t('接續報告','Tiếp tục báo cáo')}</button>`).join('')+(!reports.length?btn('create-report',t('填寫檢查報告','Nhập báo cáo kiểm tra'),!data.permissions.edit||d.calendarVersion!==2,'primary'):'')+btn('calendar-void',t('申請作廢','Đề nghị hủy'),!data.permissions.edit||reports.some(r=>r.flow.pendingId||r.flow.active.id));}
    const slots = reportSlots(d), ids = [...new Set(slots.flatMap((a) => a.reportIds).map((key) => preferredReport(key)?.id || key))], available = slots.some((a) => a.assigned && !a.reportIds.length);
    return `${!available && !ids.length ? '<div class="rf-notice">' + t('此計畫沒有可建立初測報告的項目；項目已改由其他計畫管理或異常已終止。請查看目前計畫／後續文件。','Kế hoạch không còn hạng mục tạo báo cáo ban đầu; đã chuyển kế hoạch hoặc bất thường đã kết thúc. Xem kế hoạch / hồ sơ hiện tại.') + content(d).lines.map((l) => { const j = data.control.jobs.find((j) => j.id === l.jobId), current = docs().find((p) => p.id === j?.planId); return current && current.id !== d.id ? '<button class="rf-report-link" data-doc="' + h(current.id) + '">' + t('開啟目前計畫','Mở kế hoạch hiện tại') + ' · ' + h(current.number) + '</button>' : ''; }).join('') + (d.caseId ? '<button class="rf-report-link" data-case="' + h(d.caseId) + '">' + t('查看異常與歷次報告','Xem bất thường và các báo cáo') + '</button>' : '') + '</div>' : ''}${available ? btn('create-report', t('＋ 建立執行報告', '＋ Tạo báo cáo'), !data.permissions.edit, 'primary') : ''}${ids.map((key) => `<button class="rf-btn" data-doc="${h(key)}">${t('接續報告', 'Tiếp tục báo cáo')} · ${h(docs().find((o) => o.id === key)?.number || key)}</button>`).join('')}${btn('discard', t('刪除計畫', 'Xóa kế hoạch'), !data.permissions.revoke, 'danger')}${dependencyLinks(d, ids) ? `<small>${t('相依文件保留，刪除將受保護：', 'Giữ hồ sơ phụ thuộc, bảo vệ khi xóa:')}${dependencyLinks(d, ids)}</small>` : ''}<details><summary>${t('計畫版本歷史', 'Lịch sử phiên bản kế hoạch')}</summary>${docs().filter((o) => o.kind === 'plan' && o.familyId === d.familyId && o.id !== d.id).map((o) => `<button class="rf-report-link" data-doc="${h(o.id)}">${h(o.number)} · ${label(status(o))}</button>`).join('')}</details>`;
  }
  function reviewBlock(d,action) {
    const pending=d?.flow.cases.find(c=>c.id===d.flow.pendingId);
    if(!pending||s.reviewCase&&s.reviewCase!==pending.id)
      return t('原案件已更新，請重新選取目前案件。','Hồ sơ đã đổi; chọn lại hồ sơ hiện tại.');
    if(s.retry)return t('請先查原操作收據，再確認這筆 FQC 案件。','Kiểm tra biên nhận gốc trước khi duyệt hồ sơ FQC này.');
    if(!data.permissions[action])return t('目前沒有此審核操作的權限。','Hiện không có quyền thực hiện thao tác duyệt này.');
    if(pending.actor.id!==data.identity.id)return '';
    if(data.identity.role!=='admin')return t('一般帳號不可自審。','Tài khoản thường không được tự duyệt.');
    return s.selfReview===pending.id?'':t('請先勾選確認自審此案件。','Xác nhận tự duyệt hồ sơ này trước.');
  }
  function approvalPanel(d) {
    if (!s.reviewPlatform || status(d) !== 'pending') return '';
    const pending = d.flow.cases.find((c) => c.id === d.flow.pendingId), self = pending?.actor.id === data.identity.id, admin = data.identity.role === 'admin';
    const approveBlock=reviewBlock(d,'approve');
    return `<section class="rf-approval"><h3>${t('確認整份送審案件', 'Duyệt toàn bộ hồ sơ gửi')}</h3><p>${t('以下為送審時固定內容，審核不受清單篩選影響。', 'Nội dung cố định lúc gửi; bộ lọc không giới hạn phạm vi duyệt.')}</p><small>${h(pending?.id)} · ${h(pending?.actor.name)} · ${h(pending?.at)}</small><p data-rf-review-block role="status">${h(approveBlock)}</p>${self ? `<label class="rf-self-review"><input type="checkbox" data-self-review ${s.selfReview === pending?.id ? 'checked' : ''} ${admin ? '' : 'disabled'}>${admin ? t('我確認自審此送審案件，並留下操作紀錄', 'Tôi xác nhận tự duyệt hồ sơ này và lưu nhật ký') : t('一般帳號不可自審', 'Tài khoản thường không được tự duyệt')}</label>` : ''}<div class="rf-actions">${btn('approve', t('確認核准', 'Xác nhận duyệt'), !!approveBlock, 'primary')}</div>${data.permissions.return ? `<label>${t('發回修正意見（必填）', 'Ý kiến trả lại (bắt buộc)')}<textarea data-return-reason></textarea></label>${btn('return', t('發回修正', 'Trả lại sửa'), !!reviewBlock(d,'return'))}` : ''}</section>`;
  }
  function openReview(d) {
    s.selected = d.id; s.reviewCase = d.flow.pendingId; s.selfReview = null;
    if(window.ProcessDeliveryNavigation?.approval){void window.ProcessDeliveryNavigation.approval('routine',{rfDocument:d.id,...(d.flow.pendingId?{rfCase:d.flow.pendingId}:{})});return;}
    state.approvalTab = 'routine';
    const url = new URL(location.href); url.searchParams.set('approvalTab', 'routine'); url.searchParams.set('rfDocument', d.id); if (d.flow.pendingId) url.searchParams.set('rfCase', d.flow.pendingId);
    if(!window.ProcessDeliveryNavigation?.replaceDisplayURL?.(url))history.replaceState(history.state, '', url);
    window.ProcessDualSystem.go('approval');
  }
  function reviewHTML() {
    return `<section id="review-routine-fqc" class="rf-app" data-i18n-skip="true"><div class="rf-empty">${t('載入例行檢查送審…', 'Đang tải hồ sơ định kỳ…')}</div></section>`;
  }
  function paintReview() {
    updatePendingBadge();
    const pending = liveDocs().filter((d) => status(d) === 'pending');
    const names = ['FQC', 'IQC', t('模具設備', 'Thiết bị khuôn'), t('檢具與測試設備', 'Dưỡng và thiết bị thử')];
    root.innerHTML = `<header class="rf-hero"><div><div class="rf-eyebrow">ROUTINE INSPECTION APPROVAL</div><h2>${t('例行檢查送審', 'Duyệt kiểm tra định kỳ')}</h2><p>${t('計畫、執行報告／複測、免做與處置分別確認。', 'Duyệt riêng kế hoạch, báo cáo / thử lại, miễn và xử lý.')}</p></div>${btn('refresh', t('重新整理', 'Làm mới'))}</header><nav class="rf-modules">${names.map((name, i) => `<button type="button" class="${s.reviewModule === (i ? String(i) : 'FQC') ? 'active' : ''}" data-review-module="${i ? i : 'FQC'}">${name} ${t('例行檢查', 'định kỳ')}${i ? '' : ' · ' + pending.length}</button>`).join('')}</nav>${s.reviewModule !== 'FQC' ? `<div class="rf-empty">${t('功能建置中，尚無送審案件', 'Đang xây dựng, chưa có hồ sơ gửi duyệt')}</div>` : `<div class="rf-main">${routineErrorBanner()}<div class="rf-kind-tabs">${[['',t('全部', 'Tất cả')],['plan',label('plan')],['report',t('執行報告／複測', 'Báo cáo / thử lại')],['waiver',label('waiver')],['disposal',label('disposal')]].map(([key,text]) => `<button class="rf-btn ${s.documentKind === key ? 'primary' : ''}" data-kind="${key}">${text} · ${pending.filter((d) => !key || d.kind === key).length}</button>`).join('')}</div><div class="rf-layout has-selection"><section class="rf-panel"><div class="rf-panel-heading">${t('待審案件', 'Hồ sơ chờ duyệt')}</div><div class="rf-review-list">${pending.filter((d) => !s.documentKind || d.kind === s.documentKind).map((d) => `<button class="rf-review-card ${d.id === s.selected ? 'selected' : ''}" data-review-doc="${h(d.id)}"><b class="rf-number ${reportType(d)}">${h(displayNumber(d))}</b><span>${reportLabel(d)}${d.caseId ? ' · ' + t('異常後續', 'Theo dõi bất thường') : ''}</span><small>${h(d.flow.cases.find((c) => c.id === d.flow.pendingId)?.actor.name)} · ${h(content(d).date)}</small></button>`).join('') || `<p class="rf-empty">${t('目前無待審案件', 'Không có hồ sơ chờ duyệt')}</p>`}</div><details class="rf-review-history"><summary>${t('已處理與歷史', 'Đã xử lý & lịch sử')}</summary>${liveDocs().filter((d) => status(d) !== 'pending' && (!s.documentKind || d.kind === s.documentKind)).slice().reverse().map((d) => `<button class="rf-review-card" data-review-doc="${h(d.id)}"><b class="rf-number ${reportType(d)}">${h(displayNumber(d))}</b><span>${reportLabel(d)} · ${label(status(d))}</span></button>`).join('')}</details></section><section class="rf-panel rf-detail-panel"><div class="rf-detail">${doc() ? documentDetail(doc()) : empty()}</div></section></div></div>`}`;
    bind(); mountDraft();
    root.querySelectorAll('[data-review-doc]').forEach((b) => b.onclick = () => {
      s.selected = b.dataset.reviewDoc; s.reviewCase = doc().flow.pendingId; s.selfReview = null; s.cancelConfirm = null;
      const url = new URL(location.href); url.searchParams.set('rfDocument', s.selected); if (s.reviewCase) url.searchParams.set('rfCase', s.reviewCase); else url.searchParams.delete('rfCase'); if(!window.ProcessDeliveryNavigation?.replaceDisplayURL?.(url))history.replaceState(history.state, '', url); paint();
    });
    root.querySelectorAll('button').forEach((b) => { if (s.busy || generationRefresh?.current()) b.disabled = true; });
  }
  async function bindReview(container) {
    const area = container?.querySelector('#review-routine-fqc'); if (!area) return;
    retireApprovedHistory();root = area; s.reviewPlatform = true; s.tab = 'documents';
    const url = new URL(location.href);
    if (url.searchParams.get('rfDocument')) s.selected = url.searchParams.get('rfDocument');
    s.reviewCase = url.searchParams.get('rfCase'); s.selfReview = null;
    try { const next = await read(); if(next.pageDraftLayout==='page-v1'){pageDraftMode=true;await window.RoutineFqcPage.mount(area,{review:true});updatePendingBadge();return;} if (!data || next.identity.id !== data.identity.id || next.control.revision >= data.control.revision) data = next; if(s.retry)s.error=receiptInvalid?receiptStorageNotice():receiptNotice(); paint(); updatePendingBadge(); } catch (e) {if(e.message!=='DELIVERY_SUPERSEDED'){navigationError=e;fault(e);}}
  }
  function updatePendingBadge() {
    const count = pageDraftMode?window.RoutineFqcPage.pendingCount():liveDocs().filter((d) => status(d) === 'pending').length;
    const badge = document.querySelector('#approval-tab-routine .approval-tab-count'); if (badge) badge.textContent = count;
  }
  async function approvalPendingAvailability() {
    const pin = receiptPin(), delivery = window.ProcessSync?.captureDelivery?.();
    const current = () => receiptCurrent(pin) && (!delivery || window.ProcessSync?.isCurrentDelivery?.(delivery) === true);
    if (!historyAllowsMutation() || !window.hasPermission?.('routine.view')) return { fqc: false, iqc: false };
    const response = await read('?availability=1', current, { headers: { 'X-Process-Routine-Pending': '1' } });
    if (typeof response.enabled !== 'boolean' || typeof response.iqcEnabled !== 'boolean')
      throw Error('ROUTINE_PENDING_AVAILABILITY_INVALID');
    return { fqc: response.enabled, iqc: response.iqcEnabled };
  }
  function reportPendingReadError(error) {
    if (error.message !== 'DELIVERY_SUPERSEDED') console.warn('Routine FQC pending count could not be refreshed', error);
  }
  async function refreshPending(available) {
    if (!historyAllowsMutation() || s.reviewPlatform || s.busy) return;
    try {
      const enabled = available ?? (await approvalPendingAvailability()).fqc;
      if (!enabled) {
        const badge = document.querySelector('#approval-tab-routine .approval-tab-count');
        if (badge) badge.textContent = '0';
        return;
      }
      const next = await read('?pending-count=1');
      if (next.pageDraftLayout === 'page-v1') {
        pageDraftMode = true;
        await window.RoutineFqcPage.refreshMetadata();
        updatePendingBadge();
        return;
      }
      const badge = document.querySelector('#approval-tab-routine .approval-tab-count');
      if (badge && Number.isSafeInteger(next.pendingCount) && next.pendingCount >= 0)
        badge.textContent = next.pendingCount;
    } catch (error) { reportPendingReadError(error); }
  }

  // Navigation consumes only unsent RAM. Exact unknown-operation metadata
  // remains in storage and continues to fence every Routine FQC write.
  function routineDeparture(config) {
    const base=window.VersionDraftUI.createDeparture(config);let held=null,completed=null;
    const anchor=()=>{
      if(receiptInvalid||!receiptRecord||s.busy||inFlightMutation||s.dialogOpen)return null;
      const pin=receiptPin();if(!receiptOwnedPin(pin))return null;
      try{return receiptStore().getItem(receiptRecord.key)===receiptRecord.raw?{record:receiptRecord,raw:receiptRecord.raw,pin}:null;}catch{return null;}
    };
    const valid=record=>{const live=anchor();return !!live&&live.record===record.anchor.record&&live.raw===record.anchor.raw&&receiptOwnedPin(record.anchor.pin);};
    return {...base,autoAbandon:true,allowUnload:()=>!s.busy&&!inFlightMutation,
      inspect(){if(held&&valid(held))return {state:'departing',departureId:held.id,canSave:false,canDiscard:false,reason:receiptNotice()};const state=base.inspect();return state.state==='unknown'&&anchor()?{...state,canAbandon:true}:state;},
      async abandon(){
        if(base.inspect().state!=='unknown')return base.abandon();
        const captured=anchor();if(held||!captured)throw Error('DEPARTURE_CONTEXT_CHANGED');
        const record={id:{},anchor:captured};config.discard();if(!valid(record))throw Error('DEPARTURE_CONTEXT_CHANGED');held=record;
        return {departureId:record.id,release(){if(held===record)held=null;}};
      },
      covered:()=>!!completed||base.covered(),
      otherDraftsPending:()=>window.sharedDraftDepartureBlocked?.()??false,
      closeClean(){if(!held)return base.closeClean();if(!valid(held))throw Error('DEPARTURE_CONTEXT_CHANGED');completed=held;},
    };
  }
  let moduleDeparture;
  const departureSharedOwned=d=>{const tracked=d.flow?.scope==='routine-fqc:'+d.id;if(tracked)window.SharedDraftDeparture?.register?.(d.flow.scope);const owned=tracked?window.SharedDraftDeparture?.owns?.(d.flow):null;if(typeof owned==='boolean')return owned;if(!window.sharedDraftNeedsSave?.(d.flow))return false;const stamps=d.flow.contributors,actors=stamps&&typeof stamps==='object'&&!Array.isArray(stamps)?Object.values(stamps).map(value=>value?.actor?.id):[];return !actors.length||actors.some(actor=>typeof actor!=='string'||!actor||actor===window.ProcessSync?.identity?.id);};
  const departureDocuments=()=>docs().filter(d=>dirty(d)||departureSharedOwned(d));
  window.RoutineFQCUI = {
    navigation:{get departure(){if(pageDraftMode)return window.RoutineFqcPage.departure();return moduleDeparture ||= routineDeparture({
      root:()=>root,context:()=>[s.selected,data?.identity?.id,data?.permissions?.save,data?.permissions?.edit,docs().map(d=>[d.id,d.flow.generation])],
      current:()=>!data?.identity||!window.ProcessSync?.identity||data.identity.id===window.ProcessSync.identity.id,
      busy:()=>s.busy||!!inFlightMutation,unknown:()=>!!s.retry,
      local:()=>docs().some(dirty)||s.dialogOpen,
      dialogs:()=>[...document.querySelectorAll('.rf-modal[open]')],
      sharedDirty:()=>docs().some(departureSharedOwned),
      locked:()=>departureDocuments().some(d=>status(d)!=='draft'),
      localSave:()=>!s.dialogOpen,
      localReason:()=>s.dialogOpen?t('請留頁完成或取消目前視窗；不會代為確認建立、上傳或送審。','Ở lại hoàn tất hoặc hủy cửa sổ; không tự xác nhận tạo, tải ảnh hoặc gửi duyệt.'):t('儲存會依原日常 FQC 流程，逐份提交本機修改並固定各文件版本；不會送審或刪除文件。','Lưu gửi các thay đổi cục bộ và cố định phiên bản từng hồ sơ FQC; không gửi duyệt hoặc xóa hồ sơ.'),
      canSave:()=>historyAllowsMutation()&&data?.permissions.save===true&&(!docs().some(dirty)||data?.permissions.edit===true),canDiscard:()=>data?.permissions.edit===true&&!s.dialogOpen,
      async save(){s.busy=true;try{for(const d of departureDocuments())await save(d);return true;}finally{s.busy=false;paint();}},
      discard(){for(const dialog of document.querySelectorAll('.rf-modal[open]'))dialog.querySelector('[data-cancel]')?.click();for(const d of docs())if(dirty(d)){s.buffers.delete(d.id);s.bases.delete(d.id);}paint();},
    });},canLeave:()=>pageDraftMode?window.RoutineFqcPage.canLeave():!s.busy&&!s.retry&&!inFlightMutation&&!s.dialogOpen&&!docs().some(dirty),error:()=>navigationError,reset(){flowConnectorObserver?.disconnect();flowConnectorObserver=null;window.RoutineFqcPage?.reset();pageDraftMode=false;retireApprovedHistory();historyClients.clear();loading=false;root=null;data=null;s.selected=null;s.buffers.clear();s.bufferGenerations.clear();s.bases.clear();s.checked.clear();s.listReturn=null;s.periodExpanded.clear();s.periodMore.clear();s.periodSearch=s.periodFrom=s.periodTo=s.periodOutcome='';s.sampleOpen.clear();s.resultOpen.clear();s.reviewPlatform=false;s.issues=[];s.error='';navigationError=null;historySearch=null;historyLanguage=null;receiptPresentation=null;}},
    keepListAnchor,
    revealRoutineDetail,
    html,
    mount,
    reviewHTML,
    bindReview,
    approvalPendingAvailability,
    refreshPending,
    pendingCount: () => pageDraftMode?window.RoutineFqcPage.pendingCount():liveDocs().filter((d) => status(d) === 'pending').length,
    historyForItem: (item) => {
      s.line = '';
      s.category = '';
      s.query = '';
      s.outcome = '';
      s.review = '';
      s.caseState = '';
      s.from = '';
      s.to = '';
      s.item = item;
      pendingHistoryItem = item;
      s.tab = 'history';
      s.selected = null;
      window.ProcessDualSystem.go('quality-inspections');
    },
  };
  window.addEventListener('process-language-change', () => paint());
})();
