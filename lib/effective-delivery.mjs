// Storage-format-independent, read-only delivery. Apply before immutable body
// hydration and again at the delivery boundary for legacy inline/chunk formats.
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const fingerprint=value=>object(value)&&object(value.__immutableBody)
  ? 'ref:'+value.__immutableBody.key+':'+value.__immutableBody.sha256
  : JSON.stringify(value);
export function effectiveDeliveryValue(value){
  function visit(current){
    if(Array.isArray(current))return current.map(visit);
    if(!object(current))return current;
    let versions=current.versions;
    if(Array.isArray(versions)){
      if(typeof current.activeVersionId==='string')versions=versions.filter(row=>row?.id===current.activeVersionId);
      else if(object(current.active)){
        const active=new Map(Object.entries(current.active).map(([scope,body])=>[scope,fingerprint(body)]));
        versions=versions.filter(row=>object(row)&&row.status==='approved'&&active.has(row.scope)&&fingerprint(row.snapshot)===active.get(row.scope));
      }else versions=[];
    }
    const next={};
    for(const [key,child]of Object.entries(current)){
      if(key==='workflow'){next.workflow={};continue;}
      if(key==='workflowScopes'){next.workflowScopes=object(child)?Object.fromEntries(Object.keys(child).map(scope=>[scope,{}])):{};continue;}
      if(key==='moduleDraft')continue;
      next[key]=visit(key==='versions'&&Array.isArray(versions)?versions:child);
    }
    return next;
  }
  return visit(value);
}
export function effectiveDeliveryValues(values){
  return Object.fromEntries(Object.entries(values).map(([key,raw])=>[key,JSON.stringify(effectiveDeliveryValue(JSON.parse(raw)))]));
}
