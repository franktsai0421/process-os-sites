// Navigation intent is not identity or authorization. Only local, enumerated
// destinations survive login; the destination's server APIs still authorize it.
const processViews = new Set(['dashboard', 'player', 'dispatch', 'productStatus', 'editor', 'approval', 'data']);
const qualityViews = new Set(['quality-dashboard', 'quality-search', 'quality-reports', 'quality-inspections', 'quality-fpy']);
const tabs = new Set(['AB', 'C', 'bom', 'line-admin', 'process-master', 'users','web-feedback', 'quality-fqc', 'quality-iqc', 'quality-ipqc-ab', 'quality-ipqc-c', 'quality-mold-equipment', 'quality-routine-reports', 'quality-routine-equipment']);
export function loginIntent(search) {
  const input = new URLSearchParams(search), result = new URLSearchParams();
  const one = key => input.getAll(key).length === 1 ? input.get(key) : null;
  const system = one('system') === 'quality' ? 'quality' : 'process';
  const candidate = one('view');
  const view = candidate === 'data' || (system === 'quality' ? qualityViews : processViews).has(candidate)
    ? candidate : null;
  result.set('system', system); if(view)result.set('view', view);
  if (view === 'data' && tabs.has(one('dataTab'))) result.set('dataTab', one('dataTab'));
  if (view === 'player') {
    const line = one('line'), stage = one('stage');
    if (['A', 'B', 'C'].includes(line)) {
      result.set('line', line);
      if (typeof stage === 'string' && new RegExp('^' + line + '-[A-Z0-9-]{1,40}$').test(stage)) result.set('stage', stage);
    }
  }
  return result;
}
export function loginDestination(search) {
  const input = new URLSearchParams(search), next = input.getAll('next');
  if (next.length === 1 && next[0] === '/setup/import') return '/setup/import';
  if (!['system', 'view', 'line', 'stage', 'dataTab'].some(key => input.has(key))) return '/process/index.html';
  return '/process/index.html?' + loginIntent(search);
}
