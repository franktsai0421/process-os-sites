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
 function canLeave(){
  if(sync.requiresReload||draftsPending()||window.ProcessNavigationForms?.composing?.())return false;
  if(window.ProcessRuntimeProjection?.canLeave?.()===false||window.MasterDataWorkflow?.canLeave?.()===false)return false;
  if(modules().some(api=>api.navigation?.canLeave?.()===false))return false;
  if(document.querySelector('dialog[open],.iqc-lightbox,.fqc-viewer-overlay'))return false;
  return ![...document.querySelectorAll(editingScopes)].some(node=>window.ProcessNavigationForms?.dirty?.(node));
 }
 const api=window.ProcessDeliveryNavigation={ownsHistory:true,pending:()=>!canLeave()};
 api.initialized=(async()=>{
  const {createNavigationCoordinator,navigationKey}=await import('./navigation-lifecycle.mjs?v=20261025-navigation2');
  const initial={...sync.destination,approvalTab:['process','quality','routine'].includes(state.approvalTab)?state.approvalTab:'master'};
  let installed=initial,installing=false,broken=false,readyGeneration=0,commitPhase=false;
  let historyIndex=Number.isSafeInteger(history.state?.processNavigationIndex)?history.state.processNavigationIndex:0;
  let committedURL=location.href,restoreIndex=null,physicalIndex=historyIndex,queuedAfterRestore=null;
  history.replaceState({...history.state,processNavigationIndex:historyIndex},'',location.href);
  const baseNavigate=navigate,baseRender=render;
  const sourceState=()=>{state.view=installed.view;state.dataTab=installed.dataTab;state.approvalTab=installed.approvalTab||'master';window.ProcessDualSystem?.installSystem?.(installed.system);};
  function clearPageModels(){
   window.QualityReviewOverview?.dispose?.();window.EffectiveVersionNotice?.reset?.();
   for(const dialog of document.querySelectorAll('body > dialog:not([open])')){for(const media of dialog.querySelectorAll('img,video')){media.pause?.();media.removeAttribute('src');}dialog.remove();}
   for(const module of modules())module.navigation?.reset?.();
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
   prepare:(target,context)=>sync.prepareDestination(target,context.signal),validate:handle=>sync.validateDestination(handle),
   commit(handle,target,context,options){
    commitPhase=true;installing=true;
    try{
     const destination={...handle.destination,approvalTab:target.approvalTab||'master',display:target.display};
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
    if(committed){if(commitPhase){broken=true;sync.suspendDestination?.();for(const button of document.querySelectorAll('.sidebar button,.topbar button,#account-menu button'))button.disabled=true;try{clearPageModels();}catch{}for(const value of [window.IMPORTED_DATA,window.LINE_PROCESS_DATA,window.LINE_C_MASTER])if(value&&typeof value==='object')for(const key of Object.keys(value))delete value[key];}targetError(error,broken);return;}
    sourceState();if(physicalIndex!==historyIndex||options.history==='pop')restoreSource();else history.replaceState(history.state,'',committedURL);
    toast(error.status===403?'目前無法讀取此頁資料；原頁保留。':'切頁讀取失敗；原頁保留，請重試。');
   },
   pending(target){document.documentElement.dataset.processNavigationPending=target?'1':'0';}
  });
  // A browser pop changes the physical history cursor before its GET settles.
  // Restore that cursor before a superseding click; never derive source URL from
  // the temporarily popped address. New intents replace the queued intent only.
  function restoreSource(queued=null){
   coordinator.cancel();queuedAfterRestore?.resolve?.({status:'superseded'});queuedAfterRestore=queued;
   if(restoreIndex!==null)return;
   restoreIndex=historyIndex;
   if(physicalIndex===historyIndex)finishRestore();else history.go(historyIndex-physicalIndex);
  }
  function finishRestore(){
   restoreIndex=null;physicalIndex=historyIndex;
   history.replaceState({...history.state,processNavigationIndex:historyIndex},'',committedURL);
   const queued=queuedAfterRestore;queuedAfterRestore=null;
   if(!queued)return;
   if(queued.options.history==='pop'&&queued.options.index!==historyIndex){history.go(queued.options.index-historyIndex);return;}
   request(queued.target,queued.options).then(queued.resolve||(()=>{}));
  }
  function request(target,options={}){
   if(options.history!=='pop'&&(restoreIndex!==null||physicalIndex!==historyIndex))return new Promise(resolve=>restoreSource({target,options,resolve}));
   if(options.history!=='pop'&&!options.force&&navigationKey(target)===navigationKey(installed)&&!coordinator.pending())return Promise.resolve({status:'ready',destination:installed});
   if(!options.history||options.history!=='pop')committedURL=location.href;
   const result=coordinator.navigate(target,options);
   return result.then(value=>{if(value.status==='blocked'){sourceState();if(options.history==='pop')restoreSource();toast('尚有未儲存、處理中或結果不明的操作，請先處理後再切頁');}return value;});
  }
  api.navigate=(view,tab,system,options={})=>{
   if(view!=='data'&&!Object.hasOwn(policy.deliveryViews,view)||view==='data'&&tab&&!Object.hasOwn(policy.deliveryTabs,tab))return false;
   const target={view,dataTab:view==='data'?tab||null:null,system:system||installed.system,approvalTab:view==='approval'?state.approvalTab||'master':undefined};
   if(view.startsWith('quality-')||tab?.startsWith('quality-'))target.system='quality';
   void request(target,options);return true;
  };
  api.replaceDisplayURL=value=>{const url=new URL(value,location.href),candidate=policy.deliveryCandidate(url.search);if(url.origin!==new URL(committedURL).origin||url.pathname!==new URL(committedURL).pathname||policy.destinationKey(candidate)!==policy.destinationKey(installed))return false;committedURL=url.href;if(physicalIndex===historyIndex&&restoreIndex===null)history.replaceState({...history.state,processNavigationIndex:historyIndex},'',url);return true;};
  api.approval=(tab,display)=>request({view:'approval',dataTab:null,system:installed.system,approvalTab:tab,display});
  api.pending=()=>coordinator.pending()||restoreIndex!==null||!canLeave();
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
   if(restoreIndex!==null){queuedAfterRestore?.resolve?.({status:'superseded'});queuedAfterRestore={target,options:{history:'pop',index,url:url.href}};return;}
   void request(target,{history:'pop',index,url:url.href});
  },true);
  // Initial destination was already rendered by the classic registration order.
  // Only finish an unselected data tab; never remount a started routine page.
  if(initial.view==='data'&&!document.querySelector('#data-content')?.dataset.activeTab){state.dataTab=initial.dataTab;if(initial.dataTab.startsWith('quality-'))window.ProcessDualSystem?.renderQualityDataTab(initial.dataTab);else window.ProcessDataTabs?.select(initial.dataTab);}
  document.documentElement.dataset.processDestinationGeneration='0';document.documentElement.dataset.processDestinationKey=navigationKey(initial);
 })();
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
 window.addEventListener('process-delivery-invalidated',()=>{
  for(const value of [window.IMPORTED_DATA,window.LINE_PROCESS_DATA,window.LINE_C_MASTER])if(value&&typeof value==='object')for(const key of Object.keys(value))delete value[key];
  const shell=document.querySelector('.app-shell');if(shell){shell.replaceChildren();shell.hidden=true;}
  let gate=document.querySelector('#process-boot');if(!gate){gate=document.createElement('div');gate.id='process-boot';document.body.append(gate);}
  gate.setAttribute('role','alert');gate.textContent='登入身分或權限已變更，請重新載入目前頁面。';
  const button=document.createElement('button');button.textContent='重新載入';button.onclick=()=>location.reload();gate.append(button);
 });
})();
