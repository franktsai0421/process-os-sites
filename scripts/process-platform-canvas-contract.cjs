// Test-only exact Canvas successor -> confirmed #104 predecessor tree.
// Projections preserve historical gates; runtime never imports this module.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const evidence=require('./process-platform-canvas-contract.json'),contracts=evidence.contracts;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function raw(bytes){assert(Buffer.isBuffer(bytes),'Canvas source proof requires raw Buffer');}
function restorePredecessor(bytes,file){
 raw(bytes);bytes=require('./account-process-joint-source-contract.cjs').projectProcessKnown(bytes,file);const contract=contracts.find(row=>row.file===file);assert(contract,'Canvas source proof wrong path');assert.equal(hash(bytes),contract.afterHash,'Canvas source differs from pinned successor');
 let result=Buffer.from(bytes);
 for(const rule of [...contract.rules].reverse()){
  const after=Buffer.from(rule.after);assert.deepEqual(result.subarray(rule.offset,rule.offset+after.length),after,'Canvas source proof span mismatch');
  result=Buffer.concat([result.subarray(0,rule.offset),Buffer.from(rule.before),result.subarray(rule.offset+after.length)]);
 }
 assert.equal(hash(result),contract.beforeHash,'Canvas source predecessor differs');return result;
}
function projectKnown(bytes,file){raw(bytes);bytes=require('./account-process-joint-source-contract.cjs').projectProcessKnown(bytes,file);const contract=contracts.find(row=>row.file===file&&row.afterHash===hash(bytes));return contract?restorePredecessor(bytes,file):bytes;}
function verifyRepository(directory=process.cwd()){
 const git=(...args)=>execFileSync('git',args,{cwd:directory});git('merge-base','--is-ancestor',evidence.main,'HEAD');
 const joint=require('./account-process-joint-source-contract.cjs');joint.verifyRepository(directory);
 if(!git('log','--format=%T','HEAD').toString().split('\n').includes(evidence.predecessorTree))joint.verifyProcessAncestry(directory,evidence.predecessorTree);
 for(const contract of contracts){
  const before=git('show',evidence.predecessorTree+':'+contract.file),current=git('show','HEAD:'+contract.file),working=fs.readFileSync(path.join(directory,contract.file));
  assert.equal(hash(before),contract.beforeHash);assert.equal(git('rev-parse',evidence.predecessorTree+':'+contract.file).toString().trim(),contract.beforeBlob);
  assert.equal(hash(joint.projectProcessKnown(current,contract.file)),contract.afterHash);assert.deepEqual(working.toString().replace(/\r\n/g,'\n'),current.toString().replace(/\r\n/g,'\n'),'Canvas checkout differs beyond EOL');
  assert.deepEqual(restorePredecessor(current,contract.file),before);
 }
 for(const entry of evidence.additions||[]){assert.equal(git('ls-tree',evidence.predecessorTree,'--',entry.file).length,0,'New Canvas source must be absent in predecessor');const bytes=git('show','HEAD:'+entry.file),published=joint.projectProcessKnown(bytes,entry.file);assert.equal(hash(published),entry.afterHash);assert.equal(joint.blob(published),entry.afterBlob);assert.deepEqual(fs.readFileSync(path.join(directory,entry.file)).toString().replace(/\r\n/g,'\n'),bytes.toString().replace(/\r\n/g,'\n'));}
 return {status:'PASS_PROCESS_CANVAS_SOURCE',files:contracts.length,predecessorTree:evidence.predecessorTree};
}
module.exports=Object.freeze({contracts,evidence,hash,restorePredecessor,projectKnown,verifyRepository});
if(require.main===module)console.log(JSON.stringify(verifyRepository()));
