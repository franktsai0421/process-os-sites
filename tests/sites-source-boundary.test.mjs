import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sourcePathDisposition} from '../lib/sites-source-boundary.mjs';
import {checkSitesSource} from '../scripts/sites-source-check.mjs';
const tests=[];
function test(name,run){run();tests.push({name,status:'PASS'});}
test('environment, session, key, data and snapshot paths are excluded at any depth',()=>{
 for(const name of ['.env','a/.env.local','a/.envSECRET','a/.dev.vars','a/.dev.vars.test','.npmrc','a/.yarnrc.yml','.netrc','keys/signing.key','keys/x.pfx','db/local.sqlite-wal','a/database.json','a/session.json','a/data.zip','data/canonical/data.json','public/process/iqc-media/a.png','.sites-runtime/storage/r2/object','a/.wrangler/state/db.sqlite','node_modules/module.js'])assert.notEqual(sourcePathDisposition(name),'source',name);
});
test('program, templates and schema metadata remain source',()=>{
 for(const name of ['.openai/hosting.json','config/sites-test.template.json','app/api/platform-login/route.ts','drizzle/0002_local_feedback_sessions.sql','drizzle/meta/0000_snapshot.json','public/process/assets/canonical-placeholder.svg','lib/passwords.ts','package-lock.json'])assert.equal(sourcePathDisposition(name),'source');
});
test('absolute, escaping and platform-confused paths refuse',()=>{
 for(const name of ['/tmp/x','../x','x/../y','x//y','x\\y','C:/x','a/./b',''])assert.throws(()=>sourcePathDisposition(name),/SOURCE_PATH/);
});
test('source scan refuses nested private files but never opens excluded runtime storage',()=>{
 const root=fs.mkdtempSync(path.join(path.resolve('..'),'source-boundary-fixture-'));
 fs.mkdirSync(path.join(root,'.openai'));fs.writeFileSync(path.join(root,'.openai/hosting.json'),JSON.stringify({d1:'DB',r2:'STATE_ARCHIVE'}));
 fs.mkdirSync(path.join(root,'.sites-runtime'));fs.writeFileSync(path.join(root,'.sites-runtime/session.json'),'synthetic-only');
 assert.equal(checkSitesSource(root).status,'PASS_SOURCE_BOUNDARIES');
 fs.mkdirSync(path.join(root,'nested'));fs.writeFileSync(path.join(root,'nested/.dev.vars'),'synthetic-only');
 assert.throws(()=>checkSitesSource(root),/PRIVATE_NESTED/);
});
const report={status:'PASS_SOURCE_BOUNDARY_SYNTHETIC',cases:tests.length,tests,realData:false,network:false};
if(process.env.SITES_BOUNDARY_REPORT)fs.writeFileSync(process.env.SITES_BOUNDARY_REPORT,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
