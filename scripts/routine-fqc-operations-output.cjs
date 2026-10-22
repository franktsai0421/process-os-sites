// Export only whitelisted test output. Never expose credentials or business snapshots.
const fs=require('node:fs'),path=require('node:path');
const base='.wrangler/local-only/routine-fqc-3040',out='docs/routine-fqc/evidence/operations-command-outputs.json';
const log=name=>fs.readFileSync(path.join(base,name),'utf8');
const commands=[
 ['node scripts/test-routine-fqc-operations.cjs','operations-kernel.log',0],
 ['node scripts/test-routine-fqc.cjs','operations-original-fqc.log',0],
 ['node scripts/test-shared-draft-v3.cjs','operations-shared-draft.log',0],
 ['node scripts/routine-fqc-operations-review1.cjs','operations-review1.log',0],
 ['node scripts/routine-fqc-operations-ui.cjs','operations-ui-resume.log',1,'Continuation failed because the image node was tested before load completed.'],
 ['node scripts/routine-fqc-operations-ui.cjs','operations-ui-final.log',0,'Resumed completed fixture stages without repeating approvals. Added an explicit DOM wait for successful photo decoding; final history, platform and preservation checks passed.'],
 ['node node_modules/typescript/bin/tsc --noEmit','operations-typecheck.log',0],
 ['node --check (five affected JS files, exact commands in output)','operations-syntax.log',0]
].map(([command,file,exitCode,note])=>({command,outputFile:file,exitCode,stdoutAndStderr:log(file),...(note?{note}:{})}));
const structuredResults=['operations-races-evidence.json','operations-network-evidence.json','operations-platform-evidence.json','operations-read-race-evidence.json','operations-ownership-evidence.json'].map(file=>({file,result:JSON.parse(log(file)),format:'Persisted structured test result; not reconstructed stdout.'}));
const value={task:'routine-fqc-operations-3040',iteration:1,commands,structuredResults,notes:['No production or daily3000 mutation. All real API fixtures are isolated3040 operations items.','Earlier UI harness failures (focus target, reload route, assertion naming) and fixes are retained in the acceptance report. The original mixed-flow actions are in operations-ui-evidence; the final command is an idempotent continuation, not a fresh replay.','No passwords, source database snapshots, or private audit records included.']};
fs.writeFileSync(out,JSON.stringify(value,null,2));console.log('PASS exported actual core/API/UI/typecheck command outputs, failed continuation and successful resume.');
