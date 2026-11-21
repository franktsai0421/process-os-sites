import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {tinyPNG} from './quality-filter-dom-ports.mjs';
import test from 'node:test';
import fixture from '../scripts/fqc-apply-fixture.cjs';

const origin='https://synthetic.invalid', endpoint=origin+'/api/routine-iqc';
const scenarios=[
 {id:'01',first:['fail'],follow:['pass'],end:'closed'},
 {id:'02',first:['fail'],follow:['fail','pass'],end:'closed'},
 {id:'03',first:['fail'],follow:['pass'],end:'closed',reviewCycles:'retest'},
 {id:'04',first:['pass'],follow:[],end:'pass'},
 {id:'05',first:['pass','pass'],follow:[],end:'pass',reviewCycles:'report'},
 {id:'06',first:['pass','fail'],follow:['pass'],end:'closed'},
 {id:'07',first:['pass','fail'],follow:['fail'],end:'disposed'},
 {id:'08',first:['abnormal'],follow:[],end:'disposed'},
 {id:'09',first:['fail'],follow:['fail','pass'],end:'closed',reviewCycles:'plan'},
 {id:'10',first:['pass','fail'],follow:['fail','fail'],end:'disposed',reviewCycles:'disposal'},
];

void test('ten synthetic IQC cases traverse the real authenticated plan, report and follow-up routes',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-19T09:00:00+07:00')});
 const f=await fixture();
 try{
  const archive=f.env.STATE_ARCHIVE, readObject=archive.get.bind(archive), writeObject=archive.put.bind(archive);
  const metadata=new Map();
  archive.put=async (key,value,options)=>{
   await writeObject(key,value);
   if(options?.httpMetadata)metadata.set(key,options.httpMetadata);
  };
  archive.get=async key=>{
   const object=await readObject(key);
   return object&&metadata.has(key)?{...object,body:await object.arrayBuffer(),httpMetadata:metadata.get(key)}:object;
  };
  const [editor,reviewer]=f.users;
  for(const user of f.users){
   for(const key of ['iqc.view','approval.view','approval.approve','approval.return'])user.accessOverrides[key]=true;
   for(const key of Object.keys(user.accessOverrides))if(key.startsWith('routine.'))user.accessOverrides[key]=true;
  }
  const admin={...editor,id:'routine-qa-isolated-admin',role:'admin'};
  const owner={...admin,id:'frank'};
  const route=f.load('app/api/routine-iqc/route.ts'), photoRoute=f.load('app/api/routine-iqc/photo/route.ts');
  const fqcRoute=f.load('app/api/routine-fqc/route.ts'), masterRoute=f.load('app/api/iqc/workflow/route.ts');
  const reviewedKinds=new Set();
  const today='2026-11-19', part='ROUTINE-QA-PART';
  const snapshot={categories:[{id:'category',nameVi:'Linh kiện thử nghiệm'}],suppliers:[],
   parts:[{id:part,code:part,nameVi:'TEST ONLY IQC part',categoryId:'category',supplierIds:[],photos:[],isEnabled:true}],
   errors:[{id:'routine-qa-error',partCode:part,code:'ROUTINE-QA-ERROR'}],
   items:scenarios.map(({id})=>({id:'routine-qa-'+id,partCode:part,errorId:'routine-qa-error',isEnabled:true,
    checkNo:'ROUTINE-QA-'+id,nameVi:'TEST ONLY ROUTINE-QA-'+id,methodVi:'Method ROUTINE-QA-'+id,inspectionSpecVi:'Standard ROUTINE-QA-'+id,rules:[{id:'week-'+id,cadence:'time',kind:'week',value:''}]}))};
  const master=JSON.stringify({schemaVersion:1,activeVersionId:'routine-qa-source',versions:[
   {id:'routine-qa-source',number:1,status:'approved',createdAt:today+'T00:00:00+07:00',snapshot}
  ],issues:[],reservedErrorCodes:[],reservedCheckNos:[]});
  const fqc=JSON.stringify({schemaVersion:1,revision:2,startDate:null,jobs:[],documents:[{id:'fqc-sentinel',cancelled:true}],cases:[]});
  await f.mutate(values=>{
   values.platformUsers=JSON.stringify([editor,reviewer,admin,owner]);
   values.iqcMasterControl=master;
   values.routineFqcControl=fqc;
   values.routineFqcEnabled='1';
  });
  const cookies={};
  for(const user of [editor,reviewer,admin,owner]){
   cookies[user.id]=f.core.sessionCookie(new Request(endpoint),await f.core.demoSession(new Request(endpoint),user.id,false,1)).split(';')[0];
  }
  const call=async(method,path=endpoint,options={})=>{
   const {actor=editor,body,handler=route,type='application/json'}=options;
   const headers={origin,cookie:cookies[actor.id],'Content-Type':type};
   return handler[method](new Request(path,method==='GET'?{headers}:{method,headers,body}));
  };
  const read=async(actor=editor)=>{
   const response=await call('GET',endpoint,{actor}), value=await response.json();
   assert.equal(response.status,200,JSON.stringify(value));
   return value;
  };
  let data=await read();
  const execute=async(action,fields={},actor=editor,status=200)=>{
   const body=JSON.stringify({action,operationId:randomUUID(),expectedRevision:data.revision,...fields});
   const response=await call('POST',endpoint,{actor,body}), value=await response.json();
   assert.equal(response.status,status,JSON.stringify(value));
   if(status===200)data=await read();
   return status===200?value.result:value.error;
  };
  const configure=await read(owner);
  const startFields={start:today,scope:'routine-iqc-only',confirm:'START IQC',startAck:true,
   reason:'TEST ONLY schedule ten sample rows',expectedStateRevision:configure.stateRevision};
  for(const actor of [reviewer,admin])await execute('configure',startFields,actor,403);
  assert.deepEqual(await read(),data);
  await execute('configure',startFields,owner);
  assert.equal(data.jobs.length,10);
  const photo=Buffer.from(await tinyPNG().arrayBuffer());
  const storedPhoto=await call('PUT',endpoint+'/photo',{body:photo,type:'image/png',handler:photoRoute});
  assert.equal(storedPhoto.status,200);
  const {id:photoId}=await storedPhoto.json();
  const get=id=>data.documents.find(doc=>doc.id===id);
  const draft=(id,action,additional={},fields,actor=editor,status=200)=>{
   const {flow}=get(id), operationId=randomUUID();
   return execute('draft',{documentId:id,operationId,draft:{action,operationId,clientId:randomUUID(),sequence:1,
    generation:flow.generation,expectedRevision:flow.revision,...additional},...(fields?{fields}:{})},actor,status);
  };
  const save=(id,fields)=>draft(id,'save',{},fields);
  const submit=async id=>{
   await draft(id,'submit',{savedId:get(id).flow.saved.id});
   const pending=data.documents.filter(doc=>doc.status==='pending'), row=get(id);
   assert.deepEqual(pending.map(doc=>doc.id),[id]);
   assert(row.flow.pendingId);
   if(reviewedKinds.has(row.kind))return;
   const fqcQueue=await call('GET',origin+'/api/routine-fqc?pending-count=1',{handler:fqcRoute});
   const masterQueue=await call('GET',origin+'/api/iqc/workflow?reviewMetadata=1',{handler:masterRoute});
   assert.equal(fqcQueue.status,200);
   assert.equal(masterQueue.status,200,await masterQueue.clone().text());
   assert.equal((await fqcQueue.json()).pendingCount,0);
   const masterReview=(await masterQueue.json()).review;
   assert.equal(masterReview.activeVersionId,'routine-qa-source');
   assert.deepEqual(masterReview.versions.filter(version=>version.status==='pending'),[]);
   reviewedKinds.add(row.kind);
  };
  const review=async(id,cycle=false)=>{
   const {saved}=get(id).flow;
   const jobs=structuredClone(get(id).jobs);
   await submit(id);assert.equal(get(id).status,'pending');
   const pending=get(id).flow.cases.find(row=>row.id===get(id).flow.pendingId);
   assert.deepEqual(pending.content,saved.content);
   assert.deepEqual(get(id).jobs,jobs);
   if(cycle){
    for(const outcome of ['withdraw','return']){
     const caseId=get(id).flow.pendingId;
     await draft(id,outcome,{caseId,reason:'TEST ONLY '+outcome},undefined,outcome==='return'?reviewer:editor);
     assert.equal(get(id).status,'draft');
     assert.equal(get(id).flow.cases.find(row=>row.id===caseId).status,outcome==='return'?'returned':'withdrawn');
     await submit(id);assert.equal(get(id).status,'pending');
    }
   }
   await draft(id,'approve',{caseId:get(id).flow.pendingId},undefined,reviewer);
   assert.equal(get(id).status,'approved');
   assert.deepEqual(get(id).flow.active.content,saved.content);
   assert.deepEqual(get(id).jobs,jobs);
  };
  const newReport=async(plan,results)=>{
   const {documentId}=await execute('create-report',{documentId:plan});
   const inspections=get(documentId).flow.working.inspections.map((row,i)=>({...row,outcome:results[i],
    value:results[i]==='pass'?'TEST ONLY OK':'',notes:results[i]==='pass'?'':'TEST ONLY finding',
    photos:results[i]==='fail'?[photoId]:[]}));
   assert.equal(inspections.length,results.length);
   assert(inspections.every(row=>row.batch.unit==='pcs'));
   const title='TEST ONLY result for '+get(plan).number;
   await save(documentId,{title,inspections});
   const report=get(documentId);
   assert.equal(report.planId,plan);
   assert.deepEqual(report.jobs,get(plan).jobs);
   assert.equal(report.flow.saved.content.title,title);
   assert.deepEqual(report.flow.saved.content.inspections,inspections);
   return documentId;
  };
  const evidence=[];
  for(const spec of scenarios){
   const name='TEST ONLY ROUTINE-QA-'+spec.id, job=data.jobs.find(j=>j.source.name===name);
   assert(job);
   assert.equal(job.source.iqc.method,'Method ROUTINE-QA-'+spec.id);
   assert.equal(job.source.iqc.inspectionSpecification,'Standard ROUTINE-QA-'+spec.id);
   assert.equal(data.jobs.filter(row=>row.id!==job.id).length,9);
   const {documentId:plan}=await execute('create-plan',{jobIds:[job.id],start:today,end:today});
   assert.equal(await execute('create-report',{documentId:plan},editor,409),'IQC_APPROVED_PLAN_REQUIRED');
   const lots=spec.first.map((_,i)=>({partId:part,batchNo:'00'+spec.id+'-'+(i+1),quantity:i+2}));
   const selection=[{id:job.id,source:job.source}];
   assert.deepEqual(get(plan).jobs,selection);
   if(spec.id==='01')assert.equal(await draft(plan,'save',{},{title:null},editor,422),'IQC_TEXT_INVALID');
   await save(plan,{title:name,lots,notes:name});
   await review(plan,spec.reviewCycles==='plan');
   assert.deepEqual(get(plan).jobs,selection);
   assert.equal(get(plan).flow.active.content.title,name);
   assert.deepEqual(get(plan).flow.active.content.lots,lots);
   const report=await newReport(plan,spec.first);
   assert.equal(data.cases.filter(c=>c.originReportId===report).length,0);
   await review(report,spec.reviewCycles==='report');
   const base=get(report).flow.active.content;
   const failed=data.cases.filter(c=>c.originReportId===report);
   const expectedBatches=lots.filter((_,i)=>spec.first[i]!=='pass').map(lot=>lot.batchNo);
   assert.deepEqual(failed.map(c=>c.batch.batchNo),expectedBatches);
   assert.deepEqual(base.inspections.map(r=>r.outcome),spec.first);
   assert.deepEqual(base.inspections.map(r=>r.jobId),spec.first.map(()=>job.id));
   assert.deepEqual(base.inspections.map(r=>r.photos),spec.first.map(result=>result==='fail'?[photoId]:[]));
   const followIds=[];
   let disposal=null;
   if(failed.length){
    const lookup=()=>data.cases.find(c=>c.id===failed[0].id);
    if(lookup().result==='fail'){
     assert.equal(lookup().disposalAvailable,false);
     assert.equal(await execute('create-disposal',{caseId:lookup().id},editor,409),'IQC_CASE_NOT_AVAILABLE');
    }
    for(const outcome of spec.follow){
     const {documentId:request}=await execute('create-retest',{caseId:lookup().id});
     await save(request,{start:today,end:today,reason:name+' retest'});
     await submit(request);
     assert.equal(lookup().status,'open');
     assert.equal(await execute('create-report',{documentId:request},editor,409),'IQC_APPROVED_PLAN_REQUIRED');
     if(spec.reviewCycles==='retest'){
      const pending=get(request).flow.pendingId;
      await draft(request,'return',{caseId:pending,reason:'TEST ONLY return request'},undefined,reviewer);
      assert.equal(lookup().status,'open');
      await submit(request);
     }
     await draft(request,'approve',{caseId:get(request).flow.pendingId},undefined,reviewer);
     assert.equal(lookup().status,'retest');
     const retest=await newReport(request,[outcome]);
     assert.deepEqual(get(retest).flow.working.inspections[0].batch,failed[0].batch);
     await review(retest);
     assert.equal(lookup().status,outcome==='pass'?'closed':'open');
     assert.equal(lookup().disposalAvailable,outcome==='fail');
     assert.deepEqual(get(retest).flow.active.content.inspections[0].photos,outcome==='fail'?[photoId]:[]);
     assert(lookup().reports.includes(retest));
     followIds.push({request:get(request).number,report:get(retest).number,outcome,caseState:lookup().status});
    }
    if(spec.end==='disposed'){
     assert.equal(lookup().disposalAvailable,true);
     ({documentId:disposal}=await execute('create-disposal',{caseId:lookup().id}));
     await save(disposal,{reason:name+' disposal',disposition:'TEST ONLY segregated sample'});
     await submit(disposal);
     assert.equal(lookup().status,'open');
     if(spec.reviewCycles==='disposal'){
      const pending=get(disposal).flow.pendingId;
      await draft(disposal,'withdraw',{caseId:pending,reason:'TEST ONLY withdraw approval'});
      assert.equal(lookup().status,'open');
      await submit(disposal);
     }
     await draft(disposal,'approve',{caseId:get(disposal).flow.pendingId},undefined,reviewer);
     assert.equal(lookup().result,spec.first.includes('abnormal')?'abnormal':'fail');
    }
    assert.equal(lookup().status,spec.end);
    assert.equal(lookup().disposalAvailable,false);
   }else{
    assert.equal(data.jobs.find(j=>j.id===job.id).completion.kind,'pass');
   }
   assert.deepEqual(get(report).flow.active.content,base);
   assert(base.inspections.every((row,i)=>row.batch.batchNo===lots[i].batchNo&&row.batch.quantity===lots[i].quantity));
   assert.equal(get(plan).status,'approved');
   assert.equal(get(report).status,'approved');
   if(spec.id==='01')assert.equal(await draft(report,'save',{},{title:'Unauthorized rewrite'},editor,409),'IQC_DOCUMENT_FIXED');
   evidence.push({name,plan:get(plan).number,report:get(report).number,initial:spec.first,
    batches:lots.map(lot=>lot.batchNo),affected:expectedBatches,retests:followIds,disposal:disposal?get(disposal).number:null,observed:spec.end});
  }
  const readPhoto=await call('GET',endpoint+'/photo?id='+photoId,{handler:photoRoute});
  assert.equal(readPhoto.status,200);
  assert.equal(readPhoto.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await readPhoto.arrayBuffer()),photo);
  const retained=(await f.core.readState({deferHistory:false})).values;
  assert.equal(retained.iqcMasterControl,master);
  assert.equal(retained.routineFqcControl,fqc);
  assert.equal(evidence.length,10);
  assert.deepEqual([...reviewedKinds].sort((a,b)=>a.localeCompare(b)),['disposal','plan','report','retest-plan','retest-report']);
  for(const entry of evidence)console.log('IQC_ROUTINE-QA '+JSON.stringify(entry));
 }finally{f.close();}
});
