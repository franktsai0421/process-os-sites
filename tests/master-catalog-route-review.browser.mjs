import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';

const cases = [];
function seed(values,load) {
  const users = JSON.parse(values.platformUsers);
  users.find(u=>u.id==='writer').lines=['A','B'];
  values.platformUsers=JSON.stringify(users);
  const root=JSON.parse(values.masterDataControl);
  const catalog={products:[],lines:[],categoryGroups:[]};
  for(const line of ['A','B']){
    const codes=['CUT','ASSEMBLY','CRIMP','PACK','FINAL'].map(s=>line+'-'+s);
    catalog.lines.push({code:line,name:'Synthetic '+line,stages:codes.map(code=>({code,name:code}))});
    for(const code of codes) root.active.PROCESS[code]=load('lib/master-stage-link.ts').stageDefaultTemplates(code);
    for(const [index,name] of ['Shared','Mixed','Fallback'].entries()){
      const fallback=index===2;
      const oldRoute=index===1?[codes[2],codes[0]]:[codes[0],codes[1]];
      const group={name,line,...(fallback?{}:{defaultStages:oldRoute})};
      catalog.categoryGroups.push(group);
      const next=fallback?[...oldRoute]:[...oldRoute,codes[4]];
      const count=line==='A'&&!index?36:4;
      for(let n=0;n<count;n++){
        const exception=index===1&&n<2||fallback&&n===0;
        const stages=exception&&n===0?[oldRoute[0]]:oldRoute;
        catalog.products.push({code:line+'-'+index+'-'+n,line,category:name,name:'Synthetic '+n,unit:'pcs',specification:'synthetic',stages:[...stages],...(exception?{routeMode:'exception'}:fallback?{}:{routeMode:'group'})});
      }
      cases.push({line,name,oldRoute,next,count});
    }
  }
  const authoring=JSON.parse(values.processAuthoringControl);
  const original=authoring.workflow.active.content.workspaces[0];
  const node=structuredClone(Object.values(original.stages)[0][0]);
  Object.assign(node,{id:'retained-stage-block',stageCode:'A-ASSEMBLY',productCodes:['A-0-0']});
  const content={workspaces:[{id:JSON.stringify(['Shared','A']),line:'A',category:'Shared',stages:{'A-ASSEMBLY':[node]}}]};
  authoring.versions[0].snapshot=content;
  authoring.workflow=load('lib/shared-draft.ts').createSharedDraft('process:platform',content,authoring.activeVersionId,'synthetic-authoring');
  values.processAuthoringControl=JSON.stringify(authoring);
  root.active.AB=catalog;
  root.versions.find(v=>v.scope==='AB').number=8;
  for(const version of root.versions)version.snapshot=root.active[version.scope];
  values.masterDataControl=JSON.stringify(root);
  values.processMasterData=JSON.stringify(root.active.PROCESS);
}
const f=await createABCFixture({products:4,withAuthoring:true,decorate:seed});
let browser,phase='launch';
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,ignoreDefaultArgs:['--disable-dev-shm-usage'],args:['--no-sandbox','--disable-gpu','--no-zygote','--single-process']});
  async function page(actor,width){
    const context=await browser.newContext({viewport:{width,height:844}});
    await context.addCookies([{name:'process_demo',value:f.cookie(actor),url:f.url.origin}]);
    await context.route('**/*',route=>new URL(route.request().url()).origin===f.url.origin?route.continue():route.abort());
    const p=await context.newPage();
    p.setDefaultTimeout(15000);p.on('dialog',d=>d.accept(d.type()==='prompt'?'Synthetic review':undefined));return p;
  }
  const writer=await page('writer',390),reviewer=writer,editor=writer;
  const as=async actor=>{await writer.setViewportSize({width:actor==='writer'?390:1280,height:844});await writer.context().addCookies([{name:'process_demo',value:f.cookie(actor),url:f.url.origin}]);};
  const master=f.url.origin+'/process/?system=quality&view=data&dataTab=AB';
  const reader=async()=>{
    const row=await f.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();
    return JSON.parse((await f.load('lib/process-state.ts').decodeValues(row.values)).masterDataControl);
  };
  const initial=await reader();
  const authoringRef=async()=>{
    const row=await f.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();
    return JSON.parse(row.values).__processRecords.values.processAuthoringControl;
  };
  const retained=await authoringRef();
  const expected=new Map(cases.map(c=>[c.line+':'+c.name,c.oldRoute]));
  const ready=p=>p.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready'&&window.MasterDataWorkflow&&!MasterDataWorkflow.shared.busy());
  const confirm=async p=>{
    const form=p.locator('.vd-confirm[open]');await form.locator('textarea').fill('Synthetic review');
    await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});
  };
  async function canvas(targets,existing=false){
    await as('frank');
    if(existing)await editor.locator('button.nav-item[data-view=editor]').click();
    else await editor.goto(f.url.origin+'/process/?system=process&view=editor');
    await editor.locator('#editor-line-select').waitFor();
    await editor.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready'&&!document.querySelector('#process-boot'));
    for(const c of targets){
      phase=phase.split(' checking ')[0]+' checking '+c.line+'/'+c.name;
      await editor.locator('#editor-line-select').selectOption(c.line);
      await editor.waitForFunction(line=>state.editorLine===line,c.line);
      await editor.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready');
      await editor.locator('#category-select').selectOption(c.name);
      await editor.waitForFunction(group=>state.category===group,c.name);
      await editor.locator('[data-pe-stage]').first().waitFor();
      const route=await editor.locator('[data-pe-stage]').evaluateAll(nodes=>nodes.map(n=>n.dataset.peStage));
      assert.deepEqual(route,expected.get(c.line+':'+c.name),phase+' '+c.line+'/'+c.name);
      if(c.line==='A'&&c.name==='Shared'&&route.includes('A-ASSEMBLY')){
        await editor.locator('[data-pe-stage="A-ASSEMBLY"]').click();
        await editor.locator('[data-node="retained-stage-block"]').waitFor();
      }
    }
  }
  console.log('Compiled Worker and browser ready');
  const feedback=process.argv.includes('--feedback');
  if(feedback){
    await as('writer');
    await writer.goto(master);await writer.locator('#master-new-draft').click();
    const product='A-0-0',editProduct=async name=>{
      await writer.locator('[data-product-edit="'+product+'"]').click();
      const dialog=writer.locator('#master-edit-dialog');
      await dialog.locator('[name=name]').fill(name);return dialog;
    };
    let saves=0,submits=0;
    writer.on('request',r=>{
      if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/master/workflow'&&r.postDataJSON()?.command?.action==='save')saves++;
    });
    phase='narrow cancel and departure';
    const cancelled=await editProduct('取消 Hủy');
    await cancelled.locator('[data-cancel]').first().click();
    const local=await editProduct('Synthetic unsaved change');
    await local.locator('[type=submit]').click();await local.waitFor({state:'detached'});
    await writer.evaluate(()=>ProcessDeliveryNavigation.navigate('data','C'));
    await writer.waitForFunction(()=>state.dataTab==='C'&&document.documentElement.dataset.processNavigationStatus==='ready');
    await writer.goto(master);await ready(writer);
    assert.equal(saves,0);
    assert.ok(!(await writer.locator('.master-table').innerText()).includes('Synthetic unsaved change'));
    const edited=await editProduct('Synthetic saved change');
    await edited.locator('[type=submit]').click();await edited.waitFor({state:'detached'});
    await writer.locator('#master-save-draft').click();
    await writer.waitForFunction(()=>!!MasterDataWorkflow.shared.flow('AB').saved&&!MasterDataWorkflow.shared.busy());
    const saved=(await reader()).workflowScopes.AB.saved.id;
    phase='missing receipt';
    await writer.route('**/api/master/workflow?**',async r=>{
      if(r.request().method()==='POST'&&r.request().postDataJSON()?.command?.action==='submit'){
        submits++;return r.fulfill({status:500,json:{error:'WORKFLOW_WRITE_FAILED'}});
      }
      return r.continue();
    });
    await writer.locator('#master-submit').click();await confirm(writer);
    await writer.waitForFunction(()=>MasterDataWorkflow.shared.client('AB').hasUnknown()&&!MasterDataWorkflow.shared.busy());
    for(const lang of ['zh','vi']){
      await writer.reload();await ready(writer);
      if((await writer.locator('html').getAttribute('lang')).startsWith('vi')!==(lang==='vi'))await writer.locator('.top-actions .language-switch').click();
      await writer.locator('#master-shared-recover').click();
      await writer.waitForFunction(lang=>document.querySelector('#toast')?.textContent.includes(lang==='vi'?'chưa tìm thấy biên nhận gốc':'查無原回條'),lang);
      assert.ok(await writer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert.ok(await writer.evaluate(()=>MasterDataWorkflow.shared.client('AB').hasUnknown()));
    }
    const flow=(await reader()).workflowScopes.AB;
    assert.equal(submits,1);assert.equal(saves,1);assert.equal(flow.saved.id,saved);assert.equal(flow.pendingId,null);
    console.log('PASS narrow cancel, unsaved departure, bilingual lookup, reload and zero duplicate submits');
  }
  if(!feedback){
    phase='initial canvas';await canvas(cases);console.log('Initial six groups verified');
    const focus=cases[0],edits=process.argv.includes('--stage-cycle')?[focus,
      {...focus,action:'remove',next:['A-CUT','A-FINAL']},
      {...focus,action:'order',next:['A-FINAL','A-CUT']},
      {...focus,action:'restore',next:['A-FINAL','A-CUT','A-ASSEMBLY']}
    ]:cases;
    for(const [index,c] of edits.entries()){
      phase=c.line+'/'+c.name+' begin';
      await as('writer');
      await writer.goto(master);await writer.locator('#master-new-draft').click();
      await writer.locator('#master-line-filter').selectOption(c.line);
      await writer.locator('#master-category-filter').selectOption(c.name);
      const edit=writer.locator('[data-group-route-edit]');
      if(c.name==='Fallback'){
        await writer.locator('[data-group-route-maximum]').click();
      }else{
        await edit.click();const dialog=writer.locator('#master-edit-dialog');
        if(index===0){await dialog.locator('[data-cancel]').first().click();await edit.click();}
        if(c.action==='order')await dialog.locator('[data-group-up="1"]').click();
        else if(c.action==='remove')await dialog.locator('[data-group-remove="1"]').click();
        else{
          await dialog.locator('[data-group-stage]').selectOption(c.next.at(-1));
          await dialog.locator('[data-group-add]').click();
        }
        await dialog.locator('[type=submit]').click();await dialog.waitFor({state:'detached'});
      }
      phase=c.line+'/'+c.name+' save';
      await writer.locator('#master-save-draft').click();
      await writer.waitForFunction(()=>!!MasterDataWorkflow.shared.flow('AB')?.saved&&!MasterDataWorkflow.shared.busy());
      const persisted=await reader(),saved=persisted.workflowScopes.AB.saved;assert.equal(saved.actor.id,'writer');
      if(index===0)assert.equal(persisted.versions.find(v=>v.scope==='AB'&&v.status==='draft').number,9);
      await writer.reload();await ready(writer);
      assert.equal(await writer.evaluate(()=>MasterDataWorkflow.shared.flow('AB').saved.id),saved.id);
      assert.deepEqual(saved.content.categoryGroups.find(g=>g.line===c.line&&g.name===c.name).defaultStages,c.next);
      await canvas([c]);
      phase=c.line+'/'+c.name+' submit';
      await as('writer');await writer.goto(master);await ready(writer);
      await writer.locator('#master-submit').click();await confirm(writer);await writer.locator('#master-view-review').waitFor();
      const pending=await reader(),flow=pending.workflowScopes.AB,review=flow.cases.find(r=>r.id===flow.pendingId);
      assert.equal(review.savedId,saved.id);assert.deepEqual(review.content,saved.content);assert.equal(review.actor.id,'writer');
      await canvas([c]);
      phase=c.line+'/'+c.name+' approve';
      await as('frank');
      await reviewer.goto(f.url.origin+'/process/?system=process&view=approval&approvalTab=master');
      await reviewer.locator('[data-master-review="AB:'+review.id+'"]').click();
      await reviewer.locator('[data-review-action=approve]').click();await confirm(reviewer);
      await reviewer.waitForFunction(()=>!MasterDataWorkflow.shared.flow('AB')?.pendingId&&!MasterDataWorkflow.shared.busy());
      const after=await reader(),approved=after.workflowScopes.AB.cases.find(r=>r.id===review.id);
      assert.equal(approved.status,'approved');assert.equal(approved.result.actor.id,'frank');
      assert.deepEqual(after.active.AB,saved.content);
      assert.deepEqual(after.active.C,initial.active.C);assert.deepEqual(after.active.PROCESS,initial.active.PROCESS);
      assert.equal(after.active.AB.products.filter(p=>p.line===c.line&&p.category===c.name).length,c.count);
      for(const p of after.active.AB.products.filter(p=>p.line===c.line&&p.category===c.name)){
        const old=initial.active.AB.products.find(o=>o.code===p.code);
        assert.deepEqual(p.stages,old.routeMode==='exception'?old.stages:c.next);
        assert.equal(p.routeMode,old.routeMode==='exception'?'exception':'group');
      }
      expected.set(c.line+':'+c.name,c.next);
      phase=c.line+'/'+c.name+' '+(c.action||'configure')+' approved canvas';await canvas([c],true);await canvas(cases);
      assert.deepEqual(await authoringRef(),retained,'master approval must preserve complete editor control and history');
      console.log('PASS',c.line,c.name,c.action||'configure','products',c.count,'all groups',cases.length);
    }
  }
} catch(error){console.error('Stage',phase);throw error;}
finally{await browser?.close();await f.close();}
