/* oxlint-disable typescript/no-require-imports -- Isolated CommonJS Workers test loader. */
// Reuses the production merger/handler in isolated tests and the Local CLI preview.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {webcrypto}=require('node:crypto');
module.exports=function harness(env={}) {
  const cache=new Map();
  function load(file) {
    file=path.resolve(file);if(cache.has(file)) return cache.get(file);
    const mod={exports:{}};cache.set(file,mod.exports);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,
      target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    vm.runInNewContext(code,{module:mod,exports:mod.exports,require(id){
      if(id==='cloudflare:workers') return {env};
      if(id.startsWith('node:'))return require(id);
      const target=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);
      if(target.endsWith('.json')) return JSON.parse(fs.readFileSync(target,'utf8'));
      return target.endsWith('.mjs')?require(target):load(target.endsWith('.ts')?target:target+'.ts');
    },Request,Response,ReadableStream,Headers,URL,URLSearchParams,crypto:webcrypto,Date,TextEncoder,TextDecoder,atob,btoa,structuredClone,console});
    cache.set(file,mod.exports);return mod.exports;
  }
  return load;
};
