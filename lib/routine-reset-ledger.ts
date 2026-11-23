import {DraftConflict} from './shared-draft';
export type ResetPending={operationId:string;clientEvidence:string};
type Retired={actorId:string;outcome:'committed'|'registered'|'unknown';fingerprintHash?:string};
export type ResetEntry={id:string;scope:'fqc'|'iqc';actorId:string;fingerprint:string;revision:number;generationRevision:number;at:string;reason:string;firstStartRetirement?:unknown;settlements:(ResetPending&{priorOutcome:Retired['outcome'];status:'superseded-by-reset'})[]};
type Ledger={version:1;entries:ResetEntry[];retired:Record<string,Retired>};
const fail=(code:string):never=>{throw new DraftConflict(code,409);};
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
export function validResetPending(value:unknown):value is ResetPending[]{
 return Array.isArray(value)&&value.length<=32&&new Set(value.map(x=>x?.operationId)).size===value.length&&value.every(x=>x&&Object.keys(x).sort().join()==='clientEvidence,operationId'&&typeof x.operationId==='string'&&/^[\w-]{8,100}$/.test(x.operationId)&&typeof x.clientEvidence==='string'&&/^[a-f0-9]{64}$/.test(x.clientEvidence));
}
export function resetLedger(control:object):Ledger{
 const c=control as {resetLedger?:Ledger};
 if(!Object.hasOwn(c,'resetLedger'))return {version:1,entries:[],retired:{}};
 const l=c.resetLedger;
 if(!l||l.version!==1||!Array.isArray(l.entries)||!l.retired||typeof l.retired!=='object'||Array.isArray(l.retired)||l.entries.length>256||Object.keys(l.retired).length>10000||JSON.stringify(l).length>1000000)fail('RESET_LEDGER_INVALID');
 if(l!.entries.some(e=>!e||!['fqc','iqc'].includes(e.scope)||typeof e.id!=='string'||!/^[\w-]{8,100}$/.test(e.id)||typeof e.actorId!=='string'||!e.actorId||!/^[a-f0-9]{64}$/.test(e.fingerprint)||!Number.isSafeInteger(e.revision)||e.revision<0||!Number.isSafeInteger(e.generationRevision)||e.generationRevision<0||typeof e.reason!=='string'||typeof e.at!=='string'||!Array.isArray(e.settlements)||!validResetPending(e.settlements.map(({operationId,clientEvidence})=>({operationId,clientEvidence})))||e.settlements.some(p=>p.status!=='superseded-by-reset'||!['committed','registered','unknown'].includes(p.priorOutcome)))||new Set(l!.entries.map(e=>e.id)).size!==l!.entries.length||Object.entries(l!.retired).some(([id,r])=>!/^[\w-]{8,100}$/.test(id)||!r||typeof r.actorId!=='string'||!r.actorId||!['committed','registered','unknown'].includes(r.outcome)||r.fingerprintHash!==undefined&&!/^[a-f0-9]{64}$/.test(r.fingerprintHash)))fail('RESET_LEDGER_INVALID');
 return l!;
}
export function assertNotResetRetired(control:object,id:string){
 if(Object.hasOwn(resetLedger(control).retired,id))fail('OPERATION_SUPERSEDED_BY_RESET');
}
export function findResetEntry(control:object,id:string){return resetLedger(control).entries.find(e=>e.id===id);}
export async function makeResetLedger(control:object,entry:Omit<ResetEntry,'settlements'>,pending:ResetPending[]){
 const raw=control as {firstStartRetirement?:{id:string|null;actorId:string;scope:string;expectedRevision:number;fencedRevision:number};receipts?:Record<string,{actorId:string;fingerprint:string;result?:unknown}>;page?:{workflow?:{receipts?:Record<string,{actorId:string;fingerprint:string}>}};resetReceipt?:{id:string;actorId:string;fingerprint:string;revision:number}};
 const old=resetLedger(control),next:Ledger=structuredClone(old);
 if(old.entries.some(e=>e.scope!==entry.scope))fail('RESET_LEDGER_SCOPE_MISMATCH');
 // Carry minimal protective evidence, never business document content/results.
 const receipts=[...Object.entries(raw.receipts||{}),...Object.entries(raw.page?.workflow?.receipts||{})];
 for(const [key,value] of receipts){
   if(!value||typeof value.actorId!=='string'||typeof value.fingerprint!=='string')fail('RESET_RECEIPT_INVALID');
   const registered=key.startsWith('~plan-intent~'),id=registered?key.slice('~plan-intent~'.length):key;
   if(!/^[\w-]{8,100}$/.test(id))fail('RESET_RECEIPT_INVALID');
   if(Object.hasOwn(old.retired,id))fail('RESET_RECEIPT_REAPPEARED');
   if(Object.hasOwn(next.retired,id)){
     if(next.retired[id].actorId!==value.actorId)fail('RESET_RECEIPT_MISMATCH');
     if(registered)continue;
   }
   Object.defineProperty(next.retired,id,{value:{actorId:value.actorId,outcome:registered?'registered':'committed',fingerprintHash:await hash(value.fingerprint)},enumerable:true,writable:true,configurable:true});
 }
 const settlements:ResetEntry['settlements']=[];
 for(const p of pending){
   const known=Object.hasOwn(next.retired,p.operationId)?next.retired[p.operationId]:undefined;
   if(known&&known.actorId!==entry.actorId)fail('RESET_PENDING_ACTOR_MISMATCH');
   if(!known)Object.defineProperty(next.retired,p.operationId,{value:{actorId:entry.actorId,outcome:'unknown'},enumerable:true,writable:true,configurable:true});
   settlements.push({...p,priorOutcome:known?.outcome||'unknown',status:'superseded-by-reset'});
 }
 // Preserve the last legacy Reset receipt too; it cannot acquire invented detail.
 if(raw.resetReceipt&&!next.entries.some(e=>e.id===raw.resetReceipt!.id)){
   const r=raw.resetReceipt;
   next.entries.push({...r,scope:entry.scope,generationRevision:0,at:'',reason:'Legacy reset receipt; details unavailable',settlements:[]});
 }
 if(raw.firstStartRetirement){
   const r=raw.firstStartRetirement;
   if(r.scope!==entry.scope||typeof r.actorId!=='string'||r.expectedRevision!==0||r.fencedRevision!==1||r.id!==null&&(typeof r.id!=='string'||!/^[\w-]{8,100}$/.test(r.id)))fail('RESET_RECEIPT_INVALID');
   if(r.id!==null&&!Object.hasOwn(next.retired,r.id))Object.defineProperty(next.retired,r.id,{value:{actorId:r.actorId,outcome:'unknown'},enumerable:true,writable:true,configurable:true});
 }
 next.entries.push({...entry,...(raw.firstStartRetirement?{firstStartRetirement:structuredClone(raw.firstStartRetirement)}:{}),settlements});
 if(next.entries.length>256||Object.keys(next.retired).length>10000||JSON.stringify(next).length>1000000)fail('RESET_LEDGER_CAPACITY');
 return next;
}
