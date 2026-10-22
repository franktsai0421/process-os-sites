import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const normal=value=>String(value||'').replaceAll('\\','/').replace(/\/$/,'').toLowerCase();
const unknown=()=>({state:'UNKNOWN'});
const entries=root=>['local-dev','local-server'].map(name=>normal(root)+'/scripts/'+name+'.mjs');

function nodeEntry(command){
  if(typeof command!=='string'||!command.trim())return null;
  const tokens=[...command.matchAll(/"([^"]*)"|([^\s"]+)/g)].map(m=>m[1]??m[2]);
  if(!/node(?:\.exe)?$/i.test(tokens[0]||''))return null;
  let index=1;
  while(tokens[index]==='--import'){if(!tokens[index+1])return null;index+=2;}
  return tokens[index]??null;
}

function nodeScope(root,command){
  const token=nodeEntry(command);if(token===null)return 'UNKNOWN';
  const entry=normal(token);
  if(entries(root).includes(entry))return 'WORKSPACE';
  if(/^[a-z]:\/.*\/scripts\/local-(?:dev|server)\.mjs$/.test(entry))return 'OTHER_WORKSPACE';
  if(/local-(?:dev|server)\.mjs/i.test(command)||/npm-cli\.js.*\brun(?:-script)?\s+dev\b/i.test(command))return 'UNKNOWN';
  return 'OTHER';
}

// Pure evidence classification is shared with the fixture checks. Callers cannot
// inject evidence into the production assertDevStopped entry point.
export function classifyLocalStopEvidence(root,marker,processes){
  if(!Array.isArray(processes))return unknown();
  const byId=new Map();
  for(const item of processes){if(!Number.isSafeInteger(item.pid)||item.pid<=0||byId.has(item.pid))return unknown();byId.set(item.pid,item);}
  const scopes=new Map();
  for(const item of processes.filter(p=>normal(p.name)==='node.exe')){
    let scope=nodeScope(root,item.command);
    if(item.privateRuntimeVerified&&item.verifiedRuntimeRoot)scope=normal(item.verifiedRuntimeRoot)===normal(root)?'WORKSPACE':'OTHER_WORKSPACE';
    else if(scope==='OTHER_WORKSPACE')scope='UNKNOWN';
    scopes.set(item.pid,scope);
    if(scope==='WORKSPACE')return {state:'RUNNING'};
    if(scope==='UNKNOWN')return unknown();
  }
  for(const worker of processes.filter(p=>normal(p.name)==='workerd.exe')){
    // Workerd command lines usually contain the repository's executable path,
    // not its storage root. Only a positively identified foreign Local parent
    // is safe to exclude; orphan/unknown workers still refuse the operation.
    if(scopes.get(worker.parentPid)!=='OTHER_WORKSPACE')return unknown();
  }
  if(!marker)return {state:'STOPPED'};
  if(!Number.isSafeInteger(marker.pid)||marker.pid<=0)return unknown();
  const current=byId.get(marker.pid);if(!current)return {state:'STOPPED'};
  const started=Date.parse(marker.startedAt),created=Date.parse(current.createdAt);
  const entry=normal(marker.entry),validEntry=['scripts/local-server.mjs','scripts/local-dev.mjs',...entries(root)].includes(entry);
  if(normal(marker.root)!==normal(root)||!validEntry||!Number.isFinite(started)||!Number.isFinite(created))return unknown();
  // A process created after this marker cannot be the process it recorded.
  // The complete Local-node/worker scan above still blocks a newer server.
  if(created>started+1000)return {state:'STOPPED',pidReused:true};
  return unknown();
}

export function verifyPrivateLocalRuntime(item,declaredRoot){
  const token=nodeEntry(item.command);if(!/(?:^|[/\\])scripts[/\\]local-server\.mjs$/i.test(token||''))return false;
  try{
    const absolute=/^[a-z]:[\\/]/i.test(token);
    if(!absolute&&!declaredRoot)return false;
    const root=fs.realpathSync(declaredRoot||path.dirname(path.dirname(token)));
    const entry=absolute?token:path.resolve(root,token);
    if(normal(entry)!==normal(path.join(root,'scripts/local-server.mjs')))return false;
    const runtime=JSON.parse(fs.readFileSync(path.join(root,'.wrangler/local-only/test-runtime.json'),'utf8'));
    const inside=file=>{const relative=path.relative(root,fs.realpathSync(file));return relative&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
    const config=path.join(root,'.wrangler/local-only/wrangler.json'),state=path.join(root,'.wrangler/state');
    const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const settings=JSON.parse(fs.readFileSync(config,'utf8'));
    return runtime.pid===item.pid&&normal(runtime.root)===normal(root)&&normal(runtime.config)===normal(fs.realpathSync(config))&&normal(runtime.state)===normal(fs.realpathSync(state))&&inside(config)&&inside(state)&&hash(config)===runtime.configSha256&&hash(entry)===runtime.serverSha256&&Date.parse(item.createdAt)<=Date.parse(runtime.startedAt)+1000&&settings.d1_databases?.length===1&&settings.d1_databases[0].binding==='DB'&&settings.d1_databases[0].remote===false&&settings.r2_buckets?.length===1&&settings.r2_buckets[0].binding==='STATE_ARCHIVE'&&settings.r2_buckets[0].remote===false;
  }catch{return false;}
}

export function declaredLocalRuntimeRoots(workspaceRoot){
  const root=fs.realpathSync(workspaceRoot),base=path.join(root,'.wrangler/local-only'),roots=new Set([root]);
  if(!fs.existsSync(base))return [...roots];
  const folders=[base,...fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.isSymbolicLink()).map(e=>path.join(base,e.name))];
  for(const folder of folders)for(const name of ['isolation.json','isolation-receipt.json']){
    const file=path.join(folder,name);if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())continue;
    try{const data=JSON.parse(fs.readFileSync(file,'utf8'));for(const value of [data.runtimeRoot,data.root]){
      if(typeof value!=='string'||!path.isAbsolute(value))continue;
      const candidate=fs.realpathSync(value),relative=path.relative(base,candidate);
      if(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative))roots.add(candidate);
    }}catch{ /* Unproved declarations never authorize a process. */ }
  }
  return [...roots];
}

export function probeLocalWindowsProcesses(markerPid,workspaceRoot){
  const extra=Number.isSafeInteger(markerPid)&&markerPid>0?' OR ProcessId = '+markerPid:'';
  const script="$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $items=@(Get-CimInstance Win32_Process -Filter \"Name = 'node.exe' OR Name = 'workerd.exe'"+extra+"\" | ForEach-Object { [pscustomobject]@{pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId; name=$_.Name; command=$_.CommandLine; createdAt=if($_.CreationDate){$_.CreationDate.ToUniversalTime().ToString('o')}else{$null}} }); ConvertTo-Json -InputObject $items -Compress";
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:4*1024*1024});
  if(result.error||result.status!==0)throw Error('PROCESS_METADATA_UNAVAILABLE');
  try{
    const items=JSON.parse(result.stdout);if(!Array.isArray(items))throw Error();
    // Recovery targets can be clean Temp directories while this module runs
    // from the opened checkout. Its existing isolation declarations describe
    // the same-PC fixtures; every declaration still needs full runtime proof.
    const ownerRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const declared=[...new Set([...declaredLocalRuntimeRoots(ownerRoot),...(workspaceRoot?declaredLocalRuntimeRoots(workspaceRoot):[])])];
    for(const item of items.filter(p=>normal(p.name)==='node.exe')){
      const token=nodeEntry(item.command),candidates=new Set(declared);
      if(/^[a-z]:[\\/].*[\\/]scripts[\\/]local-server\.mjs$/i.test(token||''))candidates.add(fs.realpathSync(path.dirname(path.dirname(token))));
      const matches=[...candidates].filter(root=>verifyPrivateLocalRuntime(item,root));
      item.privateRuntimeVerified=matches.length===1;
      if(item.privateRuntimeVerified)item.verifiedRuntimeRoot=matches[0];
    }
    return items;
  }catch{throw Error('PROCESS_METADATA_UNAVAILABLE');}
}
