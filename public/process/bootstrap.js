// Fetch application assets in parallel, then execute in their established order
// only after the shared-state snapshot is ready. No synchronous network request.
void (async () => {
  const vi=localStorage.getItem('processUILanguage')!=='zh';
  const bootStatus=document.querySelector('#process-boot');
  if(bootStatus)bootStatus.textContent=vi?'Đang tải dữ liệu quy trình…':'正在載入製程資料…';
  const scripts = [...document.querySelectorAll('script[data-process-src]')];
  for (const item of scripts) {
    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'script';
    preload.href = item.dataset.processSrc;
    document.head.append(preload);
  }
  try {
    window.ProcessAccessPolicy=await import('./access-policy.mjs?v=20261010-access3');
    await window.ProcessSync.ready;
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
