// Same synthetic fixture and compiled native app for both revisions. No remote data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';
import {buttonTiming} from './ab-c-button-timing.mjs';
const variant=process.env.ABC_VARIANT||'after',runs=Number(process.env.ABC_RUNS||5);
const report={variant,sourceCommit:process.env.PROCESS_PROGRAM_COMMIT,productsPerScope:82,runs,samples:[],errors:[],inventory:[]};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {for(let run=0;run<runs;run++)for(const scope of ['AB','C']){
 const prefix=scope==='AB'?'A':'C',target=scope==='AB'?'C':'AB';
 const f=await createABCFixture({products:82,applicationRoot:process.env.ABC_APPLICATION_ROOT});
 report.buildEntrySha256=f.buildEntrySha256;
 const context=await browser.newContext(),p=await context.newPage();p.setDefaultTimeout(4000);
 const timing=process.env.ABC_TRACE?await buttonTiming(p):null;
 await context.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);
 let accept=true;p.on('dialog',d=>accept?d.accept():d.dismiss());p.on('pageerror',e=>report.errors.push({scope,run,error:e.message}));
 const ready=async(s=scope)=>p.waitForFunction(s=>typeof state!=='undefined'&&state.dataTab===s&&document.querySelector('#master-product-search')&&!MasterDataWorkflow.shared.busy()&&document.documentElement.dataset.processNavigationStatus==='ready',s);
 const goto=async()=>{await p.goto(f.url.origin+'/process/?system=process&view=data&dataTab='+scope);await ready();};
 const measure=async(operation,fn)=>{const start=performance.now(),mark=timing?.start();try{await fn();const measurement=timing?await timing.finish(mark):{ms:Math.round(performance.now()-start)};report.samples.push({scope,run,operation,status:'PASS',...measurement});return true;}catch(e){report.samples.push({scope,run,operation,status:'FAIL',ms:Math.round(performance.now()-start),error:e.message.split('\n')[0]});return false;}};
 const req=async(body)=>{const r=await f.mf.dispatchFetch(f.url.origin+'/api/master/workflow?scope='+scope,{method:body?'POST':'GET',headers:{Cookie:'process_demo='+f.cookie(),Origin:f.url.origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v.control;};
 let sequence=0;
 const command=async(action,detail={})=>{const control=await req();return req({command:{action,generation:control.workflow.generation,operationId:randomUUID(),clientId:'complete-benchmark',sequence:++sequence,...detail}});};
 const apiName=async name=>{const flow=(await req()).workflow,product=flow.working.products[0],path=['products',{id:product.id},'name'];await command('apply',{patches:[{op:'set',path,value:name}],guards:[{path,value:product.name}]});await goto();};
 const click=async(selector,done)=>{await p.locator(selector).first().click();if(done)await done();};
 const apply=async()=>{await click('#master-edit-dialog [type=submit]',()=>p.waitForSelector('#master-edit-dialog',{state:'detached'}));await p.waitForFunction(()=>!MasterDataWorkflow.shared.busy());};
 const cancel=async()=>{if(await p.locator('#master-edit-dialog').count())await p.keyboard.press('Escape');};
 const flow=()=>p.evaluate(s=>MasterDataWorkflow.shared.flow(s),scope);
 const openHistory=async()=>{const details=p.locator('.vd-history');if(await details.count()&&(await details.getAttribute('open'))===null)await details.locator('summary').click();await click('#master-shared-history',()=>p.waitForSelector('.shared-restore-dialog'));};
 const overlay=()=>p.locator('.shared-restore-overlay').last();
 try{
 await measure('cold-entry',goto);await measure('reload',async()=>{await p.reload();await ready();});
 await measure('search',()=>p.locator('#master-product-search').fill(prefix+'001').then(()=>p.waitForFunction(()=>document.querySelectorAll('.master-table tbody tr').length===1)));
 await measure('clear-search',()=>p.locator('#master-product-search').fill('').then(()=>p.waitForFunction(()=>document.querySelectorAll('.master-table tbody tr').length===40)));
 await measure('line-filter',()=>p.locator('#master-line-filter').selectOption(prefix).then(async()=>assert.equal(await p.locator('#master-line-filter').inputValue(),prefix)));
 await measure('clear-line-filter',()=>p.locator('#master-line-filter').selectOption(''));
 await measure('category-filter',()=>p.locator('#master-category-filter').selectOption('GROUP-1').then(()=>p.waitForSelector('[data-group-route-view]')));
 await measure('clear-category-filter',()=>p.locator('#master-category-filter').selectOption(''));
 await measure('category-card',()=>click('[data-category-pick="GROUP-2"]',async()=>assert.equal(await p.locator('#master-category-filter').inputValue(),'GROUP-2')));await p.locator('#master-category-filter').selectOption('');
 await measure('product-next-page',()=>click('[data-product-page="1"]',()=>p.waitForFunction(()=>document.querySelector('.master-pagination').textContent.includes('2 / 3'))));
 await measure('product-previous-page',()=>click('[data-product-page="0"]',()=>p.waitForFunction(()=>document.querySelector('.master-pagination').textContent.includes('1 / 3'))));
 await measure('switch-to-other-scope',async()=>{await p.evaluate(t=>ProcessDeliveryNavigation.navigate('data',t),target);await ready(target);});
 await measure('warm-return',async()=>{await p.evaluate(s=>ProcessDeliveryNavigation.navigate('data',s),scope);await ready();});
 await measure('begin',()=>click('#master-new-draft',()=>p.waitForSelector('[data-product-edit]')));
 report.inventory.push({scope,run,buttons:await p.locator('.master-shell button').evaluateAll(bs=>bs.map(b=>({text:b.textContent.trim(),id:b.id,attributes:[...b.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value])})))});
 await measure('open-product',()=>click('[data-product-edit="'+prefix+'001"]',()=>p.waitForSelector('#master-edit-dialog')));
 const routeCodes=()=>p.locator('[data-route-list] li code').allTextContents();const initial=await routeCodes();
 await measure('product-route-add',async()=>{await p.locator('[name=stage-choice]').selectOption(prefix+'-E');await click('[data-route-add]');assert.equal((await routeCodes()).at(-1),prefix+'-E');});
 await measure('product-route-up',async()=>{await click('[data-route-up="3"]');assert.equal((await routeCodes())[2],prefix+'-E');});
 await measure('product-route-down',async()=>{await click('[data-route-down="2"]');assert.equal((await routeCodes())[3],prefix+'-E');});
 await measure('product-route-remove',async()=>{await click('[data-route-remove="3"]');assert.deepEqual(await routeCodes(),initial);});
 await measure('product-apply-default',async()=>{await click('[data-apply-default]');assert.equal(await p.locator('[name=route-mode]').inputValue(),'group');assert.equal((await routeCodes()).length,4);});
 await measure('product-exception-mode',async()=>{await p.locator('[name=route-mode]').selectOption('exception');assert.equal(await p.locator('[data-route-add]').isEnabled(),true);});
 await p.locator('[name=name]').fill('Edited '+scope);await measure('product-edit-apply',apply);await cancel();
 await measure('product-cancel',async()=>{const before=JSON.stringify((await flow()).working);await click('[data-product-edit="'+prefix+'001"]');await p.locator('[name=name]').fill('NOT APPLIED');await click('#master-edit-dialog [data-cancel]');assert.equal(JSON.stringify((await flow()).working),before);});
 await click('#add-master-category');await p.locator('[name=name]').fill('NEW-GROUP');await measure('category-create',apply);await cancel();
 await click('[data-category-edit="NEW-GROUP"]');await p.locator('[name=name]').fill('RENAMED');await measure('category-rename',apply);await cancel();
 await p.locator('#master-category-filter').selectOption('RENAMED');await measure('open-group-route',()=>click('[data-group-route-edit="RENAMED"]',()=>p.waitForSelector('#master-edit-dialog')));
 const groupCodes=()=>p.locator('[data-group-route-list] li > span').allTextContents();
 await measure('group-route-add',async()=>{await p.locator('[data-group-stage]').selectOption(prefix+'-A');await click('[data-group-add]');assert.equal((await groupCodes()).length,1);});
 await p.locator('[data-group-stage]').selectOption(prefix+'-B');await click('[data-group-add]');
 await measure('group-route-up',async()=>{await click('[data-group-up="1"]');assert((await groupCodes())[0].startsWith(prefix+'-B'));});
 await measure('group-route-down',async()=>{await click('[data-group-down="0"]');assert((await groupCodes())[1].startsWith(prefix+'-B'));});
 await measure('group-route-remove-stage',async()=>{await click('[data-group-remove="1"]');assert.equal((await groupCodes()).length,1);});
 for(const suffix of ['B','C','D']){await p.locator('[data-group-stage]').selectOption(prefix+'-'+suffix);await click('[data-group-add]');}
 await measure('group-route-apply',apply);await cancel();
 await measure('open-new-product',()=>click('#master-add-product',()=>p.waitForSelector('#master-edit-dialog')));await p.locator('[name=code]').fill(prefix+'NEW');await p.locator('[name=name]').fill('New product');await measure('product-create',apply);await cancel();
 // Independent precondition: both builds get a real API-created row, even if UI Apply is broken.
 if(!(await req()).workflow.working.products.some(x=>x.code===prefix+'NEW')){await command('apply',{patches:[{op:'insert',path:['products'],value:{id:randomUUID(),code:prefix+'NEW',name:'New product',line:prefix,category:'RENAMED',unit:'pcs',routeMode:'exception',stages:[prefix+'-A',prefix+'-B',prefix+'-C']}}]});await goto();await p.locator('#master-category-filter').selectOption('RENAMED');}
 await click('[data-product-edit="'+prefix+'NEW"]');await p.locator('[name=route-mode]').selectOption('exception');if(await p.locator('[data-route-remove="3"]').count())await click('[data-route-remove="3"]');await measure('product-exception-apply',apply);await cancel();
 const np=(await req()).workflow.working.products.find(x=>x.code===prefix+'NEW');if(np.stages.length!==3){await command('apply',{patches:[{op:'set',path:['products',{id:np.id},'stages'],value:['A','B','C'].map(x=>prefix+'-'+x)},{op:'set',path:['products',{id:np.id},'routeMode'],value:'exception'}]});await goto();await p.locator('#master-category-filter').selectOption('RENAMED');}
 await measure('adopt-maximum-route',()=>click('[data-group-route-maximum="RENAMED"]',()=>p.waitForFunction(s=>!MasterDataWorkflow.shared.busy()&&MasterDataWorkflow.shared.flow(s).working.categoryGroups.find(g=>g.name==='RENAMED').defaultStages.length>0,scope)));
 await measure('view-route',()=>click('[data-group-route-view="RENAMED"]',()=>p.waitForSelector('#master-edit-dialog')));await cancel();
 await measure('view-product-exceptions',()=>click('[data-route-details] > summary',async()=>assert.equal(await p.locator('[data-route-details]').getAttribute('open'),'')));
 await measure('product-delete',()=>click('[data-product-delete="'+prefix+'NEW"]',()=>p.waitForFunction(s=>!MasterDataWorkflow.shared.busy()&&!MasterDataWorkflow.shared.flow(s).working.products.some(x=>x.code.endsWith('NEW')),scope)));
 await measure('group-route-remove',()=>click('[data-group-route-remove="RENAMED"]',()=>p.waitForFunction(s=>!MasterDataWorkflow.shared.busy()&&MasterDataWorkflow.shared.flow(s).working.categoryGroups.find(g=>g.name==='RENAMED').defaultStages===null,scope)));
 await measure('category-delete',()=>click('[data-category-delete="RENAMED"]',()=>p.waitForSelector('[data-category-delete="RENAMED"]',{state:'detached'})));
 await p.locator('#master-category-filter').selectOption('');await apiName('Saved departure '+scope);
 await measure('cancel-departure',async()=>{accept=false;await p.evaluate(t=>ProcessDeliveryNavigation.navigate('data',t),target);assert.equal(await p.evaluate(()=>state.dataTab),scope);accept=true;});accept=true;
 await measure('save-and-leave',async()=>{await p.evaluate(t=>ProcessDeliveryNavigation.navigate('data',t),target);await ready(target);const saved=(await req()).workflow.saved;assert.equal(saved?.content.products[0].name,'Saved departure '+scope);});
 await goto();await apiName('Review baseline '+scope);
 await measure('save',()=>click('#master-save-draft',()=>p.waitForFunction(s=>!MasterDataWorkflow.shared.busy()&&MasterDataWorkflow.shared.flow(s).saved?.content.products[0].name==='Review baseline '+s,scope)));
 await measure('save-unchanged',()=>click('#master-save-draft',()=>p.waitForFunction(()=>!MasterDataWorkflow.shared.busy())));
 await measure('leave-after-save',async()=>{await p.evaluate(t=>ProcessDeliveryNavigation.navigate('data',t),target);await ready(target);});await goto();
 const confirm=async()=>{await p.locator('.vd-confirm textarea').fill('Synthetic verification');if(await p.locator('.vd-confirm input[type=checkbox]').count())await p.locator('.vd-confirm input[type=checkbox]').check();await click('.vd-confirm [type=submit]',()=>p.waitForSelector('.vd-confirm',{state:'detached'}));await p.waitForFunction(()=>!MasterDataWorkflow.shared.busy());};
 const submit=async(operation)=>measure(operation,async()=>{await click('#master-submit');await confirm();assert((await flow()).pendingId);});
 await submit('submit');
 await measure('pending-edit-locked',async()=>{assert.equal(await p.locator('[data-product-edit]').count(),0);});
 await measure('withdraw-on-source',async()=>{await click('#master-withdraw');await confirm();assert.equal((await flow()).pendingId,null);});await submit('resubmit-after-withdraw');
 const review=async(action)=>{await measure('review-case-open-'+action,async()=>{await click('#master-view-review');await p.waitForSelector('#master-unified-review');await p.locator('[data-master-review]').filter({hasText:scope}).first().click();await click('#master-case-diff',()=>p.waitForSelector('.master-diff-scroll tbody tr'));assert((await p.locator('.master-diff-scroll').innerText()).includes('Review baseline'));});await measure(action,async()=>{await click('[data-review-action="'+action+'"]');await confirm();assert.equal((await req()).workflow.pendingId,null);});await p.evaluate(s=>ProcessDeliveryNavigation.navigate('data',s),scope);await ready();};
 await review('return');await submit('resubmit-after-return');await review('approve');
 await click('#master-new-draft',()=>p.waitForSelector('[data-product-edit]'));await apiName('New working content');
 await measure('history-open',openHistory);
 await measure('history-case-open',()=>overlay().locator('[data-case]').first().click().then(()=>overlay().locator('[data-restore]').waitFor()));
 await measure('history-next-items',async()=>{await overlay().locator('[data-next]').click();assert((await overlay().locator('nav').innerText()).includes('2 /'));});
 await measure('history-previous-items',async()=>{await overlay().locator('[data-prev]').click();assert((await overlay().locator('nav').innerText()).includes('1 /'));});
 await measure('restore-preview',()=>overlay().locator('[data-restore]').click().then(()=>p.waitForSelector('#shared-restore-title')));
 await measure('restore-cancel',async()=>{await overlay().locator('[data-close]').last().click();assert.equal((await flow()).working.products[0].name,'New working content');});
 await overlay().locator('[data-restore]').click();await p.waitForSelector('#shared-restore-title');
 await measure('restore-apply',async()=>{await overlay().locator('[data-apply]').click();await p.waitForSelector('.shared-restore-overlay',{state:'detached'});assert.equal((await flow()).working.products[0].name,'Review baseline '+scope);});
 await measure('history-close',async()=>{await openHistory();await overlay().locator('[data-close]').last().click();assert.equal(await p.locator('.shared-restore-overlay').count(),0);});
 await measure('nonempty-category-delete-blocked',async()=>{const before=JSON.stringify((await flow()).working);await click('[data-category-delete="GROUP-1"]');await p.waitForFunction(()=>!MasterDataWorkflow.shared.busy());assert.equal(JSON.stringify((await flow()).working),before);});
 }catch(e){report.samples.push({scope,run,operation:'scenario-continuation',status:'FAIL',error:e.stack});}
 finally{await context.close();await f.close();fs.writeFileSync('.sites-runtime/ab-c-complete-'+variant+'.json',JSON.stringify(report,null,2));}
 console.log(variant,scope,'round',run+1,'failures',report.samples.filter(s=>s.status==='FAIL').map(s=>s.operation).join(','));
}}finally{await browser.close();}
