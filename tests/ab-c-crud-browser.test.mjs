import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {createABCFixture} from './ab-c-native-fixture.mjs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}),report={commit:process.env.PROCESS_PROGRAM_COMMIT,samples:[],checks:[]};
try{for(let run=0;run<5;run++){
 const f=await createABCFixture();report.buildEntrySha256=f.buildEntrySha256;
 try{const c=await browser.newContext();await c.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);const p=await c.newPage();p.on('dialog',d=>d.accept());
 const apply=async()=>{await p.locator('#master-edit-dialog [type=submit]').click();await p.waitForSelector('#master-edit-dialog',{state:'detached'});};
 const measure=async(scope,operation,fn)=>{const start=performance.now();await fn();report.samples.push({scope,operation,run,ms:Math.round(performance.now()-start)});};
 for(const scope of ['AB','C']){
 const prefix=scope==='AB'?'A':'C';await p.goto(f.url.origin+'/process/?system=process&view=data&dataTab='+scope);await p.waitForSelector('#master-new-draft');await p.locator('#master-new-draft').click();await p.waitForSelector('#add-master-category');
 await p.locator('#add-master-category').click();await p.locator('#master-edit-dialog [name=name]').fill('NEW-GROUP');await measure(scope,'category-create',apply);assert.equal(await p.locator('[data-category-edit="NEW-GROUP"]').count(),1);
 await p.locator('[data-category-edit="NEW-GROUP"]').click();await p.locator('#master-edit-dialog [name=name]').fill('RENAMED');await measure(scope,'category-rename',apply);
 await p.locator('#master-category-filter').selectOption('RENAMED');await p.locator('[data-group-route-edit="RENAMED"]').click();
 for(const stage of ['A','B','C','D']){await p.locator('[data-group-stage]').selectOption(prefix+'-'+stage);await p.locator('[data-group-add]').click();}await measure(scope,'group-route-apply',apply);
 await p.locator('#master-add-product').click();await p.locator('#master-edit-dialog [name=code]').fill(prefix+'NEW');await p.locator('#master-edit-dialog [name=name]').fill('New product');await measure(scope,'product-create',apply);
 await p.locator('[data-product-edit="'+prefix+'NEW"]').click();await p.locator('#master-edit-dialog [name=route-mode]').selectOption('exception');await p.locator('[data-route-remove="3"]').click();await measure(scope,'product-exception-apply',apply);
 assert.deepEqual(await p.evaluate(s=>MasterDataWorkflow.shared.flow(s).working.products.find(x=>x.code.endsWith('NEW')).stages,scope),['A','B','C'].map(s=>prefix+'-'+s));
 await measure(scope,'adopt-maximum-route',async()=>{await p.locator('[data-group-route-maximum="RENAMED"]').click();await p.waitForFunction(s=>!MasterDataWorkflow.shared.busy()&&MasterDataWorkflow.shared.flow(s).working.categoryGroups.find(g=>g.name==='RENAMED').defaultStages.length===3,scope);});
 assert.deepEqual(await p.evaluate(s=>MasterDataWorkflow.shared.flow(s).working.products.find(x=>x.code.endsWith('NEW')).stages,scope),['A','B','C'].map(s=>prefix+'-'+s));
 await measure(scope,'view-product-exceptions',async()=>{await p.locator('[data-route-details] > summary').click();assert.equal(await p.locator('[data-route-details]').getAttribute('open'),'');});
 await measure(scope,'product-delete',async()=>{await p.locator('[data-product-delete="'+prefix+'NEW"]').click();await p.waitForFunction(s=>!MasterDataWorkflow.shared.busy()&&!MasterDataWorkflow.shared.flow(s).working.products.some(x=>x.code.endsWith('NEW')),scope);});
 await measure(scope,'group-route-remove',async()=>{await p.locator('[data-group-route-remove="RENAMED"]').click();await p.waitForFunction(s=>MasterDataWorkflow.shared.flow(s).working.categoryGroups.find(g=>g.name==='RENAMED').defaultStages===null&&!MasterDataWorkflow.shared.busy(),scope);});
 await measure(scope,'category-delete',async()=>{await p.locator('[data-category-delete="RENAMED"]').click();await p.waitForSelector('[data-category-delete="RENAMED"]',{state:'detached'});});
 await p.locator('#master-category-filter').selectOption('GROUP-1');const before=await p.evaluate(s=>JSON.stringify(MasterDataWorkflow.shared.flow(s).working),scope);await p.locator('[data-category-delete="GROUP-1"]').click();assert.equal(await p.evaluate(s=>JSON.stringify(MasterDataWorkflow.shared.flow(s).working),scope),before);
 report.checks.push(scope+' create/rename/delete category, group route, product create/exception/delete, adopt maximum preserves routes, exception details, nonempty category refused');
 }await c.close();}finally{await f.close();}console.log('CRUD round',run+1);
}}finally{fs.writeFileSync('.sites-runtime/ab-c-crud.json',JSON.stringify(report,null,2));await browser.close();}
