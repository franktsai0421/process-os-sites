import {AsyncLocalStorage} from 'node:async_hooks';

// Explicit, temporary request opt-in. No account/key/query/body is accepted as a label.
const names=['auth','state','decode','parse','projection','serialize','db.first','db.all','db.run','db.batch','r2.get','r2.head','r2.put','r2.text','r2.arrayBuffer'] as const;
type Name=typeof names[number];
type Span={name:Name;start:number;end:number|null;parent:number;bytes:number};
type Trace={start:number;id:string;spans:Span[];dropped:number;closed:boolean;totals:Partial<Record<Name,{count:number;ms:number}>>;proxies:WeakMap<object,object>;stream:boolean;streamDone:boolean;accepted:boolean;authority:boolean;denied:boolean;route:string;status:number};
const context=new AsyncLocalStorage<{trace:Trace;parent:number}>();
const now=()=>typeof performance==='object'?performance.now():Date.now();
const round=(n:number)=>Math.round(Math.max(0,n)*100)/100;
const routes=new Map([
 ['/api/platform-login','login'],['/api/process-bootstrap','bootstrap'],['/api/shared-state','shared'],
 ['/api/process-authoring/workflow','process'],['/api/master/workflow','master'],
 ['/api/fqc/workflow','fqc'],['/api/routine-equipment/workflow','equipment'],
]);
const maximumSpans=64;

export function timingSpan<T>(name:Name,run:()=>T):T {
 const current=context.getStore();
 if(!current||current.trace.closed)return run();
 const {trace,parent}=current;
 if(!names.includes(name))return run();
 const started=now(),index=trace.spans.length>=maximumSpans?-1:trace.spans.length;
 const total=trace.totals[name]??={count:0,ms:0};total.count++;
 const span:Span={name,start:started-trace.start,end:null,parent,bytes:-1};
 if(index<0)trace.dropped++;else trace.spans.push(span);
 const finish=()=>{span.end=now()-trace.start;total.ms+=Math.max(0,(span.end??span.start)-span.start);};
 try{
  const result=context.run({trace,parent:index},run);
  if(result&&typeof (result as unknown as PromiseLike<unknown>).then==='function')return Promise.resolve(result).then(value=>{finish();return value;},error=>{finish();throw error;}) as T;
  finish();return result;
 }catch(error){finish();throw error;}
}
export const timingParse:typeof JSON.parse=(text,reviver)=>timingSpan('parse',()=>JSON.parse(text,reviver));
export const timingJSON:typeof Response.json=(data,init)=>timingSpan('serialize',()=>Response.json(data,init));

// Proxies exist only inside opted-in requests and preserve native receivers and
// repeated bucket identity (the identity-read token deliberately compares it).
export function timingBinding<T extends object>(binding:T,kind:'db'|'r2'):T {
 const current=context.getStore();if(!current||current.trace.closed||!binding)return binding;
 const {trace}=current,known=trace.proxies.get(binding);if(known)return known as T;
 const wrap=(target:object,category:'db'|'statement'|'r2'|'body'):object=>{
  const cached=trace.proxies.get(target);if(cached)return cached;
  const proxy=new Proxy(target,{get(object,key){
   const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;
   if(category==='db'&&key==='prepare')return (...args:unknown[])=>wrap(Reflect.apply(value,object,args),'statement');
   if(category==='statement'&&key==='bind')return (...args:unknown[])=>wrap(Reflect.apply(value,object,args),'statement');
   const label=category==='statement'?`db.${String(key)}`:category==='body'?`r2.${String(key)}`:`${category}.${String(key)}`;
   if(!names.includes(label as Name))return value.bind(object);
   return (...args:unknown[])=>{
    // D1 batch requires native prepared statements, not diagnostic proxies.
    if(category==='db'&&key==='batch'&&Array.isArray(args[0]))args=[args[0].map(item=>nativeStatements.get(item)||item),...args.slice(1)];
    return timingSpan(label as Name,()=>{
     const active=context.getStore();
     const operation=Reflect.apply(value,object,args);
     return Promise.resolve(operation).then(result=>{
      if(active&&active.parent>=0&&category==='body'&&key==='arrayBuffer'&&result instanceof ArrayBuffer)active.trace.spans[active.parent].bytes=result.byteLength;
      if(category==='r2'&&key==='get'&&result){
       if(active&&active.parent>=0&&Number.isSafeInteger((result as {size?:number}).size))active.trace.spans[active.parent].bytes=(result as {size:number}).size;
       return wrap(result,'body');
      }
      return result;
     });
    });
   };
  }});
  trace.proxies.set(target,proxy);if(category==='statement')nativeStatements.set(proxy,target);
  return proxy;
 };
 return wrap(binding,kind) as T;
}
const nativeStatements=new WeakMap<object,object>();

/** Existing handler alone decides authentication/permissions. Only its successful
 * authorized response may carry timings; no extra DB auth reads or new ACL. */
export function timingEnabled(settings:{PROCESS_NAVIGATION_TIMING?:string;PROCESS_NAVIGATION_TIMING_UNTIL?:string}){
 const until=Date.parse(settings.PROCESS_NAVIGATION_TIMING_UNTIL||'');
 return settings.PROCESS_NAVIGATION_TIMING==='1'&&Number.isFinite(until)&&until>Date.now()&&until-Date.now()<=24*60*60*1000;
}
let windowStart=0,used=0;
function budget(){const at=Date.now();if(at-windowStart>=60_000){windowStart=at;used=0;}return used++<30;}
export async function navigationTiming(request:Request,enabled:boolean,handler:()=>Promise<Response>):Promise<Response>{
 if(!enabled||request.headers.get('X-Process-Timing')!=='1')return handler();
 const path=new URL(request.url).pathname,route=routes.get(path);
 if(!route||(path==='/api/platform-login'?request.method!=='POST':request.method!=='GET'))return handler();
 // Buffer bounded pre-auth spans only; neither publication nor quota is admitted yet.
 const trace:Trace={start:now(),id:crypto.randomUUID(),spans:[],dropped:0,closed:false,totals:{},proxies:new WeakMap(),stream:false,streamDone:false,accepted:false,authority:false,denied:false,route,status:0};
 return context.run({trace,parent:-1},async()=>{
  try{
   const response=await handler();
   const end=now()-trace.start;trace.status=response.status;
   if(response.status!==200||!trace.authority||trace.denied||!budget()){trace.closed=true;return response;}
   trace.accepted=true;
   // Compact bounded numeric intervals; parallel/nested intervals are not sums.
   const totals=Object.entries(trace.totals).map(([name,v],i)=>`t${i};dur=${round(v.ms)};desc="${name}:${v.count}"`);
   const terms=[`pt;dur=${round(end)};desc="v1:${route}:${trace.id}:${trace.dropped}"`,...trace.spans.flatMap((s,i)=>s.end===null?[]:`s${i};dur=${round(s.end-s.start)};desc="${s.name}:${round(s.start)}:${s.parent}:${s.bytes}"`)];
   terms.push(...totals);
   const headers=new Headers(response.headers);headers.set('Server-Timing',terms.join(','));
   headers.set('Cache-Control','no-store');
   if(!trace.stream||trace.streamDone)finishTrace(trace,trace.stream?'complete':'response');
   return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }catch(error){trace.closed=true;throw error;}
 });
}
// Called only with the existing handler's verified result; no request headers,
// independent auth cache, extra identity reads, or new authorization mechanism.
// Any failed/restricted check in the request permanently suppresses its trace.
export function timingAuthority(actor:{role?:string;sessionType?:string;authMode?:string}|null){
 const current=context.getStore();if(!current)return;
 const allowed=!!actor&&actor.role==='admin'&&actor.sessionType!=='demo'&&actor.authMode!=='demo';
 current.trace.authority=allowed;if(!allowed)current.trace.denied=true;
}

function finishTrace(trace:Trace,outcome:'response'|'complete'|'cancelled'|'error'){
 if(trace.closed)return;trace.streamDone=true;if(!trace.accepted)return;
 trace.closed=true;
 // Non-streamed requests already deliver all measured spans in the response.
 // Avoid a duplicate log serialization/write on their critical path.
 if(outcome==='response')return;
 // One bounded record in existing Worker logs, never a third-party destination.
 // Server-Timing ends at response construction; stream completion is correlated
 // by this random ID without buffering or reading the response a second time.
 try{console.info(JSON.stringify({kind:'process-navigation-timing-v1',id:trace.id,route:trace.route,status:trace.status,outcome,ms:round(now()-trace.start),dropped:trace.dropped,totals:Object.fromEntries(Object.entries(trace.totals).map(([name,v])=>[name,{count:v.count,ms:round(v.ms)}])),spans:trace.spans.map((s,i)=>({i,name:s.name,start:round(s.start),end:s.end!==null?round(s.end):null,parent:s.parent,bytes:s.bytes}))}));}catch{/* Diagnostic sink failure never changes the response. */}
}
export function timingStream(){
 const current=context.getStore();if(!current)return null;
 const {trace}=current;trace.stream=true;
 return {run<T>(fn:()=>T):T{if(now()-trace.start>120_000){trace.closed=true;return fn();}return context.run(current,fn);},done(outcome:'complete'|'cancelled'|'error'){finishTrace(trace,outcome);}};
}
