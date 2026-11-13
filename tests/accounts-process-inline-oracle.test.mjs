import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {readJointInlineValues} from './accounts-process-inline-oracle.mjs';
function db(row){let reads=0;return{prepare(sql){assert.equal(sql,'SELECT revision,"values" FROM shared_state WHERE id=1');return{async first(){reads++;return structuredClone(row);}};},reads:()=>reads};}
void test('joint inline oracle reads complete fresh row once and preserves full values',async()=>{
 const values={platformUsers:JSON.stringify([{id:'target',name:'Mine zh'}]),processAccessControl:'{"audit":[{"action":"edit-user"}]}',unrelated:'[1,2]'},d=db({revision:3,values:JSON.stringify(values)});
 assert.deepEqual(await readJointInlineValues(d),values);assert.equal(d.reads(),1);
});
for(const key of ['__processRecords','__processChunks','__processR2'])void test('rejects unexpected '+key+' without fallback',async()=>{
 const d=db({revision:2,values:JSON.stringify({[key]:'unexpected',platformUsers:'[]'})});await assert.rejects(readJointInlineValues(d),/changed storage/);assert.equal(d.reads(),1);
});
for(const row of [null,{revision:0,values:'{}'},{revision:1,values:'not json'},{revision:1,values:'[]'},{revision:1,values:'{"platformUsers":[]}'},{revision:1,values:null}])void test('bad row fails rather than manufacturing account results '+JSON.stringify(row),async()=>{const d=db(row);await assert.rejects(readJointInlineValues(d));assert.equal(d.reads(),1);});
void test('runner uses inline seed and strict oracle, preserving native saved-name assertion',()=>{const s=fs.readFileSync('tests/accounts-process-followup-browser.mjs','utf8');assert(s.includes('JSON.stringify(values)'));assert(s.includes('await readJointInlineValues(fixture.db)'));assert(!s.includes('recordOracle:true'));assert(s.includes("assert.equal(JSON.parse(current.platformUsers).find(user=>user.id==='target').name,'Mine '+language)"));assert(s.includes('assert.equal(a.posts.length,1)'));});
