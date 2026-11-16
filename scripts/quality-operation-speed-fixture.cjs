/* Synthetic-only pinned baseline loader. Never contacts a deployed service. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {execFileSync}=require('node:child_process'),{webcrypto}=require('node:crypto');
const base='a1775a8a342d58335edf96d199a9c42844227dc6';
const files=['lib/process-state.ts','lib/versioned-shared-workflow.ts','lib/state-records.ts','app/api/process-bootstrap/route.ts','app/api/process-authoring/workflow/route.ts'];
const prior=Object.fromEntries(files.map(file=>[file,execFileSync('git',['show',base+':'+file],{encoding:'utf8'})]));
function loadAt(env,old=false,instant=Date.now()){
 const cache=new Map();let sequence=0;
 class Clock extends Date{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}}
 const crypto={subtle:webcrypto.subtle,randomUUID:()=>`00000000-0000-4000-8000-${String(instant*10+(++sequence)).slice(-12).padStart(12,'0')}`,getRandomValues:webcrypto.getRandomValues.bind(webcrypto)};
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const mod={exports:{}};cache.set(file,mod.exports);const key=path.relative(process.cwd(),file).split(path.sep).join('/');
  const code=ts.transpileModule(old&&prior[key]!==undefined?prior[key]:fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require(id){if(id==='cloudflare:workers')return{env};if(id.startsWith('node:'))return require(id);const target=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);if(target.endsWith('.json'))return JSON.parse(fs.readFileSync(target));return target.endsWith('.mjs')?require(target):load(target.endsWith('.ts')?target:target+'.ts');},Error,TypeError,SyntaxError,Uint8Array,ArrayBuffer,DataView,Request,Response,ReadableStream,Headers,URL,URLSearchParams,crypto,Date:Clock,TextEncoder,TextDecoder,atob,btoa,structuredClone,console});cache.set(file,mod.exports);return mod.exports;
 }return load;
}
const snap=f=>({row:{...f.db.prepare('SELECT * FROM shared_state').get()},objects:new Map(f.objects)});
function restore(f,s){f.db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1').run(s.row.revision,s.row.values,s.row.updated_at);f.objects.clear();for(const [key,value]of s.objects)f.objects.set(key,value);}
module.exports={base,files,loadAt,snap,restore};
