// Paired pure-function regression: actual UI source; no browser, network, timers, or state writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
// Frozen pre-index function from reviewed b7e341 candidate / FINAL21 routine source.
const historical = "function snapshotChanges(base,next){const patches=[],guards=[],fields={equipment:['name','unit','spec','owner','enabled','calibrationMethod','calibrationCycle','customCycle','calibratedAt','expiresAt','notes','intakeDate','confirmed','photoId','photoHidden','groupId'],groups:['name','nameZh','nameVi','photoId','spec','notes','categoryId','subcategoryId'],categories:['name','photoId'],subcategories:['name','categoryId','photoId'],issues:['status','resolution']};\n    for(const collection of Object.keys(fields)){\n      for(const old of base[collection]||[])if(!(next[collection]||[]).some(r=>r.id===old.id)){const path=[collection,{id:old.id}];patches.push({op:'remove',path});guards.push({path,value:old});}\n      for(const row of next[collection]||[]){const old=(base[collection]||[]).find(r=>r.id===row.id);if(!old){patches.push({op:'insert',path:[collection],value:row});continue;}\n        for(const field of fields[collection])if(row[field]!==undefined&&JSON.stringify(row[field])!==JSON.stringify(old[field])&&!(row[field]===''&&old[field]==null)){const path=[collection,{id:row.id},field];patches.push({op:'set',path,value:row[field]});guards.push({path,value:old[field]});}\n      }\n    }return{patches,guards};\n  }";
const historicalSha = "89f81602f0ce8bc29ac0bf3bf05b511ffe4ee2a7a91333f7c94b5cfe17295f6b";
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/process/routine-equipment.js'), 'utf8');
const current = source.match(/  function snapshotChanges\(base,next\)\{[\s\S]*?\n  \}/)?.[0].trim();
assert(current, 'actual snapshotChanges source is required');
assert.equal(createHash('sha256').update(historical).digest('hex'), historicalSha);
const { before, after } = vm.runInNewContext(`({before:(${historical}),after:(${current})})`);
const results = [], timings = [], counts = [];
function check(name, task) { try { task(); results.push({ name, status: 'PASS' }); } catch (error) { results.push({ name, status: 'FAIL', error: error.stack }); } }
const collections = ['equipment', 'groups', 'categories', 'subcategories', 'issues'];
const fields = { equipment: ['name','unit','spec','owner','enabled','calibrationMethod','calibrationCycle','customCycle','calibratedAt','expiresAt','notes','intakeDate','confirmed','photoId','photoHidden','groupId'], groups: ['name','nameZh','nameVi','photoId','spec','notes','categoryId','subcategoryId'], categories: ['name','photoId'], subcategories: ['name','categoryId','photoId'], issues: ['status','resolution'] };
const copy = value => structuredClone(value);
const rows = n => Array.from({ length: n }, (_, i) => ({ id: 'row-' + i, name: 'name-' + i, notes: 'notes', photoId: 'existing-photo-' + i }));
function paired(base, next) {
  const originalBase = copy(base), originalNext = copy(next);
  const expected = before(base, next), actual = after(base, next);
  assert.deepEqual(actual, expected, 'exact ordered patches and guards, including undefined fields');
  assert.deepEqual(base, originalBase, 'base is immutable'); assert.deepEqual(next, originalNext, 'next is immutable');
  return actual;
}
for (const collection of collections) for (const n of [0, 1, 31, 32, 33, 99, 100, 101]) check(collection + ' size ' + n + ' unchanged/changed/insert/remove', () => {
  const base = { [collection]: rows(n) }, next = copy(base);
  paired(base, next);
  if(n) next[collection][n - 1][fields[collection][0]] = 'changed';
  next[collection].push({ id: 'inserted', name: 'new', status: 'open' });
  if(n > 1) next[collection].splice(1, 1);
  paired(base, next);
});
for(const collection of collections) check(collection + ' all fields, original first duplicate and output order', () => {
  const base = { [collection]: rows(120) }, next = copy(base);
  base[collection].splice(8, 0, { ...base[collection][1], name: 'later duplicate' });
  next[collection].reverse(); next[collection].push({ ...next[collection][0] });
  for(const [i, field] of fields[collection].entries()) next[collection][i][field] = i % 2 ? null : 'changed';
  paired(base, next);
});
for(const [index,invalid] of [undefined, null, 0, -0, false, NaN, 42, { invalid: true }].entries()) check('legacy non-string ID fallback ' + index, () => {
  const base = { equipment: rows(120) }, next = copy(base);
  base.equipment[10].id = invalid; next.equipment[10].id = invalid; next.equipment[11].name = 'changed';
  paired(base, next);
});
check('empty/prototype/Unicode string IDs and duplicate first-match preserve exact references', () => {
  const base={equipment:rows(120)},next=copy(base);
  for(const [i,id] of ['', '__proto__', 'constructor', '檢具-đ', 'é', 'é'].entries()){base.equipment[i].id=id;next.equipment[i].id=id;}
  const removed=base.equipment[8],inserted={id:'new',name:'new'};
  base.equipment.push({...base.equipment[0],name:'later duplicate'});
  next.equipment.splice(8,1);next.equipment.push(inserted);next.equipment[0].name='new name';
  const actual=paired(base,next);
  assert.equal(actual.guards.find(guard=>guard.path.length===2).value,removed,'remove guard keeps original row reference');
  assert.equal(actual.patches.find(patch=>patch.op==='insert').value,inserted,'insert keeps original row reference');
  const oldName=actual.guards.find(guard=>guard.path[1]?.id===''&&guard.path[2]==='name');assert.equal(oldName.value,'name-0');
});
check('sparse or nonarray malformed collections preserve throw/return behavior', () => {
  const sparse=[];sparse.length=120;for(const [index,row] of rows(120).entries())if(index!==4)sparse[index]=row;
  for(const value of [sparse, {length:120}, 'legacy-not-an-array', new Set(rows(120))])for(const side of ['base','next']){
    const base={equipment:rows(120)},next=copy(base);(side==='base'?base:next).equipment=value;
    let expected,actual,oldError,newError;try{expected=before(base,next);}catch(error){oldError=error.name;}
    try{actual=after(base,next);}catch(error){newError=error.name;}
    assert.equal(newError,oldError);if(!oldError)assert.deepEqual(actual,expected);
  }
});
check('missing collections and nullish optional fields retain original no-change behavior', () => {
  paired({}, {});
  for(const val of [undefined, null, '', false, 0, [], { key: 'value' }]) {
    const base = { equipment: rows(120) }, next = copy(base);
    base.equipment[0].name = val; next.equipment[0].name = ''; next.equipment[1].photoId = undefined;
    paired(base, next);
  }
});
check('malformed rows still throw rather than silently dropping guards', () => {
  for(const key of ['base','next']) {
    const base={equipment:rows(120)},next=copy(base);(key==='base'?base:next).equipment[5]=null;
    assert.throws(()=>before(base,next));assert.throws(()=>after(base,next));
  }
});
check('index lifetime does not survive successive draft mutation or cross-collection ID reuse', () => {
  const base=Object.fromEntries(collections.map(name=>[name,rows(120)])),next=copy(base);
  for(let i=0;i<5;i++){next[collections[i]][0][fields[collections[i]][0]]='changed-'+i;paired(base,next);}
  base.equipment[0].name='new baseline';next.equipment[0].name='new working';paired(base,next);
});
let seed=731;
function random(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
for(let sample=0;sample<100;sample++)check('deterministic paired draft '+sample,()=>{
  const base=Object.fromEntries(collections.map(name=>[name,rows(100+random(40))])),next=copy(base);
  for(const collection of collections){const data=next[collection];for(let i=0;i<12;i++){
    const index=random(data.length),operation=random(4);
    if(operation===0)data.splice(index,1);else if(operation===1)data.push({...data[index],id:'added-'+sample+'-'+i});
    else if(operation===2)data[index][fields[collection][random(fields[collection].length)]]=['changed',null,false,0][random(4)];
    else data.unshift({...data[index]});
  }}paired(base,next);
});
for(const n of [10,32,100,1000,5000])check('bounded work and paired CPU '+n,()=>{
  const base={equipment:rows(n)},next=copy(base);next.equipment[n-1].name='changed';paired(base,next);
  // No elapsed-time pass threshold: timings are noisy single-process JS measurements, not site latency.
  before(base,next);after(base,next);const samples=[];
  for(let i=0;i<5;i++){let oldMs,newMs;
    for(const [name,fn] of i%2?[['after',after],['before',before]]:[['before',before],['after',after]]){
      const start=performance.now();fn(base,next);const ms=performance.now()-start;if(name==='before')oldMs=ms;else newMs=ms;
    }samples.push({beforeMs:+oldMs.toFixed(4),afterMs:+newMs.toFixed(4)});
  }
  timings.push({rowsPerSide:n,pairs:samples});
  const observed={};for(const [name,fn] of [['before',before],['after',after]]){
    let reads=0;const measured=changed=>({equipment:Array.from({length:n},(_,i)=>({get id(){reads++;return 'row-'+i;},name:changed&&i===n-1?'changed':'name-'+i}))});
    const output=fn(measured(false),measured(true));assert.equal(output.patches.length,1);assert.equal(output.guards.length,1);observed[name]=reads;
  }
  if(n<100)assert.equal(observed.after,observed.before);else {assert(observed.after<=n*12+10);assert(observed.after<observed.before);}
  counts.push({rowsPerSide:n,idPropertyReads:observed});
});
const failures=results.filter(row=>row.status==='FAIL');
console.log(JSON.stringify({status:failures.length?'FAIL_SNAPSHOT_LOOKUP':'PASS_SNAPSHOT_LOOKUP',cases:results.length,passed:results.length-failures.length,failed:failures.length,historicalSha,currentSha:createHash('sha256').update(current).digest('hex'),counts,timings,results,limits:['Pure in-memory actual function; no browser, network, database, wall-clock server delay, or real business records','CPU samples use ordinary objects; separate getter counters only measure lookup work, not user data size or site latency','Small or non-string-ID collections retain original scans; temporary Map/Set only for this synchronous call, no persistent cache','No authority/CAS/receipt/failure checks removed and no I/O reduction claimed']}));
if(failures.length)process.exitCode=1;
