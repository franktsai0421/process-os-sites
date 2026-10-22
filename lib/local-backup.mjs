import {openLeasedLocalSQLite} from './local-storage-sqlite.mjs';
import {acquireLocalStorageLease} from './local-storage-lease.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import {readRevocations,mergeRevocations} from './local-revocation-recovery.mjs';

const DEFAULT_PATH = '.local-backups';
const SETTINGS_FILE = 'local-backup.settings.json';
const MAX_UNPACKED = 512 * 1024 * 1024;
const DEFAULTS = {
  enabled: false,
  backupPath: process.env.PROCESS_BACKUP_PATH || DEFAULT_PATH,
  retentionDays: 30,
  dayOfWeek: 6,
  time: '12:00',
  timezone: 'Asia/Ho_Chi_Minh',
  maxUnpackedBytes: MAX_UNPACKED,
};
const EXCLUDED = new Set([
  '.git',
  'node_modules',
  '.next',
  '.vinext',
  'dist',
  '.wrangler',
  '.process-update',
  '.u1s',
  '.wrangler-config',
  'outputs',
  'work',
  'coverage',
  '.local-backups',
]);
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const sha256 = (buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');
const json = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const atomicJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
};
const safeName = (name) => {
  let normalized = String(name).replace(/\\/g, '/');
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  if (!normalized) return '.';
  if (
    normalized.startsWith('/') ||
    /^[a-z]:/i.test(normalized) ||
    normalized.split('/').some((part) => part === '..')
  )
    throw Error(`ZIP 路徑不安全：${name}`);
  return normalized;
};

function settingsPath(projectRoot) {
  return path.join(projectRoot, SETTINGS_FILE);
}
export function loadSettings(projectRoot) {
  const value = { ...DEFAULTS, ...json(settingsPath(projectRoot), {}) };
  value.backupPath = validateBackupPath(process.env.PROCESS_BACKUP_PATH || value.backupPath || DEFAULT_PATH, projectRoot);
  value.enabled = value.enabled === true;
  value.retentionDays = Math.min(
    365,
    Math.max(1, Number(value.retentionDays) || 30),
  );
  value.dayOfWeek = Number.isInteger(Number(value.dayOfWeek))
    ? Number(value.dayOfWeek)
    : 6;
  value.time = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time || '')
    ? value.time
    : '12:00';
  value.timezone = 'Asia/Ho_Chi_Minh';
  value.maxUnpackedBytes = Math.min(
    2 * 1024 ** 3,
    Math.max(10 * 1024 ** 2, Number(value.maxUnpackedBytes) || MAX_UNPACKED),
  );
  return value;
}
export function saveSettings(
  projectRoot,
  input,
  { createDirectory = true } = {},
) {
  const current = loadSettings(projectRoot),
    next = { ...current, ...input };
  if (process.env.PROCESS_BACKUP_PATH)
    next.backupPath = process.env.PROCESS_BACKUP_PATH;
  next.backupPath = validateBackupPath(next.backupPath, projectRoot);
  next.retentionDays = Math.min(
    365,
    Math.max(1, Number(next.retentionDays) || 30),
  );
  next.enabled = next.enabled === true;
  if (Number(next.dayOfWeek) !== 6) throw Error('自動備份固定為星期六');
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(next.time || ''))
    throw Error('備份時間格式錯誤');
  next.timezone = 'Asia/Ho_Chi_Minh';
  if (next.enabled || createDirectory) {
    if (!fs.existsSync(next.backupPath)) fs.mkdirSync(next.backupPath, { recursive: true });
    if (!fs.statSync(next.backupPath).isDirectory()) throw Error('備份路徑不是資料夾');
    const probe = path.join(next.backupPath, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    const disk = fs.statfsSync(next.backupPath);
    if (disk.bavail * disk.bsize < 100 * 1024 * 1024)
      throw Error('備份磁碟可用空間不足 100 MB');
  }
  atomicJson(settingsPath(projectRoot), next);
  if (next.enabled) ensureSystem(next);
  return next;
}
function validateBackupPath(value, projectRoot) {
  if (!String(value || '').trim()) throw Error('請指定備份資料夾');
  if (/^(?:\\\\|\/\/)|^[a-z][a-z\d+.-]*:\/\//i.test(String(value))) throw Error('LOCAL_BACKUP_PATH_REQUIRED');
  const resolved = path.resolve(projectRoot, String(value).trim()), root = path.parse(resolved).root;
  if (resolved === root) throw Error('不可使用磁碟或系統根目錄作為備份位置');
  const project = path.resolve(projectRoot), home = path.resolve(os.homedir());
  if (resolved === project || project.startsWith(`${resolved}${path.sep}`))
    throw Error('備份位置不可是網站專案或其上層資料夾');
  if (resolved === home) throw Error('不可直接使用使用者主目錄作為備份位置');
  const sensitive = process.platform === 'win32'
    ? [process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramData]
    : ['/bin','/boot','/dev','/etc','/proc','/root','/sbin','/sys','/usr'];
  if (sensitive.filter(Boolean).some((entry) => {
    const base = path.resolve(entry);
    return resolved === base || resolved.startsWith(`${base}${path.sep}`);
  })) throw Error('不可使用系統敏感位置作為備份資料夾');
  return resolved;
}
export function backupPathPickerSupported() {
  if (process.platform === 'win32' || process.platform === 'darwin') return true;
  if (process.platform === 'linux')
    return spawnSync('sh', ['-lc', 'command -v zenity'], { encoding: 'utf8' }).status === 0;
  return false;
}
let pickerRunning=false;
export async function chooseBackupDirectory(projectRoot) {
  if (!backupPathPickerSupported()) return { supported: false, reason: '此主機沒有可用的原生資料夾選擇器，請手動輸入伺服器路徑。' };
  if(pickerRunning)throw Error('資料夾選擇視窗已開啟，請先完成或取消');
  let executable,args;
  if (process.platform === 'win32') {
    if (!process.env.SystemRoot) throw Error('SYSTEM_ROOT_REQUIRED');
    const command = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; [Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $owner=New-Object System.Windows.Forms.Form; $owner.Text='PROCESS OS backup folder'; $owner.TopMost=$true; $owner.Width=1; $owner.Height=1; $owner.StartPosition='CenterScreen'; $owner.Show(); $owner.Activate(); $dialog=New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description='PROCESS OS - Select server backup folder'; $dialog.ShowNewFolderButton=$true; try { if($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK){Write-Output $dialog.SelectedPath} } finally {$dialog.Dispose();$owner.Close();$owner.Dispose()}";
    const modern=spawnSync('where.exe',['pwsh.exe'],{encoding:'utf8',windowsHide:true});
    executable=String(modern.stdout||'').split(/\r?\n/).find(file=>file&&fs.existsSync(file))||path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
    args=['-NoProfile','-NonInteractive','-STA','-Command',command];
  } else if (process.platform === 'darwin') {
    executable='osascript';args=['-e','POSIX path of (choose folder with prompt "PROCESS OS backup folder")'];
  } else {
    executable='zenity';args=['--file-selection','--directory','--title=PROCESS OS backup folder'];
  }
  pickerRunning=true;
  let result;
  try { result=await new Promise((resolve,reject)=>{const child=spawn(executable,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';const timeout=setTimeout(()=>{child.kill();reject(Error('資料夾選擇逾時；請確認主機目前有互動式桌面'))},180000);child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);child.on('error',error=>{clearTimeout(timeout);reject(Error('無法啟動系統資料夾選擇器：'+error.message))});child.on('close',code=>{clearTimeout(timeout);if(code!==0&&!(process.platform!=='win32'&&(code===1||stderr.includes('-128'))))reject(Error('系統資料夾選擇器失敗：'+(stderr.trim()||'程序代碼 '+code)));else resolve({stdout});});}); }
  finally {pickerRunning=false;}
  const selected = String(result.stdout || '').trim();
  if (!selected) return { supported: true, cancelled: true };
  return { supported: true, path: validateBackupPath(selected, projectRoot) };
}
function ensureSystem(settings) {
  fs.mkdirSync(settings.backupPath, { recursive: true });
  const system = path.join(settings.backupPath, '.system');
  fs.mkdirSync(system, { recursive: true });
  const keyFile = path.join(system, 'backup.key');
  if (!fs.existsSync(keyFile)) {
    fs.writeFileSync(keyFile, crypto.randomBytes(32));
    try {
      fs.chmodSync(keyFile, 0o600);
    } catch {}
  }
  return {
    system,
    keyFile,
    stateFile: path.join(system, 'state.json'),
    auditFile: path.join(system, 'audit.jsonl'),
    lockFile: path.join(system, 'operation.lock'),
  };
}
function audit(settings, entry) {
  const { auditFile } = ensureSystem(settings);
  fs.appendFileSync(
    auditFile,
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
  );
}
function acquire(settings, type) {
  const { lockFile } = ensureSystem(settings);
  let fd;
  try {
    fd = fs.openSync(lockFile, 'wx');
  } catch {
    throw Error('已有備份或還原工作正在執行');
  }
  fs.writeFileSync(
    fd,
    JSON.stringify({
      type,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    }),
  );
  return () => {
    try {
      fs.closeSync(fd);
    } catch {}
    try {
      fs.unlinkSync(lockFile);
    } catch {}
  };
}
function zipDirectory(source, destination) {
  if (process.platform !== 'win32')
    throw Error('目前主機 ZIP 引擎只支援已確認的 Windows 環境');
  if (fs.existsSync(destination)) fs.unlinkSync(destination);
  const result = spawnSync(
    'tar.exe',
    ['-a', '-c', '-f', destination, '-C', source, '.'],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw Error((result.stderr || result.stdout || 'ZIP 作業失敗').trim());
}
function findDatabase(projectRoot) {
  const folder = path.join(
    projectRoot,
    '.wrangler',
    'state',
    'v3',
    'd1',
    'miniflare-D1DatabaseObject',
  );
  if (!fs.existsSync(folder)) throw Error('找不到本機 D1 SQLite 資料庫');
  const files = fs
    .readdirSync(folder)
    .filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
    .map((name) => path.join(folder, name));
  if (!files.length) throw Error('找不到本機 D1 SQLite 資料庫');
  return files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
}
function databaseVersion(projectRoot, file) {
  const db = openLeasedLocalSQLite(projectRoot, DatabaseSync, file, { readOnly: true });
  try {
    return String(db.prepare('select sqlite_version() version').get().version);
  } finally {
    db.close();
  }
}
function snapshotDatabase(projectRoot, source, target) {
  const db = openLeasedLocalSQLite(projectRoot, DatabaseSync, source, { readOnly: true });
  try {
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
}
function snapshotR2(projectRoot, target) {
  const source=path.join(projectRoot,'.wrangler','state','v3','r2');
  if(!fs.existsSync(source))return;
  for(const rel of walk(source)){
    if(rel.endsWith('-wal')||rel.endsWith('-shm'))continue;
    const to=path.join(target,rel);fs.mkdirSync(path.dirname(to),{recursive:true});
    if(rel.endsWith('.sqlite'))snapshotDatabase(projectRoot,path.join(source,rel),to);
    else fs.copyFileSync(path.join(source,rel),to);
  }
}
function restoreR2(projectRoot, expanded) {
  const source=path.join(expanded,'r2');
  if(!fs.existsSync(source))return;
  const target=path.join(projectRoot,'.wrangler','state','v3','r2');
  for(const rel of walk(source)){
    const from=path.join(source,rel),to=path.join(target,rel);fs.mkdirSync(path.dirname(to),{recursive:true});
    if(rel.endsWith('.sqlite')&&fs.existsSync(to)){
      const db=openLeasedLocalSQLite(projectRoot, DatabaseSync, to);
      try{
        db.exec(`ATTACH DATABASE '${from.replaceAll("'","''")}' AS restored; BEGIN IMMEDIATE`);
        const tables=db.prepare("SELECT name FROM restored.sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
        for(const {name} of tables){const quoted='"'+name.replaceAll('"','""')+'"';db.exec(`DELETE FROM main.${quoted}; INSERT INTO main.${quoted} SELECT * FROM restored.${quoted}`);}
        db.exec('COMMIT; DETACH DATABASE restored');
      }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}finally{db.close();}
    }else fs.copyFileSync(from,to);
  }
}
function walk(source, relative = '', out = []) {
  for (const item of fs.readdirSync(path.join(source, relative), {
    withFileTypes: true,
  })) {
    if (
      EXCLUDED.has(item.name) ||
      (item.name === SETTINGS_FILE && !relative) ||
      item.name.startsWith('.env') ||
      item.name.startsWith('.dev.vars') ||
      item.name.endsWith('.log') ||
      item.name.endsWith('.zip') ||
      item.name.endsWith('.tar.gz') ||
      item.name.endsWith('.pem')
    )
      continue;
    const rel = path.join(relative, item.name);
    if (item.isDirectory()) walk(source, rel, out);
    else if (item.isFile()) out.push(rel);
  }
  return out;
}
function copySite(projectRoot, target, backupPath) {
  const backupRoot = path.resolve(backupPath);
  const files = walk(projectRoot).filter(
    (rel) =>
      !path.resolve(projectRoot, rel).startsWith(`${backupRoot}${path.sep}`),
  );
  for (const rel of files) {
    const destination = path.join(target, rel);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(projectRoot, rel), destination);
  }
  return files;
}
function encryptFile(source, target, keyFile) {
  const key = fs.readFileSync(keyFile),
    iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = fs.readFileSync(source),
    encrypted = Buffer.concat([cipher.update(plain), cipher.final()]),
    tag = cipher.getAuthTag();
  fs.writeFileSync(
    target,
    Buffer.concat([Buffer.from('PCBKP1'), iv, tag, encrypted]),
  );
  return fs.statSync(target).size;
}
function decryptFile(source, target, keyFile) {
  const raw = fs.readFileSync(source);
  if (raw.subarray(0, 6).toString() !== 'PCBKP1')
    throw Error('加密備份格式不正確');
  const key = fs.readFileSync(keyFile),
    decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(6, 18));
  decipher.setAuthTag(raw.subarray(18, 34));
  fs.writeFileSync(
    target,
    Buffer.concat([decipher.update(raw.subarray(34)), decipher.final()]),
  );
}
function parseZip(file, maxBytes = MAX_UNPACKED) {
  const data = fs.readFileSync(file);
  let eocd = -1;
  for (let i = Math.max(0, data.length - 65557); i <= data.length - 22; i++)
    if (data.readUInt32LE(i) === 0x06054b50) eocd = i;
  if (eocd < 0) throw Error('ZIP 結尾目錄損壞');
  const count = data.readUInt16LE(eocd + 10),
    centralOffset = data.readUInt32LE(eocd + 16);
  let cursor = centralOffset,
    total = 0;
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (data.readUInt32LE(cursor) !== 0x02014b50)
      throw Error('ZIP 中央目錄損壞');
    const method = data.readUInt16LE(cursor + 10),
      expectedCrc = data.readUInt32LE(cursor + 16),
      compressedSize = data.readUInt32LE(cursor + 20),
      size = data.readUInt32LE(cursor + 24),
      nameLength = data.readUInt16LE(cursor + 28),
      extraLength = data.readUInt16LE(cursor + 30),
      commentLength = data.readUInt16LE(cursor + 32),
      localOffset = data.readUInt32LE(cursor + 42),
      rawName = data
        .subarray(cursor + 46, cursor + 46 + nameLength)
        .toString('utf8'),
      name = safeName(rawName);
    total += size;
    if (total > maxBytes) throw Error('ZIP 解壓容量超過安全上限');
    entries.push({
      name,
      directory: rawName.endsWith('/'),
      method,
      expectedCrc,
      compressedSize,
      size,
      localOffset,
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return { data, entries, total };
}
function readEntry(zip, entry) {
  const offset = entry.localOffset;
  if (zip.data.readUInt32LE(offset) !== 0x04034b50)
    throw Error(`ZIP 項目損壞：${entry.name}`);
  const nameLength = zip.data.readUInt16LE(offset + 26),
    extraLength = zip.data.readUInt16LE(offset + 28),
    start = offset + 30 + nameLength + extraLength,
    compressed = zip.data.subarray(start, start + entry.compressedSize);
  const value =
    entry.method === 0
      ? Buffer.from(compressed)
      : entry.method === 8
        ? zlib.inflateRawSync(compressed)
        : (() => {
            throw Error(`ZIP 壓縮格式不支援：${entry.name}`);
          })();
  if (value.length !== entry.size || crc32(value) !== entry.expectedCrc)
    throw Error(`ZIP 項目校驗失敗：${entry.name}`);
  return value;
}
function inspectArchive(file, settings, { full = false } = {}) {
  const outer = parseZip(file, settings.maxUnpackedBytes),
    manifestEntry = outer.entries.find(
      (entry) => entry.name === 'manifest.json',
    ),
    payloadEntry = outer.entries.find((entry) => entry.name === 'payload.enc');
  if (!manifestEntry) throw Error('缺少 manifest.json');
  if (!payloadEntry) throw Error('缺少加密網站內容 payload.enc');
  const manifest = JSON.parse(readEntry(outer, manifestEntry).toString('utf8'));
  if (
    manifest.format !== 'process-control-backup/v1' ||
    manifest.result !== 'complete'
  )
    throw Error('備份格式或建立結果不正確');
  const payload = readEntry(outer, payloadEntry);
  if (
    sha256(payload) !== manifest.payload.sha256 ||
    payload.length !== manifest.payload.size
  )
    throw Error('SHA-256 校驗值不符');
  if (!String(manifest.systemVersion || '').startsWith('2026.'))
    throw Error('系統版本不相容');
  if (full) {
    const { keyFile } = ensureSystem(settings),
      temp = fs.mkdtempSync(path.join(os.tmpdir(), 'process-restore-check-')),
      enc = path.join(temp, 'payload.enc'),
      inner = path.join(temp, 'payload.zip');
    try {
      fs.writeFileSync(enc, payload);
      decryptFile(enc, inner, keyFile);
      const parsed = parseZip(inner, settings.maxUnpackedBytes);
      const actual = new Map(
        parsed.entries
          .filter((entry) => !entry.name.endsWith('/'))
          .map((entry) => {
            const value = readEntry(parsed, entry);
            return [entry.name, { size: value.length, sha256: sha256(value) }];
          }),
      );
      for (const expected of manifest.contents.files || []) {
        const found = actual.get(expected.path);
        if (
          !found ||
          found.size !== expected.size ||
          found.sha256 !== expected.sha256
        )
          throw Error(`內容校驗失敗：${expected.path}`);
      }
      return { manifest, innerZip: fs.readFileSync(inner) };
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
  return { manifest };
}
function retention(settings) {
  const files = fs
      .readdirSync(settings.backupPath)
      .filter((name) => /^backup_\d{4}-\d{2}-\d{2}_\d{6}\.zip$/.test(name))
      .map((name) => ({
        name,
        file: path.join(settings.backupPath, name),
        mtime: fs.statSync(path.join(settings.backupPath, name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime),
    cutoff = Date.now() - settings.retentionDays * 86400000;
  for (const item of files.slice(1))
    if (item.mtime < cutoff) fs.unlinkSync(item.file);
}
function weekKey(date = new Date()) {
  const vietnam = new Date(
      date.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }),
    ),
    day = (vietnam.getDay() + 6) % 7,
    monday = new Date(vietnam);
  monday.setDate(vietnam.getDate() - day);
  return `${monday.getFullYear()}-W${String(Math.ceil(((monday - new Date(monday.getFullYear(), 0, 1)) / 86400000 + new Date(monday.getFullYear(), 0, 1).getDay() + 1) / 7)).padStart(2, '0')}`;
}
function scheduledDue(settings, now = new Date()) {
  const local = new Date(
      now.toLocaleString('en-US', { timeZone: settings.timezone }),
    ),
    [hour, minute] = settings.time.split(':').map(Number),
    dayFromMonday = (local.getDay() + 6) % 7,
    scheduledDayFromMonday = (settings.dayOfWeek + 6) % 7;
  return (
    dayFromMonday > scheduledDayFromMonday ||
    (dayFromMonday === scheduledDayFromMonday &&
      (local.getHours() > hour ||
        (local.getHours() === hour && local.getMinutes() >= minute)))
  );
}
export function createBackup(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return createBackupUnderLease(...args); } finally { storageLease.release(); }
}
function createBackupUnderLease(
  projectRoot,
  {
    type = 'manual',
    actor = 'admin',
    reason = '管理員立即備份',
    sourceIp = 'local',
    now = new Date(),
  } = {},
) {
  const settings = saveSettings(projectRoot, loadSettings(projectRoot), {
      createDirectory: true,
    }),
    release = acquire(settings, 'backup'),
    started = Date.now();
  let temp;
  try {
    const system = ensureSystem(settings);
    temp = fs.mkdtempSync(path.join(system.system, 'temp-'));
    const payload = path.join(temp, 'payload'),
      site = path.join(payload, 'site'),
      database = path.join(payload, 'database'),
      config = path.join(payload, 'config');
    fs.mkdirSync(site, { recursive: true });
    fs.mkdirSync(database, { recursive: true });
    fs.mkdirSync(config, { recursive: true });
    const sourceDb = findDatabase(projectRoot),
      databaseFile = path.join(database, 'process-control.sqlite');
    snapshotDatabase(projectRoot, sourceDb, databaseFile);
    snapshotR2(projectRoot,path.join(payload,'r2'));
    copySite(projectRoot, site, settings.backupPath);
    fs.writeFileSync(
      path.join(config, 'local-backup.settings.json'),
      JSON.stringify(settings, null, 2),
    );
    const contentFiles = walk(payload).map((rel) => {
      const value = fs.readFileSync(path.join(payload, rel));
      return {
        path: rel.replace(/\\/g, '/'),
        size: value.length,
        sha256: sha256(value),
      };
    });
    const inner = path.join(temp, 'payload.zip');
    zipDirectory(payload, inner);
    const encrypted = path.join(temp, 'payload.enc');
    const payloadSize = encryptFile(inner, encrypted, system.keyFile),
      stamp = now
        .toLocaleString('sv-SE', { timeZone: settings.timezone })
        .replace(' ', '_')
        .replaceAll(':', ''),
      fileName = `backup_${stamp}_${crypto.randomUUID().slice(0,8)}.zip`,
      outer = path.join(temp, 'outer');
    fs.mkdirSync(outer);
    fs.copyFileSync(encrypted, path.join(outer, 'payload.enc'));
    const manifest = {
      format: 'process-control-backup/v1',
      createdAt: now.toISOString(),
      scheduledWeek: weekKey(now),
      type,
      reason,
      systemVersion: '2026.09.08.3900',
      database: {
        type: 'Cloudflare D1 / SQLite',
        version: databaseVersion(projectRoot, databaseFile),
        encrypted: true,
      },
      contents: {
        summary: [
          '完整網站程式與按鍵功能',
          'D1 SQLite 資料庫',
          '網站資產與上傳內容',
          '備份系統設定與版本資訊',
        ],
        files: contentFiles,
      },
      payload: {
        file: 'payload.enc',
        encryption: 'AES-256-GCM',
        size: payloadSize,
        sha256: sha256(fs.readFileSync(encrypted)),
      },
      result: 'complete',
    };
    fs.writeFileSync(
      path.join(outer, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );
    const pending = path.join(temp, fileName);
    zipDirectory(outer, pending);
    inspectArchive(pending, settings);
    const final = path.join(settings.backupPath, fileName);
    fs.renameSync(pending, final);
    retention(settings);
    const state = json(system.stateFile, {});
    state.lastSuccessAt = now.toISOString();
    state.lastFailure = null;
    if (type === 'automatic') state.lastAutomaticWeek = weekKey(now);
    atomicJson(system.stateFile, state);
    audit(settings, {
      actor,
      actorId: actor,
      sourceIp,
      action: type === 'automatic' ? 'automatic-backup' : 'manual-backup',
      fileName,
      backupVersion: manifest.systemVersion,
      success: true,
      durationMs: Date.now() - started,
      size: fs.statSync(final).size,
    });
    return { fileName, manifest, size: fs.statSync(final).size };
  } catch (error) {
    const system = ensureSystem(settings),
      state = json(system.stateFile, {});
    state.lastFailure = String(error.message || error);
    atomicJson(system.stateFile, state);
    audit(settings, {
      actor,
      actorId: actor,
      sourceIp,
      action: 'backup',
      success: false,
      error: state.lastFailure,
      durationMs: Date.now() - started,
    });
    throw error;
  } finally {
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
    release();
  }
}
export function listBackups(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return listBackupsUnderLease(...args); } finally { storageLease.release(); }
}
function listBackupsUnderLease(projectRoot) {
  const settings = loadSettings(projectRoot);
  if (!settings.enabled) {
    return {
      settings: { ...settings, nextScheduledAt: null },
      state: { thisWeekComplete: false },
      disk: { freeBytes: null, totalBytes: null },
      backups: [],
      audit: [],
      pathPickerSupported: backupPathPickerSupported(),
    };
  }
  saveSettings(projectRoot, settings, { createDirectory: true });
  const
    system = ensureSystem(settings),
    items = [];
  for (const name of fs
    .readdirSync(settings.backupPath)
    .filter((name) => name.toLowerCase().endsWith('.zip'))) {
    const file = path.join(settings.backupPath, name);
    try {
      const { manifest } = inspectArchive(file, settings);
      items.push({
        fileName: name,
        size: fs.statSync(file).size,
        status: 'complete',
        createdAt: manifest.createdAt,
        systemVersion: manifest.systemVersion,
        databaseVersion: manifest.database.version,
        type: manifest.type,
        reason: manifest.reason,
      });
    } catch (error) {
      items.push({
        fileName: name,
        size: fs.statSync(file).size,
        status: 'damaged',
        createdAt: null,
        error: String(error.message || error),
      });
    }
  }
  items.sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  );
  const disk = fs.statfsSync(settings.backupPath),
    state = json(system.stateFile, {}),
    local = new Date(),
    next = new Date(local);
  const delta = (settings.dayOfWeek - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + delta);
  const [hour, minute] = settings.time.split(':').map(Number);
  next.setHours(hour, minute, 0, 0);
  if (next <= local) next.setDate(next.getDate() + 7);
  return {
    settings: {
      ...settings,
      nextScheduledAt: settings.enabled ? next.toISOString() : null,
    },
    state: {
      ...state,
      thisWeekComplete: state.lastAutomaticWeek === weekKey(),
    },
    disk: {
      freeBytes: disk.bavail * disk.bsize,
      totalBytes: disk.blocks * disk.bsize,
    },
    backups: items,
    audit: fs.existsSync(system.auditFile)
      ? fs
          .readFileSync(system.auditFile, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .slice(-50)
          .reverse()
          .map((line) => JSON.parse(line))
      : [],
    pathPickerSupported: backupPathPickerSupported(),
  };
}
export function inspectBackup(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return inspectBackupUnderLease(...args); } finally { storageLease.release(); }
}
function inspectBackupUnderLease(projectRoot, fileName) {
  const settings = loadSettings(projectRoot),
    file = path.join(settings.backupPath, path.basename(fileName));
  const { manifest } = inspectArchive(file, settings, { full: true });
  return { fileName: path.basename(file), status: 'complete', manifest };
}
function extractInner(innerZip, target, maxBytes) {
  const tempZip = path.join(path.dirname(target), 'payload-verified.zip');
  fs.writeFileSync(tempZip, innerZip);
  const parsed = parseZip(tempZip, maxBytes);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of parsed.entries) {
    if (entry.directory) continue;
    const destination = path.resolve(target, entry.name);
    if (!destination.startsWith(path.resolve(target) + path.sep))
      throw Error('ZIP 路徑穿越已阻擋');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, readEntry(parsed, entry));
  }
}
function setMaintenance(projectRoot, databaseFile, enabled) {
  const db = openLeasedLocalSQLite(projectRoot, DatabaseSync, databaseFile);
  try {
    db.exec('BEGIN IMMEDIATE');
    const row = db
        .prepare('SELECT revision,"values" FROM shared_state WHERE id=1')
        .get(),
      values = JSON.parse(row.values);
    values.maintenanceMode = enabled ? '1' : '0';
    db.prepare(
      'UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1',
    ).run(
      Number(row.revision) + 1,
      JSON.stringify(values),
      new Date().toISOString(),
    );
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    db.close();
  }
}
function restoreDatabase(projectRoot, live, backup) {
  const revoked=readRevocations(projectRoot,backup);
  const db = openLeasedLocalSQLite(projectRoot, DatabaseSync, live);
  try {
    db.exec(
      `ATTACH DATABASE '${backup.replace(/'/g, "''")}' AS restored; BEGIN IMMEDIATE;`,
    );
    const oldFeedback=db.prepare("SELECT name FROM restored.sqlite_master WHERE name='web_feedback_store'").get();
    const liveFeedback=db.prepare("SELECT name FROM main.sqlite_master WHERE name='web_feedback_store'").get();
    if(!oldFeedback&&liveFeedback){const row=db.prepare('SELECT payload FROM main.web_feedback_store WHERE id=1').get();if(row&&Object.values(JSON.parse(row.payload)).some(v=>Array.isArray(v)&&v.length))throw Error('Older backup lacks feedback history; restore refused');}
    db.exec('DELETE FROM main.state_backups; INSERT INTO main.state_backups SELECT * FROM restored.state_backups; DELETE FROM main.shared_state; INSERT INTO main.shared_state SELECT * FROM restored.shared_state;');
    if(oldFeedback){if(!liveFeedback)db.exec('CREATE TABLE main.web_feedback_store(id INTEGER PRIMARY KEY NOT NULL CHECK(id=1),revision INTEGER NOT NULL,payload TEXT NOT NULL)');db.exec('DELETE FROM main.web_feedback_store; INSERT INTO main.web_feedback_store SELECT * FROM restored.web_feedback_store');}
    mergeRevocations(db,revoked);
    db.exec('COMMIT; DETACH DATABASE restored');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    db.close();
  }
}
function restoreSite(projectRoot, siteRoot) {
  for (const rel of walk(siteRoot)) {
    const source = path.join(siteRoot, rel),
      destination = path.join(projectRoot, rel),
      temp = `${destination}.${process.pid}.restore`;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, temp);
    fs.renameSync(temp, destination);
  }
}
export function restoreBackup(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return restoreBackupUnderLease(...args); } finally { storageLease.release(); }
}
function restoreBackupUnderLease(
  projectRoot,
  {
    fileName,
    actor = 'admin',
    password,
    confirmText,
    sourceIp = 'local',
    testFailAfterApply = false,
  } = {},
) {
  if (confirmText !== '0988901928') throw Error('確認文字錯誤');
  if (!verifyAdmin(projectRoot, actor, password))
    throw Error('ADMIN 帳號或密碼錯誤');
  const settings = loadSettings(projectRoot),
    release = acquire(settings, 'restore'),
    started = Date.now(),
    liveDb = findDatabase(projectRoot);
  let safety;
  try {
    release();
    safety = createBackup(projectRoot, {
      type: 'safety',
      actor,
      reason: '還原前安全備份',
      sourceIp,
    });
    const restoreRelease = acquire(settings, 'restore');
    try {
      const file = path.join(settings.backupPath, path.basename(fileName)),
        checked = inspectArchive(file, settings, { full: true }),
        temp = fs.mkdtempSync(path.join(os.tmpdir(), 'process-restore-')),
        expanded = path.join(temp, 'expanded');
      extractInner(checked.innerZip, expanded, settings.maxUnpackedBytes);
      setMaintenance(projectRoot, liveDb, true);
      restoreDatabase(
        projectRoot, liveDb,
        path.join(expanded, 'database', 'process-control.sqlite'),
      );
      restoreR2(projectRoot, expanded);
      restoreSite(projectRoot, path.join(expanded, 'site'));
      if (testFailAfterApply) throw Error('模擬還原套用失敗');
      const restoredSettings = path.join(
        expanded,
        'config',
        'local-backup.settings.json',
      );
      if (fs.existsSync(restoredSettings))
        fs.copyFileSync(restoredSettings, settingsPath(projectRoot));
      setMaintenance(projectRoot, liveDb, false);
      audit(settings, {
        actor,
        actorId: actor,
        sourceIp,
        action: 'restore',
        fileName: path.basename(file),
        backupVersion: checked.manifest.systemVersion,
        originalVersion: '2026.09.08.3900',
        restoredVersion: checked.manifest.systemVersion,
        success: true,
        rollback: null,
        durationMs: Date.now() - started,
        safetyBackup: safety.fileName,
      });
      return { ok: true, safetyBackup: safety.fileName, restartRequired: true };
    } catch (error) {
      try {
        const rollbackFile =
          safety && path.join(settings.backupPath, safety.fileName);
        if (rollbackFile) {
          const checked = inspectArchive(rollbackFile, settings, {
              full: true,
            }),
            temp = fs.mkdtempSync(path.join(os.tmpdir(), 'process-rollback-')),
            expanded = path.join(temp, 'expanded');
          extractInner(checked.innerZip, expanded, settings.maxUnpackedBytes);
          restoreDatabase(
            projectRoot, liveDb,
            path.join(expanded, 'database', 'process-control.sqlite'),
          );
          restoreR2(projectRoot, expanded);
          restoreSite(projectRoot, path.join(expanded, 'site'));
          setMaintenance(projectRoot, liveDb, false);
        }
      } catch (rollbackError) {
        audit(settings, {
          actor,
          actorId: actor,
          sourceIp,
          action: 'restore',
          fileName,
          success: false,
          error: String(error.message || error),
          rollbackResult: String(rollbackError.message || rollbackError),
        });
        throw Error(`還原失敗且回滾失敗：${rollbackError.message}`);
      }
      audit(settings, {
        actor,
        actorId: actor,
        sourceIp,
        action: 'restore',
        fileName,
        success: false,
        error: String(error.message || error),
        rollbackResult: 'success',
      });
      throw error;
    } finally {
      restoreRelease();
    }
  } finally {
    try {
      release();
    } catch {}
  }
}
export function deleteBackup(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return deleteBackupUnderLease(...args); } finally { storageLease.release(); }
}
function deleteBackupUnderLease(
  projectRoot,
  { fileName, actor = 'admin', password, confirmText, sourceIp = 'local' } = {},
) {
  if (
    confirmText !== '0988901928' ||
    !verifyAdmin(projectRoot, actor, password)
  )
    throw Error('ADMIN 密碼或確認文字錯誤');
  const settings = loadSettings(projectRoot),
    release = acquire(settings, 'delete');
  try {
    const file = path.join(settings.backupPath, path.basename(fileName));
    inspectArchive(file, settings);
    fs.unlinkSync(file);
    audit(settings, {
      actor,
      actorId: actor,
      sourceIp,
      action: 'delete-backup',
      fileName: path.basename(file),
      success: true,
    });
    return { ok: true };
  } finally {
    release();
  }
}
function readAdmin(projectRoot, id) {
  try {
    const db = openLeasedLocalSQLite(projectRoot, DatabaseSync, findDatabase(projectRoot), { readOnly: true });
    let row;
    try { row = db.prepare('SELECT "values" FROM shared_state WHERE id=1').get(); } finally { db.close(); }
    const values = JSON.parse(row.values),
      users = JSON.parse(values.platformUsers || '[]'),
      user = users.find((item) => item.id === id);
    return user?.role === 'admin' && user.enabled !== false && !user.deletedAt ? user : null;
  } catch {
    return null;
  }
}
export function verifyAdminRole(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return verifyAdminRoleUnderLease(...args); } finally { storageLease.release(); }
}
function verifyAdminRoleUnderLease(projectRoot, id) {
  return !!readAdmin(projectRoot, id);
}
export function verifyAdmin(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return verifyAdminUnderLease(...args); } finally { storageLease.release(); }
}
function verifyAdminUnderLease(projectRoot, id, password) {
  const user = readAdmin(projectRoot, id),
    expected = Buffer.from(String(user?.password || '')),
    supplied = Buffer.from(String(password || ''));
  return (
    !!user &&
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied)
  );
}
export function runScheduler(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return runSchedulerUnderLease(...args); } finally { storageLease.release(); }
}
function runSchedulerUnderLease(projectRoot, now = new Date()) {
  const configured = loadSettings(projectRoot),
    key = weekKey(now);
  if (!configured.enabled)
    return { created: false, disabled: true, week: key };
  const settings = saveSettings(projectRoot, configured, {
      createDirectory: true,
    }),
    system = ensureSystem(settings),
    state = json(system.stateFile, {});
  if (!scheduledDue(settings, now) || state.lastAutomaticWeek === key)
    return { created: false, week: key };
  return {
    created: true,
    week: key,
    backup: createBackup(projectRoot, {
      type: 'automatic',
      actor: 'system',
      reason: '每週六 12:00 自動整站備份',
      now,
    }),
  };
}
export function startScheduler(projectRoot) {
  setTimeout(() => {
    try {
      runScheduler(projectRoot);
    } catch (error) {
      console.error('[backup] startup schedule failed:', error.message);
    }
  }, 3000).unref?.();
  const timer = setInterval(() => {
    try {
      runScheduler(projectRoot);
    } catch (error) {
      console.error('[backup] schedule failed:', error.message);
    }
  }, 60000);
  timer.unref?.();
  return () => clearInterval(timer);
}
