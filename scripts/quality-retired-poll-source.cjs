// Test-only immutable polling predecessor; never used by the application.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process'),path=require('node:path');
const baseline='9fbba823090f03da8385c8d92f5e59293d19d2f1';
const pins={'fqc-master.js':'f8a6969cb108d3d25b8e842d7d1bb1a97fff9203fb42fb4a0878994156dc5528','iqc-master.js':'91a8d39709d0f8fb986f8f2e4050e4331a75aa8a6910ca2d481eb847378fd2b9'};
function retiredPollSource(current,name){
 assert.equal(typeof current,'string');assert(Object.hasOwn(pins,name),'reviewed quality predecessor only');
 if(/createForegroundPoll|pollShared|scheduleRefresh|setInterval\s*\(/.test(current))return current;
 const raw=execFileSync('git',['show',baseline+':public/process/'+name],{cwd:path.resolve(__dirname,'..')});assert.equal(createHash('sha256').update(raw).digest('hex'),pins[name],'exact main Git object');return raw.toString();
}
module.exports={baseline,retiredPollSource};
