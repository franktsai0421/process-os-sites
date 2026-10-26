import {deliveryCandidate,deliveryTabs,deliveryViews,destinationKey} from '../public/process/delivery-purpose.mjs';
import {authorizedDeliveryKeys,identityKeys} from './delivery-read-plan.mjs';

// Dependencies of the existing screen, not a new permission matrix. Every
// selected aggregate is also intersected with the current effective cells.
const process=['masterDataControl','processMasterData'];
const published=[...process,'publishedProcess','processAuthoringControl','dispatchBoard','bomOverrides'];
const contracts={
 dashboard:{keys:[...process,'dispatchBoard'],scopes:['AB','C'],masterScopes:[]},
 player:{keys:published,scopes:['AB','C'],masterScopes:['PROCESS'],bom:true},
 dispatch:{keys:published,scopes:['AB','C'],masterScopes:['PROCESS'],bom:true},
 status:{keys:published,scopes:['AB','C'],masterScopes:['PROCESS'],bom:true},
 editor:{keys:[...published,'approvalVersions','bomMasterControl','ipqcABMasterControl','ipqcCMasterControl'],scopes:['AB','C'],masterScopes:['PROCESS'],bom:true,legacyEditor:true},
 approval:{keys:['masterDataControl','bomMasterControl','processAuthoringControl','approvalVersions','publishedProcess'],scopes:['AB','C'],masterScopes:['AB','C','PROCESS']},
 ab:{keys:['masterDataControl'],scopes:['AB'],masterScopes:['AB']},
 c:{keys:['masterDataControl'],scopes:['C'],masterScopes:['C']},
 bom:{keys:['bomOverrides','bomMasterControl'],scopes:['AB','C'],masterScopes:[],bom:true},
 lines:{keys:['masterDataControl'],scopes:['AB','C'],masterScopes:['AB','C']},
 templates:{keys:process,scopes:['AB','C'],masterScopes:['PROCESS']},
 users:{keys:['backupSettings']},
 feedback:{keys:[]},
 fqc:{keys:['qualityMasterControl','canonicalQuality'],quality:['fqc']},
 // These modules load their authoritative workflow through dedicated APIs;
 // their bootstrap aggregates were not consumed by the shared-state mirror.
 iqc:{keys:[]},
 'ipqc-ab':{keys:[]},
 'ipqc-c':{keys:[]},
 tooling:{keys:[]},
 equipment:{keys:[]},
 routine:{keys:['routineFqcEnabled']},
 // These existing screens are placeholders, not consumers of every quality
 // library. Their individual module screens fetch their own authorized APIs.
 'quality-dashboard':{keys:[]},'quality-search':{keys:[]},'quality-reports':{keys:[]},fpy:{keys:[]},'routine-reports':{keys:[]},
};
function destination(view,dataTab,module,preferredSystem){
 const quality=view.startsWith('quality-')||dataTab?.startsWith('quality-');
 return{view,dataTab: dataTab||null,module,system:quality?'quality':view==='data'?preferredSystem:'process'};
}
export async function destinationPlan(search,canRead,availableKeys=[],features={}){
 const candidate=deliveryCandidate(search);let selected;
 if(candidate.module){
  if(candidate.module==='feedback'&&features.webFeedback!==true)throw Error('DESTINATION_UNAVAILABLE');
  if(!await canRead(candidate.module+'.view'))throw Error('DESTINATION_FORBIDDEN');
  selected=destination(candidate.view,candidate.dataTab,candidate.module,candidate.preferredSystem);
 }else{
  const options=[...Object.entries(deliveryViews).map(([view,module])=>destination(view,null,module,candidate.preferredSystem)),...Object.entries(deliveryTabs).map(([tab,module])=>destination('data',tab,module,candidate.preferredSystem))];
  const eligible=options.filter(row=>(row.module!=='feedback'||features.webFeedback===true)&&(!candidate.explicit||row.view==='data'));
  eligible.sort((a,b)=>Number(b.system===candidate.preferredSystem)-Number(a.system===candidate.preferredSystem));
  for(const row of eligible)if(await canRead(row.module+'.view')){selected=row;break;}
  if(!selected)throw Error('DESTINATION_FORBIDDEN');
 }
 const contract=contracts[selected.module],authorized=await authorizedDeliveryKeys(canRead,availableKeys);
 const requested=[...contract.keys,...(contract.legacyEditor?authorized.filter(key=>key.startsWith('processEditor:')):[])];
 const deliveryKeys=requested.filter(key=>authorized.includes(key));
 const keys=[...new Set([...identityKeys,...deliveryKeys,...(contract.scopes?.length?['masterDataControl']:[])])];
 return{destination:{...selected,key:destinationKey(selected)},keys,deliveryKeys,catalog:{scopes:contract.scopes||[],includeBom:!!contract.bom},masterScopes:contract.masterScopes||[],quality:contract.quality||[]};
}
export function destinationValues(projected,plan){
 const keep=new Set([...identityKeys,...plan.deliveryKeys]);
 const values=Object.fromEntries(Object.entries(projected.values).filter(([key])=>keep.has(key)));
 if(values.masterDataControl){const control=JSON.parse(values.masterDataControl),scopes=new Set(plan.masterScopes);control.active=Object.fromEntries(Object.entries(control.active||{}).filter(([scope])=>scopes.has(scope)));control.versions=(control.versions||[]).filter(row=>scopes.has(row.scope));values.masterDataControl=JSON.stringify(control);}
 if(values.canonicalQuality){const quality=JSON.parse(values.canonicalQuality);values.canonicalQuality=JSON.stringify(Object.fromEntries(Object.entries(quality).filter(([scope])=>plan.quality.includes(scope))));}
 return{revision:projected.revision,values};
}
