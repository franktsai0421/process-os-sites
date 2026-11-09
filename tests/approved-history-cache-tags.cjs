// Finite expected current cache map; historical pins remain checked separately.
const tags={};
for(const file of ['shared-draft-client.js','process-authoring-v3.js','effective-version-notice.js','process-ipqc.js','fqc-master.js'])tags[file]='20261109-approved-history-main100-8';
for(const file of ['app.js','master-data.js','process-equipment.js'])tags[file]='20261109-process-approved-history5';
for(const file of ['routine-equipment.js','tooling.js','master-admin-ui.js','master-shared-client.js'])tags[file]='20261109-master-approved-history4';
for(const file of ['routine-fqc.js','version-draft-ui.js'])tags[file]='20261109-routine-approved-history7';
tags['ipqc-ab.js']='20261109-ipqc-ab-approved-history6';tags['iqc-master.js']='20261109-approved-history-integrated3';
module.exports=(file,prior)=>tags[file]||(prior==='20261109-unified-save-choice1'?'20261109-unified-save-choice2':prior);
