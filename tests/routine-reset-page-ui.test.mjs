import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';

for(const lang of ['zh','vi'])void test('whole-page FQC reset and guarded recovery in '+lang,async()=>{
  const {document}=canvasDOM();
  document.documentElement.lang=lang;
  const root=document.createElement('main');
  document.body.append(root);
  let uncertain=false,available=false,loseReply=true,reads=0,afterConfigure;
  const storage=new Map(),requests=[],commands=[];
  const snapshot={today:'2026-11-21',startDate:'2026-11-20',revision:10,canConfigureStartDate:false,
    permissions:{view:true,edit:true,create:true},jobs:[{id:'job-1',source:{name:'Synthetic'},period:'week'}],
    documents:[],cases:[],control:{workflow:{generation:'old',revision:5,working:{documents:[]}}}};
  const context={document,crypto,ProcessSync:{identity:{id:'frank',role:'admin'}},
    sessionStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    createSharedDraftClient:()=>({read:()=>{reads++;return structuredClone(snapshot);},command:(generation,action,command)=>{commands.push(command);snapshot.revision++;snapshot.control.workflow.revision++;
      if(command.input.action==='configure'){snapshot.startDate=command.input.startDate;afterConfigure?.();}
      else snapshot.jobs=[{id:'new-job',source:{name:'Synthetic eligible'},period:'month'}];},hasUnknown:()=>uncertain,hasSyncFailures:()=>false}),
    fetch:async(url,options)=>{
      requests.push([options.method||'GET',url]);
      if(url.endsWith('capability=1'))return Response.json({available,scope:'fqc',actorId:'frank',revision:10,pendingCount:1});
      if(options.method==='POST'){
        assert.equal(JSON.parse(options.body).pendingCount,1);
        snapshot.startDate=null;snapshot.jobs=[];snapshot.canConfigureStartDate=true;snapshot.control.workflow.generation='new';
        if(loseReply){loseReply=false;throw Error('SYNTHETIC_LOST_ACK');}
        assert.fail('duplicate reset');
      }
      const id=new URL(url,'https://synthetic.invalid').searchParams.get('operationId');
      assert.deepEqual([...storage.values()],[id]);
      return Response.json({id,scope:'fqc',revision:11});
    }};
  context.window=context;
  for(const name of ['routine-reset.js','routine-fqc-page.js'])runInNewContext(readFileSync('public/process/'+name,'utf8'),context);
  const page=context.RoutineFqcPage;
  const open=async()=>{const panel=root.querySelector('details');assert(panel);panel.open=true;panel.dispatchEvent({type:'toggle'});await new Promise(resolve=>setImmediate(resolve));return panel;};
  const resetButton=panel=>panel.querySelectorAll('button').find(b=>b.textContent.startsWith('RESET FQC'));
  await page.mount(root);assert.equal(resetButton(await open()).disabled,true);
  assert.equal(root.querySelector('details button').disabled,true);
  available=true;page.repaint();uncertain=true;assert.equal(resetButton(await open()).disabled,true);
  uncertain=false;const choice=root.querySelector('fieldset input');choice.checked=true;choice.onchange();
  assert.equal(resetButton(await open()).disabled,true);
  const cancelChoice=root.querySelector('fieldset input');cancelChoice.checked=false;cancelChoice.onchange();
  const panel=await open(),begin=resetButton(panel);assert.equal(begin.disabled,false);begin.click();
  const form=panel.querySelector('form'),[typed,ack]=form.querySelectorAll('input');
  assert.match(form.textContent,lang==='vi'?/lịch sử xét duyệt/:/例行送審歷史/);
  typed.value='RESET FQC';ack.checked=true;form.querySelector('textarea').value='Synthetic practice';form.oninput();
  await form.onsubmit({preventDefault(){}});
  assert.equal(storage.size,1);const oldReads=reads;uncertain=true;
  await panel.querySelectorAll('button').at(-1).click();assert.equal(reads,oldReads);assert.equal(storage.size,1);
  uncertain=false;await panel.querySelectorAll('button').at(-1).click();assert.equal(reads,oldReads+1);
  assert.equal(storage.size,0);assert.equal(page.inspect().generation,'new');
  assert.equal(root.querySelector('fieldset input'),null);
  const launch=()=>root.querySelector('details button').click();
  launch();let modal=root.querySelector('dialog');assert.equal(modal.querySelector('input').type,'date');
  const buttons=element=>element.querySelectorAll('button');
  assert.equal(buttons(modal).at(-1).disabled,true);buttons(modal)[0].click();assert.equal(root.querySelector('dialog'),null);assert.equal(commands.length,0);
  const prepareDate=()=>{launch();modal=root.querySelector('dialog');modal.querySelector('input').value='2026-12-01';modal.querySelector('textarea').value='Synthetic new period';modal.querySelectorAll('input')[1].checked=true;modal.oninput();};
  prepareDate();snapshot.revision=55;await buttons(modal).at(-1).click();assert.equal(commands.length,0);
  await page.mount(root);prepareDate();await buttons(modal).at(-1).click();
  assert.deepEqual(JSON.parse(JSON.stringify(commands[0].input)),{action:'configure',startDate:'2026-12-01',reason:'Synthetic new period'});
  assert.deepEqual(commands.map(c=>c.input.action),['configure','generate']);
  assert.equal(root.querySelector('fieldset input').type,'checkbox');
  assert.equal(requests.filter(([method])=>method==='POST').length,1);
  afterConfigure=()=>{snapshot.startDate='2026-12-02';};
  prepareDate();await buttons(modal).at(-1).click();
  assert.deepEqual(commands.map(c=>c.input.action),['configure','generate','configure']);
  afterConfigure=()=>{uncertain=true;throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');};
  prepareDate();await buttons(modal).at(-1).click();
  assert.deepEqual(commands.map(c=>c.input.action),['configure','generate','configure','configure']);
  await page.mount(root,{review:true});assert.equal(root.querySelector('details'),null);
});

for(const lang of ['zh','vi'])void test('whole-page FQC viewer sees disabled Admin controls in '+lang,async()=>{
 const {document}=canvasDOM();document.documentElement.lang=lang;const root=document.createElement('main');document.body.append(root);
 const snapshot={today:'2026-11-23',startDate:null,revision:0,canConfigureStartDate:false,permissions:{view:true,edit:false,create:false},jobs:[],documents:[],cases:[],control:{workflow:{generation:'synthetic',revision:0,working:{documents:[]}}}};
 const context={document,crypto,ProcessSync:{identity:{id:'staff',role:'staff'}},sessionStorage:{getItem:()=>null},createSharedDraftClient:()=>({read:()=>structuredClone(snapshot),hasUnknown:()=>false,hasSyncFailures:()=>false}),fetch:async()=>Response.json({available:false})};context.window=context;
 for(const name of ['routine-reset.js','routine-fqc-page.js'])runInNewContext(readFileSync('public/process/'+name,'utf8'),context);
 await context.RoutineFqcPage.mount(root);const panel=root.querySelector('details');panel.open=true;panel.dispatchEvent({type:'toggle'});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(panel.querySelector('button').disabled,true);assert.equal(panel.querySelectorAll('button').find(b=>b.textContent.startsWith('RESET FQC')).disabled,true);assert.match(panel.textContent,lang==='vi'?/Chỉ Admin được sử dụng/:/僅 Admin 可操作/);
});
