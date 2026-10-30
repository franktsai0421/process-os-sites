// The shell and executable code persist. Authenticated target projections never
// share a business-data cache: each committed destination replaces its mirror.
(() => {
 const sync=window.ProcessSync,policy=window.ProcessDeliveryPurpose;
 if(!sync?.deliveryProjection||!policy||!sync.destination)return;
 const moduleNames=['FQCMasterUI','IQCMasterUI','IPQCABUI','IPQCCUI','ToolingUI','RoutineEquipmentUI','RoutineFQCUI','BOMWorkspace','ProcessAuthoringV3','ProcessUserAccess','ProcessFeedbackEntry'];
 const modules=()=>moduleNames.map(name=>window[name]).filter(Boolean);
 const draftsPending=()=>{
  const shared=sync.pendingState?.()||{},drafts=window.sharedDraftAccountState?.()||{};
  return shared.dirty||shared.inFlight||shared.paused||shared.blocked||drafts.queued||drafts.unknown||drafts.failed||sync.projectionWriteError;
 };
 const editingScopes='dialog[open],.fqc-modal-overlay,.iqc-dialog-overlay,.ipqcc-overlay,.ipqcab-modal,.routine-dialog-overlay';
 const departureAdapter=()=>sync.destination?.view==='editor'?window.ProcessAuthoringV3?.navigation?.departure:null;
 const isDecision=node=>node?.dataset?.navigationDeparture==='true';
 const ownedDialog=(adapter,node)=>{try{return !!adapter?.ownsDialog?.(node);}catch{return false;}};
 function adapterState(adapter){try{const value=adapter.inspect();if(value&&['clean','dirty','busy','unknown','blocked'].includes(value.state))return value;}catch{}return{state:'unknown',canSave:false,canDiscard:false,reason:document.documentElement.lang==='vi'?'Chưa xác nhận trạng thái bản nháp. Hãy ở lại và đọc lại trạng thái hoặc kiểm tra biên nhận gốc.':'草稿狀態尚未確認，請留在原頁重新讀取狀態或查詢原操作收據。'};}
 function otherDepartureBlocked(adapter){
  if(sync.requiresReload||draftsPending()||window.ProcessNavigationForms?.composing?.())return true;
  if(window.ProcessRuntimeProjection?.canLeave?.()===false||window.MasterDataWorkflow?.canLeave?.()===false)return true;
  if(modules().some(api=>(!adapter||api.navigation?.departure!==adapter)&&api.navigation?.canLeave?.()===false))return true;
  if([...document.querySelectorAll('dialog[open],.iqc-lightbox,.fqc-viewer-overlay')].some(node=>!isDecision(node)&&!ownedDialog(adapter,node)))return true;
  return [...document.querySelectorAll(editingScopes)].some(node=>!isDecision(node)&&!ownedDialog(adapter,node)&&window.ProcessNavigationForms?.dirty?.(node));
 }
 function canLeave(){
  const adapter=departureAdapter();
  if(adapter&&adapterState(adapter).state!=='clean')return false;
  return !otherDepartureBlocked(adapter);
 }
 const api=window.ProcessDeliveryNavigation={ownsHistory:true,pending:()=>!canLeave()};
 api.initialized=(async()=>{
  const {createNavigationCoordinator,createDepartureCoordinator,navigationKey}=await import('./navigation-lifecycle.mjs?v=20261030-departure1');
  const initial={...sync.destination,approvalTab:['process','quality','routine'].includes(state.approvalTab)?state.approvalTab:'master'};
  let installed=initial,installing=false,broken=false,readyGeneration=0,commitPhase=false;
  let historyIndex=Number.isSafeInteger(history.state?.processNavigationIndex)?history.state.processNavigationIndex:0;
  let committedURL=location.href,restoreIndex=null,physicalIndex=historyIndex,queuedAfterRestore=null,replayingPop=null;
  history.replaceState({...history.state,processNavigationIndex:historyIndex},'',location.href);
  const baseNavigate=navigate,baseRender=render;
  const sourceState=()=>{state.view=installed.view;state.dataTab=installed.dataTab;state.approvalTab=installed.approvalTab||'master';window.ProcessDualSystem?.installSystem?.(installed.system);};
  function clearPageModels(){
   window.QualityReviewOverview?.dispose?.();window.EffectiveVersionNotice?.reset?.();
   for(const dialog of document.querySelectorAll('body > dialog:not([open])')){for(const media of dialog.querySelectorAll('img,video')){media.pause?.();media.removeAttribute('src');}dialog.remove();}
   for(const deliveryModule of modules())deliveryModule.navigation?.reset?.();
   window.invalidateSharedDraftReads?.();
   window.ProcessNavigationForms?.clearDisconnected?.();
  }
  function routeURL(target){const url=policy.destinationURL(committedURL,target);
   if(target.view==='approval')url.searchParams.set('approvalTab',target.approvalTab||'master');else{url.searchParams.delete('approvalTab');url.searchParams.delete('rfDocument');url.searchParams.delete('rfCase');}
   if(target.display){for(const [key,value]of Object.entries(target.display))if(['rfDocument','rfCase'].includes(key))url.searchParams.set(key,value);}
   return url;
  }
  function targetError(error,reloadOnly=false){
   const area=document.querySelector('#view-root');if(!area)return;
   const panel=document.createElement('section');panel.className='page';panel.setAttribute('role','alert');
   const text=document.createElement('p');text.textContent=document.documentElement.lang==='vi'?'Không tải được nội dung. Dữ liệu cũ không được sử dụng.':'內容載入失敗，未沿用上一頁資料。';panel.append(text);
   const retry=document.createElement('button');retry.className='button ghost';retry.textContent=document.documentElement.lang==='vi'?'Thử lại':'重試';
   retry.onclick=()=>reloadOnly?location.reload():request(installed,{history:'replace',force:true});panel.append(retry);panel.dataset.navigationError='true';
   if(reloadOnly)area.replaceChildren(panel);else{area.querySelector('[data-navigation-error]')?.remove();area.prepend(panel);}
   document.documentElement.dataset.processNavigationStatus='error';
   delete document.documentElement.dataset.processDestinationReadyGeneration;
  }
  async function readyForDestination(target){
   if(target.view.startsWith('quality-')||target.dataTab?.startsWith('quality-'))await window.ProcessDualSystem?.readyForDestination?.();
   await window.ProcessDataTabs?.readyForDestination?.();
   if(target.view==='editor')await window.ProcessAuthoringV3?.readyForEditor?.();
   if(target.view==='approval'&&target.approvalTab==='process')await window.ProcessAuthoringV3?.load?.();
   if(target.dataTab==='bom')await window.BOMWorkspace?.readyForDestination?.();
   if(target.dataTab==='users')await window.ProcessUserAccess?.readyForDestination?.();
   if(target.view==='approval'&&target.approvalTab==='master')await window.BOMWorkspace?.readyForReview?.();
   const relevant=target.view==='approval'?target.approvalTab==='quality'?moduleNames.slice(0,6):target.approvalTab==='routine'?['RoutineFQCUI']:target.approvalTab==='process'?['ProcessAuthoringV3']:['BOMWorkspace']:
    ({'quality-fqc':['FQCMasterUI'],'quality-iqc':['IQCMasterUI'],'quality-ipqc-ab':['IPQCABUI'],'quality-ipqc-c':['IPQCCUI'],'quality-mold-equipment':['ToolingUI'],'quality-routine-equipment':['RoutineEquipmentUI'],bom:['BOMWorkspace'],users:['ProcessUserAccess']})[target.dataTab]|| (target.view==='quality-inspections'?['RoutineFQCUI']:target.view==='editor'?['ProcessAuthoringV3']:[]);
   for(const name of relevant){const error=window[name]?.navigation?.error?.();if(error)throw error;}
  }
  const coordinator=createNavigationCoordinator({
   initial,key:target=>navigationKey(target)+(target.view==='player'?JSON.stringify(target.display||{}):''),owner:()=>({id:sync.identity?.id,epoch:sync.identityGeneration?.()}),canLeave:()=>!broken&&canLeave(),
   prepare:(target,context)=>sync.prepareDestination(target,context.signal),validate:(handle,_target,_context,options)=>{sync.validateDestination(handle);if(options.departureTicket&&!departure.ticketCurrent(options.departureTicket))throw Error('DEPARTURE_CONTEXT_CHANGED');},
   commit(handle,target,context,options){
    commitPhase=true;installing=true;
    try{
     const destination={...handle.destination,approvalTab:target.approvalTab||'master',display:target.display};
     // Only the adapter may close its clean forms/viewers. Keep them, and the
     // source edit lease, intact throughout a failed target preparation.
     departureAdapter()?.closeClean?.();
     if(options.departureTicket)departure.committed(options.departureTicket);
     // Invalidate old GET ownership before detaching DOM or installing models.
     sync.commitDestination(handle);clearPageModels();
     document.querySelector('#view-root')?.replaceChildren();
     installed=destination;
     const url=options.history==='pop'?new URL(options.url):routeURL(destination);
     if(options.history==='pop')historyIndex=options.index;
     else if(options.history!=='replace')historyIndex++;
     history[options.history==='pop'||options.history==='replace'?'replaceState':'pushState']({...history.state,processNavigationIndex:historyIndex},'',url);
     physicalIndex=historyIndex;committedURL=url.href;
     window.ProcessRuntimeProjection.install(sync.catalog);window.MasterDataWorkflow.resetProjection();
     if(destination.view==='player')window.ProcessRuntimeProjection.applyPlayerIntent?.();
     sourceState();readyGeneration=context.id;
     document.documentElement.dataset.processDestinationGeneration=String(context.id);
     document.documentElement.dataset.processDestinationKey=navigationKey(destination);
     delete document.documentElement.dataset.processDestinationReadyGeneration;
     document.documentElement.dataset.processNavigationStatus='loading';
     baseNavigate(destination.view);
     commitPhase=false;return destination;
    }finally{installing=false;}
   },
   ready:readyForDestination,
   complete(target,context){void window.EffectiveVersionNotice?.check?.();document.documentElement.dataset.processDestinationReadyGeneration=String(context.id);document.documentElement.dataset.processNavigationStatus='ready';document.documentElement.dataset.processReadyMs=String(Math.round(performance.now()));window.dispatchEvent(new CustomEvent('process-destination-ready',{detail:{generation:context.id,key:navigationKey(target)}}));},
   failure(error,{committed,options}){
    if(options.departureTicket&&departure.ticketCurrent(options.departureTicket))departure.cancel('error',false);
    if(committed){if(commitPhase){broken=true;sync.suspendDestination?.();for(const button of document.querySelectorAll('.sidebar button,.topbar button,#account-menu button'))button.disabled=true;try{clearPageModels();}catch{}for(const value of [window.IMPORTED_DATA,window.LINE_PROCESS_DATA,window.LINE_C_MASTER])if(value&&typeof value==='object')for(const key of Object.keys(value))delete value[key];}targetError(error,broken);return;}
    sourceState();if(physicalIndex!==historyIndex||options.history==='pop')restoreSource();else history.replaceState(history.state,'',committedURL);
    toast(error.status===403?'目前無法讀取此頁資料；原頁保留。':'切頁讀取失敗；原頁保留，請重試。');
   },
   pending(target){document.documentElement.dataset.processNavigationPending=target?'1':'0';}
  });
  const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
  let decisionDialog=null,decisionChoose=null,decisionSnapshot=null,decisionFocus=null,pendingDecisionFocus=null,focusRestoreTask=null;
  function cancelFocusRestore(){pendingDecisionFocus=null;if(focusRestoreTask!==null){window.clearTimeout(focusRestoreTask);focusRestoreTask=null;}}
  function captureDecisionFocus(){
   const element=document.activeElement,scroll=[];let selection=null;
   try{if(Number.isInteger(element?.selectionStart)&&Number.isInteger(element?.selectionEnd))selection={start:element.selectionStart,end:element.selectionEnd,direction:element.selectionDirection,value:element.value};}catch{}
   for(let node=element;node;node=node.parentNode)if(Number.isFinite(node.scrollTop)&&Number.isFinite(node.scrollLeft))scroll.push({node,top:node.scrollTop,left:node.scrollLeft});
   return{element,selection,scroll,x:window.scrollX,y:window.scrollY,id:sync.identity?.id,epoch:sync.identityGeneration?.(),delivery:sync.captureDelivery?.(),source:readyGeneration};
  }
  function restoreDecisionFocus(){
   const saved=pendingDecisionFocus;if(!saved)return;
   if(decisionDialog||!saved.element?.isConnected||saved.id!==sync.identity?.id||saved.epoch!==sync.identityGeneration?.()||saved.source!==readyGeneration||saved.delivery&&sync.isCurrentDelivery?.(saved.delivery)===false||sync.requiresReload){cancelFocusRestore();return;}
   if(physicalIndex!==historyIndex||restoreIndex!==null||replayingPop)return;
   pendingDecisionFocus=null;saved.element.focus?.({preventScroll:true});
   if(saved.selection&&saved.element.value===saved.selection.value)try{saved.element.setSelectionRange(saved.selection.start,saved.selection.end,saved.selection.direction);}catch{}
   for(const entry of saved.scroll)if(entry.node.isConnected){entry.node.scrollTop=entry.top;entry.node.scrollLeft=entry.left;}
   if(Number.isFinite(saved.x)&&Number.isFinite(saved.y))window.scrollTo?.(saved.x,saved.y);
  }
  // Native traversal restores persisted selection/scroll after popstate. Wait
  // for that restoration, but never let a late snapshot override new input.
  function scheduleFocusRestore(){if(!pendingDecisionFocus)return;if(focusRestoreTask!==null)window.clearTimeout(focusRestoreTask);focusRestoreTask=window.setTimeout(()=>{focusRestoreTask=null;restoreDecisionFocus();},0);}
  for(const event of ['pointerdown','keydown','input'])document.addEventListener(event,cancelFocusRestore,true);
  function decisionMessage(error){
   if(error?.message==='DEPARTURE_CHANGES_REMAIN')return t('仍有新的未儲存內容，已留在原頁。請檢查最新內容後再操作。','Vẫn còn thay đổi chưa lưu. Hãy kiểm tra nội dung mới nhất trên trang này.');
   if(error?.message==='DEPARTURE_CONTEXT_CHANGED')return t('頁面、登入身分或權限已變更。請留在原頁重新確認。','Trang, phiên đăng nhập hoặc quyền đã thay đổi. Hãy kiểm tra lại trên trang này.');
   return window.sharedDraftErrorMessage?.(error)||error?.message||String(error);
  }
  function inspectDeparture(owner){
   const adapter=owner?.adapter||departureAdapter();
   if(!adapter)return{state:'blocked',canSave:false,canDiscard:false,reason:t('目前頁面尚未支援此離頁流程，請先完成或取消原操作。','Trang này chưa hỗ trợ quy trình rời trang; hãy hoàn tất hoặc hủy thao tác hiện tại.')};
   const status=adapterState(adapter);
   if(otherDepartureBlocked(adapter))return{...status,state:'blocked',canSave:false,canDiscard:false,reason:sync.requiresReload?t('登入身分或權限已變更，請保留輸入並重新確認登入狀態。','Phiên đăng nhập hoặc quyền đã thay đổi; giữ nội dung và kiểm tra phiên đăng nhập.'):status.reason||t('仍有處理中、結果未確認的操作或其他視窗。請留在原頁，先查詢操作結果或關閉該視窗，再切頁。','Có thao tác đang xử lý, kết quả chưa xác nhận hoặc cửa sổ khác. Hãy kiểm tra kết quả hoặc đóng cửa sổ đó trước khi chuyển trang.')};
   return status;
  }
  function updateDecision(value){
   decisionSnapshot=value;if(!decisionDialog)return;
   decisionDialog.querySelector('[data-departure-target]').textContent=t('前往：','Đi tới: ')+value.label;
   decisionDialog.querySelector('[data-departure-state]').textContent=value.phase==='mutating'?t('正在確認並處理草稿，請稍候。','Đang xác nhận và xử lý bản nháp. Vui lòng chờ.'):value.phase==='handoff'?t('草稿已處理，正在載入選定頁面。','Đã xử lý bản nháp; đang tải trang đã chọn.'):value.status.reason||(value.status.state==='clean'?t('目前沒有本次待處理變更，可前往選定頁面。','Không còn thay đổi của lần chỉnh sửa này cần xử lý; có thể tới trang đã chọn.'):t('請選擇如何處理目前尚未儲存的變更。','Chọn cách xử lý thay đổi chưa lưu.'));
   decisionDialog.querySelector('[data-departure-error]').textContent=value.error||'';
   for(const action of ['save','discard','stay'])decisionDialog.querySelector('[data-departure-choice="'+action+'"]').disabled=action==='stay'?value.phase==='mutating':value.phase!=='choosing'||!(action==='save'&&value.status.state==='clean')&&(value.status.state!=='dirty'||!value.status[action==='save'?'canSave':'canDiscard']);
  }
  function hideDecision(){const dialog=decisionDialog;decisionDialog=null;decisionChoose=null;decisionSnapshot=null;if(!dialog)return;dialog.onclose=null;dialog.close();dialog.remove();pendingDecisionFocus=decisionFocus;decisionFocus=null;restoreDecisionFocus();}
  function showDecision(value,choose){
   cancelFocusRestore();decisionFocus=captureDecisionFocus();decisionChoose=choose;
   const dialog=decisionDialog=document.createElement('dialog');dialog.id='process-navigation-departure';dialog.dataset.navigationDeparture='true';dialog.dataset.i18nSkip='true';dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-labelledby','process-navigation-departure-title');dialog.style.cssText='max-width:36rem;width:calc(100% - 2rem);max-height:calc(100vh - 2rem);overflow:auto;padding:1.25rem;border-radius:12px;';
   const title=document.createElement('h2');title.id='process-navigation-departure-title';title.textContent=t('離開目前頁面','Rời trang hiện tại');dialog.append(title);
   for(const name of ['target','state','error']){const p=document.createElement('p');p.setAttribute('data-departure-'+name,'');if(name==='error')p.setAttribute('role','alert');dialog.append(p);}
   const choices=document.createElement('div');choices.style.cssText='display:flex;flex-direction:column;gap:.65rem';
   for(const [action,zh,vi]of [['save','儲存草稿並離開','Lưu bản nháp và rời đi'],['discard','放棄未儲存變更並離開','Bỏ thay đổi chưa lưu và rời đi'],['stay','留在本頁','Ở lại trang này']]){const button=document.createElement('button');button.type='button';button.className='button ghost';button.style.cssText='font-size:16px;line-height:1.5;min-height:44px;min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;';button.setAttribute('data-departure-choice',action);button.textContent=t(zh,vi);button.onclick=()=>void decisionChoose?.(action);choices.append(button);}
   dialog.append(choices);dialog.oncancel=event=>{event.preventDefault();if(decisionSnapshot?.phase!=='mutating')void decisionChoose?.('stay');};dialog.onclose=()=>{if(decisionSnapshot?.phase!=='mutating')void decisionChoose?.('stay');};document.body.append(dialog);updateDecision(value);dialog.showModal();dialog.querySelector('[data-departure-choice="stay"]').focus();
  }
  const departure=createDepartureCoordinator({
   owner:()=>({id:sync.identity?.id,epoch:sync.identityGeneration?.(),delivery:sync.captureDelivery?.(),adapter:departureAdapter(),source:readyGeneration}),
   isCurrent:owner=>!!owner?.id&&owner.id===sync.identity?.id&&owner.epoch===sync.identityGeneration?.()&&owner.adapter===departureAdapter()&&owner.source===readyGeneration&&(!owner.delivery||sync.isCurrentDelivery?.(owner.delivery)!==false)&&!sync.requiresReload,
   inspect:inspectDeparture,act:(action,owner)=>owner.adapter[action](),show:showDecision,update:updateDecision,hide:hideDecision,errorMessage:decisionMessage,
   cancelNavigation(){coordinator.cancelUncommitted();queuedAfterRestore?.resolve?.({status:'superseded'});queuedAfterRestore=null;if(replayingPop){replayingPop.resolve?.({status:'superseded'});replayingPop.restore=true;}},stay(){sourceState();if(physicalIndex!==historyIndex||restoreIndex!==null||replayingPop)restoreSource();},failure:error=>toast(decisionMessage(error))
  });
  function targetLabel(target){
   const names={dashboard:['生產總覽','Tổng quan sản xuất'],player:['產線播放台','Trình chiếu chuyền'],dispatch:['發送介面','Điều phối'],productStatus:['產品製程狀態','Trạng thái quy trình'],editor:['製程編輯台','Trình chỉnh sửa quy trình'],approval:['版本確認平台','Xác nhận phiên bản'],'quality-dashboard':['品質總覽','Tổng quan chất lượng'],'quality-search':['標準搜尋','Tìm tiêu chuẩn'],'quality-reports':['品質報告','Báo cáo chất lượng'],'quality-inspections':['例行檢查','Kiểm tra định kỳ'],'quality-fpy':['FPY','FPY'],AB:['AB 產線與類別','Chuyền và nhóm AB'],C:['C 產線與類別','Chuyền và nhóm C'],bom:['BOM','BOM'],'line-admin':['線別與工段管理','Quản lý chuyền và công đoạn'],'process-master':['流程資料','Dữ liệu quy trình'],users:['使用者權限','Quyền người dùng'],'web-feedback':['網頁問題回報','Báo lỗi trang web'],'quality-fqc':['FQC','FQC'],'quality-iqc':['IQC','IQC'],'quality-ipqc-ab':['IPQC-AB','IPQC-AB'],'quality-ipqc-c':['IPQC-C','IPQC-C'],'quality-mold-equipment':['模具設備','Thiết bị khuôn'],'quality-routine-equipment':['檢具與測試設備','Dụng cụ và thiết bị thử'],'quality-routine-reports':['例行報告資料庫','Kho báo cáo định kỳ']};
   return t(...(names[target.dataTab||target.view]||['選定頁面','Trang đã chọn']));
  }
  const departureIntent=(target,options)=>({key:'route:'+navigationKey(target)+JSON.stringify([options.history,options.index,options.url,target.display]),label:targetLabel(target),run:ticket=>routeRequest(target,{...options,departureTicket:ticket})});
  // A browser pop changes the physical history cursor before its GET settles.
  // Restore that cursor before a superseding click; never derive source URL from
  // the temporarily popped address. New intents replace the queued intent only.
  function restoreSource(queued=null){
   coordinator.cancel();queuedAfterRestore?.resolve?.({status:'superseded'});queuedAfterRestore=queued;
   if(replayingPop){replayingPop.resolve?.({status:'superseded'});replayingPop.restore=true;return;}
   if(restoreIndex!==null)return;
   restoreIndex=historyIndex;
   if(physicalIndex===historyIndex)finishRestore();else history.go(historyIndex-physicalIndex);
  }
  function finishRestore(){
   restoreIndex=null;physicalIndex=historyIndex;
   history.replaceState({...history.state,processNavigationIndex:historyIndex},'',committedURL);
   scheduleFocusRestore();
   const queued=queuedAfterRestore;queuedAfterRestore=null;
   if(!queued)return;
   if(queued.resume){Promise.resolve().then(queued.resume).then(queued.resolve,error=>queued.resolve?.({status:'error',error}));return;}
   if(queued.options.history==='pop'&&queued.options.index!==historyIndex){replayingPop=queued;history.go(queued.options.index-historyIndex);return;}
   request(queued.target,queued.options).then(queued.resolve||(()=>{}));
  }
  function request(target,options={}){
   if(!options.departureTicket&&options.history!=='pop'&&!options.force&&navigationKey(target)===navigationKey(installed)&&(departure.pending()||!coordinator.pending()&&physicalIndex===historyIndex&&restoreIndex===null&&!replayingPop&&!queuedAfterRestore)){
    if(departure.pending())departure.cancel();return Promise.resolve({status:'ready',destination:installed});
   }
   if(options.departureTicket){if(!departure.ticketCurrent(options.departureTicket))return Promise.resolve({status:'superseded'});return routeRequest(target,options);}
   if(departure.pending()||departureAdapter()&&!canLeave()){
    sourceState();return departure.request(departureIntent(target,options));
   }
   return routeRequest(target,options);
  }
  function routeRequest(target,options={}){
   if(replayingPop)return new Promise(resolve=>restoreSource({target,options,resolve}));
   if(restoreIndex!==null)return new Promise(resolve=>restoreSource({target,options,resolve}));
   if(options.history!=='pop'&&(restoreIndex!==null||physicalIndex!==historyIndex))return new Promise(resolve=>restoreSource({target,options,resolve}));
   if(options.history!=='pop'&&!options.force&&navigationKey(target)===navigationKey(installed)&&!coordinator.pending())return Promise.resolve({status:'ready',destination:installed});
   if(!options.history||options.history!=='pop')committedURL=location.href;
   const result=coordinator.navigate(target,options);
   return result.then(value=>{if(value.status==='blocked'){sourceState();if(departureAdapter()&&!options.departureTicket)return request(target,options);if(options.history==='pop')restoreSource();toast('尚有未儲存、處理中或結果不明的操作，請先處理後再切頁');}return value;});
  }
  api.navigate=(view,tab,system,options={})=>{
   if(view!=='data'&&!Object.hasOwn(policy.deliveryViews,view)||view==='data'&&tab&&!Object.hasOwn(policy.deliveryTabs,tab))return false;
   const target={view,dataTab:view==='data'?tab||null:null,system:system||installed.system,approvalTab:view==='approval'?state.approvalTab||'master':undefined};
   if(view.startsWith('quality-')||tab?.startsWith('quality-'))target.system='quality';
   void request(target,options);return true;
  };
  api.replaceDisplayURL=value=>{const url=new URL(value,location.href),candidate=policy.deliveryCandidate(url.search);if(url.origin!==new URL(committedURL).origin||url.pathname!==new URL(committedURL).pathname||policy.destinationKey(candidate)!==policy.destinationKey(installed))return false;committedURL=url.href;if(physicalIndex===historyIndex&&restoreIndex===null)history.replaceState({...history.state,processNavigationIndex:historyIndex},'',url);return true;};
  api.approval=(tab,display)=>request({view:'approval',dataTab:null,system:installed.system,approvalTab:tab,display});
  api.pending=()=>coordinator.pending()||departure.pending()||restoreIndex!==null||!!replayingPop||!canLeave();
  api.guardAction=({key,label,run})=>{
   const sourceOwner={id:sync.identity?.id,epoch:sync.identityGeneration?.(),delivery:sync.captureDelivery?.(),generation:readyGeneration};
   const perform=ticket=>{
    if(sourceOwner.id!==sync.identity?.id||sourceOwner.epoch!==sync.identityGeneration?.()||sourceOwner.generation!==readyGeneration||sourceOwner.delivery&&sync.isCurrentDelivery?.(sourceOwner.delivery)===false)return{status:'invalidated'};
    if(ticket&&!departure.ticketCurrent(ticket))return{status:'superseded'};
    if(!canLeave())return{status:'blocked'};
    if(physicalIndex!==historyIndex||restoreIndex!==null||replayingPop)return new Promise(resolve=>restoreSource({options:{history:'action'},resume:()=>perform(ticket),resolve}));
    coordinator.cancelUncommitted();departureAdapter()?.closeClean?.();
    const value=run();if(ticket)departure.committed(ticket);
    return Promise.resolve(value).then(value=>({status:'ready',value}));
   };
   if(departure.pending()||departureAdapter())return departure.request({key:'action:'+key,label,run:perform});
   return Promise.resolve().then(()=>perform(null));
  };
  api.invalidateDeparture=()=>departure.cancel('invalidated',false);
  api.refreshDeparture=()=>departure.refresh();
  window.addEventListener('process-departure-state-changed',()=>departure.refresh());
  api.readyForDestination=()=>readyForDestination(installed);
  api.current=()=>({...installed,generation:readyGeneration});
  navigate=function(view){if(installing)return baseNavigate(view);if(api.navigate(view,view==='data'?null:undefined))return;return baseNavigate(view);};
  render=function(...args){
   if(sync.requiresReload||broken)return;
   const desired={view:state.view,dataTab:state.view==='data'?state.dataTab:null,system:window.ProcessDualSystem?.activeSystem||installed.system,approvalTab:state.approvalTab};
   if(!installing&&navigationKey(desired)!==navigationKey(installed)){sourceState();void request(desired);return;}
   return baseRender(...args);
  };
  document.addEventListener('click',event=>{
   const button=event.target.closest?.('[data-quality-tab],[data-master-scope],.master-tabs [data-tab]');if(!button||button.disabled)return;
   const tab=button.dataset.qualityTab||button.dataset.masterScope||button.dataset.tab;
   if(api.navigate('data',tab)){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  window.addEventListener('popstate',event=>{
   event.stopImmediatePropagation();const index=event.state?.processNavigationIndex;
   if(!Number.isSafeInteger(index)){location.reload();return;}
   physicalIndex=index;if(restoreIndex!==null&&index===restoreIndex){finishRestore();return;}
   let candidate;try{candidate=policy.deliveryCandidate(location.search);}catch{location.reload();return;}
   const url=new URL(location.href),target={...candidate,system:candidate.preferredSystem,approvalTab:url.searchParams.get('approvalTab')||'master',display: candidate.view==='player'?{line:url.searchParams.get('line')||'',stage:url.searchParams.get('stage')||''}:undefined};
   if(replayingPop){const replay=replayingPop;replayingPop=null;if(replay.restore){const queued=queuedAfterRestore;queuedAfterRestore=null;restoreSource(queued);return;}if(index===replay.options.index){request(replay.target,replay.options).then(replay.resolve||(()=>{}));return;}replay.resolve?.({status:'superseded'});}
   if(restoreIndex!==null){if(departure.pending()){void request(target,{history:'pop',index,url:url.href});return;}queuedAfterRestore?.resolve?.({status:'superseded'});queuedAfterRestore={target,options:{history:'pop',index,url:url.href}};return;}
   void request(target,{history:'pop',index,url:url.href});
  },true);
  // Initial destination was already rendered by the classic registration order.
  // Only finish an unselected data tab; never remount a started routine page.
  if(initial.view==='data'&&!document.querySelector('#data-content')?.dataset.activeTab){state.dataTab=initial.dataTab;if(initial.dataTab.startsWith('quality-'))window.ProcessDualSystem?.renderQualityDataTab(initial.dataTab);else window.ProcessDataTabs?.select(initial.dataTab);}
  document.documentElement.dataset.processDestinationGeneration='0';document.documentElement.dataset.processDestinationKey=navigationKey(initial);
 })();
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
 // Cross-document close/reload has only the browser's native confirmation.
 // No custom decision or implicit write is started from this event.
 window.addEventListener('beforeunload',event=>{
  const adapter=departureAdapter();if(!adapter||adapterState(adapter).state==='clean')return;
  event.preventDefault();
  // oxlint-disable-next-line typescript/no-deprecated -- Chromium's native unload confirmation requires returnValue.
  event.returnValue='Unsaved or unconfirmed process draft';
 });
 window.addEventListener('process-delivery-invalidated',()=>{
  api.invalidateDeparture?.();
  // Admission blocks open dialogs before account requests. A late-created
  // overlay must not remain usable under the next session; retain its values.
  for(const modal of document.querySelectorAll('body > dialog,.fqc-modal-overlay,.iqc-dialog-overlay,.ipqcc-overlay,.ipqcab-modal,.routine-dialog-overlay')){modal.inert=true;modal.hidden=true;modal.style.visibility='hidden';modal.style.pointerEvents='none';}
  for(const value of [window.IMPORTED_DATA,window.LINE_PROCESS_DATA,window.LINE_C_MASTER])if(value&&typeof value==='object')for(const key of Object.keys(value))delete value[key];
  const shell=document.querySelector('.app-shell');if(shell){shell.replaceChildren();shell.hidden=true;}
  let gate=document.querySelector('#process-boot');if(!gate){gate=document.createElement('div');gate.id='process-boot';document.body.append(gate);}
  gate.setAttribute('role','alert');gate.textContent='登入身分或權限已變更，請重新載入目前頁面。';
  const button=document.createElement('button');button.textContent='重新載入';button.onclick=()=>location.reload();gate.append(button);
 });
})();
