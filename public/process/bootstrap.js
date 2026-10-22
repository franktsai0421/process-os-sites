// Fetch application assets in parallel, then execute in their established order
// only after the shared-state snapshot is ready. No synchronous network request.
void (async () => {
  const vi=localStorage.getItem('processUILanguage')!=='zh';
  const bootStatus=document.querySelector('#process-boot');
  if(bootStatus)bootStatus.textContent=vi?'Đang tải dữ liệu quy trình…':'正在載入製程資料…';
  const scripts = [...document.querySelectorAll('script[data-process-src]')];
  try {
    window.ProcessAccessPolicy=await import('./access-policy.mjs?v=20261010-access3');
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
    // The editor module is registered after app.js performs its initial render.
    // Reveal the authoritative canvas, not that early legacy/empty render.
    await window.ProcessAuthoringV3?.readyForEditor?.();
    performance.mark('process-ready');
    document.documentElement.dataset.processReadyMs = Math.round(performance.now());
    document.querySelector('#process-boot')?.remove();
    document.documentElement.removeAttribute('data-process-boot');
    window.dispatchEvent?.(new Event('process-ui-ready'));
  } catch {
    const boot = document.querySelector('#process-boot');
    boot.setAttribute('role', 'alert');
    boot.textContent =
      vi?'Không thể tải. Vui lòng tải lại.':'載入失敗，請重新整理。';
    const retry = document.createElement('button');
    retry.textContent = vi?'Tải lại':'重新整理';
    retry.onclick = () => location.reload();
    boot.append(retry);
  }
})();
