// Isolated actual source-proof calls, never business data or product runtime.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{performance}=require('node:perf_hooks');
const root=path.resolve(process.argv[2]||process.cwd()),stats={},modules=['inventory-quality','inventory-account-adapter','account-outcome','quality-root','process-ipqc-frequency','process-platform-adopt','lines-flow','password-outcome','process-submit-outcome','equipment-integration','quality-main'];
for(const name of modules){
 const file=path.join(root,'scripts',name+'-source-contract.cjs'),original=require(file),wrapped={...original};
 for(const [key,fn]of Object.entries(original))if(typeof fn==='function')wrapped[key]=function(...args){const item=stats[name+'.'+key]||={calls:0,ms:0};item.calls++;const at=performance.now();try{return fn.apply(this,args);}finally{item.ms+=performance.now()-at;}};
 require.cache[require.resolve(file)].exports=wrapped;
}
const proof=require(path.join(root,'scripts/quality-main-source-contract.cjs')),file='public/process/fqc-master.js',raw=fs.readFileSync(path.join(root,file)),bad=Buffer.from(raw),steps=[];bad[0]^=1;
for(const [name,fn]of [
 ['known',()=>proof.restoreParent(raw,file,'main')],
 ['mutant-restore',()=>assert.throws(()=>proof.restoreParent(bad,file,'main'),/pinned/)],
 ['mutant-admission',()=>assert.equal(proof.projectKnown(bad,file,'main'),bad)]
]){const at=performance.now(),result=fn(),ms=performance.now()-at,resultHash=Buffer.isBuffer(result)?createHash('sha256').update(result).digest('hex'):null;if(name==='known')assert.equal(resultHash,proof.contracts.find(c=>c.file===file&&c.target==='main').beforeHash);steps.push({name,ms,resultHash});}
const sources=[...modules.map(name=>'scripts/'+name+'-source-contract.cjs'),'scripts/inventory-quality-source-contract.json','scripts/inventory-account-adapter-source-contract.json',file];if(fs.existsSync(path.join(root,'scripts/source-normalization-cache.cjs')))sources.push('scripts/source-normalization-cache.cjs');
console.log(JSON.stringify({node:process.version,sourceHashes:Object.fromEntries(sources.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')])),steps,stats:Object.entries(stats).map(([name,value])=>({name,...value})).sort((a,b)=>b.ms-a.ms),limits:'Fresh process, same known/negative calls and original proof methods. Inclusive nested times must not be summed. No business workflow or hosted-site timing.'},null,2));
