// Node's built-in TS transform + VM modules for isolated source-level Worker tests.
// No build output, dependency lookup, path relocation or production credentials.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const checkout=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));
// Physical reads omit only the two reviewed cache queries; module keys retain them.
// Shared by ESM and same-realm CJS fixtures so Windows never treats ?v= as a filename.
export function policySourceLocation(file){
 let filename=path.resolve(file);if(!filename.startsWith(checkout+path.sep))throw Error('SOURCE_OUTSIDE_CHECKOUT');
 const query='?v=20261110-account-pages1',queried=path.relative(checkout,filename).split(path.sep).join('/'),hasPinnedQuery=['public/process/access-policy.mjs'+query,'public/process/draft-review-policy.mjs'+query].includes(queried);
 if(hasPinnedQuery)filename=filename.slice(0,-query.length);
 const relative=path.relative(checkout,filename).split(path.sep).join('/');
 if(!/^(?:app\/api\/|lib\/|public\/process\/)/.test(relative))throw Error('SOURCE_DIRECTORY_REFUSED');
 if(/[?#]/.test(filename))throw Error('SOURCE_EXTENSION_REFUSED');
 if(!path.extname(filename))filename+='.ts';
 if(!['.ts','.mjs','.js'].includes(path.extname(filename)))throw Error('SOURCE_EXTENSION_REFUSED');
 if(fs.lstatSync(filename).isSymbolicLink()||fs.realpathSync(filename)!==filename)throw Error('SOURCE_LINK_REFUSED');
 return {filename,moduleKey:filename+(hasPinnedQuery?query:''),query:hasPinnedQuery?query:''};
}
export function workerSource(env={},options={}){
 const cryptoOverrides=options.cryptoOverrides||{};if(Object.keys(cryptoOverrides).some(key=>!['randomBytes','scrypt'].includes(key)||typeof cryptoOverrides[key]!=='function'))throw Error('CRYPTO_PORT_REFUSED');
 const consolePort=options.consolePort||console;
 if(typeof vm.SourceTextModule!=='function')throw Error('Run isolated tests with --experimental-vm-modules');
 const context=vm.createContext({Request,Response,Headers,URL,URLSearchParams,ReadableStream,TextEncoder,TextDecoder,AbortController,Buffer,crypto:webcrypto,Date,performance,console:consolePort,atob,btoa,structuredClone,setTimeout,clearTimeout,fetch(){throw Error('SYNTHETIC_OUTBOUND_FORBIDDEN');}}),cache=new Map();
 async function builtin(specifier){
  if(!['node:crypto','node:buffer'].includes(specifier))throw Error('UNEXPECTED_NATIVE_IMPORT');
  if(!cache.has(specifier)){
   const original=await import(specifier),exports=specifier==='node:crypto'?{...original,...cryptoOverrides}:original,names=Object.keys(exports);
   cache.set(specifier,new vm.SyntheticModule(names,function(){for(const name of names)this.setExport(name,exports[name]);},{context,identifier:specifier}));
  }
  return cache.get(specifier);
 }
 function source(file){
  const {filename:resolved,moduleKey,query}=policySourceLocation(file);
  if(!cache.has(moduleKey)){
   const raw=fs.readFileSync(resolved,'utf8'),code=resolved.endsWith('.ts')?stripTypeScriptTypes(raw,{mode:'transform',sourceUrl:pathToFileURL(resolved).href}):raw;
   cache.set(moduleKey,new vm.SourceTextModule(code,{context,identifier:moduleKey,initializeImportMeta(meta){meta.url=pathToFileURL(resolved).href+query;}}));
  }
  return cache.get(moduleKey);
 }
 if(!cache.has('cloudflare:workers'))cache.set('cloudflare:workers',new vm.SyntheticModule(['env'],function(){this.setExport('env',env);},{context,identifier:'cloudflare:workers'}));
 const link=async(specifier,parent)=>{
  if(specifier==='cloudflare:workers')return cache.get(specifier);
  if(specifier.startsWith('node:'))return builtin(specifier);
  if(specifier.startsWith('@/'))return source(path.join(checkout,specifier.slice(2)));
  if(specifier.startsWith('.'))return source(path.resolve(path.dirname(parent.identifier),specifier));
  throw Error('DEPENDENCY_IMPORT_REFUSED');
 };
 return {async load(relative){const sourceModule=source(path.resolve(checkout,relative));if(sourceModule.status==='unlinked')await sourceModule.link(link);if(sourceModule.status==='linked')await sourceModule.evaluate();return sourceModule.namespace;},get loadedModules(){return [...cache.keys()];}};
}
