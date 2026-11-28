import {readLedger,stateFor} from './piece-calibration.mjs';
import {vietnamToday} from './routine-equipment';
export const ledgerKey='pieceCalibrationLedger';
export function calibrationFacts(rows:Row[], ledgerRaw?:string) {
 if(!ledgerRaw)return {};
 const ledger=readLedger(ledgerRaw),today=vietnamToday();
 return Object.fromEntries(rows.map((row:{id:string})=>{
  const {locked,dates,status}=stateFor(ledger,row,today);
  return [row.id,{locked,dates,status}];
 }));
}
type Row={id:string;calibratedAt?:string|null;expiresAt?:string|null};
export function lockedDateChanges(master:Row[],incoming:Row[],raw?:string){
 if(!raw)return [];
 const ledger=readLedger(raw),rows=new Map(incoming.map(r=>[r.id,r])),today=vietnamToday();
 return master.filter(r=>{
  if(!stateFor(ledger,r,today).locked)return false;
  const candidate=rows.get(r.id);
  return !candidate||(r.calibratedAt??'')!==(candidate.calibratedAt??'')||(r.expiresAt??'')!==(candidate.expiresAt??'');
 }).map(r=>r.id);
}
type Standard={equipmentId?:string;deleted?:boolean;isDeleted?:boolean};
type Snapshot={items:Standard[]};
type Library={activeVersionId?:string;versions:{id:string;status:string;snapshot:Snapshot}[];workflow?:{working?:Snapshot;saved?:{content:Snapshot}}};
export function blockingEquipmentStandards(values:Record<string,string>,id:string){
 const libraries:[string,Library][]=[];
 if(values.qualityMasterControl)for(const [name,lib] of Object.entries<Library>(JSON.parse(values.qualityMasterControl).libraries))libraries.push([name.toUpperCase(),lib]);
 for(const [key,name] of [['iqcMasterControl','IQC'],['ipqcCMasterControl','IPQC-C']])if(values[key])libraries.push([name,JSON.parse(values[key])]);
 if(values.ipqcABMasterControl)for(const [scope,lib] of Object.entries<Library>(JSON.parse(values.ipqcABMasterControl).scopes))libraries.push(['IPQC-AB '+scope,lib]);
 return libraries.filter(([,lib])=>{
  const active=lib.versions.find(v=>v.id===lib.activeVersionId&&v.status==='approved');
  if(lib.activeVersionId&&!active)throw Error('EQUIPMENT_REFERENCES_UNVERIFIED');
  const opened=lib.versions.filter(v=>['draft','pending','pending-test'].includes(v.status));
  const snapshots=[...(active?[active.snapshot]:[]),...opened.map(v=>v.snapshot)];
  if(opened.length&&lib.workflow?.working)snapshots.push(lib.workflow.working);
  if(opened.length&&lib.workflow?.saved)snapshots.push(lib.workflow.saved.content);
  return snapshots.some(s=>{
   if(!Array.isArray(s?.items))throw Error('EQUIPMENT_REFERENCES_UNVERIFIED');
   return s.items.some(r=>!r.isDeleted&&!r.deleted&&r.equipmentId===id);
  });
 }).map(([name])=>name);
}
