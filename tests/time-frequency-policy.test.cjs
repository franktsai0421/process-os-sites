const test=require('node:test'),assert=require('node:assert/strict');
const load=require('../scripts/ipqc-ab-import-harness.cjs')(),p=load('lib/time-frequency-policy.ts');
const copy=x=>JSON.parse(JSON.stringify(x));
const cases=[
 ['FQC',p.checkFqcTime,{id:'one',rule:{cadence:'time',timeFrequency:'custom',customTimeText:'  45 days  '}},x=>x.rule.customTimeText='60 days',x=>x.rule={cadence:'time',timeFrequency:'monthly'}],
 ['IQC',p.checkIqcTime,{id:'one',rules:[{id:'r',cadence:'time',kind:'custom',nameVi:'  45 days  ',value:''}]},x=>x.rules[0].nameVi='60 days',x=>x.rules[0]={id:'r',cadence:'time',kind:'month'}],
 ['equipment',p.checkEquipmentTime,{id:'one',calibrationCycle:'custom',customCycle:'  45 days  '},x=>x.customCycle='60 days',x=>x.calibrationCycle='monthly'],
 ['tooling',p.checkToolingTime,{id:'one',frequencyMonths:2},x=>x.frequencyMonths=5,x=>{x.frequencyMonths=3;x.inspectionFrequency='quarterly';}],
];
for(const [name,check,old,mutate,standard] of cases){
 test(name+': legacy value survives unrelated edits; new/change custom denied; explicit standard accepted',()=>{
 const before=JSON.stringify(old),next=copy(old);next.notes='unrelated';check(next,old);assert.equal(JSON.stringify(old),before);
 assert.throws(()=>check(copy(old)),/CUSTOM_TIME_FREQUENCY_READ_ONLY/);
 mutate(next);assert.throws(()=>check(next,old),/CUSTOM_TIME_FREQUENCY_READ_ONLY/);
 standard(next);check(next,old);assert.equal(JSON.stringify(old),before);
 assert.throws(()=>check(old,next),/CUSTOM_TIME_FREQUENCY_READ_ONLY/);
 });
}
test('FQC legacy flag and normalization preserve text without enabling another custom value',()=>{const old={isCustomPeriod:true,customPeriodText:'45 days'};p.checkFqcTime({...old,rule:{cadence:'time',timeFrequency:'custom',customTimeText:'45 days'}},old);assert.throws(()=>p.checkFqcTime({isCustomPeriod:true,customPeriodText:'new'}),/READ_ONLY/);});
test('non-time custom sampling remains editable',()=>{p.checkFqcTime({rule:{cadence:'batch',batchKind:'custom',customBatchText:'batch'}});p.checkIqcTime({rules:[{id:'b',cadence:'batch',kind:'custom',nameVi:'batch',value:'4'}]});});
test('IQC cannot copy an existing custom rule under a new id',()=>{const old=cases[1][2],next=copy(old);next.rules.push({...next.rules[0],id:'new'});assert.throws(()=>p.checkIqcTime(next,old),/READ_ONLY/);});
test('all standard time choices remain accepted',()=>{for(const timeFrequency of ['weekly','monthly','quarterly','half_yearly','yearly'])p.checkFqcTime({rule:{cadence:'time',timeFrequency}});for(const kind of ['week','month','quarter','half_year','year'])p.checkIqcTime({rules:[{id:'r',cadence:'time',kind}]});for(const calibrationCycle of ['weekly','monthly','quarterly','halfyear','yearly'])p.checkEquipmentTime({calibrationCycle});for(const [inspectionFrequency,frequencyMonths] of Object.entries({weekly:null,monthly:1,quarterly:3,semiannual:6,annual:12}))p.checkToolingTime({inspectionFrequency,frequencyMonths});});
test('routine source frequency comes only from approved active version, never a newer draft',()=>{
 const r=load('lib/routine-fqc.ts'),item={id:'i',name:'TEST ONLY',checkNo:'DEMO-FQC-001',line:'A',category:'QA',isEnabled:true,productCodes:['P'],rule:{cadence:'time',timeFrequency:'weekly'}};
 const active={id:'v3',number:3,status:'approved',snapshot:{errors:[],items:[item]}},draft={id:'v2',number:2,status:'draft',snapshot:{errors:[],items:[{...copy(item),rule:{cadence:'time',timeFrequency:'monthly'}}]}};
 const state={values:{qualityMasterControl:JSON.stringify({libraries:{fqc:{activeVersionId:'v3',versions:[draft,active]}}})}};
 const source=r.routineSources(state)[0];assert.equal(source.frequency,'weekly');assert.equal(source.versionId,'v3');assert.equal(source.version,'3');assert.equal(source.standardSnapshot.rule.timeFrequency,'weekly');
 const before=JSON.stringify(source);draft.snapshot.items[0].rule.timeFrequency='yearly';assert.equal(JSON.stringify(source),before);
});
