// Display intent only; the server independently checks the destination cell.
export const deliveryTabs=Object.freeze({AB:'ab',C:'c',bom:'bom','line-admin':'lines','process-master':'templates',users:'users','quality-fqc':'fqc','quality-iqc':'iqc','quality-ipqc-ab':'ipqc-ab','quality-ipqc-c':'ipqc-c','quality-mold-equipment':'tooling','quality-routine-reports':'routine-reports','quality-routine-equipment':'equipment'});
export const deliveryViews=Object.freeze({dashboard:'dashboard',player:'player',dispatch:'dispatch',productStatus:'status',editor:'editor',approval:'approval','quality-dashboard':'quality-dashboard','quality-search':'quality-search','quality-reports':'quality-reports','quality-inspections':'routine','quality-fpy':'fpy'});
export function deliveryCandidate(search){
 const q=new URLSearchParams(search);
 for(const key of ['system','view','dataTab'])if(q.getAll(key).length>1)throw Error('INVALID_DESTINATION');
 const preferredSystem=q.get('system')==='quality'?'quality':'process',view=q.get('view');
 if(!view)return{preferredSystem,explicit:false};
 if(view==='data'){
  const tab=q.get('dataTab');if(tab&&!Object.hasOwn(deliveryTabs,tab))throw Error('INVALID_DESTINATION');
  return{preferredSystem,explicit:true,view,dataTab:tab||null,module:tab?deliveryTabs[tab]:null};
 }
 if(!Object.hasOwn(deliveryViews,view))throw Error('INVALID_DESTINATION');
 return{preferredSystem,explicit:true,view,dataTab:null,module:deliveryViews[view]};
}
export function destinationKey(destination){return destination.view==='data'?'data:'+destination.dataTab:destination.view;}
export function destinationURL(current,destination){
 const url=new URL(current);url.searchParams.set('system',destination.system);url.searchParams.set('view',destination.view);
 if(destination.view==='data'&&destination.dataTab)url.searchParams.set('dataTab',destination.dataTab);else url.searchParams.delete('dataTab');
 if(destination.view!=='player'){url.searchParams.delete('line');url.searchParams.delete('stage');}
 return url;
}
