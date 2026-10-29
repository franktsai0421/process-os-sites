// Fetch application assets in parallel, then execute in their established order
// only after the shared-state snapshot is ready. No synchronous network request.
void (async () => {
  const vi=localStorage.getItem('processUILanguage')!=='zh';
  const bootStatus=document.querySelector('#process-boot');
  if(bootStatus)bootStatus.textContent=vi?'Đang tải dữ liệu quy trình…':'正在載入製程資料…';
  let initialOwner=null;
  const stillInitial=()=>initialOwner==null||window.ProcessSync?.isCurrentDelivery?.(initialOwner)!==false;
  let scripts = [...document.querySelectorAll('script[data-process-src]')];
  try {
    window.ProcessAccessPolicy=await import('./access-policy.mjs?v=20261010-access3');
    window.ProcessDeliveryPurpose=await import('./delivery-purpose.mjs?v=20261026-feedback1');
    await window.ProcessSync.ready;
    if (window.ProcessSync.importPending === true) {
      // The data gate runs before application identity. Do not claim a verified
      // login, retry credentials, or request private scripts on this screen.
      bootStatus.setAttribute('role','status');
      bootStatus.setAttribute('aria-live','polite');
      bootStatus.style.overflowY='auto';
      bootStatus.innerHTML=`<main style="width:100%;max-width:640px;line-height:1.6;overflow-wrap:anywhere">
        <h1 style="font-size:clamp(24px,5vw,30px);margin:0 0 18px">資料等待匯入與啟用<br><span lang="vi">Dữ liệu đang chờ nhập và kích hoạt</span></h1>
        <p>網站已可開啟，公司資料尚未啟用。帳號設定與資料匯入是不同步驟，這不是要求你重新設定密碼。</p>
        <p lang="vi">Trang web đã sẵn sàng, nhưng dữ liệu công ty chưa được kích hoạt. Thiết lập tài khoản và nhập dữ liệu là hai bước riêng; bạn không cần đặt lại mật khẩu vì thông báo này.</p>
        <p>請等待管理員完成資料匯入、完整性核對與啟用；此時不會載入公司資料。</p>
        <p lang="vi">Vui lòng chờ quản trị viên nhập, kiểm tra tính toàn vẹn và kích hoạt dữ liệu. Dữ liệu công ty chưa được tải ở bước này.</p>
        <nav aria-label="網站入口 / Lối vào trang web" style="display:flex;flex-wrap:wrap;gap:12px;margin-top:24px">
          <a href="/" target="_top" style="display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:48px;padding:12px 16px;flex:1 1 220px;border:1px solid #64748b;border-radius:8px;color:#24312d;background:#fff">返回首頁 / Về trang chủ</a>
          <a href="/login" target="_top" style="display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:48px;padding:12px 16px;flex:1 1 220px;border:1px solid #64748b;border-radius:8px;color:#24312d;background:#fff">登入頁 / Trang đăng nhập</a>
        </nav>
      </main>`;
      document.documentElement.dataset.processImportPending='1';
      return;
    }
    if(window.ProcessSync.loginRequired){
      // Carry display intent only. Login applies its enumerated destination
      // whitelist; no redirect URL, role or credentials are forwarded.
      const source=new URLSearchParams(location.search),intent=new URLSearchParams();
      for(const key of ['system','view','dataTab','line','stage'])if(source.getAll(key).length===1)intent.set(key,source.get(key));
      location.replace('/login?'+intent);return;
    }
    if(window.ProcessSync.loadError||window.ProcessSync.expired||!window.ProcessSync.identity)throw Error('BOOTSTRAP_UNAVAILABLE');
    if(!window.ProcessSync.destination)throw Error('BOOTSTRAP_DESTINATION_REQUIRED');
    const destinationURL=window.ProcessDeliveryPurpose.destinationURL(location.href,window.ProcessSync.destination);
    history.replaceState(history.state,'',destinationURL);
    const catalog=window.ProcessSync.catalog;
    if(catalog?.format!=='PROCESS_RUNTIME_CATALOG_V1')throw Error('BOOTSTRAP_CATALOG_REQUIRED');
    window.IMPORTED_DATA=catalog.imported;
    window.LINE_PROCESS_DATA=catalog.routing;
    window.LINE_C_MASTER=catalog.lineC;
    // The immutable full seeds remain owner-only. No employee requests them.
    scripts=scripts.filter(item=>{
      if(/(?:^|\/)data\/(imported-data|line-process-data|line-c-master)\.js(?:\?|$)/.test(item.dataset.processSrc)){item.remove();return false;}
      return true;
    });
    // Wait for the gate before preloading: preload alone would request private
    // resources even if their later script execution were stopped.
    for (const item of scripts) {
      const preload = document.createElement('link');
      preload.rel = 'preload';
      preload.as = 'script';
      preload.href = item.dataset.processSrc;
      document.head.append(preload);
    }
    document.documentElement.dataset.processSharedReadyMs = Math.round(performance.now());
    for (const item of scripts) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = item.dataset.processSrc;
        script.onload = resolve;
        script.onerror = reject;
        item.replaceWith(script);
      });
    }
    document.documentElement.dataset.processAssetsReadyMs = Math.round(performance.now());
    await window.ProcessDeliveryNavigation?.initialized;
    initialOwner=window.ProcessSync.captureDelivery?.();
    // Session + authorized projection + executable registration are complete.
    // Reveal the real shell now; each target owns its honest local loading/error
    // state. Offscreen photos and unrelated background checks never gate it.
    document.querySelector('#process-boot')?.remove();
    document.documentElement.removeAttribute('data-process-boot');
    window.ProcessSync.bootstrapping=false;
    // The editor module is registered after app.js performs its initial render.
    // Reveal the authoritative canvas, not that early legacy/empty render.
    if(bootStatus)bootStatus.textContent=vi?'Đang tải nội dung làm việc đã xác thực…':'正在載入已驗證的工作內容…';
    // The destination coordinator already awaits the authoritative editor
    // readiness for this delivery. Do not repaint that same canvas a second time.
    const editorReadyViaDestination=window.ProcessSync.destination.view==='editor'&&typeof window.ProcessDeliveryNavigation?.readyForDestination==='function';
    await window.ProcessDeliveryNavigation?.readyForDestination?.();
    if(!editorReadyViaDestination)await window.ProcessAuthoringV3?.readyForEditor?.();
    await window.ProcessDualSystem?.readyForDestination?.();
    await window.ProcessDataTabs?.readyForDestination?.();
    if(window.ProcessSync.destination.dataTab==='bom')await window.BOMWorkspace?.readyForDestination?.();
    if(window.ProcessSync.destination.dataTab==='users')await window.ProcessUserAccess?.readyForDestination?.();
    if(window.ProcessSync.destination.view==='approval')await window.BOMWorkspace?.readyForReview?.();
    if(!stillInitial())return;
    window.ProcessSync.bootstrapping=false;
    performance.mark('process-ready');
    document.documentElement.dataset.processReadyMs = Math.round(performance.now());
    document.documentElement.dataset.processDestinationReadyGeneration=document.documentElement.dataset.processDestinationGeneration||'0';
    document.documentElement.dataset.processNavigationStatus='ready';
    document.querySelector('#process-boot')?.remove();
    document.documentElement.removeAttribute('data-process-boot');
    window.dispatchEvent?.(new Event('process-ui-ready'));
  } catch {
    if(!stillInitial())return;
    let boot = document.querySelector('#process-boot');
    if(!boot){boot=document.createElement('section');boot.className='page';boot.dataset.navigationError='true';document.querySelector('#view-root')?.prepend(boot);document.documentElement.dataset.processNavigationStatus='error';}
    boot.setAttribute('role', 'alert');
    boot.textContent =
      vi?'Không thể tải. Vui lòng tải lại.':'載入失敗，請重新整理。';
    const retry = document.createElement('button');
    retry.textContent = vi?'Tải lại':'重新整理';
    retry.onclick = () => location.reload();
    boot.append(retry);
  }
})();
