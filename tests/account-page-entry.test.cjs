const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base='public/process/',index=fs.readFileSync(base+'index.html','utf8'),tag='20261110-account-pages1';
void test('cold boot installs page history, merge, transport and review assets before their owners, exactly once',()=>{
 const scripts=[...index.matchAll(/<script[^>]+(?:data-process-src|src)="([^"]+)"/g)].map(match=>match[1]);
 const position=file=>{const matching=scripts.map((url,i)=>({url,i})).filter(row=>row.url.split('?')[0]===file);assert.equal(matching.length,1,file);assert.equal(matching[0].url,file+'?v='+(file==='shared-draft-client.js'?'20261110-account-process-joint1':tag),file);assert(fs.existsSync(path.join(base,file)),file);return matching[0].i;};
 for(const [before,after]of [['shared-draft-client.js','master-shared-client.js'],['shared-draft-client.js','version-draft-ui.js'],['version-draft-ui.js','canvas-approved-history.js'],['canvas-approved-history.js','master-page-approved-history.js'],['page-draft-merge.js','master-page-editor.js'],['master-page-transfer.js','master-page-editor.js'],['master-page-approved-history.js','master-page-editor.js'],['master-page-editor.js','master-data.js'],['master-shared-client.js','master-data.js'],['master-review.js','master-data.js'],['canvas-approved-history.js','routine-page-approved-history.js'],['routine-page-approved-history.js','routine-fqc-page.js'],['routine-fqc-page.js','routine-fqc.js'],['user-access.js','bootstrap.js']])assert(position(before)<position(after),before+' before '+after);
 assert.equal([...index.matchAll(/href="version-draft-ui\.css\?v=([^"]+)"/g)].map(match=>match[1]).join(),tag);
});
void test('browser preview and direct matrix use the same versioned policy dependencies; server inputs do not accept preview authority',()=>{
 const bootstrap=fs.readFileSync(base+'bootstrap.js','utf8'),preview=fs.readFileSync(base+'account-review-preview.mjs','utf8'),review=fs.readFileSync(base+'draft-review-policy.mjs','utf8');
 assert(index.includes('href="access-policy.mjs?v='+tag+'"'));
 for(const source of [bootstrap,preview,review])assert(source.includes('./access-policy.mjs?v='+tag));assert(bootstrap.includes('./account-review-preview.mjs?v='+tag));assert(preview.includes('./draft-review-policy.mjs?v='+tag));
 const route=fs.readFileSync('app/api/user-access/route.ts','utf8'),fields=route.match(/const allowedFields=\[([^\]]+)\]/)[1];assert(!fields.includes('reviewContext'));assert(!fields.includes('pageCapabilities'));assert(fields.includes('confirmFinalApproval'));
});
