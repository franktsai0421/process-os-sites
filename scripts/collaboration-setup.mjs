import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const git=args=>spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});
let stage='arguments';
try{
  if(process.argv.slice(2).some(arg=>arg!=='--install'))throw Error();
  stage='repository';const top=git(['rev-parse','--show-prefix']);
  if(top.status!==0){
    if(process.argv.includes('--install'))console.log('Git checkout unavailable; collaboration setup skipped. Run npm run collaboration:setup inside the repository.');
    else throw Error();
  }else{
    if(top.stdout.trim()!=='' || git(['rev-parse','--git-dir']).stdout.trim()!=='.git' || !fs.lstatSync(path.join(root,'.git')).isDirectory() || fs.lstatSync(path.join(root,'.git')).isSymbolicLink())throw Error();
    stage='templates';for(const relative of ['.git/config','.githooks','.githooks/pre-push','scripts/main-push-guard.mjs'])if(fs.lstatSync(path.join(root,relative)).isSymbolicLink())throw Error();
    const hooks=path.join(root,'.git/hooks');if(fs.existsSync(hooks) && (fs.lstatSync(hooks).isSymbolicLink() || !fs.lstatSync(hooks).isDirectory()))throw Error();
    stage='configuration';
    const configured=git(['config','--get','core.hooksPath']);
    if(![0,1].includes(configured.status) || (configured.status===0 && !['.githooks','.git/hooks'].includes(configured.stdout.trim())))throw Error();
    stage='installed-copies';const copies=[['.githooks/pre-push','.git/hooks/pre-push'],['scripts/main-push-guard.mjs','.git/hooks/process-main-push-guard.mjs']];
    for(const [source,destination] of copies){const target=path.join(root,destination);if(fs.existsSync(target) && (fs.lstatSync(target).isSymbolicLink() || !fs.readFileSync(target).equals(fs.readFileSync(path.join(root,source)))))throw Error();}
    stage='installation';fs.mkdirSync(hooks,{recursive:true});for(const [source,destination] of copies){const target=path.join(root,destination);if(!fs.existsSync(target))fs.writeFileSync(target,fs.readFileSync(path.join(root,source)),{flag:'wx',mode:0o755});}
    const saved=git(['config','--local','core.hooksPath','.git/hooks']);
    if(saved.status!==0 || git(['config','--local','--get','core.hooksPath']).stdout.trim()!=='.git/hooks')throw Error();
    console.log('Local main push guard enabled for this repository. Frank reviews and merges every PR after CI passes.');
  }
}catch{
  console.error(`COLLABORATION_SETUP_REFUSED stage=${stage}: verify this standalone Git checkout and existing hook configuration; no existing hooks were replaced.`);
  process.exitCode=1;
}
