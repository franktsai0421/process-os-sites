import test from 'node:test';
import assert from 'node:assert/strict';
import {processMasterReferences,removedProcessMasterTargets} from '../lib/process-master-references.ts';
const catalog={'A-CUT':[{id:'t',equipment:[{id:'e',number:'EQ-1'}]}]};
const template={kind:'template',id:'t',stage:'A-CUT'},equipment={kind:'equipment',id:'e',number:'EQ-1',stage:'A-CUT'};
const operation={id:'o',number:'01',name:'Referenced',templateId:'t',machineIds:['e'],productCodes:['P']};
const content={workspaces:[{id:'w',line:'A',category:'CAT',stages:{'A-CUT':[operation]}}]};
void test('membership comparison distinguishes deletes from field edits and equipment moves',()=>{
 assert.deepEqual(removedProcessMasterTargets(catalog,structuredClone(catalog)),[]);
 assert.equal(removedProcessMasterTargets(catalog,{}).length,2);
 assert.deepEqual(removedProcessMasterTargets(catalog,{'B-CUT':catalog['A-CUT']}),[]);
});
for(const place of ['active','working','saved','pending'])void test('protects authoritative '+place+' references',()=>{
 const workflow={active:{content:place==='active'?content:{}},working:place==='working'?content:{},saved:{content:place==='saved'?content:{}},cases:place==='pending'?[{id:'c',status:'pending',content}]:[]};
 for(const target of [template,equipment]){const result=processMasterReferences({processAuthoringControl:JSON.stringify({workflow})},[target]);assert.equal(result.total,1);assert.equal(result.references[0].products[0],'P');}
});
void test('retains historical closed snapshots without treating them as current consumers',()=>{
 const values={processAuthoringControl:JSON.stringify({workflow:{active:{content:{}},working:{},saved:{content:{}},cases:[{status:'returned',content},{status:'approved',content}],saves:[{content}]}})};
 assert.equal(processMasterReferences(values,[template]).total,0);assert.ok(values.processAuthoringControl.includes('Referenced'));
});
void test('legacy active, pending, cached editor and published references are checked',()=>{
 for(const values of [
 {approvalVersions:JSON.stringify([{id:'v',status:'approved',...content}])},
 {approvalVersions:JSON.stringify([{id:'v',status:'pending',...content}])},
 {'processEditor:CAT:A':JSON.stringify(content)},
 {publishedProcess:JSON.stringify({A:content})}])assert.equal(processMasterReferences(values,[template]).total,1);
});
void test('legacy equipment numbers stay stage-scoped and machine detail IDs remain stable',()=>{
 const legacy=structuredClone(content);legacy.workspaces[0].stages['A-CUT'][0].machineIds=['EQ-1'];
 assert.equal(processMasterReferences({'processEditor:CAT:A':JSON.stringify(legacy)},[equipment]).total,1);
 assert.equal(processMasterReferences({'processEditor:CAT:A':JSON.stringify(legacy)},[{...equipment,stage:'C-CUT'}]).total,0);
 legacy.workspaces[0].stages['A-CUT'][0].machineDetails=[{id:'e'}];
 assert.equal(processMasterReferences({'processEditor:CAT:A':JSON.stringify(legacy)},[equipment]).total,1);
});
void test('bounded response retains total and does not mistake unreadable data for no references',()=>{
 const many=structuredClone(content);many.workspaces[0].stages['A-CUT']=Array.from({length:120},(_,i)=>({...operation,id:'o'+i}));
 const result=processMasterReferences({'processEditor:CAT:A':JSON.stringify(many)},[template]);assert.equal(result.total,120);assert.equal(result.references.length,100);assert.equal(result.truncated,true);
 assert.throws(()=>processMasterReferences({processAuthoringControl:'broken'},[template]));
});

void test('highest superseded version remains live when a legacy scope has no approved version',()=>{
 const versions=[{id:'old',number:1,status:'superseded',category:'CAT',line:'A',...content},{id:'current',number:2,status:'superseded',category:'CAT',line:'A',...content}];
 const result=processMasterReferences({approvalVersions:JSON.stringify(versions)},[template]);assert.equal(result.total,1);assert.equal(result.references[0].versionId,'current');
});
