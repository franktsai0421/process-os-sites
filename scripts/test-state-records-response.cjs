/* oxlint-disable typescript/no-require-imports -- isolated streamed compatibility contract. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),harness=require('./ipqc-ab-import-harness.cjs');
const {recordJSONResponse}=harness({})('lib/state-records-response.ts'),hash=s=>createHash('sha256').update(s).digest('hex');
(async()=>{const raw=JSON.stringify({text:'Tiếng Việt 中文'.repeat(30000),photos:[{id:'fixed',src:'/fixed.webp'}]}),sha256=hash(raw),key='state-records/v1/'+sha256+'.json',ref={__immutableBody:{key,sha256}};let gets=0;
 const bucket={async get(k){assert.equal(k,key);gets++;return{text:async()=>raw};}},value={versions:[{snapshot:ref},{snapshot:ref}],nil:null,absent:undefined,empty:[],live:{text:'Live'}};
 const response=recordJSONResponse(value,bucket,{'Cache-Control':'no-store'});assert.equal(response.headers.get('Content-Type'),'application/json');assert.deepEqual(await response.json(),{versions:[{snapshot:JSON.parse(raw)},{snapshot:JSON.parse(raw)}],nil:null,empty:[],live:{text:'Live'}});assert.equal(gets,2,'historical bodies are serial, not retained in a full-body cache');
 for(const broken of [{get:async()=>null},{get:async()=>({text:async()=>raw+'broken'})}])await assert.rejects(recordJSONResponse(value,broken,{}).json(),/Immutable record (missing|corrupt)/,'partial stream must reject, not parse a fabricated complete document');
 const reader=recordJSONResponse(value,bucket,{}).body.getReader();assert.ok(!(await reader.read()).done);await reader.cancel();
 console.log('PASS: legacy full JSON semantic parity, UTF-8 chunking, sequential SHA-verified history, missing/corrupt fail closed, cancellation');
})().catch(e=>{console.error(e);process.exitCode=1;});
