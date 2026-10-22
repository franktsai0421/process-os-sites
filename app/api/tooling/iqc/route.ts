import {readState,identity,can,parse,responseHeaders} from '@/lib/process-state';
import {toolingIqcSource} from '@/lib/tooling-iqc';
import type {IqcControl} from '@/lib/iqc';
export async function GET(request:Request){try{
 const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode','iqcMasterControl'],deferHistory:true});
 if(!await identity(request,state)||!(await can(request,state,'view:data')||await can(request,state,'view:approval')))return Response.json({error:'FORBIDDEN'},{status:403});
 const c=parse(state.values.iqcMasterControl,{versions:[],activeVersionId:null}) as IqcControl;
 const source=toolingIqcSource(c);if(!source)return Response.json({error:'IQC_APPROVED_SOURCE_UNAVAILABLE'},{status:409});
 const partId=new URL(request.url).searchParams.get('partId');
 if(partId){const part=source.parts.find(p=>p.id===partId);if(!part)return Response.json({error:'IQC_SOURCE_REMOVED',partId},{status:404});const version=c.versions.find(v=>v.id===part.sourceVersionId)!;return Response.json({versionId:part.sourceVersionId,sourceStatus:part.sourceStatus,partId,snapshot:{...version.snapshot,parts:[part]}},{headers:responseHeaders});}
 return Response.json(source,{headers:responseHeaders});
 }catch{return Response.json({error:'IQC_LOAD_FAILED_RETRY'},{status:503});}}
