/* Routine inspection owns one shared draft per document; never writes public state. */
(() => {
  const endpoint = '/api/routine-fqc',
    clone = (x) => JSON.parse(JSON.stringify(x)),
    id = () => crypto.randomUUID();
  const h = (x) =>
    String(x ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c],
    );
  const t = (zh, vi) => (document.documentElement.lang === 'vi' ? vi : zh);
  const labels = {
    pass: ['合格', 'Đạt'],
    fail: ['不合格', 'Không đạt'],
    unable: ['無法測試', 'Không thể thử'],
    undetermined: ['無法判定', 'Chưa xác định'],
    draft: ['草稿', 'Bản nháp'],
    pending: ['待審核', 'Chờ duyệt'],
    approved: ['正式核准', 'Đã duyệt'],
    cancelled: ['已捨棄', 'Đã bỏ'],
    open: ['待改善', 'Chờ cải thiện'],
    retest: ['複測中', 'Đang thử lại'],
    'ready-close': ['待確認結案', 'Chờ đóng hồ sơ'],
    closed: ['已結案', 'Đã đóng'],
    disposed: ['不合格・處置結案', 'Không đạt · Đóng xử lý'],
    waived: ['本期免做', 'Miễn kỳ này'],
    plan: ['檢查計畫', 'Kế hoạch'],
    report: ['檢查報告', 'Báo cáo'],
    waiver: ['免做申請', 'Đề nghị miễn'],
    disposal: ['處置申請', 'Đề nghị xử lý'],
  };
  const label = (k) => (labels[k] ? t(...labels[k]) : k),
    tag = (k) => `<span class="rf-tag ${h(k)}">${h(label(k))}</span>`;
  Object.assign(labels, {
    unassigned: ['尚未安排', 'Chưa lập kế hoạch'],
    'correction-reopened': [
      '更正後重新確認結案',
      'Xác nhận đóng lại sau chỉnh sửa',
    ],
    unclosed: ['尚未結案', 'Chưa đóng'],
    'closed-failure': ['已結案的不合格紀錄', 'Lịch sử không đạt đã đóng'],
    correct: ['建立更正', 'Tạo bản sửa'],
    'revoke-plan': ['反確認計畫', 'Thu hồi xác nhận kế hoạch'],
    'resolve-impact': ['確認下游影響', 'Xác nhận ảnh hưởng'],
    close: ['確認結案', 'Xác nhận đóng'],
    improve: ['改善紀錄', 'Ghi cải thiện'],
    improvement: ['改善紀錄', 'Ghi cải thiện'],
    'retest-plan-approved': ['補測計畫核准', 'Kế hoạch thử bổ sung đã duyệt'],
  });
  const status = (d) =>
    d.cancelled ? 'cancelled' : d.flow.pendingId
      ? 'pending'
      : d.flow.active.id && !d.reopened
        ? 'approved'
        : 'draft';
  const content = (d) =>
    d.flow.pendingId
      ? d.flow.cases.find((c) => c.id === d.flow.pendingId).content
      : status(d) === 'approved' || d.cancelled?.status === 'approved'
        ? d.flow.active.content
        : d.flow.working;
  const photo = (p) =>
    `<a class="rf-photo" href="${endpoint}/photo?id=${h(p)}" target="_blank" rel="noopener"><img loading="lazy" src="${endpoint}/photo?id=${h(p)}" alt="${h(t('檢查照片', 'Ảnh kiểm tra'))}"></a>`;
  const s = {
    tab: 'jobs',
    module: 'FQC',
    selected: null,
    checked: new Set(),
    query: '',
    line: '',
    category: '',
    item: '',
    outcome: '',
    review: '',
    caseState: '',
    highlight: '',
    from: '',
    to: '',
    dateMode: 'period',
    buffers: new Map(),
    bases: new Map(),
    issues: [],
    busy: false,
    error: '',
    client: id(),
    seq: 0,
    scroll: 0,
    selectionNotice: '',
    reviewPlatform: false,
    reviewModule: 'FQC',
    documentKind: '',
    workState: '',
    sampleOpen: new Map(),
    resultOpen: new Map(),
    selfReview: null,
    cancelConfirm: null,
  };
  let root,
    data,
    loading = false;
  const btn = (action, text, disabled = false, extra = '') =>
    `<button type="button" class="rf-btn ${extra}" data-action="${action}" ${disabled ? 'disabled' : ''}>${text}</button>`;
  function html() {
    return '<section id="routine-fqc-root" class="rf-app" data-i18n-skip="true"><div class="rf-empty" role="status">FQC · 載入中 / Đang tải…</div></section>';
  }
  async function read(query = '') {
    const r = await fetch(endpoint + query, { cache: 'no-store' }),
      v = await r.json();
    if (!r.ok) throw Error(v.error || 'FQC_READ_FAILED');
    return v;
  }
  const issueNames = {
    IMPROVEMENT_REQUIRED: ['請先記錄本次不合格的改善措施，再建立複測。','Ghi cải thiện cho lần không đạt này trước khi tạo thử lại.'],
    FOLLOWUP_OPEN: ['已有後續草稿或待審文件；請接續原文件，避免重複建立。','Có hồ sơ tiếp theo dạng nháp hoặc chờ duyệt; tiếp tục hồ sơ hiện có.'],
    JOB_ALREADY_ASSIGNED: [
      '項目已由其他人安排或完成；清單已更新，請接續原計畫。',
      'Hạng mục đã được lập kế hoạch hoặc hoàn thành; danh sách đã cập nhật. Tiếp tục kế hoạch gốc.',
    ],
    CASE_LINK_REQUIRED: [
      '此文件缺少原異常案件連結，請從原案件建立更正。',
      'Hồ sơ thiếu liên kết bất thường gốc. Tạo bản sửa từ hồ sơ gốc.',
    ],
    CASE_LINK_INVALID: [
      '原異常案件或項目連結不一致，請重新開啟原案件。',
      'Liên kết bất thường hoặc hạng mục không khớp. Mở lại hồ sơ gốc.',
    ],
    CASE_CHANGED_USE_CURRENT_FLOW: [
      '案件已有後續變更，請從目前狀態處理。',
      'Hồ sơ đã thay đổi tiếp theo; xử lý từ trạng thái hiện tại.',
    ],
    OPEN_FAILURE_REQUIRES_RETEST_OR_DISPOSAL: [
      '原不合格樣品仍未驗證通過，請補測或申請處置結案，不能免做。',
      'Mẫu không đạt chưa được xác minh đạt. Thử bổ sung hoặc đề nghị xử lý; không được miễn.',
    ],
    UPLOADED_PHOTO_REQUIRED: [
      '請成功上傳至少一張照片',
      'Tải thành công ít nhất một ảnh',
    ],
    EXPLANATION_REQUIRED: ['請填寫問題說明／原因', 'Nhập mô tả vấn đề / lý do'],
    SAMPLES_REQUIRED: [
      '請選擇該項目的實測樣品',
      'Chọn mẫu thực thử của hạng mục',
    ],
    ACTUAL_RESULT_REQUIRED: ['請填寫實測結果', 'Nhập kết quả thực tế'],
    RESULT_REQUIRED: ['請選擇檢查結果', 'Chọn kết quả kiểm tra'],
    SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE: ['樣品超出範圍或重複；同一項目各結果列不可選同一樣品。', 'Mẫu ngoài phạm vi hoặc trùng; không chọn cùng mẫu ở các dòng của một hạng mục.'],
    SINGLE_SAMPLE_REQUIRED: ['每列只能選一個實測樣品。','Mỗi dòng chỉ chọn một mẫu thực thử.'],
    RETEST_SAMPLE_FIXED: ['複測只能使用原報告固定的樣品。','Chỉ dùng mẫu gốc cố định khi thử lại.'],
    RETEST_REQUIRED_SAMPLES: [
      '複測須涵蓋上次未通過的樣品',
      'Thử lại phải gồm mẫu chưa đạt lần trước',
    ],
    TITLE_REQUIRED: ['請填文件名稱', 'Nhập tên hồ sơ'],
    DATE_REQUIRED: ['請填有效日期', 'Nhập ngày hợp lệ'],
    REASON_REQUIRED: ['請填原因', 'Nhập lý do'],
    DISPOSITION_REQUIRED: ['請填處置內容', 'Nhập nội dung xử lý'],
    EVIDENCE_REQUIRED: ['請上傳處置證據', 'Tải bằng chứng xử lý'],
    PHOTO_NOT_UPLOADED: ['照片尚未成功保存，請重新上傳', 'Ảnh chưa được lưu thành công; tải lại'],
  };
  function caseForLine(d, l) {
    return data.control.cases.find((a) => a.jobId === l.jobId && (d.caseId ? a.id === d.caseId : d.correctionOf && a.reportIds.includes(d.correctionOf)));
  }
  function requiredForLine(d, l) {
    return [...new Set([...(l.requiredSamples || []), ...(caseForLine(d, l)?.requiredSamples || [])])];
  }
  function sampleNames(l, samples) {
    return samples.map((code) => code + (l.source.products.find((p) => p.code === code)?.name ? ' · ' + l.source.products.find((p) => p.code === code).name : '')).join(' / ');
  }
  function issueText(issue) {
    const ids = (issue.path || []).filter((p) => p && typeof p === 'object').map((p) => p.id),
      d = doc(), line = (s.buffers.get(d?.id) || d?.flow.working)?.lines.find((l) => l.id === ids[0]),
      row = line?.results.findIndex((r) => r.id === ids[1]);
    const prefix = line ? line.source.name + (row >= 0 ? ' · ' + t('結果列', 'Dòng kết quả') + ' ' + (row + 1) : '') + '：' : '';
    if (issue.message === 'RETEST_REQUIRED_SAMPLES' && line) {
      const missing = requiredForLine(d, line).filter((code) => !line.results.flatMap((r) => r.samples).includes(code));
      return prefix + t('尚未涵蓋上次未通過樣品：', 'Chưa bao gồm mẫu chưa đạt lần trước: ') + sampleNames(line, missing) + t('。請在此項目建立複測結果列，再填本次結果。', '. Tạo dòng thử lại của hạng mục rồi nhập kết quả lần này.');
    }
    return prefix + (issueNames[issue.message] ? t(...issueNames[issue.message]) : issue.message || issue.code);
  }
  function fault(e) {
    s.error =
      e.message === 'VALIDATION_FAILED'
        ? t(
            '無法送審：請完成下方標示的必要內容。原輸入及已存草稿保留。',
            'Không thể gửi duyệt: bổ sung các mục bên dưới. Giữ dữ liệu nhập và bản đã lưu.',
          )
        : (issueNames[e.message] ? t(...issueNames[e.message]) : e.message) ||
          String(e);
    s.issues = e.details?.issues || e.details || [];
    if (!Array.isArray(s.issues)) s.issues = [];
    if (!s.issues.length && e.message !== 'VALIDATION_FAILED') s.issues = [{ message: s.error, path: [] }];
    paint();
  }
  async function post(command) {
    const body = { ...command, operationId: command.operationId || id() };
    let response, v;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      v = await response.json();
    } catch {
      try {
        const receipt = await read('?operationId=' + body.operationId);
        s.retry = null;
        return receipt.result;
      } catch {
        const err = Error(
          t(
            '寫入結果未知；輸入已保留。請重試相同操作。',
            'Chưa rõ kết quả ghi; dữ liệu nhập được giữ lại. Thử lại cùng thao tác.',
          ),
        );
        s.retry = body;
        throw err;
      }
    }
    if (!response.ok) {
      const e = Error(v.error || 'FQC_WRITE_FAILED');
      e.details = v.details;
      throw e;
    }
    s.retry = null;
    return v.result || v;
  }
  async function refresh(generate = false) {
    const next = await read();
    // A read started before a review/cancellation may finish after a newer read.
    // Never publish that older aggregate into the active document or checklist.
    if (data && next.identity.id === data.identity.id && next.control.revision < data.control.revision) return;
    if (data && next.identity.id !== data.identity.id) {
      s.buffers.clear();
      s.bases.clear();
      s.selected = null;
    }
    data = next;
    reconcileSelection();
    if (generate && s.tab !== 'history' && data.permissions.edit && data.control.startDate) {
      await post({ action: 'generate' });
      const generated = await read();
      if (generated.control.revision >= data.control.revision) data = generated;
    }
    s.error = '';
    s.issues = [];
    paint();
  }
  let historySearch, historyLanguage, pendingHistoryItem;
  async function ensureHistorySearch() {
    if (!historySearch) {
      const workflowModule = await import('/process/routine-fqc-search.mjs?v=20261013');
      historySearch = workflowModule.createHistorySearch({getData: () => data, readPreview: () => read('?search-preview=1')});
    }
  }
  async function mount(container, historyMode = false) {
    s.reviewPlatform = false;
    root = container.matches?.('#routine-fqc-root')
      ? container
      : container.querySelector('#routine-fqc-root');
    if (!root) return;
    if (historyMode) s.tab = 'history';
    if (loading) return;
    loading = true;
    try {
      const a = await read('?availability=1');
      if (!a.enabled) {
        root.innerHTML = `<div class="rf-empty"><b>${t('例行檢查準備中', 'Đang chuẩn bị kiểm tra định kỳ')}</b>${t('3040 完成驗收後啟用', 'Kích hoạt sau nghiệm thu 3040')}</div>`;
        return;
      }
      await ensureHistorySearch();
      await refresh(true);
    } catch (e) {
      fault(e);
    } finally {
      loading = false;
    }
  }
  const docs = () => data?.control.documents || [],
    doc = () => docs().find((d) => d.id === s.selected),
    selectedCase = () => data?.control.cases.find((a) => a.id === s.selected);
  const liveDocs = () => docs().filter((d) => !d.cancelled);
  function primaryDocuments() {
    return liveDocs().filter((d) => (d.kind !== 'plan' || d.caseId || data.control.jobs.some((j) => liveDocs().some((p) => p.id === j.planId && p.familyId === d.familyId))) && !liveDocs().some((o) => o.kind === d.kind && o.familyId === d.familyId && o.id !== d.id && o.createdAt > d.createdAt));
  }
  const reportSlots = (d) => d.reportAvailability || [];
  const documentTab = (d) => d.cancelled ? 'history' : d.kind === 'plan' ? 'plans' : 'reports';
  function reconcileSelection() {
    const removed = [];
    for (const key of s.checked) {
      const job = data.control.jobs.find((j) => j.id === key);
      if (!job || job.planId || job.completion || !data.permissions.edit) {
        s.checked.delete(key);
        removed.push(job?.source.name || key);
      }
    }
    if (removed.length)
      s.selectionNotice =
        t(
          '以下項目已安排或完成，已移出勾選：',
          'Đã bỏ chọn các hạng mục được lập kế hoạch / hoàn thành: ',
        ) + removed.join(' / ');
  }
  // Keep snapshots until after scoping: the same item can have several names
  // or categories over time. Current formal data wins only within its scope.
  const filterSources = () => [
    ...data.sources.map((v) => ({ ...v, historical: false })),
    ...data.control.jobs
      .slice()
      .reverse()
      .map((j) => ({
        ...j.source,
        historical: true,
      })),
  ];
  const withinScope = (v) =>
    (!s.line || v.line === s.line) &&
    (!s.category || v.category === s.category);
  function itemOptions(sources) {
    const candidates = new Map();
    for (const source of sources.filter(withinScope)) {
      if (!candidates.has(source.id)) candidates.set(source.id, source);
    }
    return [...candidates.values()];
  }
  function buffer(d) {
    if (!s.buffers.has(d.id)) {
      s.buffers.set(d.id, clone(d.flow.working));
      s.bases.set(d.id, clone(d.flow.working));
    }
    const working = s.buffers.get(d.id);
    if (d.kind === 'report' && status(d) === 'draft') for (const line of working.lines) {
      const required = requiredForLine(d,line);
      const used = new Set(line.results.flatMap(r => r.samples));
      for (const row of line.results) if (!row.samples.length && row.outcome !== 'unable') {
        const original = required.find(code => !used.has(code));
        if (original) { row.samples = [original]; used.add(original); }
      }
    }
    return working;
  }
  function dirty(d) {
    return (
      s.buffers.has(d.id) &&
      JSON.stringify(s.buffers.get(d.id)) !== JSON.stringify(s.bases.get(d.id))
    );
  }
  const done = (a) => ['closed', 'disposed', 'waived'].includes(a.status);
  const caseMatches = (a) =>
    !s.caseState ||
    (s.caseState === 'unclosed' && !done(a)) ||
    (s.caseState === 'closed-failure' && done(a)) ||
    s.caseState === a.status;
  function caseVisible(a) {
    return (
      caseMatches(a) &&
      a.reportIds.some((id) => {
        const d = docs().find((d) => d.id === id);
        return (
          d &&
          matches(
            content(d).lines.filter((l) => l.jobId === a.jobId),
            { ...d, number: d.number + ' ' + a.number },
          )
        );
      })
    );
  }
  function frequencyNotice() {
    const items = data.sources.filter((i) => !i.frequency);
    return items.length
      ? `<details class="rf-notice"><summary>${t('待確認頻率', 'Cần xác nhận tần suất')} · ${items.length}</summary>${items.map((i) => `<p>${h(i.name + ' · ' + i.frequencyText)}</p>`).join('')}<p>${t('請於原 FQC 標準確認頻率後送審；不推算日期。', 'Xác nhận tần suất trong tiêu chuẩn FQC rồi gửi duyệt; không suy đoán ngày.')}</p></details>`
      : '';
  }
  const highlightLabel = (key) => ({
    jobs: t('尚待完成', 'Chưa hoàn thành'), documents: t('待審核', 'Chờ duyệt'),
    cases: t('異常未結案', 'Bất thường chưa đóng'), overdue: t('已逾期', 'Quá hạn'),
    fail: t('不合格', 'Không đạt'), open: t('未結案', 'Chưa đóng'),
    'closed-fail': t('已結案的不合格', 'Không đạt đã đóng'),
  })[key] || '';
  const highlightTone = () => s.highlight === 'jobs' ? 'blue' : s.highlight === 'documents' ? 'amber' : 'red';
  function caseFailed(a) {
    return a.result === 'fail' || a.unresolvedFailureSamples?.length > 0 || a.reportIds.some((key) => docs().find((d) => d.id === key)?.flow.active.content?.lines.some((l) => l.jobId === a.jobId && l.results.some((r) => r.outcome === 'fail')));
  }
  function highlighted(job, item) {
    const cases = data.control.cases.filter((a) => a.jobId === job?.id);
    if (s.highlight === 'jobs') return !!job && !job.completion;
    if (s.highlight === 'overdue') return !!job && !job.completion && job.end < data.today;
    if (s.highlight === 'documents') return item?.flow ? status(item) === 'pending' : liveDocs().some((d) => status(d) === 'pending' && content(d).lines.some((l) => l.jobId === job?.id));
    if (['cases', 'open'].includes(s.highlight)) return item?.reportIds ? !done(item) : cases.some((a) => !done(a));
    if (s.highlight === 'closed-fail') return item?.reportIds ? done(item) && caseFailed(item) : cases.some((a) => done(a) && caseFailed(a));
    return s.highlight === 'fail' && (item?.reportIds ? caseFailed(item) : !!job && jobSummary(job).results.some((r) => r.outcome === 'fail'));
  }
  function rowMark(job, item) {
    return s.highlight && highlighted(job, item) ? ' data-highlight="' + highlightTone() + '"' : '';
  }
  function markBadge(job, item) {
    return s.highlight && highlighted(job, item) ? '<span class="rf-mark-badge" data-tone="' + highlightTone() + '">' + h(highlightLabel(s.highlight)) + '</span>' : '';
  }
  function toggleHighlight(key, tab) {
    s.highlight = s.highlight === key ? '' : key;
    s.tab = tab; s.selected = null; s.cancelConfirm = null;
    s.review = ''; s.caseState = ''; s.outcome = ''; s.overdue = false;
    s.workState = ''; s.documentKind = '';
    paint();
  }
  function quickFilters() {
    return '<div class="rf-actions rf-mark-controls">' + ['fail', 'open', 'closed-fail'].map((key) => '<button type="button" class="rf-btn" data-action="filter-' + key + '" data-tone="red" aria-pressed="' + (s.highlight === key) + '">' + h(highlightLabel(key)) + '</button>').join('') + '</div>' + (s.highlight ? '<p class="rf-mark-legend" data-tone="' + highlightTone() + '" role="status">' + h(highlightLabel(s.highlight)) + ' · ' + t('同色項目已標記；其他項目保留，再點一次取消。搜尋條件仍適用。', 'Đánh dấu mục cùng màu; giữ các mục khác, bấm lại để bỏ. Vẫn áp dụng điều kiện tìm kiếm.') + '</p>' : '');
  }
  const searchText = (l) =>
    [
      l.source.name,
      l.source.code,
      l.source.errorCode,
      ...l.source.products.flatMap((p) => [p.code, p.name]),
    ]
      .join(' ')
      .toLowerCase();
  function matches(lines, d) {
    const q = s.query.trim().toLowerCase();
    return lines.some(
      (l) =>
        (!s.line || l.source.line === s.line) &&
        (!s.category || l.source.category === s.category) &&
        (!s.item || l.source.id === s.item) &&
        (!q ||
          searchText(l).includes(q) ||
          [d?.number, d ? displayNumber(d) : null, d?.flow?.working?.title]
            .join(' ')
            .toLowerCase()
            .includes(q)) &&
        (!s.outcome || l.results?.some((r) => r.outcome === s.outcome)) &&
        (!s.from ||
          ((s.dateMode === 'actual'
            ? d
              ? content(d).date
              : ''
            : data.control.jobs.find((j) => j.id === l.jobId)?.end) || '') >=
            s.from) &&
        (!s.to ||
          ((s.dateMode === 'actual'
            ? d
              ? content(d).date
              : ''
            : data.control.jobs.find((j) => j.id === l.jobId)?.start) || '') <=
            s.to),
    );
  }
  function filters() {
    const sources = filterSources(),
      catalog = data.catalog || { lines: [], categories: [] },
      categories = [
        ...catalog.categories,
        ...sources.map((v) => ({ name: v.category, line: v.line })),
      ],
      options = itemOptions(sources),
      selectedSource = sources.find((v) => v.id === s.item) || catalog.items?.find((v) => v.id === s.item);
    const select = (key, title, values) =>
      `<label>${title}<select data-filter="${String(key)}"><option value="">${t('全部', 'Tất cả')}</option>${[
        ...new Set(values),
      ]
        .filter(Boolean)
        .map(
          (v) =>
            `<option ${s[key] === v ? 'selected' : ''} value="${h(v)}">${h(v)}</option>`,
        )
        .join('')}</select></label>`;
    return `<div class="rf-toolbar"><label class="rf-query">${t('產品、錯誤代碼、項目或編號', 'Sản phẩm, mã lỗi, hạng mục, số hồ sơ')}<input data-filter="query" value="${h(s.query)}" placeholder="${t('搜尋涵蓋產品及歷史快照…', 'Tìm sản phẩm và bản chụp lịch sử…')}"></label>${select(
      'line',
      t('線別', 'Chuyền'),
      [...catalog.lines, ...sources.map((v) => v.line)].sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }),
    )}${select(
      'category',
      t('類別', 'Loại'),
      categories
        .filter((v) => !s.line || v.line === s.line)
        .map((v) => v.name)
        .sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }),
    )}<label>${t('檢查項目', 'Hạng mục')}<select data-filter="item"><option value="">${s.line || s.category ? t('所選範圍全部項目', 'Tất cả trong phạm vi') : t('跨線全部項目', 'Tất cả chuyền')}</option>${s.item && !options.some((v) => v.id === s.item) ? `<option value="${h(s.item)}" selected>${h([selectedSource?.name, selectedSource?.code, t('目前清單外的回查項目；可選全部解除', 'Hạng mục tra cứu ngoài danh sách hiện tại; chọn tất cả để bỏ lọc')].filter(Boolean).join(' · '))}</option>` : ''}${options
      .map(
        (v) =>
          `<option value="${h(v.id)}" ${s.item === v.id ? 'selected' : ''}>${h(v.name + ' · ' + v.line + ' · ' + v.category + ' · ' + v.errorCode + ' · ' + v.code + (v.historical ? t(' · 歷史版本', ' · Phiên bản lịch sử') : ''))}</option>`,
      )
      .join(
        '',
      )}</select></label></div>${sourceNotice()}<details class="rf-advanced"><summary>${t('結果、審核、異常與日期篩選', 'Lọc kết quả, phê duyệt, bất thường và ngày')}</summary><div class="rf-toolbar">${[
      ['outcome', Object.keys(labels).slice(0, 4)],
      ['review', ['draft', 'pending', 'approved']],
      [
        'caseState',
        [
          'unclosed',
          'closed-failure',
          'open',
          'retest',
          'ready-close',
          'closed',
          'disposed',
          'waived',
        ],
      ],
    ]
      .map(
        ([key, values]) =>
          `<label>${t('狀態', 'Trạng thái')}<select data-filter="${String(key)}"><option value="">${t('全部', 'Tất cả')}</option>${values.map((v) => `<option value="${v}" ${s[key] === v ? 'selected' : ''}>${label(v)}</option>`).join('')}</select></label>`,
      )
      .join(
        '',
      )}<label>${t('日期類型', 'Loại ngày')}<select data-filter="dateMode"><option value="period" ${s.dateMode === 'period' ? 'selected' : ''}>${t('應檢期別', 'Kỳ kiểm tra')}</option><option value="actual" ${s.dateMode === 'actual' ? 'selected' : ''}>${t('實際檢查日', 'Ngày kiểm tra')}</option></select></label><label>${t('從', 'Từ')}<input type="date" data-filter="from" value="${h(s.from)}"></label><label>${t('至', 'Đến')}<input type="date" data-filter="to" value="${h(s.to)}"></label>${btn('clear-filter', t('清除篩選', 'Xóa bộ lọc'))}</div></details>`;
  }
  function sourceNotice() {
    if (!data.catalog) return '';
    const items = data.catalog.items.filter(withinScope),
      sources = data.sources.filter(withinScope),
      ready = sources.filter((v) => v.frequency).length,
      unresolved = sources.filter((v) => !v.frequency).length,
      disabled = items.filter((v) => !v.enabled).length,
      other = items.filter(
        (v) =>
          v.enabled &&
          v.cadence !== 'time' &&
          v.cadence !== 'pending_confirmation',
      ).length;
    return `<p class="rf-source-summary">${t('FQC正式版本', 'Tiêu chuẩn FQC đã duyệt')} ${h(data.catalog.version || '—')} · ${t('可排程時間項目', 'Hạng mục định kỳ')} ${ready} · ${t('非定期', 'Không định kỳ')} ${other} · ${t('停用', 'Đã tắt')} ${disabled} · ${t('頻率待確認', 'Chờ xác nhận tần suất')} ${unresolved}${!ready ? `<br>${t('此範圍尚無可排程項目；請在FQC後台設定時間頻率並核准。既有歷史仍保留。', 'Phạm vi này chưa có hạng mục định kỳ. Thiết lập tần suất và duyệt tại tiêu chuẩn FQC. Giữ nguyên lịch sử.')}` : ''}</p>`;
  }
  function holdFilterView() {
    // Keep enough page height to restore the viewport after filtering a long detail.
    root.style.minHeight = Math.max(0, window.innerHeight - root.getBoundingClientRect().top) + 'px';
  }
  function preserveRoutineView() {
    const positions = ['.rf-scroll', '.rf-detail-panel', '.rf-detail'].map((selector) => {
      const node = root.querySelector(selector);
      return {selector, top:node?.scrollTop || 0, left:node?.scrollLeft || 0};
    });
    const ancestors = []; for (let node = root.parentElement; node; node = node.parentElement) ancestors.push({node, top:node.scrollTop, left:node.scrollLeft});
    const x = window.scrollX, y = window.scrollY;
    return () => {
      for (const old of positions) { const node = root.querySelector(old.selector); if (node) { node.scrollTop = old.top; node.scrollLeft = old.left; } }
      for (const old of ancestors) { old.node.scrollTop = old.top; old.node.scrollLeft = old.left; }
      window.scrollTo(x, y);
    };
  }
  function paint() {
    if (!root?.isConnected) return;
    for (const node of root.querySelectorAll('.rf-result[data-result-id]')) s.resultOpen.set(node.dataset.resultId,node.open);
    for (const node of root.querySelectorAll('.rf-samples[data-sample-key]')) s.sampleOpen.set(node.dataset.sampleKey,node.open);
    const restoreView = preserveRoutineView();
    if (!data) {
      root.innerHTML = `<div class="rf-notice error">${h(s.error)} ${btn('refresh', t('重試', 'Thử lại'))}</div>`;
      bind();
      return;
    }
    if (s.reviewPlatform) { paintReview(); restoreView(); return; }
    if (pendingHistoryItem && historySearch) { historySearch.openForItem(pendingHistoryItem); pendingHistoryItem = null; }
    if (s.tab === 'history' && s.module === 'FQC' && root.querySelector('.rf-history') && historySearch && (historyLanguage === document.documentElement.lang || historySearch.composing)) {
      historySearch.update(); restoreView(); return;
    }
    historyLanguage = document.documentElement.lang;
    const c = data.control,
      p = data.permissions,
      pending = docs().filter((d) => status(d) === 'pending').length,
      open = c.cases.filter((a) => !done(a)).length,
      overdue = c.jobs.filter(
        (j) => !j.completion && j.end < data.today,
      ).length;
    root.innerHTML = `<header class="rf-hero"><div><div class="rf-eyebrow">QUALITY ASSURANCE / ROUTINE INSPECTION</div><h2>${t('例行檢查 · FQC', 'Kiểm tra định kỳ · FQC')}</h2><p>${t('從排程、檢查到改善結案，每一筆都有依據。', 'Theo dõi lịch kiểm tra, kết quả và cải thiện đến khi đóng hồ sơ.')}</p></div>${btn('settings', t('⚙ 排程設定', '⚙ Lịch kiểm tra'), !p.settings, 'soft')}</header>${location.port === '3040' ? `<div class="rf-test">3040 · ${t('隔離測試環境 — 測試資料與日常資料分開', 'Môi trường thử nghiệm độc lập với dữ liệu hàng ngày')}</div>` : ''}<nav class="rf-modules">${['FQC', 'IQC', t('模具檢查', 'Kiểm tra khuôn'), t('檢具與測試設備校準', 'Hiệu chuẩn thiết bị')].map((m, i) => `<button data-module="${i}" class="${s.module === String(i) || (s.module === 'FQC' && i === 0) ? 'active' : ''}">${m}</button>`).join('')}</nav><div class="rf-main">${
      s.module !== 'FQC'
        ? `<div class="rf-empty"><span class="rf-icon">◇</span><b>${t('功能建置中', 'Đang xây dựng')}</b>${t('此入口尚未開始管理，原資料後台仍可使用。', 'Chưa bắt đầu quản lý; dữ liệu gốc vẫn sử dụng được.')}</div>`
        : `<nav class="rf-tabs">${[
            ['jobs', t('應檢清單', 'Lịch cần kiểm tra')],
            ['plans', t('檢查計畫', 'Kế hoạch kiểm tra')],
            ['reports', t('報告與申請', 'Báo cáo & đề nghị')],
            ['cases', t('異常追蹤', 'Theo dõi bất thường')],
            ['history', t('搜尋與歷史', 'Tìm kiếm & lịch sử')],
          ]
            .map(
              ([v, l]) =>
                `<button data-tab="${v}" class="${s.tab === v ? 'active' : ''}">${l}</button>`,
            )
            .join('')}</nav>${s.tab === 'history' && historySearch ? historySearch.html() : `<div class="rf-stats">${[
            [
              'jobs',
              t('尚待完成', 'Chưa hoàn thành'),
              c.jobs.filter((j) => !j.completion).length,
              'blue',
            ],
            ['documents', t('待審核', 'Chờ duyệt'), pending, 'amber'],
            ['cases', t('異常未結案', 'Bất thường chưa đóng'), open, 'red'],
            ['overdue', t('已逾期', 'Quá hạn'), overdue, 'red'],
          ]
            .map(
              ([a, l, n, tone]) =>
                `<button class="rf-stat" data-stat="${a}" data-tone="${tone}" aria-pressed="${s.highlight === a}"><span>${l}</span><strong>${n}</strong></button>`,
            )
            .join(
              '',
            )}</div>${!c.startDate ? `<div class="rf-notice">${t('尚未開始管理。設定管理起始日並預覽後，才會產生應檢工作。', 'Chưa bắt đầu quản lý. Thiết lập ngày bắt đầu và xem trước lịch.')} ${btn('settings', t('設定起始日', 'Thiết lập ngày'), !p.settings)}</div>` : ''}${s.error ? `<div class="rf-notice error" role="alert">${h(s.error)} ${s.retry ? btn('retry', t('查證／重試原操作', 'Kiểm tra / thử lại thao tác')) : ''}</div>` : ''}${frequencyNotice()}${quickFilters()}${filters()}<div class="rf-layout ${s.wide ? 'rf-wide' : ''} ${s.selected ? 'has-selection' : ''}"><section class="rf-panel rf-list-panel">${list()}</section><section class="rf-panel rf-detail-panel ${s.tab === 'jobs' && !s.selected ? 'rf-selection-panel' : ''}"><div class="rf-detail">${btn('back', t('← 返回清單', '← Về danh sách'), false, 'rf-back')}${detail()}</div></section></div><p class="rf-footer-note">Asia/Ho_Chi_Minh · ${t('涵蓋產品與實測樣品分開記錄。歷史以當次正式快照為準。', 'Sản phẩm bao phủ và mẫu thực thử được lưu riêng; lịch sử dùng bản chụp đã duyệt.')}</p>`}`
    }</div>`;
    bind();
    if (s.tab === 'history' && historySearch) historySearch.bind(root);
    else mountDraft();
    root.querySelectorAll('button').forEach((b) => {
      if (s.busy) b.disabled = true;
    });
    restoreView();
  }
  function mountDraft() {
    const d = doc();
    if (d && ['plans', 'reports', 'documents', 'history'].includes(s.tab)) {
      const pending = d.flow.cases.find((x) => x.id === d.flow.pendingId);
      const v = {
        id: pending?.id || d.flow.active.id || d.id,
        number: d.flow.cases.length || 1,
        status: status(d),
        history: d.flow.saves.map((a) => ({
          action: 'save',
          actorName: a.actor.name,
          at: a.at,
        })),
      };
      window.VersionDraftUI?.mount(root.querySelector('.rf-document'), {
        header: '.rf-draft-header',
        module: 'FQC · ' + reportLabel(d),
        scope: d.number,
        version: v,
        versions: [v],
        active: d.flow.active.id
          ? {
              number:
                d.flow.cases.filter((a) => a.status === 'approved').length || 1,
            }
          : null,
        flow: {
          ...d.flow,
          working: status(d) === 'draft' ? buffer(d) : d.flow.working,
        },
        actions: {
          save: '[data-action="save"]',
          submit: '[data-action="submit"]',
          review: '[data-action="review"]',
          withdraw: '[data-action="withdraw"]',
        },
        errors: '.rf-errors',
        missing: '.rf-missing',
        history: ['.rf-operation-log'],
        checked: { errors: true, missing: true },
      });
      const shell = root.querySelector('.rf-document .vd-shell');
      if (shell) {
        shell.classList.add('rf-compact-draft');
        const choice = shell.querySelector('.vd-choice'); if (choice && !choice.querySelector('select')) choice.remove();
        const meta = shell.querySelector('.vd-meta'), card = shell.querySelector('.vd-card');
        if (meta && card) { const details = document.createElement('details'), summary = document.createElement('summary'); details.className = 'rf-draft-meta'; summary.textContent = t('版本與儲存紀錄', 'Phiên bản và thông tin lưu'); details.append(summary, meta); card.querySelector('.vd-top')?.after(details); }
        for (const kind of ['errors', 'missing']) {
          const section = shell.querySelector('.vd-' + kind), count = section?.querySelectorAll('.rf-issue-row').length || 0;
          if (section) { section.classList.toggle('rf-no-issues', !count); section.querySelector('h3')?.append(document.createTextNode(' · ' + count)); }
        }
      }
      const discard = root.querySelector('.rf-document > .rf-actions [data-action="discard"]');
      if (discard) root.querySelector('.vd-actions')?.append(discard);
      const withdraw = root.querySelector('[data-action="withdraw"]');
      if (withdraw) withdraw.textContent = t('撤回送審', 'Rút hồ sơ gửi duyệt');
      if (s.reviewPlatform) root.querySelector('[data-action="review"]')?.remove();
    }
  }
  function planReportState(d,jobId) {
    const slots = reportSlots(d).filter((a) => !jobId || a.jobId === jobId);
    return {available:slots.filter((a) => a.assigned && !a.reportIds.length).length,
      related:[...new Map(slots.flatMap((a) => a.reportIds).map(preferredReport).filter(Boolean).map((r) => [r.id,r])).values()]};
  }
  function jumpListGroup(key) {
    const scroller = root.querySelector('.rf-scroll'), group = root.querySelector('[data-list-group="' + key + '"]');
    if (!scroller || !group) return;
    scroller.scrollTop += group.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    root.querySelectorAll('[data-list-jump]').forEach((b) => {
      b.setAttribute('aria-pressed',String(b.dataset.listJump === key));
    });
    group.querySelector('h4')?.focus({preventScroll:true});
  }
  function groupLinkLabel(key,title) {
    return ({
      'needs-report':t('待建立報告','Cần tạo báo cáo'),
      'has-report':t('已建立報告','Đã tạo báo cáo'),
      historical:t('歷史計畫','Lịch sử kế hoạch'),
      cancelled:t('已捨棄計畫','Kế hoạch đã bỏ'),
      initial:t('初測報告','Báo cáo lần đầu'),
      retest:s.tab === 'cases' ? title : t('複測報告 · RTS','Báo cáo thử lại · RTS'),
      waiver:t('免做申請','Đề nghị miễn'),
      disposal:t('處置申請','Đề nghị xử lý'),
      draft:s.tab === 'plans' ? t('計畫草稿','Kế hoạch nháp') : title,
      pending:s.tab === 'plans' ? t('計畫待審核','Kế hoạch chờ duyệt') : title,
    })[key] || title;
  }
  function groupedList(items,keyOf,render,groups,jobs = false) {
    const scoped = groups.filter(([key]) => !['plans','reports'].includes(s.tab) || (s.tab === 'plans' ? !['initial','retest','correction','waiver','disposal'].includes(key) : ['initial','retest','correction','waiver','disposal'].includes(key)));
    const sections = scoped.map(([key,title,tone]) => ({key,title,tone,items:items.filter((item) => keyOf(item) === key)}));
    const navigation = '<nav class="rf-group-jumps" aria-label="' + t('分類定位','Đi tới nhóm') + '">' + sections.map((a) => '<button type="button" class="rf-btn ' + a.tone + '" data-rf-tone="' + (['initial','retest','correction','waiver','disposal'].includes(a.key) && s.tab !== 'cases' ? a.key : s.tab === 'plans' ? 'plan' : '') + '" data-list-jump="' + a.key + '" aria-pressed="false" ' + (!a.items.length ? 'disabled' : '') + '>' + groupLinkLabel(a.key,a.title) + ' · ' + a.items.length + '</button>').join('') + '</nav>';
    const html = sections.map((a) => a.items.length ? '<section class="rf-list-group ' + a.tone + '" data-rf-tone="' + (['initial','retest','correction','waiver','disposal'].includes(a.key) && s.tab !== 'cases' ? a.key : s.tab === 'plans' ? 'plan' : '') + '" data-list-group="' + a.key + '"><h4 tabindex="-1">' + a.title + '<span>' + a.items.length + '</span></h4><table class="rf-table"><thead><tr>' + (jobs ? '<th>✓</th>' : '') + '<th>' + t('項目 / 文件','Hạng mục / hồ sơ') + (jobs ? ' · ' + t('狀態 / 下一步','Trạng thái / bước tiếp') : '</th><th>' + t('狀態 / 下一步','Trạng thái / bước tiếp')) + '</th></tr></thead><tbody>' + a.items.map(render).join('') + '</tbody></table></section>' : '').join('') || '<div class="rf-empty">' + t('沒有符合條件的資料','Không có dữ liệu phù hợp') + '</div>';
    return {navigation,html};
  }
  function jobGroup(j) {
    if (j.completion) return 'completed';
    if (!j.planId) return 'unassigned';
    const state = jobSummary(j);
    if (['draft','pending'].includes(state.review)) return state.review;
    const plan = liveDocs().find((d) => d.id === j.planId);
    return plan && planReportState(plan,j.id).available ? 'needs-report' : 'reporting';
  }
  function documentGroup(d) {
    if (d.kind !== 'plan') return d.kind === 'report' ? (d.caseId ? 'retest' : d.correctionOf ? 'correction' : 'initial') : d.kind;
    if (status(d) !== 'approved') return status(d);
    const state = planReportState(d);
    return state.available ? 'needs-report' : state.related.length ? 'has-report' : 'historical';
  }
  function list() {
    const c = data.control;
    let rows;
    if (s.tab === 'jobs') {
      const jobs = c.jobs.filter(
        (j) =>
          matches([
            { source: j.source, jobId: j.id, results: jobSummary(j).results },
          ]) &&
          (!s.caseState ||
            c.cases.some((a) => a.jobId === j.id && caseMatches(a))) &&
          (!s.review || jobSummary(j).review === s.review) &&
          (!s.overdue || (!j.completion && j.end < data.today)),
      );
      rows = groupedList(jobs,jobGroup,(j) => {
          const state = jobSummary(j);
          return `<tr data-id="${h(j.id)}" data-job-tone="${state.tone}"${rowMark(j)} class="${s.selected === j.id ? 'selected' : ''}"><td class="rf-job-pick"><input type="checkbox" data-job="${h(j.id)}" aria-label="${h(j.source.name)}" ${s.checked.has(j.id) ? 'checked' : ''} ${j.planId || j.completion || !data.permissions.edit ? 'disabled' : ''}>${j.planId ? `<span class="rf-pick-status ${state.review}">${h(state.reviewLabel)}</span>` : ''}</td><td><strong>${h(j.source.name)}</strong>${markBadge(j)}<small>${h(j.source.line + ' / ' + j.source.category + ' / ' + j.source.code)}</small><small>${h(j.start + ' — ' + j.end)}</small>${state.html}${!j.completion && j.end < data.today ? '<small>⌛ ' + t('原期已逾期', 'Kỳ gốc đã quá hạn') + '</small>' : ''}</td></tr>`;
        }, [['unassigned',t('尚未安排','Chưa lập kế hoạch'),'blue'],['draft',t('草稿待完成','Nháp cần hoàn tất'),'amber'],['pending',t('已送審待核准','Đã gửi chờ duyệt'),'amber'],['needs-report',t('需要建立報告','Cần tạo báo cáo'),'amber'],['reporting',t('填報中','Đang báo cáo'),'blue'],['completed',t('本期已完成','Đã hoàn thành kỳ này'),'green']],true);
    } else if (s.tab === 'cases') {
      rows = groupedList(c.cases.filter(caseVisible), (a) => a.status,
          (a) =>
            `<tr data-id="${a.id}"${rowMark(c.jobs.find((j) => j.id === a.jobId),a)} class="${s.selected === a.id ? 'selected' : ''}"><td><strong>${h(a.number)}</strong>${markBadge(c.jobs.find((j) => j.id === a.jobId),a)}<small>${h(c.jobs.find((j) => j.id === a.jobId).source.name)}</small><small>${h(c.jobs.find((j) => j.id === a.jobId).start)}</small></td><td>${tag(a.status)}<small>${t('歷次報告', 'Các báo cáo')} ${a.reportIds.length}</small></td></tr>`,
        [['open',t('待改善','Chờ cải thiện'),'amber'],['retest',t('複測中','Đang thử lại'),'blue'],['ready-close',t('待確認結案','Chờ xác nhận đóng'),'amber'],['closed',t('已結案','Đã đóng'),'green'],['disposed',t('處置結案','Đã đóng bằng xử lý'),'muted'],['waived',t('本期免做','Miễn kỳ này'),'muted']]);
    } else
      rows = groupedList((s.tab === 'history' ? docs() : [...new Map([...primaryDocuments(), ...(doc() ? [doc()] : [])].map((d) => [d.id,d])).values()])
        .filter(
          (d) =>
            d.id === s.selected || ((s.tab !== 'plans' || d.kind === 'plan') &&
            (s.tab !== 'reports' || d.kind !== 'plan') &&
            (!s.documentKind || d.kind === s.documentKind) &&
            (!s.review || status(d) === s.review) &&
            (!s.caseState ||
              c.cases.some(
                (a) => a.reportIds.includes(d.id) && caseMatches(a),
              )) &&
            (!s.workState || status(d) === s.workState) && matches(content(d).lines, d)),
        )
        .slice()
        .reverse()
        .sort((a,b) => ({draft:0,pending:1,approved:2,cancelled:3}[status(a)] - {draft:0,pending:1,approved:2,cancelled:3}[status(b)]))
        , documentGroup,
          (d) =>
            `<tr data-id="${d.id}" data-document-kind="${d.kind}" data-rf-tone="${reportType(d)}"${s.highlight === 'documents' && status(d) === 'pending' ? ' data-highlight="amber"' : ''} aria-selected="${s.selected === d.id}" class="${s.selected === d.id ? 'selected' : ''}"><td>${kindTag(d)}<strong class="rf-number ${reportType(d)}">${h(displayNumber(d))}</strong>${legacyNumber(d)}${content(d).title !== d.number ? `<small>${h(content(d).title)}</small>` : ''}<small>${reportLabel(d)} · ${h(content(d).date)} · ${h(d.owner.name)}</small></td><td>${documentStage(d)}<small>${content(d).lines.length} ${t('項', 'hạng mục')}</small>${d.kind === 'report' ? `<small>${t('涵蓋', 'Bao phủ')} ${h([...new Set(content(d).lines.flatMap((l) => l.source.products.map((p) => p.code)))].join(', '))}<br>${t('實測', 'Thực thử')} ${h([...new Set(content(d).lines.flatMap((l) => l.results.flatMap((r) => r.samples)))].join(', ') || '—')}</small>` : ''}</td></tr>`,
        [['needs-report',t('核准計畫 · 需要建立報告','Kế hoạch đã duyệt · cần tạo báo cáo'),'amber'],['draft',t('計畫草稿 · 尚未送審','Kế hoạch nháp · chưa gửi'),'amber'],['pending',t('計畫 · 等待審核','Kế hoạch · chờ duyệt'),'amber'],['has-report',t('核准計畫 · 已建立報告','Kế hoạch đã duyệt · đã tạo báo cáo'),'green'],['historical',t('計畫歷史 · 無可填報項目','Lịch sử kế hoạch · không còn mục báo cáo'),'muted'],['cancelled',t('已捨棄計畫 · 歷史保留','Kế hoạch đã bỏ · giữ lịch sử'),'muted'],['initial',t('初測報告 · RPT','Báo cáo lần đầu · RPT'),'blue'],['retest',t('複測報告 · RTS','Báo cáo thử lại · RTS'),'purple'],['correction',t('更正報告 · COR','Báo cáo sửa đổi · COR'),'amber'],['waiver',t('免做申請 · WVR','Đề nghị miễn · WVR'),'amber'],['disposal',t('處置申請 · DSP','Đề nghị xử lý · DSP'),'purple']]);
    return `<div class="rf-panel-heading"><span>${t('工作清單', 'Danh sách công việc')}</span><small>${t('選取查看完整明細', 'Chọn để xem chi tiết')}</small></div>${s.tab === 'jobs' ? selectionBar() : s.tab === 'cases' ? '' : (s.tab === 'reports' ? reportKinds() : '') + workFilters()}${rows.navigation}${doc() ? '<div class="rf-current-document">' + t('正在查看：', 'Đang xem: ') + h(displayNumber(doc())) + ' · ' + reportLabel(doc()) + '</div>' : ''}<div class="rf-scroll">${rows.html}</div>`;

  }
  function jobSummary(j) {
    const plan = liveDocs().find((d) => d.id === j.planId),
      reports = liveDocs().filter(
        (d) =>
          d.kind === 'report' &&
          d.flow.active.id &&
          d.flow.active.content.lines.some((l) => l.jobId === j.id),
      ),
      latest = reports.at(-1),
      results =
        latest?.flow.active.content.lines.find((l) => l.jobId === j.id)
          ?.results || [],
      a = data.control.cases.filter((a) => a.jobId === j.id).at(-1),
      inProgress = liveDocs()
        .filter(
          (d) =>
            d.kind !== 'plan' &&
            status(d) !== 'approved' &&
            content(d).lines.some((l) => l.jobId === j.id),
        )
        .at(-1),
      outcomes = [...new Set(results.map((r) => r.outcome).filter(Boolean))];
    if (a?.status === 'disposed' && !outcomes.includes('fail'))
      outcomes.push('fail');
    const tone = outcomes.includes('fail')
      ? 'fail'
      : outcomes.includes('unable')
        ? 'unable'
        : outcomes.includes('undetermined')
          ? 'undetermined'
          : outcomes.includes('pass')
            ? 'pass'
            : 'unassigned';
    let tags = outcomes.map(tag).join('');
    if (a) tags += tag(a.status);
    // The plan stage below names its meaning explicitly.
    if (inProgress)
      tags += `<span class="rf-tag ${status(inProgress)}">${label(inProgress.kind)} · ${label(status(inProgress))}</span>`;
    if (!tags) tags = tag('unassigned');
    const locked = j.completion
        ? (inProgress ? t('本期檢查已完成；另有草稿／送審文件待處理。', 'Kiểm tra kỳ này đã hoàn tất; còn bản nháp / hồ sơ chờ duyệt.') : t('本期完成，不能重複安排。', 'Kỳ này đã hoàn thành; không lập lại.'))
        : j.planId
          ? t('已納入計畫，不能重複勾選。', 'Đã có kế hoạch; không chọn trùng.')
          : t(
              '尚未操作，可勾選一起建立計畫。',
              'Chưa thao tác; có thể chọn để lập kế hoạch chung.',
            ),
      next = inProgress
        ? `<button class="rf-report-link" data-doc="${h(inProgress.id)}">${t('接續', 'Tiếp tục')} ${label(inProgress.kind)}</button>`
        : a && !done(a)
          ? `<button class="rf-report-link" data-case="${h(a.id)}">${a.status === 'ready-close' ? t('確認結案', 'Xác nhận đóng') : t('接續異常／補測', 'Tiếp tục bất thường / thử lại')}</button>`
          : latest
            ? `<button class="rf-report-link" data-doc="${h(latest.id)}">${t('查看正式報告', 'Xem báo cáo chính thức')}</button>`
            : plan
              ? `<button class="rf-report-link" data-doc="${h(plan.id)}">${t('開啟計畫', 'Mở kế hoạch')}</button>`
              : '';
    return {
      tone,
      results,
      reviewLabel: inProgress ? label(inProgress.kind) + ' · ' + label(status(inProgress)) : latest ? t('報告核准','Báo cáo đã duyệt') : plan ? label('plan') + ' · ' + label(status(plan)) : '',
      review: inProgress
        ? status(inProgress)
        : latest
          ? 'approved'
          : plan
            ? status(plan)
            : '',
      html: `<div class="rf-job-status">${tags}</div>${inProgress ? documentStage(inProgress) : plan ? documentStage(plan, j.id) : ''}<small class="rf-lock-reason">${locked}</small>${next}`,
    };
  }
  function selectionBar() {
    const jobs = data.control.jobs.filter((j) => s.checked.has(j.id));
    return `<div class="rf-selection-bar">${s.selectionNotice ? `<p role="status">${h(s.selectionNotice)}</p>` : ''}<div><b>${t('已選項目', 'Đã chọn')} ${jobs.length}</b>${btn('create-plan', t('＋ 建立檢查計畫', '＋ Tạo kế hoạch'), !jobs.length || !data.permissions.edit, 'primary')}</div>${jobs.length ? `<details><summary>${t('檢查已選清單（含其他篩選範圍）', 'Xem các hạng mục đã chọn (gồm phạm vi khác)')}</summary><ul>${jobs.map((j) => `<li>${h(j.source.name + ' · ' + j.source.line + ' / ' + j.source.category + ' · ' + j.start)}</li>`).join('')}</ul>${btn('clear-selection', t('清除勾選', 'Bỏ chọn'))}</details>` : `<small>${t('只可勾選尚未安排的項目；已完成項目請看結果與下一步。', 'Chỉ chọn hạng mục chưa có kế hoạch; xem kết quả và bước tiếp của mục hoàn thành.')}</small>`}</div>`;
  }
  function jobDetail(j) {
    const a = data.control.cases.filter(
      (a) =>
        a.jobId !== j.id &&
        data.control.jobs.find((o) => o.id === a.jobId)?.itemId === j.itemId &&
        !done(a),
    );
    return (
      jobSummary(j).html +
      `<h3>${h(j.source.name)}</h3><p class="rf-subtle">${h(j.source.line + ' / ' + j.source.category + ' / ' + j.source.errorCode + ' / ' + j.source.code)}</p>${coverage(j.source)}<div class="rf-kv"><div><small>${t('應檢期別', 'Kỳ kiểm tra')}</small><strong>${h(j.start + ' — ' + j.end)}</strong></div><div><small>${t('來源標準版本', 'Phiên bản tiêu chuẩn')}</small><strong>${h(j.source.version)}</strong></div></div><details class="rf-standard" open><summary>${t('檢查標準', 'Tiêu chuẩn kiểm tra')}</summary>${h(j.source.description)}</details>${a.length ? `<div class="rf-notice error">${t('前期仍有未結異常', 'Kỳ trước còn hồ sơ chưa đóng')}: ${a.map((x) => `<button class="rf-report-link" data-case="${x.id}">${h(x.number)}</button>`).join(' ')}</div>` : ''}${j.planId ? `<button class="rf-btn primary" data-doc="${h(j.planId)}">${t('開啟計畫', 'Mở kế hoạch')}</button>` : batch()}`
    );
  }
  function batch() {
    return `<h3>${t('批次安排檢查', 'Lập kế hoạch kiểm tra')}</h3><p class="rf-subtle">${t('勾選左侧應檢項目，建立同一份計畫。每項的涵蓋產品保留在來源快照中。', 'Chọn các hạng mục bên trái để tạo chung một kế hoạch. Lưu phạm vi sản phẩm theo tiêu chuẩn.')}</p><div class="rf-kv"><div><small>${t('已選項目', 'Đã chọn')}</small><strong>${s.checked.size}</strong></div><div><small>${t('負責人', 'Phụ trách')}</small><strong>${h(data.identity.name)}</strong></div></div>${btn('create-plan', t('＋ 建立檢查計畫', '＋ Tạo kế hoạch'), !s.checked.size || !data.permissions.edit, 'primary')}`;
  }
  const coverage = (src) =>
    `<div class="rf-coverage"><b>${t('涵蓋產品', 'Sản phẩm bao phủ')}</b><br>${src.products.map((p) => h(p.code + ' · ' + p.name)).join(' / ') || '—'}</div>`;
  function detail() {
    if (s.tab === 'jobs') {
      const j = data.control.jobs.find((j) => j.id === s.selected);
      return j ? jobDetail(j) : batch();
    }
    if (s.tab === 'cases') {
      const a = selectedCase();
      return a ? caseDetail(a) : empty();
    }
    const d = doc();
    return d ? documentDetail(d) : empty();
  }
  const empty = () =>
    `<div class="rf-empty"><span class="rf-icon">▤</span><b>${t('選擇一筆工作開始', 'Chọn một hồ sơ')}</b>${t('明細、照片與歷史會顯示在這裡', 'Chi tiết, hình ảnh và lịch sử hiển thị tại đây')}</div>`;
  function documentDetail(d) {
    const edit = status(d) === 'draft' && data.permissions.edit,
      c = edit ? buffer(d) : content(d),
      p = data.permissions;
    const jobs = c.lines.map((l) =>
      data.control.jobs.find((j) => j.id === l.jobId),
    );
    const complete = jobs.filter((j) => j.completion).length;
    const _pending = d.flow.cases.find((a) => a.id === d.flow.pendingId);
    return `<article class="rf-document"><div class="rf-draft-header"></div>${issuePanels(d, c)}<div class="rf-operation-log"><ol>${(d.lifecycle || []).map((a) => `<li>${h(a.at)} · ${h(a.actor.name)} · ${h(label(a.action))}</li>`).join('')}${d.flow.cases.map((a) => `<li>${h(a.at)} · ${h(a.actor.name)} · ${h(a.reason)} · ${h(a.status)}${a.result ? ` · ${h(a.result.actor?.name)} · ${h(a.result.at)}` : ''}</li>`).join('')}</ol></div><div class="rf-actions">${status(d) === 'draft' ? btn('save', t('儲存', 'Lưu'), !p.save, 'primary') + btn('submit', t('送審', 'Gửi duyệt'), !p.submit || !d.flow.saved) : ''}${status(d) === 'draft' ? btn('discard', t('捨棄草稿', 'Bỏ bản nháp'), !p.edit || (!!d.flow.active.id && !p.revoke), 'danger') : ''}${status(d) === 'pending' ? btn('review', t('審核', 'Duyệt'), !p.approve && !p.return) + btn('withdraw', t('撤回', 'Rút lại'), !p.withdraw) : ''}</div>${cancellationPanel(d)}${approvalPanel(d)}<h3 class="rf-number ${reportType(d)}">${h(displayNumber(d))}</h3>${legacyNumber(d)}${btn('expand-report', s.wide ? t('回到左右明細', 'Về bố cục hai cột') : t('展開完整報告', 'Mở rộng báo cáo'))}<p class="rf-subtle">${reportLabel(d)} · ${h(d.owner.name)} · ${h(d.createdAt.slice(0, 16).replace('T', ' '))}</p>${d.correctionOf ? `<p>${t('更正來源', 'Sửa từ')} <button class="rf-report-link" data-doc="${h(d.correctionOf)}">${h(docs().find((o) => o.id === d.correctionOf)?.number)}</button></p>` : ''}${d.planId ? `<button class="rf-report-link" data-doc="${h(d.planId)}">${t('返回所屬計畫', 'Về kế hoạch gốc')}</button>` : ''}${d.caseId ? `<div class="rf-notice"><button class="rf-report-link" data-case="${h(d.caseId)}">${h(data.control.cases.find((a) => a.id === d.caseId)?.number)} →</button><p>${t('應複測樣品（尚待驗證；不是本次實測）', 'Mẫu cần thử lại (chờ xác minh; không phải mẫu đã thử lần này)')}：${h((data.control.cases.find((a) => a.id === d.caseId)?.requiredSamples || []).join(', ') || '—')}</p></div>` : ''}${d.kind === 'plan' ? `<div class="rf-progress"><span style="width:${(100 * complete) / Math.max(1, jobs.length)}%"></span></div><p class="rf-subtle">${t('計畫完成', 'Tiến độ kế hoạch')} ${complete}/${jobs.length} · ${t('異常是否結案另行確認', 'Đóng bất thường được xác nhận riêng')}</p>` : ''}<div class="rf-input-grid"><label>${t('文件名稱', 'Tên hồ sơ')}<input data-field="title" value="${h(c.title)}" ${edit ? '' : 'disabled'}></label><label>${t('實際日期', 'Ngày thực tế')}<input type="date" data-field="date" value="${h(c.date)}" ${edit ? '' : 'disabled'}></label></div>${c.lines.map((l, index) => lineHTML(l, index, d, edit)).join('')}<div class="rf-edit"><label>${t('備註', 'Ghi chú')}<textarea data-field="notes" ${edit ? '' : 'disabled'}>${h(c.notes)}</textarea></label>${['waiver', 'disposal'].includes(d.kind) ? `<label>${t('申請原因', 'Lý do đề nghị')}<textarea data-field="reason" ${edit ? '' : 'disabled'}>${h(c.reason)}</textarea></label>` : ''}${d.kind === 'disposal' ? `<label>${t('處置內容', 'Nội dung xử lý')}<textarea data-field="disposition" ${edit ? '' : 'disabled'}>${h(c.disposition)}</textarea></label><div><label>${t('處置照片（必填，至少一張成功上傳）', 'Ảnh xử lý (bắt buộc, tải thành công ít nhất một ảnh)')}</label><div class="rf-photos">${c.evidence.map(p => draftPhoto(p,edit)).join('')}${edit ? upload('evidence') : ''}</div></div>` : ''}</div><div class="rf-actions">${status(d) === 'approved' ? btn('export', t('↓ 匯出正式文件', '↓ Xuất hồ sơ chính thức'), !p.history) : ''}${d.kind === 'plan' && status(d) === 'approved' ? planActions(d) : ''}</div>${d.impact?.length ? `<div class="rf-notice error">${t('下游影響追蹤', 'Theo dõi ảnh hưởng')} ${d.impact.map((a) => `<p><button class="rf-report-link" data-doc="${a.id}">${h(a.id)}</button> ${h(a.reason)} ${a.resolvedAt ? '✓' : ''}</p>`).join('')}${btn('resolve-impact', t('確認影響處理', 'Xác nhận xử lý ảnh hưởng'), !p.approve || d.impact.every((a) => a.resolvedAt))}</div>` : ''}${data.control.cases
      .filter((a) => a.reportIds.includes(d.id))
      .map(
        (a) =>
          `<div class="rf-notice">${tag(a.status)} <button class="rf-report-link" data-case="${a.id}">${h(a.number)} →</button></div>`,
      )
      .join('')}</article>`;
  }
  const draftPhoto = (p, edit) => '<span class="rf-photo-entry">' + photo(p) + (edit ? '<button type="button" class="rf-btn danger rf-photo-remove" data-remove-photo="' + h(p) + '" aria-label="' + t('移除此照片','Gỡ ảnh này') + '">' + t('移除照片','Gỡ ảnh') + '</button>' : '') + '</span>';
  const upload = (key) =>
    `<label class="rf-upload" tabindex="0" role="button" aria-label="${h(t('上傳照片', 'Tải ảnh'))}" title="${h(t('上傳照片', 'Tải ảnh'))}">＋<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload="${key}" aria-label="${h(t('上傳照片', 'Tải ảnh'))}"></label>`;
  function lineHTML(l, index, d, edit) {
    const now = data.sources.find((o) => o.id === l.source.id),
      changed = !now || now.versionId !== l.source.versionId;
    return `<section class="rf-item" data-line="${index}" data-line-id="${h(l.id)}"><div class="rf-item-head"><strong>${index + 1}. ${h(l.source.name)}</strong><small>${h(l.source.line + ' / ' + l.source.category + ' / ' + l.source.errorCode + ' / ' + l.source.code)} · ${t('版本', 'Phiên bản')} ${h(l.source.version)}</small>${changed ? `<small>⚠ ${t('來源已改版或停用；保留當次快照', 'Nguồn đã đổi hoặc tắt; giữ bản chụp gốc')}</small>` : ''}</div><div class="rf-item-body">${coverage(l.source)}${retestGuidance(d,l,index,edit)}<details class="rf-standard"><summary>${t('展開當次標準', 'Xem tiêu chuẩn tại thời điểm này')}</summary>${h(l.source.description)}</details>${d.kind === 'report' ? l.results.map((r, ri) => resultHTML(l, r, ri, edit, index)).join('') + (edit ? btn('add-result:' + index, t('＋ 新增樣品結果列', '＋ Thêm dòng kết quả mẫu'), (requiredForLine(d,l).length ? requiredForLine(d,l) : l.source.products.map(p=>p.code)).every(code=>l.results.some(r=>r.samples.includes(code)))) : '') : ''}</div></section>`;
  }
  function resultHTML(l, r, ri, edit) {
    const required = requiredForLine(doc(),l), fixed = required.length > 0;
    const used = new Set(l.results.filter(row => row.id !== r.id).flatMap(row => row.samples));
    const choices = fixed ? '<p class="rf-fixed-sample">' + t('請用原樣品檢查：','Kiểm tra bằng mẫu gốc: ') + h(sampleNames(l,r.samples.length ? r.samples : required)) + '</p>' : '<details class="rf-samples" data-sample-key="' + h(r.id) + '" ' + (s.sampleOpen.get(r.id) ? 'open' : '') + '><summary>' + (edit ? t('實測樣品（只能選一個）','Mẫu thực thử (chọn một)') : t('實測樣品','Mẫu thực thử')) + ': ' + h(sampleNames(l,r.samples) || t('尚未選取','Chưa chọn')) + '</summary>' + (edit && r.outcome !== 'unable' ? '<input data-sample-search placeholder="' + t('搜尋產品編號／名稱','Tìm mã / tên sản phẩm') + '"><div class="rf-sample-options">' + l.source.products.map(p => '<label data-product-label><input type="radio" name="rf-sample-' + h(l.id + '-' + r.id) + '" data-sample="' + h(p.code) + '" ' + (r.samples.includes(p.code) ? 'checked ' : '') + (used.has(p.code) ? 'disabled ' : '') + '>' + h(p.code + ' · ' + p.name) + (used.has(p.code) ? ' · ' + t('其他結果列已選','Đã chọn ở dòng khác') : '') + '</label>').join('') + '</div>' : '<p>' + h(sampleNames(l,r.samples) || '—') + '</p>') + '</details>';
    return '<details class="rf-result" data-result="' + ri + '" data-result-id="' + h(r.id) + '" ' + ((s.resultOpen.get(r.id) ?? ri === 0) ? 'open' : '') + '><summary class="rf-result-top"><b>' + t('結果列','Dòng kết quả') + ' ' + (ri+1) + ' · ' + h(sampleNames(l,r.samples) || t('尚未選樣','Chưa chọn mẫu')) + '</b></summary><div class="rf-result-body">' + (edit && l.results.length > 1 ? btn('remove-result',t('移除列','Xóa dòng')) : '') + (edit ? '<p class="rf-select-hint">' + t('請選取檢查結果','Vui lòng chọn kết quả kiểm tra') + '</p>' : '') + '<div class="rf-choice">' + ['pass','fail','unable','undetermined'].map(o => '<button type="button" aria-pressed="' + (r.outcome === o) + '" data-outcome="' + o + '" class="' + (r.outcome === o ? 'active' : '') + '" ' + (edit ? '' : 'disabled') + '>' + label(o) + '</button>').join('') + '</div>' + choices + (r.outcome === 'unable' ? '<p class="rf-subtle">' + t('無法測試，不記錄虛擬樣品。','Không thể thử; không ghi mẫu giả.') + '</p>' : '') + '<div class="rf-edit"><label>' + t('實測結果／數值','Kết quả / giá trị thực tế') + '<textarea data-result-field="value" ' + (edit ? '' : 'disabled') + '>' + h(r.value) + '</textarea></label><label>' + (r.outcome === 'pass' ? t('備註（合格免填原因）','Ghi chú (đạt không cần lý do)') : t('問題說明／原因','Mô tả vấn đề / lý do')) + '<textarea data-result-field="notes" ' + (edit ? '' : 'disabled') + '>' + h(r.notes) + '</textarea></label></div><div class="rf-photos">' + r.photos.map(p => draftPhoto(p,edit)).join('') + (edit ? upload('result') : '') + '</div>' + (['fail','undetermined'].includes(r.outcome) ? '<p class="rf-subtle">' + t('送審需說明及至少一張成功上傳照片。缺漏可先儲存。','Cần mô tả và ít nhất một ảnh tải thành công để gửi duyệt. Có thể lưu khi còn thiếu.') + '</p>' : '') + '</div></details>';
  }
  function followupState(a) {
    const open = liveDocs().find((d) => d.caseId === a.id && status(d) !== 'approved') || (a.status === 'retest' && liveDocs().find((d) => d.caseId === a.id && d.kind === 'plan' && status(d) === 'approved' && reportSlots(d).some((slot) => slot.assigned && !slot.reportIds.length))) || null;
    const retest = open && ['report', 'plan'].includes(open.kind) ? open : null;
    const lastFailure = [...a.events].reverse().find((e) => e.action === 'fail');
    const improvementNeeded = a.result === 'fail' && !a.improvements.some((i) => i.at >= (lastFailure?.at || ''));
    return {open, retest, improvementNeeded};
  }
  function retestActions(a) {
    const {open, retest, improvementNeeded} = followupState(a);
    const locked = done(a) || !data.permissions.edit;
    if (retest) {
      const draft = status(retest) === 'draft', approvedPlan = status(retest) === 'approved', blocked = (retest.dependencies?.documents?.length || retest.dependencies?.cases?.length || 0) > 0;
      return '<div class="rf-retest-state" role="status">' + btn(draft ? 'recall-retest' : 'open-retest', draft ? t('已建立複測 · 點擊收回草稿','Đã tạo thử lại · Bấm thu hồi nháp') : approvedPlan ? t('複測計畫已核准 · 開啟填報','Kế hoạch thử lại đã duyệt · Mở lập báo cáo') : t('複測已送審 · 開啟查看','Đã gửi thử lại · Mở xem'), draft && (locked || blocked || (!!retest.flow.active.id && !data.permissions.revoke))) +
        '<button class="rf-btn" data-doc="' + h(retest.id) + '">' + t('開啟複測','Mở thử lại') + ' · ' + h(retest.number) + '</button><p class="rf-subtle">' +
        (draft ? blocked ? t('已有相依文件，不能收回；請開啟複測查看。','Có hồ sơ phụ thuộc; không thể thu hồi. Mở thử lại để xem.') : t('尚未送審。收回會保留歷史，並讓案件回到待處理狀態。','Chưa gửi duyệt. Thu hồi giữ lịch sử và đưa hồ sơ về chờ xử lý.') : approvedPlan ? t('計畫已核准，請接續建立執行報告；正式版本保留。','Kế hoạch đã duyệt; tiếp tục tạo báo cáo thực hiện, giữ phiên bản chính thức.') : t('請先在原文件撤回送審，才能收回草稿。','Rút hồ sơ gửi duyệt trước khi thu hồi bản nháp.')) + '</p>' +
        (s.cancelConfirm === 'retest:' + retest.id ? '<div class="rf-inline-confirm">' + t('確認收回此複測草稿？原不合格及歷次報告保留，可從歷史復原。','Thu hồi bản nháp thử lại này? Giữ kết quả không đạt và các báo cáo; có thể khôi phục từ lịch sử.') + btn('confirm-recall-retest',t('確認收回複測','Xác nhận thu hồi thử lại'),locked || blocked || (!!retest.flow.active.id && !data.permissions.revoke),'danger') + btn('cancel-confirmation',t('取消','Hủy')) + '</div>' : '') + '</div>';
    }
    const blocked = locked || !!open || a.status === 'ready-close';
    return btn('followup-report',t('改善並建立複測','Cải thiện và tạo thử lại'),blocked,'primary') + '<p class="rf-subtle rf-retest-guidance">' +
      (open ? t('已有後續申請，請先完成或收回原草稿：','Có đề nghị tiếp theo; hoàn tất hoặc thu hồi bản nháp:') + '<button class="rf-report-link" data-doc="' + h(open.id) + '">' + h(open.number) + '</button>' :
        done(a) ? t('案件已結案。','Hồ sơ đã đóng.') : a.status === 'ready-close' ? t('複測合格已核准，請確認結案。','Thử lại đạt đã được duyệt; xác nhận đóng hồ sơ.') : improvementNeeded ? t('填寫本次改善措施後，一次記錄改善並建立複測。','Nhập biện pháp cải thiện, ghi nhận và tạo thử lại trong một bước.') : t('建立後會在此顯示複測編號，可開啟填寫或收回尚未送審草稿。','Sau khi tạo sẽ hiện số thử lại tại đây; có thể mở nhập hoặc thu hồi nháp chưa gửi.')) + '</p>';
  }
  function caseDetail(a) {
    const j = data.control.jobs.find((j) => j.id === a.jobId);
    return `<h3>${h(a.number)}</h3>${tag(a.status)} <p>${h(j.source.name)}</p>${coverage(j.source)}<p class="rf-subtle">${h(j.start + ' — ' + j.end)} · ${t('原不合格與每次複測都會保留', 'Lưu kết quả ban đầu và mọi lần thử lại')}</p><div class="rf-actions">${retestActions(a)}${btn('followup-waiver', t('申請本期免做', 'Đề nghị miễn kỳ'), done(a) || a.result !== 'unable' || a.unresolvedFailureSamples?.length || !data.permissions.edit)}${btn('followup-disposal', t('申請處置結案', 'Đề nghị đóng xử lý'), done(a) || (a.result !== 'fail' && !a.unresolvedFailureSamples?.length) || !data.permissions.edit)}${btn('close', t('確認結案', 'Xác nhận đóng'), a.status !== 'ready-close' || !data.permissions.approve, 'primary')}</div>${s.busy ? '<p role="status">' + t('正在處理，請稍候…','Đang xử lý, vui lòng chờ…') + '</p>' : ''}${s.error ? '<div class="rf-notice error" role="alert">' + h(s.error) + (s.retry ? btn('retry',t('查證／重試原操作','Kiểm tra / thử lại thao tác')) : '') + '</div>' : ''}<ol class="rf-timeline">${a.events.map((e) => `<li><b>${h(label(e.action))}</b><time>${h(e.at)} · ${h(e.actor.name)}</time><p>${h(e.reason)}</p>${e.documentId ? `<button class="rf-report-link" data-doc="${e.documentId}">${h(docs().find((d) => d.id === e.documentId)?.number || e.documentId)}</button>` : ''}</li>`).join('')}</ol>${a.improvements.map((i) => `<div class="rf-notice"><b>${t('改善紀錄', 'Ghi cải thiện')}</b><p>${h(i.notes)}</p><small>${h(i.actor.name + ' · ' + i.at)}</small><div class="rf-photos">${i.photos.map(photo).join('')}</div></div>`).join('')}`;
  }
  function choose(value, tab = s.tab) {
    const leavingReviewForCase = s.reviewPlatform && tab === 'cases';
    if (tab !== s.tab) s.highlight = '';
    s.selected = value;
    s.tab = tab === 'documents' ? documentTab(docs().find((d) => d.id === value)) : tab;
    s.cancelConfirm = null;
    s.selfReview = null;
    if (doc() && s.documentKind && doc().kind !== s.documentKind) s.documentKind = '';
    if (doc() && s.workState && status(doc()) !== s.workState) s.workState = '';
    s.error = '';
    s.issues = [];
    if (leavingReviewForCase) {
      window.ProcessDualSystem.go('quality-inspections');
      return;
    }
    paint();
    if (window.matchMedia('(max-width: 760px)').matches) root.querySelector('.rf-detail-panel')?.scrollIntoView({block:'start'});
    else root.querySelector('.rf-table tr.selected')?.focus({preventScroll:true});
  }
  function bind() {
    root.querySelectorAll('[data-doc],[data-review-doc]').forEach(el => {
      const linked = docs().find(d => d.id === (el.dataset.doc || el.dataset.reviewDoc));
      if (linked) { el.dataset.rfTone = reportType(linked); el.classList.add('rf-document-link'); }
    });
    root
      .querySelectorAll('[data-action]')
      .forEach((b) => (b.onclick = () => act(b.dataset.action, b)));
    root.querySelectorAll('[data-tab]').forEach(
      (b) =>
        (b.onclick = () => {
          const leavingHistory = s.tab === 'history';
          s.tab = b.dataset.tab;
          s.highlight = '';
          s.selected = null;
          s.overdue = false;
          if (leavingHistory && s.tab !== 'history') void refresh(true);
          else paint();
        }),
    );
    root.querySelectorAll('[data-module]').forEach(
      (b) =>
        (b.onclick = () => {
          s.module = b.dataset.module === '0' ? 'FQC' : b.dataset.module;
          paint();
        }),
    );
    root.querySelectorAll('[data-work-state]').forEach((b) => {
      b.onpointerdown = (e) => e.preventDefault();
      b.onclick = () => { holdFilterView(); s.workState = b.dataset.workState; s.review = ''; s.selected = null; paint(); root.querySelector('[data-work-state="' + s.workState + '"]')?.focus({preventScroll:true}); };
    });
    root.querySelectorAll('[data-kind]').forEach((b) => {
      b.onpointerdown = (e) => e.preventDefault();
      b.onclick = () => { holdFilterView(); s.documentKind = b.dataset.kind; s.selected = null; paint(); root.querySelector('[data-kind="' + s.documentKind + '"]')?.focus({preventScroll:true}); };
    });
    root.querySelectorAll('[data-list-jump]').forEach((b) => {
      b.onpointerdown = (e) => e.preventDefault();
      b.onclick = () => jumpListGroup(b.dataset.listJump);
    });
    root.querySelectorAll('[data-plan-report]').forEach((b) => b.onclick = () => { choose(b.dataset.planReport, 'plans'); void act('create-report'); });
    root.querySelectorAll('[data-review-module]').forEach((b) => b.onclick = () => { s.reviewModule = b.dataset.reviewModule; s.selected = null; paint(); });
    root.querySelectorAll('[data-issue-index]').forEach((b) => b.onclick = () => focusIssue(s.issueTargets[Number(b.dataset.issueIndex)]));
    root.querySelectorAll('[data-self-review]').forEach((b) => b.onchange = () => { s.selfReview = b.checked ? doc()?.flow.pendingId : null; for (const action of ['approve', 'return']) { const button = root.querySelector(`[data-action="${action}"]`); if (button) button.disabled = !b.checked || s.busy; } });
    root.querySelectorAll('[data-id]').forEach((b) => {
      b.tabIndex = 0;
      b.setAttribute('aria-selected', String(b.dataset.id === s.selected));
      b.onpointerdown = (e) => { if (!e.target.closest('input,button,a')) e.preventDefault(); };
      // Prevent browser focus scrolling before the explicit preventScroll focus in choose().
      b.onclick = (e) => {
        if (!e.target.closest('input,button,a')) choose(b.dataset.id);
      };
      b.onkeydown = (e) => {
        if (e.key === 'Enter' && e.target === b) choose(b.dataset.id);
      };
    });
    root.querySelectorAll('[data-job]').forEach(
      (b) =>
        (b.onchange = () => {
          s.selectionNotice = '';
          if (b.checked) { s.checked.add(b.dataset.job); } else { s.checked.delete(b.dataset.job); }
          paint();
        }),
    );
    root
      .querySelectorAll('[data-doc]')
      .forEach((b) => (b.onclick = () => choose(b.dataset.doc, 'documents')));
    root
      .querySelectorAll('[data-case]')
      .forEach((b) => (b.onclick = () => choose(b.dataset.case, 'cases')));
    root.querySelectorAll('[data-filter]').forEach(
      (b) =>
        (b.onchange = () => {
          s[b.dataset.filter] = b.value;
          if (b.dataset.filter === 'line') {
            s.category = '';
            s.item = '';
          }
          if (b.dataset.filter === 'category') s.item = '';
          s.selected = null;
          paint();
        }),
    );
    root.querySelectorAll('[data-stat]').forEach(
      (b) =>
        (b.onclick = () => {
          toggleHighlight(b.dataset.stat, b.dataset.stat === 'overdue' ? 'jobs' : b.dataset.stat);
        }),
    );
    const d = doc();
    root.querySelectorAll('.rf-samples').forEach(el => el.ontoggle = () => { if (el.isConnected) s.sampleOpen.set(el.dataset.sampleKey,el.open); });
    root.querySelectorAll('.rf-result[data-result-id]').forEach(el => el.ontoggle = () => { if (el.isConnected) s.resultOpen.set(el.dataset.resultId,el.open); });
    if (!d || status(d) !== 'draft') return;
    const c = buffer(d),
      touch = () =>
        { window.VersionDraftUI?.updateSaved(root, { ...d.flow, working: c }); updateRoutineIssues(d,c); }
    root.querySelectorAll('[data-field]').forEach(
      (el) =>
        (el.oninput = () => {
          c[el.dataset.field] = el.value;
          touch();
        }),
    );
    const row = (el) =>
      c.lines[Number(el.closest('[data-line]').dataset.line)].results[
        Number(el.closest('[data-result]').dataset.result)
      ];
    root.querySelectorAll('[data-result-field]').forEach(
      (el) =>
        (el.oninput = () => {
          row(el)[el.dataset.resultField] = el.value;
          touch();
        }),
    );
    root.querySelectorAll('[data-outcome]').forEach(
      (el) =>
        (el.onclick = () => {
          row(el).outcome = el.dataset.outcome;
          if (row(el).outcome === 'unable') row(el).samples = [];
          paint();
        }),
    );
    root.querySelectorAll('[data-sample]').forEach(el => el.onchange = () => {
      if (!el.checked) return;
      const r = row(el), line = c.lines[Number(el.closest('[data-line]').dataset.line)];
      if (requiredForLine(d,line).length || line.results.some(other => other.id !== r.id && other.samples.includes(el.dataset.sample))) return;
      r.samples = [el.dataset.sample];
      touch();
      root.querySelectorAll('[data-sample]').forEach(input => {
        const own = row(input), ownLine = c.lines[Number(input.closest('[data-line]').dataset.line)];
        input.disabled = ownLine.results.some(other => other.id !== own.id && other.samples.includes(input.dataset.sample));
      });
      el.closest('details').querySelector('summary').textContent = t('實測樣品（只能選一個）','Mẫu thực thử (chọn một)') + ': ' + sampleNames(line,r.samples);
    });
    root.querySelectorAll('[data-remove-photo]').forEach(el => el.onclick = () => {
      const photos = el.closest('[data-result]') ? row(el).photos : c.evidence;
      const index = photos.indexOf(el.dataset.removePhoto);
      if (index >= 0) photos.splice(index,1);
      touch(); paint();
    });
    root
      .querySelectorAll('[data-sample-search]')
      .forEach(
        (el) =>
          (el.oninput = () =>
            el.parentElement
              .querySelectorAll('[data-product-label]')
              .forEach(
                (l) =>
                  (l.hidden = !l.textContent
                    .toLowerCase()
                    .includes(el.value.toLowerCase())),
              )),
      );
    root.querySelectorAll('[data-upload]').forEach(
      (el) =>
        (el.onchange = async () => {
          const file = el.files[0];
          if (!file) return;
          const photos = el.dataset.upload === 'evidence' ? c.evidence : row(el).photos;
          s.busy = true;
          el.disabled = true;
          try {
            const r = await fetch(endpoint + '/photo', {
                method: 'PUT',
                headers: { 'content-type': file.type },
                body: file,
              }),
              v = await r.json();
            if (!r.ok) throw Error(v.error || 'UPLOAD_FAILED');
            if (!photos.includes(v.id)) photos.push(v.id);
            touch();
            s.error = '';
          } catch (e) {
            s.error =
              t(
                '照片上傳失敗，輸入保留：',
                'Tải ảnh thất bại; giữ dữ liệu nhập: ',
              ) + e.message;
          } finally {
            s.busy = false;
            paint();
          }
        }),
    );
    root.querySelectorAll('.rf-upload').forEach((el) => el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.querySelector('input').click(); } });
  }
  async function draft(action, extra = {}) {
    const d = doc(),
      operationId = id();
    return post({
      action: 'draft',
      documentId: d.id,
      operationId,
      command: {
        action,
        operationId,
        generation: d.flow.generation,
        clientId: s.client,
        sequence: ++s.seq,
        ...extra,
      },
    });
  }
  async function save() {
    const d = doc(),
      c = buffer(d),
      base = s.bases.get(d.id),
      patches = [];
    for (const k of [
      'title',
      'date',
      'notes',
      'reason',
      'disposition',
      'evidence',
    ])
      if (JSON.stringify(c[k]) !== JSON.stringify(base[k]))
        patches.push({ op: 'set', path: [k], value: c[k] });
    for (const l of c.lines) {
      const b = base.lines.find((o) => o.id === l.id);
      if (JSON.stringify(l.results) !== JSON.stringify(b.results))
        patches.push({
          op: 'set',
          path: ['lines', { id: l.id }, 'results'],
          value: l.results,
        });
    }
    if (patches.length) {
      await draft('apply', {
        patches,
        guards: patches.map((p) => ({
          path: p.path,
          value:
            p.path.length === 1
              ? base[p.path[0]]
              : base.lines.find((l) => l.id === p.path[1].id).results,
        })),
      });
      const fresh = await read();
      if (fresh.control.revision >= data.control.revision) data = fresh;
      s.bases.set(d.id, clone(c));
    }
    await draft('save', { expectedRevision: doc().flow.revision });
    s.buffers.delete(d.id);
    s.bases.delete(d.id);
  }
  function dialog(title, body, submit = t('確認', 'Xác nhận'), onready) {
    s.dialogOpen = true;
    return new Promise((resolve) => {
      const opener = document.activeElement,
        el = document.createElement('dialog');
      el.className = 'rf-modal';
      el.dataset.i18nSkip = 'true';
      el.setAttribute('aria-label', title);
      el.innerHTML = `<form><h2>${title}</h2>${body}<p class="rf-modal-error" role="alert"></p><div class="rf-actions"><button type="button" class="rf-btn" data-cancel>${t('取消', 'Hủy')}</button><button class="rf-btn primary" type="submit">${submit}</button></div></form>`;
      const close = (v) => {
        s.dialogOpen = false;
        el.close();
        el.remove();
        if (opener?.isConnected) opener.focus({preventScroll:true});
        resolve(v);
      };
      el.querySelector('[data-cancel]').onclick = () => close(null);
      el.oncancel = (e) => {
        e.preventDefault();
        close(null);
      };
      el.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const form = new FormData(e.target);
        if (el.querySelector('[name=job]') && !form.getAll('job').length) { el.querySelector('.rf-modal-error').textContent = t('請至少選取一個項目', 'Chọn ít nhất một hạng mục'); return; }
        close(form);
      };
      document.body.append(el);
      el.showModal();
      onready?.(el);
    });
  }
  async function reason(title) {
    const f = await dialog(
      title,
      `<label>${t('原因／說明', 'Lý do / mô tả')}<textarea name="reason" required rows="4"></textarea></label>`,
    );
    return f?.get('reason')?.trim();
  }
  async function act(action, el) {
    if (s.busy || s.dialogOpen) return;
    try {
      if (
        s.retry &&
        ![
          'retry',
          'back',
          'clear-filter',
          'expand-report',
          'refresh',
          'export',
        ].includes(action)
      )
        throw Error(
          t(
            '請先查證或重試上次未知結果，避免重複操作。',
            'Hãy kiểm tra hoặc thử lại thao tác chưa rõ kết quả trước.',
          ),
        );
      if (action === 'recall-retest') {
        const retest = followupState(selectedCase()).retest;
        if (!retest || status(retest) !== 'draft') throw Error(t('複測已更新，請重新開啟。','Thử lại đã thay đổi; mở lại.'));
        s.cancelConfirm = 'retest:' + retest.id; paint(); return;
      }
      if (action === 'open-retest') { const retest = followupState(selectedCase()).retest; if (retest) choose(retest.id,'documents'); return; }
      if (action === 'discard') { s.cancelConfirm = action + ':' + doc().id; paint(); return; }
      if (action === 'cancel-confirmation') { s.cancelConfirm = null; paint(); return; }
      if (action === 'expand-report') {
        s.wide = !s.wide;
        paint();
        return;
      }
      if (action === 'back') {
        s.wide = false;
        s.selected = null;
        paint();
        return;
      }
      if (action.startsWith('filter-')) {
        toggleHighlight(action.slice(7), 'cases');
        return;
      }
      if (action === 'clear-selection') {
        s.checked.clear();
        s.selectionNotice = '';
        paint();
        return;
      }
      if (action === 'clear-filter') {
        for (const k of [
          'query',
          'line',
          'category',
          'item',
          'outcome',
          'review',
          'caseState',
          'from',
          'to',
        ])
          s[k] = '';
        s.overdue = false;
        s.highlight = '';
        paint();
        return;
      }
      if (action.startsWith('add-result:')) {
        const current = doc();
        if (!current || status(current) !== 'draft' || !data.permissions.edit) return;
        const line = buffer(current).lines[Number(action.split(':')[1])], required = requiredForLine(current,line);
        const available = (required.length ? required : line.source.products.map(p => p.code)).filter(code => !line.results.some(r => r.samples.includes(code)));
        if (!available.length || line.results.length >= 100) { s.error = t('已無可新增的樣品；同一項目不可重複選樣。','Không còn mẫu; không chọn trùng trong một hạng mục.'); paint(); return; }
        const next = {id:id(),samples:required.length ? [available[0]] : [],outcome:'',value:'',notes:'',photos:[]};
        line.results.push(next); s.resultOpen.set(next.id,true);
        paint(); return;
      }
      if (action === 'remove-result') {
        buffer(doc()).lines[
          Number(el.closest('[data-line]').dataset.line)
        ].results.splice(Number(el.closest('[data-result]').dataset.result), 1);
        paint();
        return;
      }
      if (action === 'settings') {
        await settings();
        return;
      }
      if (action === 'export') {
        await exportDocument();
        return;
      }
      let command, extra;
      if (action === 'refresh') {
        await refresh();
        return;
      }
      if (action === 'retry') {
        command = s.retry;
        if (!command) return;
      } else if (action === 'create-plan')
        command = { action, jobIds: [...s.checked] };
      else if (action === 'create-report') {
        const d = doc(),
          available = content(d).lines.filter((l) => reportSlots(d).some((a) => a.jobId === l.jobId && a.assigned && !a.reportIds.length));
        if (!available.length)
          throw Error(
            t(
              '每項已有報告，請從計畫與報告繼續填寫。',
              'Đã có báo cáo cho mọi mục. Tiếp tục báo cáo hiện có.',
            ),
          );
        const f = await dialog(
          t('選擇本次填報項目', 'Chọn mục báo cáo lần này'),
          available
            .map(
              (l) =>
                `<label><span><input type="checkbox" name="job" value="${h(l.jobId)}" checked> ${h(l.source.name)}</span></label>`,
            )
            .join(''),
          t('建立執行報告', 'Tạo báo cáo'),
        );
        if (!f) return;
        command = { action, documentId: d.id, jobIds: f.getAll('job') };
      } else if (
        [
          'correct',
          'revoke-plan',
          'resolve-impact',
          'close',
          'improve',
        ].includes(action)
      ) {
        const text = await reason(label(action) || action);
        if (!text) return;
        command = {
          action,
          documentId: doc()?.id,
          caseId: selectedCase()?.id,
          reason: text,
          notes: text,
        };
      } else if (action.startsWith('followup-')) {
        const a = selectedCase(), kind = action.slice(9);
        let notes;
        if (kind === 'report') {
          if (followupState(a).open || followupState(a).retest) throw Error('FOLLOWUP_OPEN');
          const f = await dialog(
            t('改善並建立複測', 'Cải thiện và tạo thử lại'),
            '<p>' + t('原不合格、原樣品與歷次報告保留；確認後同時記錄改善並建立複測草稿。', 'Giữ kết quả không đạt, mẫu gốc và các báo cáo; xác nhận để ghi cải thiện và tạo nháp thử lại cùng lúc.') + '</p><label>' + t('本次改善措施／複測準備（必填）', 'Biện pháp cải thiện / chuẩn bị thử lại (bắt buộc)') + '<textarea name="notes" required rows="4"></textarea></label>',
            t('記錄改善並建立複測', 'Ghi cải thiện và tạo thử lại'),
          );
          notes = f?.get('notes')?.trim();
          if (!notes) return;
        }
        command = {action:'followup',caseId:a.id,kind,...(notes ? {notes} : {})};
      }
      else if (action === 'submit') extra = { savedId: doc().flow.saved?.id, reason: '' };
      else if (action === 'review') { openReview(doc()); return; }
      else if (action === 'approve' || action === 'return') {
        const pending = doc().flow.cases.find((c) => c.id === doc().flow.pendingId);
        if (!pending || (s.reviewCase && pending.id !== s.reviewCase)) throw Error(t('案件已更新，請重新開啟', 'Hồ sơ đã đổi; mở lại'));
        const self = pending.actor.id === data.identity.id;
        if (self && data.identity.role !== 'admin') throw Error('SELF_REVIEW_ADMIN_ONLY');
        if (self && s.selfReview !== pending.id) throw Error(t('請勾選確認自審此案件', 'Xác nhận tự duyệt hồ sơ này'));
        const reason = root.querySelector('[data-return-reason]')?.value.trim() || '';
        if (action === 'return' && !reason) throw Error(t('發回必須說明需修正內容', 'Trả lại cần mô tả nội dung cần sửa'));
        extra = { caseId: pending.id, selfReviewConfirmed: self && s.selfReview === pending.id, reason: action === 'return' ? reason : '' };
      } else if (action === 'withdraw') extra = { caseId: doc().flow.pendingId, reason: '' };
      else if (action === 'confirm-recall-retest') {
        const retest = followupState(selectedCase()).retest;
        if (!retest || status(retest) !== 'draft' || s.cancelConfirm !== 'retest:' + retest.id) throw Error(t('複測已更新，請重新確認。','Thử lại đã thay đổi; xác nhận lại.'));
        command = {action:'discard-draft', documentId:retest.id};
      }
      else if (action === 'confirm-cancel') command = { action: status(doc()) === 'approved' ? 'delete-plan' : 'discard-draft', documentId: doc().id };
      s.busy = true;
      paint();
      const result = command
        ? await post(
            action === 'retry'
              ? command
              : {
                  ...command,
                  expectedRevision:
                    command.expectedRevision ?? data.control.revision,
                },
          )
        : action === 'save'
          ? await save()
          : await draft(action, extra);
      if (
        action === 'retry' &&
        command?.action === 'draft' &&
        command.command.action === 'apply'
      ) {
        const base = s.bases.get(command.documentId);
        if (base)
          for (const p of command.command.patches || []) {
            if (p.path.length === 1) base[p.path[0]] = clone(p.value);
            else
              base.lines.find((l) => l.id === p.path[1].id).results = clone(
                p.value,
              );
          }
      }
      if (result?.documentId && !['followup-report','confirm-recall-retest'].includes(action) && !(action === 'retry' && s.tab === 'cases' && ['followup','discard-draft'].includes(command?.action))) {
        s.selected = result.documentId;
        s.tab = 'documents';
        s.checked.clear();
      }
      if (['approve', 'return', 'withdraw'].includes(action)) {
        s.buffers.delete(s.selected);
        s.bases.delete(s.selected);
      }
      if (command?.action === 'discard-draft') { s.buffers.delete(command.documentId); s.bases.delete(command.documentId); }
      s.cancelConfirm = null;
      s.error = '';
      await refresh();
      if (doc()) { s.tab = documentTab(doc()); s.cancelConfirm = null; s.selfReview = null; paint(); }
    } catch (e) {
      if (['JOB_ALREADY_ASSIGNED','FOLLOWUP_OPEN','IMPROVEMENT_REQUIRED','REVISION_CONFLICT'].includes(e.message)) {
        try {
          await refresh();
        } catch {
          /* Keep the original error and inputs. */
        }
      }
      fault(e);
    } finally {
      s.busy = false;
      paint();
    }
  }
  async function settings() {
    const locked = data.control.documents.length > 0;
    const f = await dialog(
      t('FQC 排程設定', 'Thiết lập lịch FQC'),
      `<p>${t('依公司曆週／月／季／半年／年安排。既有工作保留，未知頻率不推算。', 'Theo tuần / tháng / quý / nửa năm / năm. Giữ công việc cũ; không suy đoán tần suất.')}</p><label>${t('管理起始日', 'Ngày bắt đầu quản lý')}<input type="date" name="start" required value="${h(data.control.startDate || data.today)}" ${locked ? 'readonly' : ''}></label><button type="button" class="rf-btn" data-preview>${t('預覽首次應檢與下次頻率交接', 'Xem trước lịch và chuyển tần suất')}</button><div class="rf-preview" aria-live="polite"></div><p>${locked ? t('已有工作；起始日已鎖定。頻率請於原 FQC 標準核准變更。', 'Đã có công việc; khóa ngày bắt đầu. Đổi tần suất qua tiêu chuẩn FQC.') : t('必須預覽後確認啟用。', 'Phải xem trước trước khi kích hoạt.')}</p>`,
      locked ? t('關閉', 'Đóng') : t('確認啟用', 'Xác nhận kích hoạt'),
      (el) => {
        const submit = el.querySelector('[type=submit]');
        submit.disabled = !locked;
        el.querySelector('[name=start]').oninput = () =>
          (submit.disabled = true);
        el.querySelector('[data-preview]').onclick = async () => {
          try {
            const preview = await read(
              '?preview=1&start=' + el.querySelector('[name=start]').value,
            );
            el.querySelector('.rf-preview').innerHTML =
              `<table class="rf-table"><tr><th>${t('項目', 'Hạng mục')}</th><th>${t('首次適用期別／期限', 'Kỳ áp dụng / hạn')}</th></tr>${preview.jobs.map((j) => `<tr><td>${h(j.source.name)}</td><td>${h(j.start + ' — ' + j.end)}</td></tr>`).join('')}</table>${preview.unresolved.map((v) => `<p>⚠ ${h(v.name + ' · ' + v.frequencyText)} · ${t('待確認頻率', 'Cần xác nhận tần suất')}</p>`).join('')}`;
            submit.disabled = false;
          } catch (e) {
            el.querySelector('.rf-preview').textContent = e.message;
          }
        };
      },
    );
    if (!f || locked) return;
    s.busy = true;
    try {
      await post({
        action: 'configure',
        startDate: f.get('start'),
        expectedRevision: data.control.revision,
      });
      await refresh(true);
    } finally {
      s.busy = false;
      paint();
    }
  }
  async function exportDocument() {
    const out = await read('?export=' + encodeURIComponent(doc().id)),
      c = out.content;
    const all = [
        ...new Set([
          ...c.evidence,
          ...c.lines.flatMap((l) => l.results.flatMap((r) => r.photos)),
        ]),
      ],
      images = {};
    for (const p of all) {
      const r = await fetch(endpoint + '/photo?id=' + p);
      if (!r.ok) throw Error('EXPORT_PHOTO_FAILED');
      const blob = await r.blob();
      images[p] = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || Error('EXPORT_PHOTO_READ_FAILED'));
        reader.onabort = () => reject(Error('EXPORT_PHOTO_READ_ABORTED'));
        reader.readAsDataURL(blob);
      });
    }
    const page = `<!doctype html><html lang="${document.documentElement.lang}"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${h(displayNumber(out.document))}</title><style>body{font:15px system-ui;max-width:1100px;margin:40px auto;color:#234}section{border:1px solid #ccd;padding:20px;margin:20px 0}img{max-width:240px;max-height:200px}pre{white-space:pre-wrap}</style><h1>${h(displayNumber(out.document))}</h1>${legacyNumber(out.document)}<h2>${h(c.title)}</h2><p>${h(c.date)} · ${h(out.document.flow.active.id)} · Asia/Ho_Chi_Minh</p>${c.lines.map((l) => `<section><h2>${h(l.source.name)}</h2><p>${h(l.source.code + ' / ' + l.source.version)}</p>${coverage(l.source)}${l.requiredSamples?.length ? `<p>${t('本份文件應複測樣品（不代表本次已實測）', 'Mẫu cần thử lại của hồ sơ (không có nghĩa đã thử lần này)')}: ${h(l.requiredSamples.join(', '))}</p>` : ''}<pre>${h(l.source.description)}</pre>${l.results.map((r) => `<hr><b>${label(r.outcome)}</b><p>${t('實測樣品', 'Mẫu thực thử')}: ${h(r.samples.join(', ') || '—')}</p><pre>${h(r.value + '\n' + r.notes)}</pre>${r.photos.map((p) => `<img src="${images[p]}" alt="${h(p)}">`).join('')}`).join('')}</section>`).join('')}<pre>${h(c.notes + '\n' + c.reason + '\n' + c.disposition)}</pre>${c.evidence.map((p) => `<img src="${images[p]}">`).join('')}<h2>${t('審核紀錄', 'Lịch sử duyệt')}</h2><pre>${h(
      JSON.stringify(
        out.document.flow.cases.map((a) => ({
          id: a.id,
          status: a.status,
          actor: a.actor,
          at: a.at,
          reason: a.reason,
          review: a.result,
        })),
        null,
        2,
      ),
    )}</pre></html>`;
    const a = document.createElement('a'),
      url = URL.createObjectURL(
        new Blob([page], { type: 'text/html;charset=utf-8' }),
      );
    a.href = url;
    a.download = out.document.number + '.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const reportType = (d) => d.kind !== 'report' ? d.kind : d.caseId ? 'retest' : d.correctionOf ? 'correction' : 'initial';
  const reportLabel = (d) => reportType(d) === 'retest' ? t('複測報告','Báo cáo thử lại') : reportType(d) === 'correction' ? t('更正報告','Báo cáo sửa đổi') : d.kind === 'report' ? t('初測報告','Báo cáo lần đầu') : label(d.kind);
  const displayNumber = (d) => d.kind === 'report' && (d.caseId || d.correctionOf) ? d.number.replace('FQC-RPT-', d.caseId ? 'FQC-RTS-' : 'FQC-COR-') : d.number;
  const legacyNumber = (d) => displayNumber(d) !== d.number ? '<small class="rf-legacy-number">' + t('原編號：','Mã gốc: ') + h(d.number) + '</small>' : '';
  const kindTag = (d) => '<span class="rf-document-kind ' + reportType(d) + '">' + (d.kind === 'report' ? d.caseId ? 'RTS' : d.correctionOf ? 'COR' : 'RPT' : {plan:'PLN',disposal:'DSP',waiver:'WVR'}[d.kind]) + ' · ' + h(reportLabel(d)) + '</span>';
  function documentStage(d, jobId) {
    const state = status(d), name = reportLabel(d);
    let text, next = '', links = '';
    if (state === 'cancelled') text = name + ' · ' + t('已捨棄，歷史保留', 'Đã bỏ, giữ lịch sử');
    else if (state === 'draft') { text = name + ' · ' + t('草稿尚未送審', 'Bản nháp chưa gửi duyệt'); next = t('下一步：完成內容 → 儲存草稿 → 送出審核', 'Bước tiếp: hoàn tất → lưu bản nháp → gửi duyệt'); }
    else if (state === 'pending') { text = name + ' · ' + t('已送審，等待核准', 'Đã gửi, chờ duyệt'); next = t('下一步：等待審核；需修改時撤回送審', 'Bước tiếp: chờ duyệt; rút hồ sơ nếu cần sửa'); }
    else if (d.kind === 'plan') {
      const {related,available} = planReportState(d,jobId);
      text = available ? (related.length ? t('計畫已核准 · 部分報告尚待建立','Kế hoạch đã duyệt · còn mục chưa tạo báo cáo') : t('計畫已核准 · 尚未建立報告','Kế hoạch đã duyệt · chưa tạo báo cáo')) : related.length ? t('計畫已核准 · 已建立報告','Kế hoạch đã duyệt · đã tạo báo cáo') : t('計畫已核准 · 無可填報項目','Kế hoạch đã duyệt · không còn mục để báo cáo');
      links = (available ? '<button type="button" class="rf-btn rf-stage-create" data-plan-report="' + h(d.id) + '" ' + (!data.permissions.edit ? 'disabled' : '') + '>' + t('需要建立報告','Cần tạo báo cáo') + '</button>' : '') + related.map((r) => '<button type="button" class="rf-report-link" data-doc="' + h(r.id) + '">' + t('開啟報告','Mở báo cáo') + ' · ' + h(r.number) + '</button>').join('');
      next = available ? t('待建立執行報告：', 'Cần tạo báo cáo: ') + available + t(' 項', ' hạng mục') : related.some((r) => status(r) === 'draft') ? t('報告草稿未送審，請接續填寫', 'Bản nháp báo cáo chưa gửi, tiếp tục nhập') : related.some((r) => status(r) === 'pending') ? t('報告已送審，等待核准', 'Báo cáo đã gửi, chờ duyệt') : related.length ? t('報告已核准；異常結案另行確認', 'Báo cáo đã duyệt; đóng bất thường riêng') : t('請查看目前所屬計畫／異常後續', 'Xem kế hoạch hiện tại / theo dõi bất thường');
    } else {
      text = name + ' · ' + t('已完成審核', 'Đã hoàn tất duyệt');
      const cases = data.control.cases.filter((a) => a.reportIds.includes(d.id) || a.id === d.caseId);
      next = cases.some((a) => !done(a)) ? (cases.some((a) => a.status === 'ready-close') ? t('異常待確認結案', 'Bất thường chờ xác nhận đóng') : t('異常未結案，待改善／複測／處置', 'Bất thường chưa đóng, cần cải thiện / thử lại / xử lý')) : d.kind === 'waiver' ? t('本期已核准免做，免做不等於合格', 'Đã miễn kỳ này; miễn không có nghĩa đạt') : d.kind === 'disposal' ? t('處置已核准，保留原不合格紀錄', 'Xử lý đã duyệt, giữ lịch sử không đạt') : t('正式報告已留存', 'Đã lưu báo cáo chính thức');
    }
    return '<div class="rf-stage ' + state + '"><b>' + h(text) + '</b>' + (next ? '<small>' + h(next) + '</small>' : '') + (links ? '<div class="rf-stage-links">' + links + '</div>' : '') + '</div>';
  }
  function workFilters() {
    const rows = (s.tab === 'history' ? docs() : primaryDocuments()).filter((d) => (s.tab !== 'plans' || d.kind === 'plan') && (s.tab !== 'reports' || d.kind !== 'plan') && (!s.documentKind || d.kind === s.documentKind) && matches(content(d).lines,d));
    return '<nav class="rf-work-filters" aria-label="' + t('完成進度','Tiến độ hoàn thành') + '">' + [['',t('全部','Tất cả')],['draft',t('草稿未送審','Nháp chưa gửi')],['pending',t('已送審','Đã gửi duyệt')],['approved',t('已完成審核','Đã duyệt')]].map(([key,text]) => '<button type="button" class="rf-btn ' + (s.workState === key ? 'primary' : '') + '" data-work-state="' + key + '">' + text + ' · ' + rows.filter((d) => !key || status(d) === key).length + '</button>').join('') + '</nav>';
  }
  function retestGuidance(d,l) {
    if (d.kind !== 'report') return '';
    const samples = requiredForLine(d,l), a = caseForLine(d,l), previous = docs().find(o => o.id === a?.originReportId || o.id === d.correctionOf);
    if (!samples.length && !previous) return '';
    return '<div class="rf-notice rf-required-samples"><b>' + t('請用原樣品檢查：','Kiểm tra bằng mẫu gốc: ') + h(sampleNames(l,samples) || '—') + '</b>' + (previous ? '<button class="rf-report-link" data-doc="' + h(previous.id) + '">' + t('查看原報告','Xem báo cáo gốc') + ' · ' + h(displayNumber(previous)) + '</button>' : '') + '<small>' + t('原樣品固定；本次結果另填，原報告保留。無法測試請填原因。','Giữ nguyên mẫu gốc; nhập kết quả lần này riêng, giữ báo cáo cũ. Nếu không thể thử, ghi lý do.') + '</small></div>';
  }
  function preferredReport(key) {
    const original = docs().find((o) => o.id === key);
    return liveDocs().filter((o) => o.kind === 'report' && o.familyId === original?.familyId).sort((a,b) => ({draft:0,pending:1,approved:2}[status(a)] - {draft:0,pending:1,approved:2}[status(b)]) || b.createdAt.localeCompare(a.createdAt))[0] || original;
  }
  function reportKinds() {
    return `<nav class="rf-kind-tabs" aria-label="${t('報告分類', 'Loại báo cáo')}">${[['', t('全部', 'Tất cả')], ['report', 'RPT · ' + label('report')], ['waiver', 'WVR · ' + label('waiver')], ['disposal', 'DSP · ' + label('disposal')]].map(([key, text]) => `<button type="button" class="rf-btn ${s.documentKind === key ? 'primary' : ''}" data-rf-tone="${key === 'report' ? 'initial' : key}" data-kind="${key}">${text}</button>`).join('')}</nav>`;
  }
  function localMissing(c, d) {
    const issues = [], add = (path, message) => issues.push({ path, message });
    if (!c.title.trim()) add(['title'], 'TITLE_REQUIRED');
    if (!c.date) add(['date'], 'DATE_REQUIRED');
    if (d.kind === 'report') for (const l of c.lines) for (const r of l.results) {
      const p = ['lines', { id: l.id }, 'results', { id: r.id }];
      if (!r.outcome) add([...p, 'outcome'], 'RESULT_REQUIRED');
      if (r.outcome !== 'unable' && !r.samples.length) add([...p, 'samples'], 'SAMPLES_REQUIRED');
      if (r.samples.length > 1) add([...p,'samples'],'SINGLE_SAMPLE_REQUIRED');
      if (r.outcome === 'pass' && !r.value.trim()) add([...p, 'value'], 'ACTUAL_RESULT_REQUIRED');
      if (['fail', 'unable', 'undetermined'].includes(r.outcome) && !r.notes.trim()) add([...p, 'notes'], 'EXPLANATION_REQUIRED');
      if (['fail', 'undetermined'].includes(r.outcome) && !r.photos.length) add([...p, 'photos'], 'UPLOADED_PHOTO_REQUIRED');
    }
    if (d.kind === 'report') for (const l of c.lines) {
      if (requiredForLine(d,l).length && l.results.some(r => r.samples.some(code => !requiredForLine(d,l).includes(code)))) add(['lines',{id:l.id},'samples'],'RETEST_SAMPLE_FIXED');
      if (!l.results.some((r) => r.outcome === 'unable') && requiredForLine(d,l).some((code) => !l.results.flatMap((r) => r.samples).includes(code))) add(['lines',{id:l.id},'samples'],'RETEST_REQUIRED_SAMPLES');
      for (const r of l.results) if (new Set(r.samples).size !== r.samples.length || r.samples.some((code) => !l.source.products.some((p) => p.code === code) || l.results.some(other => other.id !== r.id && other.samples.includes(code)))) add(['lines',{id:l.id},'results',{id:r.id},'samples'],'SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE');
    }
    if (['waiver', 'disposal'].includes(d.kind) && !c.reason.trim()) add(['reason'], 'REASON_REQUIRED');
    if (d.kind === 'disposal') {
      if (!c.disposition.trim()) add(['disposition'], 'DISPOSITION_REQUIRED');
      if (!c.evidence.length) add(['evidence'], 'EVIDENCE_REQUIRED');
    }
    return issues;
  }
  function issuePanels(d, c) {
    s.issueTargets = [];
    const business = new Set(['TITLE_REQUIRED', 'DATE_REQUIRED', 'ITEM_REQUIRED', 'RESULT_REQUIRED', 'SAMPLES_REQUIRED', 'SINGLE_SAMPLE_REQUIRED', 'RETEST_SAMPLE_FIXED', 'ACTUAL_RESULT_REQUIRED', 'EXPLANATION_REQUIRED', 'UPLOADED_PHOTO_REQUIRED', 'RETEST_REQUIRED_SAMPLES', 'SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE', 'REASON_REQUIRED', 'DISPOSITION_REQUIRED', 'EVIDENCE_REQUIRED']);
    const invalid = new Set(['SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE','SINGLE_SAMPLE_REQUIRED','RETEST_SAMPLE_FIXED']);
    const local = localMissing(c,d).filter(i => status(d) !== 'approved' || !invalid.has(i.message)), missing = local.filter(i => !invalid.has(i.message)), errors = [...local.filter(i => invalid.has(i.message)), ...s.issues.filter(i => !business.has(i.message) || invalid.has(i.message))];
    for (const i of s.issues.filter((i) => business.has(i.message) && i.message !== 'RETEST_REQUIRED_SAMPLES' && !invalid.has(i.message))) if (!missing.some((m) => JSON.stringify(m.path) === JSON.stringify(i.path) && m.message === i.message)) missing.push(i);
    const render = (issues) => issues.map((i) => {
      const index = s.issueTargets.push(i) - 1;
      return `<div class="rf-issue-row"><span>${h(issueText(i))}</span>${btn('focus-issue', t('前往修改', 'Đến mục cần sửa'), !i.path?.length, '') .replace('data-action="focus-issue"', `data-issue-index="${index}"`)}</div>`;
    }).join('');
    return `<div class="rf-errors">${render(errors)}</div><div class="rf-missing">${render(missing)}${dirty(d) && d.savedIssues?.length ? `<p class="rf-subtle">${t('以上為目前輸入；已存草稿仍有待補項目，修正後請儲存再送審。', 'Nội dung trên là dữ liệu đang nhập; bản đã lưu còn thiếu. Lưu lại trước khi gửi duyệt.')}</p>` : ''}</div>`;
  }
  function updateRoutineIssues(d,c) {
    const temporary = document.createElement('div'); temporary.innerHTML = issuePanels(d,c);
    for (const kind of ['errors','missing']) {
      const node = root.querySelector('.rf-document .rf-' + kind), fresh = temporary.querySelector('.rf-' + kind);
      if (!node || !fresh) continue;
      node.replaceChildren(...fresh.childNodes);
      const section = node.closest('.vd-issues'), count = node.querySelectorAll('.rf-issue-row').length;
      section?.classList.toggle('rf-no-issues',!count);
      if (section?.querySelector('h3')) section.querySelector('h3').textContent = t(kind === 'errors' ? '報錯' : '待補資料',kind === 'errors' ? 'Lỗi' : 'Dữ liệu cần bổ sung') + ' · ' + count;
    }
    root.querySelectorAll('[data-issue-index]').forEach((button) => button.onclick = () => focusIssue(s.issueTargets[Number(button.dataset.issueIndex)]));
  }
  function focusIssue(issue) {
    const parts = issue?.path || [], ids = parts.filter((p) => typeof p === 'object').map((p) => p.id), field = parts.at(-1);
    let target = root.querySelector('.rf-document');
    if (ids[0]) target = [...root.querySelectorAll('[data-line-id]')].find((e) => e.dataset.lineId === ids[0]) || target;
    if (ids[1]) target = [...target.querySelectorAll('[data-result-id]')].find((e) => e.dataset.resultId === ids[1]) || target;
    if (target.matches?.('.rf-result')) target.open = true;
    let input;
    if (issue.message === 'RETEST_REQUIRED_SAMPLES') { const guidance = target.querySelector('.rf-required-samples'); input = guidance; }
    else if (field === 'samples') { const details = target.querySelector('.rf-samples'); if (details) details.open = true; input = target.querySelector('[data-sample-search], [data-sample]'); }
    else if (field === 'outcome') input = target.querySelector('[data-outcome]');
    else if (field === 'photos' || field === 'evidence') input = target.querySelector(field === 'evidence' ? '[data-upload="evidence"]' : '[data-upload="result"]');
    else input = [...target.querySelectorAll('[data-field], [data-result-field]')].find((e) => e.dataset.field === field || e.dataset.resultField === field);
    const focus = input?.matches('[data-upload]') ? input.closest('.rf-upload') : input || target;
    focus.tabIndex = focus.tabIndex < 0 ? 0 : focus.tabIndex;
    focus.scrollIntoView({ block: 'center', behavior: 'smooth' });
    focus.focus({ preventScroll: true });
    focus.classList.add('rf-needs-attention');
    setTimeout(() => focus.classList.remove('rf-needs-attention'), 2500);
  }
  function dependencyLinks(d, excluded = []) {
    return [...(d.dependencies?.documents || []).filter((key) => !excluded.includes(key)).map((key) => `<button class="rf-report-link" data-doc="${h(key)}">${h(docs().find((o) => o.id === key)?.number || key)}</button>`), ...(d.dependencies?.cases || []).map((key) => `<button class="rf-report-link" data-case="${h(key)}">${h(data.control.cases.find((o) => o.id === key)?.number || key)}</button>`)].join(' ');
  }
  function cancellationPanel(d) {
    if (status(d) === 'cancelled') return `<div class="rf-notice">${tag('cancelled')} ${t('此文件已捨棄，不能復原。請建立新文件。', 'Hồ sơ đã bỏ, không thể khôi phục. Hãy tạo hồ sơ mới.')}</div>`;
    if (s.cancelConfirm !== 'discard:' + d.id) return '';
    const blocked = (d.dependencies?.documents.length || d.dependencies?.cases.length);
    return `<div class="rf-inline-confirm">${blocked ? t('已有相依文件，無法刪除：', 'Có hồ sơ phụ thuộc; không thể xóa:') + dependencyLinks(d) : t('確認捨棄？捨棄後不能復原，可重新選取項目建立新文件。', 'Bỏ hồ sơ? Không thể khôi phục; có thể chọn hạng mục để tạo hồ sơ mới.')}${btn('confirm-cancel', t('確認捨棄', 'Xác nhận bỏ'), !!blocked, 'danger')}${btn('cancel-confirmation', t('取消', 'Hủy'))}</div>`;
  }
  function planActions(d) {
    const slots = reportSlots(d), ids = [...new Set(slots.flatMap((a) => a.reportIds).map((key) => preferredReport(key)?.id || key))], available = slots.some((a) => a.assigned && !a.reportIds.length);
    return `${!available && !ids.length ? '<div class="rf-notice">' + t('此計畫沒有可建立初測報告的項目；項目已改由其他計畫管理或異常已終止。請查看目前計畫／後續文件。','Kế hoạch không còn hạng mục tạo báo cáo ban đầu; đã chuyển kế hoạch hoặc bất thường đã kết thúc. Xem kế hoạch / hồ sơ hiện tại.') + content(d).lines.map((l) => { const j = data.control.jobs.find((j) => j.id === l.jobId), current = docs().find((p) => p.id === j?.planId); return current && current.id !== d.id ? '<button class="rf-report-link" data-doc="' + h(current.id) + '">' + t('開啟目前計畫','Mở kế hoạch hiện tại') + ' · ' + h(current.number) + '</button>' : ''; }).join('') + (d.caseId ? '<button class="rf-report-link" data-case="' + h(d.caseId) + '">' + t('查看異常與歷次報告','Xem bất thường và các báo cáo') + '</button>' : '') + '</div>' : ''}${available ? btn('create-report', t('＋ 建立執行報告', '＋ Tạo báo cáo'), !data.permissions.edit, 'primary') : ''}${ids.map((key) => `<button class="rf-btn" data-doc="${h(key)}">${t('接續報告', 'Tiếp tục báo cáo')} · ${h(docs().find((o) => o.id === key)?.number || key)}</button>`).join('')}${btn('discard', t('刪除計畫', 'Xóa kế hoạch'), !data.permissions.revoke, 'danger')}${dependencyLinks(d, ids) ? `<small>${t('相依文件保留，刪除將受保護：', 'Giữ hồ sơ phụ thuộc, bảo vệ khi xóa:')}${dependencyLinks(d, ids)}</small>` : ''}<details><summary>${t('計畫版本歷史', 'Lịch sử phiên bản kế hoạch')}</summary>${docs().filter((o) => o.kind === 'plan' && o.familyId === d.familyId && o.id !== d.id).map((o) => `<button class="rf-report-link" data-doc="${h(o.id)}">${h(o.number)} · ${label(status(o))}</button>`).join('')}</details>`;
  }
  function approvalPanel(d) {
    if (!s.reviewPlatform || status(d) !== 'pending') return '';
    const pending = d.flow.cases.find((c) => c.id === d.flow.pendingId), self = pending?.actor.id === data.identity.id, admin = data.identity.role === 'admin', stale = s.reviewCase && s.reviewCase !== pending?.id;
    return `<section class="rf-approval"><h3>${t('確認整份送審案件', 'Duyệt toàn bộ hồ sơ gửi')}</h3><p>${t('以下為送審時固定內容，審核不受清單篩選影響。', 'Nội dung cố định lúc gửi; bộ lọc không giới hạn phạm vi duyệt.')}</p><small>${h(pending?.id)} · ${h(pending?.actor.name)} · ${h(pending?.at)}</small>${stale ? `<p role="alert">${t('原案件已更新，請重新選取目前案件。', 'Hồ sơ đã đổi; chọn lại hồ sơ hiện tại.')}</p>` : ''}${self ? `<label class="rf-self-review"><input type="checkbox" data-self-review ${s.selfReview === pending?.id ? 'checked' : ''} ${admin ? '' : 'disabled'}>${admin ? t('我確認自審此送審案件，並留下操作紀錄', 'Tôi xác nhận tự duyệt hồ sơ này và lưu nhật ký') : t('一般帳號不可自審', 'Tài khoản thường không được tự duyệt')}</label>` : ''}<div class="rf-actions">${btn('approve', t('確認核准', 'Xác nhận duyệt'), stale || !data.permissions.approve || (self && (!admin || s.selfReview !== pending?.id)), 'primary')}</div>${data.permissions.return ? `<label>${t('發回修正意見（必填）', 'Ý kiến trả lại (bắt buộc)')}<textarea data-return-reason></textarea></label>${btn('return', t('發回修正', 'Trả lại sửa'), stale || (self && (!admin || s.selfReview !== pending?.id)))}` : ''}</section>`;
  }
  function openReview(d) {
    s.selected = d.id; s.reviewCase = d.flow.pendingId; s.selfReview = null;
    state.approvalTab = 'routine';
    const url = new URL(location.href); url.searchParams.set('approvalTab', 'routine'); url.searchParams.set('rfDocument', d.id); if (d.flow.pendingId) url.searchParams.set('rfCase', d.flow.pendingId);
    history.replaceState(null, '', url);
    window.ProcessDualSystem.go('approval');
  }
  function reviewHTML() {
    return `<section id="review-routine-fqc" class="rf-app" data-i18n-skip="true"><div class="rf-empty">${t('載入例行檢查送審…', 'Đang tải hồ sơ định kỳ…')}</div></section>`;
  }
  function paintReview() {
    const pending = liveDocs().filter((d) => status(d) === 'pending');
    const names = ['FQC', 'IQC', t('模具設備', 'Thiết bị khuôn'), t('檢具與測試設備', 'Dưỡng và thiết bị thử')];
    root.innerHTML = `<header class="rf-hero"><div><div class="rf-eyebrow">ROUTINE INSPECTION APPROVAL</div><h2>${t('例行檢查送審', 'Duyệt kiểm tra định kỳ')}</h2><p>${t('計畫、執行報告／複測、免做與處置分別確認。', 'Duyệt riêng kế hoạch, báo cáo / thử lại, miễn và xử lý.')}</p></div>${btn('refresh', t('重新整理', 'Làm mới'))}</header><nav class="rf-modules">${names.map((name, i) => `<button type="button" class="${s.reviewModule === (i ? String(i) : 'FQC') ? 'active' : ''}" data-review-module="${i ? i : 'FQC'}">${name} ${t('例行檢查', 'định kỳ')}${i ? '' : ' · ' + pending.length}</button>`).join('')}</nav>${s.reviewModule !== 'FQC' ? `<div class="rf-empty">${t('功能建置中，尚無送審案件', 'Đang xây dựng, chưa có hồ sơ gửi duyệt')}</div>` : `<div class="rf-main">${s.error ? `<div class="rf-notice error" role="alert">${h(s.error)}</div>` : ''}<div class="rf-kind-tabs">${[['',t('全部', 'Tất cả')],['plan',label('plan')],['report',t('執行報告／複測', 'Báo cáo / thử lại')],['waiver',label('waiver')],['disposal',label('disposal')]].map(([key,text]) => `<button class="rf-btn ${s.documentKind === key ? 'primary' : ''}" data-kind="${key}">${text} · ${pending.filter((d) => !key || d.kind === key).length}</button>`).join('')}</div><div class="rf-layout has-selection"><section class="rf-panel"><div class="rf-panel-heading">${t('待審案件', 'Hồ sơ chờ duyệt')}</div><div class="rf-review-list">${pending.filter((d) => !s.documentKind || d.kind === s.documentKind).map((d) => `<button class="rf-review-card ${d.id === s.selected ? 'selected' : ''}" data-review-doc="${h(d.id)}"><b class="rf-number ${reportType(d)}">${h(displayNumber(d))}</b><span>${reportLabel(d)}${d.caseId ? ' · ' + t('異常後續', 'Theo dõi bất thường') : ''}</span><small>${h(d.flow.cases.find((c) => c.id === d.flow.pendingId)?.actor.name)} · ${h(content(d).date)}</small></button>`).join('') || `<p class="rf-empty">${t('目前無待審案件', 'Không có hồ sơ chờ duyệt')}</p>`}</div><details class="rf-review-history"><summary>${t('已處理與歷史', 'Đã xử lý & lịch sử')}</summary>${liveDocs().filter((d) => status(d) !== 'pending' && (!s.documentKind || d.kind === s.documentKind)).slice().reverse().map((d) => `<button class="rf-review-card" data-review-doc="${h(d.id)}"><b class="rf-number ${reportType(d)}">${h(displayNumber(d))}</b><span>${reportLabel(d)} · ${label(status(d))}</span></button>`).join('')}</details></section><section class="rf-panel rf-detail-panel"><div class="rf-detail">${doc() ? documentDetail(doc()) : empty()}</div></section></div></div>`}`;
    bind(); mountDraft();
    root.querySelectorAll('[data-review-doc]').forEach((b) => b.onclick = () => {
      s.selected = b.dataset.reviewDoc; s.reviewCase = doc().flow.pendingId; s.selfReview = null; s.cancelConfirm = null;
      const url = new URL(location.href); url.searchParams.set('rfDocument', s.selected); if (s.reviewCase) url.searchParams.set('rfCase', s.reviewCase); else url.searchParams.delete('rfCase'); history.replaceState(null, '', url); paint();
    });
    root.querySelectorAll('button').forEach((b) => { if (s.busy) b.disabled = true; });
  }
  async function bindReview(container) {
    const area = container?.querySelector('#review-routine-fqc'); if (!area) return;
    root = area; s.reviewPlatform = true; s.tab = 'documents';
    const url = new URL(location.href);
    if (url.searchParams.get('rfDocument')) s.selected = url.searchParams.get('rfDocument');
    s.reviewCase = url.searchParams.get('rfCase'); s.selfReview = null;
    try { const next = await read(); if (!data || next.identity.id !== data.identity.id || next.control.revision >= data.control.revision) data = next; paint(); updatePendingBadge(); } catch (e) { fault(e); }
  }
  function updatePendingBadge() {
    const count = liveDocs().filter((d) => status(d) === 'pending').length;
    const badge = document.querySelector('#approval-tab-routine .approval-tab-count'); if (badge) badge.textContent = count;
  }
  async function refreshPending() { if (s.reviewPlatform || s.busy) return; try { const next = await read(); const badge = document.querySelector('#approval-tab-routine .approval-tab-count'); if (badge) badge.textContent = next.control.documents.filter((d) => !d.cancelled && d.flow.pendingId).length; } catch {} }

  window.RoutineFQCUI = {
    html,
    mount,
    reviewHTML,
    bindReview,
    refreshPending,
    pendingCount: () => docs().filter((d) => status(d) === 'pending').length,
    historyForItem: (item) => {
      s.line = '';
      s.category = '';
      s.query = '';
      s.outcome = '';
      s.review = '';
      s.caseState = '';
      s.from = '';
      s.to = '';
      s.item = item;
      pendingHistoryItem = item;
      s.tab = 'history';
      s.selected = null;
      window.ProcessDualSystem.go('quality-inspections');
    },
  };
  window.addEventListener('process-language-change', () => paint());
  // Read-only synchronization does not replace unsaved local fields. A subsequent
  // Save uses per-field guards and the server's current shared-document revision.
  setInterval(async () => {
    if (
      !root?.isConnected ||
      s.busy ||
      s.retry ||
      document.hidden ||
      document.querySelector('dialog[open]')
    )
      return;
    try {
      let next = await read();
      if (data && next.identity.id === data.identity.id && next.control.revision < data.control.revision) return;
      const scheduleChanged =
        next.today !== data?.today ||
        JSON.stringify(next.sources) !== JSON.stringify(data?.sources);
      const catalogChanged =
        JSON.stringify(next.catalog) !== JSON.stringify(data?.catalog);
      if (scheduleChanged && s.tab !== 'history' && next.permissions.edit && next.control.startDate) {
        await post({ action: 'generate' });
        next = await read();
      }
      if (
        next.control.revision === data?.control.revision &&
        !scheduleChanged &&
        !catalogChanged
      )
        return;
      for (const d of docs())
        if (!dirty(d)) {
          s.buffers.delete(d.id);
          s.bases.delete(d.id);
        }
      data = next;
      reconcileSelection();
      if (!docs().some((d) => dirty(d))) paint();
    } catch {
      const status = root.querySelector('[data-vd-sync]');
      if (status)
        status.textContent = t(
          '同步失敗；輸入保留，可重試',
          'Đồng bộ thất bại; giữ dữ liệu nhập, có thể thử lại',
        );
    }
  }, 15000);
  window.addEventListener('beforeunload', (e) => {
    if (docs().some((d) => dirty(d))) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
