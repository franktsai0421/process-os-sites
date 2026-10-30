/* Repository-relative isolated regression; Node SQLite memory + synthetic DOM only. */
process.chdir(require('node:path').resolve(__dirname,'..'));
const path=require('node:path');process.env.IPQCC_OPERATION_SOURCE_ROOT=path.resolve(__dirname,'..');
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),{fixture,json}=require('./ipqc-ab-acceptance-role-fixture.cjs');
const insert=(collection,value)=>({op:'insert',path:[collection],value});
const empty={AB:{products:[],lines:[],categoryGroups:[]},C:{products:[],lines:[],categoryGroups:[]},PROCESS:{}};
const master={active:json(empty),versions:Object.entries(empty).map(([scope,snapshot])=>({id:'initial-empty-'+scope,scope,number:1,status:'approved',snapshot,revision:1,creatorId:'fixture',creatorName:'Synthetic initialization',createdAt:'synthetic',updatedAt:'synthetic',history:[]}))};
(async()=>{const h=await fixture({masterDataControl:JSON.stringify(master),processMasterData:'{}'}),checks=[],timings=[];const record=x=>checks.push(x);try{
 await h.begin('master','editor',200,'&scope=AB');
 await h.command('master','apply',{patches:[insert('lines',{id:'A',code:'A',name:'A',stages:[{id:'stage',code:'A-CUT',name:'Cut'}]}),insert('categoryGroups',{id:'g',line:'A',name:'G',defaultStages:['A-CUT']})]},'editor',200,'&scope=AB');await h.promote('master','&scope=AB');
 await h.begin('master','editor',200,'&scope=AB');await h.command('master','apply',{patches:[insert('products',{id:'p',code:'P100',name:'Product',line:'A',category:'G',routeMode:'group',stages:['A-CUT'],specification:'10',unit:'PCS'})]},'editor',200,'&scope=AB');await h.promote('master','&scope=AB');
 await h.begin('routine-equipment');
 await h.command('routine-equipment','apply',{patches:[insert('categories',{id:'cat',name:'Category'}),insert('subcategories',{id:'sub',categoryId:'cat',name:'Sub'}),insert('groups',{id:'eqg',categoryId:'cat',subcategoryId:'sub',name:'Group'})]});
 await h.command('routine-equipment','apply',{patches:[insert('equipment',{id:'valid-tool',assetCode:'FX900',name:'Tool',groupId:'eqg',spec:'150 mm',unit:'支',enabled:true,confirmed:true,calibrationMethod:'none',calibratedAt:'',expiresAt:''})]});await h.promote('routine-equipment');
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
 const photo=await h.load(path.join(process.env.IPQCC_OPERATION_SOURCE_ROOT,'app/api/ipqc-ab/photo/route.ts')).PUT(new Request('http://fixture/api/ipqc-ab/photo',{method:'PUT',headers:{...h.sessions.editor,'Content-Type':'image/gif'},body:gif}));assert.equal(photo.status,200);const photoBody=await photo.json();
 await h.command('ipqc-ab','apply',field('standardPhotos',[{id:photoBody.id,name:'photo.gif',note:'caption'}],[]),'editor',200,q);
 const photoRead=await h.load(path.join(process.env.IPQCC_OPERATION_SOURCE_ROOT,'app/api/ipqc-ab/photo/route.ts')).GET(new Request('http://fixture/api/ipqc-ab/photo?id='+photoBody.id,{headers:h.sessions.editor}));assert.equal(photoRead.status,200);assert.deepEqual(Buffer.from(await photoRead.arrayBuffer()),gif);record('Photo normal upload, item Apply and authorized byte reread pass; product relation toggle off/on persists');
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
 const permissionMatrix={};
 for(const who of ['viewer','edit-only','save-only','submit-only','edit-save','edit-submit','delete-only','edit-delete','reviewer','no-view']){
  const result=who==='no-view'?await h.call('ipqc-ab/workflow','GET',undefined,who,403,'?caseMetadata=1'+q+'&permissions=1'):await h.read('ipqc-ab',who,q+'&permissions=1');permissionMatrix[who]=result.permissions||{denied:403};
 }
 for(const who of ['viewer','save-only','submit-only','no-view']){const before=h.snapshot();await h.begin('ipqc-ab',who,403,q);assert.deepEqual(h.snapshot(),before);}
 record({name:'Role permission DTO observed; viewer/save-only/submit-only/no-view Begin denied with no writes',permissionMatrix});
 await h.begin('ipqc-ab','editor',200,q);
 await h.command('ipqc-ab','apply',field('standard','Role verification','Revised standard'),'editor',200,q);
 await h.begin('ipqc-ab','editor',200,mq);
 const modulePermissions={};for(const who of ['save-only','submit-only','edit-only'])modulePermissions[who]=(await h.read('ipqc-ab',who,mq+'&permissions=1')).permissions;
 const _roleSaved=h.flow(await h.command('ipqc-ab','save',{},'save-only',200,mq)).saved;
 for(const who of ['save-only','submit-only']){const before=h.snapshot();await h.begin('ipqc-ab',who,403,mq);assert.deepEqual(h.snapshot(),before);}
 const ui=require('node:fs').readFileSync(path.join(process.env.IPQCC_OPERATION_SOURCE_ROOT,'public/process/ipqc-ab.js'),'utf8');
 const start=ui.indexOf("${moduleDrafts().length&&permittedAction('save')?"),end=ui.indexOf("${ownPending(v)?",start);
 const expression=ui.slice(start,end).trim();const buttons={};
 for(const who of ['save-only','submit-only','edit-only']){const context={moduleDrafts:()=>[{}],permittedAction:operation=>modulePermissions[who][operation],busy:false,t:x=>x};buttons[who]=require('node:vm').runInNewContext('`'+expression+'`',context);}
 assert(buttons['save-only'].includes('ipqcab-save'));assert(!buttons['save-only'].includes('ipqcab-submit'));assert(buttons['submit-only'].includes('ipqcab-submit'));assert(!buttons['submit-only'].includes('ipqcab-save'));assert(!buttons['edit-only'].includes('ipqcab-save'));
 const photoRoles={};for(const who of ['edit-only','submit-only']){const response=await h.load(path.join(process.env.IPQCC_OPERATION_SOURCE_ROOT,'app/api/ipqc-ab/photo/route.ts')).PUT(new Request('http://fixture/api/ipqc-ab/photo',{method:'PUT',headers:{...h.sessions[who],'Content-Type':'image/gif'},body:gif}));photoRoles[who]=response.status;await response.arrayBuffer();}
 assert.equal(photoRoles['edit-only'],200);assert.equal(photoRoles['submit-only'],403);
 const moduleFunction=ui.slice(ui.indexOf('  async function moduleSave('),ui.indexOf('  async function save('));
 async function actualModuleAction(who,action,expectedSuccess=true){let beginCount=0;const identity={id:'preview-'+who};const context={accessBlocked:null,lastCommandAcknowledgement:null,actor:()=>identity,modal:null,busy:false,message:'',host:null,reviewHost:null,reason:'Role test',moduleTransport:()=>({hasUnknown:()=>false,flush:async()=>{},read:()=>h.read('ipqc-ab',who,mq),begin:async()=>{beginCount++;return h.begin('ipqc-ab',who,403,mq);},command:(generation,action,fields)=>h.command('ipqc-ab',action,{generation,...fields},who,200,mq)}),window:{VersionDraftUI:{preserveView:()=>()=>{},confirmSubmit:async()=> 'Role-only submission'}},load:async()=>true,toast(){},t:x=>x,draw(){},drawReview(){}};require('node:vm').createContext(context);require('node:vm').runInContext(moduleFunction+';globalThis.run=moduleSave;',context);const result=await context.run(action);if(expectedSuccess){assert(result,context.message);assert.equal(beginCount,0);}else{assert.equal(result,null);assert.equal(beginCount,1);}return result;}
 await actualModuleAction('save-only','save');const roleSubmitted=await actualModuleAction('submit-only','submit');await h.command('ipqc-ab','approve',{caseId:roleSubmitted.receipt.caseId},'reviewer',200,mq);const noDraftBefore=h.snapshot();await actualModuleAction('save-only','save',false);assert.deepEqual(h.snapshot(),noDraftBefore);record('Actual candidate new module draft still needs edit: save-only Begin403, no writes');

 record({name:'Candidate actual moduleSave no implicit begin: save-only Save200 / submit-only Submit200; actual buttons independent; photo edit-only200 submit-only403',modulePermissions,buttons,photoRoles});
 console.log(JSON.stringify({status:'PASS',checks,timings,trace:h.trace,fixture:{groups:1,errors:1,items:1,products:1},limits:'Single sequential lifecycle, growing case/history; not equal-size before/after performance benchmark. No HTTP/browser/live data.'},null,2));
}finally{h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
