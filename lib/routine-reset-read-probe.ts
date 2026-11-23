import {env} from 'cloudflare:workers';
import {readSharedStateRow} from './process-state';
import {decodeRecordValues} from './state-records';

const maxBytes = 8 * 1024 * 1024;
const maxLookups = 128;
const maxDuration = 15_000;
const authKeys = ['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','routineFqcEnabled'];

type Stage = 'd1_query'|'manifest'|'r2_lookup'|'r2_body'|'digest'|'decode'|'nested_decode'|'budget'|'complete';
type Category = 'failed'|'missing'|'unsupported'|'invalid'|'mismatch'|'limit'|'ok';
class ProbeFailure extends Error {
  constructor(readonly stage:Stage, readonly category:Category){super();}
}

export function probeDeadline(activationExpiry:string){
  const raw=(env as typeof env & {PROCESS_FQC_RESET_READ_PROBE_FROM?:string}).PROCESS_FQC_RESET_READ_PROBE_FROM;
  if(!raw || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw))return 0;
  const start=Date.parse(raw),end=start+600_000,now=Date.now();
  return start<=now && now<end && end<=Date.parse(activationExpiry)?end:0;
}

// Use the production SELECT and records-v1 decoder. Limit cumulative provider bytes
// and expanded cached bodies. Budgets are per invocation across both auth reads and the probe.
export function createResetReadProbe(expiry:number){
  const deadline=Math.min(expiry,Date.now()+maxDuration);
  let lookups=0,bytes=0,expanded=0;
  const sizes=new Map<string,number>();
  const bodyStructure=new Map<string,number>();
  let remainingStructure=65_536;
  // Count separators outside quoted strings before JSON.parse or recursive hydration.
  // Also charge cached immutable bodies on each expansion, even after a single R2 GET.
  function measure(raw:string){
    const width:number[]=[];
    let quoted=false,units=1;
    for(let i=0;i<raw.length;i++){
      if((i & 16383)===0)check();
      const ch=raw[i];
      if(quoted){if(ch==='\\')i++;else if(ch==='"')quoted=false;continue;}
      if(ch==='"'){quoted=true;continue;}
      if(ch==='{'||ch==='['){if(width.length>=64)throw new ProbeFailure('budget','limit');width.push(1);}
      else if(ch==='}'||ch===']')width.pop();
      else if(ch===','){if(width.length && ++width[width.length-1]>2048)throw new ProbeFailure('budget','limit');}
      else if(ch!==':')continue;
      if(++units>remainingStructure)throw new ProbeFailure('budget','limit');
    }
    remainingStructure-=units;
    if(remainingStructure<0)throw new ProbeFailure('budget','limit');
    return units;
  }
  function check(){if(Date.now()>=deadline)throw new ProbeFailure('budget','limit');}
  const bucket={
    async get(key:string){
      check();
      if(++lookups>maxLookups)throw new ProbeFailure('budget','limit');
      let object;
      try{object=await env.STATE_ARCHIVE.get(key);}catch{throw new ProbeFailure('r2_lookup','failed');}
      if(!object)throw new ProbeFailure('r2_lookup','missing');
      const size=object.size;
      if(!Number.isSafeInteger(size)||size<0||size>maxBytes-bytes){
        await object.body?.cancel().catch(()=>undefined);
        throw new ProbeFailure('budget','limit');
      }
      bytes+=size;sizes.set(key,size);
      return {size,body:object.body,async text(){
        check();
        let raw;
        try{raw=await object.text();}catch{throw new ProbeFailure('r2_body','failed');}
        bodyStructure.set(key,measure(raw));
        check();return raw;
      }};
    },
    async put():Promise<never>{throw new ProbeFailure('decode','failed');}
  };
  function chargeBodyUse(key:string){
    expanded+=sizes.get(key)??maxBytes+1;
    remainingStructure-=bodyStructure.get(key)??65_537;
    if(expanded>maxBytes||remainingStructure<0)throw new ProbeFailure('budget','limit');
    check();
  }
  async function read(authOnly:boolean,expectedRevision?:number){
    check();
    const row=await readSharedStateRow().catch(()=>{throw new ProbeFailure('d1_query','failed');});
    if(!row)throw new ProbeFailure('d1_query','missing');
    if(expectedRevision!==undefined&&row.revision!==expectedRevision)throw new ProbeFailure('manifest','mismatch');
    if(typeof row.values!=='string'||row.values.length>1048576)throw new ProbeFailure('budget','limit');
    measure(row.values);
    let envelope;
    try{envelope=JSON.parse(row.values);}catch{throw new ProbeFailure('manifest','invalid');}
    if(envelope?.__processRecords?.version!==1)throw new ProbeFailure('manifest','unsupported');
    try{
      const options={keys:authOnly?authKeys:undefined,chargeBodyUse,onInvalidBodyJson(){throw new ProbeFailure('nested_decode','invalid');}};
      const state=await decodeRecordValues(bucket,envelope,options);
      check();return {revision:row.revision,values:state.values};
    }catch(error){
      if(error instanceof ProbeFailure)throw error;
      if(error instanceof SyntaxError)throw new ProbeFailure('decode','invalid');
      // Provider exceptions were already converted at the adapter boundary.
      if(error instanceof Error && error.message==='Immutable record corrupt')throw new ProbeFailure('digest','mismatch');
      if(error instanceof Error && ['Invalid record manifest','Invalid immutable record reference'].includes(error.message))throw new ProbeFailure('manifest','invalid');
      throw new ProbeFailure('decode','failed');
    }
  }
  return {authorizeState:()=>read(true),async run(revision:number):Promise<{stage:Stage;category:Category}>{
    try{await read(false,revision);return {stage:'complete',category:'ok'};}
    catch(error){return error instanceof ProbeFailure?{stage:error.stage,category:error.category}:{stage:'decode',category:'failed'};}
  }};
}
