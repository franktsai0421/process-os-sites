// One-off, explicit import of the user-supplied workbook into a PROCESS draft.
// No process approval, workspace edits, route edits, or deployment are performed.
const fs=require('node:fs');
const vm=require('node:vm');
(async()=>{
 const endpoint='http://localhost:3000/api/shared-state?manage=1';
 const response=await fetch(endpoint);if(!response.ok)throw Error('Cannot read shared state');
 const state=await response.json();if(state.identity?.role!=='admin')throw Error('Expected existing local admin authority');
 const control=JSON.parse(state.values.masterDataControl),source=JSON.parse(fs.readFileSync('public/process/data/process-equipment-source.json','utf8'));
 if(control.versions.some(v=>v.scope==='PROCESS'&&v.status==='pending'))throw Error('A PROCESS review is pending; no data changed');
 const now=new Date().toISOString(),_versions=control.versions.filter(v=>v.scope==='PROCESS');
 const clone=v=>JSON.parse(JSON.stringify(v));
 let catalog=control.active.PROCESS,initialized=false;
 if(!catalog){
  catalog=JSON.parse(state.values.processMasterData);
  const app=fs.readFileSync('public/process/app.js','utf8');
  const start=app.indexOf('const PROCESS_TEMPLATE_PRESET_VERSION');
  const helpers=app.slice(start,app.indexOf('\nrouting.lines',start));
  const stages=['AB','C'].flatMap(scope=>control.active[scope].lines.flatMap(line=>line.stages));
  for(const stage of stages)if(!catalog[stage.code])catalog[stage.code]=vm.runInNewContext(helpers+';defaultTemplatesForStage('+JSON.stringify(stage)+')');
  if(Object.keys(catalog).some(code=>!stages.some(stage=>stage.code===code)))throw Error('Unexpected obsolete stages; no data changed');
  control.active.PROCESS=clone(catalog);initialized=true;
  control.versions.push({id:'MD-PROCESS-BASE-'+Date.now(),scope:'PROCESS',number:1,status:'approved',snapshot:clone(catalog),creatorId:state.identity.id,creatorName:state.identity.name,createdAt:now,updatedAt:now,history:[{label:'建立流程資料版本基準',at:now,actor:state.identity.name}],warnings:[]});
 }
 let draft=control.versions.find(v=>v.scope==='PROCESS'&&v.status==='draft');
 if(!draft){const prior=control.versions.filter(v=>v.scope==='PROCESS').sort((a,b)=>b.number-a.number)[0];draft={id:'MD-PROCESS-EQUIPMENT-'+Date.now(),scope:'PROCESS',number:(prior?.number||0)+1,status:'draft',snapshot:clone(catalog),creatorId:state.identity.id,creatorName:state.identity.name,createdAt:now,updatedAt:now,parentVersionId:prior?.id,history:[],warnings:[]};control.versions.push(draft);}
 let removed=0,movedManual=0;
 for(const [stageCode,templates] of Object.entries(draft.snapshot)){
  const unified=templates.find(t=>t.presetKey==='machine-assembly'),legacy=templates.find(t=>t.presetKey==='machine-setting');
  if(!unified)throw Error('Missing unified machine template: '+stageCode);
  const existingEquipment=[...(unified.equipment||[]),...(legacy?.equipment||[])];
  const manual=existingEquipment.filter(e=>!e.source?.sheet).map(e=>({...e,kind:'machine-assembly',stageCode,line:stageCode.split('-')[0]}));
  removed+=existingEquipment.length-manual.length;movedManual+=manual.length;
  unified.name='機器設定';unified.presetVersion='20260911-5900';unified.equipment=manual;
  draft.snapshot[stageCode]=templates.filter(t=>t.presetKey!=='machine-setting');
 }
 const existing=new Set(Object.values(draft.snapshot).flat().flatMap(t=>(t.equipment||[]).map(e=>e.id)));let added=0;
 for(const raw of source.records){const e=clone(raw);delete e.quantity;delete e.process;e.kind='machine-assembly';const template=draft.snapshot[e.stageCode]?.find(t=>t.presetKey==='machine-assembly');if(!template)throw Error('Unmapped stage: '+e.stageCode);if(existing.has(e.id))throw Error('Duplicate equipment id: '+e.id);(template.equipment||=[]).push(e);existing.add(e.id);added++;}
 draft.history.push({label:'重新匯入新版設備 Excel',note:`${added} 台設備及照片；取代 ${removed} 筆舊匯入資料；未送審`,at:now,actor:state.identity.name});draft.updatedAt=now;
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({dryRun:true,removed,added,movedManual,draftVersion:draft.number,initializesProcessScope:initialized,sourceSha256:source.sourceSha256}));return;}
 const updates={masterDataControl:JSON.stringify(control)};if(initialized)updates.processMasterData=JSON.stringify(catalog);
 const result=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000'},body:JSON.stringify({baseRevision:state.revision,updates})});
 if(!result.ok){let message;try{message=(await result.json()).error;}catch{}throw Error('Import rejected '+result.status+': '+(message||''));}
 const confirmed=await result.json();const saved=JSON.parse(confirmed.values.masterDataControl).versions.find(v=>v.id===draft.id);
 console.log(JSON.stringify({saved:saved?.status==='draft',draftVersion:saved?.number,removed,added,movedManual,equipment:Object.values(saved.snapshot).flat().reduce((n,t)=>n+(t.equipment||[]).length,0),legacyTemplates:Object.values(saved.snapshot).flat().filter(t=>t.presetKey==='machine-setting').length,revision:confirmed.revision}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
