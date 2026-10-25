// Exercise the actual YAML block with synthetic exit-only commands, not the suites.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const yaml=fs.readFileSync('.github/workflows/local-safety.yml','utf8');
const extract=value=>value.replace(/\r\n/g,'\n').split('      - name: Integrated entry and read-only delivery contracts\n')[1]?.split('      - name:')[0];
const block=extract(yaml);assert(block);
assert.equal(extract(yaml.replace(/\r?\n/g,'\r\n')),block,'native Windows checkout and LF source must produce the exact same executable block');
assert.equal(extract(yaml.replace(/\r\n/g,'\n')),block);
const lines=block.split('\n').filter(line=>line.startsWith('          ')).map(line=>line.slice(10));
const commands=lines.flatMap((line,index)=>line.startsWith('node ')?[index]:[]);assert(commands.length>=5);
for(const index of commands)assert.equal(lines[index+1],'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }','every native command must preserve its own exit');
const root=fs.mkdtempSync(path.resolve('.sites-runtime/ci-exit-'));let runs=0;
try{for(let failed=0;failed<commands.length;failed++){
 let n=0;const script=lines.map(line=>line.startsWith('node ')?`& '${process.execPath.replaceAll("'","''")}' -e "console.log('command-${n}');process.exit(${n++===failed?23:0})"`:line).join('\r\n');
 const file=path.join(root,'probe.ps1');fs.writeFileSync(file,script);
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:30000});assert.equal(result.error,undefined);assert.equal(result.status,23,result.stderr);assert.match(result.stdout,new RegExp('command-'+failed));assert(!result.stdout.includes('command-'+(failed+1)),'later successful command must not hide failure');runs++;
}}finally{assert(root.startsWith(path.resolve('.sites-runtime')+path.sep));fs.rmSync(root,{recursive:true,force:true});}
console.log(JSON.stringify({result:'PASS_CI_NATIVE_EXIT_PROPAGATION',injectedFailures:runs}));
