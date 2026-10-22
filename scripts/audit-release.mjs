import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const pm=process.argv[2];if(!pm)throw Error('Supply the package-manager entrypoint');
const result=spawnSync(process.execPath,[pm,'audit','--json'],{encoding:'utf8',maxBuffer:10*1024*1024});
const report=JSON.parse(result.stdout);
fs.mkdirSync('work/release-7000',{recursive:true});fs.writeFileSync('work/release-7000/dependency-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({summary:report.metadata?.vulnerabilities,issues:Object.values(report.advisories||{}).map(a=>({module:a.module_name,patched:a.patched_versions,severity:a.severity,id:a.github_advisory_id}))},null,2));
