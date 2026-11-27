import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';

const defaultRoute = {A:['CUT','ASSY','CRIMP','PACK','FINAL'], B:['PACK','CUT','ASSY']};
const fallback = ['CUT','ASSY','FINAL'];
const codes = (line, route) => route.map(stage => line+'-'+stage);
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHi0AAAAASUVORK5CYII=','base64');
const photoId = createHash('sha256').update(pixel).digest('hex');
const expectedRoutes = line => ({SHARED:defaultRoute[line], LEGACY:fallback, FALLBACK:fallback, EMPTY:[], UNUSED:['CRIMP'], 'PRESET-ONLY':['CRIMP']});

async function seed(values,load,bucket) {
  const users=JSON.parse(values.platformUsers);
  const writer=users.find(user=>user.id==='writer');
  writer.lines=['A','B','C'];
  writer.accessOverrides['ipqc-ab.view']=true;
  values.platformUsers=JSON.stringify(users);
  const master=JSON.parse(values.masterDataControl);
  const catalog={name:'Synthetic AB', lines:[], categoryGroups:[], products:[]};
  const scopes={};
  await bucket.put('ipqc-ab/photos/'+photoId,pixel,{httpMetadata:{contentType:'image/png'}});
  for (const line of ['A','B']) {
    const stages=codes(line,[...defaultRoute.A,'NEW','OLD']).map(code=>({id:'stage-'+code,code,name:'Shared label'}));
    catalog.lines.push({id:'line-'+line,code:line,name:line,stages});
    for (const [name,route] of Object.entries(expectedRoutes(line))) {
      const group={line,name,id:line+name};
      if (name!=='LEGACY') group.defaultStages=name==='FALLBACK'?null:codes(line,route);
      catalog.categoryGroups.push(group);
    }
    const products=[['SHARED',['CUT','OLD']],['FALLBACK',['CUT','FINAL']],['FALLBACK',fallback],['LEGACY',['CUT','FINAL']],
      ['LEGACY',fallback],['EMPTY',['CUT','OLD']],['SHARED',defaultRoute[line]],['UNUSED',['CUT']]];
    for (const [index,[category,route]] of products.entries()) {
      const code=line+'P'+(index+1);
      catalog.products.push({id:'id-'+code,code,name:'Synthetic',line,category,routeMode:index===6?'group':'exception',
        stages:codes(line,route),unit:'pcs',specification:'synthetic'});
    }
    const error={id:'retained-'+line,code:line+'-SHARED-L1',line,group:'SHARED',stageCode:line+'-'+defaultRoute[line][2],
      name:'Historical standard',sourceRows:[],deleted:false};
    const item={id:'item-'+line,code:line+'-ROUND-S1',errorId:error.id,standard:'Synthetic standard',methodText:'Synthetic method',
      inspectionMode:'visual',equipmentId:'',equipmentSnapshot:null,isEnabled:true,rules:[],standardPhotos:[{id:photoId,name:'Synthetic pixel',note:'Round trip'}],
      methodPhotos:[],productCodes:[line+'P7'],sourceRows:[],sourceTool:'',sourceMethod:'',sourceFrequency:'',reason:'Synthetic',deleted:false};
    const id='quality-'+line;
    scopes[line+':SHARED']={line,group:'SHARED',activeVersionId:id,versions:[{id,number:1,status:'approved',creatorId:'writer',
      creatorName:'Synthetic',createdAt:'2026-01-01',history:[],snapshot:{errors:[error],items:[item]}}]};
  }
  master.active.AB=catalog;
  master.versions.find(version=>version.scope==='AB').snapshot=structuredClone(catalog);
  values.masterDataControl=JSON.stringify(master);
  values.ipqcABMasterControl=JSON.stringify({schemaVersion:1,scopes,source:null,reservedErrorCodes:[],reservedItemCodes:[]});
  const authoring=JSON.parse(values.processAuthoringControl);
  for (const content of [authoring.versions[0].snapshot,authoring.workflow.active.content,authoring.workflow.working]) {
    const original=content.workspaces.find(w=>w.line==='A'),node=original.stages['A-D'][0];
    for (const line of ['A','B']) {
      const w=line==='A'?original:structuredClone(original);
      Object.assign(w,{line,category:'SHARED',id:JSON.stringify(['SHARED',line])});
      const stageCode=line+'-'+defaultRoute[line][2];
      w.stages={[stageCode]:[{...node,id:line+'-retained',stageCode,productCodes:[line+'P7']}]};
      if (line==='B') content.workspaces.push(w);
    }
  }
  values.processAuthoringControl=JSON.stringify(authoring);
}

const stageValues = select => select.locator('option').evaluateAll(opts=>opts.map(o=>o.value).filter(Boolean));
for (const [language,width] of [['zh',1365],['zh',390],['vi',1365],['vi',390]]) test('public group route controls '+language+' '+width,async t=>{
  const f=await createABCFixture({decorate:seed,withAuthoring:true});
  t.after(()=>f.close());
  const b=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
  t.after(()=>b.close());
  const c=await b.newContext({viewport:{width,height:844}});
  await c.addInitScript(lang=>localStorage.setItem('processUILanguage',lang),language);
  const actor=async id=>{await c.clearCookies();await c.addCookies([{name:'process_demo',value:f.cookie(id),url:f.url.origin}]);};
  await actor('writer');
  await c.route('**/*',r=>new URL(r.request().url()).origin===f.url.origin?r.continue():r.abort());
  const p=await c.newPage();p.setDefaultTimeout(15000);p.on('dialog',d=>d.accept());
  const entry=dest=>f.url.origin+'/process/?'+dest;
  const quality=entry('system=quality&view=data&dataTab=quality-ipqc-ab'), editor=entry('system=process&view=editor'), master=entry('system=process&view=data&dataTab=AB');
  const line=width===390?'B':'A', other=line==='A'?'B':'A';
  const before=codes(line,defaultRoute[line]),stage=before[2];
  const removed=[before[1],before[0],...before.slice(3),line+'-NEW'], restored=[...removed,stage];

  async function qualityGroup(selectedLine,name) {
    await p.locator('#ipqcab-line').selectOption(selectedLine);
    await p.locator('#ipqcab-group').selectOption(name);
    return p.locator('#ipqcab-stage');
  }
  async function qualityCheck(route,reload=false) {
    if (reload) await p.reload(); else await p.goto(quality);
    const menu=await qualityGroup(line,'SHARED');
    assert.deepEqual(await stageValues(menu),route);
    if (!route.includes(stage)) {
      await p.locator('#ipqcab-route-extras').click();
      assert.deepEqual(await stageValues(menu),[...route,stage]);
    }
    await menu.selectOption(stage);
    await p.locator('[data-ab-error="retained-'+line+'"]').click();
    await p.locator('[data-ab-view-item="item-'+line+'"]').waitFor();
    const image=p.locator('[data-ab-photo-item="item-'+line+'"] img');
    assert.equal(new URL(await image.getAttribute('src'),f.url).searchParams.get('id'),photoId);
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(async img=>{await img.decode();if(img.naturalWidth!==1)throw Error('Unexpected synthetic photo');});
  }
  async function canvasGroup(selectedLine,name) {
    await p.waitForFunction(()=>typeof state!=='undefined'&&state.view==='editor'&&document.documentElement.dataset.processNavigationStatus==='ready');
    await p.locator('#editor-line-select').selectOption(selectedLine);
    await p.locator('#category-select').selectOption(name);
    await p.waitForFunction(([l,n])=>state.editorLine===l&&state.category===n,[selectedLine,name]);
    const tabs=p.locator('[data-pe-stage]');
    if (name!=='EMPTY') await tabs.first().waitFor();
    return tabs.evaluateAll(nodes=>nodes.map(n=>n.dataset.peStage));
  }
  async function canvas(route) {
    await p.goto(editor);
    assert.deepEqual(await canvasGroup(line,'SHARED'),route);
    if (route.includes(stage)) {
      await p.locator('[data-pe-stage="'+stage+'"]').click();
      await p.locator('[data-node="'+line+'-retained"]').waitFor();
    }
  }
  await p.goto(quality);
  for (const l of ['A','B']) {
    await p.locator('#ipqcab-line').selectOption(l);
    const rows=expectedRoutes(l);
    assert.deepEqual((await stageValues(p.locator('#ipqcab-group'))).sort(),Object.keys(rows).sort());
    for (const [name,route] of Object.entries(rows)) assert.deepEqual(await stageValues(await qualityGroup(l,name)),codes(l,route));
  }
  await p.goto(editor);
  for (const l of ['A','B']) {
    for (const [name,route] of Object.entries(expectedRoutes(l))) {
      // The canvas lists categories that have products.
      if (name!=='PRESET-ONLY') assert.deepEqual(await canvasGroup(l,name),codes(l,route));
    }
  }

  async function approveChange(restore) {
    await p.goto(master);await p.locator('#master-new-draft').click();
    await p.locator('#master-category-filter').selectOption('SHARED');
    await p.locator('[data-route-line="'+line+'"][data-group-route-edit]').click();
    if (!restore) {
      await p.locator('[data-group-remove="2"]').click();
      await p.locator('[data-group-up="1"]').click();
    }
    await p.locator('[data-group-stage]').selectOption(restore?stage:line+'-NEW');
    await p.locator('[data-group-add]').click();
    await p.locator('#master-edit-dialog [type=submit]').click();
    await p.locator('#master-edit-dialog').waitFor({state:'detached'});
    await p.locator('#master-save-draft').click();
    await p.waitForFunction(([l,s,w])=>MasterDataWorkflow.shared.flow('AB')?.saved?.content.categoryGroups.find(g=>g.line===l&&g.name==='SHARED')?.defaultStages.includes(s)===w,[line,stage,restore]);
    const previous=restore?removed:before;
    await qualityCheck(previous);await canvas(previous);
    await p.goto(master);await p.locator('#master-submit').click();
    await p.locator('.vd-confirm textarea').fill('Synthetic round trip');await p.locator('.vd-confirm [type=submit]').click();
    await p.waitForFunction(()=>!!MasterDataWorkflow.shared.flow('AB')?.pendingId);
    const caseId=await p.evaluate(()=>MasterDataWorkflow.shared.flow('AB').pendingId);
    await qualityCheck(previous);await canvas(previous);
    await actor('frank');await p.goto(master);await p.locator('#master-view-review').click();
    await p.locator('[data-master-review="AB:'+caseId+'"]').click();
    await p.locator('[data-review-action="approve"]').click();
    await p.locator('.vd-confirm textarea').fill('Independent synthetic approval');await p.locator('.vd-confirm [type=submit]').click();
    await p.waitForFunction(([l,s,w])=>!MasterDataWorkflow.shared.flow('AB')?.pendingId&&MasterDataWorkflow.shared.flow('AB')?.active.content.categoryGroups.find(g=>g.line===l&&g.name==='SHARED')?.defaultStages.includes(s)===w,[line,stage,restore]);
    await actor('writer');
  }
  await qualityCheck(before);await canvas(before);
  await approveChange(false);await qualityCheck(removed);await qualityCheck(removed,true);await canvas(removed);
  await approveChange(true);await qualityCheck(restored);await qualityCheck(restored,true);await canvas(restored);
  assert.deepEqual(await canvasGroup(other,'SHARED'),codes(other,defaultRoute[other]));
  await p.goto(quality);assert.deepEqual(await stageValues(await qualityGroup(other,'SHARED')),codes(other,defaultRoute[other]));
  const row=await f.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();
  const bucket=await f.mf.getR2Bucket('STATE_ARCHIVE');
  const {values}=await f.load('lib/state-records.ts').decodeRecordValues(bucket,JSON.parse(row.values),{keys:['ipqcABMasterControl','processAuthoringControl','masterDataControl']});
  for (const key of ['ipqcABMasterControl','processAuthoringControl']) assert.deepEqual(JSON.parse(values[key]),JSON.parse(f.values[key]));
  assert.deepEqual(Buffer.from(await (await bucket.get('ipqc-ab/photos/'+photoId)).arrayBuffer()),pixel);
  const active=JSON.parse(values.masterDataControl).active, initial=JSON.parse(f.values.masterDataControl).active;
  assert.deepEqual(active.C,initial.C);
  const expected=structuredClone(initial.AB);
  expected.products.find(product=>product.id==='id-'+line+'P7').stages=restored;
  expected.categoryGroups.find(g=>g.id===line+'SHARED').defaultStages=restored;
  // The master editor sorts the category list on apply. Match groups by stable ID
  // while comparing every stored field, including the exact order of each route.
  const byId=(a,b)=>a.id.localeCompare(b.id);
  assert.deepEqual({...active.AB,categoryGroups:[...active.AB.categoryGroups].sort(byId)},
    {...expected,categoryGroups:[...expected.categoryGroups].sort(byId)});
});
