/* oxlint-disable typescript/no-require-imports -- 3020-only read-only evidence collector */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=process.argv[2];if(!root)throw Error('Evidence directory required');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
(async()=>{
 const result={at:new Date().toISOString(),requests:[],preservation:[]};
 async function get(host,route,user='admin'){const start=performance.now(),res=await fetch('http://'+host+':3020'+route,{headers:{'x-fixture-user':user}});const bytes=Buffer.from(await res.arrayBuffer());result.requests.push({host,route,status:res.status,ms:+(performance.now()-start).toFixed(1),bytes:bytes.length});assert.equal(res.status,200);return{bytes,data:res.headers.get('content-type')?.includes('json')?JSON.parse(bytes):null};}
 const list=await get('localhost','/api/web-feedback');assert.equal(list.data.issues.length,2);const primary=await get('127.0.0.1','/api/web-feedback');assert.equal(primary.data.issues.length,0);
 const history=await get('localhost','/api/web-feedback?action=handoffs');assert.equal(history.data.handoffs.length,1);const handoff=history.data.handoffs[0];
 const download=await get('localhost','/api/web-feedback?action=download&id='+handoff.id);assert.equal(hash(download.bytes),hash(fs.readFileSync(path.join(root,'browser-export.zip'))));result.zipRetained={id:handoff.id,hash:hash(download.bytes),equalBeforeRestart:true};
 for(const user of ['employee','admin'])for(let i=0;i<3;i++)await get('localhost','/api/web-feedback?action=capabilities',user);
 for(const [name,host] of [['primary','127.0.0.1'],['synthetic','localhost']]){
  const snapshot=await get(host,'/fixture-checkpoint');fs.writeFileSync(path.join(root,name+'-after.json'),snapshot.bytes);
  const before=JSON.parse(fs.readFileSync(path.join(root,name+'-before.json'))),after=snapshot.data;
  const keys=[...new Set([...Object.keys(before.values),...Object.keys(after.values)])];
  const compare=keys.map(key=>({key,equal:hash(before.values[key]||'')===hash(after.values[key]||'')}));result.preservation.push({name,beforeRevision:before.revision,afterRevision:after.revision,keys:compare});
  assert(compare.every(k=>k.equal),'Unexpected business difference: '+JSON.stringify(compare.filter(k=>!k.equal)));
 }
 fs.writeFileSync(path.join(root,'live-preservation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{fs.writeFileSync(path.join(root,'live-check-failure.log'),e.stack);console.error(e);process.exitCode=1;});
