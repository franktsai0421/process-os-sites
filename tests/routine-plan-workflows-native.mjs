// Run against the compiled Worker with a fresh disposable D1 and R2 per scenario.
import assert from 'node:assert/strict';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {seedRoutineCalendarFixture} from './routine-fqc-calendar-browser.mjs';
import {tinyPNG} from './quality-filter-dom-ports.mjs';

async function scenario(outcomes) {
  const secret=randomBytes(32).toString('hex');
  const fixture=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:secret}});
  try {
    const {cookie,today}=await seedRoutineCalendarFixture(fixture,secret);
    const bucket=await fixture.mf.getR2Bucket('STATE_ARCHIVE');
    const row=()=>fixture.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
    const load=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE:bucket});
    const {encodeRecordValues}=load('lib/state-records.ts');
    const before=await row(), persisted=JSON.parse(before.values);
    const padding=Object.fromEntries(Array.from({length:12},(_,i)=>['unrelated'+i,JSON.stringify({working:{text:String.fromCharCode(65+i).repeat(256*1024)}})]));
    const refs=JSON.parse(await encodeRecordValues(bucket,padding)).__processRecords.values;
    Object.assign(persisted.__processRecords.values,refs);
    await fixture.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').bind(JSON.stringify(persisted)).run();
    await bucket.delete(refs.unrelated0.key);
    const image=Buffer.from(await tinyPNG().arrayBuffer()), photo=createHash('sha256').update(image).digest('hex');
    for(const lane of ['fqc','iqc']){
      await bucket.put('routine-'+lane+'/photos/'+photo,image,{httpMetadata:{contentType:'image/png'}});
      const iqc=lane==='iqc';
      if(iqc&&outcomes.includes('abnormal'))continue;
      async function call(body,actor='frank',query='',expected=200){
        const res=await fixture.mf.dispatchFetch(new URL('/api/routine-'+lane+query,fixture.url).href,{
          method:body?'POST':'GET',headers:{cookie:'process_demo='+cookie(actor),origin:fixture.url.origin,'content-type':'application/json'},
          ...(body?{body:JSON.stringify(body)}:{})});
        const data=await res.json();
        assert.equal(res.status,expected,JSON.stringify([lane,body?.action,body?.command?.action,query,data.error,data.details]));
        return data;
      }
      const read=async()=>{const data=await call();return data.control||data;};
      let state=await read();
      const document=id=>state.documents.find(d=>d.id===id);
      async function write(action,fields={},actor='frank'){
        const command={action,operationId:randomUUID(),expectedRevision:state.revision,...fields};
        const start=await row();
        const {result}=await call(command,actor);
        assert.deepEqual((await call(null,actor,'?operationId='+command.operationId)).result,result);
        assert.equal((await row()).revision,start.revision+1);
        if(action==='create-plan'){
          assert.deepEqual((await call(command,actor)).result,result);
          assert.equal((await row()).revision,start.revision+1);
        }
        state=await read();return result;
      }
      if(iqc)await write('configure',{start:today,scope:'routine-iqc-only',startAck:true,confirm:'START IQC',reason:'Synthetic schedule',expectedStateRevision:state.stateRevision});
      else {await write('configure',{calendarVersion:2,startDate:today});await write('generate');}
      const job=state.jobs[0];assert(job);
      const plan=(await write('create-plan',{jobIds:[job.id],...(iqc?{start:today,end:today}:{startDate:today,endDate:today})})).documentId;
      async function draft(id,action,extra={},fields,actor){
        const flow=document(id).flow, operationId=randomUUID();
        const cmd={action,operationId,generation:flow.generation,clientId:randomUUID(),sequence:1,expectedRevision:flow.revision,...extra};
        return write('draft',{documentId:id,operationId,[iqc?'draft':'command']:cmd,...(fields?{fields}:{})},actor);
      }
      async function finalize(id,fields={},lineResults){
        if(iqc)await draft(id,'save',{},fields);
        else {
          const working=document(id).flow.working;
          const edits=Object.entries(fields).map(([key,value])=>({path:[key],value,old:working[key]}));
          if(lineResults){const line=working.lines[0];edits.push({path:['lines',{id:line.id},'results'],value:lineResults,old:line.results});}
          if(edits.length)await draft(id,'apply',{patches:edits.map(({path,value})=>({op:'set',path,value})),guards:edits.map(({path,old})=>({path,value:old}))});
          await draft(id,'save');
        }
        await draft(id,'submit',{savedId:document(id).flow.saved.id,reason:'Synthetic submission'});
        const pending=document(id).flow.pendingId;assert(pending);
        await draft(id,'approve',{caseId:pending,reason:'Synthetic review'},undefined,'routine-reviewer');
        assert.equal(document(id).flow.active.id,pending);
      }
      await finalize(plan,iqc?{lots:[{partId:job.source.iqc.partId,batchNo:'0001',quantity:3}]}:{});
      let nextPlan=plan,caseId,originalId,originalContent;
      for(const outcome of outcomes){
        if(caseId){
          nextPlan=(await write(iqc?'create-retest':'request',{caseId,...(iqc?{}:{requestKind:'retest',retestPlan:true})})).documentId;
          await finalize(nextPlan,{reason:'Synthetic retest',...(iqc?{start:today,end:today}:{planStart:today,planEnd:today})});
        }
        const report=(await write('create-report',{documentId:nextPlan})).documentId;
        const content=document(report).flow.working;
        const results=(iqc?content.inspections:content.lines[0].results).map(r=>({...r,...(!iqc&&outcome==='abnormal'?{samples:[]}:{}),outcome,value:'Synthetic reading',notes:'Synthetic observation',photos:outcome==='fail'?[photo]:[]}));
        await finalize(report,iqc?{inspections:results}:{},iqc?undefined:results);
        if(!originalId){originalId=report;originalContent=document(report).flow.active.content;caseId=state.cases.find(c=>c.originReportId===report)?.id;}
        assert.deepEqual(document(originalId).flow.active.content,originalContent);
        if(outcome==='fail')assert(caseId);
      }
      const currentCase=()=>state.cases.find(c=>c.id===caseId);
      if(outcomes.at(-1)==='pass'){
        if(caseId)assert.equal(currentCase().status,'closed');else assert.equal(state.cases.length,0);
      } else if(!iqc && outcomes.at(-1)==='fail'){
        const b=await row();
        const denied=await call({action:'request',caseId,requestKind:'disposal',expectedRevision:state.revision,operationId:randomUUID()},'frank','',409);
        assert.equal(denied.error,'FOLLOWUP_KIND_UNAVAILABLE');assert.deepEqual(await row(),b);
      } else {
        const id=(await write(iqc?'create-disposal':'request',{caseId,...(iqc?{}:{requestKind:'disposal'})})).documentId;
        await finalize(id,{reason:'Synthetic finding',disposition:'Synthetic quarantine'});
        assert.equal(currentCase().status,'disposed');
      }
      assert.deepEqual(document(originalId).flow.active.content,originalContent);
      const final=JSON.parse((await row()).values).__processRecords.values;
      for(const [key,value] of Object.entries(persisted.__processRecords.values))
        if(!['routineIqcControl','routineFqcControl'].includes(key))assert.deepEqual(final[key],value);
      console.log(lane,outcomes.join(' -> '),currentCase()?.status||'pass',document(plan).number,document(originalId).number);
    }
  } finally {await fixture.close();}
}
for(const outcomes of [['pass'],['fail','pass'],['fail','fail'],['fail','fail','abnormal']])await scenario(outcomes);
