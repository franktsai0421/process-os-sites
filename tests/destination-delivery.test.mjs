import test from 'node:test';import assert from 'node:assert/strict';
import {destinationPlan,destinationValues} from '../lib/destination-delivery.mjs';
import {runtimeCatalog} from '../lib/process-bootstrap.mjs';
import {deliveryCandidate,destinationURL} from '../public/process/delivery-purpose.mjs';
const owner=()=>true,only=cell=>permission=>permission===cell;
void test('owner destination changes select only screen dependencies, not all owner aggregates',async()=>{
 const q=await destinationPlan('?view=data&dataTab=quality-iqc',owner);
 assert.deepEqual(q.deliveryKeys,[]);assert.deepEqual(q.catalog.scopes,[]);assert(!q.keys.includes('masterDataControl'));
 const home=await destinationPlan('?view=dashboard',owner);assert(!home.keys.includes('iqcMasterControl'));assert(!home.keys.includes('bomOverrides'));assert.equal(home.catalog.includeBom,false);
 const users=await destinationPlan('?view=data&dataTab=users',owner);assert.deepEqual(users.deliveryKeys,['backupSettings']);assert.deepEqual(users.catalog.scopes,[]);
 const identity=destinationValues({revision:1,values:{processCustomRoles:'[]',processRoleTemplateOverrides:'{}',unrelated:'{}'}},users);assert.deepEqual(Object.keys(identity.values),['processCustomRoles','processRoleTemplateOverrides']);
 const placeholder=await destinationPlan('?view=quality-dashboard',owner);assert.deepEqual(placeholder.deliveryKeys,[]);
});
void test('normal staff fallback, explicit denial, invalid intent and player display intent do not grant access',async()=>{
 const staff=await destinationPlan('',only('iqc.view'));assert.equal(staff.destination.key,'data:quality-iqc');
 const player=await destinationPlan('?view=player&line=C&stage=C-CUT',only('player.view'));assert.equal(player.destination.key,'player');assert.deepEqual(player.catalog.scopes,['AB','C']);
 await assert.rejects(()=>destinationPlan('?view=data&dataTab=quality-iqc',only('player.view')),/DESTINATION_FORBIDDEN/);
 await assert.rejects(()=>destinationPlan('?view=data&dataTab=users',only('iqc.view')),/DESTINATION_FORBIDDEN/);
 await assert.rejects(()=>destinationPlan('',()=>false),/DESTINATION_FORBIDDEN/);
 for(const query of ['?view=evil','?view=player&view=editor','?view=data&dataTab=evil'])assert.throws(()=>deliveryCandidate(query),/INVALID_DESTINATION/);
 const url=destinationURL('https://fixture.invalid/process/index.html?view=player&line=C&stage=C-CUT',{view:'data',dataTab:'quality-iqc',system:'quality'});assert.equal(url.pathname,'/process/index.html');assert(!url.searchParams.has('line'));assert(!url.searchParams.has('stage'));
});
void test('purpose field projection cannot expose another approved master scope or quality subsection',async()=>{
 const ab=await destinationPlan('?view=data&dataTab=AB',owner),iqc=await destinationPlan('?view=data&dataTab=quality-iqc',owner);
 const input={revision:7,values:{platformUsers:'[]',masterDataControl:JSON.stringify({active:{AB:{marker:'allowed'},C:{marker:'other'},PROCESS:{marker:'templates'}},versions:[{scope:'AB'},{scope:'C'}]}),iqcMasterControl:'{}',canonicalQuality:'{"iqc":{"visible":true},"fqc":{"other":true},"ipqc":{"other":true}}',dispatchBoard:'{}'}};
 const a=destinationValues(input,ab);assert.deepEqual(Object.keys(a.values),['platformUsers','masterDataControl']);assert.deepEqual(Object.keys(JSON.parse(a.values.masterDataControl).active),['AB']);assert.equal(JSON.parse(a.values.masterDataControl).versions.length,1);
 const q=destinationValues(input,iqc);assert(!q.values.canonicalQuality);assert(!q.values.iqcMasterControl);assert(!q.values.masterDataControl);
 assert.equal(Object.keys(JSON.parse(input.values.masterDataControl).active).length,3,'no mutation of original');
 let reads=0;const catalog=await runtimeCatalog({},owner,()=>{reads++;throw Error('unexpected BOM');},iqc.catalog);assert.deepEqual(catalog.loadedScopes,[]);assert.equal(reads,0);
});

void test('dedicated quality loaders avoid duplicate bootstrap business hydration without widening admission',async()=>{
 for(const [tab,module] of [['quality-iqc','iqc'],['quality-ipqc-ab','ipqc-ab'],['quality-ipqc-c','ipqc-c'],['quality-mold-equipment','tooling'],['quality-routine-equipment','equipment']]){
  const plan=await destinationPlan('?view=data&dataTab='+tab,only(module+'.view'));
  assert.deepEqual(plan.deliveryKeys,[]);assert.deepEqual(plan.catalog,{scopes:[],includeBom:false});
  assert.equal(plan.destination.module,module);
  await assert.rejects(()=>destinationPlan('?view=data&dataTab='+tab,()=>false),/DESTINATION_FORBIDDEN/);
 }
 const fqc=await destinationPlan('?view=data&dataTab=quality-fqc',owner);
 assert.deepEqual(fqc.deliveryKeys,['qualityMasterControl','canonicalQuality'],'FQC notice/bootstrap compatibility remains unchanged');
});
