import {statePermissions, permitsAny} from './site-security.mjs';
export const identityKeys = Object.freeze(['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']);

// The envelope is still SHA-verified by readState. Selecting aggregates before
// decoding prevents an unrelated, forbidden module from consuming R2/memory.
export async function authorizedDeliveryKeys(canRead,availableKeys=[]) {
  const keys = [...identityKeys];
  const adoptedEditor=availableKeys.includes('processAuthoringControl');
  for (const [key, permissions] of Object.entries(statePermissions)) {
    // publicState removes legacy editor/archive references after adoption.
    // Preserve that cross-key boundary when reading one aggregate at a time.
    if(adoptedEditor&&key==='approvalVersions')continue;
    if (await permitsAny(permissions, canRead)) keys.push(key);
  }
  if(!adoptedEditor&&await canRead('editor.view'))for(const key of availableKeys)if(key.startsWith('processEditor:')&&!keys.includes(key))keys.push(key);
  return keys;
}

// Check only actual strings in the already-authorized delivery projection.
// The id-only asset form is a documented stored reference; delivery URLs bind
// both ids. A filename/substr in arbitrary prose is not a reference.
export function canonicalReference(values, id, version) {
  const exact = new Set(['asset:' + id, '/api/canonical-assets?id=' + id + '&version=' + version]);
  function visit(value) {
    if (typeof value === 'string') return exact.has(value);
    if (Array.isArray(value)) return value.some(visit);
    return !!value && typeof value === 'object' && Object.values(value).some(visit);
  }
  return Object.values(values).some(raw => visit(JSON.parse(raw)));
}
