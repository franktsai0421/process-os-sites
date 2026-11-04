// Request-local diagnostics only: no command, identity, business body or error text.
// Observability must never turn a committed operation into a failed response.
export function iqcWriteTiming(enabled:boolean,requestId:string,now=()=>Date.now(),emit=(line:string)=>console.info(line)){
  const started=now(),durations:Record<string,number>={};let at=started,stage='command-decode';
  function mark(next:string){if(!enabled)return;const time=now();durations[stage]=(durations[stage]||0)+Math.max(0,time-at);stage=next;at=time;}
  return {mark,finish(status:number){if(!enabled)return;try{const lastStage=stage;mark('finished');emit(JSON.stringify({event:'iqc-workflow-write',requestId,status,lastStage,totalMs:Math.max(0,now()-started),stagesMs:durations}));}catch{/* Diagnostics cannot change write/receipt semantics. */}}};
}
