import {env} from 'cloudflare:workers';
import {can,identity,readState,responseHeaders} from '@/lib/process-state';
import {decodeRecordValues} from '@/lib/state-records';
import {identityKeys} from '@/lib/delivery-read-plan.mjs';

const controls = {
  qualityMasterControl:'fqc', iqcMasterControl:'iqc', ipqcABMasterControl:'ipqc-ab',
  ipqcCMasterControl:'ipqc-c', routineEquipmentControl:'equipment', toolingMasterControl:'tooling',
};

type ReviewIndex = {
  workflow?:{pendingId?:string}, versions?:{status:string,wholeModuleCaseId?:string}[],
  libraries?:{fqc?:ReviewIndex}, scopes?:Record<string,ReviewIndex>, moduleDraft?:ReviewIndex,
};

function countCases(key:string,raw:string){
  const control:ReviewIndex=JSON.parse(raw);
  if(key==='toolingMasterControl')return Number(!!control.workflow?.pendingId);
  if(key==='ipqcABMasterControl'){
    const scopes=Object.values(control.scopes||{});
    return Number(!!control.moduleDraft?.workflow?.pendingId)+scopes.reduce((n,scope)=>
      n+(scope.versions||[]).filter(v=>!v.wholeModuleCaseId&&['pending','pending-test'].includes(v.status)).length,0);
  }
  const versions=key==='qualityMasterControl'?control.libraries?.fqc?.versions:control.versions;
  return (versions||[]).filter(v=>v.status==='pending').length;
}

export async function GET(request:Request){
  const reply=(data:object,status=200)=>Response.json(data,{status,headers:responseHeaders});
  try{
    const state=await readState({keys:[...identityKeys]}),actor=await identity(request,state);
    if(!actor||!await can(request,state,'approval.view'))return reply({error:'FORBIDDEN'},403);
    // An exact total is available only when this account may see all six modules.
    const rights=await Promise.all(Object.values(controls).map(module=>can(request,state,module+'.view')));
    if(rights.includes(false))return reply({count:null});
    const keys=Object.keys(controls);
    const values=state.recordStorage?(await decodeRecordValues(env.STATE_ARCHIVE,state.recordStorage.envelope,{
      keys,projectValue:(key,raw)=>String(countCases(key,raw)),
    })).values:state.values;
    const count=keys.reduce((total,key)=>total+(!values[key]?0:
      state.recordStorage?Number(values[key]):countCases(key,values[key])),0);
    const fresh=await readState({keys:[...identityKeys]});
    if(fresh.revision!==state.revision||(await identity(request,fresh))?.id!==actor.id)return reply({error:'STATE_CHANGED'},409);
    return reply({count});
  }catch{return reply({error:'REVIEW_COUNT_UNAVAILABLE'},503);}
}
