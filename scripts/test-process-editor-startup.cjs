/* oxlint-disable typescript/no-require-imports -- isolated Node VM regression harness. */
/* Run production startup code with delayed reads; no service or data writes. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||'public/process/process-authoring-v3.js','utf8');
const tick=()=>new Promise(setImmediate),defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness(){
 const read=defer(),issues=defer(),archive=defer(),timers=new Map(),events=[];let enabled=false,seq=0,reads=0,archives=0;
 const server={versions:[{status:'draft'}],workflow:{generation:'g',revision:1,working:{workspaces:[{id:'w',category:'TEST',line:'A',stages:{A:[{id:'one',x:10,y:20}]}}]}}};
 const client={read:()=>{reads++;return read.promise;},contentIssues:()=>{events.push('advisory');return issues.promise;},legacyHistory:()=>{archives++;return archive.promise;}};
 const c={structuredClone,console,JSON,Error,setInterval(){},setTimeout:f=>{timers.set(++seq,f);return seq;},clearTimeout:id=>timers.delete(id),localStorage:{getItem:()=>enabled?'enabled':null},state:{view:'editor',category:'TEST',editorLine:'A',editorByCategory:{}},document:{documentElement:{lang:'zh'},addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({dataset:{}})},bindView(){},renderInspector(){},render(){events.push('render');},toast(){events.push('error');},editorKey:()=> 'TEST:A',createMasterSharedBridge:()=>({diff(){}}),createSharedDraftClient:()=>client,ProcessSync:{identity:{id:'admin'}}};c.window=c;vm.createContext(c);vm.runInContext(source,c);enabled=true;
 return {c,read,issues,archive,server,events,timers,reads:()=>reads,archives:()=>archives,answer:()=>read.resolve({control:structuredClone(server),permissions:{edit:true,history:true}})};
}
(async()=>{
 const checks=[],h=harness(),start=performance.now();let settled=false;
 const pending=h.c.ProcessAuthoringV3.load().then(()=>{settled=true;});h.answer();await tick();
 assert.equal(settled,true,'canvas load must not wait for unresolved advisory/history');await pending;assert.ok(h.events.includes('render'));assert.equal(h.archives(),1);checks.push('authoritative canvas renders and load settles before advisory/history');
 await h.c.ProcessAuthoringV3.load();assert.equal(h.archives(),1);checks.push('archive requests deduplicated while pending');
 for(const f of h.timers.values())f();h.timers.clear();h.issues.reject(Error('advisory offline'));h.archive.reject(Error('history offline'));await tick();assert.equal(h.c.ProcessAuthoringV3.flow().revision,1);assert.equal(h.c.ProcessAuthoringV3.canMutate(),true);checks.push('advisory/history failures preserve loaded canvas and edit permission');
 const before=h.events.filter(x=>x==='render').length;await h.c.ProcessAuthoringV3.readyForEditor();assert.equal(h.events.filter(x=>x==='render').length,before+1);checks.push('bootstrap handoff rerenders after final editor registration even at unchanged revision');
 const stale=harness(),old=stale.c.ProcessAuthoringV3.load();stale.c.ProcessSync.identity.id='different-user';stale.answer();await old;assert.equal(stale.c.ProcessAuthoringV3.flow(),undefined);checks.push('late previous-account response is not adopted');
 const failed=harness(),ready=failed.c.ProcessAuthoringV3.readyForEditor();failed.read.reject(Error('FORBIDDEN'));await assert.rejects(ready,/FORBIDDEN/);checks.push('failed essential read rejects boot instead of showing empty editable canvas');
 const events=[],gate=defer(),root={dataset:{},removeAttribute:()=>events.push('reveal')};
 const b={window:{ProcessSync:{ready:Promise.resolve()},ProcessAuthoringV3:{readyForEditor:()=>gate.promise}},performance,document:{documentElement:root,querySelectorAll:()=>[{dataset:{processSrc:'editor.js'},replaceWith:s=>{events.push('script');s.onload();}}],createElement:()=>({}),head:{append(){}},querySelector:()=>({remove:()=>events.push('removeBoot')})}};
 vm.runInNewContext(fs.readFileSync('public/process/bootstrap.js','utf8'),b);await tick();assert.deepEqual(events,['script']);gate.resolve();await tick();assert.deepEqual(events,['script','removeBoot','reveal']);assert.ok(Number.isFinite(root.dataset.processReadyMs));checks.push('boot reveals only after scripts and authoritative editor readiness');
 console.log(JSON.stringify({result:'PASS',checks,syntheticHarnessMs:Math.round(performance.now()-start),timingNote:'harness time, not browser/network latency'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
