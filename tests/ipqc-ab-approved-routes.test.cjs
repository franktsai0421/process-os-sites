const assert = require('node:assert/strict');
const test = require('node:test');
const fixture = require('../scripts/test-master-page-runtime.cjs');

for (const record of [false, true]) {
  test('approved AB and LINES drive both readers (' + (record ? 'records' : 'inline') + ')', async t => {
    const f = await fixture(record);
    t.after(() => f.close());
    const values = {...f.values, bomOverrides: JSON.stringify({replaceAll:true, data:{}})};
    await f.install(values);
    async function read(path) {
      const endpoint = path.split('?')[0];
      const response = await f.load('app/api/' + endpoint + '/route.ts').GET(
        new Request(f.base + '/api/' + path, {headers:{cookie:f.cookies.writer, origin:f.base, 'X-Process-Media':'deferred-v1'}})
      );
      return {status:response.status, body:await response.json()};
    }
    const quality = 'ipqc-ab?caseMetadata=1&equipment=deferred';
    const editor = 'process-bootstrap?system=process&view=editor';
    async function verify(expected) {
      const before = f.metrics();
      const ipqc = await read(quality), canvas = await read(editor);
      assert.equal(ipqc.status, 200);
      assert.equal(canvas.status, 200);
      assert.deepEqual(ipqc.body.catalog.groups, expected.map(group =>
        group.defaultStages === null ? {line:group.line,name:group.name} : group));
      assert.deepEqual(canvas.body.catalog.categoryGroups, expected);
      assert.deepEqual(ipqc.body.catalog.stages.map(s => s.code), ['A-1']);
      assert.deepEqual(f.metrics(), before);
    }
    const groups = [{line:'A',name:'SYN-GROUP',defaultStages:['A-1']},{line:'A',name:'SYN-LEGACY'},
                    {line:'A',name:'SYN-REMOVED',defaultStages:null},{line:'A',name:'SYN-EMPTY',defaultStages:[]}];
    const rows = groups.map((g,index)=>({id:'stable-synthetic-group-'+index,...g}));
    await verify([]);
    let control = await f.begin('AB');
    const save = f.save(control, [{patches:rows.map(value=>({op:'insert',path:['categoryGroups'],value})),
                                   guards:[{path:['products'], value:[]}]}]);
    async function step(command, actor = 'writer') {
      const result = await f.send('AB', {command}, actor);
      assert.equal(result.status, 200, result.body.error);
      return result.body.control;
    }
    control = await step(save);
    assert.deepEqual((await f.send('AB')).body.control.workflow.saved.content.categoryGroups, rows);
    await verify([]);
    control = await step(f.command(control, 'submit', {reason:'Synthetic route', savedId:control.workflow.saved.id,
                                                       expectedRevision:control.workflow.revision}));
    await verify([]);
    await step(f.command(control, 'approve', {reason:'Synthetic approval', caseId:control.workflow.pendingId,
                                               expectedRevision:control.workflow.revision}), 'reviewer');
    await verify(groups);
    const root = await f.readRoot();
    assert.deepEqual(root.active['AB.catalog'].categoryGroups, rows);
    root.active.AB.categoryGroups = [];
    root.active.AB.lines = [];
    await f.install({...values, masterDataControl:JSON.stringify(root)}, 90);
    await verify(groups);
    root.workflowScopes['AB.catalog'].active.id = 'unapproved';
    await f.install({...values, masterDataControl:JSON.stringify(root)}, 91);
    assert.equal((await read(quality)).status, 503);
    assert.equal((await read(editor)).status, 503);
  });
}
