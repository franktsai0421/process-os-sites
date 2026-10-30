import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import {runtimeCatalog} from '../lib/process-bootstrap.mjs';
const load=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({});
const {catalogReferences,removedCatalogReferences,visibleCatalogReferences}=load('lib/master-product-references.ts');
for(const source of ['processAuthoringControl','approvalVersions','qualityMasterControl','ipqcABMasterControl','ipqcCMasterControl','routineFqcControl'])await test(source+' protects retained structured history, never arbitrary display text',()=>{
 const values={[source]:JSON.stringify({workflow:{
  cases:[{id:'case',status:'returned',content:{items:[{id:'item',stageCode:'A-D',productCodes:['P'],name:'Unrelated Q'}]}}],
  saves:[{id:'save',content:{workspaces:[{id:'workspace',stages:{'A-D':[{id:'node',bomSelections:{P:['part']}}]}}]}}]
 }})};
 assert(catalogReferences(values,['P']).total>=2);assert.equal(catalogReferences(values,['Q']).total,0);
});
await test('reference summaries mask unauthorized module and historical detail',()=>{
 const impact=catalogReferences({ipqcCMasterControl:JSON.stringify({versions:[{id:'private',snapshot:{items:[{id:'secret',productCode:'P'}]}}]})},['P']);
 assert.equal(visibleCatalogReferences(impact,{}).references[0].id,'');assert.equal(visibleCatalogReferences(impact,{'ipqc-c.view':true}).references[0].id,'');assert.equal(visibleCatalogReferences(impact,{'ipqc-c.view':true,'ipqc-c.history':true}).references[0].id,'secret');
});
await test('category batch deletion cannot erase dependency evidence and never removes source data',()=>{
 const before={products:[{id:'p',code:'P',line:'A',category:'G'}],categoryGroups:[{id:'g',line:'A',name:'G',defaultStages:['A-D']}]},original=JSON.stringify(before);
 assert.equal(removedCatalogReferences({},before,{products:[],categoryGroups:[]}).total,2);assert.equal(JSON.stringify(before),original);
 assert.equal(removedCatalogReferences({},before,{...before,products:[]}).total,0);
});
await test('missing historical bodies fail closed',()=>assert.throws(()=>catalogReferences({processAuthoringControl:JSON.stringify({versions:[{snapshot:{__immutableBody:{key:'private'}}}]})},['P']),/REFERENCE_HISTORY_NOT_LOADED/));
const app=fs.readFileSync('public/process/app.js','utf8'),start=app.indexOf('function categoryStageCodes('),end=app.indexOf('function editorKey(',start);
const catalog=line=>({products:[{code:line+'1',line,category:'G',stages:[line+'-A',line+'-B',line+'-C']}],lines:[{code:line,stages:['A','B','C','D','E'].map(code=>({code:line+'-'+code}))}],categoryGroups:[{line,name:'G',defaultStages:['A','B','C','D'].map(code=>line+'-'+code)}]});
for(const line of ['A','C'])await test(line+' approved default hides/restores stable stages without changing stored content or product route',()=>{
 const c=catalog(line),host={};vm.runInNewContext(fs.readFileSync('public/process/master-admin-ui.js','utf8'),{window:host});host.ACTIVE_MASTER_CATEGORIES=c.categoryGroups;
 const workspace={[line+'-D']:[{id:'retained',x:20,y:30,nextIds:['next'],mediaItems:[{src:'photo'}],bomSelections:{[line+'1']:['part']}}]},original=JSON.stringify(workspace);
 const context=vm.createContext({window:host,state:{editorLine:line},data:c,routing:c,routeFor:code=>c.products.find(p=>p.code===code)});vm.runInContext(app.slice(start,end),context);
 const visible=()=>Array.from(context.categoryStageCodes('G'));
 assert.deepEqual(visible(),['A','B','C','D'].map(code=>line+'-'+code));c.categoryGroups[0].defaultStages.pop();assert(!visible().includes(line+'-D'));c.categoryGroups[0].defaultStages.push(line+'-D',line+'-E');assert.deepEqual(visible(),['A','B','C','D','E'].map(code=>line+'-'+code));
 c.categoryGroups[0].defaultStages.reverse();assert.equal(visible()[0],line+'-E');c.lines[0].stages[3].name='renamed';assert.equal(JSON.stringify(workspace),original);assert.deepEqual(c.products[0].stages,['A','B','C'].map(code=>line+'-'+code));
 delete c.categoryGroups[0].defaultStages;assert.deepEqual(visible(),c.products[0].stages);
});
await test('runtime catalog carries only approved configured group routes to editor dependencies',async()=>{
 const active={AB:catalog('A'),C:catalog('C')};const result=await runtimeCatalog({masterDataControl:JSON.stringify({active,workflowScopes:{AB:{working:{private:'draft'}}}}),bomOverrides:'{"replaceAll":true,"data":{}}'},p=>p==='editor.view',()=>({}));
 assert.deepEqual(result.categoryGroups,active.AB.categoryGroups.concat(active.C.categoryGroups));assert(!JSON.stringify(result).includes('private'));
});

await test('legacy approval history and routine frozen product rows retain permission-safe references',()=>{
 const values={approvalVersions:JSON.stringify([{id:'legacy',stages:{D:[{id:'private',productCodes:['P']}]}}]),routineFqcControl:JSON.stringify({documents:[{id:'report',source:{products:[{code:'P'}]}}]})};
 const impact=catalogReferences(values,['P']);assert.equal(impact.total,2);assert(visibleCatalogReferences(impact,{'editor.view':true}).references.every(r=>!r.id));
});

await test('published dispatch snapshot alone protects product and category with view-safe details',()=>{
 const values={publishedProcess:JSON.stringify({A:{id:'published',line:'A',category:'G',stages:{'A-D':[{id:'live-op',productCodes:['P']}]}}})},original=JSON.stringify(values);
 const impact=catalogReferences(values,['P'],[{line:'A',name:'G'}]);assert.equal(impact.total,2);
 assert(visibleCatalogReferences(impact,{}).references.every(r=>r.id===''&&r.path===''));
 assert(visibleCatalogReferences(impact,{'editor.view':true}).references.some(r=>r.id==='live-op'));
 assert.equal(removedCatalogReferences(values,{products:[{code:'P'}],categoryGroups:[]},{products:[],categoryGroups:[]}).total,1);assert.equal(JSON.stringify(values),original);
});
