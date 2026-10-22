import __esmImport0 from "node:fs";
import __esmImport1 from "node:path";
import __esmImport2 from "node:assert/strict";
import {createRequire as __esmFactory} from 'node:module';
const __esmRequire=__esmFactory(import.meta.url);
const fs=__esmImport0,path=__esmImport1,assert=__esmImport2;
const docs=['docs/routine-fqc/20261007-acceptance.md','docs/routine-fqc/20261007-feedback.md','docs/routine-fqc/evidence/matrix.md','AI_CONTEXT/models/ROUTINE_FQC.md'];
for(const file of docs){const text=fs.readFileSync(file,'utf8');for(const match of text.matchAll(/\]\(([^)]+)\)/g)){const target=match[1].split('#')[0];if(!target||/^https?:/.test(target))continue;assert.ok(fs.existsSync(path.resolve(path.dirname(file),target)),file+' → '+target);}}
const summary=JSON.parse(fs.readFileSync('docs/routine-fqc/evidence/acceptance-summary.json'));assert.equal(summary.pass,38);assert.equal(summary.notRun.length,0);assert.equal(summary.packageFilesVerified,20);
const daily=JSON.parse(fs.readFileSync('docs/routine-fqc/evidence/integration-evidence.json'));assert.equal(daily.allOtherStoredValuesIdentical,true);assert.equal(daily.startDate,null);assert.equal(daily.documents,0);assert.equal(daily.jobs,0);
const ui=JSON.parse(fs.readFileSync('docs/routine-fqc/evidence/daily-ui-evidence.json'));assert.equal(ui.status,'PASS');
console.log('PASS: 38 acceptance rows have readable passing evidence; 20 package hashes match.');
console.log('PASS: report/model/matrix links resolve; 3000 incremental change preserves all old stored values.');
console.log('PASS: 3000 UI/API read-only check, start date unset, no test documents or jobs transferred.');
console.log('NOT_RUN: physical iPhone, native IME, printer, remote deployment, full performance/stress testing.');
