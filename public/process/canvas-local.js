/* Local canvas journal. Explicit Save atomically saves the current canvas and retains other local canvases. Legacy Sync remains receipt-compatible. */
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
 const reviewPins=new WeakMap(),saveRejections=new WeakMap(),batchProtocols=new WeakMap();
 class Journal {
  constructor(content,record={}){
   this.content=content;this.entries=record.entries||{};this.pending=record.pending||null;this.dependencies=record.dependencies||{};this.baselines=record.baselines||{};this.forms=record.forms||{};this.history={};this.redoHistory={};this.epoch=0;this.cache=new Map();this.views=new Map();this.reviewed=new Set();
   for(const collection of [this.entries,this.pending?.entries||{}])for(const [key,e]of Object.entries(collection)){
    if(!e||typeof e.w!=='string'||typeof e.s!=='string'||typeof e.id!=='string'||key!==this.token(e.w,e.s,e.id,e.f)||e.f!=='$node'&&!fields.has(e.f)||e.f==='$node'&&(e.value!==null&&(!e.value||e.value.id!==e.id||e.value.stageCode!==e.s))||['x','y'].includes(e.f)&&!Number.isFinite(e.value)||e.f==='nextIds'&&(!Array.isArray(e.value)||e.value.some(id=>typeof id!=='string')))throw Error('INVALID_CANVAS_RECOVERY');
   }
   for(const e of [...Object.values(this.entries),...Object.values(this.pending?.entries||{})])if(e.autoUnlink&&(!['nextIds','$node'].includes(e.f)||e.f==='$node'&&!e.value||!Array.isArray(e.autoUnlink.intent)||!Array.isArray(e.autoUnlink.targets)||[...e.autoUnlink.intent,...e.autoUnlink.targets].some(id=>typeof id!=='string')))throw Error('INVALID_CANVAS_RECOVERY');
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
   const key=scope(w,s);if(this.reviewed.has(key))input=this.views.get(key);if(input!==undefined)this.views.set(key,input);else input=this.views.get(key)||rows(this.content,w,s);const cached=this.cache.get(key);if(cached?.input===input&&cached.epoch===this.epoch)return cached.rows;
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
   if(f!=='$node'&&node?.value){if(f==='nextIds')delete node.autoUnlink;node.value[f]=clone(value);return;}
   if(f!=='$node'&&!original)throw Error('OPERATION_REMOVED: '+id);
   const base=this.entries[k]?this.entries[k].base:clone(f==='$node'?original:original[f]);
   // A rejected choice can restore an older guard while the reviewed shared
   // view is newer. Returning to that guard value is still a real local intent
   // when it differs from the visible shared value; never erase it as a no-op.
   const shared=(this.views.get(scope(w,s))||rows(this.content,w,s)).find(o=>o.id===id),visible=f==='$node'?shared??null:shared?.[f];
   if(equal(base,value)&&equal(visible,value)&&!this.pending?.entries[k])delete this.entries[k];else this.entries[k]={w,s,id,f,base:clone(base),value:clone(value)};
  }
  edit(w,s,changes){
   const before=this.project(w,s),reverse=[];
   // Validate the whole local change first; a malformed entry cannot half-edit a batch.
   for(const c of changes){if(!fields.has(c.f))throw Error('CANVAS_FIELD_INVALID');const old=before.find(o=>o.id===c.id);if(!old)throw Error('OPERATION_REMOVED: '+c.id);if(!equal(old[c.f],c.value))reverse.push({id:c.id,f:c.f,value:clone(old[c.f])});}
   if(!reverse.length)return;for(const c of changes)this.set(w,s,c.id,c.f,c.value);this.track(w,s,reverse);this.changed();
  }
  track(w,s,reverse){(this.history[scope(w,s)]||=[]).push(reverse);this.redoHistory[scope(w,s)]=[];}
  operation(w,s,next,original,guardWhole=false){
   if(!next||typeof next.id!=='string'||next.stageCode!==s)throw Error('OPERATION_STRUCTURE_INVALID');
   const old=this.project(w,s).find(o=>o.id===next.id);
   if(original&&!equal(old,original))throw Error('DEPENDENCY_CHANGED_RECONFIRM');
   if(!old){this.set(w,s,next.id,'$node',next);this.track(w,s,[{id:next.id,f:'$node',value:null}]);this.changed();return;}
   const changed=Object.keys(next).filter(f=>fields.has(f)&&!equal(next[f],old[f]));
   if(!changed.length)return;
   // Independent fields of one operation may merge. Deletion retains whole-node guards.
   const baseline=this.remember(w,s,next.id);if(guardWhole&&baseline)this.dependencies[nodeKey(w,s,next.id)]={w,s,id:next.id,value:clone(baseline)};
   this.edit(w,s,changed.map(f=>({id:next.id,f,value:next[f]})));
  }
  remove(w,s,id){
   const list=this.project(w,s),old=list.find(o=>o.id===id);if(!old)throw Error('OPERATION_REMOVED');
   const reverse=[{id,f:'$node',value:clone(old)}],base=this.remember(w,s,id),pendingNode=this.pending?.entries[this.token(w,s,id,'$node')];
   if(base)this.dependencies[nodeKey(w,s,id)]={w,s,id,value:clone(base)};
   for(const [k,e]of Object.entries(this.entries))if(e.w===w&&e.s===s&&e.id===id)delete this.entries[k];
   if(base||pendingNode)this.entries[this.token(w,s,id,'$node')]={w,s,id,f:'$node',base:clone(base),value:null};
   for(const o of list)if(o.id!==id&&o.nextIds?.includes(id)){reverse.push({id:o.id,f:'nextIds',value:clone(o.nextIds)});const original=this.remember(w,s,o.id);if(original)this.dependencies[nodeKey(w,s,o.id)]={w,s,id:o.id,value:clone(original)};const nk=this.token(w,s,o.id,'$node'),k=this.entries[nk]?.value?nk:this.token(w,s,o.id,'nextIds'),auto=clone(this.entries[k]?.autoUnlink)||{intent:clone(o.nextIds),targets:[]};this.set(w,s,o.id,'nextIds',o.nextIds.filter(x=>x!==id));const entry=this.entries[k]||{w,s,id:o.id,f:'nextIds',base:clone(original.nextIds),value:o.nextIds.filter(x=>x!==id)};entry.autoUnlink={intent:auto.intent,targets:[...new Set([...auto.targets,id])]};this.entries[k]=entry;}
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
   content=clone(content);
   const entries=Object.values(this.entries).filter(e=>e.w===w&&e.s===s),changes=[],blockers=[];
   for(const e of entries){const latest=row(content,w,s,e.id),value=e.f==='$node'?latest??null:latest?.[e.f];
    changes.push({id:e.id,field:e.f,before:clone(e.base),latest:clone(value),mine:clone(e.value),conflict:!equal(value,e.base)&&!equal(value,e.value)});
    if(e.f!=='$node'&&!latest)blockers.push({id:e.id,reason:'OPERATION_REMOVED'});
    if(e.f==='$node'&&e.value&&latest)blockers.push({id:e.id,reason:'OPERATION_ID_ALREADY_EXISTS'});
    if(e.f==='$node'&&e.value===null&&latest){const candidates=[...rows(content,w,s),...entries.filter(x=>x.f==='$node'&&x.value&&!x.base).map(x=>x.value)];for(const source of candidates){const node=this.entries[this.token(w,s,source.id,'$node')],next=this.entries[this.token(w,s,source.id,'nextIds')];if(node?.value===null)continue;if((next?.value||node?.value?.nextIds||source.nextIds)?.includes(e.id))blockers.push({id:e.id,source:source.id,reason:'NEW_INCOMING_CONNECTION'});}}
   }
   // A changed dependent link is a conflict in the deletion decision too.
   for(const change of changes)if(change.field==='$node'&&entries.some(e=>e.id===change.id&&e.f==='$node'&&e.value===null))if(blockers.some(b=>b.id===change.id&&b.reason==='NEW_INCOMING_CONNECTION')||entries.some(e=>e.autoUnlink?.targets.includes(change.id)&&changes.some(c=>c.id===e.id&&c.field===e.f&&c.conflict))){change.conflict=true;change.dependencyConflict=true;}
   const lostTargets=entries.flatMap(e=>e.f==='nextIds'?e.value:e.f==='$node'&&e.value?e.value.nextIds||[]:[]).filter(id=>(this.views.get(scope(w,s))||rows(this.content,w,s)).some(o=>o.id===id)&&!row(content,w,s,id));
   const removedRemotely=[...new Set([...blockers.filter(b=>b.reason==='OPERATION_REMOVED').map(b=>b.id),...lostTargets])],removedSet=new Set(removedRemotely),removedLinks=[];
   for(const o of this.project(w,s))for(const to of o.nextIds||[])if(removedSet.has(o.id)||removedSet.has(to))removedLinks.push({from:o.id,to});
   const groups=entries.filter(e=>e.f==='$node'&&e.value===null).map(e=>({node:e.id,unlinks:[...entries.filter(x=>x.autoUnlink?.targets.includes(e.id)).map(x=>({from:x.id,to:e.id})),...blockers.filter(b=>b.id===e.id&&b.reason==='NEW_INCOMING_CONNECTION').map(b=>({from:b.source,to:e.id}))]}));
   for(const d of Object.values(this.dependencies))if(d.w===w&&d.s===s&&entries.some(e=>e.id===d.id)&&!entries.some(e=>e.id===d.id&&(e.autoUnlink||e.f==='$node'&&e.value===null))&&!equal(row(content,w,s,d.id)??null,d.value)){
    changes.push({id:d.id,field:'operation',before:clone(d.value),latest:clone(row(content,w,s,d.id)??null),mine:clone(this.project(w,s).find(o=>o.id===d.id)??null),conflict:true});
    blockers.push({id:d.id,reason:'OPERATION_DEPENDENCY_CHANGED'});
   }
   const review={workspace:w,stage:s,epoch:this.epoch,content,changes,blockers,groups,removedRemotely,removedLinks};
   reviewPins.set(review,{journal:this,review:clone(review),content:clone(this.content)});return review;
  }
  cancelReview(review){reviewPins.delete(review);}
  deletionImpact(review,decision){
   const conflicts=new Set(review.changes.filter(c=>c.conflict).map(c=>c.id+'\0'+c.field));
   const nodes=Object.values(this.entries).filter(e=>e.w===review.workspace&&e.s===review.stage&&e.f==='$node'&&e.value===null&&row(review.content,e.w,e.s,e.id)&&!(decision==='latest'&&conflicts.has(e.id+'\0$node'))).map(e=>e.id),deleted=new Set(nodes),links=[];
   for(const o of rows(review.content,review.workspace,review.stage))for(const id of o.nextIds||[])if(deleted.has(o.id)||deleted.has(id))links.push({from:o.id,to:id});
   return {nodes,links};
  }
  resolveReview(review,decision,confirmedDeletion=false){
   if(this.pending)throw Error('CANVAS_RECEIPT_REQUIRED');const pin=reviewPins.get(review);if(!pin||pin.journal!==this||review.epoch!==this.epoch||!equal(pin.review,review)||!equal(this.content,pin.content))throw Error('CANVAS_REVIEW_CHANGED');if(!['latest','mine'].includes(decision))throw Error('CANVAS_REVIEW_REQUIRED');
   const {workspace:w,stage:s,content}=pin.review;if(review.blockers.some(b=>b.reason==='OPERATION_ID_ALREADY_EXISTS'||b.reason==='OPERATION_DEPENDENCY_CHANGED'||decision==='mine'&&b.reason==='NEW_INCOMING_CONNECTION'&&!confirmedDeletion))throw Object.assign(Error('CANVAS_REVIEW_UNSAFE'),{details:{conflicts:review.blockers}});
   {
    const conflicts=new Set(review.changes.filter(c=>c.conflict).map(c=>c.id+'\0'+c.field));
    const whole=new Set(review.changes.filter(c=>c.conflict&&c.field==='operation').map(c=>c.id));
    const removed=new Set(review.removedRemotely||[]),rejected=new Set(decision==='latest'?review.changes.filter(c=>c.field==='$node'&&c.conflict).map(c=>c.id):[]),deleted=new Set(Object.values(this.entries).filter(e=>e.w===w&&e.s===s&&e.f==='$node'&&e.value===null&&!rejected.has(e.id)).map(e=>e.id));
    for(const [k,e]of Object.entries(this.entries))if(e.w===w&&e.s===s){
     if(removed.has(e.id)){delete this.entries[k];continue;}
     if(e.autoUnlink){const auto=e.autoUnlink;
      // A peer removal of an edge present in our baseline is authoritative even
      // when it converges with our automatic unlink (latest === mine).
      // Retain this evidence before updating base, for repeated reviews too.
      if(e.f==='nextIds'){const peer=row(content,w,s,e.id)?.nextIds||[];auto.intent=auto.intent.filter(id=>!auto.targets.includes(id)||!(e.base||[]).includes(id)||peer.includes(id));}
      const next=auto.intent.filter(id=>!removed.has(id)&&!auto.targets.some(target=>target===id&&(deleted.has(target)||!row(content,w,s,target)&&!this.entries[this.token(w,s,target,'$node')]?.value)));if(e.f==='$node')e.value.nextIds=next;else e.value=next;auto.targets=auto.targets.filter(id=>deleted.has(id));auto.intent=auto.intent.filter(id=>!removed.has(id));if(!auto.targets.length)delete e.autoUnlink;}
    }
    if(decision==='latest')for(const [k,e]of Object.entries(this.entries))if(e.w===w&&e.s===s&&(whole.has(e.id)||conflicts.has(e.id+'\0'+e.f)))delete this.entries[k];
    for(const [k,e]of Object.entries(this.entries))if(e.w===w&&e.s===s){const latest=row(content,w,s,e.id),base=e.f==='$node'?latest??null:latest?.[e.f];if(equal(base,e.value))delete this.entries[k];else e.base=clone(base);this.baselines[nodeKey(w,s,e.id)]=clone(latest)??null;}
    for(const [k,d]of Object.entries(this.dependencies))if(d.w===w&&d.s===s){const latest=row(content,w,s,d.id);if(latest&&Object.values(this.entries).some(e=>e.w===w&&e.s===s&&e.id===d.id))d.value=clone(latest);else delete this.dependencies[k];}
    // Discarded/converged entries must not leave their old node basis behind:
    // the very next edit may intentionally restore an original field value.
    for(const k of Object.keys(this.baselines)){const [workspace,stage,id]=JSON.parse(k);if(workspace===w&&stage===s&&!Object.values(this.entries).some(e=>e.w===w&&e.s===s&&e.id===id))delete this.baselines[k];}
    delete this.history[scope(w,s)];delete this.redoHistory[scope(w,s)];this.changed();
   }
   reviewPins.delete(review);this.content=content;this.views.set(scope(w,s),rows(content,w,s));this.reviewed.add(scope(w,s));this.cache.clear();
   if(confirmedDeletion||review.removedRemotely?.length){const deleted=new Set(Object.values(this.entries).filter(e=>e.w===w&&e.s===s&&e.f==='$node'&&e.value===null).map(e=>e.id).concat(review.removedRemotely||[]));for(const o of this.project(w,s)){const next=(o.nextIds||[]).filter(id=>!deleted.has(id));if(!equal(next,o.nextIds||[]))this.set(w,s,o.id,'nextIds',next);}this.changed();}
  }
  freeze(w,s){
   if(this.pending)throw Error('CANVAS_RECEIPT_REQUIRED');if(w===undefined||s===undefined){const scopes=this.counts().scopes;if(scopes.length!==1)throw Error('CANVAS_SCOPE_REQUIRED');[w,s]=scopes[0]||[];}if(!w||!s)throw Error('CANVAS_SCOPE_REQUIRED');
   const conflicts=this.conflicts(w,s);if(conflicts.length)throw Object.assign(Error('CANVAS_CONFLICT'),{details:{conflicts}});
   const entries={},patches=[],guards=[],dependencies={},active=new Set(),stagePath=['workspaces',{id:w},'stages',s],workspace=this.content.workspaces.find(x=>x.id===w);
   for(const [k,e]of Object.entries(this.entries))if(e.w===w&&e.s===s){entries[k]=clone(e);active.add(nodeKey(w,s,e.id));}
   if(Object.keys(entries).length&&!workspace){let category,line;try{[category,line]=JSON.parse(w);}catch{throw Error('AUTHORING_SCOPE_INVALID');}patches.push({op:'insert',path:['workspaces'],value:{id:w,category,line,stages:{[s]:[]}}});}
   else if(Object.keys(entries).length&&!Object.hasOwn(workspace.stages,s)){patches.push({op:'set',path:[...stagePath],value:[]});guards.push({path:[...stagePath],value:undefined});}
   for(const e of Object.values(entries)){const path=[...stagePath,{id:e.id}];if(e.f==='$node'){if(e.value===null){patches.push({op:'remove',path});guards.push({path:[...path],value:clone(e.base)});}else if(!e.base)patches.push({op:'insert',path:[...stagePath],value:clone(e.value)});else throw Error('CANVAS_REPLACE_FORBIDDEN');}else{patches.push({op:'set',path:[...path,e.f],value:clone(e.value)});guards.push({path:[...path,e.f],value:clone(e.base)});}}
   for(const [k,d]of Object.entries(this.dependencies))if(active.has(k)){dependencies[k]=clone(d);if(!guards.some(g=>equal(g.path,[...stagePath,{id:d.id}])))guards.push({path:[...stagePath,{id:d.id}],value:clone(d.value)});}
   if(patches.length>256)throw Error('CANVAS_BATCH_LIMIT_256');
   return {workspace:w,stage:s,entries,dependencies,patches,guards};
  }
  reviewAll(content,scopes=this.counts().scopes){
   if(!Array.isArray(scopes)||scopes.some(pair=>!Array.isArray(pair)||pair.length!==2||pair.some(value=>typeof value!=='string'||!value)))throw Error('CANVAS_SCOPE_REQUIRED');
   const parts=scopes.map(([w,s])=>this.review(w,s,content));
   return {content,scopes,changes:parts.flatMap(r=>r.changes.map(c=>({...c,workspace:r.workspace,stage:r.stage}))),blockers:parts.flatMap(r=>r.blockers),removedRemotely:parts.flatMap(r=>r.removedRemotely),removedLinks:parts.flatMap(r=>r.removedLinks),groups:parts.flatMap(r=>r.groups)};
  }
  deletionImpactAll(review,decision){const parts=review.scopes.map(([w,s])=>this.deletionImpact(this.review(w,s,review.content),decision));return {nodes:parts.flatMap(p=>p.nodes),links:parts.flatMap(p=>p.links)};}
  resolveAll(review,decision,confirmedDeletion=false){for(const [w,s]of review.scopes)this.resolveReview(this.review(w,s,review.content),decision,confirmedDeletion);this.content=review.content;}
  freezeAll(){
   if(this.pending)throw Error('CANVAS_RECEIPT_REQUIRED');
   const batches=this.counts().scopes.map(([w,s])=>this.freeze(w,s)),patches=[],guards=[],entries={},dependencies={},created=new Map();
   for(const b of batches){Object.assign(entries,b.entries);Object.assign(dependencies,b.dependencies);guards.push(...b.guards);for(const p of b.patches){if(p.op==='insert'&&p.path.length===1){const prior=created.get(p.value.id);if(prior)Object.assign(prior.value.stages,p.value.stages);else{created.set(p.value.id,p);patches.push(p);}}else patches.push(p);}}
   if(patches.length>256)throw Error('CANVAS_BATCH_LIMIT_256');
   return {workspace:'process:platform',stage:'*',entries,dependencies,patches,guards};
  }
  sent(batch){this.pending=batch;for(const e of Object.values(batch.entries)){this.history[scope(e.w,e.s)]=[];this.redoHistory[scope(e.w,e.s)]=[];}}
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
   const committedDeleted=new Set(Object.values(batch.entries).filter(e=>e.f==='$node'&&e.value===null).map(e=>nodeKey(e.w,e.s,e.id)));
   for(const e of Object.values(this.entries))if(e.autoUnlink){e.autoUnlink.intent=e.autoUnlink.intent.filter(id=>!committedDeleted.has(nodeKey(e.w,e.s,id)));e.autoUnlink.targets=e.autoUnlink.targets.filter(id=>!committedDeleted.has(nodeKey(e.w,e.s,id)));if(!e.autoUnlink.targets.length)delete e.autoUnlink;}
   for(const e of Object.values(batch.entries)){this.views.delete(scope(e.w,e.s));this.reviewed.delete(scope(e.w,e.s));}this.content=content;this.pending=null;this.changed();
  }
  counts(w,s){const moves=new Set(),scopes=new Set(),nodes=new Set();let added=0,removed=0,created=0,deleted=0,fieldsCount=0;for(const e of Object.values(this.entries)){if(w!==undefined&&(e.w!==w||e.s!==s))continue;fieldsCount++;scopes.add(scope(e.w,e.s));nodes.add(nodeKey(e.w,e.s,e.id));if(e.f==='nextIds'){added+=(e.value||[]).filter(id=>!(e.base||[]).includes(id)).length;removed+=(e.base||[]).filter(id=>!(e.value||[]).includes(id)).length;}else if(e.f==='$node'){if(e.value)created++;else deleted++;}else if(e.f==='x'||e.f==='y')moves.add(nodeKey(e.w,e.s,e.id));}return {moves:moves.size,added,removed,created,deleted,nodes:nodes.size,scopes:[...scopes].map(JSON.parse),fields:fieldsCount};}
  discard(w,s){if(this.pending)throw Error('CANVAS_RECEIPT_REQUIRED');for(const map of [this.entries,this.dependencies,this.baselines])for(const k of Object.keys(map)){const parts=JSON.parse(k);if(parts[0]===w&&parts[1]===s)delete map[k];}delete this.history[scope(w,s)];delete this.redoHistory[scope(w,s)];this.changed();}
  discardUnsent(w,s){
   const selected=e=>w===undefined||e.w===w&&e.s===s,pending=this.pending?.entries||{};
   for(const [key,e] of Object.entries(this.entries))if(selected(e))delete this.entries[key];
   for(const [key,e] of Object.entries(pending))if(selected(e))this.entries[key]=clone(e);
   const retained=new Set(Object.values(pending).map(e=>nodeKey(e.w,e.s,e.id)));
   for(const e of [...Object.values(this.entries),...Object.values(this.pending?.entries||{})])if(e.autoUnlink&&(!['nextIds','$node'].includes(e.f)||e.f==='$node'&&!e.value||!Array.isArray(e.autoUnlink.intent)||!Array.isArray(e.autoUnlink.targets)||[...e.autoUnlink.intent,...e.autoUnlink.targets].some(id=>typeof id!=='string')))throw Error('INVALID_CANVAS_RECOVERY');
   for(const map of [this.dependencies,this.baselines,this.forms])for(const key of Object.keys(map)){
    const [workspace,stage]=JSON.parse(key);if(w!==undefined&&(workspace!==w||stage!==s))continue;
    if(map===this.forms||!retained.has(key))delete map[key];
   }
   for(const map of [this.history,this.redoHistory])for(const key of Object.keys(map)){const [workspace,stage]=JSON.parse(key);if(w===undefined||workspace===w&&stage===s)delete map[key];}
   this.changed();
  }
  unsent(){return Object.keys(this.forms).length>0||!equal(this.entries,this.pending?.entries||{});}
  record(){return {version:2,entries:this.entries,pending:this.pending,dependencies:this.dependencies,baselines:this.baselines,forms:this.forms};}
 }
 host.CanvasJournal=Journal;
 if(typeof document==='undefined')return;
 const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
 let projectionBase=null;
 let journal=null,identity='',client=null,running=null,note='',lastBatch=0,storageError='',tabStorageError='',ready=false,persistTimer=null,tabReady=false,departureLease=null;
 const departureRuntimePins=new WeakMap(),postReadbacks=new WeakSet(),localReviewPins=new WeakMap();
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
   storageError=result.ok||result.code==='EMPTY'?'':t('操作收據存檔未完成；內容仍留在目前頁面，請勿關閉。','Chưa lưu khôi phục; nội dung còn trên trang, đừng đóng.')+' '+result.code;update();
  }});
  recovery=session;recoveryStamp=stamp;recoveryBase=base;recoveryVerified=null;identity=JSON.stringify([stamp.id,stamp.epoch,flow.generation]);ready=false;tabReady=false;
  void session.ready.then(result=>{if(session!==recovery||!runtimeCurrent())return;tabReady=session.status().ready===true;ready=tabReady&&!!journal;tabStorageError=session.status().canRecover===false?t('此瀏覽器無可靠分頁鎖；新編輯可同步，關閉或重載後的獨立副本不能恢復。','Trình duyệt thiếu khóa tab; có thể đồng bộ chỉnh sửa mới, nhưng không khôi phục bản riêng sau khi đóng hoặc tải lại.'):result.ok?'':result.code;update();});
  return session;
 }
 function persistNow(){clearTimeout(persistTimer);persistTimer=null;if(!journal||!recovery||!runtimeCurrent())return;const session=recovery;let result;if(journal.pending)result=session.flushPending(journal.pending.reservation);else result={ok:true,durable:true,code:'EMPTY'};if(!result.ok&&result.code!=='EMPTY')storageError=t('操作收據存檔失敗；請勿關閉頁面。','Không lưu được khôi phục; đừng đóng trang.')+' '+result.code;update();return result;}
 function persist(){if(!journal||!recovery||!runtimeCurrent())return;if(journal.pending)recovery.schedulePending(journal.pending.reservation,()=>localRecord(journal));update();api()?.updateLocalSaveState?.();}
 function makeClient(legacy=false){let proofSession=null;return host.createSharedDraftClient({endpoint:'/api/process-authoring/workflow?caseMetadata=1&channel='+(legacy?'canvas':'canvas-v2'),actorId:actor(),headers:()=>host.ProcessSync.platformHeaders(),externalDurableCanvas:{departureProof(command){if(runtimeCurrent()&&journal?.pending&&referenceOf(journal.pending).operationId===command.operationId)proofSession=recovery;return proofSession?.departureProof?.(command)??null;},assertDispatch(command){if(!runtimeCurrent()||!journal?.pending||referenceOf(journal.pending).operationId!==command.operationId)throw Error('CANVAS_RECOVERY_CHANGED');return recovery.assertDispatch(command)===true;}}});}
 function accept(flow){
  if(!flow||!actor()||authority().canView!==true){ready=false;update();return;}
  if(!runtimeCurrent()){
   if(recovery){if(journalDirty(journal))recoveryQuarantine.set(recovery.key,{journal,base:recoveryBase});recovery.close();}
   projectionBase=null;journal=new Journal(flow.working);client=makeClient();recoveryRevision++;note='';storageError='';
   try{newRecovery(flow);}catch(error){ready=false;tabReady=false;note=error.message;}
  }else{if(journal)journal.content=flow.working;tabReady=recovery?.status().ready===true;ready=tabReady&&!!journal;}
  update();
 }
 function requireRecoveryCurrent(session,stamp,revision){if(recovery!==session||!ownsRuntime(stamp,session)||!runtimeCurrent()||recoveryRevision!==revision||!session.status().ready||authority().canView!==true)throw Error('CANVAS_RECOVERY_CHANGED');}
 function verifyRecoveryRead(result,base){const a=authority(),fresh=result?.control?.workflow,currentFlow=api()?.flow();if(result?.permissions?.view!==true||!fresh?.working||fresh.generation!==currentFlow?.generation||fresh.revision<currentFlow?.revision||base&&recoveryBaseOf(fresh)!==base)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');if(result.permissions.edit!==true||result.permissions.save===false||fresh.pendingId||currentFlow?.pendingId||a.pending||a.canEdit!==true||!result.control?.versions?.some(v=>v.status==='draft'))throw Error('PENDING_OR_PERMISSION_LOCKED');return fresh;}
 async function previewRecovery(key){const session=recovery,stamp=captureRecoveryOwner(),revision=recoveryRevision;if(!session)throw Error('CANVAS_RECOVERY_UNAVAILABLE');const claimed=await session.claim(key);requireRecoveryCurrent(session,stamp,revision);if(!claimed.ok)throw recoveryError(claimed);const result=session.preview(key);if(!result.ok)throw recoveryError(result);return result;}
 async function restoreRecovery(){throw Error('LOCAL_RECOVERY_REMOVED');}
 async function discardRecovery(key,confirmPreview=()=>confirmCanvas(t('只刪除此本機副本？不會修改共用草稿或其他分頁。','Chỉ xóa bản cục bộ này? Không đổi bản chung hoặc tab khác.'))){
  admit();const session=recovery,stamp=captureRecoveryOwner(),revision=recoveryRevision,selected=await previewRecovery(key);if(selected.kind!=='local')throw Error('CANVAS_RECEIPT_REQUIRED');if(!await confirmPreview(selected))return false;requireRecoveryCurrent(session,stamp,revision);const result=session.discard(selected.token);if(!result.ok)throw recoveryError(result);update();return true;
 }
 async function openRecovery(){
  const session=recovery,stamp=captureRecoveryOwner();if(!session||authority().canView!==true)throw Error('CANVAS_RECOVERY_UNAVAILABLE');const listing=session.discover();if(!listing.ok)throw recoveryError(listing);
  const dialog=document.createElement('dialog');dialog.className='pe-shared-preview';dialog.dataset.i18nSkip='true';const add=(tag,text,parent=dialog)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
  add('h2',t('查未確認操作收據','Kiểm tra biên nhận chưa xác nhận'));add('p',t('僅核對已送出的原操作；不恢復未儲存輸入，也不重送。','Chỉ kiểm tra thao tác đã gửi; không khôi phục đầu vào chưa lưu hoặc gửi lại.'));
  const message=add('p','');message.setAttribute('role','alert');const run=fn=>async()=>{try{if(!ownsRuntime(stamp,session))throw Error('CANVAS_RECOVERY_CHANGED');await fn();}catch(error){message.textContent=host.sharedDraftErrorMessage?.(error)||error.message;}};
  if(!listing.items?.length)add('p',t('沒有操作紀錄。','Không có bản ghi thao tác.'));
  for(const item of listing.items||[]){const section=add('section','');add('p',String(item.runtimeId||item.key),section);for(const [text,fn]of [[t('查原收據','Kiểm tra biên nhận'),()=>resolveRecovery(item.key)],[t('完成已確認存檔','Hoàn tất lưu đã xác nhận'),()=>finalizeRecovery(item.key)]]){const b=add('button',text,section);b.type='button';b.onclick=run(async()=>{await fn();dialog.close();});}}
  const close=add('button',t('關閉','Đóng'));close.type='button';close.onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
 }
 function ensure(){accept(api()?.flow());if(!ready||!recovery?.status().ready||!journal||!runtimeCurrent())throw Error('CANVAS_LOAD_REQUIRED');return journal;}
 function update(){const el=document.querySelector('.pe-local-status');if(!el)return;const at=current(),stats=journal?journalStats(journal):null,c=stats?.counts,formCount=stats?.formCount||0,here=at&&journal?canvasCounts(journal,at.workspace,at.stage):null;el.textContent=[lastBatch?t(`本批寫入成功：${lastBatch} 項變更。`,`Đã lưu ${lastBatch} thay đổi.`):'',note,storageError,tabStorageError,formCount?t(`另有 ${formCount} 個未完成表單，請開啟方塊繼續編輯。`,`Có ${formCount} biểu mẫu chưa hoàn tất; mở bước để tiếp tục.`):'',c?.fields?t(`目前畫布 ${here?.fields||0} 項；其他畫布 ${c.fields-(here?.fields||0)} 項尚未存取。存取草稿只保存目前畫布變更；其他畫布未存內容保留。`,`Sơ đồ hiện tại: ${here?.fields||0}; sơ đồ khác: ${c.fields-(here?.fields||0)} thay đổi chưa lưu. Lưu bản nháp chỉ ghi sơ đồ hiện tại; giữ thay đổi chưa lưu ở sơ đồ khác.`):t('本機沒有未存變更；存取草稿保存整份製程。','Không có thay đổi cục bộ chưa lưu; lưu bản nháp lưu toàn bộ quy trình.')].filter(Boolean).join(' · ');el.title=c?.scopes.map(([w,s])=>w+' / '+s).join('\n')||'';const sync=document.querySelector('[data-pe="sync"]');if(sync){sync.disabled=!!departureLease||!!running||(!journal?.pending&&!api()?.canEditCanvas())||!ready;sync.textContent=running?t('同步中…','Đang đồng bộ…'):journal?.pending?t('查原批次收據','Kiểm tra biên nhận lô cũ'):t('同步目前畫布','Đồng bộ sơ đồ hiện tại');sync.title=!api()?.canEditCanvas()?t('待審或權限鎖定，保留本機內容。','Chờ duyệt hoặc thiếu quyền; giữ nội dung cục bộ.') : '';}}
 function localChange(fn){admit();if(!(api()?.canEditLocalCanvas?.()??api()?.canEditCanvas()))throw Error('PENDING_OR_PERMISSION_LOCKED');const start=performance.now();fn(ensure());recoveryRevision++;lastBatch=0;persist();timing('local-update',start);}
 const localRecord=value=>({...value.record(),forms:{},pending:null});
 // Protocol and receipt identity belong to the originally issued batch, not
 // its caller-visible command object. They survive errors and late mutation
 // without rebuilding or resending any command, or weakening Save ACK checks.
 function pinBatchProtocol(batch,save){const command=batch.command;batchProtocols.set(batch,Object.freeze({save,reference:Object.freeze({operationId:command.operationId,generation:command.generation,workspace:batch.workspace,stage:batch.stage,channel:command.source?.startsWith('canvas-v2:')?'canvas-v2':'canvas'})}));}
 const protocolOf=batch=>{const pin=batchProtocols.get(batch);if(!pin)throw Error('CANVAS_BATCH_PROTOCOL_REQUIRED');return pin;};
 const isCanvasSave=batch=>batch?protocolOf(batch).save===true:false;
 const referenceOf=batch=>protocolOf(batch).reference;
 const sameReference=(a,b)=>a?.operationId===b?.operationId&&a?.generation===b?.generation&&a?.workspace===b?.workspace&&a?.stage===b?.stage&&a?.channel===b?.channel;
 function reconcileReceiptSnapshot({payload,sent},flow){const candidate=new Journal(flow.working,payload);if(candidate.pending||!sent||!sent.workspace||!sent.stage||!sent.entries||Object.values(sent.entries||{}).some(entry=>sent.workspace!=='process:platform'||sent.stage!=='*'?(entry.w!==sent.workspace||entry.s!==sent.stage):false))throw Error('CANVAS_RECOVERY_SNAPSHOT_INVALID');new Journal(flow.working,{version:2,entries:sent.entries,dependencies:sent.dependencies,baselines:{},forms:{},pending:null});candidate.acknowledge(sent,flow.working);return candidate.record();}
 function advanceDepartureRuntime(previous,next,stamp,admitted){const pin=departureRuntimePins.get(departureLease);if(!pin||pin!==admitted||pin.session!==previous||pin.runtimeEpoch!==stamp.runtimeEpoch||!owns(pin.owner)||!owns(stamp)||previous.status().runtimeEpoch!==stamp.runtimeEpoch||!next.status().ready)return;pin.session=next;pin.runtimeEpoch=next.status().runtimeEpoch;}
 function requirePendingOwner(session,j,batch,stamp){if(recovery!==session||journal!==j||j.pending!==batch||!runtimeCurrent()||!session.status().ready||!ownsRuntime(stamp,session)||api()?.flow()?.generation!==referenceOf(batch).generation||authority().canView!==true)throw Error('CANVAS_RECOVERY_CHANGED');}
 async function finishCurrentReceipt(session,j,batch,stamp,receipt,fresh){
  requirePendingOwner(session,j,batch,stamp);const freshFlow=fresh.control?.workflow;if(!freshFlow?.working||freshFlow.generation!==referenceOf(batch).generation||!Number.isSafeInteger(freshFlow.revision)||freshFlow.revision<api().flow().revision)throw Error('CANVAS_RECOVERY_READBACK_REQUIRED');
  // Returning working content to an existing saved snapshot changes the draft
  // revision but legitimately reuses savedId. Verify the authoritative result,
  // not whether the server allocated another snapshot identifier.
  if(isCanvasSave(batch)&&(!receipt?.savedId||freshFlow.revision===receipt.revision&&(freshFlow.saved?.id!==receipt.savedId||!equal(freshFlow.saved?.content,freshFlow.working))))throw Error('CANVAS_SAVE_ACK_MISMATCH');
  const queued=session.schedulePending(batch.reservation,()=>localRecord(j));if(!queued.ok)throw recoveryError(queued);const saved=session.flushPending(batch.reservation);if(!saved.ok)throw recoveryError(saved);
  const selected=session.preview(session.key);if(!selected.ok||!['unknown','resolved'].includes(selected.kind)||!sameReference(selected.reference,referenceOf(batch)))throw Error('CANVAS_RECEIPT_REQUIRED');
  // GET recovery and original-POST ACK have distinct private admissions.
  // Neither adoption alone can clear the durable local batch.
  if(postReadbacks.has(fresh)){postReadbacks.delete(fresh);api().acceptCanvasPost(fresh);}else api().acceptCanvasRecovery(fresh);requirePendingOwner(session,j,batch,stamp);
  recoveryVerified={baseVersion:recoveryBaseOf(freshFlow),flow:freshFlow,current:()=>recovery===session&&journal===j&&j.pending===batch&&owns(stamp)};
  let settled;try{settled=session.settleReceipt(selected.token,{receipt,workflow:{...freshFlow,scope:'process:platform'}},snapshot=>reconcileReceiptSnapshot(snapshot,freshFlow));}finally{recoveryVerified=null;}
  if(!settled.ok)throw recoveryError(settled);requirePendingOwner(session,j,batch,stamp);
  const candidate=new Journal(freshFlow.working,settled.payload);
  // Unsent forms never enter durable recovery, but an ACK in this same verified
  // runtime must retain the forms still open/edited on the current page.
  candidate.forms=clone(j.forms);journal=candidate;projectionBase=freshFlow.working;recoveryRevision++;lastBatch=Object.keys(batch.entries).length;note=settled.cleanupPending?t('原批次已確認；部分隔離副本無法清理，仍保留原資料。','Đã xác nhận lô; chưa dọn được một số bản cách ly, vẫn giữ dữ liệu.'):'';
  const admitted=session.status().ready?departureRuntimePins.get(departureLease):null,locked=session.status().canRecover,transfer=locked?session.handoff():{ok:true,handoff:undefined};if(!transfer.ok)throw recoveryError(transfer);let next;
  try{next=newRecovery(freshFlow,transfer.handoff);const nextEpoch=next.status().runtimeEpoch;await next.ready;if(recovery!==next||!runtimeCurrent()||!owns(stamp)||!next.status().ready||next.status().runtimeEpoch!==nextEpoch)throw Error('CANVAS_RECOVERY_HANDOFF_UNAVAILABLE');advanceDepartureRuntime(session,next,stamp,admitted);const durable=persistNow();if(!locked&&durable?.ok&&durable.durable){const old=session.preview(session.key);if(old.ok&&old.kind==='local')session.discard(old.token);}session.close();
   if(locked&&durable?.ok&&durable.durable){const claimed=await next.claim(session.key);if(recovery===next&&runtimeCurrent()&&owns(stamp)&&next.status().runtimeEpoch===nextEpoch&&claimed.ok){const old=next.preview(session.key);if(old.ok&&old.kind==='local')next.discard(old.token);}}
   api()?.updateLocalSaveState?.();return {...freshFlow,revision:receipt.revision};}
  catch(error){host.CanvasRecoveryStore.releaseHandoff(transfer.handoff);if(!next?.status().ready)session.close();throw error;}
  finally{if(next?.status().ready)session.close();}
 }
 function discardBatchRejection(ownedClient,batch,error){
  const choice=saveRejections.get(batch);
  if(choice&&ownedClient.discardRejectedCanvasSave?.(batch.command,error,choice.token)){saveRejections.delete(batch);return true;}
  return ownedClient.discardRejected?.(batch.patches.map(p=>p.path));
 }
 function retryKnownRejection(session,j,batch,stamp){
  if(!batch?.lastError||!session.retryRejected)return false;const restored=session.retryRejected(batch.reservation,batch.lastError);if(!restored.ok)return false;requirePendingOwner(session,j,batch,stamp);j.pending=null;discardBatchRejection(client,batch,batch.lastError);lastBatch=0;note=t('原批次已確認未寫入；目前輸入保留，請重新存取草稿。','Đã xác nhận lô chưa ghi; giữ đầu vào hiện tại, hãy lưu bản nháp lại.');persistNow();api()?.updateLocalSaveState?.();return true;
 }
 async function resolveRecovery(key){
  admit();const session=recovery,stamp=captureRecoveryOwner(),revision=recoveryRevision,j=journal,batch=j?.pending,pin=api().captureCanvasRecovery();
  const claimed=await session.claim(key);requireRecoveryCurrent(session,stamp,revision);if(!claimed.ok)throw recoveryError(claimed);const selected=session.preview(key);if(!selected.ok)throw recoveryError(selected);if(!['unknown','resolved'].includes(selected.kind))throw Error('CANVAS_RECEIPT_REQUIRED');if(selected.kind==='resolved'&&selected.outcome==='aborted')return finalizeRecovery(key);
  const own=key===session.key&&batch&&sameReference(selected.reference,referenceOf(batch));if(batch&&!own)throw Error('CANVAS_RECEIPT_REQUIRED');
  if(own&&retryKnownRejection(session,j,batch,stamp))return true;
  const ownedClient=own?client:makeClient(selected.reference.channel==='canvas');
  const result=await (own&&!isCanvasSave(batch)&&api()?.ownedLedger?api().ownedLedger.resolve(ownedClient,'receipt',[selected.reference.operationId,selected.reference.generation]):ownedClient.receipt(selected.reference.operationId,selected.reference.generation));
  if(own)requirePendingOwner(session,j,batch,stamp);else requireRecoveryCurrent(session,stamp,revision);
  const fresh=await api().readCanvasRecovery(pin);
  if(own)return await finishCurrentReceipt(session,j,batch,stamp,result.receipt,fresh);
  requireRecoveryCurrent(session,stamp,revision);const freshFlow=fresh.control?.workflow;
  recoveryVerified={baseVersion:recoveryBaseOf(freshFlow),flow:freshFlow,current:()=>recovery===session&&owns(stamp)&&recoveryRevision===revision};
  try{const settled=session.settleReceipt(selected.token,{receipt:result.receipt,workflow:{...freshFlow,scope:'process:platform'}},snapshot=>reconcileReceiptSnapshot(snapshot,freshFlow));if(!settled.ok)throw recoveryError(settled);note=t('原收據已確認；未送出輸入不會恢復，目前輸入未變。','Đã xác nhận biên nhận; không khôi phục đầu vào chưa gửi. Đầu vào hiện tại giữ nguyên.');update();return true;}finally{if(recovery===session)recoveryVerified=null;}
 }
 async function finalizeRecovery(key){
  admit();const session=recovery,stamp=captureRecoveryOwner(),revision=recoveryRevision,j=journal,batch=j?.pending,selected=await previewRecovery(key);if(selected.kind!=='resolved')throw Error('CANVAS_DISPOSITION_REQUIRED');
  const own=key===session.key&&batch&&sameReference(selected.reference,referenceOf(batch));if(batch&&!own)throw Error('CANVAS_RECEIPT_REQUIRED');
  if(own&&selected.outcome!=='aborted')return resolveRecovery(key);
  const finalized=session.finalizeDisposition(selected.token);if(!finalized.ok)throw recoveryError(finalized);requireRecoveryCurrent(session,stamp,revision);
  if(own){j.pending=null;discardBatchRejection(client,batch,batch.lastError);persistNow();api()?.updateLocalSaveState?.();}note=t('已完成原結果存檔；未重送操作，也不恢復未儲存輸入。','Đã hoàn tất lưu kết quả; không gửi lại thao tác hoặc khôi phục đầu vào chưa lưu.');update();return true;
 }
 async function sync(w,s,save=false){
  admit();if(running)return running;const j=ensure(),ownedClient=client;let session=recovery,stamp=captureRecoveryOwner(),pin=api().captureCanvasRecovery();
  if(!j.pending&&!api().canEditCanvas())throw Error('PENDING_OR_PERMISSION_LOCKED');const at=current();let batch;
  let stagedSave=null,rollbackSave=null;
  if(save&&!j.pending){
   const epoch=j.epoch,revision=recoveryRevision,flowRevision=api().flow().revision,view=clone(authority().currentView),workspace=w??at?.workspace,stage=s??at?.stage;
   const unchanged=()=>{const now=current();return j===journal&&!j.pending&&j.epoch===epoch&&recoveryRevision===revision&&owns(stamp)&&stamp.object===host.ProcessSync?.identity&&now?.workspace===workspace&&now?.stage===stage&&equal(view,authority().currentView);};
   const requireReview=()=>{requireRecoveryCurrent(session,stamp,revision);if(!unchanged()||api().flow().revision!==flowRevision)throw Error('CANVAS_REVIEW_CHANGED');};
   let fresh=await api().readCanvasRecovery(pin),candidate;requireReview();verifyRecoveryRead(fresh);
   // Rebuild every comparison from the untouched original journal. A choice is
   // valid only while a second readonly authority read has identical content.
   for(;;){
    candidate=new Journal(j.content,clone(j.record()));candidate.views=new Map(j.views);candidate.reviewed=new Set(j.reviewed);candidate.history=clone(j.history);candidate.redoHistory=clone(j.redoHistory);
    const review=candidate.reviewAll(fresh.control.workflow.working,[[workspace,stage]]),needsChoice=review.changes.some(c=>c.conflict)||review.removedRemotely.length;
    let decision='mine';if(needsChoice){decision=await host.ProcessEditorV2.resolveSaveConflicts(review);if(!decision)return null;}
    requireReview();verifyRecoveryRead(fresh);
    // The Delete action already confirms local removal. New peer-dependent
    // edges are listed in the global conflict dialog; its mine choice confirms
    // that deletion group and continues this Save without another prompt.
    const impact=candidate.deletionImpactAll(review,decision);
    requireReview();verifyRecoveryRead(fresh);
    if(needsChoice||impact.nodes.length){
     const checked=await api().readCanvasRecovery(pin);requireReview();verifyRecoveryRead(checked);
     const basis=value=>{const c=value.control,f=c.workflow;return {generation:f.generation,revision:f.revision,working:f.working,savedId:f.saved?.id,pendingId:f.pendingId,baseId:f.baseId,activeVersionId:c.activeVersionId,drafts:c.versions.filter(v=>v.status==='draft').map(v=>v.id)};};const changed=!equal(basis(fresh),basis(checked));fresh=checked;if(changed)continue;
    }
    candidate.resolveAll(review,decision,impact.nodes.length>0);candidate.freeze(workspace,stage);break;
   }
   api().acceptCanvasRecovery(fresh);
   if(!unchanged()||api().flow().revision!==fresh.control.workflow.revision)throw Error('CANVAS_REVIEW_CHANGED');
   if(recoveryBase!==recoveryBaseOf(api().flow())){session.close();session=newRecovery(api().flow());await session.ready;}
   if(!unchanged()||recovery!==session||!session.status().ready||!runtimeCurrent()||api().flow().revision!==fresh.control.workflow.revision)throw Error('CANVAS_REVIEW_CHANGED');
   verifyRecoveryRead(fresh);stamp=captureRecoveryOwner();pin=api().captureCanvasRecovery();
   const previous={entries:j.entries,dependencies:j.dependencies,baselines:j.baselines,history:j.history,redoHistory:j.redoHistory,views:j.views,reviewed:j.reviewed},oldProjection=projectionBase;
   Object.assign(j,{entries:candidate.entries,dependencies:candidate.dependencies,baselines:candidate.baselines,history:candidate.history,redoHistory:candidate.redoHistory,views:candidate.views,reviewed:candidate.reviewed});j.changed();recoveryRevision++;
   // Never repaint a different canvas from a comparison for this canvas.
   projectionBase=clone(candidate.content);
   stagedSave={revision:fresh.control.workflow.revision};
   const chosen={entries:clone(j.entries),dependencies:clone(j.dependencies),baselines:clone(j.baselines)},choiceEpoch=j.epoch;let rolledBack=false;
   rollbackSave=(rejected=false)=>{if(rolledBack||j!==journal||j.pending&&!rejected)return;rolledBack=true;
    if(!rejected){Object.assign(j,previous);projectionBase=oldProjection;}
    else{
     // Undo only the comparison's own changes. Inputs/forms created while the
     // POST was in flight take precedence, even on the same node or field.
     const newerNodes=new Set(Object.keys({...chosen.entries,...j.entries}).filter(k=>!equal(chosen.entries[k],j.entries[k])).map(k=>{const e=j.entries[k]||chosen.entries[k];return nodeKey(e.w,e.s,e.id);}));
     for(const key of Object.keys({...previous.entries,...chosen.entries}))if(!equal(previous.entries[key],chosen.entries[key])&&equal(j.entries[key],chosen.entries[key])){if(Object.hasOwn(previous.entries,key))j.entries[key]=clone(previous.entries[key]);else delete j.entries[key];}
     for(const name of ['dependencies','baselines'])for(const key of Object.keys({...previous[name],...chosen[name]}))if(!newerNodes.has(key)&&equal(j[name][key],chosen[name][key])){if(Object.hasOwn(previous[name],key))j[name][key]=clone(previous[name][key]);else delete j[name][key];}
     if(j.epoch===choiceEpoch){j.history=previous.history;j.redoHistory=previous.redoHistory;}else{j.history={};j.redoHistory={};}
    }
    j.changed();recoveryRevision++;update();api()?.updateLocalSaveState?.();
   };
  }

  try{batch=j.pending||j.freeze(w??at?.workspace,s??at?.stage);}catch(error){rollbackSave?.();note=t('整批保留；請核對共享內容：','Giữ nguyên cả lô; đối chiếu nội dung chung: ')+(error.details?.conflicts||[]).map(c=>c.stage+' / '+c.id+' / '+c.field).join('、');update();throw error;}
  if(j.pending&&retryKnownRejection(session,j,batch,stamp))return api().flow();
  if(!batch.patches.length&&!save&&!j.pending)return api().flow();
  if(!batch.command){
   try{
   batch.baseSavedId=api().flow()?.saved?.id||null;
   // A missing old field has an own undefined guard value in the journal.
   // Omit only that data property, exactly as the existing JSON wire does.
   // Descriptor copying never evaluates accessors or broadens private shapes.
   const guards=save?batch.guards.map(guard=>{const value=Object.getOwnPropertyDescriptor(guard,'value');if(!value||!Object.hasOwn(value,'value')||value.value!==undefined)return guard;const descriptors=Object.getOwnPropertyDescriptors(guard);delete descriptors.value;return Object.create(Object.getPrototypeOf(guard),descriptors);}):batch.guards;
   batch.command=ownedClient.prepare(api().flow().generation,'apply',{...(save?{moduleAction:'save-canvas-v1',expectedRevision:stagedSave?.revision??api().flow().revision}:{}),patches:batch.patches,guards,source:'canvas-v2:'+JSON.stringify([batch.workspace,batch.stage])});
   pinBatchProtocol(batch,save);
   if(save&&ownedClient.canvasRejectionCapability)saveRejections.set(batch,{token:ownedClient.canvasRejectionCapability(batch.command),rollback:rollbackSave});
   const commandPin=save?session.captureSaveCommand(batch.command,referenceOf(batch)):undefined;
   const prepared=session.prepareWrite({...(save?{commandPin}:{}),reference:referenceOf(batch),sent:{workspace:batch.workspace,stage:batch.stage,entries:batch.entries,dependencies:batch.dependencies},readPayload:()=>localRecord(j)});batch.reservation=prepared.reservation;
   if(!prepared.ok||!prepared.durable){const cancelled=prepared.reservation&&session.cancelPrepared(prepared.reservation);rollbackSave?.();if(!cancelled?.ok&&prepared.reservation){batch.sent=true;j.sent(batch);session.schedulePending(batch.reservation,()=>localRecord(j));}storageError=t('操作收據存檔未確認；未送出同步，請保留此頁。','Chưa xác nhận lưu khôi phục; chưa gửi đồng bộ, hãy giữ trang.')+' '+prepared.code;update();throw Error('RECOVERY_STORAGE_UNAVAILABLE');}
   j.sent(batch);
   }catch(error){if(!j.pending)rollbackSave?.();throw error;}
  }
  running=(async()=>{
   const started=performance.now();
   try{
    let result,postTicket=null;if(batch.sent){result=await (!isCanvasSave(batch)&&api()?.ownedLedger?api().ownedLedger.resolve(ownedClient,'receipt',[referenceOf(batch).operationId,referenceOf(batch).generation]):ownedClient.receipt(referenceOf(batch).operationId,referenceOf(batch).generation));}
    else{postTicket=api().prepareCanvasPost?.(pin,ownedClient,batch.command)||null;batch.sent=true;result=await session.dispatchPrepared(batch.reservation,batch.command,command=>!isCanvasSave(batch)&&api()?.ownedLedger?api().ownedLedger.sendPrepared(ownedClient,command,()=>api().flow()):ownedClient.sendPrepared(command),{verify:error=>{const choice=saveRejections.get(batch);return !!choice&&ownedClient.isConfirmedCanvasRejection?.(error,batch.command,choice.token)===true;},beforeReject:()=>{requirePendingOwner(session,j,batch,stamp);saveRejections.get(batch)?.rollback?.(true);session.schedulePending(batch.reservation,()=>localRecord(j));}});}
    requirePendingOwner(session,j,batch,stamp);let fresh=postTicket&&api().previewCanvasPost?.(postTicket,result);if(fresh)postReadbacks.add(fresh);else fresh=await api().readCanvasRecovery(pin);const confirmed=await finishCurrentReceipt(session,j,batch,stamp,result.receipt,fresh);timing('canvas-api-including-checkpoint',started);return {...confirmed,canvasSaveConfirmed:isCanvasSave(batch)};
   }catch(error){
    if(recovery===session&&journal===j&&j.pending===batch&&runtimeCurrent()&&owns(stamp)){
     batch.lastError??=error;const cancelled=session.wasRejected(batch.reservation,error)||session.cancelPrepared(batch.reservation).ok;
     if(cancelled){saveRejections.get(batch)?.rollback?.(true);j.pending=null;discardBatchRejection(ownedClient,batch,error);}
     note=t('同步未完成，整批本機編輯保留：','Chưa đồng bộ; giữ toàn bộ thay đổi: ')+(host.sharedDraftErrorMessage?.(error)||error.message);persistNow();
    }
    throw error;
   }finally{running=null;update();}
  })();update();return running;
 }
 function discardUnsent(w,s,lease,afterPersist){
  if(lease)checkLease(lease);else admit();
  const j=ensure(),session=recovery,batch=j.pending;
  if(running)throw Error('CANVAS_SYNC_IN_PROGRESS');
  if(batch&&!session.departureProof?.(batch.command))throw Error('CANVAS_RECEIPT_REQUIRED');
  const previous={entries:clone(j.entries),dependencies:clone(j.dependencies),baselines:clone(j.baselines),forms:clone(j.forms),history:clone(j.history),redoHistory:clone(j.redoHistory)};
  j.discardUnsent(w,s);recoveryRevision++;
  if(batch){const scheduled=session.schedulePending(batch.reservation,()=>localRecord(j));if(!scheduled.ok){Object.assign(j,previous);j.changed();throw recoveryError(scheduled);}}
  const saved=persistNow();
  if(!saved?.ok&&saved?.code!=='EMPTY'){Object.assign(j,previous);j.changed();if(batch)session.schedulePending(batch.reservation,()=>localRecord(j));throw recoveryError(saved||{code:'RECOVERY_UNAVAILABLE'});}
  if(batch&&!session.departureProof?.(batch.command)){Object.assign(j,previous);j.changed();throw Error('CANVAS_RECEIPT_REQUIRED');}
  if(afterPersist)try{afterPersist();}catch(error){
   Object.assign(j,previous);j.changed();recoveryRevision++;
   if(batch)session.schedulePending(batch.reservation,()=>localRecord(j));
   const rollback=persistNow();if(!rollback?.ok&&rollback?.code!=='EMPTY')storageError=t('本機內容仍保留；恢復存檔失敗，請勿關閉頁面。','Nội dung còn trong bộ nhớ; không đóng trang.');
   throw error;
  }
  note='';lastBatch=0;api()?.updateLocalSaveState?.();return true;
 }
 host.ProcessCanvasLocal={
  departureTransports:()=>client?[client]:[],
  departureReady(lease){try{checkLease(lease);return !running&&!journal?.unsent()&&(!journal?.pending||!!recovery?.departureProof?.(journal.pending.command));}catch{return false;}},
  discardUnsentForDeparture(flow,lease,afterPersist){checkLease(lease);if(flow!==api()?.flow())throw Error('CANVAS_STATE_CHANGED');if(lease.emptyBegin){afterPersist?.();return;}return discardUnsent(undefined,undefined,lease,afterPersist);},
  discardUnsent:(w,s)=>discardUnsent(w,s),
  resetForDeparture(lease){if(!this.departureReady(lease))throw Error('CANVAS_STATE_CHANGED');recovery?.close();recovery=null;recoveryStamp=null;projectionBase=null;journal=null;identity=null;ready=false;},
  recoveryReady:()=>recovery?.ready,previewRecovery,restoreRecovery,discardRecovery,resolveRecovery,finalizeRecovery,openRecovery,recoveryStatus:()=>recovery?.status(),
  lockForDeparture(beginCurrent){if(departureLease)throw Error('CANVAS_DEPARTURE_LOCKED');if(!api()?.flow()&&!journal&&!recovery&&!running&&typeof beginCurrent==='function'&&beginCurrent()){const stamp=owner();let held=true;const lease={emptyBegin:true,current:()=>held&&owns(stamp)&&!api()?.flow()&&!journal&&!recovery&&!running&&beginCurrent(),release(){held=false;if(departureLease===lease)departureLease=null;update();}};departureLease=lease;return lease;}ensure();const stamp=captureRecoveryOwner(),id=identity,pin={owner:stamp,session:recovery,runtimeEpoch:stamp.runtimeEpoch};let held=true;const lease={current:()=>held&&identity===id&&owns(stamp)&&recovery===pin.session&&pin.session.status().ready===true&&pin.runtimeEpoch===pin.session.status().runtimeEpoch,release(){held=false;if(departureLease===lease)departureLease=null;update();}};departureRuntimePins.set(lease,pin);departureLease=lease;update();return lease;},
  async settleForDeparture(lease){checkLease(lease);if(running)await running;checkLease(lease);await client.flush();checkLease(lease);if(journal?.pending)throw Error('CANVAS_RECEIPT_REQUIRED');persistNow();},
  async saveForDeparture(lease){checkLease(lease);if(this.dirty())throw Error('CANVAS_UNSYNCHRONIZED');return {};},
  async discardForDeparture(flow,lease){checkLease(lease);if(running||journal?.pending||flow!==api()?.flow()||JSON.stringify([actor(),host.ProcessSync?.identityGeneration?.(),flow?.generation])!==identity)throw Error('CANVAS_STATE_CHANGED');const previous={projectionBase,journal,note,lastBatch};projectionBase=flow.working;journal=new Journal(flow.working);note='';lastBatch=0;const saved=persistNow();if(!saved?.ok&&saved?.code!=='EMPTY'){projectionBase=previous.projectionBase;journal=previous.journal;note=previous.note;lastBatch=previous.lastBatch;throw recoveryError(saved||{code:'RECOVERY_UNAVAILABLE'});}},
  storeForm(w,s,id,record){localChange(j=>{j.forms[nodeKey(w,s,id)]=copyFormRecord(record);});},
  prepareReview(w,s,content){
   admit();const j=ensure();if(j.pending)throw Error('CANVAS_RECEIPT_REQUIRED');const at=current();if(at?.workspace!==w||at?.stage!==s)throw Error('CANVAS_REVIEW_CHANGED');
   const review=j.review(w,s,content);localReviewPins.set(review,{journal:j,session:recovery,owner:captureRecoveryOwner(),revision:recoveryRevision,flowRevision:api().flow().revision,view:clone(authority().currentView)});return review;
  },
  cancelReview(review){localReviewPins.delete(review);journal?.cancelReview(review);},
  resolveReview(review,decision){
   admit();if(journal?.pending)throw Error('CANVAS_RECEIPT_REQUIRED');const pin=localReviewPins.get(review),at=current(),a=authority();
   if(!pin||pin.journal!==journal||!ownsRuntime(pin.owner,pin.session)||pin.owner.object!==host.ProcessSync?.identity||!runtimeCurrent()||pin.revision!==recoveryRevision||pin.flowRevision!==api()?.flow()?.revision||!equal(pin.view,a.currentView)||at?.workspace!==review.workspace||at?.stage!==review.stage)throw Error('CANVAS_REVIEW_CHANGED');
   localChange(j=>j.resolveReview(review,decision));localReviewPins.delete(review);
  },
  form(w,s,id){return runtimeCurrent()&&authority().canView===true?journal?.forms[nodeKey(w,s,id)]:undefined;},
  forms:()=>runtimeCurrent()&&authority().canView===true?journal?.forms||{}:{},
  clearForm(w,s,id){if(journal&&runtimeCurrent()&&authority().canView===true){delete journal.forms[nodeKey(w,s,id)];recoveryRevision++;persist();}},
  resetClean(){if(running||journal?.counts().fields||journal?.pending||Object.keys(journal?.forms||{}).length)throw Error('CANVAS_UNSYNCHRONIZED');recovery?.close();recovery=null;recoveryStamp=null;projectionBase=null;journal=null;identity=null;ready=false;},accept,update,isReady:()=>ready&&tabReady&&recovery?.status().ready===true,edit:(w,s,changes)=>localChange(j=>j.edit(w,s,changes)),operation:(w,s,next,original,guardWhole=false)=>localChange(j=>j.operation(w,s,next,original,guardWhole)),remove:(w,s,id)=>localChange(j=>j.remove(w,s,id)),sync,timings:()=>clone(events),project:(w,s,input)=>{try{return ensure().project(w,s,projectionBase?rows(projectionBase,w,s):input);}catch{return input;}},dirty:()=>!!note&&!ready||journalDirty(journal),counts:()=>journal?{...journalStats(journal).counts,scopes:journalStats(journal).counts.scopes.map(pair=>[...pair])}:undefined,pending:()=>!!journal?.pending,
  added(w,s,id,to){const e=journal?.entries[journal.token(w,s,id,'nextIds')];return !!e&&(e.value||[]).includes(to)&&!(e.base||[]).includes(to);},
  travel(w,s,redo){localChange(j=>j.travel(w,s,redo));},flushRecovery:persistNow,
  async discard(w,s){if(running||journal?.pending)throw Error('CANVAS_RECEIPT_REQUIRED');const at=current();w??=at?.workspace;s??=at?.stage;if(!w||!s)throw Error('CANVAS_SCOPE_REQUIRED');const stamp=captureRecoveryOwner(),session=recovery,revision=recoveryRevision;if(!await confirmCanvas(t('放棄目前畫布尚未同步的本機變更？其他畫布保留。','Bỏ thay đổi cục bộ chưa đồng bộ của sơ đồ này? Giữ các sơ đồ khác.')))return;requireRecoveryCurrent(session,stamp,revision);ensure().discard(w,s);note='';persistNow();api()?.updateLocalSaveState?.();},
  async beforeSave(){admit();const j=ensure();if(running)throw Error('CANVAS_SYNC_IN_PROGRESS');const at=current();if(!at?.workspace||!at?.stage)throw Error('CANVAS_SCOPE_REQUIRED');if(Object.keys(j.forms).some(key=>{const scope=JSON.parse(key);return scope[0]===at.workspace&&scope[1]===at.stage;}))throw Error('LOCAL_INPUT_REQUIRES_ACTION');if(api().ownedLedger?.hasRevertRecovery?.())throw Error('OWNED_LEDGER_REVERT_UNCONFIRMED');if(api().canSaveCanvas?.()===false)throw Error('PENDING_OR_PERMISSION_LOCKED');const result=await sync(undefined,undefined,true);if(result===null)return null;return {canvasHandled:true,canvasSaved:result?.canvasSaveConfirmed===true};}
 };
 // oxlint-disable-next-line typescript/no-deprecated -- Browser exit prompt for unsynchronized local work.
 host.addEventListener('beforeunload',e=>{persistNow();if(host.ProcessDeliveryNavigation?.canUnloadWithoutPrompt?.()===true)return;if(journal?.pending||running){e.preventDefault();e.returnValue='畫布尚未同步 / Sơ đồ chưa đồng bộ';}});
 host.addEventListener('pagehide',()=>{persistNow();ready=false;tabReady=false;});
})(typeof window==='undefined'?globalThis:window);
