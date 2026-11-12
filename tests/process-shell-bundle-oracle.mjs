// Test-only reviewed inventory: main 9fbba823's 50 scripts plus seven #103 modules and one reviewed move.
// Do not infer expected membership/order from the builder's output.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const processBundleBaselineCommit='9fbba823090f03da8385c8d92f5e59293d19d2f1';
const baseline=[
 ['user-access-initial-read.js','version-return-policy.js','data-safety.js','master-admin-ui.js','master-reference-viewer.js','local-draft-recovery.js','local-draft-recovery-session.js'],
 ['version-workflow.js','line-stage-excel.js','master-page-excel.js','master-review.js','approval-tabs.js','access-event-reporter.js','shared-draft-client.js','master-shared-client.js','web-feedback-entry.js','master-data.js','process-equipment.js','permission-controls.js','flow-zoom.js','editor-version-guard.js','withdraw-queue.js','i18n.js','bom-search-engine.js','bom-excel.js','bom-search.js','bom-workspace.js','data-safety-ui.js','system-upgrade.js','version-draft-ui.js','process-authoring-v3.js','effective-version-notice.js','fqc-excel.js','fqc-master.js','iqc-master.js','routine-equipment.js','tooling.js','quality-review-overview.js','process-ipqc.js','ipqc-c.js','ipqc-ab.js','routine-fqc.js','dual-system.js','editor-graph.js','canvas-recovery-store.js','canvas-local.js','process-editor.js','user-access.js','navigation-forms.js','delivery-navigation.js'],
];
assert.equal(baseline.flat().length,50,'reviewed main inventory stays fixed');
export const reviewedProcessBundleAdditions=Object.freeze([
 'canvas-approved-history.js','page-draft-merge.js','master-page-transfer.js','master-page-approved-history.js','master-page-editor.js','routine-page-approved-history.js','routine-fqc-page.js',
]);
export const baselineProcessBundleGroups=Object.freeze(baseline.map(row=>Object.freeze([...row])));
export const reviewedProcessBundleMoves=Object.freeze([Object.freeze({name:'version-draft-ui.js',fromBefore:'process-authoring-v3.js',toBefore:'master-data.js'})]);
const groups=baseline.map(row=>[...row]);
for(const anchor of ['master-data.js','process-authoring-v3.js','version-draft-ui.js','routine-fqc.js'])assert.equal(groups[1].filter(name=>name===anchor).length,1);
assert.equal(groups[1][groups[1].indexOf('version-draft-ui.js')+1],'process-authoring-v3.js','reviewed original dependency location');
groups[1].splice(groups[1].indexOf('version-draft-ui.js'),1);
groups[1].splice(groups[1].indexOf('master-data.js'),0,'version-draft-ui.js',...reviewedProcessBundleAdditions.slice(0,5));
groups[1].splice(groups[1].indexOf('routine-fqc.js'),0,...reviewedProcessBundleAdditions.slice(5));
export const expectedProcessBundleGroups=Object.freeze(groups.map(row=>Object.freeze(row)));
export function assertProcessScriptBundles(assets,readSource){
 assert.deepEqual(assets.map(asset=>asset.sources),expectedProcessBundleGroups,'exact reviewed bundle groups and source order');
 assert.equal(new Set(assets.flatMap(asset=>asset.sources)).size,baseline.flat().length+reviewedProcessBundleAdditions.length,'each reviewed source loads once');
 for(let index=0;index<expectedProcessBundleGroups.length;index++){
  const body=expectedProcessBundleGroups[index].map(name=>`;\n/* ${name} */\n${readSource(name)}\n`).join('\n');
  const id=createHash('sha256').update(body).digest('hex').slice(0,20),asset=assets[index];
  assert.equal(asset.id,id,'source bytes determine completion receipt identity');
  assert.equal(asset.name,`shell-scripts.${id}.js`,'source bytes determine served cache URL');
  const source=body+`\n;(window.ProcessRuntimeBundles ||= Object.create(null))["${id}"] = true;\n`;
  assert(Buffer.from(asset.source).equals(Buffer.from(source)),'exact ordered source bytes and final completion receipt');
 }
}
export async function assertServedProcessScriptBundles(assets,readSource,request){
 assertProcessScriptBundles(assets,readSource);
 for(const asset of assets){
  const response=await request('/process/'+asset.name);
  assert.equal(response.status,200,'served bundle status');
  assert.match(response.headers.get('Content-Type'),/^(?:text|application)\/javascript/,'served bundle type');
  assert(Buffer.from(await response.arrayBuffer()).equals(Buffer.from(asset.source)),'served bytes match the independently checked bundle');
 }
}
