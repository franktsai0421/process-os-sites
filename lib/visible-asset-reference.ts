import {env} from 'cloudflare:workers';
import {readState,companyReader,publicState} from './process-state';
import {projectCompanyState} from './site-security.mjs';
import {identityKeys,authorizedDeliveryKeys} from './delivery-read-plan.mjs';
import {decodeRecordValues,isImmutableRecordBody} from './state-records';

// Request-local only. Preserve the existing public/role projection, including
// legacy editor references; prune private bodies BEFORE fetching/hydrating them.
// No actor, permission result or company data is cached between requests.
export async function visibleAssetReference(
 auth:Awaited<ReturnType<typeof readState>>,
 reader:NonNullable<Awaited<ReturnType<typeof companyReader>>>,
 matches:(values:Record<string,string>)=>boolean|Promise<boolean>,
 identityOnly=false,
){
 const project=async(values:Record<string,string>)=>projectCompanyState(
  publicState({revision:auth.revision,values},reader.actor.id),reader.actor,reader.canRead);
 if(!auth.recordStorage)return matches((await project(auth.values)).values);
 // The old full projection also included the caller's sanitized identity and
 // maintenance metadata. Preserve those visible references across formats;
 // never scan raw identities (which include other accounts/private fields).
 const identityValues=(await project(auth.values)).values;
 // state-media historically scanned the full public state, even with no
 // readable module. canonical-assets scanned identities only alongside an
 // authorized aggregate; retain that stricter records-mode boundary.
 if(identityOnly&&await matches(identityValues))return true;
 const envelope=auth.recordStorage.envelope;
 const keys=(await authorizedDeliveryKeys(reader.canRead,Object.keys(envelope.__processRecords.values)))
  .filter(key=>!identityKeys.includes(key));
 for(const key of keys){
  let projectAfterHydration=false;
  const decoded=await decodeRecordValues(env.STATE_ARCHIVE,envelope,{
   keys:[key],deferHistory:true,deferDependencyHistory:true,
   projectValue:async(name,raw)=>{
    // Older mixed records can hold an inline approved snapshot beside an
    // immutable active body (or vice versa). publicState's equality is on the
    // hydrated values, not their storage representation. Retain the old read
    // path for just that aggregate rather than silently dropping visible
    // version metadata; normally encoded records compare matching SHA refs.
    if(name==='masterDataControl'){
     const master=JSON.parse(raw);
     projectAfterHydration=!!master.workflowScopes&&Array.isArray(master.versions)&&master.versions.some((version:{scope:string;status:string;snapshot:unknown})=>
      Object.hasOwn(master.workflowScopes,version.scope)&&version.status==='approved'&&
      isImmutableRecordBody(version.snapshot)!==isImmutableRecordBody(master.active?.[version.scope]));
    }
    return projectAfterHydration?raw:(await project({...auth.values,[name]:raw})).values[name];
   },
  });
  // The public projection removes adoption markers, so it must not be run a
  // second time on its own output. Only the selected visible bodies were read.
  const visible=projectAfterHydration?(await project({...auth.values,...decoded.values})).values:decoded.values;
  if(await matches({...identityValues,...visible}))return true;
 }
 return false;
}
