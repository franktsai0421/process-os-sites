/* PR86 observations project to exact merged-main bad0463 safety bytes. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const {withoutAccessEventMetadata:project}=require('../scripts/access-event-source-contract.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
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
for(const [file,pinned]of Object.entries(main))void test('preserves merged main safety bytes: '+file,()=>assert.equal(hash(project(fs.readFileSync(file),file)),pinned));
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
