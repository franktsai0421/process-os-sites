// Synthetic test selection only; no live credentials, data or network probes.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const files=fs.readdirSync('tests').filter(name=>name.endsWith('.test.mjs')&&
 ((/^(fqc-|iqc-)/.test(name)&&!/(browser|compiled|performance)/.test(name))||
 /^(routine-(page|fqc)-approved-history|tooling-fqc-approved-history|quality-(master-explicit-refresh|stable-photo-merge|comparison-callback-owner|final-session-fence))\.test\.mjs$/.test(name))).map(name=>'tests/'+name);
const run=args=>{const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);};
run(['--test','tests/routine-page-cutover-preparation.test.cjs']);
run(['--test','--test-concurrency=4','--test-timeout=30000',...files]);
for(const name of ['test-routine-whole-page.cjs','test-routine-whole-page-route.cjs','test-routine-whole-page-ui.cjs'])run(['scripts/'+name]);
