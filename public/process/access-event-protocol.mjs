// Shared allowlist. No input bodies, URLs, filenames, errors or receipt bodies.
export const accessEventSources=Object.freeze({
  fqc:'/api/fqc/workflow',iqc:'/api/iqc/workflow','ipqc-c':'/api/ipqc-c/workflow',
  'ipqc-ab':'/api/ipqc-ab/workflow?module=1',bom:'/api/bom/workflow',
  tooling:'/api/tooling/workflow',equipment:'/api/routine-equipment/workflow',
  ab:'/api/master/workflow?scope=AB',c:'/api/master/workflow?scope=C',
  templates:'/api/master/workflow?scope=PROCESS',editor:'/api/process-authoring/workflow'
});
export const accessEventActions=Object.freeze(['begin-v1','apply','save','submit','withdraw','approve','return','restore']);
export function accessEventModule(endpoint) {
  if(typeof endpoint!=='string'||!endpoint.startsWith('/api/'))return null;
  const url=new URL(endpoint,'https://local.invalid');
  if(url.origin!=='https://local.invalid'||url.hash||[...url.searchParams].some(([key,value])=>!(['caseMetadata','compact'].includes(key)&&value==='1'||key==='scope'&&['AB','C','PROCESS'].includes(value)||key==='module'&&value==='1')))return null;
  for(const key of new Set(url.searchParams.keys()))if(url.searchParams.getAll(key).length!==1)return null;
  url.searchParams.delete('caseMetadata');url.searchParams.delete('compact');
  return Object.entries(accessEventSources).find(([,source])=>source===url.pathname+url.search)?.[0]||null;
}
export function minimalAccessObservation(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join()!=='action,module,occurredAt,operationId,phase')throw Error('INVALID_ACCESS_EVENT');
  if(!Object.hasOwn(accessEventSources,input.module)||!accessEventActions.includes(input.action)||!['unknown','receipt-observed'].includes(input.phase)||typeof input.operationId!=='string'||! /^[a-zA-Z0-9_-]{8,100}$/.test(input.operationId)||!Number.isSafeInteger(input.occurredAt)||input.occurredAt<0)throw Error('INVALID_ACCESS_EVENT');
  return {module:input.module,action:input.action,operationId:input.operationId,occurredAt:input.occurredAt,phase:input.phase};
}
