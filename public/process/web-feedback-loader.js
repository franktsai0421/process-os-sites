/* Opt-in host adapter: local injection or authenticated hosted UI-ready gateway. */
(() => {
  'use strict';
  if(window.WebFeedbackHost)return;
  let loading, button, account = '', initialized = false, shell = null, accountEpoch=null, terminal=false,positioner=null,langObserver=null;
  const retainedShells=[],observers=[],listeners=new AbortController();
  const sync=()=>window.ProcessSync;
  const capture=()=>({id:sync()?.identity?.id,epoch:sync()?.identityGeneration?.(),delivery:sync()?.captureDelivery?.()});
  const owns=owner=>!!owner&&!terminal&&!sync()?.requiresReload&&owner.id===sync()?.identity?.id&&owner.epoch===sync()?.identityGeneration?.()&&(!owner.delivery||sync()?.isCurrentDelivery?.(owner.delivery)!==false);
  const enabled=()=>!terminal&&!sync()?.requiresReload&&(!sync()?.deliveryProjection||sync()?.features?.webFeedback===true);
  const place=()=>positioner?.update(button,document.querySelector('#wf-panel'));
  let refreshQueued=false;const scheduleRefresh=()=>{if(refreshQueued||terminal)return;refreshQueued=true;queueMicrotask(()=>{refreshQueued=false;refresh();});};
  function quarantineShell(){if(shell){shell.active=false;shell.compositionEnd?.();shell.panel.remove();if(!shell.consumed)retainedShells.push(shell);shell=null;}}
  function invalidate(){if(terminal)return;terminal=true;quarantineShell();adminLoading=null;window.WebFeedback?.identityChanged();button?.remove();document.querySelector('#wf-admin-tab')?.remove();positioner?.dispose();langObserver?.disconnect();observers.forEach(observer=>observer.disconnect());listeners.abort();}
  window.addEventListener('process-delivery-invalidated',invalidate,{signal:listeners.signal});
  window.addEventListener('pagehide',invalidate,{signal:listeners.signal});
  // Passive diagnostics: no polling, DOM scan or request. Baseline excludes the widget.
  const diagnostics = {baseline:new URL(location.href).searchParams.get('feedbackBaseline')==='1',lcp:0,interactionMax:0,open:[],heap:[]};
  const publish=()=>{document.documentElement.dataset.feedbackMetrics=JSON.stringify(diagnostics);};
  const observePerformance=callback=>{const observer=new PerformanceObserver(callback);observers.push(observer);return observer;};
  try{observePerformance(list=>{for(const e of list.getEntries())diagnostics.lcp=e.startTime;publish();}).observe({type:'largest-contentful-paint',buffered:true});observePerformance(list=>{for(const e of list.getEntries())if(e.interactionId)diagnostics.interactionMax=Math.max(diagnostics.interactionMax,e.duration);publish();}).observe({type:'event',buffered:true,durationThreshold:16});}catch{/* Metrics unsupported; never affect the host. */}
  const user = () => window.ProcessSync?.identity || null;
  const t = (zh, vi) => document.documentElement.lang === 'vi' ? vi : zh;
  function capturePage(){const url=new URL(location.href),view=url.searchParams.get('view')||'dashboard',tab=url.searchParams.get('dataTab')||'',system=url.searchParams.get('system')||'process';return{type:'page',view,tab,system,display:(document.querySelector('#page-title')?.textContent||view)+(tab?' → '+tab:''),locator:{},context:{}};}
  const load = () => loading || (loading = new Promise((resolve, reject) => {
    const css=document.createElement('link');let script,styled=false;
    const fail=message=>{loading=null;css.remove();script?.remove();reject(Error(message));};
    const ready=()=>{if(styled&&window.WebFeedback)resolve(window.WebFeedback);};
    css.rel='stylesheet';css.href='/process/web-feedback.css?v=20261029-feedback2';css.onload=()=>{styled=true;ready();};css.onerror=()=>fail(t('回報樣式載入失敗','Không tải được kiểu báo lỗi'));document.head.append(css);
    if(!window.WebFeedback){script=document.createElement('script');script.src='/process/web-feedback.js?v=20261029-feedback2';script.onload=()=>window.WebFeedback?ready():fail(t('回報功能暫時無法載入','Không thể tải báo lỗi'));script.onerror=()=>fail(t('回報功能暫時無法載入','Không thể tải báo lỗi'));document.head.append(script);}
  }));
  // The immediate shell contains only new input, never private draft data.
  function open(event) {
    const u=user(),owner=capture();if(!u?.id||!enabled()||!owns(owner)||shell?.composing||window.WebFeedback?.canOpen?.()===false)return;
    if(window.WebFeedback?.beginOpen?.()===false)return;
    const start=performance.now(),eventStart=event?.timeStamp||start,previous=shell;
    delete document.documentElement.dataset.feedbackComplete;
    delete document.documentElement.dataset.feedbackCompletePaint;
    delete document.documentElement.dataset.feedbackOpenStages;
    const text=previous&&!previous.consumed&&previous.account===u.id&&owns(previous.owner)?previous.input.value:'';
    if(previous){previous.active=false;previous.compositionEnd?.();}
    let panel=document.querySelector('#wf-panel');
    if(!panel){panel=document.createElement('section');panel.id='wf-panel';panel.dataset.i18nSkip='true';}
    const parent=button.closest('dialog[open]')||document.body;parent.append(panel);
    const footer=parent.tagName==='DIALOG'&&[...parent.querySelectorAll('footer')].find(el=>!el.closest('#wf-panel'));
    const topbar=parent.tagName==='DIALOG'&&(parent.querySelector('[role=tablist]')||parent.querySelector('header'));
    const bottom=footer?Math.max(72,Math.ceil(innerHeight-footer.getBoundingClientRect().top+12)):72;
    const height=Math.min(540,Math.max(0,innerHeight-bottom-(topbar?topbar.getBoundingClientRect().bottom+12:12)));
    panel.style.cssText='position:fixed;right:12px;bottom:'+bottom+'px;width:360px;max-width:calc(100vw - 24px);max-height:'+height+'px;background:#fffefa;color:#153f48;border:1px solid #b5ceca;border-radius:12px;box-shadow:0 8px 30px #163d432d;z-index:11001;display:flex;flex-direction:column;overflow:hidden;font:14px/1.5 system-ui,sans-serif;box-sizing:border-box';
    panel.innerHTML='<header style="background:#164d50;color:white;padding:8px 10px;display:flex;justify-content:space-between"><strong></strong><button type="button" data-close style="color:white;background:transparent;border:0;font-size:20px">−</button></header><div class="wf-body" style="padding:10px;overflow:auto"><label></label><textarea maxlength="4000" style="box-sizing:border-box;width:100%;min-height:58px;max-height:130px;font:inherit"></textarea><p role="status" aria-live="polite" style="font-size:12px"></p></div>';
    panel.querySelector('strong').textContent=t('問題回報','Báo lỗi');
    panel.querySelector('label').textContent=t('問題描述','Mô tả');
    const input=panel.querySelector('textarea');input.value=text;
    input.setAttribute('aria-label',t('問題描述','Mô tả'));
    panel.querySelector('[data-close]').setAttribute('aria-label',t('收合','Thu gọn'));
    panel.querySelector('[role=status]').textContent=t('可先輸入；正在確認登入身分及讀取草稿，尚未保存。','Có thể nhập; đang xác minh và tải bản nháp, chưa lưu.');
    const session={panel,input,owner,account:u.id,active:true,consumed:false,composing:false,started:start,start:capturePage()};
    shell=session;
    if(!('oncompositionstart' in input))for(const type of ['compositionstart','compositionend'])input.addEventListener(type,event=>input['on'+type]?.(event));
    input.oncompositionstart=()=>{session.composing=true;};
    input.oncompositionend=()=>{session.composing=false;session.compositionEnd?.();};
    input.oninput=e=>{if(!session.typedMs){session.typedMs=Math.round(performance.now()-start);document.documentElement.dataset.feedbackShell=JSON.stringify({readyMs:session.readyMs,typedMs:session.typedMs,inputEventDelayMs:Math.round(performance.now()-e.timeStamp)});}};
    panel.querySelector('[data-close]').onclick=()=>{session.active=false;session.compositionEnd?.();panel.hidden=true;panel.style.display="none";window.WebFeedback?.close();};
    panel.hidden=false;place();input.focus();
    session.readyMs=Math.round(performance.now()-start);
    document.documentElement.dataset.feedbackShell=JSON.stringify({openedAt:new Date().toISOString(),readyMs:session.readyMs,eventToReadyMs:Math.round(performance.now()-eventStart)});
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(shell===session&&owns(owner))document.documentElement.dataset.feedbackShellPaint=JSON.stringify({eventToPaintMs:Math.round(performance.now()-eventStart)});}));
    // Start a fresh permission request only on this click, in parallel with assets.
    // No private storage is opened until both complete and the account is verified.
    const authStarted=performance.now();
    session.authorization=fetch('/api/web-feedback?action=capabilities',{cache:'no-store'}).then(async response=>{if(owns(owner)&&response.status===401){sync()?.clearIdentity?.();invalidate();}const data=await response.json();if(!owns(owner))throw Error('FEEDBACK_OWNER_CHANGED');if(!response.ok)throw Error(data.error||response.status);return {data,elapsedMs:Math.round(performance.now()-authStarted)};}).catch(error=>({error}));
    load().then(m=>{if(shell===session&&owns(owner))return m.open(u,session);}).then(completed=>{
      if(shell!==session||!owns(owner)||!completed)return;
      const listenerToReadyMs=Math.round(performance.now()-start),eventToReadyMs=Math.round(performance.now()-eventStart);
      const openedAt=new Date(performance.timeOrigin+start).toISOString();
      document.documentElement.dataset.feedbackComplete=JSON.stringify({openedAt,listenerToReadyMs,eventToReadyMs});
      requestAnimationFrame(()=>requestAnimationFrame(()=>{if(shell===session&&session.active&&owns(owner))document.documentElement.dataset.feedbackCompletePaint=JSON.stringify({openedAt,eventToPaintMs:Math.round(performance.now()-eventStart)});}));
      diagnostics.open.push(listenerToReadyMs);if(performance.memory)diagnostics.heap.push(performance.memory.usedJSHeapSize);
      diagnostics.open=diagnostics.open.slice(-30);diagnostics.heap=diagnostics.heap.slice(-30);publish();
    }).catch(e=>{if(shell===session&&owns(owner)){button.title=e.message;const status=panel.querySelector('[role=status]');if(status)status.textContent=e.message;}});
  }
  function refresh() {
    if(terminal)return;if(!enabled()){invalidate();return;}
    const u = user(), id = u?.id || '',epoch=sync()?.identityGeneration?.();
    if (account !== id||accountEpoch!==epoch) { account = id;accountEpoch=epoch;quarantineShell();window.WebFeedback?.identityChanged(); }
    const logged = !!id && u.role !== 'device' && !document.querySelector('.app-shell.platform-locked');
    if (!button) {
      button = document.createElement('button'); button.id = 'wf-launcher'; button.type = 'button';
      button.style.cssText = 'position:fixed;right:12px;bottom:18px;width:46px;height:46px;border:0;border-radius:50%;background:#164d50;color:white;box-shadow:0 3px 12px #0003;z-index:11000;cursor:pointer;font-size:24px;display:none';
      button.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 9h10M7 13h7" stroke="currentColor" stroke-width="1.6"/></svg>';
      button.onclick = open; document.body.append(button);
    }
    button.style.display = logged ? 'grid' : 'none'; button.style.placeItems='center'; button.title=t('回報問題','Báo lỗi'); button.setAttribute('aria-label',button.title);
    if(!button.isConnected)document.body.append(button);
    if(!logged)window.WebFeedback?.identityChanged();
    const users=document.querySelector('.master-tabs [data-tab="users"]');
    if(logged&&users&&!document.querySelector('#wf-admin-tab')) {
      const tab=document.createElement('button');tab.id='wf-admin-tab';tab.className='tab master-tab';tab.dataset.i18nSkip='true';tab.dataset.tab='web-feedback';tab.textContent=t('網頁問題回報','Báo lỗi trang web');users.after(tab);
      tab.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();if(!enabled())return;
        if(window.ProcessDeliveryNavigation?.ownsHistory){window.ProcessDeliveryNavigation.navigate('data','web-feedback','process');return;}
        if(navigation.canLeave()===false)return;
        const url=new URL(location.href);url.searchParams.set('view','data');url.searchParams.set('dataTab','web-feedback');history.pushState({...history.state},'',url);void showAdmin().catch(()=>{});
      },true);
    }
    const adminTab=document.querySelector('#wf-admin-tab');
    if(adminTab){adminTab.textContent=t('網頁問題回報','Báo lỗi trang web');adminTab.type='button';const selected=new URL(location.href).searchParams.get('dataTab')==='web-feedback';adminTab.classList.toggle('active',selected);adminTab.setAttribute('aria-selected',String(selected));}
    if(logged&&document.querySelector('#data-content')&&new URL(location.href).searchParams.get('dataTab')==='web-feedback') void showAdmin().catch(()=>{});
    window.WebFeedback?.routeChanged();place();
  }
  let adminLoading=null;
  function showAdmin(target=document.querySelector('#data-content')){
    const host=target,owner=capture();if(!enabled()||!host?.isConnected||!owner.id||!owns(owner))return Promise.resolve();
    if(sync()?.deliveryProjection&&(sync().destination?.dataTab!=='web-feedback'||sync().destination?.view!=='data'))return Promise.resolve();
    if(typeof state!=='undefined')state.dataTab='web-feedback';
    host.dataset.activeTab='web-feedback';
    document.querySelectorAll('.master-tabs .tab').forEach(tab=>{const selected=tab.id==='wf-admin-tab';tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',String(selected));});
    if(adminLoading?.host===host&&owns(adminLoading.owner))return adminLoading.promise;
    if(!host.querySelector('.wf-admin'))host.innerHTML='<section class="wf-admin" data-i18n-skip="true"><p role="status">'+t('正在載入問題回報…','Đang tải báo lỗi…')+'</p></section>';
    const request={host,owner};adminLoading=request;
    // Only a requested, authenticated board starts a read. Overlap its fresh
    // server-authorized list with JS/CSS; ordinary helper startup reads nothing.
    // Capture failures immediately so an asset failure cannot leave an unhandled
    // rejected promise. Both the loader and core reject a stale identity/delivery.
    const firstList=!host.querySelector('[data-board-tab]')?fetch('/api/web-feedback?action=list',{cache:'no-store'}).then(async response=>{
      if(owns(owner)&&response.status===401){sync()?.clearIdentity?.();invalidate();}
      const value=await response.json();
      if(!owns(owner))throw Error('FEEDBACK_OWNER_CHANGED');
      if(!response.ok)throw Error(value.error||response.status);
      return {value};
    }).catch(error=>({error})):null;
    request.promise=load().then(m=>{if(adminLoading===request&&host.isConnected&&owns(owner)&&new URL(location.href).searchParams.get('dataTab')==='web-feedback')return m.admin(host,user(),!host.querySelector('[data-board-tab]'),firstList);}).catch(e=>{
      if(adminLoading===request&&host.isConnected&&owns(owner)&&host.dataset.activeTab==='web-feedback'){
        host.replaceChildren();const status=document.createElement('p'),retry=document.createElement('button');status.textContent=e.message;retry.textContent=t('重試','Thử lại');retry.onclick=()=>{void showAdmin(host).catch(()=>{});};host.append(status,retry);
      }throw e;
    }).finally(()=>{if(adminLoading===request)adminLoading=null;});return request.promise;
  }
  const navigation={
    canLeave:()=>!terminal&&(!shell||shell.consumed||!shell.composing&&!shell.input.value.trim())&&window.WebFeedback?.navigation?.canLeave?.()!==false,
    reset(){adminLoading=null;if(shell&&!shell.consumed&&!shell.composing&&!shell.input.value.trim()){shell.active=false;shell.compositionEnd?.();shell.panel.remove();shell=null;}window.WebFeedback?.navigation?.reset?.();}
  };
  function initialize() {
    if(initialized||terminal||!enabled())return;initialized=true;
    diagnostics.ready=Math.round(performance.now());publish();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{document.documentElement.dataset.feedbackPaintReady='1';publish();}));
    if(diagnostics.baseline)return;
    void import('./web-feedback-layout.mjs?v=20261029-feedback2').then(({createFeedbackPositioner})=>{if(!terminal){positioner=createFeedbackPositioner({window,document});place();}}).catch(()=>{/* Right-side fallback remains, never hide the platform toolbar. */});
    for(const name of ['render','renderLogin','enterPlatform']) {
      // Existing global function bindings are explicitly wrapped once; no DOM observer/polling.
      const original=window[name];if(typeof original!=='function')continue;
      window[name]=function(...args){const result=original.apply(this,args);scheduleRefresh();return result;};
    }
    window.addEventListener('popstate',()=>{if(!window.ProcessDeliveryNavigation?.ownsHistory)scheduleRefresh();},{signal:listeners.signal});
    window.addEventListener('process-destination-ready',()=>scheduleRefresh(),{signal:listeners.signal});
    window.addEventListener('process-shared-state-updated',()=>scheduleRefresh(),{signal:listeners.signal});
    // Observe one language attribute, not the page subtree or business data.
    langObserver=new MutationObserver(()=>scheduleRefresh());langObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    // Native modal dialogs make body siblings inert. Keep the helper in the active
    // top-layer dialog, without opening another modal or changing its scrolling.
    document.addEventListener('focusin',event=>{const parent=event.target.closest?.('dialog[open]')||document.body;if(button&&button.parentElement!==parent){parent.append(button);const panel=document.querySelector('#wf-panel');if(panel)parent.append(panel);window.WebFeedback?.positionPanel();place();}},{signal:listeners.signal});
    document.addEventListener('close',event=>{if(event.target.tagName==='DIALOG'){if(button)document.body.append(button);const panel=event.target.querySelector('#wf-panel');if(panel)document.body.append(panel);window.WebFeedback?.positionPanel();place();}},{capture:true,signal:listeners.signal});
    const refreshStarted=performance.now();refresh();diagnostics.initMs=Math.round((performance.now()-refreshStarted)*100)/100;publish();
  }
  window.WebFeedbackHost={refresh,user,load,showAdmin,initialize,navigation,capture,owns,invalidate,canSelectLocation:()=>!!positioner,active:()=>!terminal,positionPanel:place,isReservedTarget:target=>positioner?.isReservedTarget(target)||false};
  if(!document.documentElement.hasAttribute('data-process-boot'))initialize();
  else window.addEventListener('process-ui-ready',initialize,{once:true,signal:listeners.signal});
})();
