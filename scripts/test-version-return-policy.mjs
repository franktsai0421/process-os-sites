import __esmImport0 from "assert";
import {createRequire as __esmFactory} from 'node:module';
const __esmRequire=__esmFactory(import.meta.url);
const assert=__esmImport0;
__esmRequire('../public/process/version-return-policy.js');
const check=globalThis.VersionReturnPolicy.check;

const previous={id:'v1',number:1,status:'superseded'};
const current={id:'v2',number:2,status:'approved'};
let result=check([current,previous],current);
assert.equal(result.allowed,true);
assert.equal(result.fallback.id,'v1');

result=check([current,previous,{id:'v3',number:3,status:'draft'}],current);
assert.equal(result.allowed,false);
assert.match(result.reason,/較新的 V3/);

result=check([current,previous,{id:'old-draft',number:0,status:'pending'}],current);
assert.equal(result.allowed,false);
assert.match(result.reason,/正在主管審核中/);

result=check([{id:'only',number:1,status:'approved'}],{id:'only',number:1,status:'approved'});
assert.equal(result.allowed,false);
assert.match(result.reason,/沒有可恢復的上一版/);

console.log('version return policy: ok');
