// Password-only records overlay. Business aggregates are opaque, unchanged refs.
// General partial-state writes remain forbidden by encodeRecordValues.
import {env} from 'cloudflare:workers';
import {readState,type State} from './process-state';
import {decodeRecordValues} from './state-records';
import {passwordCredentialState} from './passwords';
const keys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','masterDataControl'];
const editable=new Set(['platformUsers','processAccessControl']);
type Pin={raw:string;revision:number;baseline:string;values:Record<string,string>;consumed:boolean};
const pins=new WeakMap<State,Pin>();
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function fail():never{throw Error('Invalid password state overlay');}
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
export async function readPasswordState():Promise<State>{
 const row=await env.DB.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first<{revision:number;values:string}>();
 if(!row)throw Error('Current state is missing');
 const stored=JSON.parse(row.values);
 // Legacy inline/chunks/monolith keep their existing verified read/write path.
 if(!stored.__processRecords)return readState({deferHistory:true,deferDependencyHistory:true});
 manifest(row.values);
 const decoded=await decodeRecordValues(env.STATE_ARCHIVE,stored,{keys,projectValue:(key,raw)=>{
  if(key!=='masterDataControl')return raw;
  // Match GET's capabilities without hydrating unrelated workflow bodies.
  const root=JSON.parse(raw);return JSON.stringify({pageDraftLayout:root?.pageDraftLayout,active:{LINES:!!root?.active?.LINES},...(Array.isArray(root?.versions)?{versions:[]}: {})});
 }});
 if(stored.platformUsers!==undefined&&stored.platformUsers!==decoded.values.platformUsers)fail();
 const state={revision:row.revision,...decoded};
 pins.set(state,{raw:row.values,revision:row.revision,baseline:JSON.stringify(state.values),values:{...state.values},consumed:false});
 return state;
}
export async function encodePasswordState(values:Record<string,string>,state:State){
 const pin=pins.get(state);
 if(!pin)fail();
 if(pin.consumed||state.revision!==pin.revision||JSON.stringify(state.values)!==pin.baseline)fail();
 const all=new Set([...Object.keys(pin.values),...Object.keys(values)]);
 for(const key of all)if(!editable.has(key)&&values[key]!==pin.values[key])fail();
 if(Object.keys(values).some(key=>typeof values[key]!=='string'))fail();
 type Account={id:string;authEpoch?:number;password?:unknown;passwordHash?:unknown;[key:string]:unknown};
 const before:Account[]=JSON.parse(pin.values.platformUsers),after:Account[]=JSON.parse(values.platformUsers);
 if(!Array.isArray(before)||!Array.isArray(after)||before.length!==after.length)fail();
 const changed=before.map((user,index)=>equal(user,after[index])?-1:index).filter(index=>index>=0);
 if(changed.length!==1)fail();
 const index=changed[0],prior=before[index],next=after[index];
 const nonCredential=(user:Record<string,unknown>)=>Object.fromEntries(Object.entries(user).filter(([key])=>!['password','passwordHash','authEpoch'].includes(key)));
 if(!equal(nonCredential(prior),nonCredential(next))||Object.hasOwn(next,'password')||passwordCredentialState(next)!=='scrypt'||next.authEpoch!==(prior.authEpoch||0)+1)fail();
 const oldAudit=JSON.parse(pin.values.processAccessControl||'{"schemaVersion":2,"primaryAdminId":"frank","audit":[]}'),audit=JSON.parse(values.processAccessControl);
 if(!Array.isArray(oldAudit.audit)||!Array.isArray(audit.audit)||audit.audit.length!==oldAudit.audit.length+1||!equal(audit.audit.slice(0,-1),oldAudit.audit)||!equal({...audit,audit:[]},{...oldAudit,audit:[]}))fail();
 const entry=audit.audit.at(-1),safe=(user:Record<string,unknown>)=>Object.fromEntries(Object.entries(user).filter(([key])=>!['password','passwordHash'].includes(key)));
 if(entry.action!=='password'||entry.target!==next.id||!equal(entry.before,safe(prior))||!equal(entry.after,safe(next)))fail();
 // Consume before any async write; a failed/lost outcome never reuses this handle.
 pin.consumed=true;
 const root=manifest(pin.raw),bucket=env.STATE_ARCHIVE;
 for(const key of editable){
  const raw=values[key],bytes=new TextEncoder().encode(raw);
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const ref={key:'state-records/v1/'+sha256+'.json',sha256};
  await bucket.put(ref.key,raw,{httpMetadata:{contentType:'application/json'}});root.__processRecords.values[key]=ref;
 }
 root.platformUsers=values.platformUsers;
 return JSON.stringify(root);
}
export function passwordStateIsSelected(state:State){return pins.has(state);}
