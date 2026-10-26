/* oxlint-disable typescript/no-explicit-any -- Existing shared-state JSON shapes are validated by the mutation guards. */
import {env} from 'cloudflare:workers';
import {readState,identity,sameOrigin,encodeValues,stateRevisionIsCurrent,responseHeaders as headers,parse,sessionCookie} from '@/lib/process-state';
import {effectiveAccess,roleTemplates} from '@/lib/user-access';
import {passwordHash,verifyPassword,validatePassword} from '@/lib/passwords';
import {catalog,columns,accessKeys,isPrimary,managementRight,editableCells,PRIMARY_ADMIN_ID,invalidDependencies,effectiveCells,roleEditable} from '../../../public/process/access-policy.mjs';
const safe=(user:any)=>{const {password:_password,passwordHash:_hash,...rest}=user;return rest;};
const denied=()=>{throw Error('FORBIDDEN');};
const own=(object:any,key:string)=>Object.prototype.hasOwnProperty.call(object,key);
function actors(state:any,id:string){const users=parse(state.values.platformUsers,[]),actor=users.find((u:any)=>u.id===id&&!u.deletedAt&&u.enabled!==false);if(!actor)denied();return {users,actor,access:effectiveAccess(actor,state.values),roles:roleTemplates(state.values)};}
function projection(state:any,id:string){const {users,actor,access,roles}=actors(state,id),manager=actor.role==='admin';return {revision:state.revision,actor:{...safe(actor),...access,roleName:roles[actor.role]?.name||actor.role},primaryId:PRIMARY_ADMIN_ID,catalog,columns,
 users:users.filter((u:any)=>!u.deletedAt&&(manager?u.authMode!=='demo':u.id===actor.id)).map((u:any)=>({...safe(u),...effectiveAccess(u,state.values),configuredCells:effectiveAccess({...u,enabled:true},state.values).cells,editable:editableCells(actor,u,access.cells),actions:Object.fromEntries(['view','edit','delete','status','password','password-own'].map(action=>[action,managementRight(actor,u,action,access.cells)]))})),
 roles:manager?Object.entries(roles).map(([id,r]:[string,any])=>({...r,id,assigned:users.filter((u:any)=>u.role===id&&!u.deletedAt).length,formalCount:users.filter((u:any)=>u.role===id&&!u.deletedAt&&u.authMode!=='demo').length})):[],canCreate:manager&&access.cells['users.create'],canRoles:isPrimary(actor)};}
export async function GET(request:Request){try{const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl']}),id=(await identity(request,state))?.id;if(!id)return Response.json({error:'LOGIN_REQUIRED'},{status:401,headers});return Response.json(projection(state,id),{headers});}catch{return Response.json({error:'FORBIDDEN'},{status:403,headers});}}
function cellChanges(input:any,allowed:Record<string,boolean>,prior:Record<string,boolean>){if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_CELLS');const next={...prior};for(const [key,value]of Object.entries(input)){if(!accessKeys.includes(key)||![true,false,null].includes(value as any))throw Error('INVALID_CELLS');if(!allowed[key])denied();if(value===null)delete next[key];else next[key]=value as boolean;}return next;}
function validUser(user:any,values:Record<string,string>){const candidate={...user,enabled:true,deletedAt:undefined};if(invalidDependencies(effectiveAccess(candidate,values).cells).length)throw Error('VIEW_DEPENDENCY_REQUIRED');}
function validateRoles(values:Record<string,string>,users:any[],roleId:string){const roles=roleTemplates(values),sample={id:'role-check',role:roleId,enabled:true,inheritRole:true};if(invalidDependencies(effectiveCells(sample,roles)).length)throw Error('VIEW_DEPENDENCY_REQUIRED');for(const user of users.filter(u=>u.role===roleId&&!u.deletedAt))validUser(user,values);}
export async function POST(request:Request){if(!sameOrigin(request))return Response.json({error:'FORBIDDEN_ORIGIN'},{status:403,headers});let body:any;try{body=await request.json();}catch{return Response.json({error:'INVALID_INPUT'},{status:400,headers});}
 try{
  if(!body||Array.isArray(body)||typeof body!=='object'||JSON.stringify(body).length>100000)throw Error('INVALID_INPUT');
  const allowedFields=['action','baseRevision','id','name','role','enabled','changes','password','confirmation','oldPassword','description','access'];if(Object.keys(body).some(k=>!allowedFields.includes(k)))throw Error('INVALID_INPUT');
  const state=await readState({deferHistory:true,deferDependencyHistory:true}),signed=await identity(request,state);if(!signed)return Response.json({error:'LOGIN_REQUIRED'},{status:401,headers});
  if(state.values.maintenanceMode==='1')return Response.json({error:'MAINTENANCE'},{status:503,headers});
  if(body.baseRevision!==state.revision)return Response.json({error:'REVISION_CHANGED',revision:state.revision},{status:409,headers});
  const {users,actor,access,roles}=actors(state,signed.id),values={...state.values},now=new Date().toISOString(),id=String(body.id||'').trim().toLowerCase(),target=users.find((u:any)=>u.id===id),roleControl=parse(values.processRoleTemplateOverrides,{}),custom=parse(values.processCustomRoles,[]);
  let before:any=null,after:any=null,changed=false,passwordOwn=false;
  if(body.action==='create-user'){
   if(!/^[a-z0-9._-]{1,80}$/.test(id)||!String(body.name||'').trim())throw Error('INVALID_USER');if(target)throw Error('ACCOUNT_EXISTS');
   const role=body.role;if(!roles[role])throw Error('INVALID_ROLE');const next:any={id,name:String(body.name).trim().slice(0,80),role,enabled:true,inheritRole:true,authEpoch:1,accessOverrides:{}};
   if(!managementRight(actor,next,'create',access.cells)||!isPrimary(actor)&&role==='admin')denied();
   next.accessOverrides=cellChanges(body.changes||{},editableCells(actor,next,access.cells,'create'),{});validUser(next,values);
   const granted=effectiveAccess(next,values);if(!isPrimary(actor)&&accessKeys.some(key=>granted.cells[key]&&!access.cells[key]))throw Error('GRANT_EXCEEDS_ACTOR');
   validatePassword(String(body.password||''),String(body.confirmation||''));next.passwordHash=await passwordHash(body.password);users.push(next);after=safe(next);changed=true;
  }else if(['update-user','status-user','delete-user','password'].includes(body.action)){
   if(!target||target.deletedAt)throw Error('ACCOUNT_NOT_FOUND');before=safe(target);
   if(body.action==='password'){
    passwordOwn=actor.id===target.id;
    if(!managementRight(actor,target,passwordOwn?'password-own':'password',access.cells))denied();
    if(passwordOwn&&actor.role!=='admin'&&!await verifyPassword(target,String(body.oldPassword||'')))throw Error('OLD_PASSWORD_INCORRECT');
    validatePassword(String(body.password||''),String(body.confirmation||''));target.passwordHash=await passwordHash(body.password);delete target.password;changed=true;
   }else if(body.action==='status-user'){
    if(!managementRight(actor,target,'status',access.cells))denied();if(typeof body.enabled!=='boolean')throw Error('INVALID_INPUT');changed=target.enabled!==body.enabled;target.enabled=body.enabled;
   }else if(body.action==='delete-user'){
    if(!managementRight(actor,target,'delete',access.cells))denied();target.deletedAt=now;target.enabled=false;changed=true;
   }else{
    if(!managementRight(actor,target,'edit',access.cells))denied();
    if(own(body,'role')&&body.role!==target.role){if(!isPrimary(actor)||target.id===PRIMARY_ADMIN_ID||!roles[body.role])denied();target.role=body.role;}
    if(own(body,'name')){if(!String(body.name).trim())throw Error('INVALID_USER');target.name=String(body.name).trim().slice(0,80);}
    if(own(body,'enabled')&&target.enabled!==body.enabled)throw Error('USE_STATUS_ACTION');
    if(own(body,'changes'))target.accessOverrides=cellChanges(body.changes,editableCells(actor,target,access.cells),target.accessOverrides||{});
    validUser(target,values);changed=JSON.stringify(before)!==JSON.stringify(safe(target));
   }
   if(changed)target.authEpoch=(target.authEpoch||0)+1;after=safe(target);
  }else if(['create-role','update-role','delete-role'].includes(body.action)){
   if(!isPrimary(actor))denied();const current=roles[id];before=current||null;
   if(body.action==='delete-role'){if(['admin','rd','staff'].includes(id))throw Error('DEFAULT_ROLE_PROTECTED');if(!custom.some((r:any)=>r.id===id))throw Error('INVALID_ROLE');if(users.some((u:any)=>!u.deletedAt&&u.role===id))throw Error('ROLE_ASSIGNED');values.processCustomRoles=JSON.stringify(custom.filter((r:any)=>r.id!==id));delete roleControl[id];after=null;changed=true;}
   else{const name=String(body.name||'').trim(),description=String(body.description||'').trim().slice(0,300);if(!name||name.length>40)throw Error('INVALID_ROLE');if(Object.entries(roles).some(([key,r]:[string,any])=>key!==id&&r.name?.normalize('NFKC').toLowerCase()===name.normalize('NFKC').toLowerCase()))throw Error('ROLE_EXISTS');
    if(body.action==='create-role'){if(!/^custom_[a-z0-9_-]{1,60}$/.test(id)||current)throw Error('INVALID_ROLE');if(['admin','rd','staff','administrator','主要管理員','quản trị viên chính'].includes(name.normalize('NFKC').toLowerCase()))throw Error('ROLE_EXISTS');const role={id,name,description,lines:['A','B','C'],views:[],permissions:[],access:Object.fromEntries(accessKeys.map(key=>[key,false]))};role.access=cellChanges(body.access||{},roleEditable(id),role.access);custom.push(role);values.processCustomRoles=JSON.stringify(custom);after=role;changed=true;}
    else{if(!current)throw Error('INVALID_ROLE');const next={...current,name,description,access:cellChanges(body.access||{},roleEditable(id),(current as any).access||{})};roleControl[id]=next;after=next;changed=JSON.stringify(current)!==JSON.stringify(next);}
   }
   values.processRoleTemplateOverrides=JSON.stringify(roleControl);if(body.action!=='delete-role')validateRoles(values,users,id);
   // Refresh sessions only when their effective rights change. The primary
   // administrator keeps full rights independently of the ADMIN template.
   if(changed)for(const u of users.filter((u:any)=>!u.deletedAt&&u.role===id)){
    const previous=effectiveAccess(u,state.values).cells,next=effectiveAccess(u,values).cells;
    if(accessKeys.some(key=>previous[key]!==next[key]))u.authEpoch=(u.authEpoch||0)+1;
   }
  }else throw Error('INVALID_ACTION');
  if(!changed)return Response.json(projection(state,actor.id),{headers});
  values.platformUsers=JSON.stringify(users);
  const audit=parse(values.processAccessControl,{schemaVersion:2,primaryAdminId:PRIMARY_ADMIN_ID,audit:[]});if(audit.primaryAdminId!==PRIMARY_ADMIN_ID)throw Error('PRIMARY_BINDING_MISMATCH');
  // Never include credential fields, including hashes, in account audit records.
  audit.audit.push({id:crypto.randomUUID(),at:now,actor:{id:actor.id,name:actor.name,role:actor.role},action:body.action,target:id,before,after});values.processAccessControl=JSON.stringify(audit);
  if(!await stateRevisionIsCurrent(state))throw Error('REVISION_CHANGED');
  const result=await env.DB.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?').bind(state.revision+1,await encodeValues(values,state),now,state.revision).run();if(!result.meta.changes)throw Error('REVISION_CHANGED');
  return Response.json({...projection({revision:state.revision+1,values},actor.id),ok:true,relogin:passwordOwn||users.find((u:any)=>u.id===actor.id)?.authEpoch!==parse(state.values.platformUsers,[]).find((u:any)=>u.id===actor.id)?.authEpoch},{headers:{...headers,...(passwordOwn?{'Set-Cookie':sessionCookie(request,'')}: {})}});
 }catch(error){const message=(error as Error).message,known=new Set(['FORBIDDEN','INVALID_CELLS','VIEW_DEPENDENCY_REQUIRED','INVALID_INPUT','INVALID_USER','ACCOUNT_EXISTS','INVALID_ROLE','GRANT_EXCEEDS_ACTOR','ACCOUNT_NOT_FOUND','OLD_PASSWORD_INCORRECT','USE_STATUS_ACTION','DEFAULT_ROLE_PROTECTED','ROLE_ASSIGNED','ROLE_EXISTS','INVALID_ACTION','REVISION_CHANGED','PRIMARY_BINDING_MISMATCH','PASSWORD_LENGTH','PASSWORD_MISMATCH']);const code=known.has(message)?message:'SERVER_ERROR',status=code==='FORBIDDEN'?403:code==='ACCOUNT_NOT_FOUND'?404:code==='REVISION_CHANGED'?409:code==='PRIMARY_BINDING_MISMATCH'?503:code==='SERVER_ERROR'?500:400;return Response.json({error:code},{status,headers});}
}
