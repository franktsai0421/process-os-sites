// Test-only inventory: main 9fbba823's 50 scripts plus two quality modules.
// Adapted from #104 commit 15a5acb404edb1d4f1826b13430f61376e3accb4;
// original oracle/test blobs: 55bb1d977be8f91eee09fac4e2d5b137e1cddc9a,
// 3b0d7b51fce310f459d9f29f0bd507c765198048 (verified before adapting).
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
 'routine-page-approved-history.js','routine-fqc-page.js',
]);
const groups=baseline.map(row=>[...row]);
assert.equal(groups[1].filter(name=>name==='routine-fqc.js').length,1);
groups[1].splice(groups[1].indexOf('routine-fqc.js'),0,...reviewedProcessBundleAdditions);
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
