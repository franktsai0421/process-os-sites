// Common service dispatch so all mutating entry points use the same metered
// bindings. GETs are read-only; no alternative unmetered write path exists.
import {createHostedTransfer} from './snapshot-hosted-transfer.mjs';
import {createHostedTransferStore} from './snapshot-hosted-store.mjs';
import {createHostedActivationStore} from './snapshot-hosted-activation-store.mjs';
import {createHostedActivation} from './snapshot-hosted-activation.mjs';
import {importTargetIsActive} from './snapshot-import-gate.mjs';
import {assertNativePrincipalAction} from './snapshot-native-capability.mjs';
export async function dispatchHostedImport({budget,db,bucket,config,principal,method,action,id,expectedVersion,body,cursor,native=null,signal}){
 assertNativePrincipalAction(principal,action,native);
 async function execute(storage){
  const targetDb=storage.db,targetBucket=storage.bucket(bucket),store=createHostedTransferStore({db:targetDb,bucket:targetBucket}),transfer=createHostedTransfer({store,bucket:targetBucket,config,reserve:storage.reserve,signal}),activation=createHostedActivation({transfer,store:createHostedActivationStore(targetDb),transferStore:store,db:targetDb,bucket:targetBucket,ownerId:config.ownerId});
  if(method==='GET')return action==='activation-status'?activation.status(principal,id):transfer.status(principal,id,{cursor,limit:100});
  if(method==='PUT')return transfer.receive(principal,id,action,body);
  if(method!=='POST')throw Error('IMPORT_METHOD');
  if(action==='reconcile-existing')return native.reconcileExisting({db:targetDb,source:await transfer.reconciliationSource(principal,id)});
  if(action==='begin')return transfer.begin(principal,body);
  if(action==='batch')return transfer.receiveBatch(principal,id,body);
  if(action==='verify')return transfer.verify(principal,id,{expectedVersion,limit:16});
  if(action==='audit')return activation.audit(principal,id,{expectedVersion,limit:4});
  if(action==='copy')return activation.copy(principal,id,{expectedVersion,limit:4});
  if(action==='restore')return activation.restore(principal,id,{expectedVersion,limit:32});
  if(action==='activate')return activation.activate(principal,id,{expectedVersion});
  throw Error('IMPORT_ACTION');
 }
 if(method==='GET')return execute({db,bucket:b=>b});
 const result=await budget.run(method==='PUT'?'chunk':action||'unknown',action==='begin',execute,native);
 // Read after the durable budget release, while the request's verified actor
 // is still available. A second authenticated GET would use an invalidated old
 // owner cookie after successful activation; no new login or cookie is needed.
 if(result?.phase==='active'){let businessTrafficEnabled=false;try{businessTrafficEnabled=await importTargetIsActive(db,id);}catch{/* Keep reporting closed on uncertain state. */}return{...result,businessTrafficEnabled};}
 return result;
}
