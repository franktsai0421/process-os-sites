import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Read-only gate. Recovery/materialization uses the updater's validated exact
// transaction paths directly; there is deliberately no bypass flag or context.
export class LocalUpdateBlockedError extends Error {
  constructor(reason) {
    super('Local update transaction requires verified recovery; normal storage access refused');
    this.name = 'LocalUpdateBlockedError';
    this.code = 'LOCAL_UPDATE_INCOMPLETE';
    this.reason = reason;
  }
}
const blocked = reason => { throw new LocalUpdateBlockedError(reason); };
const requireThat = (value, reason) => { if (!value) blocked(reason); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected) => object(value) && Object.keys(value).sort().join('|') === expected.slice().sort().join('|');
const samePath = (a, b) => typeof a === 'string' && (process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));
const fields = ['dev', 'ino', 'size', 'nlink', 'mtimeNs', 'ctimeNs'];
const same = (a, b) => fields.every(key => a[key] === b[key]);
const cross = (a, b) => fields.slice(0, 5).every(key => a[key] === b[key]);
function lstat(file) {
  try { return fs.lstatSync(file, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function directory(file) {
  const value = lstat(file);
  requireThat(value?.isDirectory() && !value.isSymbolicLink() && samePath(fs.realpathSync.native(file), file), 'UPDATE_PATH_UNSAFE');
}
function read(file, limit = 16 * 1024) {
  const before = lstat(file);
  requireThat(before?.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size > 0n && before.size <= BigInt(limit), 'UPDATE_METADATA_UNSAFE');
  requireThat(samePath(fs.realpathSync.native(file), file), 'UPDATE_PATH_UNSAFE');
  const fd = fs.openSync(file, 'r');
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    requireThat(cross(before, opened), 'UPDATE_METADATA_CHANGED');
    const buffer = Buffer.alloc(limit + 1); let size = 0;
    while (size < buffer.length) {
      const n = fs.readSync(fd, buffer, size, buffer.length - size, size);
      if (!n) break;
      size += n;
    }
    requireThat(BigInt(size) === before.size && same(opened, fs.fstatSync(fd, { bigint: true })) && same(before, lstat(file)), 'UPDATE_METADATA_CHANGED');
    const bytes = buffer.subarray(0, size);
    return { value: JSON.parse(bytes.toString('utf8')), sha256: sha(bytes) };
  } finally { fs.closeSync(fd); }
}
const next = {
  PREPARED: ['BACKED_UP', 'ROLLING_BACK', 'HOLD'],
  BACKED_UP: ['STAGED', 'ROLLING_BACK', 'HOLD'],
  STAGED: ['OLD_MOVED', 'ROLLING_BACK', 'HOLD'],
  OLD_MOVED: ['NEW_ACTIVE', 'ROLLING_BACK', 'HOLD'],
  NEW_ACTIVE: ['VERIFIED', 'ROLLING_BACK', 'HOLD'],
  VERIFIED: ['COMMITTED', 'ROLLING_BACK', 'HOLD'],
  HOLD: ['ROLLING_BACK'],
  ROLLING_BACK: ['RECOVERED', 'HOLD'],
  COMMITTED: [], RECOVERED: [],
};
export function assertNoIncompleteUpdate(root) {
  try {
    requireThat(arguments.length === 1 && typeof root === 'string' && root.length > 0, 'UPDATE_ROOT_INVALID');
    for (let cursor = path.resolve(root); ; cursor = path.dirname(cursor)) {
      requireThat(path.basename(cursor).toLowerCase() !== '.u1s', 'UPDATE_RECOVERY_NAMESPACE');
      if (path.dirname(cursor) === cursor) break;
    }
    const nominal = lstat(root);
    requireThat(nominal?.isDirectory() && !nominal.isSymbolicLink(), 'UPDATE_ROOT_INVALID');
    const project = fs.realpathSync.native(root);
    // Transaction staging/retained/backup roots are recovery-only. Passing one
    // as a new normal root must not evade the active project's journal.
    for (let cursor = project; ; cursor = path.dirname(cursor)) {
      requireThat(!['.process-update', '.u1s'].includes(path.basename(cursor).toLowerCase()), 'UPDATE_RECOVERY_NAMESPACE');
      directory(cursor);
      if (path.dirname(cursor) === cursor) break;
    }
    // Any short SDK staging entry blocks normal use, regardless of its type,
    // name provenance or claimed transaction owner. Only the updater may recover.
    requireThat(!lstat(path.join(project, '.u1s')), 'UPDATE_SHORT_STAGE_PRESENT');
    const control = path.join(project, '.process-update');
    if (!lstat(control)) return;
    directory(control);
    requireThat(!lstat(path.join(control, 'lock')), 'UPDATE_LOCK_PRESENT');
    requireThat(!lstat(path.join(control, 'lease-reclaim.lock')), 'UPDATE_RECLAIM_PRESENT');
    requireThat(fs.readdirSync(control).every(name => ['enable', 'access-lease.json', 'transaction.json', 'transactions', 'observations'].includes(name)), 'UPDATE_CONTROL_INVALID');
    if (lstat(path.join(control, 'observations'))) directory(path.join(control, 'observations'));
    const enabled = lstat(path.join(control, 'enable'));
    if (enabled) {
      const value = read(path.join(control, 'enable')).value;
      requireThat(keys(value, ['format', 'targetRoot']) && value.format === 'PROCESS_OS_OFFLINE_UPDATE_ENABLED_V1' && samePath(value.targetRoot, project), 'UPDATE_ENABLE_INVALID');
    }
    if (!lstat(path.join(control, 'transaction.json')) && enabled) {
      directory(path.join(project, '.wrangler')); directory(path.join(project, '.wrangler', 'state')); directory(path.join(project, '.wrangler', 'local-only'));
      const transactions = path.join(control, 'transactions');
      if (lstat(transactions)) { directory(transactions); requireThat(fs.readdirSync(transactions).length === 0, 'UPDATE_POINTER_MISSING'); }
      const installed = path.join(project, '.wrangler', 'local-only', 'installed-package.json');
      if (lstat(installed)) requireThat(read(installed, 2 * 1024 * 1024).value?.format === 'PROCESS_OS_INSTALLED_FULL_SNAPSHOT_V1', 'UPDATE_ACTIVE_MANIFEST_INVALID');
      requireThat(!lstat(path.join(control, 'lock')) && !lstat(path.join(control, 'transaction.json')), 'UPDATE_CHANGED_DURING_CHECK');
      return;
    }
    const pointerRead = read(path.join(control, 'transaction.json'));
    const pointer = pointerRead.value;
    requireThat(keys(pointer, ['format', 'targetRoot', 'transactionId', 'transactionDirectory']) && pointer.format === 'PROCESS_OS_OFFLINE_UPDATE_POINTER_V1' && samePath(pointer.targetRoot, project) && uuid(pointer.transactionId), 'UPDATE_POINTER_INVALID');
    const transaction = path.join(control, 'transactions', pointer.transactionId);
    requireThat(samePath(pointer.transactionDirectory, transaction), 'UPDATE_TRANSACTION_BOUNDARY');
    directory(path.join(control, 'transactions')); directory(transaction);
    const events = path.join(transaction, 'events'); directory(events);
    const names = fs.readdirSync(events).sort();
    requireThat(names.length > 0 && names.length <= 64 && names.every((name, i) => name === `${String(i + 1).padStart(6, '0')}.json`), 'UPDATE_EVENT_INVENTORY');
    let previousHash = null, phase = null, last;
    for (let i = 0; i < names.length; i++) {
      last = read(path.join(events, names[i])); const event = last.value;
      requireThat(keys(event, ['format', 'transactionId', 'targetRoot', 'sequence', 'previousHash', 'phase', 'data']) && event.format === 'PROCESS_OS_OFFLINE_UPDATE_EVENT_V1' && event.transactionId === pointer.transactionId && samePath(event.targetRoot, project) && event.sequence === i + 1 && event.previousHash === previousHash && object(event.data), 'UPDATE_EVENT_INVALID');
      requireThat(i === 0 ? event.phase === 'PREPARED' : next[phase]?.includes(event.phase), 'UPDATE_PHASE_INVALID');
      phase = event.phase; previousHash = last.sha256;
    }
    requireThat(phase === 'COMMITTED' || phase === 'RECOVERED', 'UPDATE_UNFINISHED');
    const completed = read(path.join(transaction, 'completion.json')).value;
    requireThat(keys(completed, ['format', 'transactionId', 'targetRoot', 'phase', 'sequence', 'eventSHA256', 'verified', 'activeManifestSHA256']) && completed.format === 'PROCESS_OS_OFFLINE_UPDATE_COMPLETION_V1' && completed.transactionId === pointer.transactionId && samePath(completed.targetRoot, project) && completed.phase === phase && completed.sequence === names.length && completed.eventSHA256 === last.sha256 && completed.verified === true && hash(completed.activeManifestSHA256), 'UPDATE_COMPLETION_INVALID');
    directory(path.join(project, '.wrangler')); directory(path.join(project, '.wrangler', 'state')); directory(path.join(project, '.wrangler', 'local-only'));
    const installed = read(path.join(project, '.wrangler', 'local-only', 'installed-package.json'), 2 * 1024 * 1024);
    requireThat(installed.sha256 === completed.activeManifestSHA256 && installed.value?.format === 'PROCESS_OS_INSTALLED_FULL_SNAPSHOT_V1', 'UPDATE_ACTIVE_MANIFEST_INVALID');
    // Recheck lock and pointer after metadata reads. A new transaction cannot
    // be mistaken for the terminal state just inspected.
    requireThat(!lstat(path.join(control, 'lock')) && read(path.join(control, 'transaction.json')).sha256 === pointerRead.sha256
      && JSON.stringify(fs.readdirSync(events).sort()) === JSON.stringify(names), 'UPDATE_CHANGED_DURING_CHECK');
    return Object.freeze({ transactionId: pointer.transactionId, phase });
  } catch (error) {
    if (error instanceof LocalUpdateBlockedError) throw error;
    blocked('UPDATE_METADATA_UNREADABLE');
  }
}
