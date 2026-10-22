/* Targeted startup regression: execute the real legacy module with isolated globals. */
/* oxlint-disable typescript/no-require-imports -- CommonJS VM harness executes the legacy browser controller. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sourcePath = process.argv.includes('--prove-before')
  ? require('./local-evidence-paths.cjs').configuredPath('PROCESS_VERSION_BEFORE_SOURCE',"")
  : path.join(__dirname, '../public/process/version-workflow.js');
const source = fs.readFileSync(sourcePath, 'utf8');
if(process.argv.includes('--prove-before')){
  const expected=process.env.PROCESS_VERSION_BEFORE_SHA256;
  const actual=require('node:crypto').createHash('sha256').update(source).digest('hex');
  if(!expected||actual!==expected)throw Error('VERIFIED_BEFORE_SOURCE_REQUIRED');
}
function run(protectedMode, populated) {
  const writes = [], saved = [], versions = [], board = {A:[], B:[], C:[]};
  const state = {category:'QA-ORIGINAL', editorLine:'B'};
  let ensures = 0;
  const noop = () => '';
  const context = vm.createContext({
    window:{ProcessSync:{protected:protectedMode}},
    document:{addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}},
    render:noop,bindView:noop,bindEditor:noop,renderInspector:noop,productStatus:noop,
    state,approvalVersions:versions,dispatchBoard:board,currentUser:null,
    data:{products:[{code:'QA-SAMPLE',category:'BORUAXE1021'}]},
    readStore:()=>false,
    ensureCategoryEditor(){ensures++; return {'A-CUT':populated ? [{id:'qa-op',name:'QA sample'}] : []};},
    productsForCategory:()=>[{code:'QA-SAMPLE'}],rootBom:()=>[],bomReferenceKey:row=>row.id,
    localStorage:{setItem:(key,value)=>writes.push({key,value})},
    persistPlatform:()=>saved.push('persist'),setTimeout,console,
  });
  let error;
  try {vm.runInContext(source,context,{filename:sourcePath});} catch (e) {error=e;}
  return {state,versions,board,writes,saved,ensures,error};
}
if (process.argv.includes('--prove-before')) {
  const result = run(true,false);
  assert.match(result.error?.message || '', /Cannot set properties of undefined.*name/);
  assert.equal(result.state.category,'BORUAXE1021');
  assert.equal(result.state.editorLine,'A');
  console.log(JSON.stringify({status:'REPRODUCED_BEFORE_FIX',error:result.error.message,categoryLeftChanged:true,serverOrBrowserWrites:0}));
} else {
  for (const populated of [false,true]) {
    const result = run(true,populated);
    assert.equal(result.error,undefined);
    assert.equal(result.ensures,0);
    assert.equal(result.versions.length,0);
    assert.equal(result.saved.length,0);
    assert.equal(result.writes.length,0);
    assert.deepEqual(result.board,{A:[],B:[],C:[]});
    assert.equal(result.state.category,'QA-ORIGINAL');
    assert.equal(result.state.editorLine,'B');
  }
  const empty = run(false,false);
  assert.equal(empty.error,undefined);
  assert.equal(empty.versions.length,0);
  assert.equal(empty.writes.length,0);
  assert.equal(empty.state.category,'QA-ORIGINAL');
  assert.equal(empty.state.editorLine,'B');
  const legacy = run(false,true);
  assert.equal(legacy.error,undefined);
  assert.equal(legacy.versions.length,4);
  assert.equal(legacy.writes[0].key,'versionSampleSeed4');
  assert.equal(legacy.state.category,'QA-ORIGINAL');
  assert.equal(legacy.state.editorLine,'B');
  console.log(JSON.stringify({status:'PASS',cases:['protected empty','protected populated','unprotected empty safely skipped','unprotected populated legacy compatibility'],networkRequests:0,businessWrites:0}));
}
