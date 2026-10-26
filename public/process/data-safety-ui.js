(() => {
  const sync = window.ProcessSync,
    h = escapeHtml,
    isLocalBackup =
      ['localhost', '127.0.0.1'].includes(location.hostname) &&
      new URLSearchParams(location.search).get('manage') === '1',
    cloudBackupEndpoint = new URLSearchParams(location.search).get('manage') === '1'
      ? '/api/backups?manage=1'
      : '/api/backups',
    localBackupEndpoint = '/__local-backups?manage=1';
  let activeBackupMode = isLocalBackup
    ? sessionStorage.getItem('process-backup-mode') === 'cloud' ? 'cloud' : 'disk'
    : 'cloud';
  const backupEndpoint = () => activeBackupMode === 'disk' ? localBackupEndpoint : cloudBackupEndpoint;
  const allViews = [
    'dashboard',
    'player',
    'dispatch',
    'productStatus',
    'approval',
    'editor',
    'data',
  ];
  const publicViewer = () => ({
    id: 'public-viewer',
    name: '公開查看',
    role: 'viewer',
    views: [...allViews],
    lines: ['A', 'B', 'C'],
    permissions: [
      'approval.viewAll',
      'approval.compare',
      'status.viewAllLines',
      'status.viewDetails',
      'status.viewMedia',
    ],
  });
  const canManage = () =>
    currentUser?.role === 'admin' &&
    (!sync?.protected || sync.identity?.role === 'admin');
  const originalNormalize = window.normalizePlatformUser;
  window.normalizePlatformUser = (user) => {
    originalNormalize?.(user);
    return user;
  };
  const priorIdentity = applyPlatformIdentity;
  applyPlatformIdentity = function () {
    if (currentUser) window.normalizePlatformUser(currentUser);
    priorIdentity();
    updateOwnRecovery();
    document.querySelectorAll('.nav-item').forEach((n) => {
      n.hidden = !canView(n.dataset.view);
      n.style.display = n.hidden ? 'none' : '';
    });
  };
  function updateOwnRecovery(notify = false) {
    const menu = document.querySelector('#account-menu'),
      owner = sync?.identity?.id,
      recovery = sync?.ownRecovery?.();
    let button = menu?.querySelector('[data-own-recovery]');
    if (!menu || !owner || currentUser?.id !== owner ||
        recovery?.actorId !== owner || !Object.keys(recovery.updates || {}).length) {
      button?.remove();
      return;
    }
    const vi = document.documentElement.lang === 'vi';
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.ownRecovery = '1';
      button.dataset.i18nSkip = 'true';
      menu.append(button);
    }
    button.textContent = vi ? 'Tải bản phục hồi' : '下載未同步輸入';
    button.title = vi ? 'Tải đầu vào chưa đồng bộ' : '下載未同步輸入';
    button.onclick = () => {
      const own = sync?.ownRecovery?.();
      // A button opened before an account switch must not export another actor.
      if (sync?.identity?.id !== owner || currentUser?.id !== owner ||
          own?.actorId !== owner || !Object.keys(own.updates || {}).length) {
        updateOwnRecovery();
        return;
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(own, null, 2)], { type: 'application/json' })),
        link = document.createElement('a');
      link.href = url;
      link.download = 'unsynced-input-recovery.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    if (notify) toast(vi
      ? 'Có đầu vào chưa đồng bộ. Tải bản phục hồi trong menu tài khoản; không tự gửi lại.'
      : '有未同步輸入，可從帳號選單下載保全檔；不會自動補送。');
  }
  window.addEventListener('process-sync-status', () => updateOwnRecovery());
  window.addEventListener('process-language-change', () => updateOwnRecovery());
  async function platformLogin(id, password) {
    const response = await fetch('/api/platform-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      }),
      value = await response.json();
    if (!response.ok) throw Error(value.error || '帳號或密碼錯誤');
    const user = { ...value.user };
    sync?.setPlatformIdentity?.(user, password);
    await sync?.refresh?.();
    window.BOMExcel?.refreshProjection?.();
    state.editorByCategory={};state.editorVersionId=null;
    enterPlatform(user);
    updateOwnRecovery(true);
  }
  function bindProtectedPlatformLogin() {
    document.querySelectorAll('[data-quick-login]').forEach(
      (button) =>
        (button.onclick = () => {
          const id = document.querySelector('#login-id'),
            password = document.querySelector('#login-password');
          id.value = button.dataset.quickLogin;
          password.value = '';
          password.focus();
          const hint = document.querySelector('.login-hint');
          hint.textContent = `請輸入 ${button.querySelector('b')?.textContent || button.dataset.quickLogin} 的平台密碼`;
          hint.classList.remove('error');
        }),
    );
    const submit = document.querySelector('#login-submit');
    if (submit)
      submit.onclick = async () => {
        const id = document.querySelector('#login-id').value,
          password = document.querySelector('#login-password').value,
          hint = document.querySelector('.login-hint');
        submit.disabled = true;
        try {
          await platformLogin(id, password);
        } catch (error) {
          hint.textContent = error.message;
          hint.classList.add('error');
          submit.disabled = false;
        }
      };
    const hint = document.querySelector('.login-hint');
    if (hint) hint.textContent = '請使用由 ADMIN 建立的平台帳號與密碼。';
  }
  const oldLogin = renderLogin;
  renderLogin = function () {
    if (sync?.expired) {
      oldLogin();
      bindProtectedPlatformLogin();
      return;
    }
    if (sync?.demoEnabled) {
      oldLogin();
      bindProtectedPlatformLogin();
      return;
    }
    if (sessionStorage.getItem('process-platform-signed-out') === '1') {
      oldLogin();
      bindProtectedPlatformLogin();
      return;
    }
    if (sync?.protected) {
      enterPlatform(publicViewer());
      return;
    }
    oldLogin();
  };
  const backupHeaders = (password) => ({
    'Content-Type': 'application/json',
    'X-Process-Admin-Id': currentUser?.id || '',
    'X-Process-Admin-Password': password ?? sync?.getPlatformPassword?.() ?? '',
  });
  async function backupRequest(options = {}, password) {
    const response = await fetch(backupEndpoint(), {
        cache: 'no-store',
        ...options,
        headers: { ...backupHeaders(password), ...options.headers },
      }),
      raw = await response.text();
    let value;
    try {
      value = raw ? JSON.parse(raw) : {};
    } catch {
      throw Error(`備份服務回應異常（HTTP ${response.status}）`);
    }
    if (!response.ok)
      throw Error(value.error || `備份服務無法使用（HTTP ${response.status}）`);
    return value;
  }
  const bytes = (value) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = Number(value) || 0,
      index = 0;
    while (n >= 1024 && index < units.length - 1) {
      n /= 1024;
      index++;
    }
    return `${n.toFixed(index ? 1 : 0)} ${units[index]}`;
  };
  function backupModeSummary(active) {
    return `<div class="backup-modes" role="tablist" aria-label="備份方式"><button type="button" role="tab" class="backup-mode-card ${active === 'disk' ? 'active' : ''}" data-backup-mode="disk" aria-selected="${active === 'disk'}" ${isLocalBackup?'':'disabled'}><span>方式一</span><h3>本機硬碟完整備份</h3><small>${isLocalBackup?'網站程式、資料庫與資產的完整 ZIP 備份。':'請從本機管理網址使用。'}</small></button><button type="button" role="tab" class="backup-mode-card ${active === 'cloud' ? 'active' : ''}" data-backup-mode="cloud" aria-selected="${active === 'cloud'}"><span>方式二</span><h3>雲端資料備份</h3><small>自動備份已停用；既有備份保留。</small></button></div>`;
  }
  function bindBackupModeSwitches(content) {
    content.querySelectorAll('[data-backup-mode]').forEach((button) => {
      button.onclick = () => {
        const mode = button.dataset.backupMode;
        if (mode === activeBackupMode || (mode === 'disk' && !isLocalBackup)) return;
        activeBackupMode = mode;
        if (isLocalBackup) sessionStorage.setItem('process-backup-mode', mode);
        backupPage().catch(error => toast(error.message));
      };
    });
  }
  function renderCloudBackups(content, result) {
    const settings = result.settings || {},
      rows = (result.backups || [])
        .map(
          (item) =>
            `<tr><td>${h(new Date(item.created_at).toLocaleString('zh-TW'))}</td><td><code>${h(item.id)}</code><small>${h(item.reason || '')}</small></td><td>資料版本 ${item.revision}</td><td>${h(item.actor || 'system')}</td><td><button class="danger-delete" data-cloud-restore="${h(item.id)}">回復此版本</button><button class="danger-delete" data-cloud-delete="${h(item.id)}">刪除</button></td></tr>`,
        )
        .join('');
    content.innerHTML = `<section class="backup-panel backup-console" data-i18n-skip="true"><header class="backup-title"><div><h2>備份與回復 · ADMIN</h2><p>${isLocalBackup?'目前選擇雲端資料備份；可隨時切回本機硬碟完整備份。':'目前位於公開網站，使用雲端資料備份；本機硬碟完整備份仍保留在管理電腦。'}</p></div><span id="backup-job-status">雲端待命</span></header>${backupModeSummary('cloud')}<div class="backup-health"><article><small>雲端目前資料版本</small><b>${result.revision ?? '—'}</b></article><article><small>自動備份</small><b>每週六 ${h(settings.time || '12:00')}</b></article><article><small>時區</small><b>${h(settings.timezone || 'Asia/Ho_Chi_Minh')}</b></article><article><small>備份範圍</small><b>全站共用資料與所有選項</b></article></div><div class="backup-settings cloud-backup-settings"><label>每週自動備份<input value="星期六" disabled></label><label>越南時間<input id="cloud-backup-time" type="time" value="${h(settings.time || '12:00')}"></label><button class="button signal" id="cloud-save-settings">儲存雲端排程</button></div><div class="backup-actions"><button class="button signal" id="cloud-backup-now">立即建立雲端備份</button><button class="button ghost" id="backup-refresh">重新整理</button></div><p class="backup-local-note"><b>雲端備份內容：</b>${(result.coverage || []).map((item) => h(item.label || item)).join('、') || '產品、BOM、線別、工段、流程、使用者權限、發送狀態及所有網站選項'}。</p><div class="backup-list"><table><thead><tr><th>備份時間</th><th>備份 ID／原因</th><th>版本</th><th>建立者</th><th>操作</th></tr></thead><tbody>${rows || '<tr><td colspan="5">目前沒有雲端備份</td></tr>'}</tbody></table></div></section>`;
    bindBackupModeSwitches(content);
    const cloudSchedule = document.querySelector('.cloud-backup-settings');
    cloudSchedule?.insertAdjacentHTML('afterbegin', `<label class="backup-auto-toggle"><input id="cloud-backup-enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}>啟用每週自動備份</label>`);
    const cloudAutoStatus = content.querySelector('.backup-health article:nth-child(2) b');
    if (cloudAutoStatus) cloudAutoStatus.textContent = settings.enabled ? `開啟 · 每週六 ${settings.time || '12:00'}` : '關閉（網站開啟時不會備份）';
    const status = (text) => {
        const label = document.querySelector('#backup-job-status');
        if (label) label.textContent = text;
      },
      busy = (active) =>
        content
          .querySelectorAll('button,input')
          .forEach((control) => (control.disabled = active));
    document.querySelector('#backup-refresh').onclick = backupPage;
    document.querySelector('#cloud-backup-now').onclick = async () => {
      busy(true);
      status('正在建立雲端資料備份…');
      try {
        await backupRequest({
          method: 'POST',
          body: JSON.stringify({ action: 'create' }),
        });
        toast('雲端資料備份已完成');
        await backupPage();
      } catch (error) {
        toast(error.message);
        busy(false);
        status('備份失敗');
      }
    };
    document.querySelector('#cloud-save-settings').onclick = async () => {
      busy(true);
      status('正在儲存排程…');
      try {
        await backupRequest({
          method: 'POST',
          body: JSON.stringify({
            action: 'settings',
            baseRevision: result.revision,
            settings: {
              enabled: document.querySelector('#cloud-backup-enabled').checked,
              frequency: 'weekly',
              dayOfWeek: 6,
              time: document.querySelector('#cloud-backup-time').value,
            },
          }),
        });
        toast('雲端備份排程已儲存');
        await backupPage();
      } catch (error) {
        toast(error.message);
        busy(false);
        status('設定失敗');
      }
    };
    content.querySelectorAll('[data-cloud-restore]').forEach(
      (button) =>
        (button.onclick = async () => {
          if (
            !confirm(
              `第一次確認：回復雲端備份 ${button.dataset.cloudRestore} 會覆蓋目前所有共用資料。繼續？`,
            )
          )
            return;
          if (
            prompt('第二次確認：請輸入備份 ID') !== button.dataset.cloudRestore
          )
            return;
          busy(true);
          status('正在建立安全備份並回復…');
          try {
            await backupRequest({
              method: 'POST',
              body: JSON.stringify({
                action: 'restore',
                id: button.dataset.cloudRestore,
                confirm: button.dataset.cloudRestore,
                baseRevision: result.revision,
              }),
            });
            alert('雲端資料回復完成，網站將重新載入。');
            location.reload();
          } catch (error) {
            toast(error.message);
            busy(false);
            status('回復失敗');
          }
        }),
    );
    content.querySelectorAll('[data-cloud-delete]').forEach(
      (button) =>
        (button.onclick = async () => {
          if (
            !confirm(`第一次確認：刪除雲端備份 ${button.dataset.cloudDelete}？`)
          )
            return;
          if (
            prompt('第二次確認：請輸入備份 ID') !== button.dataset.cloudDelete
          )
            return;
          busy(true);
          status('正在刪除雲端備份…');
          try {
            await backupRequest({
              method: 'POST',
              body: JSON.stringify({
                action: 'delete',
                id: button.dataset.cloudDelete,
                confirm: button.dataset.cloudDelete,
              }),
            });
            toast('雲端備份已刪除');
            await backupPage();
          } catch (error) {
            toast(error.message);
            busy(false);
            status('刪除失敗');
          }
        }),
    );
  }
  async function backupPage() {
    const content = document.querySelector('#data-content');
    if (!content || !canManage()) return;
    if (activeBackupMode === 'cloud') {
      const vi = document.documentElement.lang === 'vi';
      content.innerHTML = `<section class="backup-panel" data-backup-status="disabled"><h2>${vi ? 'Sao lưu tự động đã tắt' : '自動備份已停用'}</h2><p>${vi ? 'Không tạo bản sao lưu định kỳ hoặc trước thay đổi trong thao tác thông thường; không tự dọn bản sao lưu cũ. Bản sao lưu hiện có được giữ nguyên. Xác nhận xóa, bản nháp, phê duyệt và lịch sử phiên bản không thay đổi.' : '一般操作不再建立週期備份或修改前備份，也不自動清理舊備份。既有備份保留；刪除確認、草稿、審核與版本歷史不變。'}</p>${backupModeSummary('cloud')}</section>`;
      bindBackupModeSwitches(content);
      return;
    }
    content.innerHTML =
      '<section class="backup-panel"><h2>整站備份與還原 · ADMIN</h2><p>正在載入本機硬碟或雲端備份資料…</p></section>';
    try {
      await sync?.flush();
      const result = await backupRequest(),
        settings = result.settings || {},
        state = result.state || {},
        local = !!result.disk;
      if (!content.isConnected || content.dataset.activeTab !== 'backups') return;
      if (!local) {
        renderCloudBackups(content, result);
        content
          .querySelector('[data-i18n-skip]')
          ?.removeAttribute('data-i18n-skip');
        return;
      }
      const rows = (result.backups || [])
        .map(
          (item) =>
            `<tr class="backup-${item.status}"><td>${item.createdAt ? h(new Date(item.createdAt).toLocaleString('zh-TW')) : '—'}</td><td><code>${h(item.fileName)}</code><small>${bytes(item.size)}</small></td><td>${h(item.systemVersion || '—')}<small>${h(item.databaseVersion || '—')}</small></td><td><span class="backup-status ${item.status}">${item.status === 'complete' ? '完整' : '損壞／禁止還原'}</span><small>${h(item.type || item.error || '')}</small></td><td><button class="button ghost" data-check="${h(item.fileName)}" ${item.status !== 'complete' ? 'disabled' : ''}>檢查</button><button class="button ghost" data-download="${h(item.fileName)}" ${item.status !== 'complete' ? 'disabled' : ''}>下載</button><button class="danger-delete" data-restore="${h(item.fileName)}" ${item.status !== 'complete' ? 'disabled' : ''}>還原</button><button class="danger-delete" data-delete-backup="${h(item.fileName)}">刪除</button></td></tr>`,
        )
        .join('');
      content.innerHTML = `<section class="backup-panel backup-console" data-i18n-skip="true"><header class="backup-title"><div><h2>整站備份與還原 · ADMIN</h2><p>由主機後端執行；瀏覽器關閉後排程仍由網站服務處理。</p></div><span id="backup-job-status">待命</span></header><div class="backup-health"><article><small>目前備份路徑</small><b>${h(settings.backupPath)}</b></article><article><small>最近成功備份</small><b>${state.lastSuccessAt ? h(new Date(state.lastSuccessAt).toLocaleString('zh-TW')) : '尚無'}</b></article><article><small>下次預定備份</small><b>${settings.nextScheduledAt ? h(new Date(settings.nextScheduledAt).toLocaleString('zh-TW')) : '—'}</b></article><article><small>本週自動備份</small><b class="${state.thisWeekComplete ? 'ok' : 'warn'}">${settings.enabled ? (state.thisWeekComplete ? '已完成' : '尚未完成') : '已關閉'}</b></article><article><small>磁碟剩餘空間</small><b>${result.disk.freeBytes == null ? '儲存設定後檢查' : `${bytes(result.disk.freeBytes)} / ${bytes(result.disk.totalBytes)}`}</b></article><article><small>最近失敗原因</small><b class="${state.lastFailure ? 'bad' : 'ok'}">${h(state.lastFailure || '無')}</b></article></div><div class="backup-settings"><label class="backup-path-field">伺服器自動備份路徑<div><input id="backup-path" value="${h(settings.backupPath)}">${result.pathPickerSupported ? '<button class="button ghost" type="button" id="backup-pick-path">選擇資料夾</button>' : ''}</div><small>${result.pathPickerSupported ? '可由本機主機安全選擇，或手動輸入伺服器路徑。' : '此環境無法開啟主機資料夾選擇器，請手動輸入伺服器路徑。這不是瀏覽器下載位置。'}</small></label><label>保留天數<input id="backup-retention" type="number" min="1" max="365" value="${settings.retentionDays || 30}"></label><label>自動備份<input value="星期六" disabled></label><label>越南時間<input id="backup-time" type="time" value="${h(settings.time || '12:00')}"></label><button class="button signal" id="backup-save-settings">驗證並儲存設定</button></div><div class="backup-actions"><button class="button signal" id="backup-now">立即備份</button><button class="button ghost" id="backup-refresh">重新掃描</button></div><p class="backup-local-note"><b>備份內容：</b>網站前後台程式、所有按鈕功能、D1／SQLite 資料、網站資產與上傳內容、必要設定及還原資料。資料庫與程式內容以 AES-256-GCM 加密，ZIP 只公開完整性資訊。</p><div class="backup-list"><table><thead><tr><th>備份時間</th><th>檔案</th><th>系統／資料庫版本</th><th>狀態</th><th>操作</th></tr></thead><tbody>${rows || '<tr><td colspan="5">目前沒有完整備份</td></tr>'}</tbody></table></div><details class="backup-audit"><summary>最高管理員操作紀錄（${(result.audit || []).length}）</summary>${(result.audit || []).map((log) => `<p><code>${h(new Date(log.at).toLocaleString('zh-TW'))}</code> ${h(log.actor || log.actorId || 'system')} · ${h(log.action)} · ${log.success ? '成功' : '失敗'} ${h(log.fileName || log.error || '')}</p>`).join('')}</details></section>`;
      const diskSettings = content.querySelector('.backup-settings');
      diskSettings?.insertAdjacentHTML('afterbegin', `<label class="backup-auto-toggle"><input id="backup-enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}>啟用每週自動備份</label>`);
      content
        .querySelector('[data-i18n-skip]')
        ?.removeAttribute('data-i18n-skip');
      content
        .querySelector('.backup-title')
        ?.insertAdjacentHTML('afterend', backupModeSummary('disk'));
      bindBackupModeSwitches(content);
      const status = (text) => {
        const label = document.querySelector('#backup-job-status');
        if (label) label.textContent = text;
      };
      const busy = (active) =>
        content
          .querySelectorAll('button,input')
          .forEach((control) => (control.disabled = active));
      document.querySelector('#backup-refresh').onclick = backupPage;
      document.querySelector('#backup-save-settings').onclick = async () => {
        busy(true);
        status('正在檢查並儲存設定…');
        try {
          await backupRequest({
            method: 'POST',
            body: JSON.stringify({
              action: 'settings',
              settings: {
                enabled: document.querySelector('#backup-enabled').checked,
                backupPath: document.querySelector('#backup-path').value,
                retentionDays: Number(
                  document.querySelector('#backup-retention').value,
                ),
                dayOfWeek: 6,
                time: document.querySelector('#backup-time').value,
              },
            }),
          });
          toast('備份路徑與排程已儲存');
          await backupPage();
        } catch (error) {
          toast(error.message);
          busy(false);
          status('設定失敗');
        }
      };
      document.querySelector('#backup-pick-path')?.addEventListener('click', async () => {
        const button=document.querySelector('#backup-pick-path');button.disabled=true;status('請在主機的資料夾選擇視窗選取，或按取消');
        try {
          const response = await backupRequest({method:'POST',body:JSON.stringify({ action: 'choose-directory' })});
            if (response.path) {document.querySelector('#backup-path').value = response.path;status('路徑已選取，請驗證並儲存設定');}
            else if (response.cancelled) status('已取消，原路徑未變更');
          else if (!response.cancelled) toast(response.reason || '此主機無法開啟資料夾選擇器');
        } catch (error) { toast(error.message || '資料夾選擇器無法使用');status(error.message); }
        finally {button.disabled=false;}
      });
      document.querySelector('#backup-now').onclick = async () => {
        busy(true);
        status('正在建立、加密並校驗整站備份…');
        try {
          const value = await backupRequest({
            method: 'POST',
            body: JSON.stringify({ action: 'create' }),
          });
          toast(`備份完成：${value.fileName}`);
          await backupPage();
        } catch (error) {
          toast(error.message);
          busy(false);
          status('備份失敗');
        }
      };
      content.querySelectorAll('[data-check]').forEach(
        (button) =>
          (button.onclick = async () => {
            busy(true);
            status('正在驗證 ZIP、版本與 SHA-256…');
            try {
              const value = await backupRequest({
                method: 'POST',
                body: JSON.stringify({
                  action: 'inspect',
                  fileName: button.dataset.check,
                }),
              });
              alert(
                `檢查通過\n備份時間：${new Date(value.manifest.createdAt).toLocaleString('zh-TW')}\n系統版本：${value.manifest.systemVersion}\n資料庫：${value.manifest.database.type} ${value.manifest.database.version}\n內容：${value.manifest.contents.summary.join('、')}`,
              );
              busy(false);
              status('檢查通過');
            } catch (error) {
              toast(error.message);
              busy(false);
              status('檢查失敗');
            }
          }),
      );
      content.querySelectorAll('[data-download]').forEach(
        (button) =>
          (button.onclick = async () => {
            busy(true);
            status('正在下載備份…');
            try {
              const response = await fetch(
                `${backupEndpoint()}&download=${encodeURIComponent(button.dataset.download)}`,
                { headers: backupHeaders() },
              );
              if (!response.ok) throw Error((await response.json()).error);
              const url = URL.createObjectURL(await response.blob()),
                link = document.createElement('a');
              link.href = url;
              link.download = button.dataset.download;
              link.click();
              URL.revokeObjectURL(url);
              busy(false);
              status('下載完成');
            } catch (error) {
              toast(error.message);
              busy(false);
              status('下載失敗');
            }
          }),
      );
      content.querySelectorAll('[data-restore]').forEach(
        (button) =>
          (button.onclick = async () => {
            if (
              !confirm(
                `第一次確認：還原 ${button.dataset.restore} 會覆蓋目前網站程式與所有資料。繼續？`,
              )
            )
              return;
            const password = prompt('第二次確認：請重新輸入目前 ADMIN 密碼');
            if (password === null) return;
            const confirmText = prompt('請輸入指定確認文字：0988901928');
            if (confirmText === null) return;
            busy(true);
            status('維護模式：正在建立還原前安全備份及驗證…');
            try {
              await backupRequest(
                {
                  method: 'POST',
                  body: JSON.stringify({
                    action: 'restore',
                    fileName: button.dataset.restore,
                    confirmText,
                  }),
                },
                password,
              );
              alert('整站還原完成，安全備份已保留；網站將重新載入。');
              location.reload();
            } catch (error) {
              toast(error.message);
              busy(false);
              status('還原失敗，已嘗試回滾');
            }
          }),
      );
      content.querySelectorAll('[data-delete-backup]').forEach(
        (button) =>
          (button.onclick = async () => {
            if (
              !confirm(`第一次確認：確定刪除 ${button.dataset.deleteBackup}？`)
            )
              return;
            const password = prompt('第二次確認：請重新輸入 ADMIN 密碼');
            if (password === null) return;
            const confirmText = prompt('請輸入指定確認文字：0988901928');
            if (confirmText === null) return;
            busy(true);
            status('正在驗證並刪除備份…');
            try {
              await backupRequest(
                {
                  method: 'POST',
                  body: JSON.stringify({
                    action: 'delete',
                    fileName: button.dataset.deleteBackup,
                    confirmText,
                  }),
                },
                password,
              );
              toast('備份已刪除');
              await backupPage();
            } catch (error) {
              toast(error.message);
              busy(false);
              status('刪除失敗');
            }
          }),
      );
    } catch (error) {
      if (!content.isConnected || content.dataset.activeTab !== 'backups') return;
      content.innerHTML = `<section class="backup-panel"><h2>備份與還原</h2><p>${h(error.message)}</p><button class="button ghost" id="retry-backup-page">重試</button></section>`;
      content.querySelector('#retry-backup-page').onclick=backupPage;
    }
  }
  window.ProcessBackupPage = backupPage;
  const priorBind = bindData;
  bindData = function () {
    priorBind();
    const tabs = document.querySelector('.master-tabs');
    const users = tabs?.querySelector('[data-tab="users"]');
    if (users) users.hidden = !canManage();
    window.ProcessDataTabs?.bind();
    if (tabs && !document.querySelector('.admin-visibility-note')) {
      const note = document.createElement('p');
      note.className = `admin-visibility-note ${canManage() ? 'admin' : 'viewer'}`;
      note.textContent = canManage()
        ? '目前身分：ADMIN｜可管理使用者與權限。'
        : '個人資料與密碼請開啟「我的帳號」。';
      tabs.after(note);
    }
  };
  const priorUserBind = bindDataInner;
  bindDataInner = function (tab) {
    if (tab === 'users' && !canManage()) {
      document.querySelector('#data-content').innerHTML =
        '<div class="empty">只有 ADMIN 可以管理使用者與權限。</div>';
      return;
    }
    priorUserBind(tab);
    if (tab === 'users' && canManage()) {
      const p = document.createElement('section');
      p.className = 'backup-panel';
      p.innerHTML = `<h3>ADMIN 帳號管理</h3><p>帳號、密碼、角色與權限均由 ADMIN 在本平台管理，不需要綁定任何外部帳號。</p>`;
      document.querySelector('#data-content').appendChild(p);
      document
        .querySelector('#save-role-permissions')
        ?.addEventListener('click', () => applyPlatformIdentity());
    }
  };
  const priorRender = render;
  render = function () {
    if (
      ['editor', 'productStatus', 'player', 'dispatch'].includes(state.view) &&
      (!data.products.length || !lines.length)
    ) {
      root.innerHTML =
        '<section class="page"><div class="empty"><h2>尚無可用的產品或線別</h2><p>請先在資料後台新增並核准資料，再使用此介面。</p></div></section>';
      return;
    }
    const showLoadError=()=>{
      root.innerHTML='<section class="page"><div class="empty" role="alert"><h2>頁面資料載入失敗</h2><p>請保留未儲存內容並確認連線，再重新載入。</p><button type="button" class="button signal" id="retry-page-load">重新載入</button></div></section>';
      root.querySelector('#retry-page-load').onclick=()=>location.reload();
    };
    if(sync?.loadError){showLoadError();return;}
    try{priorRender();}catch(error){console.warn('Process page rendering failed',error);showLoadError();return;}
    document
      .querySelectorAll('[data-go]')
      .forEach((button) => (button.hidden = !canView(button.dataset.go)));
    if (sync?.protected && !sync.identity) {
      document
        .querySelectorAll(
          '#master-new-draft,#master-save-draft,#master-submit,#save-process,#add-master-template,#save-master-data,[data-version-action],[data-stage-add],[data-line-edit],[data-product-edit],#master-add-product,#add-master-category,#add-master-line',
        )
        .forEach((button) => {
          button.disabled = true;
          button.title = '公開查看模式，請登入管理帳號後修改';
        });
    }
  };
  if (sync?.expired) {
    currentUser = null;
    persistPlatform();
    renderLogin();
    return;
  }
  const intentionallySignedOut =
    sessionStorage.getItem('process-platform-signed-out') === '1';
  if (intentionallySignedOut) {
    currentUser = null;
    persistPlatform();
    renderLogin();
  } else if (sync?.identity) enterPlatform(sync.identity);
  else if (currentUser && currentUser.id !== 'public-viewer' && !sync?.protected) {
    applyPlatformIdentity();
    render();
  } else if (currentUser) {
    if (sync?.protected && !sync.identity) {
      currentUser = null;
      persistPlatform();
      renderLogin();
      return;
    }
    applyPlatformIdentity();
    render();
  } else renderLogin();
})();
