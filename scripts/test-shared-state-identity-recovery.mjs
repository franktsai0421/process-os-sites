import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const source=fs.readFileSync('public/process/shared-state.js','utf8'),setter=source.slice(source.indexOf('  api.setPlatformIdentity ='),source.indexOf('  api.getPlatformPassword =')),functions=source.slice(source.indexOf('  function preserveRecovery()'),source.indexOf('  function apply(shared)'));
const storage=new Map(),ctx={window:{},api:{identity:{id:'frank'}},identityEpoch:2,platformCredential:null,blocked:false,paused:false,timer:0,dirty:{processEditor:'old frank input'},dirtyOwner:'frank',inFlightUpdates:{master:'unknown in flight'},inFlightOwner:'frank',revision:7,baseline:{processEditor:'saved',master:'saved'},quarantined:new Map(),sessionStorage:{},originalSet:{call(_storage,key,value){storage.set(key,value);}},clearTimeout(){},Date,console};
vm.createContext(ctx);
vm.runInContext(functions+setter,ctx);

ctx.api.setPlatformIdentity({id:'frank'});
assert.equal(ctx.identityEpoch,3);
let saved=JSON.parse(storage.get('process-unsynced-recovery:frank'));
assert.equal(saved.actorId,'frank');
assert.equal(saved.updates.processEditor,'old frank input');
assert.equal(saved.updates.master,'unknown in flight');
assert.equal(Object.keys(ctx.dirty).length,0);

ctx.dirty={processEditor:'new frank input'};
ctx.dirtyOwner='frank';
vm.runInContext('preserveRecovery()',ctx);
saved=JSON.parse(storage.get('process-unsynced-recovery:frank'));
assert.equal(saved.updates.processEditor,'new frank input');
assert.equal(saved.previous.length,1);
assert.equal(saved.previous[0].updates.processEditor,'old frank input');

ctx.api.setPlatformIdentity({id:'demo-admin'});
ctx.dirty={processEditor:'demo input'};
ctx.dirtyOwner='demo-admin';
vm.runInContext('preserveRecovery()',ctx);
const demo=JSON.parse(storage.get('process-unsynced-recovery:demo-admin'));
assert.deepEqual(demo.updates,{processEditor:'demo input'});
assert(!('master'in demo.updates));
saved=JSON.parse(storage.get('process-unsynced-recovery:frank'));
assert.equal(saved.previous[0].updates.processEditor,'old frank input');
assert.equal(saved.updates.processEditor,'new frank input');

console.log(JSON.stringify({status:'PASS',cases:['same-ID fresh generation quarantines dirty and unknown input','fresh same-account input retains prior generation instead of overwriting it','old in-flight content does not leak into new account recovery','other actor recovery unchanged'],networkRequests:0,browserOperations:0}));