const unified=require('../scripts/unified-draft-source-contract.cjs');
/* Exact caller proof + independent semantic negative controls. No runtime writes. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const proof=require('../scripts/bom-unsent-source-contract.cjs'),older=require('../scripts/bom-successor-source-contract.cjs');
const integration=require('../scripts/bom-main-integration-source-contract.cjs'),{execFileSync}=require('node:child_process');
// Admit Git checkout EOL only after byte equality; inner static pins stay raw.
const read=file=>integration.project(unified.project(integration.canonicalSource(fs.readFileSync(file),execFileSync('git',['show','HEAD:'+file])),file,'bom_integration'),file,'bom');
const {contract:c}=proof,bytes=read(c.file),hash=x=>createHash('sha256').update(x).digest('hex');
const mutate=(text,from,to)=>{assert(text.includes(from),'mutation token missing: '+from);const next=text.replace(from,to);assert.notEqual(next,text);return next;};
const block=(text,start,end)=>{const a=text.indexOf(start),z=text.indexOf(end,a+start.length);assert(a>=0&&z>a,'protected boundaries exist');return text.slice(a,z);};
function semantics(text){
 assert.doesNotMatch(text,/session\.(?:schedule|flush|restore|discard)\(/);
 assert.doesNotMatch(text,/createForegroundPoll|foregroundPoll\.schedule|function pollTick/);
 for(const call of text.matchAll(/session\.rebaseLocal\(([\s\S]*?)\);/g))assert.doesNotMatch(call[1],/\bpayload\s*:/);
 assert.match(text,/async function restoreRecord\(\)\{assertCurrentDisplay\(\);throw Error\('UNSENT_RECOVERY_DISABLED'\);\}/);
 assert.match(text,/async function discardRecord\(\)\{throw Error\('UNSENT_RECOVERY_DISABLED'\);\}/);
 const retained=block(text,' function retainOperation(){',' function isolateOwnerInput(){');
 assert.match(retained,/isolatedInputs\.push\(\{actorId:actor,flight:recoveryFlight,session:recoverySession,saveCommand,client\}\)/);
 assert.match(retained,/saveCommand=recoveryFlight\?\.command\|\|null/);
 assert.match(retained,/localBase=null;localBaseVersion=null;pending=\[\];batch=null;edit=null/);
 const send=block(text,' async function sendManual(',' function transport(');
 assert.match(send,/if\(manualLocal\(\)&&!importLocal\(\)\)persistRecovery\(\);else session\.cancelScheduled\(\)/);
 assert.match(send,/await ensureRecovery\(session,owned\);check\(\)/);
 assert.match(send,/session\.prepareWrite\(\{operationId:command\.operationId,generation:command\.generation\}\)/);
 assert.match(send,/if\(!preparedWrite\.ok\|\|!preparedWrite\.durable\)/);
 assert.match(send,/session\.dispatchPrepared\(flight\.reservation,command,sent=>c\.sendPrepared\(sent,\{assertDispatch:sent=>owned\(\)&&recoveryFlight===flight&&session\.assertDispatch\(sent\)\}\)/);
 assert(send.indexOf('!preparedWrite.durable')<send.indexOf('session.dispatchPrepared'));
 const settle=block(text,' async function settleRecord(',' function finalizeRejection(');
 assert.match(settle,/client\.receipt\(preview\.receipt\.operationId,preview\.receipt\.generation\)/);assert.doesNotMatch(settle,/sendPrepared|\.command\(|prepareRecoverySave/);
}
const protectedBlocks=[
 [' // The shared selector owns evidence/read sequencing.',' const editable=','b78607d97b5fd4b4b61568c20744a28a6dcc4896982ccaf2aebf046840ffef18'],
 [' async function saveIntent(',' async function run(','a3f884e0b49f1315667fef4cddc848e8d29ff585a196f60f589280c9c3ec620b'],
 [' function drainFlight(',' async function settleRecord(','f7dfa94ee76e2be288658ea0ff401798921632e021e79ae4afcf45dde00062d3']
];
void test('unsent current attestation inverses exact 15ae caller and retains older immutable dependency pin',()=>{
 assert.equal(proof.manifest.sourceCommit,'15ae753bf848919e977d3028c17b1dd814a7128e');assert(Object.isFrozen(c.rules[0]));assert.equal(proof.attestCurrent(bytes,c.file),true);
 const prior=proof.withoutUnsent(bytes,c.file),dependency=older.currentDependencies.find(item=>item.file===c.file);assert.equal(hash(prior),dependency.sha256);assert.equal(prior.length,dependency.bytes);assert.deepEqual(proof.projectUnsent(bytes,c.file),prior);assert.deepEqual(proof.projectUnsent(prior,c.file),prior);assert.throws(()=>proof.attestCurrent(prior,c.file),/differs/);assert.throws(()=>proof.withoutUnsent(prior,c.file),/differs/);
 assert.equal(older.attestBomSources(read),true);assert.throws(()=>older.attestBomSources(file=>file===c.file?prior:read(file)),/Current BOM authority dependency differs/);
});
void test('unsent source retains RAM-only, durable Save admission and receipt-only settlement invariants',()=>semantics(bytes.toString()));
for(const [start,end,pin]of protectedBlocks)void test('15ae approved/history/save-choice protected block: '+start.trim(),()=>assert.equal(hash(block(bytes.toString(),start,end)),pin));
for(const [name,from,to]of [
 ['debounced persistence','function queueRecovery(){paintRecovery();}','function queueRecovery(){session.schedule(()=>projection());paintRecovery();}'],
 ['restore unsent form',"throw Error('UNSENT_RECOVERY_DISABLED');","session.restore(token);"],
 ['payload rebase','localRevision});','localRevision,payload:nextPayload});'],
 ['retain unsent editor','flight:recoveryFlight,session:recoverySession,saveCommand,client','flight:recoveryFlight,session:recoverySession,saveCommand,client,editor'],
 ['rebuild command','saveCommand=recoveryFlight?.command||null','saveCommand=prepareRecoverySave(editor)'],
 ['manual validation bypass','if(manualLocal()&&!importLocal())persistRecovery();else session.cancelScheduled();','session.cancelScheduled();'],
 ['durability bypass','!preparedWrite.ok||!preparedWrite.durable','!preparedWrite.ok'],
 ['dispatch ownership bypass','owned()&&recoveryFlight===flight&&session.assertDispatch(sent)','true'],
 ['receipt resend','client.receipt(preview.receipt.operationId,preview.receipt.generation)','client.sendPrepared(saveCommand)']
])void test('negative source control refuses '+name,()=>{const changed=Buffer.from(mutate(bytes.toString(),from,to));assert.throws(()=>semantics(changed.toString()));assert.throws(()=>proof.attestCurrent(changed,c.file),/differs/);assert.throws(()=>proof.withoutUnsent(changed,c.file),/differs/);assert.deepEqual(proof.projectUnsent(changed,c.file),changed);assert.throws(()=>older.attestBomSources(file=>file===c.file?changed:read(file)),/Current BOM authority dependency differs/);});
void test('raw type, unknown path, whitespace and newline changes fail strict caller proof',()=>{
 for(const value of [bytes.toString(),new Uint8Array(bytes),null])assert.throws(()=>proof.withoutUnsent(value,c.file),/raw source bytes/);
 assert.throws(()=>proof.withoutUnsent(bytes,'unknown'),/Unknown unsent source path/);
 for(const changed of [Buffer.concat([bytes,Buffer.from(' ')]),Buffer.concat([Buffer.from(' '),bytes]),Buffer.from(bytes.toString().replace(/\n/g,'\r\n'))]){assert.throws(()=>proof.attestCurrent(changed,c.file),/differs/);assert.deepEqual(proof.projectUnsent(changed,c.file),changed);}
});
for(const [index,rule]of c.rules.entries())void test('exact unsent span '+(index+1)+' rejects corrupt offsets, repeated and partial rollback bytes',()=>{
 const span=Buffer.from(rule.after),prefix=bytes.subarray(0,rule.afterOffset),suffix=bytes.subarray(rule.afterOffset+span.length);
 for(const changed of [Buffer.concat([prefix,Buffer.from(rule.before),suffix]),Buffer.concat([prefix,span,Buffer.from('!'),suffix])]){assert.notDeepEqual(changed,bytes);assert.throws(()=>proof.withoutUnsent(changed,c.file),/differs/);assert.deepEqual(proof.projectUnsent(changed,c.file),changed);}
 for(const [key,value]of [['afterOffset',rule.afterOffset+1],['beforeOffset',-1],['after',rule.after+'!'],['before',rule.before+'!']]){const corrupt=structuredClone(c);corrupt.rules[index][key]=value;assert.throws(()=>proof.invertContract(bytes,corrupt));}
});
void test('complete inverse hash, lengths, missing/reversed spans and predecessor mutation fail',()=>{
 for(const [key,value]of [['afterHash','0'.repeat(64)],['beforeHash','0'.repeat(64)],['afterBytes',c.afterBytes+1],['beforeBytes',c.beforeBytes-1],['rules',[]],['rules',[...c.rules].reverse()],['rules',c.rules.slice(1)]]){assert.throws(()=>proof.invertContract(bytes,{...c,[key]:value}));}
 assert.deepEqual(read(c.file),bytes,'all controls leave runtime source unchanged');
});
const ciPaths=['public/process/bom-workspace.js','scripts/bom-unsent-source-contract.cjs','scripts/bom-unsent-source-contract.json','tests/bom-unsent-source-contract.test.cjs'];
const ciCommand='node --test tests/bom-unsent-source-contract.test.cjs';
function assertCI(feedback,local){
 feedback=feedback.replace(/\r\n/g,'\n');local=local.replace(/\r\n/g,'\n');const paths=feedback.split('    paths:\n')[1]?.split('permissions:')[0];assert(paths,'Feedback path filter missing');
 for(const file of ciPaths)assert(paths.includes("      - '"+file+"'\n"),'Missing Feedback unsent-proof trigger: '+file);
 assert.equal(feedback.split('      - run: '+ciCommand+'\n').length,2,'Feedback must execute unsent proof exactly once');
 assert.match(local,/runs-on: windows-latest/);assert.match(local,/shell: pwsh/);
 const guarded='          '+ciCommand+'\n          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }';assert.equal(local.split(guarded).length,2,'Windows must execute unsent proof exactly once with exit propagation');
}
void test('Feedback and Windows CI execute strict unsent proof; disabled command, dropped path and swallowed exit fail',()=>{
 const feedback=fs.readFileSync('.github/workflows/feedback-queues.yml','utf8').replace(/\r\n/g,'\n'),local=fs.readFileSync('.github/workflows/local-safety.yml','utf8').replace(/\r\n/g,'\n');assertCI(feedback,local);assertCI(feedback.replace(/\n/g,'\r\n'),local.replace(/\n/g,'\r\n'));
 assert.throws(()=>assertCI(feedback.replace(ciCommand,'echo proof-disabled'),local),/must execute/);
 assert.throws(()=>assertCI(feedback,local.replace(ciCommand,'echo proof-disabled')),/must execute/);
 assert.throws(()=>assertCI(feedback,local.replace(ciCommand+'\n          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',ciCommand)),/exit propagation/);
 assert.throws(()=>assertCI(feedback,local.replace(ciCommand+'\n          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',ciCommand+'\n          exit 0')),/exit propagation/);
 for(const file of ciPaths)assert.throws(()=>assertCI(feedback.replace("      - '"+file+"'\n",''),local),/Missing Feedback unsent-proof trigger/);
});
