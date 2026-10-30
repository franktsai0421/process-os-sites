import assert from 'node:assert/strict';import fs from 'node:fs';import {chromium} from 'playwright';import {createABCFixture} from './ab-c-native-fixture.mjs';
const f=await createABCFixture(),b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}),checks=[];fs.mkdirSync('.sites-runtime/ab-c-evidence',{recursive:true});
try{const c=await b.newContext({viewport:{width:390,height:844}});await c.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);const p=await c.newPage();p.on('dialog',d=>d.accept());
 for(const scope of ['AB','C']){await p.goto(f.url.origin+'/process/?system=process&view=data&dataTab='+scope);await p.waitForSelector('#master-new-draft');await p.locator('#master-new-draft').click();await p.waitForSelector('[data-product-edit]');
  for(const language of ['zh-Hant','vi']){
   if(await p.locator('html').getAttribute('lang')!==language){await p.locator('.top-language-switch').click();await p.waitForFunction(lang=>document.documentElement.lang===lang,language);}
   await p.locator('#master-category-filter').selectOption('GROUP-1');await p.locator('.master-category-box').scrollIntoViewIfNeeded();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await p.screenshot({path:'.sites-runtime/ab-c-evidence/'+scope+'-390-'+language+'.png'});
   await p.locator('[data-product-edit]').first().click();await p.locator('#master-edit-dialog [name=name]').fill('長名稱 kiểm tra dấu tiếng Việt '+scope.repeat(20));
   await p.locator('#master-edit-dialog footer [data-cancel]').scrollIntoViewIfNeeded();assert(await p.locator('#master-edit-dialog footer [data-cancel]').isVisible());await p.screenshot({path:'.sites-runtime/ab-c-evidence/'+scope+'-390-'+language+'-footer.png'});await p.keyboard.press('Escape');assert.equal(await p.locator('#master-edit-dialog').count(),0);checks.push(scope+' '+language+' 390x844 scrollable form, footer, long input, Escape');
  }
 }console.log(JSON.stringify({status:'PASS_AB_C_RESPONSIVE_BROWSER',checks,programCommit:f.programCommit,buildEntrySha256:f.buildEntrySha256}));await c.close();
}finally{await b.close();await f.close();}
