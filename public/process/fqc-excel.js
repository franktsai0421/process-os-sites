(function (host) {
  const SOURCE_SHA256 = '5BC8CC4B55C4194DA08E18E4F9E75CE65D4FB50967B2A0BB2F861B5845FCF257';
  const text = value => String(value ?? '').trim();
  const bool = value => /^(yes|true|1|是)$/i.test(text(value));
  const productList = value => text(value).split(/[,，\n\r]+/).map(text).filter(Boolean);

  function mergedValue(sheet, rows, row, col) {
    const direct = rows[row]?.[col];
    if (direct !== '' && direct != null) return direct;
    const merge = (sheet['!merges'] || []).find(range => row >= range.s.r && row <= range.e.r && col >= range.s.c && col <= range.e.c);
    return merge ? rows[merge.s.r]?.[merge.s.c] ?? '' : '';
  }

  function productRef(code, context) {
    const product = context.products.find(item => item.code === code);
    if (product) return { code, kind: 'product', name: product.name || '', specification: product.specification || '' };
    const part = context.parts.find(item => item.code === code);
    if (part) return { code, kind: part.kind || 'part', name: part.name || '', specification: part.specification || '' };
    return { code, kind: 'unresolved', name: '', specification: '' };
  }

  function parseSource(workbook, context = {}) {
    const sheet = workbook.Sheets['產品資料'];
    const categorySheet = workbook.Sheets['產品類別'];
    if (!sheet || !categorySheet) throw Error('Excel 必須包含「產品資料」與「產品類別」工作表');
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    const categoryRows = XLSX.utils.sheet_to_json(categorySheet, { header: 1, defval: '', raw: true });
    const categories = categoryRows.slice(1).map((row, index) => ({ line: text(row[0]), name: text(row[1]), row: index + 2 })).filter(item => item.name);
    const errors = new Map(), items = [], issues = [], checkNos = new Set();
    for (let row = 1; row < rows.length; row += 1) {
      const category = text(mergedValue(sheet, rows, row, 0));
      const errorCode = text(mergedValue(sheet, rows, row, 1));
      const errorName = text(mergedValue(sheet, rows, row, 2));
      const checkNo = text(rows[row]?.[3]);
      if (!category && !errorCode && !checkNo) continue;
      if (!category || !errorCode || !checkNo) {
        issues.push({ row: row + 1, type: 'FORMAT', message: '類別、錯誤代碼或檢查編號缺漏' });
        continue;
      }
      if (checkNos.has(checkNo)) issues.push({ row: row + 1, type: 'DUPLICATE', message: `檢查編號重複：${checkNo}` });
      checkNos.add(checkNo);
      const line = categories.find(item => item.name === category)?.line || context.categories.find(item => item.name === category)?.line || '';
      const errorId = `fqc-error:${errorCode}`;
      if (!errors.has(errorCode)) errors.set(errorCode, { id: errorId, category, line, code: errorCode, name: errorName, isDeleted: false, reason: '' });
      const productCodes = productList(rows[row]?.[9]);
      const refs = productCodes.map(code => productRef(code, context));
      refs.filter(ref => ref.kind === 'semi-finished').forEach(ref => issues.push({ row: row + 1, type: 'SEMI_FINISHED', message: `${ref.code} 已引用既有半成品身分`, code: ref.code }));
      refs.filter(ref => ref.kind === 'unresolved').forEach(ref => issues.push({ row: row + 1, type: 'UNRESOLVED_PRODUCT', message: `找不到產品或半成品：${ref.code}`, code: ref.code }));
      let versionDate = '';
      if (rows[row]?.[12]) {
        versionDate = typeof rows[row][12] === 'number' ? XLSX.SSF.format('yyyy-mm-dd', rows[row][12]) : text(rows[row][12]);
      }
      items.push({
        id: `fqc-item:${checkNo}`, errorId, category, line, checkNo,
        name: text(rows[row]?.[4]), description: text(rows[row]?.[5]), tool: text(rows[row]?.[7]),
        mediaItems: [], isMonthly: false, isQuarterly: bool(rows[row]?.[8]), isYearly: false,
        isCustomPeriod: false, customPeriodText: '', productCodes,
        productRefs: refs, isEnabled: bool(rows[row]?.[10]), note: text(rows[row]?.[15]), reason: '',
        source: { sheet: '產品資料', row: row + 1, version: text(rows[row]?.[11]), versionDate, versionReason: text(rows[row]?.[13]) },
      });
    }
    const emptyCategories = categories.filter(category => !items.some(item => item.category === category.name));
    emptyCategories.forEach(category => issues.push({ row: category.row, type: 'EMPTY_CATEGORY', message: `${category.name} 無檢查項目` }));
    return { categories, errors: [...errors.values()], items, issues, source: { sha256: SOURCE_SHA256, fileName: 'FQC標準 FQC-C TRIL 1.xlsx', importedAt: new Date().toISOString() } };
  }

  function parseRoundTrip(workbook, context) {
    const metaSheet = workbook.Sheets['FQC格式說明'];
    const rows = metaSheet ? XLSX.utils.sheet_to_json(metaSheet, { header: 1, defval: '' }) : [];
    if (rows[0]?.[1] !== 'PROCESS_OS_FQC_EXCEL') return null;
    const errorRows = XLSX.utils.sheet_to_json(workbook.Sheets['錯誤代碼'] || {}, { defval: '' });
    const itemRows = XLSX.utils.sheet_to_json(workbook.Sheets['檢查項目'] || {}, { defval: '' });
    const photoRows = XLSX.utils.sheet_to_json(workbook.Sheets['照片資料'] || {}, { defval: '' });
    const photoContent = new Map();
    photoRows.sort((a, b) => Number(a.分段) - Number(b.分段)).forEach(row => {
      const key = `${row.檢查項目ID}\0${row.圖片ID}`;
      const current = photoContent.get(key) || { id: String(row.圖片ID || ''), name: String(row.檔名 || ''), type: String(row.MIME || ''), note: String(row.備註 || ''), src: '' };
      current.src += String(row.內容 || '');
      if (!current.note && row.備註) current.note = String(row.備註);
      photoContent.set(key, current);
    });
    const errors = errorRows.map(row => ({ id: text(row.ID), category: text(row.產品類別), line: text(row.線別), code: text(row.錯誤代碼), name: String(row.錯誤名稱 ?? ''), reason: String(row.變更理由 ?? ''), isDeleted: bool(row.已刪除) }));
    const items = itemRows.map(row => {
      const productCodes = productList(row.包含產品);
      let mediaItems = [];
      try {
        mediaItems = JSON.parse(String(row.圖片JSON || '[]')).map(media => {
          const detail = photoContent.get(`${row.ID}\0${media.id}`);
          return { ...media, ...detail, note: media.note || detail?.note || '' };
        });
      } catch {}
      return {
        id: text(row.ID), errorId: text(row.錯誤代碼ID), category: text(row.產品類別), line: text(row.線別), checkNo: text(row.FQC檢查編號),
        name: String(row.檢查項目 ?? ''), description: String(row.檢查方式敘述 ?? ''), tool: String(row.檢查工具 ?? ''), mediaItems,
        isMonthly: bool(row.月檢查), isQuarterly: bool(row.季檢查), isYearly: bool(row.年檢查),
        isCustomPeriod: bool(row.自訂檢查週期), customPeriodText: text(row.自訂週期內容),
        productCodes, productRefs: productCodes.map(code => productRef(code, context)), isEnabled: bool(row.啟用),
        note: String(row.備註 ?? ''), reason: String(row.變更理由 ?? ''), source: { importedFormat: 'PROCESS_OS_FQC_EXCEL' },
      };
    });
    return { categories: [], errors, items, issues: [], source: { format: 'PROCESS_OS_FQC_EXCEL', importedAt: new Date().toISOString() } };
  }

  async function parseFile(file, context) {
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: false });
    return parseRoundTrip(workbook, context) || parseSource(workbook, context);
  }

  function exportWorkbook(version, context, history = []) {
    const workbook = XLSX.utils.book_new();
    const photoRows = [];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['格式', 'PROCESS_OS_FQC_EXCEL'], ['格式版本', 1], ['版本', version.number], ['狀態', version.status], ['匯出時間', new Date().toISOString()], ['來源SHA256', version.source?.sha256 || ''],
    ]), 'FQC格式說明');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet((version.snapshot.errors || []).map(error => ({ ID: error.id, 線別: error.line, 產品類別: error.category, 錯誤代碼: error.code, 錯誤名稱: error.name, 變更理由: error.reason || '', 已刪除: error.isDeleted ? 'YES' : 'NO' }))), '錯誤代碼');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet((version.snapshot.items || []).map(item => {
      (item.mediaItems || []).forEach(media => {
        const chunks = String(media.src || '').match(/[\s\S]{1,28000}/g) || [''];
        chunks.forEach((content, index) => photoRows.push({ 檢查項目ID: item.id, 圖片ID: media.id, 檔名: media.name || '', MIME: media.type || '', 分段: index + 1, 總分段: chunks.length, 備註: media.note || '', 內容: content }));
      });
      return {
        ID: item.id, 錯誤代碼ID: item.errorId, 線別: item.line, 產品類別: item.category, FQC檢查編號: item.checkNo,
        檢查項目: item.name, 檢查方式敘述: item.description, 檢查工具: item.tool,
        月檢查: item.isMonthly ? 'YES' : 'NO', 季檢查: item.isQuarterly ? 'YES' : 'NO', 年檢查: item.isYearly ? 'YES' : 'NO',
        自訂檢查週期: item.isCustomPeriod ? 'YES' : 'NO', 自訂週期內容: item.customPeriodText || '',
        包含產品: (item.productCodes || []).join(','), 啟用: item.isEnabled ? 'YES' : 'NO',
        圖片JSON: JSON.stringify((item.mediaItems || []).map(({ src: _src, ...media }) => media)),
        變更理由: item.reason || '', 備註: item.note || '',
      };
    })), '檢查項目');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(photoRows), '照片資料');
    const products = context.products.map(product => ({ 線別: product.line, 產品類別: product.category, 編號: product.code, 名稱: product.name, 規格: product.specification, 身分: product.kind || 'product' }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(products), '適用產品');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(history), '操作紀錄');
    XLSX.writeFile(workbook, `FQC-${version.number}-${version.status}.xlsx`, { compression: true });
  }

  host.FQCExcel = { SOURCE_SHA256, parseFile, exportWorkbook, parseSource };
})(window);
