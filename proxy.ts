import {env} from 'cloudflare:workers';
import {importVisibility} from './lib/snapshot-import-gate.mjs';
export async function proxy(request:Request){
 return importVisibility(request,{enabled:(env as {PROCESS_IMPORT_ENABLED?:string}).PROCESS_IMPORT_ENABLED==='1',db:env.DB});
}
