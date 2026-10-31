// Diagnostic profiling only: one real compiled smoke per version, never used
// as another formal timing batch. Raw traces stay in the ignored runtime tree.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createProcessPlatformRound5Fixture} from './process-platform-round5-fixture.mjs';
import {runProcessPlatformRound5} from './process-platform-round5-scenario.mjs';

const folder=path.resolve(process.env.PROFILE_FOLDER||'.sites-runtime/process-platform-round5/profile-500');
assert(folder.startsWith(path.resolve('.sites-runtime')+path.sep),'Raw traces must remain under ignored .sites-runtime');
fs.mkdirSync(folder,{recursive:true});
const builds={baseline:process.env.PERF_BASELINE_BUILD||'/workspace/process-platform-round5-before/dist',candidate:path.resolve(process.env.PERF_CANDIDATE_BUILD||'dist')};
const variants=(process.env.PROFILE_VARIANTS||'baseline,candidate').split(',');
assert(variants.length>0&&variants.every(value=>Object.hasOwn(builds,value)));
process.env.ROUND5_PURPOSE='profiling-only-not-formal-speed';
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rounded=value=>Math.round(value*1000)/1000;
const short=value=>typeof value==='string'?Array.from(value,char=>char.codePointAt(0)<=31?' ':char).join('').slice(0,200):'';
function safeURL(value){
 if(typeof value!=='string'||!value)return '';
 if(value.startsWith('data:'))return 'data:[omitted]';
 if(value.startsWith('pptr:')||value.includes('__playwright'))return 'playwright-evaluation';
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.pathname:url.protocol==='file:'?url.pathname:'['+url.protocol+']';}
 catch{return /^[\w./: -]{1,200}$/.test(value)?value:'[non-url source]';}
}
const report={status:'RUNNING',purpose:'Profiling only; instrumentation changes timings. No formal speed comparison or single-operation causal claim.',data:{ipqcItemsPerSource:500,aCanvasNodes:15,cCanvasNodes:1,synthetic:true},conditions:{network:'loopback; external requests blocked by unchanged scenario',cache:'new contexts with routing; Worker dispatch warmed by GET /login only',runs:'one smoke per requested version, sequential; no extra formal timing batch',trace:'browser-wide DevTools timeline and V8 sampling; all renderer main threads reported separately',privacy:'Summary is allowlisted; complete raw *.trace.json stays local/ignored and must not enter handoff.'},limitations:['The existing scenario keeps exact operation timestamps in a private closure. This profiler reports whole-smoke aggregates, not exact operation windows.','Timeline durations are wall spans; nested event categories cannot be added together or called exclusive CPU time.','Automation-call elapsed time includes actionability checks, polling, protocol waits and browser work; it is not a direct measure of scheduler delay.','Renderer work includes profiling/evaluation overhead. Worker/server CPU and OS scheduling are not captured.','Resource and long-task entries use each document clock. No unsupported subtraction or clock alignment with Node or trace is performed.','One diagnostic run per build cannot explain a historical outlier or establish a regression rate.'],runs:[]};
const reportFile=path.join(folder,'profile-summary.json'),persist=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2));

function installObserver(){
 const cap=20000,record={id:crypto.randomUUID(),timeOrigin:performance.timeOrigin,longTasks:[],droppedLongTasks:0,resourceBufferFull:0,observerAvailable:PerformanceObserver.supportedEntryTypes?.includes('longtask')===true};
 performance.setResourceTimingBufferSize(cap);
 performance.addEventListener('resourcetimingbufferfull',()=>record.resourceBufferFull++);
 let observer;
 const append=entries=>{for(const entry of entries){if(record.longTasks.length>=cap){record.droppedLongTasks++;continue;}record.longTasks.push({startTime:entry.startTime,duration:entry.duration,name:entry.name,attribution:Array.from(entry.attribution||[],item=>({name:item.name,containerType:item.containerType,containerName:item.containerName,containerId:item.containerId,containerSrc:item.containerSrc}))});}};
 if(record.observerAvailable){observer=new PerformanceObserver(list=>append(list.getEntries()));observer.observe({type:'longtask',buffered:true});}
 Object.defineProperty(globalThis,'__round5ProfileDump',{value:()=>{
  if(observer)append(observer.takeRecords());
  return {...record,url:location.href,observedUntil:performance.now(),navigation:performance.getEntriesByType('navigation').map(item=>item.toJSON()),resources:performance.getEntriesByType('resource').map(item=>item.toJSON())};
 }});
}

function summarizeDocument(raw,reason){
 return {id:raw.id,reason,url:safeURL(raw.url),timeOrigin:raw.timeOrigin,observedUntilMs:rounded(raw.observedUntil),observerAvailable:raw.observerAvailable,droppedLongTasks:raw.droppedLongTasks,resourceBufferFull:raw.resourceBufferFull,
  longTasks:raw.longTasks.map(item=>({name:short(item.name),startMs:rounded(item.startTime),durationMs:rounded(item.duration),attribution:item.attribution.map(frame=>({name:short(frame.name),containerType:short(frame.containerType),sourceURL:safeURL(frame.containerSrc)}))})),
  navigation:raw.navigation.map(item=>({type:item.type,url:safeURL(item.name),durationMs:rounded(item.duration),domInteractiveMs:rounded(item.domInteractive),domContentLoadedMs:rounded(item.domContentLoadedEventEnd),loadEventEndMs:rounded(item.loadEventEnd),responseEndMs:rounded(item.responseEnd),transferSize:item.transferSize})),
  resources:raw.resources.map(item=>({sourceURL:safeURL(item.name),initiatorType:short(item.initiatorType),startMs:rounded(item.startTime),durationMs:rounded(item.duration),requestStartMs:rounded(item.requestStart),responseStartMs:rounded(item.responseStart),responseEndMs:rounded(item.responseEnd),transferSize:item.transferSize,encodedBodySize:item.encodedBodySize,decodedBodySize:item.decodedBodySize}))};
}

function sourceOf(event){
 const data=event.args?.data||event.args?.beginData||{},stack=data.stackTrace||event.args?.stackTrace||[];
 return {functionName:short(data.functionName),sourceURL:safeURL(data.url||data.scriptName),scriptId:short(String(data.scriptId??'')),lineNumber:Number.isInteger(data.lineNumber)?data.lineNumber:null,columnNumber:Number.isInteger(data.columnNumber)?data.columnNumber:null,stack:Array.isArray(stack)?stack.slice(0,8).map(frame=>({functionName:short(frame.functionName),sourceURL:safeURL(frame.url||frame.scriptName),lineNumber:Number.isInteger(frame.lineNumber)?frame.lineNumber:null,columnNumber:Number.isInteger(frame.columnNumber)?frame.columnNumber:null})):[]};
}
function unionMicroseconds(events){
 const spans=events.map(event=>[event.ts,event.ts+event.dur]).sort((a,b)=>a[0]-b[0]);let total=0,end=-Infinity,start=0;
 for(const span of spans){if(span[0]>end){if(end!==-Infinity)total+=end-start;[start,end]=span;}else end=Math.max(end,span[1]);}
 return total+(end===-Infinity?0:end-start);
}
function categoryStats(events){
 let sum=0,max=0,threadUs=0,threadCount=0;for(const event of events){sum+=event.dur;max=Math.max(max,event.dur);if(Number.isFinite(event.tdur)){threadUs+=event.tdur;threadCount++;}}
 return {count:events.length,rawInclusiveSumMs:rounded(sum/1000),intervalUnionMs:rounded(unionMicroseconds(events)/1000),maxMs:rounded(max/1000),threadDurationWhenProvidedMs:threadCount?rounded(threadUs/1000):null,eventsWithThreadDuration:threadCount};
}
function summarizeTrace(trace,traceMeta){
 const events=Array.isArray(trace)?trace:trace.traceEvents;assert(Array.isArray(events),'Trace has no traceEvents array');
 const names=new Map();for(const event of events)if(event.ph==='M'&&event.name==='thread_name')names.set(event.pid+':'+event.tid,event.args?.name);
 const mainThreads=[...names].filter(([,name])=>name==='CrRendererMain'||name==='RendererMain');
 const allowed=new Set(mainThreads.map(([key])=>key)),durations=[],brackets=new Map();let unmatchedEnd=0,unmatchedBegin=0;
 for(const event of events){const key=event.pid+':'+event.tid;if(!allowed.has(key))continue;
  if(event.ph==='X'&&Number.isFinite(event.ts)&&Number.isFinite(event.dur)&&event.dur>=0)durations.push(event);
  else if(event.ph==='B'||event.ph==='E'){if(!brackets.has(key))brackets.set(key,[]);brackets.get(key).push(event);}
 }
 for(const entries of brackets.values()){const stack=[];for(const event of entries.sort((a,b)=>a.ts-b.ts)){if(event.ph==='B')stack.push(event);else{const start=stack.pop();if(start&&Number.isFinite(event.ts)&&event.ts>=start.ts)durations.push({...start,ph:'X',dur:event.ts-start.ts,args:start.args});else unmatchedEnd++;}}unmatchedBegin+=stack.length;}
 const groups={ParseHTML:['ParseHTML'],EvaluateScript:['EvaluateScript'],FunctionCall:['FunctionCall'],Layout:['Layout'],RecalcStyle:['UpdateLayoutTree','RecalculateStyles','RecalcStyle'],V8Compile:['CompileScript','V8.CompileCode','v8.compile'],GarbageCollection:['MajorGC','MinorGC','V8.GCScavenger','V8.GCCompactor']};
 const threads=mainThreads.map(([key,name])=>{
  const rows=durations.filter(event=>event.pid+':'+event.tid===key),runs=rows.filter(event=>event.name==='RunTask'||event.name.endsWith('::RunTask')),tasks=runs.length?runs:rows.filter(event=>event.name==='ThreadControllerImpl::DoWork');
  const unique=[];for(const task of [...tasks].sort((a,b)=>b.dur-a.dur)){if(!unique.some(outer=>task.ts>=outer.ts&&task.ts+task.dur<=outer.ts+outer.dur))unique.push(task);if(unique.length>=20)break;}
  const largestTasks=unique.map(task=>({eventName:task.name,startTraceUs:task.ts,durationMs:rounded(task.dur/1000),threadDurationMs:Number.isFinite(task.tdur)?rounded(task.tdur/1000):null,
   associatedNestedSources:rows.filter(event=>['FunctionCall','EvaluateScript','ParseHTML','Layout','UpdateLayoutTree','RecalculateStyles'].includes(event.name)&&event.ts>=task.ts&&event.ts+event.dur<=task.ts+task.dur).sort((a,b)=>b.dur-a.dur).slice(0,12).map(event=>({eventName:event.name,durationMs:rounded(event.dur/1000),...sourceOf(event)}))}));
  return {thread:key,name,role:rows.some(event=>String(event.args?.data?.url||event.args?.data?.scriptName||event.args?.beginData?.url||'').includes('/process/'))?'application-process-route':'other-renderer-no-process-source-observed',eventCount:rows.length,categories:Object.fromEntries(Object.entries(groups).map(([name,eventNames])=>[name,{eventNames,...categoryStats(rows.filter(event=>eventNames.includes(event.name)))}])),runTask:{kind:runs.length?'RunTask':'DoWork envelope fallback, not individual task',...categoryStats(tasks)},largestTasks,largestScriptEvents:rows.filter(event=>['FunctionCall','EvaluateScript'].includes(event.name)).sort((a,b)=>b.dur-a.dur).slice(0,30).map(event=>({eventName:event.name,startTraceUs:event.ts,durationMs:rounded(event.dur/1000),...sourceOf(event)}))};
 });
 // V8 CPU samples are kept separate from timeline spans. IDs are scoped to
 // their renderer thread/profile, and missing sample deltas are not invented.
 const profiles=new Map();let chunks=0,missingProfileId=0,unmatchedProfileChunks=0;
 // Profile starts identify the profiled main thread. Chrome emits its chunks
 // on v8:ProfEvntProc, so join by process/profile ID, not chunk thread ID.
 for(const event of events){if(event.name!=='Profile'||!allowed.has(event.pid+':'+event.tid))continue;const id=event.id??event.id2?.local??event.id2?.global;if(id===undefined){missingProfileId++;continue;}const key=event.pid+':'+String(id);profiles.set(key,{key,ownerThread:event.pid+':'+event.tid,nodes:new Map(),samples:[],missingDeltas:0});}
 for(const event of events){if(event.name!=='ProfileChunk')continue;
  const id=event.id??event.id2?.local??event.id2?.global;if(id===undefined){missingProfileId++;continue;}const profile=profiles.get(event.pid+':'+String(id));if(!profile){unmatchedProfileChunks++;continue;}const data=event.args?.data||{},cpu=data.cpuProfile||{};
  for(const node of cpu.nodes||[])profile.nodes.set(node.id,node);
  chunks++;const samples=cpu.samples||[],deltas=data.timeDeltas||cpu.timeDeltas||[];for(let i=0;i<samples.length;i++){const delta=deltas[i];profile.samples.push({id:samples[i],delta:Number.isFinite(delta)&&delta>=0?delta:null});if(!Number.isFinite(delta)||delta<0)profile.missingDeltas++;}
 }
 const cpuProfiles=[...profiles.values()].map(profile=>{
  const totals=new Map();for(const sample of profile.samples){if(!totals.has(sample.id))totals.set(sample.id,{count:0,delta:0,knownDelta:0});const sum=totals.get(sample.id);sum.count++;if(sample.delta!==null){sum.delta+=sample.delta;sum.knownDelta++;}}
  return {profile:profile.key,ownerThread:profile.ownerThread,samples:profile.samples.length,missingDeltas:profile.missingDeltas,topSampledFrames:[...totals].sort((a,b)=>b[1].count-a[1].count).slice(0,30).map(([id,sum])=>{const node=profile.nodes.get(id),frame=node?.callFrame||{};return{nodeId:id,sampleCount:sum.count,sampledIntervalEstimateMs:sum.knownDelta?rounded(sum.delta/1000):null,samplesWithDelta:sum.knownDelta,functionName:short(frame.functionName)||'(anonymous or unavailable)',sourceURL:safeURL(frame.url),lineNumber:Number.isInteger(frame.lineNumber)?frame.lineNumber:null,columnNumber:Number.isInteger(frame.columnNumber)?frame.columnNumber:null,parentNodeId:node?.parent??null};})};
 });
 return {status:traceMeta.dataLossOccurred||!mainThreads.length?'INCOMPLETE':'CAPTURED',dataLossOccurred:traceMeta.dataLossOccurred===true,totalTraceEvents:events.length,rendererMainThreads:mainThreads.length,unmatchedBegin,unmatchedEnd,interpretation:'Each category is inclusive wall time; use union to avoid within-category overlap. Do not add different categories or different renderer threads as E2E/CPU. Nested sources are associated, not exclusive causal attribution. Source line/column numbers are raw zero-based values when supplied.',threads,cpuSampling:{profileChunks:chunks,missingProfileId,unmatchedProfileChunks,profiles:cpuProfiles,interpretation:'Statistical samples, with known inter-sample deltas only; not precise CPU accounting. Empty results mean unsupported/unavailable trace sampling schema, not zero CPU.'}};
}

async function stopTrace(session,filename){
 let timer,onComplete;const complete=new Promise((resolve,reject)=>{onComplete=resolve;session.once('Tracing.tracingComplete',onComplete);timer=setTimeout(()=>reject(Error('Timed out waiting for Tracing.tracingComplete')),30000);});
 let event;try{await session.send('Tracing.end');event=await complete;}finally{clearTimeout(timer);session.off('Tracing.tracingComplete',onComplete);}
 assert(event.stream,'Trace stream missing');const fd=fs.openSync(filename,'w');let bytes=0;
 try{for(;;){const chunk=await session.send('IO.read',{handle:event.stream,size:1024*1024}),buffer=Buffer.from(chunk.data,chunk.base64Encoded?'base64':'utf8');fs.writeSync(fd,buffer);bytes+=buffer.length;if(chunk.eof)break;}}
 finally{fs.closeSync(fd);await session.send('IO.close',{handle:event.stream});}
 return {dataLossOccurred:event.dataLossOccurred===true,bytes};
}

async function profiledBrowser(browser,variant){
 const session=await browser.newBrowserCDPSession(),documents=new Map(),automationCalls=[],captureErrors=[];let contextCount=0,closed=false,traceMeta;
 const rawFile=path.join(folder,variant+'.trace.json');
 await session.send('Tracing.start',{transferMode:'ReturnAsStream',streamFormat:'json',options:'record-as-much-as-possible,enable-sampling',categories:['-*','devtools.timeline','v8.execute','disabled-by-default-devtools.timeline','disabled-by-default-devtools.timeline.frame','toplevel','blink.console','blink.user_timing','latencyInfo','disabled-by-default-devtools.timeline.stack','disabled-by-default-v8.cpu_profiler'].join(',')});
 async function capture(page,reason){if(page.isClosed())return;try{const raw=await page.evaluate(()=>globalThis.__round5ProfileDump?.());if(raw)documents.set(raw.id,summarizeDocument(raw,reason));}catch(error){captureErrors.push({stage:'document-snapshot',reason,errorName:error.name});}}
 async function record(method,selector,invoke){const start=performance.now();let failed=false;try{return await invoke();}catch(error){failed=true;throw error;}finally{automationCalls.push({method,selector:short(selector),elapsedMs:rounded(performance.now()-start),failed});}}
 function locatorProxy(locator,selector){return new Proxy(locator,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;
  if(['locator','first','last','nth','filter','getByRole','getByText','getByLabel'].includes(key))return(...args)=>locatorProxy(value.apply(target,args),selector+(key==='locator'?' '+short(args[0]):'.'+key));
  if(key==='all')return async(...args)=>(await value.apply(target,args)).map(item=>locatorProxy(item,selector+'.all'));
  if(['click','check','uncheck','selectOption','press','focus','fill','waitFor','scrollIntoViewIfNeeded','evaluate'].includes(key))return(...args)=>record('locator.'+key,selector,()=>value.apply(target,args));
  return value.bind(target);
 }});}
 function pageProxy(page){return new Proxy(page,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;
  if(key==='locator')return(selector,...args)=>locatorProxy(value.call(target,selector,...args),selector);
  if(key==='goto'||key==='reload')return async(...args)=>{await capture(target,'before-'+key);return record('page.'+key,'',()=>value.apply(target,args));};
  if(['waitForFunction','evaluate','waitForTimeout','screenshot'].includes(key))return(...args)=>record('page.'+key,'',()=>value.apply(target,args));
  return value.bind(target);
 }});}
 async function finish(){if(closed)return;closed=true;try{traceMeta=await stopTrace(session,rawFile);}finally{await session.detach();}}
 const wrapper=new Proxy(browser,{get(target,key){const value=Reflect.get(target,key,target);if(key==='newContext')return async(...args)=>{
  assert.equal(++contextCount,1,'This aggregate profiler supports one-context smoke only');const context=await target.newContext(...args);await context.addInitScript(installObserver);
  return new Proxy(context,{get(actual,name){const method=Reflect.get(actual,name,actual);if(name==='newPage')return async(...parameters)=>pageProxy(await actual.newPage(...parameters));
   if(name==='close')return async(...parameters)=>{for(const page of actual.pages())await capture(page,'before-context-close');try{await finish();}finally{await actual.close(...parameters);}};
   return typeof method==='function'?method.bind(actual):method;
  }});
 };return typeof value==='function'?value.bind(target):value;}});
 return {browser:wrapper,finish,summary(){
  const trace=JSON.parse(fs.readFileSync(rawFile,'utf8')),analysis=summarizeTrace(trace,traceMeta),methods=new Map();
  for(const call of automationCalls){if(!methods.has(call.method))methods.set(call.method,[]);methods.get(call.method).push(call.elapsedMs);}
  return {trace:{file:path.basename(rawFile),sha256:sha(rawFile),bytes:traceMeta.bytes,handoff:'Exclude raw trace; allowlisted summary only'},analysis,documents:[...documents.values()],captureErrors,automation:{clock:'Node elapsed time; not aligned to trace/document clocks',byMethod:[...methods].map(([method,values])=>({method,count:values.length,totalElapsedMs:rounded(values.reduce((a,b)=>a+b,0)),maxElapsedMs:Math.max(...values)})),slowestCalls:[...automationCalls].sort((a,b)=>b.elapsedMs-a.elapsedMs).slice(0,40)}};
 }};
}

if(process.env.PROFILE_REANALYZE_ONLY==='1'){
 const saved=JSON.parse(fs.readFileSync(reportFile,'utf8'));for(const row of saved.runs){row.analysis=summarizeTrace(JSON.parse(fs.readFileSync(path.join(folder,path.basename(row.trace.file)),'utf8')),{dataLossOccurred:row.analysis.dataLossOccurred});}delete saved.error;fs.writeFileSync(reportFile,JSON.stringify(saved,null,2));console.log(JSON.stringify({status:'REANALYZED',runs:saved.runs.length}));
}else{
let browser;const fixtures=new Map();
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-background-networking']});report.browser=browser.version();
 for(const variant of variants){process.env.PROCESS_TEST_BUILD_DIR=builds[variant];const fixture=await createProcessPlatformRound5Fixture({ipqcItems:500,canvasNodes:15});fixtures.set(variant,fixture);}
 if(variants.length===2)assert.equal(fixtures.get(variants[0]).fixtureHash,fixtures.get(variants[1]).fixtureHash);
 for(const variant of variants){
  const fixture=fixtures.get(variant);await fixture.reset();const warm=await fetch(new URL('/login',fixture.url));assert.equal(warm.status,200);await warm.arrayBuffer();
  const profiler=await profiledBrowser(browser,variant);let result;
  try{result=await runProcessPlatformRound5({fixture,browser:profiler.browser,round:1,variant,folder,smoke:true});}finally{await profiler.finish();}
  const row={variant,buildDirectory:builds[variant],buildEntrySha256:fixture.buildEntrySha256,fixtureHash:fixture.fixtureHash,counts:fixture.counts,scenarioStatus:result.status,scenarioFile:variant+'-1.json',...profiler.summary()};report.runs.push(row);persist();
  assert.equal(result.status,'PASS','Profile smoke failed: '+result.error);console.log(JSON.stringify({variant,status:result.status,traceStatus:row.analysis.status,rendererMainThreads:row.analysis.rendererMainThreads,documents:row.documents.length}));
 }
 report.status=report.runs.every(row=>row.analysis.status==='CAPTURED')?'PROFILED':'PROFILED_WITH_INCOMPLETE_TRACE';
}catch(error){report.status='FAIL';report.errorName=error.name;report.failureStage='Profile capture or scenario; inspect local raw scenario evidence. Arbitrary error messages are excluded from this allowlisted summary.';process.exitCode=1;}
finally{await browser?.close();for(const fixture of fixtures.values())await fixture.close();persist();}

}
