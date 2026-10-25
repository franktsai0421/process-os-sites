/* Read-only FQC search projections. No document, job or source mutation. */
export const normalize = (value) =>
  String(value ?? '')
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase();
export const searchKind = (d) =>
  d.kind === 'report'
    ? d.caseId
      ? 'retest'
      : d.correctionOf
        ? 'correction'
        : 'initial'
    : d.kind;
export const searchNumber = (d) =>
  d.kind === 'report' && /-RPT-/.test(d.number) && (d.caseId || d.correctionOf)
    ? d.number.replace('-RPT-', d.caseId ? '-RTS-' : '-COR-')
    : d.number;
export const searchStatus = (d) =>
  d.cancelled
    ? 'cancelled'
    : d.flow.pendingId
      ? 'pending'
      : d.flow.active.id && !d.reopened
        ? 'approved'
        : 'draft';
export const searchContent = (d) =>
  d.flow.active.id
    ? d.flow.active.content
    : d.flow.cases.find((c) => c.id === d.flow.pendingId)?.content ||
      d.flow.working;
export const sourceKey = (source) =>
  JSON.stringify([
    source.id,
    source.line || '',
    source.category || '',
    source.code || '',
    source.name || '',
  ]);
const closed = (a) => ['closed', 'disposed', 'waived'].includes(a.status);
const outcomes = (rows) =>
  ['fail', 'undetermined', 'unable', 'pass'].find((o) =>
    rows.some((r) => r.outcome === o),
  ) || 'none';
const formalAt = (d) =>
  d.flow.cases.find((c) => c.id === d.flow.active.id)?.result?.at ||
  d.flow.cases.find((c) => c.id === d.flow.active.id)?.at ||
  d.createdAt;

export function buildSearchIndex(data) {
  const documents = data.control.documents,
    jobs = data.control.jobs,
    cases = data.control.cases;
  const documentById = new Map(documents.map((d) => [d.id, d]));
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const documentsByJob = new Map(jobs.map((j) => [j.id, []]));
  for (const d of documents)
    for (const jobId of new Set(
      (searchContent(d).lines || []).map((l) => l.jobId),
    ))
      documentsByJob.get(jobId)?.push(d);
  const projections = new Map();
  for (const job of jobs) {
    const related = documentsByJob.get(job.id) || [];
    const formal = related
      .filter((d) => !d.cancelled && d.kind === 'report' && d.flow.active.id)
      .sort(
        (a, b) =>
          formalAt(a).localeCompare(formalAt(b)) ||
          a.createdAt.localeCompare(b.createdAt),
      );
    const superseded = new Set();
    for (const report of formal) {
      let previous = report.correctionOf;
      const seen = new Set();
      while (previous && !seen.has(previous)) {
        seen.add(previous);
        superseded.add(previous);
        previous = documentById.get(previous)?.correctionOf;
      }
    }
    const effective = formal.filter((d) => !superseded.has(d.id));
    const failures = new Set(),
      sampleResults = new Map();
    let latestRows = [];
    for (const d of effective) {
      latestRows = d.flow.active.content.lines
        .filter((l) => l.jobId === job.id)
        .flatMap((l) => l.results || []);
      for (const sample of new Set(
        latestRows.flatMap((r) => r.samples || []),
      )) {
        const attempts = latestRows.filter((r) => r.samples?.includes(sample));
        sampleResults.set(sample, outcomes(attempts));
        if (attempts.some((r) => r.outcome === 'fail')) failures.add(sample);
        else if (attempts.every((r) => r.outcome === 'pass'))
          failures.delete(sample);
      }
    }
    const linkedCases = cases.filter((a) => a.jobId === job.id);
    const termination = related
      .filter(
        (d) =>
          !d.cancelled &&
          d.flow.active.id &&
          ['disposal', 'waiver'].includes(d.kind),
      )
      .sort((a, b) => formalAt(a).localeCompare(formalAt(b)))
      .at(-1);
    let result = failures.size
      ? 'fail'
      : outcomes(
          [...sampleResults.values()]
            .map((outcome) => ({ outcome }))
            .concat(latestRows.filter((r) => !r.samples?.length)),
        );
    const completion =
      job.completion && !documentById.get(job.completion.reportId)?.cancelled
        ? job.completion
        : null;
    if (completion?.kind === 'disposal' && termination?.kind === 'disposal')
      result = 'fail';
    if (completion?.kind === 'waiver' && termination?.kind === 'waiver')
      result = failures.size ? 'fail' : 'unable';
    const failedReports = formal.filter((d) =>
      d.flow.active.content.lines.some(
        (l) =>
          l.jobId === job.id && l.results.some((r) => r.outcome === 'fail'),
      ),
    );
    projections.set(job.id, {
      job,
      related,
      formal,
      effective,
      result,
      latestRows,
      failures: [...failures],
      cases: linkedCases,
      completion,
      openCases: linkedCases.filter((a) => !closed(a)),
      everFail: failedReports.length > 0,
      correctedFailures: failedReports
        .filter((d) => superseded.has(d.id))
        .map((d) => d.id),
      superseded,
      measured: new Set(
        related
          .filter((d) => !d.cancelled && d.kind === 'report')
          .flatMap((d) =>
            searchContent(d)
              .lines.filter((l) => l.jobId === job.id)
              .flatMap((l) =>
                l.results
                  .filter((r) => r.outcome !== 'unable')
                  .flatMap((r) => r.samples || []),
              ),
          ),
      ),
    });
  }
  const sources = new Map();
  for (const source of [
    ...(data.sources || []),
    ...(data.catalog?.items || []),
    ...jobs.map((j) => j.source),
  ]) {
    const key = sourceKey(source);
    if (!sources.has(key)) sources.set(key, source);
  }
  return {
    data,
    documents,
    jobs,
    cases,
    documentById,
    jobById,
    documentsByJob,
    projections,
    sources: [...sources.values()],
  };
}

export const searchModes = [
  'jobs',
  'plan',
  'initial',
  'retest',
  'correction',
  'applications',
  'pending',
  'incomplete',
  'open',
  'pass',
  'fail',
  'unable',
  'undetermined',
  'none',
  'ever',
];
export const documentModes = new Set([
  'plan',
  'initial',
  'retest',
  'correction',
  'applications',
  'pending',
]);
export function validSearchRange(state) {
  if (state.periodMode !== 'range') return true;
  const valid = (date) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date || '') &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  return valid(state.from) && valid(state.to) && state.from <= state.to;
}
function periodMatches(job, state, today) {
  if (state.periodMode === 'all') return true;
  if (state.periodMode === 'current')
    return job.start <= today && job.end >= today;
  if (state.periodMode === 'specific')
    return JSON.stringify([job.start, job.end]) === state.period;
  if (state.periodMode === 'range')
    return (
      validSearchRange(state) && job.end >= state.from && job.start <= state.to
    );
  return !!job.preview;
}
function sourceMatches(source, state) {
  return (
    (!state.line || source.line === state.line) &&
    (!state.category || source.category === state.category) &&
    (!state.item || sourceKey(source) === state.item)
  );
}
function textMatches(line, query, productMode, measured) {
  const source = line.source;
  const products = (source.products || []).filter(
    (p) => productMode !== 'tested' || measured.has(p.code),
  );
  return normalize(
    [
      source.name,
      source.code,
      source.errorCode,
      ...products.flatMap((p) => [p.code, p.name]),
    ].join(' '),
  ).includes(query);
}
export function querySearch(index, state, preview = []) {
  const q = normalize(state.query),
    byMode = {},
    matches = new Map(),
    allJobs = state.periodMode === 'next' ? preview : index.jobs;
  const matchingDocs =
    state.periodMode === 'next'
      ? []
      : index.documents.filter((d) => {
          if (d.cancelled) return false;
          const c = searchContent(d),
            documentMatch =
              q &&
              normalize(
                [d.number, searchNumber(d), c.title].join(' '),
              ).includes(q);
          const lines = (c.lines || []).filter((line) => {
            const job = index.jobById.get(line.jobId);
            const measured = new Set(
              (line.results || [])
                .filter((r) => r.outcome !== 'unable')
                .flatMap((r) => r.samples || []),
            );
            return (
              job &&
              periodMatches(job, state, index.data.today) &&
              sourceMatches(line.source, state) &&
              (!q ||
                documentMatch ||
                textMatches(line, q, state.productMode, measured))
            );
          });
          if (lines.length)
            matches.set(
              d.id,
              lines.map((l) => l.id),
            );
          return !!lines.length;
        });
  const matchingJobs = allJobs.filter((job) => {
    if (
      !periodMatches(job, state, index.data.today) ||
      !sourceMatches(job.source, state)
    )
      return false;
    const projection = index.projections.get(job.id);
    return (
      !q ||
      textMatches(
        { source: job.source },
        q,
        state.productMode,
        projection?.measured || new Set(),
      ) ||
      matchingDocs.some(
        (d) =>
          normalize(
            [d.number, searchNumber(d), searchContent(d).title].join(' '),
          ).includes(q) &&
          searchContent(d).lines.some(
            (l) => l.jobId === job.id && matches.get(d.id)?.includes(l.id),
          ),
      )
    );
  });
  for (const mode of searchModes)
    byMode[mode] = documentModes.has(mode)
      ? matchingDocs.filter((d) =>
          mode === 'pending'
            ? !d.cancelled && !!d.flow.pendingId
            : mode === 'applications'
              ? ['waiver', 'disposal'].includes(d.kind)
              : searchKind(d) === mode,
        )
      : matchingJobs.filter((j) => {
          const p = index.projections.get(j.id);
          return (
            mode === 'jobs' ||
            (mode === 'incomplete' && !p?.completion) ||
            (mode === 'open' && !!p?.openCases.length) ||
            (mode === 'ever' && !!p?.everFail) ||
            (p?.result || 'none') === mode
          );
        });
  const exact = /^fqc-(?:pln|rpt|rts|cor|wvr|dsp)-\d{8}-\d+$/i.test(q)
    ? index.documents.filter(
        (d) =>
          !d.cancelled &&
          [d.number, searchNumber(d)].some((n) => normalize(n) === q),
      )
    : [];
  return {
    byMode,
    matches,
    invalidRange: !validSearchRange(state),
    outside: exact.length > 0 && !matchingDocs.some((d) => exact.includes(d)),
    exact,
  };
}

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const words = {
  jobs: ['應檢項目', 'Hạng mục cần kiểm tra'],
  plan: ['計畫', 'Kế hoạch'],
  initial: ['初測 RPT', 'Lần đầu RPT'],
  retest: ['複測 RTS', 'Thử lại RTS'],
  correction: ['更正 COR', 'Sửa đổi COR'],
  applications: ['免做／處置', 'Miễn / xử lý'],
  pending: ['待審文件', 'Hồ sơ chờ duyệt'],
  incomplete: ['未完成項目', 'Hạng mục chưa hoàn thành'],
  open: ['異常未結案', 'Bất thường chưa đóng'],
  pass: ['目前合格／複測合格', 'Hiện đạt / thử lại đạt'],
  fail: ['目前不合格', 'Hiện không đạt'],
  unable: ['目前無法測試', 'Hiện không thể thử'],
  undetermined: ['目前無法判定', 'Hiện chưa xác định'],
  none: ['尚無核准結果', 'Chưa có kết quả đã duyệt'],
  ever: ['曾經不合格', 'Từng không đạt'],
  waiver: ['免做 WVR', 'Miễn WVR'],
  disposal: ['處置 DSP', 'Xử lý DSP'],
  draft: ['草稿', 'Bản nháp'],
  approved: ['正式核准', 'Đã duyệt'],
  cancelled: ['已取消／已捨棄', 'Đã hủy / bỏ'],
  closed: ['已結案', 'Đã đóng'],
  disposed: ['處置結案・保留不合格', 'Đóng xử lý · giữ không đạt'],
  waived: ['本期免做・不等於合格', 'Miễn kỳ này · không phải đạt'],
  'ready-close': ['待確認結案', 'Chờ xác nhận đóng'],
  retestState: ['複測中', 'Đang thử lại'],
  openState: ['待改善', 'Chờ cải thiện'],
  save: ['儲存', 'Lưu'],
  submit: ['送審', 'Gửi duyệt'],
  approve: ['核准', 'Duyệt'],
  return: ['發回', 'Trả lại'],
  withdraw: ['撤回', 'Rút lại'],
  close: ['確認結案', 'Xác nhận đóng'],
  improvement: ['改善紀錄', 'Ghi cải thiện'],
};
Object.assign(words, {
  report: ['建立複測報告', 'Tạo báo cáo thử lại'],
  returned: ['已發回', 'Đã trả lại'],
  withdrawn: ['已撤回', 'Đã rút lại'],
  restore: ['復原', 'Khôi phục'],
  'discard-draft': ['捨棄草稿', 'Bỏ bản nháp'],
  'delete-plan': ['取消計畫', 'Hủy kế hoạch'],
  'revoke-plan': ['反確認計畫', 'Thu hồi xác nhận kế hoạch'],
  'resolve-impact': ['確認下游影響', 'Xác nhận ảnh hưởng'],
  'correction-reopened': [
    '更正後重新確認結案',
    'Xác nhận đóng lại sau chỉnh sửa',
  ],
  'retest-plan-approved': ['補測計畫核准', 'Duyệt kế hoạch thử bổ sung'],
  improve: ['改善紀錄', 'Ghi cải thiện'],
  correct: ['建立更正', 'Tạo bản sửa'],
});
const descriptions = {
  jobs: ['每個項目＋期別一列', 'Một dòng cho mỗi hạng mục + kỳ'],
  plan: ['正常計畫與補測計畫', 'Kế hoạch thường và thử bổ sung'],
  initial: ['初測文件，每份只計一次', 'Hồ sơ lần đầu, mỗi hồ sơ tính một lần'],
  retest: [
    '複測／補測報告，不含補測計畫',
    'Báo cáo thử lại / bổ sung, không gồm kế hoạch',
  ],
  correction: [
    '沿現行分類，保留更正關係',
    'Giữ phân loại hiện tại và liên kết sửa đổi',
  ],
  applications: ['免做與處置文件分組列出', 'Nhóm riêng hồ sơ miễn và xử lý'],
  pending: ['未取消且有固定待審案件', 'Chưa hủy, có hồ sơ gửi duyệt cố định'],
  incomplete: ['工作尚無完成紀錄', 'Công việc chưa có ghi nhận hoàn thành'],
  open: ['依項目計數，案件數另列', 'Đếm hạng mục, ghi riêng số vụ việc'],
  pass: ['截至現在的正式結果通過', 'Kết quả chính thức đến hiện tại đạt'],
  fail: ['含尚未解決的失敗及處置結案', 'Gồm lỗi chưa giải quyết và đóng xử lý'],
  unable: ['免做另標示，不算合格', 'Ghi riêng miễn; không tính là đạt'],
  undetermined: ['已測但判定未完成', 'Đã thử nhưng chưa xác định kết quả'],
  none: ['未填報、草稿或待審', 'Chưa báo cáo, bản nháp hoặc chờ duyệt'],
  ever: [
    '含已複測合格、結案與更正原判定',
    'Gồm đã thử lại đạt, đóng hoặc sửa phán định',
  ],
};

export function createHistorySearch({ getData, readPreview }) {
  const state = {
    periodMode: 'current',
    period: '',
    from: '',
    to: '',
    query: '',
    productMode: 'covered',
    line: '',
    category: '',
    item: '',
    cancelled: false,
    active: 'jobs',
    stack: [],
  };
  let index,
    priorData,
    host,
    preview = [],
    previewRevision = null,
    previewSequence = 0,
    previewBusy = false,
    previewError = '',
    composing = false,
    deferred = false,
    locale = '';
  const t = (zh, vi) => (document.documentElement.lang === 'vi' ? vi : zh);
  const name = (key) => (words[key] ? t(...words[key]) : key);
  const h = escape;
  const outcomeName = (key) =>
    ({
      pass: t('合格', 'Đạt'),
      fail: t('不合格', 'Không đạt'),
      unable: t('無法測試', 'Không thể thử'),
      undetermined: t('無法判定', 'Chưa xác định'),
    })[key] || name(key);
  const button = (label, attr, cls = '') =>
    `<button type="button" class="rf-btn ${cls}" ${attr}>${label}</button>`;
  const badge = (key, text = name(key)) =>
    `<span class="rf-tag ${h(key)}">${h(text)}</span>`;
  const syncIndex = () => {
    const current = getData();
    if (current !== priorData) {
      index = buildSearchIndex(current);
      priorData = current;
    }
    return index;
  };
  const unit = (mode) =>
    documentModes.has(mode) ? t('份', 'hồ sơ') : t('項', 'hạng mục');
  function options(values, current, empty) {
    return (
      `<option value="">${h(empty)}</option>` +
      values
        .map(
          ([key, label]) =>
            `<option value="${h(key)}" ${key === current ? 'selected' : ''}>${h(label)}</option>`,
        )
        .join('')
    );
  }
  function select(key, label, values) {
    return `<label>${label}<select data-rfh-filter="${key}">${values.map(([value, title]) => `<option value="${h(value)}" ${state[key] === value ? 'selected' : ''}>${h(title)}</option>`).join('')}</select></label>`;
  }
  function controls() {
    return `<div class="rf-history-controls"><h3>${t('搜尋與歷史', 'Tìm kiếm & lịch sử')}</h3><div class="rf-history-filters">${select(
      'periodMode',
      t('查詢期別', 'Kỳ tra cứu'),
      [
        ['current', t('本期', 'Kỳ hiện tại')],
        ['specific', t('指定歷史期別', 'Chọn kỳ lịch sử')],
        ['range', t('自訂起訖', 'Khoảng ngày')],
        ['all', t('全部歷史', 'Toàn bộ lịch sử')],
        ['next', t('下期預覽', 'Xem trước kỳ tới')],
      ],
    )}<label class="rf-history-query">${t('項目／產品／文件編號', 'Hạng mục / sản phẩm / mã hồ sơ')}<input type="search" data-rfh-query value="${h(state.query)}" placeholder="${t('搜尋名稱、編號或產品', 'Tìm tên, mã hoặc sản phẩm')}"></label>${select(
      'productMode',
      t('產品查詢範圍', 'Phạm vi sản phẩm'),
      [
        ['covered', t('涵蓋此產品', 'Bao phủ sản phẩm')],
        ['tested', t('實測此產品', 'Đã thử sản phẩm')],
      ],
    )}</div><div class="rf-history-filters rf-history-period" data-rfh-period></div><div class="rf-history-filters"><label>${t('線別', 'Dây chuyền')}<select data-rfh-filter="line"></select></label><label>${t('類別', 'Danh mục')}<select data-rfh-filter="category"></select></label><label>${t('檢查項目', 'Hạng mục kiểm tra')}<select data-rfh-filter="item"></select></label></div><div class="rf-history-tools">${button(t('清除搜尋', 'Xóa tìm kiếm'), 'data-rfh-clear')}</div><p class="rf-subtle" data-rfh-scope-note></p></div><div data-rfh-choices></div><div data-rfh-status role="status" aria-live="polite"></div><div class="rf-layout rf-history-layout"><section class="rf-panel rf-list-panel"><div class="rf-panel-heading" data-rfh-heading></div><div class="rf-scroll" data-rfh-list></div></section><section class="rf-panel rf-detail-panel"><div class="rf-detail" data-rfh-detail></div></section></div>`;
  }
  function cascade() {
    const sources = index.sources;
    const lines = [
      ...new Set([
        ...(index.data.catalog?.lines || []),
        ...sources.map((s) => s.line),
      ]),
    ]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    host.querySelector('[data-rfh-filter="line"]').innerHTML = options(
      lines.map((x) => [x, x]),
      state.line,
      t('全部線別', 'Tất cả dây chuyền'),
    );
    const scoped = sources.filter((s) => !state.line || s.line === state.line);
    const categories = [
      ...new Set([
        ...scoped.map((s) => s.category),
        ...(index.data.catalog?.categories || [])
          .filter((c) => !state.line || c.line === state.line)
          .map((c) => c.name),
      ]),
    ]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    if (state.category && !categories.includes(state.category))
      state.category = '';
    host.querySelector('[data-rfh-filter="category"]').innerHTML = options(
      categories.map((x) => [x, x]),
      state.category,
      t('全部類別', 'Tất cả danh mục'),
    );
    const items = scoped.filter(
      (s) => !state.category || s.category === state.category,
    );
    if (state.item && !items.some((s) => sourceKey(s) === state.item))
      state.item = '';
    host.querySelector('[data-rfh-filter="item"]').innerHTML = options(
      items.map((s) => [
        sourceKey(s),
        [s.name, s.code, s.line, s.category].filter(Boolean).join(' · '),
      ]),
      state.item,
      t('全部項目（含歷史）', 'Tất cả hạng mục (gồm lịch sử)'),
    );
    const periods = [
      ...new Set(index.jobs.map((j) => JSON.stringify([j.start, j.end]))),
    ]
      .sort((a, b) => a.localeCompare(b))
      .reverse();
    if (state.periodMode === 'specific' && !periods.includes(state.period))
      state.period = periods[0] || '';
    host.querySelector('[data-rfh-period]').innerHTML =
      state.periodMode === 'specific'
        ? select(
            'period',
            t('工作實際起訖', 'Ngày đầu / cuối của công việc'),
            periods.map((p) => [p, JSON.parse(p).join(' — ')]),
          )
        : state.periodMode === 'range'
          ? `<label>${t('開始日期', 'Từ ngày')}<input type="date" data-rfh-filter="from" value="${h(state.from)}"></label><label>${t('結束日期', 'Đến ngày')}<input type="date" data-rfh-filter="to" value="${h(state.to)}"></label>`
          : '';
  }
  function renderChoices(result) {
    const card = (mode) => {
      const rows = result.byMode[mode],
        cancelled = documentModes.has(mode)
          ? rows.filter((d) => d.cancelled).length
          : 0;
      return `<button type="button" class="rf-history-choice ${mode}" data-rf-tone="${mode}" data-rfh-mode="${mode}" aria-pressed="${state.active === mode}"><b>${mode === 'applications' ? `<span class="rf-number waiver">${name('waiver')}</span> / <span class="rf-number disposal">${name('disposal')}</span>` : name(mode)}</b><span><strong>${rows.length - cancelled}</strong> ${unit(mode)}${cancelled ? ` ＋ ${cancelled} ${t('份已捨棄', 'hồ sơ đã bỏ')}` : ''}</span><small>${t(...descriptions[mode])}</small></button>`;
    };
    return `<h4>${t('文件與工作', 'Hồ sơ & công việc')}</h4><div class="rf-history-choices">${searchModes.slice(0, 9).map(card).join('')}</div><h4>${t('結果與追蹤', 'Kết quả & theo dõi')} <small>${t('兩區合計一次只選一項', 'Chỉ chọn một mục giữa hai nhóm')}</small></h4><div class="rf-history-choices">${searchModes.slice(9).map(card).join('')}</div>`;
  }
  function docLink(d) {
    return button(
      `<span class="rf-number ${searchKind(d)}">${h(searchNumber(d))}</span> · ${name(searchKind(d))} ${d.cancelled ? badge('cancelled') : ''}`,
      `data-rfh-doc="${h(d.id)}"`,
      'rf-history-link',
    );
  }
  function jobLink(j) {
    return button(
      h(j.source.name) + ' · ' + h(j.start + ' — ' + j.end),
      `data-rfh-job="${h(j.id)}"`,
      'rf-history-link',
    );
  }
  const photos = (ids) =>
    `<div class="rf-photos">${(ids || []).map((id) => `<a class="rf-photo" target="_blank" rel="noopener" href="/api/routine-fqc/photo?id=${encodeURIComponent(id)}"><img decoding="async" loading="lazy" src="/api/routine-fqc/photo?id=${encodeURIComponent(id)}" alt="${t('檢查照片', 'Ảnh kiểm tra')}"></a>`).join('')}</div>`;
  function sourceInfo(source) {
    return `<p class="rf-subtle">${h([source.line, source.category, source.errorCode, source.code].filter(Boolean).join(' / '))}</p><p>${t('來源版本', 'Phiên bản nguồn')}：${h(source.version || '—')} · ${t('生效日', 'Ngày hiệu lực')}：${h(source.effectiveDate || '—')}</p><div class="rf-coverage"><b>${t('涵蓋產品（不代表實測）', 'Sản phẩm bao phủ (không phải đã thử)')}</b><p>${h((source.products || []).map((p) => p.code + ' · ' + p.name).join(' / ') || '—')}</p></div><details><summary>${t('當次檢查標準', 'Tiêu chuẩn tại thời điểm kiểm tra')}</summary><p class="rf-history-text">${h(source.description || '—')}</p></details>`;
  }
  function itemDetail(job) {
    if (job.preview)
      return `<h3>${h(job.source.name)}</h3>${badge('none', t('僅預覽・未產生工作', 'Chỉ xem trước · chưa tạo công việc'))}<p>${h(job.start + ' — ' + job.end)}</p><p>${t('頻率', 'Tần suất')}：${h(job.source.frequencyText || job.source.frequency)}</p>${sourceInfo(job.source)}<p>${job.planId ? t('已安排計畫；上期異常另外追蹤。', 'Đã lập kế hoạch; theo dõi bất thường kỳ trước riêng.') : t('尚未建立計畫；上期異常另外追蹤。', 'Chưa tạo kế hoạch; theo dõi bất thường kỳ trước riêng.')}</p>`;
    const p = index.projections.get(job.id),
      related = p.related.filter((d) => !d.cancelled);
    return `<h3>${h(job.source.name)}</h3><p>${h(job.start + ' — ' + job.end)}</p><div class="rf-history-summary">${badge(p.result)}${p.everFail ? badge('fail', name('ever')) : ''}${p.correctedFailures.length ? badge('correction', t('原判定已更正', 'Phán định gốc đã được sửa')) : ''}<p>${t('本期工作', 'Công việc kỳ này')}：${p.completion ? t('已完成', 'Đã hoàn thành') : t('未完成', 'Chưa hoàn thành')} · ${t('未結案件', 'Vụ việc chưa đóng')}：${p.openCases.length}</p>${p.cases.map((a) => badge(a.status, name(a.status === 'open' ? 'openState' : a.status === 'retest' ? 'retestState' : a.status))).join('')}</div>${sourceInfo(job.source)}<p class="rf-subtle">${t('目前結果是此項目本期截至現在的正式投影；不代表所有涵蓋產品個別合格。', 'Kết quả hiện tại tổng hợp chính thức của hạng mục trong kỳ đến nay; không phải kết quả riêng của mọi sản phẩm bao phủ.')}</p>${[
      'plan',
      'initial',
      'retest',
      'correction',
      'waiver',
      'disposal',
    ]
      .map(
        (kind) =>
          `<section class="rf-history-group" data-rf-tone="${kind}"><h4>${name(kind)}</h4>${
            related
              .filter((d) => searchKind(d) === kind)
              .map(docLink)
              .join('') ||
            `<p class="rf-subtle">${t('尚無文件', 'Chưa có hồ sơ')}</p>`
          }</section>`,
      )
      .join(
        '',
      )}<details open><summary>${t('改善與結案歷程', 'Lịch sử cải thiện & đóng hồ sơ')}</summary>${p.cases.map((a) => `<h4>${h(a.number)}</h4>${(a.improvements || []).map((i) => `<div class="rf-history-event"><b>${name('improvement')}</b><p>${h(i.at)} · ${h(i.actor?.name || '—')}</p><p class="rf-history-text">${h(i.notes)}</p>${photos(i.photos)}</div>`).join('')}${(a.events || []).map((e) => `<div class="rf-history-event"><b>${h(outcomeName(e.action))}</b><p>${h(e.at)} · ${h(e.actor?.name || '—')}</p><p class="rf-history-text">${h(e.reason || '')}</p>${e.documentId && index.documentById.has(e.documentId) ? docLink(index.documentById.get(e.documentId)) : ''}</div>`).join('')}`).join('') || t('尚無異常事件', 'Chưa có sự kiện bất thường')}</details>`;
  }
  function documentDetail(d, result) {
    const c = searchContent(d),
      formal = !!d.flow.active.id,
      match = result.matches.get(d.id) || [];
    return `<h3 class="rf-number ${searchKind(d)}">${h(searchNumber(d))}</h3>${searchNumber(d) !== d.number ? `<p>${t('原號', 'Mã gốc')}：${h(d.number)}</p>` : ''}<p>${h(c.title)}</p>${badge(searchStatus(d))}${d.kind === 'plan' && d.caseId ? badge('retest', t('補測計畫', 'Kế hoạch thử bổ sung')) : ''}<p>${t('實際檢查日期', 'Ngày kiểm tra thực tế')}：${h(c.date)} · ${t('建立者', 'Người tạo')}：${h(d.owner?.name || '—')}</p><div class="rf-notice">${formal ? t('以下為本份文件當時正式內容，後續複測不覆寫原報告。', 'Nội dung chính thức của hồ sơ tại thời điểm đó; thử lại không ghi đè báo cáo gốc.') : t('草稿／待審內容，尚不計正式結果。', 'Nội dung nháp / chờ duyệt, chưa tính kết quả chính thức.')}${d.flow.pendingId && formal ? '<br>' + t('另有待審版本；此處仍顯示正式版本。', 'Có phiên bản chờ duyệt; ở đây vẫn hiển thị bản chính thức.') : ''}</div>${d.correctionOf && index.documentById.has(d.correctionOf) ? `<p>${t('更正來源', 'Nguồn sửa đổi')}</p>${docLink(index.documentById.get(d.correctionOf))}` : ''}${d.planId && index.documentById.has(d.planId) ? docLink(index.documentById.get(d.planId)) : ''}${c.lines.map((l) => `<section class="rf-item"><div class="rf-item-heading"><h4>${h(l.source.name)}</h4>${match.includes(l.id) ? badge('pass', t('符合查詢條件', 'Khớp điều kiện tìm kiếm')) : ''}</div><div class="rf-item-body">${index.jobById.has(l.jobId) ? jobLink(index.jobById.get(l.jobId)) : ''}${sourceInfo(l.source)}${(l.requiredSamples || []).length ? `<p>${t('本份應複測原樣品', 'Mẫu gốc cần thử lại của hồ sơ')}：${h(l.requiredSamples.join(', '))}</p>` : ''}${(l.results || []).map((r, i) => `<details class="rf-history-result" ${i === 0 ? 'open' : ''}><summary>${t('結果列', 'Dòng kết quả')} ${i + 1} · ${h((r.samples || []).map((code) => code + ' · ' + (l.source.products.find((p) => p.code === code)?.name || '')).join(' / ') || t('未實測', 'Chưa thử'))}</summary>${badge(r.outcome || 'none', outcomeName(r.outcome || 'none'))}<p class="rf-history-text">${h(r.value)}</p><p class="rf-history-text">${h(r.notes)}</p>${photos(r.photos)}</details>`).join('')}</div></section>`).join('')}<p class="rf-history-text">${h([c.notes, c.reason, c.disposition].filter(Boolean).join('\n'))}</p>${photos(c.evidence)}<details><summary>${t('保存、審核與取消歷史', 'Lịch sử lưu, duyệt và hủy')}</summary>${(d.flow.saves || []).map((a) => `<p>${name('save')} · ${h(a.at)} · ${h(a.actor?.name || '—')}</p>`).join('')}${(d.flow.cases || []).map((a) => `<div class="rf-history-event"><p>${name('submit')} · ${h(a.at)} · ${h(a.actor?.name || '—')} · ${h(name(a.status))}</p><p>${h(a.reason || '')}</p>${a.result ? `<p>${h(a.result.at)} · ${h(a.result.actor?.name || '—')} · ${h(a.result.reason || '')}</p>` : ''}</div>`).join('')}${(d.lifecycle || []).map((a) => `<p>${h(name(a.action))} · ${h(a.at)} · ${h(a.actor?.name || '—')}</p>`).join('')}</details>`;
  }
  function renderDetail(result) {
    const current = state.stack.at(-1),
      view = host.querySelector('[data-rfh-detail]');
    host
      .querySelector('.rf-history-layout')
      .classList.toggle('has-selection', !!current);
    if (!current) {
      view.innerHTML = `<div class="rf-empty">${t('選擇文件或項目，查看結果與完整歷程', 'Chọn hồ sơ hoặc hạng mục để xem kết quả và toàn bộ lịch sử')}</div>`;
      return;
    }
    const item =
      current.type === 'doc'
        ? index.documentById.get(current.id)
        : index.jobById.get(current.id) ||
          preview.find((j) => j.id === current.id);
    view.innerHTML =
      button(t('← 返回', '← Quay lại'), 'data-rfh-back', 'rf-history-back') +
      (item
        ? current.type === 'doc'
          ? documentDetail(item, result)
          : itemDetail(item)
        : t(
            '資料已更新，請返回清單',
            'Dữ liệu đã cập nhật, vui lòng quay lại danh sách',
          ));
  }
  function renderParts({ detail = true } = {}) {
    if (!host?.isConnected) return;
    host.style.minHeight =
      Math.max(0, window.innerHeight - host.getBoundingClientRect().top) + 'px';
    const positions = [];
    for (let node = host; node; node = node.parentElement)
      positions.push([node, node.scrollLeft, node.scrollTop]);
    const page = [window.scrollX, window.scrollY],
      focus = document.activeElement;
    const focusAttr = [
      'data-rfh-mode',
      'data-rfh-select',
      'data-rfh-back',
    ].find((a) => focus?.hasAttribute(a));
    const focusValue = focusAttr ? focus.getAttribute(focusAttr) : null;
    const previousDetail = host.querySelector('[data-rfh-detail]'),
      currentId = state.stack.at(-1)?.id;
    const expanded =
      previousDetail.dataset.selection === currentId
        ? [...previousDetail.querySelectorAll('details')].map((d) => d.open)
        : null;
    syncIndex();
    const result = querySearch(index, state, preview),
      rows = result.byMode[state.active],
      scroll = host.querySelector('[data-rfh-list]'),
      top = scroll.scrollTop;
    host.querySelector('[data-rfh-choices]').innerHTML = renderChoices(result);
    host.querySelector('[data-rfh-scope-note]').textContent =
      state.productMode === 'covered'
        ? t(
            '涵蓋是來源快照的產品範圍，不代表本次實測。',
            'Bao phủ là phạm vi sản phẩm trong bản chụp nguồn, không có nghĩa đã thử.',
          )
        : t(
            '實測須有此品項的結果列；項目結果仍綜合全部樣品。',
            'Đã thử cần có dòng kết quả của sản phẩm; kết quả hạng mục vẫn tổng hợp mọi mẫu.',
          );
    const cancelled = documentModes.has(state.active)
      ? rows.filter((d) => d.cancelled).length
      : 0;
    host.querySelector('[data-rfh-heading]').innerHTML =
      `<b>${name(state.active)}</b><small>${rows.length - cancelled} ${unit(state.active)}${cancelled ? ` ＋ ${cancelled} ${t('份已捨棄', 'hồ sơ đã bỏ')}` : ''}</small>`;
    host.querySelector('[data-rfh-status]').innerHTML =
      (result.invalidRange
        ? `<p class="rf-notice error">${t('請填有效起訖日期，開始日不可晚於結束日。', 'Nhập khoảng ngày hợp lệ; ngày đầu không được sau ngày cuối.')}</p>`
        : '') +
      (result.outside
        ? `<p class="rf-notice">${t('目前範圍查無此完整編號。', 'Không tìm thấy mã đầy đủ trong phạm vi hiện tại.')} ${button(t('改查全部歷史', 'Tra cứu toàn bộ lịch sử'), 'data-rfh-all-history')}</p>`
        : '') +
      (state.periodMode === 'next'
        ? `<p class="rf-notice">${previewBusy ? t('正在讀取下期預覽…', 'Đang đọc bản xem trước kỳ tới…') : h(previewError) || t('下期預覽只讀，不產生工作或文件。', 'Xem trước chỉ đọc, không tạo công việc hoặc hồ sơ.')}</p>`
        : '');
    const renderedRows = rows.map((row) => {
      const isDoc = documentModes.has(state.active),
        p = index.projections.get(row.id),
        selected = state.stack[0]?.id === row.id;
      return `<button type="button" class="rf-history-row ${selected ? 'selected' : ''}" data-rf-tone="${isDoc ? searchKind(row) : 'jobs'}" data-rfh-select="${h(row.id)}" data-rfh-type="${isDoc ? 'doc' : 'job'}" aria-pressed="${selected}">${isDoc ? `<b class="rf-number ${searchKind(row)}">${h(searchNumber(row))}</b><span>${h(searchContent(row).title)}</span>${badge(searchStatus(row))}${row.kind === 'plan' && row.caseId ? badge('retest', t('補測計畫', 'Kế hoạch thử bổ sung')) : ''}<small>${t('實際日', 'Ngày thực tế')} ${h(searchContent(row).date)} · ${searchContent(row).lines.length} ${t('項', 'hạng mục')}</small>` : `<b>${h(row.source.name)}</b><small>${h(row.source.code)} · ${h(row.source.line + ' / ' + row.source.category)}</small><small>${h(row.start + ' — ' + row.end)}</small>${badge(p?.result || 'none', row.preview ? t('預計應檢', 'Dự kiến cần kiểm tra') : undefined)}${p?.everFail ? badge('fail', name('ever')) : ''}${p?.openCases.length ? `<small>${t('未結案件', 'Vụ việc chưa đóng')} ${p.openCases.length}</small>` : ''}`}</button>`;
    });
    scroll.innerHTML =
      state.active === 'applications'
        ? ['waiver', 'disposal']
            .map(
              (kind) =>
                `<section class="rf-history-group"><h4>${name(kind)}</h4>${rows.map((row, i) => (row.kind === kind ? renderedRows[i] : '')).join('') || `<p class="rf-empty">${t('沒有符合條件的紀錄', 'Không có bản ghi phù hợp')}</p>`}</section>`,
            )
            .join('')
        : renderedRows.join('') ||
          `<div class="rf-empty">${t('沒有符合條件的紀錄', 'Không có bản ghi phù hợp')}</div>`;
    scroll.scrollTop = top;
    if (detail) {
      renderDetail(result);
      previousDetail.dataset.selection = currentId || '';
      if (expanded)
        previousDetail.querySelectorAll('details').forEach((d, i) => {
          if (i < expanded.length) d.open = expanded[i];
        });
    }
    if (focusAttr) {
      const replacement = [
        ...host.querySelectorAll('[' + focusAttr + ']'),
      ].find((n) => n.getAttribute(focusAttr) === focusValue);
      replacement?.focus({ preventScroll: true });
    }
    for (const [node, left, top] of positions) {
      node.scrollLeft = left;
      node.scrollTop = top;
    }
    window.scrollTo(...page);
  }
  async function loadPreview() {
    if (previewRevision === index.data.control.revision) return;
    const revision = index.data.control.revision,
      sequence = ++previewSequence;
    previewBusy = true;
    previewError = '';
    renderParts();
    try {
      const response = await readPreview();
      if (
        sequence !== previewSequence ||
        revision !== getData().control.revision
      )
        return;
      preview = response.jobs.map((j) => ({ ...j, preview: true }));
      previewRevision = revision;
    } catch (error) {
      if (sequence !== previewSequence) return;
      previewError = error.message;
    } finally {
      if (sequence === previewSequence) {
        previewBusy = false;
        renderParts();
      }
    }
  }
  let listReturn;
  function captureView() {
    const nodes = [
      ...host.querySelectorAll('[data-rfh-list],[data-rfh-detail]'),
    ];
    for (let node = host; node; node = node.parentElement) nodes.push(node);
    return {
      page: [window.scrollX, window.scrollY],
      positions: nodes.map((n) => [n, n.scrollLeft, n.scrollTop]),
      expanded: [...host.querySelectorAll('[data-rfh-detail] details')].map(
        (n) => n.open,
      ),
      selected: state.stack[0]?.id,
    };
  }
  function restoreView(view) {
    if (!view) return;
    host.querySelectorAll('[data-rfh-detail] details').forEach((node, i) => {
      if (i < view.expanded.length) node.open = view.expanded[i];
    });
    for (const [node, left, top] of view.positions) {
      node.scrollLeft = left;
      node.scrollTop = top;
    }
    window.scrollTo(...view.page);
  }
  function bind(container) {
    host = container.querySelector('.rf-history');
    if (!host) return;
    locale = document.documentElement.lang;
    cascade();
    renderParts();
    host.onclick = (event) => {
      const b = event.target.closest('button');
      if (!b) return;
      if (b.dataset.rfhMode) {
        state.active = b.dataset.rfhMode;
        state.stack = [];
        renderParts();
        host
          .querySelector(`[data-rfh-mode="${state.active}"]`)
          ?.focus({ preventScroll: true });
      } else if (b.dataset.rfhSelect) {
        listReturn = captureView();
        listReturn.selected = b.dataset.rfhSelect;
        state.stack = [{ type: b.dataset.rfhType, id: b.dataset.rfhSelect }];
        renderParts();
        if (window.matchMedia('(max-width:760px)').matches)
          host
            .querySelector('[data-rfh-detail]')
            .scrollIntoView({ block: 'start' });
      } else if (b.dataset.rfhDoc || b.dataset.rfhJob) {
        if (state.stack.length) state.stack.at(-1).view = captureView();
        state.stack.push({
          type: b.dataset.rfhDoc ? 'doc' : 'job',
          id: b.dataset.rfhDoc || b.dataset.rfhJob,
        });
        renderDetail(querySearch(index, state, preview));
        host.querySelector('[data-rfh-back]')?.focus({ preventScroll: true });
      } else if (b.hasAttribute('data-rfh-back')) {
        state.stack.pop();
        renderParts();
        restoreView(state.stack.at(-1)?.view || listReturn);
        if (!state.stack.length) {
          const row = [...host.querySelectorAll('[data-rfh-select]')].find(
            (n) => n.dataset.rfhSelect === listReturn?.selected,
          );
          row?.focus({ preventScroll: true });
        }
      } else if (b.hasAttribute('data-rfh-clear')) {
        Object.assign(state, {
          query: '',
          line: '',
          category: '',
          item: '',
          cancelled: false,
          stack: [],
        });
        host.querySelector('[data-rfh-query]').value = '';
        cascade();
        renderParts();
      } else if (b.hasAttribute('data-rfh-all-history')) {
        Object.assign(state, {
          periodMode: 'all',
          line: '',
          category: '',
          item: '',
          stack: [],
        });
        host.querySelector('[data-rfh-filter="periodMode"]').value = 'all';
        const exact = querySearch(index, state, preview).exact[0];
        if (exact)
          state.active =
            searchKind(exact) === 'waiver' || searchKind(exact) === 'disposal'
              ? 'applications'
              : searchKind(exact);
        cascade();
        renderParts();
      }
    };
    host.onchange = (event) => {
      const el = event.target;
      if (el.dataset.rfhFilter) state[el.dataset.rfhFilter] = el.value;
      else return;
      state.stack = [];
      if (el.dataset.rfhFilter === 'periodMode' && state.periodMode === 'next')
        state.active = 'jobs';
      cascade();
      renderParts();
      if (state.periodMode === 'next') void loadPreview();
    };
    const input = host.querySelector('[data-rfh-query]');
    const changed = () => {
      if (composing || state.query === input.value) return;
      state.query = input.value;
      state.stack = [];
      renderParts();
    };
    input.oncompositionstart = () => {
      composing = true;
    };
    input.oncompositionend = () => {
      composing = false;
      changed();
      if (deferred) {
        deferred = false;
        syncIndex();
        cascade();
        renderParts();
      }
    };
    input.oninput = (event) => {
      if (!event.isComposing) changed();
    };
    if (state.periodMode === 'next') void loadPreview();
  }
  return {
    get composing() {
      return composing;
    },
    html() {
      syncIndex();
      return `<section class="rf-history">${controls()}</section>`;
    },
    bind,
    openForItem(item) {
      syncIndex();
      Object.assign(state, {
        periodMode: 'all',
        line: '',
        category: '',
        query: '',
        item: sourceKey(index.sources.find((s) => s.id === item) || {}),
        stack: [],
        active: 'jobs',
      });
    },
    update() {
      if (composing) {
        deferred = true;
        return;
      }
      syncIndex();
      if (locale !== document.documentElement.lang) {
        const container = host.parentElement;
        host.outerHTML = this.html();
        bind(container);
      } else {
        cascade();
        renderParts();
        if (state.periodMode === 'next') void loadPreview();
      }
    },
    state,
  };
}
