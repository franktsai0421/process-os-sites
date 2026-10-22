import {acquireLocalStorageLease} from './local-storage-lease.mjs';

// The operation's outer normal lease may end on a business error; this inner
// reference must outlive the native handle. No filesystem I/O at module import.
export function openLeasedLocalSQLite(root, Database, file, options) {
  const lease = acquireLocalStorageLease(root);
  // A rejected constructor may have acquired native resources. Without a
  // returned handle there is no supported close acknowledgement: retain HOLD.
  const db = options === undefined ? new Database(file) : new Database(file, options);
  const close = db.close.bind(db);
  let closed = false;
  db.close = function () {
    if (closed) return;
    const result = close();
    // If close throws, this line is never reached and the inner lease remains.
    closed = true;
    lease.release();
    return result;
  };
  return db;
}
