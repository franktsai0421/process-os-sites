// Explicit photo-reference contexts. A bare digest is never a global rewrite.
export const photoStateModules=Object.freeze({iqcMasterControl:'iqc',ipqcABMasterControl:'ipqc-ab',ipqcCMasterControl:'ipqc-c',routineEquipmentControl:'routine-equipment',routineFqcControl:'routine-fqc',toolingMasterControl:'tooling'});
const fail=(v,c)=>{if(!v)throw Error(c);},named=k=>k.match(/([a-f0-9]{64})$/)?.[1];
// These are the six workflow adapters' actual photo fields, not arbitrary ids.
const photoCollections=new Set(['photos','mediaItems','standardPhotos','methodPhotos']);
export function photoContextForField(context,key){if(!context)return null;return{...context,module:key==='photoId'?'routine-equipment':photoStateModules[key]||context.module,entry:key==='photoId',collection:photoCollections.has(key)};}
function idPlan(context,id){if(!/^[a-f0-9]{64}$/.test(id||''))return;const modules=Array.isArray(context.module)?context.module:[context.module].filter(Boolean);if(!modules.length)return;const matches=modules.map(m=>context.plans.get(m+'/photos/'+id));if(matches.every(p=>!p))return;fail(matches.every(Boolean)&&new Set(matches.map(p=>p.newKey.slice(p.newKey.lastIndexOf('/')+1))).size===1,'PHOTO_COPY_REFERENCE_CONTEXT_CONFLICT');return matches[0];}
export function explicitPhotoPlan(context,value){
 const keys=[];let addressed=false;
 if(typeof value.key==='string'&&/^(?:(?:iqc|ipqc-ab|ipqc-c|routine-equipment|routine-fqc|tooling)\/photos|company-assets\/objects|delivery\/media)\/[a-f0-9]{64}$/.test(value.key)){addressed=true;keys.push(value.key);}
 for(const k of ['url','src'])if(typeof value[k]==='string'){addressed=true;const u=value[k].match(/^\/api\/(iqc|ipqc-ab|ipqc-c|routine-equipment|routine-fqc|tooling)\/photo\?id=([a-f0-9]{64})$/),media=value[k].match(/^\/api\/state-media\?id=([a-f0-9]{64})$/);if(u)keys.push(u[1]+'/photos/'+u[2]);if(media)keys.push('delivery/media/'+media[1]);}
 fail(new Set(keys).size<=1,'PHOTO_COPY_REFERENCE_CONTEXT_CONFLICT');
 if(addressed)return keys.length?context.plans.get(keys[0]):undefined;
 if(context.entry&&typeof value.id==='string')return idPlan(context,value.id);
}
export function rewritePhotoValue(value,context,depth=0){
 if(!context)return value;fail(depth<=48,'SNAPSHOT_JSON_DEPTH');
 if(Array.isArray(value))return value.map(v=>rewritePhotoValue(v,{...context,entry:context.collection===true,collection:false},depth+1));
 if(value&&typeof value==='object'){
  const plan=explicitPhotoPlan(context,value),out={};for(const [key,v]of Object.entries(value)){fail(!['__proto__','constructor','prototype'].includes(key),'SNAPSHOT_JSON_KEY');out[key]=rewritePhotoValue(v,photoContextForField(context,key),depth+1);}
  if(plan){if(value.key===plan.oldKey)out.key=plan.newKey;if(value.id===named(plan.oldKey))out.id=named(plan.newKey);if(Object.hasOwn(value,'sha256')){fail(value.sha256===plan.oldSha256,'PHOTO_COPY_REFERENCE_CHECKSUM');out.sha256=plan.sha256;}for(const k of ['size','bytes'])if(Object.hasOwn(value,k)){fail(value[k]===plan.oldBytes,'PHOTO_COPY_REFERENCE_SIZE');out[k]=plan.bytes;}}
  return out;
 }
 if(typeof value!=='string')return value;
 if(context.module&&context.onBinding)context.onBinding(context.module,value);
 if(context.entry){const p=idPlan(context,value);if(p)return named(p.newKey);}
 if(/^[[{]/.test(value.trimStart())){fail(new TextEncoder().encode(value).length<=8*1024**2,'SNAPSHOT_JSON_LIMIT');let parsed;try{parsed=JSON.parse(value);}catch{return value;}return JSON.stringify(rewritePhotoValue(parsed,context,depth+1));}
 return value;
}
