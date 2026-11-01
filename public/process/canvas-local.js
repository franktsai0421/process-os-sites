/* Local canvas journal. Only an explicit current-canvas Sync may publish a batch. */
(function (host) {
 'use strict';
 const clone=v=>v===undefined?undefined:structuredClone(v);
 // Only the editor's parsed/constructed JSON-shaped form records use this path.
 // Copy mutable containers, not large immutable media strings. Unusual shapes
 // fall back to structuredClone; this is not an arbitrary-object/Proxy validator.
 function copyFormRecord(record){
  const seen=new WeakSet(),unsupported={},nativeObject=Function.prototype.toString.call(Object),nativeArray=Function.prototype.toString.call(Array);
  const copy=(value,depth=0)=>{
   if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
   if(typeof value!=='object'||depth>200||seen.has(value))throw unsupported;
   const array=Array.isArray(value),prototype=Object.getPrototypeOf(value),constructor=prototype&&Object.getOwnPropertyDescriptor(prototype,'constructor')?.value;
   if(typeof constructor!=='function'||constructor.prototype!==prototype||Function.prototype.toString.call(constructor)!==(array?nativeArray:nativeObject))throw unsupported;
   seen.add(value);const keys=Reflect.ownKeys(value),result=array?[]:{};
   if(array&&(keys.length!==value.length+1||keys.at(-1)!=='length'))throw unsupported;
   for(let i=0;i<keys.length;i++){
    const key=keys[i];if(array&&key==='length')continue;
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||array&&key!==String(i)||!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))throw unsupported;
    const next=copy(descriptor.value,depth+1);
    if(key==='__proto__')Object.defineProperty(result,key,{value:next,enumerable:true,writable:true,configurable:true});else result[key]=next;
   }
   return result;
  };
  try{return copy(record);}catch{return clone(record);}
 }
 const equal=(a,b)=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const keys=Object.keys(a);return Array.isArray(a)===Array.isArray(b)&&keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));};
 const fields=new Set(['x','y','nextIds','number','name','templateId','editorType','mode','people','productCodes','bomSelections','bomProductCode','bomItems','machineIds','machineId','machineDetails','instructionSteps','instructions','ipqc','productInstructionSteps','productInstructions','mediaItems','media','mediaName','mediaType','productMediaItems','ipqcAssignments','ipqcQueryEnabled']);
 const rows=(content,w,s)=>content?.workspaces?.find(x=>x.id===w)?.stages?.[s]||[],row=(content,w,s,id)=>rows(content,w,s).find(x=>x.id===id),scope=(w,s)=>JSON.stringify([w,s]),nodeKey=(w,s,id)=>JSON.stringify([w,s,id]);
 class Journal {
  constructor(content,record={}){
   this.content=content;this.entries=record.entries||{};this.pending=record.pending||null;this.dependencies=record.dependencies||{};this.baselines=record.baselines||{};this.forms=record.forms||{};this.history={};this.redoHistory={};this.epoch=0;this.cache=new Map();this.views=new Map();
   for(const collection of [this.entries,this.pending?.entries||{}])for(const [key,e]of Object.entries(collection)){
    if(!e||typeof e.w!=='string'||typeof e.s!=='string'||typeof e.id!=='string'||key!==this.token(e.w,e.s,e.id,e.f)||e.f!=='$node'&&!fields.has(e.f)||e.f==='$node'&&(e.value!==null&&(!e.value||e.value.id!==e.id||e.value.stageCode!==e.s))||['x','y'].includes(e.f)&&!Number.isFinite(e.value)||e.f==='nextIds'&&(!Array.isArray(e.value)||e.value.some(id=>typeof id!=='string')))throw Error('INVALID_CANVAS_RECOVERY');
   }
   for(const map of [this.dependencies,this.baselines,this.forms])if(!map||typeof map!=='object'||Array.isArray(map))throw Error('INVALID_CANVAS_RECOVERY');
   for(const [k,d]of Object.entries(this.dependencies))if(!d||k!==nodeKey(d.w,d.s,d.id)||!d.value||d.value.id!==d.id)throw Error('INVALID_CANVAS_RECOVERY');
   for(const [k,f]of Object.entries(this.forms)){let parts;try{parts=JSON.parse(k);}catch{throw Error('INVALID_CANVAS_RECOVERY');}if(!Array.isArray(parts)||parts.length!==3||!f?.original||!f?.draft||f.original.id!==parts[2]||f.draft.id!==parts[2]||f.draft.stageCode!==parts[1]||typeof f.isNew!=='boolean')throw Error('INVALID_CANVAS_RECOVERY');}
   if(record.version!==undefined&&record.version!==2)throw Error('INVALID_CANVAS_RECOVERY');
   if(this.pending?.command&&(!Array.isArray(this.pending.patches)||!equal(this.pending.command.patches,this.pending.patches)||!equal(this.pending.command.guards||[],this.pending.guards||[])||!this.pending.command.operationId||this.pending.command.action!=='apply'||!Array.isArray(this.pending.command.patches)))throw Error('INVALID_CANVAS_RECOVERY');
  }
  token(w,s,id,f){return JSON.stringify([w,s,id,f]);}
  changed(){this.epoch++;this.cache.clear();}
  remember(w,s,id){const k=nodeKey(w,s,id);if(!Object.hasOwn(this.baselines,k))this.baselines[k]=clone((this.views.get(scope(w,s))||rows(this.content,w,s)).find(o=>o.id===id))??null;return this.baselines[k];}
  project(w,s,input){
   const key=scope(w,s);if(input!==undefined)this.views.set(key,input);else input=this.views.get(key)||rows(this.content,w,s);const cached=this.cache.get(key);if(cached?.input===input&&cached.epoch===this.epoch)return cached.rows;
   const list=input.map(o=>({...o})),byId=new Map(list.map(o=>[o.id,o]));
   for(const e of Object.values(this.entries))if(e.w===w&&e.s===s&&e.f==='$node'){if(e.value===null)byId.delete(e.id);else byId.set(e.id,clone(e.value));}
   for(const e of Object.values(this.entries))if(e.w===w&&e.s===s&&e.f!=='$node'){
    if(!byId.has(e.id)&&this.baselines[nodeKey(w,s,e.id)]&&!this.entries[this.token(w,s,e.id,'$node')])byId.set(e.id,clone(this.baselines[nodeKey(w,s,e.id)]));
    if(byId.has(e.id))byId.get(e.id)[e.f]=clone(e.value);
   }
   const result=[...byId.values()];this.cache.set(key,{input,epoch:this.epoch,rows:result});return result;
  }
  set(w,s,id,f,value){
   if(f!=='$node'&&!fields.has(f))throw Error('CANVAS_FIELD_INVALID');
   const nk=this.token(w,s,id,'$node'),node=this.entries[nk],original=this.remember(w,s,id),k=this.token(w,s,id,f);
   if(f!=='$node'&&node?.value){node.value[f]=clone(value);return;}
   if(f!=='$node'&&!original)throw Error('OPERATION_REMOVED: '+id);
   const base=this.entries[k]?this.entries[k].base:clone(f==='$node'?original:original[f]);
   if(equal(base,value)&&!this.pending?.entries[k])delete this.entries[k];else this.entries[k]={w,s,id,f,base:clone(base),value:clone(value)};
  }
  edit(w,s,changes){
   const before=this.project(w,s),reverse=[];
   // Validate the whole local change first; a malformed entry cannot half-edit a batch.
   for(const c of changes){if(!fields.has(c.f))throw Error('CANVAS_FIELD_INVALID');const old=before.find(o=>o.id===c.id);if(!old)throw Error('OPERATION_REMOVED: '+c.id);if(!equal(old[c.f],c.value))reverse.push({id:c.id,f:c.f,value:clone(old[c.f])});}
   if(!reverse.length)return;for(const c of changes)this.set(w,s,c.id,c.f,c.value);this.track(w,s,reverse);this.changed();
  }
  track(w,s,reverse){(this.history[scope(w,s)]||=[]).push(reverse);this.redoHistory[scope(w,s)]=[];}
  operation(w,s,next,original){
   if(!next||typeof next.id!=='string'||next.stageCode!==s)throw Error('OPERATION_STRUCTURE_INVALID');
   const old=this.project(w,s).find(o=>o.id===next.id);
   if(original&&!equal(old,original))throw Error('DEPENDENCY_CHANGED_RECONFIRM');
   if(!old){this.set(w,s,next.id,'$node',next);this.track(w,s,[{id:next.id,f:'$node',value:null}]);this.changed();return;}
   const changed=Object.keys(next).filter(f=>fields.has(f)&&!equal(next[f],old[f]));
   if(!changed.length)return;
   const baseline=this.remember(w,s,next.id);if(baseline)this.dependencies[nodeKey(w,s,next.id)]={w,s,id:next.id,value:clone(baseline)};
   this.edit(w,s,changed.map(f=>({id:next.id,f,value:next[f]})));
  }
  remove(w,s,id){
   const list=this.project(w,s),old=list.find(o=>o.id===id);if(!old)throw Error('OPERATION_REMOVED');
   const reverse=[{id,f:'$node',value:clone(old)}],base=this.remember(w,s,id),pendingNode=this.pending?.entries[this.token(w,s,id,'$node')];
   if(base)this.dependencies[nodeKey(w,s,id)]={w,s,id,value:clone(base)};
   for(const [k,e]of Object.entries(this.entries))if(e.w===w&&e.s===s&&e.id===id)delete this.entries[k];
   if(base||pendingNode)this.entries[this.token(w,s,id,'$node')]={w,s,id,f:'$node',base:clone(base),value:null};
   for(const o of list)if(o.id!==id&&o.nextIds?.includes(id)){reverse.push({id:o.id,f:'nextIds',value:clone(o.nextIds)});const original=this.remember(w,s,o.id);if(original)this.dependencies[nodeKey(w,s,o.id)]={w,s,id:o.id,value:clone(original)};this.set(w,s,o.id,'nextIds',o.nextIds.filter(x=>x!==id));}
   this.track(w,s,reverse);this.changed();
  }
  travel(w,s,redo=false){
   const key=scope(w,s),from=redo?this.redoHistory:this.history,to=redo?this.history:this.redoHistory,changes=from[key]?.at(-1);if(!changes)return;
   const list=this.project(w,s),reverse=changes.map(c=>({id:c.id,f:c.f,value:clone(c.f==='$node'?list.find(o=>o.id===c.id)??null:list.find(o=>o.id===c.id)?.[c.f])}));
   for(const c of changes){if(c.f==='$node'){for(const [k,e]of Object.entries(this.entries))if(e.w===w&&e.s===s&&e.id===c.id)delete this.entries[k];if(c.value===null)this.set(w,s,c.id,'$node',null);else if(this.remember(w,s,c.id)){for(const f of fields)if(!equal(c.value[f],this.remember(w,s,c.id)[f]))this.set(w,s,c.id,f,c.value[f]);}else this.set(w,s,c.id,'$node',c.value);}else this.set(w,s,c.id,c.f,c.value);}
   from[key].pop();(to[key]||=[]).push(reverse);this.changed();
  }
  conflicts(w,s){
   const conflicts=[],active=new Set();for(const e of Object.values(this.entries))if(w===undefined||e.w===w&&e.s===s){active.add(nodeKey(e.w,e.s,e.id));const o=row(this.content,e.w,e.s,e.id),current=e.f==='$node'?o??null:o?.[e.f];if(e.f!=='$node'&&!o||!equal(current,e.base))conflicts.push({workspace:e.w,stage:e.s,id:e.id,field:e.f,removed:!o});}
   for(const [k,d]of Object.entries(this.dependencies))if(active.has(k)&&!equal(row(this.content,d.w,d.s,d.id)??null,d.value))conflicts.push({workspace:d.w,stage:d.s,id:d.id,field:'operation'});
   return conflicts;
  }
  review(w,s,content){
   const entries=Object.values(this.entries).filter(e=>e.w===w&&e.s===s),projected=this.project(w,s,undefined),changes=[],blockers=[];
   for(const e of entries){const latest=row(content,w,s,e.id),value=e.f==='$node'?latest??null:latest?.[e.f];
    changes.push({id:e.id,field:e.f,before:clone(e.base),latest:clone(value),mine:clone(e.value),conflict:!equal(value,e.base)});
    if(e.f!=='$node'&&!latest)blockers.push({id:e.id,reason:'OPERATION_REMOVED'});
    if(e.f==='$node'&&e.value&&latest)blockers.push({id:e.id,reason:'OPERATION_ID_ALREADY_EXISTS'});
    if(e.f==='$node'&&e.value===null&&latest){const candidates=[...rows(content,w,s),...entries.filter(x=>x.f==='$node'&&x.value&&!x.base).map(x=>x.value)];for(const source of candidates){const node=this.entries[this.token(w,s,source.id,'$node')],next=this.entries[this.token(w,s,source.id,'nextIds')];if(node?.value===null)continue;if((next?.value||node?.value?.nextIds||source.nextIds)?.includes(e.id))blockers.push({id:e.id,source:source.id,reason:'NEW_INCOMING_CONNECTION'});}}
   }
   for(const d of Object.values(this.dependencies))if(d.w===w&&d.s===s&&entries.some(e=>e.id===d.id)&&!equal(row(content,w,s,d.id)??null,d.value))changes.push({id:d.id,field:'operation',before:clone(d.value),latest:clone(row(content,w,s,d.id)??null),mine:clone(projected.find(o=>o.id===d.id)??null),conflict:true});
   return {workspace:w,stage:s,epoch:this.epoch,content,changes,blockers};
  }
  resolveReview(review,decision){
   if(this.pending)throw Error('CANVAS_RECEIPT_REQUIRED');if(review.epoch!==this.epoch)throw Error('CANVAS_REVIEW_CHANGED');if(!['latest','mine'].includes(decision))throw Error('CANVAS_REVIEW_REQUIRED');
   const {workspace:w,stage:s,content}=review;if(decision==='mine'&&review.blockers.length)throw Object.assign(Error('CANVAS_REVIEW_UNSAFE'),{details:{conflicts:review.blockers}});
   if(decision==='latest')this.discard(w,s);else{
    for(const [k,e]of Object.entries(this.entries))if(e.w===w&&e.s===s){const latest=row(content,w,s,e.id),base=e.f==='$node'?latest??null:latest[e.f];if(equal(base,e.value))delete this.entries[k];else e.base=clone(base);this.baselines[nodeKey(w,s,e.id)]=clone(latest)??null;}
    for(const [k,d]of Object.entries(this.dependencies))if(d.w===w&&d.s===s){const latest=row(content,w,s,d.id);if(latest&&Object.values(this.entries).some(e=>e.w===w&&e.s===s&&e.id===d.id))d.value=clone(latest);else delete this.dependencies[k];}
    delete this.history[scope(w,s)];delete this.redoHistory[scope(w,s)];this.changed();
   }
   this.content=content;this.views.set(scope(w,s),rows(content,w,s));this.cache.clear();
  }
  freeze(w,s){
   if(this.pending)throw Error('CANVAS_RECEIPT_REQUIRED');if(w===undefined||s===undefined){const scopes=this.counts().scopes;if(scopes.length!==1)throw Error('CANVAS_SCOPE_REQUIRED');[w,s]=scopes[0]||[];}if(!w||!s)throw Error('CANVAS_SCOPE_REQUIRED');
   const conflicts=this.conflicts(w,s);if(conflicts.length)throw Object.assign(Error('CANVAS_CONFLICT'),{details:{conflicts}});
   const entries={},patches=[],guards=[],dependencies={},active=new Set(),stagePath=['workspaces',{id:w},'stages',s],workspace=this.content.workspaces.find(x=>x.id===w);
   for(const [k,e]of Object.entries(this.entries))if(e.w===w&&e.s===s){entries[k]=clone(e);active.add(nodeKey(w,s,e.id));}
   if(Object.keys(entries).length&&!workspace){let category,line;try{[category,line]=JSON.parse(w);}catch{throw Error('AUTHORING_SCOPE_INVALID');}patches.push({op:'insert',path:['workspaces'],value:{id:w,category,line,stages:{[s]:[]}}});}
   else if(Object.keys(entries).length&&!Object.hasOwn(workspace.stages,s)){patches.push({op:'set',path:stagePath,value:[]});guards.push({path:stagePath,value:undefined});}
   for(const e of Object.values(entries)){const path=[...stagePath,{id:e.id}];if(e.f==='$node'){if(e.value===null){patches.push({op:'remove',path});guards.push({path,value:clone(e.base)});}else if(!e.base)patches.push({op:'insert',path:stagePath,value:clone(e.value)});else throw Error('CANVAS_REPLACE_FORBIDDEN');}else{patches.push({op:'set',path:[...path,e.f],value:clone(e.value)});guards.push({path:[...path,e.f],value:clone(e.base)});}}
   for(const [k,d]of Object.entries(this.dependencies))if(active.has(k)){dependencies[k]=clone(d);if(!guards.some(g=>equal(g.path,[...stagePath,{id:d.id}])))guards.push({path:[...stagePath,{id:d.id}],value:clone(d.value)});}
   if(patches.length>256)throw Error('CANVAS_BATCH_LIMIT_256');
   return {workspace:w,stage:s,entries,dependencies,patches,guards};
  }
  sent(batch){this.pending=batch;this.history[scope(batch.workspace,batch.stage)]=[];this.redoHistory[scope(batch.workspace,batch.stage)]=[];}
  acknowledge(batch,content){
   const acknowledged={};
   for(const sent of Object.values(batch.entries)){const nk=nodeKey(sent.w,sent.s,sent.id);if(!Object.hasOwn(acknowledged,nk))acknowledged[nk]=clone(this.baselines[nk]??row(this.content,sent.w,sent.s,sent.id))??null;if(sent.f==='$node')acknowledged[nk]=clone(sent.value);else if(acknowledged[nk])acknowledged[nk][sent.f]=clone(sent.value);}
   for(const [k,sent]of Object.entries(batch.entries)){
    const desired=this.entries[k];if(!desired||equal(desired.value,sent.value))delete this.entries[k];else desired.base=clone(sent.value);
    if(sent.f==='$node'&&sent.value&&desired&&!equal(desired.value,sent.value)&&desired.value){delete this.entries[k];for(const f of fields)if(!equal(desired.value[f],sent.value[f]))this.entries[this.token(sent.w,sent.s,sent.id,f)]={w:sent.w,s:sent.s,id:sent.id,f,base:clone(sent.value[f]),value:clone(desired.value[f])};}
   }
   for(const [nk,baseline]of Object.entries(acknowledged)){
    this.baselines[nk]=baseline;const [w,s,id]=JSON.parse(nk),node=this.entries[this.token(w,s,id,'$node')];if(node)node.base=clone(baseline);
    const remains=Object.values(this.entries).some(e=>nodeKey(e.w,e.s,e.id)===nk);
    if(this.dependencies[nk]){if(remains)this.dependencies[nk].value=clone(baseline);else delete this.dependencies[nk];}if(!remains)delete this.baselines[nk];
   }
   if(batch.workspace&&batch.stage)this.views.delete(scope(batch.workspace,batch.stage));this.content=content;this.pending=null;this.changed();
  }
  counts(w,s){const moves=new Set(),scopes=new Set(),nodes=new Set();let added=0,removed=0,created=0,deleted=0,fieldsCount=0;for(const e of Object.values(this.entries)){if(w!==undefined&&(e.w!==w||e.s!==s))continue;fieldsCount++;scopes.add(scope(e.w,e.s));nodes.add(nodeKey(e.w,e.s,e.id));if(e.f==='nextIds'){added+=(e.value||[]).filter(id=>!(e.base||[]).includes(id)).length;removed+=(e.base||[]).filter(id=>!(e.value||[]).includes(id)).length;}else if(e.f==='$node'){if(e.value)created++;else deleted++;}else if(e.f==='x'||e.f==='y')moves.add(nodeKey(e.w,e.s,e.id));}return {moves:moves.size,added,removed,created,deleted,nodes:nodes.size,scopes:[...scopes].map(JSON.parse),fields:fieldsCount};}
  discard(w,s){if(this.pending)throw Error('CANVAS_RECEIPT_REQUIRED');for(const map of [this.entries,this.dependencies,this.baselines])for(const k of Object.keys(map)){const parts=JSON.parse(k);if(parts[0]===w&&parts[1]===s)delete map[k];}delete this.history[scope(w,s)];delete this.redoHistory[scope(w,s)];this.changed();}
  record(){return {version:2,entries:this.entries,pending:this.pending,dependencies:this.dependencies,baselines:this.baselines,forms:this.forms};}
 }
 host.CanvasJournal=Journal;
 if(typeof document==='undefined')return;
 const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
 let projectionBase=null;
 let journal=null,identity='',client=null,running=null,note='',lastBatch=0,storageError='',tabStorageError='',ready=false,persistTimer=null,tabReady=false,departureLease=null;
 const departureRuntimePins=new WeakMap(),postReadbacks=new WeakSet();
 const api=()=>host.ProcessAuthoringV3,actor=()=>host.ProcessSync?.identity?.id;
 const owner=()=>({id:actor(),epoch:host.ProcessSync?.identityGeneration?.(),object:host.ProcessSync?.identity,delivery:host.ProcessSync?.captureDelivery?.()});
 const owns=o=>o.id===actor()&&!host.ProcessSync?.requiresReload&&(typeof o.epoch==='number'?o.epoch===host.ProcessSync?.identityGeneration?.():o.object===host.ProcessSync?.identity)&&(!o.delivery||host.ProcessSync?.isCurrentDelivery?.(o.delivery)!==false);
 const checkLease=lease=>{if(!lease||lease!==departureLease||!lease.current())throw Error('CANVAS_DEPARTURE_LOCKED');};
 const admit=lease=>{if(departureLease&&lease!==departureLease)throw Error('CANVAS_DEPARTURE_LOCKED');if(lease)checkLease(lease);};
 const current=()=>host.ProcessEditorV2?.currentCanvas?.()||(()=>{const scopes=journal?journalStats(journal).counts.scopes:[];return scopes.length===1?{workspace:scopes[0][0],stage:scopes[0][1]}:null;})();
 const confirmCanvas=message=>host.ProcessEditorV2?.confirm?host.ProcessEditorV2.confirm(message):Promise.resolve(confirm(message));
 const events=[];function timing(name,started){events.push({name,ms:Math.round((performance.now()-started)*100)/100,at:new Date().toISOString()});if(events.length>100)events.shift();}
 // Every document runtime writes an independent key. Historical payloads are
 // never read by accept()/project(); only an explicit successful claim may read.
 let recovery=null,recoveryBase='',recoveryStamp=null,recoveryVerified=null,recoveryRevision=0;
 const recoveryQuarantine=new Map();
 const recoveryBaseOf=flow=>JSON.stringify([flow?.generation,flow?.revision,flow?.saved?.id||null]);
 const authority=()=>api()?.recoveryAuthority?.()||{};
 const journalStatsCache=new WeakMap();
 function journalStats(value){const old=journalStatsCache.get(value);if(old?.revision===recoveryRevision&&old.epoch===value.epoch&&old.pending===value.pending)return old;const next={revision:recoveryRevision,epoch:value.epoch,pending:value.pending,counts:value.counts(),formCount:Object.keys(value.forms).length,canvases:new Map()};journalStatsCache.set(value,next);return next;}
 function canvasCounts(value,w,s){const cached=journalStats(value),key=scope(w,s);if(!cached.canvases.has(key))cached.canvases.set(key,value.counts(w,s));return cached.canvases.get(key);}
 const journalDirty=value=>!!value&&(!!journalStats(value).counts.fields||!!value.pending||!!journalStats(value).formCount);
 const runtimeCurrent=()=>!!recoveryStamp&&owns(recoveryStamp)&&recoveryStamp.generation===api()?.flow()?.generation;
 const captureRecoveryOwner=()=>({...owner(),runtimeEpoch:recovery?.status().runtimeEpoch});
 const ownsRuntime=(stamp,session=recovery)=>owns(stamp)&&!!session&&recovery===session&&session.status().ready===true&&stamp.runtimeEpoch===session.status().runtimeEpoch;
 const recoveryError=result=>Object.assign(Error(result?.code||'CANVAS_RECOVERY_UNAVAILABLE'),{code:result?.code});
 function recoveryContext(stamp,base){
  const a=authority(),current=owns(stamp)&&stamp.generation===api()?.flow()?.generation,verified=recoveryVerified?.current?.()===true?recoveryVerified:null;
  return{actorId:actor(),epoch:host.ProcessSync?.identityGeneration?.(),scope:'process:platform',baseVersion:verified?.baseVersion||base,
   canView:current&&a.canView===true,canEdit:a.canEdit===true,pending:verified?!!verified.flow.pendingId:!!a.pending,
   verified:!!verified,hasLocalChanges:journalDirty(journal)||!!a.hasOpenForm||!!a.interacting,localRevision:recoveryRevision,writeState:journal?.pending?'unknown':'idle'};
 }
 function newRecovery(flow,handoff){
  const stamp={...owner(),generation:flow.generation},base=recoveryBaseOf(flow);
  if(!host.CanvasRecoveryStore)throw Error('CANVAS_RECOVERY_UNAVAILABLE');
  const session=host.CanvasRecoveryStore.create({handoff,getContext:()=>recoveryContext(stamp,base),onStatus:result=>{
   if(session!==recovery||!owns(stamp))return;tabReady=result.ready===true;ready=tabReady&&!!journal;if(result.code==='SCHEDULED')return;
   storageError=result.ok||result.code==='EMPTY'?'':t('本機恢復存檔未完成；內容仍留在目前頁面，請勿關閉。','Chưa lưu khôi phục; nội dung còn trên trang, đừng đóng.')+' '+result.code;update();
  }});
  recovery=session;recoveryStamp=stamp;recoveryBase=base;recoveryVerified=null;identity=JSON.stringify([stamp.id,stamp.epoch,flow.generation]);ready=false;tabReady=false;
  void session.ready.then(result=>{if(session!==recovery||!runtimeCurrent())return;tabReady=session.status().ready===true;ready=tabReady&&!!journal;tabStorageError=session.status().canRecover===false?t('此瀏覽器無可靠分頁鎖；新編輯可同步，關閉或重載後的獨立副本不能恢復。','Trình duyệt thiếu khóa tab; có thể đồng bộ chỉnh sửa mới, nhưng không khôi phục bản riêng sau khi đóng hoặc tải lại.'):result.ok?'':result.code;update();});
  return session;
 }
 function persistNow(){clearTimeout(persistTimer);persistTimer=null;if(!journal||!recovery||!runtimeCurrent())return;const session=recovery;let result;if(journal.pending)result=session.flushPending(journal.pending.reservation);else{const scheduled=session.schedule(()=>localRecord(journal));result=scheduled.ok?session.flush():scheduled;}if(!result.ok&&result.code!=='EMPTY')storageError=t('本機恢復存檔失敗；請勿關閉頁面。','Không lưu được khôi phục; đừng đóng trang.')+' '+result.code;update();return result;}
 function persist(){if(!journal||!recovery||!runtimeCurrent())return;if(journal.pending)recovery.schedulePending(journal.pending.reservation,()=>localRecord(journal));else recovery.schedule(()=>localRecord(journal));update();api()?.updateLocalSaveState?.();}
 function makeClient(legacy=false){return host.createSharedDraftClient({endpoint:'/api/process-authoring/workflow?caseMetadata=1&channel='+(legacy?'canvas':'canvas-v2'),actorId:actor(),headers:()=>host.ProcessSync.platformHeaders(),externalDurableCanvas:{assertDispatch(command){if(!runtimeCurrent()||journal?.pending?.command?.operationId!==command.operationId)throw Error('CANVAS_RECOVERY_CHANGED');return recovery.assertDispatch(command)===true;}}});}
 function accept(flow){
  if(!flow||!actor()||authority().canView!==true){ready=false;update();return;}
  if(!runtimeCurrent()){
   if(recovery){if(journalDirty(journal))recoveryQuarantine.set(recovery.key,{journal,base:recoveryBase});recovery.close();}
   projectionBase=null;journal=new Journal(flow.working);client=makeClient();recoveryRevision++;note='';storageError='';
   try{newRecovery(flow);}catch(error){ready=false;tabReady=false;note=error.message;}
  }else{if(journal)journal.content=flow.working;tabReady=recovery?.status().ready===true;ready=tabReady&&!!journal;}
  update();
 }
 function emptyRecoveryTarget(){const a=authority();return !journalDirty(journal)&&!a.hasOpenForm&&!a.interacting&&!a.busy&&!running&&!departureLease;}
 function requireRecoveryCurrent(session,stamp,revision){if(recovery!==session||!ownsRuntime(stamp,session)||!runtimeCurrent()||recoveryRevision!==revision||!session.status().ready||authority().canView!==true)throw Error('CANVAS_RECOVERY_CHANGED');}
 function verifyRecoveryRead(result,base){const a=authority(),fresh=result?.control?.workflow,currentFlow=api()?.flow();if(result?.permissions?.view!==true||!fresh?.working||fresh.generation!==currentFlow?.generation||fresh.revision<currentFlow?.revision||base&&recoveryBaseOf(fresh)!==base)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');if(result.permissions.edit!==true||fresh.pendingId||a.canEdit!==true||!result.control?.versions?.some(v=>v.status==='draft'))throw Error('PENDING_OR_PERMISSION_LOCKED');return fresh;}
 async function previewRecovery(key){const session=recovery,stamp=captureRecoveryOwner(),revision=recoveryRevision;if(!session)throw Error('CANVAS_RECOVERY_UNAVAILABLE');const claimed=await session.claim(key);requireRecoveryCurrent(session,stamp,revision);if(!claimed.ok)throw recoveryError(claimed);const result=session.preview(key);if(!result.ok)throw recoveryError(result);return result;}
 async function restoreRecovery(key,confirmPreview=()=>confirmCanvas(t('將這份副本恢復至目前本機？不會同步；之後仍須核對並手動同步。','Khôi phục bản này vào trang? Chưa đồng bộ; vẫn phải kiểm tra và đồng bộ thủ công.'))){
  admit();if(!emptyRecoveryTarget())throw Error('LOCAL_INPUT_REQUIRES_ACTION');const session=recovery,stamp=captureRecoveryOwner(),revision=recoveryRevision,pin=api().captureCanvasRecovery();
  const claimed=await session.claim(key);requireRecoveryCurrent(session,stamp,revision);if(!claimed.ok)throw recoveryError(claimed);
  let selected=session.preview(key);if(!selected.ok)throw recoveryError(selected);if(selected.kind!=='local')throw Error('CANVAS_RECEIPT_REQUIRED');
  const first=await api().readCanvasRecovery(pin);requireRecoveryCurrent(session,stamp,revision);const firstFlow=verifyRecoveryRead(first),base=recoveryBaseOf(firstFlow);if(selected.baseVersion!==base)throw Error('RECOVERY_BASE_CHANGED');
  recoveryVerified={baseVersion:base,flow:firstFlow,current:()=>recovery===session&&owns(stamp)&&recoveryRevision===revision};selected=session.preview(key);if(!selected.ok)throw recoveryError(selected);
  try{
   if(!await confirmPreview(selected))return false;requireRecoveryCurrent(session,stamp,revision);if(!emptyRecoveryTarget())throw Error('LOCAL_INPUT_REQUIRES_ACTION');
   const second=await api().readCanvasRecovery(pin);requireRecoveryCurrent(session,stamp,revision);const fresh=verifyRecoveryRead(second,base);if(!emptyRecoveryTarget())throw Error('LOCAL_INPUT_REQUIRES_ACTION');
   recoveryVerified={baseVersion:base,flow:fresh,current:()=>recovery===session&&owns(stamp)&&recoveryRevision===revision};const restored=session.restore(selected.token);if(!restored.ok)throw recoveryError(restored);const candidate=new Journal(fresh.working,restored.payload);if(candidate.pending)throw Error('CANVAS_RECEIPT_REQUIRED');
   api().acceptCanvasRecovery(second,{replaceEditor:true});requireRecoveryCurrent(session,stamp,revision);
   let next;try{next=newRecovery(fresh,restored.handoff);projectionBase=fresh.working;journal=candidate;recoveryRevision++;const nextEpoch=next.status().runtimeEpoch;await next.ready;if(next!==recovery||!runtimeCurrent()||!next.status().ready||next.status().runtimeEpoch!==nextEpoch)throw Error('CANVAS_RECOVERY_HANDOFF_UNAVAILABLE');}
   catch(error){host.CanvasRecoveryStore.releaseHandoff(restored.handoff);if(owns(stamp)){storageError=t('恢復接手未完成；原副本與目前記憶體內容仍保留，請勿關閉。','Chưa nhận quyền khôi phục; giữ bản gốc và nội dung trong bộ nhớ, đừng đóng.');update();}throw error;}
   session.close();note=t('已明確恢復至本機；尚未同步。','Đã khôi phục cục bộ; chưa đồng bộ.');persistNow();api()?.updateLocalSaveState?.();host.ProcessEditorV2?.refreshRecovery?.();return true;
  }finally{if(recovery===session)recoveryVerified=null;}
 }
 async function discardRecovery(key,confirmPreview=()=>confirmCanvas(t('只刪除此本機副本？不會修改共用草稿或其他分頁。','Chỉ xóa bản cục bộ này? Không đổi bản chung hoặc tab khác.'))){
  admit();const session=recovery,stamp=captureRecoveryOwner(),revision=recoveryRevision,selected=await previewRecovery(key);if(selected.kind!=='local')throw Error('CANVAS_RECEIPT_REQUIRED');if(!await confirmPreview(selected))return false;requireRecoveryCurrent(session,stamp,revision);const result=session.discard(selected.token);if(!result.ok)throw recoveryError(result);update();return true;
 }
 function recoveryPreviewText(value){if(value===undefined||value===null)return t('無','Không có');if(typeof value==='string'){if(/^(?:data:|blob:)/i.test(value))return t('本機媒體（不在此載入）','Nội dung cục bộ (không tải ở đây)');return value.length>180?value.slice(0,180)+'…':value;}if(Array.isArray(value))return t(`${value.length} 項`,`${value.length} mục`);if(typeof value==='object')return typeof value.name==='string'?recoveryPreviewText(value.name):t('結構化內容','Nội dung có cấu trúc');return String(value);}
 async function openRecovery(){
  const session=recovery,stamp=captureRecoveryOwner();if(!session||authority().canView!==true)throw Error('CANVAS_RECOVERY_UNAVAILABLE');const listing=session.discover();if(!listing.ok)throw recoveryError(listing);
  const dialog=document.createElement('dialog');dialog.className='pe-shared-preview';dialog.dataset.i18nSkip='true';const add=(tag,text,parent=dialog)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
  add('h2',t('本機畫布恢復 · 不會自動同步','Khôi phục sơ đồ cục bộ · không tự đồng bộ'));add('p',t('只有取得原執行階段獨占鎖後才讀取副本。舊版紀錄原樣保留，不能自動匯入。照片仍保留於本機副本，這不是加密儲存。','Chỉ đọc bản sao sau khi giữ khóa độc quyền. Giữ nguyên dữ liệu cũ, không tự nhập. Ảnh còn trong bản cục bộ; đây không phải lưu trữ mã hóa.'));
  const message=add('p','');message.setAttribute('role','alert');const run=fn=>async()=>{try{if(!ownsRuntime(stamp,session))throw Error('CANVAS_RECOVERY_CHANGED');await fn();}catch(error){message.textContent=host.sharedDraftErrorMessage?.(error)||error.message;}};
  if(!listing.items?.length)add('p',t('沒有本版本可明確恢復的副本。','Không có bản sao có thể khôi phục của phiên bản này.'));
  for(const item of listing.items||[]){const section=add('section',''),summary=add('p',String(item.runtimeId||item.key),section),actions=add('div','',section);let detail;const button=(text,fn)=>{const b=add('button',text,actions);b.type='button';b.onclick=run(fn);};
   button(t('預覽','Xem trước'),async()=>{const preview=await previewRecovery(item.key),candidate=preview.kind==='local'?new Journal(api().flow().working,preview.payload):null;summary.textContent=candidate?t(`本機變更 ${candidate.counts().fields} 項；未完成表單 ${Object.keys(candidate.forms).length} 份。`,`Thay đổi: ${candidate.counts().fields}; biểu mẫu: ${Object.keys(candidate.forms).length}.`):preview.kind==='resolved'?t('原結果已確認；本機存檔尚待完成。','Kết quả đã xác nhận; cần hoàn tất lưu cục bộ.'):t('結果未知；只能查原操作收據。','Kết quả chưa rõ; chỉ kiểm tra biên nhận gốc.');detail?.remove();detail=add('div','',section);if(candidate){add('p',t('基準：','Cơ sở: ')+preview.baseVersion,detail);for(const entry of Object.values(candidate.entries).slice(0,30))add('p',entry.s+' / '+entry.id+' / '+entry.f+' · '+recoveryPreviewText(entry.base)+' → '+recoveryPreviewText(entry.value),detail);for(const form of Object.values(candidate.forms).slice(0,10))add('p',t('未完成表單：','Biểu mẫu chưa xong: ')+recoveryPreviewText(form.draft.name)+' · '+t('媒體數 ','Số nội dung ')+(Array.isArray(form.draft.mediaItems)?form.draft.mediaItems.length:0),detail);if(candidate.counts().fields>30||Object.keys(candidate.forms).length>10)add('p',t('僅顯示部分摘要；照片與大型內容不在預覽載入。','Chỉ hiển thị một phần; không tải ảnh hoặc nội dung lớn trong bản xem.'),detail);}else add('p',preview.reference?.operationId||'',detail);});
   button(t('查原收據','Kiểm tra biên nhận'),async()=>{await resolveRecovery(item.key);dialog.close();});button(t('完成已確認存檔','Hoàn tất lưu đã xác nhận'),async()=>{await finalizeRecovery(item.key);dialog.close();});button(t('恢復至本機','Khôi phục cục bộ'),async()=>{if(await restoreRecovery(item.key))dialog.close();});button(t('刪除此副本','Xóa bản này'),async()=>{if(await discardRecovery(item.key))section.remove();});
  }
  const close=add('button',t('關閉','Đóng'));close.type='button';close.onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
 }
 function ensure(){accept(api()?.flow());if(!ready||!recovery?.status().ready||!journal||!runtimeCurrent())throw Error('CANVAS_LOAD_REQUIRED');return journal;}
 function update(){const el=document.querySelector('.pe-local-status');if(!el)return;const at=current(),stats=journal?journalStats(journal):null,c=stats?.counts,formCount=stats?.formCount||0,here=at&&journal?canvasCounts(journal,at.workspace,at.stage):null;el.textContent=[lastBatch?t(`本批同步成功：${lastBatch} 項變更。`,`Đã đồng bộ ${lastBatch} thay đổi.`):'',note,storageError,tabStorageError,formCount?t(`另有 ${formCount} 個未完成表單，請開啟方塊繼續編輯。`,`Có ${formCount} biểu mẫu chưa hoàn tất; mở bước để tiếp tục.`):'',c?.fields?t(`目前畫布 ${here?.fields||0} 項；其他畫布 ${c.fields-(here?.fields||0)} 項尚未同步。只同步目前畫布；儲存不會代為同步。`,`Sơ đồ hiện tại: ${here?.fields||0}; sơ đồ khác: ${c.fields-(here?.fields||0)} thay đổi chưa đồng bộ. Lưu không tự đồng bộ.`):t('畫布已同步；手動儲存草稿是另一個步驟。','Sơ đồ đã đồng bộ; lưu bản nháp là bước riêng.')].filter(Boolean).join(' · ');el.title=c?.scopes.map(([w,s])=>w+' / '+s).join('\n')||'';const sync=document.querySelector('[data-pe="sync"]');if(sync){sync.disabled=!!departureLease||!!running||(!journal?.pending&&!api()?.canEditCanvas())||!ready;sync.textContent=running?t('同步中…','Đang đồng bộ…'):journal?.pending?t('查原批次收據','Kiểm tra biên nhận lô cũ'):t('同步目前畫布','Đồng bộ sơ đồ hiện tại');sync.title=!api()?.canEditCanvas()?t('待審或權限鎖定，保留本機內容。','Chờ duyệt hoặc thiếu quyền; giữ nội dung cục bộ.') : '';}}
 function localChange(fn){admit();if(!(api()?.canEditLocalCanvas?.()??api()?.canEditCanvas()))throw Error('PENDING_OR_PERMISSION_LOCKED');const start=performance.now();fn(ensure());recoveryRevision++;lastBatch=0;persist();timing('local-update',start);}
 const localRecord=value=>({...value.record(),pending:null});
 const referenceOf=batch=>({operationId:batch.command.operationId,generation:batch.command.generation,workspace:batch.workspace,stage:batch.stage,channel:batch.command.source?.startsWith('canvas-v2:')?'canvas-v2':'canvas'});
 const sameReference=(a,b)=>a?.operationId===b?.operationId&&a?.generation===b?.generation&&a?.workspace===b?.workspace&&a?.stage===b?.stage&&a?.channel===b?.channel;
 function reconcileReceiptSnapshot({payload,sent},flow){const candidate=new Journal(flow.working,payload);if(candidate.pending||!sent||!sent.workspace||!sent.stage||!Object.keys(sent.entries||{}).length||Object.values(sent.entries||{}).some(entry=>entry.w!==sent.workspace||entry.s!==sent.stage))throw Error('CANVAS_RECOVERY_SNAPSHOT_INVALID');new Journal(flow.working,{version:2,entries:sent.entries,dependencies:sent.dependencies,baselines:{},forms:{},pending:null});candidate.acknowledge(sent,flow.working);return candidate.record();}
 function advanceDepartureRuntime(previous,next,stamp,admitted){const pin=departureRuntimePins.get(departureLease);if(!pin||pin!==admitted||pin.session!==previous||pin.runtimeEpoch!==stamp.runtimeEpoch||!owns(pin.owner)||!owns(stamp)||previous.status().runtimeEpoch!==stamp.runtimeEpoch||!next.status().ready)return;pin.session=next;pin.runtimeEpoch=next.status().runtimeEpoch;}
 function requirePendingOwner(session,j,batch,stamp){if(recovery!==session||journal!==j||j.pending!==batch||!runtimeCurrent()||!session.status().ready||!ownsRuntime(stamp,session)||api()?.flow()?.generation!==batch.command.generation||authority().canView!==true)throw Error('CANVAS_RECOVERY_CHANGED');}
 async function finishCurrentReceipt(session,j,batch,stamp,receipt,fresh){
  requirePendingOwner(session,j,batch,stamp);const freshFlow=fresh.control?.workflow;if(!freshFlow?.working||freshFlow.generation!==batch.command.generation||!Number.isSafeInteger(freshFlow.revision)||freshFlow.revision<api().flow().revision)throw Error('CANVAS_RECOVERY_READBACK_REQUIRED');
  const queued=session.schedulePending(batch.reservation,()=>localRecord(j));if(!queued.ok)throw recoveryError(queued);const saved=session.flushPending(batch.reservation);if(!saved.ok)throw recoveryError(saved);
  const selected=session.preview(session.key);if(!selected.ok||!['unknown','resolved'].includes(selected.kind)||!sameReference(selected.reference,referenceOf(batch)))throw Error('CANVAS_RECEIPT_REQUIRED');
  // GET recovery and original-POST ACK have distinct private admissions.
  // Neither adoption alone can clear the durable local batch.
  if(postReadbacks.has(fresh)){postReadbacks.delete(fresh);api().acceptCanvasPost(fresh);}else api().acceptCanvasRecovery(fresh);requirePendingOwner(session,j,batch,stamp);
  recoveryVerified={baseVersion:recoveryBaseOf(freshFlow),flow:freshFlow,current:()=>recovery===session&&journal===j&&j.pending===batch&&owns(stamp)};
  let settled;try{settled=session.settleReceipt(selected.token,{receipt,workflow:{...freshFlow,scope:'process:platform'}},snapshot=>reconcileReceiptSnapshot(snapshot,freshFlow));}finally{recoveryVerified=null;}
  if(!settled.ok)throw recoveryError(settled);requirePendingOwner(session,j,batch,stamp);
  const candidate=new Journal(freshFlow.working,settled.payload);journal=candidate;projectionBase=freshFlow.working;recoveryRevision++;lastBatch=Object.keys(batch.entries).length;note=settled.cleanupPending?t('原批次已確認；部分隔離副本無法清理，仍保留原資料。','Đã xác nhận lô; chưa dọn được một số bản cách ly, vẫn giữ dữ liệu.'):'';
  const admitted=session.status().ready?departureRuntimePins.get(departureLease):null,locked=session.status().canRecover,transfer=locked?session.handoff():{ok:true,handoff:undefined};if(!transfer.ok)throw recoveryError(transfer);let next;
  try{next=newRecovery(freshFlow,transfer.handoff);const nextEpoch=next.status().runtimeEpoch;await next.ready;if(recovery!==next||!runtimeCurrent()||!owns(stamp)||!next.status().ready||next.status().runtimeEpoch!==nextEpoch)throw Error('CANVAS_RECOVERY_HANDOFF_UNAVAILABLE');advanceDepartureRuntime(session,next,stamp,admitted);const durable=persistNow();if(!locked&&durable?.ok&&durable.durable){const old=session.preview(session.key);if(old.ok&&old.kind==='local')session.discard(old.token);}session.close();
   if(locked&&durable?.ok&&durable.durable){const claimed=await next.claim(session.key);if(recovery===next&&runtimeCurrent()&&owns(stamp)&&next.status().runtimeEpoch===nextEpoch&&claimed.ok){const old=next.preview(session.key);if(old.ok&&old.kind==='local')next.discard(old.token);}}
   api()?.updateLocalSaveState?.();return {...freshFlow,revision:receipt.revision};}
  catch(error){host.CanvasRecoveryStore.releaseHandoff(transfer.handoff);if(!next?.status().ready)session.close();throw error;}
  finally{if(next?.status().ready)session.close();}
 }
 function retryKnownRejection(session,j,batch,stamp){
  if(!batch?.lastError||!session.retryRejected)return false;const restored=session.retryRejected(batch.reservation,batch.lastError);if(!restored.ok)return false;requirePendingOwner(session,j,batch,stamp);j.pending=null;client.discardRejected?.(batch.patches.map(p=>p.path));lastBatch=0;note=t('原批次已確認未寫入；本機內容保留，請再明確按同步。','Đã xác nhận lô chưa ghi; giữ nội dung cục bộ, hãy bấm đồng bộ rõ ràng lần nữa.');persistNow();api()?.updateLocalSaveState?.();return true;
 }
 async function resolveRecovery(key){
  admit();const session=recovery,stamp=captureRecoveryOwner(),revision=recoveryRevision,j=journal,batch=j?.pending,pin=api().captureCanvasRecovery();
  const claimed=await session.claim(key);requireRecoveryCurrent(session,stamp,revision);if(!claimed.ok)throw recoveryError(claimed);const selected=session.preview(key);if(!selected.ok)throw recoveryError(selected);if(!['unknown','resolved'].includes(selected.kind))throw Error('CANVAS_RECEIPT_REQUIRED');if(selected.kind==='resolved'&&selected.outcome==='aborted')return finalizeRecovery(key);
  const own=key===session.key&&batch&&sameReference(selected.reference,referenceOf(batch));if(batch&&!own)throw Error('CANVAS_RECEIPT_REQUIRED');
  if(own&&retryKnownRejection(session,j,batch,stamp))return true;
  const ownedClient=own?client:makeClient(selected.reference.channel==='canvas');
  const result=await (own&&api()?.ownedLedger?api().ownedLedger.resolve(ownedClient,'receipt',[selected.reference.operationId,selected.reference.generation]):ownedClient.receipt(selected.reference.operationId,selected.reference.generation));
  if(own)requirePendingOwner(session,j,batch,stamp);else requireRecoveryCurrent(session,stamp,revision);
  const fresh=await api().readCanvasRecovery(pin);
  if(own)return await finishCurrentReceipt(session,j,batch,stamp,result.receipt,fresh);
  requireRecoveryCurrent(session,stamp,revision);const freshFlow=fresh.control?.workflow;
  recoveryVerified={baseVersion:recoveryBaseOf(freshFlow),flow:freshFlow,current:()=>recovery===session&&owns(stamp)&&recoveryRevision===revision};
  try{const settled=session.settleReceipt(selected.token,{receipt:result.receipt,workflow:{...freshFlow,scope:'process:platform'}},snapshot=>reconcileReceiptSnapshot(snapshot,freshFlow));if(!settled.ok)throw recoveryError(settled);note=t('原收據已確認；剩餘副本仍須明確預覽及恢復，目前輸入未變。','Đã xác nhận biên nhận; bản còn lại vẫn cần xem và khôi phục rõ ràng. Đầu vào hiện tại giữ nguyên.');update();return true;}finally{if(recovery===session)recoveryVerified=null;}
 }
 async function finalizeRecovery(key){
  admit();const session=recovery,stamp=captureRecoveryOwner(),revision=recoveryRevision,j=journal,batch=j?.pending,selected=await previewRecovery(key);if(selected.kind!=='resolved')throw Error('CANVAS_DISPOSITION_REQUIRED');
  const own=key===session.key&&batch&&sameReference(selected.reference,referenceOf(batch));if(batch&&!own)throw Error('CANVAS_RECEIPT_REQUIRED');
  if(own&&selected.outcome!=='aborted')return resolveRecovery(key);
  const finalized=session.finalizeDisposition(selected.token);if(!finalized.ok)throw recoveryError(finalized);requireRecoveryCurrent(session,stamp,revision);
  if(own){j.pending=null;client.discardRejected?.(batch.patches.map(p=>p.path));persistNow();api()?.updateLocalSaveState?.();}note=t('已完成原結果的本機存檔；未送出新同步，歷史副本仍須明確恢復。','Đã hoàn tất lưu kết quả cục bộ; không gửi đồng bộ mới, bản cũ vẫn cần khôi phục rõ ràng.');update();return true;
 }
 async function sync(w,s){
  admit();if(running)return running;const j=ensure(),session=recovery,stamp=captureRecoveryOwner(),ownedClient=client,pin=api().captureCanvasRecovery();
  if(!j.pending&&!api().canEditCanvas())throw Error('PENDING_OR_PERMISSION_LOCKED');const at=current();let batch;
  try{batch=j.pending||j.freeze(w??at?.workspace,s??at?.stage);}catch(error){note=t('整批保留；請核對共享內容：','Giữ nguyên cả lô; đối chiếu nội dung chung: ')+(error.details?.conflicts||[]).map(c=>c.stage+' / '+c.id+' / '+c.field).join('、');update();throw error;}
  if(j.pending&&retryKnownRejection(session,j,batch,stamp))return api().flow();
  if(!batch.patches.length)return api().flow();
  if(!batch.command){
   batch.command=ownedClient.prepare(api().flow().generation,'apply',{patches:batch.patches,guards:batch.guards,source:'canvas-v2:'+JSON.stringify([batch.workspace,batch.stage])});
   const prepared=session.prepareWrite({reference:referenceOf(batch),sent:{workspace:batch.workspace,stage:batch.stage,entries:batch.entries,dependencies:batch.dependencies},readPayload:()=>localRecord(j)});batch.reservation=prepared.reservation;
   if(!prepared.ok||!prepared.durable){const cancelled=prepared.reservation&&session.cancelPrepared(prepared.reservation);if(!cancelled?.ok&&prepared.reservation){batch.sent=true;j.sent(batch);}storageError=t('本機恢復存檔未確認；未送出同步，請保留此頁。','Chưa xác nhận lưu khôi phục; chưa gửi đồng bộ, hãy giữ trang.')+' '+prepared.code;update();throw Error('RECOVERY_STORAGE_UNAVAILABLE');}
   j.sent(batch);
  }
  running=(async()=>{
   const started=performance.now();
   try{
    let result,postTicket=null;if(batch.sent){result=await (api()?.ownedLedger?api().ownedLedger.resolve(ownedClient,'receipt',[batch.command.operationId,batch.command.generation]):ownedClient.receipt(batch.command.operationId,batch.command.generation));}
    else{postTicket=api().prepareCanvasPost?.(pin,ownedClient,batch.command)||null;batch.sent=true;result=await session.dispatchPrepared(batch.reservation,batch.command,command=>api()?.ownedLedger?api().ownedLedger.sendPrepared(ownedClient,command,()=>api().flow()):ownedClient.sendPrepared(command));}
    requirePendingOwner(session,j,batch,stamp);let fresh=postTicket&&api().previewCanvasPost?.(postTicket,result);if(fresh)postReadbacks.add(fresh);else fresh=await api().readCanvasRecovery(pin);const confirmed=await finishCurrentReceipt(session,j,batch,stamp,result.receipt,fresh);timing('canvas-api-including-checkpoint',started);return confirmed;
   }catch(error){
    if(recovery===session&&journal===j&&j.pending===batch&&runtimeCurrent()&&owns(stamp)){
     batch.lastError??=error;const cancelled=session.wasRejected(batch.reservation,error)||session.cancelPrepared(batch.reservation).ok;
     if(cancelled){j.pending=null;ownedClient.discardRejected?.(batch.patches.map(p=>p.path));}
     note=t('同步未完成，整批本機編輯保留：','Chưa đồng bộ; giữ toàn bộ thay đổi: ')+(host.sharedDraftErrorMessage?.(error)||error.message);persistNow();
    }
    throw error;
   }finally{running=null;update();}
  })();update();return running;
 }
 host.ProcessCanvasLocal={
  recoveryReady:()=>recovery?.ready,previewRecovery,restoreRecovery,discardRecovery,resolveRecovery,finalizeRecovery,openRecovery,recoveryStatus:()=>recovery?.status(),
  lockForDeparture(){if(departureLease)throw Error('CANVAS_DEPARTURE_LOCKED');ensure();const stamp=captureRecoveryOwner(),id=identity,pin={owner:stamp,session:recovery,runtimeEpoch:stamp.runtimeEpoch};let held=true;const lease={current:()=>held&&identity===id&&owns(stamp)&&recovery===pin.session&&pin.session.status().ready===true&&pin.runtimeEpoch===pin.session.status().runtimeEpoch,release(){held=false;if(departureLease===lease)departureLease=null;update();}};departureRuntimePins.set(lease,pin);departureLease=lease;update();return lease;},
  async settleForDeparture(lease){checkLease(lease);if(running)await running;checkLease(lease);await client.flush();checkLease(lease);if(journal?.pending)throw Error('CANVAS_RECEIPT_REQUIRED');persistNow();},
  async saveForDeparture(lease){checkLease(lease);if(this.dirty())throw Error('CANVAS_UNSYNCHRONIZED');return {};},
  async discardForDeparture(flow,lease){checkLease(lease);if(running||journal?.pending||flow!==api()?.flow()||JSON.stringify([actor(),host.ProcessSync?.identityGeneration?.(),flow?.generation])!==identity)throw Error('CANVAS_STATE_CHANGED');projectionBase=flow.working;journal=new Journal(flow.working);note='';lastBatch=0;persistNow();},
  storeForm(w,s,id,record){localChange(j=>{j.forms[nodeKey(w,s,id)]=copyFormRecord(record);});},
  prepareReview(w,s,content){admit();if(ensure().pending)throw Error('CANVAS_RECEIPT_REQUIRED');return journal.review(w,s,content);},
  resolveReview(review,decision){admit();localChange(j=>j.resolveReview(review,decision));projectionBase=review.content;persistNow();},
  form(w,s,id){return runtimeCurrent()&&authority().canView===true?journal?.forms[nodeKey(w,s,id)]:undefined;},
  forms:()=>runtimeCurrent()&&authority().canView===true?journal?.forms||{}:{},
  clearForm(w,s,id){if(journal&&runtimeCurrent()&&authority().canView===true){delete journal.forms[nodeKey(w,s,id)];recoveryRevision++;persist();}},
  resetClean(){if(running||journal?.counts().fields||journal?.pending||Object.keys(journal?.forms||{}).length)throw Error('CANVAS_UNSYNCHRONIZED');recovery?.close();recovery=null;recoveryStamp=null;projectionBase=null;journal=null;identity=null;ready=false;},accept,update,isReady:()=>ready&&tabReady&&recovery?.status().ready===true,edit:(w,s,changes)=>localChange(j=>j.edit(w,s,changes)),operation:(w,s,next,original)=>localChange(j=>j.operation(w,s,next,original)),remove:(w,s,id)=>localChange(j=>j.remove(w,s,id)),sync,timings:()=>clone(events),project:(w,s,input)=>{try{return ensure().project(w,s,projectionBase?rows(projectionBase,w,s):input);}catch{return input;}},dirty:()=>!!note&&!ready||journalDirty(journal),counts:()=>journal?{...journalStats(journal).counts,scopes:journalStats(journal).counts.scopes.map(pair=>[...pair])}:undefined,pending:()=>!!journal?.pending,
  added(w,s,id,to){const e=journal?.entries[journal.token(w,s,id,'nextIds')];return !!e&&(e.value||[]).includes(to)&&!(e.base||[]).includes(to);},
  travel(w,s,redo){localChange(j=>j.travel(w,s,redo));},flushRecovery:persistNow,
  async discard(w,s){if(running||journal?.pending)throw Error('CANVAS_RECEIPT_REQUIRED');const at=current();w??=at?.workspace;s??=at?.stage;if(!w||!s)throw Error('CANVAS_SCOPE_REQUIRED');const stamp=captureRecoveryOwner(),session=recovery,revision=recoveryRevision;if(!await confirmCanvas(t('放棄目前畫布尚未同步的本機變更？其他畫布保留。','Bỏ thay đổi cục bộ chưa đồng bộ của sơ đồ này? Giữ các sơ đồ khác.')))return;requireRecoveryCurrent(session,stamp,revision);ensure().discard(w,s);note='';persistNow();api()?.updateLocalSaveState?.();},
  async beforeSave(){admit();ensure();if(running)throw Error('CANVAS_SYNC_IN_PROGRESS');if(this.dirty())throw Object.assign(Error('CANVAS_UNSYNCHRONIZED'),{details:{scopes:this.counts()?.scopes}});return {};}
 };
 // oxlint-disable-next-line typescript/no-deprecated -- Browser exit prompt for unsynchronized local work.
 host.addEventListener('beforeunload',e=>{persistNow();if(host.ProcessCanvasLocal.dirty()){e.preventDefault();e.returnValue='畫布尚未同步 / Sơ đồ chưa đồng bộ';}});
 host.addEventListener('pagehide',()=>{persistNow();ready=false;tabReady=false;});
})(typeof window==='undefined'?globalThis:window);
