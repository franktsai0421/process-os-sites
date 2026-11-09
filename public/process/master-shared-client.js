(function(host){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
  host.createMasterSharedBridge=({control,onChange,processLocalSave=false})=>{
    const clients=new Map(),clientOwners=new Map(),bases=new Map(),generations=new Map(),permissions=new Map(),readTokens=new Map(),readOwners=new Map();let busy=false;
    const localScopes=new Set(['AB','C',...(processLocalSave?['PROCESS']:[])]),locals=new Map(),stateRevisions=new Map(),saveChoices=new Map();let processSaving=false,processSave=null;
    // Page-owned display admission. It never changes a scope, journal or base.
    const displayLeases=new Map();let displayFlights=0;
    const displayPin=scope=>{const lease=displayLeases.get(scope),epoch=lease?.epoch();if(lease&&lease.current()!==true)throw Error('APPROVED_HISTORY_READ_ONLY');return()=>displayLeases.get(scope)===lease&&(!lease||lease.current()===true&&lease.epoch()===epoch);};
    const assertDisplay=scope=>{displayPin(scope);};
    const refreshDisplay=scope=>{try{displayLeases.get(scope)?.refresh?.();}catch{/* Display cannot change an operation result. */}};
    function setApprovedDisplayLease(scope,lease){if(!['AB','C','PROCESS'].includes(scope)||typeof lease?.current!=='function'||typeof lease.epoch!=='function')throw Error('APPROVED_DISPLAY_LEASE_REQUIRED');displayLeases.set(scope,lease);readOwners.delete(scope);}
    function currentPermissions(scope){const cached=permissions.get(scope),transport=clients.get(host.ProcessSync?.identity?.id+':'+scope);if(!transport)return undefined;const fresh=Object.fromEntries(['view','edit','create','delete','save','submit','withdraw','approve','return','history','restore'].flatMap(key=>typeof transport.permission(key)==='boolean'?[[key,transport.permission(key)]]:[]));return Object.keys(fresh).length?{...cached,...fresh}:undefined;}

    const client=scope=>{const actor=host.ProcessSync?.identity?.id;if(!actor)throw Error('LOGIN_REQUIRED');const key=actor+':'+scope;
      if((scope==='PROCESS'||localScopes.has(scope))&&clients.has(key)&&(!ownerMatches(clientOwners.get(key))||clients.get(key).isRuntimeCurrent?.()===false||localScopes.has(scope)&&clients.get(key).isBeginRuntimeCurrent?.()===false)){clients.delete(key);clientOwners.delete(key);readTokens.delete(key);}
      if(!clients.has(key)){clients.set(key,host.createSharedDraftClient({endpoint:'/api/master/workflow?scope='+encodeURIComponent(scope)+'&caseMetadata=1',legacyArchive:true,actorId:actor,headers:()=>host.ProcessSync?.platformHeaders?.()||{'Content-Type':'application/json'},...(scope==='PROCESS'?{externalDurableBounded:{scope:'PROCESS'},...(processLocalSave?{durableBegin:true,allowUnknownDeparture:true,guardAccessResults:true,processLocalSave:true}:{})}:localScopes.has(scope)?{durableBegin:true,allowUnknownDeparture:true,guardAccessResults:true}:{})}));if(scope==='PROCESS'||localScopes.has(scope))clientOwners.set(key,captureOwner());}return clients.get(key);
    };
    const flow=scope=>control.workflowScopes?.[scope];
    const draft=scope=>control.versions.find(v=>v.scope===scope&&v.status==='draft');
    function adopt(scope,result){assertDisplay(scope);if(!result.control)return;
      if(localScopes.has(scope)&&Number.isSafeInteger(result.revision)){if(result.revision<(stateRevisions.get(scope)??-1))return;stateRevisions.set(scope,result.revision);}
      const c=result.control;
      control.versions=control.versions.filter(v=>v.scope!==scope).concat(c.versions.map(v=>({...v,scope,warnings:v.warnings||[]})));
      const active=c.versions.find(v=>v.id===c.activeVersionId);if(active)control.active[scope]=copy(active.snapshot);
      if(c.workflow)control.workflowScopes={...control.workflowScopes,[scope]:c.workflow};
      bases.set(scope,copy(c.workflow?.working||draft(scope)?.snapshot||active?.snapshot||{}));generations.set(scope,c.workflow?.generation);
      const local=locals.get(scope),version=draft(scope);if(local&&ownerMatches(local.owner)&&version){if(scope==='PROCESS')local.snapshot=projectLocal(c.workflow.working,local.batches);version.snapshot=copy(local.snapshot);}
    }
    async function load(scope){const displayCurrent=displayPin(scope);const actor=host.ProcessSync?.identity,key=actor?.id+':'+scope,current=flow(scope),owner={};readOwners.set(scope,owner);
      let result;try{result=await client(scope).read(readTokens.get(key)||(current?current.generation+':'+current.revision:''),{isCurrent:displayCurrent});}
      catch(error){if(!displayCurrent()||actor!==host.ProcessSync?.identity||readOwners.get(scope)!==owner)return{unchanged:true,permissionsChanged:false};throw error;}
      if(!displayCurrent()||actor!==host.ProcessSync?.identity)return{unchanged:true,permissionsChanged:false};
      if(readOwners.get(scope)!==owner)return{unchanged:true,permissionsChanged:false};
      if(result.revision!==undefined)readTokens.set(key,'state:'+result.revision);
      const permissionsChanged=!equal(permissions.get(scope),result.permissions);if(result.permissions)permissions.set(scope,result.permissions);adopt(scope,result);return{...result,permissionsChanged};}
    // Recovery-enabled name Apply uses the same transport/attribution path,
    // but exposes preparation so a receipt-only local marker precedes dispatch.
    const preparedPatches=new WeakMap();
    const captureOwner=()=>({actor:host.ProcessSync?.identity,epoch:host.ProcessSync?.identityGeneration?.(),delivery:host.ProcessSync?.captureDelivery?.()});
    const ownerMatches=pin=>pin.actor===host.ProcessSync?.identity&&pin.epoch===host.ProcessSync?.identityGeneration?.()&&(!pin.delivery||host.ProcessSync?.isCurrentDelivery?.(pin.delivery)!==false);
    const captureVersion=scope=>({generation:flow(scope)?.generation,revision:flow(scope)?.revision});
    function requireRecoveryVersion(scope,pin,next){
      const current=flow(scope);
      // Identity alone does not own a workflow: a new generation or a newer
      // poll may arrive while this request is pending. Never adopt backwards.
      if(!pin.generation||current?.generation!==pin.generation||next?.generation!==pin.generation||!Number.isSafeInteger(pin.revision)||!Number.isSafeInteger(current.revision)||!Number.isSafeInteger(next.revision)||next.revision<Math.max(pin.revision,current.revision))throw Error('RECOVERY_READBACK_REQUIRED');
    }
    function preparePatch(scope,patches,guards=[]){
      const displayCurrent=displayPin(scope);
      const current=flow(scope);if(!current)throw Error('BEGIN_REQUIRED');
      const c=client(scope);if(c.permission('edit')!==true)throw Object.assign(Error('FORBIDDEN'),{notSent:true});if(current.pendingId)throw Object.assign(Error('PENDING_LOCKED'),{notSent:true});
      const command=c.prepareRecovery(current.generation,{patches,guards});
      preparedPatches.set(command,{scope,displayCurrent,client:c,owner:captureOwner(),generation:current.generation,revision:current.revision,raw:JSON.stringify(command)});return command;
    }
    function rejectionCapability(scope,command){
      assertDisplay(scope);
      const pin=preparedPatches.get(command);if(!pin||pin.scope!==scope||!pin.displayCurrent()||!ownerMatches(pin.owner)||flow(scope)?.generation!==pin.generation||JSON.stringify(command)!==pin.raw)throw Object.assign(Error('ACCOUNT_CHANGED_REOPEN_REQUIRED'),{notSent:true});
      return pin.client.rejectionCapability(command);
    }
    function rejectionClient(scope,command){assertDisplay(scope);const pin=preparedPatches.get(command);if(!pin||pin.scope!==scope||!pin.displayCurrent()||!ownerMatches(pin.owner)||JSON.stringify(command)!==pin.raw)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');return pin.client;}
    const hasConfirmedRejection=(scope,command)=>rejectionClient(scope,command).hasConfirmedRejection(command);
    const isConfirmedRejection=(scope,error,command)=>rejectionClient(scope,command).isConfirmedRejection(error,command);
    const finalizeRejected=(scope,command)=>rejectionClient(scope,command).finalizeRejected(command);
    function dispatchPreparedPatch(scope,command,dispatchOptions){
      assertDisplay(scope);
      const pin=preparedPatches.get(command);
      if(!pin||pin.scope!==scope||!pin.displayCurrent()||!ownerMatches(pin.owner)||flow(scope)?.generation!==pin.generation)throw Object.assign(Error('ACCOUNT_CHANGED_REOPEN_REQUIRED'),{notSent:true});
      if(JSON.stringify(command)!==pin.raw)throw Object.assign(Error('OPERATION_ID_PAYLOAD_MISMATCH'),{notSent:true});
      if(pin.flight)return pin.flight;readOwners.delete(scope);
      displayFlights++;pin.flight=pin.client.sendPrepared(command,dispatchOptions);void pin.flight.then(result=>{displayFlights--;refreshDisplay(scope);pin.response=result;},()=>{displayFlights--;refreshDisplay(scope);});return pin.flight;
    }
    async function finishPreparedPatch(scope,command,result){
      assertDisplay(scope);
      const pin=preparedPatches.get(command);if(!pin||pin.scope!==scope||result!==pin.response||!pin.flight)throw Error('PREPARED_RESPONSE_REQUIRED');
      if(pin.promise)return pin.promise;
      pin.promise=(async()=>{displayFlights++;try{
        if(!pin.displayCurrent()||!ownerMatches(pin.owner)||flow(scope)?.generation!==pin.generation)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
        const fresh=result.control?result:await pin.client.read();
        if(!pin.displayCurrent()||!ownerMatches(pin.owner))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
        requireRecoveryVersion(scope,pin,fresh.control?.workflow);
        readOwners.delete(scope);readTokens.delete(pin.owner.actor?.id+':'+scope);adopt(scope,fresh);
        return {...result,control:fresh.control};
      }finally{displayFlights--;refreshDisplay(scope);}})();return pin.promise;
    }
    async function sendPreparedPatch(scope,command,dispatchOptions){const result=await dispatchPreparedPatch(scope,command,dispatchOptions);return finishPreparedPatch(scope,command,result);}
    async function patch(scope,patches,guards=[]){
      const displayCurrent=displayPin(scope);displayFlights++;try{
      if(scope==='PROCESS'&&processLocalSave)return localPatch(scope,patches,guards);
      if(!flow(scope))throw Error('BEGIN_REQUIRED');
      const actor=host.ProcessSync?.identity,epoch=host.ProcessSync?.identityGeneration?.(),delivery=host.ProcessSync?.captureDelivery?.();
      readOwners.delete(scope);
      const c=client(scope),result=await c.command(flow(scope).generation,'apply',{patches,guards});
      const fresh=result.control?result:await c.read(undefined,{isCurrent:displayCurrent});if(!displayCurrent()||actor!==host.ProcessSync?.identity||epoch!==host.ProcessSync?.identityGeneration?.()||delivery&&host.ProcessSync?.isCurrentDelivery?.(delivery)===false)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      readOwners.delete(scope);readTokens.delete(actor?.id+':'+scope);adopt(scope,fresh);return result;
      }finally{displayFlights--;refreshDisplay(scope);}
    }
    async function readRecovery(scope){
      const displayCurrent=displayPin(scope);displayFlights++;try{
      const pin=captureOwner(),version=captureVersion(scope),c=client(scope),result=await c.read(undefined,{isCurrent:displayCurrent});
      if(!displayCurrent()||!ownerMatches(pin))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      if(!result.control?.workflow||!result.permissions)throw Error('RECOVERY_READBACK_REQUIRED');
      requireRecoveryVersion(scope,version,result.control.workflow);
      readOwners.delete(scope);readTokens.delete(pin.actor?.id+':'+scope);permissions.set(scope,result.permissions);adopt(scope,result);return result;
      }finally{displayFlights--;refreshDisplay(scope);}
    }
    async function receiptRecovery(scope,reference){
      const displayCurrent=displayPin(scope);displayFlights++;try{
      const pin=captureOwner(),version=captureVersion(scope),c=client(scope),result=await c.receipt(reference.operationId,reference.generation);
      if(!displayCurrent()||!ownerMatches(pin))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      const r=result?.receipt;
      if(r?.operationId!==reference.operationId||r.generation!==reference.generation||r.generation!==version.generation||!Number.isSafeInteger(r.revision)||typeof r.unchanged!=='boolean')throw Error('RECOVERY_READBACK_REQUIRED');
      requireRecoveryVersion(scope,version,flow(scope));
      const verified=c.isVerifiedReadback?.(result)===true,readback=verified?result:await readRecovery(scope);if(!displayCurrent()||!ownerMatches(pin))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      const f=readback.control.workflow;requireRecoveryVersion(scope,version,f);
      if(f.generation!==r.generation||f.revision<r.revision)throw Error('RECOVERY_READBACK_REQUIRED');
      if(verified){readOwners.delete(scope);readTokens.delete(pin.actor?.id+':'+scope);permissions.set(scope,readback.permissions);adopt(scope,readback);}
      return {...result,control:readback.control,permissions:readback.permissions};
      }finally{displayFlights--;refreshDisplay(scope);}
    }
    function identify(value,previous){
      if(Array.isArray(value)){
        // First-match indexes preserve the legacy lookup rules without scanning
        // every previous product once for each current product on every Apply.
        const ids=new Map(),codes=new Map(),groups=new Map();
        for(const p of previous||[]){if(!p||typeof p!=='object')continue;if(!ids.has(p.id))ids.set(p.id,p);if(!codes.has(p.code))codes.set(p.code,p);if(!groups.has(p.line))groups.set(p.line,new Map());const names=groups.get(p.line);if(!names.has(p.name))names.set(p.name,p);}
        for(const row of value)if(row&&typeof row==='object'){
          const old=row.id?ids.get(row.id):row.code?codes.get(row.code):groups.get(row.line)?.get(row.name);
          row.id ||= old?.id||crypto.randomUUID();identify(row,old);
        }
      }else if(value&&typeof value==='object')for(const [key,next]of Object.entries(value))if(key==='products'||key==='lines'||key==='categoryGroups'||key==='stages'&&Array.isArray(next)&&next.some(r=>typeof r==='object'))identify(next,previous?.[key]);
    }
    function diff(before,after,path=[],patches=[],guards=[]){
      if(equal(before,after))return{patches,guards};
      if(Array.isArray(before)&&Array.isArray(after)&&[...before,...after].every(r=>r&&typeof r==='object'&&typeof r.id==='string')){
        const old=new Map(before.map(r=>[r.id,r])),next=new Map(after.map(r=>[r.id,r]));
        for(const [id,row]of old)if(!next.has(id)){const p=[...path,{id}];patches.push({op:'remove',path:p});guards.push({path:p,value:row});}
        for(const [id,row]of next)if(!old.has(id))patches.push({op:'insert',path,value:row});else diff(old.get(id),row,[...path,{id}],patches,guards);
        // Persist order only when membership is unchanged; inserted rows retain stable identities.
        if(before.length===after.length&&before.every(r=>next.has(r.id))&&!equal(before.map(r=>r.id),after.map(r=>r.id))){patches.push({op:'order',path,ids:after.map(r=>r.id)});guards.push({path,value:before});}
      }else if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){
        for(const key of Object.keys(after))if(key!=='id')diff(before[key],after[key],[...path,key],patches,guards);
      }else{patches.push({op:'set',path,value:after});guards.push({path,value:before});}
      return{patches,guards};
    }
    function localValue(snapshot,path){let value=snapshot;for(const part of path)value=typeof part==='string'?value?.[part]:value?.find(row=>row.id===part.id);return value;}
    function projectLocal(snapshot,batches){const next=copy(snapshot);for(const batch of batches)for(const p of batch.patches){const parent=localValue(next,p.path.slice(0,-1)),last=p.path.at(-1);if(p.op==='insert'){const list=localValue(next,p.path);if(Array.isArray(list)&&!list.some(row=>row.id===p.value.id))list.push(copy(p.value));}else if(p.op==='order'){const list=localValue(next,p.path);if(Array.isArray(list)){const order=new Map(p.ids.map((id,i)=>[id,i]));list.sort((a,b)=>(order.get(a.id)??p.ids.length)-(order.get(b.id)??p.ids.length));}}else if(parent){if(typeof last==='string')parent[last]=p.value===undefined?undefined:copy(p.value);else if(Array.isArray(parent)){const i=parent.findIndex(row=>row.id===last.id);if(i>=0&&p.op==='remove')parent.splice(i,1);}}}return next;}
    function localPatch(scope,patches,guards=[]){
      assertDisplay(scope);
      const current=flow(scope),c=client(scope),previous=locals.get(scope),owner=previous?.owner||captureOwner();
      if(scope!=='PROCESS')throw Error('PROCESS_LOCAL_SCOPE_REQUIRED');if(!current)throw Error('BEGIN_REQUIRED');
      if(!ownerMatches(owner)||previous&&previous.generation!==current.generation)throw Error('STALE_GENERATION');
      if(c.hasUnknown()&&!processSaving)throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');if(c.permission('edit')!==true)throw Error('FORBIDDEN');if(current.pendingId)throw Error('PENDING_LOCKED');
      const before=previous?.snapshot||current.working;
      for(const g of guards)if(!equal(localValue(before,g.path),g.value))throw Error('DEPENDENCY_CHANGED_RECONFIRM');
      if(!patches.length)return null;const batch=copy({patches,guards}),batches=[...(previous?.batches||[]),batch],snapshot=projectLocal(before,[batch]);
      locals.set(scope,{owner,generation:current.generation,base:previous?.base||copy(before),snapshot,batches});draft(scope).snapshot=copy(snapshot);return {local:true};
    }
    const localDirty=scope=>!!locals.get(scope)?.batches.length;
    const unsavedLocal=scope=>localDirty(scope)||scope==='PROCESS'&&processLocalSave&&(host.ProcessMasterVersioning?.departureNames.dirty()||host.ProcessEquipment?.hasUnappliedChanges?.());
    function isLocalProcessInsert(kind,key){
      const local=locals.get('PROCESS'),current=flow('PROCESS');
      if(!local||!ownerMatches(local.owner)||local.generation!==current?.generation||!['template','equipment'].includes(kind))return false;
      const collect=snapshot=>Object.values(snapshot||{}).flatMap(list=>list.flatMap(row=>kind==='template'?[row]:row.equipment||[]));
      const matches=row=>kind==='template'?(row.catalogKey||row.presetKey||row.id)===key:row.id===key;
      if(collect(current.working).some(matches))return false;
      const inserted=new Set(local.batches.flatMap(batch=>batch.patches.flatMap(p=>p.op!=='insert'?[]:kind==='template'&&p.path.length===1?[p.value.id]:kind==='equipment'&&p.path.at(-1)==='equipment'?[p.value.id]:kind==='equipment'&&p.path.length===1?(p.value.equipment||[]).map(row=>row.id):[])));
      const targets=collect(local.snapshot).filter(matches);return targets.length>0&&targets.every(row=>inserted.has(row.id));
    }
    function productReferenceCode(scope,product){const existing=flow(scope)?.working?.products?.find(p=>p.id===product?.id);if(existing)return existing.code;return locals.get(scope)?.batches.some(b=>b.patches.some(p=>p.op==='insert'&&p.path.length===1&&p.path[0]==='products'&&p.value.id===product?.id))?null:product?.code;}

    function discardLocal(scope){saveChoices.get(scope)?.();locals.delete(scope);const version=draft(scope);if(version&&flow(scope))version.snapshot=copy(flow(scope).working);}
    function stageLocal(scope){
      assertDisplay(scope);
      const current=flow(scope),c=client(scope);if(!current)throw Error('BEGIN_REQUIRED');
      if(c.hasUnknown())throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');
      if(c.permission('edit')!==true)throw Error('FORBIDDEN');if(current.pendingId)throw Error('PENDING_LOCKED');
      const previous=locals.get(scope),owner=previous?.owner||captureOwner();
      if(!ownerMatches(owner)||previous&&previous.generation!==current.generation)throw Error('STALE_GENERATION');
      const before=previous?.snapshot||bases.get(scope)||current.working,next=copy(draft(scope).snapshot);identify(next,before);
      const batch=diff(before,next);if(!batch.patches.length)return null;
      if(scope!=='PROCESS'&&batch.patches.some(p=>p.path[0]==='categoryGroups'&&(p.path.at(-1)==='defaultStages'||p.op==='insert')))batch.guards.push({path:['products'],value:copy(before.products)},{path:['lines'],value:copy(before.lines)});
      locals.set(scope,{owner,generation:current.generation,base:previous?.base||copy(before),snapshot:next,batches:[...(previous?.batches||[]),batch]});draft(scope).snapshot=copy(next);
      return {local:true};
    }
    function retireProcessSave(result){
      const pin=processSave;if(!pin)return;
      if(typeof result?.receipt?.operationId!=='string')throw Error('SAVE_READBACK_REQUIRED');
      if(result.receipt.operationId!==pin.operationId)return;
      if(!ownerMatches(pin.owner)||result.receipt.generation!==pin.generation)throw Error('SAVE_READBACK_REQUIRED');
      const remaining=locals.get('PROCESS');
      // This is this runtime's immutable sent prefix, not all current input.
      // A reload has no RAM pin; departure may have abandoned/replaced the local
      // batches. Neither case grants permission to discard or resurrect input.
      if(remaining&&ownerMatches(remaining.owner)&&remaining.generation===pin.generation&&remaining.batches.length>=pin.batches.length&&pin.batches.every((batch,i)=>remaining.batches[i]===batch)){
        const suffix=remaining.batches.slice(pin.batches.length);
        // A late whole-photo-array setter still contains the original primary,
        // even when the user only appended a tail after choosing theirs. Derive
        // its actual unsent intent against the fixed sent snapshot, never the
        // later receipt readback. Conflicting late intent waits for explicit Save.
        remaining.base=copy(pin.intentSnapshot);remaining.batches=suffix;
        if(suffix.length){
          const intent=projectLocal(pin.intentSnapshot,suffix),comparison=compareMasterSnapshots(pin.intentSnapshot,intent,pin.acceptedSnapshot,'PROCESS');
          if(!comparison.conflicts.length){remaining.base=copy(pin.acceptedSnapshot);remaining.batches=comparison.materialize('mine').filter(batch=>batch.patches.length);}
        }
        if(!remaining.batches.length)discardLocal('PROCESS');
      }
      processSave=null;
    }
    // Three-way comparison is local to this explicit Save. Stable entity IDs
    // preserve unrelated rows and fields; primitive lists remain one value.
    function compareMasterSnapshots(base,mine,theirs,scope){
      const conflicts=[],clone=value=>value===undefined?undefined:copy(value);
      const entityList=value=>Array.isArray(value)&&value.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&typeof row.id==='string');
      const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
      const label=path=>path.map(part=>typeof part==='string'?part:part.id).join(' · ');
      // Legacy photo src is a comparison key only: never add a persisted ID or
      // infer that a new src inherits metadata from a removed photo.
      function processMedia(before,own,other,path,choice){
        const lists=[before.mediaItems,own.mediaItems,other.mediaItems];
        if(!lists.every(Array.isArray)||lists.some(list=>list.some(row=>row&&Object.hasOwn(row,'id'))))return null;
        const fields=['mediaItems','media','mediaName','mediaType'],group=value=>Object.fromEntries(fields.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
        const groups=[before,own,other].map(group),valid=list=>list.every(row=>object(row)&&typeof row.src==='string'&&row.src)&&new Set(list.map(row=>row.src)).size===list.length;
        const aliases=value=>{const first=value.mediaItems[0];return ['media','mediaName','mediaType'].every((key,index)=>!Object.hasOwn(value,key)||equal(value[key],[first?.src||null,first?.name||'',first?.type||''][index]));};
        const fallback=reason=>{
          if(equal(groups[1],groups[0]))return clone(groups[2]);
          if(equal(groups[2],groups[0])||equal(groups[1],groups[2]))return clone(groups[1]);
          if(choice===undefined)conflicts.push({path:[...path,'mediaItems'],label:label(path)+' · '+t('照片組：無法安全辨識（','Nhóm ảnh: không thể xác định an toàn (')+reason+')',mine:clone(groups[1]),theirs:clone(groups[2])});
          return clone(groups[choice==='mine'?1:2]);
        };
        if(!lists.every(valid))return fallback(t('來源重複或不完整','nguồn trùng hoặc thiếu'));
        if(![before,own,other].every(aliases))return fallback(t('主照片別名不一致','bí danh ảnh chính không khớp'));
        if(!lists[0].length)return fallback(t('缺少原主照片基準','thiếu cơ sở ảnh chính gốc'));
        const [base,mine,peer]=lists,maps=lists.map(list=>new Map(list.map(row=>[row.src,row]))),firsts=lists.map(list=>list[0]),sources=firsts.map(row=>row?.src);
        const changedTailSource=[1,2].some(side=>base.slice(1).some(row=>!maps[side].has(row.src)&&lists[side].some(item=>!maps[0].has(item.src)&&item.src!==sources[side])&&(!maps[3-side].has(row.src)||!equal(maps[3-side].get(row.src),row))));
        if(changedTailSource)return fallback(t('更換來源無法可靠配對','không thể ghép nguồn ảnh thay thế'));
        let principalConflict=false,principal=sources[0],principalSide=null;
        if(!sources.every(src=>src===sources[0])){
          if(equal(firsts[1],firsts[0])){principal=sources[2];principalSide=2;}
          else if(equal(firsts[2],firsts[0])||equal(firsts[1],firsts[2])){principal=sources[1];principalSide=1;}
          else principalConflict=true;
          // Promoting an existing tail photo depends on that photo surviving.
          if(principal!==undefined&&maps[0].has(principal)&&(!maps[1].has(principal)||!maps[2].has(principal)))principalConflict=true;
          if(principalConflict){
            if(choice===undefined)conflicts.push({path:[...path,'mediaItems'],label:label(path)+' · '+t('主照片／相依移除','Ảnh chính / xóa phụ thuộc'),mine:clone(firsts[1]),theirs:clone(firsts[2])});
            principalSide=choice==='mine'?1:2;principal=sources[principalSide];
          }
        }
        const selected=choice==='mine'?1:2,principalKeys=new Set(sources.filter(src=>src!==undefined)),rows=new Map(),keys=[...new Set([...peer,...mine,...base].map(row=>row.src))];
        for(const src of keys){
          let row;
          // A competing replacement is part of the principal choice, not an
          // independent append. Existing tails outside this group still merge.
          if(principalConflict&&principalKeys.has(src)&&(!maps[1].has(src)||!maps[2].has(src)))row=clone(maps[selected].get(src));
          else row=merge(maps[0].get(src),maps[1].get(src),maps[2].get(src),[...path,'mediaItems',src],choice);
          if(row!==undefined)rows.set(src,row);
        }
        const ids=lists.map(list=>list.map(row=>row.src)),currentPrincipals=new Set(sources.slice(1)),common=ids[0].filter(src=>!currentPrincipals.has(src)&&maps[1].has(src)&&maps[2].has(src)&&rows.has(src)),commonSet=new Set(common),orders=ids.slice(1).map(list=>list.filter(src=>commonSet.has(src))),moved=orders.map(order=>!equal(order,common));
        const sharedNew=ids[1].filter(src=>!maps[0].has(src)&&maps[2].has(src)&&!currentPrincipals.has(src)&&rows.has(src)),sharedTail=new Set([...common,...sharedNew]),sharedOrders=ids.slice(1).map(list=>list.filter(src=>sharedTail.has(src)));
        const orderConflict=moved.every(Boolean)&&!equal(orders[0],orders[1])||sharedNew.length>0&&!equal(sharedOrders[0],sharedOrders[1]);
        if(orderConflict&&choice===undefined)conflicts.push({path:[...path,'mediaItems'],label:label(path)+' · '+t('照片順序','Thứ tự ảnh'),mine:ids[1],theirs:ids[2]});
        const preferMine=orderConflict?choice==='mine':moved[0],tailSide=preferMine?1:2,primary=ids[principalSide??tailSide],secondary=ids[(principalSide??tailSide)===1?2:1],newTail=src=>!maps[0].has(src)&&!principalKeys.has(src),order=primary.filter(src=>rows.has(src)&&!newTail(src));
        // Principal choice owns only its dependent positions. Tail order is a
        // separate three-way unit: keep the other side's independent reorder,
        // even when the global choice selected this side's principal photo.
        const tailOrder=orders[tailSide-1];let tailIndex=0;
        for(let index=0;index<order.length;index++)if(commonSet.has(order[index]))order[index]=tailOrder[tailIndex++];
        const insert=(sequence,include)=>{for(let index=0;index<sequence.length;index++){
          const src=sequence[index];if(!include(src)||!rows.has(src)||order.includes(src))continue;
          const after=sequence.slice(index+1).find(key=>order.includes(key));
          if(after!==undefined)order.splice(order.indexOf(after),0,src);else order.push(src);
        }};
        insert(secondary,src=>!newTail(src));
        // Tail anchors and append tie order follow the tail comparison, never
        // a conflicting principal choice. Peer additions precede local ties.
        insert(ids[tailSide],newTail);insert(ids[3-tailSide],newTail);
        for(const src of rows.keys())if(!order.includes(src))order.push(src);
        if(principal!==undefined&&rows.has(principal)){const index=order.indexOf(principal);order.splice(index,1);order.unshift(principal);}
        const mediaItems=order.map(src=>rows.get(src)),result={mediaItems},first=mediaItems[0];
        // Aliases are derived from the final first row, including merged metadata
        // and the surviving first tail after an independently deleted principal.
        for(const [index,key]of ['media','mediaName','mediaType'].entries())if([before,own,other].some(value=>Object.hasOwn(value,key)))result[key]=[first?.src||null,first?.name||'',first?.type||''][index];
        return result;
      }
      function merge(before,own,other,path,choice){
        if(equal(own,before))return clone(other);
        if(equal(other,before)||equal(own,other))return clone(own);
        if(entityList(before)&&entityList(own)&&entityList(other)){
          for(const list of [before,own,other])if(new Set(list.map(row=>row.id)).size!==list.length)throw Error('CATALOG_IDENTITY_INVALID');
          const maps=[before,own,other].map(list=>new Map(list.map(row=>[row.id,row]))),ids=[...new Set([...other,...own,...before].map(row=>row.id))],rows=new Map();
          for(const id of ids){const row=merge(maps[0].get(id),maps[1].get(id),maps[2].get(id),[...path,{id}],choice);if(row!==undefined)rows.set(id,row);}
          const baseline=before.map(row=>row.id),baselineIds=new Set(baseline),common=baseline.filter(id=>maps[1].has(id)&&maps[2].has(id)),commonIds=new Set(common);
          const ownIds=own.map(row=>row.id),otherIds=other.map(row=>row.id),ownOrder=ownIds.filter(id=>commonIds.has(id)),otherOrder=otherIds.filter(id=>commonIds.has(id));
          const ownMoved=!equal(common,ownOrder),otherMoved=!equal(common,otherOrder);
          const anchors=(ids,id)=>{const index=ids.indexOf(id);return [ids.slice(0,index).findLast(key=>commonIds.has(key)),ids.slice(index+1).find(key=>commonIds.has(key))];};
          const sharedIds=new Set(ownIds.filter(id=>maps[2].has(id)&&rows.has(id))),ownShared=ownIds.filter(id=>sharedIds.has(id)),otherShared=otherIds.filter(id=>sharedIds.has(id));
          const insertedConflict=!equal(ownShared,otherShared)&&ownShared.some(id=>!baselineIds.has(id))||ownIds.some(id=>!baselineIds.has(id)&&maps[2].has(id)&&!equal(anchors(ownIds,id),anchors(otherIds,id)));
          const orderConflict=ownMoved&&otherMoved&&!equal(ownOrder,otherOrder)||insertedConflict;
          if(orderConflict&&choice===undefined)conflicts.push({path,label:label(path)+' · '+t('順序','Thứ tự'),mine:ownIds,theirs:otherIds});
          const preferOwn=orderConflict?choice==='mine':ownMoved;
          const primary=preferOwn?ownIds:otherIds,secondary=preferOwn?otherIds:ownIds,order=primary.filter(id=>rows.has(id));
          // Place independent additions at their original neighboring anchors.
          for(let index=0;index<secondary.length;index++){
            const id=secondary[index];if(!rows.has(id)||order.includes(id))continue;
            const after=secondary.slice(index+1).find(key=>order.includes(key)),before=secondary.slice(0,index).findLast(key=>order.includes(key));
            if(after!==undefined)order.splice(order.indexOf(after),0,id);else if(before!==undefined)order.splice(order.indexOf(before)+1,0,id);else order.push(id);
          }
          for(const id of rows.keys())if(!order.includes(id))order.push(id);
          return order.map(id=>rows.get(id));
        }
        if(object(before)&&object(own)&&object(other)){
          const media=scope==='PROCESS'?processMedia(before,own,other,path,choice):null,result=media||{};
          for(const key of new Set([...Object.keys(before),...Object.keys(own),...Object.keys(other)])){
            if(media&&['mediaItems','media','mediaName','mediaType'].includes(key))continue;
            const value=merge(before[key],own[key],other[key],[...path,key],choice);if(value!==undefined)result[key]=value;
          }return result;
        }
        if(choice===undefined)conflicts.push({path,label:label(path),mine:clone(own),theirs:clone(other)});
        return clone(choice==='mine'?own:other);
      }
      merge(base,mine,theirs,[],undefined);
      return {conflicts,materialize(choice){
        const merged=merge(base,mine,theirs,[],choice),batch=diff(theirs,merged);
        // The command also pins the exact observed workflow revision, including
        // chosen-theirs units, without duplicating the whole catalog in guards.
        if(batch.patches.some(p=>p.path[0]==='categoryGroups'&&(p.path.at(-1)==='defaultStages'||p.op==='insert')))
          for(const key of ['products','lines'])if(!batch.guards.some(g=>g.path.length===1&&g.path[0]===key))batch.guards.push({path:[key],value:copy(theirs[key])});
        const batches=[batch],projected=projectLocal(theirs,[batch]);
        // Existing diff deliberately omits ordering when membership changes.
        // Reconcile that order in a later guarded batch within the same CAS.
        function orderRows(current,wanted,path=[]){
          if(entityList(current)&&entityList(wanted)){
            const byId=new Map(current.map(row=>[row.id,row]));
            for(const row of wanted)if(byId.has(row.id))orderRows(byId.get(row.id),row,[...path,{id:row.id}]);
            if(!equal(current.map(row=>row.id),wanted.map(row=>row.id))){
              batches.push({patches:[{op:'order',path,ids:wanted.map(row=>row.id)}],guards:[{path,value:copy(current)}]});
              const positions=new Map(wanted.map((row,index)=>[row.id,index]));current.sort((a,b)=>positions.get(a.id)-positions.get(b.id));
            }
          }else if(object(current)&&object(wanted))for(const key of Object.keys(wanted))orderRows(current[key],wanted[key],[...path,key]);
        }
        orderRows(projected,merged);return batches;
      }};
    }
    function chooseCatalogConflicts(scope,conflicts,current){
      return new Promise(resolve=>{
        const dialog=document.createElement('dialog'),prior=document.activeElement;
        dialog.className='vd-confirm';dialog.dataset.masterSaveConflicts=scope;dialog.style.overflowWrap='anywhere';dialog.setAttribute('aria-labelledby','master-save-choice-title');
        const add=(tag,text,parent=dialog)=>{const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;};
        add('h2',t('選擇衝突處理方式','Chọn cách xử lý xung đột')).id='master-save-choice-title';
        add('p',t('一次處理所有衝突，沒有衝突的雙方修改都會保留。','Áp dụng một lựa chọn cho tất cả xung đột; giữ các thay đổi không xung đột.'));
        const list=add('ul',''),format=value=>value===undefined?t('已刪除／未填寫','Đã xóa / chưa nhập'):typeof value==='object'?JSON.stringify(value):String(value);
        for(const unit of conflicts){const item=add('li','',list);add('strong',unit.label,item);add('p',t('我的：','Của tôi: ')+format(unit.mine),item);add('p',t('對方的：','Của người khác: ')+format(unit.theirs),item);}
        const actions=add('div','');actions.className='vd-actions';let done=false;
        const finish=choice=>{if(done)return;done=true;if(saveChoices.get(scope)===cancel)saveChoices.delete(scope);host.removeEventListener('pagehide',cancel);dialog.remove();if(current()&&prior?.isConnected)prior.focus?.({preventScroll:true});resolve(choice);};
        const cancel=()=>finish('cancel');saveChoices.set(scope,cancel);
        for(const [choice,label]of [['mine',t('用我的','Dùng của tôi')],['theirs',t('用對方的','Dùng của người khác')],['cancel',t('取消','Hủy')]]){const button=add('button',label,actions);button.type='button';button.className='button'+(choice==='cancel'?' ghost':'');button.dataset.masterSaveChoice=choice;button.onclick=()=>finish(choice);if(choice==='cancel')button.autofocus=true;}
        dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});dialog.addEventListener('close',cancel);host.addEventListener('pagehide',cancel);document.body.append(dialog);dialog.showModal();
      });
    }
    async function comparedCatalogBatches(scope,local,current,c,owner,input){
      const {original,snapshot}=input,generation=current.generation;
      const currentInput=()=>ownerMatches(owner)&&flow(scope)?.generation===generation&&locals.get(scope)===local&&JSON.stringify(local?.batches||[])===original&&JSON.stringify(draft(scope)?.snapshot)===snapshot;
      const form=scope==='PROCESS'?'#equipment-editor-dialog[open]':'#master-edit-dialog[open]';
      const assertCurrent=()=>{if(!ownerMatches(owner))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');if(flow(scope)?.generation!==generation)throw Error('STALE_GENERATION');if(!currentInput()||document.querySelector(form))throw Error('UNAPPLIED_CHANGES_APPLY_REQUIRED');if(c.hasUnknown())throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');};
      async function read(){
        assertCurrent();const fresh=await c.read();assertCurrent();const next=fresh.control?.workflow;
        if(!next||next.generation!==generation)throw Error('STALE_GENERATION');
        if(!Number.isSafeInteger(next.revision)||next.revision<flow(scope).revision||Number.isSafeInteger(fresh.revision)&&fresh.revision<(stateRevisions.get(scope)??-1))throw Error('RECOVERY_READBACK_REQUIRED');
        if(!['view','edit','save'].every(key=>fresh.permissions?.[key]===true&&c.permission(key)===true))throw Error('FORBIDDEN');
        if(next.pendingId)throw Error('PENDING_LOCKED');return next;
      }
      let next=await read();
      for(let attempt=0;attempt<8;attempt++){
        const comparison=compareMasterSnapshots(local.base,projectLocal(local.base,JSON.parse(original)),next.working,scope);
        const choice=comparison.conflicts.length?await chooseCatalogConflicts(scope,comparison.conflicts,currentInput):'mine';
        assertCurrent();if(choice==='cancel')return null;
        if(comparison.conflicts.length){
          const fresh=await read();
          if(fresh.revision!==next.revision||!equal(fresh.working,next.working)){next=fresh;continue;}
        }
        const batches=comparison.materialize(choice);return {batches,acceptedSnapshot:projectLocal(next.working,batches),expectedRevision:next.revision};
      }
      throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
    }
    async function saveLocal(scope,detail){
      if(document.querySelector(scope==='PROCESS'?'#equipment-editor-dialog[open]':'#master-edit-dialog[open]'))throw Error('UNAPPLIED_CHANGES_APPLY_REQUIRED');
      const local=locals.get(scope),current=flow(scope),c=client(scope),saveOwner=captureOwner();
      if(!current)throw Error('BEGIN_REQUIRED');
      if(local&&(!ownerMatches(local.owner)||local.generation!==current.generation))throw Error('STALE_GENERATION');
      if(c.permission('save')!==true)throw Error('FORBIDDEN');
      const compareCatalog=localScopes.has(scope)&&!!local?.batches.length,input=compareCatalog?{original:JSON.stringify(local.batches),snapshot:JSON.stringify(draft(scope)?.snapshot)}:null;
      await c.flush();if(!ownerMatches(saveOwner))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      const comparison=compareCatalog?await comparedCatalogBatches(scope,local,current,c,saveOwner,input):{batches:copy(local?.batches||[]),acceptedSnapshot:copy(current.working)};if(comparison===null)return null;const {batches,acceptedSnapshot,expectedRevision}=comparison;
      const command=c.prepare(current.generation,'save',{...detail,...(expectedRevision===undefined?{}:{expectedRevision}),moduleAction:'save-local-v1',patches:batches.flatMap(b=>b.patches),input:{batches}}),owner=captureOwner();
      if(scope==='PROCESS')processSave={operationId:command.operationId,generation:current.generation,owner,batches:local?.batches.slice()||[],intentSnapshot:compareCatalog?projectLocal(local.base,JSON.parse(input.original)):copy(current.working),acceptedSnapshot};
      let result;processSaving=scope==='PROCESS';try{result=await c.sendPrepared(command);}catch(error){if(scope==='PROCESS'&&!c.hasUnknown()&&processSave?.operationId===command.operationId)processSave=null;throw error;}finally{processSaving=false;}
      if(!ownerMatches(owner))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      // Transport validates the original receipt and readback before clearing its
      // durable sent command. Retire its prefix, retaining later/replacement input.
      if(scope==='PROCESS')retireProcessSave(result);else discardLocal(scope);readOwners.delete(scope);readTokens.delete(owner.actor?.id+':'+scope);adopt(scope,result);return result;
    }
    async function execute(scope,action,detail={}){
      const displayCurrent=displayPin(scope);
      if(busy)throw Error('OPERATION_IN_PROGRESS');busy=true;
      const actor=host.ProcessSync?.identity,epoch=host.ProcessSync?.identityGeneration?.(),delivery=host.ProcessSync?.captureDelivery?.();
      const owned=()=>displayCurrent()&&actor===host.ProcessSync?.identity&&epoch===host.ProcessSync?.identityGeneration?.()&&(!delivery||host.ProcessSync?.isCurrentDelivery?.(delivery)!==false);
      readOwners.delete(scope);
      readTokens.delete(host.ProcessSync?.identity?.id+':'+scope);
      try{const c=client(scope);if(localScopes.has(scope)&&action==='submit'&&(unsavedLocal(scope)||document.querySelector(scope==='PROCESS'?'#equipment-editor-dialog[open]':'#master-edit-dialog[open]')))throw Error('UNSAVED_CHANGES_SAVE_REQUIRED');if(localScopes.has(scope)&&action==='apply')return stageLocal(scope);if(c.hasUnknown())throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');
        if(localScopes.has(scope)&&action==='save')return await saveLocal(scope,detail);
        if(action==='begin'){const result=await c.begin();if(!owned())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');readOwners.delete(scope);adopt(scope,result);return result;}
        const before=action==='apply'||action==='save'&&(!flow(scope)||document.querySelector('#master-edit-dialog[open]'))?copy(bases.get(scope)||draft(scope)?.snapshot||{}):null,next=action==='apply'?copy(draft(scope)?.snapshot||before):null,generation=generations.get(scope);
        if(!flow(scope)){const begun=await c.begin();if(!owned())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');adopt(scope,begun);}
        if(action==='apply'){identify(next,before);detail=diff(before,next);if(!detail.patches.length)return null;
          // A group route update includes every inheriting member. Guard membership
          // too: a concurrent insert must not silently miss the group-wide change.
          if(detail.patches.some(p=>p.path[0]==='categoryGroups'&&(p.path.at(-1)==='defaultStages'||p.op==='insert')))detail.guards.push({path:['products'],value:before.products},{path:['lines'],value:before.lines});
        }
        const formVersion=action==='save'&&document.querySelector('#master-edit-dialog[open]')?draft(scope):null;
        if(action==='save'){await c.flush();if(formVersion&&host.ProcessNavigationForms?.dirty(document.querySelector('#master-edit-dialog[open]')))throw Error('UNAPPLIED_CHANGES_APPLY_REQUIRED');}
        const linkedApproval=action==='approve'&&flow(scope)?.cases.find(row=>row.id===detail.caseId)?.linkedProcess;
        const result=await c.command(generation||flow(scope).generation,action,detail),fresh=result.control?result:await c.read();if(!owned())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');readOwners.delete(scope);readTokens.delete(host.ProcessSync?.identity?.id+':'+scope);adopt(scope,fresh);
        if(linkedApproval)await load('PROCESS');
        if(formVersion){const index=control.versions.findIndex(v=>v.id===formVersion.id);if(index>=0)control.versions[index]=formVersion;bases.set(scope,before);generations.set(scope,generation);}
        return result;
      }catch(error){if(action==='apply'&&(error.notSent||error.status&&error.status<500))error.rejectedDraftPaths=detail.patches?.map(patch=>patch.path)||[];throw error;}finally{busy=false;refreshDisplay(scope);}
    }
    async function submit(scope){const displayCurrent=displayPin(scope);if(localScopes.has(scope)&&unsavedLocal(scope))throw Error('UNSAVED_CHANGES_SAVE_REQUIRED');const current=flow(scope),submission=host.captureSharedDraftSubmission(current);
      if(host.ProcessNavigationForms?.dirty(document.querySelector('#master-edit-dialog[open]')))throw Error('UNAPPLIED_CHANGES_APPLY_REQUIRED');
      const generation=current.generation,actor=host.ProcessSync?.identity,epoch=host.ProcessSync?.identityGeneration?.(),delivery=host.ProcessSync?.captureDelivery?.();
      const reason=await host.VersionDraftUI.confirmSubmit(host.VersionDraftUI.reasonFor(draft(scope),current),scope,{masterSnapshot:{dirty:false,changes:host.VersionDraftUI.masterChanges(current.active?.content,current.saved.content)},savedVersion:{id:submission.savedId,revision:submission.expectedRevision,at:current.saved.at,actor:current.saved.actor?.name}});if(!reason)return null;
      if(!displayCurrent()||actor!==host.ProcessSync?.identity||epoch!==host.ProcessSync?.identityGeneration?.()||delivery&&host.ProcessSync?.isCurrentDelivery?.(delivery)===false)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      if(localScopes.has(scope)&&(unsavedLocal(scope)||document.querySelector(scope==='PROCESS'?'#equipment-editor-dialog[open]':'#master-edit-dialog[open]')))throw Error('UNSAVED_CHANGES_SAVE_REQUIRED');
      if(flow(scope)?.generation!==generation||flow(scope)?.saved?.id!==submission.savedId)throw Error('SAVED_VERSION_CHANGED_RECONFIRM');
      if(flow(scope)?.revision!==submission.expectedRevision)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
      return execute(scope,'submit',{...submission,reason});
    }
    async function review(scope,action,caseId){const displayCurrent=displayPin(scope);const c=flow(scope)?.cases.find(row=>row.id===caseId);if(!c)throw Error('CASE_NOT_FOUND');
      if(action==='approve'&&c.linkedProcess&&!confirm(t('此案件同步核准必要 PROCESS 範本。來源 '+c.linkedProcess.baseVersionId+'；新增 '+c.linkedProcess.added.join(', ')+'；刪除 '+c.linkedProcess.removed.join(', ')+'。確認？','Hồ sơ này đồng thời duyệt các mẫu PROCESS bắt buộc. Nguồn '+c.linkedProcess.baseVersionId+'; thêm '+c.linkedProcess.added.join(', ')+'; xóa '+c.linkedProcess.removed.join(', ')+'. Xác nhận?')))return null;
      const answer=await host.VersionDraftUI.confirmReview({action:action==='return'?'reject':action,scope:scope+' · '+caseId,selfReview:action!=='withdraw'&&c.actor.id===host.ProcessSync?.identity?.id});if(!answer)return null;if(!displayCurrent())throw Error('APPROVED_HISTORY_SUPERSEDED');
      return execute(scope,action,{caseId,...answer});
    }
    async function history(scope){assertDisplay(scope);await host.openSharedDraftHistory({client:client(scope),masterScope:['AB','C'].includes(scope)?scope:null,editable:()=>!!draft(scope)&&['history','edit','restore'].every(key=>client(scope).permission(key)===true),onApplied:async()=>{await load(scope);onChange?.();}});}
    async function recover(scope){
      const displayCurrent=displayPin(scope);
      if(busy)throw Error('OPERATION_IN_PROGRESS');busy=true;
      const actor=host.ProcessSync?.identity,epoch=host.ProcessSync?.identityGeneration?.();
      const owned=()=>displayCurrent()&&actor===host.ProcessSync?.identity&&epoch===host.ProcessSync?.identityGeneration?.();
      try{const c=client(scope);if(localScopes.has(scope)){const result=await c.resolveUnknown();if(!owned())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');if(result?.recoveryKind!=='begin-v1'&&result?.receipt){if(scope==='PROCESS')retireProcessSave(result);else discardLocal(scope);}readTokens.delete(actor?.id+':'+scope);if(result?.control)adopt(scope,result);else await load(scope);if(owned())onChange?.();return result;}try{await c.resolveUnknown();}catch(error){if(error.status!==404)throw error;if(!owned())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');if(!confirm(t('伺服器尚未找到此操作。以同一操作編號重試？','Máy chủ chưa tìm thấy thao tác. Thử lại với cùng mã thao tác?')))return;await c.retryUnknown();}
        if(!owned())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');readTokens.delete(actor?.id+':'+scope);await load(scope);if(owned())onChange?.();
      }finally{busy=false;refreshDisplay(scope);}
    }
    return{isLocalProcessInsert,setApprovedDisplayLease,retireUndispatchedSaveChoice:scope=>saveChoices.get(scope)?.(),localProcess:processLocalSave,localDirty,productReferenceCode,discardLocal,resetReads(){for(const cancel of saveChoices.values())cancel();processSave=null;locals.clear();stateRevisions.clear();readOwners.clear();bases.clear();generations.clear();permissions.clear();readTokens.clear();},client,load,patch,preparePatch,rejectionCapability,hasConfirmedRejection,isConfirmedRejection,finalizeRejected,dispatchPreparedPatch,finishPreparedPatch,sendPreparedPatch,readRecovery,receiptRecovery,execute,submit,review,history,recover,flow,discardRejected:(scope,paths)=>{assertDisplay(scope);return client(scope).discardRejected(paths);},renderValidation:(scope,options)=>host.ProcessSync?.identity?.id&&host.renderSharedDraftValidation({...options,client:client(scope),flow:flow(scope),language:document.documentElement.lang==='vi'?'vi':'zh'}),permissions:currentPermissions,busy:()=>busy||displayFlights>0,adopted:scope=>!!flow(scope),diff};
  };
})(window);
