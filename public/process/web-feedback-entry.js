// Ordinary UI-ready registers the helper without reading records or private drafts.
// Explicit authenticated feedback navigation may prepare its own first list.
(() => {
 'use strict';
 if(window.ProcessFeedbackEntry)return;
 let loading=null,activeHost=null,prepared=null,assetsPreloaded=false;
 const sync=()=>window.ProcessSync;
 const enabled=()=>!sync()?.requiresReload&&(sync()?.deliveryProjection?sync().features?.webFeedback===true:!!window.WebFeedbackHost);
 const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
 const owns=owner=>!!owner.id&&!sync()?.requiresReload&&owner.id===sync()?.identity?.id&&owner.epoch===sync()?.identityGeneration?.()&&(!owner.delivery||sync()?.isCurrentDelivery?.(owner.delivery)!==false);
 // Public static bytes only: early hints must not execute the module, read
 // records, verify accounts or open private IndexedDB drafts.
 function preloadAssets(){
  if(!assetsPreloaded){
   assetsPreloaded=true;
   for(const [as,name] of [['script','web-feedback-loader.js'],['script','web-feedback.js'],['style','web-feedback.css']]){
    const link=document.createElement('link');link.rel='preload';link.as=as;link.href='/process/'+name+'?v=20261029-feedback6';document.head.append(link);
   }
  }
 }
 const initialURL=new URL(location.href);
 if(initialURL.searchParams.get('view')==='data'&&initialURL.searchParams.get('dataTab')==='web-feedback'&&!sync()?.requiresReload)preloadAssets();
 function prepareList(host){
  if(window.WebFeedbackHost||!enabled())return null;
  if(prepared?.host===host&&owns(prepared.owner))return prepared;
  const owner={id:sync()?.identity?.id,epoch:sync()?.identityGeneration?.(),delivery:sync()?.captureDelivery?.()};
  if(!owns(owner))return null;
  const task={host,owner};prepared=task;
  // Explicit authenticated destination only. Never prefetch private records on
  // ordinary UI-ready. The adapter consumes this single-use promise, not a cache.
  task.result=fetch('/api/web-feedback?action=list',{cache:'no-store'}).then(async response=>{
   if(owns(owner)&&response.status===401){sync()?.clearIdentity?.();window.WebFeedbackHost?.invalidate();}
   const value=await response.json();if(!owns(owner))throw Error('FEEDBACK_OWNER_CHANGED');
   if(!response.ok)throw Error(value.error||response.status);return {value};
  }).catch(error=>({error}));
  preloadAssets();
  return task;
 }
 function takePreparedList(host){const task=prepared;if(!task||task.host!==host)return null;prepared=null;return owns(task.owner)?task.result:null;}
 function ensure(){
  if(!enabled())return Promise.reject(Error('NOT_ENABLED'));
  if(window.WebFeedbackHost)return window.WebFeedbackHost.active?.()===false?Promise.reject(Error('FEEDBACK_RELOAD_REQUIRED')):Promise.resolve(window.WebFeedbackHost);
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='/process/web-feedback-loader.js?v=20261029-feedback6';script.defer=true;
   script.onload=()=>window.WebFeedbackHost?resolve(window.WebFeedbackHost):fail();
   const fail=()=>{loading=null;script.remove();reject(Error('FEEDBACK_HOST_LOAD_FAILED'));};script.onerror=fail;document.head.append(script);
  });return loading;
 }
 function error(host,cause){
  if(!host?.isConnected||host!==activeHost)return;
  host.replaceChildren();const status=document.createElement('p'),retry=document.createElement('button');
  status.setAttribute('role','status');status.textContent=t('問題回報暫時無法載入：','Không tải được báo lỗi: ')+cause.message;
  retry.type='button';retry.textContent=t('重試','Thử lại');retry.onclick=()=>{void readyForDestination().catch(cause=>error(host,cause));};host.append(status,retry);
 }
 function mount(host){
  activeHost=host;host.textContent=t('正在載入問題回報…','Đang tải báo lỗi…');
  // Cold bootstrap reveals the authenticated shell before destination readiness.
  // Do not await the UI-ready event which follows this route's own readiness.
  if(!document.documentElement.hasAttribute('data-process-boot'))void readyForDestination().catch(cause=>error(host,cause));
 }
 async function readyForDestination(){
  const host=activeHost,owner=sync()?.captureDelivery?.();
  if(!host?.isConnected||host.dataset.activeTab!=='web-feedback')return;
  const task=prepareList(host);
  try{
   const adapter=await ensure();
   if(host!==activeHost||!host.isConnected||sync()?.requiresReload||owner&&sync()?.isCurrentDelivery?.(owner)===false)return;
   adapter.initialize?.();
   await adapter.showAdmin(host);
  }finally{if(task&&prepared===task)prepared=null;}
 }
 const navigation={canLeave:()=>!enabled()?!sync()?.requiresReload:window.WebFeedbackHost?.navigation?.canLeave?.()!==false,
  reset(){activeHost=null;prepared=null;window.WebFeedbackHost?.navigation?.reset?.();}};
 window.ProcessFeedbackEntry={enabled,mount,ensure,readyForDestination,navigation,takePreparedList};
 window.addEventListener('process-ui-ready',()=>{if(enabled())void ensure().then(adapter=>adapter.refresh()).catch(()=>{/* On-demand management retry remains available. */});},{once:true});
 // Cached/deferred assets can register after the one-shot UI-ready event.
 // Admit only an already authenticated, enabled shell; never infer access from
 // the browser, iframe host or a cached account.
 if(!document.documentElement.hasAttribute('data-process-boot')&&sync()?.identity?.id&&enabled())queueMicrotask(()=>{if(enabled())void ensure().then(adapter=>adapter.refresh()).catch(()=>{});});
})();
