// Exact source evidence only. No predecessor from this module executes in the
// application; runtime tests load actual current handlers. Preserve public #103
// preimages and all independent historical contracts, including UNKNOWN fences.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const contract=require('./account-page-source-contract.json'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const c of Object.values(contract.files)){for(const rule of c.rules||[])Object.freeze(rule);if(c.rules)Object.freeze(c.rules);Object.freeze(c);}Object.freeze(contract.files);Object.freeze(contract);
// Keep the original #103 proof on its actual blob. Only this exact GET-only
// successor may project to it; modified bytes still reach the original checks.
const routineFile='app/api/routine-fqc/route.ts';
const routineEntryHash='a50aca9b061a2f0f3a6e145eed6a558e87e4eb96b9c1d51fab675e2378c759c3';
function accountSource(bytes,file){
 if(file===routineFile&&Buffer.isBuffer(bytes)&&hash(bytes)===routineEntryHash){
  const source=bytes.toString('utf8');
  const start=source.indexOf('    // The normal page and its availability probe');
  const end=source.indexOf('        ...(approved?',start);
  const sources='    const sources = operationId?[]:routineSources(state);';
  const parent=Buffer.from((source.slice(0,start)+'    const state = await readState({\n'+source.slice(end))
   .replace(sources+'\n','')
   .replace('    const c = parseRoutine(state.values[RF_KEY]);','    const c = parseRoutine(state.values[RF_KEY]),\n      sources = operationId?[]:routineSources(state);'));
  assert.equal(hash(parent),contract.files[file].afterHash,'Routine parent source differs');
  return parent;
 }
 return require('./account-process-followup-source-contract.cjs').projectKnown(bytes,file);
}
const get=file=>Object.hasOwn(contract.files,file)?contract.files[file]:null;
function assertCurrent(bytes,file){bytes=accountSource(bytes,file);assert(Buffer.isBuffer(bytes),'Account page proof requires raw Buffer');const c=get(file);assert(c,'Unknown account page source path');assert.equal(bytes.length,c.afterLength,'Account page successor length differs');assert.equal(hash(bytes),c.afterHash,'Account page successor differs');return c;}
function projectFile(bytes,file){bytes=accountSource(bytes,file);const c=assertCurrent(bytes,file);assert(!c.newFile,'New account page source has no predecessor');let result=Buffer.from(bytes);for(const r of [...c.rules].reverse()){const span=Buffer.from(r.after);assert.deepEqual(result.subarray(r.offset,r.offset+span.length),span,'Account page span differs');result=Buffer.concat([result.subarray(0,r.offset),Buffer.from(r.before),result.subarray(r.offset+span.length)]);}assert.equal(result.length,c.beforeLength);assert.equal(hash(result),c.beforeHash,'Account page predecessor differs');return result;}
function projectKnown(bytes,file){bytes=accountSource(bytes,file);assert(Buffer.isBuffer(bytes),'Account page proof requires raw Buffer');const c=get(file);return c&&!c.newFile&&hash(bytes)===c.afterHash?projectFile(bytes,file):bytes;}
function verifyRepository(root=process.cwd()){
 const git=(...args)=>execFileSync('git',args,{cwd:root});assert.equal(git('cat-file','-t',contract.baseTree).toString().trim(),'tree');
 for(const [file,c]of Object.entries(contract.files)){const raw=git('show','HEAD:'+file),committed=accountSource(raw,file),working=fs.readFileSync(path.join(root,file));if(file===routineFile)assert.equal(hash(raw),routineEntryHash,'Routine entry successor differs');assertCurrent(committed,file);assert.deepEqual(git('cat-file','blob',c.afterBlob),committed);assert.deepEqual(Buffer.from(working.toString().replace(/\r\n/g,'\n')),Buffer.from(raw.toString().replace(/\r\n/g,'\n')),'Account page non-EOL checkout drift');if(!c.newFile){const original=git('show',contract.baseTree+':'+file);assert.equal(hash(original),c.beforeHash);assert.deepEqual(git('cat-file','blob',c.beforeBlob),original);assert.deepEqual(projectFile(committed,file),original);}else assert.equal(git('ls-tree',contract.baseTree,'--',file).length,0,'New page source must be absent in the public predecessor tree');}
 return {status:'PASS_ACCOUNT_PAGE_EXACT_SOURCE',baseTree:contract.baseTree,files:Object.keys(contract.files).length};
}
module.exports=Object.freeze({contract,hash,assertCurrent,projectFile,projectKnown,verifyRepository});
