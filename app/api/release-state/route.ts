import {env} from 'cloudflare:workers';
import {readState, encodeValues, decodeValues, sameOrigin, allowedKey, readPlatformUsers, backup, responseHeaders as headers} from '@/lib/process-state';

// Maintenance credential is separate from public demo ADMIN and removed after release.
async function authorized(request:Request) {
  const url=new URL(request.url);
  if (['localhost','127.0.0.1'].includes(url.hostname) && url.searchParams.get('manage')==='1') return true;
  if (env.PROCESS_RELEASE_DISABLED === 'true') return false;
  const expected=env.PROCESS_RELEASE_TOKEN;
  const received=request.headers.get('X-Process-Release-Token');
  if (!expected || !received) return false;
  const hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [a,b]=await Promise.all([hash(expected),hash(received)]);
  return a.reduce((n,x,i)=>n|(x^b[i]),0)===0;
}
export async function GET(request:Request) {
  if(!await authorized(request))return Response.json({error:'Release access denied'},{status:403,headers});
  const id=new URL(request.url).searchParams.get('backup');
  if(id){const row=await env.DB.prepare('SELECT revision,"values" FROM state_backups WHERE id=?').bind(id).first<{revision:number;values:string}>();return row?Response.json({revision:row.revision,values:await decodeValues(row.values)},{headers}):Response.json({error:'Not found'},{status:404,headers});}
  const state=await readState();return Response.json({revision:state.revision,values:state.values},{headers});
}
export async function POST(request:Request) {
  if(!sameOrigin(request)||!await authorized(request))return Response.json({error:'Release access denied'},{status:403,headers});
  let input:unknown;try{input=await request.json();}catch{return Response.json({error:'Invalid JSON'},{status:400,headers});}
  const state=await readState();
  if(!input||typeof input!=='object'||Array.isArray(input))return Response.json({error:'Invalid snapshot'},{status:400,headers});
  const body=input as Record<string,unknown>;
  if(!body||(body.action!=='capture'&&body.action!=='replace')||!body.values||Array.isArray(body.values)||typeof body.values!=='object')return Response.json({error:'Invalid snapshot'},{status:400,headers});
  const snapshotValues:Record<string,string>={};
  for(const [key,value] of Object.entries(body.values)){
    if(!allowedKey(key)||typeof value!=='string')return Response.json({error:'Invalid key/value'},{status:400,headers});
    try{JSON.parse(value);}catch{return Response.json({error:'Invalid snapshot JSON'},{status:400,headers});}
    snapshotValues[key]=value;
  }
  if(body.action==='capture'){
    const values={...state.values,...snapshotValues};
    for(const key of ['platformUsers','processCustomRoles','processRoleTemplateOverrides'])if(state.values[key])values[key]=state.values[key];
    const id=await backup({...state,values},'發布前瀏覽器未儲存草稿保全','release',true);
    return Response.json({ok:true,id,keys:Object.keys(values),revision:state.revision},{headers});
  }
  if(body.baseRevision!==state.revision||body.confirm!=='REPLACE_WITH_LOCAL_SNAPSHOT')return Response.json({error:'Revision or confirmation mismatch'},{status:409,headers});
  const users=readPlatformUsers(snapshotValues.platformUsers);
  if(!Array.isArray(users)||!users.some((u)=>u.id==='admin'&&u.role==='admin'&&u.enabled!==false&&!u.deletedAt)||!snapshotValues.masterDataControl||!snapshotValues.approvalVersions)return Response.json({error:'Required data missing'},{status:400,headers});
  const oldId=crypto.randomUUID(), newId=crypto.randomUUID(), now=new Date().toISOString(), next=state.revision+1, stored=await encodeValues(snapshotValues,state);
  // All statements run in one transaction; the old snapshot is retained before replacement.
  const results=await env.DB.batch([
    env.DB.prepare('INSERT INTO state_backups(id,revision,"values",reason,actor,created_at) SELECT ?,revision,"values",?,?,? FROM shared_state WHERE id=1 AND revision=?').bind(oldId,'發布覆蓋前完整資料庫','release',now,state.revision),
    env.DB.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?').bind(next,stored,now,state.revision),
    env.DB.prepare('INSERT INTO state_backups(id,revision,"values",reason,actor,created_at) SELECT ?,revision,"values",?,?,? FROM shared_state WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM state_backups WHERE id=?)').bind(newId,'發布後新資料庫完整備份','release',now,next,oldId),
  ]);
  if(!results[1].meta.changes)return Response.json({error:'Concurrent update; not replaced'},{status:409,headers});
  return Response.json({ok:true,revision:next,oldBackupId:oldId,newBackupId:newId},{headers});
}
