import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const refusal='main不得直接Push，請建立工作分支並提交Pull Request。';
try {
  const branch=spawnSync('git',['symbolic-ref','--quiet','--short','HEAD'],{encoding:'utf8',windowsHide:true});
  if(branch.error || ![0,1].includes(branch.status))throw Error('GIT_BRANCH_CHECK_FAILED');
  if(branch.stdout.trim()==='main')throw Error('MAIN_REFUSED');
  const input=fs.readFileSync(0,'utf8');
  for(const line of input.split(/\r?\n/).filter(line=>line.trim())){
    const fields=line.trim().split(/\s+/);
    if(fields.length!==4 || !fields[1].match(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i) || !fields[3].match(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i))throw Error('INVALID_PUSH_INPUT');
    if(fields[0]==='refs/heads/main' || fields[2]==='refs/heads/main')throw Error('MAIN_REFUSED');
  }
}catch{
  console.error(refusal);
  process.exitCode=1;
}
