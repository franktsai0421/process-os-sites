// Read-only active equipment dependency. Select before immutable hydration;
// never pass this projection to the workflow parser or a save/backup encoder.
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const reference=value=>object(value)&&Object.keys(value).length===1&&object(value.__immutableBody)&&
  typeof value.__immutableBody.sha256==='string'&&/^[a-f0-9]{64}$/.test(value.__immutableBody.sha256)&&
  value.__immutableBody.key==='state-records/v1/'+value.__immutableBody.sha256+'.json';
const invalid=()=>{throw Error('EQUIPMENT_CATALOG_INVALID');};
function select(control,allowReferences=false){
  if(!object(control)||control.schemaVersion!==1||!Array.isArray(control.versions)||
    !Array.isArray(control.issues)||!object(control.reservedMarks))invalid();
  if(control.activeVersionId===null&&control.versions.length===0)
    return{schemaVersion:1,activeVersionId:null,versions:[],issues:control.issues,reservedMarks:{}};
  if(typeof control.activeVersionId!=='string'||!control.activeVersionId)invalid();
  const active=control.versions.filter(version=>object(version)&&version.id===control.activeVersionId);
  if(active.length!==1||active[0].status!=='approved')invalid();
  const version={id:active[0].id,status:'approved'};
  for(const field of ['equipment','groups','categories','subcategories','issues']){
    const value=active[0][field]??(field==='issues'?control.issues:['equipment','groups'].includes(field)?undefined:[]);
    if(!Array.isArray(value)&&!(allowReferences&&reference(value)))invalid();
    version[field]=value;
  }
  return{schemaVersion:1,activeVersionId:control.activeVersionId,versions:[version],issues:[],reservedMarks:{}};
}
export function projectEquipmentCatalog(key,raw){
  if(key!=='routineEquipmentControl')return undefined;
  return JSON.stringify(select(JSON.parse(raw),true));
}
export function equipmentCatalog(raw){
  // Missing module has always been a legal empty catalog in the existing GET.
  return select(raw===undefined?{schemaVersion:1,activeVersionId:null,versions:[],issues:[],reservedMarks:{}}:JSON.parse(raw));
}
