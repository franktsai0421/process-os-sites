// Optional wire representation only. Expand each live alias to its own mutable
// form value; never make cancellation/edit state share another version's body.
(() => {
 const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 function workflow(payload){
  if(!object(payload))throw Error('INVALID_QUALITY_READ_RESPONSE');
  if(payload.wireVersion===undefined)return payload;
  if(payload.wireVersion!==1||!object(payload.liveContent))throw Error('INVALID_QUALITY_READ_RESPONSE');
  const live=payload.liveContent;
  function expand(value){
   if(object(value)&&Object.keys(value).length===1&&typeof value.__liveContent==='string'){
    const [key,field,...extra]=value.__liveContent.split('#');if(extra.length||!Object.hasOwn(live,key)||field&&(!object(live[key])||!Object.hasOwn(live[key],field)))throw Error('INVALID_QUALITY_READ_RESPONSE');
    return JSON.parse(JSON.stringify(field?live[key][field]:live[key]));
   }
   if(Array.isArray(value))return value.map(expand);if(object(value))return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,expand(child)]));return value;
  }
  const {wireVersion:_wire,liveContent:_live,...body}=payload;return expand(body);
 }
 window.expandQualityReadPayload=value=>{
  if(!object(value)||value.qualityReadWire===undefined)return value;
  if(value.qualityReadWire!==1||!object(value.payload))throw Error('INVALID_QUALITY_READ_RESPONSE');
  if(value.module==='C')return workflow(value.payload);
  if(value.module!=='AB'||!object(value.payload.control)||!Array.isArray(value.scopes))throw Error('INVALID_QUALITY_READ_RESPONSE');
  const seen=new Set(),scopes=value.scopes.map(row=>{if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||seen.has(row[0]))throw Error('INVALID_QUALITY_READ_RESPONSE');seen.add(row[0]);const expanded=workflow(row[1]);if(!object(expanded.control))throw Error('INVALID_QUALITY_READ_RESPONSE');return[row[0],expanded.control];});
  const control={...value.payload.control,scopes:Object.fromEntries(scopes)};
  if(Object.hasOwn(value,'moduleDraft')){const expanded=workflow(value.moduleDraft);if(!object(expanded.control))throw Error('INVALID_QUALITY_READ_RESPONSE');control.moduleDraft=expanded.control;}
  return{...value.payload,control};
 };
})();
