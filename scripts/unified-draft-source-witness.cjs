/* Bounded true Git-object witness; test-only, no object database writes. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
function createWitness(cache){
 assert(cache?.format==='PROCESS_OS_SOURCE_WITNESS_V1'&&Array.isArray(cache.objects),'Source witness format required');const objects=new Map();
 for(const entry of cache.objects){assert(['commit','tree','blob'].includes(entry.type)&&/^[a-f0-9]{40}$/.test(entry.oid)&&typeof entry.raw==='string','Source witness metadata invalid');assert(!objects.has(entry.oid),'Duplicate source witness object');const raw=Buffer.from(entry.raw,'base64');assert.equal(raw.toString('base64'),entry.raw,'Source witness base64 invalid');assert.equal(createHash('sha1').update(Buffer.from(entry.type+' '+raw.length+'\0')).update(raw).digest('hex'),entry.oid,'Source witness Git object mismatch');objects.set(entry.oid,{type:entry.type,raw});}
 const get=(oid,type)=>{const entry=objects.get(oid);assert(entry&&entry.type===type,'Missing bounded source witness object: '+oid);return entry.raw;};
 function tree(commit){const raw=get(commit,'commit'),first=raw.subarray(0,raw.indexOf(10)).toString();assert(/^tree [a-f0-9]{40}$/.test(first),'Source witness commit tree invalid');return first.slice(5);}
 function entries(oid){const raw=get(oid,'tree'),result=new Map();let position=0;
  while(position<raw.length){const space=raw.indexOf(32,position),nullAt=raw.indexOf(0,space);assert(space>position&&nullAt>space&&nullAt+21<=raw.length,'Source witness tree entry invalid');const mode=raw.subarray(position,space).toString(),name=raw.subarray(space+1,nullAt).toString();assert(!result.has(name),'Source witness duplicate tree name');result.set(name,{mode,oid:raw.subarray(nullAt+1,nullAt+21).toString('hex')});position=nullAt+21;}return result;
 }
 function node(commit,file){assert(typeof file==='string'&&file.split('/').every(part=>part&&part!=='.'&&part!=='..')&&!/[\\\\:]/.test(file),'Source witness path invalid');let oid=tree(commit);const parts=file.split('/');
  for(let index=0;index<parts.length;index++){const entry=entries(oid).get(parts[index]);if(!entry)return null;if(index===parts.length-1)return entry;assert.equal(entry.mode,'40000','Source witness path is not a tree');oid=entry.oid;}
 }
 function resolve(commit,file){const entry=node(commit,file);if(!entry)return null;assert(['100644','100755'].includes(entry.mode),'Source witness path is not a source blob');return entry.oid;}
 function runtimeChanges(current,prior){const changed=[];
  function walk(after,before,prefix){if(after?.oid===before?.oid)return;if(after?.mode==='40000'||before?.mode==='40000'){assert(!after||after.mode==='40000','Source witness changed file/tree kind');assert(!before||before.mode==='40000','Source witness changed file/tree kind');const next=after?entries(after.oid):new Map(),old=before?entries(before.oid):new Map();for(const name of new Set([...next.keys(),...old.keys()]))walk(next.get(name),old.get(name),prefix+'/'+name);}
   else if(/\.(?:[cm]?js|tsx?|html|css)$/.test(prefix)){assert(after,'Source witness removed runtime requires separate proof');changed.push(prefix);}
  }
  for(const prefix of ['lib','app','public/process'])walk(node(current,prefix),node(prior,prefix),prefix);return changed.sort((a,b)=>a<b?-1:a>b?1:0);
 }
 const historical=new Map();for(const entry of cache.historical||[]){assert(/^[a-f0-9]{40}$/.test(entry.ref)&&typeof entry.file==='string'&&(entry.blob===null||/^[a-f0-9]{40}$/.test(entry.blob)),'Bounded historical metadata invalid');const key=entry.ref+':'+entry.file;assert(!historical.has(key),'Duplicate bounded historical request');historical.set(key,{...entry});}
 function readHistorical(ref,file){const entry=historical.get(ref+':'+file);assert(entry&&entry.ref===ref&&entry.file===file,'Unknown bounded historical ref/path');assert.equal(resolve(ref,file),entry.blob,'Bounded historical commit/tree/blob mismatch');assert(entry.blob,'Known bounded historical path is absent');return Buffer.from(get(entry.blob,'blob'));}
 function attest(manifest){assert.equal(tree(manifest.source.commit),manifest.source.tree,'Source witness current tree mismatch');for(const target of Object.values(manifest.targets))assert.equal(tree(target.commit),target.tree,'Source witness named predecessor tree mismatch');for(const entry of manifest.current)assert.equal(resolve(manifest.source.commit,entry.file),entry.blob,'Source witness current blob mismatch');for(const entry of manifest.projections)assert.equal(resolve(manifest.targets[entry.target].commit,entry.file),entry.before.blob,'Source witness predecessor blob mismatch');for(const entry of manifest.added)assert.equal(resolve(manifest.targets[entry.absentFrom].commit,entry.file),null,'Source witness falsely claims an added file');return true;}
 return Object.freeze({tree,resolve,runtimeChanges,readHistorical,attest,count:objects.size});
}
module.exports=Object.freeze({createWitness});
