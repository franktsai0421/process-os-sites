/* oxlint-disable typescript/no-require-imports -- local isolated acceptance evidence. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const out=process.argv[2],evidence=path.resolve('docs/ipqc-reference/evidence/20261006/review5'),base='http://127.0.0.1:3020';
const request=async(url,body)=>{const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'x-fixture-user':'a','Content-Type':'application/json',Origin:base},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value;};
const checkpoint=async()=>{const r=await fetch(base+'/fixture-checkpoint',{headers:{'x-fixture-user':'admin'}});assert.equal(r.status,200);return r.json();};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
(async()=>{
 fs.mkdirSync(evidence,{recursive:true});const before=JSON.parse(fs.readFileSync(path.join(out,'review5-live-source.json'),'utf8')),live=await checkpoint(),ab=JSON.parse(live.values.ipqcABMasterControl),events=[];
 for(const [scope,control]of Object.entries(ab.scopes)){
  for(const c of control.workflow?.cases||[])if(c.reason==='3020 review5 全部頁面送審驗收；隔離資料'){
   events.push({scope,caseId:c.id,status:c.status,savedId:c.savedId,advisories:c.contentIssues?.issues.length||0,selfReview:c.result?.selfReview,reviewer:c.result?.actor.id});
   // Reopen only cases created by this acceptance run, through normal withdrawal.
   if(c.status==='pending'&&control.workflow.pendingId===c.id){const r=await request('/api/ipqc-ab/workflow?scope='+encodeURIComponent(scope),{command:{action:'withdraw',caseId:c.id,reason:'3020 review5 驗收結束，恢復可編輯；保留固定案件與歷史',generation:control.workflow.generation,clientId:randomUUID(),operationId:randomUUID(),sequence:1}});assert.equal(r.control.workflow.pendingId,null);}
  }
 }
 assert.equal(events.length,23);assert.equal(events.filter(c=>c.status==='approved').length,1);assert.ok(events.find(c=>c.scope==='A:INOX'&&c.selfReview&&c.reviewer==='a'));
 const final=await checkpoint();fs.writeFileSync(path.join(out,'review5-final-source.json'),JSON.stringify(final));
 const preserved=[];
 for(const key of ['ipqcABMasterControl','ipqcCMasterControl','processAuthoringControl']){
  const old=JSON.parse(before.values[key]),now=JSON.parse(final.values[key]),pairs=old.scopes?Object.entries(old.scopes).map(([scope,c])=>[c,now.scopes[scope],scope]):[[old,now,key]];
  for(const [a,b,scope]of pairs)for(const kind of ['saves','cases'])for(const record of a.workflow?.[kind]||[]){const retained=b.workflow?.[kind].find(r=>r.id===record.id);assert.ok(retained);assert.equal(hash(retained.content),hash(record.content));preserved.push({scope,kind,id:record.id,hash:hash(record.content)});}
 }
 const process=JSON.parse(final.values.processAuthoringControl),w=process.workflow.saved.content.workspaces.find(w=>w.line==='C'&&w.category==='INOX'),op=w.stages['C-CHI'][0];assert.ok(op.productCodes.includes('3060104'));assert.equal(op.name,'進站 · 3020 驗收');assert.ok(!Object.keys(w.stages).some(s=>s.startsWith('A-')));
 const statics=[];for(const name of ['process-ipqc.js','process-ipqc.css','app.js','ipqc-ab.js']){const r=await fetch(base+'/process/'+name);assert.equal(r.status,200);const source=await r.text();assert.equal(source,fs.readFileSync('public/process/'+name,'utf8'));statics.push({file:name,sha256:hash(source),port:3020});}
 let daily;try{const r=await fetch('http://127.0.0.1:3000/process/process-ipqc.js',{signal:AbortSignal.timeout(5000)});daily={status:r.status,checkoutMatch:r.ok&&(await r.text())===fs.readFileSync('public/process/process-ipqc.js','utf8')};}catch{daily={status:'NOT_AVAILABLE'};}
 const result={result:'PASS',testEnvironment:3020,submitAll:events,cleanup:'22 acceptance cases withdrawn through API; one explicit UI self-approval only',savedOperation:{line:w.line,category:w.category,stage:'C-CHI',number:op.number,name:op.name,productCodes:op.productCodes},preservedImmutableRecords:preserved.length,preserved,statics,daily,formalWrites:0};
 fs.writeFileSync(path.join(evidence,'operation-evidence.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,preserved:undefined},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
