(function(host){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
  host.createMasterSharedBridge=({control,onChange})=>{
    const clients=new Map(),clientOwners=new Map(),bases=new Map(),generations=new Map(),permissions=new Map(),readTokens=new Map(),readOwners=new Map();let busy=false;
    const client=scope=>{const actor=host.ProcessSync?.identity?.id;if(!actor)throw Error('LOGIN_REQUIRED');const key=actor+':'+scope;
      if(scope==='PROCESS'&&clients.has(key)&&(!ownerMatches(clientOwners.get(key))||clients.get(key).isRuntimeCurrent?.()===false)){clients.delete(key);clientOwners.delete(key);readTokens.delete(key);}
      if(!clients.has(key)){clients.set(key,host.createSharedDraftClient({endpoint:'/api/master/workflow?scope='+encodeURIComponent(scope)+'&caseMetadata=1',legacyArchive:true,actorId:actor,headers:()=>host.ProcessSync?.platformHeaders?.()||{'Content-Type':'application/json'},...(scope==='PROCESS'?{externalDurableBounded:{scope:'PROCESS'}}:{})}));if(scope==='PROCESS')clientOwners.set(key,captureOwner());}return clients.get(key);
    };
    const flow=scope=>control.workflowScopes?.[scope];
    const draft=scope=>control.versions.find(v=>v.scope===scope&&v.status==='draft');
    function adopt(scope,result){if(!result.control)return;const c=result.control;
      control.versions=control.versions.filter(v=>v.scope!==scope).concat(c.versions.map(v=>({...v,scope,warnings:v.warnings||[]})));
      const active=c.versions.find(v=>v.id===c.activeVersionId);if(active)control.active[scope]=copy(active.snapshot);
      if(c.workflow)control.workflowScopes={...control.workflowScopes,[scope]:c.workflow};
      bases.set(scope,copy(c.workflow?.working||draft(scope)?.snapshot||active?.snapshot||{}));generations.set(scope,c.workflow?.generation);
    }
    async function load(scope){const actor=host.ProcessSync?.identity,key=actor?.id+':'+scope,current=flow(scope),owner={};readOwners.set(scope,owner);
      let result;try{result=await client(scope).read(readTokens.get(key)||(current?current.generation+':'+current.revision:''));}
      catch(error){if(actor!==host.ProcessSync?.identity||readOwners.get(scope)!==owner)return{unchanged:true,permissionsChanged:false};throw error;}
      if(actor!==host.ProcessSync?.identity)return{unchanged:true,permissionsChanged:false};
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
      const current=flow(scope);if(!current)throw Error('BEGIN_REQUIRED');
      const c=client(scope);if(c.permission('edit')!==true)throw Object.assign(Error('FORBIDDEN'),{notSent:true});if(current.pendingId)throw Object.assign(Error('PENDING_LOCKED'),{notSent:true});
      const command=c.prepareRecovery(current.generation,{patches,guards});
      preparedPatches.set(command,{scope,client:c,owner:captureOwner(),generation:current.generation,revision:current.revision,raw:JSON.stringify(command)});return command;
    }
    function rejectionCapability(scope,command){
      const pin=preparedPatches.get(command);if(!pin||pin.scope!==scope||!ownerMatches(pin.owner)||flow(scope)?.generation!==pin.generation||JSON.stringify(command)!==pin.raw)throw Object.assign(Error('ACCOUNT_CHANGED_REOPEN_REQUIRED'),{notSent:true});
      return pin.client.rejectionCapability(command);
    }
    function rejectionClient(scope,command){const pin=preparedPatches.get(command);if(!pin||pin.scope!==scope||!ownerMatches(pin.owner)||JSON.stringify(command)!==pin.raw)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');return pin.client;}
    const hasConfirmedRejection=(scope,command)=>rejectionClient(scope,command).hasConfirmedRejection(command);
    const isConfirmedRejection=(scope,error,command)=>rejectionClient(scope,command).isConfirmedRejection(error,command);
    const finalizeRejected=(scope,command)=>rejectionClient(scope,command).finalizeRejected(command);
    function dispatchPreparedPatch(scope,command,dispatchOptions){
      const pin=preparedPatches.get(command);
      if(!pin||pin.scope!==scope||!ownerMatches(pin.owner)||flow(scope)?.generation!==pin.generation)throw Object.assign(Error('ACCOUNT_CHANGED_REOPEN_REQUIRED'),{notSent:true});
      if(JSON.stringify(command)!==pin.raw)throw Object.assign(Error('OPERATION_ID_PAYLOAD_MISMATCH'),{notSent:true});
      if(pin.flight)return pin.flight;readOwners.delete(scope);
      pin.flight=pin.client.sendPrepared(command,dispatchOptions);void pin.flight.then(result=>{pin.response=result;},()=>{});return pin.flight;
    }
    async function finishPreparedPatch(scope,command,result){
      const pin=preparedPatches.get(command);if(!pin||pin.scope!==scope||result!==pin.response||!pin.flight)throw Error('PREPARED_RESPONSE_REQUIRED');
      if(pin.promise)return pin.promise;
      pin.promise=(async()=>{
        if(!ownerMatches(pin.owner)||flow(scope)?.generation!==pin.generation)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
        const fresh=result.control?result:await pin.client.read();
        if(!ownerMatches(pin.owner))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
        requireRecoveryVersion(scope,pin,fresh.control?.workflow);
        readOwners.delete(scope);readTokens.delete(pin.owner.actor?.id+':'+scope);adopt(scope,fresh);
        return {...result,control:fresh.control};
      })();return pin.promise;
    }
    async function sendPreparedPatch(scope,command,dispatchOptions){const result=await dispatchPreparedPatch(scope,command,dispatchOptions);return finishPreparedPatch(scope,command,result);}
    async function patch(scope,patches,guards=[]){
      if(!flow(scope))throw Error('BEGIN_REQUIRED');
      const actor=host.ProcessSync?.identity,epoch=host.ProcessSync?.identityGeneration?.(),delivery=host.ProcessSync?.captureDelivery?.();
      readOwners.delete(scope);
      const c=client(scope),result=await c.command(flow(scope).generation,'apply',{patches,guards});
      const fresh=result.control?result:await c.read();if(actor!==host.ProcessSync?.identity||epoch!==host.ProcessSync?.identityGeneration?.()||delivery&&host.ProcessSync?.isCurrentDelivery?.(delivery)===false)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      readOwners.delete(scope);readTokens.delete(actor?.id+':'+scope);adopt(scope,fresh);return result;
    }
    async function readRecovery(scope){
      const pin=captureOwner(),version=captureVersion(scope),c=client(scope),result=await c.read();
      if(!ownerMatches(pin))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      if(!result.control?.workflow||!result.permissions)throw Error('RECOVERY_READBACK_REQUIRED');
      requireRecoveryVersion(scope,version,result.control.workflow);
      readOwners.delete(scope);readTokens.delete(pin.actor?.id+':'+scope);permissions.set(scope,result.permissions);adopt(scope,result);return result;
    }
    async function receiptRecovery(scope,reference){
      const pin=captureOwner(),version=captureVersion(scope),c=client(scope),result=await c.receipt(reference.operationId,reference.generation);
      if(!ownerMatches(pin))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      const r=result?.receipt;
      if(r?.operationId!==reference.operationId||r.generation!==reference.generation||r.generation!==version.generation||!Number.isSafeInteger(r.revision)||typeof r.unchanged!=='boolean')throw Error('RECOVERY_READBACK_REQUIRED');
      requireRecoveryVersion(scope,version,flow(scope));
      const verified=c.isVerifiedReadback?.(result)===true,readback=verified?result:await readRecovery(scope);if(!ownerMatches(pin))throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      const f=readback.control.workflow;requireRecoveryVersion(scope,version,f);
      if(f.generation!==r.generation||f.revision<r.revision)throw Error('RECOVERY_READBACK_REQUIRED');
      if(verified){readOwners.delete(scope);readTokens.delete(pin.actor?.id+':'+scope);permissions.set(scope,readback.permissions);adopt(scope,readback);}
      return {...result,control:readback.control,permissions:readback.permissions};
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
    async function execute(scope,action,detail={}){
      if(busy)throw Error('OPERATION_IN_PROGRESS');busy=true;
      const actor=host.ProcessSync?.identity,epoch=host.ProcessSync?.identityGeneration?.(),delivery=host.ProcessSync?.captureDelivery?.();
      const owned=()=>actor===host.ProcessSync?.identity&&epoch===host.ProcessSync?.identityGeneration?.()&&(!delivery||host.ProcessSync?.isCurrentDelivery?.(delivery)!==false);
      readOwners.delete(scope);
      readTokens.delete(host.ProcessSync?.identity?.id+':'+scope);
      try{const c=client(scope);if(c.hasUnknown())throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');
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
      }catch(error){if(action==='apply'&&(error.notSent||error.status&&error.status<500))error.rejectedDraftPaths=detail.patches?.map(patch=>patch.path)||[];throw error;}finally{busy=false;}
    }
    async function submit(scope){const current=flow(scope),submission=host.captureSharedDraftSubmission(current);
      if(host.ProcessNavigationForms?.dirty(document.querySelector('#master-edit-dialog[open]')))throw Error('UNAPPLIED_CHANGES_APPLY_REQUIRED');
      const generation=current.generation,actor=host.ProcessSync?.identity,epoch=host.ProcessSync?.identityGeneration?.(),delivery=host.ProcessSync?.captureDelivery?.();
      const reason=await host.VersionDraftUI.confirmSubmit(host.VersionDraftUI.reasonFor(draft(scope),current),scope,{masterSnapshot:{dirty:false,changes:host.VersionDraftUI.masterChanges(current.active?.content,current.saved.content)},savedVersion:{id:submission.savedId,revision:submission.expectedRevision,at:current.saved.at,actor:current.saved.actor?.name}});if(!reason)return null;
      if(actor!==host.ProcessSync?.identity||epoch!==host.ProcessSync?.identityGeneration?.()||delivery&&host.ProcessSync?.isCurrentDelivery?.(delivery)===false)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      if(flow(scope)?.generation!==generation||flow(scope)?.saved?.id!==submission.savedId)throw Error('SAVED_VERSION_CHANGED_RECONFIRM');
      if(flow(scope)?.revision!==submission.expectedRevision)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
      return execute(scope,'submit',{...submission,reason});
    }
    async function review(scope,action,caseId){const c=flow(scope)?.cases.find(row=>row.id===caseId);if(!c)throw Error('CASE_NOT_FOUND');
      if(action==='approve'&&c.linkedProcess&&!confirm(t('此案件同步核准必要 PROCESS 範本。來源 '+c.linkedProcess.baseVersionId+'；新增 '+c.linkedProcess.added.join(', ')+'；刪除 '+c.linkedProcess.removed.join(', ')+'。確認？','Hồ sơ này đồng thời duyệt các mẫu PROCESS bắt buộc. Nguồn '+c.linkedProcess.baseVersionId+'; thêm '+c.linkedProcess.added.join(', ')+'; xóa '+c.linkedProcess.removed.join(', ')+'. Xác nhận?')))return null;
      const answer=await host.VersionDraftUI.confirmReview({action:action==='return'?'reject':action,scope:scope+' · '+caseId,selfReview:action!=='withdraw'&&c.actor.id===host.ProcessSync?.identity?.id});if(!answer)return null;
      return execute(scope,action,{caseId,...answer});
    }
    async function history(scope){await host.openSharedDraftHistory({client:client(scope),masterScope:['AB','C'].includes(scope)?scope:null,editable:()=>!!draft(scope)&&['history','edit','restore'].every(key=>client(scope).permission(key)===true),onApplied:async()=>{await load(scope);onChange?.();}});}
    async function recover(scope){
      if(busy)throw Error('OPERATION_IN_PROGRESS');busy=true;
      const actor=host.ProcessSync?.identity,epoch=host.ProcessSync?.identityGeneration?.();
      const owned=()=>actor===host.ProcessSync?.identity&&epoch===host.ProcessSync?.identityGeneration?.();
      try{const c=client(scope);try{await c.resolveUnknown();}catch(error){if(error.status!==404)throw error;if(!owned())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');if(!confirm(t('伺服器尚未找到此操作。以同一操作編號重試？','Máy chủ chưa tìm thấy thao tác. Thử lại với cùng mã thao tác?')))return;await c.retryUnknown();}
        if(!owned())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');readTokens.delete(actor?.id+':'+scope);await load(scope);if(owned())onChange?.();
      }finally{busy=false;}
    }
    return{resetReads(){readOwners.clear();bases.clear();generations.clear();permissions.clear();readTokens.clear();},client,load,patch,preparePatch,rejectionCapability,hasConfirmedRejection,isConfirmedRejection,finalizeRejected,dispatchPreparedPatch,finishPreparedPatch,sendPreparedPatch,readRecovery,receiptRecovery,execute,submit,review,history,recover,flow,discardRejected:(scope,paths)=>client(scope).discardRejected(paths),renderValidation:(scope,options)=>host.ProcessSync?.identity?.id&&host.renderSharedDraftValidation({...options,client:client(scope),flow:flow(scope),language:document.documentElement.lang==='vi'?'vi':'zh'}),permissions:scope=>permissions.get(scope),busy:()=>busy,adopted:scope=>!!flow(scope),diff};
  };
})(window);
