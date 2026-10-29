/* Shared V3 transport: one ordered client stream, bounded requests and unknown-result lookup. */
(() => {
  // Display only: retain raw transport/classifier/receipt errors.
  window.sharedDraftErrorMessage = (error, language = document.documentElement.lang) => {
    const messages = {
      RESTORE_PERMISSION_REQUIRED:['沒有還原歷史至草稿的權限，資料未變更。','Không có quyền khôi phục lịch sử vào bản nháp; dữ liệu chưa thay đổi.'],
      RESTORE_DELETE_PERMISSION_REQUIRED:['這次還原會刪除草稿資料，需要刪除權限；資料未變更。','Khôi phục này sẽ xóa dữ liệu nháp và cần quyền Xóa; dữ liệu chưa thay đổi.'],
      RESTORE_CREATE_PERMISSION_REQUIRED:['這次還原會新增或恢復資料，需要新增權限；資料未變更。','Khôi phục này sẽ thêm hoặc khôi phục dữ liệu và cần quyền Thêm; dữ liệu chưa thay đổi.'],
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
  const clients=new Set(),transports=new Map();
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
  window.createSharedDraftClient = ({endpoint,actorId,headers,legacyArchive=false,permissionGates,conditionalState=false}) => {
    // Only the existing relative authoring route gets longer mutation tolerance.
    // Other/absolute endpoints retain 15s; GET remains 45s. This is not proof of
    // commit: unknown-result receipt validation and retry admission stay intact.
    const mutationDeadline=/^\/api\/process-authoring\/workflow(?:\?|$)/.test(endpoint)?45000:15000;
    const transportKey=actorId+':'+endpoint;
    if(transports.has(transportKey)){const cached=transports.get(transportKey);if(permissionGates)cached.setPermissionGates(permissionGates);if(conditionalState)cached.useStateRevision();return legacyArchive?cached.withLegacyArchive():cached;}
    let access=null,gates=permissionGates,permissionNotice=null,validation=null;
    const gateControls=(revoked=false)=>{if(!access||!gates)return;let changedElement=null;for(const [permission,selector]of Object.entries(gates))if(access[permission]===false)document.querySelectorAll?.(selector).forEach(element=>{if(!element.disabled)changedElement=element;element.disabled=true;element.setAttribute('aria-disabled','true');});if(revoked&&changedElement&&!permissionNotice?.isConnected){const root=changedElement.closest('#data-content,#fixture')||document.querySelector('#data-content');if(root){permissionNotice=document.createElement('p');permissionNotice.className='master-edit-note';permissionNotice.setAttribute('role','alert');permissionNotice.textContent=document.documentElement.lang==='vi'?'Quyền thao tác đã thay đổi; giữ đầu vào hiện tại. Tải lại và kiểm tra quyền trước khi tiếp tục.':'操作權限已變更；保留目前輸入，請重新載入核對權限後繼續。';root.prepend(permissionNotice);}}};
    const clientId=crypto.randomUUID(),syncFailures=new Map();let sequence=0,tail=Promise.resolve(),unknown=null,queued=0,recoveryInvalid=false,conditionalRead=null;
    const assertOwner=()=>{if(window.ProcessSync&&window.ProcessSync.identity?.id!==actorId)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');if(recoveryInvalid)throw Error('RECOVERY_RECORD_INVALID');};
    // New mutation admission only; late authoritative ACK/receipt bookkeeping stays unchanged.
    const assertMutationAdmission=()=>{assertOwner();if(window.ProcessSync?.requiresReload)throw Error('DELIVERY_INVALIDATED_REOPEN_REQUIRED');};
    clients.add({actorId,queued:()=>queued,unknown:()=>!!unknown||recoveryInvalid,failed:()=>!!syncFailures.size});
    const query=value=>endpoint+(endpoint.includes('?')?'&':'?')+value;
    const key=`shared-draft-v3-operation:${actorId}:${endpoint}`;
    try { unknown=unpackCommand(JSON.parse(sessionStorage.getItem(key)||'null')); } catch { recoveryInvalid=true; /* Retain the corrupt record and block writes; never erase an uncertain operation. */ }
    const readPause=window.createScopedReadPause(endpoint.split('?')[0]);
    const readKind=url=>/[?&]operationId(?:=|&|$)/.test(url)?'receipt':/[?&]permissions(?:=|&|$)/.test(url)?'permissions':/[?&]contentIssues(?:=|&|$)/.test(url)?'inspection':/[?&]reviewMetadata(?:=|&|$)/.test(url)?'review':/[?&](?:history|uiHistory|versionId|caseId|saveId|restoreSaveId|legacyHistory|legacyVersionId)(?:=|&|$)/.test(url)?'history':'state';
    async function request(url,body) {
      if(body)assertMutationAdmission();else assertOwner();
      const readOwner=body?null:window.ProcessSync?.captureDelivery?.(),pauseOwner=body?null:readPause.capture(),kind=body?null:readKind(url);
      // Hosted immutable-state reads can exceed 15s (measured ~24s). Keep
      // non-authoring mutations at 15s and the receipt-first unknown policy.
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),body?mutationDeadline:45000);
      try {
        const response=await fetch(url+(url.includes('?')?'&':'?')+'compact=1',{method:body?'POST':'GET',headers:headers(),cache:'no-store',signal:controller.signal,...(body?{body:JSON.stringify(body.command?{...body,command:packCommand(body.command)}:body)}:{})});
        let result;try{result=await response.json();}catch(error){if(!body)readPause.denied(kind,response.status,pauseOwner,()=>request(url));throw error;}
        assertOwner();
        if(readOwner&&window.ProcessSync?.isCurrentDelivery?.(readOwner)===false)throw Error('DELIVERY_SUPERSEDED');
        if(!body)readPause.denied(kind,response.status,pauseOwner,()=>request(url));
        if(response.ok&&result.permissions){const revoked=access&&Object.keys(result.permissions).some(key=>access[key]===true&&result.permissions[key]===false);access=result.permissions;gateControls(revoked);}
        else if(!body&&[401,403].includes(response.status)){access=Object.fromEntries(['view','edit','save','submit','withdraw','approve','return','history','delete'].map(key=>[key,false]));gateControls(true);}
        if(result.wireVersion===1){const live=result.liveContent;if(!live||typeof live!=='object')throw Error('INVALID_WORKFLOW_RESPONSE');const expand=value=>{
          if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&typeof value.__liveContent==='string'){const [key,field]=value.__liveContent.split('#');if(!Object.hasOwn(live,key)||field&&(!live[key]||typeof live[key]!=='object'||!Object.hasOwn(live[key],field)))throw Error('INVALID_WORKFLOW_RESPONSE');return JSON.parse(JSON.stringify(field?live[key][field]:live[key]));}
          if(Array.isArray(value))return value.map(expand);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,expand(child)]));return value;};
          const {liveContent:_live,wireVersion:_version,...body}=result;result=expand(body);}
        if(!response.ok)throw Object.assign(Error(result.error||`HTTP ${response.status}`),{status:response.status,requestId:result.requestId,details:result.details});
        // Pair a full owned projection with its state revision. Metadata-only
        // replies must never advance this token past a model the caller has seen.
        const flow=result.control?.workflow;
        if(flow&&Number.isSafeInteger(result.revision)&&typeof flow.generation==='string'&&Number.isSafeInteger(flow.revision)&&(!conditionalRead||result.revision>=conditionalRead.revision))conditionalRead={flowToken:flow.generation+':'+flow.revision,revision:result.revision};
        if(!body)readPause.success(kind,pauseOwner);
        return result;
      } finally {clearTimeout(timer);}
    }
    function retain(command) {
      try {if(command)sessionStorage.setItem(key,JSON.stringify(packCommand(command)));else sessionStorage.removeItem(key);}
      catch(error){throw Object.assign(Error('RECOVERY_STORAGE_UNAVAILABLE'),{cause:error});}
      unknown=command;
    }
    // A successful HTTP response is not evidence that this operation committed.
    // Review receipts may rotate generation; only Apply is bound to its original one.
    function confirmedReceipt(result,operationId,generation) {
      const r=result?.receipt;
      if(!r||typeof r!=='object'||Array.isArray(r)||r.operationId!==operationId||
        typeof r.generation!=='string'||!r.generation||!Number.isSafeInteger(r.revision)||r.revision<0||
        !(r.savedId===null||typeof r.savedId==='string')||!(r.caseId===null||typeof r.caseId==='string')||
        typeof r.unchanged!=='boolean'||generation!==undefined&&r.generation!==generation){
        conditionalRead=null;
        throw Object.assign(Error('INVALID_OPERATION_RECEIPT'),{operationId});
      }
      return result;
    }
    async function resolveUnknown() {
      if(!unknown)return null;
      const command=unknown,result=confirmedReceipt(await request(query(`operationId=${encodeURIComponent(command.operationId)}`)),command.operationId,command.action==='apply'?command.generation:undefined);
      syncFailures.delete(command.operationId);if(unknown?.operationId===command.operationId)retain(null);return result;
    }
    async function post(command, retry = false) {
      assertMutationAdmission();
      if(unknown && (!retry || unknown.operationId!==command.operationId)){
        const error=Error('PREVIOUS_OPERATION_UNKNOWN');
        // A different command was never sent. Keep its failure until explicit
        // matching-field cancellation/correction; never relabel the sent unknown.
        if(unknown.operationId!==command.operationId)error.notSent=true;
        throw error;
      }
      // Keep the operation before transport so closing the tab cannot create a blind retry.
      try{if(!unknown)retain(command);}catch(error){throw Object.assign(error,{notSent:true});}
      try {const result=confirmedReceipt(await request(endpoint,{command}),command.operationId,command.action==='apply'?command.generation:undefined);retain(null);if(command.action!=='apply')validation=null;return result;}
      catch(error) {
        if(error.message==='ACCOUNT_CHANGED_REOPEN_REQUIRED')throw error;
        if(Array.isArray(error.details?.issues)&&['submit','approve'].includes(command.action))validation={issues:error.details.issues,requestId:error.requestId,generation:command.generation,savedId:command.savedId,caseId:command.caseId};
        if(error.status&&error.status<500){retain(null);throw error;}
        try {const resolved=await resolveUnknown();return {...resolved,recovered:true};}
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
      invalidateReadState(){access=null;conditionalRead=null;validation=null;},
      useStateRevision(){conditionalState=true;return client;},
      read: token=>request(token?query(`since=${encodeURIComponent(conditionalState&&conditionalRead?.flowToken===token?'state:'+conditionalRead.revision:token)}`):endpoint),
      permissions:()=>request(query('permissions=1')),
      reviewMetadata:revision=>request(query('reviewMetadata=1'+(Number.isSafeInteger(revision)?'&since='+encodeURIComponent('state:'+revision):''))),
      history: before=>request(query(`history=cases${before?`&before=${encodeURIComponent(before)}`:''}`)),
      uiHistory: options=>request(query('uiHistory=1&'+new URLSearchParams(options))),
      version: id=>request(query('versionId='+encodeURIComponent(id))),
      contentIssues: caseId=>request(query('contentIssues=1'+(caseId?'&contentCaseId='+encodeURIComponent(caseId):''))),
      ...(legacyArchive?{legacyHistory:before=>request(query(`legacyHistory=1${before?`&before=${encodeURIComponent(before)}`:''}`)),legacyVersion:id=>request(query(`legacyVersionId=${encodeURIComponent(id)}`))}:{}),
      reviewCase: id=>request(query(`caseId=${encodeURIComponent(id)}`)),
      previewRestore: id=>request(query(`restoreSaveId=${encodeURIComponent(id)}`)),
      begin:()=>request(endpoint,{action:'begin'}),
      resolveUnknown,
      retryUnknown:async()=>{assertMutationAdmission();if(!unknown)return null;const command=unknown;const result=await post(command,true);syncFailures.delete(command.operationId);return result;},
      hasUnknown:()=>!!unknown||recoveryInvalid,
      hasSyncFailures:()=>!!syncFailures.size,
      // Explicit form cancellation can discard only confirmed rejections (or
      // commands never sent), never uncertain requests or unrelated fields.
      discardRejected:paths=>{assertOwner();if(unknown)return false;const allowed=new Set(paths.map(path=>JSON.stringify(path)));
        for(const [id,failure]of syncFailures)if((failure.error.notSent||failure.error.status&&failure.error.status<500)&&failure.command.patches?.length&&failure.command.patches.every(p=>allowed.has(JSON.stringify(p.path))))syncFailures.delete(id);
        return !syncFailures.size;},
      mediaURL(photo){if(typeof photo?.src==='string'&&/^(?:data:image\/(?:png|jpeg|webp|gif|avif);base64,|\/(?!\/))/.test(photo.src))return photo.src;
        if(typeof photo?.src==='string'&&photo.src.startsWith('assets/')){const url=new URL(photo.src,location.origin+'/process/');if(url.origin===location.origin&&url.pathname.startsWith('/process/assets/'))return url.pathname+url.search;}
        return /^[a-f0-9]{64}$/.test(photo?.id||'')?endpoint.split('?')[0].replace(/\/workflow$/,'')+'/photo?id='+photo.id:'';},
      prepare(generation,action,details={}) {assertOwner();return {...details,action,generation,clientId,sequence:++sequence,operationId:crypto.randomUUID()};},
      receipt:async (id,generation)=>{assertOwner();const expected=generation??(unknown?.operationId===id&&unknown.action==='apply'?unknown.generation:undefined),result=confirmedReceipt(await request(query(`operationId=${encodeURIComponent(id)}`)),id,expected);if(unknown?.operationId===id)retain(null);syncFailures.delete(id);return result;},
      command(generation,action,details={}) {return client.sendPrepared(client.prepare(generation,action,details));},
      sendPrepared(command) {
        assertMutationAdmission();const retry=unknown?.operationId===command.operationId;queued++;const {action}=command;
        const result=tail.then(async()=>{assertMutationAdmission();if(action==='save'&&syncFailures.size)throw syncFailures.values().next().value.error;
          if(action==='submit'){const advisory=await request(query('permissions=1'));assertMutationAdmission();if(advisory.permissions?.submit&&advisory.otherReviewerAvailable===false)window.alert(document.documentElement.lang.startsWith('zh')?'目前沒有其他已啟用的審核人，仍可送審。具審核權限者可經確認後自審。':'Hiện chưa có người duyệt khác đang hoạt động. Bạn vẫn có thể gửi duyệt. Người có quyền duyệt có thể tự duyệt sau khi xác nhận.');}
          return post(command,retry);}).finally(()=>{queued--;});
        tail=result.then(()=>{syncFailures.delete(command.operationId);if(action==='apply'){
          const paths=new Set((command.patches||[]).map(p=>JSON.stringify(p.path)));
          for(const [id,failure]of syncFailures)if(failure.command.patches?.length&&failure.command.patches.every(p=>paths.has(JSON.stringify(p.path))))syncFailures.delete(id);
        }},error=>{if(action==='apply'&&!(error.message==='PREVIOUS_OPERATION_UNKNOWN'&&unknown?.operationId===command.operationId&&syncFailures.has(command.operationId)))syncFailures.set(command.operationId,{command,error});});return result;
      },
      // Only this client's already queued operations are awaited, never other users.
      flush:async()=>{assertOwner();await tail;if(syncFailures.size)throw syncFailures.values().next().value.error;if(unknown)throw Error('PREVIOUS_OPERATION_UNKNOWN');},
    };
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
  window.openSharedDraftHistory=async({client,editable,onApplied,legacyFirst=false,legacyVersionId=null,caseId=null,versionPreview=null,reviewActions=[],onReview=null})=>{
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
    const checkPermission=()=>{permissionTimer=setTimeout(async()=>{try{const state=await client.permissions();if(!state.permissions?.history){close();return;}}catch(e){if([401,403].includes(e.status)){close();return;}}if(overlay.isConnected)checkPermission();},4000);};
    const labels={name:'Tên / 名稱',nameVi:'Tên / 名稱',description:'Mô tả / 敘述',standard:'Tiêu chuẩn / 標準',code:'Mã / 代碼',checkNo:'Mã kiểm tra / 檢查編號',equipmentId:'Thiết bị / 檢具',productCodes:'Sản phẩm / 產品',rule:'Tần suất / 頻率',rules:'Tần suất / 頻率',note:'Ghi chú / 備註',notes:'Ghi chú / 備註',isEnabled:'Kích hoạt / 啟用',enabled:'Kích hoạt / 啟用'};
    const photos=row=>row?[...(row.photos||[]),...(row.mediaItems||[]),...(row.standardPhotos||[]),...(row.methodPhotos||[]),...(row.photoId?[{id:row.photoId}]:[])].map(p=>({...p,url:client.mediaURL(p)})).filter(p=>p.url).map(p=>`<img decoding="async" src="${h(p.url)}" alt="${h(p.name||t('Ảnh tại thời điểm gửi','送審當時圖片'))}" loading="lazy" width="160" height="120" style="object-fit:contain;max-width:100%">`).join(''):'';
    const fields=row=>!row?`<p>${t('Không tồn tại','不存在')}</p>`:`<dl>${Object.entries(row).filter(([key])=>!['photos','mediaItems','standardPhotos','methodPhotos','photoId'].includes(key)).map(([key,value])=>`<dt>${h(labels[key]||key)}</dt><dd style="white-space:pre-wrap;overflow-wrap:anywhere">${h(typeof value==='object'?JSON.stringify(value,(_k,v)=>typeof v==='string'&&v.startsWith('data:')?'[Ảnh / 圖片]':v,null,2):value)}</dd>`).join('')}</dl>${photos(row)}`;
    const draw=()=>{
      const oldCollections={...historyCollections(review?.before)},newCollections={...historyCollections(review?.content)};
      if(review?.linkedProcess){for(const [stage,templates]of Object.entries(review.linkedProcess.before||{}))oldCollections['PROCESS · '+stage]=templates;for(const [stage,templates]of Object.entries(review.linkedProcess.content||{}))newCollections['PROCESS · '+stage]=templates;}
const rows=review?[...new Set([...Object.keys(newCollections),...Object.keys(oldCollections)])].flatMap(kind=>{const before=oldCollections[kind]||[],after=newCollections[kind]||[];if(!Array.isArray(before)||!Array.isArray(after))return[];const oldRows=new Map(before.map((r,index)=>[historyRowKey(r,index),r])),newRows=new Map(after.map((r,index)=>[historyRowKey(r,index),r]));return [...new Set([...oldRows.keys(),...newRows.keys()])].map(id=>{const old=oldRows.get(id),value=newRows.get(id);return{kind,row:value||old,after:value,old};});}):[];
      overlay.innerHTML=`<section class="shared-restore-dialog" role="dialog" aria-modal="true" aria-label="${t('Hồ sơ gửi duyệt','送審案件')}"><header><h3>${legacy?t('Phiên bản cũ · chỉ đọc','舊版本封存 · 唯讀'):t('Hồ sơ cố định · chỉ đọc','固定案件 · 唯讀')}</h3><button data-close>×</button></header><main>${loading?`<p>${t('Đang tải','載入中')}</p>`:review?`<p>${h(review.id)} · ${h(statusLabel(review.status))}</p><p>${h(review.actor.name)} · ${h(review.at)}<br>${h(review.reason)}</p>${review.contentIssues?`<details class="vd-advisory"><summary>${t('Dữ liệu cần bổ sung trong hồ sơ cố định','固定案件待補')} · ${review.contentIssues.issues.length}</summary><p>${review.result?.contentIssuesConfirmed?t('Đã xác nhận duyệt kèm các mục cần bổ sung','已明確確認帶待補核准'):t('Các mục này không chặn duyệt','以下待補不阻擋核准')}</p>${review.contentIssues.issues.map(i=>`<p>${h(window.VersionDraftUI?.issueMessage(i)||i.message)} · ${h(i.path.map(p=>typeof p==='string'?p:p.id).join(' / '))}</p>`).join('')}</details>`:''}<p>${h(review.result?.actor.name)} · ${h(review.result?.at)} · ${h(review.result?.reason)}</p>${rows.slice(itemPage*10,itemPage*10+10).map(({kind,row,after,old})=>`<article><h4>${rowHeading(kind,row)}</h4><div class="shared-restore-diff"><section><h4>${review.legacy?t('Không có bản đối chiếu cũ','未提供舊版比較基準'):t('Trước khi gửi','送審前')}</h4>${fields(old)}</section><section><h4>${review.legacy?t('Nội dung phiên bản cũ','舊版本內容'):t('Nội dung đã gửi','送審固定內容')}</h4>${fields(after)}</section></div></article>`).join('')}<nav><button data-prev ${itemPage===0?'disabled':''}>${t('Trước','上一頁')}</button>${itemPage+1} / ${Math.max(1,Math.ceil(rows.length/10))}<button data-next ${(itemPage+1)*10>=rows.length?'disabled':''}>${t('Sau','下一頁')}</button></nav>`:(listing?.cases||[]).map(c=>`<article><p>${h(c.actor.name)} · ${h(c.at)} · ${h(statusLabel(c.status))}</p><p>${h(c.reason)}</p><button data-case="${h(c.id)}">${t('Xem hồ sơ','查看案件')}</button></article>`).join('')||`<p>${t('Chưa có hồ sơ','尚無案件')}</p>`}</main><footer>${review?.status==='pending'&&review.id===caseId&&onReview&&!legacy?reviewActions.map(a=>`<button type="button" class="button ${a.name==='approve'?'signal':'ghost'}" data-history-review="${h(a.name)}" ${a.enabled?'':'disabled'}>${h(a.label)}</button>`).join(''):''}${review?`<button data-back>${t('Danh sách','案件清單')}</button>${editable()&&client.permission('restore')===true&&review.savedId?`<button data-restore>${t('Xem trước khôi phục','預覽還原')}</button>`:''}`:listing?.next?`<button data-more>${t('Trang sau','下一頁')}</button>`:''}${client.legacyHistory?`<button data-archive>${legacy?t('Hồ sơ gửi duyệt','送審案件'):t('Phiên bản cũ','舊版本封存')}</button>`:''}<button data-close>${t('Về phạm vi hiện tại','返回目前範圍')}</button></footer></section>`;
      overlay.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
      overlay.querySelectorAll('[data-history-review]').forEach(button=>button.onclick=async()=>{const buttons=[...overlay.querySelectorAll('button')],disabled=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);try{if(await onReview(button.dataset.historyReview,review.id))close();}catch(error){showError(error);}finally{buttons.forEach((b,i)=>b.disabled=disabled[i]);}});
      overlay.querySelector('[data-archive]')?.addEventListener('click',async()=>{legacy=!legacy;review=null;await loadList();});
      overlay.querySelectorAll('[data-case]').forEach(b=>b.onclick=()=>loadCase(b.dataset.case));
      overlay.querySelector('[data-back]')?.addEventListener('click',()=>{review=null;draw();});
      overlay.querySelector('[data-more]')?.addEventListener('click',()=>loadList(listing.next));
      overlay.querySelector('[data-prev]')?.addEventListener('click',()=>{itemPage--;draw();});overlay.querySelector('[data-next]')?.addEventListener('click',()=>{itemPage++;draw();});
      overlay.querySelector('[data-restore]')?.addEventListener('click',async()=>{try{await window.previewSharedDraftRestore({client,savedId:review.savedId,onApplied:async result=>{await onApplied(result);close();}});}catch(error){showError(error);}});
    };
    function showError(error){const p=document.createElement('p');p.role='alert';p.textContent=window.sharedDraftErrorMessage(error);overlay.querySelector('main').prepend(p);}
async function loadList(before){loading=true;draw();try{if(legacy){const result=await client.legacyHistory(before);listing={...result,cases:result.versions.map(v=>({id:v.id,status:v.status,actor:{name:v.creatorName||v.creatorId||''},at:v.updatedAt||v.createdAt||'',reason:[v.category,v.line,'V'+v.number].filter(Boolean).join(' · ')}))};}else listing=await client.history(before);review=null;}catch(e){loading=false;draw();showError(e);return;}loading=false;draw();}
    async function loadCase(id){loading=true;draw();try{if(legacy){const v=(await client.legacyVersion(id)).legacyVersion;review={id:v.id,status:v.status,actor:{name:v.creatorName||v.creatorId||''},at:v.updatedAt||v.createdAt||'',reason:t('Bản cũ được giữ nguyên. Thời gian từ dữ liệu cũ; không phải lần lưu bản nháp hiện tại.','完整保留舊版；時間來自舊資料，不代表本次草稿的儲存紀錄。'),before:{},content:v.snapshot||{workspaces:[{id:JSON.stringify([v.category,v.line]),category:v.category,line:v.line,stages:v.stages||{}}]},legacy:true};}else review=(await client.reviewCase(id)).reviewCase;itemPage=0;}catch(e){loading=false;draw();showError(e);return;}loading=false;draw();}
    document.body.append(overlay);lockScroll(overlay);document.addEventListener('keydown',keyboard,true);await loadList();if(legacy&&legacyVersionId)await loadCase(legacyVersionId);else if(caseId)await loadCase(caseId);else if(versionPreview){review={id:versionPreview.id,status:versionPreview.status,actor:{name:versionPreview.creatorName||t('Chưa ghi nhận','未記錄')},at:versionPreview.createdAt||t('Chưa ghi nhận','未記錄'),reason:t('Chi tiết phiên bản · chỉ đọc','版本詳情 · 唯讀'),before:{},content:versionPreview.snapshot,contentIssues:versionPreview.contentIssues,legacy:true};draw();}checkPermission();overlay.querySelector('[data-close]').focus({preventScroll:true});
  };
  // Shared restore preview is read-only until an explicit, revision-checked apply.
  window.previewSharedDraftRestore=async({client,savedId,onApplied})=>{
    const preview=await client.previewRestore(savedId),zh=document.documentElement.lang.startsWith('zh');
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
    let page=0,busy=false,permissionTimer;
    const checkPermission=()=>{permissionTimer=setTimeout(async()=>{
      try{const state=await client.permissions();if(!state.permissions?.history||!state.permissions?.edit){close(true);return;}}
      catch(error){if([401,403].includes(error.status)){close(true);return;}}
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
    function render(){overlay.innerHTML=`<section class="shared-restore-dialog" role="dialog" aria-modal="true" aria-labelledby="shared-restore-title"><header><h3 id="shared-restore-title">${t('Xem trước khôi phục lịch sử','歷史還原差異預覽')}</h3><button type="button" data-close aria-label="${t('Đóng','關閉')}">×</button></header><main><p>${t('Áp dụng chỉ thay đổi bản nháp chung chưa lưu. Không lưu tự động, không sửa hồ sơ lịch sử.','套用只產生共用草稿的未儲存修改；不會自動儲存，不改寫歷史案件。')}</p><p>${h(preview.source.actor.name)} · ${h(preview.source.at)} · ${h(preview.restoreSaveId)}</p><p>${rows.length} ${t('mục thay đổi','筆變更')} · ${t('Phiên bản bản nháp','草稿版本')} ${preview.expectedRevision}</p><div role="alert" id="shared-restore-error"></div>${rows.slice(page*10,page*10+10).map(row=>`<article><h4>${h(row.collection)} · ${h(row.label)}</h4><div class="shared-restore-diff"><section><h4>${t('Bản nháp hiện tại','目前草稿')}</h4>${fields(row.before,row.after)}</section><section><h4>${t('Sau khi áp dụng','還原套用後')}</h4>${fields(row.after,row.before)}</section></div></article>`).join('')}<nav><button type="button" data-prev ${!page?'disabled':''}>${t('Trước','上一頁')}</button><span>${page+1} / ${Math.max(1,Math.ceil(rows.length/10))}</span><button type="button" data-next ${(page+1)*10>=rows.length?'disabled':''}>${t('Sau','下一頁')}</button></nav></main><footer><button type="button" data-close>${t('Hủy','取消')}</button><button type="button" data-apply ${!rows.length?'disabled':''}>${t('Xác nhận áp dụng · chưa lưu','確認套用 · 尚未儲存')}</button></footer></section>`;
      overlay.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
      overlay.querySelector('[data-prev]').onclick=()=>{page--;render();};overlay.querySelector('[data-next]').onclick=()=>{page++;render();};
      overlay.querySelector('[data-apply]').onclick=async()=>{if(busy)return;busy=true;overlay.querySelectorAll('button').forEach(b=>b.disabled=true);
        try{const result=await client.command(preview.generation,'restore',{restoreSaveId:preview.restoreSaveId,expectedRevision:preview.expectedRevision});await onApplied(result);busy=false;close();}
        catch(error){busy=false;render();overlay.querySelector('#shared-restore-error').textContent=error.message==='RESTORE_RECONFIRM'?t('Bản nháp đã thay đổi. Đóng và xem trước lại; chưa áp dụng.','草稿已改變，請關閉並重新預覽；尚未套用。'):window.sharedDraftErrorMessage(error);}
      };
    }
    function close(force=false){if(busy&&force!==true)return;clearTimeout(permissionTimer);overlay.remove();unlockScroll(overlay);document.removeEventListener('keydown',keyboard,true);if(opener?.isConnected)opener.focus({preventScroll:true});}
    function keyboard(e){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}if(e.key==='Tab'){const buttons=[...overlay.querySelectorAll('button:not(:disabled)')];const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first||!e.shiftKey&&document.activeElement===last){e.preventDefault();(e.shiftKey?last:first)?.focus();}}}
    render();document.body.append(overlay);lockScroll(overlay);document.addEventListener('keydown',keyboard,true);overlay.querySelector('[data-close]').focus({preventScroll:true});checkPermission();
  };
})();
