export const versionControlKeys=Object.freeze(['masterDataControl','processAuthoringControl','approvalVersions','qualityMasterControl','iqcMasterControl','ipqcABMasterControl','ipqcCMasterControl','routineEquipmentControl','bomMasterControl','toolingMasterControl']);

// Notification IDs only, not a state/write baseline. Keep the existing ordering
// semantics (first approved master; last approved legacy row per category/line).
export function effectiveVersionMetadata(key,raw){
 const control=JSON.parse(raw);
 if(key==='masterDataControl')return JSON.stringify({versions:(control.versions||[]).map(v=>({id:v.id,scope:v.scope,status:v.status}))});
 if(key==='approvalVersions')return JSON.stringify(control.map(v=>({id:v.id,status:v.status,category:v.category,line:v.line})));
 if(key==='qualityMasterControl')return JSON.stringify({libraries:Object.fromEntries(Object.entries(control.libraries||{}).map(([scope,lib])=>[scope,{activeVersionId:lib.activeVersionId}]))});
 if(key==='ipqcABMasterControl')return JSON.stringify({scopes:Object.fromEntries(Object.entries(control.scopes||{}).map(([scope,lib])=>[scope,{activeVersionId:lib.activeVersionId}]))});
 return JSON.stringify({activeVersionId:control.activeVersionId});
}
