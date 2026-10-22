import {isImmutableRecordBody,readImmutableRecord} from './state-records';
const normalize=(value:unknown)=>(typeof value==='string'||typeof value==='number'||typeof value==='boolean'?String(value):'').trim().toLowerCase();
// Preserve all legacy identity fields and V3 actor stamps. Inspect metadata
// first; only if it proves nothing, verify closed bodies serially. Never build
// a complete historical JSON aggregate merely to archive one account.
export async function hasHistoricalUserReference(values:Record<string,string>,userId:string,bucket:Parameters<typeof readImmutableRecord>[0]){
 const fields=new Set(['creatorId','reviewerId','actorId','actor','userId','submittedBy','createdBy','updatedBy','ownerId']),refs=new Map<string,Parameters<typeof readImmutableRecord>[1]>();
 const visit=(value:unknown,key=''):boolean=>{
  if(isImmutableRecordBody(value)){refs.set(value.__immutableBody.sha256,value.__immutableBody);return false;}
  if(Array.isArray(value))return value.some(child=>visit(child));
  if(value&&typeof value==='object'){if(fields.has(key)&&normalize((value as {id?:unknown}).id)===normalize(userId))return true;return Object.entries(value).some(([childKey,child])=>visit(child,childKey));}
  return fields.has(key)&&normalize(value)===normalize(userId);
 };
 for(const [key,raw]of Object.entries(values))if(key!=='platformUsers'&&visit(JSON.parse(raw)))return true;
 for(const ref of refs.values())if(visit(JSON.parse(await readImmutableRecord(bucket,ref))))return true;
 return false;
}
