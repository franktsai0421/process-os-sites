(function(host){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
  host.createMasterSharedBridge=({control,onChange})=>{
    const clients=new Map(),bases=new Map(),generations=new Map(),permissions=new Map(),readTokens=new Map(),readOwners=new Map();let busy=false;
    const client=scope=>{const actor=host.ProcessSync?.identity?.id;if(!actor)throw Error('LOGIN_REQUIRED');const key=actor+':'+scope;
if(!clients.has(key))clients.set(key,host.createSharedDraftClient({endpoint:'/api/master/workflow?scope='+encodeURIComponent(scope)+'&caseMetadata=1',legacyArchive:true,actorId:actor,headers:()=>host.ProcessSync?.platformHeaders?.()||{'Content-Type':'application/json'}}));return clients.get(key);};
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
    async function patch(scope,patches,guards=[]){
      if(!flow(scope))throw Error('BEGIN_REQUIRED');
      const actor=host.ProcessSync?.identity,epoch=host.ProcessSync?.identityGeneration?.(),delivery=host.ProcessSync?.captureDelivery?.();
      readOwners.delete(scope);
      const c=client(scope),result=await c.command(flow(scope).generation,'apply',{patches,guards});
      const fresh=result.control?result:await c.read();if(actor!==host.ProcessSync?.identity||epoch!==host.ProcessSync?.identityGeneration?.()||delivery&&host.ProcessSync?.isCurrentDelivery?.(delivery)===false)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      readOwners.delete(scope);readTokens.delete(actor?.id+':'+scope);adopt(scope,fresh);return result;
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
        if(action==='save'){await c.flush();if(formVersion&&!confirm(t('只儲存已同步內容，不包含尚未套用表單。繼續？','Chỉ lưu nội dung đã đồng bộ, không gồm biểu mẫu chưa áp dụng. Tiếp tục?')))return null;}
        const linkedApproval=action==='approve'&&flow(scope)?.cases.find(row=>row.id===detail.caseId)?.linkedProcess;
        const result=await c.command(generation||flow(scope).generation,action,detail),fresh=result.control?result:await c.read();if(!owned())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');readOwners.delete(scope);readTokens.delete(host.ProcessSync?.identity?.id+':'+scope);adopt(scope,fresh);
        if(linkedApproval)await load('PROCESS');
        if(formVersion){const index=control.versions.findIndex(v=>v.id===formVersion.id);if(index>=0)control.versions[index]=formVersion;bases.set(scope,before);generations.set(scope,generation);}
        return result;
      }catch(error){if(action==='apply'&&(error.notSent||error.status&&error.status<500))error.rejectedDraftPaths=detail.patches?.map(patch=>patch.path)||[];throw error;}finally{busy=false;}
    }
    async function submit(scope){const current=flow(scope);if(!current?.saved)throw Error(t('請先成功儲存共用草稿。','Hãy lưu bản nháp chung thành công trước.'));
      const savedId=current.saved.id,generation=current.generation,actor=host.ProcessSync?.identity,epoch=host.ProcessSync?.identityGeneration?.(),delivery=host.ProcessSync?.captureDelivery?.();
      const reason=await host.VersionDraftUI.confirmSubmit(host.VersionDraftUI.reasonFor(draft(scope),current),scope,['AB','C'].includes(scope)?{masterSnapshot:{dirty:!equal(current.saved.content,current.working),savedAt:current.saved.at,savedActor:current.saved.actor?.name,changes:host.VersionDraftUI.masterChanges(current.saved.content,current.working)}}:{});if(!reason)return null;
      if(actor!==host.ProcessSync?.identity||epoch!==host.ProcessSync?.identityGeneration?.()||delivery&&host.ProcessSync?.isCurrentDelivery?.(delivery)===false)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      if(flow(scope)?.generation!==generation||flow(scope)?.saved?.id!==savedId)throw Error('SAVED_VERSION_CHANGED_RECONFIRM');
      return execute(scope,'submit',{savedId,reason});
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
    return{resetReads(){readOwners.clear();bases.clear();generations.clear();permissions.clear();readTokens.clear();},client,load,patch,execute,submit,review,history,recover,flow,discardRejected:(scope,paths)=>client(scope).discardRejected(paths),renderValidation:(scope,options)=>host.ProcessSync?.identity?.id&&host.renderSharedDraftValidation({...options,client:client(scope),flow:flow(scope),language:document.documentElement.lang==='vi'?'vi':'zh'}),permissions:scope=>permissions.get(scope),busy:()=>busy,adopted:scope=>!!flow(scope),diff};
  };
})(window);
