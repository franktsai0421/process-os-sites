import {DraftConflict,stableDraftJSON} from './shared-draft';
import type {IqcItem} from './iqc';
import type {Equipment} from './routine-equipment';
import type {Tool} from './tooling';

type FqcTimeFields = {rule?:Record<string,unknown>;isCustomPeriod?:unknown;customPeriodText?:unknown};
type IqcTimeFields = Pick<IqcItem,'rules'>;
type EquipmentTimeFields = Pick<Equipment,'calibrationCycle'|'customCycle'>;
type ToolingTimeFields = Pick<Tool,'inspectionFrequency'|'frequencyMonths'>;
// Existing nonstandard time values are provenance, never a source of new choices.
export function retainLegacyTime(next:unknown,previous:unknown,standard:boolean) {
 if(!standard&&(previous===undefined||stableDraftJSON(next)!==stableDraftJSON(previous)))
  throw new DraftConflict('CUSTOM_TIME_FREQUENCY_READ_ONLY',422);
}
export function checkFqcTime(row:FqcTimeFields,old?:Record<string,unknown>){
 const rule=row.rule,prior=old?.rule as FqcTimeFields['rule'];
 if(rule?.cadence==='time')retainLegacyTime([rule.timeFrequency,rule.customTimeText||''],prior?.cadence==='time'?[prior.timeFrequency,prior.customTimeText||'']:old?.isCustomPeriod?['custom',old.customPeriodText||'']:undefined,typeof rule.timeFrequency==='string'&&['weekly','monthly','quarterly','half_yearly','yearly'].includes(rule.timeFrequency));
 if(row.isCustomPeriod)retainLegacyTime(row.customPeriodText||'',old?.isCustomPeriod?old.customPeriodText||'':prior?.cadence==='time'&&prior.timeFrequency==='custom'?prior.customTimeText||'':undefined,false);
}
export function checkIqcTime(row:IqcTimeFields,old?:IqcTimeFields){
 for(const rule of row.rules||[])if(rule.cadence==='time'){
 const prior=old?.rules?.find(r=>r.id===rule.id&&r.cadence==='time');
 retainLegacyTime([rule.kind,rule.nameVi||'',rule.value||''],prior?[prior.kind,prior.nameVi||'',prior.value||'']:undefined,['week','month','quarter','half_year','year'].includes(rule.kind));
 }
}
export function checkEquipmentTime(row:EquipmentTimeFields,old?:EquipmentTimeFields){
 const cycle=row.calibrationCycle||'';
 retainLegacyTime([cycle,row.customCycle||''],old?[old.calibrationCycle||'',old.customCycle||'']:undefined,['','weekly','monthly','quarterly','halfyear','yearly'].includes(cycle));
}
export function checkToolingTime(row:ToolingTimeFields,old?:ToolingTimeFields){
 const map:Record<string,number|null>={weekly:null,monthly:1,quarterly:3,semiannual:6,annual:12};
 const standard=row.inspectionFrequency!=null?Object.hasOwn(map,row.inspectionFrequency)&&map[row.inspectionFrequency]===row.frequencyMonths:[null,1,3,6,12].includes(row.frequencyMonths);
 retainLegacyTime([row.inspectionFrequency??null,row.frequencyMonths],old?[old.inspectionFrequency??null,old.frequencyMonths]:undefined,standard);
}
