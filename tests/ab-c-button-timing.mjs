// Browser-only timing: no application behavior, permissions, caches or writes changed.
export async function buttonTiming(page){
 const requests=[],pending=new Map();let sequence=0;
 await page.addInitScript(()=>{window.__abcLongTasks=[];try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__abcLongTasks.push({at:performance.timeOrigin+e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:true});}catch{/* Browser without long-task observer. */}});
 page.on('request',r=>{const u=new URL(r.url());if(!u.pathname.startsWith('/api/'))return;let action='';if(r.method()==='POST'){try{const body=r.postDataJSON();action=body?.command?.action||body?.action||'';}catch{/* Not JSON. */}}const row={id:++sequence,start:performance.now(),method:r.method(),path:u.pathname,queryKeys:[...u.searchParams.keys()],action};pending.set(r,row);requests.push(row);});
 page.on('response',r=>{const row=pending.get(r.request());if(row){row.status=r.status();row.headersMs=performance.now()-row.start;}});
 page.on('requestfinished',r=>{const row=pending.get(r);if(row){row.totalMs=performance.now()-row.start;const t=r.timing();row.serverWaitMs=t.responseStart>=0&&t.requestStart>=0?t.responseStart-t.requestStart:null;pending.delete(r);}});
 page.on('requestfailed',r=>{const row=pending.get(r);if(row){row.failed=true;row.totalMs=performance.now()-row.start;pending.delete(r);}});
 return {start:()=>({at:performance.now(),wall:Date.now(),cursor:requests.length}),async finish(mark){const ms=Math.round(performance.now()-mark.at),rows=requests.slice(mark.cursor).map(r=>({...r,startMs:Math.round(r.start-mark.at),start:undefined}));let tasks=[];try{tasks=await page.evaluate(at=>(window.__abcLongTasks||[]).filter(e=>e.at>=at),mark.wall);}catch{/* Navigation may replace the renderer. */}return{ms,requests:rows,longTasks:tasks};}};
}
