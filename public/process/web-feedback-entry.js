// Registration only. No capabilities, feedback rows or private drafts at startup.
(() => {
 'use strict';
 if(window.ProcessFeedbackEntry)return;
 let loading=null,activeHost=null;
 const sync=()=>window.ProcessSync;
 const enabled=()=>!sync()?.requiresReload&&(sync()?.deliveryProjection?sync().features?.webFeedback===true:!!window.WebFeedbackHost);
 const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
 function ensure(){
  if(!enabled())return Promise.reject(Error('NOT_ENABLED'));
  if(window.WebFeedbackHost)return window.WebFeedbackHost.active?.()===false?Promise.reject(Error('FEEDBACK_RELOAD_REQUIRED')):Promise.resolve(window.WebFeedbackHost);
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='/process/web-feedback-loader.js?v=20261026-hosted1';script.defer=true;
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
  const adapter=await ensure();
  if(host!==activeHost||!host.isConnected||sync()?.requiresReload||owner&&sync()?.isCurrentDelivery?.(owner)===false)return;
  adapter.initialize?.();
  await adapter.showAdmin(host);
 }
 const navigation={canLeave:()=>!enabled()?!sync()?.requiresReload:window.WebFeedbackHost?.navigation?.canLeave?.()!==false,
  reset(){activeHost=null;window.WebFeedbackHost?.navigation?.reset?.();}};
 window.ProcessFeedbackEntry={enabled,mount,ensure,readyForDestination,navigation};
 window.addEventListener('process-ui-ready',()=>{if(enabled())void ensure().then(adapter=>adapter.refresh()).catch(()=>{/* On-demand management retry remains available. */});},{once:true});
})();
