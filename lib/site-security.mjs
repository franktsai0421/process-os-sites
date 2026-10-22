// Pure policy shared by the Worker adapters and dependency-free fixture tests.
import {accessKeys} from '../public/process/access-policy.mjs';

export const privateHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'Cookie',
};
export const statePermissions = Object.freeze({
  processMasterData: ['ab.view','c.view','lines.view','templates.view','editor.view','player.view','dispatch.view','status.view','dashboard.view'],
  masterDataControl: ['ab.view','c.view','lines.view','templates.view','editor.view','player.view','dispatch.view','status.view','approval.view'],
  bomOverrides: ['bom.view','editor.view','player.view','status.view','dispatch.view'],
  bomMasterControl: ['bom.view','editor.view','approval.view'],
  publishedProcess: ['player.view','dispatch.view','status.view','editor.view','approval.view'],
  dispatchBoard: ['dispatch.view','player.view','status.view','dashboard.view'],
  backupSettings: ['users.view'],
  canonicalQuality: ['fqc.view','iqc.view','ipqc-ab.view','ipqc-c.view','quality-dashboard.view','quality-search.view'],
  approvalVersions: ['editor.view','approval.view'],
  processAuthoringControl: ['editor.view','approval.view','player.view','dispatch.view','status.view'],
  qualityMasterControl: ['fqc.view','quality-dashboard.view','quality-search.view'],
  iqcMasterControl: ['iqc.view','tooling.view','quality-dashboard.view','quality-search.view'],
  ipqcABMasterControl: ['ipqc-ab.view','editor.view','quality-dashboard.view','quality-search.view'],
  ipqcCMasterControl: ['ipqc-c.view','editor.view','quality-dashboard.view','quality-search.view'],
  routineEquipmentControl: ['equipment.view','quality-dashboard.view','quality-search.view'],
  toolingMasterControl: ['tooling.view','quality-dashboard.view','quality-search.view'],
  routineFqcEnabled: ['routine.view'],
});
export async function permitsAny(permissions, canRead) {
  for (const permission of permissions) if (await canRead(permission)) return true;
  return false;
}
export async function projectCompanyState(state, actor, canRead) {
  if (!actor) throw Error('LOGIN_REQUIRED');
  /** @type {Record<string,string>} */
  const values = {};
  for (const [key, value] of Object.entries(state.values)) {
    if (key === 'platformUsers' || key === 'maintenanceMode') { values[key] = value; continue; }
    const required = statePermissions[key] || (key.startsWith('processEditor:') ? ['editor.view'] : []);
    if (required.length && await permitsAny(required, canRead)) values[key] = value;
  }
  // A shared master envelope contains several scopes. Do not disclose unrelated
  // approved scopes merely because a visitor may see one master-data module.
  if (values.masterDataControl) {
    const master = JSON.parse(values.masterDataControl);
    const allowed = new Set();
    for (const [scope, permissions] of Object.entries({AB:['ab.view','approval.view'],C:['c.view','approval.view'],PROCESS:['templates.view','editor.view','player.view','dispatch.view','status.view','approval.view']})) {
      if (await permitsAny(permissions, canRead)) allowed.add(scope);
    }
    if (master.active) master.active = Object.fromEntries(Object.entries(master.active).filter(([scope]) => allowed.has(scope)));
    if (Array.isArray(master.versions)) master.versions = master.versions.filter(version => allowed.has(version.scope));
    values.masterDataControl = JSON.stringify(master);
  }
  if (values.canonicalQuality) {
    const quality=JSON.parse(values.canonicalQuality);
    for(const [key,permissions] of Object.entries({fqc:['fqc.view'],iqc:['iqc.view'],ipqc:['ipqc-ab.view','ipqc-c.view']})) {
      if(!await permitsAny([...permissions,'quality-dashboard.view','quality-search.view'],canRead)) delete quality[key];
    }
    values.canonicalQuality=JSON.stringify(quality);
  }
  return {revision: state.revision, values};
}

export async function visibleMediaReference(values, id) {
  if (!/^[a-f0-9]{64}$/.test(id)) return false;
  for (const raw of Object.values(values)) {
    const pending = [JSON.parse(raw)];
    while (pending.length) {
      const value = pending.pop();
      if (typeof value === 'string') {
        if (value === `/api/state-media?id=${id}`) return true;
        if (/^data:(image|video)\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(value)) {
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2,'0')).join('');
          if (hash === id) return true;
        }
      } else if (Array.isArray(value)) pending.push(...value);
      else if (value && typeof value === 'object') pending.push(...Object.values(value));
    }
  }
  return false;
}

export async function boundedJson(request, maximumBytes = 8192) {
  if (Number(request.headers.get('content-length') || 0) > maximumBytes) throw Error('BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw Error('INVALID_JSON');
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) { await reader.cancel(); throw Error('BODY_TOO_LARGE'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(body)); }
  catch { throw Error('INVALID_JSON'); }
}

export function validateAssetIndex(index) {
  if (index?.format !== 'PROCESS_OS_COMPANY_ASSETS_V1' || !Array.isArray(index.assets) || index.assets.length > 2000) throw Error('INVALID_ASSET_INDEX');
  const paths = new Set();
  for (const asset of index.assets) {
    if (!/^\/process\/(data|iqc-media|routine-media)\/[a-zA-Z0-9][a-zA-Z0-9_./-]{0,240}$/.test(asset.path) || asset.path.includes('..') || paths.has(asset.path)) throw Error('INVALID_ASSET_PATH');
    if (!/^[a-f0-9]{64}$/.test(asset.sha256) || asset.key !== `company-assets/objects/${asset.sha256}` || !Number.isSafeInteger(asset.bytes) || asset.bytes < 0) throw Error('INVALID_ASSET_OBJECT');
    if (!Array.isArray(asset.permissions) || !asset.permissions.length || asset.permissions.some(permission => !accessKeys.includes(permission) || !permission.endsWith('.view'))) throw Error('INVALID_ASSET_PERMISSION');
    if (!['application/javascript','application/json','image/jpeg','image/png','image/webp','image/gif'].includes(asset.contentType)) throw Error('INVALID_ASSET_TYPE');
    paths.add(asset.path);
  }
  return index;
}
export async function privateAssetDecision(index,path,actor,canRead){
  validateAssetIndex(index);
  if(!actor)return {status:401,asset:null};
  const asset=index.assets.find(item=>item.path===path);
  if(!asset)return {status:404,asset:null};
  if(typeof canRead!=='function'||!await permitsAny(asset.permissions,canRead))return {status:403,asset:null};
  return {status:200,asset};
}
