// Common service dispatch so all mutating entry points use the same metered
// bindings. GETs are read-only; no alternative unmetered write path exists.
import {createHostedTransfer} from './snapshot-hosted-transfer.mjs';
import {createHostedTransferStore} from './snapshot-hosted-store.mjs';
import {createHostedActivationStore} from './snapshot-hosted-activation-store.mjs';
import {createHostedActivation} from './snapshot-hosted-activation.mjs';
export async function dispatchHostedImport({budget,db,bucket,config,principal,method,action,id,expectedVersion,body,cursor}){
 async function execute(storage){
  const targetDb=storage.db,targetBucket=storage.bucket(bucket),store=createHostedTransferStore({db:targetDb,bucket:targetBucket}),transfer=createHostedTransfer({store,bucket:targetBucket,config}),activation=createHostedActivation({transfer,store:createHostedActivationStore(targetDb),transferStore:store,db:targetDb,bucket:targetBucket,ownerId:config.ownerId});
  if(method==='GET')return action==='activation-status'?activation.status(principal,id):transfer.status(principal,id,{cursor,limit:100});
  if(method==='PUT')return transfer.receive(principal,id,action,body);
  if(method!=='POST')throw Error('IMPORT_METHOD');
  if(action==='begin')return transfer.begin(principal,body);
  if(action==='verify')return transfer.verify(principal,id,{expectedVersion,limit:8});
  if(action==='audit')return activation.audit(principal,id,{expectedVersion});
  if(action==='copy')return activation.copy(principal,id,{expectedVersion});
  if(action==='restore')return activation.restore(principal,id,{expectedVersion,limit:32});
  if(action==='activate')return activation.activate(principal,id,{expectedVersion});
  throw Error('IMPORT_ACTION');
 }
 if(method==='GET')return execute({db,bucket:b=>b});
 return budget.run(method==='PUT'?'chunk':action||'unknown',action==='begin',execute);
}
