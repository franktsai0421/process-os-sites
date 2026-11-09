// Actual IQC caller/shared client/handler, with synthetic DOM, SQLite and R2 only.
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
const require=createRequire(import.meta.url),fixture=require('../scripts/fqc-apply-fixture.cjs');
export const clone=value=>JSON.parse(JSON.stringify(value));
const root=new URL('../',import.meta.url);
const snapshot=()=>({categories:[{id:'cat',nameVi:'Category'}],suppliers:[{id:'supplier',nameVi:'Supplier'}],parts:[{id:'part',code:'P',nameVi:'Part',specificationVi:'Spec',categoryId:'cat',supplierIds:['supplier'],photos:[],isEnabled:true}],errors:[{id:'error',code:'P-IQC-L1',partCode:'P',nameVi:'Error'}],items:[{id:'item',partCode:'P',errorId:'error',checkNo:'P-IQC-L1-01',nameVi:'Item',toolVi:'Visual',methodVi:'Method',rules:[],frequencyRaw:'',isEnabled:true,inspectionSpecVi:'Spec',inspectionMode:'visual',equipmentId:'',equipmentSnapshot:null,mediaItems:[]}]});
export async function setup({legacy=false,intercept,sourceRef,permissions={},regressionMutant,serverRef}={}){
 if(sourceRef!==undefined&&sourceRef!=='82c058e7d2b205ddf885d747fdb8ac41bd52dd53')throw Error('UNEXPECTED_IQC_SOURCE');
 const f=await fixture();
 await f.mutate(values=>{const users=JSON.parse(values.platformUsers);for(const user of users){for(const op of ['view','edit','create','save','submit','withdraw','approve','return','delete','history'])user.accessOverrides['iqc.'+op]=true;if(user.id==='editor')for(const [key,value]of Object.entries(permissions))user.accessOverrides['iqc.'+key]=value;}values.platformUsers=JSON.stringify(users);const active={id:'active',number:1,status:'approved',snapshot:snapshot(),revision:1,history:[]};values.iqcMasterControl=JSON.stringify({schemaVersion:1,activeVersionId:'active',versions:[active,...(legacy?[{...clone(active),id:'legacy',number:2,status:'draft'}]:[])],issues:[],reservedErrorCodes:['P-IQC-L1'],reservedCheckNos:['P-IQC-L1-01']});});
 let domainLoad=f.load;if(serverRef){if(serverRef!=='82c058e7d2b205ddf885d747fdb8ac41bd52dd53')throw Error('UNEXPECTED_IQC_SERVER_SOURCE');const file='lib/iqc-workflow.ts',raw=execFileSync('git',['show',serverRef+':'+file],{cwd:root,encoding:'utf8'});domainLoad=require('../scripts/fqc-bootstrap-projection-fixture.cjs')(root.pathname,f.env,{}, {[file]:raw}).load;}if(regressionMutant==='equipment'){const file='lib/iqc-workflow.ts',raw=fs.readFileSync(new URL(file,root),'utf8'),needle='check(result.state.working,new Set(';if(raw.split(needle).length!==2)throw Error('REGRESSION_FIXTURE_SPAN_CHANGED');domainLoad=require('../scripts/fqc-bootstrap-projection-fixture.cjs')(root.pathname,f.env,{}, {[file]:raw.replace(needle,'(()=>{})(result.state.working,new Set(')}).load;}
 const api=domainLoad('app/api/iqc/workflow/route.ts'),origin='https://synthetic.invalid';
 const call=(url,options={},actor='editor')=>{const request=new Request(new URL(url,origin),{...options,headers:{origin,'Content-Type':'application/json',cookie:f.cookies[actor],...options.headers}});if(new URL(request.url).pathname!=='/api/iqc/workflow')throw Error('UNEXPECTED_IQC_FIXTURE_ROUTE');return api[request.method](request);};
 const state=async()=>JSON.parse((await f.core.readState()).values.iqcMasterControl);
 const peer=async(detail)=>{const model=await state(),command={operationId:randomUUID(),clientId:'peer-'+randomUUID(),sequence:1,generation:model.workflow.generation,action:'save',moduleAction:'save-local-v1',...detail};const response=await call('/api/iqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command})},'other');const data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));return data;};
 if(!legacy){const response=await call('/api/iqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({action:'begin'})},'other');if(!response.ok)throw Error(JSON.stringify(await response.json()));}
 const dom=canvasDOM(),document=dom.document,records=new Map(),requests=[],timers=new Map();let epoch=1,timer=0;
 document.visibilityState='visible';document.documentElement.lang='zh';
 const main=document.createElement('main');main.id='iqc-page';document.body.append(main);const toast=document.createElement('div');toast.id='toast';document.body.append(toast);
 const sync={identity:{id:'editor',name:'Synthetic editor',role:'staff'},identityGeneration:()=>epoch,captureDelivery:()=>({epoch,actor:sync.identity}),isCurrentDelivery:value=>value.epoch===epoch&&value.actor===sync.identity,platformHeaders:()=>({})};
 const c={...dom,window:null,console,crypto:webcrypto,TextEncoder,URL,URLSearchParams,Response,Request,AbortController,AbortSignal,structuredClone,Error,Promise,JSON,Map,Set,Number,Date,Math,queueMicrotask,location:{origin,pathname:'/process/'},ProcessSync:sync,state:{view:'data',dataTab:'quality-iqc'},hasPermission:()=>true,scrollY:0,scrollTo(){},CustomEvent:class{constructor(type){this.type=type;}},setTimeout(fn,ms){timers.set(++timer,{fn,ms});return timer;},clearTimeout:id=>timers.delete(id),setInterval(){throw Error('PERIODIC_TIMER_FORBIDDEN');},sessionStorage:{get length(){return records.size;},key:i=>[...records.keys()][i]??null,getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,String(v)),removeItem:k=>records.delete(k)}};c.window=c;dom.events(c);
 c.fetch=async(url,options={})=>{requests.push({url:String(url),method:options.method||'GET',body:options.body});return intercept?intercept(url,options,()=>call(url,options)):call(url,options);};
 vm.createContext(c);c.bindDataInner=()=>{};for(const file of ['shared-draft-client.js','version-draft-ui.js'])vm.runInContext(fs.readFileSync(new URL('public/process/'+file,root),'utf8'),c);
 c.VersionDraftUI={...c.VersionDraftUI,mount(){},date:()=> 'synthetic'};
 let source=sourceRef?execFileSync('git',['show',sourceRef+':public/process/iqc-master.js'],{cwd:root,encoding:'utf8'}):fs.readFileSync(new URL('public/process/iqc-master.js',root),'utf8');
 if(regressionMutant==='deleted-intent'){const needle='if(unit.remove||unit.insert||unit.row.isDeleted===true)continue;';if(source.split(needle).length!==2)throw Error('REGRESSION_FIXTURE_SPAN_CHANGED');source=source.replace(needle,'if(unit.remove||unit.insert||unit.same)continue;');}
 const hook=`let fixtureFlight=null;const fixturePost=post;post=(...args)=>fixtureFlight=fixturePost(...args);host.probe={flight:()=>fixtureFlight,post,load,render,checkOperation,saveSnapshot,transport,compareLocalSave:typeof compareLocalSave==='function'?compareLocalSave:null,install:node=>{root=node;},get:()=>({control,revision,localBase,localSnapshot,localGeneration,localBeginReceipt,pendingLocalSave,ui}),rawLocal:()=>localSnapshot};`;
 vm.runInContext(source.replace('})(window);',hook+'})(window);'),c);const probe=c.probe;probe.install(main);await probe.load();probe.render();
 return {f,c,doc:document,main,toast,records,requests,probe,state,call,peer,timers,rotate:()=>epoch++,snapshot,
   async stage(fields,kind='items',id='item'){const next=clone(probe.get().localSnapshot||probe.get().control.workflow?.working||probe.get().control.versions.find(value=>value.status==='draft').snapshot);Object.assign(next[kind].find(value=>value.id===id),fields);await probe.saveSnapshot(next);},
   async peerSave(fields,kind='items',id='item'){const row=(await state()).workflow.working[kind].find(value=>value.id===id);return peer({patches:Object.entries(fields).map(([field,value])=>({op:'set',path:[kind,{id},field],value})),guards:Object.keys(fields).map(field=>({path:[kind,{id},field],value:row[field]}))});},
   posts:()=>requests.filter(value=>value.method==='POST'),close:()=>f.close()};
}
export function waitForChoice(document){
 const selector='[data-iqc-save-choice]',existing=document.querySelector(selector);if(existing?.isConnected)return Promise.resolve(existing);
 const body=document.body,original=body.append;return new Promise(resolve=>{body.append=function(...nodes){const result=Reflect.apply(original,this,nodes),choice=document.querySelector(selector);if(choice?.isConnected){body.append=original;resolve(choice);}return result;};});
}
export async function choose(h,choice){await waitForChoice(h.doc);return h.doc.querySelector(`[data-iqc-save-choice="${choice}"]`).click();}
