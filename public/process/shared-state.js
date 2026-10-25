(() => {
  const localManage =
      new URLSearchParams(location.search).get('manage') === '1',
    endpoint = localManage ? '/api/shared-state?manage=1' : '/api/shared-state',
    fixedKeys = new Set([
      'platformUsers',
      'processCustomRoles',
      'processRoleTemplateOverrides',
      'approvalVersions',
      'processAuthoringControl',
      'dispatchBoard',
      'publishedProcess',
      'processMasterData',
      'masterDataControl',
      'bomOverrides',
      'versionSampleSeed4',
      'backupSettings',
      'canonicalQuality',
      'qualityMasterControl',
    ]);
  // oxlint-disable-next-line typescript/unbound-method -- Every use supplies the original Storage receiver with .call(this, ...).
  const originalGet = Storage.prototype.getItem,
  // oxlint-disable-next-line typescript/unbound-method -- Every use supplies the original Storage receiver with .call(this, ...).
    originalSet = Storage.prototype.setItem,
  // oxlint-disable-next-line typescript/unbound-method -- Every use supplies the original Storage receiver with .call(this, ...).
    originalRemove = Storage.prototype.removeItem;
  const isSharedKey = (key) =>
    fixedKeys.has(key) || key.startsWith('processEditor:');
  let revision = 0,
    ready = false,
    posting = false,
    pendingFlush = null,
    timer,
    dirty = {},
    dirtyOwner = null,
    inFlightUpdates = null,
    inFlightOwner = null,
    identityEpoch = 0,
    baseline = {},
    baselineOwner = null,
    blocked = false,
    paused = false,
    platformCredential = null,
    sharedValues = new Map(
      Object.keys(localStorage)
        .filter(isSharedKey)
        .map((key) => [key, originalGet.call(localStorage, key)]),
    );
  const legacyDrafts = new Map([...sharedValues].filter(([key]) => key.startsWith('processEditor:')));
  const quarantined=new Map();
  const api = (window.ProcessSync = {
    identity: null,
    protected: false,
    status: 'loading',
    paused: false,
    revision: 0,
    loadError: null,
    importPending: false,
    loginRequired: false,
    deliveryProjection: false,
    writableKeys: [],
    catalog: null,
    destination: null,
    requiresReload: false,
    projectionWriteError: null,
    bootstrapping: true,
    saveError: null,
    flush,
    legacyDraftKeys: () => [...legacyDrafts.keys()],
    readLegacyDraft: key => validLegacyDraft(key, legacyDrafts.get(key)),
  });
  const staleKeys = new Set();
  // The legacy badge may use only a confirmed server baseline belonging to
  // this sign-in generation, never bootstrap localStorage or another actor.
  api.legacyProcessPendingCount = () => {
    if(!ready||api.loadError||api.expired||!baselineOwner||baselineOwner.id!==api.identity?.id||baselineOwner.epoch!==identityEpoch||Object.hasOwn(baseline,'processAuthoringControl'))return null;
    try{const rows=JSON.parse(baseline.approvalVersions);return Array.isArray(rows)?rows.filter(row=>row.status==='pending').length:null;}catch{return null;}
  };
  api.saveFailureMessage = () => {
    const vi = document.documentElement.lang === 'vi';
    const code = api.saveError?.status;
    if (code === 409) return vi
      ? 'Bản nháp chưa được lưu trên máy chủ: dữ liệu đã được cập nhật ở nơi khác. Giữ trang này và đối chiếu thay đổi trước khi lưu lại.'
      : '草稿尚未完成伺服器儲存：資料已在其他位置更新。請保留目前頁面並核對差異，不要重新整理或覆蓋他人的修改。';
    if (code === 401 || code === 403) return vi
      ? 'Bản nháp chưa được lưu trên máy chủ: phiên đăng nhập đã hết hạn hoặc không có quyền. Giữ trang này và liên hệ quản trị viên.'
      : '草稿尚未完成伺服器儲存：登入已失效或沒有儲存權限。請保留目前頁面並聯絡管理員。';
    return vi
      ? 'Bản nháp chưa được lưu trên máy chủ. Giữ trang này, kiểm tra kết nối rồi nhấn Lưu lại.'
      : '草稿尚未完成伺服器儲存。請保留目前頁面，確認連線後再次按儲存。';
  };
  function authHeaders() {
    return platformCredential?.id && platformCredential?.password
      ? {
          'X-Process-Admin-Id': platformCredential.id,
          'X-Process-Admin-Password': platformCredential.password,
        }
      : {};
  }
  api.setPlatformIdentity = (user, password) => {
    quarantinePending();identityEpoch++;
    if(ready&&api.deliveryProjection)invalidateDelivery();
    window.EffectiveVersionNotice?.reset?.();
    api.identity = { id: user.id, name: user.name, role: user.role, authMode: user.authMode, sessionType: user.sessionType };
    platformCredential = password ? { id: user.id, password } : null;
    blocked = false;
    paused = false;
    api.paused = false;
  };
  api.getPlatformPassword = () => platformCredential?.password || '';
  api.setDemoIdentity = user => {api.setPlatformIdentity(user);sessionStorage.removeItem('process-platform-signed-out');};
  api.clearIdentity = () => {quarantinePending();identityEpoch++;if(ready&&api.deliveryProjection)invalidateDelivery();window.EffectiveVersionNotice?.reset?.();platformCredential=null;api.identity=null;blocked=false;paused=false;api.paused=false;};
  api.identityGeneration = () => identityEpoch;
  api.pendingState=()=>({dirty:Object.keys(dirty).length,inFlight:posting,paused,blocked});
  api.ownRecovery=()=>{if(!api.identity?.id)return null;const memory=quarantined.get(api.identity.id);if(memory)return memory;try{const saved=JSON.parse(originalGet.call(sessionStorage,recoveryKey(api.identity.id))||'null');return saved?.actorId===api.identity.id?saved:null;}catch{return null;}};
  api.platformHeaders = () => ({ 'Content-Type': 'application/json', ...authHeaders() });
  api.applyServerState = apply;
  // Rendering an approved PROCESS catalog is a local mirror update, not a
  // business edit or a server acknowledgement. Preserve queued/in-flight input.
  api.projectProcessMaster = value => {
    if (!ready || typeof value !== 'string' ||
        ['processMasterData','masterDataControl'].some(key =>
          Object.hasOwn(dirty,key) || posting && Object.hasOwn(inFlightUpdates || {},key))) return false;
    sharedValues.set('processMasterData',value);
    return true;
  };
  api.discardPending = (key, value) => {
    if (posting) throw Error('Cannot discard an in-flight write');
    delete dirty[key];
    if (value === null) sharedValues.delete(key); else sharedValues.set(key, value);
    preserveRecovery();
  };
  function status(message) {
    api.status = message;
    window.dispatchEvent(
      new CustomEvent('process-sync-status', { detail: message }),
    );
  }
  function preserveRecovery() {
    const owner=dirtyOwner||inFlightOwner;if(!owner)return;
    const updates={...(owner===inFlightOwner?inFlightUpdates:{}),...dirty},previous=quarantined.get(owner),saved={actorId:owner,identityGeneration:identityEpoch,at:new Date().toISOString(),baseRevision:revision,baseline:Object.fromEntries(Object.keys(updates).map(key=>[key,baseline[key]])),updates,previous:previous&&previous.identityGeneration!==identityEpoch?[...(previous.previous||[]),{...previous,previous:undefined}]:previous?.previous||[]};
    quarantined.set(owner,saved);
    try {
      originalSet.call(
        sessionStorage,
        recoveryKey(owner),
        JSON.stringify(saved),
      );
    } catch (error) {
      console.warn('瀏覽器無法保存未同步資料備份', error);
    }
  }
  const recoveryKey=actorId=>'process-unsynced-recovery:'+encodeURIComponent(actorId||'unowned');
  function quarantinePending(){
    clearTimeout(timer);
    if(Object.keys(dirty).length||inFlightUpdates)preserveRecovery();
    // Retain the old actor's exact unsynced input, but never send it under the
    // next account. A fresh authenticated load replaces the old page mirror.
    dirty={};dirtyOwner=null;
  }
  function invalidateDelivery(){
    api.requiresReload=true;api.catalog=null;api.destination=null;api.writableKeys=[];
    sharedValues.clear();baseline={};baselineOwner=null;
    // Existing module closures must not continue under a different actor. Their
    // normal APIs also fence identity; a new document clears the old closures.
    window.dispatchEvent(new CustomEvent('process-delivery-invalidated'));
  }
  function apply(shared) {
    api.loadError = null;
    api.saveError = null;
    api.projectionWriteError = null;
    staleKeys.clear();
    api.expired = false;
      let values = shared.values || {};
      if(api.deliveryProjection&&shared.deliveryProjection!==true){
        // A legacy write receipt may contain a larger authorized snapshot. It
        // acknowledges complete writable cells, not a new page projection.
        const receiptKeys=new Set([...api.writableKeys,'platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']);
        values={...Object.fromEntries(sharedValues),...Object.fromEntries(Object.entries(values).filter(([key])=>receiptKeys.has(key)))};
      }
    if(shared.deliveryProjection===true){
      api.deliveryProjection=true;
      api.writableKeys=Array.isArray(shared.writableKeys)?shared.writableKeys:[];
      api.catalog=shared.catalog;
      api.destination=shared.destination||null;
    }
    sharedValues = new Map(
      Object.entries(values).filter(
        ([key, value]) => isSharedKey(key) && typeof value === 'string',
      ),
    );
    // Preserve old browser drafts until a complete server write is verified.
    for (const [key, value] of legacyDrafts) {
      if (!api.deliveryProjection && !sharedValues.has(key) && validLegacyDraft(key, value)) sharedValues.set(key, value);
    }
    Object.keys(localStorage)
      .filter(key => isSharedKey(key) && !key.startsWith('processEditor:'))
      .forEach((key) => originalRemove.call(localStorage, key));
    baseline = { ...values };
    if(Object.hasOwn(shared,'identity'))baselineOwner=api.identity?.id?{id:api.identity.id,epoch:identityEpoch}:null;
    revision = shared.revision || 0;
    api.revision = revision;
  }
  async function load() {
   if(api.requiresReload)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
   const generation=identityEpoch,oldActor=api.identity?.id;
   api.importPending = false;
   api.loginRequired = false;
   try {
    const query=new URLSearchParams(location.search),intent=new URLSearchParams();
    for(const key of ['system','view','dataTab'])for(const value of query.getAll(key))intent.append(key,value);
    if(!intent.has('system')){const saved=sessionStorage.getItem('process-active-system');if(saved==='process'||saved==='quality')intent.set('system',saved);}
    const request = await fetch('/api/process-bootstrap'+(intent.size?'?'+intent:''), { cache: 'no-store', headers: { 'X-Process-Media': 'deferred-v1', ...authHeaders() }, signal: AbortSignal.timeout(45000) });
    if(generation!==identityEpoch)return;
    if (request.status === 200) {
      const shared = await request.json();
      if(generation!==identityEpoch)return;
      if(ready&&api.deliveryProjection&&oldActor!==shared.identity?.id){quarantinePending();identityEpoch++;api.identity=null;invalidateDelivery();return;}
      api.identity = shared.identity || null;
      api.protected = !!shared.serverProtected;
      api.demoEnabled = !!shared.demoEnabled;
      apply(shared);
    } else if (request.status === 401) {
      if(ready&&api.deliveryProjection){quarantinePending();identityEpoch++;invalidateDelivery();}
      api.protected = true;
      api.identity = null;
      api.expired = true;
      api.loginRequired = true;
    } else if (request.status === 403) {
      if(ready&&api.deliveryProjection){quarantinePending();identityEpoch++;invalidateDelivery();}
      api.protected = true;
      api.expired = true;
    } else {
      api.protected = true;
      api.loadError = 'unavailable';
      // Only the exact inactive-import response is a preparation state. Keep
      // authentication failures, outages and malformed responses as failures.
      if (request.status === 503 && request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() === 'application/json') {
        try { api.importPending = (await request.json())?.error === 'IMPORT_TARGET_NOT_ACTIVE'; }
        catch { /* Preserve the original unavailable state. */ }
      }
      status('offline');
    }
  } catch (error) {
    if(generation!==identityEpoch)return;
    api.protected = true;
    api.loadError = 'unavailable';
    console.warn('共用資料服務無法連線', error);
    status('offline');
  } finally {
    ready = true;
    stageLegacyDrafts();
   }
  }
  api.ready = load();
  api.refresh = async () => {
    if(pendingFlush)await pendingFlush;
    if (Object.keys(dirty).length) throw Error('Unsaved changes');
    await load();
    if(api.requiresReload)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
    if(api.loadError || api.expired) throw Error('Shared state unavailable');
    window.dispatchEvent(new CustomEvent('process-shared-state-updated'));
  };
  function validLegacyDraft(key, value) {
    try {
      const saved = JSON.parse(value || 'null');
      return saved && key === `processEditor:${saved.category}:${saved.line}` &&
        saved.stages && !Array.isArray(saved.stages) && typeof saved.stages === 'object' &&
        Object.values(saved.stages).every(Array.isArray) ? saved : null;
    } catch { return null; }
  }
  function stageLegacyDrafts() {
    if(api.deliveryProjection)return;
    if (!ready || (api.protected && (!api.identity || ['viewer', 'device'].includes(api.identity.role)))) return;
    for (const [key, value] of legacyDrafts) {
      if (!(key in baseline) && validLegacyDraft(key, value)) queue(key, sharedValues.get(key));
    }
  }
  function confirmLegacyDrafts(updates, values) {
    for (const [key, legacyValue] of legacyDrafts) {
      const legacy = validLegacyDraft(key, legacyValue), saved = validLegacyDraft(key, values[key]);
      if (legacy && saved && key in updates && !(key in dirty) &&
        updates[key] === values[key] && sharedValues.get(key) === values[key] &&
        originalGet.call(localStorage, key) === legacyValue &&
        JSON.stringify(saved.stages) === JSON.stringify(legacy.stages)) {
        originalRemove.call(localStorage, key);
        legacyDrafts.delete(key);
      }
    }
  }
  api.applyRestore = (shared) => {
    for (const key of ['processCustomRoles', 'processRoleTemplateOverrides'])
      originalRemove.call(localStorage, key);
    dirty = {};
      apply(shared);
  };
  function flush() {
    clearTimeout(timer);
    if (api.loadError || api.projectionWriteError) return Promise.resolve(false);
    if (pendingFlush) return pendingFlush;
    if (blocked||dirtyOwner&&dirtyOwner!==api.identity?.id) return Promise.resolve(false);
    // Explicit Save may retry a temporary failure. No background retry is scheduled.
    paused = false;
    api.paused = false;
    pendingFlush = (async () => {
      while (Object.keys(dirty).length) {
        if (!(await writeBatch())) return false;
      }
      return true;
    })().finally(() => { pendingFlush = null; });
    return pendingFlush;
  }
  async function writeBatch() {
    clearTimeout(timer);
    if (posting || blocked || paused) return false;
    if (!Object.keys(dirty).length) return true;
    if (Object.keys(dirty).some(key => staleKeys.has(key))) {
      blocked = true;
      api.saveError = { status: 409, message: 'Stale key requires review' };
      preserveRecovery();
      status('conflict');
      return false;
    }
    posting = true;
    const updates = dirty;
    const owner=dirtyOwner,epoch=identityEpoch;
    inFlightUpdates=updates;inFlightOwner=owner;
    dirty = {};
    preserveRecovery();
    status('saving');
    try {
      const assertOwner=()=>{if(epoch!==identityEpoch||owner!==(api.identity?.id||null))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');};
      const send = () => {assertOwner();return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Process-Receipt': 'sha256', 'X-Process-Media': 'deferred-v1', ...authHeaders() },
        body: JSON.stringify({ updates, baseRevision: revision }),
        signal:AbortSignal.timeout(15000),
      });};
      let response = await send();
      assertOwner();
      if (response.status === 409) {
        // Dedicated IQC/equipment APIs advance the shared D1 revision without
        // changing this batch's keys. Rebase only after comparing every key;
        // a real same-key conflict still follows the blocked recovery path.
        const latestResponse = await fetch(endpoint, {
          cache: 'no-store',
          headers: { 'X-Process-Media': 'deferred-v1', ...authHeaders() },
          signal:AbortSignal.timeout(15000),
        });
        if (latestResponse.ok) {
          const latest = await latestResponse.json();
          assertOwner();
          if (Number.isInteger(latest.revision) && latest.values &&
              Object.keys(updates).every(key => latest.values[key] === baseline[key])) {
            // Rebasing one key must not authorize a later stale write to another.
            for (const key of new Set([...Object.keys(baseline), ...Object.keys(latest.values)]))
              if (!(key in updates) && baseline[key] !== latest.values[key]) staleKeys.add(key);
            baseline = { ...latest.values };
            revision = latest.revision;
            api.revision = revision;
            response = await send();
          }
        }
      }
      const text = await response.text();
      assertOwner();
      let shared = {};
      try {
        shared = text ? JSON.parse(text) : {};
      } catch {
        shared = { error: `同步服務回應異常（HTTP ${response.status}）` };
      }
      if (!response.ok) {
        dirty = { ...updates, ...dirty };
        // Never create an endless retry loop. Client/conflict responses need
        // human review; server failures pause until the user retries once.
        blocked = [401, 403, 409].includes(response.status);
        api.saveError = { status: response.status, message: shared.error || '' };
        paused = !blocked;
        api.paused = paused;
        preserveRecovery();
        status(
          response.status === 409
            ? 'conflict'
            : paused
              ? 'offline'
              : shared.error || '儲存失敗',
        );
        return false;
      }
      let acceptedValues = shared.values;
      if (shared.accepted) {
        for (const [key, value] of Object.entries(updates)) {
          const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), b => b.toString(16).padStart(2, '0')).join('');
          if (shared.accepted[key] !== digest) throw Error('Server receipt mismatch');
        }
        acceptedValues = { ...baseline, ...updates };
      }
      if (!acceptedValues || !Number.isInteger(shared.revision)) throw Error('Invalid server receipt');
      assertOwner();
      baseline = { ...acceptedValues };
      confirmLegacyDrafts(updates, acceptedValues);
      revision = shared.revision;
      api.revision = revision;
      blocked = false;
      api.saveError = null;
      paused = false;
      api.paused = false;
      inFlightUpdates=null;
      if(!Object.keys(dirty).length){originalRemove.call(sessionStorage,recoveryKey(owner));quarantined.delete(owner);dirtyOwner=null;}else preserveRecovery();
      status('saved');
      return true;
    } catch {
      if(epoch!==identityEpoch||owner!==(api.identity?.id||null))return false;
      dirty = { ...updates, ...dirty };
      api.saveError = { status: 0, message: 'network' };
      paused = true;
      api.paused = true;
      preserveRecovery();
      status('offline');
      return false;
    } finally {
      inFlightUpdates=null;inFlightOwner=null;
      posting = false;
    }
  }
  function queue(key, value) {
    if (!ready || !isSharedKey(key)) return;
    // A paused or blocked batch may already be committed; the old baseline
    // cannot confirm a later revert until the server acknowledges it.
    if (!posting && !paused && !blocked && baseline[key] === value) {
      delete dirty[key];
      return;
    }
    // Account/role changes use the revision-checked administration API.
    if(['platformUsers','processCustomRoles','processRoleTemplateOverrides'].includes(key))return;
    if (api.protected && !api.identity) {
      status('readonly');
      return;
    }
    if (
      api.protected &&
      api.identity?.role !== 'admin' &&
      [
        'platformUsers',
        'processCustomRoles',
        'processRoleTemplateOverrides',
      ].includes(key)
    )
      return;
    dirty[key] = value;
    dirtyOwner=api.identity?.id||null;
    if (staleKeys.has(key)) {
      blocked = true;
      api.saveError = { status: 409, message: 'Stale key requires review' };
      preserveRecovery();
      status('conflict');
      return;
    }
    clearTimeout(timer);
    if (paused || blocked) {
      preserveRecovery();
      return;
    }
    timer = setTimeout(flush, 250);
  }
  Storage.prototype.getItem = function (key) {
    key = String(key);
    if (this === localStorage && isSharedKey(key))
      return sharedValues.has(key) ? sharedValues.get(key) : null;
    return originalGet.call(this, key);
  };
  Storage.prototype.setItem = function (key, value) {
    key = String(key);
    value = String(value);
    if (this === localStorage && isSharedKey(key)) {
      // A delivery projection is not a whole-state/draft baseline. Dedicated
      // workflow APIs own these writes; bootstrap must never seed missing keys.
      if(api.deliveryProjection&&!api.writableKeys.includes(key)){
        // Existing account/authoring mirrors have dedicated mutation APIs.
        // For an attempted legacy business edit, expose refusal rather than
        // acknowledging an edit that was never queued or persisted.
        if(!api.bootstrapping&&!['platformUsers','processCustomRoles','processRoleTemplateOverrides','approvalVersions','publishedProcess'].includes(key)&&!key.startsWith('processEditor:')&&sharedValues.get(key)!==value){
          api.projectionWriteError={status:409,message:'USE_MODULE_WORKFLOW'};
          api.saveError=api.projectionWriteError;status('readonly');
        }
        return;
      }
      if(sharedValues.has('processAuthoringControl')&&(key==='approvalVersions'||key==='publishedProcess'||key.startsWith('processEditor:')))return;
      sharedValues.set(key, value);
      queue(key, value);
      return;
    }
    originalSet.call(this, key, value);
  };
  Storage.prototype.removeItem = function (key) {
    key = String(key);
    if (this === localStorage && isSharedKey(key)) {
      if(api.deliveryProjection&&!api.writableKeys.includes(key)){
        if(!api.bootstrapping&&sharedValues.has(key)){api.projectionWriteError={status:409,message:'USE_MODULE_WORKFLOW'};api.saveError=api.projectionWriteError;status('readonly');}
        return;
      }
      sharedValues.delete(key);
      queue(key, null);
      return;
    }
    originalRemove.call(this, key);
  };
  if (api.identity?.role === 'admin')
    for (const key of ['processCustomRoles', 'processRoleTemplateOverrides']) {
      const value = localStorage.getItem(key);
      if (value && !baseline[key]) queue(key, value);
    }
  // Shared state is loaded when the latest URL opens. Background polling is
  // intentionally disabled so another open tab cannot interrupt current work.
  window.addEventListener('beforeunload', (event) => {
    if (Object.keys(dirty).length || posting) {
      event.preventDefault();
      // oxlint-disable-next-line typescript/no-deprecated -- Preserve the legacy browser unsaved-work prompt alongside preventDefault().
      event.returnValue = '資料尚未儲存完成';
    }
  });
})();
