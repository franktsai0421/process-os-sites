import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {createRequire} from 'node:module';import {randomUUID,createHash} from 'node:crypto';
import {accessKeys} from '../public/process/access-policy.mjs';
const require=createRequire(import.meta.url);
const db=new DatabaseSync(':memory:'),objects=new Map();
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{success:true,results:db.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};},async batch(statements){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.all());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}},STATE_ARCHIVE:{async put(key,value){objects.set(key,Buffer.from(value));},async head(key){return objects.has(key)?{}:null;},async get(key){const b=objects.get(key);return b?{text:async()=>b.toString(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),body:new ReadableStream({start(c){c.enqueue(b);c.close();}})}:null;}}};
const load=require('./ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts'),accounts=load('app/api/user-access/route.ts');

// Exercise the still-supported legacy endpoints, with valid revision/snapshot input.
const report=[];
const photo=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'),photoId=createHash('sha256').update(photo).digest('hex');
for(const moduleId of ['iqc','routine-equipment']){
 const seed=require('./v3-quality-growth-fixture.cjs')(moduleId,[{id:photoId,bytes:photo.length}],1,1),cellModule=moduleId==='iqc'?'iqc':'equipment';
 const control=JSON.parse(seed.values[seed.key]);delete control.workflow;
 const users=[{id:'frank',name:'Synthetic owner',role:'admin',enabled:true},{id:'limited',name:'Synthetic limited',role:'staff',enabled:true,accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,false]))}];
 db.prepare('DELETE FROM shared_state').run();db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(JSON.stringify({...seed.values,[seed.key]:JSON.stringify(control),platformUsers:JSON.stringify(users)}),'synthetic');objects.set(seed.photoPrefix+photoId,photo);
 const route=load('app/api/'+moduleId+'/route.ts'),url='http://fixture/api/'+moduleId;
 async function cookie(id){const state=await core.readState(),user=JSON.parse(state.values.platformUsers).find(u=>u.id===id);return 'process_demo='+await core.demoSession(new Request('http://fixture'),id,false,user.authEpoch||0);}
 async function grant(ops){const state=await core.readState(),r=await accounts.POST(new Request('http://fixture/api/user-access',{method:'POST',headers:{Origin:'http://fixture',Cookie:await cookie('frank'),'Content-Type':'application/json'},body:JSON.stringify({action:'update-user',id:'limited',baseRevision:state.revision,changes:Object.fromEntries(accessKeys.filter(k=>k.startsWith(cellModule+'.')).map(k=>[k,ops.includes(k.split('.')[1])]))})}));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));}
 async function command(action,mutate){const before=await core.readState(),c=JSON.parse(before.values[seed.key]),version=c.versions.find(v=>v.status==='draft');
  const snapshot=structuredClone(moduleId==='iqc'?version.snapshot:Object.fromEntries(['equipment','groups','categories','subcategories'].map(k=>[k,version[k]])));if(mutate)mutate(snapshot);
  const r=await route.POST(new Request(url,{method:'POST',headers:{Origin:'http://fixture',Cookie:await cookie('limited'),'Content-Type':'application/json'},body:JSON.stringify({action,baseRevision:before.revision,versionId:version.id,versionRevision:version.revision,snapshot,partCode:'P1',nameVi:'New synthetic',assetCode:'G70',groupId:'g',unit:'支'})}));const body=await r.json();if(r.status!==200)assert.deepEqual(await core.readState(),before,'denial must not mutate');return{status:r.status,body};}
 const cases=[];
 for(const [ops,action]of [[['view'],'save'],[['view','save'],'save'],[['view','edit'],'save'],[['view','edit','submit'],'submit'],[['view','edit','save'],'submit'],[['view','edit'],moduleId==='iqc'?'createError':'create']]){
  await grant(ops);const r=await command(action);assert.equal(r.status,403,JSON.stringify(r));cases.push({ops,action,status:r.status,unchanged:true});
 }
 await grant(['view','edit','save']);
 const removed=await command('save',s=>{if(moduleId==='iqc')s.items[0].isDeleted=true;else s.equipment=[];});assert.equal(removed.status,403,JSON.stringify(removed));cases.push({action:'snapshot delete without delete grant',status:403,unchanged:true});
 const saved=await command('save',s=>{s[moduleId==='iqc'?'items':'equipment'][0][moduleId==='iqc'?'nameVi':'name']='Verified legacy save';});assert.equal(saved.status,200,JSON.stringify(saved));
 const reread=JSON.parse((await core.readState()).values[seed.key]).versions.find(v=>v.status==='draft');assert.equal(moduleId==='iqc'?reread.snapshot.items[0].nameVi:reread.equipment[0].name,'Verified legacy save');cases.push({action:'explicit edit+save persists',status:200,readback:true});
 report.push({moduleId,cases});
}
db.close();console.log(JSON.stringify({status:'PASS',report}));
