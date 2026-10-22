import {readState,identity,can,responseHeaders} from '@/lib/process-state';
import {snapshotCapabilities} from '@/lib/snapshot-contract.mjs';
import {env} from 'cloudflare:workers';
import {createD1R2Source} from '@/lib/snapshot-d1-r2.mjs';
import {snapshotResponseBody} from '@/lib/snapshot-stream.mjs';

export async function GET(request:Request) {
  const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});
  const actor=await identity(request,state);
  if(!actor)return Response.json({error:'LOGIN_REQUIRED'},{status:401,headers:responseHeaders});
  if(actor.role!=='admin'||actor.sessionType!=='platform'||!await can(request,state,'master.export'))return Response.json({error:'SNAPSHOT_PERMISSION_REQUIRED'},{status:403,headers:responseHeaders});
  if(new URL(request.url).searchParams.get('action')==='export'){
    const programCommit=(env as {PROCESS_PROGRAM_COMMIT?:string}).PROCESS_PROGRAM_COMMIT;
    if(!/^[a-f0-9]{40}$/.test(programCommit||''))return Response.json({error:'SNAPSHOT_PROGRAM_COMMIT_REQUIRED'},{status:503,headers:responseHeaders});
    try{
      const source=await createD1R2Source({db:env.DB,bucket:env.STATE_ARCHIVE,programCommit});
      const stream=snapshotResponseBody(source);
      return new Response(stream.body,{headers:{...responseHeaders,'Content-Type':'application/x-ndjson','Content-Disposition':'attachment; filename="process-os-snapshot.ndjson"'}});
    }catch(error){const reason=error instanceof Error&&/^SNAPSHOT_[A-Z0-9_]+$/.test(error.message)?error.message:'SNAPSHOT_SOURCE_UNAVAILABLE';return Response.json({error:'SNAPSHOT_EXPORT_PREFLIGHT_REFUSED',reason,supportedProfile:'process-os-json-feedback-store-chunks-v1'},{status:422,headers:responseHeaders});}
  }
  return Response.json(snapshotCapabilities,{headers:responseHeaders});
}
export async function POST(){return Response.json({error:'HOSTED_IMPORT_NOT_SUPPORTED'},{status:405,headers:{...responseHeaders,Allow:'GET'}});}
