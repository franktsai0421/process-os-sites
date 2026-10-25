// Compiled worker, ephemeral D1/R2, synthetic actors only; no hosted requests.
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {accessKeys} from '../public/process/access-policy.mjs';
const require=createRequire(import.meta.url),origin='https://bootstrap.synthetic.invalid';
const secret='synthetic-integration-session-only',tests=[];
let fixture,stage='setup';
const report={status:'PENDING',tests,realData:false,realCredentials:false,externalNetwork:false};
const hash=value=>createHash('sha256').update(value).digest('hex');
function networkCodes(error,depth=0){if(!error||depth>4)return [];return [...(/^[A-Z_0-9]+$/.test(error.code||'')?[error.code]:[]),...networkCodes(error.cause,depth+1),...(Array.isArray(error.errors)?error.errors.flatMap(e=>networkCodes(e,depth+1)):[])];}
function setupFailure(error){return [error,error?.cause,error?.cause?.cause].filter(Boolean).map(e=>({type:e.constructor?.name,message:String(e.message||'').replaceAll(secret,'[synthetic redacted]').slice(0,250)}));}
async function check(name,fn){stage=name;await fn();tests.push(name);}
try{
 stage='create compiled fixture';fixture=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:secret,DEMO_LOGIN_ENABLED:'false'}});
 stage='get synthetic bucket';
 const bucket=await fixture.mf.getR2Bucket('STATE_ARCHIVE');
 const load=require('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE:bucket}),records=load('lib/state-records.ts');
 const only=(id,cells)=>({id,name:id,role:'staff',enabled:true,authMode:'platform',authEpoch:1,accessOverrides:Object.fromEntries(accessKeys.map(key=>[key,cells.includes(key)]))});
 const users=[{id:'frank',name:'Synthetic owner',role:'admin',primary:true,enabled:true,authMode:'platform',authEpoch:1},only('player',['player.view']),only('quality',['iqc.view']),only('editor',['editor.view']),only('denied',[])];
 const image=new Uint8Array([1,2,3]),id='a'.repeat(64),version=hash(image),hidden='b'.repeat(64);
 const catalog=line=>({products:[{code:line+'1',name:line,category:line,line,stages:[line+'-CUT'],privateField:'not-runtime'}],lines:[{code:line,name:line,stages:[{code:line+'-CUT',name:'Cut'}]}]});
 const values={platformUsers:JSON.stringify(users),backupSettings:JSON.stringify({enabled:false}),masterDataControl:JSON.stringify({active:{AB:catalog('A'),C:catalog('C'),PROCESS:{'A-CUT':[{media:'asset:'+id}]}},versions:[]}),processMasterData:JSON.stringify({'A-CUT':[{media:'asset:'+id}]}),bomOverrides:JSON.stringify({replaceAll:true,data:{A1:[]}}),dispatchBoard:JSON.stringify({A:['A1'],B:[],C:[]}),canonicalQuality:JSON.stringify({iqc:{visible:'yes'},fqc:{media:'asset:'+hidden}}),iqcMasterControl:JSON.stringify({activeVersionId:'now',versions:[{id:'now',status:'approved',snapshot:{name:'current'}},{id:'old',status:'superseded',snapshot:{name:'secret old'}}],workflow:{working:{name:'secret draft'},cases:[],saves:[],receipts:{}}})};
 stage='encode synthetic immutable fixture';const raw=await records.encodeRecordValues(bucket,values);
 stage='seed synthetic D1';
 await fixture.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,498,?,?)').bind(raw,'synthetic').run();
 stage='seed synthetic image';await bucket.put('canonical-images/'+id+'/'+version+'.webp',image,{customMetadata:{sourceSha256:id,webSha256:version}});
 const signed=(actor='player',epoch=1,expires=Date.now()+600000)=>{const payload=Buffer.from(JSON.stringify({version:2,id:actor,sessionType:'platform',authEpoch:epoch,expires,nonce:'synthetic-integration'})).toString('base64');return 'process_demo='+payload+'.'+createHmac('sha256',secret).update(payload).digest('hex');};
 const request=(path,cookie=signed(),method='GET')=>fixture.mf.dispatchFetch(origin+path,{method,headers:{Connection:'close',...(cookie?{Cookie:cookie}:{})}});
 await check('compiled bootstrap rejects anonymous, expired, wrong epoch and disabled cells',async()=>{
  for(const cookie of ['',signed('player',2),signed('player',1,Date.now()-1)])assert.equal((await request('/api/process-bootstrap',cookie)).status,401);
  assert.equal((await request('/api/process-bootstrap',signed('denied'))).status,403);
 });
 await check('normal player receives approved runtime dependencies without full private seeds, drafts or quality data',async()=>{
  const r=await request('/api/process-bootstrap');assert.equal(r.status,200);const body=await r.json();
  assert.equal(body.identity.id,'player');assert.equal(body.deliveryProjection,true);assert.deepEqual(body.catalog.loadedScopes,['AB','C']);
  assert.equal(body.catalog.imported.products.length,2);assert(!JSON.stringify(body.catalog).includes('privateField'));
  assert(!body.values.iqcMasterControl);assert.deepEqual(Object.keys(JSON.parse(body.values.masterDataControl).active),['PROCESS']);
  assert.deepEqual(body.writableKeys,['dispatchBoard']);
  for(const file of ['imported-data.js','line-process-data.js','line-c-master.js'])assert.equal((await request('/process/data/'+file)).status,403);
 });
 await check('quality actor receives own current scope only and owner still uses the same normal session contract',async()=>{
  const r=await request('/api/process-bootstrap',signed('quality'));assert.equal(r.status,200);const body=await r.json();
  assert.deepEqual(body.catalog.loadedScopes,[]);assert(!body.values.masterDataControl);assert(!JSON.stringify(body).includes('secret draft'));assert(!JSON.stringify(body).includes('secret old'));
  assert.deepEqual(Object.keys(JSON.parse(body.values.canonicalQuality)),['iqc']);
  assert.equal((await request('/api/process-bootstrap',signed('frank'))).status,200);
 });
 await check('owner first load and reload select purpose fields; staff cannot request another module',async()=>{
  for(let iteration=0;iteration<2;iteration++){
   const q=await request('/api/process-bootstrap?view=data&dataTab=quality-iqc',signed('frank'));assert.equal(q.status,200);const body=await q.json();assert.equal(body.destination.key,'data:quality-iqc');assert.deepEqual(body.catalog.loadedScopes,[]);assert(!body.values.masterDataControl);assert(!body.values.dispatchBoard);assert.deepEqual(Object.keys(JSON.parse(body.values.canonicalQuality)),['iqc']);
  }
  const home=await request('/api/process-bootstrap?view=dashboard',signed('frank'));assert.equal(home.status,200);const h=await home.json();assert(!h.values.iqcMasterControl);assert.deepEqual(h.catalog.imported.bom,{});
  const ab=await request('/api/process-bootstrap?view=data&dataTab=AB',signed('frank'));assert.equal(ab.status,200);const a=await ab.json();assert.deepEqual(a.catalog.loadedScopes,['AB']);assert.deepEqual(Object.keys(JSON.parse(a.values.masterDataControl).active),['AB']);
  assert.equal((await request('/api/process-bootstrap?view=data&dataTab=quality-iqc',signed('player'))).status,403);
  assert.equal((await request('/api/process-bootstrap?view=editor',signed('quality'))).status,403);
  assert.equal((await request('/api/process-bootstrap?view=player&view=editor',signed('frank'))).status,400);
 });
 await check('actual visible canonical reference authorizes bytes, unrelated module reference does not',async()=>{
  const r=await request('/api/canonical-assets?id='+id+'&version='+version);assert.equal(r.status,200);assert.equal(hash(new Uint8Array(await r.arrayBuffer())),version);
  assert.equal((await request('/api/canonical-assets?id='+id+'&version='+version,signed('quality'))).status,403);
  assert.equal((await request('/api/canonical-assets?id='+hidden+'&version='+version,signed('quality'))).status,403);
 });
 await check('legacy inline and non-body record aggregates retain active-only delivery and dynamic editor image ACL',async()=>{
  const legacy={...values,iqcMasterControl:JSON.stringify({activeVersionId:'now',versions:[{id:'now',status:'approved',snapshot:{name:'current'}},{id:'draft',status:'draft',snapshot:{secret:'unadopted draft'}},{id:'old',status:'superseded',snapshot:{secret:'unadopted history'}}],moduleDraft:{secret:'module draft'}}),'processEditor:legacy':JSON.stringify({image:'asset:'+hidden})};
  const plainEnvelope={__processRecords:{version:1,values:{}}};
  for(const[key,text]of Object.entries(legacy)){const sha256=hash(text),ref={key:'state-records/v1/'+sha256+'.json',sha256};await bucket.put(ref.key,text);plainEnvelope.__processRecords.values[key]=ref;}
  await bucket.put('canonical-images/'+hidden+'/'+version+'.webp',image,{customMetadata:{sourceSha256:hidden,webSha256:version}});
  try{for(const representation of [JSON.stringify(legacy),JSON.stringify(plainEnvelope)]){
   await fixture.db.prepare('UPDATE shared_state SET "values"=?').bind(representation).run();
   const r=await request('/api/process-bootstrap',signed('quality'));assert.equal(r.status,200);const body=await r.json();assert.deepEqual(JSON.parse(body.values.iqcMasterControl).versions.map(v=>v.id),['now']);assert(!JSON.stringify(body).includes('secret'));
   const path='/api/canonical-assets?id='+hidden+'&version='+version;
   const editor=await request(path,signed('editor'));assert.equal(editor.status,200);assert.equal(hash(new Uint8Array(await editor.arrayBuffer())),version);
   assert.equal((await request(path,signed('quality'))).status,403);assert.equal((await request(path,signed('player'))).status,403);
   assert.equal((await fixture.db.prepare('SELECT "values" v FROM shared_state').first()).v,representation,'GETs retain original state');
  }}finally{await fixture.db.prepare('UPDATE shared_state SET "values"=?').bind(raw).run();}
 });
 await check('revocation between page reads rejects next read and cannot modify business state',async()=>{
  assert.equal((await fixture.db.prepare('SELECT "values" v FROM shared_state').first()).v,raw);
  const changed={...values,platformUsers:JSON.stringify(users.map(user=>user.id==='player'?{...user,authEpoch:2}:user))};
  await fixture.db.prepare('UPDATE shared_state SET revision=499,"values"=?').bind(await records.encodeRecordValues(bucket,changed)).run();
  assert.equal((await request('/api/process-bootstrap')).status,401);
  assert.equal((await fixture.db.prepare('SELECT revision FROM shared_state').first()).revision,499);
 });
 report.status='PASS_COMPILED_INTEGRATED_BOOTSTRAP';report.buildEntrySha256=fixture.buildEntrySha256;
}catch(error){report.status='FAIL_COMPILED_INTEGRATED_BOOTSTRAP';report.failedStage=stage;report.errorType=error.constructor.name;report.networkCodes=networkCodes(error);if(stage==='create compiled fixture')report.setupFailure=setupFailure(error);report.frames=String(error.stack||'').split('\n').slice(1,4).map(line=>line.match(/([\w.-]+\.(?:mjs|cjs|js|ts):\d+:\d+)/)?.[1]||'external');if(typeof error.actual==='number')report.actual=error.actual;if(typeof error.expected==='number')report.expected=error.expected;}
finally{if(fixture)await fixture.close();report.disposed=true;}
console.log(JSON.stringify(report));process.exitCode=report.status.startsWith('PASS_')?0:1;
