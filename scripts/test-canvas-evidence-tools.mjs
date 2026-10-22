/** Offline regression for canvas evidence tools. See docs/testing/CANVAS_EVIDENCE_TOOLS.md. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import childProcess from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import {fileURLToPath, pathToFileURL} from 'node:url';

const entry=fileURLToPath(import.meta.url);
const sourceRoot=path.resolve(path.dirname(entry),'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// This namespace is an in-memory fs fixture, never an actual filesystem destination.
const virtualRoot='/synthetic-owned-evidence/';
const norm=value=>String(value).replaceAll('\\','/');
const tools=['scripts/check-canvas-content.cjs','scripts/canvas-task-diff.cjs','scripts/canvas-final-manifest.cjs'];
const realActions={HTTP:0,Git:0,SDK:0,DB:0,productSourceWrites:0};
let fixtures;
let activeTools=tools;

// Adapted from the existing verified VM fixture harness.
async function runTool(file,options={}){
  const originalFiles=new Map(Object.entries(options.files||{}).map(([key,value])=>[norm(key),Buffer.from(value)]));
  const files=new Map(originalFiles),writes=[],requests=[],spawns=[],loads=[],logs=[],errors=[],warnings=[],operations=[],fds=new Map();let nextFd=100;
  const reportNames=['task.diff','task-files.json','content-separation.json'];const isReport=file=>reportNames.some(name=>file===virtualRoot+name);
  const fault=(op,file,to)=>{operations.push({op,file,to});options.onFs?.(op,file,to,files);};
  let terminalResolve;const terminal=new Promise(resolve=>terminalResolve=resolve);
  let fakeExit=0;
  const fakeFs={
    readFileSync(file,encoding){const value=files.get(norm(file));if(!value)throw Error('SYNTHETIC_ENOENT:'+norm(file));return encoding?value.toString('utf8'):Buffer.from(value);},
    existsSync:file=>options.kindFor?.(norm(file))==='dangling-symlink'?false:files.has(norm(file)),
    readdirSync(directory){assert.equal(norm(directory),'scripts');return options.directory||[];},
    writeFileSync(file,value){const target=typeof file==='number'?fds.get(file):norm(file);assert(target?.startsWith(virtualRoot),'VIRTUAL_WRITE_SCOPE');fault('write',target);files.set(target,Buffer.from(value));if(isReport(target)&&!writes.includes(target))writes.push(target);},
    openSync(file,flags){const target=norm(file);assert(target.startsWith(virtualRoot));fault('open',target);if(flags==='wx'&&files.has(target))throw Object.assign(Error('synthetic exists'),{code:'EEXIST'});files.set(target,Buffer.alloc(0));const fd=nextFd++;fds.set(fd,target);return fd;},
    closeSync(fd){fds.delete(fd);},
    lstatSync(file){const target=norm(file);fault('lstat',target);if(!files.has(target))throw Object.assign(Error('synthetic missing'),{code:'ENOENT'});const kind=options.kindFor?.(target)||'file';return{isFile:()=>kind==='file',isSymbolicLink:()=>['symlink','dangling-symlink'].includes(kind),nlink:1,mode:0o100600};},
    renameSync(from,to){from=norm(from);to=norm(to);assert(from.startsWith(virtualRoot)&&to.startsWith(virtualRoot));fault('rename',from,to);if(!files.has(from))throw Error('synthetic missing rename');files.set(to,files.get(from));files.delete(from);if(isReport(to)&&!writes.includes(to))writes.push(to);},
    unlinkSync(file){const target=norm(file);assert(target.startsWith(virtualRoot));fault('unlink',target);if(!files.delete(target))throw Error('synthetic missing unlink');}
  };
  const fakeProcess={argv:['node',file],env:{PROCESS_CANVAS_EVIDENCE_ROOT:virtualRoot},get exitCode(){return fakeExit;},set exitCode(v){fakeExit=v;}};
  const requireStub=id=>{loads.push(id);
    if(id==='./canvas-task-diff.mjs'){
      // Exact ESM-to-VM adapter: builtin bindings use the same controlled fake modules.
      // The actual module/loader contract is separately exercised by native Node cases.
      let core=fs.readFileSync(path.join(options.programRoot||sourceRoot,'scripts/canvas-task-diff.mjs'),'utf8');
      for(const [binding,name] of [['fs','fs'],['path','path'],['childProcess','child_process'],['crypto','crypto']]){
        const statement="import "+binding+" from 'node:"+name+"';";
        assert(core.includes(statement),'CORE_IMPORT_ADAPTER_DRIFT');
        core=core.replace(statement,"const "+binding+"=require('node:"+name+"');");
      }
      assert(core.includes('export function run(localEvidencePaths){'),'CORE_EXPORT_ADAPTER_DRIFT');
      core=core.replace('export function run(localEvidencePaths){','function run(localEvidencePaths){');
      const adapted=new vm.Script('(function(require){"use strict";\n'+core+'\nreturn {run};})',{filename:'scripts/canvas-task-diff.mjs'});
      return adapted.runInContext(context,{timeout:1000})(requireStub);
    }
    if(id==='./canvas-final-manifest.mjs'){
      // Exact ESM-to-VM adapter: builtin bindings use the same controlled fake modules.
      // The actual module/loader contract is separately exercised by native Node cases.
      let core=fs.readFileSync(path.join(options.programRoot||sourceRoot,'scripts/canvas-final-manifest.mjs'),'utf8');
      for(const [binding,name] of [['fs','fs'],['path','path'],['childProcess','child_process'],['crypto','crypto']]){
        const statement="import "+binding+" from 'node:"+name+"';";
        assert(core.includes(statement),'CORE_IMPORT_ADAPTER_DRIFT');
        core=core.replace(statement,"const "+binding+"=require('node:"+name+"');");
      }
      assert(core.includes('export function run(localEvidencePaths){'),'CORE_EXPORT_ADAPTER_DRIFT');
      core=core.replace('export function run(localEvidencePaths){','function run(localEvidencePaths){');
      const adapted=new vm.Script('(function(require){"use strict";\n'+core+'\nreturn {run};})',{filename:'scripts/canvas-final-manifest.mjs'});
      return adapted.runInContext(context,{timeout:1000})(requireStub);
    }
    if(id==='node:fs')return fakeFs;if(id==='node:path')return path;if(id==='node:crypto')return crypto;
    if(id==='./local-evidence-paths.cjs')return{configuredPath(variable,suffix){assert.equal(variable,'PROCESS_CANVAS_EVIDENCE_ROOT');assert.equal(suffix,'/');return virtualRoot;}};
    if(id==='node:child_process')return{spawnSync(command,args,settings){assert.equal(command,'git');assert.deepEqual(Array.from(args.slice(0,3)),['diff','--no-index','--']);assert.equal(settings.encoding,'utf8');spawns.push(Array.from(args));return options.spawn(args,spawns.length);}};
    throw Error('UNEXPECTED_REQUIRE:'+id);
  };
  const context=vm.createContext({Buffer,URL,structuredClone,process:fakeProcess,
    fetch:async(url,settings)=>{assert.equal(url,'http://localhost:3020/api/process-authoring/workflow?caseMetadata=1');assert.equal(settings.headers['x-fixture-user'],'admin');requests.push(url);assert(options.response,'UNEXPECTED_FETCH');return{status:200,ok:true,json:async()=>structuredClone(options.response)};},
    console:{log:(...args)=>{logs.push(args);terminalResolve();},warn:(...args)=>warnings.push(args),error:(...args)=>{errors.push(args);terminalResolve();}}});
  const source=fs.readFileSync(path.join(options.programRoot||sourceRoot,file),'utf8'),cjsModule={exports:{}};
  // Return completion of the top-level async expression, while preserving a sloppy CJS wrapper.
  const wrapped=new vm.Script('(function(require,module,exports,__filename,__dirname){\n'+source+'\n})',{filename:file});
  let thrown=null;
  try{const fn=wrapped.runInContext(context,{timeout:1000});context.__invoke=()=>fn(requireStub,cjsModule,cjsModule.exports,file,path.dirname(file));
    // Every operation is stubbed/synchronous except the bounded synthetic resolved fetch promises.
    const completion=new vm.Script('__invoke()').runInContext(context,{timeout:1000});
    await Promise.resolve(completion);
    // The async CLI's final success/catch console call is an explicit terminal barrier.
    if(file===tools[0]){let timer;try{await Promise.race([terminal,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SYNTHETIC_COMPLETION_TIMEOUT')),1000);})]);}finally{clearTimeout(timer);}}
  }catch(error){thrown={name:error.name};fakeExit=1;}
  return{files,originalFiles,writes,requests,spawns,loads,logs,errors,warnings,operations,fds,exitCode:fakeExit,thrown,sourceSha256:sha(source)};
}
const cases=[],successOutputs={};
async function check(name,file,run,verify){const result=await run();let status='PASS',failure=null;try{verify(result);}catch(error){status='FAIL';failure=error.message.slice(0,240);}
  const outputs=Object.fromEntries(result.writes.map(key=>[key.slice(virtualRoot.length),sha(result.files.get(key))]));
  cases.push({name,file,status,...(failure?{failure}:{}),virtualExitCode:result.exitCode,syntheticFetchCalls:result.requests.length,GitStubCalls:result.spawns.length,requireSequence:result.loads,outputHashes:outputs,consoleOutputSha256:sha(JSON.stringify(result.logs)),sourceSha256:result.sourceSha256});
  if(status==='PASS'&&/success|single|reordered/.test(name))successOutputs[file+':'+name]=outputs;
}
function workspace(id,other=false){return{id,category:other?'OTHER':'EDITOR ACCEPTANCE',stages:{'A-CUT':[{id:'pe-1',name:'Synthetic step',x:other?99:0,y:0,nextIds:['pe-2']},{id:'pe-2',name:'Second synthetic',x:other?99:10,y:10,nextIds:[]}]}};}
async function contentCase(name,layout,move=false,missing=false){
  const target=workspace('target'),other=workspace('other',true),before=layout==='single'?[target]:layout==='reordered'?[target,other]:[other,target];
  const current=structuredClone(target);if(move)current.stages['A-CUT'][0].x=1;
  const options={files:{[virtualRoot+'synthetic-control-before.json']:JSON.stringify({workflow:{working:{workspaces:missing?[other]:before}}})},response:{control:{workflow:{revision:77,working:{workspaces:[current]}}}}};
  await check(name,tools[0],()=>runTool(tools[0],options),result=>{
    const output=virtualRoot+'content-separation.json';if(missing){assert.notEqual(result.exitCode,0,'missing baseline must fail');assert.equal(result.writes.length,0,'missing baseline must not publish');return;}
    assert.equal(result.exitCode,0);assert.deepEqual(result.writes,[output]);const value=JSON.parse(result.files.get(output));
    assert.deepEqual(value,{status:200,revision:77,name:'Synthetic step',positionChanges:move?['pe-1']:[],edgeCount:1});
  });
}
function diffOptions(file,kind){
  const taskFiles=['public/process/canvas-local.js','public/process/editor-graph.js','public/process/process-editor.js','public/process/process-editor.css','public/process/process-authoring-v3.js','public/process/shared-draft-client.js','public/process/index.html','docs/specs/current/PROCESS_EDITOR.md','AI_CONTEXT/modules/PROCESS.md','AI_CONTEXT/CHANGELOG.md','HANDOFF.md'];
  const extras=['AI_CONTEXT/DATA_MODEL.md','docs/ipqc-reference/20261008-canvas-local.md','scripts/test-canvas-synthetic.cjs','scripts/canvas-synthetic.cjs','scripts/prepare-canvas-fixture.cjs','scripts/check-canvas-content.cjs'];
  const files={[virtualRoot+'task.diff']:'PREVIOUS_DIFF',[virtualRoot+'task-files.json']:JSON.stringify([{file:'public/process/canvas-local.js'}])};
  for(const item of [...taskFiles,...extras]){files[item]='synthetic:'+item+'\n';if(kind!=='new-file'||item!=='public/process/canvas-local.js')files[virtualRoot+'before/'+item]='prior:'+item+'\n';}
  const failure=kind.startsWith('late-')?kind.slice(5):kind;
  return{files,directory:['test-canvas-synthetic.cjs','canvas-synthetic.cjs','prepare-canvas-fixture.cjs','check-canvas-content.cjs','ignored.cjs'],
    spawn(args,index){if(kind.startsWith('late-')&&index===1)return{status:1,signal:null,stdout:'diff-first\n'};
      if(failure==='ENOENT')return{status:null,signal:null,stdout:null,error:Object.assign(Error('synthetic spawn error'),{code:'ENOENT'})};
      if(failure==='error')return{status:128,signal:null,stdout:'',stderr:'synthetic diff failure'};
      if(failure==='signal')return{status:null,signal:'SIGTERM',stdout:''};
      if(failure==='nonstring')return{status:1,signal:null,stdout:null};
      return{status:kind==='status0'?0:1,signal:null,stdout:kind==='status0'?'':'diff:'+args[4]+'\n'};}
  };
}
async function runCore(){
  if(activeTools.includes(tools[0])){await contentCase('multi-workspace-unchanged','multi');await contentCase('reordered-success','reordered');await contentCase('single-workspace-success','single');await contentCase('multi-workspace-node-move','multi',true);await contentCase('missing-baseline','multi',false,true);}
  for(const file of activeTools.filter(file=>file!==tools[0]))for(const kind of ['status0','status1','new-file','ENOENT','error','signal','nonstring','late-error']){
    const options=diffOptions(file,kind),positive=['status0','status1','new-file'].includes(kind);
    await check(positive?'success-'+kind:'failure-'+kind,file,()=>runTool(file,options),result=>{
      if(!positive){assert.notEqual(result.exitCode,0,'spawn failure must fail tool');assert.equal(result.writes.length,0,'spawn failure must not publish');for(const name of ['task.diff','task-files.json'])assert(result.files.get(virtualRoot+name).equals(result.originalFiles.get(virtualRoot+name)),'prior evidence must survive');return;}
      assert.equal(result.exitCode,0);const manifest=JSON.parse(result.files.get(virtualRoot+'task-files.json'));assert(manifest.length>0);for(const item of manifest){assert.deepEqual(Object.keys(item),['file','sha256']);assert.equal(item.sha256,sha(Buffer.from(options.files[item.file])));}
      const diff=result.files.get(virtualRoot+'task.diff').toString();if(kind==='status0')assert.equal(diff,'');else assert(diff.length>0);if(kind==='new-file')assert(diff.includes('NEW FILE public/process/canvas-local.js'));
    });
  }
}

// Same IO failure matrix, now sharing this entry and relative fixed fixtures.
async function runIO(supplement){
const git=fixtures.git;
const rows=[];
const error=()=>Object.assign(Error('Synthetic IO failure'),{code:'EIO'});
function originalsRetained(result){return['task.diff','task-files.json'].every(name=>{const before=result.originalFiles.get(virtualRoot+name),after=result.files.get(virtualRoot+name);return before?!!after&&after.equals(before):!after;});}
async function test(file,name,options,verify){options.programRoot=sourceRoot;const result=await runTool(file,options);let status='PASS',failure=null;try{verify(result);}catch(e){status='FAIL';failure=e.message.slice(0,200);}rows.push({file,name,status,failure,sourceRoot:options.programRoot,sourceSHA256:result.sourceSha256,exitCode:result.exitCode,successMessages:result.logs.length,warnings:result.warnings.length,originalsRetained:originalsRetained(result),openDescriptors:result.fds.size,recoveryFiles:[...result.files.keys()].filter(f=>/\.(?:tmp|bak)$|canvas-reports\.lock$/.test(f)).map(f=>path.basename(f))});}
for(const file of activeTools.filter(file=>file!==tools[0])){
  if(supplement){
    {let count=0;const options=diffOptions(file,'status1');options.onFs=(op,target,unused,files)=>{if(op==='write'&&++count===2){files.set(target,Buffer.from('PARTIAL'));throw error();}};
      await test(file,'partial-second-stage-write-cleaned',options,result=>{assert.notEqual(result.exitCode,0);assert(originalsRetained(result));assert.equal(result.fds.size,0);assert.equal([...result.files.keys()].filter(f=>/\.(?:tmp|bak)$|canvas-reports\.lock$/.test(f)).length,0);});}
    {let count=0;const options=diffOptions(file,'status1');options.onFs=(op,from,to)=>{if(op==='rename'&&to.endsWith('.bak')&&++count===2)throw error();};
      await test(file,'second-backup-failure-rollback',options,result=>{assert.notEqual(result.exitCode,0);assert(originalsRetained(result));assert.equal(result.logs.length,0);assert.equal([...result.files.keys()].filter(f=>/\.(?:tmp|bak)$|canvas-reports\.lock$/.test(f)).length,0);});}
    {let count=0;const options=diffOptions(file,'status1');delete options.files[virtualRoot+'task.diff'];options.onFs=(op,from)=>{if(op==='rename'&&from.endsWith('.tmp')&&++count===2)throw error();};
      await test(file,'rollback-restores-original-absence',options,result=>{assert.notEqual(result.exitCode,0);assert.equal(result.files.has(virtualRoot+'task.diff'),false);assert(result.files.get(virtualRoot+'task-files.json').equals(result.originalFiles.get(virtualRoot+'task-files.json')));assert.equal(result.logs.length,0);});}
    {const options=diffOptions(file,'status1');options.kindFor=target=>target===virtualRoot+'task.diff'?'directory':'file';
      await test(file,'directory-output-refused',options,result=>{assert.notEqual(result.exitCode,0);assert(originalsRetained(result));assert.equal(result.logs.length,0);});}
    {const options=diffOptions(file,'status1');options.kindFor=target=>target===virtualRoot+'task.diff'?'dangling-symlink':'file';
      await test(file,'dangling-link-output-refused',options,result=>{assert.notEqual(result.exitCode,0);assert(originalsRetained(result));assert.equal(result.logs.length,0);assert.equal([...result.files.keys()].filter(f=>/\.(?:tmp|bak)$|canvas-reports\.lock$/.test(f)).length,0);});}
    {const options=diffOptions(file,'status1');options.onFs=(op,target)=>{if(op==='lstat'&&target===virtualRoot+'task.diff')throw Object.assign(Error('synthetic denied'),{code:'EACCES'});};
      await test(file,'lstat-denied-must-not-mean-missing',options,result=>{assert.notEqual(result.exitCode,0);assert(originalsRetained(result));assert.equal(result.logs.length,0);assert.equal([...result.files.keys()].filter(f=>/\.(?:tmp|bak)$|canvas-reports\.lock$/.test(f)).length,0);});}
    continue;
  }
  for(const name of ['identical','different','no-index-missing-input']){
    const actual=git.rows.find(row=>row.name===name),options=diffOptions(file,'status1');options.spawn=()=>({status:actual.exitCode,signal:actual.signal,stdout:actual.stdout,stderr:actual.stderr});
    await test(file,'real-git-shape-'+name,options,result=>{if(name==='no-index-missing-input'){assert.notEqual(result.exitCode,0);assert(originalsRetained(result));assert.equal(result.logs.length,0);}else{assert.equal(result.exitCode,0);assert.equal(result.logs.length,1);}});
  }
  {let writes=0;const options=diffOptions(file,'status1');options.onFs=(op,file)=>{if(op==='write'&&!file.endsWith('.canvas-reports.lock')&&++writes===2)throw error();};
    await test(file,'second-write-failure',options,result=>{assert.notEqual(result.exitCode,0);assert(originalsRetained(result),'both previous report bytes must survive second write failure');assert.equal(result.logs.length,0);assert.equal(result.fds.size,0);});}
  {
    {let publishes=0;const options=diffOptions(file,'status1');options.onFs=(op,from)=>{if(op==='rename'&&from.endsWith('.tmp')&&++publishes===2)throw error();};
      await test(file,'second-publish-failure-rollback',options,result=>{assert.notEqual(result.exitCode,0);assert(originalsRetained(result));assert.equal(result.logs.length,0);assert.equal(result.fds.size,0);assert.equal([...result.files.keys()].filter(f=>/\.(?:tmp|bak)$|canvas-reports\.lock$/.test(f)).length,0);});}
    {const options=diffOptions(file,'status1');options.files[virtualRoot+'.canvas-reports.lock']='OTHER_WRITER';
      await test(file,'existing-writer-lock-refused',options,result=>{assert.notEqual(result.exitCode,0);assert(originalsRetained(result));assert.equal(result.files.get(virtualRoot+'.canvas-reports.lock').toString(),'OTHER_WRITER');assert.equal(result.logs.length,0);});}
    {const options=diffOptions(file,'status1');options.kindFor=target=>target===virtualRoot+'task.diff'?'symlink':'file';
      await test(file,'linked-output-refused',options,result=>{assert.notEqual(result.exitCode,0);assert(originalsRetained(result));assert.equal(result.logs.length,0);});}
    {const options=diffOptions(file,'status1');options.onFs=(op,file)=>{if(op==='unlink'&&file.endsWith('.bak'))throw error();};
      await test(file,'backup-cleanup-warning-after-success',options,result=>{assert.equal(result.exitCode,0);assert.equal(result.logs.length,1);assert(result.warnings.length>0);assert(!originalsRetained(result));assert([...result.files.keys()].some(f=>f.endsWith('.bak')));});}
    {let publishes=0,rollbackBlocked=false;const options=diffOptions(file,'status1');options.onFs=(op,from)=>{if(op==='rename'&&from.endsWith('.tmp')&&++publishes===2)throw error();if(op==='rename'&&from.endsWith('.bak')&&!rollbackBlocked){rollbackBlocked=true;throw error();}};
      await test(file,'rollback-failure-no-success-preserve-backup',options,result=>{assert.notEqual(result.exitCode,0);assert.equal(result.logs.length,0);assert([...result.files.keys()].some(f=>f.endsWith('.bak')));assert(rollbackBlocked);});}
  }
}
return rows;
}

function within(root,file){const relative=path.relative(root,path.resolve(file));return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}

// Loaded in EVERY native child, including normal/locked modes. Never installed in the parent.
function installNativeFixture(){
  const configPath=process.env.PROCESS_CANVAS_TEST_CONFIG;
  const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
  const root=fs.realpathSync(path.dirname(configPath));
  assert(/^[a-f0-9]{48}$/.test(config.token)&&config.token===process.env.PROCESS_CANVAS_TEST_TOKEN);
  assert.equal(fs.readFileSync(path.join(root,'.fixture-owner'),'utf8'),config.token);
  assert.equal(fs.realpathSync(config.project),path.join(root,'project'));
  assert.equal(fs.realpathSync(config.reports),path.join(root,'reports'));
  assert.equal(fs.realpathSync(process.cwd()),config.project);
  const denied=()=>{throw Error('OFFLINE_FIXTURE_EXTERNAL_ACTION_REFUSED');};
  globalThis.fetch=denied;
  for(const [object,names]of [[childProcess,['spawn','exec','execFile','fork','execSync','execFileSync']],[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['request','get']],[https,['request','get']],[dgram,['createSocket']]])for(const name of names)object[name]=denied;
  net.Socket.prototype.connect=denied;net.Server.prototype.listen=denied;
  const audit={preloadReady:true,gitCalls:0,injectedFault:null,lockRefused:false};
  childProcess.spawnSync=(command,args,options)=>{
    assert.equal(command,'git');assert.deepEqual(args.slice(0,3),['diff','--no-index','--']);assert.equal(args.length,5);assert.equal(options.encoding,'utf8');
    assert(within(path.join(config.reports,'before'),args[3]));assert(!path.isAbsolute(args[4])&&within(config.project,path.resolve(config.project,args[4])));
    audit.gitCalls++;return{status:1,signal:null,stdout:'diff:'+norm(args[4])+'\n',stderr:''};
  };
  const original={open:fs.openSync,close:fs.closeSync,write:fs.writeFileSync,rename:fs.renameSync,unlink:fs.unlinkSync};
  const handles=new Map();let stages=0,publishes=0;
  const fsPath=file=>file instanceof URL?fileURLToPath(file):Buffer.isBuffer(file)?file.toString():file;
  const owned=file=>{file=fsPath(file);assert(within(config.reports,file),'NATIVE_WRITE_MUST_STAY_IN_OWNED_REPORTS');return path.resolve(file);};
  const failure=()=>Object.assign(Error('Synthetic native IO failure'),{code:'EIO'});
  fs.openSync=(file,flags,...rest)=>{file=fsPath(file);const writing=typeof flags==='number'?!!(flags&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND)):/[wa+]/.test(flags);if(writing)owned(file);let handle;try{handle=original.open(file,flags,...rest);}catch(error){if(String(file).endsWith('.canvas-reports.lock')&&error.code==='EEXIST')audit.lockRefused=true;throw error;}handles.set(handle,path.resolve(file));return handle;};
  fs.closeSync=handle=>{handles.delete(handle);return original.close(handle);};
  fs.writeFileSync=(file,data,...rest)=>{const target=owned(typeof file==='number'?handles.get(file):file);if(target.endsWith('.tmp')&&++stages===2&&config.mode==='stage2'){audit.injectedFault='stage2';throw failure();}return original.write(file,data,...rest);};
  fs.renameSync=(from,to)=>{owned(from);owned(to);if(String(from).endsWith('.tmp')&&++publishes===2&&config.mode==='publish2'){audit.injectedFault='publish2';throw failure();}return original.rename(from,to);};
  fs.unlinkSync=file=>{owned(file);return original.unlink(file);};
  process.once('exit',exitCode=>original.write(path.join(root,'child-audit.json'),JSON.stringify({...audit,exitCode})));
}

function runNativeCLI(runRoot){
  const rows=[];
  for(const tool of activeTools.filter(file=>file!==tools[0]))for(const mode of ['normal','stage2','publish2','locked']){
    const root=fs.mkdtempSync(path.join(runRoot,'native-')),project=path.join(root,'project'),reports=path.join(root,'reports');fs.mkdirSync(project);fs.mkdirSync(reports);
    for(const [name,value]of Object.entries(diffOptions(tool,'status1').files)){
      const target=name.startsWith(virtualRoot)?path.join(reports,name.slice(virtualRoot.length)):path.join(project,name);
      assert(within(root,target));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value,{flag:'wx'});
    }
    for(const file of ['scripts/canvas-task-diff.cjs','scripts/canvas-task-diff.mjs','scripts/canvas-final-manifest.cjs','scripts/canvas-final-manifest.mjs','scripts/local-evidence-paths.cjs']){const target=path.join(project,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,fs.readFileSync(path.join(sourceRoot,file)),{flag:'wx'});}
    const names=['task.diff','task-files.json'],before=names.map(name=>sha(fs.readFileSync(path.join(reports,name))));
    const token=crypto.randomBytes(24).toString('hex'),config=path.join(root,'fixture.json');
    fs.writeFileSync(path.join(root,'.fixture-owner'),token,{flag:'wx'});fs.writeFileSync(config,JSON.stringify({token,project,reports,mode}),{flag:'wx'});
    if(mode==='locked')fs.writeFileSync(path.join(reports,'.canvas-reports.lock'),'OTHER_WRITER',{flag:'wx'});
    const result=childProcess.spawnSync(process.execPath,['--import',pathToFileURL(entry).href,path.join(project,tool)],{cwd:project,env:{...process.env,NODE_OPTIONS:'',PROCESS_CANVAS_TEST_CONFIG:config,PROCESS_CANVAS_TEST_TOKEN:token,PROCESS_CANVAS_EVIDENCE_ROOT:reports,TEMP:root,TMP:root},encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024});
    let status='PASS',failure=null,audit=null;
    try{
      assert(!result.error);assert.equal(result.signal,null);assert.notEqual(result.status,null);
      audit=JSON.parse(fs.readFileSync(path.join(root,'child-audit.json'),'utf8'));assert.equal(audit.preloadReady,true);assert(audit.gitCalls>0);assert.equal(audit.exitCode,result.status);
      assert.equal(audit.injectedFault,['stage2','publish2'].includes(mode)?mode:null);assert.equal(audit.lockRefused,mode==='locked');
      const after=names.map(name=>sha(fs.readFileSync(path.join(reports,name)))),same=JSON.stringify(before)===JSON.stringify(after),left=fs.readdirSync(reports).filter(name=>/\.(?:tmp|bak)$|canvas-reports\.lock$/.test(name));
      if(mode==='normal'){assert.equal(result.status,0);assert(result.stdout.length>0);assert(!same);assert.equal(left.length,0);assert(JSON.parse(fs.readFileSync(path.join(reports,'task-files.json'),'utf8')).length>0);}
      else{assert.notEqual(result.status,0);assert(same);assert.equal(result.stdout.length,0);assert.equal(left.length,mode==='locked'?1:0);if(mode==='locked')assert.equal(fs.readFileSync(path.join(reports,'.canvas-reports.lock'),'utf8'),'OTHER_WRITER');}
    }catch(error){status='FAIL';failure=error.message.slice(0,180);}
    rows.push({tool,mode,status,failure,audit,exitCode:result.status,errorCode:result.error?.code||null,stdout:result.stdout,stderr:result.stderr,sourceSHA256:sha(fs.readFileSync(path.join(sourceRoot,tool))),fixture:root});
  }
  return rows;
}

async function main(artifactParent=os.tmpdir(),selectedTool=null){
  activeTools=selectedTool?[selectedTool]:tools;
  fixtures=JSON.parse(fs.readFileSync(path.join(sourceRoot,'scripts/fixtures/canvas-evidence-tools.json'),'utf8'));
  assert.equal(fixtures.format,'CANVAS_EVIDENCE_FIXED_SYNTHETIC_EXPECTATIONS_V1');assert.equal(fixtures.controls.length,8);
  assert(path.isAbsolute(artifactParent),'ARTIFACT_PARENT_MUST_BE_ABSOLUTE');
  const artifactStat=fs.lstatSync(artifactParent);assert(artifactStat.isDirectory()&&!artifactStat.isSymbolicLink(),'ARTIFACT_PARENT_MUST_BE_EXISTING_DIRECTORY');
  const runRoot=fs.mkdtempSync(path.join(artifactParent,'process-canvas-evidence-'));
  await runCore();
  const contracts=fixtures.controls.filter(expected=>activeTools.includes(expected.file)).map(expected=>{
    const actual=cases.find(row=>row.file===expected.file&&row.name===expected.name);let status='PASS',failure=null;
    try{assert(actual&&actual.status==='PASS');assert.deepEqual(actual.outputHashes,expected.outputHashes);assert.equal(actual.consoleOutputSha256,expected.consoleOutputSha256);assert.deepEqual(actual.requireSequence,expected.file==='scripts/canvas-task-diff.cjs'?['./canvas-task-diff.mjs',...expected.requireSequence]:expected.file==='scripts/canvas-final-manifest.cjs'?['./canvas-final-manifest.mjs',...expected.requireSequence]:expected.requireSequence);}catch(error){status='FAIL';failure=error.message.slice(0,180);}
    return{file:expected.file,name:expected.name,status,failure};
  });
  const io=[...await runIO(false),...await runIO(true)],native=runNativeCLI(runRoot);
  const diffCount=activeTools.filter(file=>file!==tools[0]).length;
  assert.equal(cases.length,(activeTools.includes(tools[0])?5:0)+8*diffCount);assert.equal(io.length,15*diffCount);assert.equal(native.length,4*diffCount);
  const groups={regression:cases,contracts,IO:io,nativeNodeCLIWithGitStub:native};
  const summaries=Object.fromEntries(Object.entries(groups).map(([group,rows])=>[group,{total:rows.length,passed:rows.filter(row=>row.status==='PASS').length,failed:rows.filter(row=>row.status!=='PASS').length}]));
  const failed=Object.values(groups).flat().filter(row=>row.status!=='PASS');
  const report={format:'CANVAS_EVIDENCE_PORTABLE_OFFLINE_REGRESSION_V1',status:failed.length===0?'PASS_OFFLINE_SYNTHETIC_ONLY':'FAIL_OFFLINE_REGRESSION',at:new Date().toISOString(),node:process.version,platform:process.platform,sourceRoot,selectedTools:activeTools,entrySHA256:sha(fs.readFileSync(entry)),fixtureSHA256:sha(fs.readFileSync(path.join(sourceRoot,'scripts/fixtures/canvas-evidence-tools.json'))),sourceFiles:[...tools,'scripts/canvas-task-diff.mjs','scripts/canvas-final-manifest.mjs','scripts/local-evidence-paths.cjs'].map(file=>({file,sha256:sha(fs.readFileSync(path.join(sourceRoot,file)))})),summaries,groups,realActions:{...realActions,nativeNodeChildren:native.length,actualGitCommands:0,appServices:0},limits:['Synthetic fetch and Git only; no application or business data verification','Native Node filesystem/CLI cases use Git stub, not actual Git','Caught-error recovery does not prove power-loss atomicity or ACL/inode parity']};
  const receipt=path.join(runRoot,'receipt.json');fs.writeFileSync(receipt,JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({status:report.status,receipt,summaries,failed:failed.map(row=>({file:row.file||row.tool,name:row.name||row.mode,failure:row.failure})),realActions:report.realActions}));
  process.exitCode=failed.length===0?0:1;
}

const isMain=!!process.argv[1]&&path.resolve(process.argv[1])===entry;
if(!isMain&&process.env.PROCESS_CANVAS_TEST_CONFIG)installNativeFixture();
if(isMain){
  if(process.argv.length===3&&process.argv[2]==='--help')console.log('Run: node scripts/test-canvas-evidence-tools.mjs [--artifacts-dir ABSOLUTE_EXISTING_DIRECTORY] [--tool canvas-final-manifest|canvas-task-diff|check-canvas-content]\nNode built-ins only; no application, Git, network or DB.\nExit 0: selected synthetic cases passed; 1: regression/setup failed; 2: unsupported arguments.');
  else{
    let artifactParent,selectedTool=null,invalid=false;const seen=new Set();
    for(let i=2;i<process.argv.length;i+=2){const flag=process.argv[i],value=process.argv[i+1];if(!['--artifacts-dir','--tool'].includes(flag)||!value||seen.has(flag)){invalid=true;break;}seen.add(flag);if(flag==='--artifacts-dir')artifactParent=value;else{selectedTool=tools.find(file=>path.basename(file,'.cjs')===value);if(!selectedTool){invalid=true;break;}}}
    if(invalid){console.error('Unsupported arguments; use --help');process.exitCode=2;}
    else main(artifactParent,selectedTool).catch(error=>{console.error(JSON.stringify({status:'FAIL_OFFLINE_TEST_SETUP',error:error.message}));process.exitCode=1;});
  }
}
