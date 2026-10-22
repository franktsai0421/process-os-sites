/* Execute the production import action against isolated records and queue. */
/* oxlint-disable typescript/no-require-imports -- Existing browser controllers use the CommonJS VM harness. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const D=await import('../public/process/bom-domain.mjs'),source=fs.readFileSync('public/process/bom-workspace.js','utf8'),fn=source.slice(source.indexOf(' async function finishImport('),source.indexOf(' async function save('));
 const row=(level,ordinal,code,name)=>['ROOT','.'.repeat(level)+level,ordinal,code,name,'','PCS','1','1','0'],base=D.parseMatrices([{name:'QA',rows:[D.columns,row(0,'','','Root'),row(1,'01','PART','Old')]}]);
 for(const mode of ['identical','keep','accept']){
  const incoming=structuredClone(base);if(mode!=='identical')incoming.ROOT[1].itemName='New';
  const batch={...D.compare(base,incoming),sheets:[],file:'QA.xlsx'};for(const c of batch.changes)c.decision=mode==='accept'?'accept':'keep';
  const existing={unrelated:true},context={D,editor:structuredClone(base),batch,pending:[existing]};vm.runInNewContext(fn,context);await context.finishImport();
  assert.equal(context.batch,null);assert.equal(context.pending[0],existing);assert.equal(context.pending.length,mode==='accept'?2:1);
  assert.equal(context.editor.ROOT[1].itemName,mode==='accept'?'New':'Old');
  if(mode==='accept'){assert.equal(context.pending[1].input.baseDigest,await D.semanticDigest(base));assert.equal(context.pending[1].input.importMode,'incremental-v1');}
 }
 console.log(JSON.stringify({status:'PASS',cases:['identical import does not queue false changes','keeping all differences does not queue false changes','accepted change retains guarded import and existing queued work'],networkRequests:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
