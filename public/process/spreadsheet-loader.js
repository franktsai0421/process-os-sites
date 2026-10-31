// Code-only lazy resource. No company data, credentials, draft or API cache.
(() => {
  const source = '/process/vendor/xlsx.full.min.js?v=20260903-1510';
  const tasks = new Map();
  const notices = new WeakMap();
  let pending;
  const message = (zh, vi) => document.documentElement.lang === 'vi' ? vi : zh;
  const available = () => window.XLSX?.read && window.XLSX?.utils && window.XLSX?.writeFile;
  function load() {
    if (available()) return Promise.resolve(window.XLSX);
    if (pending) return pending;
    let script, timer;
    const promise = new Promise((resolve, reject) => {
      const fail = () => { clearTimeout(timer); script.remove(); reject(Error(message('Excel 工具載入失敗，資料尚未變更。請重試。', 'Không tải được công cụ Excel. Dữ liệu chưa thay đổi; hãy thử lại.'))); };
      script = document.createElement('script'); script.src = source;
      script.onload = () => { if (!available()) { fail(); return; } clearTimeout(timer); resolve(window.XLSX); };
      script.onerror = fail;
      timer = setTimeout(fail, 15000);
      document.head.append(script);
    });
    pending = promise;
    void promise.then(() => { if (pending === promise) pending = null; }, () => { if (pending === promise) pending = null; });
    return promise;
  }
  function capture(element, selection = () => '') {
    const sync = window.ProcessSync, actor = sync?.identity?.id, epoch = sync?.identityGeneration?.(), delivery = sync?.captureDelivery?.();
    const route = () => typeof state === 'undefined' ? '' : JSON.stringify([state.view,state.dataTab,state.masterScope,state.masterSection,state.approvalTab]);
    const initial = route();
    const initialSelection = selection();
    const selects = [...document.querySelectorAll('#view-root select')].map(input => [input,input.value]);
    return () => window.ProcessSync === sync && !sync?.requiresReload && sync?.identity?.id === actor &&
      sync?.identityGeneration?.() === epoch && (!delivery || sync?.isCurrentDelivery?.(delivery) !== false) &&
      route() === initial && selection() === initialSelection && selects.every(([input,value])=>input.isConnected&&input.value===value) && (!element || element.isConnected);
  }
  function contextError() { return Error(message('頁面或登入狀態已變更，請在目前頁面重新操作 Excel。', 'Trang hoặc phiên đăng nhập đã thay đổi. Hãy thực hiện lại Excel trên trang hiện tại.')); }
  function run(key, operation, element, owner = capture(element)) {
    if (tasks.has(key)) return tasks.get(key).promise;
    const record = { owner, started:false, promise:null };
    let released = false;
    // Keep business disabled/permission locks owned by their original handlers.
    // Single-flight blocks duplicate invocation without restoring stale flags.
    const loading = !available() && element?.parentNode ? document.createElement('div') : null;
    if(loading){loading.setAttribute('role','status');loading.textContent=message('正在載入 Excel 工具…','Đang tải công cụ Excel…');element.parentNode.append(loading);}
    const restore = () => { if (released) return; released=true;loading?.remove(); };
    const task = (async () => {
      try {
        await load();
        if (tasks.get(key) !== record || !owner()) throw contextError();
        // Release only our resource-loading state, before the original handler
        // performs its own permission checks, UI busy state and draft work.
        restore();
        record.started = true;
        return await operation();
      } finally { restore(); }
    })();
    record.promise = task; tasks.set(key, record);
    void task.then(() => { if (tasks.get(key) === record) tasks.delete(key); }, () => { if (tasks.get(key) === record) tasks.delete(key); });
    return task;
  }
  function wrap(key, handler, selection) {
    return function(...args) {
      const event = args[0], element = event?.currentTarget || event?.target;
      const current = capture(element,selection), files = element?.files ? [...element.files] : null;
      const owner = () => current() && (!files || element.files.length === files.length && files.every((file,index)=>element.files[index]===file));
      const previous = tasks.get(key);
      if (previous) {
        if (previous.started || previous.owner()) return;
        // A newer file/selection may replace only a not-yet-started intent.
        tasks.delete(key);
      }
      const receiver = this;
      let notice;
      const attempt = () => {
        if (!owner()) return;
        notice?.remove();if(element)notices.get(element)?.remove();
        return run(key, () => handler.apply(receiver,args), element, owner).catch(error => {
          if(tasks.has(key)&&tasks.get(key).owner!==owner)return;
          if (!element?.isConnected) return;
          notice = document.createElement('div'); notice.setAttribute('role','alert');
          const text = document.createElement('span'); text.textContent = error.message;
          notice.append(text);
          // Retry loading only. Original handler has not run when load fails;
          // after it has run, never replay a potentially successful mutation.
          if (!available()&&owner()) { const retry = document.createElement('button'); retry.type='button';retry.textContent=message('重試 Excel 載入','Thử tải Excel lại');retry.onclick=attempt;notice.append(retry); }
          element?.parentNode?.append(notice);
          notices.set(element,notice);
        });
      };
      return attempt();
    };
  }
  window.ProcessSpreadsheet = { load, run, wrap };
})();
