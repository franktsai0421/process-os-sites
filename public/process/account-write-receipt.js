// Durable metadata only. No form contents, credentials or permission grants.
(()=>{
 let observedActor=null;
 const noteActor=actor=>{const changed=observedActor!==null&&observedActor!==actor;observedActor=actor;return changed;};
 const prefix='processAccountWrite:v1:';
 const valid=value=>value&&/^account_[a-f0-9-]{36}$/.test(value.requestId)&&/^(create|update|delete)-role$|^(create|update|status|delete)-user$/.test(value.action)&&typeof value.id==='string'&&Number.isSafeInteger(value.baseRevision);
 function pending(actor){try{const values=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix+actor+':'))continue;const value=JSON.parse(localStorage.getItem(key));if(!valid(value)||value.actor!==actor||key!==prefix+actor+':'+value.requestId)throw Error();values.push(value);}return values.sort((a,b)=>a.baseRevision-b.baseRevision||a.requestId.localeCompare(b.requestId))[0]||null;}catch{throw Error('ACCOUNT_RECEIPT_STORAGE_UNAVAILABLE');}}
 function begin(actor,payload,baseRevision){
  noteActor(actor);if(pending(actor))throw Error('WRITE_RESULT_UNKNOWN_RELOAD_REQUIRED');
  const value={actor,requestId:'account_'+crypto.randomUUID(),action:payload.action,id:String(payload.id||'').trim().toLowerCase(),baseRevision};
  if(!valid(value))throw Error('INVALID_INPUT');
  try{const key=prefix+actor+':'+value.requestId;localStorage.setItem(key,JSON.stringify(value));if(localStorage.getItem(key)!==JSON.stringify(value))throw Error();}catch{throw Error('ACCOUNT_RECEIPT_STORAGE_UNAVAILABLE');}return value;
 }
 function clear(actor,requestId){localStorage.removeItem(prefix+actor+':'+requestId);}
 window.ProcessAccountWriteReceipt=Object.freeze({pending,begin,clear,noteActor});
})();
