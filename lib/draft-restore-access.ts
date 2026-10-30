import {can, type State} from './process-state';
import {DraftConflict} from './shared-draft';
import {accessKeys, moduleForURL} from '../public/process/access-policy.mjs';

// Compare business content after the adapter applies its tombstone/provenance
// rules. Reordering stable IDs is not a creation/deletion; resurrection is.
export function restoreEffects(before:unknown, after:unknown) {
  const effects={create:false,delete:false};
  const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const deleted=(v:unknown)=>object(v)&&(v.isDeleted===true||v.deleted===true);
  const key=(v:unknown,i:number)=>{if(!object(v))return JSON.stringify(v);const id=v.id??v.code??v.checkNo;return typeof id==='string'||typeof id==='number'?String(id):String(i);};
  function walk(a:unknown,b:unknown){
    if(Array.isArray(a)&&Array.isArray(b)){
      const old=new Map(a.map((v,i)=>[key(v,i),v])),next=new Map(b.map((v,i)=>[key(v,i),v]));
      for(const [id,v] of old){if(!next.has(id)){if(!deleted(v))effects.delete=true;}else walk(v,next.get(id));}
      for(const [id,v] of next)if(!old.has(id)&&!deleted(v))effects.create=true;
    }else if(object(a)&&object(b)){
      if(!deleted(a)&&deleted(b))effects.delete=true;
      if(deleted(a)&&!deleted(b))effects.create=true;
      for(const name of new Set([...Object.keys(a),...Object.keys(b)])){
        // Map-shaped collections (e.g. per-product content) must be covered too.
        if(!(name in a)){if(object(b[name])||Array.isArray(b[name])&&b[name].length)effects.create=true;}
        else if(!(name in b)){if(object(a[name])||Array.isArray(a[name])&&a[name].length)effects.delete=true;}
        else walk(a[name],b[name]);
      }
    }else if(Array.isArray(a)!==Array.isArray(b)||object(a)!==object(b)){
      if(Array.isArray(a)&&a.length||object(a))effects.delete=true;
      if(Array.isArray(b)&&b.length||object(b))effects.create=true;
    }
  }
  walk(before,after);return effects;
}

export async function restoreAllowed(request:Request,state:State){
  const moduleId=moduleForURL(request.url);
  return !!moduleId&&accessKeys.includes(moduleId+'.restore')&&await can(request,state,moduleId+'.view')&&await can(request,state,moduleId+'.edit')&&await can(request,state,moduleId+'.restore');
}
export async function assertRestoreAccess(request:Request,state:State,before:unknown,after:unknown){
  if(!await restoreAllowed(request,state))throw new DraftConflict('RESTORE_PERMISSION_REQUIRED',403);
  const moduleId=moduleForURL(request.url)!,effects=restoreEffects(before,after);
  for(const op of ['create','delete'] as const)if(effects[op]&&accessKeys.includes(moduleId+'.'+op)&&!await can(request,state,moduleId+'.'+op))throw new DraftConflict(op==='delete'?'RESTORE_DELETE_PERMISSION_REQUIRED':'RESTORE_CREATE_PERMISSION_REQUIRED',403);
  return effects;
}
