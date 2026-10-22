// Local-only read and consistent D1/R2 safety snapshot. Never uses remote bindings.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export async function connect(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(parsed.hostname) ||
      !['3000','3002'].includes(parsed.port) || parsed.username || parsed.password || parsed.pathname !== '/')
    throw Error('Only explicit Local ports 3000/3002 are supported');
  const base = parsed.origin;
  const login = await fetch(`${base}/api/platform-login`, { method:'POST',
    headers:{'Content-Type':'application/json'}, body:JSON.stringify({demoRole:'admin'}) });
  if (!login.ok) throw Error(`Local login failed: ${login.status}`);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie?.startsWith('process_demo=')) throw Error('Local demo session missing');
  const headers = { Cookie:cookie, Origin:base, 'Content-Type':'application/json' };
  const request = async (endpoint, body) => {
    const response = await fetch(`${base}${endpoint}`, { headers, cache:'no-store',
      ...(body ? { method:'POST', body:JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw Error(`${endpoint}: HTTP ${response.status}: ${result.error || 'request failed'}`);
    return result;
  };
  return {base,headers,request};
}
function files(root, relative = '') {
  return fs.readdirSync(path.join(root,relative),{withFileTypes:true}).flatMap(entry => {
    const rel = path.join(relative,entry.name);
    if (entry.isSymbolicLink()) throw Error('Snapshot refuses symbolic links');
    return entry.isDirectory() ? files(root,rel) : entry.isFile() ? [rel] : [];
  });
}
function sqliteSnapshot(from,to) {
  fs.mkdirSync(path.dirname(to),{recursive:true});
  const db = new DatabaseSync(from,{readOnly:true});
  try { db.exec(`VACUUM INTO '${to.replaceAll("'","''")}'`); } finally { db.close(); }
  const saved = new DatabaseSync(to,{readOnly:true});
  try {
    if (Object.values(saved.prepare('PRAGMA integrity_check').get())[0] !== 'ok') throw Error('Snapshot integrity failed');
  } finally { saved.close(); }
}
export async function capture(client, destination, physical = false) {
  const root = process.cwd();
  const served = await fetch(`${client.base}/process/ipqc-ab.js`,{cache:'no-store'});
  if (!served.ok || hash(Buffer.from(await served.arrayBuffer())) !== hash(fs.readFileSync('public/process/ipqc-ab.js')))
    throw Error('Local service is not serving this working tree');
  fs.mkdirSync(destination,{recursive:true});
  const before = await client.request('/api/ipqc-ab');
  const shared = await client.request('/api/shared-state');
  if (shared.revision !== before.revision) throw Error('Local revision changed while reading; retry snapshot');
  const config = JSON.parse(fs.readFileSync('.wrangler/local-only/wrangler.json','utf8'));
  if (config.d1_databases?.some(d=>d.remote!==false) || config.r2_buckets?.some(r=>r.remote!==false))
    throw Error('Snapshot refuses non-Local bindings');
  fs.writeFileSync(path.join(destination,'ipqc-ab-state.json'),JSON.stringify(before,null,2));
  fs.writeFileSync(path.join(destination,'catalog.json'),JSON.stringify(before.catalog,null,2));
  const keyHashes = Object.fromEntries(Object.entries(shared.values).map(([key,value])=>[key,hash(value)]));
  fs.writeFileSync(path.join(destination,'shared-key-hashes.json'),JSON.stringify(keyHashes,null,2));
  if (physical) {
    const d1 = path.resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
    const candidates = fs.readdirSync(d1).filter(n=>n.endsWith('.sqlite')&&n!=='metadata.sqlite');
    if (candidates.length!==1) throw Error('Expected exactly one application Local D1 database');
    const savedPath=path.join(destination,'state/v3/d1/miniflare-D1DatabaseObject',candidates[0]);
    sqliteSnapshot(path.join(d1,candidates[0]),savedPath);
    const savedDb=new DatabaseSync(savedPath,{readOnly:true});
    try { if(savedDb.prepare('SELECT revision FROM shared_state WHERE id=1').get()?.revision!==before.revision)
      throw Error('Local HTTP service and snapshot D1 revision differ'); } finally { savedDb.close(); }
    const r2 = path.resolve('.wrangler/state/v3/r2');
    if (fs.existsSync(r2)) for (const rel of files(r2)) {
      if (rel.endsWith('-wal')||rel.endsWith('-shm')) continue;
      const to = path.join(destination,'state/v3/r2',rel);
      fs.mkdirSync(path.dirname(to),{recursive:true});
      if (rel.endsWith('.sqlite')) sqliteSnapshot(path.join(r2,rel),to);
      else fs.copyFileSync(path.join(r2,rel),to);
    }
  }
  const after = await client.request('/api/ipqc-ab');
  if (after.revision!==before.revision) throw Error('Local revision changed during snapshot; snapshot retained, retry before writing');
  const git = args => execFileSync('git',args,{encoding:'utf8'}).trim();
  const manifest = { createdAt:new Date().toISOString(),root,url:client.base,revision:before.revision,
    branch:git(['branch','--show-current']),head:git(['rev-parse','HEAD']),physical,
    d1:config.d1_databases,r2:config.r2_buckets,
    files:files(destination).map(rel=>({path:rel.replaceAll('\\','/'),sha256:hash(fs.readFileSync(path.join(destination,rel))),bytes:fs.statSync(path.join(destination,rel)).size})) };
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2));
  return {state:before,manifest,destination};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=process.argv.slice(2), option=name=>args[args.indexOf(name)+1];
  const client=await connect(args.includes('--url')?option('--url'):'http://127.0.0.1:3000');
  const destination=path.resolve(args.includes('--output')?option('--output'):
    `.wrangler/local-only/ipqc-ab-reimport/${new Date().toISOString().replace(/[:.]/g,'-')}/backup`);
  const result=await capture(client,destination,args.includes('--snapshot'));
  console.log(JSON.stringify({destination,revision:result.manifest.revision,physical:result.manifest.physical,
    files:result.manifest.files.length,scopes:Object.keys(result.state.control.scopes).length,
    source:result.state.control.source,master:{groups:result.state.catalog.groups.length,products:result.state.catalog.products.length}},null,2));
}
