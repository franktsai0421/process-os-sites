const assert = require('node:assert/strict');
const test = require('node:test');
const { createTransferFixture } = require('../scripts/equipment-transfer-fixture.cjs');
const scope = '&scope=' + encodeURIComponent('A:G-A');
const moduleQuery = '&module=1';

// Inject authoritative catalog variants in this fixture's own in-memory D1/R2.
// Workflow requests continue to use the real route and its fresh state read.
async function installSyntheticControls(h, values) {
  const current=await h.core.readState();
  const encoded=await h.load('lib/state-records.ts').encodeRecordValues(h.env.STATE_ARCHIVE,{...current.values,...values});
  assert.equal(h.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1 AND revision=?').run(encoded,current.revision).changes,1);
}

async function denyWrongCatalogAt(h, run, assertPreserved) {
  const original=JSON.parse((await h.core.readState()).values.masterDataControl);
  for(const invalid of ['missing','wrong line','wrong group','group route still includes stage']){
    const master=structuredClone(original),catalog=master.active.AB;
    const product=catalog.products.find(p=>p.code==='A100');
    assert(product);
    if(invalid==='missing') catalog.products=catalog.products.filter(p=>p!==product);
    if(invalid==='wrong line') product.line='B';
    if(invalid==='wrong group') product.category='G-OTHER';
    if(invalid==='group route still includes stage') catalog.categoryGroups.find(g=>g.name==='G-A').defaultStages=['A-CUT'];
    await installSyntheticControls(h,{masterDataControl:JSON.stringify(master)});
    const denied=await run();
    assert.equal(denied.error,'VALIDATION_FAILED',invalid);
    assert(denied.details.issues.some(i=>i.code==='PRODUCT_ROUTE_INVALID'),invalid);
    await assertPreserved();
  }
  await installSyntheticControls(h,{masterDataControl:JSON.stringify(original)});
}

test('off-route substitution preserves authorization, destination validity and whole-case validation',async t=>{
  const h=await createTransferFixture({paired:true,offRoute:true});
  t.after(()=>h.close());
  await h.begin('ipqc-ab','editor',200,scope);
  const group=async()=>h.flow(await h.read('ipqc-ab','editor',scope));
  const baseline=(await group()).active;
  const [chosen,other]=baseline.content.items;
  const apply=async(id,field,value,who='editor',status=200)=>{
    const old=(await group()).working.items.find(i=>i.id===id)[field];
    const path=['items',{id},field];
    return h.command('ipqc-ab','apply',{guards:[{path,value:old}],patches:[{op:'set',path,value}]},who,status,scope);
  };
  assert.equal((await apply(chosen.id,'equipmentId','target','no-edit',403)).error,'FORBIDDEN');
  assert.equal((await apply(chosen.id,'equipmentId','missing-piece','editor',422)).error,'EQUIPMENT_UNAVAILABLE');
  await apply(chosen.id,'equipmentId','target');
  await h.begin('ipqc-ab','editor',200,moduleQuery);
  const save=async()=>h.flow(await h.command('ipqc-ab','save',{},'editor',200,moduleQuery)).saved;
  const submit=(saved,who,status)=>h.command('ipqc-ab','submit',{savedId:saved.id,reason:'Synthetic off-route equipment review'},who,status,moduleQuery);
  for(const [id,field,value] of [[chosen.id,'standard','Unapproved specification'],[other.id,'methodText','Unapproved method'],[chosen.id,'isEnabled',false],[chosen.id,'rules',chosen.rules.map(r=>({...r,value:'0.4'}))]]){
    const original=baseline.content.items.find(i=>i.id===id)[field];
    await apply(id,field,value);
    const response=await submit(await save(),'editor',422);
    assert.equal(response.error,'VALIDATION_FAILED');
    assert(response.details.issues.some(i=>i.code==='OFF_ROUTE_REPLACEMENT_MIXED_CHANGE'));
    assert.deepEqual((await group()).active,baseline);
    await apply(id,field,original);
  }
  const badProduct=await apply(other.id,'productCodes',['different-product'],'editor',422);
  assert(badProduct.error);
  const parentPath=['errors',{id:chosen.errorId},'stageCode'];
  const badStage=await h.command('ipqc-ab','apply',{guards:[{path:parentPath,value:'A-CUT'}],patches:[{op:'set',path:parentPath,value:'A-PACK'}]},'editor',422,scope);
  assert(badStage.error);
  assert.equal((await submit(await save(),'edit-only',403)).error,'FORBIDDEN');
  const parent=(await group()).working.errors[0];
  const extra=await h.command('ipqc-ab','apply',{moduleAction:'create-item',input:{errorId:parent.id,item:{
    standard:'New off-route standard',methodText:'Synthetic',inspectionMode:'equipment',equipmentId:'target',
    productCodes:chosen.productCodes,rules:chosen.rules}}},'editor',422,scope);
  assert(extra.error);
  const saved=await save();
  const preserved=async()=>assert.deepEqual((await group()).active,baseline);
  await denyWrongCatalogAt(h,()=>submit(saved,'editor',422),preserved);
  const caseId=(await submit(saved,'editor',200)).receipt.caseId;
  const approve=(who,status)=>h.command('ipqc-ab','approve',{caseId},who,status,moduleQuery);
  assert.equal((await approve('edit-only',403)).error,'FORBIDDEN');
  await denyWrongCatalogAt(h,()=>approve('reviewer',422),preserved);
  // The target may cease to be available between submission and review.
  const changeTarget=async enabled=>{
    await h.begin('routine-equipment');
    const path=['equipment',{id:'target'},'enabled'];
    await h.command('routine-equipment','apply',{guards:[{path,value:!enabled}],patches:[{op:'set',path,value:enabled}]});
    await h.promote('routine-equipment');
  };
  await changeTarget(false);
  const unavailable=await approve('reviewer',422);
  assert.equal(unavailable.error,'VALIDATION_FAILED');
  assert(unavailable.details.issues.some(i=>i.message==='EQUIPMENT_UNAVAILABLE'));
  assert.deepEqual((await group()).active,baseline);
  await changeTarget(true);
  await approve('reviewer',200);
  const final=(await group()).active;
  assert.equal(final.content.items.find(i=>i.id===chosen.id).equipmentId,'target');
  assert.deepEqual(final.content.items.find(i=>i.id===other.id),other);
});

test('an independently hidden product route in another group still blocks AB submission',async t=>{
  const h=await createTransferFixture({paired:true,offRoute:true});
  t.after(()=>h.close());
  const data=(await h.core.readState()).values, master=JSON.parse(data.masterDataControl), ab=JSON.parse(data.ipqcABMasterControl);
  const catalog=master.active.AB;
  catalog.categoryGroups.push({id:'peer-group',line:'A',name:'PEER',defaultStages:['A-PACK']});
  catalog.products.push({...catalog.products.find(p=>p.code==='A100'),id:'peer-product',code:'P100',category:'PEER',stages:['A-PACK']});
  const src=ab.scopes['A:G-A'], approved=structuredClone(src.versions.find(v=>v.id===src.activeVersionId));
  approved.id='peer-approved';
  const parent=approved.snapshot.errors[0], item=approved.snapshot.items[0];
  Object.assign(parent,{id:'peer-error',code:'PEER-L1',group:'PEER'});
  Object.assign(item,{id:'peer-item',code:'PEER-L1-01',errorId:parent.id,productCodes:['P100']});
  approved.snapshot.items=[item];approved.snapshot.errors=[parent];
  ab.scopes['A:PEER']={line:'A',group:'PEER',activeVersionId:approved.id,versions:[approved]};
  await installSyntheticControls(h,{masterDataControl:JSON.stringify(master),ipqcABMasterControl:JSON.stringify(ab)});
  await h.begin('ipqc-ab','editor',200,scope);
  const original=h.flow(await h.read('ipqc-ab','editor',scope)).active;
  const path=['items',{id:original.content.items[0].id},'equipmentId'];
  await h.command('ipqc-ab','apply',{guards:[{path,value:'source'}],patches:[{op:'set',path,value:'target'}]},'editor',200,scope);
  await h.begin('ipqc-ab','editor',200,moduleQuery);
  const saved=h.flow(await h.command('ipqc-ab','save',{},'editor',200,moduleQuery)).saved;
  const denied=await h.command('ipqc-ab','submit',{savedId:saved.id,reason:'Keep independent validation'},'editor',422,moduleQuery);
  assert.equal(denied.error,'VALIDATION_FAILED');
  assert.deepEqual(denied.details.issues.filter(i=>i.code==='PRODUCT_ROUTE_INVALID').map(i=>i.path),[['scopes','A:PEER','items',{id:'peer-item'},'productCodes']]);
  const validMaster=structuredClone(master);
  validMaster.active.AB.products.find(p=>p.code==='P100').stages=['A-CUT'];
  await installSyntheticControls(h,{masterDataControl:JSON.stringify(validMaster)});
  const submitted=await h.command('ipqc-ab','submit',{savedId:saved.id,reason:'Peer route now valid'},'editor',200,moduleQuery);
  await installSyntheticControls(h,{masterDataControl:JSON.stringify(master)});
  const rejected=await h.command('ipqc-ab','approve',{caseId:submitted.receipt.caseId},'reviewer',422,moduleQuery);
  assert.equal(rejected.error,'VALIDATION_FAILED');
  assert.deepEqual(rejected.details.issues.filter(i=>i.code==='PRODUCT_ROUTE_INVALID').map(i=>i.path),[['scopes','A:PEER','items',{id:'peer-item'},'productCodes']]);
  assert.deepEqual(h.flow(await h.read('ipqc-ab','editor',scope)).active,original);
});
