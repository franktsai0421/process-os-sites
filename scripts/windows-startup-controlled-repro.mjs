// Separate diagnostic only. Never a retry wrapper around the product CI gate.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {spawn,execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
export const PIN=Object.freeze({commit:'ec4070c98c1b4667baab8fb947c48d5f1fb401cc',tree:'f5ca08dd81ccb0c2a8f0f7154b36ba21faec8abb',test:'tests/sites-startup-assets-native.test.mjs',testSha256:'ab06875968a88da9f39b11f357d22665bb047525f78baf62ea2dec12ff95fd90',distSha256:'7a7120fdea9a44f32a40fbf9ec17c6c19fe60dc002d774fcdda2b814120b997e'});
export const LIMIT=Object.freeze({iterations:8,requestsPerIteration:43,requests:344,timeoutMs:120000,cleanupMs:5000,outputBytes:1048576});
export const SLOTS=Object.freeze(['session_missing','session_nonowner','session_expired','session_wrong_epoch','session_forged','cross_origin_put','owner_wrong_index','owner_fourth_file','owner_page','publish_undefined','publish_empty','publish_nonempty','publish_cross_origin',...Array.from({length:3},(_,i)=>['owner','anonymous','dashboard','ab','c','lines','denied','iqc','other_owner'].map(role=>`seed_${i+1}_${role}`)).flat(),'retained_iqc','retained_anonymous','retained_dashboard']);
const CASES=["start","compiled fixed endpoint rejects missing forged nonowner expired wrong-epoch and cross-origin sessions without any admission","compiled owner route is reachable but refuses synthetic wrong index and caller-selected fourth file","compiled empty HTTP publish body reaches pinned writer, nonempty body and cross-site request never admit","actual D1 one-use admission and R2 readbacks complete fixed synthetic three-file supplement preserving all main rows","actual R2 stale ETag cannot replace the published index","compiled three seed routes serve verified globals only to fixed Frank owner, denying each single module and another admin","compiled retained original asset keeps its existing module ACL and all account/control rows remain unchanged"];
const PHASES=["admission-count-read-and-assert","case-start","cross-origin-publish-response-body","cross-origin-put-dispatch-and-assert","cross-origin-put-response-body","owner-fourth-file-dispatch-and-status","owner-fourth-file-response-json","owner-startup-page-dispatch-and-status","owner-wrong-index-dispatch-and-status","owner-wrong-index-response-json","retained-anonymous-response-body","retained-restricted-response-body","seed-anonymous-response-body","seed-restricted-response-body","session-rejection-response-body","session-rejections-dispatch-and-assert","start","startup-page-response-body"];
const STATUSES=[...Array(6).fill(403),409,409,200,409,409,400,403,...Array.from({length:3},()=>[200,401,...Array(7).fill(403)]).flat(),200,401,403];
const EVENTS=['create','send_headers','body_chunk_sent','body_sent','response_headers','response_complete','request_error'],CODES=['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','ABORT_ERR','UND_ERR_SOCKET','UND_ERR_ABORTED','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_CONNECT_TIMEOUT','OTHER'];
const hash=value=>createHash('sha256').update(value).digest('hex'),hex=(v,n)=>typeof v==='string'&&new RegExp(`^[a-f0-9]{${n}}$`).test(v),integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export const normalizedSourceHash=bytes=>hash(bytes.toString('utf8').replace(/\r\n/g,'\n'));
export function inspectSource(sourceDir){
 const git=(...args)=>execFileSync('git',['-C',sourceDir,...args],{encoding:'utf8',timeout:10000,maxBuffer:LIMIT.outputBytes,stdio:['ignore','pipe','pipe']}).trim();
 const test=fs.readFileSync(path.join(sourceDir,PIN.test)),modules=fs.lstatSync(path.join(sourceDir,'node_modules'));
 const dependencies=modules.isDirectory()&&!modules.isSymbolicLink()&&[['miniflare','4.20260515.0'],['workerd','1.20260515.1'],['undici','7.30.1']].every(([name,version])=>JSON.parse(fs.readFileSync(path.join(sourceDir,'node_modules',name,'package.json'),'utf8')).version===version);
 return{head:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),clean:git('status','--porcelain','--untracked-files=no')==='',testSha256:normalizedSourceHash(test),testRawSha256:hash(test),distSha256:hash(fs.readFileSync(path.join(sourceDir,'dist/server/index.js'))),dependencies};
}
export function sourceVerdict(value){
 if(!value||typeof value!=='object')return'SOURCE_INSPECTION_FAILED';
 if(value.head!==PIN.commit||value.tree!==PIN.tree||value.clean!==true)return'SOURCE_MISMATCH';
 if(value.testSha256!==PIN.testSha256)return'TEST_SOURCE_MISMATCH';
 if(value.dependencies!==true)return'DEPENDENCY_MISMATCH';
 if(value.distSha256!==PIN.distSha256)return'BUILD_HASH_MISMATCH';
 return null;
}
// Parse the last original JSON report, then rebuild only the fixed safe schema.
export function parseReport(stdout){
 const line=stdout.toString('utf8').trimEnd().split(/\r?\n/).at(-1);let raw;
 try{raw=JSON.parse(line);}catch{return{reason:'MALFORMED_REPORT'};}
 if(!raw||typeof raw!=='object'||!['PASS_COMPILED_STARTUP_SUPPLEMENT','FAIL_COMPILED_STARTUP_SUPPLEMENT'].includes(raw.status)||!integer(raw.cases,0,7)||typeof raw.disposed!=='boolean'||!(hex(raw.buildEntrySha256,64)||raw.buildEntrySha256===undefined&&raw.status==='FAIL_COMPILED_STARTUP_SUPPLEMENT'))return{reason:'MALFORMED_REPORT'};
 const report={status:raw.status,cases:raw.cases,disposed:raw.disposed,buildEntrySha256:raw.buildEntrySha256??null};
 if(raw.failureDiagnostics&&Array.isArray(raw.failureDiagnostics.causeCodes))report.causeCodes=[...new Set(raw.failureDiagnostics.causeCodes.map(code=>CODES.includes(code)?code:'OTHER'))].slice(0,3);
 if(raw.errorType!==undefined)report.errorType=['Error','TypeError','SyntaxError','AssertionError','RangeError'].includes(raw.errorType)?raw.errorType:'OTHER';
 if(CASES.includes(raw.stage))report.stage=raw.stage;if(PHASES.includes(raw.failedSubstage))report.failedSubstage=raw.failedSubstage;
 for(const key of ['actual','expected'])if(integer(raw[key],-1000000000,1000000000))report[key]=raw[key];
 const t=raw.transport;
 if(!t||t.scope!=='WINDOWS_STARTUP_FIXTURE_CLIENT_ONLY'||t.runtimeExit!=='not_observable_via_public_sdk'||typeof t.observerFault!=='boolean'||typeof t.unsubscribed!=='boolean'||!Array.isArray(t.rows)||t.rows.length>43)return{report,reason:'OBSERVATION_MISSING'};
 const rows=[],orders=new Set();
 for(let i=0;i<t.rows.length;i++){
  const r=t.rows[i];if(!r||r.slot!==SLOTS[i]||r.expectedBodyBytes!==(i===5||i===7?9:i===11?1:0)||!['dispatch','status','body','body_complete'].includes(r.phase)||!['pending','resolved','rejected'].includes(r.fetch)||!['not_started','pending','resolved','rejected'].includes(r.body)||!['observed_client_events','inconclusive'].includes(r.evidence)||typeof r.ambiguous!=='boolean'||typeof r.invalid!=='boolean'||!integer(r.sentBytes,0,10)||!(r.socketId===null||integer(r.socketId,1,43))||!(r.status===null||integer(r.status,100,599))||!Array.isArray(r.errorCodes)||r.errorCodes.length>2||r.errorCodes.some(code=>!CODES.includes(code))||!Array.isArray(r.events)||r.events.length>16)return{report,reason:'MALFORMED_OBSERVATION'};
  const row={slot:r.slot,expectedBodyBytes:r.expectedBodyBytes,phase:r.phase,fetch:r.fetch,body:r.body,socketId:r.socketId,sentBytes:r.sentBytes,status:r.status,ambiguous:r.ambiguous,invalid:r.invalid,evidence:r.evidence,errorCodes:[...r.errorCodes],events:[]};
  for(const key of ['created','headerWrites','sentChunks','bodySent','responseHeaders','responseComplete','errors']){if(!integer(r[key],0,16))return{report,reason:'MALFORMED_OBSERVATION'};row[key]=r[key];}
  let order=0;for(const event of r.events){if(!event||!EVENTS.includes(event.event)||!integer(event.order,order+1,512)||orders.has(event.order))return{report,reason:'MALFORMED_OBSERVATION'};order=event.order;orders.add(order);row.events.push({event:event.event,order:event.order});}
  for(const [key,event]of [['created','create'],['headerWrites','send_headers'],['sentChunks','body_chunk_sent'],['bodySent','body_sent'],['responseHeaders','response_headers'],['responseComplete','response_complete'],['errors','request_error']])if(row[key]!==row.events.filter(e=>e.event===event).length)return{report,reason:'MALFORMED_OBSERVATION'};
  rows.push(row);
 }
 report.transport={scope:t.scope,runtimeExit:t.runtimeExit,observerFault:t.observerFault,unsubscribed:t.unsubscribed,rows};
 if(report.buildEntrySha256!==null&&report.buildEntrySha256!==PIN.distSha256)return{report,reason:'BUILD_HASH_MISMATCH'};
 if(!report.disposed)return{report,reason:'CLEANUP_UNCONFIRMED'};
 if(t.observerFault||!t.unsubscribed||rows.some(r=>r.evidence!=='observed_client_events'||r.ambiguous||r.invalid||r.created!==1||r.fetch==='resolved'&&(r.headerWrites!==1||r.responseHeaders!==1||r.socketId===null)||r.body==='resolved'&&(r.bodySent!==1||r.responseComplete!==1)||r.fetch==='rejected'&&r.errors===0||r.bodySent>0&&r.sentBytes!==r.expectedBodyBytes))return{report,reason:'OBSERVATION_INCONCLUSIVE'};
 if(report.status==='FAIL_COMPILED_STARTUP_SUPPLEMENT')return{report,reason:'FIXTURE_FAILURE'};
 if(rows.some(r=>r.errors>0||r.errorCodes.length>0))return{report,reason:'TRANSPORT_ERROR_OBSERVED'};
 if(report.cases!==7||rows.length!==43||rows.some((r,i)=>r.phase!=='body_complete'||r.fetch!=='resolved'||r.body!=='resolved'||r.status!==STATUSES[i]))return{report,reason:'INCOMPLETE_SUCCESS_REPORT'};
 return{report,reason:null};
}
// Use only the public ChildProcess kill method on this exact owned child.
// No PID/name kill: workerd descendants remain unconfirmed; the entire run stops.
export function runNativeChild(sourceDir,{spawnChild=spawn,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 return new Promise(resolve=>{
  let child,stdoutBytes=0,stderrBytes=0,timedOut=false,overflow=false,spawnError=false,terminating=false,killRequested=false,exited=false,closed=false,settled=false;const timerHandles={watchdog:undefined,cleanup:undefined},chunks=[],outHash=createHash('sha256'),errHash=createHash('sha256');
  const finish=(exitCode=null,signal=null)=>{if(settled)return;settled=true;clearTimer(timerHandles.watchdog);clearTimer(timerHandles.cleanup);resolve({exitCode:integer(exitCode,0,255)?exitCode:null,signaled:signal!==null,stdout:Buffer.concat(chunks),stdoutBytes,stderrBytes,stdoutSha256:outHash.digest('hex'),stderrSha256:errHash.digest('hex'),timedOut,overflow,spawnError,closed,exited,killRequested});};
  const release=()=>{child?.unref();child?.stdout?.destroy();child?.stderr?.destroy();finish();};
  const terminate=()=>{if(terminating||settled)return;terminating=true;timerHandles.cleanup=setTimer(release,LIMIT.cleanupMs);if(!exited)try{killRequested=child.kill();}catch{killRequested=false;}};
  const capture=(chunk,isError)=>{if(settled||terminating)return;const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk),remaining=LIMIT.outputBytes-stdoutBytes-stderrBytes,retained=bytes.subarray(0,remaining);if(isError){stderrBytes+=retained.length;errHash.update(retained);}else{stdoutBytes+=retained.length;outHash.update(retained);chunks.push(retained);}if(bytes.length>remaining){overflow=true;terminate();}};
  try{child=spawnChild(process.execPath,[path.join(sourceDir,PIN.test)],{cwd:sourceDir,env:{...process.env,PROCESS_PROGRAM_COMMIT:PIN.commit},stdio:['ignore','pipe','pipe'],windowsHide:true,shell:false});}
  catch{spawnError=true;finish();return;}
  child.stdout.on('data',chunk=>capture(chunk,false));child.stderr.on('data',chunk=>capture(chunk,true));
  for(const pipe of [child.stdout,child.stderr])pipe.on('error',()=>{spawnError=true;terminate();});
  child.on('error',()=>{spawnError=true;terminate();});child.on('exit',()=>{exited=true;});child.on('close',(code,signal)=>{closed=true;finish(code,signal);});
  timerHandles.watchdog=setTimer(()=>{timedOut=true;terminate();},LIMIT.timeoutMs);
 });
}
export async function runControlled({sourceDir,platform=process.platform,inspect=inspectSource,runChild=runNativeChild,persist=()=>{}}){
 const summary={kind:'WINDOWS_STARTUP_CONTROLLED_REPRO',status:'STOPPED',reason:null,pin:{...PIN},limits:{...LIMIT},iterations:[],firstFailure:null,attemptsStarted:0,requestUpperBound:0,observedRequestRows:0};
 const stop=(reason,iteration=null)=>{summary.reason=reason;if(summary.firstFailure===null)summary.firstFailure={reason,iteration};return summary;};
 if(platform!=='win32')return stop('WINDOWS_REQUIRED');
 if(typeof sourceDir!=='string'||!path.isAbsolute(sourceDir))return stop('ABSOLUTE_SOURCE_REQUIRED');
 let source;try{source=await Promise.resolve(inspect(sourceDir));}catch{return stop('SOURCE_INSPECTION_FAILED');}
 summary.source={};for(const key of ['head','tree','testSha256','testRawSha256','distSha256'])if(hex(source?.[key],key==='head'||key==='tree'?40:64))summary.source[key]=source[key];
 const mismatch=sourceVerdict(source);if(mismatch)return stop(mismatch);
 for(let iteration=1;iteration<=LIMIT.iterations;iteration++){
  summary.attemptsStarted++;summary.requestUpperBound+=43;let child;
  try{child=await runChild(sourceDir);}catch{return stop('CHILD_RUNNER_FAILED',iteration);}
  if(!child||!Buffer.isBuffer(child.stdout)||!integer(child.stdoutBytes,0,LIMIT.outputBytes)||!integer(child.stderrBytes,0,LIMIT.outputBytes)||child.stdoutBytes+child.stderrBytes>LIMIT.outputBytes||!hex(child.stdoutSha256,64)||!hex(child.stderrSha256,64)||child.stdoutBytes!==child.stdout.length||child.stdoutSha256!==hash(child.stdout)||['signaled','timedOut','overflow','spawnError','closed','exited','killRequested'].some(key=>typeof child[key]!=='boolean'))return stop('MALFORMED_CHILD_RESULT',iteration);
  const parsed=parseReport(child.stdout),record={iteration,exitCode:integer(child.exitCode,0,255)?child.exitCode:null,signaled:child.signaled===true,stdoutBytes:child.stdoutBytes,stderrBytes:child.stderrBytes,stdoutSha256:child.stdoutSha256,stderrSha256:child.stderrSha256,timedOut:child.timedOut===true,overflow:child.overflow===true,spawnError:child.spawnError===true,closed:child.closed===true,exited:child.exited===true,killRequested:child.killRequested===true,descendantCleanup:'not_independently_observed',report:parsed.report??null};
  const reason=record.timedOut?'CHILD_TIMEOUT':record.overflow?'OUTPUT_LIMIT':record.spawnError?'CHILD_SPAWN_FAILED':record.killRequested?'OWNED_CHILD_TERMINATION_REQUESTED':!record.exited?'CHILD_EXIT_UNCONFIRMED':!record.closed?'CHILD_CLOSE_UNCONFIRMED':record.signaled?'CHILD_SIGNALED':record.exitCode!==0?'CHILD_NONZERO':parsed.reason;
  record.reason=reason;record.reportReason=parsed.reason;summary.iterations.push(record);summary.observedRequestRows+=record.report?.transport?.rows.length??0;
  if(reason)stop(reason,iteration);
  try{await Promise.resolve(persist(record));}catch{if(!reason)stop('EVIDENCE_WRITE_FAILED',iteration);return summary;}
  if(reason)return summary;
 }
 summary.status='NOT_REPRODUCED_WITHIN_BOUND';summary.reason='EIGHT_FRESH_INSTANCES_NO_FAILURE_OBSERVED';return summary;
}
async function main(){
 let sourceDir,evidenceDir;const args=process.argv.slice(2);if(args.length===4&&args[0]==='--source-dir'&&args[2]==='--evidence-dir'){sourceDir=args[1];evidenceDir=args[3];}
 const relative=typeof sourceDir==='string'&&typeof evidenceDir==='string'?path.relative(sourceDir,evidenceDir):'';
 if(!sourceDir||!evidenceDir||!path.isAbsolute(sourceDir)||!path.isAbsolute(evidenceDir)||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)){console.log(JSON.stringify({status:'STOPPED',reason:'EXPLICIT_SEPARATE_ABSOLUTE_DIRECTORIES_REQUIRED'}));process.exitCode=1;return;}
 try{fs.mkdirSync(evidenceDir,{recursive:false});}catch{console.log(JSON.stringify({status:'STOPPED',reason:'NEW_EVIDENCE_DIRECTORY_REQUIRED'}));process.exitCode=1;return;}
 const summary=await runControlled({sourceDir,persist:record=>fs.writeFileSync(path.join(evidenceDir,`iteration-${String(record.iteration).padStart(2,'0')}.json`),JSON.stringify(record,null,2)+'\n',{flag:'wx'})});
 try{fs.writeFileSync(path.join(evidenceDir,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});}catch{summary.status='STOPPED';summary.reason='SUMMARY_WRITE_FAILED';summary.firstFailure??={reason:summary.reason,iteration:null};}
 console.log(JSON.stringify(summary));process.exitCode=summary.status==='NOT_REPRODUCED_WITHIN_BOUND'?0:1;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)try{await main();}catch{console.log(JSON.stringify({status:'STOPPED',reason:'RUNNER_INTERNAL_FAILURE'}));process.exitCode=1;}
