import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('public/process/shared-draft-client.js','utf8');const fragment=source.slice(source.indexOf('  window.createForegroundPoll ='),source.indexOf('  // Local Begin feedback only:'));
const drain=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
export function fixture(){let now=0,id=0,focused=true;const timers=new Map(),listeners=new Map(),errors=[];const eventTarget=kind=>({addEventListener(event,fn){const k=kind+event;if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},removeEventListener(event,fn){listeners.get(kind+event)?.delete(fn);}});const document={...eventTarget('d'),visibilityState:'visible',hasFocus:()=>focused},window={...eventTarget('w')};vm.runInNewContext(fragment,{window,document,performance:{now:()=>now},setTimeout(fn,delay){timers.set(++id,{at:now+delay,fn});return id;},clearTimeout:id=>timers.delete(id)});
 return{create:()=>window.createForegroundPoll(),window,document,errors,get now(){return now;},get timers(){return timers.size;},get listeners(){return [...listeners.values()].reduce((n,s)=>n+s.size,0);},focus(value){focused=value;for(const fn of listeners.get('w'+(value?'focus':'blur'))||[])fn();},visible(value){document.visibilityState=value?'visible':'hidden';for(const fn of listeners.get('dvisibilitychange')||[])fn();},async tick(ms){const end=now+ms;await drain();for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);Promise.resolve(next[1].fn()).catch(e=>errors.push(e));await drain();}now=end;await drain();}};
}
const f=fixture(),p=f.create();let calls=0;
for(let i=0;i<100;i++)p.schedule(()=>{calls++;});
assert.equal(f.timers,0);assert.equal(f.listeners,0);
for(const focus of [false,true]){f.focus(focus);f.visible(focus);await f.tick(300000);}
assert.equal(calls,0);assert.equal(f.timers,0);assert.equal(f.listeners,0);
const owner=p.capture();assert.equal(p.isCurrent(owner),true);p.cancel();assert.equal(p.isCurrent(owner),false);
const next=p.capture();p.dispose();assert.equal(p.isCurrent(next),false);p.schedule(()=>{calls++;});await f.tick(300000);assert.equal(calls,0);
assert.doesNotMatch(fragment,/setTimeout|setInterval|addEventListener/);
console.log(JSON.stringify({status:'PASS_RETIRED_SCHEDULER',idleNetwork:false,timers:0,listeners:0,callbacks:0}));
