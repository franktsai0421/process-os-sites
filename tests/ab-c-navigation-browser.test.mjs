import assert from 'node:assert/strict';import {chromium} from 'playwright';import {createABCFixture} from './ab-c-native-fixture.mjs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}),f=await createABCFixture();const checks=[];
try{
 const c=await browser.newContext();await c.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);const p=await c.newPage();p.on('dialog',d=>d.accept());
 await p.goto(f.url.origin+'/process/?system=process&view=data&dataTab=AB');await p.waitForSelector('#master-new-draft');await p.locator('#master-new-draft').click();await p.waitForSelector('[data-product-edit]');
 const edit=async name=>{await p.locator('[data-product-edit="A001"]').click();await p.locator('#master-edit-dialog [name=name]').fill(name);await p.locator('#master-edit-dialog [type=submit]').click();await p.waitForSelector('#master-edit-dialog',{state:'detached'});};
 await edit('Before rejected Save');
 let deny=true,saves=0;
 const denied=async route=>{const r=route.request(),body=r.method()==='POST'?r.postDataJSON():null;if(deny&&body?.command?.action==='save'){saves++;return route.fulfill({status:403,json:{error:'FORBIDDEN'}});}return route.continue();};
 await p.route('**/api/master/workflow?*',denied);await p.evaluate(()=>ProcessDeliveryNavigation.navigate('data','C'));
 await p.waitForFunction(()=>!MasterDataWorkflow.shared.busy());assert.equal(await p.evaluate(()=>state.dataTab),'AB');assert.equal(saves,1);assert.equal(await p.evaluate(()=>MasterDataWorkflow.shared.flow('AB').working.products[0].name),'Before rejected Save');checks.push('Save 403 retains source and content');
 deny=false;await p.unroute('**/api/master/workflow?*',denied);await p.evaluate(()=>ProcessDeliveryNavigation.navigate('data','C'));await p.waitForFunction(()=>state.dataTab==='C'&&document.documentElement.dataset.processNavigationStatus==='ready');await p.evaluate(()=>ProcessDeliveryNavigation.navigate('data','AB'));await p.waitForSelector('[data-product-edit="A001"]');
 await edit('Persisted with lost ACK');let lose=true,receiptUnavailable=true,savePosts=0;
 const lost=async route=>{const r=route.request(),u=new URL(r.url()),body=r.method()==='POST'?r.postDataJSON():null;if(body?.command?.action==='save'){savePosts++;if(lose){lose=false;const response=await route.fetch();assert.equal(response.status(),200);return route.abort('failed');}}if(receiptUnavailable&&u.searchParams.has('operationId'))return route.fulfill({status:503,json:{error:'ISOLATED_RECEIPT_UNAVAILABLE'}});return route.continue();};
 await p.route('**/api/master/workflow?*',lost);await p.evaluate(()=>ProcessDeliveryNavigation.navigate('data','C'));
 await p.waitForFunction(()=>!MasterDataWorkflow.shared.busy());assert.equal(await p.evaluate(()=>state.dataTab),'AB');assert.equal(await p.evaluate(()=>sharedDraftAccountState().unknown),true);assert.equal(savePosts,1);
 await p.evaluate(()=>ProcessDeliveryNavigation.navigate('data','C'));assert.equal(savePosts,1);assert.equal(await p.evaluate(()=>state.dataTab),'AB');checks.push('lost Save ACK keeps UNKNOWN and blocks departure without duplicate POST');
 receiptUnavailable=false;await p.locator('#master-shared-recover').click();await p.waitForFunction(()=>!sharedDraftAccountState().unknown&&!MasterDataWorkflow.shared.busy());await p.evaluate(()=>ProcessDeliveryNavigation.navigate('data','C'));await p.waitForFunction(()=>state.dataTab==='C'&&document.documentElement.dataset.processNavigationStatus==='ready');assert.equal(savePosts,1);checks.push('explicit receipt recovery releases departure without resubmission');
 console.log(JSON.stringify({status:'PASS_AB_C_NAVIGATION_BROWSER',checks,programCommit:f.programCommit,buildEntrySha256:f.buildEntrySha256}));await c.close();
}finally{await browser.close();await f.close();}
