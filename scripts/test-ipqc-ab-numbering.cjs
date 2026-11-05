/* oxlint-disable typescript/no-require-imports -- Local pure-function fixture. */
const assert=require('node:assert/strict');
const {nextAbCode}=require('./ipqc-ab-import-harness.cjs')()('lib/ipqc-ab.ts');
const control={reservedErrorCodes:[],reservedItemCodes:[],scopes:{
  'A:GROUP':{versions:[{snapshot:{errors:[{code:'A-GROUP-CUT-L1'}],items:[{code:'A-GROUP-CUT-L1-01'}]}}]},
}};
assert.equal(nextAbCode(control,'error','A-GROUP-CUT-L'),'A-GROUP-CUT-L2');
assert.equal(nextAbCode(control,'error','A-GROUP-CUT-L'),'A-GROUP-CUT-L3');
assert.equal(nextAbCode(control,'item','A-GROUP-CUT-L1-'),'A-GROUP-CUT-L1-02');
assert.equal(nextAbCode(control,'item','A-GROUP-CUT-L1-'),'A-GROUP-CUT-L1-03');
console.log('PASS IPQC-AB automatic error/item numbering retains reserved codes');
