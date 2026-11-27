import { check, stateFor } from './piece-calibration.mjs';
const pair = r => ({ calibratedAt: r.calibratedAt ?? '', expiresAt: r.expiresAt ?? '' });
const eq = (a,b) => Object.keys(a).every(k=>a[k]===b[k]);
const validDay = s => typeof s==='string' && /^\d{4}-\d\d-\d\d$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
const validPair = ({calibratedAt,expiresAt}) => (calibratedAt===''||validDay(calibratedAt))&&(expiresAt===''||validDay(expiresAt))&&(!calibratedAt||!expiresAt||calibratedAt<=expiresAt);
const photosOf = docs => new Set(docs.flatMap(d=>d.rows.flatMap(r=>r.photos||[])));
const passes = (docs,id) => docs.filter(d=>d.status==='approved').flatMap(d=>d.rows.filter(r=>r.id===id&&r.outcome==='pass'));
export class ResetConflict extends Error { constructor(blockers){super('NEWER_ROUND');this.blockers=blockers;} }
export function resetIntent(data,id,today,planId) {
 const l=data.ledger,m=data.master,active=m.versions.find(v=>v.id===m.activeVersionId);
 const all=id===null&&planId===undefined;
 check(all||typeof id==='string'&&id.length>0||id===undefined&&typeof planId==='string'&&planId.length>0,'SCOPE');
 check(planId===undefined||typeof planId==='string'&&planId.length>0,'SCOPE');
 check(active?.status==='approved'&&Array.isArray(active.equipment),'BASELINE_UNVERIFIED');
 const rows=new Map(active.equipment.map(r=>[r.id,r]));
 check(rows.size===active.equipment.length,'BASELINE_UNVERIFIED');
 if(typeof id==='string')check(rows.has(id),'SCOPE');
 const byPlan=new Map(l.plans.map(p=>[p.id,p]));
 check(byPlan.size===l.plans.length&&new Set(l.docs.map(d=>d.id)).size===l.docs.length,'BASELINE_UNVERIFIED');
 check(l.plans.every(p=>p.pieces.length&&new Set(p.pieces.map(x=>x.id)).size===p.pieces.length&&l.docs.filter(d=>d.plan===p.id&&d.kind==='plan').length===1)&&l.docs.every(d=>Array.isArray(d.ids)&&d.ids.length&&d.ids.every(k=>byPlan.get(d.plan)?.pieces.some(x=>x.id===k))&&d.rows.every(r=>d.ids.includes(r.id))),'BASELINE_UNVERIFIED');
 const latest=k=>l.plans.findLast(p=>p.pieces.some(x=>x.id===k));
 const target=planId===undefined?latest(id):byPlan.get(planId);
 if(planId!==undefined)check(target&&(id===undefined||target.pieces.some(x=>x.id===id)),'SCOPE');
 const candidates=all?l.plans:target?[target]:[];
 if(!all&&target){
  const blockers=target.pieces.flatMap(x=>{
   const newer=latest(x.id);if(newer?.id===target.id)return [];
   const r=rows.get(x.id);check(r&&newer,'BASELINE_UNVERIFIED');
   return [{assetCode:r.assetCode,mark:r.pieceMark,planId:newer.id}];
  });
  if(blockers.length)throw new ResetConflict(blockers);
 }
 check(candidates.length,'EMPTY');
 const gone=new Set(candidates.map(p=>p.id));
 const removed=l.docs.filter(d=>gone.has(d.plan)), kept=l.docs.filter(d=>!gone.has(d.plan));
 const affected=[...new Set(candidates.flatMap(p=>p.pieces.map(x=>x.id)))];
 const assets=affected;
 const next=structuredClone(l);
 next.plans=next.plans.filter(p=>!gone.has(p.id));
 next.docs=next.docs.filter(d=>!gone.has(d.plan));
 const retiredIds=new Set();
 for(const r of l.retired) {
  if(!all&&!affected.includes(r.id))continue;
  const owned=l.docs.filter(d=>d.status==='approved'&&['scrap','scrapRequest'].includes(d.kind)&&d.ids.includes(r.id));
  check(owned.length===1,'BASELINE_UNVERIFIED');
  if(gone.has(owned[0].plan))retiredIds.add(r.id);
 }
 next.retired=next.retired.filter(x=>!retiredIds.has(x.id));
 // Every actual judgment being removed has a known pre-judgment state.
 const results=assets.map(k=>{
  const goneJudgment=removed.some(d=>d.status==='approved'&&d.rows.some(r=>r.id===k));
  if(goneJudgment){
   const first=l.docs.find(d=>d.status==='approved'&&d.rows.some(r=>r.id===k));
   const baseline=byPlan.get(first?.plan)?.pieces.find(x=>x.id===k)?.baseline;
   const checks=m.versions.filter(v=>v.id===baseline?.version&&['approved','superseded'].includes(v.status));
   const original=checks.length===1&&checks[0].equipment?.find(r=>r.id===k);
   check(baseline?.judgment===first?.id&&original&&validPair(baseline)&&eq(pair(original),pair(baseline)),'BASELINE_UNVERIFIED');
  }
  const row=rows.get(k);check(row,'BASELINE_UNVERIFIED');
  const old=stateFor(l,row,today).dates, ds=passes(l.docs,k), remaining=passes(kept,k), deleting=passes(removed,k);
  let restore=old;
  if(deleting.length){
   const current=ds.at(-1);
   check(eq(pair({calibratedAt:current.date,expiresAt:current.expiresAt}),old),'BASELINE_UNVERIFIED');
   const previous=remaining.at(-1);
   if(previous)restore={calibratedAt:previous.date,expiresAt:previous.expiresAt};
   else{
    const approved=l.docs.find(d=>d.status==='approved'&&d.rows.some(r=>r.id===k));
    const baseline=byPlan.get(approved?.plan)?.pieces.find(x=>x.id===k)?.baseline;
    restore=pair(baseline);
   }
   check(validPair(restore),'BASELINE_UNVERIFIED');
  }
  check(eq(stateFor(next,row,today).dates,restore),'BASELINE_UNVERIFIED');
  return {id:k,assetCode:row.assetCode,mark:row.pieceMark,restore,status:stateFor(next,{...row,...restore},today).status,locked:stateFor(next,{...row,...restore},today).locked};
 });
 const keepPhotos=photosOf(kept);
 for(const r of next.retired)for(const e of r.history||[])for(const photo of e.result?.photos||[])keepPhotos.add(photo);
 const photoIds=[...photosOf(removed)].filter(p=>/^[a-f0-9]{64}$/.test(p)&&!keepPhotos.has(p)).sort();
 const counts={
  plans:candidates.length, documents:removed.length,
  submitted:removed.filter(d=>d.submitter).length,
  pending:removed.filter(d=>d.status==='pending').length,
  approved:removed.filter(d=>d.status==='approved').length,
  reports:removed.filter(d=>['initial','retest'].includes(d.kind)).length,
  photos:photoIds.length,
 };
 return {preview:{scope:all?'all':'round',planId:all?null:target.id,revision:data.revision,counts,pieces:results},next,photoIds};
}
export async function resetToken(preview) {
 const bytes=new TextEncoder().encode(JSON.stringify(preview));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
export function applyReset(intent,{actorId,at,token}) {
 const {next}=intent,{scope,planId,counts,revision}=intent.preview;
 next.audit=[...next.audit.slice(-99),{action:'calibration-reset',scope,planId,actorId,at,counts,intentDigest:token,baseRevision:revision,resultRevision:revision+1}];
 next.revokedPhotos=[...new Set([...(next.revokedPhotos||[]),...intent.photoIds])].sort();
 return next;
}
