import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDemoUser} from '../lib/demo-identities.mjs';
import {loadTypeScript} from './local-init.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const allowed=new Set([
  'https://process-control-20260829.franktsai0421.chatgpt.site',
  'https://central-control-staging.franktsai0421.workers.dev',
]);
const base=String(process.env.PROCESS_SITES_URL||[...allowed][0]).replace(/\/$/,'');
assert.ok(allowed.has(base),'Use the fixed Sites or Staging release URL');
const {effectiveAccess}=loadTypeScript(root,'lib/user-access.ts');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
async function json(url,options={}){
  const response=await fetch(base+url,{...options,signal:AbortSignal.timeout(60000)});
  let body;try{body=await response.json();}catch{body={};}
  return {response,body};
}
async function login(role){
  const result=await json('/api/platform-login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({demoRole:role})});
  assert.equal(result.response.status,200,`${role} demo login failed`);
  const cookie=(result.response.headers.get('set-cookie')||'').split(';')[0];
  assert.match(cookie,/^process_demo=.+/,`${role} cookie missing`);
  assert.equal(result.body.user?.id,'demo-'+role);
  assert.equal(result.body.user?.role,role);
  assert.equal(result.body.user?.authMode,'demo');
  assert.equal(result.body.user?.sessionType,'demo');
  return {...result,cookie};
}
const assetHashes={};
for(const file of ['shared-state.js','system-upgrade.js','data-safety-ui.js']){
  const response=await fetch(`${base}/process/${file}`,{signal:AbortSignal.timeout(60000)});
  assert.equal(response.status,200,`${file} unavailable`);
  const live=Buffer.from(await response.arrayBuffer()),local=fs.readFileSync(path.join(root,'public/process',file));
  assert.equal(digest(live),digest(local),`${file} differs from reviewed source`);
  assetHashes[file]=digest(live).slice(0,12);
}
let revision;
for(const role of ['admin','rd','staff']){
  const first=await login(role);
  const shared=await json('/api/shared-state',{headers:{Cookie:first.cookie,'X-Process-Media':'deferred-v1'}});
  assert.equal(shared.response.status,200,`${role} state read failed`);
  revision??=shared.body.revision;
  assert.equal(shared.body.revision,revision,'Revision changed during login acceptance');
  assert.equal(shared.body.identity?.id,'demo-'+role);
  assert.equal(shared.body.identity?.role,role);
  const users=JSON.parse(shared.body.values.platformUsers||'[]'),user=users.find(value=>value.id==='demo-'+role);
  assert.ok(isDemoUser(user),`${role} stored identity is invalid`);
  const expected=effectiveAccess(user,shared.body.values);
  for(const key of ['lines','views','permissions'])assert.equal(JSON.stringify(first.body.user[key]),JSON.stringify(expected[key]),`${role} ${key} mismatch`);
  const refreshed=await json('/api/shared-state',{headers:{Cookie:first.cookie,'X-Process-Media':'deferred-v1'}});
  assert.equal(refreshed.body.identity?.id,'demo-'+role,`${role} refresh lost session`);
  const logout=await json('/api/platform-login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:first.cookie},body:JSON.stringify({action:'logout'})});
  assert.equal(logout.response.status,200,`${role} logout failed`);
  assert.match(logout.response.headers.get('set-cookie')||'',/Max-Age=0/i,`${role} logout cookie not cleared`);
  const second=await login(role);
  assert.notEqual(second.cookie,first.cookie,`${role} re-login did not issue a fresh session`);
}
console.log(JSON.stringify({url:base,revision,roles:['admin','rd','staff'],refresh:true,logoutRelogin:true,assetHashes}));
