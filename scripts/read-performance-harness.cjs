/* Actual TypeScript modules; synthetic ports and allowlisted exact historical baseline modules only. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {webcrypto,createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const baselineCommit='eda3eb3e77375d513f7839ca15e65c467e0b0af8',baselines=new Map();
const baselineCommits={'app/api/ipqc-ab/route.ts':'dc8c1c2238a6dd89c2707d50e050fe8ae674c9e8','lib/user-access.ts':'dc8c1c2238a6dd89c2707d50e050fe8ae674c9e8','app/api/ipqc-c/workflow/route.ts':'dc8c1c2238a6dd89c2707d50e050fe8ae674c9e8','app/api/routine-equipment/route.ts':baselineCommit,'lib/state-media.ts':baselineCommit,'app/api/ipqc-c/route.ts':'5b7363924613d0a5071caddc84eee4b7a3602f7c','lib/process-state.ts':'5b7363924613d0a5071caddc84eee4b7a3602f7c'};
function baseline(file){if(!Object.hasOwn(baselineCommits,file))throw Error('UNEXPECTED_BASELINE_PATH');if(!baselines.has(file))baselines.set(file,execFileSync('git',['show',baselineCommits[file]+':'+file]));return baselines.get(file);}
function makeLoader(env={},options={}){
 const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const relative=path.relative(process.cwd(),file).replaceAll('\\','/'),mod={exports:{}};cache.set(file,mod.exports);
 const text=options.baseline?.includes(relative)?baseline(relative).toString():fs.readFileSync(file,'utf8');const code=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require(id){if(id==='cloudflare:workers')return{env};if(id.startsWith('node:'))return require(id);const target=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);if(target.endsWith('.json'))return JSON.parse(fs.readFileSync(target,'utf8'));return target.endsWith('.mjs')?require(target):load(target.endsWith('.ts')?target:target+'.ts');},Error,TypeError,RangeError,SyntaxError,DOMException,Request,Response,ReadableStream,Headers,URL,crypto:options.crypto||webcrypto,Date,TextEncoder,TextDecoder,atob,btoa,structuredClone,console});cache.set(file,mod.exports);return mod.exports;}
 return load;
}
module.exports={makeLoader,baselineCommit,baselineCommits,baselineHashes:()=>Object.fromEntries([...baselines].map(([p,b])=>[p,createHash('sha256').update(b).digest('hex')]))};
