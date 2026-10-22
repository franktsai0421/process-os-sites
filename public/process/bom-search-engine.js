(function (host) {
  "use strict";
  const text = value => String(value ?? "").trim();
  const normalize = value => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();

  // BOM source rows are a preorder tree. A subtree ends at the first peer or ancestor.
  function subtree(rows, start) {
    const base = Number(rows[start]?.level);
    if (!Number.isFinite(base)) return [];
    let end = start + 1;
    while (end < rows.length && Number(rows[end].level) > base) end++;
    return rows.slice(start + 1, end).map((row, index) => ({ ...row, relativeLevel: Number(row.level) - base, sourceIndex: start + index + 1 }));
  }

  function create(bom, products, routes) {
    const catalog = new Map(), occurrences = new Map();
    function add(code, values) {
      code = text(code);
      if (!code) return;
      const old = catalog.get(code) || { code, name: "", category: "待補", line: "待補", specification: "" };
      catalog.set(code, { ...old, ...values, code });
    }
    Object.entries(bom).forEach(([code, rows]) => {
      const root = rows.find(row => Number(row.level) === 0);
      add(code, { name: root?.itemName || "待補", specification: root?.specification || "", hasOwnBom: true });
      rows.forEach((row, index) => {
        if (!row.itemCode || Number(row.level) === 0) return;
        if (!catalog.has(text(row.itemCode))) add(row.itemCode, { name: row.itemName || "待補", specification: row.specification || "" });
        const key = text(row.itemCode);
        if (!occurrences.has(key)) occurrences.set(key, []);
        occurrences.get(key).push({ sourceCode: code, index });
      });
    });
    products.forEach(product => add(product.code, { ...product, name: product.name || catalog.get(product.code)?.name || "待補", line: routes[product.code]?.line || product.line || "待補" }));
    const entries = [...catalog.values()].map(item => ({ ...item, haystack: normalize([item.code, item.name, item.category, item.specification].join(" ")) }));
    function search(query = "", line = "", category = "") {
      const q = normalize(query), tokens = q.split(/\s+/).filter(Boolean);
      return entries.filter(item => (!line || item.line === line) && (!category || item.category === category) && tokens.every(token => item.haystack.includes(token)))
        .sort((a, b) => {
          const rank = item => normalize(item.code) === q ? 0 : q && normalize(item.code).startsWith(q) ? 1 : item.hasOwnBom ? 2 : 3;
          return rank(a) - rank(b) || a.code.localeCompare(b.code, undefined, { numeric: true });
        });
    }
    function branches(code) {
      code = text(code);
      const own = bom[code];
      if (own?.length) {
        const rootIndex = own.findIndex(row => Number(row.level) === 0);
        if (rootIndex >= 0) return [{ root: own[rootIndex], rows: subtree(own, rootIndex), sources: [{ sourceCode: code, index: rootIndex, page: own[rootIndex].sourcePage }], own: true }];
      }
      const groups = new Map();
      (occurrences.get(code) || []).forEach(({ sourceCode, index }) => {
        const sourceRows = bom[sourceCode], rows = subtree(sourceRows, index);
        // Keep differing quantities, units and specifications separate; never merge unrelated occurrences.
        const signature = JSON.stringify([sourceRows[index].specification, rows.map(row => [row.relativeLevel, row.itemCode, row.itemName, row.specification, row.unit, row.quantity, row.waste])]);
        if (!groups.has(signature)) groups.set(signature, { root: sourceRows[index], rows, sources: [], own: false });
        groups.get(signature).sources.push({ sourceCode, index, page: sourceRows[index].sourcePage });
      });
      return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length);
    }
    return { entries, search, branches, get: code => catalog.get(text(code)) };
  }
  const api = { create, subtree, normalize };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else host.BomSearchEngine = api;
})(typeof window === "undefined" ? globalThis : window);
