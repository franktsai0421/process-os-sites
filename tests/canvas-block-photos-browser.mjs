// Exercise the compiled editor and Worker against disposable D1/R2 and generated pixels.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {deflateSync} from 'node:zlib';
import {chromium} from 'playwright';
import {createProcessPlatformRound5Fixture} from './process-platform-round5-fixture.mjs';
import {chunk,pngFixture} from './photo-fixtures.mjs';

function noisePNG(){
 const width=1000,height=700,stride=1+3*width,raw=Buffer.alloc(height*stride);
 let seed=1234567;
 for(let y=0;y<height;y++)for(let i=1;i<stride;i++){
  seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;raw[y*stride+i]=seed&255;
 }
 return Buffer.concat([pngFixture({width,height}).subarray(0,33),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const files={'common.png':noisePNG(),'product.png':pngFixture({width:75,height:41}),'replacement.png':pngFixture({width:90,height:60})};
const baseline=process.argv.includes('--baseline'),inline=process.argv.includes('--inline');
const f=await createProcessPlatformRound5Fixture({canvasNodes:2});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const origin=f.url.origin,bucket=await f.mf.getR2Bucket('STATE_ARCHIVE');
const load=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE:bucket});
const records=load('lib/state-records.ts');
const first=c=>c.workspaces[0].stages['A-CUT'][0];
async function values(){
 const row=await f.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first(),raw=JSON.parse(row.values);
 return raw.__processRecords?(await records.decodeRecordValues(bucket,raw)).values:await load('lib/process-state.ts').decodeValues(row.values);
}
const control=async()=>JSON.parse((await values()).processAuthoringControl);
async function login(id,view='editor'){
 const ctx=await browser.newContext({serviceWorkers:'block'});
 await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const p=await ctx.newPage();p.setDefaultTimeout(15000);p.on('dialog',d=>d.accept());
 await p.goto(origin+'/login?view='+view);await p.locator('#id').fill(id);await p.locator('#password').fill(f.password);
 const signed=p.waitForResponse(r=>r.url().endsWith('/api/platform-login')&&r.request().method()==='POST');
 await p.locator('.site-entry-submit').click();assert.equal((await signed).status(),200);
 if(view==='editor')await p.locator('.pe-card[data-node=photo-operation]').waitFor();
 return p;
}
async function logout(p){
 await p.locator('#account-button').click();
 const signed=p.waitForResponse(r=>r.url().endsWith('/api/platform-login')&&r.request().postData()?.includes('logout'));
 await p.locator('#logout-button').click();assert.equal((await signed).status(),200);await p.context().close();
}
const edit=(p,id='photo-operation')=>p.locator('.pe-card[data-node="'+id+'"] [data-pe=edit]').click();
const tab=(p,key)=>p.locator('#process-operation-dialog [data-tab="'+key+'"]').click();
async function upload(p,name){
 await p.locator('[data-upload]').setInputFiles({name,mimeType:'image/png',buffer:files[name]});
 await p.locator('img[alt="'+name+'"]').first().evaluate(el=>el.decode());
}
async function apply(p){await p.locator('#apply-operation').click();await p.locator('#process-operation-dialog').waitFor({state:'detached'});}
async function save(p,id){await p.locator('[data-av3=save]').click();await p.waitForFunction(old=>ProcessAuthoringV3.flow().saved?.id&&ProcessAuthoringV3.flow().saved.id!==old,id||'');}
async function verify(p,name,src){
 const img=p.locator('img[alt="'+name+'"]').first();assert.equal(await img.getAttribute('src'),src);await img.evaluate(el=>el.decode());
 const r=await p.request.get(origin+src);assert.equal(r.status(),200);assert.deepEqual(await r.body(),files[name]);
}
try{
 const initialValues=await f.readValues(),users=JSON.parse(initialValues.platformUsers),staff={...users[1],role:'staff'};
 initialValues.platformUsers=JSON.stringify([users[0],{...staff,id:'writer'},{...staff,id:'viewer',accessOverrides:{'editor.edit':false,'editor.save':false}},{...staff,id:'player',accessOverrides:{'editor.view':false,'player.view':true}}]);
 const seed=inline?JSON.stringify(initialValues):await records.encodeRecordValues(bucket,initialValues);
 await f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').bind(seed).run();
 const original=await control(),initial=original.workflow.working;
 let p=await login('writer');await p.locator('[data-av3=begin]').click();await p.waitForFunction(()=>ProcessAuthoringV3.canMutate());
 const writes=[];p.on('request',r=>{if(r.url().includes('/api/process-authoring/')&&['POST','PUT'].includes(r.method()))writes.push(r.method());});
 await edit(p);await tab(p,'common');await upload(p,'common.png');await tab(p,'product-work');await upload(p,'product.png');await apply(p);
 assert.deepEqual(writes,[]);assert.deepEqual((await control()).workflow.working,initial);
 assert.equal((await bucket.list({prefix:'process-authoring/photos/'})).objects.length,0);
 if(baseline){
  await p.locator('[data-av3=save]').click();
  await p.waitForFunction(()=>/STORAGE_WRITE_FAILED|RECOVERY_STORAGE_UNAVAILABLE/.test(document.body.innerText));
  assert.deepEqual(writes,[]);assert.equal((await control()).workflow.saved,null);
  console.log('Reproduced on base: preview/application succeeded, storage quota prevented workflow POST',files['common.png'].length);
 }else{
  await save(p);const saved=(await control()).workflow.saved,op=first(saved.content),common=op.mediaItems.at(-1).src,product=op.productMediaItems.P1[0].src;
  for(const url of [common,product])assert.match(url,/^\/api\/process-authoring\/photo\?line=A&id=[a-f0-9]{64}$/);
  assert.deepEqual(op.mediaItems[0],first(initial).mediaItems[0]);assert.deepEqual(saved.content.workspaces[1],initial.workspaces[1]);
  assert.deepEqual(saved.content.workspaces[0].stages['A-CUT'][1],initial.workspaces[0].stages['A-CUT'][1]);
  await logout(p);p=await login('writer');await edit(p);await tab(p,'common');await verify(p,'common.png',common);
  await tab(p,'product-work');await verify(p,'product.png',product);
  const endpoint=origin+'/api/process-authoring/photo?line=A',headers={origin,'Content-Type':'image/png','X-Process-Expected-Actor':'writer'};
  const other=files['replacement.png'];assert.equal((await p.request.put(endpoint,{headers,data:other})).status(),200);
  const unlinked=endpoint+'&id='+createHash('sha256').update(other).digest('hex');assert.equal((await p.request.get(unlinked)).status(),403);
  assert.equal((await p.request.get(origin+common.replace('line=A','line=C'))).status(),403);
  assert.equal((await p.request.put(endpoint,{headers,data:Buffer.from('synthetic invalid PNG')})).status(),415);
  const viewer=await login('viewer');await edit(viewer);await tab(viewer,'product-work');await verify(viewer,'product.png',product);
  assert.equal((await viewer.request.put(endpoint,{headers:{...headers,'X-Process-Expected-Actor':'viewer'},data:other})).status(),403);await viewer.context().close();
  const player=await login('player','player');assert.equal((await player.request.get(origin+common)).status(),403);await player.context().close();
  const anon=await browser.newContext();assert.equal((await anon.request.get(origin+common)).status(),401);await anon.close();
  await p.locator('[data-media-remove="0"]').click();await tab(p,'common');await p.locator('[data-media-remove="1"]').click();await upload(p,'replacement.png');
  await apply(p);await save(p,saved.id);await logout(p);p=await login('writer');await edit(p);await tab(p,'common');
  const final=await control(),updated=first(final.workflow.saved.content);
  await verify(p,'replacement.png',updated.mediaItems.at(-1).src);assert.equal(await p.locator('img[alt="common.png"]').count(),0);
  await tab(p,'product-work');assert.equal(await p.locator('img[alt="product.png"]').count(),0);
  assert.deepEqual(updated.productMediaItems.P1,[]);
  await p.locator('#process-operation-dialog [data-pe=cancel]').click();await edit(p,'round5-a-operation-2');await tab(p,'common');await upload(p,'product.png');await apply(p);await save(p,final.workflow.saved.id);
  const end=await control();assert.deepEqual(first(end.workflow.saved.content),updated);
  assert.deepEqual(end.workflow.saved.content.workspaces[1],initial.workspaces[1]);
  assert.deepEqual(end.versions.find(v=>v.id===end.activeVersionId),original.versions.find(v=>v.id===original.activeVersionId));
  const endValues=await values();for(const k of ['masterDataControl','routineEquipmentControl'])assert.equal(endValues[k],initialValues[k]);
  console.log('PASS edited and reopened canvas photos',inline?'inline':'records');
 }
}finally{await browser.close();await f.close();}
