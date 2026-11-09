/* The former timer-race entry now guards the user-requested absence of AB
 * periodic draft reads. Runtime mount/focus/Save coverage lives in the actual
 * synthetic UI/handler suite, wired into the same Local safety workflow. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'public/process/ipqc-ab.js'),'utf8');
assert.doesNotMatch(source,/createForegroundPoll|scheduleRefresh|pollTimer|setInterval\s*\(/,'AB must not create or restart a background draft timer');
assert.match(source,/async function saveLocalModule\(/,'explicit Save remains available');
assert.match(source,/let result=await client\.read\(\)/,'explicit Save must read authority');
const tests=fs.readFileSync(path.join(root,'tests/ipqc-ab-conflict-ui.test.mjs'),'utf8');
assert.match(tests,/AB mount, visibility and scope refresh create no foreground polling timer or implicit draft reads/);
assert.match(fs.readFileSync(path.join(root,'.github/workflows/local-safety.yml'),'utf8'),/node --test[^\n]*tests\/ipqc-ab-conflict-ui\.test\.mjs/);
console.log(JSON.stringify({status:'PASS_AB_NO_PERIODIC_DRAFT_READ_SOURCE',limits:'Source wiring only; runtime mount/focus/explicit Save is tested separately in the actual synthetic UI/handler suite.'}));
