/* Shared V3 transport: one ordered client stream, bounded requests and unknown-result lookup. */
(() => {
  // Display only: retain raw transport/classifier/receipt errors.
  window.sharedDraftErrorMessage = (error, language = document.documentElement.lang) => {
    const messages = {
      SUCCESSFUL_SAVE_REQUIRED:['請先成功儲存目前共用草稿，再送出審核。','Hãy lưu bản nháp chung thành công trước khi gửi duyệt.'],
      UNSAVED_CHANGES_SAVE_REQUIRED:['共用草稿有儲存後的新修改。請先儲存，再核對版本並送審；目前修改仍保留。','Bản nháp chung có thay đổi sau lần lưu. Hãy lưu rồi kiểm tra phiên bản trước khi gửi duyệt; các thay đổi vẫn được giữ.'],
      DRAFT_REVISION_REQUIRED:['此分頁缺少送審版本確認。請先保留未套用內容，再重新開啟最新頁面。','Tab này thiếu thông tin xác nhận phiên bản gửi duyệt. Hãy giữ nội dung chưa áp dụng rồi mở lại trang mới nhất.'],
      WORKFLOW_V3_REQUIRED:['此舊版流程無法確認已儲存的送審版本，暫停新送審。請保留內容並由管理者核對共用草稿採用狀態。','Quy trình cũ này không xác minh được bản đã lưu để gửi duyệt. Hãy giữ nội dung và nhờ quản trị viên kiểm tra trạng thái bản nháp chung.'],
      DRAFT_REVISION_CHANGED_RECONFIRM:['確認期間共用草稿已更新，本次未送審。請重新核對並儲存最新內容。','Bản nháp chung đã thay đổi trong lúc xác nhận; chưa gửi duyệt. Hãy kiểm tra và lưu nội dung mới nhất.'],
      UNAPPLIED_CHANGES_APPLY_REQUIRED:['尚有未套用內容。請先明確套用或放棄這些輸入，再儲存或送審。','Còn nội dung chưa áp dụng. Hãy áp dụng rõ ràng hoặc bỏ các nội dung đó trước khi lưu hay gửi duyệt.'],
      PENDING_LOCKED:['此範圍已送審，暫時不能寫入。尚未送出的輸入仍保留。','Phạm vi này đang chờ duyệt nên chưa thể ghi. Nội dung chưa gửi vẫn được giữ.'],
      RESTORE_PERMISSION_REQUIRED:['沒有還原歷史至草稿的權限，資料未變更。','Không có quyền khôi phục lịch sử vào bản nháp; dữ liệu chưa thay đổi.'],
      RESTORE_DELETE_PERMISSION_REQUIRED:['這次還原會刪除草稿資料，需要刪除權限；資料未變更。','Khôi phục này sẽ xóa dữ liệu nháp và cần quyền Xóa; dữ liệu chưa thay đổi.'],
      RESTORE_CREATE_PERMISSION_REQUIRED:['這次還原會新增或恢復資料，需要新增權限；資料未變更。','Khôi phục này sẽ thêm hoặc khôi phục dữ liệu và cần quyền Thêm; dữ liệu chưa thay đổi.'],
      "BEGIN_RESPONSE_TIMEOUT_UNKNOWN": [
        "開始草稿的回應等待逾時；伺服器可能已建立草稿，結果尚未確認。請先唯讀核對目前狀態，不要重複送出開始要求。",
        "Hết thời gian chờ phản hồi mở bản nháp; máy chủ có thể đã tạo bản nháp nhưng kết quả chưa được xác nhận. Hãy kiểm tra trạng thái chỉ đọc trước, không gửi lại yêu cầu mở."
      ],
      "WORKFLOW_READ_TIMEOUT": [
        "讀取等待逾時，尚未取得最新狀態。未自動重送任何寫入要求。",
        "Hết thời gian chờ đọc, chưa lấy được trạng thái mới nhất. Không tự động gửi lại thao tác ghi nào."
      ],
      "DEPENDENCY_CHANGED_RECONFIRM": [
        "此欄位或相關資料已被其他分頁／使用者更新，本次未套用。請先複製保留目前輸入，再重新開啟最新資料，核對後重新套用。",
        "Trường này hoặc dữ liệu liên quan đã được cập nhật từ tab hoặc người dùng khác. Thay đổi lần này chưa được áp dụng. Hãy sao chép nội dung đang nhập, mở lại dữ liệu mới nhất, đối chiếu rồi áp dụng lại."
      ],
      "DEPENDENCY_GUARD_REQUIRED": [
        "此分頁需要更新，已阻止套用以免覆寫較新資料。請先複製保留目前輸入，再重新載入頁面，核對最新資料後重新編輯。",
        "Tab này cần được tải lại. Hệ thống đã chặn việc áp dụng để tránh ghi đè dữ liệu mới hơn. Hãy sao chép nội dung đang nhập, tải lại trang, đối chiếu dữ liệu mới nhất rồi chỉnh sửa lại."
      ]
    };
    const raw = typeof error === 'string' ? error : error?.message || String(error ?? '');
    const code = Object.hasOwn(messages, error?.code) ? error.code : raw;
    return Object.hasOwn(messages, code) ? messages[code][language === 'vi' ? 1 : 0] : raw;
  };
  // Read-loop admission only. Never infer logout or mutate recovery/write state.
  window.createScopedReadPause = label => {
    const blocks=new Map(),outcomes=new Map();let sequence=0;
    const capture=()=>({sequence:++sequence,id:window.ProcessSync?.identity?.id,identity:window.ProcessSync?.identity,epoch:window.ProcessSync?.identityGeneration?.(),delivery:window.ProcessSync?.captureDelivery?.()});
    const current=owner=>!window.ProcessSync?.requiresReload&&owner.id===window.ProcessSync?.identity?.id&&(typeof owner.epoch==='number'?owner.epoch===window.ProcessSync?.identityGeneration?.():owner.identity===window.ProcessSync?.identity)&&(!owner.delivery||window.ProcessSync?.isCurrentDelivery?.(owner.delivery)!==false);
    const remove=kind=>{const old=blocks.get(kind);old?.node?.remove?.();blocks.delete(kind);};
    function draw(kind,record){
      if(record.node?.isConnected)return;
      const root=document.querySelector?.('main')||document.body,node=document.createElement?.('section');if(!root?.prepend||!node?.append||!node?.setAttribute)return;
      node.className='editor-version-rule';node.dataset.i18nSkip='true';node.setAttribute('role','alert');
      const text=document.createElement('p'),button=document.createElement('button'),vi=document.documentElement.lang==='vi',displayKind=['state','receipt','permissions','inspection','review','history','effective','references'].includes(kind)?kind:'detail';
      text.textContent=vi?`${label} · ${displayKind}: quyền đọc bị từ chối (${record.status}); đã dừng cập nhật tự động. Dữ liệu, biểu mẫu và thao tác chưa rõ kết quả được giữ nguyên. Bảo toàn nội dung rồi kiểm tra chỉ đọc hoặc mở trang đăng nhập mới.`:`${label} · ${displayKind}：讀取遭拒（${record.status}），已暫停此項自動更新。現有資料、表單與未知操作保留；請先保全輸入，再唯讀核對或另開登入頁。`;
      record.message=text.textContent;button.type='button';button.className='button ghost';button.textContent=vi?'Kiểm tra lại chỉ đọc':'唯讀重新核對';
      button.onclick=async()=>{if(record.retrying||!current(record.owner)||blocks.get(kind)!==record)return;record.retrying=true;button.disabled=true;try{await record.retry();}catch{if(current(record.owner)&&blocks.get(kind)===record)text.textContent=record.message+(vi?' Vẫn chưa xác nhận được quyền đọc.':' 仍未能確認讀取權限。');}finally{record.retrying=false;if(button.isConnected)button.disabled=false;}};
      node.append(text,button);root.prepend(node);record.node=node;
    }
    return {capture,current,
      canPoll(kind='state'){if(window.ProcessSync&&(window.ProcessSync.requiresReload||!window.ProcessSync.identity?.id))return false;const record=blocks.get(kind);if(!record)return true;if(!current(record.owner)){remove(kind);return true;}draw(kind,record);return false;},
      denied(kind,status,owner,retry){if(![401,403].includes(status)||!current(owner)||owner.sequence<(outcomes.get(kind)||0))return;outcomes.set(kind,owner.sequence);const old=blocks.get(kind);if(old&&current(old.owner)){old.owner=owner;old.retry=retry;draw(kind,old);return;}remove(kind);const record={status,owner,retry,node:null,retrying:false};blocks.set(kind,record);draw(kind,record);},
      success(kind,owner){if(current(owner)&&owner.sequence>=(outcomes.get(kind)||0)){outcomes.set(kind,owner.sequence);remove(kind);}},
      state:kind=>blocks.has(kind)?{status:blocks.get(kind).status}:null
    };
  };
  // Scheduling only: no business/auth cache and no cancellation of sent requests.
  // Existing module callbacks retain their read/adoption/input-preservation guards.
  window.createForegroundPoll = () => {
    let timer=null,task=null,running=false,disposed=false,lastStart=null,urgent=false,generation=0;
    const foreground=()=>document.visibilityState!=='hidden'&&document.hasFocus?.()!==false;
    let wasForeground=foreground();
    const clear=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
    function arm(){
      clear();if(disposed||running||!task||!foreground())return;
      const delay=urgent?0:lastStart===null?30000:Math.max(0,30000-(performance.now()-lastStart));
      timer=setTimeout(async()=>{
        timer=null;if(disposed||running||!task||!foreground())return;
        const callback=task;task=null;urgent=false;running=true;lastStart=performance.now();
        try{await callback();}finally{running=false;arm();}
      },delay);
    }
    function visibility(){
      const current=foreground();
      if(!current)clear();
      else if(!wasForeground&&(task||running)){urgent=true;arm();}
      wasForeground=current;
    }
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('focus',visibility);window.addEventListener('blur',visibility);
    return {
      schedule(callback){if(disposed)return;task=callback;arm();},
      capture:()=>generation,isCurrent:owner=>!disposed&&owner===generation,
      cancel(){generation++;clear();task=null;urgent=false;lastStart=null;},
      dispose(){disposed=true;clear();task=null;urgent=false;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',visibility);window.removeEventListener('blur',visibility);}
    };
  };
  // Local Begin feedback only: retain forms and the existing module busy guards.
  // IDs survive VersionDraftUI's action relocation; no whole-page render here.
  const beginFeedbackOwners=new WeakMap();
  function beginFeedback(endpoint){
    const selectors={
      '/api/fqc/workflow':'#fqc-begin,#fqc-begin-empty',
      '/api/master/workflow':/[?&]scope=PROCESS(?:&|$)/.test(endpoint)?'#process-master-new-draft':'#master-new-draft',
      '/api/bom/workflow':'[data-bw="begin"]',
      '/api/iqc/workflow':'#iqc-begin',
      '/api/ipqc-ab/workflow':'#ipqcab-begin',
      '/api/ipqc-c/workflow':'#ipqcc-begin',
      '/api/routine-equipment/workflow':'#routine-begin',
      '/api/tooling/workflow':'#tooling-begin',
      '/api/process-authoring/workflow':'[data-av3="begin"]'
    },selector=selectors[endpoint.split('?')[0]];
    if(!selector)return()=>{};
    const sync=window.ProcessSync,actor=sync?.identity?.id,epoch=sync?.identityGeneration?.(),delivery=sync?.captureDelivery?.(),language=document.documentElement.lang;
    const label=language==='vi'?'Đang mở bản nháp…':'正在開啟草稿…';
    const token={},buttons=Array.from(document.querySelectorAll?.(selector)||[],node=>{
      let record=beginFeedbackOwners.get(node);
      if(!record||record.actor!==actor||record.epoch!==epoch||record.delivery&&sync?.isCurrentDelivery?.(record.delivery)===false||node.textContent!==record.label||node.getAttribute?.('aria-busy')!=='true')record={actor,epoch,delivery,text:node.textContent,disabled:node.disabled,busy:node.getAttribute?.('aria-busy'),label,tokens:new Set()};
      record.tokens.add(token);beginFeedbackOwners.set(node,record);
      node.disabled=true;node.textContent=label;node.setAttribute?.('aria-busy','true');return{node,record};
    });
    return()=>{
      if(actor!==window.ProcessSync?.identity?.id||typeof epoch==='number'&&epoch!==window.ProcessSync?.identityGeneration?.()||delivery&&window.ProcessSync?.isCurrentDelivery?.(delivery)===false)return;
      for(const {node,record} of buttons){
        record.tokens.delete(token);
        if(beginFeedbackOwners.get(node)!==record||record.tokens.size)continue;
        beginFeedbackOwners.delete(node);
        if(!node.isConnected||node.textContent!==label||node.getAttribute?.('aria-busy')!=='true')continue;
        node.textContent=record.text;
        node.disabled=record.disabled||node.getAttribute?.('aria-disabled')==='true'||window.ProcessSync?.requiresReload===true;
        if(record.busy===null||record.busy===undefined)node.removeAttribute?.('aria-busy');else node.setAttribute?.('aria-busy',record.busy);
      }
    };
  }
  // Runtime-only tab attribution, not an inverse journal or shared ownership.
  // Reads/Begin register coverage but never create a write. No storage, timers,
  // per-input comparisons or requests: only bound ACKs and departure inspection.
  const departureScopes=new Set(),departureWrites=new Map(),departureCutoffs=new Map();let departureVersion=0;
  const departureOwner=()=>({id:window.ProcessSync?.identity?.id,identity:window.ProcessSync?.identity,epoch:window.ProcessSync?.identityGeneration?.()});
  const departureOwnerCurrent=owner=>!!owner?.id&&!window.ProcessSync?.requiresReload&&owner.id===window.ProcessSync?.identity?.id&&(typeof owner.epoch==='number'?owner.epoch===window.ProcessSync?.identityGeneration?.():owner.identity===window.ProcessSync?.identity);
  const departureScope=endpoint=>{
    const [path,query='']=endpoint.split('?'),params={get(key){const values=query.split('&').filter(part=>part.split('=')[0]===key);if(values.length!==1)return null;try{return decodeURIComponent(values[0].slice(key.length+1).replaceAll('+',' '));}catch{return null;}}};
    if(path==='/api/master/workflow')return ['AB','C','PROCESS'].includes(params.get('scope'))?'master:'+params.get('scope'):null;
    if(path==='/api/ipqc-ab/workflow')return params.get('module')==='1'?'ipqc-ab:module':/^[AB]:.+/.test(params.get('scope')||'')?'ipqc-ab:'+params.get('scope'):null;
    return {'/api/fqc/workflow':'fqc','/api/iqc/workflow':'iqc','/api/ipqc-c/workflow':'ipqc-c','/api/bom/workflow':'bom','/api/routine-equipment/workflow':'routine-equipment','/api/tooling/workflow':'tooling','/api/process-authoring/workflow':'process:platform'}[path]||null;
  };
  window.SharedDraftDeparture={
    capture:departureOwner,version:()=>departureVersion,
    register(scope){if(typeof scope==='string'&&scope&&!departureScopes.has(scope)){departureScopes.add(scope);departureVersion++;}},
    confirmed(scope,command,result,owner){
      if(!departureOwnerCurrent(owner)||!departureScopes.has(scope))return;
      const r=result?.receipt;
      if(!r||r.operationId!==command?.operationId||r.generation!==command.generation||!Number.isSafeInteger(r.revision)||r.revision<0||typeof r.unchanged!=='boolean')return;
      if(scope==='ipqc-ab:module'&&command.action==='save'&&typeof r.savedId==='string'&&r.savedId&&Number.isSafeInteger(command.input?.stateRevision)&&command.input.stateRevision>=0&&Number.isSafeInteger(result.revision)&&result.revision>=command.input.stateRevision){
        // Group revision is NOT a global state revision. A complete module Save
        // ACK plus its exact input CAS proves coverage only through that CAS.
        const key=JSON.stringify([r.generation,r.savedId]),old=departureCutoffs.get(key),cutoff=command.input.stateRevision;
        if(!old||!departureOwnerCurrent(old.owner)||cutoff>old.revision){departureCutoffs.set(key,{owner,revision:cutoff});departureVersion++;}
      }
      if(!['apply','restore'].includes(command.action)||r.unchanged)return;
      const key=JSON.stringify([scope,r.generation]),old=departureWrites.get(key);
      if(old&&departureOwnerCurrent(old.owner)&&old.revision>=r.revision)return;
      departureWrites.set(key,{owner,revision:r.revision,globalRevision:Number.isSafeInteger(result.revision)&&result.revision>=0?result.revision:null,settled:false,comparisons:new WeakMap()});departureVersion++;
    },
    owns(flow,group){
      if(!flow||typeof flow.scope!=='string'||typeof flow.generation!=='string'||!Number.isSafeInteger(flow.revision)||!departureScopes.has(flow.scope)||group&&(flow.scope!=='ipqc-ab:'+group.key||group.moduleFlow&&group.moduleFlow.scope!=='ipqc-ab:module'))return null;
      const record=departureWrites.get(JSON.stringify([flow.scope,flow.generation]));
      if(!record||!departureOwnerCurrent(record.owner)||record.settled)return false;
      if(flow.revision<record.revision)return true; // Stale readback cannot clear an ACK.
      const saved=group?group.moduleFlow?.saved:flow.saved;
      if(!group&&Number.isSafeInteger(saved?.revision)&&saved.revision>=record.revision){record.settled=true;departureVersion++;return false;}
      if(group){
        const cutoff=departureCutoffs.get(JSON.stringify([group.moduleFlow?.generation,saved?.id]));
        if(cutoff&&departureOwnerCurrent(cutoff.owner)&&record.globalRevision!==null&&record.globalRevision<=cutoff.revision){record.settled=true;departureVersion++;return false;}
      }
      const content=group?(group.moduleFlow?saved?.content?.scopes?.[group.key]:flow.saved?.content??flow.active?.content):saved?.content??flow.active?.content;
      // Cache by immutable model/revision identities, never compare on each key.
      let comparison=record.comparisons.get(flow);
      if(!comparison||comparison.working!==flow.working||comparison.content!==content||comparison.revision!==flow.revision){comparison={working:flow.working,content,revision:flow.revision,equal:flow.working!==undefined&&content!==undefined&&JSON.stringify(flow.working)===JSON.stringify(content)};record.comparisons.set(flow,comparison);}
      if(comparison.equal){record.settled=true;departureVersion++;}
      return !record.settled;
    },
  };
  const clients=new Set(),transports=new Map(),boundedRetirements=new WeakMap(),rejectionCapabilities=new WeakMap(),rejectionFlights=new WeakMap();
  // Only this actual transport can mint an admission. Callers cannot substitute
  // a Boolean/callback, a copied error, another promise or another command.
  Object.defineProperty(window,'SharedDraftRejectionProof',{value:Object.freeze({verify(capability,error,command,promise){
    try{const cap=rejectionCapabilities.get(capability),proof=rejectionFlights.get(error);return !!cap&&!!proof&&cap.clientId===proof.clientId&&cap.flight===promise&&proof.flight===promise&&!!promise&&cap.raw===proof.raw&&cap.raw===JSON.stringify(command)&&cap.current()&&proof.current();}catch{return false;}
  }}),writable:false,configurable:false});
  // Capture once at the explicit Submit action, before opening confirmation.
  // Never call this from an input/render loop or replace the captured revision
  // with a newer one after confirmation. The server enforces the same contract.
  window.captureSharedDraftSubmission=flow=>{
    if(!flow?.saved)throw Error('SUCCESSFUL_SAVE_REQUIRED');
    if(flow.pendingId)throw Error('PENDING_LOCKED');
    if(!Number.isSafeInteger(flow.revision)||flow.revision<0)throw Error('DRAFT_REVISION_REQUIRED');
    if(flow.working===undefined||JSON.stringify(flow.working)!==JSON.stringify(flow.saved.content))throw Error('UNSAVED_CHANGES_SAVE_REQUIRED');
    return {savedId:flow.saved.id,expectedRevision:flow.revision};
  };
  // Begin alone is not an unsaved edit. Pending cases are already fixed, while
  // Apply and manual Save intentionally remain distinct operations.
  window.sharedDraftNeedsSave=flow=>!!flow&&!flow.pendingId&&flow.working!==undefined&&JSON.stringify(flow.working)!==JSON.stringify(flow.saved?.content??flow.active?.content);
  window.invalidateSharedDraftReads=()=>{for(const client of transports.values())client.invalidateReadState();};
  function packCommand(command){
    const counts=new Map(),visit=value=>{if(typeof value==='string'&&value.length>=4096&&/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(value))counts.set(value,(counts.get(value)||0)+1);else if(value&&typeof value==='object')Object.values(value).forEach(visit);};visit(command);
    const media=[...counts].filter(([,count])=>count>1).map(([value])=>value);if(!media.length||media.length>64)return command;
    const indexes=new Map(media.map((value,index)=>[value,index]));let references=0;
    const pack=value=>{if(typeof value==='string'&&indexes.has(value)){references++;return{__commandMedia:indexes.get(value)};}if(Array.isArray(value))return value.map(pack);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,pack(child)]));return value;};
    const packed=pack(command);return references<=256?{commandWireVersion:1,command:packed,media}:command;
  }
  function unpackCommand(value){
    if(value?.commandWireVersion!==1)return value;
    if(!value.command||!Array.isArray(value.media)||value.media.length>64)throw Error('INVALID_RECOVERY_RECORD');
    const expand=child=>{if(child&&typeof child==='object'&&!Array.isArray(child)&&Object.hasOwn(child,'__commandMedia')){const index=child.__commandMedia;if(Object.keys(child).length!==1||!Number.isInteger(index)||typeof value.media[index]!=='string')throw Error('INVALID_RECOVERY_RECORD');return value.media[index];}if(Array.isArray(child))return child.map(expand);if(child&&typeof child==='object')return Object.fromEntries(Object.entries(child).map(([key,item])=>[key,expand(item)]));return child;};return expand(value.command);
  }
  window.sharedDraftAccountState=()=>{const own=[...clients].filter(c=>!window.ProcessSync||c.actorId===window.ProcessSync.identity?.id);return{queued:own.reduce((n,c)=>n+c.queued(),0),unknown:own.some(c=>c.unknown()),failed:own.some(c=>c.failed())};};
  // oxlint-disable-next-line typescript/no-deprecated -- Required compatibility signal for Chromium's unsynchronized-work exit warning.
  window.addEventListener?.('beforeunload',event=>{const pending=window.sharedDraftAccountState();if(pending.queued||pending.unknown||pending.failed){event.preventDefault();event.returnValue='Thao tác chưa được xác nhận / 操作尚未確認';}});
  const scrollLocks=new Set();let previousOverflow='';
  function lockScroll(overlay){if(!scrollLocks.size){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}scrollLocks.add(overlay);}
  function unlockScroll(overlay){scrollLocks.delete(overlay);if(!scrollLocks.size)document.body.style.overflow=previousOverflow;}
  // Authoring contains nested workspaces, unlike the flat quality collections.
  // Compare actual operations so historic images stay visible, not buried in JSON.
  function historyCollections(content){
    if(content?.bom && !Array.isArray(content.bom))return Object.fromEntries(Object.entries(content.bom).map(([root,rows])=>["BOM · "+root,rows]));
    const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
    if(record(content?.scopes)&&record(content?.bases)&&Object.keys(content).every(key=>['scopes','bases'].includes(key))){
      const scopes=Object.keys(content.scopes);
      if(scopes.length===Object.keys(content.bases).length&&scopes.every(key=>Object.hasOwn(content.bases,key)&&(content.bases[key]===null||typeof content.bases[key]==='string')&&record(content.scopes[key])&&['errors','items'].every(kind=>Array.isArray(content.scopes[key][kind])&&content.scopes[key][kind].every(record)))){
        const collections={};
        for(const key of scopes){
          const prefix=kind=>JSON.stringify(['IPQC',key,kind]);
          collections[prefix('bases')]=[{id:'scope-base',scope:key,baseVersionId:content.bases[key]}];
          collections[prefix('errors')]=content.scopes[key].errors;
          collections[prefix('items')]=content.scopes[key].items;
        }
        return collections;
      }
    }
    if(!Array.isArray(content?.workspaces))return content||{};
    const collections={workspaces:content.workspaces.map(({stages:_stages,...metadata})=>metadata)};
    for(const workspace of content.workspaces)for(const [stage,rows]of Object.entries(workspace.stages||{}))collections[JSON.stringify([workspace.category,workspace.line,stage])]=rows;
    return collections;
  }
  const historyRowKey=(row,index)=>row.id||row.code||(row.line&&row.name?JSON.stringify([row.line,row.name]):'legacy-row:'+index);
  const permissionKeys={'approval.submit':'edit','approval.withdraw':'withdraw','approval.approve':'approve','approval.reject':'return','approval.compare':'history','master.delete':'delete'};
  window.sharedDraftPermissionAllowed=(client,key)=>client?.permission(permissionKeys[key]||key)!==false;
  // Canvas-only, runtime-private authority. This is not a permissions cache or
  // a GET admission: an ACK successor retains its original GET permission lineage.
  const canvasAuthorityClients=new WeakMap(),canvasAuthoritySources=new WeakMap();
  const canvasSame=(a,b)=>a===b||!!a&&!!b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>Object.hasOwn(b,key)&&canvasSame(a[key],b[key]));
  const canvasFreeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))canvasFreeze(child);Object.freeze(value);}return value;};
  // Optional Canvas proof snapshots only: retain immutable strings, detach every
  // JSON container. Never freeze the caller or invoke accessors/toJSON. Non-JSON
  // shapes lose this optimization, not dispatch; only exact path selectors may alias.
  const canvasJSONShapes=new WeakMap(),canvasObjectSource=Function.prototype.toString.call(Object),canvasArraySource=Function.prototype.toString.call(Array);
  function canvasJSONShape(value){
    const array=Array.isArray(value),prototype=Object.getPrototypeOf(value),constructor=prototype&&Object.getOwnPropertyDescriptor(prototype,'constructor')?.value;
    if(typeof constructor!=='function'||constructor.prototype!==prototype||Function.prototype.toString.call(constructor)!==(array?canvasArraySource:canvasObjectSource)||'toJSON' in value)throw Error('CANVAS_JSON_SHAPE_UNSUPPORTED');
    const keys=Reflect.ownKeys(value);
    if(array&&(keys.length!==value.length+1||keys.at(-1)!=='length'))throw Error('CANVAS_JSON_SHAPE_UNSUPPORTED');
    const entries=[];
    for(let i=0;i<keys.length;i++){
      const key=keys[i];if(array&&key==='length')continue;
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(typeof key!=='string'||array&&key!==String(i)||!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))throw Error('CANVAS_JSON_SHAPE_UNSUPPORTED');
      entries.push([key,descriptor.value]);
    }
    return {array,prototype,entries};
  }
  function canvasJSONSelector(shape,path,parent){
    // Journal.freeze shares selector objects between distinct patch/guard paths.
    // Do not generalize this exception to path arrays or other JSON aliases.
    return !shape.array&&shape.entries.length===1&&shape.entries[0][0]==='id'&&typeof shape.entries[0][1]==='string'&&!!shape.entries[0][1]&&path.length===4&&['patches','guards'].includes(path[0])&&/^(0|[1-9][0-9]*)$/.test(path[1])&&path[2]==='path'&&['1','4'].includes(path[3])&&parent?.array&&parent.entries[0]?.[1]==='workspaces'&&parent.entries[2]?.[1]==='stages'&&typeof parent.entries[3]?.[1]==='string'&&!!parent.entries[3][1];
  }
  function canvasJSONCopy(value,selectors=false){
    const seen=new WeakMap();
    const visit=(value,depth=0,path=[],parent=null)=>{
      if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
      if(typeof value!=='object'||depth>200)throw Error('CANVAS_JSON_SHAPE_UNSUPPORTED');
      const shape=canvasJSONShape(value),selector=selectors&&canvasJSONSelector(shape,path,parent);
      if(seen.has(value)&&(!seen.get(value)||!selector))throw Error('CANVAS_JSON_SHAPE_UNSUPPORTED');
      seen.set(value,selector);const copy=shape.array?[]:{};
      for(const [key,child]of shape.entries)Object.defineProperty(copy,key,{value:visit(child,depth+1,[...path,key],shape),enumerable:true,writable:false,configurable:false});
      canvasJSONShapes.set(copy,{prototype:shape.prototype,keys:shape.entries.map(([key])=>key),selectors});return Object.freeze(copy);
    };
    return visit(value);
  }
  function canvasJSONMatches(value,snapshot,exactPrototype=true){
    const seen=new WeakMap(),selectors=canvasJSONShapes.get(snapshot)?.selectors;
    const visit=(value,snapshot,depth=0,path=[],parent=null)=>{
      if(snapshot===null||typeof snapshot!=='object')return Object.is(value,snapshot);
      if(!value||typeof value!=='object'||depth>200)return false;
      const shape=canvasJSONShape(value),selector=selectors&&canvasJSONSelector(shape,path,parent),original=canvasJSONShapes.get(snapshot);
      if(seen.has(value)&&(!seen.get(value)||!selector))return false;
      seen.set(value,selector);
      if(!original||shape.array!==Array.isArray(snapshot)||exactPrototype&&shape.prototype!==original.prototype||shape.entries.length!==original.keys.length)return false;
      return shape.entries.every(([key,child],index)=>key===original.keys[index]&&visit(child,snapshot[key],depth+1,[...path,key],shape));
    };
    return visit(value,snapshot);
  }
  const canvasOwner=()=>({...departureOwner(),delivery:window.ProcessSync?.captureDelivery?.()});
  const canvasOwnerCurrent=pin=>departureOwnerCurrent(pin)&&Number.isSafeInteger(pin.epoch)&&pin.epoch>=0&&pin.identity===window.ProcessSync?.identity&&(!pin.delivery||window.ProcessSync?.isCurrentDelivery?.(pin.delivery)!==false);
  const canvasFull=control=>{const f=control?.workflow;return f?.scope==='process:platform'&&typeof f.generation==='string'&&!!f.generation&&Number.isSafeInteger(f.revision)&&f.revision>=0&&Array.isArray(f.working?.workspaces)&&Array.isArray(f.active?.content?.workspaces)&&(f.saved===null||typeof f.saved?.id==='string'&&Array.isArray(f.saved.content?.workspaces))&&Array.isArray(control.versions)&&control.versions.length>0&&control.versions.every(v=>typeof v.id==='string'&&Array.isArray(v.snapshot?.workspaces))&&(f.active.id===null||typeof f.active.id==='string'&&!!f.active.id)&&control.activeVersionId===f.active.id&&(f.active.id===null||control.versions.some(v=>v.id===f.active.id&&v.status==='approved'));};
  window.SharedDraftCanvasAuthority=Object.freeze({
    capture:(client,source,model)=>canvasAuthorityClients.get(client)?.capture?.(source,model)||null,
    arm:(client,command,anchor)=>canvasAuthorityClients.get(client)?.arm?.(command,anchor)||null,
    verify:(client,result,command,token,model)=>canvasAuthorityClients.get(client)?.verify?.(result,command,token,model)||null,
    accept:(primary,client,result,command,token,model)=>canvasAuthorityClients.get(primary)?.accept?.(client,result,command,token,model)||null
  });
  window.createSharedDraftClient = ({endpoint,actorId,headers,legacyArchive=false,permissionGates,conditionalState=false,guardAccessResults=false,responseProjection,externalDurableCanvas,externalDurableBounded,abCreateRejections}) => {
    // Only the existing relative authoring route gets longer command tolerance.
    // Other commands retain 15s; GET/Begin remain bounded at 45s. This is not proof of
    // commit: unknown-result receipt validation and retry admission stay intact.
    const mutationDeadline=/^\/api\/process-authoring\/workflow(?:\?|$)/.test(endpoint)?45000:15000;
    // Canvas alone may delegate durable intent to its claimed recovery store.
    // The synchronous proof is rechecked immediately before fetch, after queueing.
    // Never import, rewrite or erase the generic session command in this mode.
    const externalCanvas=externalDurableCanvas!==undefined,externalBounded=externalDurableBounded!==undefined,externalStrict=externalCanvas||externalBounded,externalProof=externalDurableCanvas?.assertDispatch,externalUnsent=new WeakSet();
    const abCreate=abCreateRejections===true;
    if(abCreateRejections!==undefined){const [path,search='']=endpoint.split('?'),params=new URLSearchParams(search),scope=params.get('scope');if(!abCreate||externalStrict||path!=='/api/ipqc-ab/workflow'||params.getAll('scope').length!==1||!/^[AB]:\S.*$/.test(scope||'')||scope!==scope.trim()||params.getAll('caseMetadata').length!==1||params.get('caseMetadata')!=='1'||endpoint!==`/api/ipqc-ab/workflow?scope=${encodeURIComponent(scope)}&caseMetadata=1`)throw Error('AB_CREATE_SCOPE_REQUIRED');}
    const boundedScopes={PROCESS:'master:PROCESS',FQC:'fqc',IQC:'iqc','IPQC-C':'ipqc-c',BOM:'bom'},boundedScope=Object.hasOwn(boundedScopes,externalDurableBounded?.scope)?boundedScopes[externalDurableBounded.scope]:null;
    const boundedExactRoute=['iqc','ipqc-c','bom'].includes(boundedScope);
    if(externalBounded){const [path,query='']=endpoint.split('?'),params=new URLSearchParams(query);if(externalCanvas||!boundedScope||boundedScope==='master:PROCESS'&&(path!=='/api/master/workflow'||params.getAll('scope').length!==1||params.get('scope')!=='PROCESS')||boundedScope==='fqc'&&path!=='/api/fqc/workflow'||boundedExactRoute&&(path!=='/api/'+boundedScope+'/workflow'||params.getAll('caseMetadata').length!==1)||[...params].some(([key,value])=>key!=='scope'&&!(key==='caseMetadata'&&value==='1'))||boundedScope!=='master:PROCESS'&&params.has('scope'))throw Error('BOUNDED_EXTERNAL_SCOPE_REQUIRED');}
    if(externalCanvas){const [path,query='']=endpoint.split('?'),channels=new URLSearchParams(query).getAll('channel');if(path!=='/api/process-authoring/workflow'||channels.length!==1||!['canvas','canvas-v2'].includes(channels[0])||typeof externalProof!=='function')throw Error('CANVAS_EXTERNAL_DURABILITY_REQUIRED');}
    let externalActive=true;
    const externalOwner=externalStrict?{...departureOwner(),delivery:window.ProcessSync?.captureDelivery?.()}:null;
    const externalCurrent=()=>!externalStrict||externalActive&&departureOwnerCurrent(externalOwner)&&Number.isSafeInteger(externalOwner.epoch)&&externalOwner.epoch>=0&&externalOwner.identity===window.ProcessSync?.identity&&(!externalOwner.delivery||window.ProcessSync?.isCurrentDelivery?.(externalOwner.delivery)!==false);
    // A proof callback belongs to one runtime/owner, never the generic cache or
    // another Canvas instance created after identity/delivery invalidation.
    const transportKey=actorId+':'+endpoint+(externalCanvas?':external-canvas:'+crypto.randomUUID():externalBounded?':external-bounded':abCreate?':ab-create':''),sessionScope=departureScope(endpoint);
    window.SharedDraftDeparture.register(sessionScope);
    if(transports.has(transportKey)&&(!externalBounded||transports.get(transportKey).isRuntimeCurrent())&&(!abCreate||transports.get(transportKey).isCreateRuntimeCurrent())){const cached=transports.get(transportKey);if(guardAccessResults)cached.useAccessResultGuard();if(permissionGates)cached.setPermissionGates(permissionGates);if(conditionalState)cached.useStateRevision();return legacyArchive?cached.withLegacyArchive():cached;}
    const boundedPredecessor=externalBounded?transports.get(transportKey):null;
    if(externalBounded)window.addEventListener?.('pagehide',()=>{externalActive=false;});
    let boundedProjectionRetired=false;
    let access=null,gates=permissionGates,permissionNotice=null,validation=null;
    // Opt-in UI access projection only; never order or alter command/receipt results.
    let accessGuard=guardAccessResults,accessEpoch=0,accessIssued=0,accessObserved=0,accessFence=0,accessRevision=-1;
    const captureAccess=options=>{const sync=window.ProcessSync;return {sequence:++accessIssued,epoch:accessEpoch,identity:sync?.identity,identityEpoch:accessGuard?sync?.identityGeneration?.():undefined,isCurrent:options?.isCurrent};};
    const ownsAccess=owner=>{const sync=window.ProcessSync;return owner.epoch===accessEpoch&&(!sync||(!sync.requiresReload&&sync.identity?.id===actorId&&sync.identity===owner.identity&&(typeof owner.identityEpoch!=='number'||owner.identityEpoch===sync.identityGeneration?.())))&&(!owner.delivery||sync?.isCurrentDelivery?.(owner.delivery)!==false)&&(!owner.isCurrent||owner.isCurrent());};
    // Only the existing complete nine-boolean snapshot shape supplies defaults for new explicit cells.
    // Partial permissions retain their original merge/replacement semantics.
    const completeAccessSnapshot=permissions=>['view','edit','save','submit','withdraw','approve','return','history','delete'].every(key=>typeof permissions?.[key]==='boolean')?{...permissions,create:permissions.create===true,restore:permissions.restore===true}:permissions;
    function projectAccess(result,status,ok,owner){
      if(!ownsAccess(owner))return false;
      const denied=[401,403].includes(status),next=denied?Object.fromEntries(['view','edit','save','submit','withdraw','approve','return','history','delete','create','restore'].map(key=>[key,false])):ok&&completeAccessSnapshot(result.permissions);
      if(!next)return true;
      const revision=Number.isSafeInteger(result.revision)?result.revision:null;
      const restricted=owner.sequence<=accessFence||owner.sequence<accessObserved||(revision!==null&&revision<accessRevision);
      const previous=access;
      // Unversioned denial is never dismissed using client start order. An older
      // success can tighten gates, but cannot grant over a newer observation.
      access=denied?next:!restricted?{...access,...next}:{...access,...Object.fromEntries(Object.entries(next).filter(([,allowed])=>allowed===false))};
      const revoked=previous&&Object.keys(access).some(key=>previous[key]===true&&access[key]===false);
      accessObserved=Math.max(accessObserved,owner.sequence);
      if(revision!==null)accessRevision=Math.max(accessRevision,revision);
      if(denied||revoked)accessFence=accessIssued;
      gateControls(denied||revoked);
      return !restricted;
    }
    const gateControls=(revoked=false)=>{if(!access||!gates)return;let changedElement=null;for(const [permission,selector]of Object.entries(gates))if(access[permission]===false)document.querySelectorAll?.(selector).forEach(element=>{if(!element.disabled)changedElement=element;element.disabled=true;element.setAttribute('aria-disabled','true');});if(revoked&&changedElement&&!permissionNotice?.isConnected){const root=changedElement.closest('#data-content,#fixture')||document.querySelector('#data-content');if(root){permissionNotice=document.createElement('p');permissionNotice.className='master-edit-note';permissionNotice.setAttribute('role','alert');permissionNotice.textContent=document.documentElement.lang==='vi'?'Quyền thao tác đã thay đổi; giữ đầu vào hiện tại. Tải lại và kiểm tra quyền trước khi tiếp tục.':'操作權限已變更；保留目前輸入，請重新載入核對權限後繼續。';root.prepend(permissionNotice);}}};
    const clientId=crypto.randomUUID(),syncFailures=new Map(),preparedFlights=new Map();let sequence=0,tail=Promise.resolve(),unknown=null,queued=0,beginPending=null,retryPending=null,recoveryInvalid=false,conditionalRead=null,unknownOwner=null;
    const assertOwner=()=>{if(window.ProcessSync&&window.ProcessSync.identity?.id!==actorId)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');if(!externalCurrent())throw Error(externalCanvas?'CANVAS_TRANSPORT_OWNER_CHANGED':'BOUNDED_TRANSPORT_OWNER_CHANGED');if(recoveryInvalid)throw Error('RECOVERY_RECORD_INVALID');};
    // New mutation admission only; late authoritative ACK/receipt bookkeeping stays unchanged.
    const assertMutationAdmission=()=>{assertOwner();if(window.ProcessSync?.requiresReload)throw Error('DELIVERY_INVALIDATED_REOPEN_REQUIRED');};
    clients.add({actorId,queued:()=>queued,unknown:()=>!boundedProjectionRetired&&(!!unknown||recoveryInvalid),failed:()=>!boundedProjectionRetired&&!!syncFailures.size});
    const query=value=>endpoint+(endpoint.includes('?')?'&':'?')+value;
    const key=`shared-draft-v3-operation:${actorId}:${endpoint}`;
    if(!externalStrict)try { unknown=unpackCommand(JSON.parse(sessionStorage.getItem(key)||'null'));if(unknown)unknownOwner=departureOwner(); } catch { recoveryInvalid=true; /* Retain the corrupt record and block writes; never erase an uncertain operation. */ }
    // AB create alone: live, privately issued commands can prove a fixed-code
    // original POST refusal. Historical commands and public Error flags cannot.
    const abCommands=new WeakMap(),abSelected=new Map(),abResponses=new WeakMap(),abFetchFailures=new WeakMap();let abActive=true;
    if(abCreate)window.addEventListener?.('pagehide',()=>{abActive=false;});
    const abCurrent=entry=>{const sync=window.ProcessSync,owner=entry?.owner;return abActive&&!!owner&&owner.identity===sync?.identity&&owner.id===actorId&&owner.id===sync?.identity?.id&&Number.isSafeInteger(owner.epoch)&&owner.epoch>=0&&owner.epoch===sync?.identityGeneration?.()&&!sync.requiresReload&&owner.delivery!==undefined&&owner.delivery!==null&&typeof sync.isCurrentDelivery==='function'&&sync.isCurrentDelivery(owner.delivery)===true;};
    function abAssert(entry,command){if(!entry||!abCurrent(entry)||entry.raw!==JSON.stringify(command))throw Error('AB_CREATE_OWNER_OR_COMMAND_CHANGED');}
    function abResponse(error,command,result){const entry=abSelected.get(command?.operationId);if(!entry||!abCurrent(entry)||entry.raw!==JSON.stringify(command)||!entry.flight||typeof result.error!=='string'||result.error!==error.message)return;
      const code=error.message,status=error.status,requestId=error.requestId,action=command.moduleAction;
      if(typeof requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))return;
      const allowed=action==='create-error'?status===422&&code==='STAGE_INVALID':action==='create-item'&&(status===409&&code==='ERROR_REMOVED'||status===422&&['INVALID_EQUIPMENT_PAIR','EQUIPMENT_REQUIRED','EQUIPMENT_UNAVAILABLE','PHOTO_NOT_UPLOADED'].includes(code));
      if(allowed)abResponses.set(error,{entry,code,status,requestId,flight:entry.flight});
    }
    function abMarker(entry,command){abAssert(entry,command);const owns=()=>unknown?.operationId===command.operationId&&JSON.stringify(unknown)===entry.raw&&!!entry.markerRaw;if(!owns())throw Error('RECOVERY_RECORD_CHANGED');const stored=sessionStorage.getItem(key);abAssert(entry,command);if(!owns()||stored!==entry.markerRaw&&!(entry.removeAttempted&&stored===null))throw Error('RECOVERY_RECORD_CHANGED');return stored;}
    function abClear(entry,command){const stored=abMarker(entry,command);if(stored!==null){entry.removeAttempted=true;sessionStorage.removeItem(key);}if(abMarker(entry,command)!==null)throw Error('RECOVERY_REMOVE_NOT_VERIFIED');unknown=null;unknownOwner=null;syncFailures.delete(command.operationId);entry.consumed=true;abSelected.delete(command.operationId);}
    async function abRecover(entry,command,owner){abMarker(entry,command);const result=confirmedReceipt(await request(query(`operationId=${encodeURIComponent(command.operationId)}`)),command.operationId,command.generation,command.action);abClear(entry,command);window.SharedDraftDeparture.confirmed(sessionScope,command,result,owner);return {...result,recovered:true};}
    function abFinalize(command,error,flight){const entry=abCommands.get(command),proof=abResponses.get(error);abAssert(entry,command);
      if(entry.consumed||!proof||proof.entry!==entry||proof.flight!==flight||entry.flight!==flight||!flight||error.message!==proof.code||error.status!==proof.status||error.requestId!==proof.requestId||unknown?.operationId!==command.operationId||JSON.stringify(unknown)!==entry.raw||!entry.markerRaw)throw Error('AB_CREATE_REJECTION_PROOF_REQUIRED');
      const failure=syncFailures.get(command.operationId);if(!failure||failure.error!==error||JSON.stringify(failure.command)!==entry.raw)throw Error('AB_CREATE_REJECTION_PROOF_REQUIRED');
      abClear(entry,command);return true;
    }
    const boundedPrefix='shared-draft-receipt-only-v1:',boundedSentinel='receipt-only-v1',boundedSelected=new Map(),boundedSelectedObjects=new WeakMap(),boundedCapabilities=new Map(),boundedProofs=new Map(),boundedResponses=new WeakMap(),boundedRejected=new WeakSet(),boundedReadbacks=new WeakMap(),boundedPostAuthorities=new WeakMap();
    let boundedRecord=null,boundedKnown=null,boundedKnownVersion=0,boundedLegacy=false,boundedDiscovered=[];
    const canvasPrimary=endpoint==='/api/process-authoring/workflow?caseMetadata=1'&&!externalStrict;
    const canvasTarget=externalCanvas&&endpoint==='/api/process-authoring/workflow?caseMetadata=1&channel=canvas-v2';
    const canvasObserving=canvasPrimary||canvasTarget;
    let canvasObservation=0,canvasRequests=0,canvasBasis=null;
    const canvasOriginalReads=new WeakMap(),canvasCommands=new WeakMap(),canvasArms=new Map(),canvasPosts=new WeakMap();
    function canvasBasisCurrent(basis){return !!basis&&basis===canvasBasis&&basis.accessEpoch===accessEpoch&&canvasOwnerCurrent(basis.owner)&&canvasSame(access,basis.permissions)&&canvasSame(basis.response.control,basis.control)&&basis.response.revision===basis.globalRevision;}
    function canvasCapture(source,model){
      try{const basis=canvasOriginalReads.get(source)||canvasAuthoritySources.get(source);if(!canvasPrimary||canvasRequests||!canvasBasisCurrent(basis)||model!==basis.response.control&&!canvasSame(model,basis.control))return null;
        const token=Object.freeze({}),pin={basis,observation:canvasObservation,current:()=>canvasRequests===0&&canvasObservation===pin.observation&&canvasBasisCurrent(basis)};canvasAuthoritySources.set(token,{producer:client,pin});return token;
      }catch{return null;}
    }
    function canvasArm(command,anchor){
      try{const origin=canvasAuthoritySources.get(anchor),pin=origin?.pin,snapshot=canvasCommands.get(command);
        if(!snapshot||!canvasJSONMatches(command,snapshot))return null;const selected=JSON.parse(snapshot.source.slice('canvas-v2:'.length));
        if(!canvasTarget||canvasRequests||!externalCurrent()||!pin?.current()||command.action!=='apply'||!command.source.startsWith('canvas-v2:')||command.generation!==pin.basis.control.workflow.generation||!Array.isArray(selected)||selected.length!==2||selected.some(v=>typeof v!=='string'||!v)||!command.patches?.length||canvasArms.has(command.operationId))return null;
        const token=Object.freeze({}),arm={token,origin,command,snapshot,observation:canvasObservation+1,accessEpoch,used:false};// One Canvas client admits only one live batch; do not retain abandoned commands.
        canvasArms.clear();canvasArms.set(command.operationId,arm);return token;
      }catch{return null;}
    }
    function canvasVerify(result,command,token,model){
      try{const proof=canvasPosts.get(result),arm=proof?.arm;
        if(!canvasTarget||!externalCurrent()||canvasRequests||!proof||arm.token!==token||arm.command!==command||!canvasJSONMatches(command,arm.snapshot)||canvasObservation!==arm.observation||accessEpoch!==arm.accessEpoch||Object.hasOwn(result,'permissions')||!arm.origin.pin.current()||model!==arm.origin.pin.basis.response.control&&!canvasSame(model,arm.origin.pin.basis.control)||result.control!==proof.control||result.revision!==proof.globalRevision||result.receipt!==proof.receipt||result.requestId!==proof.requestId||result.unchanged===true)return null;
        return {response:result,priorPermissions:arm.origin.pin.basis.permissions};
      }catch{return null;}
    }
    function canvasAccept(target,result,command,token,model){
      const checked=canvasAuthorityClients.get(target)?.verify?.(result,command,token,model),proof=checked&&canvasAuthorityClients.get(target)?.proof?.(result);
      if(!canvasPrimary||!proof||proof.arm.origin.producer!==client||!checked)return null;
      const previous=proof.arm.origin.pin.basis,source=Object.freeze({});
      // Consume the previous flight: successors retain one snapshot and an opaque
      // GET lineage, never a linked list of earlier commands/media/models.
      canvasAuthorityClients.get(target).consume(result);
      canvasBasis={owner:previous.owner,permissions:previous.permissions,accessEpoch,control:result.control,response:result,globalRevision:result.revision,lineage:previous.lineage};
      canvasAuthoritySources.set(source,canvasBasis);return source;
    }
    function canvasObserveResponse(result,body,ok,observation,owner,kind){
      if(!canvasPrimary)return;
      if(!ok||!canvasOwnerCurrent(owner)){canvasBasis=null;return;}
      if(body)return;
      if(result.permissions&&canvasBasis&&!canvasSame(result.permissions,canvasBasis.permissions)||result.permissions&&Number.isSafeInteger(result.revision)&&canvasBasis&&result.revision!==canvasBasis.globalRevision)canvasBasis=null;
      if(kind!=='state'||observation!==canvasObservation||result.unchanged||!canvasFull(result.control)||result.permissions?.view!==true||result.permissions.edit!==true||!Number.isSafeInteger(result.revision)||result.revision<0||!['view','edit','save','submit','withdraw','approve','return','history'].every(key=>typeof result.permissions[key]==='boolean'))return;
      // A private snapshot detects mutation of the publicly adopted GET object;
      // no JSON/media serialization, storage or per-input work is introduced.
      const basis={owner,accessEpoch,permissions:canvasFreeze(structuredClone(result.permissions)),control:canvasFreeze(structuredClone(result.control)),response:result,globalRevision:result.revision,lineage:Object.freeze({})};
      canvasBasis=basis;canvasOriginalReads.set(result,basis);
    }
    function canvasObservePost(result,body,observation){
      const command=body?.command,arm=command&&canvasArms.get(command.operationId);
      if(!canvasTarget||!arm||arm.used)return;
      arm.used=true;canvasArms.delete(command.operationId);
      const f=result.control?.workflow,r=result.receipt,base=arm.origin.pin.basis.control.workflow;
      if(observation!==arm.observation||canvasObservation!==observation||!externalCurrent()||!arm.origin.pin.current()||!canvasJSONMatches(command,arm.snapshot,false)||result.unchanged===true||Object.hasOwn(result,'permissions')||!canvasFull(result.control)||!Number.isSafeInteger(result.revision)||result.revision<=arm.origin.pin.basis.globalRevision||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.requestId||'')||r?.operationId!==command.operationId||r.unchanged!==false||r.generation!==command.generation||f.generation!==command.generation||f.revision!==r.revision||f.revision<=base.revision||f.pendingId!==null||r.caseId!==null||f.active.id!==base.active.id||(f.saved?.id??null)!==(base.saved?.id??null)||r.savedId!==(f.saved?.id??null)||!result.control.versions.some(v=>v.status==='draft'&&canvasSame(v.snapshot,f.working)))return;
      canvasFreeze(result.control);canvasFreeze(result.receipt);canvasPosts.set(result,{arm,control:result.control,receipt:result.receipt,globalRevision:result.revision,requestId:result.requestId});
    }

    const boundedText=value=>typeof value==='string'&&value.length>0&&value.length<=512;
    const boundedInteger=value=>Number.isSafeInteger(value)&&value>=0;
    function boundedParse(storageKey){
      if(!storageKey?.startsWith(boundedPrefix))return null;
      let a;try{a=JSON.parse(storageKey.slice(boundedPrefix.length));}catch{throw Error('RECOVERY_RECORD_INVALID');}
      if(!Array.isArray(a)||a[0]!==actorId||a[1]!==endpoint)return null;
      if(a.length!==15||a[2]!==location.origin||a[3]!==location.pathname||!boundedText(a[4])||!boundedInteger(a[5])||!boundedText(a[6])||!['apply','save','submit','withdraw','approve','return','restore'].includes(a[7])||!boundedText(a[8])||!boundedInteger(a[9])||![a[10],a[11],a[12],a[14]].every(value=>value===null||boundedText(value))||!(a[13]===null||boundedInteger(a[13])))throw Error('RECOVERY_RECORD_INVALID');
      if(a[7]==='submit'&&(!a[12]||a[13]===null)||['withdraw','approve','return'].includes(a[7])&&!a[11]||a[7]==='restore'&&(!a[14]||a[13]===null))throw Error('RECOVERY_RECORD_INVALID');
      return{key:storageKey,actorId:a[0],endpoint:a[1],runtime:a[4],epoch:a[5],operationId:a[6],action:a[7],generation:a[8],beforeRevision:a[9],baseSavedId:a[10],caseId:a[11],savedId:a[12],expectedRevision:a[13],restoreSaveId:a[14],historical:true};
    }
    function boundedDiscover(){
      const found=[];if(!Number.isSafeInteger(sessionStorage.length)||sessionStorage.length>1024)throw Error('RECOVERY_STORAGE_UNAVAILABLE');
      for(let i=0;i<sessionStorage.length;i++){const storageKey=sessionStorage.key(i);if(storageKey===key)boundedLegacy=true;const item=boundedParse(storageKey);if(item)found.push(item);if(found.length>32)throw Error('RECOVERY_RECORD_LIMIT');}
      return found;
    }
    if(externalBounded)try{boundedDiscovered=boundedDiscover();boundedRecord=boundedDiscovered[0]||null;if(boundedRecord){unknown={operationId:boundedRecord.operationId,generation:boundedRecord.generation,action:boundedRecord.action};unknownOwner=externalOwner;}}catch{recoveryInvalid=true;}
    function boundedFlow(result){
      // IPQC-C's existing GET is deliberately top-level; its POST retains the
      // full-control / cSaveProjection shapes. Never manufacture caller control.
      if(boundedScope==='ipqc-c'&&result?.workflow){
        const other=result.control?.workflow,flow=result.workflow;
        if(other&&(other.scope!==flow.scope||other.generation!==flow.generation||other.revision!==flow.revision))throw Error('BOUNDED_READBACK_REQUIRED');
        return flow;
      }
      return result?.control?.workflow;
    }
    function verifiedBoundedReadback(result,operationId){
      try{const proof=boundedReadbacks.get(result),flow=proof&&boundedFlow(proof.readback);
        if(!externalBounded||!externalCurrent()||!proof||operationId!==proof.operationId||JSON.stringify(result.receipt)!==proof.receiptRaw||!flow||flow.scope!==boundedScope||flow.generation!==proof.generation||flow.revision!==proof.revision||flow.generation!==boundedKnown?.generation||flow.revision<boundedKnown.revision||access?.view!==true||Object.entries(proof.readback.permissions||{}).some(([key,value])=>value===true&&access?.[key]===false))return null;
        return proof.readback;
      }catch{return null;}
    }
    function freezeBomAuthority(value){
      if(!value||typeof value!=='object'||Object.isFrozen(value))return;
      for(const child of Object.values(value))freezeBomAuthority(child);
      Object.freeze(value);
    }
    function bomPostPin(command){
      if(boundedScope!=='bom'||command?.action!=='apply'||!boundedSelected.has(command.operationId)||!access||access.view!==true||access.edit!==true||!['view','edit','save','submit','withdraw','approve','return','history','import'].every(key=>typeof access[key]==='boolean')||!Number.isSafeInteger(conditionalRead?.revision))return null;
      return{commandRaw:JSON.stringify(command),operationId:command.operationId,access,accessEpoch,accessObserved,accessFence,accessRevision,modelVersion:boundedKnownVersion,globalRevision:conditionalRead.revision,record:boundedRecord};
    }
    function bomPostPinCurrent(pin){return !!pin&&externalCurrent()&&pin.access===access&&pin.accessEpoch===accessEpoch&&pin.accessObserved===accessObserved&&pin.accessFence===accessFence&&pin.accessRevision===accessRevision&&access?.view===true&&access?.edit===true;}
    function verifiedBomApplyAuthority(result,operationId){
      try{const proof=boundedPostAuthorities.get(result),flow=result?.control?.workflow;
        if(boundedScope!=='bom'||!proof||operationId!==proof.operationId||!bomPostPinCurrent(proof)||JSON.stringify(result.receipt)!==proof.receiptRaw||result.control!==proof.control||result.revision!==proof.globalRevision||!flow||flow.scope!=='bom'||flow.generation!==proof.generation||flow.revision!==proof.revision||boundedKnownVersion!==proof.modelVersion||boundedKnown?.generation!==flow.generation||boundedKnown.revision!==flow.revision)return null;
        // These are the unchanged, earlier GET permissions, not fabricated POST
        // permissions. The kernel separately checks view+edit for this Apply.
        return{response:result,priorPermissions:{...proof.access}};
      }catch{return null;}
    }
    function boundedObserve(result,pin){
      const flow=boundedFlow(result);if(!externalBounded||!flow)return;
      if(flow.scope!==boundedScope||!boundedText(flow.generation)||!boundedInteger(flow.revision))throw Error('BOUNDED_READBACK_REQUIRED');
      if(boundedKnown&&(flow.revision<boundedKnown.revision||flow.generation!==boundedKnown.generation&&pin!==boundedKnownVersion))throw Error('BOUNDED_READ_SUPERSEDED');
      boundedKnown={scope:flow.scope,generation:flow.generation,revision:flow.revision,savedId:flow.saved?.id||null,pendingId:flow.pendingId||null};boundedKnownVersion++;
    }
    function boundedArm(command){
      if(!boundedKnown||boundedKnown.generation!==command.generation)throw Error('BOUNDED_READBACK_REQUIRED');
      const fields=[actorId,endpoint,location.origin,location.pathname,clientId,externalOwner.epoch,command.operationId,command.action,command.generation,boundedKnown.revision,boundedKnown.savedId,command.caseId||null,command.savedId||null,command.expectedRevision??null,command.restoreSaveId||null];
      const record=boundedParse(boundedPrefix+JSON.stringify(fields));if(!record)throw Error('RECOVERY_RECORD_INVALID');
      if(sessionStorage.getItem(record.key)!==null)throw Error('RECOVERY_RECORD_EXISTS');
      boundedRecord={...record,historical:false,owner:departureOwner(),command};unknown=command;unknownOwner=boundedRecord.owner;
      try{sessionStorage.setItem(record.key,boundedSentinel);if(sessionStorage.getItem(record.key)!==boundedSentinel)throw Error('RECOVERY_WRITE_NOT_VERIFIED');}
      catch(error){try{const stored=sessionStorage.getItem(record.key);if(stored===null){boundedRecord=null;unknown=null;unknownOwner=null;}else if(stored===boundedSentinel)boundedClear(boundedRecord);else recoveryInvalid=true;}catch{recoveryInvalid=true;}throw error;}
    }
    function boundedClear(record){
      assertOwner();if(!record||record!==boundedRecord)throw Error('RECOVERY_RECORD_CHANGED');
      if(sessionStorage.getItem(record.key)!==boundedSentinel)throw Error('RECOVERY_RECORD_CHANGED');
      sessionStorage.removeItem(record.key);if(sessionStorage.getItem(record.key)!==null)throw Error('RECOVERY_REMOVE_NOT_VERIFIED');
      boundedRecord=null;unknown=null;unknownOwner=null;
      let next;try{next=boundedDiscover()[0];}catch(error){recoveryInvalid=true;throw error;}if(next){boundedRecord=next;unknown={operationId:next.operationId,generation:next.generation,action:next.action};unknownOwner=externalOwner;}
    }
    function boundedRegisterRejection(error,command,flight){
      if(!boundedRecord||boundedRecord.operationId!==command.operationId||!externalCurrent())return;
      boundedRejected.add(error);boundedRecord.rejection=error;
      rejectionFlights.set(error,{clientId,raw:JSON.stringify(command),flight,current:externalCurrent});
    }
    function boundedRejection(error,command){
      const proof=boundedResponses.get(error),id=error.requestId,code=error.message,action=command.action;
      if(!proof||proof.record!==boundedRecord||proof.operationId!==command.operationId||proof.raw!==JSON.stringify(command)||!externalCurrent()||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id||''))return false;
      // Audited pre-CAS failures from versioned-shared-workflow + shared-draft.
      // Receipt GETs, proxy-shaped errors and OPERATION_ID_REUSED are excluded.
      if(error.status===409&&code==='DEPENDENCY_CHANGED_RECONFIRM')return action==='apply'&&Array.isArray(error.details?.path)&&command.guards?.some(guard=>JSON.stringify(guard.path)===JSON.stringify(error.details.path));
      // These ordinary-editor failures are thrown by the exact scoped adapter
      // before the shared-state CAS. They are not receipt errors or HTTP classes.
      if(action==='apply'&&Array.isArray(command.patches)&&command.patches.length){
        if(boundedScope==='master:PROCESS'&&error.status===409&&code==='PROCESS_MASTER_IN_USE')return true;
        if(boundedScope==='fqc'&&error.status===409&&code==='AB_EFFECTIVE_CHANGED_RECONFIRM')return !!command.input?.expectedAB&&typeof command.input.expectedAB==='object';
        if(boundedScope==='fqc'&&error.status===422&&code==='EQUIPMENT_UNAVAILABLE')return true;
      }
      // IQC/C route-adapter failures below are exact pre-CAS outcomes, never
      // generic 422s. Dynamic IQC diagnostic strings remain conservative unknown.
      if(action==='apply'&&['iqc','ipqc-c'].includes(boundedScope)){
        const patches=Array.isArray(command.patches)&&command.patches.length>0,moduleAction=command.moduleAction,input=command.input;
        const moduleIntent=boundedScope==='iqc'?['createError','createItem'].includes(moduleAction):['create-error','create-item','delete-error','delete-item'].includes(moduleAction);
        if(patches&&error.status===409&&code==='ENTITY_REMOVED_OR_AMBIGUOUS')return true;
        if((patches||moduleIntent)&&error.status===422&&code==='EQUIPMENT_UNAVAILABLE')return true;
        if(patches&&error.status===422&&['UNSUPPORTED_ITEM_PATCH','DEPENDENCY_GUARD_REQUIRED'].includes(code))return true;
        if(boundedScope==='iqc'){
          if(patches&&error.status===422&&['INVALID_COLLECTION','SERVER_NUMBER_REQUIRED','SOFT_DELETE_REQUIRED'].includes(code))return true;
          if((patches||moduleIntent)&&error.status===422&&['IQC 草稿格式錯誤','IQC 草稿缺少必要清單','IQC 資料 ID 重複或空白','IQC 原始編號或新增編號重複','既有 IQC 編號不可刪除或重編；請使用停用標記','IQC 資料欄位不完整','類別或供應商名稱不可空白或重複','IQC 停用標記格式錯誤','錯誤代碼找不到所屬零件或越文名稱空白'].includes(code))return true;
          if(error.status===409&&code==='PART_REMOVED'&&moduleAction==='createError'&&boundedText(input?.partCode))return true;
          if(error.status===409&&code==='ERROR_REMOVED'&&moduleAction==='createItem'&&boundedText(input?.errorId))return true;
        }else{
          if((patches||moduleIntent)&&error.status===422&&code==='INVALID_STRUCTURE')return true;
          if(error.status===422&&code==='PRODUCT_STAGE_REQUIRED'&&moduleAction==='create-error'&&input&&typeof input==='object')return true;
          if(error.status===409&&code==='ERROR_CODE_REMOVED'&&moduleAction==='create-item'&&boundedText(input?.errorId))return true;
          if(error.status===409&&code==='ENTITY_REMOVED_OR_AMBIGUOUS'&&['delete-error','delete-item'].includes(moduleAction)&&boundedText(input?.id))return true;
          if(error.status===409&&code==='CASCADE_CONFIRM_REQUIRED'&&moduleAction==='delete-error'&&boundedText(input?.id))return true;
        }
      }
      // BOM-only, original POST failures audited in bom-workflow/domain before
      // versioned-shared-workflow's state revision CAS. No status-class fallback.
      if(boundedScope==='bom'){
        const manual=action==='apply'&&!command.moduleAction&&Array.isArray(command.patches)&&command.patches.length>0;
        const importing=action==='apply'&&command.moduleAction==='import-digiwin'&&command.input&&typeof command.input==='object';
        const restoring=action==='restore'&&boundedText(command.restoreSaveId)&&boundedInteger(command.expectedRevision);
        if(manual&&error.status===422&&['BOM_MANUAL_STRUCTURE_FORBIDDEN','BOM_EDIT_FIELD_INVALID','DEPENDENCY_GUARD_REQUIRED','INVALID_PATCHES'].includes(code))return true;
        if(manual&&error.status===409&&code==='ENTITY_REMOVED_OR_AMBIGUOUS')return true;
        if(importing&&error.status===409&&['BOM_IMPORT_BASE_CHANGED','BOM_INITIALIZATION_ALREADY_STARTED'].includes(code))return true;
        if(importing&&error.status===422&&['BOM_IMPORT_REQUIRED','BOM_IMPORT_MODE_INVALID','BOM_IMPORT_DECISIONS_CHANGED','BOM_STRUCTURE_ERP_ONLY','BOM_DECISION_REQUIRED','BOM_NO_ERP_ROWS'].includes(code))return true;
        if((manual||importing||restoring)&&error.status===422&&['BOM_INVALID','BOM_ROOT_INVALID','BOM_LEVEL_INVALID','BOM_FIELDS_INVALID','BOM_DEEP_NUMERIC_FORBIDDEN','BOM_NUMBER_INVALID','BOM_IDENTITY_INVALID','BOM_PARENT_MISSING','Cấp / 層級格式無效'].includes(code))return true;
        // commandBody throws this exact code before parsing/dispatch/CAS; only
        // bound imports retain their audited path; manual Apply additionally proves
        // the exact serialized request exceeded the same UTF-8 byte threshold.
        if((importing||manual&&proof.manualBodyTooLarge===true)&&error.status===413&&code==='COMMAND_TOO_LARGE')return true;
      }
      if(error.status===409&&['STALE_GENERATION','STALE_CLIENT_OPERATION','PENDING_LOCKED','CONCURRENT_CHANGE_RETRY','BEGIN_REQUIRED'].includes(code))return true;
      if(error.status===409&&code==='DRAFT_REVISION_CHANGED_RECONFIRM'&&action!=='restore'&&boundedInteger(command.expectedRevision))return true;
      if(action==='restore'&&boundedText(command.restoreSaveId)&&boundedInteger(command.expectedRevision))return error.status===409&&code==='RESTORE_RECONFIRM'||error.status===404&&code==='SAVE_NOT_FOUND';
      if(action==='submit'&&boundedText(command.savedId)&&boundedInteger(command.expectedRevision))return error.status===422&&['REASON_REQUIRED','VALIDATION_FAILED','NO_SUBSTANTIVE_CHANGE'].includes(code)||error.status===409&&['DRAFT_REVISION_CHANGED_RECONFIRM','SUCCESSFUL_SAVE_REQUIRED','SAVED_VERSION_CHANGED_RECONFIRM','UNSAVED_CHANGES_SAVE_REQUIRED','ACTIVE_VERSION_CHANGED'].includes(code)||boundedScope==='master:PROCESS'&&error.status===409&&code==='PROCESS_MASTER_IN_USE';
      if(['approve','return','withdraw'].includes(action)&&boundedText(command.caseId))return error.status===409&&(code==='CASE_NOT_PENDING'||action!=='withdraw'&&code==='SELF_REVIEW_CONFIRM_REQUIRED'||action==='approve'&&code==='ACTIVE_VERSION_CHANGED')||error.status===422&&(action==='approve'?code==='VALIDATION_FAILED':code==='REASON_REQUIRED')||action==='approve'&&boundedScope==='master:PROCESS'&&error.status===409&&code==='PROCESS_MASTER_IN_USE';
      return false;
    }
    async function boundedTerminal(result,record,originalPost=false){
      assertOwner();if(record!==boundedRecord)throw Error('RECOVERY_RECORD_CHANGED');
      const receipt=result?.receipt,review=['withdraw','approve','return'].includes(record.action);
      confirmedReceipt(result,record.operationId,review?undefined:record.generation,record.action);
      if(receipt.revision<record.beforeRevision||!receipt.unchanged&&receipt.revision<=record.beforeRevision||review&&(receipt.unchanged||receipt.generation===record.generation||receipt.caseId!==null)||record.action==='approve'&&receipt.savedId!==null||record.action==='submit'&&(receipt.unchanged||receipt.savedId!==record.savedId||!boundedText(receipt.caseId))||record.action==='save'&&!boundedText(receipt.savedId))throw Error('INVALID_OPERATION_RECEIPT');
      // Only a selected BOM Apply's exact original POST can finish against its
      // CAS authority. Receipt lookups, Save and all other scopes still GET.
      const postProof=originalPost&&boundedPostAuthorities.get(result);
      if(postProof&&postProof.record===record&&verifiedBomApplyAuthority(result,record.operationId)){
        window.SharedDraftDeparture.confirmed(sessionScope,record.command,result,record.owner);
        boundedClear(record);return result;
      }
      const readback=await request(endpoint,undefined,{requireAcceptedAccess:true});assertOwner();const flow=boundedFlow(readback);
      if(record!==boundedRecord||readback.permissions?.view!==true||!flow||flow.scope!==boundedScope||flow.generation!==receipt.generation||flow.revision<receipt.revision||boundedKnown?.generation!==flow.generation||boundedKnown.revision>flow.revision)throw Error('BOUNDED_READBACK_REQUIRED');
      // Historical metadata cannot manufacture this runtime's write attribution.
      if(!record.historical&&record.command)window.SharedDraftDeparture.confirmed(sessionScope,record.command,result,record.owner);
      boundedClear(record);const settled=['ipqc-c','bom'].includes(boundedScope)?{...result,permissions:readback.permissions}:{...result,control:readback.control,permissions:readback.permissions};boundedReadbacks.set(settled,{readback,operationId:receipt.operationId,receiptRaw:JSON.stringify(receipt),generation:flow.generation,revision:flow.revision});return settled;
    }
    const readPause=window.createScopedReadPause(endpoint.split('?')[0]);
    const readKind=url=>/[?&]operationId(?:=|&|$)/.test(url)?'receipt':/[?&]permissions(?:=|&|$)/.test(url)?'permissions':/[?&]contentIssues(?:=|&|$)/.test(url)?'inspection':/[?&]reviewMetadata(?:=|&|$)/.test(url)?'review':/[?&](?:history|uiHistory|versionId|caseId|saveId|restoreSaveId|legacyHistory|legacyVersionId)(?:=|&|$)/.test(url)?'history':'state';
    async function request(url,body,readOptions) {
      if(body)assertMutationAdmission();else assertOwner();
      const accessOwner=captureAccess(readOptions),boundedPin=boundedKnownVersion;
      const canvasObserved=canvasObserving?++canvasObservation:0,canvasRequestOwner=canvasPrimary?canvasOwner():null;if(canvasObserving)canvasRequests++;if(canvasPrimary&&body)canvasBasis=null;
      const readOwner=!body||body.action==='begin'?window.ProcessSync?.captureDelivery?.():null,pauseOwner=body?null:readPause.capture(),kind=body?null:readKind(url);
      accessOwner.delivery=readOwner||(accessGuard?window.ProcessSync?.captureDelivery?.():null);
      // Hosted immutable-state reads can exceed 15s (measured ~24s). Keep
      // non-authoring commands at 15s and the receipt-first unknown policy.
      // Begin is a bounded workflow load/adoption. Only this action receives
      // the existing 45s read/authoring budget; other mutation budgets stay put.
      const requestDeadline=body?.action==='begin'?45000:body?mutationDeadline:45000;
      let deadlineExpired=false,phase='headers';
      const controller=new AbortController(),timer=setTimeout(()=>{deadlineExpired=true;controller.abort();},requestDeadline);
      try {
        const requestOptions={method:body?'POST':'GET',headers:headers(),cache:'no-store',signal:controller.signal,...(body?{body:JSON.stringify(body.command?{...body,command:packCommand(body.command)}:body)}:{})};
        if(externalCanvas&&body){
          assertMutationAdmission();
          try{if(body.command?.action!=='apply'||externalProof(body.command)!==true)throw Error('CANVAS_DURABLE_DISPATCH_REQUIRED');}
          catch(cause){const error=Object.assign(Error('CANVAS_DURABLE_DISPATCH_REQUIRED'),{notSent:true,cause});externalUnsent.add(error);throw error;}
          assertMutationAdmission();
        }
        if(externalBounded&&body?.command){
          assertMutationAdmission();const command=body.command,record=boundedRecord,selected=boundedSelected.get(command.operationId),proof=boundedProofs.get(command.operationId);
          try{if(!record||record.operationId!==command.operationId||record.historical||sessionStorage.getItem(record.key)!==boundedSentinel||selected&&(selected!==JSON.stringify(command)||typeof proof!=='function'||proof(command)!==true))throw Error('BOUNDED_DURABLE_DISPATCH_REQUIRED');}
          catch(cause){const error=Object.assign(Error('BOUNDED_DURABLE_DISPATCH_REQUIRED'),{notSent:true,cause});externalUnsent.add(error);throw error;}
          boundedProofs.delete(command.operationId);assertMutationAdmission();if(record!==boundedRecord||sessionStorage.getItem(record.key)!==boundedSentinel){const error=Object.assign(Error('BOUNDED_DURABLE_DISPATCH_REQUIRED'),{notSent:true});externalUnsent.add(error);throw error;}
        }
        const postPin=bomPostPin(body?.command);
        const abEntry=abSelected.get(body?.command?.operationId);if(abEntry)abAssert(abEntry,body.command);
        let response;try{response=await fetch(url+(url.includes('?')?'&':'?')+'compact=1'+(responseProjection==='iqc-edit-v1'?'&projection=iqc-edit-v1':''),requestOptions);}
        catch(error){if(abEntry&&error&&typeof error==='object'&&!('status'in error))abFetchFailures.set(error,abEntry);throw error;}
        phase='body';let result;try{result=await response.json();}catch(error){if(!body&&(!accessGuard||ownsAccess(accessOwner)))readPause.denied(kind,response.status,pauseOwner,()=>request(url,undefined,readOptions));if(!body&&readOptions?.requireAcceptedAccess===true&&[401,403].includes(response.status)){if(accessGuard)projectAccess({},response.status,false,accessOwner);throw Object.assign(Error(`HTTP ${response.status}`),{status:response.status,cause:error});}throw error;}
        assertOwner();
        if(abEntry)abAssert(abEntry,body.command);
        if(readOwner&&window.ProcessSync?.isCurrentDelivery?.(readOwner)===false)throw Error('DELIVERY_SUPERSEDED');
        if(!body&&(!accessGuard||ownsAccess(accessOwner)))readPause.denied(kind,response.status,pauseOwner,()=>request(url,undefined,readOptions));
        let acceptedAccess=true;
        if(accessGuard){acceptedAccess=projectAccess(result,body?0:response.status,response.ok,accessOwner);}
        else if(response.ok&&result.permissions){const next=completeAccessSnapshot(result.permissions),revoked=access&&Object.keys(next).some(key=>access[key]===true&&next[key]===false);access=next;gateControls(revoked);}
        else if(!body&&[401,403].includes(response.status)){access=Object.fromEntries(['view','edit','save','submit','withdraw','approve','return','history','delete','create','restore'].map(key=>[key,false]));gateControls(true);}
        if(result.wireVersion===1){const live=result.liveContent;if(!live||typeof live!=='object')throw Error('INVALID_WORKFLOW_RESPONSE');const expand=value=>{
          if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&typeof value.__liveContent==='string'){const [key,field]=value.__liveContent.split('#');if(!Object.hasOwn(live,key)||field&&(!live[key]||typeof live[key]!=='object'||!Object.hasOwn(live[key],field)))throw Error('INVALID_WORKFLOW_RESPONSE');return JSON.parse(JSON.stringify(field?live[key][field]:live[key]));}
          if(Array.isArray(value))return value.map(expand);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,expand(child)]));return value;};
          const {liveContent:_live,wireVersion:_version,...body}=result;result=expand(body);}
        if(!response.ok){const error=Object.assign(Error(result.error||`HTTP ${response.status}`),{status:response.status,requestId:result.requestId,details:result.details});if(abEntry)abResponse(error,body.command,result);if(externalBounded&&body?.command)boundedResponses.set(error,{record:boundedRecord,operationId:body.command.operationId,raw:JSON.stringify(body.command),flight:preparedFlights.get(body.command.operationId)?.promise,manualBodyTooLarge:boundedScope==='bom'&&body.command.action==='apply'&&!body.command.moduleAction&&response.status===413&&result.error==='COMMAND_TOO_LARGE'&&new TextEncoder().encode(requestOptions.body).byteLength>2_000_000});throw error;}
        // Real HTTP errors above retain their original status even for stale ownership.
        if(accessGuard&&!body&&(!ownsAccess(accessOwner)||(kind==='permissions'||readOptions?.requireAcceptedAccess===true)&&!acceptedAccess))throw Error('ACCESS_READ_SUPERSEDED');
        // Pair a full owned projection with its state revision. Metadata-only
        // replies must never advance this token past a model the caller has seen.
        const flow=result.control?.workflow;
        if(flow&&Number.isSafeInteger(result.revision)&&typeof flow.generation==='string'&&Number.isSafeInteger(flow.revision)&&(!conditionalRead||result.revision>=conditionalRead.revision))conditionalRead={flowToken:flow.generation+':'+flow.revision,revision:result.revision};
        const canUsePost=postPin&&bomPostPinCurrent(postPin)&&postPin.record===boundedRecord&&postPin.modelVersion===boundedKnownVersion&&JSON.stringify(body.command)===postPin.commandRaw&&result.unchanged!==true&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.requestId||'')&&Number.isSafeInteger(result.revision)&&result.revision>postPin.globalRevision&&Array.isArray(result.control?.versions)&&flow?.scope==='bom'&&flow.generation===body.command.generation&&flow.revision===result.receipt?.revision&&flow.generation===result.receipt?.generation&&(flow.saved?.id||null)===result.receipt?.savedId&&flow.pendingId===null&&result.receipt?.caseId===null&&flow.working?.bom&&typeof flow.working.bom==='object'&&!Array.isArray(flow.working.bom);
        boundedObserve(result,boundedPin);
        if(canUsePost){freezeBomAuthority(result.control);freezeBomAuthority(result.receipt);boundedPostAuthorities.set(result,{...postPin,globalRevision:result.revision,control:result.control,receiptRaw:JSON.stringify(result.receipt),generation:flow.generation,revision:flow.revision,modelVersion:boundedKnownVersion});}
        if(canvasObserving)try{canvasObserveResponse(result,body,response.ok,canvasObserved,canvasRequestOwner,kind);canvasObservePost(result,body,canvasObserved);}catch{canvasBasis=null;canvasPosts.delete(result);}
        if(!body&&(!accessGuard||ownsAccess(accessOwner)))readPause.success(kind,pauseOwner);
        return result;
      } catch(error) {
        if(canvasPrimary)canvasBasis=null;
        // Classify only this request's deadline abort, never navigation/actor
        // invalidation or a server denial. Preserve the original cause/name.
        if(deadlineExpired&&controller.signal.aborted&&(error===controller.signal.reason||error?.name==='AbortError')){
          const code=body?.action==='begin'?'BEGIN_RESPONSE_TIMEOUT_UNKNOWN':body?'WORKFLOW_MUTATION_TIMEOUT_UNKNOWN':'WORKFLOW_READ_TIMEOUT';
          const timeout=Object.assign(Error(code,{cause:error}),{name:error?.name||'AbortError',code,phase,deadlineMs:requestDeadline,outcome:body?'unknown':'unavailable'});const abFailure=abFetchFailures.get(error);if(abFailure)abFetchFailures.set(timeout,abFailure);throw timeout;
        }
        throw error;
      } finally {clearTimeout(timer);if(canvasObserving){canvasRequests--;if(body?.command)canvasArms.delete(body.command.operationId);}}
    }
    function retain(command,owner) {
      const entry=abSelected.get(command?.operationId);
      if(entry){abAssert(entry,command);const stored=sessionStorage.getItem(key);if(stored!==null){recoveryInvalid=true;throw Error('RECOVERY_RECORD_CHANGED');}unknown=command;unknownOwner=owner;entry.markerRaw=JSON.stringify(packCommand(command));sessionStorage.setItem(key,entry.markerRaw);if(sessionStorage.getItem(key)!==entry.markerRaw)throw Error('RECOVERY_WRITE_NOT_VERIFIED');abAssert(entry,command);return;}
      try {if(externalBounded){if(command)boundedArm(command);else if(boundedRecord)boundedClear(boundedRecord);return;}if(!externalCanvas){if(command)sessionStorage.setItem(key,JSON.stringify(packCommand(command)));else sessionStorage.removeItem(key);}}
      catch(error){throw Object.assign(Error('RECOVERY_STORAGE_UNAVAILABLE'),{cause:error});}
      if(!command&&unknown)abSelected.delete(unknown.operationId);
      unknown=command;unknownOwner=command?(owner||unknownOwner):null;
    }
    // A successful HTTP response is not evidence that this operation committed.
    // Review receipts may rotate generation; only Apply is bound to its original one.
    function confirmedReceipt(result,operationId,generation,action) {
      const r=result?.receipt;
      if(!r||typeof r!=='object'||Array.isArray(r)||r.operationId!==operationId||
        typeof r.generation!=='string'||!r.generation||!Number.isSafeInteger(r.revision)||r.revision<0||
        !(r.savedId===null||typeof r.savedId==='string')||!(r.caseId===null||typeof r.caseId==='string')||
        typeof r.unchanged!=='boolean'||['apply','restore'].includes(action)&&r.unchanged===false&&r.revision<1||generation!==undefined&&r.generation!==generation){
        conditionalRead=null;
        throw Object.assign(Error('INVALID_OPERATION_RECEIPT'),{operationId});
      }
      return result;
    }
    async function resolveUnknown() {
      if(!unknown)return null;
      const command=unknown,owner=unknownOwner,result=confirmedReceipt(await request(query(`operationId=${encodeURIComponent(command.operationId)}`)),command.operationId,command.action==='apply'?command.generation:undefined,command.action);
      if(externalBounded&&boundedRecord?.operationId===command.operationId){const settled=await boundedTerminal(result,boundedRecord);syncFailures.delete(command.operationId);return settled;}
      window.SharedDraftDeparture.confirmed(sessionScope,command,result,owner);
      syncFailures.delete(command.operationId);if(unknown?.operationId===command.operationId)retain(null);return result;
    }
    async function post(command, retry = false,owner) {
      if(beginPending)throw Error('OPERATION_IN_PROGRESS');
      assertMutationAdmission();
      if(unknown && (!retry || unknown.operationId!==command.operationId)){
        const error=Error('PREVIOUS_OPERATION_UNKNOWN');
        // A different command was never sent. Keep its failure until explicit
        // matching-field cancellation/correction; never relabel the sent unknown.
        if(unknown.operationId!==command.operationId)error.notSent=true;
        throw error;
      }
      if(retry)return client.receipt(command.operationId,command.action==='apply'?command.generation:undefined);
      if(externalBounded&&!boundedKnown)try{await request(endpoint,undefined,{requireAcceptedAccess:true});}catch(cause){throw Object.assign(Error('BOUNDED_PREFLIGHT_UNAVAILABLE'),{notSent:true,cause});}
      // Keep the operation before transport so closing the tab cannot create a blind retry.
      try{if(!unknown)retain(command,owner);}catch(error){error.notSent=true;if(externalBounded)boundedRegisterRejection(error,command,preparedFlights.get(command.operationId)?.promise);throw error;}
      try {const result=confirmedReceipt(await request(endpoint,{command}),command.operationId,command.action==='apply'?command.generation:undefined,command.action);const abEntry=abSelected.get(command.operationId);if(abEntry)abClear(abEntry,command);if(externalBounded)return await boundedTerminal(result,boundedRecord,true);window.SharedDraftDeparture.confirmed(sessionScope,command,result,owner);if(!abEntry)retain(null);if(command.action!=='apply')validation=null;return result;}
      catch(caught) {
        let error=caught;
        // Preserve only the existing no-status fetch-loss receipt lookup.
        // Parsing, validation, headers and public error flags cannot opt in.
        const abEntry=abSelected.get(command.operationId);if(abEntry){if(abFetchFailures.get(error)!==abEntry)throw error;try{return await abRecover(abEntry,command,owner);}catch{throw Object.assign(Error('RESULT_UNKNOWN_CHECK_BEFORE_RETRY'),{operationId:command.operationId});}}
        if(error.message==='ACCOUNT_CHANGED_REOPEN_REQUIRED'||externalStrict&&!externalCurrent())throw error;
        if(externalStrict&&externalUnsent.has(error)){if(externalBounded){boundedRegisterRejection(error,command,preparedFlights.get(command.operationId)?.promise);try{if(unknown?.operationId===command.operationId)retain(null);}catch(cleanup){error.recoveryCleanupRequired=true;error.recoveryCleanupError=cleanup;}}else if(unknown?.operationId===command.operationId)retain(null);throw error;}
        if(externalStrict&&error.notSent===true)error=Error(error.message,{cause:error}); // A fetch failure cannot manufacture pre-dispatch proof.
        if(Array.isArray(error.details?.issues)&&['submit','approve'].includes(command.action))validation={issues:error.details.issues,requestId:error.requestId,generation:command.generation,savedId:command.savedId,caseId:command.caseId};
        if(!externalBounded&&error.status&&error.status<500){retain(null);throw error;}
        if(externalBounded&&boundedRejection(error,command)){
          const original=boundedResponses.get(error);boundedRegisterRejection(error,command,original.flight);
          try{boundedClear(boundedRecord);}catch(cleanup){error.recoveryCleanupRequired=true;error.recoveryCleanupError=cleanup;}
          throw error;
        }
        if(externalBounded&&error.status){throw error;}
        try {const resolved=await resolveUnknown(),recovered={...resolved,recovered:true};
          // Only this internal wrapper inherits the original terminal GET proof.
          // Caller-created spreads/clones remain untrusted WeakMap misses.
          const proof=externalBounded&&boundedReadbacks.get(resolved);if(proof)boundedReadbacks.set(recovered,proof);
          return recovered;
        }
        catch {throw Object.assign(Error('RESULT_UNKNOWN_CHECK_BEFORE_RETRY'),{operationId:command.operationId});}
      }
    }
    const client={
      canPoll:kind=>readPause.canPoll(kind),readPauseState:kind=>readPause.state(kind),
      validation(flow){if(window.ProcessSync&&window.ProcessSync.identity?.id!==actorId)return null;if(validation&&flow&&(validation.generation!==flow.generation||validation.savedId&&validation.savedId!==flow.saved?.id))validation=null;return access?.view===false?null:validation;},
      permission: key=>access?.[key],
      gatePermissions:()=>{assertOwner();gateControls();},
      setPermissionGates(value){gates=value;gateControls();return client;},
      withLegacyArchive(){client.legacyHistory=before=>request(query(`legacyHistory=1${before?`&before=${encodeURIComponent(before)}`:''}`));client.legacyVersion=id=>request(query(`legacyVersionId=${encodeURIComponent(id)}`));return client;},
      invalidateReadState(){accessEpoch++;accessObserved=0;accessFence=0;accessRevision=-1;access=null;conditionalRead=null;validation=null;},
      // Internal one-way cached-client upgrade; no downgrade or queue replacement.
      useAccessResultGuard(){if(!accessGuard){accessGuard=true;accessEpoch++;}return client;},
      useStateRevision(){conditionalState=true;return client;},
      read: (token,options)=>request(token?query(`since=${encodeURIComponent(conditionalState&&conditionalRead?.flowToken===token?'state:'+conditionalRead.revision:token)}`):endpoint,undefined,options),
      permissions:options=>request(query('permissions=1'),undefined,options),
      reviewMetadata:revision=>request(query('reviewMetadata=1'+(Number.isSafeInteger(revision)?'&since='+encodeURIComponent('state:'+revision):''))),
      history: before=>request(query(`history=cases${before?`&before=${encodeURIComponent(before)}`:''}`)),
      uiHistory: options=>request(query('uiHistory=1&'+new URLSearchParams(options))),
      version: (id,options)=>request(query('versionId='+encodeURIComponent(id)),undefined,options),
      contentIssues: caseId=>request(query('contentIssues=1'+(caseId?'&contentCaseId='+encodeURIComponent(caseId):''))),
      ...(legacyArchive?{legacyHistory:before=>request(query(`legacyHistory=1${before?`&before=${encodeURIComponent(before)}`:''}`)),legacyVersion:id=>request(query(`legacyVersionId=${encodeURIComponent(id)}`))}:{}),
      reviewCase: id=>request(query(`caseId=${encodeURIComponent(id)}`)),
      previewRestore: id=>request(query(`restoreSaveId=${encodeURIComponent(id)}`)),
      async begin(){
        assertMutationAdmission();if(externalCanvas)throw Object.assign(Error('CANVAS_EXTERNAL_APPLY_ONLY'),{notSent:true});
        if(unknown)throw Error('PREVIOUS_OPERATION_UNKNOWN');
        if(beginPending||queued)throw Error('OPERATION_IN_PROGRESS');
        const finishFeedback=beginFeedback(endpoint);
        queued++;const operation=request(endpoint,{action:'begin'});beginPending=operation;
        try{return await operation;}
        finally{if(beginPending===operation)beginPending=null;queued--;finishFeedback();}
      },
      resolveUnknown,
      retryUnknown:async()=>{assertMutationAdmission();if(beginPending||retryPending||queued)throw Error('OPERATION_IN_PROGRESS');if(!unknown)return null;const command=unknown;queued++;const operation=resolveUnknown();retryPending=operation;try{const result=await operation;syncFailures.delete(command.operationId);return result;}finally{if(retryPending===operation)retryPending=null;queued--;}},
      hasUnknown:()=>!!unknown||recoveryInvalid,
      legacyRecoveryUnsupported:()=>externalBounded&&boundedLegacy,
      isRuntimeCurrent:()=>externalCurrent(),
      isVerifiedReadback:result=>!!verifiedBoundedReadback(result,result?.receipt?.operationId),
      verifiedReadback:(result,operationId)=>boundedText(operationId)?verifiedBoundedReadback(result,operationId):null,
      verifiedApplyAuthority:(result,operationId)=>boundedText(operationId)?verifiedBomApplyAuthority(result,operationId):null,
      hasSyncFailures:()=>!!syncFailures.size,
      // Explicit form cancellation can discard only confirmed rejections (or
      // commands never sent), never uncertain requests or unrelated fields.
      discardRejected:paths=>{assertOwner();if(unknown)return false;const allowed=new Set(paths.map(path=>JSON.stringify(path)));
        for(const [id,failure]of syncFailures)if((externalBounded?failure.error.notSent||boundedRejected.has(failure.error):failure.error.notSent||failure.error.status&&failure.error.status<500)&&failure.command.patches?.length&&failure.command.patches.every(p=>allowed.has(JSON.stringify(p.path))))syncFailures.delete(id);
        return !syncFailures.size;},
      mediaURL(photo){if(typeof photo?.src==='string'&&/^(?:data:image\/(?:png|jpeg|webp|gif|avif);base64,|\/(?!\/))/.test(photo.src))return photo.src;
        if(typeof photo?.src==='string'&&photo.src.startsWith('assets/')){const url=new URL(photo.src,location.origin+'/process/');if(url.origin===location.origin&&url.pathname.startsWith('/process/assets/'))return url.pathname+url.search;}
        return /^[a-f0-9]{64}$/.test(photo?.id||'')?endpoint.split('?')[0].replace(/\/workflow$/,'')+'/photo?id='+photo.id:'';},
      rejectionCapability(command){
        assertOwner();const raw=JSON.stringify(command);if(!externalBounded||boundedSelectedObjects.get(command)!==raw)throw Error('BOUNDED_RECOVERY_COMMAND_REQUIRED');
        const token=Object.freeze({}),proof={clientId,raw,flight:preparedFlights.get(command.operationId)?.promise||null,current:externalCurrent};rejectionCapabilities.set(token,proof);
        const list=boundedCapabilities.get(command.operationId)||[];list.push(proof);boundedCapabilities.set(command.operationId,list);return token;
      },
      isConfirmedRejection(error,command){const proof=rejectionFlights.get(error);return externalBounded&&externalCurrent()&&proof?.clientId===clientId&&proof.raw===JSON.stringify(command)&&proof.current();},
      hasConfirmedRejection(command){return externalBounded&&externalCurrent()&&!!boundedRecord?.rejection&&boundedRejected.has(boundedRecord.rejection)&&JSON.stringify(boundedRecord.command)===JSON.stringify(command);},
      finalizeRejected(command){assertOwner();if(!client.hasConfirmedRejection(command))throw Error('CONFIRMED_REJECTION_REQUIRED');boundedClear(boundedRecord);syncFailures.delete(command.operationId);return true;},
      prepareRecovery(generation,details={}){assertOwner();if(!externalBounded)throw Error('BOUNDED_EXTERNAL_SCOPE_REQUIRED');const command=client.prepare(generation,'apply',details);boundedSelected.set(command.operationId,JSON.stringify(command));boundedSelectedObjects.set(command,JSON.stringify(command));return command;},
      prepareRecoverySave(generation){assertOwner();if(!externalBounded||boundedScope!=='bom')throw Error('BOM_RECOVERY_SAVE_REQUIRED');const command=client.prepare(generation,'save');boundedSelected.set(command.operationId,JSON.stringify(command));boundedSelectedObjects.set(command,JSON.stringify(command));return command;},
      isCreateRuntimeCurrent:()=>abCreate&&abActive,
      prepareCreate(generation,moduleAction,input){assertMutationAdmission();if(!abCreate||!['create-item','create-error'].includes(moduleAction))throw Error('AB_CREATE_SCOPE_REQUIRED');if(typeof generation!=='string'||!generation)throw Error('AB_CREATE_GENERATION_REQUIRED');const command=client.prepare(generation,'apply',{moduleAction,input}),entry={raw:JSON.stringify(command),owner:{...departureOwner(),delivery:window.ProcessSync?.captureDelivery?.()},flight:null,consumed:false};abAssert(entry,command);abCommands.set(command,entry);abSelected.set(command.operationId,entry);return command;},
      finalizeRejectedCreate:abFinalize,
      prepare(generation,action,details={}) {assertOwner();const command={...details,action,generation,clientId,sequence:++sequence,operationId:crypto.randomUUID()};if(canvasTarget)try{canvasCommands.set(command,canvasJSONCopy(command,true));}catch{/* Unsupported proof shape retains the original dispatch/GET path. */}return command;},
      receipt:async (id,generation)=>{assertOwner();const command=unknown?.operationId===id?unknown:null,owner=unknownOwner,expected=generation??(command?.action==='apply'?command.generation:undefined),result=confirmedReceipt(await request(query(`operationId=${encodeURIComponent(id)}`)),id,expected,command?.action);if(externalBounded&&boundedRecord?.operationId===id){const settled=await boundedTerminal(result,boundedRecord);syncFailures.delete(id);return settled;}if(command)window.SharedDraftDeparture.confirmed(sessionScope,command,result,owner);if(unknown?.operationId===id)retain(null);syncFailures.delete(id);return result;},
      command(generation,action,details={}) {return client.sendPrepared(client.prepare(generation,action,details));},
      sendPrepared(command,options) {
        assertMutationAdmission();if(externalCanvas&&command?.action!=='apply')throw Object.assign(Error('CANVAS_EXTERNAL_APPLY_ONLY'),{notSent:true});
        const abEntry=abSelected.get(command?.operationId),abIssued=abCommands.get(command);if(abCreate&&(abEntry||abIssued||['create-item','create-error'].includes(command?.moduleAction))){if(!abEntry||abIssued!==abEntry)throw Error('AB_CREATE_PREPARATION_REQUIRED');abAssert(abEntry,command);if(abEntry.flight)return abEntry.flight;}
        if(externalBounded&&boundedSelectedObjects.has(command)&&boundedSelectedObjects.get(command)!==JSON.stringify(command))throw Object.assign(Error('OPERATION_ID_PAYLOAD_MISMATCH'),{notSent:true});
        if(externalBounded&&unknown?.operationId===command.operationId&&boundedRecord?.historical)return client.receipt(command.operationId);
        const existing=preparedFlights.get(command.operationId);
        if(existing){if(JSON.stringify(existing.command)!==JSON.stringify(command))throw Error('OPERATION_ID_PAYLOAD_MISMATCH');return existing.promise;}
        if(externalBounded&&boundedSelected.has(command.operationId)){if(boundedSelected.get(command.operationId)!==JSON.stringify(command)||typeof options?.assertDispatch!=='function')throw Object.assign(Error('BOUNDED_DURABLE_DISPATCH_REQUIRED'),{notSent:true});boundedProofs.set(command.operationId,options.assertDispatch);}
        // Capture the admitted JSON payload; a caller cannot mutate a queued command.
        command=JSON.parse(JSON.stringify(command));
        if(unknown?.operationId===command.operationId&&JSON.stringify(unknown)!==JSON.stringify(command))throw Error('OPERATION_ID_PAYLOAD_MISMATCH');
        if(beginPending||retryPending)throw Error('OPERATION_IN_PROGRESS');
        assertMutationAdmission();const retry=unknown?.operationId===command.operationId,owner=retry?unknownOwner:departureOwner();queued++;const {action}=command;
        const result=tail.then(async()=>{assertMutationAdmission();if(action==='save'&&syncFailures.size)throw syncFailures.values().next().value.error;
          if(action==='submit'){const advisory=await request(query('permissions=1'));assertMutationAdmission();if(advisory.permissions?.submit&&advisory.otherReviewerAvailable===false)window.alert(document.documentElement.lang.startsWith('zh')?'目前沒有其他已啟用的審核人，仍可送審。具審核權限者可經確認後自審。':'Hiện chưa có người duyệt khác đang hoạt động. Bạn vẫn có thể gửi duyệt. Người có quyền duyệt có thể tự duyệt sau khi xác nhận.');}
          return post(command,retry,owner);}).finally(()=>{queued--;if(externalBounded)boundedProofs.delete(command.operationId);});
        const flight={command,promise:result};preparedFlights.set(command.operationId,flight);if(externalBounded)for(const proof of boundedCapabilities.get(command.operationId)||[])proof.flight=result;
        if(abEntry)abEntry.flight=result;
        void result.then(()=>{if(preparedFlights.get(command.operationId)===flight)preparedFlights.delete(command.operationId);},()=>{if(preparedFlights.get(command.operationId)===flight)preparedFlights.delete(command.operationId);});
        tail=result.then(()=>{syncFailures.delete(command.operationId);if(action==='apply'){
          const paths=new Set((command.patches||[]).map(p=>JSON.stringify(p.path)));
          for(const [id,failure]of syncFailures)if(failure.command.patches?.length&&failure.command.patches.every(p=>paths.has(JSON.stringify(p.path))))syncFailures.delete(id);
        }},error=>{if(action==='apply'&&!(error.message==='PREVIOUS_OPERATION_UNKNOWN'&&unknown?.operationId===command.operationId&&syncFailures.has(command.operationId)))syncFailures.set(command.operationId,{command,error});});return result;
      },
      // Only this client's already queued operations are awaited, never other users.
      flush:async()=>{assertOwner();if(beginPending)await beginPending;if(retryPending)await retryPending;await tail;if(syncFailures.size)throw syncFailures.values().next().value.error;if(unknown)throw Error('PREVIOUS_OPERATION_UNKNOWN');},
    };
    if(externalBounded){
      // A stale projection is retired only after a replacement has successfully
      // discovered every unresolved receipt it owns. Real queued work still counts.
      boundedRetirements.set(client,keys=>{if(externalCurrent()||recoveryInvalid||unknown&&(!boundedRecord||!keys.has(boundedRecord.key))||[...syncFailures.values()].some(failure=>failure.command.operationId!==unknown?.operationId&&!failure.error.notSent&&!boundedRejected.has(failure.error)))return false;boundedProjectionRetired=true;return true;});
      if(!recoveryInvalid&&externalCurrent())boundedRetirements.get(boundedPredecessor)?.(new Set(boundedDiscovered.map(record=>record.key)));
    }
    if(canvasPrimary||canvasTarget)canvasAuthorityClients.set(client,{capture:canvasCapture,arm:canvasArm,verify:canvasVerify,accept:canvasAccept,proof:result=>canvasPosts.get(result),consume:result=>canvasPosts.delete(result)});
    transports.set(transportKey,client);return client;
  };
  window.renderSharedDraftValidation=({client,flow,after,onLocate,label,language})=>{
    if(!after)return;
    after.parentElement?.querySelectorAll(':scope > .shared-validation').forEach(panel=>panel.remove());
    const validation=client?.validation(flow);if(!validation)return;
    const zh=language==='zh',t=(vi,cn)=>zh?cn:vi;
    const terms={PRODUCT_NAME_ROUTE_REQUIRED:['Cần tên sản phẩm và tuyến công đoạn hợp lệ','產品名稱及有效工段路線待補'],REQUIRED_PROCESS_PRESETS_MISSING:['Thiếu mẫu quy trình bắt buộc','缺少必要流程範本'],NAME_REQUIRED:['Tên là bắt buộc','名稱必填'],FREQUENCY_REQUIRED:['Cần bổ sung tần suất kiểm tra','檢查頻率待補'],EQUIPMENT_UNAVAILABLE:['Thiết bị không còn khả dụng; kiểm tra liên kết','檢具目前不可用，請核對關聯'],STANDARD_REQUIRED:['Cần bổ sung tiêu chuẩn','標準待補'],METHOD_REQUIRED:['Cần bổ sung phương pháp','方法待補']};
    const phrases={'項目標準未填':'Chưa điền tiêu chuẩn kiểm tra','檢查方式敘述未填':'Chưa mô tả phương pháp kiểm tra','檢查設備未選':'Chưa chọn thiết bị kiểm tra','錯誤名稱必填':'Tên lỗi là bắt buộc','產品已不在 C 線此工段路線':'Sản phẩm không còn thuộc công đoạn này của chuyền C','檢查方式敘述必填':'Mô tả phương pháp kiểm tra là bắt buộc','請設定檢查規則':'Hãy thiết lập quy tắc kiểm tra','新檢查項目需填標準，或說明不適用原因':'Hạng mục mới cần tiêu chuẩn hoặc lý do không áp dụng','新檢查項目的頻率必填':'Tần suất hạng mục mới là bắt buộc','尚未指定有效類別':'Chưa chọn nhóm hợp lệ','零件名稱空白':'Tên linh kiện còn trống','至少需要一條檢查規則':'Cần ít nhất một quy tắc kiểm tra','來源規則空白':'Quy tắc nguồn còn trống','按批次規則缺少有效數值或自訂名稱':'Quy tắc theo lô thiếu giá trị hợp lệ hoặc tên tùy chỉnh','按時間規則格式錯誤':'Định dạng quy tắc thời gian không hợp lệ'};
    const panel=document.createElement('section');panel.className='shared-validation';
    for(const kind of ['error','missing','warning']){
      const displayKind=issue=>issue.kind==='error'&&Object.hasOwn(terms,issue.message)?'missing':issue.kind;
      const issues=validation.issues.filter(issue=>displayKind(issue)===kind);if(!issues.length)continue;
      const group=document.createElement('details');group.open=true;group.dataset.sharedIssueKind=kind;
      const summary=document.createElement('summary');summary.textContent=(kind==='missing'?t('Cần bổ sung','待補'):kind==='warning'?t('Lưu ý','提醒'):t('Lỗi','報錯'))+' · '+issues.length;group.append(summary);
      const source=document.createElement('p');source.textContent=t('Bản gửi duyệt đã kiểm tra: ','驗證的送審快照：')+(validation.savedId||validation.caseId)+t(' · Sửa nội dung đang làm không sửa bản đã lưu. Hãy lưu thủ công rồi gửi lại để kiểm tra.',' · 工作內容的補填不會更新已儲存快照，請手動儲存後重新送審驗證。');group.append(source);
      for(const issue of issues){
        let subject=flow?.saved?.content||flow?.working;for(const part of issue.path?.slice(0,2)||[])subject=typeof part==='object'?subject?.find?.(row=>row.id===part.id):subject?.[part];
        let message=terms[issue.message]?t(...terms[issue.message]):issue.message;if(!zh){for(const [source,target]of Object.entries(phrases))message=message.replace(source,target);message=message.replace(/^產品 (.+) 尚未涵蓋$/,'Sản phẩm $1 chưa được bao phủ');}
        const row=document.createElement('article'),text=document.createElement('p');text.textContent=(label?.(issue)||subject?.checkNo||subject?.code||subject?.assetCode||subject?.nameVi||subject?.name||issue.path?.filter(part=>typeof part==='object').map(part=>part.id).join(' / ')||'')+' · '+message;row.append(text);
        const advisory=kind==='warning'||kind==='missing'&&(flow?.scope==='ipqc-c'||/^ipqc-ab:[AB]:.+/.test(flow?.scope||''))&&['IPQC_METHOD_MISSING','IPQC_FREQUENCY_MISSING','IPQC_PRODUCT_COVERAGE'].includes(issue.code);
        const impact=document.createElement('small');impact.textContent=advisory?t('Không chặn gửi duyệt','不阻擋送審'):t('Chặn gửi duyệt','阻擋送審');row.append(impact);
        if(onLocate&&issue.path?.length&&client.permission('edit')!==false&&!flow?.pendingId){const button=document.createElement('button');button.type='button';button.className='button ghost';button.dataset.sharedIssueLocate='';button.textContent=t('Đến sửa nội dung hiện tại','前往修正目前內容');button.onclick=()=>{if(client.permission('edit')!==false)onLocate(issue);};row.append(button);}
        group.append(row);
      }
      if(validation.requestId){const request=document.createElement('small');request.textContent=t('Mã tra cứu: ','查詢編號：')+validation.requestId;group.append(request);}panel.append(group);
    }
    after.after(panel);
  };
  const captureRestoreOwner=()=>({id:window.ProcessSync?.identity?.id,identity:window.ProcessSync?.identity,epoch:window.ProcessSync?.identityGeneration?.(),delivery:window.ProcessSync?.captureDelivery?.()});
  const restoreOwnerCurrent=owner=>!window.ProcessSync||!!owner.id&&owner.id===window.ProcessSync.identity?.id&&!window.ProcessSync.requiresReload&&(typeof owner.epoch==='number'?owner.epoch===window.ProcessSync.identityGeneration?.():owner.identity===window.ProcessSync.identity)&&(!owner.delivery||window.ProcessSync.isCurrentDelivery?.(owner.delivery)!==false);
  window.openSharedDraftHistory=async({client,editable,onApplied,masterScope=null,legacyFirst=false,legacyVersionId=null,caseId=null,versionPreview=null,reviewActions=[],onReview=null})=>{
    const restoreOwner=captureRestoreOwner(),restoreAllowed=()=>editable()&&client.permission?.('restore')===true&&restoreOwnerCurrent(restoreOwner);
    const zh=document.documentElement.lang.startsWith('zh'),t=(vi,cn)=>zh?cn:vi,h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const statusNames={draft:['編輯中','Đang chỉnh sửa'],pending:['待審','Chờ duyệt'],'pending-test':['待審','Chờ duyệt'],approved:['正式版本','Bản có hiệu lực'],superseded:['歷史唯讀','Lịch sử · chỉ đọc'],withdrawn:['已撤回','Đã rút'],returned:['已發回','Đã trả lại']};
    const statusLabel=value=>Object.hasOwn(statusNames,value)?statusNames[value][zh?0:1]:value;
    const moduleCollection=kind=>{try{const key=JSON.parse(kind);return Array.isArray(key)&&key.length===3&&key[0]==='IPQC'&&typeof key[1]==='string'&&['bases','errors','items'].includes(key[2])?key:null;}catch{return null;}};
    const collectionLabel=kind=>{const key=moduleCollection(kind);return key?`IPQC · ${key[1]} · ${{bases:t('Phiên bản cơ sở','基準版本'),errors:t('Lỗi','不良項目'),items:t('Tiêu chuẩn','檢驗標準')}[key[2]]}`:kind;};
    const rowLabel=(kind,row)=>moduleCollection(kind)?.[2]==='bases'?'':row.checkNo||row.code||row.id;
    const rowHeading=(kind,row)=>{const key=moduleCollection(kind);if(!key)return `${h(collectionLabel(kind))} · ${h(rowLabel(kind,row))} · ${h(row.nameVi||row.name)}`;const present=value=>value!==null&&value!==undefined&&String(value).trim()!=='';return ['IPQC',key[1],{bases:t('Phiên bản cơ sở','基準版本'),errors:t('Lỗi','不良項目'),items:t('Tiêu chuẩn','檢驗標準')}[key[2]],key[2]==='bases'?undefined:[row.checkNo,row.code,row.id].find(present),[row.nameVi,row.name].find(present)].filter(present).map(h).join(' · ');};
    const overlay=document.createElement('div');overlay.className='shared-restore-overlay';overlay.dataset.i18nSkip='true';const opener=document.activeElement;let listing=null,review=null,itemPage=0,loading=false,permissionTimer,legacy=!!legacyFirst&&!!client.legacyHistory;
    const close=()=>{clearTimeout(permissionTimer);overlay.remove();unlockScroll(overlay);document.removeEventListener('keydown',keyboard,true);if(opener?.isConnected)opener.focus({preventScroll:true});};
    const keyboard=e=>{if(document.querySelector('dialog[open]')||[...document.querySelectorAll('.shared-restore-overlay')].at(-1)!==overlay)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}if(e.key==='Tab'){const buttons=[...overlay.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first||!e.shiftKey&&document.activeElement===last){e.preventDefault();(e.shiftKey?last:first)?.focus();}}};
    const checkPermission=()=>{permissionTimer=setTimeout(async()=>{try{const state=await client.permissions();if(!state.permissions?.history){close();return;}}catch(e){if([401,403].includes(e.status)){close();return;}}const restoreButton=overlay.querySelector('[data-restore]');if(restoreButton&&!restoreAllowed())restoreButton.disabled=true;if(overlay.isConnected)checkPermission();},4000);};
    const labels={name:'Tên / 名稱',nameVi:'Tên / 名稱',description:'Mô tả / 敘述',standard:'Tiêu chuẩn / 標準',code:'Mã / 代碼',checkNo:'Mã kiểm tra / 檢查編號',equipmentId:'Thiết bị / 檢具',productCodes:'Sản phẩm / 產品',rule:'Tần suất / 頻率',rules:'Tần suất / 頻率',note:'Ghi chú / 備註',notes:'Ghi chú / 備註',isEnabled:'Kích hoạt / 啟用',enabled:'Kích hoạt / 啟用'};
    const photos=row=>row?[...(row.photos||[]),...(row.mediaItems||[]),...(row.standardPhotos||[]),...(row.methodPhotos||[]),...(row.photoId?[{id:row.photoId}]:[])].map(p=>({...p,url:client.mediaURL(p)})).filter(p=>p.url).map(p=>`<img decoding="async" src="${h(p.url)}" alt="${h(p.name||t('Ảnh tại thời điểm gửi','送審當時圖片'))}" loading="lazy" width="160" height="120" style="object-fit:contain;max-width:100%">`).join(''):'';
    const fields=row=>!row?`<p>${t('Không tồn tại','不存在')}</p>`:`<dl>${Object.entries(row).filter(([key])=>!['photos','mediaItems','standardPhotos','methodPhotos','photoId'].includes(key)).map(([key,value])=>`<dt>${h(labels[key]||key)}</dt><dd style="white-space:pre-wrap;overflow-wrap:anywhere">${h(typeof value==='object'?JSON.stringify(value,(_k,v)=>typeof v==='string'&&v.startsWith('data:')?'[Ảnh / 圖片]':v,null,2):value)}</dd>`).join('')}</dl>${photos(row)}`;
    const draw=()=>{
      const oldCollections={...historyCollections(review?.before)},newCollections={...historyCollections(review?.content)};
      if(review?.linkedProcess){for(const [stage,templates]of Object.entries(review.linkedProcess.before||{}))oldCollections['PROCESS · '+stage]=templates;for(const [stage,templates]of Object.entries(review.linkedProcess.content||{}))newCollections['PROCESS · '+stage]=templates;}
const rows=review?[...new Set([...Object.keys(newCollections),...Object.keys(oldCollections)])].flatMap(kind=>{const before=oldCollections[kind]||[],after=newCollections[kind]||[];if(!Array.isArray(before)||!Array.isArray(after))return[];const oldRows=new Map(before.map((r,index)=>[historyRowKey(r,index),r])),newRows=new Map(after.map((r,index)=>[historyRowKey(r,index),r]));return [...new Set([...oldRows.keys(),...newRows.keys()])].map(id=>{const old=oldRows.get(id),value=newRows.get(id);return{kind,row:value||old,after:value,old};});}):[];
      overlay.innerHTML=`<section class="shared-restore-dialog" role="dialog" aria-modal="true" aria-label="${t('Hồ sơ gửi duyệt','送審案件')}"><header><h3>${legacy?t('Phiên bản cũ · chỉ đọc','舊版本封存 · 唯讀'):t(masterScope?'Hồ sơ gửi duyệt · chỉ đọc':'Hồ sơ cố định · chỉ đọc',masterScope?'送審案件 · 唯讀':'固定案件 · 唯讀')}</h3><button data-close>×</button></header><main>${loading?`<p>${t('Đang tải','載入中')}</p>`:review?`<p>${h(review.id)} · ${h(statusLabel(review.status))}</p><p>${h(review.actor.name)} · ${h(review.at)}<br>${h(review.reason)}</p>${review.contentIssues?`<details class="vd-advisory"><summary>${t('Dữ liệu cần bổ sung trong hồ sơ cố định','固定案件待補')} · ${review.contentIssues.issues.length}</summary><p>${review.result?.contentIssuesConfirmed?t('Đã xác nhận duyệt kèm các mục cần bổ sung','已明確確認帶待補核准'):t('Các mục này không chặn duyệt','以下待補不阻擋核准')}</p>${review.contentIssues.issues.map(i=>`<p>${h(window.VersionDraftUI?.issueMessage(i)||i.message)} · ${h(i.path.map(p=>typeof p==='string'?p:p.id).join(' / '))}</p>`).join('')}</details>`:''}<p>${h(review.result?.actor.name)} · ${h(review.result?.at)} · ${h(review.result?.reason)}</p>${rows.slice(itemPage*10,itemPage*10+10).map(({kind,row,after,old})=>`<article><h4>${rowHeading(kind,row)}</h4><div class="shared-restore-diff"><section><h4>${review.legacy?t('Không có bản đối chiếu cũ','未提供舊版比較基準'):t('Trước khi gửi','送審前')}</h4>${fields(old)}</section><section><h4>${review.legacy?t('Nội dung phiên bản cũ','舊版本內容'):t('Nội dung đã gửi','送審固定內容')}</h4>${fields(after)}</section></div></article>`).join('')}<nav><button data-prev ${itemPage===0?'disabled':''}>${t('Trước','上一頁')}</button>${itemPage+1} / ${Math.max(1,Math.ceil(rows.length/10))}<button data-next ${(itemPage+1)*10>=rows.length?'disabled':''}>${t('Sau','下一頁')}</button></nav>`:(listing?.cases||[]).map(c=>`<article><p>${h(c.actor.name)} · ${h(c.at)} · ${h(statusLabel(c.status))}</p><p>${h(c.reason)}</p><button data-case="${h(c.id)}">${t('Xem hồ sơ','查看案件')}</button></article>`).join('')||`<p>${t('Chưa có hồ sơ','尚無案件')}</p>`}</main><footer>${review?.status==='pending'&&review.id===caseId&&onReview&&!legacy?reviewActions.map(a=>`<button type="button" class="button ${a.name==='approve'?'signal':'ghost'}" data-history-review="${h(a.name)}" ${a.enabled?'':'disabled'}>${h(a.label)}</button>`).join(''):''}${review?`<button data-back>${t('Danh sách','案件清單')}</button>${restoreAllowed()&&review.savedId?`<button data-restore>${t(masterScope?'Xem trước khôi phục vào bản nháp':'Xem trước khôi phục',masterScope?'預覽還原到草稿':'預覽還原')}</button>`:''}`:listing?.next?`<button data-more>${t('Trang sau','下一頁')}</button>`:''}${client.legacyHistory?`<button data-archive>${legacy?t('Hồ sơ gửi duyệt','送審案件'):t(masterScope?'Xem phiên bản cũ (chỉ đọc)':'Phiên bản cũ',masterScope?'查看舊版封存（唯讀）':'舊版本封存')}</button>`:''}<button data-close>${t('Về phạm vi hiện tại','返回目前範圍')}</button></footer></section>`;
      // Prevent overlapping list/case reads from replacing the selected history view.
      if(loading)overlay.querySelectorAll('button:not([data-close])').forEach(button=>button.disabled=true);
      overlay.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
      overlay.querySelectorAll('[data-history-review]').forEach(button=>button.onclick=async()=>{const buttons=[...overlay.querySelectorAll('button')],disabled=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);try{if(await onReview(button.dataset.historyReview,review.id))close();}catch(error){showError(error);}finally{buttons.forEach((b,i)=>b.disabled=disabled[i]);}});
      overlay.querySelector('[data-archive]')?.addEventListener('click',async()=>{legacy=!legacy;review=null;await loadList();});
      overlay.querySelectorAll('[data-case]').forEach(b=>b.onclick=()=>loadCase(b.dataset.case));
      overlay.querySelector('[data-back]')?.addEventListener('click',()=>{review=null;draw();});
      overlay.querySelector('[data-more]')?.addEventListener('click',()=>loadList(listing.next));
      overlay.querySelector('[data-prev]')?.addEventListener('click',()=>{itemPage--;draw();});overlay.querySelector('[data-next]')?.addEventListener('click',()=>{itemPage++;draw();});
      overlay.querySelector('[data-restore]')?.addEventListener('click',async()=>{if(!restoreAllowed())return;try{await window.previewSharedDraftRestore({client,masterScope,savedId:review.savedId,onApplied:async result=>{await onApplied(result);close();}});}catch(error){showError(error);}});
    };
    function showError(error){const p=document.createElement('p');p.role='alert';p.textContent=window.sharedDraftErrorMessage(error);overlay.querySelector('main').prepend(p);}
async function loadList(before){loading=true;draw();try{if(legacy){const result=await client.legacyHistory(before);listing={...result,cases:result.versions.map(v=>({id:v.id,status:v.status,actor:{name:v.creatorName||v.creatorId||''},at:v.updatedAt||v.createdAt||'',reason:[v.category,v.line,'V'+v.number].filter(Boolean).join(' · ')}))};}else listing=await client.history(before);review=null;}catch(e){loading=false;draw();showError(e);return;}loading=false;draw();}
    async function loadCase(id){loading=true;draw();try{if(legacy){const v=(await client.legacyVersion(id)).legacyVersion;review={id:v.id,status:v.status,actor:{name:v.creatorName||v.creatorId||''},at:v.updatedAt||v.createdAt||'',reason:t('Bản cũ được giữ nguyên. Thời gian từ dữ liệu cũ; không phải lần lưu bản nháp hiện tại.','完整保留舊版；時間來自舊資料，不代表本次草稿的儲存紀錄。'),before:{},content:v.snapshot||{workspaces:[{id:JSON.stringify([v.category,v.line]),category:v.category,line:v.line,stages:v.stages||{}}]},legacy:true};}else review=(await client.reviewCase(id)).reviewCase;itemPage=0;}catch(e){loading=false;draw();showError(e);return;}loading=false;draw();}
    document.body.append(overlay);lockScroll(overlay);document.addEventListener('keydown',keyboard,true);await loadList();if(legacy&&legacyVersionId)await loadCase(legacyVersionId);else if(caseId)await loadCase(caseId);else if(versionPreview){review={id:versionPreview.id,status:versionPreview.status,actor:{name:versionPreview.creatorName||t('Chưa ghi nhận','未記錄')},at:versionPreview.createdAt||t('Chưa ghi nhận','未記錄'),reason:t('Chi tiết phiên bản · chỉ đọc','版本詳情 · 唯讀'),before:{},content:versionPreview.snapshot,contentIssues:versionPreview.contentIssues,legacy:true};draw();}checkPermission();overlay.querySelector('[data-close]').focus({preventScroll:true});
  };
  // Shared restore preview is read-only until an explicit, revision-checked apply.
  window.previewSharedDraftRestore=async({client,savedId,onApplied,masterScope=null})=>{
    const restoreOwner=captureRestoreOwner(),restoreAllowed=()=>restoreOwnerCurrent(restoreOwner)&&['history','edit','restore'].every(key=>client.permission(key)===true);
    if(!restoreAllowed())throw Error('RESTORE_PERMISSION_REQUIRED');
    const preview=await client.previewRestore(savedId),zh=document.documentElement.lang.startsWith('zh');
    if(!restoreAllowed())throw Error('RESTORE_PERMISSION_REQUIRED');
    const t=(vi,cn)=>zh?cn:vi,h=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const opener=document.activeElement,overlay=document.createElement('div');overlay.className='shared-restore-overlay';
    const rows=[];
    const beforeCollections=historyCollections(preview.before),afterCollections=historyCollections(preview.after);
    for(const collection of new Set([...Object.keys(beforeCollections),...Object.keys(afterCollections)])){
      const before=beforeCollections[collection]||[],after=afterCollections[collection]||[];
      if(!Array.isArray(before)||!Array.isArray(after))continue;
      const old=new Map(before.map((row,index)=>[historyRowKey(row,index),row])),next=new Map(after.map((row,index)=>[historyRowKey(row,index),row]));
      for(const id of new Set([...old.keys(),...next.keys()])){
        const a=old.get(id),b=next.get(id);if(JSON.stringify(a)===JSON.stringify(b))continue;
        rows.push({label:b?.checkNo||b?.code||a?.checkNo||a?.code||id,collection,before:a,after:b});
      }
    }
    const masterImpact=()=>{
      if(!['AB','C'].includes(masterScope))return '';
      const scope=masterScope==='AB'?t('Toàn bộ AB (chuyền A, B)','整個 AB（A、B 線）'):t('Toàn bộ C (chuyền C)','整個 C（C 線）');
      const labels={products:t('Sản phẩm','產品'),categoryGroups:t('Nhóm sản phẩm','類別'),lines:t('Chuyền','線別'),stages:t('Công đoạn','工段')},changes=window.VersionDraftUI.masterChanges(preview.before,preview.after);
      const summary=Object.entries(labels).map(([key,label])=>{const changed=changes.filter(row=>row.kind===key);return `<li data-restore-count="${key}"><b>${label}</b> · ${t('Thêm','新增')} ${changed.filter(row=>row.action==='added').length} · ${t('Sửa','修改')} ${changed.filter(row=>row.action==='modified').length} · ${t('Bỏ','移除')} ${changed.filter(row=>row.action==='removed').length}</li>`;}).join('');
      return `<section class="shared-restore-impact" data-master-restore-scope="${masterScope}"><strong>${t('Phạm vi khôi phục','還原範圍')}：${scope}</strong><p>${t('Bộ lọc không thu hẹp phạm vi. Nội dung lịch sử sẽ thay thế bản nháp chung hiện tại, kể cả thay đổi chưa lưu. Muốn giữ nội dung hiện tại, hãy hủy và lưu trước.','篩選不縮小還原範圍。歷史內容將取代目前共用草稿，包括未儲存修改。若要保留現在內容，請先取消並儲存。')}</p><ul>${summary}</ul><p>${t('Các khác biệt bên dưới đối chiếu bản nháp hiện tại và nội dung sau khi khôi phục. Vẫn cần lưu, gửi duyệt và phê duyệt để có hiệu lực.','下方差異列出目前草稿與還原後內容。套用後仍須儲存、送審及核准才會正式生效。')}</p></section>`;
    };
    let page=0,busy=false,permissionTimer;
    const checkPermission=()=>{permissionTimer=setTimeout(async()=>{
      try{const state=await client.permissions();if(!state.permissions?.history||!state.permissions?.edit||!restoreAllowed()){close(true);return;}}
      catch(error){if([401,403].includes(error.status)){close(true);return;}}
      if(!restoreAllowed()){close(true);return;}
      if(overlay.isConnected)checkPermission();
    },4000);};
    const labels={nameVi:'Tên / 名稱',name:'Tên / 名稱',standard:'Tiêu chuẩn / 標準',description:'Mô tả / 敘述',methodVi:'Phương pháp / 方法',note:'Ghi chú / 備註',equipmentId:'Thiết bị / 檢具',rules:'Tần suất / 頻率',rule:'Tần suất / 頻率',photos:'Ảnh / 圖片',mediaItems:'Ảnh / 圖片',deleted:'Đã xóa / 刪除',isDeleted:'Đã xóa / 刪除'};
    function fieldValue(key,value){
      const mediaKeys=['photos','mediaItems','standardPhotos','methodPhotos'];
      const media=mediaKeys.includes(key)&&Array.isArray(value)?value:key==='photoId'&&value?[{id:value}]:null;
      if(media)return media.map(photo=>{const url=client.mediaURL(photo);return url?`<figure><img decoding="async" loading="lazy" width="160" height="120" style="object-fit:contain;max-width:100%" src="${h(url)}" alt="${h(photo.name||t('Ảnh lịch sử','歷史圖片'))}"><figcaption>${h(photo.name||'')}</figcaption></figure>`:`<p>${t('Ảnh không khả dụng','圖片不可用')}</p>`;}).join('')||'—';
      return h(typeof value==='object'?JSON.stringify(value,(_key,v)=>typeof v==='string'&&v.startsWith('data:')?'[Ảnh / 圖片]':v,2):typeof value==='string'&&value.startsWith('data:')?'[Ảnh / 圖片]':value);
    }
    function fields(row,other){if(!row)return `<p>${t('Không tồn tại','不存在')}</p>`;return `<dl>${Object.keys({...row,...other}).filter(k=>JSON.stringify(row[k])!==JSON.stringify(other?.[k])).map(k=>`<dt>${h(labels[k]||k)}</dt><dd>${fieldValue(k,row[k])}</dd>`).join('')}</dl>`;}
    function render(){overlay.innerHTML=`<section class="shared-restore-dialog" role="dialog" aria-modal="true" aria-labelledby="shared-restore-title"><header><h3 id="shared-restore-title">${t('Xem trước khôi phục lịch sử','歷史還原差異預覽')}</h3><button type="button" data-close aria-label="${t('Đóng','關閉')}">×</button></header><main>${masterImpact()}<p>${t('Áp dụng chỉ thay đổi bản nháp chung chưa lưu. Không lưu tự động, không sửa hồ sơ lịch sử.','套用只產生共用草稿的未儲存修改；不會自動儲存，不改寫歷史案件。')}</p><p>${h(preview.source.actor.name)} · ${h(preview.source.at)} · ${h(preview.restoreSaveId)}</p><p>${rows.length} ${t('mục thay đổi','筆變更')} · ${t('Phiên bản bản nháp','草稿版本')} ${preview.expectedRevision}</p>${!rows.length?`<p class="shared-restore-no-change" role="status">${t('Nội dung lịch sử trùng với bản nháp hiện tại; không cần khôi phục.','歷史內容與目前草稿相同，無需還原。')}</p>`:''}<div role="alert" id="shared-restore-error"></div>${rows.slice(page*10,page*10+10).map(row=>`<article><h4>${h(row.collection)} · ${h(row.label)}</h4><div class="shared-restore-diff"><section><h4>${t('Bản nháp hiện tại','目前草稿')}</h4>${fields(row.before,row.after)}</section><section><h4>${t('Sau khi áp dụng','還原套用後')}</h4>${fields(row.after,row.before)}</section></div></article>`).join('')}<nav><button type="button" data-prev ${!page?'disabled':''}>${t('Trước','上一頁')}</button><span>${page+1} / ${Math.max(1,Math.ceil(rows.length/10))}</span><button type="button" data-next ${(page+1)*10>=rows.length?'disabled':''}>${t('Sau','下一頁')}</button></nav></main><footer><button type="button" data-close>${t('Hủy','取消')}</button><button type="button" data-apply ${!rows.length||!restoreAllowed()?'disabled':''}>${t('Xác nhận áp dụng · chưa lưu','確認套用 · 尚未儲存')}</button></footer></section>`;
      overlay.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
      overlay.querySelector('[data-prev]').onclick=()=>{page--;render();};overlay.querySelector('[data-next]').onclick=()=>{page++;render();};
      overlay.querySelector('[data-apply]').onclick=async()=>{if(busy||!overlay.isConnected||!restoreAllowed())return;busy=true;overlay.querySelectorAll('button').forEach(b=>b.disabled=true);
        try{const result=await client.command(preview.generation,'restore',{restoreSaveId:preview.restoreSaveId,expectedRevision:preview.expectedRevision});await onApplied(result);busy=false;close();}
        catch(error){busy=false;if([401,403].includes(error.status)){close(true);return;}render();overlay.querySelector('#shared-restore-error').textContent=error.message==='RESTORE_RECONFIRM'?t('Bản nháp đã thay đổi. Đóng và xem trước lại; chưa áp dụng.','草稿已改變，請關閉並重新預覽；尚未套用。'):window.sharedDraftErrorMessage(error);}
      };
    }
    function close(force=false){if(busy&&force!==true)return;clearTimeout(permissionTimer);overlay.remove();unlockScroll(overlay);document.removeEventListener('keydown',keyboard,true);if(opener?.isConnected)opener.focus({preventScroll:true});}
    function keyboard(e){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}if(e.key==='Tab'){const buttons=[...overlay.querySelectorAll('button:not(:disabled)')];const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first||!e.shiftKey&&document.activeElement===last){e.preventDefault();(e.shiftKey?last:first)?.focus();}}}
    render();document.body.append(overlay);lockScroll(overlay);document.addEventListener('keydown',keyboard,true);overlay.querySelector('[data-close]').focus({preventScroll:true});checkPermission();
  };
})();
