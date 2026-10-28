// Actual tooling-local full-wire projection, no service/browser.
import assert from 'node:assert/strict';
import harness from './ipqc-ab-import-harness.cjs';
const load=harness(),{toolingChecksInput}=load('lib/tooling-checks-input.ts'),{toolingIssues,emptyTooling}=load('lib/tooling.ts');
const clone=x=>JSON.parse(JSON.stringify(x)),snapshot=label=>({...emptyTooling(),categories:[{id:label,code:label,nameVi:label}],tools:[]});
const checks=[];
for(const shape of ['absent','unsaved','all-equal','saved-active','all-distinct']){
 const active=snapshot('active'),working=shape==='all-equal'?clone(active):snapshot('working'),saved=shape==='all-equal'||shape==='saved-active'?clone(active):snapshot('saved');
 const flow=shape==='absent'?undefined:{scope:'tooling',generation:'G',revision:7,working,active:{content:active},saved:shape==='unsaved'?null:{id:'S',content:saved}};
 const original={revision:12,control:{activeVersionId:'A',versions:[{id:'A',snapshot:active}],workflow:flow}};
 const payload=clone(original),input=toolingChecksInput(payload);
 const expected={stateRevision:12,activeVersionId:'A',savedId:flow?.saved?.id||null,generation:flow?.generation,revision:flow?.revision,hasWorkflow:!!flow,hasSaved:!!flow?.saved,working:flow?.working,saved:flow?.saved?.content};
 assert.deepEqual(clone(input),clone(expected));
 assert.equal(Object.hasOwn(input,'control'),false);assert.equal(Object.hasOwn(input,'liveContent'),false);
 assert.equal(input.working,payload.control.workflow?.working,'projection never clones inspected snapshot');
 assert.equal(input.saved,payload.control.workflow?.saved?.content,'projection never clones saved snapshot');
 const before=JSON.stringify(input);if(input.hasWorkflow)toolingIssues(input.working);if(input.hasSaved)toolingIssues(input.saved);assert.equal(JSON.stringify(input),before,'inspection never mutates selected input');
 checks.push({shape,status:'PASS'});
}
for(const workflow of [{working:undefined,saved:null},{working:emptyTooling(),saved:{id:'S',content:undefined}}]){
 const input=toolingChecksInput({revision:1,control:{activeVersionId:null,versions:[],workflow}});
 assert.throws(()=>{if(input.hasWorkflow)toolingIssues(input.working);if(input.hasSaved)toolingIssues(input.saved);},{name:'TypeError'},'missing content is not an empty successful inspection');
}
console.log(JSON.stringify({status:'PASS_TOOLING_CHECKS_PROJECTION',checks,malformedContent:'2 PASS preserve throwing inspection',limits:['Readonly full-wire projection only; actual authenticated route separately tested','No Worker memory-limit or browser acceptance claim']},null,2));
