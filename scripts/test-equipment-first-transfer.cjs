// Actual native handlers, generated accounts and private SQLite/R2 only.
'use strict';
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {fixture}=require('./quality-replacement-preview-fixture.cjs');
const {connect}=require('./test-routine-equipment-isolated-workflow.cjs');
const {createTransferFixture}=require('./equipment-transfer-fixture.cjs');
const names = {fqc:'qualityMasterControl',iqc:'iqcMasterControl','ipqc-ab':'ipqcABMasterControl','ipqc-c':'ipqcCMasterControl'};
async function readFlow(h, module) {
  const state = await h.core.readState(), control = JSON.parse(state.values[names[module]]);
  const moduleControl = module==='ipqc-ab'?control.moduleDraft:module==='fqc'?control.libraries.fqc:control;
  return {revision:state.revision, workflow:moduleControl.workflow, group:module==='ipqc-ab'?control.scopes['A:G-A'].workflow:moduleControl.workflow};
}
async function replacement(h, module) {
  const {revision, workflow, group} = await readFlow(h,module), item=group.working.items[0];
  assert.equal(item.equipmentId,'source');
  const catalog = JSON.parse((await h.core.readState()).values.routineEquipmentControl);
  const target=catalog.versions.find(v=>v.id===catalog.activeVersionId).equipment.find(e=>e.id==='target');
  const fields={equipmentId:'target',...(module==='fqc'?{tool:target.pieceMark||target.assetCode}:['iqc','ipqc-ab'].includes(module)?{inspectionMode:'equipment'}:{})};
  const patches=Object.entries(fields).map(([key,value])=>({op:'set',path:['items',{id:item.id},key],value}));
  const guards=patches.map(p=>({path:p.path,value:item[p.path[2]]})), change={patches,guards};
  const cmd={operationId:randomUUID(),clientId:'synthetic-clean-replacement',sequence:1,equipmentTransferOpen:true,generation:workflow.generation,action:'save',expectedRevision:workflow.revision,equipmentTransferRevision:revision};
  if(module==='ipqc-ab')return {...cmd,moduleAction:'save-local-v1',input:{stateRevision:revision,scopes:[{scope:'A:G-A',baseId:group.active.id,generation:group.generation,changes:[change]}]}};
  if(module==='ipqc-c')return {...cmd,localChanges:[change]};
  return {...cmd,...change,moduleAction:'save-local-v1',input:module==='fqc'?{matrixCells:[]}:{}};
}

async function run(){
 const seed=await createTransferFixture({paired:true,secondABGroup:true});
 try{
  const values=(await seed.core.readState()).values;
  for(const m of Object.keys(names)){
   for(const mode of (process.argv.includes('--v107-begin')?['v107-native-begin']:['revoked','peer-opens','replayed','first-adoption'])){
    const h=await fixture(values,{includeIPQCC:true});
    try{
     for(const [key,bytes] of seed.objects)h.objects.set(key,Buffer.from(bytes));
     // Authorize the second synthetic editor using the same normal profile as the first.
     const s=await h.core.readState(),users=JSON.parse(s.values.platformUsers);
     const editor=users.find(u=>u.id==='preview-editor'),peer=users.find(u=>u.id==='preview-edit-only');
     peer.accessOverrides={...editor.accessOverrides};peer.permissions=[...editor.permissions];
     if(mode==='replayed')editor.accessOverrides[m+'.create']=false; // Only existing standards are patched.
     if(mode==='first-adoption'){
      const control=JSON.parse(s.values[names[m]]);
      if(m==='ipqc-ab'){delete control.moduleDraft;delete control.scopes['A:G-A'].workflow;}
      else delete (m==='fqc'?control.libraries.fqc:control).workflow;
      s.values[names[m]]=JSON.stringify(control);
      editor.accessOverrides['approval.submit']=true;editor.permissions.push('approval.submit');
      if(m==='fqc')editor.role='admin';
     }
     s.values.platformUsers=JSON.stringify(users);
     const encoded=await h.load('lib/state-records.ts').encodeRecordValues(h.env.STATE_ARCHIVE,s.values);
     h.db.prepare('UPDATE shared_state SET "values"=?,revision=revision+1').run(encoded);
     if(mode==='first-adoption'){
      const before=h.snapshot().row,ui=await connect(h);
      try{
       ui.test.openTransferModal('source');
       for(let i=0;!ui.test.dialog?.preview&&i<250;i++)await new Promise(resolve=>setTimeout(resolve,10));
       const dialog=ui.test.dialog,key={'ipqc-c':'ipqcC','ipqc-ab':'ipqcAB'}[m]||m;
       assert.equal(dialog.preview.modules.find(v=>v.moduleId===m).transferDraft,'open-required');
       dialog.targetEqId='target';await ui.test.executeTransfer(key);
       assert.equal(dialog.moduleStatus[key],'success',m+' '+dialog.moduleMessages[key]);
       const after=await readFlow(h,m);assert(after.workflow.saved.id);
       assert.equal(after.revision,before.revision+1);assert.equal(ui.posts().length,1);
       console.log('VERIFIED',JSON.stringify({module:m,mode,singleSave:true}));
      }finally{ui.close();}
      continue;
     }
     const command=await replacement(h,m),q=m==='ipqc-ab'?'&module=1':'',query='?caseMetadata=1'+q;
     const send=(who,code,cmd=command)=>h.call(m+'/workflow','POST',{command:cmd},who,code,query);
     const before=h.snapshot().row,baseline=await readFlow(h,m);
     if(mode==='v107-native-begin'){
      // Simulate the same winning peer at the last D1 check. V107 normally
      // opens first and saves via another request. Measure only that first Begin.
      const prepare=h.env.DB.prepare.bind(h.env.DB),initial=new Set(h.objects.keys());
      let staged=null,firstStageBytes=0,puts=0;const put=h.env.STATE_ARCHIVE.put.bind(h.env.STATE_ARCHIVE);
      h.env.STATE_ARCHIVE.put=async(...args)=>{puts++;return put(...args);};
      h.env.DB.prepare=sql=>{const stmt=prepare(sql);if(/^UPDATE shared_state SET revision=/i.test(sql)){
       const write=stmt.run.bind(stmt);stmt.run=async()=>{
        if(staged===null){staged=h.objects.size-initial.size;firstStageBytes=[...h.objects].reduce((n,[k,v])=>n+(initial.has(k)?0:v.length),0);await h.begin(m,'edit-only',200,q);}
        return write();
       };}
       return stmt;
      };
      await h.begin(m,'editor',200,q);assert.notEqual(staged,null);
      const previous=puts;await h.begin(m,'editor',200,q);assert.equal(puts,previous);
      console.log('VERIFIED',JSON.stringify({module:m,mode,firstStage:staged,firstStageBytes,repeatPuts:puts-previous}));
      continue;
     }
     assert.equal((await h.preview()).modules.find(x=>x.moduleId===m).transferDraft,'open-required');
     const bad=structuredClone(command),pair=m==='ipqc-c'?bad.localChanges[0]:m==='ipqc-ab'?bad.input.scopes[0].changes[0]:bad;
     pair.patches.find(p=>p.path[2]==='equipmentId').value='unknown-piece';
     assert.equal((await send('editor',422,bad)).error,'EQUIPMENT_UNAVAILABLE');
     await send('reviewer',403);
     assert.deepEqual(h.snapshot().row,before);assert.deepEqual(await readFlow(h,m),baseline);
     let puts=0;const originalPut=h.env.STATE_ARCHIVE.put.bind(h.env.STATE_ARCHIVE);
     const count=()=>h.objects.size;
     const start=count(),initial=new Set(h.objects.keys());let winner,firstStage=0,firstStageBytes=0;
     h.env.STATE_ARCHIVE.put=async(...args)=>{
      await originalPut(...args);puts++;
      if(mode==='revoked'&&puts===1){
       const token=h.sessions.editor.Cookie.slice(h.sessions.editor.Cookie.indexOf('=')+1);
       h.db.prepare('INSERT OR REPLACE INTO process_revoked_sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),Date.now()+3600000,Date.now());
      }
     };
     if(mode==='revoked'){
      h.env.PROCESS_SESSION_REVOCATION_ENABLED='1';await send('editor',401);assert(puts>0);
      assert.deepEqual(h.snapshot().row,before);assert.deepEqual(await readFlow(h,m),baseline);
     }else if(mode==='peer-opens'){
      const prepare=h.env.DB.prepare.bind(h.env.DB);let raced=false;
      h.env.DB.prepare=sql=>{const stmt=prepare(sql);if(/^UPDATE shared_state SET revision=/i.test(sql)){
       const write=stmt.run.bind(stmt);stmt.run=async()=>{
        if(!raced){raced=true;firstStage=count()-start;firstStageBytes=[...h.objects].reduce((n,[k,v])=>n+(initial.has(k)?0:v.length),0);await h.begin(m,'edit-only',200,q);
         const group=m==='ipqc-ab'?'&scope=A%3AG-A':'';
         if(group)await h.begin(m,'edit-only',200,group);
         const row=(await readFlow(h,m)).group.working.items[1],key={fqc:'description',iqc:'nameVi','ipqc-ab':'standard','ipqc-c':'description'}[m];
         const path=['items',{id:row.id},key];
         await h.command(m,'apply',{patches:[{op:'set',path,value:'peer wins'}],guards:[{path,value:row[key]}]},'edit-only',200,group);
         winner=h.snapshot().row;
        }
        return write();
       };}
       return stmt;
      };
      assert.equal((await send('editor',409)).error,'DRAFT_REVISION_CHANGED_RECONFIRM');
      assert.deepEqual(h.snapshot().row,winner);const won=await readFlow(h,m);
      assert.equal(won.workflow.receipts[command.operationId],undefined);assert.deepEqual(won.workflow.saved,baseline.workflow.saved);
      const after=puts;await send('editor',409);assert.equal(puts,after);assert.deepEqual(h.snapshot().row,winner);
     }else{
      const a=await send('editor',200),saved=h.snapshot().row,n=puts;
      const b=await send('editor',200);assert.deepEqual(a.receipt,b.receipt);assert.equal(b.unchanged,true);
      assert.equal(puts,n);assert.deepEqual(saved,h.snapshot().row);assert.equal(saved.revision,before.revision+1);
      const flow=await readFlow(h,m);assert.equal(flow.workflow.saved.id,a.receipt.savedId);assert.deepEqual(flow.workflow.active,baseline.workflow.active);
      await send('reviewer',403);assert.deepEqual(saved,h.snapshot().row);
     }
     console.log('VERIFIED',JSON.stringify({module:m,mode,puts,distinctObjects:count()-start,firstStage,firstStageBytes}));
    }finally{h.close();}
   }
  }
 }finally{seed.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
