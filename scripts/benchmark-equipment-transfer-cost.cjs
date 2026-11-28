// All records and accounts are synthetic. The UI calls the real route modules in process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createTransferFixture } = require('./equipment-transfer-fixture.cjs');
const { fixture } = require('./quality-replacement-preview-fixture.cjs');
const { connect } = require('./test-routine-equipment-isolated-workflow.cjs');

function scaleTransferValues(values) {
  // Immutable process editor workspaces with ordinary notes, unrelated to quality.
  for (let i = 0; i < 48; i++) {
    values['processEditor:synthetic-' + i] = JSON.stringify({ snapshot: {
      blocks: Array.from({length: 512}, (_, j) => ({id: i + '-' + j, text: 'Synthetic inspection note. '.repeat(16)}))
    }});
  }
  // Preserve all version/workflow aliases by applying the same stable-ID
  // expansion to every ordinary AB snapshot, including whole-module saves.
  const ab=JSON.parse(values.ipqcABMasterControl);
  const expand=value=>{
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value.errors)&&Array.isArray(value.items)&&value.items.length){
      const item=value.items[0];
      for(let i=10;i<90;i++)value.items.push({...item,id:item.id+'-extra-'+i,code:item.code.replace(/-\d+$/,'-'+i),
        inspectionMode:'visual',equipmentId:'',equipmentSnapshot:null,methodText:'Synthetic inspection instruction. '.repeat(10)});
      return;
    }
    for(const child of Object.values(value))expand(child);
  };
  expand(ab);
  values.ipqcABMasterControl=JSON.stringify(ab);
}
module.exports={scaleTransferValues};

async function run() {
  const [seedFile, reportFile] = process.argv.slice(2);
  if (!reportFile) {
    const seed = await createTransferFixture({ paired: true, secondABGroup: true });
    try {
      const values = (await seed.core.readState()).values;
      delete values.platformUsers;
      scaleTransferValues(values);
      const photos = [...seed.objects].filter(([key]) => key.includes('/photos/')).map(([k,b])=>[k,b.toString('base64')]);
      fs.writeFileSync(seedFile, JSON.stringify({values,photos}));
    } finally { seed.close(); }
    return;
  }
  const seed = JSON.parse(fs.readFileSync(seedFile));
  const report = [];
  for (const [module, button] of [['fqc','fqc'], ['iqc','iqc'], ['ipqc-ab','ipqcAB'], ['ipqc-c','ipqcC']]) {
    const h = await fixture(seed.values, {includeIPQCC:true});
    try {
      for(const [key,photo] of seed.photos) h.objects.set(key,Buffer.from(photo,'base64'));
      const f = await connect(h);
      const rawFetch = f.c.fetch;
      const get = h.env.STATE_ARCHIVE.get.bind(h.env.STATE_ARCHIVE);
      let gets=0, bytes=0, lastCommand=null;
      const puts=[],commits=[];
      const put=h.env.STATE_ARCHIVE.put.bind(h.env.STATE_ARCHIVE);
      h.env.STATE_ARCHIVE.put=async(...args)=>{puts.push(performance.now());return put(...args);};
      const prepare=h.env.DB.prepare.bind(h.env.DB);
      h.env.DB.prepare=sql=>{
        if(/^UPDATE shared_state SET revision=/i.test(sql))commits.push(performance.now());
        return prepare(sql);
      };
      h.env.STATE_ARCHIVE.get = async key => {
        gets++; bytes+=h.objects.get(key)?.length || 0;
        return get(key);
      };
      f.c.fetch = async (url,options={})=>{
        const start=performance.now(), g=gets, b=bytes, putCount=puts.length, commitCount=commits.length;
        if(options.body)lastCommand=JSON.parse(options.body).command;
        const res=await rawFetch(url,options);
        const path=new URL(url,'http://fixture');
        const body=await res.arrayBuffer();
        report.push({module,method:options.method||'GET',path:path.pathname,operation:path.searchParams.has('operationId'),ms:Math.round(performance.now()-start),archiveGets:gets-g,archiveBytes:bytes-b,responseBytes:body.byteLength,status:res.status,
          firstPutMs:puts[putCount]===undefined?null:Math.round(puts[putCount]-start),
          casMs:commits[commitCount]===undefined?null:Math.round(commits[commitCount]-start),
          puts:puts.length-putCount});
        return new Response(body,{status:res.status,headers:res.headers});
      };
      if(module==='ipqc-ab')assert.equal((await f.c.fetch('/api/ipqc-ab?references=source')).status,200);
      const current=()=>h.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
      const before=current();
      f.test.openTransferModal('source');
      const wait=async predicate=>{const start=performance.now();while(!predicate()){if(performance.now()-start>60000)throw Error('Fixture timed out');await new Promise(r=>setTimeout(r,5));}};
      await wait(()=>f.test.dialog.preview || f.test.dialog.previewError);
      assert(f.test.dialog.preview, f.test.dialog.previewError);
      f.test.dialog.targetEqId='target';
      await f.test.executeTransfer(button);
      assert.equal(f.test.dialog.moduleStatus[button],'success',f.test.dialog.moduleMessages[button]);
      await wait(()=>!f.test.dialog.refreshing);
      const after=current();
      assert.equal(after.revision,before.revision+1);
      const owner={fqc:'qualityMasterControl',iqc:'iqcMasterControl','ipqc-ab':'ipqcABMasterControl','ipqc-c':'ipqcCMasterControl'}[module];
      const siblings=row=>{
        const envelope=JSON.parse(row.values);
        delete envelope.__processRecords.values[owner];
        delete envelope.__processRecords.allocations[owner];
        return envelope;
      };
      assert.deepEqual(siblings(before),siblings(after));
      assert(lastCommand?.operationId);
      const query=new URLSearchParams({caseMetadata:'1',compact:'1',operationId:lastCommand.operationId});
      if(module==='ipqc-ab')query.set('module','1');
      const lookup=await f.c.fetch('/api/'+module+'/workflow?'+query,{headers:{'X-Process-Equipment-Transfer':'metadata-v1'}});
      assert.equal((await lookup.json()).receipt.operationId,lastCommand.operationId);
      f.close();
    } finally {h.close();}
  }
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
