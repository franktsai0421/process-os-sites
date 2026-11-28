// Run against two local checkouts. Inputs contain synthetic fixture records only.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [mode,checkout,seedArg,outArg]=process.argv.slice(2);
if(!['seed','baseline','candidate'].includes(mode)||!checkout||!seedArg||mode!=='seed'&&!outArg)throw Error('Usage: node benchmark-equipment-reference-views.cjs seed|baseline|candidate CHECKOUT SEED [RESULT]');
const root=path.resolve(checkout),seedPath=path.resolve(seedArg),outPath=outArg&&path.resolve(outArg);
process.env.REPLACEMENT_PREVIEW_SOURCE_ROOT=root;process.chdir(root);
const local=n=>path.join(root,'scripts',n),keys=['masterDataControl','processMasterData','routineEquipmentControl','qualityMasterControl','iqcMasterControl','ipqcCMasterControl','ipqcABMasterControl'];
const delay=()=>new Promise(r=>setTimeout(r,2)),mods=['fqc','iqc','ipqc-ab','ipqc-c'],ui=m=>({'ipqc-ab':'ipqcAB','ipqc-c':'ipqcC'}[m]||m);
async function waitFor(check){
 const deadline=performance.now()+30000;
 while(!check()){if(performance.now()>deadline)throw Error('Synthetic reference benchmark did not settle');await delay();}
}
async function run(){
 if(mode==='seed'){
  const h=await require(local('equipment-transfer-fixture.cjs')).createTransferFixture({paired:true});
  try{const raw=(await h.core.readState()).values,values=Object.fromEntries(keys.map(k=>[k,raw[k]])),photos=[...h.objects].filter(([k])=>k.includes('/photos/')).map(([k,b])=>[k,b.toString('base64')]);const historical=[];
   for(const [mod,key]of [['fqc','qualityMasterControl'],['iqc','iqcMasterControl'],['ipqc-ab','ipqcABMasterControl'],['ipqc-c','ipqcCMasterControl']]){
    const model=JSON.parse(values[key]),lib=mod==='fqc'?model.libraries.fqc:mod==='ipqc-ab'?model.scopes['A:G-A']:model,active=lib.versions.find(v=>v.id===lib.activeVersionId);
    for(let i=0;i<42;i++){const ver=structuredClone(active);ver.id='benchmark-history-'+mod+'-'+i;ver.number=mod==='fqc'?'V'+(i+100):i+100;ver.status='superseded';ver.snapshot.items[0].note='SYNTHETIC HISTORY '+mod+' '+i;
     historical.push(createHash('sha256').update(JSON.stringify(ver.snapshot)).digest('hex'));lib.versions.push(ver);}
    values[key]=JSON.stringify(model);
   }
   fs.writeFileSync(seedPath,JSON.stringify({values,photos,historical}));return;
  }finally{h.close();}
 }
 const seed=JSON.parse(fs.readFileSync(seedPath));const sample=[];
 const p=local('test-routine-equipment-transfer-intent.cjs');let src=fs.readFileSync(p,'utf8');
 src=src.replace('window.__equipmentIntentTest = {','window.__equipmentIntentTest = {benchView(id){viewDialog={data:{id}};const session=newViewReferences(id);viewDialog.references=session;return session;},async benchKind(session,kind){await readViewReferences(session,kind);return session.states[kind].status;},');
 const testMod=new Module(p);testMod.filename=p;testMod.paths=Module._nodeModulePaths(path.dirname(p));require.cache[p]=testMod;testMod._compile(src,p);
 const {fixture}=require(local('quality-replacement-preview-fixture.cjs')),{connect}=require(local('test-routine-equipment-isolated-workflow.cjs'));
 for(let n=0;n<3;n++){
  const h=await fixture(seed.values,{includeIPQCC:true});
  try{
   for(const [key,b64]of seed.photos)h.objects.set(key,Buffer.from(b64,'base64'));
   let gets=[],calls=[],bodies=0;const history=new Set(seed.historical);
   const get=h.env.STATE_ARCHIVE.get.bind(h.env.STATE_ARCHIVE);h.env.STATE_ARCHIVE.get=async k=>{gets.push(k);if(history.has(k.match(/([a-f0-9]{64})\.json$/)?.[1]))bodies++;return get(k);};
   const f=await connect(h),fetch=f.c.fetch;f.c.fetch=async (url,opt)=>{calls.push({p:new URL(url,'http://fixture').pathname,m:opt?.method||'GET'});return fetch(url,opt);};
   const measure=async(name,m,fn)=>{gets=[];calls=[];bodies=0;const traceStart=h.trace.length;const before=h.db.prepare('SELECT revision FROM shared_state').get().revision;const t=performance.now(),result=await fn(),ms=performance.now()-t;const after=h.db.prepare('SELECT revision FROM shared_state').get().revision;
    if(name.startsWith('detail-'))assert.equal(result,'loaded');if(name==='all-four-details')assert.deepEqual(result,['loaded','loaded','loaded','loaded']);
    sample.push({n:n+1,name,module:m,ms:+ms.toFixed(2),requests:calls.length+h.trace.length-traceStart,posts:calls.filter(x=>x.m==='POST').length+h.trace.slice(traceStart).filter(x=>x.method==='POST').length,commits:after-before,archiveGets:gets.length,historicalBodies:bodies,result});};
   for(const m of mods){
    const session=f.test.benchView('source');
    await measure('detail-first-open',m,()=>f.test.benchKind(session,ui(m)));
    await measure('detail-same-open-panel',m,()=>f.test.benchKind(session,ui(m)));}
   const all=f.test.benchView('source');
   await measure('all-four-details','all',()=>Promise.all(mods.map(m=>f.test.benchKind(all,ui(m)))));
   // Both versions start with the same editable shared drafts. Native Begin
   // is a separate action and is outside the timed replacement confirmation.
   for(const m of mods){
    await h.begin(m,'editor',200,m==='ipqc-ab'?'&scope=A%3AG-A':'');
    if(m==='ipqc-ab')await h.begin(m,'editor',200,'&module=1');
   }
   for(const m of mods){
    await measure('replacement-preview',m,async()=>{f.test.openTransferModal('source');await waitFor(()=>f.test.dialog?.preview||f.test.dialog?.previewError);const entry=f.test.dialog.preview.modules.find(v=>v.moduleId===m);assert(entry.connected);return entry.items.length;});
    f.test.dialog.targetEqId='target';
    await measure('transfer-confirm',m,async()=>{await f.test.executeTransfer(ui(m));const status=f.test.dialog.moduleStatus[ui(m)];assert.equal(status,'success',f.test.dialog.moduleMessages[ui(m)]);return status;});await waitFor(()=>!f.test.dialog?.refreshing);
    if(mode==='baseline'&&m.startsWith('ipqc')){
     await measure('additional-module-save',m,async()=>{const q=m==='ipqc-ab'?'&module=1':'';if(m==='ipqc-ab')await h.begin(m,'editor',200,q);
      const dto=await h.read(m,'editor',q);const params=m==='ipqc-ab'?{moduleAction:'save-local-v1',input:{scopes:[],stateRevision:dto.revision}}:{localChanges:[]};
      const ack=await h.command(m,'save',{...params,clientId:'bench-'+m,sequence:1},'editor',200,q);assert(ack.receipt.savedId);return 'saved';});
    }
   }
   f.close();
  }finally{h.close();}
 }
 fs.writeFileSync(outPath,JSON.stringify({samplesPerOperation:3,seedSHA256:createHash('sha256').update(fs.readFileSync(seedPath)).digest('hex'),historyPerModule:42,mode,scope:'Private SQLite/R2 and actual JS controllers/handlers. No physical device, network or hosted latency. Supplemental baseline module save uses normal destination API.',sample},null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
