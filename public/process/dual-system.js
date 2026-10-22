(() => {
  const SYSTEM_KEY = 'process-active-system';
  const qualityViews = {
    'quality-dashboard': ['QUALITY MANAGEMENT', '總覽'],
    'quality-search': ['QUALITY STANDARD', '標準搜尋'],
    'quality-reports': ['QUALITY REPORTS', '品質報告'],
    'quality-inspections': ['ROUTINE INSPECTION', '例行檢查'],
    'quality-fpy': ['FIRST PASS YIELD', 'FPY'],
  };
  const qualityDataTabs = {
    'quality-fqc': 'FQC',
    'quality-iqc': 'IQC',
    'quality-ipqc-ab': 'IPQC-AB',
    'quality-ipqc-c': 'IPQC-C',
    'quality-mold-equipment': '模具設備',
    'quality-routine-reports': '例行報告資料庫',
    'quality-routine-equipment': '檢具與測試設備',
  };
  let activeSystem = new URL(location.href).searchParams.get('system') === 'quality'
    ? 'quality'
    : sessionStorage.getItem(SYSTEM_KEY) === 'quality'
      ? 'quality'
      : 'process';

  function rememberSystem(system) {
    activeSystem = system === 'quality' ? 'quality' : 'process';
    sessionStorage.setItem(SYSTEM_KEY, activeSystem);
  }

  function routeUrl(view = state.view) {
    const url = new URL(location.href);
    url.searchParams.set('system', activeSystem);
    url.searchParams.set('view', view);
    if (view !== 'data') url.searchParams.delete('dataTab');
    return url;
  }

  function writeRoute(view, replace = false) {
    const url = routeUrl(view);
    if (url.href === location.href) return;
    history[replace ? 'replaceState' : 'pushState'](
      { ...history.state, system: activeSystem, view },
      '',
      url,
    );
  }

  function qualityPage(view) {
    if (view === 'quality-inspections' && window.RoutineFQCUI) return window.RoutineFQCUI.html();
    const title = qualityViews[view]?.[1] || '總覽';
    const overview = view === 'quality-dashboard';
    return `<section class="page quality-page"><div class="quality-page-head"><p class="eyebrow">QUALITY MANAGEMENT SYSTEM</p><h2>${escapeHtml(title)}</h2><p>品質管理系統</p></div><section class="quality-workspace ${overview ? 'quality-overview' : ''}"><div><span aria-hidden="true">${overview ? '品' : '◇'}</span><h3>${escapeHtml(title)}</h3><p>${overview ? '品質管理系統基本框架' : '功能建置中'}</p></div></section></section>`;
  }

  function qualityDataPage(tab) {
    const title = qualityDataTabs[tab];
    if (tab === 'quality-fqc' && window.FQCMasterUI) return window.FQCMasterUI.html();
    if (tab === 'quality-iqc' && window.IQCMasterUI) return window.IQCMasterUI.html();
    if (tab === 'quality-ipqc-ab' && window.IPQCABUI) return window.IPQCABUI.html();
    if (tab === 'quality-ipqc-c' && window.IPQCCUI) return window.IPQCCUI.html();
    if (tab === 'quality-routine-equipment' && window.RoutineEquipmentUI) return window.RoutineEquipmentUI.html();
    if (tab === 'quality-mold-equipment' && window.ToolingUI) return window.ToolingUI.html();
    return `<section class="quality-data-workspace"><div><span aria-hidden="true">◇</span><h2>${escapeHtml(title)}</h2><p>功能建置中</p></div></section>`;
  }

  const baseRender = render;
  render = function () {
    if (qualityViews[state.view]) {
      root.innerHTML = qualityPage(state.view);
      if (state.view === 'quality-inspections') window.RoutineFQCUI?.mount?.(root);
      bindCommon();
    } else {
      baseRender();
    }
    decorateSystemShell();
    if (state.view === 'data') decorateDataTabs();
    window.ProcessI18n?.apply?.();
  };

  const baseNavigate = navigate;
  navigate = function (view) {
    if (qualityViews[view]) {
      if (!currentUser || currentUser.role === 'device') {
        toast('目前帳號沒有此功能權限');
        return;
      }
      rememberSystem('quality');
      state.view = view;
      document.querySelector('#eyebrow').textContent = qualityViews[view][0];
      document.querySelector('#page-title').textContent = qualityViews[view][1];
      document.querySelector('.sidebar').classList.remove('open');
      render();
      return;
    }
    baseNavigate(view);
  };

  function go(view, push = true) {
    navigate(view);
    if (state.view === view && push) writeRoute(view);
  }

  function navButton(view, icon, label, _group = '') {
    const allowed = qualityViews[view] ? (currentUser && currentUser.role !== 'device') : canView(view);
    return `<button class="nav-item ${state.view === view ? 'active' : ''}" data-view="${view}" data-dual-view="${view}" ${allowed ? '' : 'disabled aria-disabled="true" title="目前帳號沒有此功能權限"'}><span>${icon}</span>${label}</button>`;
  }

  const baseCanView = typeof canView === 'function' ? canView : () => true;
  canView = function (view) {
    if (qualityViews[view]) return !!(currentUser && currentUser.role !== 'device');
    return baseCanView(view);
  };

  const baseApplyPlatformIdentity = typeof applyPlatformIdentity === 'function' ? applyPlatformIdentity : null;
  if (baseApplyPlatformIdentity) {
    applyPlatformIdentity = function () {
      baseApplyPlatformIdentity();
      decorateSystemShell();
    };
  }

  window.addEventListener('process-shared-state-updated', () => {
    decorateSystemShell();
  });

  function decorateSystemShell() {
    if (!currentUser) return;
    const sidebar = document.querySelector('.sidebar'), nav = document.querySelector('#main-nav');
    if (!sidebar || !nav) return;
    document.body.classList.toggle('quality-system', activeSystem === 'quality');
    const brand = sidebar.querySelector('.brand');
    if (brand) brand.innerHTML = activeSystem === 'quality'
      ? '<div class="brand-mark">品</div><div><strong>品質管理</strong><span>QUALITY OS</span></div>'
      : '<div class="brand-mark">製</div><div><strong>製程中控</strong><span>PROCESS OS</span></div>';
    const primary = activeSystem === 'quality'
      ? [
          navButton('quality-dashboard', '▦', '總覽'),
          navButton('quality-search', '⌕', '標準搜尋'),
          navButton('quality-reports', '▤', '品質報告'),
          navButton('quality-inspections', '✓', '例行檢查'),
          navButton('quality-fpy', '↗', 'FPY'),
        ].join('')
      : [
          navButton('dashboard', '▦', '總覽'),
          navButton('player', '▶', '產線播放台'),
          navButton('dispatch', '↗', '發送介面'),
          navButton('productStatus', '▣', '產品製程狀態'),
        ].join('');
    nav.innerHTML = `<div class="system-primary-nav">${primary}</div><div class="shared-nav-panel">${navButton('approval', '✓', '版本確認平台', 'shared')}${navButton('editor', '◇', '製程編輯台', 'shared')}${navButton('data', '▤', '資料後台', 'shared')}</div>`;
    nav.querySelectorAll('[data-dual-view]:not(:disabled)').forEach(button => {
      button.onclick = () => go(button.dataset.dualView);
    });
    let switcher = sidebar.querySelector('.system-switcher');
    if (currentUser.role === 'device') {
      switcher?.remove();
    } else {
      if (!switcher) {
        switcher = document.createElement('button');
        switcher.type = 'button';
        switcher.className = 'system-switcher';
        sidebar.querySelector('.sidebar-foot')?.before(switcher);
      }
      switcher.textContent = activeSystem === 'quality' ? '切換至中控系統' : '切換至品質系統';
      switcher.onclick = () => {
        rememberSystem(activeSystem === 'quality' ? 'process' : 'quality');
        go(activeSystem === 'quality' ? 'quality-dashboard' : 'dashboard');
      };
    }
  }

  function renderQualityDataTab(tab, push = false) {
    if (!qualityDataTabs[tab]) return false;
    state.dataTab = tab;
    const content = document.querySelector('#data-content');
    if (!content) return false;
    content.dataset.activeTab = tab;
    content.innerHTML = qualityDataPage(tab);
    if (tab === 'quality-fqc') window.FQCMasterUI?.bind?.(content);
    if (tab === 'quality-iqc') window.IQCMasterUI?.mount?.(content);
    if (tab === 'quality-ipqc-ab') window.IPQCABUI?.mount?.(content);
    if (tab === 'quality-ipqc-c') window.IPQCCUI?.mount?.(content);
    if (tab === 'quality-routine-equipment') window.RoutineEquipmentUI?.mount?.(content);
    if (tab === 'quality-mold-equipment') window.ToolingUI?.mount?.(content);
    document.querySelectorAll('.master-tabs .tab').forEach(button => {
      const value = button.dataset.qualityTab || button.dataset.masterScope || button.dataset.tab;
      button.classList.toggle('active', value === tab);
      button.setAttribute('aria-selected', String(value === tab));
    });
    if (push) {
      const url = routeUrl('data');
      url.searchParams.set('dataTab', tab);
      history.pushState({ ...history.state, system: activeSystem, view: 'data', dataTab: tab }, '', url);
    }
    window.ProcessI18n?.apply?.();
    return true;
  }

  function decorateDataTabs() {
    const tabs = document.querySelector('.master-tabs');
    if (!tabs || tabs.closest('.data-system-sections')) return;
    const parent = tabs.parentElement;
    const sections = document.createElement('div');
    sections.className = 'data-system-sections';
    const processSection = document.createElement('section');
    processSection.className = 'data-tab-section process-data-tabs';
    processSection.innerHTML = '<h2>中控系統</h2>';
    const processTabs = document.createElement('div');
    processTabs.className = 'tabs master-tabs';
    [...tabs.children].forEach(button => processTabs.append(button));
    processSection.append(processTabs);
    const qualitySection = document.createElement('section');
    qualitySection.className = 'data-tab-section quality-data-tabs';
    qualitySection.innerHTML = `<h2>品質系統</h2><div class="tabs master-tabs">${Object.entries(qualityDataTabs).map(([tab, label]) => `<button class="tab master-tab" data-quality-tab="${tab}">${label}</button>`).join('')}</div>`;
    sections.append(processSection, qualitySection);
    tabs.remove();
    parent.prepend(sections);
    sections.querySelectorAll('[data-quality-tab]').forEach(button => {
      button.onclick = () => renderQualityDataTab(button.dataset.qualityTab, true);
    });
    const requested = new URL(location.href).searchParams.get('dataTab');
    if (qualityDataTabs[state.dataTab]) renderQualityDataTab(state.dataTab);
    else if (qualityDataTabs[requested]) renderQualityDataTab(requested);
  }

  const baseRenderLogin = renderLogin;
  renderLogin = function () {
    baseRenderLogin();
    const demo = document.querySelector('.demo-identities');
    if (!demo) return;
    const chooser = document.createElement('section');
    chooser.className = 'system-login-choice';
    chooser.innerHTML = `<h2>選擇系統</h2><div><button type="button" data-login-system="process"><span>製程中控系統</span><b aria-hidden="true">✓</b></button><button type="button" data-login-system="quality"><span>品質管理系統</span><b aria-hidden="true">✓</b></button></div>`;
    demo.before(chooser);
    const paint = () => {
      chooser.querySelectorAll('[data-login-system]').forEach(button => {
        const selected = button.dataset.loginSystem === activeSystem;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      const submit = document.querySelector('#login-submit');
      if (submit) submit.textContent = activeSystem === 'quality' ? '登入品質系統' : '登入中控系統';
    };
    chooser.querySelectorAll('[data-login-system]').forEach(button => {
      button.onclick = () => {
        rememberSystem(button.dataset.loginSystem);
        paint();
        window.ProcessI18n?.apply?.();
      };
    });
    const deviceButton = document.querySelector('#device-entry-button');
    if (deviceButton) {
      const enterDevice = deviceButton.onclick;
      deviceButton.onclick = event => {
        rememberSystem('process');
        enterDevice?.call(deviceButton, event);
      };
    }
    paint();
    window.ProcessI18n?.apply?.();
  };

  const baseEnterPlatform = enterPlatform;
  enterPlatform = function (user) {
    const destination = activeSystem === 'quality' && user.role !== 'device'
      ? 'quality-dashboard'
      : user.role === 'device'
        ? 'player'
        : 'dashboard';
    if (user.role === 'device') rememberSystem('process');
    baseEnterPlatform(user);
    go(destination, false);
    writeRoute(destination, true);
  };

  window.addEventListener('popstate', () => {
    if (!currentUser) return;
    const url = new URL(location.href), system = url.searchParams.get('system');
    rememberSystem(system === 'quality' ? 'quality' : 'process');
    const requested = url.searchParams.get('view');
    const fallback = activeSystem === 'quality' ? 'quality-dashboard' : 'dashboard';
    const view = qualityViews[requested] || titles[requested] ? requested : fallback;
    navigate(view);
    if (view === 'data') {
      const dataTab = url.searchParams.get('dataTab');
      if (qualityDataTabs[dataTab]) {
        decorateDataTabs();
        renderQualityDataTab(dataTab);
      }
    }
  });

  window.ProcessDualSystem = {
    get activeSystem() { return activeSystem; },
    qualityViews,
    qualityDataTabs,
    go,
    renderQualityDataTab,
    decorateDataTabs,
  };

  if (currentUser) {
    const url = new URL(location.href), requested = url.searchParams.get('view');
    const initial = qualityViews[requested]
      ? requested
      : requested === 'data' && canView('data')
        ? 'data'
      : requested === 'approval' && canView('approval')
        ? 'approval'
      : requested === 'editor' && canView('editor')
        ? 'editor'
      : activeSystem === 'quality'
        ? 'quality-dashboard'
        : canView(requested)
          ? requested
          : state.view;
    go(initial, false);
    writeRoute(initial, true);
  } else {
    renderLogin();
  }
})();
