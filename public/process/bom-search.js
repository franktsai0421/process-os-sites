(function () {
  "use strict";
  const ui = { query: "", line: "", category: "", code: "", branch: 0, limit: 60, collapsed: new Set(), depth: "all" };
  const t = (zh, vi) => document.documentElement.lang === "vi" ? vi : zh;
  const h = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const display = value => h(value === "待補" || value === "" || value == null ? t("待補", "Cần bổ sung") : value);
  let engine;
  function refreshIndex() { engine = BomSearchEngine.create(data.bom, data.products, routing.productRoutes); }
  function resetSelection(code) { ui.code = code || ""; ui.branch = 0; ui.collapsed.clear(); ui.depth = "all"; }
  function selection(results, preferExact = false) {
    const exact = results.find(item => BomSearchEngine.normalize(item.code) === BomSearchEngine.normalize(ui.query));
    if (preferExact && exact && exact.code !== ui.code) resetSelection(exact.code);
    else if (!results.some(item => item.code === ui.code)) resetSelection(results[0]?.code);
  }
  function resultMarkup(results) {
    return `<header><b>${t("搜尋結果", "Kết quả tìm kiếm")}</b><span role="status">${results.length} ${t("筆", "mục")}</span></header><div class="bom-result-list">${results.slice(0, ui.limit).map(item => `<button type="button" class="bom-result ${item.code === ui.code ? "selected" : ""}" aria-pressed="${item.code === ui.code}" data-bom-pick="${h(item.code)}"><span class="bom-result-top"><code>${h(item.code)}</code><small>${display(item.line)} ${t("線", "chuyền")}</small></span><b>${display(item.name)}</b><span>${display(item.category)} · ${display(item.specification)}</span></button>`).join("") || `<p class="bom-empty">${t("找不到符合的品號，請調整線別、分類或關鍵字。", "Không tìm thấy mã phù hợp. Hãy đổi chuyền, nhóm hoặc từ khóa.")}</p>`}</div>${results.length > ui.limit ? `<button type="button" class="bom-quiet" id="bom-more">${t("顯示更多", "Xem thêm")} (${results.length - ui.limit})</button>` : ""}`;
  }
  function treeRows(branch) {
    const rows = branch.rows;
    let hiddenBelow = null;
    return rows.map((row, index) => {
      const level = row.relativeLevel, children = rows[index + 1]?.relativeLevel > level;
      if (hiddenBelow !== null && level <= hiddenBelow) hiddenBelow = null;
      const hidden = hiddenBelow !== null || (ui.depth === "direct" && level > 1);
      if (!hidden && ui.collapsed.has(index) && children) hiddenBelow = level;
      return `<tr ${hidden ? "hidden" : ""}><td><span class="bom-level">L${level}</span></td><td><div class="bom-tree-cell" style="--bom-depth:${Math.min(level - 1, 8)}">${children ? `<button type="button" class="bom-tree-toggle" data-bom-toggle="${index}" aria-expanded="${!ui.collapsed.has(index)}" aria-label="${t("展開或收合", "Mở hoặc thu gọn")} ${h(row.itemCode)}">${ui.collapsed.has(index) ? "+" : "−"}</button>` : `<span class="bom-tree-leaf" aria-hidden="true">└</span>`}<div><code>${display(row.itemCode)}</code><b>${display(row.itemName)}</b></div></div></td><td>${display(row.specification)}</td><td>${display(row.unit)}</td><td>${display(row.quantity)}</td><td>${display(row.waste)}</td></tr>`;
    }).join("");
  }
  function detailMarkup() {
    const product = engine.get(ui.code);
    if (!product) return `<div class="bom-empty">${t("請先搜尋並選擇產品。", "Tìm và chọn một sản phẩm.")}</div>`;
    const branches = engine.branches(ui.code), branch = branches[ui.branch] || branches[0];
    const count = branch?.rows.length || 0, levels = Math.max(0, ...(branch?.rows || []).map(row => row.relativeLevel));
    return `<header class="bom-selected-head"><div><p>${t("目前查詢 SKU", "SKU đang xem")}</p><code>${h(product.code)}</code><h2>${display(product.name)}</h2><span>${display(product.line)} ${t("線", "chuyền")} · ${display(product.category)} · ${display(product.specification)}</span></div><div class="bom-summary"><b>${count}<small>${t("下層組成", "thành phần con")}</small></b><b>${levels}<small>${t("層", "cấp")}</small></b></div></header><p class="bom-scope-note">${t("此 SKU 視為 L0；只顯示它下面的層級，不包含上層成品或同層其他零件。", "SKU này là L0; chỉ hiển thị các cấp bên dưới, không gồm thành phẩm cấp trên hoặc linh kiện cùng cấp.")}</p>${branches.length > 1 ? `<div class="bom-source-choice"><label for="bom-source">${t("此 SKU 有不同 BOM 組成，請選擇來源", "SKU có nhiều cấu trúc BOM, hãy chọn nguồn")}</label><select id="bom-source">${branches.map((item, index) => `<option value="${index}" ${index === ui.branch ? "selected" : ""}>${index + 1} · ${h(item.sources[0].sourceCode)} · ${item.rows.length} ${t("筆組成", "thành phần")} · ${display(item.root.specification)}</option>`).join("")}</select></div>` : ""}${branch ? `<details class="bom-source-info"><summary>${t("查看 BOM 資料來源", "Xem nguồn dữ liệu BOM")} · ${branch.sources.length}</summary><p>${h(branch.root.sourceFile || data.meta.bomSource)}</p><ul>${branch.sources.map(source => `<li><code>${h(source.sourceCode)}</code>${source.page ? ` · ${t("PDF 頁", "Trang PDF")} ${h(source.page)}` : ""} · ${t("原始列", "Dòng gốc")} ${source.index + 1}</li>`).join("")}</ul><small>${t("數量與單位保留來源記錄，未換算成每一件半成品用量。", "Số lượng và đơn vị giữ nguyên theo nguồn; chưa quy đổi cho một đơn vị bán thành phẩm.")}</small></details>` : ""}${count ? `<div class="bom-tree-tools"><label>${t("顯示層級", "Cấp hiển thị")}<select id="bom-depth"><option value="all" ${ui.depth === "all" ? "selected" : ""}>${t("全部下層", "Tất cả cấp dưới")}</option><option value="direct" ${ui.depth === "direct" ? "selected" : ""}>${t("僅下一層", "Chỉ cấp kế tiếp")}</option></select></label><button type="button" class="bom-quiet" id="bom-expand">${t("全部展開", "Mở tất cả")}</button><button type="button" class="bom-quiet" id="bom-collapse">${t("全部收合", "Thu gọn tất cả")}</button></div><div class="bom-tree-scroll"><table class="bom-tree-table"><thead><tr><th>${t("層級", "Cấp")}</th><th>${t("料號／品名", "Mã / Tên linh kiện")}</th><th>${t("規格", "Quy cách")}</th><th>${t("單位", "Đơn vị")}</th><th>${t("定額／用量", "Định mức / Lượng")}</th><th>${t("損耗", "Hao hụt")}</th></tr></thead><tbody>${treeRows(branch)}</tbody></table></div>` : `<div class="bom-empty"><b>${t("尚無這個 SKU 的下層 BOM", "Chưa có BOM cấp dưới cho SKU này")}</b><p>${t("目前資料未記錄子項，待補資料；不會代入整份成品 BOM。", "Nguồn hiện tại chưa ghi nhận thành phần con; cần bổ sung dữ liệu. Không thay thế bằng toàn bộ BOM thành phẩm.")}</p></div>`}`;
  }
  function categories() { return [...new Set(engine.entries.filter(item => !ui.line || item.line === ui.line).map(item => item.category))].sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }); }
  function filtersMarkup() {
    const lineCodes = [...new Set(engine.entries.map(item => item.line))].sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; });
    return `<div class="bom-search-controls"><label class="bom-keyword">${t("搜尋品號或名稱", "Tìm mã hoặc tên")}<input id="bom-query" type="search" value="${h(ui.query)}" placeholder="${t("輸入成品或半成品 SKU，例如 105B100051、3060301B", "Nhập SKU thành phẩm hoặc bán thành phẩm, ví dụ 105B100051, 3060301B")}" autocomplete="off"></label><label>${t("線別", "Chuyền")}<select id="bom-line"><option value="">${t("全部線別", "Tất cả chuyền")}</option>${lineCodes.map(line => `<option value="${h(line)}" ${line === ui.line ? "selected" : ""}>${display(line)}</option>`).join("")}</select></label><label>${t("分類", "Nhóm")}<select id="bom-category"><option value="">${t("全部分類", "Tất cả nhóm")}</option>${categories().map(category => `<option value="${h(category)}" ${category === ui.category ? "selected" : ""}>${display(category)}</option>`).join("")}</select></label><button type="button" class="bom-quiet" id="bom-reset">${t("清除篩選", "Xóa bộ lọc")}</button></div>`;
  }
  bomTable = function () {
    refreshIndex();
    const results = engine.search(ui.query, ui.line, ui.category); selection(results);
    return `<section class="bom-finder" data-i18n-skip="true"><div class="bom-finder-title"><h2>${t("BOM 快速查找", "Tra cứu BOM")}</h2><span>${t("成品與半成品 · 依層級查看", "Thành phẩm và bán thành phẩm · Xem theo cấp")}</span></div>${filtersMarkup()}<div class="bom-search-workspace"><aside id="bom-results" aria-label="${t("搜尋結果", "Kết quả")}">${resultMarkup(results)}</aside><section id="bom-detail" aria-label="${t("BOM 組成", "Thành phần BOM")}">${detailMarkup()}</section></div></section>`;
  };
  const searchTable = bomTable;
  bomTable = function () {
    const markup = searchTable();
    return globalThis.BOMExcel ? markup.replace('<div class="bom-search-controls">', globalThis.BOMExcel.toolbar() + '<div class="bom-search-controls">') : markup;
  };
  function paintResults(preferExact = false) {
    const results = engine.search(ui.query, ui.line, ui.category); selection(results, preferExact);
    document.querySelector("#bom-results").innerHTML = resultMarkup(results);
    document.querySelector("#bom-detail").innerHTML = detailMarkup(); bindResults(); bindDetail();
  }
  function paintDetail() { document.querySelector("#bom-detail").innerHTML = detailMarkup(); bindDetail(); }
  function bindResults() {
    document.querySelectorAll("[data-bom-pick]").forEach(button => button.onclick = () => { resetSelection(button.dataset.bomPick); paintResults(); });
    document.querySelector("#bom-more")?.addEventListener("click", () => { ui.limit += 60; paintResults(); });
  }
  function bindDetail() {
    globalThis.BOMExcel?.bind({code:ui.code,branch:engine.branches(ui.code)[ui.branch],repaint:paintAll});
    document.querySelector("#bom-source")?.addEventListener("change", event => { ui.branch = Number(event.target.value); ui.collapsed.clear(); paintDetail(); });
    document.querySelector("#bom-depth")?.addEventListener("change", event => { ui.depth = event.target.value; paintDetail(); });
    document.querySelectorAll("[data-bom-toggle]").forEach(button => button.onclick = () => {
      const index = Number(button.dataset.bomToggle), scroll = document.querySelector(".bom-tree-scroll");
      const top = scroll?.scrollTop || 0, left = scroll?.scrollLeft || 0;
      if (ui.collapsed.has(index)) ui.collapsed.delete(index); else ui.collapsed.add(index);
      paintDetail(); const next = document.querySelector(".bom-tree-scroll"); if (next) { next.scrollTop = top; next.scrollLeft = left; }
      document.querySelector(`[data-bom-toggle="${index}"]`)?.focus({ preventScroll: true });
    });
    document.querySelector("#bom-expand")?.addEventListener("click", () => { ui.depth = "all"; ui.collapsed.clear(); paintDetail(); });
    document.querySelector("#bom-collapse")?.addEventListener("click", () => { const rows = engine.branches(ui.code)[ui.branch]?.rows || []; ui.collapsed = new Set(rows.map((row, index) => index)); paintDetail(); });
  }
  function paintAll() { const content = document.querySelector("#data-content"); if (content) { content.innerHTML = bomTable(); bind(); } }
  function bind() {
    document.querySelector("#bom-query")?.addEventListener("input", event => { ui.query = event.target.value; ui.limit = 60; paintResults(true); });
    document.querySelector("#bom-query")?.addEventListener("keydown", event => { if (event.key === "Enter") { const first = engine.search(ui.query, ui.line, ui.category)[0]; if (first) { resetSelection(first.code); paintResults(); document.querySelector("#bom-detail h2")?.scrollIntoView({ block: "nearest" }); } } });
    document.querySelector("#bom-line")?.addEventListener("change", event => { ui.line = event.target.value; ui.category = ""; ui.limit = 60; paintAll(); });
    document.querySelector("#bom-category")?.addEventListener("change", event => { ui.category = event.target.value; ui.limit = 60; paintResults(); });
    document.querySelector("#bom-reset")?.addEventListener("click", () => { ui.query = ""; ui.line = ""; ui.category = ""; ui.limit = 60; resetSelection(""); paintAll(); document.querySelector("#bom-query")?.focus(); });
    bindResults(); bindDetail();
  }
  const oldBindDataInner = bindDataInner;
  bindDataInner = function (tab) { if (tab === "bom") bind(); else oldBindDataInner(tab); };
  let lastLanguage = document.documentElement.lang;
  new MutationObserver(() => { const language = document.documentElement.lang; if (language !== lastLanguage) { lastLanguage = language; if (document.querySelector(".bom-finder")) paintAll(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
