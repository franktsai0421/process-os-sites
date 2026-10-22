import fs from "node:fs";
import assert from "node:assert/strict";


const js = fs.readFileSync('public/process/system-upgrade.js', 'utf8');
const css = fs.readFileSync('public/process/system-upgrade.css', 'utf8');
const _html = fs.readFileSync('public/process/index.html', 'utf8');
const login = fs.readFileSync('public/process/data-safety-ui.js', 'utf8');
const backup = fs.readFileSync('lib/local-backup.mjs', 'utf8');

assert.match(js, /fetch\('\/api\/users'/);
assert.match(js, /action:\s*'create'/); assert.match(js, /action:\s*'update'/); assert.match(js, /action:\s*'reset-password'/); assert.match(js, /action:\s*'delete'/);
assert.match(js, /processShowDemoIdentities/); assert.ok(login.includes("'#login-password'")); assert.ok(js.includes('demoEnabled')); assert.ok(!js.includes('password.value = account.password'));
assert.match(js, /width:360,height:270,xGap:500,yGap:360/); assert.match(js, /normalizedVersionStages/); assert.ok(!js.includes('connectionMode'));
assert.match(js, /operation-template-summary/); assert.match(js, /operation-template-chip/); assert.match(js, /operation-card-media-group/);
assert.match(js, /pointerdown/); assert.match(js, /pointermove/); assert.match(js, /pointerup/); assert.match(js, /setPointerCapture/); assert.match(css, /touch-action:none/);
assert.match(js, /wouldCreateCycle/); assert.match(js, /dialog\.showModal/);
assert.match(css, /@media\(max-width:900px\)/); assert.match(css, /@media\(max-width:720px\)/); assert.match(css, /position:fixed/);
assert.ok(!login.includes('backup-create-path')); assert.match(backup, /validateBackupPath/); assert.match(backup, /chooseBackupDirectory/); assert.match(backup, /statfsSync/);
console.log('PASS: source regression guards only; behavioral tests are reported separately.');