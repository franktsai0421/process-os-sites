// Semantic Local integration. Array positions never identify business records.
import {isDeepStrictEqual} from 'node:util';
export function mergeLocalRecords(base, daily, incoming, options = {}, trail = []) {
  const same = isDeepStrictEqual, record = (kind,b,d,s) => options.record?.({kind,path:trail,base:b,daily:d,incoming:s});
  if(same(daily,incoming))return daily;
  if(incoming===undefined){if(options.deleted?.(trail,'incoming')){record('explicit-incoming-delete',base,daily,incoming);return undefined;}return daily;}
  if(daily===undefined){if(base!==undefined&&options.deleted?.(trail,'daily')&&same(base,incoming))return undefined;return incoming;}
  if(Array.isArray(daily)&&Array.isArray(incoming)){
    const rows=[...daily,...incoming];
    const key=['id','code'].find(k=>rows.length&&rows.every(r=>r&&typeof r==='object'&&!Array.isArray(r)&&typeof r[k]==='string')&&[daily,incoming].every(a=>new Set(a.map(r=>r[k])).size===a.length));
    if(key){
      const b=new Map((Array.isArray(base)?base:[]).map(r=>[r[key],r])),d=new Map(daily.map(r=>[r[key],r])),s=new Map(incoming.map(r=>[r[key],r]));
      const order=same(base,incoming)?[...d.keys(),...s.keys()]:[...s.keys(),...d.keys()];
      return [...new Set(order)].map(id=>mergeLocalRecords(b.get(id),d.get(id),s.get(id),options,[...trail,{[key]:id}])).filter(v=>v!==undefined);
    }
    if(same(base,incoming))return daily;
    if(!same(base,daily))record('incoming-array-conflict',base,daily,incoming);
    return incoming;
  }
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  if(object(daily)&&object(incoming)){
    if(options.atomic?.(trail)){
      if(same(base,incoming))return daily;
      if(!same(base,daily))record('incoming-record-conflict',base,daily,incoming);
      return incoming;
    }
    const result={};for(const key of new Set([...Object.keys(daily),...Object.keys(incoming)])){const value=mergeLocalRecords(base?.[key],daily[key],incoming[key],options,[...trail,key]);if(value!==undefined)result[key]=value;}
    return result;
  }
  if(same(base,incoming))return daily;
  if(!same(base,daily))record('incoming-field-conflict',base,daily,incoming);
  return incoming;
}
