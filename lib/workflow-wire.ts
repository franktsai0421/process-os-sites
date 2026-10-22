import {cloneDraft,sameDraftValue,DraftConflict} from './shared-draft';
type Obj=Record<string,unknown>;
const object=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
// Request-only string interning. A global template photo can occur in dozens
// of guarded patches. Keep the 2 MB request limit; never compress arbitrary
// data or introduce storage references. Expansion shares immutable strings.
export function expandWorkflowCommand(value:unknown):unknown {
 if(!object(value)||value.commandWireVersion===undefined){
  if(JSON.stringify(value)?.includes('__commandMedia'))throw new DraftConflict('INVALID_COMMAND_MEDIA',422);
  return value;
 }
 const fail=():never=>{throw new DraftConflict('INVALID_COMMAND_MEDIA',422);};
 if(value.commandWireVersion!==1||!object(value.command)||!Array.isArray(value.media)||value.media.length>64||Object.keys(value).length!==3)fail();
 const media=value.media as unknown[];
 if(media.some(v=>typeof v!=='string'||v.length<4096||!/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(v)))fail();
 const used=new Set<number>();let references=0,expandedMediaBytes=0;
 const expand=(v:unknown,depth=0):unknown=>{
  if(depth>48)fail();
  if(object(v)&&Object.hasOwn(v,'__commandMedia')){
   const index=v.__commandMedia;
   if(Object.keys(v).length!==1||!Number.isInteger(index)||Number(index)<0||Number(index)>=media.length||++references>256)fail();
   expandedMediaBytes+=(media[Number(index)] as string).length;
   if(expandedMediaBytes>8_000_000)throw new DraftConflict('COMMAND_MEDIA_EXPANSION_TOO_LARGE',413);
   used.add(Number(index));return media[Number(index)];
  }
  if(Array.isArray(v))return v.map(child=>expand(child,depth+1));
  if(object(v))return Object.fromEntries(Object.entries(v).map(([key,child])=>[key,expand(child,depth+1)]));return v;
 };
 const command=expand(value.command);if(used.size!==media.length)fail();return command;
}
export async function workflowCommandFingerprint(command:unknown){
 // Canonical unique media prevent receipts from retaining dozens of complete
 // repeated photos. Hash the interned representation, not an expanded JSON.
 const media:string[]=[],indexes=new Map<string,number>();
 const intern=(value:unknown):unknown=>{
  if(typeof value==='string'&&value.length>=4096&&/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(value)){
   if(!indexes.has(value)){indexes.set(value,media.length);media.push(value);}return{__commandMedia:indexes.get(value)};
  }
  if(Array.isArray(value))return value.map(intern);
  if(object(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,intern(value[key])]));return value;
 };
 const canonical=JSON.stringify({command:intern(command),media}),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
 return JSON.stringify({action:object(command)?command.action:undefined,commandDigestV1:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')});
}
export function isWorkflowDigestFingerprint(fingerprint:string){
 const value=JSON.parse(fingerprint);return object(value)&&Object.keys(value).length===2&&typeof value.commandDigestV1==='string'&&/^[a-f0-9]{64}$/.test(value.commandDigestV1)&&typeof value.action==='string';
}
// Optional transport only. Persistence and legacy API payloads stay unchanged.
// Send live bodies once; browser expansion creates independent mutable copies
// for forms, preserving cancellation/Save-with-open-form semantics.
export function compactWorkflowPayload(payload:unknown,enabled:boolean):unknown{
 if(!enabled||!object(payload)||!object(payload.control)||!object(payload.control.workflow))return payload;
 const control=payload.control,flow=control.workflow as Obj,active=flow.active as Obj,saved=object(flow.saved)?flow.saved:null;
 if(!object(active)||!Array.isArray(control.versions))return payload;
 const live:Obj={working:flow.working},activeKey=sameDraftValue(active.content,flow.working)?'working':'active';
 if(activeKey==='active')live.active=active.content;
 const savedKey=saved?sameDraftValue(saved.content,flow.working)?'working':sameDraftValue(saved.content,active.content)?activeKey:'saved':null;
 if(savedKey==='saved')live.saved=saved!.content;
 const ref=(key:string)=>({__liveContent:key});
 const versions=control.versions.map(v=>{if(!object(v))return v;const key=sameDraftValue(v.snapshot,flow.working)?'working':sameDraftValue(v.snapshot,active.content)?activeKey:null,next:Obj={...v,snapshot:key?ref(key):v.snapshot};
  if(key&&object(v.snapshot))for(const field of ['equipment','groups','categories','subcategories','issues'])if(Object.hasOwn(v,field)&&sameDraftValue(v[field],v.snapshot[field]))next[field]=ref(key+'#'+field);
  return next;});
 return{...payload,wireVersion:1,liveContent:live,control:{...control,versions,workflow:{...flow,working:ref('working'),active:{...active,content:ref(activeKey)},saved:saved?{...saved,content:ref(savedKey!)}:null}}};
}
export function expandWorkflowPayload(payload:unknown):unknown{
 if(!object(payload)||payload.wireVersion!==1)return payload;
 if(!object(payload.liveContent))throw Error('Invalid live workflow response');const live=payload.liveContent;
 function expand(v:unknown):unknown{
  if(object(v)&&Object.keys(v).length===1&&typeof v.__liveContent==='string'){
   const [key,field]=v.__liveContent.split('#');if(!Object.hasOwn(live,key)||field&&(!object(live[key])||!Object.hasOwn(live[key],field)))throw Error('Missing live workflow content');return cloneDraft(field?(live[key] as Obj)[field]:live[key]);
  }
  if(Array.isArray(v))return v.map(expand);
  if(object(v))return Object.fromEntries(Object.entries(v).map(([k,value])=>[k,expand(value)]));return v;
 }
 const {wireVersion:_version,liveContent:_live,...body}=payload;return expand(body);
}
