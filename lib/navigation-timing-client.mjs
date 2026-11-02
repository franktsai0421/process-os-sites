/* Explicit opt-in, same-tab, ten minutes; fixed vocabulary, no business bodies. */
export function navigationTimingClient(){
 'use strict';
 const key='process-navigation-timing-v1',dataKey=key+'-rows',limit=240;
 let config;try{config=JSON.parse(sessionStorage.getItem(key)||'null');}catch{return;}
 const enabled=!!config&&config.until>Date.now()&&config.until-Date.now()<=600000;
 if(!enabled&&location.pathname!=='/navigation-timing'||window.ProcessNavigationTiming)return;
 if(!config)try{const old=JSON.parse(sessionStorage.getItem(dataKey)||'null');config={until:Number(old?.until)||0};}catch{config={until:0};}
 const doc=crypto.randomUUID(),origin=performance.timeOrigin,rows=[],maxRequests=60;
 let requests=0,cleared=false,stopped=!enabled,observer=null,timer=null,badgeNode=null,actionStart=origin;
 const routeNames=new Set(['login','bootstrap','process','master','fqc','equipment','shared','shell','asset','collector','other']);
 const spanNames=new Set(['auth','state','decode','parse','projection','serialize','db.first','db.all','db.run','db.batch','r2.get','r2.head','r2.put','r2.text','r2.arrayBuffer']);
 const route=raw=>{try{const u=new URL(raw,location.href);if(u.origin!==location.origin)return null;return ({'/process/navigation-diagnostics.js':'collector','/api/platform-login':'login','/api/process-bootstrap':'bootstrap','/api/process-authoring/workflow':'process','/api/master/workflow':'master','/api/fqc/workflow':'fqc','/api/routine-equipment/workflow':'equipment','/api/shared-state':'shared','/login':'login','/process/':'shell','/process/index.html':'shell'})[u.pathname]||(u.pathname.startsWith('/process/')||u.pathname.startsWith('/assets/')?'asset':'other');}catch{return null;}};
 const resourceId=entry=>{const root=entry.serverTiming?.find(t=>t.name==='pt'),match=root&&/^v1:[a-z]+:([a-f0-9-]{36}):\d+$/.exec(root.description);return match?{requestId:match[1]}:{};};
 const n=value=>Number.isFinite(Number(value))?Math.round(Math.max(0,Number(value))*100)/100:null;
 const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value)?value:null;
 const active=()=>!stopped&&Date.now()<config.until;
 const clean=value=>{
  if(!value||!['click','submit','request','response','resource','ready','paint','mark','stop','start'].includes(value.kind)||!routeNames.has(value.route))return null;
  const row={kind:value.kind,route:value.route,doc:uuid(value.doc),at:n(value.at)};
  if(!row.doc||row.at===null)return null;
  for(const k of ['start','end','status','transfer','encoded','decoded','shared','assets','ready','generation','sequence','serverMs','dropped','dns','connect','tls','ttfb','download','fetchStart','requestStart','responseStart'])if(value[k]!==undefined)row[k]=n(value[k]);
  if(['GET','POST'].includes(value.method))row.method=value.method;
  if(uuid(value.requestId))row.requestId=value.requestId;
  if(Array.isArray(value.totals))row.totals=value.totals.slice(0,15).filter(t=>spanNames.has(t.name)).map(t=>({name:t.name,count:n(t.count),ms:n(t.ms)}));
  if(Array.isArray(value.spans))row.spans=value.spans.slice(0,64).filter(s=>spanNames.has(s.name)&&Number.isInteger(s.i)&&Number.isInteger(s.parent)&&s.parent>=-1).map(s=>({i:s.i,name:s.name,start:n(s.start),ms:n(s.ms),parent:s.parent,bytes:s.bytes===-1?-1:n(s.bytes)}));
  return row;
 };
 let prior=[];try{const v=JSON.parse(sessionStorage.getItem(dataKey)||'null');if(v?.until===config.until&&Array.isArray(v.rows))prior=v.rows.slice(-limit).map(clean).filter(Boolean);}catch{}
 if(Date.now()>config.until+1200000){prior=[];try{sessionStorage.removeItem(dataKey);}catch{}}
 rows.push(...prior);
 const previous=prior.findLast(r=>['click','submit'].includes(r.kind));if(previous&&origin-previous.at<30000&&origin>=previous.at)actionStart=previous.at;
 const save=()=>{if(cleared)return;try{sessionStorage.setItem(dataKey,JSON.stringify({until:config.until,rows:rows.slice(-limit)}));}catch{}};
 const clearRows=()=>{cleared=true;rows.length=0;prior.length=0;try{sessionStorage.removeItem(key);sessionStorage.removeItem(dataKey);}catch{}};
 const snapshot=()=>({version:1,until:config.until,rows:rows.map(clean).filter(Boolean)});
 // The inactive diagnostics page reads prior summaries only: no fetch wrapper,
 // observer, event listeners, timer or badge. Stop remains safe to repeat.
 if(!enabled){const stop=()=>{try{sessionStorage.removeItem(key);}catch{}};window.ProcessNavigationTiming={snapshot,stop,clear(){stop();clearRows();}};return;}
 const add=(kind,name,fields={})=>{if(!active())return;const value=clean({kind,route:name,doc,at:origin+performance.now(),...fields});if(value){rows.push(value);if(rows.length>limit)rows.shift();}};
 const timings=header=>{
  const result={};if(typeof header!=='string'||header.length>16000)return result;
  const root=/pt;dur=([\d.]+);desc="v1:(\w+):([a-f0-9-]{36}):(\d+)"/.exec(header);
  if(!root||!routeNames.has(root[2])||!uuid(root[3]))return result;
  result.serverMs=n(root[1]);result.requestId=root[3];result.dropped=Number(root[4]);result.spans=[];result.totals=[];
  for(const match of header.matchAll(/t\d+;dur=([\d.]+);desc="([a-zA-Z0-9.]+):(\d+)"/g))if(spanNames.has(match[2]))result.totals.push({name:match[2],count:Number(match[3]),ms:Number(match[1])});
  for(const match of header.matchAll(/s(\d+);dur=([\d.]+);desc="([a-zA-Z0-9.]+):([\d.]+):(-?\d+):(-?\d+)"/g))if(spanNames.has(match[3]))result.spans.push({i:Number(match[1]),name:match[3],start:Number(match[4]),ms:Number(match[2]),parent:Number(match[5]),bytes:Number(match[6])});
  return result;
 };
 const original=window.fetch;
 const wrapped=async function(input,init){
  const name=route(typeof input==='string'||input instanceof URL?String(input):input?.url),method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  if(!active()||!name||['asset','shell','collector','other','shared'].includes(name)||!(method==='GET'||name==='login'&&method==='POST')||requests>=maxRequests)return original.call(this,input,init);
  const sequence=++requests,start=origin+performance.now();
  let headers;try{headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));headers.set('X-Process-Timing','1');}catch{return original.call(this,input,init);}
  add('request',name,{sequence,start,method});
  try{const response=await original.call(this,input,{...init,headers});const measured=timings(response.headers.get('Server-Timing'));if(!measured.requestId){stop();return response;}add('response',name,{sequence,start,end:origin+performance.now(),status:response.status,method,...measured});return response;}
  catch(error){add('response',name,{sequence,start,end:origin+performance.now(),status:0,method});throw error;}
 };
 window.fetch=wrapped;
 const destination=()=>{const s=window.ProcessSync?.destination;if(s?.view==='editor')return 'process';if(s?.dataTab==='quality-fqc')return 'fqc';if(s?.dataTab==='process-master')return 'master';return 'shell';};
 const ready=()=>{
  const d=document.documentElement.dataset;
  if(d.processNavigationStatus!=='ready'||d.processDestinationGeneration!==d.processDestinationReadyGeneration||document.documentElement.hasAttribute('data-process-boot'))return;
  const generation=d.processDestinationReadyGeneration,name=destination();
  add('ready',name,{start:actionStart,end:origin+performance.now(),ready:d.processReadyMs,shared:d.processSharedReadyMs,assets:d.processAssetsReadyMs,generation});
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(d.processDestinationReadyGeneration===generation&&d.processNavigationStatus==='ready')add('paint',name,{generation,start:actionStart,end:origin+performance.now()});}));
 };
 const click=event=>{const target=event.target?.closest?.('[data-view],[data-tab],a');if(!target)return;let name=null;if(target.dataset.view==='editor')name='process';else if(target.dataset.view==='dashboard')name='shell';else if(target.dataset.tab==='quality-fqc')name='fqc';else if(target.dataset.tab==='process-master')name='master';else if(target.tagName==='A')name=route(target.href);if(name){actionStart=origin+performance.now();add('click',name);}};
 const submit=()=>{if(location.pathname==='/login'){actionStart=origin+performance.now();add('submit','login');save();}};
 addEventListener('click',click,true);addEventListener('submit',submit,true);
 addEventListener('process-ui-ready',ready);addEventListener('process-destination-ready',ready);
 addEventListener('pagehide',save);
 try{observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){const name=route(entry.name);if(!name)continue;add('resource',name,{...resourceId(entry),start:origin+entry.startTime,end:origin+entry.responseEnd,fetchStart:origin+entry.fetchStart,requestStart:origin+entry.requestStart,responseStart:origin+entry.responseStart,dns:entry.domainLookupEnd-entry.domainLookupStart,connect:entry.connectEnd-entry.connectStart,tls:entry.secureConnectionStart?entry.connectEnd-entry.secureConnectionStart:0,ttfb:entry.responseStart-entry.requestStart,download:entry.responseEnd-entry.responseStart,status:entry.responseStatus,transfer:entry.transferSize,encoded:entry.encodedBodySize,decoded:entry.decodedBodySize});}});observer.observe({type:'resource',buffered:true});}catch{}
 const stop=()=>{if(!stopped){add('stop','shell');save();}stopped=true;observer?.disconnect();observer=null;if(timer!==null)clearTimeout(timer);timer=null;badgeNode?.remove();badgeNode=null;if(window.fetch===wrapped)window.fetch=original;removeEventListener('click',click,true);removeEventListener('submit',submit,true);removeEventListener('process-ui-ready',ready);removeEventListener('process-destination-ready',ready);removeEventListener('pagehide',save);removeEventListener('DOMContentLoaded',badge);removeEventListener('load',navigation);try{sessionStorage.removeItem(key);}catch{}};
 window.ProcessNavigationTiming={loginReady(){add('ready','login',{start:actionStart,end:origin+performance.now()});requestAnimationFrame(()=>requestAnimationFrame(()=>add('paint','login',{start:actionStart,end:origin+performance.now()})));},snapshot(){save();return snapshot();},stop,clear(){stop();clearRows();}};
 timer=setTimeout(stop,Math.max(0,config.until-Date.now()));
 const badge=()=>{if(!active())return;const a=document.createElement('a');a.href='/navigation-timing';a.textContent='效能診斷 / Chẩn đoán';Object.assign(a.style,{position:'fixed',bottom:'8px',right:'8px',zIndex:'100000',padding:'10px',background:'#fff',color:'#111',border:'1px solid #555',borderRadius:'6px',font:'14px system-ui'});document.body.append(a);badgeNode=a;};
 if(document.readyState==='loading')addEventListener('DOMContentLoaded',badge,{once:true});else badge();
 const navigation=()=>{const entry=performance.getEntriesByType('navigation')[0];if(entry)add('resource',route(location.href)||'other',{...resourceId(entry),start:origin+entry.startTime,end:origin+entry.responseEnd,fetchStart:origin+entry.fetchStart,requestStart:origin+entry.requestStart,responseStart:origin+entry.responseStart,dns:entry.domainLookupEnd-entry.domainLookupStart,connect:entry.connectEnd-entry.connectStart,tls:entry.secureConnectionStart?entry.connectEnd-entry.secureConnectionStart:0,ttfb:entry.responseStart-entry.requestStart,download:entry.responseEnd-entry.responseStart,transfer:entry.transferSize,encoded:entry.encodedBodySize,decoded:entry.decodedBodySize});};
 if(document.readyState==='complete')navigation();else addEventListener('load',navigation,{once:true});
 add('start',route(location.href)||'other');
}
