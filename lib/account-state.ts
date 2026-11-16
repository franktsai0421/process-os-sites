// Account-only records overlay. Retain all business refs, allocations and history.
// A selected state is never accepted by the general partial-state writer.
import {env} from 'cloudflare:workers';
import {readState,type State} from './process-state';
import {decodeRecordValues} from './state-records';
import {roleTemplates,effectiveAccess} from './user-access';
const editable=new Set(['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl']);
const keys=[...editable,'maintenanceMode','masterDataControl'];
type Pin={raw:string;revision:number;baseline:string;values:Record<string,string>;consumed:boolean};
const pins=new WeakMap<State,Pin>();
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function fail():never{throw Error('Invalid account state overlay');}
function manifest(raw:string){
 const root=JSON.parse(raw),records=root.__processRecords;
 if(!records||records.version!==1||!records.values||typeof records.values!=='object'||Array.isArray(records.values))fail();
 for(const map of [records.values,records.allocations,records.legacySources]){
  if(map===undefined)continue;
  if(!map||typeof map!=='object'||Array.isArray(map))fail();
  for(const ref of Object.values(map)){
   const r=ref as {key?:unknown;sha256?:unknown};
   if(!r||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256)||r.key!=='state-records/v1/'+r.sha256+'.json')fail();
  }
 }
 if(!records.values.platformUsers)fail();return root;
}
export async function readAccountState():Promise<State>{
 const row=await env.DB.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first<{revision:number;values:string}>();
 if(!row)throw Error('Current state is missing');
 const stored=JSON.parse(row.values);
 if(!stored.__processRecords)return readState({deferHistory:true,deferDependencyHistory:true});
 manifest(row.values);
 const decoded=await decodeRecordValues(env.STATE_ARCHIVE,stored,{keys,projectValue:(key,raw)=>{
  if(key!=='masterDataControl')return raw;
  const root=JSON.parse(raw);return JSON.stringify({pageDraftLayout:root?.pageDraftLayout,active:{LINES:!!root?.active?.LINES},...(Array.isArray(root?.versions)?{versions:[]}: {})});
 }});
 if(stored.platformUsers!==undefined&&stored.platformUsers!==decoded.values.platformUsers)fail();
 const state={revision:row.revision,...decoded};
 pins.set(state,{raw:row.values,revision:row.revision,baseline:JSON.stringify(state.values),values:{...state.values},consumed:false});return state;
}
export function accountStateIsSelected(state:State){return pins.has(state);}
export async function encodeAccountState(values:Record<string,string>,state:State,action:string,id:string){
 const pin=pins.get(state);if(!pin||pin.consumed||state.revision!==pin.revision||JSON.stringify(state.values)!==pin.baseline)fail();
 for(const key of new Set([...Object.keys(pin.values),...Object.keys(values)]))if(!editable.has(key)&&values[key]!==pin.values[key])fail();
 if(Object.values(values).some(value=>typeof value!=='string'))fail();
 type User={id:string;role:string;authEpoch?:number;[key:string]:unknown};
 const before:User[]=JSON.parse(pin.values.platformUsers),after:User[]=JSON.parse(values.platformUsers);
 if(!Array.isArray(before)||!Array.isArray(after))fail();
 const oldAudit=JSON.parse(pin.values.processAccessControl||'{"schemaVersion":2,"primaryAdminId":"frank","audit":[]}'),audit=JSON.parse(values.processAccessControl);
 if(!Array.isArray(oldAudit.audit)||!Array.isArray(audit.audit)||audit.audit.length!==oldAudit.audit.length+1||!equal(audit.audit.slice(0,-1),oldAudit.audit)||!equal({...audit,audit:[]},{...oldAudit,audit:[]}))fail();
 const entry=audit.audit.at(-1),safe=(u:User|undefined)=>u&&Object.fromEntries(Object.entries(u).filter(([key])=>!['password','passwordHash'].includes(key)));
 if(entry.action!==action||entry.target!==id)fail();
 if(['create-user','update-user','status-user','delete-user'].includes(action)){
  if(values.processCustomRoles!==pin.values.processCustomRoles||values.processRoleTemplateOverrides!==pin.values.processRoleTemplateOverrides)fail();
  if(!equal(before.filter(u=>u.id!==id),after.filter(u=>u.id!==id)))fail();
  const prior=before.find(u=>u.id===id),next=after.find(u=>u.id===id);
  if(!next||after.filter(u=>u.id===id).length!==1||!equal(entry.before,prior?safe(prior):null)||!equal(entry.after,safe(next)))fail();
  if(action==='create-user'?!!prior||after.length!==before.length+1:!prior||after.length!==before.length)fail();
  if(prior&&(next.password!==prior.password||next.passwordHash!==prior.passwordHash))fail();
 }else if(['create-role','update-role','delete-role'].includes(action)){
  const prior=roleTemplates(pin.values),next=roleTemplates(values);
  if(!equal(Object.fromEntries(Object.entries(prior).filter(([key])=>key!==id)),Object.fromEntries(Object.entries(next).filter(([key])=>key!==id))))fail();
  if(!equal(entry.before,prior[id]||null)||!equal(entry.after,next[id]||null)||before.length!==after.length)fail();
  for(let index=0;index<before.length;index++){
   const user=before[index],candidate=after[index];
   const priorCells=effectiveAccess(user,pin.values).cells,nextCells=effectiveAccess(user,values).cells;
   const changed=!user.deletedAt&&user.role===id&&Object.keys(priorCells).some(key=>priorCells[key]!==nextCells[key]);
   if(!equal(candidate,changed?{...user,authEpoch:(user.authEpoch||0)+1}:user))fail();
  }
 }else fail();
 pin.consumed=true;
 const root=manifest(pin.raw);
 for(const key of editable){
  if(values[key]===pin.values[key])continue;
  const raw=values[key];if(typeof raw!=='string')fail();
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
  const ref={key:'state-records/v1/'+sha256+'.json',sha256};
  await env.STATE_ARCHIVE.put(ref.key,raw,{httpMetadata:{contentType:'application/json'}});root.__processRecords.values[key]=ref;
 }
 root.platformUsers=values.platformUsers;return JSON.stringify(root);
}
