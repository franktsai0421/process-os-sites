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
  const cookie = f.core.sessionCookie(req,await f.core.demoSession(req,'frank',false,1)).split(';')[0];
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
});
