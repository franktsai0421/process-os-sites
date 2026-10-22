import assert from'node:assert/strict';import{mergeLocalRecords as merge}from'../lib/local-three-way.mjs';
const base={rows:[{id:'a',text:'base',photo:'original'},{id:'b',text:'retain'}]},daily={rows:[{id:'b',text:'retain'},{id:'a',text:'daily',photo:'new-photo'},{id:'c',text:'daily-only'}]},incoming={rows:[{id:'a',text:'3020',photo:'original'},{id:'d',text:'3020-only'}]},conflicts=[];
const result=merge(base,daily,incoming,{record:r=>conflicts.push(r)});
assert.deepEqual(result.rows.find(r=>r.id==='a'),{id:'a',text:'3020',photo:'new-photo'});
assert.deepEqual(new Set(result.rows.map(r=>r.id)),new Set(['a','b','c','d']));assert.equal(conflicts.length,1);
const removed=merge(base,daily,incoming,{deleted:p=>p.at(-1)?.id==='b'});assert(!removed.rows.some(r=>r.id==='b'));
const history=merge([{id:'v',snapshot:'old',status:'pending'}],[{id:'v',snapshot:'old',status:'approved'}],[{id:'v',snapshot:'new',status:'returned'}],{atomic:p=>typeof p.at(-1)==='object'});assert.deepEqual(history,[{id:'v',snapshot:'new',status:'returned'}]);
assert.deepEqual(merge(['old'],['daily'],['old']),['daily']);
console.log('PASS: stable-ID order independent merge, source conflict preference, independent daily photo retained, missing is not delete, explicit tombstone, immutable history record kept whole');
