/* oxlint-disable typescript/no-require-imports -- This isolated VM fixture uses the repository's CommonJS test harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
process.chdir(require('node:path').resolve(__dirname,'..'));

const workflow = fs.readFileSync('public/process/version-workflow.js', 'utf8');
const guard = fs.readFileSync('public/process/editor-version-guard.js', 'utf8');
const stored = new Map(), messages = [], versions = [];
const state = {category:'DTLN',editorLine:'A',editorVersionId:null,editorByCategory:{}};
let release, success = true, calls = 0;
const button = {disabled:false};
const context = vm.createContext({
  changingVersion:false,
  state, approvalVersions:versions, crypto:{randomUUID}, currentUser:{id:'fixture',name:'Fixture'},
  document:{querySelector:()=>button}, console,
  deepCopy:value=>JSON.parse(JSON.stringify(value)),
  editorKey:()=>`${state.category}:${state.editorLine}`,
  group:()=>versions.filter(v=>v.category===state.category&&v.line===state.editorLine).sort((a,b)=>b.number-a.number),
  ensureCategoryEditor:()=>state.editorByCategory[`${state.category}:${state.editorLine}`],
  history:(v,action)=>{(v.history||=[]).push({action});},
  localStorage:{setItem:(k,v)=>stored.set(k,v)},
  persistPlatform:()=>stored.set('approvalVersions',JSON.stringify(versions)),
  toast:text=>messages.push(text), render(){},
  window:{ProcessSync:{flush:async()=>{calls++;if(release)await release.promise;return success;}}},
});
vm.runInContext(workflow.slice(workflow.indexOf('  let savingEditorVersion='),workflow.indexOf('  function submitEditorVersion()')),context);
const stages = line => Object.fromEntries(['CUT','ASSY','PACKING','FINAL'].map((code,i)=>[`${line}-${code}`,[{
  id:randomUUID(),stageCode:`${line}-${code}`,number:`${line}-${code}-01`,
  nextIds:[],productCodes:[],mediaItems:[{src:'data:image/webp;base64,'+'A'.repeat(1024),type:'image/webp'}],
  instructions:`fixture ${i}`,
}]]));

(async()=>{
  for(const line of ['A','B','C']){
    state.editorLine=line;state.editorVersionId=null;
    const key=`DTLN:${line}`, snapshot=stages(line);state.editorByCategory[key]=snapshot;
    release={};release.promise=new Promise(resolve=>{release.resolve=resolve;});
    const saving=context.saveEditorVersion();
    assert.equal(button.disabled,true);
    const before=messages.length;
    await context.saveEditorVersion();
    assert.equal(messages.length,before,'no premature success or duplicate Save');
    release.resolve();await saving;release=null;
    const saved=JSON.parse(stored.get(`processEditor:${key}`));
    assert.deepEqual(saved.stages,snapshot,'all stages, graph relations and media are saved');
    const version=versions.find(v=>v.id===state.editorVersionId);
    assert.equal(version.number,1);assert.deepEqual(version.stages,snapshot);
    await context.saveEditorVersion();
    assert.equal(versions.filter(v=>v.line===line).length,1,'repeated Save updates the same draft');
  }
  state.category='OTHER';state.editorVersionId=null;state.editorByCategory['OTHER:C']=stages('C');
  await context.saveEditorVersion();assert.equal(versions.length,4,'category and line do not overwrite each other');
  success=false;await context.saveEditorVersion();
  assert.match(messages.at(-1),/尚未完成伺服器儲存/);assert.equal(button.disabled,false);
  assert.equal(versions.length,4,'failed Save remains retryable without duplicate versions');

  const latest={id:'draft',status:'draft',createdAt:'2026-01-01',updatedAt:'2026-01-01',stages:{'A-CUT':[]}};
  const newer={category:'DTLN',line:'A',savedAt:'2026-01-02',stages:stages('A')};
  let loaded=0;
  const reopen=vm.createContext({state:{view:'editor',category:'DTLN',editorLine:'A',editorVersionId:null},
    versionsForRoute:()=>[latest],readStore:()=>newer,editorKey:()=> 'DTLN:A',render(){},loadVersion:()=>{loaded++;}});
  vm.runInContext(guard.slice(guard.indexOf('  function autoOpenCurrentVersion()'),guard.indexOf('  function lockEditor(')),reopen);
  assert.equal(reopen.autoOpenCurrentVersion(),true);assert.equal(loaded,0,'newer workspace is not replaced by older draft and controls are rerendered');
  assert.equal(reopen.state.editorVersionId,'draft');
  for(const status of ['approved','pending']){
    latest.status=status;reopen.state.editorVersionId=null;
    assert.equal(reopen.autoOpenCurrentVersion(),true,'approved/pending version remains authoritative');
  }
  latest.status='draft';newer.savedAt='2025-01-01';reopen.state.editorVersionId=null;
  assert.equal(reopen.autoOpenCurrentVersion(),true,'older workspace cannot replace a newer version');
  const app=fs.readFileSync('public/process/app.js','utf8');
  const image='https://fixture.invalid/reviewed.webp',draftImage='https://fixture.invalid/unapproved.webp';
  const media=vm.createContext({state:{category:'BORUAXE1021',editorLine:'A'},
    demoMediaByStage:{'A-CUT':{index:0,name:'hose-cutting.png',src:'assets/demo-process/hose-cutting.png'}},
    operationMediaItems:operation=>operation.mediaItems||[],
    approvalVersions:[{category:'BORUAXE1021',line:'A',number:2,status:'approved',stages:{'A-CUT':[{mediaItems:[{name:'hose-cutting.png',src:image,type:'image/webp'}]}]}},
      {category:'BORUAXE1021',line:'A',number:3,status:'draft',stages:{'A-CUT':[{mediaItems:[{name:'hose-cutting.png',src:draftImage,type:'image/webp'}]}]}},
      {category:'BORUAXE1021',line:'B',number:4,status:'approved',stages:{'A-CUT':[{mediaItems:[{name:'hose-cutting.png',src:draftImage,type:'image/webp'}]}]}},
      {category:'BORUAXE1021',line:'A',number:5,status:'superseded',stages:{'A-CUT':[{mediaItems:[{name:'hose-cutting.png',src:draftImage,type:'image/webp'}]}]}}]});
  vm.runInContext(app.slice(app.indexOf('function applyDemoMedia('),app.indexOf('function ensureCategoryEditor(')),media);
  const empty={'A-CUT':[{mediaItems:[]}]};media.applyDemoMedia(empty);
  assert.equal(empty['A-CUT'][0].media,image,'use already resolved approved media rather than missing legacy demo files');
  assert.equal(empty['A-CUT'][0].mediaType,'image/webp');
  const custom={'A-CUT':[{mediaItems:[{src:'fixture-custom'}]}]};media.applyDemoMedia(custom);
  assert.equal(custom['A-CUT'][0].mediaItems[0].src,'fixture-custom','existing private/custom photos are preserved');
  console.log(`PASS: complete A/B/C stage snapshots, media, category/version isolation, awaited Save, no duplicate versions, failure feedback and newer draft reopening (${calls} writes)`);
})().catch(error=>{console.error(error);process.exitCode=1;});
