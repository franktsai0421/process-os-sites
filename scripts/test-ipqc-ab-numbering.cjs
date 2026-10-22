/* oxlint-disable typescript/no-require-imports -- Local pure-function fixture. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const source=fs.readFileSync('lib/ipqc-ab.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleShim={exports:{}};
vm.runInNewContext(js,{module:moduleShim,exports:moduleShim.exports});
const {nextAbCode}=moduleShim.exports;
const control={reservedErrorCodes:[],reservedItemCodes:[],scopes:{
  'A:GROUP':{versions:[{snapshot:{errors:[{code:'A-GROUP-CUT-L1'}],items:[{code:'A-GROUP-CUT-L1-01'}]}}]},
}};
assert.equal(nextAbCode(control,'error','A-GROUP-CUT-L'),'A-GROUP-CUT-L2');
assert.equal(nextAbCode(control,'error','A-GROUP-CUT-L'),'A-GROUP-CUT-L3');
assert.equal(nextAbCode(control,'item','A-GROUP-CUT-L1-'),'A-GROUP-CUT-L1-02');
assert.equal(nextAbCode(control,'item','A-GROUP-CUT-L1-'),'A-GROUP-CUT-L1-03');
console.log('PASS IPQC-AB automatic error/item numbering retains reserved codes');
