// Shared departure adapters exercised in the real browser against synthetic D1/R2.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';import {chromium} from 'playwright';import {createABCFixture} from './ab-c-native-fixture.mjs';import {toolingIsolatedSnapshot} from '../scripts/tooling-isolated-fixture.mjs';
const require=createRequire(import.meta.url),qualityFixture=require('../scripts/v3-quality-growth-fixture.cjs');
const modules=[['fqc','quality-fqc','FQCMasterUI','#fqc-save'],['iqc','quality-iqc','IQCMasterUI','#iqc-save'],['ipqc-c','quality-ipqc-c','IPQCCUI','#ipqcc-save'],['ipqc-ab','quality-ipqc-ab','IPQCABUI','#ipqcab-save'],['routine-equipment','quality-routine-equipment','RoutineEquipmentUI','#routine-save'],['tooling','quality-mold-equipment','ToolingUI','#tooling-save'],['bom','bom','BOMWorkspace','#bw-save']];
const report={checks:[],failures:[],commit:process.env.PROCESS_PROGRAM_COMMIT};
const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const [moduleId,tab,ui,saveSelector] of modules){const f=await createABCFixture({decorate(values,load){
 if(!['tooling','bom'].includes(moduleId)){
 const generated=qualityFixture(moduleId,[{id:'a'.repeat(64),bytes:1}],0,3);let raw=generated.values[generated.key];
 raw=raw.replaceAll('PAB','A001').replaceAll('PC','C001').replaceAll('A-CUT','A-A').replaceAll('C-TIEN','C-A').replaceAll('A:G','A:GROUP-1').replaceAll('"G"','"GROUP-1"');
 if(moduleId==='ipqc-ab'){raw=generated.values[generated.key];const catalog=JSON.parse(values.masterDataControl);catalog.active.AB=JSON.parse(generated.values.masterDataControl).active.AB;catalog.versions.find(v=>v.scope==='AB').snapshot=catalog.active.AB;values.masterDataControl=JSON.stringify(catalog);}
 const control=JSON.parse(raw),scope=moduleId==='fqc'?control.libraries.fqc:moduleId==='ipqc-ab'?control.scopes['A:G']:control;
 scope.workflow.working[generated.collection][0][generated.field]='SYNTHETIC UNSAVED '+moduleId;
 const draft=scope.versions.find(v=>v.status==='draft');if(moduleId==='routine-equipment')Object.assign(draft,scope.workflow.working);else draft.snapshot=scope.workflow.working;
 values[generated.key]=JSON.stringify(control);
 }else{const content=moduleId==='tooling'?toolingIsolatedSnapshot(3):{bom:{A001:[{id:'row0',parentId:null,rootCode:'A001',level:0,levelLabel:'0',ordinal:'1',itemCode:'A001',itemName:'Synthetic BOM',specification:'',unit:'PCS',quantity:'1',denominator:'1',waste:'0',path:[]}]},referenceIssues:[]};
 const flow=load('lib/shared-draft.ts').createSharedDraft(moduleId,content,'active','synthetic-'+moduleId);if(moduleId==='tooling')flow.working.tools[0].notes='UNSAVED';else flow.working.bom.A001[0].itemName='UNSAVED';
 const version=(id,status,snapshot)=>({id,status,number:status==='draft'?2:1,snapshot,creatorId:'frank',creatorName:'Synthetic',createdAt:'2026-10-30T00:00:00Z',updatedAt:'2026-10-30T00:00:00Z',history:[]});values[moduleId+'MasterControl']=JSON.stringify({schemaVersion:1,reservedCodes:{},activeVersionId:'active',versions:[version('active','approved',content),version('shared-'+flow.generation,'draft',flow.working)],workflow:flow});}
 }});const c=await b.newContext();await c.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);const p=await c.newPage();p.setDefaultTimeout(8000);let accept=false;p.on('dialog',d=>accept?d.accept():d.dismiss());
 try{await p.goto(f.url.origin+'/process/?system=process&view=data&dataTab='+tab);await p.waitForFunction(u=>window[u]?.navigation&&document.documentElement.dataset.processNavigationStatus==='ready',ui);await p.waitForFunction(u=>!!window[u].navigation.requiresSave(),ui);
 const initial=await p.evaluate(u=>({pending:window[u].navigation.requiresSave(),canLeave:window[u].navigation.canLeave()}),ui);assert.equal(initial.canLeave,true);
 await p.evaluate(()=>ProcessDeliveryNavigation.navigate('data','AB'));assert.equal(await p.evaluate(()=>state.dataTab),tab);
 accept=true;let saves=0;p.on('request',r=>{if(r.method()==='POST'){try{if(r.postDataJSON()?.command?.action==='save')saves++;}catch{/* Other protocol. */}}});
 const start=performance.now();await p.evaluate(()=>ProcessDeliveryNavigation.navigate('data','AB'));await p.waitForFunction(()=>state.dataTab==='AB'&&!!document.querySelector('#master-product-search')&&document.documentElement.dataset.processNavigationStatus==='ready');const ms=Math.round(performance.now()-start);assert.equal(saves,1);
 await p.evaluate(t=>ProcessDeliveryNavigation.navigate('data',t),tab);await p.waitForFunction(u=>window[u]?.navigation&&document.documentElement.dataset.processNavigationStatus==='ready',ui);assert.equal(await p.evaluate(u=>window[u].navigation.requiresSave(),ui),false);
 report.checks.push({moduleId,status:'PASS',saveAndLeaveMs:ms,saves,verified:'cancel retains source; confirm saves once; destination ready; return is saved'});
 }catch(e){report.failures.push({moduleId,error:e.stack,body:(await p.locator('body').innerText()).slice(-3000),saveSelector});}
 finally{await c.close();await f.close();fs.writeFileSync('.sites-runtime/ab-c-cross-module.json',JSON.stringify(report,null,2));}console.log(moduleId,report.failures.some(x=>x.moduleId===moduleId)?'FAIL':'PASS');
}}finally{await b.close();}assert.deepEqual(report.failures,[]);
