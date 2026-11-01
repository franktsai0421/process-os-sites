// Six bounded, sequential shards; all registered cases must pass exactly once.
const assert=require('node:assert/strict'),path=require('node:path'),{execFileSync,spawnSync}=require('node:child_process');
const suites={
 'tests/scoped-workflow-read.test.mjs':{variable:'SCOPED_READ_SHARD',total:245},
 'tests/scoped-read-permission-phase.test.mjs':{variable:'PHASE_READ_SHARD',total:229},
 'tests/master-ab-save-record-mutation.test.mjs':{variable:'MASTER_AB_SAVE_SHARD',total:113},
};
const file=process.argv[2],spec=suites[file];assert(spec,'Explicit scoped operation suite required');
const reverse=process.argv[3]==='--reverse-order-proof';assert(process.argv.length===3||process.argv.length===4&&reverse&&spec.total===113,'Unexpected runner arguments');
const orderEnv=spec.total===113?{MASTER_AB_SAVE_TEST_ORDER:reverse?'reverse':'declared'}:{};
const root=path.resolve(__dirname,'..'),manifests=[];
for(let shard=1;shard<=6;shard++){
 const env={...process.env,...orderEnv,[spec.variable]:shard+'/6'},manifest=JSON.parse(execFileSync(process.execPath,['--max-old-space-size=128',file,'--manifest'],{cwd:root,env,encoding:'utf8',maxBuffer:2*1024*1024}));
 assert.equal(manifest.total,spec.total);assert.equal(manifest.all.length,spec.total);assert.equal(new Set(manifest.all.map(item=>item.name)).size,spec.total);
 const expected=manifest.all.filter((_item,index)=>index%6===shard-1).map(item=>item.name);if(reverse)expected.reverse();assert.deepEqual(manifest.selected,expected);
 if(manifests.length)assert.deepEqual(manifest.all,manifests[0].all);manifests.push(manifest);
}
const union=manifests.flatMap(manifest=>manifest.selected);assert.equal(union.length,spec.total);assert.equal(new Set(union).size,spec.total);assert.deepEqual([...union].sort((a,b)=>a<b?-1:a>b?1:0),manifests[0].all.map(item=>item.name).sort((a,b)=>a<b?-1:a>b?1:0));
for(let index=0;index<manifests.length;index++){
 const expected=manifests[index].selected.length,env={...process.env,...orderEnv,[spec.variable]:(index+1)+'/6'};
 const result=spawnSync(process.execPath,['--max-old-space-size=384','--test','--test-reporter=tap','--test-concurrency=1',file],{cwd:root,env,encoding:'utf8',maxBuffer:12*1024*1024});
 process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');assert.ifError(result.error);assert.equal(result.signal,null);assert.equal(result.status,0,'Shard failed');
 for(const [key,value] of Object.entries({tests:expected,pass:expected,fail:0,cancelled:0,skipped:0,todo:0})){const match=result.stdout.match(new RegExp('^# '+key+' (\\d+)\\r?$','m'));assert(match,'Missing TAP '+key);assert.equal(Number(match[1]),value,key);}
}
console.log(JSON.stringify({status:'PASS_COMPLETE_SCOPED_SHARDS',file,total:spec.total,shards:manifests.map(item=>item.selected.length),unionExactlyOnce:true,order:reverse?'reverse-within-shard':'declared-within-shard',skipped:0}));
