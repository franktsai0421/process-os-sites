// A page projection is a read-only document baseline, never a shared global
// cache for another destination. Normal navigation fetches a fresh projection.
(() => {
 const sync=window.ProcessSync,policy=window.ProcessDeliveryPurpose;
 if(!sync?.deliveryProjection||!policy||!sync.destination)return;
 const initial=sync.destination,actor=sync.identity?.id;
 const pending=()=>{
  const shared=sync.pendingState?.()||{},drafts=window.sharedDraftAccountState?.()||{};
  return shared.dirty||shared.inFlight||shared.paused||shared.blocked||drafts.queued||drafts.unknown||drafts.failed||sync.projectionWriteError;
 };
 function navigateDocument(view,tab,system){
  if(sync.requiresReload||sync.identity?.id!==actor)return true;
  if(view!=='data'&&!Object.hasOwn(policy.deliveryViews,view))return false;
  if(view==='data'&&tab&&!Object.hasOwn(policy.deliveryTabs,tab))return false;
  const target={view,dataTab:view==='data'?tab||null:null,system:system||window.ProcessDualSystem?.activeSystem||initial.system};
  if(view.startsWith('quality-')||tab?.startsWith('quality-'))target.system='quality';
  if(policy.destinationKey(target)===initial.key)return false;
  if(pending()){toast('尚有未儲存或結果不明的操作，請先處理後再切頁');return true;}
  const url=policy.destinationURL(location.href,target);
  if(view==='approval'&&['process','master','quality','routine'].includes(state.approvalTab))url.searchParams.set('approvalTab',state.approvalTab);
  location.assign(url.href);return true;
 }
 const previousNavigate=navigate;
 navigate=function(view){if(navigateDocument(view,view==='data'?null:undefined))return;return previousNavigate(view);};
 const previousRender=render;
 render=function(...args){
  if(sync.requiresReload||sync.identity?.id!==actor)return;
  if(policy.destinationKey({view:state.view,dataTab:state.dataTab})!==initial.key){
   const view=state.view,tab=state.dataTab;
   state.view=initial.view;state.dataTab=initial.dataTab;
   if(navigateDocument(view,tab))return;
  }
  return previousRender(...args);
 };
 // Capture before module handlers render a different data tab using an old
 // projection. Existing beforeunload form guards remain in effect.
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-quality-tab],[data-master-scope],.master-tabs [data-tab]');
  if(!button||button.disabled)return;
  const tab=button.dataset.qualityTab||button.dataset.masterScope||button.dataset.tab;
  if(navigateDocument('data',tab)){event.preventDefault();event.stopImmediatePropagation();}
 },true);
 window.addEventListener('popstate',event=>{
  let target;try{target=policy.deliveryCandidate(location.search);}catch{return;}
  if(!target.view)return;
  if(policy.destinationKey(target)===initial.key)return;
  // No other listener may render this destination from the old projection.
  event.stopImmediatePropagation();
  if(pending()){history.replaceState(history.state,'',policy.destinationURL(location.href,initial));toast('尚有未儲存或結果不明的操作，請先處理後再切頁');return;}
  location.reload();
 },true);
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
 window.addEventListener('process-delivery-invalidated',()=>{
  for(const value of [window.IMPORTED_DATA,window.LINE_PROCESS_DATA,window.LINE_C_MASTER])if(value&&typeof value==='object')for(const key of Object.keys(value))delete value[key];
  const shell=document.querySelector('.app-shell');if(shell){shell.replaceChildren();shell.hidden=true;}
  let gate=document.querySelector('#process-boot');if(!gate){gate=document.createElement('div');gate.id='process-boot';document.body.append(gate);}
  gate.setAttribute('role','alert');gate.textContent='登入身分或權限已變更，請重新載入目前頁面。';
  const button=document.createElement('button');button.textContent='重新載入';button.onclick=()=>location.reload();gate.append(button);
 });
 window.ProcessDeliveryNavigation={navigate:navigateDocument,pending};
 // Existing bootstrap data-tab selection can run before all classic modules
 // register. Select the server-authorized destination once registration ends.
 if(initial.view==='data'){
  state.dataTab=initial.dataTab;
  if(initial.dataTab.startsWith('quality-'))window.ProcessDualSystem?.renderQualityDataTab(initial.dataTab);
  else window.ProcessDataTabs?.select(initial.dataTab);
 }
})();
