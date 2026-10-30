// Pure planner for reversing only confirmed, guarded field edits from this
// editing session. Callers must submit through the normal module Apply route.
// The caller must supply a complete trusted ledger of its acknowledged edits;
// this planner cannot authenticate receipts or detect an omitted ledger prefix.
const clone=value=>structuredClone(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=code=>{throw Object.assign(new Error(code),{code});};
function read(root,path){
 let value=root;
 for(const key of path){
  if(typeof key==='string'){
   if(['__proto__','prototype','constructor'].includes(key)||!value||!Object.hasOwn(value,key))fail('OWNED_REVERT_PATH_CHANGED');
   value=value[key];
  }else{
   if(!key||typeof key.id!=='string'||Object.keys(key).length!==1||!Array.isArray(value))fail('OWNED_REVERT_PATH_CHANGED');
   const rows=value.filter(row=>row?.id===key.id);if(rows.length!==1)fail('OWNED_REVERT_PATH_CHANGED');value=rows[0];
  }
 }
 return value;
}
function preservesEntities(before,after){
 if(!before||!after||typeof before!=='object'||typeof after!=='object')return ![before,after].some(v=>v&&typeof v==='object'&&containsEntities(v));
 if(Array.isArray(before)||Array.isArray(after)){
  if(!Array.isArray(before)||!Array.isArray(after))return !containsEntities(before)&&!containsEntities(after);
  if(before.some(v=>v&&typeof v==='object'&&typeof v.id==='string')||after.some(v=>v&&typeof v==='object'&&typeof v.id==='string')){
   const ids=before.map(v=>v?.id);if(ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length||after.length!==before.length||after.some(v=>!ids.includes(v?.id))||new Set(after.map(v=>v?.id)).size!==after.length)return false;
   return before.every(v=>preservesEntities(v,after.find(a=>a.id===v.id)));
  }
  return before.every((v,i)=>preservesEntities(v,after[i]))&&after.slice(before.length).every(v=>!containsEntities(v));
 }
 return [...new Set([...Object.keys(before),...Object.keys(after)])].every(key=>preservesEntities(before[key],after[key]));
}
function containsEntities(value){return !!value&&typeof value==='object'&&(Array.isArray(value)?value.some(v=>v&&typeof v==='object'&&typeof v.id==='string'||containsEntities(v)):Object.values(value).some(containsEntities));}
function write(root,path,value){
 if(!path.length)fail('OWNED_REVERT_PATH_CHANGED');
 const parent=read(root,path.slice(0,-1)),key=path.at(-1);
 if(typeof key!=='string'||['id','__proto__','prototype','constructor'].includes(key)||!parent||!Object.hasOwn(parent,key))fail('OWNED_REVERT_PATH_CHANGED');
 parent[key]=clone(value);
}
export function planOwnedDraftRevert({flow,operations,actorId,clientId,clientIds}){
 const allowedClients=new Set(clientIds??[clientId]);
 if(!actorId||!allowedClients.size||[...allowedClients].some(id=>typeof id!=='string'||!id)||!flow||flow.schemaVersion!==3||!Number.isSafeInteger(flow.revision))fail('OWNED_REVERT_CONTEXT_REQUIRED');
 if(flow.pendingId)fail('PENDING_LOCKED');
 if(!Array.isArray(operations)||!operations.length)fail('OWNED_REVERT_HISTORY_REQUIRED');
 const working=clone(flow.working),patches=[],guards=[];let previousRevision=-1;
 for(const entry of operations){
  const {command,receipt}=entry;
  if(entry.actorId!==actorId||!allowedClients.has(command?.clientId)||command.generation!==flow.generation||receipt?.generation!==flow.generation||receipt.operationId!==command.operationId||!Number.isSafeInteger(receipt.revision)||receipt.revision<=previousRevision||receipt.revision>flow.revision)fail('OWNED_REVERT_CONTEXT_CHANGED');
  if(receipt.savedId!==(flow.saved?.id??null)||flow.saved&&receipt.revision<=flow.saved.revision)fail('OWNED_REVERT_SAVE_CHANGED');
  if(command.action!=='apply'||!Array.isArray(command.patches)||!command.patches.length)fail('OWNED_REVERT_UNSUPPORTED_OPERATION');
  if(receipt.unchanged!==false)fail('OWNED_REVERT_MUTATION_RECEIPT_REQUIRED');
  // Equal current values do not prove that another writer never changed them
  // and changed them back (ABA). Contributors lack operation/client revisions.
  // Until authenticated field history exists, require an uninterrupted series
  // of our own mutations, including the current revision. Even an unrelated
  // intervening/later mutation requires reconfirmation rather than guessing.
  if(previousRevision>=0&&receipt.revision!==previousRevision+1)fail('OWNED_REVERT_HISTORY_GAP');
  previousRevision=receipt.revision;
 }
 if(previousRevision!==flow.revision)fail('OWNED_REVERT_STATE_ADVANCED');
 const guard=path=>{if(!guards.some(g=>same(g.path,path)))guards.push({path:clone(path),value:clone(read(flow.working,path))});};
 // Reverse a private copy first. Any failure leaves the caller and server intact.
 for(const {command} of [...operations].reverse()){
  for(const patch of [...command.patches].reverse()){
   if(!Array.isArray(patch.path)||!patch.path.length)fail('OWNED_REVERT_UNSUPPORTED_OPERATION');
   if(patch.op==='insert'){
    if(!patch.value||typeof patch.value.id!=='string')fail('OWNED_REVERT_UNSUPPORTED_OPERATION');
    const rowPath=[...patch.path,{id:patch.value.id}],current=read(working,rowPath),collection=read(working,patch.path);
    if(!Array.isArray(collection)||!same(current,patch.value))fail('OWNED_REVERT_FIELD_CHANGED');
    guard(rowPath);collection.splice(collection.findIndex(row=>row?.id===patch.value.id),1);
    patches.push({op:'remove',path:clone(rowPath)});continue;
   }
   if(!['set','order'].includes(patch.op))fail('OWNED_REVERT_UNSUPPORTED_OPERATION');
   const matches=(command.guards||[]).filter(g=>same(g.path,patch.path));
   if(matches.length!==1||!Object.hasOwn(matches[0],'value')||matches[0].value===undefined)fail('OWNED_REVERT_BEFORE_VALUE_REQUIRED');
   const current=read(working,patch.path);
   if(patch.op==='order'){
    const before=matches[0].value;
    if(!Array.isArray(before)||!Array.isArray(current)||!Array.isArray(patch.ids)||before.length!==patch.ids.length||new Set(patch.ids).size!==patch.ids.length||before.some(row=>!row||typeof row.id!=='string')||new Set(before.map(row=>row.id)).size!==before.length)fail('OWNED_REVERT_UNSUPPORTED_OPERATION');
    const byId=new Map(before.map(row=>[row.id,row]));
    if(!same(current,patch.ids.map(id=>byId.get(id))))fail('OWNED_REVERT_FIELD_CHANGED');
    guard(patch.path);current.splice(0,current.length,...clone(before));
    patches.push({op:'order',path:clone(patch.path),ids:before.map(row=>row.id)});continue;
   }
   if(!same(current,patch.value))fail('OWNED_REVERT_FIELD_CHANGED');
   // Never use an ancestor set to resurrect a removed entity or bypass the
   // kernel's insert/remove identity and tombstone rules.
   if(!preservesEntities(matches[0].value,patch.value))fail('OWNED_REVERT_UNSUPPORTED_OPERATION');
   // All guards are checked against the initial state by the existing server.
   // Keep one initial guard per path, even if this session edited it repeatedly.
   guard(patch.path);
   write(working,patch.path,matches[0].value);
   patches.push({op:'set',path:clone(patch.path),value:clone(matches[0].value)});
  }
 }
 if(patches.length>256)fail('OWNED_REVERT_TOO_MANY_EDITS');
 return {generation:flow.generation,expectedRevision:flow.revision,patches,guards};
}
