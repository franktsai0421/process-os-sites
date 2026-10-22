/* oxlint-disable typescript/no-require-imports -- Node VM fixture exercises production continuation and reference-query guards. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const source=fs.readFileSync('public/process/routine-equipment.js','utf8'),tree=ts.createSourceFile('routine-equipment.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
function extract(name){let found;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,visit);}visit(tree);assert.ok(found,name);return source.slice(found.getStart(tree),found.end);}
const deletion=extract('deleteEquipment'),query=extract('queryAllQualityReferences');
const empty=()=>{
  const entries=['fqc','iqc','ipqcC','ipqcAB'].map(moduleId=>[moduleId,{active:[],pending:[],draft:[],superseded:[]}]);
  return Object.fromEntries(entries);
};
async function deletionCase(mode){let settle,reject;const original={equipment:[{id:'synthetic-equipment',assetCode:'QA',name:'Synthetic'},{id:'retain'}]},calls={writes:0,confirms:0,query:0};
 const context={actor:'qa',identity:()=>({id:context.actor}),controlActor:'qa',working:original,syncGeneration:'g1',selectedVersionId:'draft1',enabled:true,editable:()=>context.enabled,permitted:()=>true,
  equipmentRefCache:new Map([['synthetic-equipment',empty()]]),queryAllQualityReferences:(_id,options)=>{assert.equal(options.strict,true);calls.query++;return new Promise((resolve,fail)=>{settle=resolve;reject=fail;});},active:()=>({equipment:[]}),t:zh=>zh,displayName:item=>item.name,
  confirm:()=>{calls.confirms++;if(mode==='cancel')return false;if(mode==='confirm-actor'&&calls.confirms===2)context.actor='other';return true;},alert(){},render(){},pendingPhotos:new Map(),selectedEquipmentId:'',editingEquipmentId:'',formSnapshot:null,
  writeShared:async()=>{calls.writes++;}};
 vm.createContext(context);vm.runInContext(deletion,context);const job=context.deleteEquipment('synthetic-equipment');
 if(mode==='actor')context.actor='other';
 if(mode==='working')context.working={equipment:[{id:'synthetic-equipment',name:'New draft'}]};
 if(mode==='generation')context.syncGeneration='g2';
 if(mode==='version')context.selectedVersionId='draft2';
 if(mode==='item')context.working.equipment[0]={id:'synthetic-equipment',name:'Replacement'};
 if(mode==='permission')context.enabled=false;
 const refs=empty();if(['active','pending','draft'].includes(mode))refs.fqc[mode].push({checkNo:'synthetic-reference',status:mode});
 context.status=value=>value;
 if(mode==='query-failure')reject(Error('SYNTHETIC_REFERENCE_FAILURE'));else settle(refs);
 await job;assert.equal(calls.query,1,'Deletion must check fresh references rather than the display cache');
 assert.equal(calls.writes,mode==='success'?1:0);
 assert.equal(context.working.equipment.some(item=>item.id==='synthetic-equipment'),mode!=='success');
 if(mode==='query-failure')assert.ok(context.message);
}
async function queryCase(mode){const context={window:{FQCQualityAPI:{getEquipmentReferences:()=>{if(mode==='fqc-error')throw Error('SYNTHETIC');return[];}}},localStorage:{getItem:()=>null},console:{error(){}},encodeURIComponent,
 fetch:async url=>({ok:!((mode==='http-error'&&url==='/api/iqc')||(mode==='planned-error'&&url.includes('replacement'))),json:async()=>url.includes('replacement')?{pending:[],modules:[]}:url==='/api/ipqc-ab'?{control:{scopes:{}}}:(mode==='shape-error'&&url==='/api/ipqc-c')?{}:{control:{versions:[]}}})};
 vm.createContext(context);vm.runInContext(query,context);
 if(mode==='success')await context.queryAllQualityReferences('synthetic',{strict:true});
 else await assert.rejects(context.queryAllQualityReferences('synthetic',{strict:true}),/EQUIPMENT_REFERENCE_CHECK_FAILED/);
}
(async()=>{for(const mode of ['success','actor','working','generation','version','item','permission','confirm-actor','cancel','query-failure','active','pending','draft'])await deletionCase(mode);
 for(const mode of ['success','http-error','planned-error','fqc-error','shape-error'])await queryCase(mode);
 console.log(JSON.stringify({status:'PASS',cases:18,scope:'Actual production delete/query functions, stale actor/draft/generation/permissions blocked, failed or incomplete reference checks preserve content; isolated VM only'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
