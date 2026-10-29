import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {createRequire} from 'node:module';import {randomUUID,createHash} from 'node:crypto';
import {accessKeys} from '../public/process/access-policy.mjs';
const require=createRequire(import.meta.url);
const db=new DatabaseSync(':memory:'),objects=new Map();
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{success:true,results:db.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};},async batch(statements){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.all());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}},STATE_ARCHIVE:{async put(key,value){objects.set(key,Buffer.from(value));},async head(key){return objects.has(key)?{}:null;},async get(key){const b=objects.get(key);return b?{text:async()=>b.toString(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),body:new ReadableStream({start(c){c.enqueue(b);c.close();}})}:null;}}};
const load=require('./ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts'),accounts=load('app/api/user-access/route.ts');

const report=[];let sequence=0;
const photo=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'),photoId=createHash('sha256').update(photo).digest('hex');
for(const moduleId of ['iqc','fqc','routine-equipment','ipqc-ab']){
 const seed=require('./v3-quality-growth-fixture.cjs')(moduleId,[{id:photoId,bytes:photo.length}],1,1),cellModule=moduleId==='routine-equipment'?'equipment':moduleId;
 const users=[{id:'frank',name:'Synthetic owner',role:'admin',enabled:true},{id:'limited',name:'Synthetic limited',role:'staff',enabled:true,accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,false]))}];
 db.prepare('DELETE FROM shared_state').run();db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(JSON.stringify({...seed.values,platformUsers:JSON.stringify(users)}),'synthetic');objects.set(seed.photoPrefix+photoId,photo);
 const route=load('app/api/'+moduleId+'/workflow/route.ts');
 async function cookie(id){const state=await core.readState(),user=JSON.parse(state.values.platformUsers).find(u=>u.id===id);return 'process_demo='+await core.demoSession(new Request('http://fixture'),id,false,user.authEpoch||0);}
 async function call(method,id,body,query=''){const r=await route[method](new Request(seed.url+query,{method,headers:{Origin:'http://fixture',Cookie:await cookie(id),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return{status:r.status,body:await r.json()};}
 async function grant(ops){const state=await core.readState(),r=await accounts.POST(new Request('http://fixture/api/user-access',{method:'POST',headers:{Origin:'http://fixture',Cookie:await cookie('frank'),'Content-Type':'application/json'},body:JSON.stringify({action:'update-user',id:'limited',baseRevision:state.revision,changes:Object.fromEntries(accessKeys.filter(k=>k.startsWith(cellModule+'.')||moduleId==='fqc'&&['ab.view','equipment.view'].includes(k)).map(k=>[k,k.startsWith(cellModule+'.')?ops.includes(k.split('.')[1]):true]))})}));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));}
 async function command(id,action,extra={}){const read=await call('GET',id),flow=read.body.control.workflow;return call('POST',id,{command:{action,operationId:randomUUID(),clientId:'restore-audit-client',sequence:++sequence,generation:flow.generation,expectedRevision:flow.revision,...extra}});}
 await grant(['view','edit']);
 const add=await command('frank','apply',seed.creation('new'));assert.equal(add.status,200,JSON.stringify(add.body));
 const before=await call('GET','frank');
 let r=await command('limited','restore',{restoreSaveId:'save0'});assert.equal(r.status,403);assert.equal(r.body.error,'RESTORE_PERMISSION_REQUIRED');
 await grant(['view','edit','restore']);
 r=await command('limited','restore',{restoreSaveId:'save0'});assert.equal(r.status,403);assert.equal(r.body.error,'RESTORE_DELETE_PERMISSION_REQUIRED');
 assert.deepEqual((await call('GET','frank')).body.control.workflow.working,before.body.control.workflow.working);
 r=await call('GET','limited',undefined,'&restoreSaveId=save0');assert.equal(r.status,403);
 await grant(['view','edit','restore','delete']);
 r=await command('limited','restore',{restoreSaveId:'save0'});assert.equal(r.status,200,JSON.stringify(r.body));
 assert.notDeepEqual((await call('GET','frank')).body.control.workflow.working,before.body.control.workflow.working);
 report.push({moduleId,restoreWithoutGrant:403,restoreWithoutDelete:403,denialsPreservedData:true,explicitRestoreAndDelete:200});
}
// Additional shared adapters: explicit restore gate and successful authorized replay.
for(const [fixtureId,cellModule] of [['master-AB','ab'],['master-C','c'],['master-PROCESS','templates'],['authoring','editor'],['bom','bom'],['tooling','tooling']]){
 let seed;
 if(['bom','tooling'].includes(fixtureId)){
  const snapshot=fixtureId==='bom'?load('lib/bom-workflow.ts').emptyBom():load('lib/tooling.ts').emptyTooling();
  const flow=load('lib/shared-draft.ts').createSharedDraft(fixtureId,snapshot,null,randomUUID());flow.saves.push({id:'save0',content:structuredClone(snapshot),revision:0,actor:{id:'frank',name:'Owner',admin:true},at:'2026-10-29',contributors:{}});
  seed={api:fixtureId,url:'http://fixture/api/'+fixtureId+'/workflow?caseMetadata=1',values:{[fixtureId==='bom'?'bomMasterControl':'toolingMasterControl']:JSON.stringify({schemaVersion:1,activeVersionId:null,reservedCodes:{},versions:[{id:'shared-'+flow.generation,status:'draft',number:1,snapshot:structuredClone(snapshot),revision:1,history:[]}],workflow:flow})}};
 }else seed=require('./v3-master-permission-fixture.cjs')(fixtureId);
 const users=[{id:'frank',name:'Owner',role:'admin',enabled:true},{id:'limited',name:'Limited',role:'staff',enabled:true,accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,false]))}];
 db.prepare('DELETE FROM shared_state').run();db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(JSON.stringify({...seed.values,platformUsers:JSON.stringify(users)}),'synthetic');
 const route=load('app/api/'+seed.api+'/workflow/route.ts');
 async function cookie(id){const user=JSON.parse((await core.readState()).values.platformUsers).find(u=>u.id===id);return 'process_demo='+await core.demoSession(new Request('http://fixture'),id,false,user.authEpoch||0);}
 async function grant(restore){const state=await core.readState();const r=await accounts.POST(new Request('http://fixture/api/user-access',{method:'POST',headers:{Origin:'http://fixture',Cookie:await cookie('frank'),'Content-Type':'application/json'},body:JSON.stringify({action:'update-user',id:'limited',baseRevision:state.revision,changes:Object.fromEntries(accessKeys.filter(k=>k.startsWith(cellModule+'.')).map(k=>[k,['view','edit','delete','create',...(restore?['restore']:[])].includes(k.split('.')[1])]))})}));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));}
 async function read(){const r=await route.GET(new Request(seed.url,{headers:{Cookie:await cookie('limited')}}));assert.equal(r.status,200,fixtureId+' read');return r.json();}
 await grant(false);let current=await read();const before=await core.readState();
 async function restore(){const flow=current.control.workflow;const r=await route.POST(new Request(seed.url,{method:'POST',headers:{Origin:'http://fixture',Cookie:await cookie('limited'),'Content-Type':'application/json'},body:JSON.stringify({command:{action:'restore',operationId:randomUUID(),clientId:'additional-restore',sequence:++sequence,generation:flow.generation,expectedRevision:flow.revision,restoreSaveId:'save0'}})}));return {status:r.status,body:await r.json()};}
 let r=await restore();assert.equal(r.status,403,fixtureId+JSON.stringify(r));assert.equal(r.body.error,'RESTORE_PERMISSION_REQUIRED');assert.deepEqual(await core.readState(),before);
 await grant(true);current=await read();r=await restore();assert.equal(r.status,200,fixtureId+JSON.stringify(r));await read();report.push({moduleId:fixtureId,restoreWithoutGrant:403,denialPreservedData:true,explicitRestore:200});
}
const effects=(...args)=>JSON.parse(JSON.stringify(load('lib/draft-restore-access.ts').restoreEffects(...args)));
assert.deepEqual(effects({rows:[{id:'1',deleted:true}]},{rows:[{id:'1',deleted:false}]}),{create:true,delete:false});
assert.deepEqual(effects({rows:[{id:'1'},{id:'2'}]},{rows:[{id:'2'},{id:'1'}]}),{create:false,delete:false});
db.close();console.log(JSON.stringify({status:'PASS',report,restoreResurrectionAndReorder:true}));
