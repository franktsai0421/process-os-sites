export function check(ok,code){if(!ok)throw Error(code);}
const months=new Map([['monthly',1],['quarterly',3],['halfyear',6],['yearly',12]]);
const valid=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const dates=r=>({calibratedAt:r.calibratedAt||'',expiresAt:r.expiresAt||''});
export function expires(day,cycle){
 check(valid(day),'DATE');const d=new Date(day),n=d.getUTCDate();
 if(cycle==='weekly')d.setUTCDate(n+7);else{check(months.has(cycle),'CYCLE');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months.get(cycle));const end=new Date(d);end.setUTCMonth(end.getUTCMonth()+1,0);d.setUTCDate(Math.min(n,end.getUTCDate()));}return d.toISOString().slice(0,10);
}
export function readLedger(raw){
 if(raw===undefined)return {schema:1,plans:[],docs:[],retired:[],audit:[]};
 const l=JSON.parse(raw);check(l?.schema===1&&['plans','docs','retired','audit'].every(k=>Array.isArray(l[k])),'LEDGER');return l;
}
export function effective(raw,calibrationCode){
 if(!raw)return null;const c=JSON.parse(raw);check(c.schemaVersion===1&&Array.isArray(c.versions),'MASTER');if(!c.activeVersionId)return null;
 const rows=c.versions.filter(v=>v.id===c.activeVersionId&&v.status==='approved');check(rows.length===1&&Array.isArray(rows[0].equipment),'MASTER');
 const active=rows[0];
 return {...active,equipment:active.equipment.map(row=>({...row,calibrationMethod:calibrationCode(row.calibrationMethod)}))};
}
export function history(l,id){
 const docs=l.docs.filter(d=>d.status==='approved'&&d.ids.includes(id)).map(d=>({id:d.id,kind:d.kind,review:d.review,result:d.rows.find(r=>r.id===id),reason:d.reason,reviewedFlow:d.flow===2}));
 return docs.length?docs:l.retired.find(r=>r.id===id)?.history||[];
}
export function stateFor(l,row,today){
 const log=history(l,row.id),retired=l.retired.find(r=>r.id===row.id),judged=log.filter(h=>h.result),last=judged.at(-1)?.result;
 const pass=judged.filter(h=>h.result.outcome==='pass'&&l.docs.some(d=>d.id===h.id)).at(-1)?.result;
 const pair=pass?{calibratedAt:pass.date,expiresAt:pass.expiresAt}:dates(row),missing=[];
 if(!row.pieceMark?.trim())missing.push('mark');if(row.quantity!=null&&Number(row.quantity)!==1)missing.push('individual');
 if(!valid(pair.expiresAt))missing.push('expiry');if(!months.has(row.calibrationCycle)&&row.calibrationCycle!=='weekly')missing.push('cycle');
 const days=(Date.parse(pair.expiresAt)-Date.parse(today))/86400000;
 const status=retired?'retired':!row.enabled?'disabled':last&&last.outcome!=='pass'?(judged.at(-1)?.reviewedFlow?'failed':'suspended'):missing.length?'missing':days<0?'expired':days<=30?'near':'available';
 const open=l.plans.some(p=>p.pieces.some(x=>x.id===row.id&&x.stage!=='closed'));
 return {dates:pair,locked:!!pass||open||!!retired,status,missing,history:log,retirement:retired&&{date:retired.date,reviewer:retired.reviewer,reason:retired.reason},selectable:!open&&!missing.length&&['available','near','expired'].includes(status)&&['internal','external'].includes(row.calibrationMethod)};
}
export function catalog(l,m,today){
 const ids=new Set();return (m?.equipment||[]).flatMap(r=>{
 check(r.id&&!ids.has(r.id),'PIECE_ID');ids.add(r.id);const f=stateFor(l,r,today);
 if(!f.retirement&&(!r.enabled||!['internal','external'].includes(r.calibrationMethod)))return [];
 return [{id:r.id,assetCode:r.assetCode,mark:r.pieceMark,name:r.nameZh||r.name,nameVi:r.nameVi,quantity:r.quantity,unit:r.unit,owner:r.owner,method:r.calibrationMethod,category:r.category||r.categoryId,subcategory:r.subcategory||r.subcategoryId,group:m.groups?.find(g=>g.id===r.groupId)?.name||r.groupId,...f}];});
}
// Read-only index for approved history that has no selectable catalog row.
export function archivedPieces(ledger, master, items){
 const shown=new Set(items.map(p=>p.id));
 const known=new Map((master?.equipment||[]).map(r=>[r.id,r]));
 const retired=new Map(ledger.retired.map(r=>[r.id,r]));
 const ids=new Set([...retired.keys(),...ledger.docs.filter(d=>d.status==='approved').flatMap(d=>d.ids||[])]);
 return [...ids].filter(id=>id&&!shown.has(id)).map(id=>{
   const r=known.get(id),end=retired.get(id);
   return {id,assetCode:r?.assetCode,mark:r?.pieceMark,name:r?.nameZh||r?.name,nameVi:r?.nameVi,
     missingMaster:!r,retirement:end&&{date:end.date,reason:end.reason,reviewer:end.reviewer},history:end?.history||[]};
 });
}
function reportRows(rows,ids,today){
 check(Array.isArray(rows)&&rows.length===ids.length,'ALL_PIECES');return ids.map(id=>{const r=rows.find(x=>x?.id===id);
 check(r&&valid(r.date)&&r.date<=today&&['pass','fail','abnormal'].includes(r.outcome),'RATING_DATE');check(Array.isArray(r.photos)&&r.photos.length&&r.photos.length<=30&&r.photos.every(p=>typeof p==='string'&&/^[0-9a-f]{64}$/.test(p)),'PHOTO');
 return {id,date:r.date,outcome:r.outcome,photos:[...new Set(r.photos)]};});
}
export function transition(old,m,cmd,ctx){
 const l=structuredClone(old),rows=m?.equipment||[],who={id:ctx.actor.id,name:ctx.actor.name,at:ctx.now};
 if(cmd.action==='newPlan'){
   const ids=cmd.ids;
   check(Array.isArray(ids)&&ids.length&&ids.length<=100&&new Set(ids).size===ids.length,'PIECES');
   const items=ids.map(id=>rows.find(item=>item.id===id));
   check(items.every(item=>item&&stateFor(l,item,ctx.today).selectable),'UNAVAILABLE');
   check(items.every(item=>item.calibrationMethod===items[0].calibrationMethod),'MIXED_METHOD');
   const plan={id:ctx.uid(),flow:2,method:items[0].calibrationMethod,pieces:ids.map(id=>({id,stage:'plan'}))};
   const doc={id:ctx.uid(),flow:2,plan:plan.id,kind:'plan',ids:[...ids],status:'draft',saved:true,rows:[]};
   period(doc,cmd,true);l.plans.push(plan);l.docs.push(doc);return l;
 }
 const doc=l.docs.find(d=>d.id===cmd.doc),plan=l.plans.find(p=>p.id===doc?.plan);
 check(doc&&plan&&plan.flow===2,'DOCUMENT');
 return reviewTransition(l,m,plan,doc,cmd,ctx,who,old);
}
function period(d,cmd,draft=false){
 const {start='',end=''}=cmd;
 check((valid(start)||(draft&&start===''))&&(valid(end)||(draft&&end===''))&&(!start||!end||start<=end),'PERIOD');
 d.start=start;d.end=end;
}
const validAppointment=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)&&valid(s.slice(0,10));
function requestWindow(d){
 return {requestId:d.id,start:d.scheduled,end:d.scheduledEnd||d.scheduled};
}
function recordRetestTiming(ledger,report){
 if(report.kind!=='retest')return;
 let window=report.retestWindow;
 if(!window){
   // v11 reports did not store the approved request ID. Stop at a prior result for this piece.
   for(let i=ledger.docs.indexOf(report)-1;i>=0;i--){
     const d=ledger.docs[i];
     if(d.plan!==report.plan||!d.ids.includes(report.ids[0]))continue;
     if(d.kind==='retestRequest'&&d.status==='approved'&&d.ids.length===1){window=requestWindow(d);break;}
     if(['retest','initial','failure'].includes(d.kind))break;
   }
 }
 if(!window||!validAppointment(window.start)||!validAppointment(window.end)||window.end<window.start)return;
 report.retestWindow=window;
 for(const row of report.rows){
   // Dates entered by the user and the approved wall-clock appointment are both Vietnam local.
   row.retestTiming={...window,late:row.date>window.end.slice(0,10)};
 }
}
function reviewTransition(l,m,p,d,cmd,ctx,who,oldLedger){
 const make=(kind,ids,fields={})=>l.docs.push({id:ctx.uid(),flow:2,plan:p.id,kind,ids:[...ids],status:'draft',saved:false,rows:[],...fields});
 const piece=id=>p.pieces.find(x=>x.id===id);
 const report=['initial','retest'].includes(d.kind);
 const request=['retestRequest','scrapRequest'].includes(d.kind);
 const reason=()=>{check(typeof cmd.reason==='string'&&cmd.reason.trim()&&cmd.reason.length<=2000,'REASON');return cmd.reason.trim();};
 const event={...who,action:cmd.action};
 switch(cmd.action){
 case 'return':
 case 'withdraw':
   check(d.status==='pending','PENDING');
   if(cmd.action==='withdraw')check(d.submitter.id===who.id,'SUBMITTER');
   else{check(d.submitter.id!==who.id||ctx.actor.role==='admin','REVIEW');event.reason=reason();}
   d.status='draft';break;
 case 'branch':
   check(d.kind==='failure'&&d.status==='draft'&&piece(d.ids[0]).stage==='failure'&&['retestRequest','scrapRequest'].includes(cmd.kind),'CASE_CHANGED');
   d.status='resolved';make(cmd.kind,d.ids);break;
 case 'discard':
   check(d.status==='draft'&&d.kind!=='failure','DRAFT');
   if(request){d.status='discarded';make('failure',d.ids);}
   else if(d.kind==='plan'){d.status='discarded';p.pieces.forEach(x=>x.stage='closed');}
   else{d.rows=[];d.saved=false;}
   break;
 case 'save':
   check(d.status==='draft'&&d.kind!=='failure','DRAFT');
   if(d.kind==='plan')period(d,cmd,true);
   else if(report){d.rows=reportRows(cmd.rows,d.ids,ctx.today);check(d.rows.every(r=>r.outcome==='pass'||r.outcome==='fail'),'RATING_DATE');recordRetestTiming(l,d);}
   else if(d.kind==='retestRequest'){
     const end=cmd.scheduledEnd===undefined?(d.scheduledEnd||''):cmd.scheduledEnd;
     check(validAppointment(cmd.scheduled)&&typeof end==='string'&&(!end||(validAppointment(end)&&end>=cmd.scheduled)),'SCHEDULE');
     d.scheduledEnd=end;
     d.scheduled=cmd.scheduled;
   }else{check(request,'DOCUMENT');d.reason=reason();}
   d.saved=true;break;
 case 'submit':
   check(d.status==='draft'&&d.saved,'SAVE_FIRST');if(d.kind==='plan')period(d,d);d.submitter=who;d.status='pending';break;
 case 'approve':
   check(d.status==='pending'&&(d.submitter.id!==who.id||(ctx.actor.role==='admin'&&cmd.selfConfirmed===true)),'REVIEW');
   d.review=who;d.status='approved';
   if(d.kind==='plan'){
     for(const x of p.pieces){const r=m.equipment.find(v=>v.id===x.id);check(r&&r.calibrationMethod===p.method&&['available','near','expired'].includes(stateFor(l,r,ctx.today).status),'MASTER_CHANGED');x.cycle=r.calibrationCycle;x.stage='initial';}
     make('initial',d.ids);
   }else if(report){
     recordRetestTiming(l,d);
     for(const r of d.rows){const x=piece(r.id),item=m.equipment.find(v=>v.id===r.id);check(item&&x.stage===d.kind,'CASE_CHANGED');
       x.baseline||={...stateFor(oldLedger,item,ctx.today).dates,version:m.id,judgment:d.id};
       if(r.outcome==='pass'){r.expiresAt=expires(r.date,x.cycle);x.stage='closed';}
       else{x.stage='failure';make('failure',[r.id]);}
     }
   }else{
     const x=piece(d.ids[0]);check(request&&x.stage==='failure','CASE_CHANGED');
     if(d.kind==='retestRequest'){x.stage='retest';make('retest',d.ids,{retestWindow:requestWindow(d)});}
     else{x.stage='closed';l.retired.push({id:x.id,date:ctx.today,reason:d.reason,reviewer:who.name});}
   }break;
 default:throw Error('ACTION');
 }
 (d.events||=[]).push(event);return l;
}
