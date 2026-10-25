// Runs the actual client sources in an isolated DOM/storage fixture. No browser
// credential, data fixture, network listener or remote request is used here.
import fs from 'node:fs';import vm from 'node:vm';
const source=name=>fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
export async function runImportBoot({response=()=>Response.json({error:'IMPORT_TARGET_NOT_ACTIVE'},{status:503}),language='vi',failScript=false,sharedSource=source('shared-state.js'),bootSource=source('bootstrap.js'),seed={},authoringReady}={}){
 const requests=[],preloads=[],executed=[],events=[],attributes={},storageWrites=[];
 class Storage{getItem(k){return Object.hasOwn(this,k)?this[k]:null;}setItem(k,v){storageWrites.push(k);this[k]=String(v);}removeItem(k){delete this[k];}}
 const localStorage=new Storage(),sessionStorage=new Storage();Object.assign(localStorage,seed);localStorage.processUILanguage=language;
 const boot={style:{},innerHTML:'',textContent:'',setAttribute(k,v){attributes[k]=v;},append(){events.push('retry');},remove(){events.push('revealed');}};
 const items=['data/imported-data.js','data/line-process-data.js','app.js'].map(name=>({dataset:{processSrc:name},replaceWith(script){executed.push(script.src);queueMicrotask(()=>failScript?script.onerror():script.onload());}}));
 const document={documentElement:{lang:language,dataset:{},removeAttribute(){events.push('unhidden');}},head:{append(link){preloads.push(link.href);}},querySelector:s=>s==='#process-boot'?boot:null,querySelectorAll:()=>items,createElement:tag=>({tag})};
 const window={addEventListener(){},dispatchEvent(e){events.push(e.type);},...(authoringReady?{ProcessAuthoringV3:{readyForEditor:()=>authoringReady({boot,events})}}:{})};
 const context=vm.createContext({window,document,Storage,localStorage,sessionStorage,location:{search:''},URLSearchParams,AbortSignal,CustomEvent,Event,console:{warn(){}},setTimeout,clearTimeout,performance:{now:()=>0,mark(){}},fetch:async(url,options)=>{requests.push({url,method:options?.method||'GET'});return response(url,options);}});
 new vm.Script(sharedSource,{filename:'shared-state.js'}).runInContext(context,{timeout:1000});await window.ProcessSync.ready;
 // Expose the existing discarded IIFE promise only to await completion. No
 // implementation branch, response or script-loader logic is replaced.
 const bootScript=new vm.Script(bootSource.replace('void (async () => {','(async () => {'),{filename:'bootstrap.js',importModuleDynamically:async()=>{const policy=new vm.SyntheticModule([],()=>{},{context});await policy.link(()=>{});await policy.evaluate();return policy;}});
 await bootScript.runInContext(context,{timeout:1000});
 return{api:window.ProcessSync,document,boot,attributes,requests,preloads,executed,events,localStorage,sessionStorage,storageWrites};
}
