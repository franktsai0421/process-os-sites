import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourcePathDisposition} from '../lib/sites-source-boundary.mjs';

export function checkSitesSource(root=path.resolve(fileURLToPath(new URL('..',import.meta.url)))) {
  for(const relative of ['data/canonical','db/seed.json','public/process/data','public/process/iqc-media','public/process/routine-media']) {
    const target=path.join(root,relative);
    if(fs.existsSync(target)&&(!fs.statSync(target).isDirectory()||fs.readdirSync(target).length))throw Error(`BUSINESS_DATA_IN_SOURCE:${relative}`);
  }
  for(const name of fs.readdirSync(root))if(/^\.env|^\.dev\.vars|\.(sqlite|zip|pem|key)$/.test(name))throw Error('PRIVATE_FILE_IN_SOURCE');
  function inspect(directory,relative=''){
    for(const name of fs.readdirSync(directory)){
      const child=relative?relative+'/'+name:name,target=path.join(directory,name),stat=fs.lstatSync(target),disposition=sourcePathDisposition(child);
      if(stat.isSymbolicLink())throw Error('SOURCE_SYMLINK_REFUSED');
      // Runtime/dependency output is never a source handoff member; don't open it.
      if(disposition==='generated-or-private-directory')continue;
      // A workstation's package configuration is never a handoff member. The
      // pinned installer uses clean metadata plus explicit empty config instead.
      if(disposition==='package-manager-private-configuration')continue;
      if(disposition!=='source'){
        if(stat.isDirectory()&&fs.readdirSync(target).length===0)continue;
        throw Error('PRIVATE_NESTED_PATH_IN_SOURCE');
      }
      if(stat.isDirectory())inspect(target,child);
    }
  }
  inspect(root);
  const hosting=JSON.parse(fs.readFileSync(path.join(root,'.openai/hosting.json'),'utf8'));
  if(hosting.d1!=='DB'||hosting.r2!=='STATE_ARCHIVE')throw Error('UNEXPECTED_BINDINGS');
  return {status:'PASS_SOURCE_BOUNDARIES',businessDataIncluded:false,registered:typeof hosting.project_id==='string'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(checkSitesSource()));
