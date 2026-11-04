import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('..',import.meta.url));
const {load}=require('../scripts/fqc-bootstrap-projection-fixture.cjs')(root,{},{});
const records=load('lib/state-records.ts'),fixture=require('../scripts/fqc-apply-fixture.cjs');
const tick=()=>new Promise(setImmediate);
const ref=raw=>{const sha256=createHash('sha256').update(raw).digest('hex');return{key:'state-records/v1/'+sha256+'.json',sha256};};
function setup(raws=['{"a":1}','{"b":2}','{"c":3}','{"d":4}']) {
  const entries=raws.map((raw,i)=>['business'+i,ref(raw)]),objects=new Map(raws.map(raw=>[ref(raw).key,raw]));
  const events=[],cancelled=[];let gets=0,texts=0,maxGets=0,maxTexts=0;
  const bucket={async get(key){events.push(['get',key]);maxGets=Math.max(maxGets,++gets);await tick();gets--;const raw=objects.get(key);if(raw instanceof Error)throw raw;if(raw===undefined)return null;return{size:Buffer.byteLength(raw),body:{async cancel(){cancelled.push(key);}},async text(){events.push(['text',key]);maxTexts=Math.max(maxTexts,++texts);await tick();texts--;return raw;}};},async put(){assert.fail('read-only decoder cannot write');}};
  return{entries,objects,events,cancelled,bucket,envelope:{__processRecords:{version:1,values:Object.fromEntries(entries)}},counts:()=>({maxGets,maxTexts})};
}
const plain=value=>JSON.parse(JSON.stringify(value));
void test('FQC bounded reads preserve values, known refs, every GET and serial text consumption',async()=>{
  const before=setup(),after=setup();
  const a=await records.decodeRecordValues(before.bucket,before.envelope),b=await records.decodeRecordValues(after.bucket,after.envelope,{aggregateReadAhead:true});
  assert.deepEqual(plain(b.values),plain(a.values));assert.deepEqual([...b.recordStorage.known],[...a.recordStorage.known]);
  for(const kind of ['get','text'])assert.deepEqual(after.events.filter(e=>e[0]===kind),before.events.filter(e=>e[0]===kind));
  assert.deepEqual(before.counts(),{maxGets:1,maxTexts:1});assert.deepEqual(after.counts(),{maxGets:4,maxTexts:1});assert.deepEqual(after.cancelled,[]);
});
for(const mode of ['missing','sha','json','get','projection','body'])void test(`earlier ${mode} failure wins; speculative aggregate text is never consumed`,async()=>{
  const f=setup(),first=f.entries[0][1],second=f.entries[1][1],options={aggregateReadAhead:true};let expected;
  if(mode==='missing'){f.objects.delete(first.key);expected=/missing/;}
  if(mode==='sha'){f.objects.set(first.key,'wrong');expected=/corrupt/;}
  if(mode==='json'){const raw='[',r=ref(raw);f.objects.set(r.key,raw);f.envelope.__processRecords.values.business0=r;options.modelKey='business0';expected=/JSON|Unexpected/;}
  if(mode==='get'){f.objects.set(first.key,Error('FIRST_GET'));expected=/FIRST_GET/;}
  if(mode==='projection'){options.projectValue=()=>{throw Error('FIRST_PROJECTION');};expected=/FIRST_PROJECTION/;}
  if(mode==='body'){const body=ref('{"body":true}'),raw=JSON.stringify({working:{__immutableBody:body}}),r=ref(raw);f.objects.set(r.key,raw);f.envelope.__processRecords.values.business0=r;expected=/missing/;}
  const originalGet=f.bucket.get.bind(f.bucket);f.bucket.get=async key=>{const object=await originalGet(key);if(key===second.key&&object)object.body.cancel=async()=>{f.cancelled.push(key);throw Error('CLEANUP_FAILURE');};return object;};
  await assert.rejects(records.decodeRecordValues(f.bucket,f.envelope,options),expected);await tick();
  assert(!f.events.some(([kind,key])=>kind==='text'&&key===second.key));assert.deepEqual(f.cancelled.slice().sort((a,b)=>a.localeCompare(b)),f.entries.slice(1).map(([,r])=>r.key).sort((a,b)=>a.localeCompare(b)));
  assert.equal(f.events.filter(([kind,key])=>kind==='text'&&f.entries.slice(1).some(([,r])=>r.key===key)).length,0);
});
for(const mode of ['slow','reject'])void test(`earlier rejection does not wait for ${mode} speculative GET or leak an unhandled rejection`,async()=>{
  const f=setup(['{"a":1}','{"b":2}']),first=f.entries[0][1],second=f.entries[1][1];let release;
  const rejected=[];const listener=error=>rejected.push(error);process.on('unhandledRejection',listener);
  f.bucket.get=key=>key===first.key?Promise.reject(Error('FIRST')):new Promise((resolve,reject)=>{release=()=>mode==='reject'?reject(Error('SECOND')):resolve({text:()=>{assert.fail('unused text');},body:{async cancel(){f.cancelled.push(key);}}});});
  try{await assert.rejects(records.decodeRecordValues(f.bucket,f.envelope,{aggregateReadAhead:true}),/FIRST/);assert(release);release();await tick();await tick();assert.deepEqual(rejected,[]);assert.deepEqual(f.cancelled,mode==='slow'?[second.key]:[]);}finally{release?.();process.removeListener('unhandledRejection',listener);}
});
void test('same-key transient failure is observed once and is never hidden by a later speculative read',async()=>{
  const f=setup(['{}','{}']);let n=0;f.bucket.get=()=>{n++;return n===1?Promise.reject(Error('TRANSIENT')):Promise.resolve({text:async()=>'{}'});};
  await assert.rejects(records.decodeRecordValues(f.bucket,f.envelope,{aggregateReadAhead:true}),/TRANSIENT/);assert.equal(n,1);
});
void test('same-key successful observations remain separate reads',async()=>{
  const f=setup(['{}','{}']);await records.decodeRecordValues(f.bucket,f.envelope,{aggregateReadAhead:true});assert.equal(f.events.filter(e=>e[0]==='get').length,2);assert.equal(f.counts().maxGets,1);
});
void test('eleven unique aggregates cross bounded windows with peak five GETs and serial text',async()=>{
  const f=setup(Array.from({length:11},(_,i)=>JSON.stringify({i})));
  const result=await records.decodeRecordValues(f.bucket,f.envelope,{aggregateReadAhead:true});
  assert.equal(Object.keys(result.values).length,11);assert.deepEqual(f.counts(),{maxGets:5,maxTexts:1});
  assert.deepEqual(f.events.filter(e=>e[0]==='get').map(e=>e[1]),f.entries.map(([,r])=>r.key));
  assert.equal(f.events.filter(e=>e[0]==='text').length,11);assert.deepEqual(f.cancelled,[]);
});
void test('nonadjacent duplicate aggregate stops the window without caching or skipping a later observation',async()=>{
  const f=setup(['{"a":1}','{"b":2}','{"a":1}','{"c":3}']);
  await records.decodeRecordValues(f.bucket,f.envelope,{aggregateReadAhead:true});
  for(const kind of ['get','text'])assert.deepEqual(f.events.filter(e=>e[0]===kind).map(e=>e[1]),f.entries.map(([,r])=>r.key));
  assert.equal(f.counts().maxGets,2);
});
void test('nested bodies plus unconsumed aggregate streams stay within five, not merely five pending promises',async()=>{
  const f=setup(Array.from({length:11},(_,i)=>JSON.stringify({i}))),bodyRaw='{"nested":true}',body=ref(bodyRaw);
  const firstRaw=JSON.stringify({working:{__immutableBody:body}}),first=ref(firstRaw);f.objects.set(first.key,firstRaw);f.objects.set(body.key,bodyRaw);f.envelope.__processRecords.values.business0=first;
  let open=0,peak=0,texts=0,maxTexts=0;
  f.bucket.get=async key=>{const raw=f.objects.get(key);assert.equal(typeof raw,'string');peak=Math.max(peak,++open);await tick();let consumed=false;
    const release=()=>{assert.equal(consumed,false);consumed=true;open--;};
    return{body:{async cancel(){release();}},async text(){maxTexts=Math.max(maxTexts,++texts);await tick();texts--;release();return raw;}};
  };
  const result=await records.decodeRecordValues(f.bucket,f.envelope,{aggregateReadAhead:true});
  assert.deepEqual(JSON.parse(result.values.business0),{working:{nested:true}});assert.equal(peak,5);assert.equal(maxTexts,1);assert.equal(open,0);
});
void test('all four unused late requests settle and release streams after an earlier failure',async()=>{
  const f=setup(Array.from({length:6},(_,i)=>JSON.stringify({i}))),later=[],rejected=[],cancelled=[];
  const listener=error=>rejected.push(error);process.on('unhandledRejection',listener);
  f.bucket.get=key=>key===f.entries[0][1].key?Promise.reject(Error('FIRST')):new Promise((resolve,reject)=>later.push({key,resolve,reject}));
  try{
    await assert.rejects(records.decodeRecordValues(f.bucket,f.envelope,{aggregateReadAhead:true}),/FIRST/);assert.equal(later.length,4);
    later.forEach(({key,resolve,reject},i)=>i%2?reject(Error('LATE')):resolve({text:()=>assert.fail('unused text'),body:{async cancel(){cancelled.push(key);if(i===0)throw Error('CANCEL');}}}));
    await tick();await tick();assert.deepEqual(rejected,[]);assert.deepEqual(cancelled,[later[0].key,later[2].key]);
  }finally{process.removeListener('unhandledRejection',listener);}
});
void test('invalid next reference is not fetched and does not mask an earlier integrity fault',async()=>{
  const f=setup();f.envelope.__processRecords.values.business1={key:'foreign',sha256:'a'.repeat(64)};f.objects.set(f.entries[0][1].key,'corrupt');
  await assert.rejects(records.decodeRecordValues(f.bucket,f.envelope,{aggregateReadAhead:true}),/corrupt/);assert.equal(f.events.filter(e=>e[0]==='get').length,1);
});
for(const next of [null,undefined,1,'invalid'])for(const first of ['sha','get'])void test(`malformed next ${String(next)} cannot mask current ${first} failure`,async()=>{
  for(const aggregateReadAhead of [false,true]){
    const f=setup();f.envelope.__processRecords.values.business1=next;
    f.objects.set(f.entries[0][1].key,first==='sha'?'corrupt':Error('FIRST_GET'));
    await assert.rejects(records.decodeRecordValues(f.bucket,f.envelope,{aggregateReadAhead}),first==='sha'?/corrupt/:/FIRST_GET/);
    assert.equal(f.events.filter(e=>e[0]==='get').length,1);
  }
});
void test('selection and identity-token boundaries retain excluded data and serial token reads',async()=>{
  const selected=setup();await records.decodeRecordValues(selected.bucket,selected.envelope,{aggregateReadAhead:true,keys:['business0']});assert.equal(selected.events.filter(e=>e[0]==='get').length,1);
  const token=setup();await records.decodeRecordValues(token.bucket,token.envelope,{aggregateReadAhead:true,identityReadToken:records.createIdentityReadToken()});assert.equal(token.counts().maxGets,1);
});
void test('large and unknown-size speculative objects are not read into text before their turn',async()=>{
  const f=setup(['{"a":1}',JSON.stringify({large:'x'.repeat(1024*1024)})]);let release,firstText=false;
  const get=f.bucket.get.bind(f.bucket);f.bucket.get=async key=>{const object=await get(key);delete object.size;if(key===f.entries[0][1].key){const text=object.text.bind(object);object.text=async()=>{firstText=true;await new Promise(resolve=>{release=resolve;});return text();};}return object;};
  const run=records.decodeRecordValues(f.bucket,f.envelope,{aggregateReadAhead:true});while(!firstText)await tick();
  assert(!f.events.some(([kind,key])=>kind==='text'&&key===f.entries[1][1].key));release();await run;assert.equal(f.counts().maxTexts,1);
});
void test('FQC GET rereads authority on its second snapshot and observes a later storage fault',async()=>{
  const f=await fixture();try{const key=JSON.parse(f.db.prepare('SELECT "values" FROM shared_state').get().values).__processRecords.values.platformUsers.key;let reads=0;
    f.hooks.get=received=>{if(received===key&&++reads===2)throw Error('SECOND_SNAPSHOT_FAULT');};
    const response=await f.call('/api/fqc/workflow?caseMetadata=1&compact=1');assert.equal(response.status,503);assert.equal((await response.json()).error,'WORKFLOW_LOAD_FAILED');assert.equal(reads,2);assert(!f.events.some(e=>e.kind==='sql'));
  }finally{f.close();}
});
for(const path of ['/api/fqc/workflow?caseMetadata=1','/api/fqc/workflow?caseMetadata=1&scope=other','/api/iqc/workflow?caseMetadata=1'])void test(`route opt-in remains exact: ${path}`,async()=>{
  const f=await fixture();try{
    await f.mutate(values=>{const users=JSON.parse(values.platformUsers);users[0].accessOverrides['iqc.view']=true;values.platformUsers=JSON.stringify(users);values.processAccessControl=JSON.stringify({audit:[]});});
    const refs=JSON.parse(f.db.prepare('SELECT "values" FROM shared_state').get().values).__processRecords.values;
    assert.notEqual(refs.processRoleTemplateOverrides.key,refs.processAccessControl.key);
    const events=[],get=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE);
    f.env.STATE_ARCHIVE.get=async key=>{events.push(['get',key]);const object=await get(key);if(!object)return object;return{...object,text:()=>{events.push(['text',key]);return object.text();}};};
    const route=path.startsWith('/api/iqc/')?f.load('app/api/iqc/workflow/route.ts'):f.api;
    const response=await route.GET(new Request('https://synthetic.invalid'+path,{headers:{cookie:f.cookies.editor}}));assert.equal(response.status,200);
    const overrideText=events.findIndex(([kind,key])=>kind==='text'&&key===refs.processRoleTemplateOverrides.key),accessGet=events.findIndex(([kind,key])=>kind==='get'&&key===refs.processAccessControl.key);
    assert(overrideText>=0&&accessGet>=0);
    assert.equal(accessGet<overrideText,path==='/api/fqc/workflow?caseMetadata=1','only the exact FQC route overlaps this formerly serial pair');
  }finally{f.close();}
});
for(const action of ['apply','save'])for(const missingBody of [false,true])void test(`Begin envelope with nested ${action} retains ordinary Begin reads and no command side effects; missing body=${missingBody}`,async()=>{
  const f=await fixture();try{
    const client=f.realm().client,begun=await client.begin();
    await f.mutate(values=>{values.processAccessControl=JSON.stringify({audit:[]});values.toolingMasterControl=JSON.stringify({versions:[{id:'unrelated',snapshot:{note:'retained historical body'}}]});values.sentinel='"untouched"';});
    const before=f.db.prepare('SELECT * FROM shared_state').get(),refs=JSON.parse(before.values).__processRecords.values;
    if(missingBody){const aggregate=JSON.parse(f.objects.get(refs.toolingMasterControl.key));f.objects.delete(aggregate.versions[0].snapshot.__immutableBody.key);}
    const objects=new Map(f.objects),trace=[],get=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE);
    f.env.STATE_ARCHIVE.get=async key=>{trace.push(['get',key]);const object=await get(key);if(!object)return object;return{...object,text:()=>{trace.push(['text',key]);return object.text();}};};
    const command={action,generation:begun.control.workflow.generation,operationId:'nested-command-must-not-run',clientId:'synthetic',sequence:1,patches:[{op:'set',path:['errors',{id:'error'},'name'],value:'MUST NOT APPLY'}]};
    const results=[];
    for(const body of [{action:'begin'},{action:'begin',command}]){
      trace.length=0;f.events.length=0;
      const response=await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify(body)}),payload=await response.json();
      assert.equal(response.status,missingBody?500:200);
      if(missingBody)assert.equal(payload.error,'WORKFLOW_WRITE_FAILED');else{assert.equal(payload.unchanged,true);assert.equal(payload.control.workflow.saved,null);assert.equal(payload.control.workflow.working.errors[0].name,'Synthetic error');}
      assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);assert.deepEqual(f.objects,objects);
      assert(!f.events.some(e=>e.kind==='put'||e.kind==='sql'),'Begin must not execute the nested mutation');
      const overrideText=trace.findIndex(([kind,key])=>kind==='text'&&key===refs.processRoleTemplateOverrides.key),accessGet=trace.findIndex(([kind,key])=>kind==='get'&&key===refs.processAccessControl.key);
      assert(overrideText>=0&&accessGet>overrideText,'Begin keeps serial aggregate consumption');
      if(missingBody)assert(!trace.some(([kind,key])=>kind==='get'&&key===refs.sentinel.key),'no speculative later aggregate after Begin body failure');
      results.push(structuredClone(trace));
    }
    assert.deepEqual(results[1],results[0],'nested command cannot change any Begin GET or text observation');
  }finally{f.close();}
});
for(const action of ['apply','save','matrix'])void test(`ordinary ${action} without outer action retains read overlap and verified mutation`,async()=>{
  const f=await fixture();try{
    const client=f.realm().client,begun=await client.begin();await f.mutate(values=>{values.processAccessControl=JSON.stringify({audit:[]});});
    const change={patches:[{op:'set',path:['errors',{id:'error'},'name'],value:'Expected change'}],guards:[{path:['errors',{id:'error'},'name'],value:'Synthetic error'}]};
    if(action==='save')await client.command(begun.control.workflow.generation,'apply',change);
    const refs=JSON.parse(f.db.prepare('SELECT "values" FROM shared_state').get().values).__processRecords.values,trace=[],get=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE);
    f.env.STATE_ARCHIVE.get=async key=>{trace.push(['get',key]);const object=await get(key);if(!object)return object;return{...object,text:()=>{trace.push(['text',key]);return object.text();}};};
    const matrix={moduleAction:'replace-matrix-v1',input:{products:[{code:'SYN-P',category:'SYN'}],items:[{id:'item',category:'SYN',productCodes:['SYN-P']}]}};
    await client.command(begun.control.workflow.generation,action==='matrix'?'apply':action,action==='matrix'?matrix:action==='apply'?change:undefined);
    const overrideText=trace.findIndex(([kind,key])=>kind==='text'&&key===refs.processRoleTemplateOverrides.key),accessGet=trace.findIndex(([kind,key])=>kind==='get'&&key===refs.processAccessControl.key);
    assert(accessGet>=0&&overrideText>accessGet,'ordinary mutation still overlaps selected authority GETs');
    const state=await f.state();if(action==='matrix')assert.deepEqual(state.workflow.working.items[0].productCodes,['SYN-P']);else assert.equal(state.workflow.working.errors[0].name,'Expected change');assert.equal(client.hasUnknown(),false);
    if(action==='save')assert.deepEqual(state.workflow.saved.content,state.workflow.working);else assert.equal(state.workflow.saved,null);
  }finally{f.close();}
});
for(const kind of ['save-unknown','outer-unknown','matrix-expectedRevision','matrix-patches','matrix-guards','matrix-unknown','matrix-id','matrix-input-null','matrix-input-empty','matrix-input-extra','matrix-input-array-field'])void test(`unrecognized ${kind} preserves serial fallback and fault observations`,async()=>{
  const f=await fixture();try{
    const begun=await f.realm().client.begin();
    await f.mutate(values=>{values.processAccessControl=JSON.stringify({audit:[]});values.toolingMasterControl=JSON.stringify({versions:[{id:'unrelated',snapshot:{note:'unreadable body'}}]});values.sentinel='"untouched"';});
    const before=f.db.prepare('SELECT * FROM shared_state').get(),refs=JSON.parse(before.values).__processRecords.values,aggregate=JSON.parse(f.objects.get(refs.toolingMasterControl.key));f.objects.delete(aggregate.versions[0].snapshot.__immutableBody.key);
    const objects=new Map(f.objects),trace=[],get=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE);
    f.env.STATE_ARCHIVE.get=async key=>{trace.push(['get',key]);const object=await get(key);if(!object)return object;return{...object,text:()=>{trace.push(['text',key]);return object.text();}};};
    const command={action:'apply',operationId:'fallback-operation',clientId:'fixture-client',generation:begun.control.workflow.generation,sequence:1,moduleAction:'replace-matrix-v1',input:{items:[],products:[]}},body={command};
    if(kind==='save-unknown'){command.action='save';delete command.moduleAction;delete command.input;command.unknown=true;}
    if(kind==='outer-unknown')body.unknown=true;
    if(kind==='matrix-expectedRevision')command.expectedRevision=0;
    if(kind==='matrix-patches')command.patches=[];
    if(kind==='matrix-guards')command.guards=[];
    if(kind==='matrix-unknown')command.unknown=true;
    if(kind==='matrix-id')command.operationId='bad';
    if(kind==='matrix-input-null')command.input=null;
    if(kind==='matrix-input-empty')command.input={};
    if(kind==='matrix-input-extra')command.input.extra=true;
    if(kind==='matrix-input-array-field')command.input.items=1;
    const traces=[];
    for(const input of [{action:'begin'},body]){
      trace.length=0;f.events.length=0;
      const response=await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify(input)});assert.equal(response.status,500);assert.equal((await response.json()).error,'WORKFLOW_WRITE_FAILED');
      assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);assert.deepEqual(f.objects,objects);assert(!f.events.some(e=>e.kind==='put'||e.kind==='sql'));
      assert(!trace.some(([kind,key])=>kind==='get'&&key===refs.sentinel.key));traces.push(structuredClone(trace));
    }
    assert.deepEqual(traces[1],traces[0],'fallback reads exactly the ordinary serial failure prefix');
  }finally{f.close();}
});
