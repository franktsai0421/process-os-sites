/* Repository-relative isolated regression, no server/browser. */
process.chdir(require('node:path').resolve(__dirname,'..'));
const path=require('node:path');process.env.IPQCC_OPERATION_SOURCE_ROOT=process.env.IPQCC_OPERATION_SOURCE_ROOT||path.resolve(__dirname,'..');
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),{fixture,json}=require('./ipqc-ab-entry-fixture.cjs');
const insert=(collection,value)=>({op:'insert',path:[collection],value});
const empty={AB:{products:[],lines:[],categoryGroups:[]},C:{products:[],lines:[],categoryGroups:[]},PROCESS:{}};
const master={active:json(empty),versions:Object.entries(empty).map(([scope,snapshot])=>({id:'initial-empty-'+scope,scope,number:1,status:'approved',snapshot,revision:1,creatorId:'fixture',creatorName:'Synthetic initialization',createdAt:'synthetic',updatedAt:'synthetic',history:[]}))};
(async()=>{const h=await fixture({masterDataControl:JSON.stringify(master),processMasterData:'{}'}),checks=[],timings=[];const record=x=>checks.push(x);try{
 await h.begin('master','editor',200,'&scope=AB');
 await h.command('master','apply',{patches:[insert('lines',{id:'A',code:'A',name:'A',stages:[{id:'stage',code:'A-CUT',name:'Cut'}]}),insert('categoryGroups',{id:'g',line:'A',name:'G',defaultStages:['A-CUT']})]},'editor',200,'&scope=AB');await h.promote('master','&scope=AB');
 await h.begin('master','editor',200,'&scope=AB');await h.command('master','apply',{patches:[insert('products',{id:'p',code:'P100',name:'Product',line:'A',category:'G',routeMode:'group',stages:['A-CUT'],specification:'10',unit:'PCS'})]},'editor',200,'&scope=AB');await h.promote('master','&scope=AB');
 await h.begin('routine-equipment');
 await h.command('routine-equipment','apply',{patches:[insert('categories',{id:'cat',name:'Category'}),insert('subcategories',{id:'sub',categoryId:'cat',name:'Sub'}),insert('groups',{id:'eqg',categoryId:'cat',subcategoryId:'sub',name:'Group'})]});
 await h.command('routine-equipment','apply',{patches:[insert('equipment',{id:'valid-tool',assetCode:'FX900',name:'Tool',groupId:'eqg',spec:'150 mm',unit:'支',enabled:true,confirmed:true,calibrationMethod:'none',calibratedAt:'',expiresAt:''})]});await h.command('routine-equipment','apply',{patches:Array.from({length:200},(_,i)=>insert('equipment',{id:'extra-tool-'+i,assetCode:'EX'+i,name:'Tool '+i,groupId:'eqg',spec:'150 mm',unit:'支',enabled:true,confirmed:true,calibrationMethod:'none',calibratedAt:'',expiresAt:''}))});await h.promote('routine-equipment');
 const equipmentUI=require('node:fs').readFileSync(path.join(process.env.IPQCC_OPERATION_SOURCE_ROOT,'public/process/routine-equipment.js'),'utf8');
 const classifierStart=equipmentUI.indexOf('        Object.entries(data.control?.scopes || {})');
 const classifierEnd=equipmentUI.indexOf('    } catch (e)',classifierStart);
 const classifier=equipmentUI.slice(classifierStart,classifierEnd).replace(/\s*}\s*$/, '');
 function references(data){const result={ipqcAB:{active:[],pending:[],draft:[],superseded:[]}};require('node:vm').runInNewContext(classifier,{data,eqId:'valid-tool',result,addUnique:(list,row)=>list.push(row)});return result.ipqcAB;}
 const q='&scope=A%3AG' ,mq='&module=1';await h.begin('ipqc-ab','editor',200,q);
 let r=await h.command('ipqc-ab','apply',{moduleAction:'create-error',input:{stageCode:'A-CUT',name:'Error'}},'editor',200,q);
 const errorId=h.flow(r).working.errors[0].id;
 r=await h.command('ipqc-ab','apply',{moduleAction:'create-item',input:{errorId}},'editor',200,q);
 const id=h.flow(r).working.items[0].id;
 const field=(name,value,prior)=>({patches:[{op:'set',path:['items',{id},name],value}],guards:[{path:['items',{id},name],value:prior}]});
 const before=h.snapshot();r=await h.command('ipqc-ab','apply',field('inspectionMode','equipment','visual'),'editor',422,q);assert.equal(r.error,'EQUIPMENT_REQUIRED');assert.deepEqual(h.snapshot(),before);record('equipment empty ID returns 422 EQUIPMENT_REQUIRED; persisted state unchanged');
 await h.command('ipqc-ab','apply',field('standard','Initial standard',''),'editor',200,q);
 const combined={patches:[],guards:[]};for(const [name,value,prior]of [['inspectionMode','equipment','visual'],['equipmentId','valid-tool',''],['productCodes',['P100'],[]],['rules',[{id:'r1',cadence:'time',kind:'month'},{id:'r2',cadence:'batch',kind:'custom',name:'Batch',value:'3'}],[]]]){const p=field(name,value,prior);combined.patches.push(...p.patches);combined.guards.push(...p.guards);}
 await h.command('ipqc-ab','apply',combined,'editor',200,q);
 const persisted=(await h.call('ipqc-ab')).control.scopes['A:G'];const draft=persisted.versions.find(v=>v.status==='draft');assert.equal(draft.snapshot.items[0].equipmentId,'valid-tool');assert.equal(draft.snapshot.items[0].equipmentSnapshot.assetCode,'FX900');assert.deepEqual(draft.snapshot.items[0].productCodes,['P100']);assert(!persisted.activeVersionId);const draftRefs=references(await h.call('ipqc-ab'));assert.equal(draftRefs.draft.length,1);assert.equal(draftRefs.active.length,0);record('Approved enabled equipment selection, product matrix include and time/custom batch rules persist in draft; no premature active');
 await h.command('ipqc-ab','apply',field('productCodes',[],['P100']),'editor',200,q);assert.deepEqual(h.flow(await h.read('ipqc-ab','editor',q)).working.items[0].productCodes,[]);
 await h.command('ipqc-ab','apply',field('productCodes',['P100'],[]),'editor',200,q);
 const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
 const photo=await h.load('app/api/ipqc-ab/photo/route.ts').PUT(new Request('http://fixture/api/ipqc-ab/photo',{method:'PUT',headers:{...h.sessions.editor,'Content-Type':'image/gif'},body:gif}));assert.equal(photo.status,200);const photoBody=await photo.json();
 await h.command('ipqc-ab','apply',field('standardPhotos',[{id:photoBody.id,name:'photo.gif',note:'caption'}],[]),'editor',200,q);
 const photoRead=await h.load('app/api/ipqc-ab/photo/route.ts').GET(new Request('http://fixture/api/ipqc-ab/photo?id='+photoBody.id,{headers:h.sessions.editor}));assert.equal(photoRead.status,200);assert.deepEqual(Buffer.from(await photoRead.arrayBuffer()),gif);record('Photo normal upload, item Apply and authorized byte reread pass; product relation toggle off/on persists');
 const protectedBefore=h.snapshot();await h.command('ipqc-ab','apply',{moduleAction:'delete-error',input:{id:errorId}},'editor',422,q);assert.deepEqual(h.snapshot(),protectedBefore);record('Error with live child rejects delete and preserves persisted state');

 async function measured(name,fn,verify){const start=performance.now();await fn();const data=await h.call('ipqc-ab');await verify(data);timings.push({name,ms:performance.now()-start});}
 await h.begin('ipqc-ab','editor',200,mq);let saved,caseId;
 await measured('save+GET',async()=>{saved=h.flow(await h.command('ipqc-ab','save',{},'editor',200,mq)).saved;},d=>assert.equal(d.control.moduleDraft.workflow.saved.id,saved.id));
 await measured('submit+GET',async()=>{r=await h.command('ipqc-ab','submit',{savedId:saved.id,reason:'Synthetic first'},'editor',200,mq);caseId=r.receipt.caseId;},d=>{assert.equal(d.control.moduleDraft.workflow.pendingId,caseId);assert(d.control.scopes['A:G'].versions.some(v=>v.id===caseId&&v.status==='pending'));const refs=references(d);assert(refs.pending.some(x=>x.versionId===caseId));assert.equal(refs.active.length,0);});
 await measured('return+GET',()=>h.command('ipqc-ab','return',{caseId,reason:'Revise standard'},'reviewer',200,mq),d=>assert(!d.control.moduleDraft.workflow.pendingId));
 await h.command('ipqc-ab','apply',field('standard','Revised standard','Initial standard'),'editor',200,q);
 await h.begin('ipqc-ab','editor',200,mq);
 await measured('resave+GET',async()=>{saved=h.flow(await h.command('ipqc-ab','save',{},'editor',200,mq)).saved;},d=>assert.equal(d.control.moduleDraft.workflow.saved.id,saved.id));
 await measured('resubmit+GET',async()=>{r=await h.command('ipqc-ab','submit',{savedId:saved.id,reason:'Synthetic revised'},'editor',200,mq);caseId=r.receipt.caseId;},d=>{assert.equal(d.control.moduleDraft.workflow.pendingId,caseId);assert(d.control.scopes['A:G'].versions.some(v=>v.id===caseId&&v.status==='pending'));const refs=references(d);assert(refs.pending.some(x=>x.versionId===caseId));assert.equal(refs.active.length,0);});
 await measured('approve+GET',()=>h.command('ipqc-ab','approve',{caseId},'reviewer',200,mq),d=>{const s=d.control.scopes['A:G'];assert.equal(s.activeVersionId,caseId);const item=s.versions.find(v=>v.id===caseId).snapshot.items[0];assert.equal(item.standard,'Revised standard');assert.equal(item.equipmentId,'valid-tool');assert.deepEqual(item.productCodes,['P100']);assert.equal(item.standardPhotos[0].note,'caption');const refs=references(d);assert(refs.active.some(x=>x.versionId===caseId));assert(!refs.pending.some(x=>x.versionId===caseId));});
 record('Actual equipment UI source classifier confirms draft then pending then active buckets, no premature formal reference');
 record('normal Save Submit Return real edit Save Submit Approve persists revised standard and exact case active');
 const original=h.load('app/api/ipqc-ab/route.ts'),candidate=h.load('app/api/ipqc-ab/route.ts');
 const readOnlyBefore=h.snapshot(),measure=[];
 async function read(route,query='',who='editor',expected=200){let reads=0,readBytes=0;const originalGet=Object.getOwnPropertyDescriptor(h.env.STATE_ARCHIVE,'get')?.value;assert.equal(typeof originalGet,'function');h.env.STATE_ARCHIVE.get=async function(key){const value=await originalGet.call(this,key);reads++;const bytes=h.objects.get(key);readBytes+=bytes?.length||0;return value;};try{const response=await route.GET(new Request('http://fixture/api/ipqc-ab'+query,{headers:h.sessions[who]}));assert.equal(response.status,expected,query+' '+who);const text=await response.text(),body=JSON.parse(text);measure.push({query,who,status:response.status,responseBytes:Buffer.byteLength(text),archiveReads:reads,archiveReadBytes:readBytes});return body;}finally{h.env.STATE_ARCHIVE.get=originalGet;}}
 const old=await read(original),compatible=await read(candidate);assert.deepEqual(compatible,old);
 const oldMeta=await read(original,'?caseMetadata=1'),newMeta=await read(candidate,'?caseMetadata=1');assert.deepEqual(newMeta,oldMeta);
 const deferred=await read(candidate,'?caseMetadata=1&equipment=deferred');assert.equal(deferred.equipmentDeferred,true);assert(!Object.hasOwn(deferred,'equipment'));assert.deepEqual(deferred.control,oldMeta.control);assert.deepEqual(deferred.catalog,oldMeta.catalog);assert.equal(deferred.revision,oldMeta.revision);
 const catalog=await read(candidate,'?catalog=equipment');assert.deepEqual(catalog.equipment,oldMeta.equipment);assert.equal(catalog.equipment.length,201);
 const abOnly=await read(candidate,'?catalog=equipment','ab-only');assert.deepEqual(abOnly.equipment,catalog.equipment);const approvalOnlyOriginal=await read(original,'','no-view',200);const approvalOnlyCatalog=await read(candidate,'?catalog=equipment','no-view',200);assert.deepEqual(approvalOnlyCatalog.equipment,approvalOnlyOriginal.equipment);await read(original,'','equipment-only',403);await read(candidate,'?catalog=equipment','equipment-only',403);
 for(const query of ['?catalog=unknown','?catalog=equipment&caseMetadata=1','?catalog=equipment&equipment=deferred','?equipment=no','?equipment=deferred&equipment=deferred','?catalog=equipment&catalog=equipment'])await read(candidate,query,'editor',400);
 assert.deepEqual(h.snapshot(),readOnlyBefore);
 console.log(JSON.stringify({status:'PASS_AB_ENTRY_HANDLER_CONTRACT',checks,measure,equipmentCount:201,limits:'Actual in-memory handlers and synthetic 201 approved tools; byte/read counts only, no browser or real elapsed-speed claim. Same fixed final state for GET comparisons.'},null,2));
}finally{h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
