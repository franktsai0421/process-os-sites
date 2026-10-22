import {env} from 'cloudflare:workers';
import {headers} from 'next/headers';
import {redirect,notFound} from 'next/navigation';
import hosting from '../../../.openai/hosting.json';
import {readState,identity,can} from '@/lib/process-state';
import {importPageAllowed,importPageConfiguration} from '@/lib/sites-import-page.mjs';
import ImportClient from './upload-client';
export const dynamic='force-dynamic';
export default async function ImportPage(){
 const values=env as unknown as Record<string,string|undefined>;
 if(values.PROCESS_IMPORT_ENABLED!=='1'||!values.PROCESS_IMPORT_ORIGIN)notFound();
 const request=new Request(values.PROCESS_IMPORT_ORIGIN+'/setup/import',{headers:new Headers(await headers())});
 const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']}),actor=await identity(request,state);
 if(!actor)redirect('/login');
 if(!importPageAllowed(actor,await can(request,state,'master.export'),values))notFound();
 return <ImportClient {...importPageConfiguration(values,hosting.project_id)}/>;
}
