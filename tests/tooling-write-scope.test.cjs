const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const test = require('node:test');
const fixture = require('../scripts/tooling-local-save-fixture.cjs');

test('plain Save, local Save and Submit read only their tooling and approved IQC dependencies',async t=>{
  const f=await fixture();
  try {
    await f.rights('editor',{submit:true});
    await f.mutate(values=>{
      const c=JSON.parse(values.toolingMasterControl);
      const tools=c.versions[0].snapshot.tools;
      for(let i=tools.length;i<368;i++)tools.push({...f.tool('synthetic-'+i),nameZh:'',manufacturerId:''});
      values.toolingMasterControl=JSON.stringify(c);
      values.processAuthoringControl=JSON.stringify({workflow:{working:{text:'x'.repeat(4*1024*1024)}}});
    });
    const manifest=()=>JSON.parse(f.db.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values).__processRecords;
    const ref=manifest().values.processAuthoringControl;
    const body=JSON.parse(f.objects.get(ref.key)).workflow.working.__immutableBody;
    const results=[];
    const begin=await f.call({action:'begin'});
    assert.equal(begin.status,200);
    const generation=begin.body.control.workflow.generation;
    const command=(action,details={})=>({action,generation,operationId:randomUUID(),clientId:randomUUID(),sequence:1,...details});
    const patch=(before,after)=>{const path=['tools',{id:'one'},'notes'];return {patches:[{op:'set',path,value:after}],guards:[{path,value:before}]};};
    const apply=await f.call({command:command('apply',patch('','plain save purpose'))});
    assert.equal(apply.status,200);
    const run=async(label,cmd)=>{
      const before=manifest();
      f.events.length=0;
      const result=await f.call({command:cmd});
      const reads=f.events.filter(e=>e.kind==='get'&&(e.key===ref.key||e.key===body.key));
      results.push([label,reads.length,reads.reduce((n,r)=>n+f.objects.get(r.key).length,0)]);
      assert.equal(result.status,200,JSON.stringify(result.body.error));
      const after=manifest();
      for(const k of Object.keys(before.values).filter(k=>k!=='toolingMasterControl'))assert.deepEqual(after.values[k],before.values[k]);
      assert.deepEqual(after.legacySources,before.legacySources);
      const receipt=await f.call(undefined,'editor','&operationId='+cmd.operationId);
      assert.equal(receipt.status,200);
      assert.equal(receipt.body.receipt.operationId,cmd.operationId);
      const replay=await f.call({command:cmd});
      assert.equal(replay.status,200);
      assert.equal(replay.body.receipt.operationId,cmd.operationId);
      return result.body.control.workflow;
    };
    const first=await run('plain',command('save'));
    assert.equal(first.saved.content.tools[0].notes,'plain save purpose');
    const saved=await run('local',command('save',{moduleAction:'save-local-v1',...patch('plain save purpose','local edit')}));
    assert.equal(saved.saved.content.tools.length,368);
    assert.equal((await f.read()).workflow.saved.id,saved.saved.id);
    const pending=await run('submit',command('submit',{savedId:saved.saved.id,expectedRevision:saved.revision,reason:'Synthetic review'}));
    assert.equal(pending.cases.find(c=>c.id===pending.pendingId).savedId,saved.saved.id);
    t.diagnostic(JSON.stringify(results));
    assert(results.every(([,count])=>count===0),'unrelated body/manifest reads must be zero');
  } finally {f.close();}
});
