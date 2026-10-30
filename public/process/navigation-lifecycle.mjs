// Same-document navigation transaction. Application adapters own data/auth rules;
// this coordinator only orders preparation, departure, commit and readiness.
export function createNavigationCoordinator(hooks) {
  let serial=0,active=null,current=hooks.initial;
  const sameOwner=(a,b)=>!!a&&!!b&&a.id===b.id&&a.epoch===b.epoch;
  const pending=()=>active!==null;
  function cancel(){serial++;active?.controller.abort();active=null;hooks.pending?.(null);}
  function cancelUncommitted(){if(active&&!active.committed)cancel();}
  const keyOf=target=>hooks.key?hooks.key(target):navigationKey(target);
  function navigate(target,options={}) {
    // A rejected newer intent must not leave an older destination armed. Only
    // cancel preparation: a committed page still owns its readiness lifecycle.
    if(!hooks.canLeave()){
      if(active&&!active.committed)cancel();
      return Promise.resolve({status:'blocked'});
    }
    const key=keyOf(target),owner=hooks.owner(),history=options.history==='pop'?JSON.stringify(['pop',options.index,options.url]):options.history;
    if(active?.key===key&&active.history===history&&sameOwner(active.owner,owner))return active.result;
    const before=active,result=run(target,options);
    if(active&&active!==before)active.result=result;
    return result;
  }
  async function run(target,options) {
    if(!hooks.canLeave())return{status:'blocked'};
    const observedOwner=hooks.owner();if(!observedOwner?.id)return{status:'invalidated'};
    const owner=Object.freeze({id:observedOwner.id,epoch:observedOwner.epoch});
    active?.controller.abort();
    const transaction={id:++serial,controller:new AbortController(),owner,target,key:keyOf(target),history:options.history==='pop'?JSON.stringify(['pop',options.index,options.url]):options.history,committed:false};
    active=transaction;
    const context={id:transaction.id,signal:transaction.controller.signal,
      current:()=>serial===transaction.id&&!transaction.controller.signal.aborted&&sameOwner(owner,hooks.owner()),
      owner};
    hooks.pending?.(target);
    try {
      const prepared=await hooks.prepare(target,context);
      if(!context.current())return{status:'superseded'};
      // The user may have begun editing while the target read was pending.
      if(!hooks.canLeave())return{status:'blocked'};
      hooks.validate?.(prepared,target,context,options);
      if(!context.current())return{status:'superseded'};
      // No await between final departure check and atomic projection/DOM/history
      // ownership transfer. An adapter must not speculate business writes here.
      // Point of no return: a commit hook may throw after disposing the source.
      // Such a failure is always target-scoped/failclosed, never old-source rollback.
      transaction.committed=true;current=target;
      const installed=hooks.commit(prepared,target,context,options);
      current=installed||target;
      await hooks.ready(current,context);
      if(!context.current())return{status:'superseded'};
      hooks.complete?.(current,context);
      return{status:'ready',destination:current};
    } catch(error) {
      if(!context.current())return{status:'superseded'};
      hooks.failure?.(error,{target,current,committed:transaction.committed,options});
      return{status:'error',error,committed:transaction.committed};
    } finally {
      if(active===transaction){active=null;hooks.pending?.(null);}
    }
  }
  return{navigate,cancel,cancelUncommitted,pending,current:()=>current};
}
export function navigationKey(destination) {
  return [destination.system||'process',destination.view,
    destination.view==='data'?destination.dataTab||'':destination.view==='approval'?destination.approvalTab||'master':''].join(':');
}

// One departure decision owns the source inputs and, after an acknowledged
// mutation, its edit lock. Replacing a target never repeats Save or Discard.
// The application adapter owns all draft, receipt and permission semantics.
export function createDepartureCoordinator(hooks){
  let active=null,serial=0;
  const current=record=>active===record&&hooks.isCurrent(record.owner);
  const release=record=>{const lease=record.lease;record.lease=null;lease?.release?.();};
  const snapshot=record=>({phase:record.phase,label:record.intent.label,status:hooks.inspect(record.owner),error:record.error});
  const update=record=>{if(current(record))hooks.update?.(snapshot(record));};
  function finish(record,result,restore=false){
    if(active!==record)return;
    active=null;release(record);hooks.hide?.();record.intent.resolve(result);
    if(restore)hooks.stay?.();
  }
  function cancel(status='cancelled',restore=true){
    const record=active;if(!record)return;
    hooks.cancelNavigation?.();finish(record,{status},restore);
  }
  function ticketCurrent(ticket){return !!active&&active.ticket===ticket&&current(active)&&active.phase==='handoff';}
  function committed(ticket){
    if(!ticketCurrent(ticket))throw Error('DEPARTURE_CONTEXT_CHANGED');
    const record=active;record.committed=true;active=null;
    release(record);hooks.hide?.();
  }
  function handoff(record){
    if(!current(record)){finish(record,{status:'invalidated'});return;}
    const intent=record.intent,ticket=record.ticket=Object.freeze({id:++serial});
    record.phase='handoff';update(record);
    void Promise.resolve().then(()=>{
      if(!ticketCurrent(ticket))return {status:'superseded'};
      return intent.run(ticket);
    }).then(result=>{
      if(record.committed){intent.resolve(result);return;}
      if(active!==record||record.ticket!==ticket)return;
      if(!current(record)){finish(record,{status:'invalidated'});return;}
      // Local transitions also acknowledge their handoff explicitly. A ready
      // result without that acknowledgement is not permission to drop inputs.
      const value=result?.status==='ready'?{status:'error',error:Error('DEPARTURE_HANDOFF_NOT_CONFIRMED')}:result||{status:'error'};
      finish(record,value,true);
    },error=>{
      if(record.committed){intent.resolve({status:'error',error});return;}
      if(active===record&&record.ticket===ticket){if(!current(record)){finish(record,{status:'invalidated'});return;}hooks.failure?.(error);finish(record,{status:'error',error},true);}
    });
  }
  async function choose(action){
    const record=active;if(!record)return {status:'cancelled'};
    if(!current(record)){finish(record,{status:'invalidated'});return {status:'invalidated'};}
    if(record.phase==='mutating')return {status:'busy'};
    if(action==='stay'){cancel();return {status:'cancelled'};}
    if(record.phase==='handoff'||!['save','discard'].includes(action))return {status:'busy'};
    const status=hooks.inspect(record.owner);
    if(status.state==='clean'){handoff(record);return {status:'accepted'};}
    if(status.state!=='dirty'||!status[action==='save'?'canSave':'canDiscard']){record.error=status.reason;update(record);return {status:'blocked'};}
    record.phase='mutating';record.error='';update(record);
    try{
      const lease=await hooks.act(action,record.owner);
      if(!current(record)){lease?.release?.();if(active===record)finish(record,{status:'invalidated'});return {status:'invalidated'};}
      record.lease=lease;
      if(typeof lease?.release!=='function')throw Error('DEPARTURE_LEASE_REQUIRED');
      if(hooks.inspect(record.owner).state!=='clean')throw Error('DEPARTURE_CHANGES_REMAIN');
      handoff(record);return {status:'accepted'};
    }catch(error){
      if(active!==record)return {status:'invalidated'};
      if(!current(record)){finish(record,{status:'invalidated'});return {status:'invalidated'};}
      release(record);record.phase='choosing';record.error=hooks.errorMessage?.(error)||error.message||String(error);update(record);return {status:'error',error};
    }
  }
  function request(value){
    if(active&&!current(active))cancel('invalidated',false);
    if(active?.intent.key===value.key)return active.intent.promise;
    const intent={...value};intent.promise=new Promise(resolve=>intent.resolve=resolve);
    if(active){
      const record=active;record.intent.resolve({status:'superseded'});record.intent=intent;record.error='';
      if(record.phase==='handoff'){hooks.cancelNavigation?.();handoff(record);}else update(record);
      return intent.promise;
    }
    const owner=hooks.owner();if(!hooks.isCurrent(owner))return Promise.resolve({status:'invalidated'});
    if(hooks.inspect(owner).state==='clean')return Promise.resolve().then(()=>hooks.isCurrent(owner)?intent.run(null):{status:'invalidated'});
    hooks.cancelNavigation?.();
    const record=active={owner,intent,phase:'choosing',lease:null,ticket:null,error:'',committed:false};
    hooks.show?.(snapshot(record),choose);
    return intent.promise;
  }
  function refresh(){if(!active)return;if(!current(active)){cancel('invalidated',false);return;}if(active.phase==='choosing')update(active);}
  return{request,choose,cancel,refresh,pending:()=>!!active,ticketCurrent,committed};
}
