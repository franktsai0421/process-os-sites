(() => {
  const epochKey=(scope,actor)=>'routine-reset-client-epoch:'+scope+':'+encodeURIComponent(actor);
  const epoch=(scope,actor)=>window.localStorage?.getItem(epochKey(scope,actor))||'';
  async function markers(rows){
    return Promise.all(rows.map(async row=>({operationId:row.operationId,clientEvidence:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(row.key+'\0'+row.raw))),b=>b.toString(16).padStart(2,'0')).join('')})));
  }
  async function settle(scope,actor,receipt,readback,rows){
    const capturedEpoch=epoch(scope,actor),current=()=>capturedEpoch===epoch(scope,actor)&&(!window.ProcessSync?.identity||window.ProcessSync.identity.id===actor);
    if(!current())throw Error('RESET_SETTLEMENT_SUPERSEDED');
    if(!['fqc','iqc'].includes(scope)||receipt?.scope!==scope||receipt.actorId!==actor||!Number.isSafeInteger(receipt.generationRevision)||receipt.generationRevision<1||!Array.isArray(receipt.settlements))throw Error('RESET_SETTLEMENT_INVALID');
    const next=await readback(),floor=scope==='fqc'?next.control?.resetGenerationRevision:next.resetGenerationRevision;
    if(next.identity?.id!==actor||!Number.isSafeInteger(floor)||floor<receipt.generationRevision)throw Error('RESET_READBACK_REQUIRED');
    const descriptors=await markers(rows),selected=[];
    for(const proof of receipt.settlements){
      if(proof.status!=='superseded-by-reset'||!['committed','registered','unknown'].includes(proof.priorOutcome))throw Error('RESET_SETTLEMENT_INVALID');
      const i=descriptors.findIndex(d=>d.operationId===proof.operationId&&d.clientEvidence===proof.clientEvidence);
      if(i<0){if(descriptors.some(d=>d.operationId===proof.operationId))throw Error('RESET_PENDING_CHANGED');continue;} // Already-cleared evidence is replayable; changed evidence stays blocked.
      const row=rows[i];if(row.storage.getItem(row.key)!==row.raw)throw Error('RESET_PENDING_CHANGED');selected.push(row);
    }
    if(!current())throw Error('RESET_SETTLEMENT_SUPERSEDED');
    // No awaits between final matching and removal. A storage failure keeps reset recovery.
    for(const row of selected){if(row.storage.getItem(row.key)!==row.raw)throw Error('RESET_PENDING_CHANGED');row.storage.removeItem(row.key);if(row.storage.getItem(row.key)!==null)throw Error('RESET_PENDING_CHANGED');}
    return next;
  }
  async function json(url, options) {
    const res = await fetch(url, {cache:'no-store', ...options});
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error), {status:res.status});
    return data;
  }
  function bind(root, scope, actor, t, safe, reload, pending) {
    const panel=root.querySelector('details.rf-fqc-administration');
    if(!panel || panel.querySelector('[data-reset-panel]'))return;
    const box=document.createElement('section');
    box.dataset.resetPanel=scope;
    panel.append(box);
    const key='routine-reset:v1:'+scope+':'+actor;
    const url='/api/routine-reset?scope='+scope;
    const token='RESET '+scope.toUpperCase();
    let busy=false, serial=0;
    const current=()=>box.isConnected && (!window.ProcessSync?.identity || window.ProcessSync.identity.id===actor);
    function add(tag,text,parent=box){
      const node=document.createElement(tag);
      node.textContent=text;
      parent.append(node);
      return node;
    }
    function button(title,action,parent=box){
      const control=add('button',title,parent);
      control.type='button';control.className='rf-btn';
      control.onclick=action;
      return control;
    }
    function status(text){
      const message=add('p',text);
      message.setAttribute('role','status');
    }
    async function reloadConfirmed(id){
      if(sessionStorage.getItem(key)!==id)return;
      try{
        if(pending){
          const receipt=await json(url+'&operationId='+encodeURIComponent(id));
          if(receipt.id!==id||receipt.scope!==scope||receipt.actorId!==actor)throw Error('RESET_SETTLEMENT_INVALID');
          await pending.settle(receipt);
        }else await reload();
        if(sessionStorage.getItem(key)!==id)throw Error('RESET_PENDING_CHANGED');
        sessionStorage.removeItem(key);
        if(pending)await reload();
      }catch{
        if(!sessionStorage.getItem(key))sessionStorage.setItem(key,id);
        if(current())recovery(id);
      }
    }
    function recovery(id){
      box.replaceChildren();
      status(t('RESET 結果待查證，請查原回執。','Chưa xác định kết quả RESET. Hãy kiểm tra biên nhận.'));
      button(t('查原回執','Kiểm tra biên nhận'),async()=>{
        if(busy)return;
        busy=true;
        try{
          const receipt=await json(url+'&operationId='+encodeURIComponent(id));
          if(!current()||receipt.id!==id||receipt.scope!==scope||sessionStorage.getItem(key)!==id)return;
          if(!safe()){status(t('已確認清除，請先處理目前編輯再更新清單。','Đã xác nhận RESET. Xử lý chỉnh sửa hiện tại trước khi tải lại.'));return;}
          await reloadConfirmed(id);
        }catch(error){if(current())status(error.status===404?t('尚未找到回執。','Chưa tìm thấy biên nhận.'):t('查詢失敗，請再查原回執。','Không truy vấn được. Hãy kiểm tra lại biên nhận.'));}
        finally{busy=false;}
      });
    }
    function confirmation(cap,trigger){
      if(!current()||!safe()||busy||box.querySelector('dialog')||sessionStorage.getItem(key))return;
      const dialog=add('dialog','');
      dialog.className='rf-modal';
      const form=add('form','',dialog);
      const title=add('h2',t('確認','Xác nhận')+' '+token,form);
      title.id='routine-reset-title-'+scope;
      dialog.setAttribute('aria-labelledby',title.id);
      dialog.onclose=()=>{
        dialog.remove();
        if(current()&&trigger.isConnected&&!busy)trigger.focus({preventScroll:true});
      };
      dialog.oncancel=event=>{event.preventDefault();dialog.close();};
      add('p',scope.toUpperCase()+' · '+t('永久清除開始日期、所有期別、計畫、報告、不合格、異常、復測、免測、處置與例行送審歷史（含待審）。保留來源主檔、頻率、照片及其他模組。','Xóa vĩnh viễn ngày bắt đầu, các kỳ, kế hoạch, báo cáo, mục không đạt, bất thường, kiểm tra lại, miễn kiểm, xử lý và lịch sử xét duyệt định kỳ, kể cả hồ sơ chờ duyệt. Giữ dữ liệu nguồn, tần suất, ảnh và các mô-đun khác.'),form);
      if(pending)add('p',t('已列入的待確認操作將由本次 RESET 結案；查無回執不代表原操作失敗。','Các thao tác chưa xác định được kết thúc bởi RESET; thiếu biên nhận không có nghĩa thao tác đã thất bại.')+' · '+cap.pending.length,form);
      add('p',t('將清除的待審件數','Số hồ sơ chờ duyệt sẽ bị xóa')+' · '+cap.pendingCount,form);
      const reason=add('textarea','',add('label',t('清除原因','Lý do xóa'),form));
      reason.required=true;reason.maxLength=500;
      const typed=add('input','',add('label',t('請完整輸入','Nhập chính xác')+' '+token,form));
      typed.required=true;typed.autocomplete='off';
      const ackLabel=add('label','',form);
      ackLabel.className='rf-confirm-ack';
      const ack=add('input','',ackLabel);
      ack.type='checkbox';ack.required=true;
      add('span',t('我確認此操作無法復原','Tôi hiểu thao tác này không thể hoàn tác'),ackLabel);
      const actions=add('div','',form);
      actions.className='rf-actions';
      const cancel=button(t('取消','Hủy'),()=>dialog.close(),actions);
      const submit=add('button',t('永久清除','Xóa vĩnh viễn'),actions);
      submit.type='submit';submit.className='rf-btn';submit.disabled=true;
      const valid=()=>ack.checked&&typed.value===token&&reason.value.trim()&&safe();
      form.oninput=()=>{submit.disabled=!valid();};
      form.onsubmit=async event=>{
        event.preventDefault();
        if(busy||!current()||!dialog.open||!valid()||sessionStorage.getItem(key))return;
        if(pending&&JSON.stringify(await pending.capture())!==JSON.stringify(cap.pending))return;
        if(busy||!current()||!dialog.open||!valid()||sessionStorage.getItem(key))return;
        const id=crypto.randomUUID();
        if(pending){const storage=window.localStorage,k=epochKey(scope,actor);storage.setItem(k,id);if(storage.getItem(k)!==id)return;pending.invalidate();}
        sessionStorage.setItem(key,id);
        submit.disabled=true;busy=true;
        dialog.close();
        box.replaceChildren();
        status(t('正在確認 RESET 結果…','Đang xác minh kết quả RESET…'));
        let confirmed=false;
        try{
          const result=await json(url,{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({scope,id,confirm:token,irreversibleAck:true,reason:reason.value.trim(),pendingCount:cap.pendingCount,revision:cap.revision,...(pending?{pending:cap.pending}:{})})});
          confirmed=result.revision===cap.revision+1;
        }catch(error){
          if(current()&&['RESET_UNAVAILABLE','FORBIDDEN','INVALID_SCOPE','INVALID_CONFIRMATION','REVISION_CONFLICT','INVALID_CONTROL_REVISION'].includes(error.message)){
            sessionStorage.removeItem(key);box.replaceChildren();
            status(t('未執行。請重新核對權限及最新資料。','Chưa thực hiện. Kiểm tra lại quyền và dữ liệu mới nhất.'));
            button(t('重新核對','Kiểm tra lại'),show);return;
          }
        }finally{busy=false;}
        if(!current())return;
        if(!confirmed||!safe()){recovery(id);return;}
        await reloadConfirmed(id);
      };
      dialog.showModal();
      cancel.focus({preventScroll:true});
    }
    async function show(){
      if(busy||!current())return;
      const attempt=++serial;
      box.replaceChildren();
      const unavailable=button(token,()=>{});unavailable.disabled=true;
      const hint=add('small',t('僅 Admin 可操作；Reset 尚未啟用或缺少權限','Chỉ Admin được sử dụng; RESET chưa bật hoặc thiếu quyền'));
      const pendingReset=sessionStorage.getItem(key);
      if(pendingReset){recovery(pendingReset);return;}
      try{
        const cap=await json(url+'&capability=1');
        if(current()&&attempt===serial&&cap.available!==true)hint.textContent=t('Reset 尚未啟用；僅 Admin 可操作','RESET chưa được bật; chỉ Admin được sử dụng');
        if(!current()||attempt!==serial||!panel.open||cap.available!==true||cap.actorId!==actor||cap.scope!==scope||
          !Number.isSafeInteger(cap.revision)||!Number.isSafeInteger(cap.pendingCount))return;
        if(pending)cap.pending=await pending.capture();
        if(!current()||attempt!==serial)return;
        unavailable.remove();hint.remove();
        const control=button(token+' · '+t('不可恢復','Không thể hoàn tác'),()=>confirmation(cap,control));
        control.disabled=!safe();
      }catch{hint.textContent=t('僅 Admin 可操作；需要模組權限','Chỉ Admin được sử dụng; cần quyền mô-đun');}
    }
    panel.addEventListener('toggle',()=>{if(panel.open)void show();else{serial++;box.replaceChildren();}});
    if(panel.open)return show();
  }
  window.RoutineReset={bind,epoch,markers,settle};
})();
