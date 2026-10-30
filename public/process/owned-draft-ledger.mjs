import {planOwnedDraftRevert} from './owned-draft-revert.mjs?v=platform5';

const clone=value=>structuredClone(value);
function same(a,b){
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));
}
const language=()=>typeof document!=='undefined'&&document.documentElement.lang==='vi';
const explanations={
 OWNED_LEDGER_HISTORY_REQUIRED:['此頁沒有完整本人操作紀錄，無法安全撤銷；可儲存共同草稿或留下核對。','Trang này không có đủ nhật ký thao tác của bạn; hãy lưu bản nháp chung hoặc ở lại kiểm tra.'],
 OWNED_LEDGER_CONTEXT_CHANGED:['登入、草稿或頁面狀態已改變，已保留輸入；請重新核對後再操作。','Phiên đăng nhập, bản nháp hoặc trang đã thay đổi. Đầu vào được giữ lại; hãy kiểm tra trước khi tiếp tục.'],
 OWNED_LEDGER_INTERLEAVED:['期間有其他修改或缺少操作紀錄，無法安全放棄；請儲存共同草稿或留下核對。','Có thay đổi xen kẽ hoặc thiếu nhật ký. Hãy lưu bản nháp chung hoặc ở lại kiểm tra.'],
 OWNED_LEDGER_UNSUPPORTED:['本次包含無法安全逆轉的刪除、還原或欄位變更；沒有放棄任何內容，請儲存或留下處理。','Có thao tác xóa, khôi phục hoặc thay đổi trường không thể đảo an toàn. Chưa bỏ nội dung nào; hãy lưu hoặc ở lại xử lý.'],
 OWNED_LEDGER_PENDING:['操作仍在確認中；請等候完成，或留在本頁。','Thao tác đang được xác nhận; hãy chờ hoặc ở lại trang.'],
 OWNED_LEDGER_UNKNOWN:['先前寫入結果尚未確認，已保留輸入；請先查原操作收據，勿重複送出。','Chưa xác nhận kết quả ghi trước đó. Đầu vào được giữ lại; kiểm tra biên nhận gốc, không gửi lặp lại.'],
 OWNED_LEDGER_REVERT_UNCONFIRMED:['撤銷結果尚未完整確認，已保留輸入；請先重新讀取或查原操作收據，不要重複撤銷。','Chưa xác nhận đầy đủ kết quả hoàn tác. Đầu vào được giữ lại; đọc lại hoặc kiểm tra biên nhận gốc, không hoàn tác lặp lại.'],
 OWNED_LEDGER_RECOVERY_STORAGE:['無法讀取或保留安全離頁紀錄；已停止放棄與重試。請保留輸入，恢復此分頁儲存空間後再唯讀核對。','Không đọc hoặc giữ được nhật ký rời trang an toàn; đã dừng bỏ thay đổi và thử lại. Giữ đầu vào, khôi phục bộ nhớ tab rồi kiểm tra chỉ đọc.'],
 OWNED_LEDGER_MARKER_WRITE_FAILED:['安全離頁紀錄無法保存，尚未送出任何放棄要求；請儲存草稿，或恢復此分頁儲存空間後再試。','Không lưu được nhật ký rời trang an toàn; chưa gửi yêu cầu bỏ thay đổi. Hãy lưu bản nháp hoặc khôi phục bộ nhớ tab rồi thử lại.'],
 OWNED_LEDGER_RELOADED_REVIEW:['原放棄操作收據已確認，但重新載入後缺少完整內容對照；未重送原操作，請核對目前內容後儲存，或留在本頁處理。','Đã xác nhận biên nhận bỏ thay đổi, nhưng sau khi tải lại không còn đủ nội dung để đối chiếu. Không gửi lại thao tác gốc; kiểm tra nội dung hiện tại rồi lưu hoặc ở lại xử lý.'],
 OWNED_LEDGER_LIMIT:['本次操作紀錄已達安全處理上限；請儲存共同草稿或留下核對。','Nhật ký đã đạt giới hạn xử lý an toàn; hãy lưu bản nháp chung hoặc ở lại kiểm tra.'],
};
export function ownedDraftExplanation(code){return explanations[code]?.[language()?1:0]||explanations.OWNED_LEDGER_INTERLEAVED[language()?1:0];}
function problem(code){return Object.assign(new Error(ownedDraftExplanation(code)),{code});}
function snapshot(flow){
 return {schemaVersion:flow.schemaVersion,scope:flow.scope,generation:flow.generation,revision:flow.revision,
  pendingId:flow.pendingId??null,working:flow.working,saved:flow.saved?{id:flow.saved.id,revision:flow.saved.revision}:null};
}
const savedId=flow=>flow?.saved?.id??null;
const unsaved=flow=>!same(flow?.working,flow?.saved?.content??flow?.active?.content);

// One in-memory, actor/scope-owned ledger. Neither contributors nor current
// field values are treated as proof of which tab wrote them. Every entry comes
// from a captured command and the existing transport's confirmed receipt.
function browserRecoveryStorage(){try{return globalThis.sessionStorage??null;}catch{return null;}}
export function createOwnedDraftLedger({actorId,scope,captureOwner=()=>null,isOwnerCurrent=()=>true,recoveryStorage=browserRecoveryStorage()}){
 if(typeof actorId!=='string'||!actorId||typeof scope!=='string'||!scope)throw problem('OWNED_LEDGER_CONTEXT_CHANGED');
 const owner=captureOwner(),pending=new Map(),knownClients=new Set(),markerKey='process-owned-revert-v1:'+JSON.stringify([actorId,scope]);
 let recoveryMarker=null,markerInvalid=false;
 const validMarker=m=>m?.schema===1&&m.actorId===actorId&&m.scope===scope&&['generation','operationId','clientId'].every(key=>typeof m[key]==='string'&&m[key])&&Number.isSafeInteger(m.beforeRevision)&&m.beforeRevision>=0&&(m.savedId===null||typeof m.savedId==='string');
 try{if(!recoveryStorage)throw Error();const value=recoveryStorage.getItem(markerKey);if(value!==null){const parsed=JSON.parse(value);if(!validMarker(parsed))throw Error();recoveryMarker=parsed;}}catch{markerInvalid=true;}
 let cursor=null,operations=[],blocker=null,sharedUnsaved=false,ownershipUnknown=false,reverting=false,priorShared=false,lastObserved=null,planCache=null,revertAttempt=null;
 const hasRevertRecovery=()=>!!revertAttempt||!!recoveryMarker||markerInvalid;
 function clearMarker(){try{recoveryStorage.removeItem(markerKey);if(recoveryStorage.getItem(markerKey)!==null)throw Error();recoveryMarker=null;markerInvalid=false;}catch{markerInvalid=true;blocker='OWNED_LEDGER_RECOVERY_STORAGE';throw problem(blocker);}}
 function retainMarker(attempt){
  const marker={schema:1,actorId,scope,generation:attempt.command.generation,operationId:attempt.command.operationId,clientId:attempt.command.clientId,beforeRevision:attempt.base.revision,savedId:attempt.base.savedId};
  try{recoveryStorage.setItem(markerKey,JSON.stringify(marker));if(!same(JSON.parse(recoveryStorage.getItem(markerKey)),marker))throw Error();recoveryMarker=marker;}
  catch{try{clearMarker();blocker='OWNED_LEDGER_MARKER_WRITE_FAILED';}catch{blocker='OWNED_LEDGER_RECOVERY_STORAGE';}throw problem(blocker);}
 }
 const retainMessage=()=>language()?'Đã giữ nguyên nội dung chung có trước lần chỉnh sửa này; nội dung đó chưa được lưu.':'已保留本次編輯前的共享內容；該內容尚未手動儲存。';
 function planFor(flow){if(planCache?.cursor===cursor&&planCache?.count===operations.length)return planCache.plan;const plan=planOwnedDraftRevert({flow,operations,actorId,clientIds:[...knownClients]});planCache={cursor,count:operations.length,plan};return plan;}
 const current=()=>isOwnerCurrent(owner)!==false;
 const valid=flow=>flow?.schemaVersion===3&&flow.scope===scope&&typeof flow.generation==='string'&&Number.isSafeInteger(flow.revision)&&flow.revision>=0&&flow.working&&typeof flow.working==='object';
 function reset(flow){cursor=snapshot(flow);operations=[];sharedUnsaved=unsaved(flow);ownershipUnknown=sharedUnsaved;priorShared=false;planCache=null;lastObserved=flow;blocker=ownershipUnknown?'OWNED_LEDGER_HISTORY_REQUIRED':null;}
 function observe(flow){
  if(!current()||!valid(flow)){blocker='OWNED_LEDGER_CONTEXT_CHANGED';return;}
  if(hasRevertRecovery()){blocker=markerInvalid?'OWNED_LEDGER_RECOVERY_STORAGE':'OWNED_LEDGER_REVERT_UNCONFIRMED';return;}
  if(flow===lastObserved&&cursor?.generation===flow.generation&&cursor?.revision===flow.revision&&savedId(cursor)===savedId(flow)&&cursor?.pendingId===(flow.pendingId??null)&&![...pending.values()].some(record=>record.state==='awaiting-state'))return;
  // Receipt-only recovery is complete only after its authoritative model is
  // read. The caller already performs that read; do not add another request.
  for(const record of pending.values())if(record.state==='awaiting-state')adoptConfirmation(record,{receipt:record.receipt,control:{workflow:flow}});
  sharedUnsaved=unsaved(flow);lastObserved=flow;
  if(!cursor){reset(flow);return;}
  if(cursor.generation===flow.generation&&cursor.revision===flow.revision&&savedId(cursor)===savedId(flow)&&same(cursor.working,flow.working)){cursor.pendingId=flow.pendingId??null;return;}
  // A fresh successful Save covers prior acknowledged edits. Never clear a
  // pending/unknown command or a known edit after that exact saved cutoff.
  const covered=!pending.size&&flow.saved&&savedId(cursor)!==savedId(flow)&&operations.every(entry=>entry.receipt.revision<=flow.saved.revision);
  if(!pending.size&&(covered||cursor.pendingId&&cursor.generation!==flow.generation||!operations.length&&!blocker)){reset(flow);return;}
  blocker='OWNED_LEDGER_INTERLEAVED';
 }
 function confirmed(command,result){
  const r=result?.receipt;
  return r&&r.operationId===command.operationId&&typeof r.generation==='string'&&Number.isSafeInteger(r.revision)&&r.revision>=0&&typeof r.unchanged==='boolean'&&(r.savedId===null||typeof r.savedId==='string')&&(r.caseId===null||typeof r.caseId==='string')&&(command.action!=='apply'||r.generation===command.generation);
 }
 function adoptConfirmation(record,result){
  if(record.confirmed)return;
  if(!current()||!confirmed(record.command,result)){blocker='OWNED_LEDGER_CONTEXT_CHANGED';record.state='unknown';return;}
  if(!valid(result.control?.workflow)){record.receipt=clone(result.receipt);record.state='awaiting-state';return;}
  record.confirmed=true;pending.delete(record.command.operationId);planCache=null;
  const command=record.command,r=clone(result.receipt),flow=result.control?.workflow;
  if(command.action==='save'){
   if(!pending.size&&valid(flow)&&flow.generation===r.generation&&flow.revision===r.revision&&savedId(flow)===r.savedId&&flow.saved&&same(flow.working,flow.saved.content)){reset(flow);return;}
   blocker='OWNED_LEDGER_INTERLEAVED';return;
  }
  if(command.action!=='apply'){
   if(valid(flow)&&!pending.size&&flow.pendingId){cursor=snapshot(flow);operations=[];blocker=null;ownershipUnknown=false;sharedUnsaved=unsaved(flow);return;}
   if(valid(flow)&&!pending.size&&cursor?.pendingId&&flow.generation!==cursor.generation){reset(flow);return;}
   blocker='OWNED_LEDGER_UNSUPPORTED';return;
  }
  if(r.unchanged){
   if(!cursor||r.revision!==cursor.revision||r.generation!==cursor.generation||r.savedId!==savedId(cursor))blocker='OWNED_LEDGER_INTERLEAVED';
   return;
  }
  // The checkpoint predates this exact captured command. It never attributes
  // pre-existing shared work (including earlier tabs) to this editing session.
  if(record.checkpoint&&blocker==='OWNED_LEDGER_HISTORY_REQUIRED'&&cursor===record.checkpoint.cursor&&!pending.size&&r.revision===cursor.revision+1&&r.generation===cursor.generation&&r.savedId===savedId(cursor)){blocker=null;ownershipUnknown=false;priorShared=record.checkpoint.sharedUnsaved;}
  const entry={actorId,command,receipt:r};
  operations.push(entry);
  if(operations.length>256){blocker='OWNED_LEDGER_LIMIT';return;}
  if(!cursor||r.generation!==cursor.generation||r.savedId!==savedId(cursor)||r.revision!==cursor.revision+1||pending.size){blocker='OWNED_LEDGER_INTERLEAVED';}
  if(valid(flow)&&flow.generation===r.generation&&flow.revision===r.revision&&savedId(flow)===r.savedId){cursor=snapshot(flow);lastObserved=flow;sharedUnsaved=unsaved(flow);}
  else blocker='OWNED_LEDGER_INTERLEAVED';
  // Check support now, before a user is offered Discard. The planner itself
  // operates on a private copy, so one unsupported operation blocks the batch.
  if(!blocker)try{planFor(cursor);}catch{blocker='OWNED_LEDGER_UNSUPPORTED';}
 }
 function fail(record,error,synchronous=false){
  if(record.confirmed)return;
  if(!record.uncertain&&(synchronous||error?.notSent||error?.status&&error.status<500)){pending.delete(record.command.operationId);return;}
  record.uncertain=true;record.state='unknown';
 }
 function sendPrepared(client,command,getFlow){
  if(!current())return Promise.reject(problem('OWNED_LEDGER_CONTEXT_CHANGED'));
  if(hasRevertRecovery())return Promise.reject(problem(markerInvalid?'OWNED_LEDGER_RECOVERY_STORAGE':'OWNED_LEDGER_REVERT_UNCONFIRMED'));
  const existing=pending.get(command?.operationId);
  if(existing?.promise&&existing.state==='pending')return existing.promise;
  if(!existing&&getFlow)observe(getFlow());
  const checkpoint=!operations.length&&!pending.size&&cursor&&(!blocker||blocker==='OWNED_LEDGER_HISTORY_REQUIRED')?{cursor,sharedUnsaved}:null;
  const record=existing||{command:clone(command),checkpoint,state:'pending',confirmed:false,promise:null};
  if(record.command.clientId!==command?.clientId||!same(record.command,command))return Promise.reject(problem('OWNED_LEDGER_CONTEXT_CHANGED'));
  knownClients.add(command.clientId);pending.set(command.operationId,record);record.state='pending';
  let sent;try{sent=client.sendPrepared(record.command);}catch(error){fail(record,error,true);return Promise.reject(error);}
  const task=Promise.resolve(sent).then(result=>{adoptConfirmation(record,result);return result;},error=>{fail(record,error);throw error;});
  record.promise=task;return task;
 }
 function command(client,generation,action,details,getFlow){return sendPrepared(client,client.prepare(generation,action,details),getFlow);}
 async function resolve(client,method,args=[]){
  if(!['receipt','resolveUnknown','retryUnknown'].includes(method))throw problem('OWNED_LEDGER_UNKNOWN');
  if(hasRevertRecovery()){if(method==='retryUnknown')throw problem(markerInvalid?'OWNED_LEDGER_RECOVERY_STORAGE':'OWNED_LEDGER_REVERT_UNCONFIRMED');return recoverDiscard(client);}
  const result=await client[method](...args),record=pending.get(result?.receipt?.operationId);
  if(record)adoptConfirmation(record,result);
  else if(result?.receipt&&blocker!=='OWNED_LEDGER_REVERT_UNCONFIRMED')blocker='OWNED_LEDGER_HISTORY_REQUIRED';
  return result;
 }
 function inspect(flow){
  if(flow)observe(flow);
  const info={state:'clean',reason:priorShared?retainMessage():'',canSave:true,canDiscard:false,ownChanges:operations.length,sharedUnsaved,ownershipUnknown,priorShared,requiresDelete:false};
  if(!current()){info.state='unknown';info.canSave=false;info.reason=ownedDraftExplanation('OWNED_LEDGER_CONTEXT_CHANGED');return info;}
  if(hasRevertRecovery()){info.state=reverting?'busy':'unknown';info.canSave=false;info.reason=ownedDraftExplanation(markerInvalid?'OWNED_LEDGER_RECOVERY_STORAGE':'OWNED_LEDGER_REVERT_UNCONFIRMED');return info;}
  if([...pending.values()].some(record=>record.state==='unknown')){info.state='unknown';info.canSave=false;info.reason=ownedDraftExplanation('OWNED_LEDGER_UNKNOWN');return info;}
  if([...pending.values()].some(record=>record.state==='awaiting-state')){info.state='unknown';info.canSave=false;info.reason=ownedDraftExplanation('OWNED_LEDGER_UNKNOWN');return info;}
  if(pending.size||reverting){info.state='busy';info.canSave=false;info.reason=ownedDraftExplanation('OWNED_LEDGER_PENDING');return info;}
  // Confirmed pending cases are read-only. Their working/saved difference is
  // allowed by the fixed-submit-snapshot rule, not a writable discard prompt.
  if((flow||cursor)?.pendingId){info.canSave=false;return info;}
  if(blocker){info.state='unknown';info.canSave=!['OWNED_LEDGER_CONTEXT_CHANGED','OWNED_LEDGER_REVERT_UNCONFIRMED','OWNED_LEDGER_RECOVERY_STORAGE'].includes(blocker);info.reason=ownedDraftExplanation(blocker);return info;}
  if(operations.length){
   try{const plan=planFor(flow||cursor);info.state='dirty';info.canDiscard=true;info.requiresDelete=plan.patches.some(patch=>patch.op==='remove');}
   catch{info.state='unknown';info.reason=ownedDraftExplanation('OWNED_LEDGER_UNSUPPORTED');}
  }
  return info;
 }
 async function settle(){
  await Promise.all([...pending.values()].filter(record=>record.state==='pending').map(record=>record.promise));
  if(pending.size)throw problem('OWNED_LEDGER_UNKNOWN');
 }
 function finishRevert(attempt,result,completed,client){
  const after=completed?.control?.workflow,r=result?.receipt,base=attempt.base;
  if(!current()||!confirmed(attempt.command,result)||!valid(after)||r.generation!==base.generation||r.revision!==base.revision+(r.unchanged?0:1)||r.savedId!==base.savedId){blocker='OWNED_LEDGER_REVERT_UNCONFIRMED';throw problem(blocker);}
  if(client.hasUnknown?.()){blocker='OWNED_LEDGER_REVERT_UNCONFIRMED';throw problem(blocker);}
  clearMarker();
  if(attempt.reloaded){reset(after);ownershipUnknown=true;blocker='OWNED_LEDGER_RELOADED_REVIEW';revertAttempt=null;return {...completed,receipt:r,ownedRevertNeedsReview:true,ownedRevertReviewReason:ownedDraftExplanation(blocker)};}
  if(after.generation!==base.generation||after.revision!==r.revision||savedId(after)!==base.savedId||after.pendingId||!same(after.working,attempt.expected)){
   // The original guarded inverse is confirmed, but the shared model advanced.
   // Preserve local input and require Save/reconfirmation; never issue it twice.
   reset(after);operations=[];ownershipUnknown=true;blocker='OWNED_LEDGER_INTERLEAVED';revertAttempt=null;throw problem(blocker);
  }
  reset(after);ownershipUnknown=false;blocker=null;priorShared=attempt.priorShared;revertAttempt=null;return {...completed,receipt:r};
 }
 async function recoverDiscard(client){
  if(!current())throw problem('OWNED_LEDGER_CONTEXT_CHANGED');
  if(markerInvalid){
   try{const restored=JSON.parse(recoveryStorage.getItem(markerKey));if(validMarker(restored)){recoveryMarker=restored;markerInvalid=false;}else if(revertAttempt)retainMarker(revertAttempt);else throw Error();}catch{throw problem('OWNED_LEDGER_RECOVERY_STORAGE');}
  }
  const marker=recoveryMarker,attempt=revertAttempt||(marker?{reloaded:true,command:{action:'apply',generation:marker.generation,operationId:marker.operationId,clientId:marker.clientId},base:{generation:marker.generation,revision:marker.beforeRevision,savedId:marker.savedId}}:null);if(!attempt)throw problem('OWNED_LEDGER_HISTORY_REQUIRED');
  if(reverting||pending.size)throw problem('OWNED_LEDGER_PENDING');
  reverting=true;try{
   // This recovery never retransmits. A missing receipt is not permission to
   // guess that the old request failed or create a second inverse operation.
   // The transport clears only a matching unknown operation after validating
   // this exact receipt; never resolve an unrelated account/scope operation.
   const result=await client.receipt(attempt.command.operationId,attempt.command.generation);
   const fresh=await client.read();return finishRevert(attempt,result,fresh,client);
  }finally{reverting=false;}
 }
 async function discard(client){
  if(!current())throw problem('OWNED_LEDGER_CONTEXT_CHANGED');
  if(hasRevertRecovery())throw problem(markerInvalid?'OWNED_LEDGER_RECOVERY_STORAGE':'OWNED_LEDGER_REVERT_UNCONFIRMED');
  if(pending.size||reverting)throw problem([...pending.values()].some(record=>record.state==='unknown')?'OWNED_LEDGER_UNKNOWN':'OWNED_LEDGER_PENDING');
  if(blocker)throw problem(blocker);
  reverting=true;
  try{
   const fresh=await client.read(),flow=fresh.control?.workflow;
   observe(flow);
   if(blocker)throw problem(blocker);
   if(!valid(flow)||flow.pendingId)throw problem('OWNED_LEDGER_CONTEXT_CHANGED');
   if(!operations.length)return fresh;
   const plan=planFor(flow),preservePrior=priorShared;
   const prepared=client.prepare(plan.generation,'apply',plan),expected=clone(flow.working);
   // Use the same inverse planner's private result by applying only supported
   // patches locally for ACK comparison; no backend state is changed here.
   const at=path=>path.reduce((value,key)=>typeof key==='string'?value[key]:value.find(row=>row.id===key.id),expected);
   for(const patch of plan.patches){
    const parent=at(patch.path.slice(0,-1)),key=patch.path.at(-1);
    if(patch.op==='set')parent[key]=clone(patch.value);
    else if(patch.op==='remove')parent.splice(parent.findIndex(row=>row.id===key.id),1);
    else if(patch.op==='order'){const rows=at(patch.path),byId=new Map(rows.map(row=>[row.id,row]));rows.splice(0,rows.length,...patch.ids.map(id=>byId.get(id)));}
   }
   const attempt={command:prepared,expected,priorShared:preservePrior,base:{generation:flow.generation,revision:flow.revision,savedId:savedId(flow)}};retainMarker(attempt);revertAttempt=attempt;
   let result;
   try{result=await client.sendPrepared(prepared);}catch(error){
    if(!(error?.notSent||error?.status&&error.status<500))blocker='OWNED_LEDGER_REVERT_UNCONFIRMED';else{clearMarker();revertAttempt=null;}
    throw error;
   }
   let completed;try{completed=result.control?result:await client.read();}catch(error){blocker='OWNED_LEDGER_REVERT_UNCONFIRMED';throw error;}
   return finishRevert(attempt,result,completed,client);
  }catch(error){if(error?.code?.startsWith('OWNED_'))throw error;throw error;}
  finally{reverting=false;}
 }
 return {observe,command,sendPrepared,resolve,inspect,settle,discard,recoverDiscard,hasRevertRecovery};
}
