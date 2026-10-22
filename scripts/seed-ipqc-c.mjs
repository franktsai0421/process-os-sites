import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const mode = flag('--dry-run') ? 'dry-run' : flag('--apply') ? 'apply' : flag('--verify') ? 'verify' : '';
const target = option('--target');
const url = option('--url');
const sourcePath = option('--source');
const python = option('--python') || process.env.IPQC_PYTHON || 'python';
if (!mode || target !== 'local' || !sourcePath || !url || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(url)) {
  console.error('Usage: node scripts/seed-ipqc-c.mjs --dry-run|--apply|--verify --target local --url http://127.0.0.1:3001 --source <xlsx> [--python <python3>] [--report <json>]');
  process.exit(2);
}
const origin = url.replace(/\/$/, '');
const source = fs.readFileSync(sourcePath);
const sha256 = crypto.createHash('sha256').update(source).digest('hex');
const parsed = spawnSync(python, [path.resolve('scripts/read-ipqc-c-source.py'), sourcePath],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
if (parsed.status !== 0) throw Error(`Excel 解析失敗：${parsed.stderr || parsed.error?.message || 'unknown'}`);
const workbook = JSON.parse(parsed.stdout);
if (workbook.rows.length !== 862 || workbook.rows[0]?.row !== 2 || workbook.rows.at(-1)?.row !== 863 ||
    workbook.headers[1] !== 'Mã sản phẩm' || workbook.headers[4] !== 'Mã lỗi IPQC' ||
    workbook.headers[6] !== 'Mã hạng mục kiểm tra IPQC-C')
  throw Error('來源工作表、越文欄名或 2–863 列與確認基準不符');

const login = await fetch(`${origin}/api/platform-login`, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demoRole: 'admin' }) });
if (!login.ok) throw Error(`Local ADMIN 登入失敗：HTTP ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie?.startsWith('process_demo=')) throw Error('Local 登入未回傳工作階段');
const authHeaders = { Cookie: cookie, 'Content-Type': 'application/json' };
const read = async () => {
  const response = await fetch(`${origin}/api/ipqc-c`, { headers: authHeaders });
  const body = await response.json();
  if (!response.ok) throw Error(body.error || `IPQC-C HTTP ${response.status}`);
  return body;
};
const current = await read();
const catalog = new Map(current.catalog.products.map(product => [product.code, product]));
const stageCodes = new Set(current.catalog.stages.map(stage => stage.code));
const existingErrors = new Map(current.control.versions.flatMap(version => version.snapshot.errors.map(error => [error.code, error])));
const existingItems = new Map(current.control.versions.flatMap(version => version.snapshot.items.map(item => [item.code, item])));
const historical = new Set(current.historicalCodes || []);
const equipmentGroups = new Map((current.equipmentGroups || []).map(group => [group.name, group.id]));
const seenErrors = new Set(), seenItems = new Set();
const records = [], audit = [];
const stat = { products: new Set(), sourceErrorCodes: new Set(), sourceItemCodes: new Set(),
  cpkOn: 0, standardOn: 0, blankDisabledStandard: 0, blankEnabledFrequency: 0, nameDifferences: new Set() };
for (const entry of workbook.rows) {
  const [line, productCode, sourceName, stageCode, errorCode, errorName, itemCode, standard,
    cpk, description, image, tool, method, frequency, enabled, note] = entry.cells;
  const reasons = [], warnings = [];
  stat.products.add(productCode); stat.sourceErrorCodes.add(errorCode); stat.sourceItemCodes.add(itemCode);
  if (line !== 'LINE C') reasons.push(`產線不是 LINE C：${line}`);
  const product = catalog.get(productCode);
  if (!product) reasons.push(`C 線主檔沒有產品 ${productCode}`);
  if (!stageCodes.has(stageCode)) reasons.push(`C 線主檔沒有工段 ${stageCode}`);
  if (product && !product.stages.includes(stageCode)) reasons.push(`產品 ${productCode} 現行路線沒有 ${stageCode}`);
  if (product && product.name !== sourceName) { stat.nameDifferences.add(productCode); warnings.push('來源產品名稱與現行主檔不同；依代碼關聯，未覆寫名稱'); }
  if (!errorCode || !itemCode || !itemCode.startsWith(`${errorCode}-`)) reasons.push('E/G 編號與父代碼不符');
  if (seenErrors.has(errorCode)) reasons.push(`來源 E 編號重複：${errorCode}`);
  if (seenItems.has(itemCode)) reasons.push(`來源 G 編號重複：${itemCode}`);
  seenErrors.add(errorCode); seenItems.add(itemCode);
  if (cpk !== 'Bật' && cpk !== 'Không') reasons.push(`I 欄未知 CPK 值：${cpk}`);
  if (enabled !== 'Có' && enabled !== 'Không') reasons.push(`O 欄未知啟用值：${enabled}`);
  if (cpk === 'Bật') stat.cpkOn++;
  if (enabled === 'Có') stat.standardOn++;
  if (!standard && enabled === 'Không') { stat.blankDisabledStandard++; warnings.push('停用且檢查標準空白；保留原值'); }
  if (!frequency && enabled === 'Có') { stat.blankEnabledFrequency++; warnings.push('啟用但頻率空白；保留原值待補'); }
  if (image) warnings.push('K 欄含來源圖片文字，未自動產生圖片資產');
  const groupId = equipmentGroups.get(tool) || '';
  if (tool && !groupId) warnings.push('工具文字未對應生效設備規格群組；原文保留');
  if (existingErrors.has(errorCode) || existingItems.has(itemCode)) {
    if (current.control.source?.sha256 === sha256 &&
        existingErrors.get(errorCode)?.sourceRow === entry.row && existingItems.get(itemCode)?.sourceRow === entry.row)
      warnings.push('同源已建置');
    else reasons.push('編號已存在於 IPQC-C 版本；不可覆寫或重新編號');
  }
  if (historical.has(errorCode) || historical.has(itemCode)) reasons.push('其他歷史資料已引用編號；須人工核對');
  const status = reasons.length ? 'conflict' : current.control.source?.sha256 === sha256 &&
    existingErrors.has(errorCode) && existingItems.has(itemCode) ? 'same-source-existing' : 'buildable';
  audit.push({ row: entry.row, productCode, stageCode, errorCode, itemCode, status, reasons, warnings });
  if (status !== 'buildable') continue;
  const errorId = `ipqc-c-error-row-${entry.row}`;
  records.push({
    error: { id: errorId, code: errorCode, productCode, stageCode, name: errorName,
      note: '', reason: '', sourceRow: entry.row, deleted: false },
    item: { id: `ipqc-c-item-row-${entry.row}`, code: itemCode, errorId, productCode, stageCode,
      standard, cpkEnabled: cpk === 'Bật', standardEnabled: enabled === 'Có', description,
      tool, method, frequency, note, reason: '', equipmentGroupId: groupId,
      mediaItems: [], sourceRow: entry.row, deleted: false, notApplicable: false },
  });
}
const summary = {
  sourceRows: workbook.rows.length, products: stat.products.size, uniqueErrorCodes: stat.sourceErrorCodes.size,
  uniqueItemCodes: stat.sourceItemCodes.size, cpkOn: stat.cpkOn, cpkOff: workbook.rows.length - stat.cpkOn,
  standardOn: stat.standardOn, standardOff: workbook.rows.length - stat.standardOn,
  blankDisabledStandard: stat.blankDisabledStandard, blankEnabledFrequency: stat.blankEnabledFrequency,
  nameDifferences: stat.nameDifferences.size,
  buildable: audit.filter(row => row.status === 'buildable').length,
  sameSourceExisting: audit.filter(row => row.status === 'same-source-existing').length,
  conflicts: audit.filter(row => row.status === 'conflict').length,
};
const report = { mode, environment: 'local', source: { fileName: path.basename(sourcePath), sha256 },
  master: { products: catalog.size, stages: stageCodes.size, stateRevision: current.revision }, summary, rows: audit };
const reportPath = option('--report') || path.resolve('.wrangler/local-only/ipqc-c-audit.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: reportPath, sha256, summary }, null, 2));
if (summary.uniqueErrorCodes !== 862 || summary.uniqueItemCodes !== 862 || summary.products !== 81 ||
    summary.cpkOn !== 62 || summary.standardOn !== 826 || summary.blankDisabledStandard !== 36 ||
    summary.blankEnabledFrequency !== 29)
  throw Error('來源統計不符；沒有建置');
if (mode === 'verify') {
  const effective = current.control.versions.find(version => version.id === current.control.activeVersionId);
  if (!effective || current.control.source?.sha256 !== sha256 ||
      effective.snapshot.errors.length !== workbook.rows.length || effective.snapshot.items.length !== workbook.rows.length)
    throw Error('Local 生效版或來源 SHA／筆數不符');
  const errors = new Map(effective.snapshot.errors.map(row => [row.sourceRow, row]));
  const items = new Map(effective.snapshot.items.map(row => [row.sourceRow, row]));
  const mismatches = [];
  for (const entry of workbook.rows) {
    const [, productCode, , stageCode, errorCode, errorName, itemCode, standard, cpk,
      description, , tool, method, frequency, enabled, note] = entry.cells;
    const error = errors.get(entry.row), item = items.get(entry.row);
    if (!error || !item || error.code !== errorCode || error.name !== errorName ||
        error.productCode !== productCode || error.stageCode !== stageCode || item.errorId !== error.id ||
        item.code !== itemCode || item.standard !== standard || item.description !== description ||
        item.tool !== tool || item.method !== method || item.frequency !== frequency || item.note !== note ||
        item.cpkEnabled !== (cpk === 'Bật') || item.standardEnabled !== (enabled === 'Có'))
      mismatches.push(entry.row);
  }
  if (mismatches.length) throw Error(`Local 讀回與來源不符：來源列 ${mismatches.join(', ')}`);
  console.log(`Local 完整讀回核對通過：${workbook.rows.length} 個錯誤代碼、${workbook.rows.length} 個檢查項目，越文原值與兩種開關一致。`);
}
if (mode === 'apply') {
  if (current.control.source?.sha256 === sha256) {
    const effective = current.control.versions.find(version => version.id === current.control.activeVersionId);
    const imported = current.control.source.imported;
    if (!effective || effective.snapshot.errors.length !== imported || effective.snapshot.items.length !== imported ||
        new Set(effective.snapshot.errors.map(row => row.sourceRow)).size !== imported ||
        new Set(effective.snapshot.items.map(row => row.sourceRow)).size !== imported)
      throw Error('既有同源版本讀回不一致；沒有重複寫入，請核對 Local 資料');
    console.log('同一來源已建置；沒有重複寫入。');
  } else {
    if (!records.length) throw Error('沒有可建置列；沒有寫入');
    const write = await fetch(`${origin}/api/ipqc-c`, { method: 'POST', headers: authHeaders,
      body: JSON.stringify({ action: 'seed', baseRevision: current.revision,
        source: { fileName: path.basename(sourcePath), sha256, rows: workbook.rows.length, records } }) });
    const result = await write.json();
    if (!write.ok) throw Error(`${result.error || `HTTP ${write.status}`}；沒有宣稱建置成功，請重新 dry-run`);
    const verified = await read();
    const effective = verified.control.versions.find(version => version.id === verified.control.activeVersionId);
    const byErrorRow = new Map(effective?.snapshot.errors.map(row => [row.sourceRow, row]));
    const byItemRow = new Map(effective?.snapshot.items.map(row => [row.sourceRow, row]));
    if (!effective || verified.control.source?.sha256 !== sha256 ||
        effective.snapshot.errors.length !== records.length || effective.snapshot.items.length !== records.length ||
        new Set(effective.snapshot.errors.map(row => row.code)).size !== records.length ||
        new Set(effective.snapshot.items.map(row => row.code)).size !== records.length ||
        records.some(pair => {
          const e = byErrorRow.get(pair.error.sourceRow), i = byItemRow.get(pair.item.sourceRow);
          return !e || !i || e.code !== pair.error.code || e.name !== pair.error.name ||
            i.code !== pair.item.code || i.standard !== pair.item.standard ||
            i.description !== pair.item.description || i.tool !== pair.item.tool ||
            i.method !== pair.item.method || i.frequency !== pair.item.frequency ||
            i.cpkEnabled !== pair.item.cpkEnabled || i.standardEnabled !== pair.item.standardEnabled;
        }))
      throw Error('寫入後讀回不符；請保留現況並查核 Local 資料');
    console.log(`Local 讀回核對通過：${records.length} 錯誤代碼、${records.length} 檢查項目；revision ${verified.revision}。`);
  }
}
