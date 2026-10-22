// Consistent, read-only-source Local D1 snapshot before a scoped Local data write.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const folder = path.join(root, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const candidates = fs.readdirSync(folder).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite');
if (candidates.length !== 1) throw Error('Expected exactly one Local D1 database; snapshot stopped');
const source = path.join(folder, candidates[0]);
const destination = path.join(root, '.wrangler/local-only', `before-ipqc-ab-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
fs.mkdirSync(path.dirname(destination), { recursive: true });
if (fs.existsSync(destination)) throw Error('Snapshot target already exists');
const db = new DatabaseSync(source, { readOnly: true });
try { db.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`); }
finally { db.close(); }
const saved = new DatabaseSync(destination, { readOnly: true });
try {
  const integrity = saved.prepare('PRAGMA integrity_check').get();
  if (Object.values(integrity)[0] !== 'ok') throw Error('Snapshot integrity check failed');
  const state = saved.prepare('SELECT revision, "values" FROM shared_state WHERE id=1').get();
  if (!state) throw Error('Snapshot contains no Local state');
  console.log(JSON.stringify({ destination, bytes: fs.statSync(destination).size, revision: state.revision, integrity: 'ok' }));
} finally { saved.close(); }
