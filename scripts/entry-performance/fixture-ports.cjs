/* Synthetic dependency ports for the actual shipped foreground scheduler.
 * Only this scheduler uses the virtual clock. Existing transport/deadline ports
 * remain untouched; this is not browser or elapsed-time evidence. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function events(target){
 if(typeof target.addEventListener==='function'&&typeof target.removeEventListener==='function'&&typeof target.dispatchEvent==='function')return;
 const listeners=new Map();
 target.addEventListener=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);};
 target.removeEventListener=(type,fn)=>listeners.get(type)?.delete(fn);
 target.dispatchEvent=event=>{const pending=Array.from(listeners.get(event.type)||[]);for(const fn of pending)fn.call(target,event);return true;};
}
module.exports=function installForegroundPorts(context){
 const {window,document}=context;assert(window&&document);events(window);events(document);
 let now=0,sequence=0,focused=true;const timers=new Map();
 document.visibilityState??='visible';document.hasFocus=()=>focused;
 const source=fs.readFileSync(path.resolve(__dirname,'../../public/process/shared-draft-client.js'),'utf8');
 const start=source.indexOf('  window.createForegroundPoll = () => {'),end=source.indexOf('  // Local Begin feedback only:',start);
 assert(start>=0&&end>start,'exact shipped scheduler boundary');
 assert.equal(source.indexOf('  window.createForegroundPoll = () => {',start+1),-1,'unique scheduler');
 const extracted=source.slice(start,end);
 vm.runInNewContext(extracted,{window,document,performance:{now:()=>now},setTimeout(fn,ms){assert.equal(typeof fn,'function');const id=++sequence;timers.set(id,{fn,due:now+ms,delay:ms});return id;},clearTimeout:id=>timers.delete(id)});
 const next=()=>[...timers].sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];
 return {pending:()=>timers.size,nextDelay:()=>next()?.[1].due-now,
  runNext(){const entry=next();assert(entry,'real scheduler must enqueue a timer');timers.delete(entry[0]);now=entry[1].due;return entry[1].fn();},
  focus(value){focused=value;window.dispatchEvent({type:value?'focus':'blur'});},
  visible(value){document.visibilityState=value?'visible':'hidden';document.dispatchEvent({type:'visibilitychange'});}
 };
};
