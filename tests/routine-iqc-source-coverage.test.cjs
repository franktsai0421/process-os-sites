const assert = require('node:assert/strict');
const {test} = require('node:test');
const {randomUUID} = require('node:crypto');
const fixture = require('../scripts/fqc-apply-fixture.cjs');

const url = 'https://synthetic.invalid/api/routine-iqc';
const today = '2026-11-21';
const rule = (id, kind, cadence = 'time', value = '') => ({id, kind, cadence, value});
const part = (id, extra = {}) => ({
  id, code: 'CODE-' + id, categoryId: 'cat', nameVi: 'TEST ONLY Vòng', supplierIds: [], photos: [], isEnabled: true, ...extra,
});
const item = (id, owner, rules, extra = {}) => ({
  id, partCode: 'CODE-' + owner, errorId: 'error-' + owner, checkNo: 'TEST-' + id,
  nameVi: 'TEST ONLY Kích thước', isEnabled: true, frequencyRaw: '', rules, ...extra,
});
const sorted = rows => [...rows].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

// Explicit independent expected identity and window. Do not reuse the product projector or calendar to derive these rows.
const expected = [
  ['alpha','mixed','w-01','weekly','2026-11-16','2026-11-22'],
  ['alpha','mixed','m-01','monthly','2026-11-01','2026-11-30'],
  ['alpha','second','q-01','quarterly','2026-10-01','2026-12-31'],
  ['beta','similar','half-01','semiannual','2026-07-01','2026-12-31'],
  ['beta','similar','y-01','yearly','2026-01-01','2026-12-31'],
  ['beta','weekly','w-01','weekly','2026-11-16','2026-11-22'],
];

void test('IQC approved catalog and persisted jobs reconcile by part, item, rule and period across all five standard frequencies', async t => {
  t.mock.timers.enable({apis:['Date'], now:new Date(today + 'T12:00:00+07:00')});
  const f = await fixture();
  t.after(() => f.close());
  const parts = [part('alpha'), part('beta'), part('inactive',{isEnabled:false}), part('deleted',{isDeleted:true})];
  const snapshot = {
    categories: [{id:'cat',nameVi:'TEST ONLY'}], suppliers: [], parts,
    errors: [...parts.map(p => ({id:'error-'+p.id,partCode:p.code,code:p.id})),
      {id:'deleted-error',partCode:'CODE-alpha',code:'OLD',isDeleted:true}],
    items: [
      item('mixed','alpha',[rule('w-02','week'),rule('w-01','week'),rule('m-01','month'),rule('on-arrival','fixed_count','batch','2')]),
      item('second','alpha',[rule('q-01','quarter')]), item('similar','beta',[rule('half-01','half_year'),rule('y-01','year')]),
      item('weekly','beta',[rule('w-01','week')]),
      item('no-time','alpha',[]), item('import-only','alpha',[],{frequencyRaw:'every month'}),
      // These are read-side compatibility controls, not valid new time rules being approved.
      item('time-without-frequency','alpha',[rule('incomplete-time','','time')]),
      item('frequency-without-time-rule','beta',[
        {...rule('source-only','source','source'),sourceTextVi:'Hằng tháng'},
      ],{frequencyRaw:'Hằng tháng'}),
      item('arrival','beta',[rule('arrival-only','fixed_count','batch','3')]),
      item('untimed','alpha',[rule('free','custom','time','45 days')]),
      item('invalid-value','beta',[rule('misconfigured','month','time','7')]),
      item('inactive-part','inactive',[rule('x','week')]), item('deleted-part','deleted',[rule('x','week')]),
      item('disabled-item','alpha',[rule('x','week')],{isEnabled:false}),
      item('deleted-item','alpha',[rule('x','week')],{isDeleted:true}),
      item('unlinked','alpha',[rule('x','week')],{errorId:'error-beta'}),
      item('deleted-error','alpha',[rule('x','month')],{errorId:'deleted-error'}),
    ],
  };
  const active = {id:'approved',number:1,status:'approved',createdAt:'2026-01-01T00:00:00+07:00',snapshot};
  const draft = {...active,id:'draft',number:2,status:'draft',snapshot:{...snapshot,items:[item('not-approved','alpha',[rule('x','week')])]}};
  const master = JSON.stringify({schemaVersion:1,versions:[active,draft],activeVersionId:'approved'});
  await f.mutate(values => {
    const [user] = JSON.parse(values.platformUsers);
    const owner = {...user,id:'frank',role:'admin',accessOverrides:{...user.accessOverrides,'routine.view':true,'routine.edit':true,'routine.settings':true,'iqc.view':true}};
    values.platformUsers = JSON.stringify([user,owner]);
    values.routineFqcEnabled = '1';
    values.iqcMasterControl = master;
  });
  const route = f.load('app/api/routine-iqc/route.ts');
  const req = new Request(url);
  let cookie = f.core.sessionCookie(req,await f.core.demoSession(req,'frank',false,1)).split(';')[0];
  async function call(body){
    const method = body ? 'POST' : 'GET';
    const response = await route[method](new Request(url,{method,headers:{origin:new URL(url).origin,cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
    const result = await response.json();
    assert.equal(response.status,200,JSON.stringify(result.error));
    return result;
  }
  let current = await call();
  assert.equal(current.jobs.length,0);
  assert.equal(current.catalog.versionId,'approved');
  for(const excluded of ['time-without-frequency','frequency-without-time-rule']){
    assert(!current.catalog.items.some(row => JSON.parse(row.id)[0]===excluded),excluded);
  }
  assert.deepEqual(sorted(current.catalog.items.map(row => [row.productCodes[0],...JSON.parse(row.id),row.frequency])),
    sorted(expected.map(([owner,id,ruleId,cadence]) => ['CODE-'+owner,id,ruleId,cadence])));
  async function command(action, fields = {}){
    await call({action,operationId:randomUUID(),expectedRevision:current.revision,...fields});
    current = await call();
  }
  const preview=await route.GET(new Request(url+'?preview=1&start='+today,{headers:{cookie}}));
  assert.equal(preview.status,200);
  const projected=await preview.json(),expectedCounts=new Map();
  for(const row of expected){
    const period=row[4]+' ~ '+row[5];
    expectedCounts.set(period,(expectedCounts.get(period)||0)+1);
  }
  assert.deepEqual(sorted(projected.periods),sorted(expectedCounts.entries()));assert.equal(projected.total,expected.length);
  assert.deepEqual(sorted(projected.jobs.map(j=>[j.code,j.start,j.end])),sorted(expected.map(r=>['TEST-'+r[1],r[4],r[5]])));
  assert.equal((await call()).stateRevision,current.stateRevision);
  await command('configure',{start:today,reason:'TEST ONLY',confirm:'START IQC',scope:'routine-iqc-only',startAck:true,expectedStateRevision:current.stateRevision});
  const jobRows = jobs => sorted(jobs.map(({source,start,end}) => {
    assert.equal(source.versionId,'approved');
    assert.deepEqual(JSON.parse(source.id),[source.iqc.itemId,source.iqc.ruleId]);
    assert.deepEqual(source.products.map(p => p.code),['CODE-'+source.iqc.partId]);
    return [source.iqc.partId,source.iqc.itemId,source.iqc.ruleId,source.frequency,start,end];
  }));
  await command('generate');
  assert.deepEqual(jobRows(current.jobs),sorted(expected));
  const firstIds = current.jobs.map(job=>job.id).sort();
  assert.equal(new Set(firstIds).size,expected.length);
  await command('generate');
  assert.deepEqual(current.jobs.map(job=>job.id).sort(),firstIds);
  assert.deepEqual(jobRows(current.jobs),sorted(expected));
  const persisted = await f.core.readState();
  assert.deepEqual(jobRows(JSON.parse(persisted.values.routineIqcControl).calendar.jobs),sorted(expected));
  assert.equal(persisted.values.iqcMasterControl,master);

  // Open only the weekly duty. Its monthly sibling is an existing period for the same item.
  const siblings=current.jobs.filter(job=>job.source.iqc.itemId==='mixed');
  const weekly=siblings.find(job=>job.calendar.frequency==='weekly');
  const monthly=siblings.find(job=>job.calendar.frequency==='monthly');
  await command('create-plan',{jobIds:[weekly.id],start:today,end:today});
  const oldPlan=current.documents.find(doc=>doc.jobs.some(job=>job.id===weekly.id));
  const renamed=structuredClone(active);
  renamed.id='approved-renumber';renamed.number=2;renamed.createdAt=today+'T08:00:00+07:00';
  renamed.snapshot.items.find(row=>row.id==='mixed').checkNo='QC INCOMING 781';
  await f.mutate(values=>{values.iqcMasterControl=JSON.stringify({schemaVersion:1,versions:[active,{...renamed,status:'pending'}],activeVersionId:active.id});});
  assert.equal((await call()).jobs.find(job=>job.id===monthly.id).source.code,monthly.source.code);
  await f.mutate(values=>{values.iqcMasterControl=JSON.stringify({schemaVersion:1,versions:[{...active,status:'superseded'},renamed],activeVersionId:renamed.id});});
  current=await call();
  assert.deepEqual(current.jobs.map(job=>job.id).sort(),firstIds);
  assert.equal(current.jobs.find(job=>job.id===weekly.id).source.code,weekly.source.code);
  assert.equal(current.documents.find(doc=>doc.id===oldPlan.id).jobs[0].source.code,weekly.source.code);
  const displayed=current.jobs.find(job=>job.id===monthly.id);
  assert.equal(displayed.source.code,'QC INCOMING 781');
  assert.equal(displayed.source.errorCode,monthly.source.errorCode);
  assert.deepEqual([displayed.itemId,displayed.start,displayed.end,displayed.period,displayed.calendar.frequency],
    [monthly.itemId,monthly.start,monthly.end,monthly.period,monthly.calendar.frequency]);
  assert.equal(displayed.source.iqc.ruleId,monthly.source.iqc.ruleId);
  await command('create-plan',{jobIds:[monthly.id],start:today,end:today});
  const newPlan=current.documents.find(doc=>doc.jobs.some(job=>job.id===monthly.id));
  assert.equal(newPlan.jobs[0].source.code,'QC INCOMING 781');
  assert.equal(newPlan.jobs[0].source.iqc.itemId,oldPlan.jobs[0].source.iqc.itemId);
  t.mock.timers.tick(35*86400000);
  cookie=f.core.sessionCookie(req,await f.core.demoSession(req,'frank',false,1)).split(';')[0];
  await command('generate');
  assert(current.jobs.some(job=>job.source.iqc.itemId==='mixed'&&job.start>today&&job.source.code==='QC INCOMING 781'));

});

test('after IQC Reset, same-day frequency approval previews only jobs a new plan can use',async t=>{
  const {origin}=require('../scripts/routine-reset-authority-fixture.cjs');
  const day='2026-11-24';
  t.mock.timers.enable({apis:['Date'],now:new Date(day+'T12:00:00+07:00')});
  const {f,cookie,call:reset}=await require('../scripts/fqc-reset-request-fixture.cjs')(t,{format:'records'});
  const before=()=>f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
  await f.mutate(values=>{
    const parts=['a','b','c'].map(id=>part(id));
    const snapshot={categories:[],suppliers:[],parts,errors:parts.map(p=>({id:'error-'+p.id,partCode:p.code,code:p.id})),
      items:['a','b'].map(id=>item(id,id,[rule('rule-'+id,'week')]))};
    const current=structuredClone(snapshot);
    for(const i of current.items)i.rules[0].kind='half_year';
    current.items.push(item('c','c',[rule('rule-c','month')]));
    const old={id:'old',number:1,status:'superseded',createdAt:'2026-09-01T00:00:00+07:00',snapshot,
      history:[{action:'approve',actorId:'reviewer',at:'2026-09-01T01:00:00+07:00'}]};
    values.iqcMasterControl=JSON.stringify({activeVersionId:'current',versions:[old,
      {id:'current',number:2,status:'approved',createdAt:day+'T09:00:00+07:00',snapshot:current}]});
  });
  const done=await reset('iqc','frank',{id:'reset-synthetic-freq',scope:'iqc',confirm:'RESET IQC',irreversibleAck:true,
    reason:'synthetic',revision:before().revision,pendingCount:0});
  assert.equal(done.status,200);
  const route=f.load('app/api/routine-iqc/route.ts'),headers={origin,cookie:await cookie('frank'),'content-type':'application/json'};
  async function request(query='',body){
    const method=body?'POST':'GET';
    return route[method](new Request(origin+'/api/routine-iqc'+query,{method,headers,...(body?{body:JSON.stringify(body)}:{})}));
  }
  const initial=await (await request()).json(),stored=before();
  const preview=await (await request('?preview=1&start='+day)).json();
  const columns=j=>[j.code,j.start,j.end];
  const expected=[['TEST-a','2026-07-01','2026-12-31'],['TEST-b','2026-07-01','2026-12-31'],['TEST-c','2026-11-01','2026-11-30']];
  assert.deepEqual(sorted(preview.jobs.map(columns)),sorted(expected));assert.equal(preview.total,3);
  assert.deepEqual(sorted(preview.periods),sorted([['2026-07-01 ~ 2026-12-31',2],['2026-11-01 ~ 2026-11-30',1]]));
  assert.deepEqual(before(),stored);
  const start=await request('',{action:'configure',operationId:randomUUID(),expectedRevision:initial.revision,
    expectedStateRevision:initial.stateRevision,start:day,scope:'routine-iqc-only',confirm:'START IQC',reason:'synthetic restart',startAck:true});
  assert.equal(start.status,200);
  const live=await (await request()).json();assert.equal(live.jobs.length,5);
  const stopped=live.jobs.filter(j=>j.calendar.stopped);
  assert.equal(stopped.length,2);assert(stopped.every(j=>j.start==='2026-11-23'&&j.end==='2026-11-29'));
  assert(stopped.every(j=>j.canPlan===false));
  const selectable=live.jobs.filter(j=>j.canPlan);
  assert.deepEqual(sorted(selectable.map(j=>columns({...j,code:j.source.code}))),sorted(expected));
  const plan=ids=>request('',{action:'create-plan',operationId:randomUUID(),expectedRevision:live.revision,jobIds:ids,start:day,end:day});
  assert.equal((await plan([stopped[0].id])).status,409);
  assert.equal((await plan(selectable.map(j=>j.id))).status,200);
  const planned=await (await request()).json();
  assert.equal(planned.documents.length,1);assert(planned.jobs.every(j=>j.canPlan===false));
  assert.equal(planned.jobs.filter(j=>j.planId===planned.documents[0].id).length,3);
});
