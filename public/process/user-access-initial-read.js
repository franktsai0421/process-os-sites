// Runs inside the existing authenticated asset gate. Only the initial users
// destination overlaps its read with script initialization; no persistent cache.
(()=>{
 const sync=window.ProcessSync;
 if(!sync?.identity||sync.destination?.view!=='data'||sync.destination?.dataTab!=='users'||!sync.captureDelivery||!sync.isCurrentDelivery)return;
 const owner=sync.captureDelivery(),identity=sync.identity,controller=new AbortController();
 if(!sync.isCurrentDelivery(owner))return;
 const abort=()=>controller.abort(),timer=setTimeout(abort,45000);
 window.addEventListener('process-delivery-invalidated',abort,{once:true});
 const pending=fetch('/api/user-access',{headers:sync.platformHeaders(),signal:controller.signal}).then(async response=>({response,value:await response.json()})).finally(()=>{clearTimeout(timer);window.removeEventListener('process-delivery-invalidated',abort);});
 // A later asset may fail to load; retain rejection for the eventual consumer
 // without emitting an unhandled rejection during bootstrap.
 void pending.catch(()=>{});
 let taken=false;
 window.ProcessUserAccessInitialRead={take(){
  if(taken)return null;
  taken=true;delete window.ProcessUserAccessInitialRead;
  if(identity!==sync.identity||!sync.isCurrentDelivery(owner)||controller.signal.aborted){abort();return null;}
  return pending;
 }};
})();
