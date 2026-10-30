// Same-document navigation transaction. Application adapters own data/auth rules;
// this coordinator only orders preparation, departure, commit and readiness.
export function createNavigationCoordinator(hooks) {
  let serial=0,active=null,current=hooks.initial;
  const sameOwner=(a,b)=>!!a&&!!b&&a.id===b.id&&a.epoch===b.epoch;
  const pending=()=>active!==null;
  function cancel(){serial++;active?.controller.abort();active=null;hooks.pending?.(null);}
  const keyOf=target=>hooks.key?hooks.key(target):navigationKey(target);
  function navigate(target,options={}) {
    const key=keyOf(target),owner=hooks.owner(),history=options.history==='pop'?JSON.stringify(['pop',options.index,options.url]):options.history;
    if(active?.key===key&&active.history===history&&sameOwner(active.owner,owner))return active.result;
    const before=active,result=run(target,options);
    if(active&&active!==before)active.result=result;
    return result;
  }
  async function run(target,options) {
    if(!hooks.canLeave()&&!hooks.prepareDeparture)return{status:'blocked'};
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
      if(!hooks.canLeave()) {
        const accepted=await hooks.prepareDeparture(context);
        if(!context.current())return{status:'superseded'};
        if(accepted!==true||!hooks.canLeave())return{status:'blocked'};
      }
      const prepared=await hooks.prepare(target,context);
      if(!context.current())return{status:'superseded'};
      // The user may have begun editing while the target read was pending.
      if(!hooks.canLeave())return{status:'blocked'};
      hooks.validate?.(prepared,target,context);
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
  return{navigate,cancel,pending,current:()=>current};
}
export function navigationKey(destination) {
  return [destination.system||'process',destination.view,
    destination.view==='data'?destination.dataTab||'':destination.view==='approval'?destination.approvalTab||'master':''].join(':');
}
