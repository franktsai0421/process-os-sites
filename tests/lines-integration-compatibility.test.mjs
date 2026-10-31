import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const load=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({}),{removesLineWithStages}=load('lib/master-stage-references.ts');
await test('adding stable IDs to a retained legacy line preserves its child stages',()=>{
 const previous={lines:[{code:'A',stages:[{code:'A-CUT'}]}]},next={lines:[{id:'lines:A',code:'A',stages:[{id:'stages:A-CUT',code:'A-CUT'}]}]};
 assert.equal(removesLineWithStages(previous,next),false);assert.equal(removesLineWithStages(previous,{lines:[]}),true);
 assert.equal(removesLineWithStages(next,{lines:[{id:'different-line',code:'A',stages:[]}]}),true);
});
