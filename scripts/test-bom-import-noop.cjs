/* Execute the production import action against isolated records and queue. */
/* oxlint-disable typescript/no-require-imports -- Existing browser controllers use the CommonJS VM harness. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const D=await import('../public/process/bom-domain.mjs'),source=fs.readFileSync('public/process/bom-workspace.js','utf8'),fn=source.slice(source.indexOf(' async function finishImport('),source.indexOf(' async function save('));
 const row=(level,ordinal,code,name)=>['ROOT','.'.repeat(level)+level,ordinal,code,name,'','PCS','1','1','0'],base=D.parseMatrices([{name:'QA',rows:[D.columns,row(0,'','','Root'),row(1,'01','PART','Old')]}]);
 for(const mode of ['identical','keep','accept']){
  const incoming=structuredClone(base);if(mode!=='identical')incoming.ROOT[1].itemName='New';
  const batch={...D.compare(base,incoming),sheets:[],file:'QA.xlsx'};for(const c of batch.changes)c.decision=mode==='accept'?'accept':'keep';
  const existing={unrelated:true},context={D,editor:structuredClone(base),batch,pending:[existing],localRevision:0,workspaceOwner:()=>()=>true,editable:()=>true,permission:()=>true,changedLocal(){context.localRevision++;}};vm.runInNewContext(fn,context);await context.finishImport();
  assert.equal(context.localRevision,1);assert.equal(context.batch,null);assert.equal(context.pending[0],existing);assert.equal(context.pending.length,mode==='accept'?2:1);
  assert.equal(context.editor.ROOT[1].itemName,mode==='accept'?'New':'Old');
  if(mode==='accept'){assert.equal(context.pending[1].input.baseDigest,await D.semanticDigest(base));assert.equal(context.pending[1].input.importMode,'incremental-v1');}
 }
 const missing={D,editor:structuredClone(base),batch:{...D.compare(base,base)},pending:[]};vm.runInNewContext(fn,missing);await assert.rejects(missing.finishImport(),/editable is not defined/);
 for(const denied of ['permission','late-owner']){let owned=true,revision=0;const old=structuredClone(base),batch={...D.compare(base,base),sheets:[],file:'QA.xlsx'},context={D:denied==='late-owner'?{...D,semanticDigest:async value=>{owned=false;return D.semanticDigest(value);}}:D,editor:old,batch,pending:[],localRevision:revision,workspaceOwner:()=>()=>owned,editable:()=>true,permission:()=>denied!=='permission',changedLocal(){revision++;}};vm.runInNewContext(fn,context);await assert.rejects(context.finishImport(),denied==='permission'?/FORBIDDEN/:/RECOVERY_CONTEXT_CHANGED/);assert.equal(context.editor,old);assert.equal(context.batch,batch);assert.equal(context.pending.length,0);assert.equal(revision,0);}
 console.log(JSON.stringify({status:'PASS',cases:['identical import does not queue false changes','keeping all differences does not queue false changes','accepted change retains guarded import and existing queued work','missing port fails closed','permission denial preserves RAM','late owner digest preserves RAM'],networkRequests:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
