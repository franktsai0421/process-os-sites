// Request-local labels only. Never serialize provider messages, keys or credentials.
const labels=new Set(['copy-context','copy-bootstrap','copy-plan','copy-target-get','copy-target-body','copy-source-get','copy-source-body','copy-source-hash','copy-source-range','copy-put','copy-readback-get','copy-readback-body','copy-complete','copy-advance','request-complete']);
export function copyDiagnostics(action,requestId,write=record=>console.error(JSON.stringify(record))){
 let stage='copy-context';
 return {
  /** @this {void} */
  mark(value){if(labels.has(value))stage=value;},failure(error){
  if(action!=='copy')return;
  const message=typeof error?.message==='string'?error.message:'';
  const kind=/^IMPORT_[A-Z0-9_]+$/.test(message)?message:/\bD1_|\bSQLITE_|database/i.test(message)?'D1_FAILURE':/subrequest/i.test(message)?'SUBREQUEST_LIMIT':/R2|bucket|storage/i.test(message)?'R2_FAILURE':/abort|cancel/i.test(message)?'CANCELLED':/timeout|timed out/i.test(message)?'TIMEOUT':'PROVIDER_UNKNOWN';
  try{write({type:'PROCESS_COPY_FAILURE_V1',requestId,stage,kind});}catch{/* diagnostics never change fail-closed behavior */}
 }};
}
