import {snapshotTables} from '../lib/snapshot-d1-r2.mjs';
import {sha256} from '../lib/snapshot-contract.mjs';
const encode=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));
function fakeDb(initial={}){
  const tables=Object.fromEntries(Object.keys(snapshotTables).map(table=>[table,structuredClone(initial[table]||[])]));let writes=0;
  function rows(sql){const name=sql.match(/FROM\s+"?([a-z_]+)"?/i)?.[1];if(!tables[name])throw Error('Unexpected fake SQL');return tables[name];}
  return {tables,get writes(){return writes;},prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this;},async first(){return {count:rows(sql).length};},async all(){return {success:true,results:structuredClone(rows(sql))};}};},async batch(statements){return statements.map(statement=>{if(/^INSERT/i.test(statement.sql)){writes++;const table=statement.sql.match(/INTO "([a-z_]+)"/)[1],columns=snapshotTables[table];tables[table].push(Object.fromEntries(columns.map((column,index)=>[column,statement.values[index]])));return {success:true,results:[]};}const value=rows(statement.sql);if(statement.sql.includes('SUM(')&&!statement.sql.includes('ORDER BY')){return {success:true,results:[{count:value.length,bytes:value.reduce((sum,row)=>sum+Object.values(row).reduce((n,v)=>n+encode(String(v)).length,0),0)}]};}return {success:true,results:structuredClone(value)};});}};
}
function fakeBucket(initial=[]){
  const objects=new Map(initial.map(object=>[object.key,{...object,data:object.data.slice(),etag:object.etag||'fixture-etag'}]));
  let writes=0,lists=0,largestRange=0;
  const api={objects,get writes(){return writes;},get lists(){return lists;},get largestRange(){return largestRange;},corruptReadback:false,onGet:null,
    async list({cursor}){lists++;const items=[...objects.values()].sort((a,b)=>a.key.localeCompare(b.key,'en')),start=Number(cursor||0),page=items.slice(start,start+2);return {objects:page.map(({data,...object})=>({...object,size:data.length})),truncated:start+2<items.length,cursor:String(start+2)};},
    async get(key,options={}){api.onGet?.(key);const object=objects.get(key);if(!object)return null;const metadata={key,size:object.data.length,etag:object.etag,httpMetadata:object.httpMetadata||{},customMetadata:object.customMetadata||{}};if(options.onlyIf?.etagMatches&&options.onlyIf.etagMatches!==object.etag)return metadata;let data=object.data;if(options.range){largestRange=Math.max(largestRange,options.range.length);data=data.slice(options.range.offset,options.range.offset+options.range.length);}else data=data.slice();if(api.corruptReadback&&writes&&data.length)data[0]^=1;return {...metadata,body:new Blob([data]).stream()};},
    async head(key){const object=objects.get(key);return object?{size:object.data.length,etag:object.etag,httpMetadata:object.httpMetadata,customMetadata:object.customMetadata}:null;},
    async put(key,data,metadata){writes++;objects.set(key,{key,data:data.slice(),...metadata,etag:'local-'+writes});},
    async createMultipartUpload(key,metadata){const parts=[];return {async uploadPart(partNumber,data){parts.push(data.slice());return {partNumber,etag:'part'+partNumber};},async complete(){const bytes=new Uint8Array(parts.reduce((sum,p)=>sum+p.length,0));let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}await api.put(key,bytes,metadata);},async abort(){}};},
  };return api;
}
function memoryPackage(){let manifest,aborted=false;const chunks=new Map();return {scope:'private-snapshot',chunks,get completed(){return manifest;},get aborted(){return aborted;},async writeChunk(id,data){chunks.set(id,data.slice());},async complete(value){manifest=value;},async abort(){aborted=true;},async manifest(){return manifest;},async readChunk(id){return chunks.get(id);}};}
function stage(){const chunks=new Map();let receipt,aborted=false;return {async write(id,data){chunks.set(id,data.slice());},async read(id){return chunks.get(id);},async complete(value){receipt=value;},async abort(){aborted=true;},get receipt(){return receipt;},get aborted(){return aborted;}};}
async function fixture(){
  const image=new Uint8Array(2*1024*1024+17);image.set([137,80,78,71,13,10,26,10]);const imageHash=await sha256(image),imageKey='iqc/photos/'+imageHash;
  const child=encode({platformUsers:JSON.stringify([{id:'fixture-user',role:'staff',password:'FIXTURE_PASSWORD',passwordHash:'FIXTURE_VERIFIER'}]),photo:'/api/iqc/photo?id='+imageHash,important:'保留 / Giữ lại'});
  const childHash=await sha256(child),childKey='state-records/v1/'+childHash+'.json';
  const root=encode({record:{__immutableBody:{key:childKey,sha256:childHash}},platformUsers:JSON.stringify([{id:'fixture-user',role:'staff',passwordHash:'FIXTURE_VERIFIER'}])});
  const rootHash=await sha256(root),rootKey='snapshots/'+rootHash+'.json';
  const envelope=JSON.stringify({__processR2:{key:rootKey,sha256:rootHash},platformUsers:JSON.stringify([{id:'fixture-user',role:'staff',password:'FIXTURE_PASSWORD'}])});
  const db=fakeDb({shared_state:[{id:1,revision:7,values:envelope,updated_at:'fixture-time'}],state_backups:[{id:'history',revision:6,values:envelope,reason:'保留歷史',actor:'fixture-user',created_at:'fixture-time'}],web_feedback_store:[{id:1,revision:2,payload:'{"issues":[],"attachments":[],"batches":[],"handoffs":[]}'}]});
  const bucket=fakeBucket([{key:imageKey,data:image,httpMetadata:{contentType:'image/png'},customMetadata:{label:'fixture'}},{key:childKey,data:child,httpMetadata:{contentType:'application/json'}},{key:rootKey,data:root,httpMetadata:{contentType:'application/json'}}]);
  return {db,bucket,childKey,rootKey,imageKey};
}

export {fakeDb,fakeBucket,memoryPackage,stage,fixture};
