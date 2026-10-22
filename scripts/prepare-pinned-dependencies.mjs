// Install only the existing lock into this independent copy. No lifecycle/Git writes.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
if(!fs.existsSync(npm)||fs.existsSync(path.join(root,'node_modules')))throw Error('PINNED_INSTALL_FRESH_LOCAL_TARGET_REQUIRED');
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
if(lock.lockfileVersion!==3)throw Error('PINNED_LOCK_VERSION');
for(const [name,item]of Object.entries(lock.packages))if(name){if(item.link||!item.resolved||new URL(item.resolved).origin!=='https://registry.npmjs.org'||!/^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/.test(item.integrity||''))throw Error('PINNED_DOWNLOAD_SOURCE_REFUSED');}
const control=path.join(root,'.sites-runtime');if(!fs.existsSync(control))fs.mkdirSync(control);
const dir=path.join(control,'pinned-install-20261022');fs.mkdirSync(dir); // Exclusive: never resume by deleting a partial tree.
// Never read the checkout's .npmrc or user credentials. Install two public
// package metadata files in a clean owned project, then adopt only its modules.
const project=path.join(dir,'clean-project');fs.mkdirSync(project);
for(const name of ['package.json','package-lock.json'])fs.copyFileSync(path.join(root,name),path.join(project,name),fs.constants.COPYFILE_EXCL);
const user=path.join(dir,'empty-user.npmrc'),global=path.join(dir,'empty-global.npmrc');for(const file of [user,global])fs.writeFileSync(file,'',{flag:'wx'});
const before={package:hash(path.join(root,'package.json')),lock:hash(path.join(root,'package-lock.json'))};
const args=[npm,'ci','--ignore-scripts','--no-audit','--no-fund','--update-notifier=false','--registry=https://registry.npmjs.org','--cache='+path.join(dir,'cache'),'--userconfig='+user,'--globalconfig='+global,'--logs-dir='+path.join(dir,'logs')];
const env={};for(const key of ['SystemRoot','WINDIR','ComSpec','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','OS'])if(process.env[key])env[key]=process.env[key];
const temp=path.join(dir,'tmp');fs.mkdirSync(temp);env.TEMP=temp;env.TMP=temp;
const receipt={format:'PINNED_ISOLATED_DEPENDENCY_INSTALL_V1',at:new Date().toISOString(),root,writeRoot:root,controlDirectory:dir,executable:process.execPath,args,downloadOrigin:'https://registry.npmjs.org',lifecycleScriptsExecuted:false,GitWritesAllowed:false,oldG3CandidateUsed:false,dependencyUpgrade:false,before,outputBytes:0,retainedLogBytes:0};
const output=fs.createWriteStream(path.join(dir,'public-package-install.log'),{flags:'wx'});let child;
try{child=spawn(process.execPath,args,{cwd:project,env,windowsHide:true,stdio:['ignore','pipe','pipe']});for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{receipt.outputBytes+=bytes.length;const room=8*1024*1024-receipt.retainedLogBytes;if(room>0){const saved=bytes.subarray(0,room);output.write(saved);receipt.retainedLogBytes+=saved.length;}});child.on('error',e=>{receipt.spawnCode=/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'OTHER_SPAWN_ERROR';});const closed=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));receipt.exitCode=closed.code;receipt.signal=closed.signal;}
finally{await new Promise(resolve=>output.end(resolve));receipt.after={package:hash(path.join(root,'package.json')),lock:hash(path.join(root,'package-lock.json'))};receipt.manifestsUnchanged=JSON.stringify(receipt.before)===JSON.stringify(receipt.after)&&hash(path.join(project,'package-lock.json'))===receipt.before.lock;receipt.status=receipt.exitCode===0&&receipt.manifestsUnchanged?'PASS_PINNED_INSTALL_WITHOUT_LIFECYCLES':'INSTALL_FAILED_RETAIN_PARTIAL_TARGET';if(receipt.status.startsWith('PASS_')){const src=path.resolve(project,'node_modules'),dest=path.resolve(root,'node_modules'),realRoot=fs.realpathSync(root);if(src.startsWith(realRoot+path.sep)&&dest===path.join(realRoot,'node_modules')&&!fs.existsSync(dest)&&!fs.lstatSync(src).isSymbolicLink()){fs.renameSync(src,dest);receipt.modulesAdopted=true;}else{receipt.status='INSTALL_COMPLETE_ADOPTION_REFUSED';receipt.modulesAdopted=false;}}fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify(receipt));process.exitCode=receipt.status.startsWith('PASS_')?0:1;
