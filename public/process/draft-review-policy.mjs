// Unregistered policy preparation for #102. No API, storage, migration or switch.
// Callers must supply fresh, authorized persisted roles/audit and the installed
// page registry. This projection is not authentication or cutover authorization.
import {catalog,effectiveCells,isPrimary,PRIMARY_ADMIN_ID} from './access-policy.mjs';
const modules=Object.freeze(catalog.filter(row=>row.ops.includes('submit')).map(row=>row.id));
const prepared=new WeakMap();
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const frozen=value=>Object.freeze(value);
const has=(value,key)=>record(value)&&Object.hasOwn(value,key);

// A v2 mapped true cell is ambiguous. Only a retained explicit false/absent ->
// true change by the primary in the existing management audit establishes a
// non-primary high grant; unchanged true snapshots do not create provenance.
export function platformApprovalSource(user,roles,control={}){
 if(control?.primaryAdminId&&control.primaryAdminId!==PRIMARY_ADMIN_ID)return frozen({status:'primary-binding-mismatch',subject:null});
 if(isPrimary(user))return frozen({status:'confirmed-primary',subject:null});
 const key='approval.approve',role=has(roles,user.role)?roles[user.role]:undefined;
 const individual=has(user.accessOverrides,key),source=individual?user.accessOverrides:role?.access;
 const subject=frozen({kind:individual?'user':'role',id:individual?user.id:user.role});
 if(!has(source,key))return frozen({status:'legacy-only',subject});
 if(source[key]!==true)return frozen({status:'not-granted',subject});
 const field=individual?'accessOverrides':'access';
 const actions=individual?['create-user','update-user','delete-user']:['create-role','update-role','delete-role'];
 const audit=control?.schemaVersion===2&&control?.primaryAdminId===PRIMARY_ADMIN_ID&&Array.isArray(control?.audit)?control.audit:[];
 for(let i=audit.length-1;i>=0;i--){
  const entry=audit[i];
  if(!record(entry)||entry.target!==subject.id||!actions.includes(entry.action))continue;
  const before=entry.before?.[field],after=entry.after?.[field];
  // Deletion or an incomplete relevant snapshot prevents trusting older proof.
  if(!record(after)||!has(after,key)||after[key]!==true)return frozen({status:'confirmation-required',subject});
  const old=has(before,key)?before[key]:undefined,next=has(after,key)?after[key]:undefined;
  if(old===next)continue;
  const explicit=next===true&&old!==true&&entry.actor?.id===PRIMARY_ADMIN_ID&&entry.actor?.role==='admin'&&typeof entry.id==='string'&&entry.id.length>0;
  return frozen({status:explicit?'confirmed-explicit':'confirmation-required',subject,...(explicit?{auditId:entry.id}:{})});
 }
 return frozen({status:'confirmation-required',subject});
}

export function prepareDraftReviewPolicy(user,roles,control={}){
 if(!record(user)||typeof user.id!=='string'||!user.id||typeof user.role!=='string'||!user.role||!record(roles))throw Error('REVIEW_POLICY_INPUT');
 const before=effectiveCells(user,roles),after={...before},source=platformApprovalSource(user,roles,control),blocked=[];
 const alive=user.enabled!==false&&!user.deletedAt&&has(roles,user.role);
 const high=alive&&before['approval.approve']===true&&['confirmed-primary','confirmed-explicit'].includes(source.status);
 if(source.status==='primary-binding-mismatch')blocked.push(frozen({code:'PRIMARY_BINDING_MISMATCH'}));
 if(alive&&source.status==='confirmation-required')blocked.push(frozen({code:'PLATFORM_APPROVAL_CONFIRMATION_REQUIRED',subject:source.subject}));
 if(high&&!before['approval.view'])blocked.push(frozen({code:'PLATFORM_APPROVAL_VIEW_REQUIRED'}));
 after['approval.approve']=high&&before['approval.view']===true;
 for(const permissionModule of modules){
  const view=alive&&before[permissionModule+'.view']===true;
  const reviewer=before[permissionModule+'.approve']===true||before[permissionModule+'.return']===true;
  if(alive&&reviewer&&!view)blocked.push(frozen({code:'MODULE_REVIEW_VIEW_REQUIRED',module:permissionModule}));
  after[permissionModule+'.submit']=view&&(before[permissionModule+'.submit']===true||reviewer||high);
  const correction=view&&(before[permissionModule+'.withdraw']===true||reviewer||high);
  after[permissionModule+'.withdraw']=correction;after[permissionModule+'.return']=correction;
  after[permissionModule+'.approve']=view&&high;
 }
 const delta=Object.keys(after).filter(key=>before[key]!==after[key]).map(key=>frozen({key,before:before[key],after:after[key]}));
 const result=frozen({kind:'draft-review-policy-preview',projectionReady:blocked.length===0,platformApprovalSource:source,before:frozen({...before}),after:frozen(after),delta:frozen(delta),blocked:frozen(blocked),runtimeActivated:false});
 prepared.set(result,{alive,high:after['approval.approve']===true});return result;
}

// Use the compiled #102 registry, never page/scope/permissionModule identifiers supplied
// by a request. All thirteen business pages must be present exactly once.
export function createDraftReviewPolicy(boundaries){
 if(!Array.isArray(boundaries)||boundaries.length!==modules.length)throw Error('REVIEW_PAGE_REGISTRY');
 const pages=new Map(),scopes=new Set(),seen=new Set();
 for(const entry of boundaries){
  if(!record(entry)||['page','scope','permissionModule','endpoint','stateKey'].some(key=>typeof entry[key]!=='string'||!entry[key])||!entry.endpoint.startsWith('/api/')||!modules.includes(entry.permissionModule)||pages.has(entry.page)||scopes.has(entry.scope)||seen.has(entry.permissionModule))throw Error('REVIEW_PAGE_REGISTRY');
  const fixed=frozen(Object.fromEntries(['page','scope','permissionModule','endpoint','stateKey'].map(key=>[key,entry[key]])));
  pages.set(fixed.page,fixed);scopes.add(fixed.scope);seen.add(fixed.permissionModule);
 }
 return frozen({
  permissions(page,plan){
   const boundary=pages.get(page),proof=prepared.get(plan);
   if(!boundary)throw Error('REVIEW_PAGE_INVALID');
   if(!proof||!plan.projectionReady)throw Error('REVIEW_POLICY_UNRESOLVED');
   const cells=plan.after,permissionModule=boundary.permissionModule,view=proof.alive&&cells[permissionModule+'.view']===true;
   const correction=view&&cells[permissionModule+'.withdraw']===true;
   return frozen({...boundary,view,edit:view&&cells[permissionModule+'.edit']===true,save:view&&cells[permissionModule+'.save']===true,submit:view&&cells[permissionModule+'.submit']===true,withdraw:correction,return:correction,approve:view&&proof.high,history:view});
  },
 });
}

// Shared by a future command/receipt adapter. These are current-operation
// capabilities, not historical grants; exact receipts still belong to one actor.
const operationPermissions=frozen({'begin-v1':'edit',apply:'edit',restore:'edit',save:'save',submit:'submit',withdraw:'withdraw',return:'withdraw',approve:'approve'});
export function draftOperationPermission(action){
 return typeof action==='string'&&Object.hasOwn(operationPermissions,action)?operationPermissions[action]:null;
}
export function draftReviewReceiptAllowed(permissions,receipt,actorId){
 const operation=receipt?.action,permission=draftOperationPermission(operation);
 return !!permission&&typeof actorId==='string'&&actorId.length>0&&receipt?.actorId===actorId&&permissions?.view===true&&permissions[permission]===true&&(operation!=='restore'||permissions.restore===true);
}

// RF whole-page receipts retain their original capability ledger, including
// create/delete/revise/revoke/settings/admin requirements. Use fresh route
// permissions merged with the resolved review projection; never infer these
// additional grants from approval or replace the RF parser/outer receipt guard.
const routineReceiptCapabilities=frozen(['view','edit','save','submit','withdraw','approve','return','create','delete','revise','revoke','settings','admin']);
export function routinePageReceiptAllowed(permissions,owner,operationId,actor){
 if(permissions?.page!=='ROUTINE_FQC'||permissions.endpoint!=='/api/routine-fqc/page'||permissions.permissionModule!=='routine'||permissions.scope!=='routine-fqc:page'||owner?.page?.workflow?.scope!==permissions.scope||permissions.view!==true)return false;
 if(typeof operationId!=='string'||!operationId||typeof actor?.id!=='string'||!actor.id)return false;
 const receipts=owner.page.workflow.receipts,ledger=owner.page.operationPermissions;
 if(!has(receipts,operationId)||receipts[operationId]?.actorId!==actor.id||!has(ledger,operationId))return false;
 const caps=ledger[operationId];
 if(!Array.isArray(caps)||!caps.length||!caps.includes('view')||caps.some(cap=>!routineReceiptCapabilities.includes(cap)))return false;
 return caps.every(cap=>cap==='admin'?actor.admin===true:permissions[cap==='return'?'withdraw':cap]===true);
}
