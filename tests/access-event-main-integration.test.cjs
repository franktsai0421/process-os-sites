/* PR86 observations project to exact merged-main bad0463 safety bytes. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const {withoutAccessEventMetadata:metadataProject}=require('../scripts/access-event-source-contract.cjs');
const readIO=require('../scripts/ipqc-c-read-io-source-contract.cjs'),{execFileSync}=require('node:child_process');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Compose exact existing successors before the unchanged reporting proof.
// Historical pins and every other file remain untouched.
const noPoll=require('../scripts/equipment-no-poll-source-contract.cjs');
const masterRoute=require('../scripts/master-route-successor-source-contract.cjs');
const equipmentRepair=require('../scripts/equipment-ci-repair-source-contract.cjs');
const cRoute='app/api/ipqc-c/workflow/route.ts';
// Hash the committed bytes only after proving the checkout differs by EOL alone.
// Windows may convert any LF blob, not just the C workflow route.
const checkoutLF=bytes=>{const result=Buffer.alloc(bytes.length);let length=0;for(let i=0;i<bytes.length;i++){if(bytes[i]===13&&bytes[i+1]===10)continue;result[length++]=bytes[i];}return result.subarray(0,length);};
const canonicalSource=(working,committed)=>{assert(Buffer.isBuffer(working)&&Buffer.isBuffer(committed),'Reporting proof requires raw source bytes');assert.deepEqual(checkoutLF(working),checkoutLF(committed),'Reporting worktree source differs from HEAD beyond checkout EOL');return committed;};
const readSource=file=>canonicalSource(fs.readFileSync(file),execFileSync('git',['show','HEAD:'+file]));
const project=(bytes,file)=>{assert(Buffer.isBuffer(bytes),'Access-event projection requires raw source bytes');bytes=require('../scripts/background-check-source-contract.cjs').projectKnown(bytes,file);if(equipmentRepair.contracts.some(contract=>contract.file===file&&contract.afterHash===hash(bytes)))bytes=equipmentRepair.restorePredecessor(bytes,file);if(file===masterRoute.file)bytes=masterRoute.restoreMasterRoutePredecessor(bytes,file);if(file===noPoll.file&&hash(bytes)===noPoll.afterHash)bytes=noPoll.restoreEquipmentPolling(bytes,file);return metadataProject(file===cRoute&&hash(bytes)===readIO.afterHash?readIO.withoutWorkflowReadAhead(bytes):bytes,file);};
const main={
  "public/process/shared-draft-client.js": "194d0627c909f54a1bbf1c7c328cf9f98d5411234556e08c33538f9e55bf6589",
  "lib/versioned-shared-workflow.ts": "d1246a4b451206a4091afbc66e3c066c5f04fa4de0da319e5120b0a339a7f01e",
  "app/api/ipqc-c/workflow/route.ts": "58d065893bd14239095b0bd292dd5224b28b4299132a196f8ba6e31ca89f6ae1",
  "public/process/routine-equipment.js": "ecd1bf66f4c486e31b0567a6644517fc07dff6e6821243bd49073755b980702d",
  "public/process/ipqc-ab.js": "8328752afd1a7101005fb98266ece33dc8cc6904e429b001f7c56e30aa76cf1e",
  "public/process/process-equipment.js": "d13aa61e55fbb7f43f345ec84cfbde8bd4cfe0a021dde0dc8f715588df11f2f5",
  "public/process/app.js": "9fe4580853245d9b41c7e89449760d8f2a72cc418b6fe166a7f4dcc3ea37bebd",
  "public/process/master-shared-client.js": "115746e64ebdb92d4af74951b2e74ab1f49c20b952670ca4986a31fa1e9e18f1",
  "public/process/master-data.js": "79dd392e82f176a7ee2ae4c73b0fc71068b4fdb70b285e2b8fa0df7f94faf470",
  "public/process/master-admin-ui.js": "9b9e23df9898717602d40306a91ddb4a801389a6b733d754effdc7e4de1b3086",
  "lib/equipment-workflow.ts": "5698203e328d6d7bb752462bb8922586aded195e85dbfa7e01d3daa770d447ec",
  "lib/ipqc-ab-local-save.ts": "821a730da8d21485126f45a965c7d31823390f32e72462054dfaec291c4d87d2",
  "lib/master-workflow.ts": "2278552ad520fe5f251060c74d1296aef72e2ccd19ba747f9f4f2dd8d76d43f5",
  "lib/fqc-workflow.ts": "846bbeb66ef41f77033f227328634d010e5ca56d9801fb97c9f009e869757133",
  "lib/tooling-workflow.ts": "2cbf91c26a89f8e04190c4217c62fd2d535f06b16d27952857338b2a18035eea",
  "lib/bom-workflow.ts": "03072124ab0b511bd9d5ea7760ba2d4b8144db64a12f590346ca59765390e114",
  "app/api/master/workflow/route.ts": "e59302315b30f2e2bce1d47ea6d6ea4f9d7228babaa0ddfc23267fee90ec2de8"
};
for(const [file,pinned]of Object.entries(main))void test('preserves merged main safety bytes: '+file,()=>assert.equal(hash(project(readSource(file),file)),pinned));
void test('master successor attests current raw bytes before restoring the unchanged complete historical pin',()=>{
 const bytes=readSource(masterRoute.file),untouched=Buffer.from(bytes);
 masterRoute.assertMasterRouteSuccessor(bytes,masterRoute.file);
 assert.equal(bytes.length,5829);assert.equal(hash(bytes),'ad13dec6e560d606d831e64ced7a1d94fde84a93faed832e86ab46450df1966f');
 const prior=masterRoute.restoreMasterRoutePredecessor(bytes,masterRoute.file);
 assert.equal(prior.length,5336);assert.equal(hash(prior),main[masterRoute.file]);assert.equal(masterRoute.beforeHash,main[masterRoute.file]);
 assert.deepEqual(project(bytes,masterRoute.file),prior);assert.deepEqual(bytes,untouched,'projection never rewrites current runtime bytes');
 for(const source of [bytes,prior])assert(source.includes(Buffer.from('save:permissions.save||permissions.edit')),'original pin and successor both retain the merged catalog Save permission');
 assert.throws(()=>project(prior,masterRoute.file),/pinned/,'whole historical rollback must not pass the old hash');
 assert.throws(()=>masterRoute.restoreMasterRoutePredecessor(prior,masterRoute.file),/pinned/,'inverse cannot run twice');
 assert.deepEqual(project(bytes,'public/process/shared-draft-client.js'),bytes,'master inverse never dispatches for another file');
});
void test('master successor rejects wrong paths, non-Buffer inputs, EOL drift and every single-byte drift',()=>{
 const bytes=readSource(masterRoute.file),reject=source=>assert.throws(()=>project(source,masterRoute.file),/pinned/);
 for(const path of [cRoute,'./'+masterRoute.file,masterRoute.file.toUpperCase(),undefined])assert.throws(()=>masterRoute.restoreMasterRoutePredecessor(bytes,path),/wrong file/);
 for(const source of [bytes.toString(),new Uint8Array(bytes),null]){
  assert.throws(()=>masterRoute.assertMasterRouteSuccessor(source,masterRoute.file),/raw source bytes/);
  assert.throws(()=>project(source,masterRoute.file),/raw source bytes/);
 }
 for(const source of [Buffer.concat([bytes,Buffer.from(' ')]),bytes.subarray(0,-1),Buffer.concat([bytes,bytes]),Buffer.from(bytes.toString().replace(/\n/g,'\r\n'))])reject(source);
 // Checkout EOL equivalence belongs to readSource before this raw-byte inverse.
 for(let offset=0;offset<bytes.length;offset++){const altered=Buffer.from(bytes);altered[offset]^=1;reject(altered);}
});
void test('master successor rejects missing, partial, repeated and moved spans and authority changes',()=>{
 const bytes=readSource(masterRoute.file),text=bytes.toString(),changed=[];
 for(const rule of masterRoute.rules){
  const span=Buffer.from(rule.after),start=bytes.subarray(0,rule.offset),end=bytes.subarray(rule.offset+span.length);
  changed.push(Buffer.concat([start,Buffer.from(rule.before),end]),Buffer.concat([start,span,span,end]),Buffer.concat([start,span.subarray(1),span.subarray(0,1),end]));
 }
 for(const [from,to]of [
  ['documentBoundary(request)||','null||'],['if(boundary)return boundary;','if(false)return boundary;'],
  ['assertMasterDocumentRouteAvailable(new URL(request.url).searchParams);','void request;'],
  ['save:permissions.save||permissions.edit','save:true'],['save:permissions.save||permissions.edit,',''],
  ['restore:permissions.edit&&await restoreAllowed(request,state)','restore:true'],
  ["await can(request,state,'ab.create')",'true'],["await can(request,state,'ab.delete')",'true'],
  ['!actor||!before.view','false'],['!current||!permissions.view','false'],
  ["permission+'.view'","permission+'.edit'"],["permission+'.delete'","permission+'.view'"],
  [".get('scope')!=='AB'",".get('scope')!=='C'"],["if(body.error!=='STAGE_IN_USE')return response;",'return response;'],
 ]){assert(text.includes(from),from);changed.push(Buffer.from(text.replace(from,to)));}
 for(const source of changed){assert.notDeepEqual(source,bytes);assert.throws(()=>project(source,masterRoute.file),/pinned/);}
});
void test('master successor proof rejects corrupted fixed offsets, spans, lengths and predecessor hash',()=>{
 const bytes=readSource(masterRoute.file),code=fs.readFileSync('scripts/master-route-successor-source-contract.cjs','utf8');
 assert(Object.isFrozen(masterRoute)&&Object.isFrozen(masterRoute.rules)&&masterRoute.rules.every(Object.isFrozen));
 for(const [from,to,message]of [
  ['offset:740','offset:741',/source span/],['offset:4822','offset:4821',/source span/],['offset:5220','offset:5221',/source span/],
  ["before:'',after:' const boundary=","before:'',after:'  const boundary=",/source span/],
  ['afterLength=5829','afterLength=5828',/pinned byte length/],['beforeLength=5336','beforeLength=5335',/predecessor length/],
  [masterRoute.beforeHash,'0'.repeat(64),/predecessor bytes/],
 ]){
  assert(code.includes(from),from);const proofModule={exports:{}};
  require('node:vm').runInNewContext(code.replace(from,to),{require,module:proofModule,Buffer});
  assert.throws(()=>proofModule.exports.restoreMasterRoutePredecessor(bytes,masterRoute.file),message);
 }
});
for(const file of Object.keys(main))void test('reporting source checkout EOL proof rejects every non-EOL change: '+file,()=>{
 const committed=execFileSync('git',['show','HEAD:'+file]),lf=committed.toString('utf8').replace(/\r\n/g,'\n');
 for(const text of [lf,lf.replace(/\n/g,'\r\n')])assert.deepEqual(canonicalSource(Buffer.from(text),committed),committed);
 assert.throws(()=>canonicalSource(Buffer.concat([committed,Buffer.from(' ')]),committed),/differs from HEAD/);
 const changed=Buffer.from(committed);changed[0]^=1;assert.throws(()=>canonicalSource(changed,committed),/differs from HEAD/);
 assert.throws(()=>canonicalSource(Buffer.concat([committed,Buffer.from([0xff])]),Buffer.concat([committed,Buffer.from([0xfe])])),/differs from HEAD/,'invalid UTF-8 must not collapse into equal replacement characters');
 for(const value of [committed.toString(),new Uint8Array(committed)])assert.throws(()=>canonicalSource(value,committed),/raw source bytes/);
});
void test('exact merged C read-ahead source composes to the same complete historical reporting bytes',()=>{
 const bytes=readSource(cRoute),prior=readIO.withoutWorkflowReadAhead(bytes);
 assert.equal(readIO.afterHash,'0610032b06bbf21ecfc796ab51bf5a4f35d7719f8981338a6549644d14ac104f');assert.equal(readIO.beforeHash,'67dfc685a2374aeba0e2c8f3154a3594c69e8526a0201794a29e0ce6ee07c25e');
 assert.equal(hash(project(bytes,cRoute)),main[cRoute]);assert.deepEqual(project(bytes,cRoute),metadataProject(prior,cRoute));assert.deepEqual(project(prior,cRoute),metadataProject(prior,cRoute));assert.throws(()=>readIO.withoutWorkflowReadAhead(prior),/differs from pinned bytes/,'read-ahead inverse cannot run twice');
 assert.deepEqual(project(bytes,'public/process/shared-draft-client.js'),bytes,'C read inverse must not dispatch for another file');
 for(const value of [bytes.toString(),new Uint8Array(bytes)])assert.throws(()=>project(value,cRoute),/requires raw source bytes/);
});
void test('C reporting proof allows only checkout EOL equivalence before raw Git projection',()=>{
 const bytes=readSource(cRoute),lf=bytes.toString().replace(/\r\n/g,'\n');assert.deepEqual(canonicalSource(Buffer.from(lf),bytes),bytes);assert.deepEqual(canonicalSource(Buffer.from(lf.replace(/\n/g,'\r\n')),bytes),bytes);
 assert.throws(()=>canonicalSource(Buffer.concat([bytes,Buffer.from(' ')]),bytes),/differs from HEAD/);assert.throws(()=>canonicalSource(bytes.toString(),bytes),/raw source bytes/);
});
void test('C read-ahead/reporting composition cannot hide partial, repeated or authority source changes',()=>{
 const bytes=readSource(cRoute),text=bytes.toString();
 const changed=[Buffer.concat([bytes,Buffer.from(' ')]),Buffer.concat([bytes,readIO.after]),Buffer.from(text.replace(readIO.after.toString(),'')),Buffer.from(text.replace('    // Normal compact workflow reads retain all objects/checks; overlap only GET metadata.\n',''))];
 for(const [from,to]of [["['since','caseMetadata','compact']","['since','caseMetadata','compact','permissions']"],['actor=await identity(request,state)','actor=null'],['!permissions.view','false'],['receipt.actorId!==actor.id','false'],['!await identity(request,state)','false'],['if(changed.meta.changes!==1)continue;','if(false)continue;']]){assert(text.includes(from));changed.push(Buffer.from(text.replace(from,to)));}
 for(const source of changed){assert.notDeepEqual(source,bytes);assert.notEqual(hash(project(source,cRoute)),main[cRoute]);}
});
void test('Feedback path filters include every C reporting inverse dependency',()=>{
 const workflow=fs.readFileSync('.github/workflows/feedback-queues.yml','utf8').replace(/\r\n/g,'\n'),paths=workflow.split('    paths:\n')[1]?.split('permissions:')[0];assert(paths);
 for(const file of [cRoute,noPoll.file,masterRoute.file,'public/process/shared-draft-client.js','scripts/equipment-ci-repair-source-contract.cjs','scripts/master-route-successor-source-contract.cjs','scripts/equipment-no-poll-source-contract.cjs','scripts/ipqc-c-read-io-source-contract.cjs','scripts/access-event-source-contract.cjs'])assert(paths.includes("      - '"+file+"'\n"),file+' must trigger the existing Feedback safety gate');
});
const file='public/process/shared-draft-client.js',current=fs.readFileSync(file);
for(const [label,from,to]of [
 ['pre-dispatch proof','if(attempt)attempt.dispatched=true;','if(false)attempt.dispatched=true;'],
 ['ACK readback','result=await masterSaveReadback(', 'result=await Promise.resolve('],
 ['equipment terminal','equipmentLocalSave?await equipmentTerminal(original,command):original','original'],
 ['unknown refusal','PREVIOUS_OPERATION_UNKNOWN','PREVIOUS_OPERATION_IGNORED'],
 ['observer isolation','catch{/* Reporting never changes original receipts, errors or write admission. */}', 'catch{throw Error("REPORTING_FAILED");}'],
])void test('merged reporting proof rejects '+label+' mutation',()=>{
 const altered=Buffer.from(current.toString().replace(from,to));assert.notDeepEqual(altered,current,'mutation must execute');assert.notEqual(hash(project(altered,file)),main[file]);
});
void test('projection does not normalize or accept non-Buffer inputs',()=>{
 assert.notEqual(hash(project(Buffer.concat([current,Buffer.from(' ')]),file)),main[file]);
 for(const value of [current.toString(),new Uint8Array(current)])assert.throws(()=>project(value,file),/requires raw source bytes/);
});

void test('equipment no-poll exact inverse preserves old pin and rejects wrong/partial/repeated/arbitrary changes',()=>{
 const currentBytes=require('../scripts/ipqc-ab-integration-source-contract.cjs').projectKnown(readSource(noPoll.file),noPoll.file),bytes=equipmentRepair.restorePredecessor(currentBytes,noPoll.file),prior=noPoll.restoreEquipmentPolling(bytes,noPoll.file);
 assert.equal(hash(prior),noPoll.beforeHash);assert.equal(hash(project(bytes,noPoll.file)),main[noPoll.file]);assert.equal(hash(metadataProject(prior,noPoll.file)),main[noPoll.file]);
 assert.throws(()=>noPoll.restoreEquipmentPolling(prior,noPoll.file),/pinned bytes/);assert.throws(()=>noPoll.restoreEquipmentPolling(bytes,cRoute),/wrong file/);
 for(const value of [bytes.toString(),new Uint8Array(bytes)])assert.throws(()=>noPoll.restoreEquipmentPolling(value,noPoll.file),/raw source bytes/);
 const changes=[Buffer.concat([bytes,Buffer.from(' ')]),Buffer.concat([bytes,bytes]),Buffer.from(bytes.toString().replace('!inputOwnerCurrent()','false'))];
 for(const rule of noPoll.rules){const b=Buffer.from(rule.after);changes.push(Buffer.concat([bytes.subarray(0,rule.offset),Buffer.from(rule.before),bytes.subarray(rule.offset+b.length)]));}
 for(const changed of changes){assert.notDeepEqual(changed,bytes);assert.throws(()=>noPoll.restoreEquipmentPolling(changed,noPoll.file),/pinned bytes/);assert.notEqual(hash(project(changed,noPoll.file)),main[noPoll.file]);}
 assert.deepEqual(project(bytes,cRoute),bytes,'wrong file never projects equipment');
});

void test('normal Local safety CI registers no-poll, sent-batch, quarantine, insert-ACK and source proof without skipping failures',()=>{
 const yaml=fs.readFileSync('.github/workflows/local-safety.yml','utf8').replace(/\r\n/g,'\n');
 const step=yaml.split('      - name: Equipment no-poll source and local Save regression\n')[1]?.split('      - name:')[0];assert(step);
 for(const file of ['tests/equipment-no-poll.test.mjs','tests/equipment-sent-batch.test.mjs','tests/equipment-sent-batch-quarantine.test.mjs','tests/equipment-sent-batch-insert-ack.test.mjs','tests/access-event-main-integration.test.cjs'])assert(step.includes(file));
 assert(step.includes('if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }'));assert.doesNotMatch(step,/continue-on-error|test-name-pattern|test-skip-pattern/);
});

for(const contract of equipmentRepair.contracts)void test('equipment CI repair retains exact d4ac309 source and predecessor: '+contract.file,()=>{
 const bytes=require('../scripts/background-check-source-contract.cjs').projectKnown(readSource(contract.file),contract.file),copy=Buffer.from(bytes),prior=equipmentRepair.restorePredecessor(bytes,contract.file);
 assert.equal(hash(bytes),contract.afterHash);assert.equal(hash(prior),contract.beforeHash);assert.deepEqual(bytes,copy);
 assert.equal(contract.beforeHash,contract.file===noPoll.file?noPoll.afterHash:'cb5fccf31b25d24751f5d72422cc744a3c6024e9e2142bf55db6189942d12352');
 assert.equal(hash(project(bytes,contract.file)),main[contract.file]);
 assert.throws(()=>equipmentRepair.assertCurrent(prior,contract.file),/pinned/,'whole PR97 rollback fails current-source attestation even if historical projection matches');
 assert.throws(()=>equipmentRepair.restorePredecessor(prior,contract.file),/pinned/);
 assert.throws(()=>equipmentRepair.restorePredecessor(bytes,'./'+contract.file),/wrong file/);
 for(const value of [bytes.toString(),new Uint8Array(bytes),null])assert.throws(()=>equipmentRepair.restorePredecessor(value,contract.file),/raw source bytes/);
 for(const changed of [Buffer.concat([bytes,Buffer.from(' ')]),bytes.subarray(0,-1),Buffer.concat([bytes,bytes])])assert.throws(()=>equipmentRepair.assertCurrent(changed,contract.file),/pinned/);
 for(const rule of contract.rules){
  const span=Buffer.from(rule.after),start=bytes.subarray(0,rule.offset),end=bytes.subarray(rule.offset+span.length);
  for(const changed of [Buffer.concat([start,Buffer.from(rule.before),end]),Buffer.concat([start,span,span,end])]){
   assert.notDeepEqual(changed,bytes);assert.throws(()=>equipmentRepair.assertCurrent(changed,contract.file),/pinned/);
  }
 }
 assert(Object.isFrozen(contract)&&Object.isFrozen(contract.rules)&&contract.rules.every(Object.isFrozen));
});
void test('equipment CI repair rejects semantic equality and explicit owner recheck mutations',()=>{
 for(const [file,changes]of [
  [noPoll.file,[['!equipmentContentEqual(confirmed.control.workflow.saved.content,confirmed.control.workflow.working)','false'],['readClient.confirmEquipmentDelivery(access);','void access;'],['access.permissions?.edit===true','true'],['flow.generation===retainedOwner.generation','true']]],
  ['public/process/shared-draft-client.js',[['equipmentContentEqual(postFlow.saved.content,postFlow.working)','true'],['Array.isArray(a)&&a.length!==b.length','false'],['owner.id!==actorId','false'],['sessionStorage.getItem(key)!==marker','false'],['equipmentDeliveryChecks.delete(result);','void result;'],['preparedFlights.size','false']]],
 ]){
  const bytes=readSource(file),text=bytes.toString();
  for(const [from,to]of changes){assert(text.includes(from),from);const changed=Buffer.from(text.replace(from,to));assert.throws(()=>equipmentRepair.assertCurrent(changed,file),/pinned/);assert.notEqual(hash(project(changed,file)),main[file]);}
 }
});
