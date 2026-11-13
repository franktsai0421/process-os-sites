import {publicAccountReviewContext} from '../../../public/process/account-review-preview.mjs';
/* oxlint-disable typescript/no-explicit-any -- Existing shared-state JSON shapes are validated by the mutation guards. */
import {env} from 'cloudflare:workers';
import {readState,identity,sameOrigin,encodeValues,stateRevisionIsCurrent,responseHeaders as headers,parse,sessionCookie} from '@/lib/process-state';
import {effectiveAccess,roleTemplates} from '@/lib/user-access';
import {passwordHash,verifyPassword,validatePassword,passwordCredentialState} from '@/lib/passwords';
import {readPasswordState,encodePasswordState,passwordStateIsSelected} from '@/lib/password-state';
import {catalog,columns,accessKeys,isPrimary,managementRight,editableCells,PRIMARY_ADMIN_ID,invalidDependencies,effectiveCells,roleEditable,newDependencyIssues} from '../../../public/process/access-policy.mjs';
const safe=(user:any)=>{const {password:_password,passwordHash:_hash,...rest}=user;return rest;};
const denied=()=>{throw Error('FORBIDDEN');};
const own=(object:any,key:string)=>Object.prototype.hasOwnProperty.call(object,key);
function actors(state:any,id:string){const users=parse(state.values.platformUsers,[]),actor=users.find((u:any)=>u.id===id&&!u.deletedAt&&u.enabled!==false);if(!actor)denied();const roles=roleTemplates(state.values);return {users,actor,access:effectiveAccess(actor,state.values,roles),roles};}
// Only installed, explicitly adopted page owners expose their operation cells.
// This is presentation/configuration metadata, never workflow authority.
function pageCapabilities(values:Record<string,string>){const root=parse(values.masterDataControl,{});return {lines:root?.pageDraftLayout==='page-v1'&&!!root.active?.LINES&&Array.isArray(root.versions)};}
function editableForState(allowed:Record<string,boolean>,state:any,actor:any,capabilities=pageCapabilities(state.values)){const review=own(parse(state.values.processAccessControl,{}),'draftReviewPolicy');return Object.fromEntries(Object.entries(allowed).map(([key,value])=>[key,value&&(!key.startsWith('lines.')||key==='lines.view'||capabilities.lines)&&(!(review&&key==='approval.approve')||isPrimary(actor))]));}
function projection(state:any,id:string,capabilities=pageCapabilities(state.values)){
 const {users,actor,access,roles}=actors(state,id),manager=actor.role==='admin';
 // Request-local only: inherited defaults are identical within this snapshot.
 // Individual overrides, legacy independent scopes, disabled users and Frank
 // always go through the full policy. Never reuse authority across requests.
 const inherited=new Map<string,ReturnType<typeof effectiveAccess>>(),editable=new Map<string,Record<string,boolean>>();
 const rightsFor=(user:any)=>{
  if(user.id===actor.id)return access;
  if(isPrimary(user)||user.enabled===false||user.deletedAt||user.inheritRole===false||Object.keys(user.accessOverrides||{}).length)return effectiveAccess(user,state.values,roles);
  if(!inherited.has(user.role))inherited.set(user.role,effectiveAccess(user,state.values,roles));
  return inherited.get(user.role)!;
 };
 const editableFor=(user:any)=>{
  // These are all target-dependent inputs to editableCells/managementRight;
  // the actor and its effective cells are fixed for this projection.
  const key=JSON.stringify([user.role,user.id===actor.id,isPrimary(user),user.authMode==='demo']);
  if(!editable.has(key))editable.set(key,editableForState(editableCells(actor,user,access.cells),state,actor,capabilities));
  return editable.get(key)!;
 };
 const reviewContext=publicAccountReviewContext(users.filter((u:any)=>!u.deletedAt&&(manager?u.authMode!=='demo':u.id===actor.id)),manager?roles:{[actor.role]:roles[actor.role]},parse(state.values.processAccessControl,{}),actor);
 const counts=new Map<string,{assigned:number;formalCount:number}>();
 if(manager)for(const user of users){if(user.deletedAt)continue;const count=counts.get(user.role)||{assigned:0,formalCount:0};count.assigned++;if(user.authMode!=='demo')count.formalCount++;counts.set(user.role,count);}
 return {revision:state.revision,actor:{...safe(actor),...access,roleCells:effectiveAccess({...actor,accessOverrides:{}},state.values,roles).cells,roleName:roles[actor.role]?.name||actor.role},primaryId:PRIMARY_ADMIN_ID,catalog,columns,pageCapabilities:capabilities,...(reviewContext?{reviewContext}:{}),
  users:users.filter((u:any)=>!u.deletedAt&&(manager?u.authMode!=='demo':u.id===actor.id)).map((u:any)=>{const rights=rightsFor(u);return {...safe(u),...rights,...(manager&&managementRight(actor,u,actor.id===u.id?'password-own':'password',access.cells)?{credentialState:passwordCredentialState(u)}:{}),configuredCells:u.enabled===false?effectiveAccess({...u,enabled:true},state.values,roles).cells:rights.cells,editable:editableFor(u),actions:Object.fromEntries(['view','edit','delete','status','password','password-own'].map(action=>[action,managementRight(actor,u,action,access.cells)]))};}),
  roles:manager?Object.entries(roles).map(([id,r]:[string,any])=>({...r,id,...(counts.get(id)||{assigned:0,formalCount:0})})):[],canCreate:manager&&access.cells['users.create'],canRoles:isPrimary(actor)};
}
export async function GET(request:Request){try{const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl']}),id=(await identity(request,state))?.id;if(!id)return Response.json({error:'LOGIN_REQUIRED'},{status:401,headers});let capabilities=pageCapabilities(state.values);if(state.recordStorage){try{const selected=await readState({keys:['masterDataControl'],projectValue:(_key,raw)=>JSON.stringify({pageCapabilities:pageCapabilities({masterDataControl:raw})})});capabilities=selected.revision===state.revision?parse(selected.values.masterDataControl,{}).pageCapabilities||{lines:false}:{lines:false};}catch{capabilities={lines:false};}}return Response.json(projection(state,id,capabilities),{headers});}catch{return Response.json({error:'FORBIDDEN'},{status:403,headers});}}
function cellChanges(input:any,allowed:Record<string,boolean>,prior:Record<string,boolean>){if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_CELLS');const next={...prior};for(const [key,value]of Object.entries(input)){if(!accessKeys.includes(key)||![true,false,null].includes(value as any))throw Error('INVALID_CELLS');if(!allowed[key])denied();if(value===null)delete next[key];else next[key]=value as boolean;}return next;}
function validUser(user:any,values:Record<string,string>,previous?:Record<string,boolean>){const candidate={...user,enabled:true,deletedAt:undefined},roles=roleTemplates(values),options=pageCapabilities(values);if(invalidDependencies(effectiveCells(candidate,roles),options).length||invalidDependencies(effectiveAccess(candidate,values,roles).cells,options).length)throw Error('VIEW_DEPENDENCY_REQUIRED');if(newDependencyIssues(effectiveAccess(candidate,values,roles).cells,previous,options).length)throw Error('EDIT_DEPENDENCY_REQUIRED');}
function validateRoles(values:Record<string,string>,users:any[],roleId:string,prior:Record<string,string>){const roles=roleTemplates(values),sample={id:'role-check',role:roleId,enabled:true,inheritRole:true},options=pageCapabilities(values);if(invalidDependencies(effectiveCells(sample,roles),options).length)throw Error('VIEW_DEPENDENCY_REQUIRED');if(newDependencyIssues(effectiveCells(sample,roles),effectiveAccess(sample,prior).cells,options).length)throw Error('EDIT_DEPENDENCY_REQUIRED');for(const user of users.filter(u=>u.role===roleId&&!u.deletedAt))validUser(user,values,effectiveAccess({...user,enabled:true},prior).cells);}
// An explicit review choice must take effect. Never return success for a
// checkbox that a retained legacy reviewer or higher grant immediately overrides.
function assertEffectiveReviewChoices(values:Record<string,string>,body:any){
 if(!own(parse(values.processAccessControl,{}),'draftReviewPolicy'))return;
 const role=body.action.endsWith('role'),input=role?body.access:body.changes;if(!['create-user','update-user','create-role','update-role'].includes(body.action)||!input)return;
 const user=role?{id:'role-check',role:String(body.id).trim().toLowerCase(),enabled:true}:parse(values.platformUsers,[]).find((row:any)=>row.id===String(body.id).trim().toLowerCase());if(!user)return;const cells=effectiveAccess(user,values).cells;
 for(const [key,value]of Object.entries(input)){const [id,op]=key.split('.');if(typeof value==='boolean'&&catalog.some(row=>row.id===id&&row.ops.includes('submit'))&&['submit','withdraw','approve','return'].includes(op)&&cells[key]!==value)throw Error('REVIEW_PERMISSION_DERIVED');}
}
export async function POST(request:Request){if(!sameOrigin(request))return Response.json({error:'FORBIDDEN_ORIGIN'},{status:403,headers});let body:any;try{body=await request.json();}catch{return Response.json({error:'INVALID_INPUT'},{status:400,headers});}
 try{
  if(!body||Array.isArray(body)||typeof body!=='object'||JSON.stringify(body).length>100000)throw Error('INVALID_INPUT');
  const allowedFields=['action','baseRevision','id','name','role','enabled','changes','password','confirmation','oldPassword','description','access','confirmFinalApproval'];if(Object.keys(body).some(k=>!allowedFields.includes(k)))throw Error('INVALID_INPUT');
  const state=body.action==='password'?await readPasswordState():await readState({deferHistory:true,deferDependencyHistory:true}),signed=await identity(request,state);if(!signed)return Response.json({error:'LOGIN_REQUIRED'},{status:401,headers});
  if(state.values.maintenanceMode==='1')return Response.json({error:'MAINTENANCE'},{status:503,headers});
  if(body.baseRevision!==state.revision)return Response.json({error:'REVISION_CHANGED',revision:state.revision},{status:409,headers});
  const {users,actor,access,roles}=actors(state,signed.id),values={...state.values},now=new Date().toISOString(),id=String(body.id||'').trim().toLowerCase(),target=users.find((u:any)=>u.id===id),roleControl=parse(values.processRoleTemplateOverrides,{}),custom=parse(values.processCustomRoles,[]);
  const confirmFinalApproval=body.confirmFinalApproval===true;
  if(own(body,'confirmFinalApproval')){
   if(!confirmFinalApproval||!['create-user','update-user','create-role','update-role'].includes(body.action))throw Error('INVALID_INPUT');
   if(!isPrimary(actor))denied();
   const grants=body.action.endsWith('role')?body.access:body.changes;
   if(!grants||typeof grants!=='object'||Array.isArray(grants)||!own(grants,'approval.approve')||grants['approval.approve']!==true)throw Error('INVALID_INPUT');
  }
  let before:any=null,after:any=null,changed=false,passwordOwn=false;
  if(body.action==='create-user'){
   if(!/^[a-z0-9._-]{1,80}$/.test(id)||!String(body.name||'').trim())throw Error('INVALID_USER');if(target)throw Error('ACCOUNT_EXISTS');
   const role=body.role;if(!roles[role])throw Error('INVALID_ROLE');const next:any={id,name:String(body.name).trim().slice(0,80),role,enabled:true,inheritRole:true,authEpoch:1,accessOverrides:{}};
   if(!managementRight(actor,next,'create',access.cells)||!isPrimary(actor)&&role==='admin')denied();
   next.accessOverrides=cellChanges(body.changes||{},editableForState(editableCells(actor,next,access.cells,'create'),state,actor),{});validUser(next,values);
   const granted=effectiveAccess(next,values);if(!isPrimary(actor)&&accessKeys.some(key=>granted.cells[key]&&!access.cells[key]))throw Error('GRANT_EXCEEDS_ACTOR');
   if(typeof body.password!=='string'||typeof body.confirmation!=='string')throw Error('INVALID_INPUT');validatePassword(body.password,body.confirmation);next.passwordHash=await passwordHash(body.password);users.push(next);after=safe(next);changed=true;
  }else if(['update-user','status-user','delete-user','password'].includes(body.action)){
   if(!target||target.deletedAt)throw Error('ACCOUNT_NOT_FOUND');before=safe(target);
   if(body.action==='password'){
    passwordOwn=actor.id===target.id;
    if(!managementRight(actor,target,passwordOwn?'password-own':'password',access.cells))denied();
    if(passwordOwn&&!await verifyPassword(target,String(body.oldPassword||'')))throw Error('OLD_PASSWORD_INCORRECT');
    if(typeof body.password!=='string'||typeof body.confirmation!=='string')throw Error('INVALID_INPUT');validatePassword(body.password,body.confirmation);target.passwordHash=await passwordHash(body.password);delete target.password;changed=true;
   }else if(body.action==='status-user'){
    if(!managementRight(actor,target,'status',access.cells))denied();if(typeof body.enabled!=='boolean')throw Error('INVALID_INPUT');changed=target.enabled!==body.enabled;target.enabled=body.enabled;
   }else if(body.action==='delete-user'){
    if(!managementRight(actor,target,'delete',access.cells))denied();target.deletedAt=now;target.enabled=false;changed=true;
   }else{
    if(!managementRight(actor,target,'edit',access.cells))denied();
    if(own(body,'role')&&body.role!==target.role){if(!isPrimary(actor)||target.id===PRIMARY_ADMIN_ID||!roles[body.role])denied();target.role=body.role;}
    if(own(body,'name')){if(!String(body.name).trim())throw Error('INVALID_USER');target.name=String(body.name).trim().slice(0,80);}
    if(own(body,'enabled')&&target.enabled!==body.enabled)throw Error('USE_STATUS_ACTION');
    if(own(body,'changes'))target.accessOverrides=cellChanges(body.changes,editableForState(editableCells(actor,target,access.cells),state,actor),target.accessOverrides||{});
    validUser(target,values,effectiveAccess({...before,enabled:true},state.values).cells);changed=JSON.stringify(before)!==JSON.stringify(safe(target))||confirmFinalApproval;
   }
   if(changed)target.authEpoch=(target.authEpoch||0)+1;after=safe(target);
  }else if(['create-role','update-role','delete-role'].includes(body.action)){
   if(!isPrimary(actor))denied();const current=roles[id];before=current||null;
   if(body.action==='delete-role'){if(['admin','rd','staff'].includes(id))throw Error('DEFAULT_ROLE_PROTECTED');if(!custom.some((r:any)=>r.id===id))throw Error('INVALID_ROLE');if(users.some((u:any)=>!u.deletedAt&&u.role===id))throw Error('ROLE_ASSIGNED');values.processCustomRoles=JSON.stringify(custom.filter((r:any)=>r.id!==id));delete roleControl[id];after=null;changed=true;}
   else{const name=String(body.name||'').trim(),description=String(body.description||'').trim().slice(0,300);if(!name||name.length>40)throw Error('INVALID_ROLE');if(Object.entries(roles).some(([key,r]:[string,any])=>key!==id&&r.name?.normalize('NFKC').toLowerCase()===name.normalize('NFKC').toLowerCase()))throw Error('ROLE_EXISTS');
    if(body.action==='create-role'){if(!/^custom_[a-z0-9_-]{1,60}$/.test(id)||current)throw Error('INVALID_ROLE');if(['admin','rd','staff','administrator','主要管理員','quản trị viên chính'].includes(name.normalize('NFKC').toLowerCase()))throw Error('ROLE_EXISTS');const role={id,name,description,lines:['A','B','C'],views:[],permissions:[],access:Object.fromEntries(accessKeys.map(key=>[key,false]))};role.access=cellChanges(body.access||{},editableForState(roleEditable(id),state,actor),role.access);custom.push(role);values.processCustomRoles=JSON.stringify(custom);after=role;changed=true;}
    else{if(!current)throw Error('INVALID_ROLE');const next={...current,name,description,access:cellChanges(body.access||{},editableForState(roleEditable(id),state,actor),(current as any).access||{})};roleControl[id]=next;after=next;changed=JSON.stringify(current)!==JSON.stringify(next)||confirmFinalApproval;}
   }
   values.processRoleTemplateOverrides=JSON.stringify(roleControl);if(body.action!=='delete-role')validateRoles(values,users,id,state.values);
  }else throw Error('INVALID_ACTION');
  if(!changed){assertEffectiveReviewChoices(values,body);return Response.json(projection(state,actor.id),{headers});}
  values.platformUsers=JSON.stringify(users);
  const audit=parse(values.processAccessControl,{schemaVersion:2,primaryAdminId:PRIMARY_ADMIN_ID,audit:[]});if(audit.primaryAdminId!==PRIMARY_ADMIN_ID)throw Error('PRIMARY_BINDING_MISMATCH');
  // Never include credential fields, including hashes, in account audit records.
  audit.audit.push({id:crypto.randomUUID(),at:now,actor:{id:actor.id,name:actor.name,role:actor.role},action:body.action,target:id,before,after,...(confirmFinalApproval?{approvalConfirmation:{schemaVersion:1,permission:'approval.approve',granted:true,subjectKind:body.action.endsWith('role')?'role':'user',subjectId:id}}:{})});values.processAccessControl=JSON.stringify(audit);
  // The final-approval audit is itself part of effective authority. Compare
  // assigned users only after that exact proof is present in the candidate.
  if(['create-role','update-role','delete-role'].includes(body.action)){
   for(const u of users.filter((u:any)=>!u.deletedAt&&u.role===id)){
    const previous=effectiveAccess(u,state.values).cells,next=effectiveAccess(u,values).cells;
    if(accessKeys.some(key=>previous[key]!==next[key]))u.authEpoch=(u.authEpoch||0)+1;
   }
   values.platformUsers=JSON.stringify(users);
  }
  assertEffectiveReviewChoices(values,body);
  if(!await stateRevisionIsCurrent(state))throw Error('REVISION_CHANGED');
  const result=await env.DB.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?').bind(state.revision+1,await (passwordStateIsSelected(state)?encodePasswordState(values,state):encodeValues(values,state)),now,state.revision).run();if(!result.meta.changes)throw Error('REVISION_CHANGED');
  return Response.json({...projection({revision:state.revision+1,values},actor.id),ok:true,relogin:passwordOwn||users.find((u:any)=>u.id===actor.id)?.authEpoch!==parse(state.values.platformUsers,[]).find((u:any)=>u.id===actor.id)?.authEpoch},{headers:{...headers,...(passwordOwn?{'Set-Cookie':sessionCookie(request,'')}: {})}});
 }catch(error){const message=(error as Error).message,known=new Set(['REVIEW_PERMISSION_DERIVED','FORBIDDEN','INVALID_CELLS','EDIT_DEPENDENCY_REQUIRED','VIEW_DEPENDENCY_REQUIRED','INVALID_INPUT','INVALID_USER','ACCOUNT_EXISTS','INVALID_ROLE','GRANT_EXCEEDS_ACTOR','ACCOUNT_NOT_FOUND','OLD_PASSWORD_INCORRECT','USE_STATUS_ACTION','DEFAULT_ROLE_PROTECTED','ROLE_ASSIGNED','ROLE_EXISTS','INVALID_ACTION','REVISION_CHANGED','PRIMARY_BINDING_MISMATCH','PASSWORD_LENGTH','PASSWORD_MISMATCH','PASSWORD_SERVICE_UNAVAILABLE']);const code=known.has(message)?message:'SERVER_ERROR',status=code==='FORBIDDEN'?403:code==='ACCOUNT_NOT_FOUND'?404:code==='REVISION_CHANGED'?409:(code==='PRIMARY_BINDING_MISMATCH'||code==='PASSWORD_SERVICE_UNAVAILABLE')?503:code==='SERVER_ERROR'?500:400;return Response.json({error:code},{status,headers});}
}
