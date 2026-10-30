(() => {
  const displayDraftError = error => window.sharedDraftErrorMessage?.(error) ?? (typeof error === 'string' ? error : error?.message || String(error ?? ''));
  const API = '/api/ipqc-ab';
  const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
  const clone = value => JSON.parse(JSON.stringify(value));
  const vi = () => document.documentElement.lang === 'vi';
  const t = (zh,vn) => vi() ? vn : zh;
  const headers = () => window.ProcessSync?.platformHeaders?.() || {'Content-Type':'application/json'};
  const permitted = key => !accessBlocked&&(window.sharedDraftPermissionAllowed?.(sharedClient,key)??true)&&(typeof window.hasPermission === 'function' ? window.hasPermission(key==='approval.submit'?'view:data':key) || key==='approval.withdraw'&&window.hasPermission('view:data') : actor()?.role === 'admin');
  const permittedAction = operation => !accessBlocked&&sharedClient?.permission(operation)!==false&&(typeof window.hasPermission==='function'?window.hasPermission('ipqc-ab.'+operation):actor()?.role==='admin');
  let accessBlocked=null,lastCommandAcknowledgement=null,privateQuarantine=null,equipmentLoadGeneration=0;
  let host, reviewHost, control, catalog = {groups:[],products:[],stages:[]}, equipment = [], revision;
  let line = 'A', group = '', stage = '', errorId = '', versionId = '', working = null, busy = false;
  let pendingItemView = null;
  let modal = null, viewer = null, message = '', issues = [], reason = '';
  const modalScrolls = new Map();
  const key = () => `${line}:${group}`;
  const scope = () => control?.scopes?.[key()];
  const opened = () => scope()?.versions.find(v => ['draft','pending','pending-test'].includes(v.status));
  const active = () => scope()?.versions.find(v => v.id === scope()?.activeVersionId);
  const version = () => scope()?.versions.find(v => v.id === versionId) || opened() || active() || scope()?.versions.at(-1);
  const snapshot = () => version()?.status === 'draft' && working && version()?.id === opened()?.id ? working : version()?.snapshot || {errors:[],items:[]};
  const editing = () => !control?.moduleDraft?.workflow?.pendingId && version()?.status === 'draft' && !!working && permitted('approval.submit');
  const errors = () => snapshot().errors.filter(e => !e.deleted && e.stageCode === stage);
  const items = () => snapshot().items.filter(i => !i.deleted && i.errorId === errorId);
  const chosenError = () => snapshot().errors.find(e => e.id === errorId && !e.deleted);
  const candidates = () => catalog.products.filter(p => p.line === line && p.category === group && p.stages.includes(stage));
  let showRouteExtras=false;
  const routeStageCodes=()=>[...new Set([...(catalog.groups.find(g=>g.line===line&&g.name===group)?.defaultStages||[]),...catalog.products.filter(p=>p.line===line&&p.category===group).flatMap(p=>p.stages)])];
  const outsideStageCodes=()=>[...new Set(snapshot().errors.filter(e=>!e.deleted&&!routeStageCodes().includes(e.stageCode)).map(e=>e.stageCode))];
  const groupStages=()=>[...routeStageCodes(),...(showRouteExtras?outsideStageCodes():[])].map(code=>catalog.stages.find(s=>s.line===line&&s.code===code)||{line,code,name:t('舊路線標準','Tiêu chuẩn tuyến cũ')});
  const photoUrl = photo => photo.preview || `${API}/photo?id=${encodeURIComponent(photo.id)}`;
  const equipmentLabel = eq => eq ? `${eq.assetCode}${eq.pieceMark ? ` / ${eq.pieceMark}` : ''} · ${eq.name}` : '';
  const status = state => ({draft:t('草稿','Bản nháp'),pending:t('待審','Chờ duyệt'),
    'pending-test':t('測試待審','Đang duyệt thử'),approved:t('生效','Có hiệu lực'),
    superseded:t('歷史版','Bản cũ'),tested:t('測試完成・未生效','Thử xong · chưa hiệu lực'),
    returned:t('已發回','Đã trả lại'),withdrawn:t('已撤回','Đã rút')})[state] || state;
  const lastEdit = version => [...(version?.history||[])].reverse().find(event=>!['submit','submit-test','approve','reject','withdraw'].includes(event.action));
  const ruleLabel = rule => rule.cadence === 'batch'
    ? `${t('按批次','Theo lô')} · ${({aql:'AQL',fixed:t('固定件數','Số mẫu cố định'),quantity:t('批次數量','Số lượng lô'),custom:rule.name})[rule.kind] || rule.kind} ${rule.value || ''}`
    : `${t('按時間','Theo thời gian')} · ${({week:t('週','Tuần'),month:t('月','Tháng'),quarter:t('季','Quý'),
      'half-year':t('半年','Nửa năm'),year:t('年','Năm'),custom:rule.value})[rule.kind] || rule.kind}`;
  const actor = () => window.ProcessSync?.identity || (typeof currentUser !== 'undefined' ? currentUser : null);
  const ownPending = v => v && ['pending','pending-test'].includes(v.status) && permitted('approval.withdraw');
  let sharedClient=null,sharedIdentity='',modalBase=null,modalGeneration=null;const pollTimer=window.createForegroundPoll();let sourceEntryApplied=false;
  function transport(requestScope=key()){const id=actor()?.id,identityKey=id+':'+requestScope;if(!id)throw Error('LOGIN_REQUIRED');if(sharedIdentity!==identityKey){sharedIdentity=identityKey;sharedClient=window.createSharedDraftClient({endpoint:API+'/workflow?scope='+encodeURIComponent(requestScope)+'&caseMetadata=1',legacyArchive:true,guardAccessResults:true,conditionalState:true,actorId:id,headers,permissionGates:{edit:'#ab-apply,#ipqcab-add-item,#ipqcab-add-error,[data-ab-edit-item],[data-ab-edit-error],[data-ab-matrix-item]',save:'#ipqcab-save',submit:'#ipqcab-submit',withdraw:'#ipqcab-withdraw',history:'#ab-case-history',approve:`[data-ab-approve="${requestScope}"]`,return:`[data-ab-reject="${requestScope}"]`,delete:'[data-ab-delete-item],[data-ab-delete-error]'}});}return sharedClient;}
  function changes(base,next){
    const patches=[],guards=[];
    for(const collection of ['errors','items']){
      // Keep find()'s first-match semantics; the index is local to this Apply.
      const originals=new Map();
      for(const row of base[collection])if(typeof row.id==='string'&&!originals.has(row.id))originals.set(row.id,row);
      for(const row of next[collection]){
        const old=typeof row.id==='string'?originals.get(row.id):base[collection].find(r=>r.id===row.id);
        if(!old)continue;
        for(const [field,value]of Object.entries(row)){
          if(field==='equipmentSnapshot'||JSON.stringify(value)===JSON.stringify(old[field]))continue;
          const path=[collection,{id:row.id},field];
          patches.push({op:'set',path,value});guards.push({path,value:old[field]});
        }
      }
    }
    return{patches,guards};
  }
  async function writeShared(action,detail={}){
    if(accessBlocked)return null;
    if(busy)return null;busy=true;message='';const restoreView=window.VersionDraftUI.preserveView(host,reviewHost),requestActor=actor(),requestScope=key();let cancelled=false;try{
      // Save captures the server draft, not this modal. Retain its independent
      // input and original diff/generation baseline across the response render.
      if(action==='save'&&modal){captureModal();if(modal.type==='error'||modal.type==='new-error')modal.name=host.querySelector('#ab-error-name')?.value??modal.name;}
      const formWorking=action==='save'&&modal&&working?clone(working):null;
      const client=transport();if(client.hasUnknown()){await client.resolveUnknown();if(await load(true)===false)return null;}
      if(!scope()?.workflow||action==='begin'){const started=await client.begin();if(actor()!==requestActor||key()!==requestScope){cancelled=true;return null;}control.scopes[requestScope]=started.control;revision=started.revision;if(!modalGeneration&&modal)modalGeneration=started.control.workflow.generation;if(action==='begin'){versionId=opened()?.id;working=clone(opened().snapshot);return started;}}
      const flow=scope().workflow;let commandAction=action,fields={};
      if(action==='apply') {fields=changes(modalBase||opened().snapshot,detail.snapshot||working);if(!fields.patches.length)return{control:scope()};}
      else if(action==='save'){await client.flush();if(modal&&!confirm(t('只儲存已同步共用內容，不包含尚未套用的彈窗。繼續？','Chỉ lưu nội dung chung đã đồng bộ, không gồm cửa sổ chưa áp dụng. Tiếp tục?')))return null;}
      else if(action==='submit'){
        if(!flow.saved)throw Error('SUCCESSFUL_SAVE_REQUIRED');const why=await window.VersionDraftUI.confirmSubmit(reason||window.VersionDraftUI.reasonFor(version(),flow),key());if(!why)return null;
        fields={savedId:flow.saved.id,reason:why};
      }else if(['approve','reject','withdraw'].includes(action)){
        commandAction=action==='reject'?'return':action;const caseId=detail.versionId||flow.pendingId,c=flow.cases.find(c=>c.id===caseId),selfReview=action!=='withdraw'&&c?.actor.id===requestActor.id;
        const answer=await window.VersionDraftUI.confirmReview({action,scope:`IPQC-AB · ${requestScope} · ${caseId}`,reason:detail.comment||'',selfReview});if(!answer){cancelled=true;return null;}
        if(actor()!==requestActor||key()!==requestScope)throw Error('IDENTITY_OR_SCOPE_CHANGED');fields={caseId,...answer};
      }else{commandAction='apply';fields={moduleAction:action,input:detail};}
      const result=await client.command(['apply','create-error','create-item'].includes(action)?modalGeneration||flow.generation:flow.generation,commandAction,fields);
      if(actor()!==requestActor||key()!==requestScope){cancelled=true;return null;}
      if(result.control){control.scopes[requestScope]=result.control;revision=result.revision;}else if(await load(true)===false)return null;
      versionId=opened()?.id||active()?.id||versionId;working=formWorking&&modal?formWorking:opened()?.status==='draft'?clone(opened().snapshot):null;selectDefaults();issues=[];
      message=action==='save'?t('共用快照已儲存','Đã lưu bản chụp chung'):['apply','create-error','create-item','delete-item','delete-error'].includes(action)?t('已同步 · 尚未儲存','Đã đồng bộ · chưa lưu'):t('操作已由伺服器確認','Máy chủ đã xác nhận');
      window.dispatchEvent(new CustomEvent('quality-equipment-references-updated'));return result;
    }catch(error){if(actor()===requestActor&&key()===requestScope)message=error.message;return null;}finally{busy=false;if(actor()===requestActor&&key()===requestScope){if(!cancelled){draw();drawReview();}restoreView();}}
  }

  function selectDefaults() {
    if (!['A','B'].includes(line)) line = 'A';
    const groups = catalog.groups.filter(g => g.line === line);
    if (!groups.some(g => g.name === group)) group = groups[0]?.name || '';
    const stages = groupStages();
    const available = new Set(stages.map(s => s.code));
    const saved = snapshot().errors.find(e => !e.deleted && available.has(e.stageCode));
    if (!available.has(stage)) stage = saved?.stageCode || stages[0]?.code || '';
    if (!errors().some(e => e.id === errorId)) errorId = errors()[0]?.id || '';
    if (!scope()?.versions.some(v => v.id === versionId)) versionId = opened()?.id || active()?.id || scope()?.versions.at(-1)?.id || '';
  }
  let loadGeneration=0;
  function loadedSelection(body,keep){
    const next={control:body.control,catalog:body.catalog,equipment:body.equipment||[],revision:body.revision,line,group,stage,errorId,versionId,working};
    const selectedScope=()=>next.control.scopes[`${next.line}:${next.group}`];
    const openedVersion=()=>selectedScope()?.versions.find(v=>['draft','pending','pending-test'].includes(v.status));
    const activeVersion=()=>selectedScope()?.versions.find(v=>v.id===selectedScope()?.activeVersionId);
    const selectedVersion=()=>selectedScope()?.versions.find(v=>v.id===next.versionId)||openedVersion()||activeVersion()||selectedScope()?.versions.at(-1);
    const content=()=>selectedVersion()?.status==='draft'&&next.working&&selectedVersion()?.id===openedVersion()?.id?next.working:selectedVersion()?.snapshot||{errors:[],items:[]};
    const defaults=()=>{
      if(!['A','B'].includes(next.line))next.line='A';
      const groups=next.catalog.groups.filter(g=>g.line===next.line);
      if(!groups.some(g=>g.name===next.group))next.group=groups[0]?.name||'';
      const routes=[...new Set([...(next.catalog.groups.find(g=>g.line===next.line&&g.name===next.group)?.defaultStages||[]),...next.catalog.products.filter(p=>p.line===next.line&&p.category===next.group).flatMap(p=>p.stages)])];
      const extras=showRouteExtras?[...new Set(content().errors.filter(e=>!e.deleted&&!routes.includes(e.stageCode)).map(e=>e.stageCode))]:[];
      const available=new Set([...routes,...extras]),saved=content().errors.find(e=>!e.deleted&&available.has(e.stageCode));
      if(!available.has(next.stage))next.stage=saved?.stageCode||[...available][0]||'';
      const visibleErrors=content().errors.filter(e=>!e.deleted&&e.stageCode===next.stage);
      if(!visibleErrors.some(e=>e.id===next.errorId))next.errorId=visibleErrors[0]?.id||'';
      if(!selectedScope()?.versions.some(v=>v.id===next.versionId))next.versionId=openedVersion()?.id||activeVersion()?.id||selectedScope()?.versions.at(-1)?.id||'';
    };
    defaults();if(!keep||!next.working)next.working=openedVersion()?.status==='draft'?clone(openedVersion().snapshot):null;defaults();return next;
  }
  function quarantineRead(error,requestActor,requestEpoch,delivery,selection){
        const retainQuarantine=accessBlocked&&privateQuarantine?.actor===requestActor&&privateQuarantine?.epoch===requestEpoch;
        accessBlocked={actor:requestActor,epoch:requestEpoch,delivery,status:error.status};
        let captureFailed=false;
        try{if(host?.isConnected&&modal&&!modal.readonly){captureModal();if(modal.type==='error'||modal.type==='new-error')modal.name=host.querySelector('#ab-error-name')?.value??modal.name;}}catch{captureFailed=true;}
        if(!retainQuarantine)privateQuarantine={actor:requestActor,epoch:requestEpoch,working:clone(working),modal:clone(modal),reason,selection:[...selection],captureFailed};
        modal=null;viewer=null;modalBase=null;modalGeneration=null;reason='';modalScrolls.clear();
  }
  async function load(keep = false) {
    const generation=++loadGeneration,priorControl=control,priorRevision=revision,requestActor=actor(),requestHost=host,requestReviewHost=reviewHost,requestEpoch=window.ProcessSync?.identityGeneration?.(),selection=[line,group,stage,errorId,versionId,showRouteExtras],delivery=window.ProcessSync?.captureDelivery?.();
    const owns=()=>generation===loadGeneration&&control===priorControl&&revision===priorRevision&&actor()===requestActor&&(!Number.isFinite(requestEpoch)||window.ProcessSync?.identityGeneration?.()===requestEpoch)&&!window.ProcessSync?.requiresReload&&host===requestHost&&reviewHost===requestReviewHost&&[line,group,stage,errorId,versionId,showRouteExtras].every((value,index)=>value===selection[index])&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery)!==false);
    if(privateQuarantine&&(privateQuarantine.actor!==requestActor||privateQuarantine.epoch!==requestEpoch))privateQuarantine=null;
    if(lastCommandAcknowledgement&&(lastCommandAcknowledgement.actor!==requestActor||lastCommandAcknowledgement.epoch!==requestEpoch))lastCommandAcknowledgement=null;
    const deny=error=>{if(owns()&&[401,403].includes(error.status))quarantineRead(error,requestActor,requestEpoch,delivery,selection);};
    const hintedScope=group&&['A','B'].includes(line)?key():null;
    // Observe rejection immediately: a fast denial must close the old UI while data is pending.
    const permissionAttempt=hintedScope?transport(hintedScope).permissions({isCurrent:owns}).then(value=>({value}),error=>{deny(error);if(owns()&&accessBlocked){draw();drawReview();}return{error};}):null;
    try{
      const response=await fetch(API+'?caseMetadata=1&equipment=deferred',{headers:headers(),cache:'no-store'});
      const body=await response.json().catch(()=>({}));
      if(!owns())return false;
      if(!response.ok||!body.control||!Number.isInteger(body.revision))throw Object.assign(Error(body.error||t('IPQC-AB 載入失敗','Không tải được IPQC-AB')),{status:response.status});
      const next=loadedSelection(body,keep);
      // The opt-in shared boundary rejects obsolete access/gate results;
      // retain the owner check before committing the staged module data.
      if(permissionAttempt){const permissionResult=await permissionAttempt;if(!owns())return false;if(permissionResult.error&&([401,403].includes(permissionResult.error.status)||hintedScope===`${next.line}:${next.group}`))throw permissionResult.error;}
      if(!permissionAttempt||hintedScope!==`${next.line}:${next.group}`)await transport(`${next.line}:${next.group}`).permissions({isCurrent:owns});
      if(!owns())return false;
      ({control,catalog,equipment,revision,line,group,stage,errorId,versionId,working}=next);accessBlocked=null;
      return true;
    }catch(error){if(!owns())return false;deny(error);throw error;}
  }
  async function loadEquipment(){
    if(accessBlocked||modal?.type!=='equipment')return;
    const equipmentRequest=++equipmentLoadGeneration,target=modal,requestActor=actor(),requestEpoch=window.ProcessSync?.identityGeneration?.(),requestHost=host,requestScope=key(),requestVersion=versionId,requestGeneration=loadGeneration,requestControl=control,requestRevision=revision,delivery=window.ProcessSync?.captureDelivery?.();
    const currentModal=()=>equipmentRequest===equipmentLoadGeneration&&modal===target&&host===requestHost&&!!requestHost?.isConnected&&actor()===requestActor&&key()===requestScope&&versionId===requestVersion&&(!Number.isFinite(requestEpoch)||window.ProcessSync?.identityGeneration?.()===requestEpoch)&&!window.ProcessSync?.requiresReload&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery)!==false);
    const owns=()=>currentModal()&&loadGeneration===requestGeneration&&control===requestControl&&revision===requestRevision;
    const discardStale=()=>{if(owns())return false;if(currentModal()&&!accessBlocked){target.loading=false;target.error=t('頁面資料已更新，請重新載入設備清單。','Dữ liệu đã thay đổi; hãy tải lại danh sách thiết bị.');draw();}return true;};
    target.loading=true;target.error='';equipment=[];draw();
    const controller=new AbortController(),timer=setTimeout(()=>{controller.abort();if(currentModal()&&!accessBlocked){equipmentLoadGeneration++;target.loading=false;target.error=t('設備清單讀取逾時，請重試。','Đọc danh sách thiết bị quá hạn; hãy thử lại.');draw();}},45000);
    try{const response=await fetch(API+'?catalog=equipment',{headers:headers(),cache:'no-store',signal:controller.signal}),body=await response.json().catch(()=>({}));if(discardStale())return;
      if(!response.ok||!Array.isArray(body.equipment)||!Number.isInteger(body.revision))throw Object.assign(Error(body.error||t('設備清單載入失敗','Không tải được danh sách thiết bị')),{status:response.status});
      if(accessBlocked)return;
      // Catalog is read-only dependency data, never a newer draft CAS baseline.
      equipment=body.equipment;target.loading=false;draw();
    }catch(error){if(discardStale())return;if([401,403].includes(error.status)){quarantineRead(error,requestActor,requestEpoch,delivery,[line,group,stage,errorId,versionId,showRouteExtras]);message=error.message;draw();drawReview();return;}target.loading=false;target.error=error.message;draw();}finally{clearTimeout(timer);}
  }
  async function write(action, detail = {}) {
    if(accessBlocked)return null;
    if(['approve','reject','withdraw'].includes(action)&&control?.moduleDraft?.workflow?.cases.some(c=>c.id===(detail.versionId||opened()?.id)))return moduleSave(action,detail);
    if(scope()?.workflow||!['pending','pending-test'].includes(opened()?.status))return writeShared(action,detail);
    if (busy) return null;
    busy = true; message = '';const restoreView=window.VersionDraftUI.preserveView(host,reviewHost),requestActor=actor(),requestScope=key();let cancelled=false;
    try {
      if(['approve','reject','withdraw'].includes(action)){
        const target=scope().versions.find(v=>v.id===(detail.versionId||opened()?.id)),selfReview=action!=='withdraw'&&target?.creatorId===requestActor.id;
        const answer=await window.VersionDraftUI.confirmReview({action,scope:`IPQC-AB · ${requestScope} · V${target?.number}`,reason:detail.comment||'',selfReview});if(!answer){cancelled=true;return null;}
        if(actor()!==requestActor||key()!==requestScope)throw Error('IDENTITY_OR_SCOPE_CHANGED');detail={...detail,versionId:target?.id,versionRevision:target?.revision,comment:answer.reason,reason:answer.reason,selfReviewConfirmed:answer.selfReviewConfirmed};
      }
      let response, body;
      for (let attempt=0;attempt<2;attempt++) {
        const prior = opened();
        response = await fetch(API,{method:'POST',headers:headers(),body:JSON.stringify({action,
          baseRevision:revision,line,group,versionId:prior?.id,versionRevision:prior?.revision,...detail})});
        body = await response.json().catch(()=>({}));
        if (response.status !== 409 || attempt || !['create-error','create-item'].includes(action)) break;
        const oldId=prior?.id, oldRevision=prior?.revision;
        if(await load(true)===false)return null;
        if (opened()?.id !== oldId || opened()?.revision !== oldRevision) break;
      }
      if (!response.ok || !body.control) {
        if (body.issues) issues = body.issues;
        if (response.status === 409) {
          const unsaved = working;
          if(await load(true)===false)return null;
          working = unsaved;
        }
        throw Error(body.error || `HTTP ${response.status}`);
      }
      control = body.control; revision = body.revision;
      versionId = opened()?.id || active()?.id || versionId;
      working = opened()?.status === 'draft' ? clone(opened().snapshot) : null;
      selectDefaults(); issues = []; message = t('已保存於伺服器','Đã lưu trên máy chủ');
      void window.ProcessSync?.refresh?.().catch(() => { /* Dedicated CAS response confirms this write. */ });
      window.dispatchEvent(new CustomEvent('quality-equipment-references-updated'));
      return body;
    } catch (error) { message = error.message || t('儲存失敗','Lưu thất bại'); return null; }
    finally { busy = false;if(!cancelled){draw();drawReview();}restoreView(); }
  }
  const moduleDrafts=()=>control?.moduleDraft?.workflow?.pendingId?[]:Object.entries(control?.scopes||{}).filter(([,s])=>s.versions.some(v=>v.status==='draft'));
  let moduleClient=null,moduleActor='';
  function moduleTransport(){const id=actor()?.id;if(!id)throw Error('LOGIN_REQUIRED');if(moduleActor!==id){moduleActor=id;moduleClient=window.createSharedDraftClient({endpoint:API+'/workflow?module=1&caseMetadata=1',actorId:id,headers,guardAccessResults:true});}return moduleClient;}
  async function moduleSave(action,detail={}){
    if(accessBlocked)return null;
    if(busy)return null;
    if(modal){message=t('請先套用或取消目前彈窗。','Hãy áp dụng hoặc hủy cửa sổ trước.');draw();return null;}
    const identity=actor(),identityEpoch=window.ProcessSync?.identityGeneration?.(),restoreView=window.VersionDraftUI.preserveView(host,reviewHost);let acknowledged=false;busy=true;message='';
    const valid=()=>actor()===identity&&(!Number.isFinite(identityEpoch)||window.ProcessSync?.identityGeneration?.()===identityEpoch)&&!window.ProcessSync?.requiresReload;
    try{
      const client=moduleTransport();if(client.hasUnknown())await client.resolveUnknown();await client.flush();
      let result=await client.read();if(!valid())throw Error('IDENTITY_CHANGED');
      if(['save','submit'].includes(action)&&(!result.control?.workflow||!result.control.versions?.some(v=>['draft','pending','pending-test'].includes(v.status)))){
        // Creating/adopting a new module draft still requires backend edit.
        result=await client.begin();if(!valid())throw Error('IDENTITY_CHANGED');
      }
      const flow=result.control?.workflow;if(!flow)throw Error('WORKFLOW_LOAD_FAILED');
      let fields={expectedRevision:flow.revision,input:{stateRevision:result.revision}},commandAction=action;
      if(action==='submit'){if(!flow.saved)throw Error('SUCCESSFUL_SAVE_REQUIRED');const why=await window.VersionDraftUI.confirmSubmit(reason,'IPQC-AB · '+Object.keys(flow.saved.content.scopes).join('、'));if(!why)return null;fields={...fields,savedId:flow.saved.id,reason:why};}
      if(['approve','reject','withdraw'].includes(action)){commandAction=action==='reject'?'return':action;const caseId=detail.versionId||flow.pendingId,c=flow.cases.find(c=>c.id===caseId);const answer=await window.VersionDraftUI.confirmReview({action,scope:'IPQC-AB · '+caseId,selfReview:action!=='withdraw'&&c?.actor.id===identity.id});if(!answer)return null;fields={...fields,caseId,...answer};}
      if(!valid())throw Error('IDENTITY_CHANGED');result=await client.command(flow.generation,commandAction,fields);acknowledged=true;lastCommandAcknowledgement={actor:identity,epoch:identityEpoch,action,result};
      if(!valid()){lastCommandAcknowledgement=null;return null;}if(await load(false)===false)return null;message='';toast(t('IPQC-AB 整份操作已完成','Đã hoàn tất thao tác toàn bộ IPQC-AB'));return result;
    }catch(error){if(valid())message=acknowledged?t(action==='save'?'已儲存，但重新讀取遭拒或失敗；請重新核對權限，不要重送。':'操作已由伺服器確認，但重新讀取遭拒或失敗；請重新核對權限，不要重送。','Thao tác đã được máy chủ xác nhận nhưng đọc lại bị từ chối hoặc lỗi; kiểm tra quyền, không gửi lại.'):error.message;return null;}
    finally{busy=false;if(valid()){draw();drawReview();restoreView();}}
  }
  async function save(action = 'save') {
    if(['save','submit'].includes(action))return moduleSave(action);
    if (!working) return;
    reason = host?.querySelector('#ipqcab-reason')?.value ?? reason;
    return write(action,{snapshot:working,reason});
  }
  async function ensureSaved() {
    if (!working || JSON.stringify(working) === JSON.stringify(opened()?.snapshot)) return true;
    return !!await save('apply');
  }
  function scheduleRefresh(){const pollScheduleOwner=pollTimer.capture();const delivery=window.ProcessSync?.captureDelivery?.(),pollActor=actor(),pollEpoch=window.ProcessSync?.identityGeneration?.(),pollHost=host,owns=()=>pollTimer.isCurrent(pollScheduleOwner)&&actor()===pollActor&&host===pollHost&&(!Number.isFinite(pollEpoch)||window.ProcessSync?.identityGeneration?.()===pollEpoch)&&!window.ProcessSync?.requiresReload&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));pollTimer.schedule(async()=>{
    if(!owns())return;
    if(!host?.isConnected||host.dataset.activeTab!=='quality-ipqc-ab')return;
    let readCurrent=owns;try{if(!accessBlocked&&!busy&&document.visibilityState!=='hidden'&&transport().canPoll('state')){
      const current=key(),flow=scope()?.workflow,priorControl=control,priorRevision=revision,priorLoad=loadGeneration;
      readCurrent=()=>owns()&&!accessBlocked&&!busy&&key()===current&&control===priorControl&&revision===priorRevision&&loadGeneration===priorLoad;
      const result=await transport().read(flow?`${flow.generation}:${flow.revision}`:'');
      if(readCurrent()&&!result.unchanged&&result.control){const wasOpen=['draft','pending'].includes(version()?.status);control.scopes[current]=result.control;revision=result.revision;
        if(!modal){if(wasOpen){versionId=opened()?.id||active()?.id;working=opened()?.status==='draft'?clone(opened().snapshot):null;}if(!host.contains(document.activeElement))draw();}
        else{const banner=host.querySelector('#ipqcab-shared-status');if(banner)banner.textContent=t('共用內容已更新，保留彈窗輸入；套用時核對來源。','Nội dung chung đã cập nhật; giữ dữ liệu cửa sổ và kiểm tra nguồn khi áp dụng.');}
      }
    }}catch(error){if(!readCurrent())return;message=t('同步失敗，保留目前內容：','Đồng bộ thất bại, giữ nội dung hiện tại: ')+error.message;}
    finally{if(owns()&&pollTimer.isCurrent(pollScheduleOwner))scheduleRefresh();}
  });}
  function photoButtons(photos,itemId,kind) {
    return photos.map((photo,index)=>`<button type="button" class="ipqcab-thumb" data-ab-photo-item="${h(itemId)}" data-ab-photo-kind="${kind}" data-ab-photo-index="${index}"><img decoding="async" loading="lazy" src="${h(photoUrl(photo))}" alt="${h(photo.note || photo.name)}"></button>`).join('');
  }
  function missing(item) {
    const problems = [];
    if (!item.standard.trim()) problems.push(t('缺標準','Thiếu tiêu chuẩn'));
    if (!item.methodText.trim()) problems.push(t('缺檢查方式敘述','Thiếu mô tả phương pháp'));
    if (item.inspectionMode === 'equipment' && !item.equipmentId) problems.push(t('缺必要檢具','Thiếu thiết bị'));
    if (!item.rules.length) problems.push(t('頻率待補','Chờ bổ sung tần suất'));
    return problems.length ? `<span class="ipqcab-missing">${h(problems.join(' · '))}</span>` : '';
  }
  function issueHTML() {
    const records = [];
    const invalid=[];
    for (const item of snapshot().items.filter(i=>!i.deleted && i.isEnabled)) {
      if (!item.standard.trim()) records.push({itemId:item.id,code:item.code,reason:t('標準待補','Thiếu tiêu chuẩn')});
      if (!item.methodText.trim()) records.push({itemId:item.id,code:item.code,reason:t('檢查方式待補','Thiếu cách kiểm tra')});
      if (!item.rules.length) records.push({itemId:item.id,code:item.code,reason:t('頻率待補','Thiếu tần suất')});
      const parent=snapshot().errors.find(e=>e.id===item.errorId),bad=item.productCodes.filter(code=>!catalog.products.some(p=>p.code===code&&p.line===line&&p.category===group&&p.stages.includes(parent?.stageCode)));
      if(bad.length)invalid.push({itemId:item.id,code:item.code,reason:t('產品關聯失效，送審前請修正：','Liên kết sản phẩm không hợp lệ, cần sửa trước khi gửi: ')+bad.join('、')});
    }
    for(const error of snapshot().errors.filter(e=>!e.deleted)){const assigned=new Set(snapshot().items.filter(i=>!i.deleted&&i.isEnabled&&i.errorId===error.id).flatMap(i=>i.productCodes));for(const product of catalog.products.filter(p=>p.line===line&&p.category===group&&p.stages.includes(error.stageCode)&&!assigned.has(p.code)))records.push({errorId:error.id,code:error.code,reason:t('適用產品尚未涵蓋：','Sản phẩm chưa được bao phủ: ')+product.code});}
    const section=(rows,kind,label)=>rows.length?`<details class="ipqcab-issues" data-ab-issue-kind="${kind}"><summary>${label} · ${rows.length}</summary>
      ${rows.map(issue=>`<p><b>${h(issue.code)}</b> · ${h(issue.reason)}
        ${issue.itemId?`<button type="button" data-ab-goto="${h(issue.itemId)}">${t('前往修正','Đến chỉnh sửa')}</button>`:issue.errorId?`<button type="button" data-ab-goto-error="${h(issue.errorId)}">${t('前往修正','Đến chỉnh sửa')}</button>`:''}</p>`).join('')}</details>`:'';
    return section([...issues,...invalid],'error',t('報錯','Lỗi'))+section(records,'missing',t('待補（由審核者確認，不阻擋送審）','Cần bổ sung (người duyệt xác nhận; không chặn gửi)'));
  }
  function historyHTML() {
    const v = version();
    const actionLabels={'initial-import':t('匯入初始資料','Nhập dữ liệu ban đầu'),begin:t('開始修改','Bắt đầu sửa'),save:t('儲存草稿','Lưu bản nháp'),submit:t('送出審核','Gửi duyệt'),'submit-test':t('送出試用確認','Gửi xác nhận thử nghiệm'),'create-error':t('新增錯誤代碼','Thêm mã lỗi'),'create-item':t('新增檢查項目','Thêm hạng mục kiểm tra'),'delete-error':t('刪除錯誤代碼','Xóa mã lỗi'),'delete-item':t('刪除檢查項目','Xóa hạng mục kiểm tra'),approve:t('已核准','Đã duyệt'),approved:t('已核准','Đã duyệt'),return:t('已發回','Đã trả lại'),returned:t('已發回','Đã trả lại'),reject:t('已發回','Đã trả lại'),withdraw:t('已撤回','Đã rút'),withdrawn:t('已撤回','Đã rút')};
    return `<details class="ipqcab-history"><summary>${t('操作歷程','Lịch sử thao tác')}</summary>
      ${(v?.history || []).slice().reverse().map(e=>`<p>${h(Object.hasOwn(actionLabels,e.action)?actionLabels[e.action]:e.action)} · ${h(e.actorName)} · ${h(new Date(e.at).toLocaleString())} ${h(e.comment || '')}</p>`).join('') || '—'}</details>`;
  }
  function mainHTML() {
    selectDefaults(); const v = version(), data = snapshot(), list = items(), products = candidates();
    const related = new Set(data.items.filter(i=>!i.deleted && i.isEnabled && i.errorId === errorId)
      .flatMap(i=>i.productCodes));
    const uncovered = related.size ? products.filter(p=>!related.has(p.code)) : [];
    return `<section class="ipqcab-page" id="ipqcab-page" data-i18n-skip="true">
      <section class="ipqcab-card ipqcab-version"><div><p class="eyebrow">IPQC-AB MASTER CONTROL</p>
        <h2>IPQC-AB · ${v?`V${v.number} · ${status(v.status)}`:t('尚無版本','Chưa có phiên bản')}</h2>
        <p>${v?`${t('最後編輯','Người sửa cuối')}: ${h(lastEdit(v)?.actorName || v.creatorName)} · ${h(new Date(lastEdit(v)?.at || v.createdAt).toLocaleString())}`:''}
          ${v?.submittedBy?`<br>${t('送審者','Người gửi')}: ${h(v.submittedBy)} · ${h(new Date(v.submittedAt).toLocaleString())}`:''}${v?.reviewedBy?`<br>${t('確認／發回者','Người duyệt/trả')}: ${h(v.reviewedBy)} · ${h(new Date(v.reviewedAt).toLocaleString())}`:''}
          ${active()?` · ${t('目前生效','Đang có hiệu lực')}: V${active().number}`:''}</p></div>
        <div class="ipqcab-actions"><label>${t('選擇版本','Chọn phiên bản')}<select id="ipqcab-version">
          ${(scope()?.versions || []).slice().reverse().map(row=>`<option value="${h(row.id)}" ${row.id===v?.id?'selected':''}>V${row.number} · ${status(row.status)} · ${h(lastEdit(row)?.actorName || row.creatorName)} · ${h(new Date(lastEdit(row)?.at || row.createdAt).toLocaleString())}</option>`).join('')}</select></label>
          ${!opened() && permitted('approval.submit')?`<button type="button" id="ipqcab-begin">${t('開始修改','Bắt đầu sửa')}</button>`:''}
          ${moduleDrafts().length&&permittedAction('save')?`<button type="button" id="ipqcab-save" ${busy?'disabled':''}>${t('儲存草稿','Lưu bản nháp')}</button>`:''}
          ${moduleDrafts().length&&permittedAction('submit')?`<button type="button" class="signal" id="ipqcab-submit" ${busy?'disabled':''}>${t('送出審核','Gửi duyệt')}</button>`:''}
          ${ownPending(v)?`<button type="button" id="ipqcab-withdraw">${t('撤回','Rút hồ sơ')}</button>`:''}</div>
        ${editing()?`<label class="ipqcab-reason">${t('變更理由','Lý do thay đổi')}<input id="ipqcab-reason" value="${h(reason)}"></label>`:''}</section>
      ${message?`<p class="ipqcab-message" role="status">${h(displayDraftError(message))}</p>`:''}
      ${historyHTML()}${issueHTML()}
      <section class="ipqcab-card ipqcab-filters"><label>${t('產線','Chuyền')}<select id="ipqcab-line"><option value="A" ${line==='A'?'selected':''}>A</option><option value="B" ${line==='B'?'selected':''}>B</option></select></label>
        <label>${t('產品群組','Nhóm sản phẩm')}<select id="ipqcab-group">${catalog.groups.filter(g=>g.line===line).map(g=>`<option value="${h(g.name)}" ${g.name===group?'selected':''}>${h(g.name)}</option>`).join('')}</select></label>
        <label>${t('工段','Công đoạn')}<select id="ipqcab-stage">${groupStages().map(s=>`<option value="${h(s.code)}" ${s.code===stage?'selected':''}>${h(s.code)} · ${h(s.name)}</option>`).join('')||`<option value="">${t('群組尚未設定工段','Nhóm chưa có công đoạn')}</option>`}</select></label></section>
      ${outsideStageCodes().length?`<p class="ipqcab-card"><button type="button" id="ipqcab-route-extras">${showRouteExtras?t('只看目前群組工段','Chỉ xem công đoạn hiện tại'):t('查看路線外既有標準','Xem tiêu chuẩn ngoài tuyến')} (${outsideStageCodes().length})</button> ${t('保留原標準與引用，不會因路線調整而刪除。','Giữ tiêu chuẩn và tham chiếu khi đổi tuyến.')}</p>`:''}
      <section class="ipqcab-card"><div class="ipqcab-heading"><h3>${t('錯誤代碼','Mã lỗi')}</h3>${editing()?`<button type="button" id="ipqcab-add-error">＋${t('新增錯誤代碼','Thêm mã lỗi')}</button>`:''}</div>
        <div class="ipqcab-error-list">${errors().map(e=>`<div class="ipqcab-error ${e.id===errorId?'selected':''}"><button type="button" data-ab-error="${h(e.id)}"><b>${h(e.code)}</b><span>${h(e.name)}</span></button>
          <button type="button" data-ab-view-error="${h(e.id)}">${t('查看','Xem')}</button>${editing()?`<button type="button" data-ab-edit-error="${h(e.id)}">${t('修改','Sửa')}</button><button type="button" data-ab-delete-error="${h(e.id)}">${t('刪除','Xóa')}</button>`:''}</div>`).join('') || `<p>${t('此工段尚無錯誤代碼','Chưa có mã lỗi')}</p>`}</div></section>
      <section class="ipqcab-card"><div class="ipqcab-heading"><h3>${t('檢查項目','Hạng mục kiểm tra')} ${chosenError()?`· ${h(chosenError().code)}`:''}</h3>
        ${editing()&&chosenError()?`<button type="button" id="ipqcab-add-item">＋${t('新增檢查項目','Thêm hạng mục')}</button>`:''}</div>
        ${list.map(i=>`<article class="ipqcab-item"><div class="ipqcab-item-photos">${photoButtons(i.standardPhotos,i.id,'standard')}${photoButtons(i.methodPhotos,i.id,'method')}${!i.standardPhotos.length&&!i.methodPhotos.length?'◇':''}</div>
          <div><b>${h(i.code)}</b><p>${h(i.standard) || `<span class="ipqcab-missing">${t('標準待補','Thiếu tiêu chuẩn')}</span>`}</p>
            <div class="ipqcab-item-meta"><span class="ipqcab-enabled-tag">${i.isEnabled?t('啟用','Bật'):t('停用','Tắt')}</span>${i.inspectionMode==='equipment'?`<a class="ipqcab-equipment-preview" href="/process/?system=quality&view=data&dataTab=quality-routine-equipment&equipmentId=${encodeURIComponent(i.equipmentId)}" target="_blank" rel="noopener" title="${h(t('查看檢具資訊','Xem thiết bị'))}">${i.equipmentSnapshot?.photoId?`<img decoding="async" loading="lazy" src="/api/routine-equipment/photo?id=${h(i.equipmentSnapshot.photoId)}" alt="">`:'◇'}<span><b>${h(i.equipmentSnapshot?.assetCode || '')} / ${h(i.equipmentSnapshot?.pieceMark || '')}</b><span>${h(i.equipmentSnapshot?.name || t('檢具資訊待補','Chờ thông tin thiết bị'))}</span></span></a>`:`<span>${t('目視檢查','Kiểm tra trực quan')}</span>`}<small>${t('頻率','Tần suất')}: ${i.rules.length?i.rules.map(ruleLabel).map(h).join(' / '):t('未設定','Chưa thiết lập')}</small></div>
            ${window.ProcessIPQC.referenceMarkup('AB',`${line}:${group}`,i.id)}${missing(i)}</div><div class="ipqcab-row-actions"><button type="button" data-ab-view-item="${h(i.id)}">${t('查看','Xem')}</button>
            ${editing()?`<button type="button" data-ab-edit-item="${h(i.id)}">${t('修改','Sửa')}</button><button type="button" data-ab-delete-item="${h(i.id)}">${t('刪除','Xóa')}</button>`:''}</div></article>`).join('') || `<p>${t('請先選擇錯誤代碼','Hãy chọn mã lỗi')}</p>`}</section>
      <section class="ipqcab-card"><h3>${t('產品關聯矩陣','Ma trận sản phẩm')}</h3>
        <div class="ipqcab-matrix-scroll"><table><thead><tr><th>${t('項目','Hạng mục')}</th>${products.map(p=>`<th title="${h(p.name)}">${h(p.code)}<small>${h(p.name)}</small></th>`).join('')}</tr></thead>
          <tbody>${list.map(i=>`<tr><th>${h(i.code)}<small>${h(i.standard || t('標準待補','Thiếu tiêu chuẩn'))}</small>${i.isEnabled?'':` · ${t('停用','Tắt')}`}</th>${products.map(p=>`<td><input type="checkbox" aria-label="${h(i.code)} ${h(p.code)}" data-ab-matrix-item="${h(i.id)}" data-ab-matrix-product="${h(p.code)}" ${i.productCodes.includes(p.code)?'checked':''} ${editing()?'':'disabled'}></td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p>${t('未涵蓋產品','Sản phẩm chưa được bao phủ')}: ${uncovered.length?uncovered.map(p=>h(p.code)).join('、'):t('無','Không')}</p></section>
      ${modalHTML()}${viewerHTML()}</section>`;
  }
  function errorModal(e,readonly) {
    return `<div class="ipqcab-modal-title">${readonly?t('查看錯誤代碼','Xem mã lỗi'):t('修改錯誤代碼','Sửa mã lỗi')} · ${h(e.code)}</div>
      <label>${t('錯誤代碼名稱','Tên mã lỗi')}<input id="ab-error-name" value="${h(e.name)}" ${readonly?'readonly':''}></label>`;
  }
  function photoEditor(item,readonly) {
    const rows = kind => item[kind==='standard'?'standardPhotos':'methodPhotos'].map((photo,index,photos)=>`<div class="ipqcab-photo-row"><button type="button" data-ab-view-modal="${kind}:${index}"><img src="${h(photoUrl(photo))}" alt="${h(photo.name)}"></button>
      <input data-ab-photo-note="${kind}:${index}" placeholder="${t('備註','Ghi chú')}" value="${h(photo.note)}" ${readonly?'readonly':''}>
      ${readonly?'':`<button type="button" data-ab-move="${kind}:${index}:-1" ${index===0?'disabled':''}>↑</button><button type="button" data-ab-move="${kind}:${index}:1" ${index===photos.length-1?'disabled':''}>↓</button><button type="button" data-ab-remove-photo="${kind}:${index}">${t('移除','Xóa')}</button>`}</div>`).join('');
    return `<section class="ipqcab-photo-editor"><b>${t('檢查方式圖片','Ảnh cách kiểm tra')}</b>
      ${readonly?'':`<input type="file" accept="image/*" multiple data-ab-upload="standard">`}
      <div data-ab-photos="all">${rows('standard')}${rows('method')}</div></section>`;
  }
  function ruleEditor(rule,index,readonly) {
    const batch = rule.cadence === 'batch', custom = rule.kind === 'custom';
    return `<div class="ipqcab-rule" data-ab-rule="${index}"><label>${t('方式','Cách')}<select class="ab-rule-cadence" ${readonly?'disabled':''}><option value="batch" ${batch?'selected':''}>${t('按批次','Theo lô')}</option><option value="time" ${!batch?'selected':''}>${t('按時間','Theo thời gian')}</option></select></label>
      <label>${batch?t('取樣方式','Cách lấy mẫu'):t('週期','Chu kỳ')}<select class="ab-rule-kind" ${readonly?'disabled':''}>${(batch?
        [['aql','AQL'],['fixed',t('固定件數','Số mẫu cố định')],['quantity',t('批次數量','Số lượng lô')],['custom',t('自訂','Tùy chỉnh')]]:
        [['week',t('週','Tuần')],['month',t('月','Tháng')],['quarter',t('季','Quý')],['half-year',t('半年','Nửa năm')],['year',t('年','Năm')],['custom',t('自訂','Tùy chỉnh')]])
        .map(([key,label])=>`<option value="${key}" ${rule.kind===key?'selected':''}>${label}</option>`).join('')}</select></label>
      ${batch&&custom?`<label>${t('自訂項目名稱','Tên mục tùy chỉnh')}<input class="ab-rule-name" value="${h(rule.name || '')}" ${readonly?'readonly':''}></label>`:''}
      ${batch||custom?`<label>${batch?t('對應數量或文字內容','Số lượng hoặc nội dung'):t('自訂週期內容','Chu kỳ tùy chỉnh')}<input class="ab-rule-value" value="${h(rule.value || '')}" ${readonly?'readonly':''}></label>`:''}
      ${readonly?'':`<button type="button" data-ab-remove-rule="${index}">${t('移除規則','Xóa quy tắc')}</button>`}</div>`;
  }
  function itemModal(i,readonly) {
    const eq = equipment.find(e=>e.id===i.equipmentId) || i.equipmentSnapshot;
    return `<div class="ipqcab-modal-title">${readonly?t('查看檢查項目','Xem hạng mục'):t('修改檢查項目','Sửa hạng mục')} · ${h(i.code)}</div>
      <label>${t('項目標準（越文）','Tiêu chuẩn (tiếng Việt)')}<textarea id="ab-standard" ${readonly?'readonly':''}>${h(i.standard)}</textarea></label>
      ${photoEditor(i,readonly)}
      <label>${t('檢查方式敘述','Mô tả cách kiểm tra')}<textarea id="ab-method" ${readonly?'readonly':''}>${h(i.methodText)}</textarea></label>
      <fieldset><legend>${t('檢查方式','Cách kiểm tra')}</legend><label><input type="radio" name="ab-mode" value="visual" ${i.inspectionMode==='visual'?'checked':''} ${readonly?'disabled':''}> ${t('目視檢查','Kiểm tra trực quan')}</label>
        <label><input type="radio" name="ab-mode" value="equipment" ${i.inspectionMode==='equipment'?'checked':''} ${readonly?'disabled':''}> ${t('檢具與測試設備','Dưỡng kiểm và thiết bị')}</label>
        <div class="ipqcab-equipment-choice">${eq?`<div class="ipqcab-selected-equipment">${eq.photoId?`<img src="/api/routine-equipment/photo?id=${h(eq.photoId)}" alt="">`:''}<b>${h(equipmentLabel(eq))}</b></div>`:''}
          ${readonly?'':`<button type="button" id="ab-select-equipment">${eq?t('更換設備','Đổi thiết bị'):t('選擇設備','Chọn thiết bị')}</button><button type="button" id="ab-clear-equipment">${t('清除','Bỏ chọn')}</button>`}</div></fieldset>
      <label><input type="checkbox" id="ab-enabled" ${i.isEnabled?'checked':''} ${readonly?'disabled':''}> ${t('啟用此項目','Kích hoạt hạng mục')}</label>
      <section><h4>${t('檢查頻率','Tần suất kiểm tra')}</h4><div id="ab-rules">${i.rules.map((rule,index)=>ruleEditor(rule,index,readonly)).join('')}</div>
        ${readonly?'':`<button type="button" id="ab-add-rule">＋${t('新增規則','Thêm quy tắc')}</button>`}</section>
      ${window.ProcessIPQC.referenceMarkup('AB',`${line}:${group}`,i.id)}<section class="ipqcab-product-editor"><h4>${t('包含的產品','Sản phẩm thuộc hạng mục')}</h4><div>${[...candidates(),...i.productCodes.filter(code=>!candidates().some(p=>p.code===code)).map(code=>({code,name:t('既有關聯已失效；取消勾選以明確移除','Liên kết cũ không hợp lệ; bỏ chọn để xóa')}))].map(product=>`<label><input type="checkbox" data-ab-item-product="${h(product.code)}" ${i.productCodes.includes(product.code)?'checked':''} ${readonly?'disabled':''}><span><code>${h(product.code)}</code><span data-i18n-skip="true">${h(product.name)}</span></span></label>`).join('') || t('此工段沒有產品','Không có sản phẩm ở công đoạn này')}</div></section>`;
  }
  function modalHTML() {
    if (!modal) return '';
    if (modal.type === 'new-error') return `<div class="ipqcab-overlay"><div class="ipqcab-dialog"><header><h3>${t('新增錯誤代碼','Thêm mã lỗi')}</h3><button type="button" data-ab-close>×</button></header><div class="ipqcab-dialog-body"><p>${t('錯誤代碼編號將於儲存時自動帶入。','Mã lỗi sẽ được cấp tự động khi lưu.')}</p><label>${t('錯誤代碼名稱','Tên mã lỗi')}<input id="ab-error-name" value="${h(modal.name||'')}" required></label>${message?`<p role="alert">${h(displayDraftError(message))}</p>`:''}</div><footer><button type="button" data-ab-close>${t('取消','Hủy')}</button><button type="button" class="signal" id="ab-apply">${t('建立並儲存','Tạo và lưu')}</button></footer></div></div>`;
    if (modal.type === 'creating-item') return `<div class="ipqcab-overlay"><div class="ipqcab-dialog"><header><h3>${t('新增檢查項目','Thêm hạng mục')}</h3></header><div class="ipqcab-dialog-body"><p role="status">${t('正在自動分配項目編號…','Đang cấp mã hạng mục tự động…')}</p></div></div></div>`;
    if (modal.type === 'equipment') {
      if(modal.loading||modal.error)return `<div class="ipqcab-overlay"><div class="ipqcab-dialog"><header><h3>${t('選擇檢具與測試設備','Chọn dưỡng kiểm và thiết bị')}</h3><button type="button" data-ab-close>×</button></header><div class="ipqcab-dialog-body"><p role="${modal.error?'alert':'status'}">${h(modal.error||t('正在載入設備清單…','Đang tải danh sách thiết bị…'))}</p>${modal.error?`<button type="button" id="ab-equipment-retry">${t('重試','Thử lại')}</button>`:''}</div></div></div>`;

      const options = (field, label, rows) => `<label>${label}<select id="ab-equipment-${field}"><option value="">${t('全部','Tất cả')}</option>${[...new Map(rows.filter(e=>e[field+'Id']).map(e=>[e[field+'Id'],e[field]])).entries()].map(([id,name])=>`<option value="${h(id)}" ${modal[field]===id?'selected':''}>${h(name)}</option>`).join('')}</select></label>`;
      const matching = equipment;
      return `<div class="ipqcab-overlay"><div class="ipqcab-dialog"><header><h3>${t('選擇檢具與測試設備','Chọn dưỡng kiểm và thiết bị')}</h3><button type="button" data-ab-close>×</button></header>
        <div class="ipqcab-dialog-body"><div class="ipqcab-equipment-filters">${options('category',t('類別','Nhóm'),equipment)}${options('subcategory',t('子類別','Phân nhóm'),equipment.filter(e=>!modal.category||e.categoryId===modal.category))}${options('group',t('規格群組','Nhóm quy cách'),equipment.filter(e=>(!modal.category||e.categoryId===modal.category)&&(!modal.subcategory||e.subcategoryId===modal.subcategory)))}</div>
          <input id="ab-equipment-search" placeholder="${t('搜尋編號、名稱、群組','Tìm mã, tên, nhóm')}" value="${h(modal.query||'')}">
          <p class="ipqcab-equipment-count">${t('符合','Phù hợp')} ${matching.length} · ${t('可選','Có thể chọn')} ${matching.filter(eq=>eq.available).length}</p>
          <div id="ab-equipment-results">${matching.map(eq=>`<button type="button" data-ab-choose-equipment="${h(eq.id)}" ${eq.available?'':'disabled'}>
            ${eq.photoId?`<img decoding="async" loading="lazy" src="/api/routine-equipment/photo?id=${h(eq.photoId)}" alt="">`:'◇'}<span><b>${h(equipmentLabel(eq))}</b><small>${h([eq.category,eq.subcategory,eq.group].filter(Boolean).join(' / '))}</small><small>${eq.available?t('可選取','Có thể chọn'):t('設備未啟用','Thiết bị chưa kích hoạt')}</small></span></button>`).join('') || t('沒有符合設備','Không có thiết bị phù hợp')}</div></div>
        <footer><button type="button" data-ab-close>${t('取消','Hủy')}</button></footer></div></div>`;
    }
    const row = modal.type === 'error' ? snapshot().errors.find(e=>e.id===modal.id) : snapshot().items.find(i=>i.id===modal.id);
    if (!row) return '';
    return `<div class="ipqcab-overlay"><div class="ipqcab-dialog"><header><h3>${modal.type==='error'?t('錯誤代碼','Mã lỗi'):t('檢查項目','Hạng mục')}</h3><button type="button" data-ab-close>×</button></header>
      <div class="ipqcab-dialog-body">${message?`<p role="alert">${h(displayDraftError(message))}</p>`:''}${modal.type==='error'?errorModal(row,modal.readonly):itemModal(row,modal.readonly)}</div>
      <footer><button type="button" data-ab-close>${t('取消','Hủy')}</button>${modal.readonly?'':`<button type="button" class="signal" id="ab-apply">${window.VersionDraftUI.t('apply')}</button>`}</footer></div></div>`;
  }
  function viewerHTML() {
    if (!viewer) return '';
    const item = snapshot().items.find(i=>i.id===viewer.itemId) || modal?.item;
    const photos = item?.[viewer.kind === 'method' ? 'methodPhotos':'standardPhotos'] || [];
    const photo = photos[viewer.index];
    if (!photo) return '';
    return `<div class="ipqcab-viewer"><div><button type="button" data-ab-close-viewer>×</button><img src="${h(photoUrl(photo))}" alt="${h(photo.note||photo.name)}">
      <p>${viewer.index+1} / ${photos.length} · ${h(photo.note||photo.name)}</p><button type="button" data-ab-prev>←</button><button type="button" data-ab-next>→</button></div></div>`;
  }
  function renderAccessBlocked(target){
    if(!target?.isConnected)return;
    target.innerHTML=`<section class="ipqcab-card"><p role="alert">${h(message||t('目前無法讀取 IPQC-AB；草稿暫存已保留，請重新核對權限。','Không thể đọc IPQC-AB; bản nháp được giữ riêng, hãy kiểm tra quyền.'))}</p><button type="button" data-ab-access-retry>${t('重新核對','Kiểm tra lại')}</button></section>`;
    const retry=target.querySelector('[data-ab-access-retry]');if(retry)retry.onclick=async()=>{try{if(await load()===false)return;message=privateQuarantine?t('已重新讀取；先前輸入僅私有暫存，未自動套用，請先核對再修改。','Đã đọc lại; dữ liệu cũ chỉ được giữ riêng, chưa áp dụng tự động. Hãy kiểm tra trước khi sửa.'):'';draw();drawReview();}catch(error){message=error.message;renderAccessBlocked(target);}};
  }
  function draw() {
    if(accessBlocked){renderAccessBlocked(host);return;}
    if(modal&&!modalBase){modalBase=clone(opened()?.snapshot||{errors:[],items:[]});modalGeneration=scope()?.workflow?.generation||null;}
    if(!modal){modalBase=null;modalGeneration=null;}
    if (!host || !document.contains(host) || host.dataset.activeTab !== 'quality-ipqc-ab') return;
    const scroll = window.scrollY;
    const previous = host.querySelector('.ipqcab-dialog-body');
    if (previous?.dataset.scrollKey) modalScrolls.set(previous.dataset.scrollKey,previous.scrollTop);
    host.innerHTML = mainHTML();
    void window.ProcessIPQC.mountReferences(host); bind();sharedClient?.gatePermissions?.();
    window.renderSharedDraftValidation?.({client:sharedClient,flow:scope()?.workflow,after:host.querySelector('.ipqcab-version'),language:vi()?'vi':'zh',onLocate:issue=>{
      const id=issue.path?.[1]?.id,item=snapshot().items.find(row=>row.id===id),parent=snapshot().errors.find(row=>row.id===(item?.errorId||id));if(!parent||!editing())return;
      line=parent.line;group=parent.group;stage=parent.stageCode;errorId=parent.id;modal=item?{type:'item',id:item.id,readonly:false,initial:clone(item)}:{type:'error',id:parent.id,readonly:false,initial:clone(parent)};draw();
    }});
    const flow=scope()?.workflow;
    if(flow){const status=document.createElement('section');status.className='ipqcab-card';status.id='ipqcab-shared-status';status.setAttribute('role','status');status.innerHTML=`<b>${t('共用範圍','Phạm vi chung')}: ${h(key())}</b><p>${flow.pendingId?t('待審鎖定','Khóa chờ duyệt'):!flow.saved||JSON.stringify(flow.saved.content)!==JSON.stringify(flow.working)?t('已同步 · 尚未手動儲存','Đã đồng bộ · chưa lưu thủ công'):t('已儲存','Đã lưu')}</p>${flow.saved?`<p>${t('儲存者','Người lưu')}: ${h(flow.saved.actor.name)} · ${h(flow.saved.at)} · ${h(flow.saved.id)}</p>`:''}`;host.querySelector('#ipqcab-page')?.prepend(status);
      if(permitted('approval.compare')){const button=document.createElement('button');button.id='ab-case-history';button.className='button ghost';button.textContent=t('送審案件','Hồ sơ gửi duyệt');button.onclick=()=>window.openSharedDraftHistory({client:control?.moduleDraft?moduleTransport():transport(),editable:()=>!control?.moduleDraft&&opened()?.status==='draft'&&permitted('approval.submit'),onApplied:async()=>{if(await load()===false)return;draw();}}).catch(e=>{message=e.message;draw();});status.append(button);}
      if(sharedClient?.hasUnknown())for(const [label,method]of [[t('查詢上次操作','Kiểm tra thao tác trước'),'resolveUnknown'],[t('重試同一操作','Thử lại cùng thao tác'),'retryUnknown']]){const button=document.createElement('button');button.textContent=label;button.onclick=async()=>{try{await transport()[method]();if(await load()===false)return;}catch(e){message=e.message;}draw();};status.append(button);}
    }
    window.VersionDraftUI?.mount(host,{header:'.ipqcab-version',historyClient:()=>control?.moduleDraft?moduleTransport():transport(),module:'IPQC-AB',moduleActions:true,scope:t('全部 IPQC-AB 草稿；A／B 全部群組與工段','Tất cả bản nháp IPQC-AB; mọi nhóm và công đoạn A/B'),version:version(),versions:scope()?.versions,active:active(),flow:control?.moduleDraft?.workflow||scope()?.workflow,busy,failed:sharedClient?.hasUnknown(),actions:{begin:'#ipqcab-begin',save:'#ipqcab-save',submit:'#ipqcab-submit',withdraw:'#ipqcab-withdraw'},review:()=>{state.view='approval';state.approvalTab='quality';window.render();},errors:'[data-ab-issue-kind="error"],[data-shared-issue-kind="error"]',missing:'[data-ab-issue-kind="missing"],[data-shared-issue-kind="missing"]',checked:{missing:true},history:['.ipqcab-history','#ab-case-history','[data-shared-issue-kind="warning"]'],status:['#ipqcab-shared-status']});
    const body = host.querySelector('.ipqcab-dialog-body');
    if (body && modal) {
      body.dataset.scrollKey = `${modal.type}:${modal.id||modal.itemId||''}`;
      body.scrollTop = modalScrolls.get(body.dataset.scrollKey) || 0;
      const dialog=body.closest('.ipqcab-dialog');
      dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
      if (previous?.dataset.scrollKey !== body.dataset.scrollKey) dialog.querySelector('button,input,textarea,select')?.focus({preventScroll:true});
    }
    if (scroll) window.scrollTo(0,scroll);
  }
  function captureModal() {
    if (!modal || modal.type !== 'item' || modal.readonly) return;
    const root = host.querySelector('.ipqcab-dialog-body');
    if (!root) return;
    const item = working.items.find(i=>i.id===modal.id);
    if (!item) return;
    item.standard = root.querySelector('#ab-standard')?.value ?? item.standard;
    item.methodText = root.querySelector('#ab-method')?.value ?? item.methodText;
    item.inspectionMode = root.querySelector('[name="ab-mode"]:checked')?.value || item.inspectionMode;
    item.isEnabled = !!root.querySelector('#ab-enabled')?.checked;
    item.productCodes = [...root.querySelectorAll('[data-ab-item-product]:checked')].map(input=>input.dataset.abItemProduct);
    if (item.inspectionMode === 'visual') item.equipmentId = '';
    root.querySelectorAll('[data-ab-photo-note]').forEach(input=>{
      const [kind,index] = input.dataset.abPhotoNote.split(':');
      item[kind==='standard'?'standardPhotos':'methodPhotos'][Number(index)].note = input.value;
    });
    item.rules = [...root.querySelectorAll('[data-ab-rule]')].map((card,index)=>{const old=item.rules[index],next={
      id:old?.id || crypto.randomUUID(),cadence:card.querySelector('.ab-rule-cadence').value,
      kind:card.querySelector('.ab-rule-kind').value,
      value:card.querySelector('.ab-rule-value')?.value || '',name:card.querySelector('.ab-rule-name')?.value || '' };
      return old&&['cadence','kind','value','name'].every(field=>(old[field]||'')===next[field])?old:next;});
  }
  async function upload(files,kind) {
    if(accessBlocked)return;
    const item = working.items.find(i=>i.id===modal.id);
    for (const file of files) {
      const response = await fetch(`${API}/photo`,{method:'PUT',headers:{...headers(),'Content-Type':file.type},body:file});
      const body = await response.json().catch(()=>({}));
      if (!response.ok) throw Error(body.error || `HTTP ${response.status}`);
      item[kind==='standard'?'standardPhotos':'methodPhotos'].push({id:body.id,name:file.name,note:''});
    }
  }
  function confirmTwice(noun) {
    return window.confirm(`${t('確認刪除','Xác nhận xóa')} ${noun}?`) &&
      window.confirm(`${t('再次確認：此操作僅修改草稿，保留歷史版本。','Xác nhận lần hai: chỉ thay đổi bản nháp, giữ lịch sử.')}`);
  }
  function bind() {
    const q = selector => host.querySelector(selector);
    q('#ipqcab-line')?.addEventListener('change',e=>{line=e.target.value;showRouteExtras=false;group='';stage='';errorId='';versionId='';working=null;selectDefaults();working=opened()?.status==='draft'?clone(opened().snapshot):null;draw();});
    q('#ipqcab-group')?.addEventListener('change',e=>{group=e.target.value;showRouteExtras=false;stage='';errorId='';versionId='';working=null;selectDefaults();working=opened()?.status==='draft'?clone(opened().snapshot):null;draw();});
    q('#ipqcab-route-extras')?.addEventListener('click',()=>{showRouteExtras=!showRouteExtras;selectDefaults();draw();});
    q('#ipqcab-stage')?.addEventListener('change',e=>{stage=e.target.value;errorId='';selectDefaults();draw();});
    q('#ipqcab-version')?.addEventListener('change',e=>{versionId=e.target.value;working=version()?.status==='draft'?clone(version().snapshot):null;draw();});
    q('#ipqcab-begin')?.addEventListener('click',()=>write('begin'));
    q('#ipqcab-save')?.addEventListener('click',()=>save());
    q('#ipqcab-submit')?.addEventListener('click',()=>void save('submit'));
    q('#ipqcab-withdraw')?.addEventListener('click',()=>write('withdraw'));
    q('#ipqcab-add-error')?.addEventListener('click',()=>{modal={type:'new-error',name:''};draw();q('#ab-error-name')?.focus();});
    q('#ipqcab-add-item')?.addEventListener('click',async()=>{
      if(!scope()?.workflow){if(!await write('begin'))return;}
      const id='temp-'+crypto.randomUUID();modalBase=clone(opened().snapshot);modalGeneration=scope().workflow.generation;
      working.items.push({id,code:t('套用時分配編號','Cấp mã khi áp dụng'),errorId,standard:'',methodText:'',inspectionMode:'visual',equipmentId:'',equipmentSnapshot:null,isEnabled:true,rules:[],standardPhotos:[],methodPhotos:[],productCodes:[],sourceRows:[],sourceTool:'',sourceMethod:'',sourceFrequency:'',reason:'',deleted:false});modal={type:'item',id};draw();
    });
    host.querySelectorAll('[data-ab-error]').forEach(el=>el.addEventListener('click',()=>{errorId=el.dataset.abError;draw();}));
    host.querySelectorAll('[data-ab-view-error],[data-ab-edit-error]').forEach(el=>el.addEventListener('click',()=>{
      const id=el.dataset.abViewError||el.dataset.abEditError;
      modal={type:'error',id,readonly:!!el.dataset.abViewError,initial:clone(snapshot().errors.find(e=>e.id===id))};draw();}));
    host.querySelectorAll('[data-ab-view-item],[data-ab-edit-item]').forEach(el=>el.addEventListener('click',()=>{
      const id=el.dataset.abViewItem||el.dataset.abEditItem;
      modal={type:'item',id,readonly:!!el.dataset.abViewItem,initial:clone(snapshot().items.find(i=>i.id===id))};draw();}));
    host.querySelectorAll('[data-ab-delete-item]').forEach(el=>el.addEventListener('click',async()=>{
      if (confirmTwice(el.dataset.abDeleteItem) && await ensureSaved()) await write('delete-item',{id:el.dataset.abDeleteItem});}));
    host.querySelectorAll('[data-ab-delete-error]').forEach(el=>el.addEventListener('click',async()=>{
      if (confirmTwice(el.dataset.abDeleteError) && await ensureSaved()) await write('delete-error',{id:el.dataset.abDeleteError});}));
    host.querySelectorAll('[data-ab-matrix-item]').forEach(el=>el.addEventListener('change',async()=>{
      const itemId=el.dataset.abMatrixItem,product=el.dataset.abMatrixProduct;
      const item = working?.items.find(i=>i.id===itemId);
      if (!item) return;
      const set = new Set(item.productCodes);
      if (el.checked) set.add(product); else set.delete(product);
      item.productCodes = [...set]; await save('apply');
    }));
    host.querySelectorAll('[data-ab-goto-error]').forEach(el=>el.addEventListener('click',()=>{const error=snapshot().errors.find(e=>e.id===el.dataset.abGotoError);if(!error)return;stage=error.stageCode;errorId=error.id;draw();host.querySelector('.ipqcab-matrix')?.scrollIntoView({block:'center'});}));
    host.querySelectorAll('[data-ab-goto]').forEach(el=>el.addEventListener('click',()=>{
      const item = snapshot().items.find(i=>i.id===el.dataset.abGoto), parent = snapshot().errors.find(e=>e.id===item?.errorId);
      if (!item||!parent)return;
      line=parent.line;group=parent.group;stage=parent.stageCode;errorId=parent.id;
      modal={type:'item',id:item.id,readonly:!editing(),initial:clone(item)};draw();
    }));
    host.querySelectorAll('[data-ab-photo-item]').forEach(el=>el.addEventListener('click',()=>{
      viewer={itemId:el.dataset.abPhotoItem,kind:el.dataset.abPhotoKind,index:Number(el.dataset.abPhotoIndex)};draw();}));
    host.querySelectorAll('[data-ab-close]').forEach(el=>el.addEventListener('click',()=>{
      if (modal?.type==='equipment') {modal={type:'item',id:modal.itemId,initial:modal.initial};draw();return;}
      if (modal?.type==='item' && !modal.readonly) captureModal();
      const initial=modal?.initial;
      if (initial && !modal.readonly) {
        const list=modal.type==='error'?working?.errors:working?.items;
        const index=list?.findIndex(row=>row.id===initial.id) ?? -1;
        if (index>=0 && JSON.stringify(list[index])!==JSON.stringify(initial)) {
          if (!window.confirm(t('未套用的內容將取消，確定離開？','Nội dung chưa áp dụng sẽ bị hủy. Rời đi?'))) return;
          list[index]=initial;
        }
      }
      if(modal?.id?.startsWith('temp-'))working.items=working.items.filter(i=>i.id!==modal.id);
      if(scope()?.workflow&&opened()?.status==='draft')working=clone(opened().snapshot);
      modal=null;draw();
    }));
    q('#ab-apply')?.addEventListener('click',async()=>{
      if (modal.type==='new-error') {
        const name=q('#ab-error-name')?.value?.trim();
        if (!name) {q('#ab-error-name')?.reportValidity();return;}
        modal.name=name;
        if (!await ensureSaved()) return;
        const result=await write('create-error',{stageCode:stage,name});
        if (result) {errorId=opened().snapshot.errors.at(-1)?.id||errorId;modalBase=clone(opened().snapshot);modalGeneration=scope().workflow?.generation||null;modal={type:'error',id:errorId};draw();}
        return;
      }
      if (modal.type==='error') working.errors.find(e=>e.id===modal.id).name = q('#ab-error-name').value;
      else captureModal();
      const saved = modal?.id?.startsWith('temp-')?await write('create-item',{errorId:working.items.find(i=>i.id===modal.id).errorId,item:working.items.find(i=>i.id===modal.id)}):await save('apply');
      if (saved) { modal=null;draw(); }
    });
    q('#ab-add-rule')?.addEventListener('click',()=>{captureModal();working.items.find(i=>i.id===modal.id).rules.push({id:crypto.randomUUID(),cadence:'batch',kind:'aql',value:'0.25'});draw();});
    host.querySelectorAll('[data-ab-remove-rule]').forEach(el=>el.addEventListener('click',()=>{captureModal();working.items.find(i=>i.id===modal.id).rules.splice(Number(el.dataset.abRemoveRule),1);draw();}));
    host.querySelectorAll('.ab-rule-cadence,.ab-rule-kind').forEach(el=>el.addEventListener('change',()=>{
      captureModal(); const item=working.items.find(i=>i.id===modal.id), index=Number(el.closest('[data-ab-rule]').dataset.abRule);
      const rule=item.rules[index];
      if (el.classList.contains('ab-rule-cadence')) Object.assign(rule,{cadence:el.value,kind:el.value==='batch'?'aql':'week',value:el.value==='batch'?'0.25':''});
      else Object.assign(rule,{kind:el.value,value:el.value==='aql'?'0.25':''});
      draw();
    }));
    host.querySelectorAll('[data-ab-upload]').forEach(el=>el.addEventListener('change',async()=>{
      captureModal(); try { await upload([...el.files],el.dataset.abUpload);draw(); }
      catch(error){message=error.message;draw();}
    }));
    host.querySelectorAll('[data-ab-remove-photo],[data-ab-move]').forEach(el=>el.addEventListener('click',()=>{
      captureModal(); const item=working.items.find(i=>i.id===modal.id);
      if (el.dataset.abRemovePhoto) {
        if (!confirmTwice(t('照片','Ảnh'))) return;
        const [kind,index]=el.dataset.abRemovePhoto.split(':');item[kind==='standard'?'standardPhotos':'methodPhotos'].splice(Number(index),1);
      } else { const [kind,index,direction]=el.dataset.abMove.split(':');const list=item[kind==='standard'?'standardPhotos':'methodPhotos'];
        const at=Number(index),to=at+Number(direction);[list[at],list[to]]=[list[to],list[at]]; }
      draw();
    }));
    q('#ab-select-equipment')?.addEventListener('click',()=>{captureModal();modal={type:'equipment',itemId:modal.id,initial:modal.initial,query:'',category:'',loading:true};void loadEquipment();});
    q('#ab-equipment-retry')?.addEventListener('click',()=>void loadEquipment());
    q('#ab-clear-equipment')?.addEventListener('click',()=>{captureModal();const item=working.items.find(i=>i.id===modal.id);item.equipmentId='';item.equipmentSnapshot=null;draw();});
    const filterEquipment = () => {
      let count=0, available=0;
      q('#ab-equipment-results')?.querySelectorAll('[data-ab-choose-equipment]').forEach(button=>{
        const eq=equipment.find(row=>row.id===button.dataset.abChooseEquipment);
        button.hidden=(!`${eq.assetCode} ${eq.pieceMark} ${eq.name} ${eq.spec} ${eq.category} ${eq.subcategory} ${eq.group}`.toLowerCase().includes((modal.query||'').toLowerCase())) ||
          !!(modal.category && eq.categoryId!==modal.category || modal.subcategory && eq.subcategoryId!==modal.subcategory || modal.group && eq.groupId!==modal.group);
        if (!button.hidden) {count++;if(eq.available)available++;}
      });
      const tally=q('.ipqcab-equipment-count');if(tally)tally.textContent=`${t('符合','Phù hợp')} ${count} · ${t('可選','Có thể chọn')} ${available}`;
    };
    q('#ab-equipment-search')?.addEventListener('input',e=>{modal.query=e.target.value;filterEquipment();});
    for (const field of ['category','subcategory','group']) q(`#ab-equipment-${field}`)?.addEventListener('change',e=>{
      modal[field]=e.target.value;
      if (field==='category') {modal.subcategory='';modal.group='';}
      if (field==='subcategory') modal.group='';
      draw();
    });
    if (modal?.type==='equipment') filterEquipment();
    host.querySelectorAll('[data-ab-choose-equipment]').forEach(el=>el.addEventListener('click',()=>{
      const item=working.items.find(i=>i.id===modal.itemId),eq=equipment.find(e=>e.id===el.dataset.abChooseEquipment);
      if (!item || !eq?.available) return;
      item.inspectionMode='equipment';item.equipmentId=eq.id;item.equipmentSnapshot=clone(eq);
      modal={type:'item',id:item.id,initial:modal.initial};draw();
    }));
    host.querySelectorAll('[data-ab-view-modal]').forEach(el=>el.addEventListener('click',()=>{
      captureModal();const [kind,index]=el.dataset.abViewModal.split(':');viewer={itemId:modal.id,kind,index:Number(index)};draw();}));
    q('[data-ab-close-viewer]')?.addEventListener('click',()=>{viewer=null;draw();});
    q('[data-ab-prev]')?.addEventListener('click',()=>{viewer.index=(viewer.index-1+(snapshot().items.find(i=>i.id===viewer.itemId)?.[viewer.kind==='standard'?'standardPhotos':'methodPhotos']?.length||1))%(snapshot().items.find(i=>i.id===viewer.itemId)?.[viewer.kind==='standard'?'standardPhotos':'methodPhotos']?.length||1);draw();});
    q('[data-ab-next]')?.addEventListener('click',()=>{viewer.index=(viewer.index+1)%(snapshot().items.find(i=>i.id===viewer.itemId)?.[viewer.kind==='standard'?'standardPhotos':'methodPhotos']?.length||1);draw();});
  }
  let reviewLoading = false,reviewLoadingOwner=null;
  function reviewHTML() {
    if(accessBlocked)return `<section class="ipqcab-card"><p role="alert">${h(message||t('目前無法讀取 IPQC-AB；請重新核對權限。','Không thể đọc IPQC-AB; hãy kiểm tra quyền.'))}</p></section>`;
    const pending = Object.values(control?.scopes || {}).flatMap(s=>s.versions.filter(v=>!v.wholeModuleCaseId&&['pending','pending-test'].includes(v.status)).map(v=>({scope:s,version:v})));
    const history = Object.values(control?.scopes || {}).flatMap(s=>s.versions.filter(v=>!v.wholeModuleCaseId&&['approved','superseded','tested','returned','withdrawn'].includes(v.status)).slice(-3).reverse().map(v=>({scope:s,version:v})));
    return `<section class="ipqcab-review ipqcab-card" data-i18n-skip="true"><h3>IPQC-AB · ${t('待確認','Chờ duyệt')} ${pending.length+Number(!!control?.moduleDraft?.workflow?.pendingId)}</h3>${message?`<p role="alert" class="ipqcab-message">${h(displayDraftError(message))}</p>`:''}
      ${moduleReviewHTML()}${[...pending,...history].map(({scope:s,version:v})=>`<article class="vd-review-case"><details data-case-id="${h(v.id)}"><summary><b>${h(s.line)} · ${h(s.group)} · V${v.number} · ${status(v.status)}</b> · ${t('展開內容','Xem nội dung')}</summary><p>${h(v.creatorName)} · ${h(new Date(v.updatedAt).toLocaleString())} · ${v.snapshot.errors.length} ${t('錯誤代碼','mã lỗi')} / ${v.snapshot.items.length} ${t('項目','hạng mục')}${v.reviewedBy?`<br>${t('確認者','Người duyệt')}: ${h(v.reviewedBy)} · ${h(new Date(v.reviewedAt).toLocaleString())}`:''}${v.reviewComment?`<br>${t('意見','Ý kiến')}: ${h(v.reviewComment)}`:''}</p>
        <p>${t('送審理由','Lý do gửi duyệt')}：${h(s.workflow?.cases?.find(c=>c.id===v.id)?.reason||v.reason||'—')}</p>
        <details><summary>${t('檢查項目','Hạng mục kiểm tra')} · ${v.snapshot.items.length}</summary>${v.snapshot.items.filter(i=>!i.deleted).map(i=>`<p><b>${h(i.code)}</b> · ${h(i.standard)}</p>`).join('')}</details>
        ${['pending','pending-test'].includes(v.status)?`<label>${t('審核意見（選填）','Ý kiến duyệt (không bắt buộc)')}<textarea data-ab-review-comment="${h(s.line)}:${h(s.group)}"></textarea></label>`:''}</details>
        ${['pending','pending-test'].includes(v.status)?`<div class="vd-actions"><button type="button" data-ab-approve="${h(s.line)}:${h(s.group)}" data-case-id="${h(v.id)}">${t('確認','Duyệt')}</button><button type="button" data-ab-reject="${h(s.line)}:${h(s.group)}" data-case-id="${h(v.id)}">${t('發回','Trả lại')}</button></div>`:''}
        ${v.status==='pending-test'?`<small>${t('測試單：確認也不生效','Hồ sơ thử: duyệt không có hiệu lực')}</small>`:''}</article>`).join('') || (control?.moduleDraft?.workflow?.cases.length?'':`<p>${t('目前沒有審核紀錄','Không có hồ sơ duyệt')}</p>`)}</section>`;
  }
  function moduleReviewHTML(){const moduleControl=control?.moduleDraft,flow=moduleControl?.workflow;if(!flow)return '';return flow.cases.slice(-10).reverse().map(c=>{
    const v=moduleControl.versions.find(v=>v.id===c.id),members=v?.snapshot?.scopes||{},pending=c.status==='pending';
    return `<article class="vd-review-case"><details data-case-id="${h(c.id)}"><summary><b>IPQC-AB · ${t('整份案件','Hồ sơ toàn bộ')} · ${status(c.status)}</b></summary><p>${h(c.actor.name)} · ${h(c.reason)}</p>${Object.entries(members).map(([key,s])=>`<details><summary>${h(key)} · ${s.items.length} ${t('項目','hạng mục')}</summary>${s.items.filter(i=>!i.deleted).map(i=>`<p>${h(i.code)} · ${h(i.standard)}</p>`).join('')}</details>`).join('')}</details>${pending?`<div class="vd-actions"><button data-ab-module-action="approve" data-case-id="${h(c.id)}">${t('確認整份','Duyệt toàn bộ')}</button><button data-ab-module-action="reject" data-case-id="${h(c.id)}">${t('發回整份','Trả lại toàn bộ')}</button><button data-ab-module-action="withdraw" data-case-id="${h(c.id)}">${t('撤回整份','Rút toàn bộ')}</button></div>`:''}</article>`;
  }).join('');}
  function drawReview() {
    if(accessBlocked){renderAccessBlocked(reviewHost);return;}
    if (!reviewHost || !document.contains(reviewHost)) return;
    const restore=window.VersionDraftUI.preserveView(reviewHost),section=reviewHost.querySelector('.ipqcab-review');
    if (section) section.outerHTML=reviewHTML();
    // bindReview owns its delivery-fenced load/catch; this caller does not await review hydration.
    void bindReview(reviewHost);restore();
  }
  function bindReview(root) {
    reviewHost=root;
    if(accessBlocked){renderAccessBlocked(root);return;}
    if(!control){
      const identity=actor(),epoch=window.ProcessSync?.identityGeneration?.(),delivery=window.ProcessSync?.captureDelivery?.();
      const current=()=>reviewHost===root&&root.isConnected&&actor()===identity&&(!Number.isFinite(epoch)||window.ProcessSync?.identityGeneration?.()===epoch)&&!window.ProcessSync?.requiresReload&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));
      if(reviewLoading&&reviewLoadingOwner===root)return reviewLoading;
      const task=load().then(loaded=>{if(loaded!==false&&current())drawReview();}).catch(error=>{if(current()){navigationError=error;message=error.message;renderAccessBlocked(root);}}).finally(()=>{if(reviewLoading===task){reviewLoading=null;reviewLoadingOwner=null;}});
      reviewLoading=task;reviewLoadingOwner=root;return task;
    }
    sharedClient?.gatePermissions?.();
    root.querySelectorAll('[data-ab-module-action]').forEach(el=>{const action=el.dataset.abModuleAction,permission=action==='reject'?'approval.reject':action==='approve'?'approval.approve':'approval.withdraw';el.disabled=!permitted(permission);el.onclick=()=>moduleSave(action,{versionId:el.dataset.caseId});});
    root.querySelectorAll('[data-ab-approve],[data-ab-reject]').forEach(el=>el.addEventListener('click',async()=>{
      if(busy)return;const [selectedLine,...parts]=(el.dataset.abApprove||el.dataset.abReject).split(':'),selectedGroup=parts.join(':');
      line=selectedLine;group=selectedGroup;versionId=opened()?.id || '';
      const comment=el.dataset.abApprove ? root.querySelector(`[data-ab-review-comment="${selectedLine}:${selectedGroup}"]`)?.value?.trim() || '' : '';
      const result=await write(el.dataset.abApprove?'approve':'reject',{comment,versionId:el.dataset.caseId});
      if (result) drawReview();
    }));
  }
  function showPendingItem() {
    if (!pendingItemView || !control) return;
    const { versionId: requestedVersion, itemId, scope: requestedScope } = pendingItemView;
    const match = Object.entries(control.scopes).flatMap(([scopeKey,s])=>s.versions.map(v=>({scopeKey,s,v})))
      .find(({scopeKey,v})=>(!requestedScope || scopeKey===requestedScope) && v.id===requestedVersion && v.snapshot.items.some(i=>i.id===itemId && !i.deleted));
    pendingItemView = null;
    if (!match) return;
    line=match.s.line;group=match.s.group;versionId=match.v.id;
    const item=match.v.snapshot.items.find(i=>i.id===itemId);
    const parent=match.v.snapshot.errors.find(e=>e.id===item.errorId);
    stage=parent?.stageCode || '';errorId=parent?.id || '';
    working=match.v.status==='draft' ? clone(match.v.snapshot) : null;
    modal={type:'item',id:itemId,readonly:true};draw();
  }
  window.addEventListener('keydown',event=>{
    if(host?.dataset.activeTab!=='quality-ipqc-ab' || !modal || viewer)return;
    const dialog=host.querySelector('.ipqcab-dialog');if(!dialog)return;
    if(event.key==='Escape'){event.preventDefault();dialog.querySelector('[data-ab-close]')?.click();}
    if(event.key==='Tab'){
      const nodes=[...dialog.querySelectorAll('button,input,select,textarea')].filter(node=>!node.disabled&&node.getClientRects().length);
      if(document.activeElement===(event.shiftKey?nodes[0]:nodes.at(-1)) || !dialog.contains(document.activeElement)){event.preventDefault();(event.shiftKey?nodes.at(-1):nodes[0])?.focus({preventScroll:true});}
    }
  });
  let navigationError=null;
  window.IPQCABUI = { navigation:{requiresSave:()=>!!host?.isConnected&&window.sharedDraftNeedsSave?.(control?.moduleDraft?.workflow||scope()?.workflow),saveForDeparture:()=>save('save'),canLeave:()=>!busy&&!modal&&(!working||JSON.stringify(working)===JSON.stringify(opened()?.snapshot)),error:()=>navigationError,reset(){loadGeneration++;accessBlocked=null;privateQuarantine=null;lastCommandAcknowledgement=null;pollTimer.cancel();host=null;reviewHost=null;control=null;catalog={groups:[],products:[],stages:[]};equipment=[];revision=null;working=null;modalBase=null;modalGeneration=null;sourceEntryApplied=false;reviewLoading=null;versionId='';navigationError=null;modalScrolls.clear();}},html:()=>'<section class="ipqcab-page" id="ipqcab-page">IPQC-AB…</section>',
    openItemView(requestedVersion,itemId,requestedScope=''){
      pendingItemView={versionId:requestedVersion,itemId,scope:requestedScope};
      if (host?.dataset.activeTab==='quality-ipqc-ab' && document.contains(host)) { showPendingItem();return; }
      document.querySelector('[data-quality-tab="quality-ipqc-ab"]')?.click();
    },
    async mount(element){host=element;const delivery=window.ProcessSync?.captureDelivery?.(),current=()=>host===element&&element.isConnected&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));navigationError=null;try{if(await load()===false)return;if(!current())return;const q=new URLSearchParams(location.search),requested=q.get('ipqcScope'),requestedStage=q.get('ipqcStage');if(requested&&!sourceEntryApplied&&control.scopes[requested]){sourceEntryApplied=true;const s=control.scopes[requested];line=s.line;group=s.group;versionId=opened()?.id||active()?.id||'';working=opened()?.status==='draft'?clone(opened().snapshot):null;if(requestedStage)stage=requestedStage;selectDefaults();}draw();showPendingItem();scheduleRefresh();}catch(error){if(!current())return;navigationError=error;host.innerHTML=`<section class="ipqcab-card"><p role="alert">${h(error.message)}</p><button type="button" id="ipqcab-retry">${t('重試','Thử lại')}</button></section>`;
      host.querySelector('#ipqcab-retry').onclick=()=>window.IPQCABUI.mount(host);}},
    reviewHTML,bindReview,pendingCount:()=>Number(!!control?.moduleDraft?.workflow?.pendingId)+Object.values(control?.scopes||{}).reduce((n,s)=>n+s.versions.filter(v=>!v.wholeModuleCaseId&&['pending','pending-test'].includes(v.status)).length,0) };
  new MutationObserver(()=>{
    if (host?.dataset.activeTab==='quality-ipqc-ab' && document.contains(host)) {
      if (modal?.type==='item' && !modal.readonly) captureModal();
      reason=host.querySelector('#ipqcab-reason')?.value ?? reason;draw();
    }
    drawReview();
  }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
})();
