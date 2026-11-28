// Full actual equipment transfer UI -> actual routes, normal synthetic approvals.
// No browser, HTTP server or live records. IPQC-C test rights are fixture-local.
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { fixture, json } = require('./quality-replacement-preview-fixture.cjs');
const { connect } = require('./test-routine-equipment-isolated-workflow.cjs');
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const results = [], operationTimings = [];
const scopeQ = '&scope=' + encodeURIComponent('A:G-A');
async function check(name, task) { const start = performance.now(); await task(); results.push({ name, status: 'PASS', isolatedHandlerMs: +(performance.now() - start).toFixed(2) }); console.log(JSON.stringify(results.at(-1))); }
(async () => {
  const h = await require('./equipment-transfer-fixture.cjs').createTransferFixture();
  const fullRead = async(moduleId, q) => moduleId === 'ipqc-c' ? {control:JSON.parse((await h.core.readState()).values.ipqcCMasterControl)} : h.read(moduleId, 'editor', q);
  try {
    const equipmentBefore = (await h.core.readState()).values.routineEquipmentControl, oldObjects = new Map(h.objects);
    const f = await connect(h); const stateQ = moduleId => moduleId === 'ipqc-ab' ? scopeQ : '';
    async function runTransfer(moduleId, target, expected = 'success', sourceId = target === 'source' ? 'target' : 'source') {
      f.test.openTransferModal(sourceId); await tick();
      for (let i = 0; !f.test.dialog?.preview && i < 1000; i++) await tick();
      assert(f.test.dialog?.preview, 'actual authoritative preview is ready: ' + f.test.dialog?.previewError);
      const entry = f.test.dialog.preview.modules.find(row => row.moduleId === moduleId); assert.equal(entry.items.length, 1, moduleId + ' stable source reference'); assert(entry.items[0].selectable);
      if(!entry.items[0].effectiveReference){
        const key=moduleId==='ipqc-c'?'ipqcC':moduleId==='ipqc-ab'?'ipqcAB':moduleId;
        const extra=f.host.querySelector('[data-transfer-extra="'+key+'"]');assert(extra && !extra.open);
        extra.open=true;
        const checkbox=extra.querySelector('[data-transfer-check]');assert(!checkbox.checked);
        checkbox.checked=true;checkbox.onchange();
      }
      f.test.dialog.targetEqId = target;
      await f.test.executeTransfer(moduleId === 'ipqc-c' ? 'ipqcC' : moduleId === 'ipqc-ab' ? 'ipqcAB' : moduleId);
      const key = moduleId === 'ipqc-c' ? 'ipqcC' : moduleId === 'ipqc-ab' ? 'ipqcAB' : moduleId;
      assert.equal(f.test.dialog.moduleStatus[key], expected === 'success' ? 'success' : 'error', f.test.dialog.moduleMessages[key]); assert.match(f.test.dialog.moduleMessages[key], expected === 'unknown' ? /尚未確認/ : expected === 'rechecked' ? /尚未移轉/ : /已移轉並存取|無需重存/);
      f.close();
    }
    const saveQuery = moduleId => moduleId === 'ipqc-ab' ? '&module=1' : '';
    const savedItem = (moduleId, saved) => (moduleId === 'ipqc-ab' ? saved.content.scopes['A:G-A'] : saved.content).items[0];
    async function restoreInDestination(moduleId){
      const src=h.flow(await fullRead(moduleId,stateQ(moduleId))).working.items[0];
      const desired={equipmentId:'source',...(moduleId==='fqc'?{tool:'01'}:{} )};
      const patches=Object.entries(desired).map(([k,value])=>({op:'set',path:['items',{id:src.id},k],value}));
      await h.command(moduleId,'apply',{patches,guards:patches.map(p=>({path:p.path,value:src[p.path[2]]}))},'editor',200,stateQ(moduleId));
    }
    async function manualSave(moduleId, equipmentId) {
      const start = performance.now(), q = saveQuery(moduleId);
      // This is an explicit destination Save action, never part of executeTransfer.
      // AB's existing UI uses whole-module Begin/Save, not an individual scope Save.
      if (moduleId === 'ipqc-ab') await h.begin(moduleId, 'editor', 200, q);
      const before = json(h.flow(await fullRead(moduleId, q)));
      const result = await h.command(moduleId, 'save', {}, 'editor', 200, q);
      const saved = json(h.flow(result).saved), reread = h.flow(await fullRead(moduleId, q));
      assert.equal(savedItem(moduleId, saved).equipmentId, equipmentId);
      assert.deepEqual(reread.saved, saved, 'fresh authoritative read preserves explicit saved snapshot');
      if (moduleId === 'ipqc-c') { const metadata = h.flow(await h.read(moduleId)).saved; assert.equal(metadata.id, saved.id); assert.equal(metadata.revision, saved.revision); }
      assert.deepEqual(reread.active, before.active); assert.deepEqual(reread.cases, before.cases);
      operationTimings.push({ moduleId, operation: 'explicit destination Save plus fixture verification reads', includes: moduleId === 'ipqc-ab' ? 'whole-module Begin, pre-save reads, Save, fresh verification read' : 'pre-save reads, Save, fresh verification read', isolatedHandlerMs: +(performance.now() - start).toFixed(2) });
      return saved;
    }
    for (const moduleId of ['fqc', 'iqc', 'ipqc-c', 'ipqc-ab']) await check(moduleId + ' identified Begin recovers only its own receipt; explicit replacement saves atomically'+'; original formal/history remains immutable', async () => {
      const q = stateQ(moduleId), before = json(h.flow(await fullRead(moduleId, q))), original = before.active.content.items[0];
      assert(!(await fullRead(moduleId, q)).control.versions.some(version => version.status === 'draft'));
      // Unknown outcomes run in a separate private fixture; its marker is never
      // deleted to let the unrelated normal lifecycle continue.
      const lostH=await fixture((await h.core.readState()).values,{includeIPQCC:true});
      for(const [key,bytes]of h.objects)lostH.objects.set(key,Buffer.from(bytes));
      try {
        const lostUI=await connect(lostH),rawFetch=lostUI.c.fetch;let lost=false;
        lostUI.c.fetch=async(url,options={})=>{const body=options.body&&JSON.parse(options.body),response=await rawFetch(url,options);if(!lost&&String(url).startsWith('/api/'+moduleId+'/workflow')&&body?.action==='begin-v1'){lost=true;assert.equal(response.status,200);throw Object.assign(Error('signal is aborted without reason'),{name:'AbortError'});}return response;};
        // Exercise the separate native Begin receipt path on an independent unopened fixture.
        const endpoint=moduleId==='ipqc-ab'?'/api/ipqc-ab/workflow?module=1&caseMetadata=1':'/api/'+moduleId+'/workflow?caseMetadata=1';
        const client=lostUI.c.createSharedDraftClient({endpoint,actorId:lostUI.c.ProcessSync.identity.id,durableBegin:true,...(moduleId==='ipqc-ab'?{externalDurableBounded:{scope:'IPQC-AB'}}:{}),headers:()=>lostUI.c.ProcessSync.platformHeaders()});
        await assert.rejects(client.begin());assert(lost);assert.equal(lostUI.posts().length,1);assert(client.hasUnknownBegin());
        const originalBegin=lostUI.requests.find(r=>r.action==='begin-v1');
        const resolved=await client.resolveUnknown();assert.equal(resolved.operationKind,'begin-v1');assert(resolved.receipt.operationId);
        assert(originalBegin);assert(!client.hasUnknownBegin());assert.equal(lostUI.posts().length,1);
        const afterLost=lostH.flow(moduleId==='ipqc-c'?{control:JSON.parse((await lostH.core.readState()).values.ipqcCMasterControl)}:await lostH.read(moduleId,'editor',q));assert.equal(afterLost.working.items[0].equipmentId,'source');assert.deepEqual(afterLost.saved,before.saved);assert.deepEqual(afterLost.active,before.active);assert.deepEqual(afterLost.cases,before.cases);
      } finally {lostH.close();}
      const closedRevision=h.snapshot().row.revision;
      await runTransfer(moduleId, 'target'); assert.equal(h.snapshot().row.revision,closedRevision+1); let after = h.flow(await fullRead(moduleId, q)); assert.equal(after.working.items[0].equipmentId, 'target');
      assert.deepEqual(after.active, before.active);const transferredSave=h.flow(await fullRead(moduleId,saveQuery(moduleId))).saved;assert(transferredSave?.id);assert.equal(savedItem(moduleId,transferredSave).equipmentId,'target');assert.deepEqual(after.cases,before.cases);
      const unrelated = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['equipmentId', 'equipmentSnapshot', 'inspectionMode', 'tool'].includes(key)));
      assert.deepEqual(unrelated(after.working.items[0]), unrelated(original));
      const firstSaved = transferredSave, savedObjects = new Map(h.objects);
      const savesBeforeTransfer = f.requests.filter(row => row.method==='POST'&&row.action === 'save').length;
      const beginsBeforeTransfer = f.requests.filter(row => row.path === '/api/' + moduleId + '/workflow' && row.action === 'begin').length;
      await runTransfer(moduleId, 'source'); after = h.flow(await fullRead(moduleId, q)); assert.equal(after.working.items[0].equipmentId, 'source');
      assert.equal(f.requests.filter(row => row.method==='POST'&&row.action === 'save').length, savesBeforeTransfer+1, 'Each explicit transfer persists the selected module draft');
      assert.equal(f.requests.filter(row => row.path === '/api/' + moduleId + '/workflow' && row.action === 'begin').length, beginsBeforeTransfer, 'existing editable draft transfer must not add Begin');
      assert.deepEqual(after.active, before.active); assert.deepEqual(after.cases, before.cases);
      const stillSaved = h.flow(await fullRead(moduleId, saveQuery(moduleId))).saved;
      assert.notEqual(stillSaved.id,firstSaved.id);assert.equal(savedItem(moduleId,stillSaved).equipmentId,'source');assert.equal(savedItem(moduleId,firstSaved).equipmentId,'target');
      const secondSaved = await manualSave(moduleId, 'source'); assert.notEqual(secondSaved.id, firstSaved.id);
      for (const [key, bytes] of savedObjects) assert(h.objects.get(key)?.equals(bytes), 'later save keeps all previously stored object bytes');
    });
    for(const moduleId of ['fqc','iqc','ipqc-ab','ipqc-c'])await check(moduleId+' concurrent manual choice is never silently overwritten',async()=>{
      // This fixture has independent sessions backed by the same synthetic DB.
      const peer=await require('./equipment-transfer-fixture.cjs').createTransferFixture();
      try{
        const scope=stateQ(moduleId),q=saveQuery(moduleId),key=moduleId==='ipqc-c'?'ipqcC':moduleId==='ipqc-ab'?'ipqcAB':moduleId;
        const locked=(await peer.preview('reviewer')).modules.find(m=>m.moduleId===moduleId);
        assert(locked.items.every(row=>!row.selectable && row.unavailableReason),'read-only reviewer cannot transfer');
        await peer.begin(moduleId,'editor',200,scope);if(moduleId==='ipqc-ab')await peer.begin(moduleId,'editor',200,q);
        const source=await connect(peer);
        const open=async()=>{source.test.openTransferModal('source');while(!source.test.dialog?.preview)await tick();source.test.dialog.targetEqId='target';};
        await open();
        const original=(await peer.preview()).modules.find(m=>m.moduleId===moduleId).items[0],rowId=original.itemId;
        const edit=async(fields)=>{
          const raw=moduleId==='ipqc-c'?{control:JSON.parse((await peer.core.readState()).values.ipqcCMasterControl)}:await peer.read(moduleId,'editor',scope);
          const current=peer.flow(raw).working.items.find(item=>item.id===rowId);
          const patches=Object.entries(fields).map(([field,value])=>({op:'set',path:['items',{id:rowId},field],value})),guards=patches.map(p=>({path:p.path,value:current[p.path[2]]}));
          await peer.command(moduleId,'apply',{patches,guards},'editor',200,scope);
        };
        const note=moduleId==='ipqc-ab'?'standard':moduleId==='iqc'?'nameVi':'description';
        const manual=(moduleId==='ipqc-ab'||moduleId==='iqc')?{inspectionMode:'visual',equipmentId:''}:{equipmentId:''};
        await edit({...manual,[note]:'Peer unrelated change'});
        await source.test.executeTransfer(key);
        assert.equal(source.posts().length,0);assert.match(source.test.dialog.moduleMessages[key],/資料修訂已變更/);
        assert((await peer.preview()).modules.find(m=>m.moduleId===moduleId).items.some(row=>row.draftEquipmentId===''));
        source.close();await open();const prompts=[];source.c.confirm=t=>{prompts.push(t);return false;};
        await source.test.executeTransfer(key);assert.equal(source.posts().length,0);
        assert(prompts.some(t=>t.includes('取消可保留目前設定')&&t.includes(moduleId==='iqc'||moduleId==='ipqc-ab'?'目視':'已清空檢具')));
        source.c.confirm=()=>true;await source.test.executeTransfer(key);assert.equal(source.test.dialog.moduleStatus[key],'success',source.test.dialog.moduleMessages[key]);
        const data=moduleId==='ipqc-c'?{control:JSON.parse((await peer.core.readState()).values.ipqcCMasterControl)}:await peer.read(moduleId,'editor',q);
        const saved=peer.flow(data).saved,item=savedItem(moduleId,saved);assert(saved.id);assert.equal(item.equipmentId,'target');assert.equal(item[note],'Peer unrelated change');
        while(source.test.dialog?.refreshing)await tick();source.close();await open();
        const count=source.posts().length;await source.test.executeTransfer(key);assert.equal(source.posts().length,count,'matching successful Save is not reissued');assert.match(source.test.dialog.moduleMessages[key],/已相同 1/);
        while(source.test.dialog?.refreshing)await tick();source.close();await open();
        const lastSaved=peer.flow(data).saved.id;
        await edit(manual);source.close();await open();
        const send=source.c.fetch;let raced=false;
        source.c.fetch=async(url,opts={})=>{
          const command=opts.body&&JSON.parse(opts.body).command;
          if(!raced&&command?.action==='save'){raced=true;await edit({equipmentId:'source',...(['iqc','ipqc-ab'].includes(moduleId)?{inspectionMode:'equipment'}:{})});}
          return send(url,opts);
        };
        await source.test.executeTransfer(key);assert(raced);assert.equal(source.test.dialog.moduleStatus[key],'error');assert(!source.test.dialog.moduleMessages[key].includes('已移轉並存取'));
        const latest=(await peer.preview()).modules.find(m=>m.moduleId===moduleId).items[0];
        assert.equal(latest.draftEquipmentId,'source');assert.equal(latest.savedChoice.id,lastSaved);
        source.close();
      }finally{peer.close();}
    });
    async function storedWorkflow(moduleId) {
      const values = (await h.core.readState()).values;
      if (moduleId === 'fqc') return JSON.parse(values.qualityMasterControl).libraries.fqc.workflow;
      if (moduleId === 'ipqc-ab') return JSON.parse(values.ipqcABMasterControl).moduleDraft.workflow;
      return JSON.parse(values[moduleId === 'iqc' ? 'iqcMasterControl' : 'ipqcCMasterControl']).workflow;
    }
    for (const moduleId of ['fqc', 'iqc', 'ipqc-c', 'ipqc-ab']) await check(moduleId + ' destination Save lost ACK uses actual receipt; unavailable receipt keeps UNKNOWN and never re-POSTs Save', async () => {
      const q = saveQuery(moduleId), endpoint = moduleId === 'ipqc-ab' ? '/api/ipqc-ab/workflow?module=1&caseMetadata=1' : `/api/${moduleId}/workflow?caseMetadata=1`;
      const client = f.c.createSharedDraftClient({ endpoint, actorId: f.c.ProcessSync.identity.id, headers: () => f.c.ProcessSync.platformHeaders() });
      for (const unavailable of [false, true]) {
        const expectedEquipmentId = unavailable ? 'source' : 'target';
        if(!unavailable)await runTransfer(moduleId,expectedEquipmentId);
        else{
          // The preceding ordinary Save invalidates the transfer's undo proof.
          // A deliberate change back must use the group's normal workflow.
          await restoreInDestination(moduleId);
        }
        const peerQ=stateQ(moduleId),peer=h.flow(await fullRead(moduleId,peerQ)),row=peer.working.items[0],field=moduleId==='iqc'?'nameVi':moduleId==='ipqc-ab'?'standard':'description';
        await h.command(moduleId,'apply',{patches:[{op:'set',path:['items',{id:row.id},field],value:'Explicit destination correction '+unavailable}],guards:[{path:['items',{id:row.id},field],value:row[field]}]},'editor',200,peerQ);
        const oldSaveHistory = json((await storedWorkflow(moduleId)).saves), oldSaveObjects = new Map(h.objects);
        const before = await h.read(moduleId, 'editor', q), flow = h.flow(before), previous = json(h.flow(await fullRead(moduleId, q)));
        const rawFetch = f.c.fetch; let posts = 0, receiptReads = 0, loseAck = true, blockReceipt = unavailable;
        f.c.fetch = async (url, options = {}) => {
          const parsed = new URL(url, 'http://fixture'), body = options.body && JSON.parse(options.body);
          const ownEndpoint = parsed.pathname === `/api/${moduleId}/workflow` && (moduleId !== 'ipqc-ab' || parsed.searchParams.get('module') === '1');
          if (ownEndpoint && parsed.searchParams.has('operationId')) { receiptReads++; if (blockReceipt) return Response.json({ error: 'SYNTHETIC_RECEIPT_UNAVAILABLE' }, { status: 503 }); }
          if (ownEndpoint && body?.command?.action === 'save') {
            posts++; const response = await rawFetch(url, options); assert.equal(response.status, 200);
            if (loseAck) { loseAck = false; throw Object.assign(Error('signal is aborted without reason'), { name: 'AbortError' }); }
            return response;
          }
          return rawFetch(url, options);
        };
        try {
          await client.flush();
          const detail = { expectedRevision: flow.revision, input: { stateRevision: before.revision } };
          let result;
          if (unavailable) {
            await assert.rejects(client.command(flow.generation, 'save', detail), /RESULT_UNKNOWN_CHECK_BEFORE_RETRY/);
            assert(client.hasUnknown()); assert.equal(posts, 1); assert.equal(receiptReads, 1);
            await assert.rejects(client.command(flow.generation, 'save', detail), /PREVIOUS_OPERATION_UNKNOWN/);
            assert.equal(posts, 1, 'attempted duplicate Save must be stopped before transport');
            blockReceipt = false; result = await client.resolveUnknown();
            assert.equal(receiptReads, 2, 'only explicit GET may settle the unresolved command');
          } else {
            result = await client.command(flow.generation, 'save', detail);
            assert(result.recovered); assert.equal(receiptReads, 1);
          }
          assert.equal(posts, 1); assert.equal(client.hasUnknown(), false);
          const current = h.flow(await fullRead(moduleId, q));
          assert.equal(result.receipt.unchanged, false, 'lost ACK must follow a newly committed saved snapshot, not no-change Save');
          assert.equal(current.saved.id, result.receipt.savedId); assert.notEqual(current.saved.id, previous.saved.id);
          assert.deepEqual(current.active, previous.active); assert.deepEqual(current.cases, previous.cases);
          assert.equal(savedItem(moduleId, current.saved).equipmentId, expectedEquipmentId);
          const nextSaveHistory = (await storedWorkflow(moduleId)).saves;
          assert.equal(nextSaveHistory.length, oldSaveHistory.length + 1);
          assert.deepEqual(nextSaveHistory.slice(0, -1), oldSaveHistory, 'previous immutable saved snapshots remain unchanged');
          for (const [key, bytes] of oldSaveObjects) assert(h.objects.get(key)?.equals(bytes), 'lost ACK cannot rewrite prior object bytes');
        } finally { f.c.fetch = rawFetch; }
      }
    });
    assert.equal((await h.core.readState()).values.routineEquipmentControl, equipmentBefore, 'all preceding transfer/save tests preserve equipment source');
    await check('two new draft tools require independent approval before four-module transfer; effective/history deletion remains blocked', async () => {
      const equipmentOriginal = json(h.flow(await h.read('routine-equipment'))), priorObjects = new Map(h.objects);
      await f.test.read(); assert(await f.test.writeShared('begin'));
      for (const [index,id] of ['new-one','new-two'].entries()) f.test.working.equipment.push({ id, assetCode: 'SYN-SECOND-' + index, name: 'Second fixture ' + id, groupId: 'group', unit: '支', enabled: true, confirmed: true, calibrationMethod: 'none', calibratedAt: '', expiresAt: '' });
      assert(await f.test.writeShared('apply'));
      f.test.openTransferModal('source'); await tick(); for(let i=0;!f.test.dialog?.preview&&i<1000;i++)await tick(); assert(f.test.dialog?.preview);
      const writesBefore = f.posts().length, beforeRefused = h.snapshot(); f.test.dialog.targetEqId = 'new-one';
      for(const key of ['fqc','iqc','ipqcC','ipqcAB']) { await f.test.executeTransfer(key); assert.equal(f.test.dialog.moduleStatus[key], 'idle'); assert.match(f.test.dialog.moduleMessages[key], /目前生效且啟用的目標設備/); }
      assert.equal(f.posts().length, writesBefore, 'unapproved target sends no Begin or Apply'); assert.deepEqual(h.snapshot(), beforeRefused); f.close();
      // Separate explicit fixture Save/Submit/independent reviewer Approve, never auto-approval inside transfer.
      assert(await f.test.writeShared('save'));await h.promote('routine-equipment'); await f.test.read();
      for(const moduleId of ['fqc','iqc','ipqc-c','ipqc-ab']) {
        const initial = json(h.flow(await fullRead(moduleId, stateQ(moduleId))));
        await runTransfer(moduleId, 'new-one', 'success', 'source'); await manualSave(moduleId, 'new-one');
        await runTransfer(moduleId, 'new-two', 'success', 'new-one'); await manualSave(moduleId, 'new-two');
        const final = h.flow(await fullRead(moduleId, stateQ(moduleId))); assert.equal(final.working.items[0].equipmentId, 'new-two');
        assert.deepEqual(final.active, initial.active); assert.deepEqual(final.cases, initial.cases);
        // This ordinary Save follows another write. Restore through the native module.
        await restoreInDestination(moduleId); await manualSave(moduleId, 'source');
      }
      await f.test.read(); assert(await f.test.writeShared('begin'));
      const beforeDelete = h.snapshot(), postCount = f.posts().length; await f.test.deleteEquipment('new-one');
      assert.equal(f.posts().length, postCount); assert.deepEqual(h.snapshot(), beforeDelete); assert.match(f.test.message, /已生效或來源檢具不可刪除/);
      const finalEquipment = h.flow(await h.read('routine-equipment'));
      assert(finalEquipment.active.content.equipment.some(row=>row.id==='new-one')); assert(finalEquipment.active.content.equipment.some(row=>row.id==='new-two'));
      assert(finalEquipment.cases.some(row=>row.id===equipmentOriginal.active.id&&row.status==='approved'));
      for(const [key,bytes] of priorObjects)assert(h.objects.get(key)?.equals(bytes),'new fixture lifecycle preserves original snapshots/photos');
    });
    const previewFor = sourceId => h.call('quality-equipment-replacement', 'GET', undefined, 'editor', 200, '?sourceId=' + encodeURIComponent(sourceId));
    for (const moduleId of ['fqc','iqc','ipqc-c','ipqc-ab']) await check(moduleId + ' transferred draft Submit/Return/rework/Save/Resubmit/Approve changes formal references only at approval', async () => {
      const q = saveQuery(moduleId), original = json(h.flow(await fullRead(moduleId, q))), objects = new Map(h.objects);
      await runTransfer(moduleId, 'new-two', 'success', 'source'); const firstSaved = await manualSave(moduleId, 'new-two');
      const submitted = await h.command(moduleId, 'submit', { savedId: firstSaved.id, reason: 'Synthetic transferred standard review' }, 'editor', 200, q);
      const firstCaseId = submitted.receipt.caseId; assert(firstCaseId);
      assert.deepEqual(h.flow(await fullRead(moduleId, q)).active, original.active, 'pending standard never replaces formal');
      await h.command(moduleId, 'return', { caseId: firstCaseId, reason: 'Synthetic correction requested' }, 'reviewer', 200, q);
      const returned = h.flow(await fullRead(moduleId, q)); assert.equal(returned.pendingId, null); assert.deepEqual(returned.active, original.active); assert.deepEqual(returned.saved, firstSaved);
      // A real correction, not a no-change resubmission: choose the other approved new tool.
      const oldSaves = json((await storedWorkflow(moduleId)).saves);
      await runTransfer(moduleId, 'new-one', 'success', 'new-two'); const revised = await manualSave(moduleId, 'new-one');
      assert.notEqual(revised.id, firstSaved.id); assert.equal(savedItem(moduleId, revised).equipmentId, 'new-one');
      const nextSaves=(await storedWorkflow(moduleId)).saves; assert.equal(nextSaves.length,oldSaves.length+1); assert.deepEqual(nextSaves.slice(0,-1),oldSaves);
      const resubmitted = await h.command(moduleId, 'submit', { savedId: revised.id, reason: 'Synthetic revised standard' }, 'editor', 200, q);
      assert.notEqual(resubmitted.receipt.caseId, firstCaseId); assert.deepEqual(h.flow(await fullRead(moduleId, q)).active, original.active);
      const priorCase = (await storedWorkflow(moduleId)).cases.find(row => row.id === firstCaseId);
      assert.equal(priorCase.status, 'returned'); assert.deepEqual(priorCase.content, firstSaved.content, 'returned snapshot must not be rewritten by correction');
      await h.command(moduleId, 'approve', { caseId: resubmitted.receipt.caseId }, 'reviewer', 200, q);
      const approved = h.flow(await fullRead(moduleId, q)); assert.equal(approved.active.id, resubmitted.receipt.caseId); assert.equal(savedItem(moduleId, approved.active).equipmentId, 'new-one');
      const entry = (await previewFor('new-one')).modules.find(row => row.moduleId === moduleId); assert.equal(entry.items.length, 1); assert.equal(entry.items[0].activeEquipmentId, 'new-one');
      for(const [key,bytes] of objects)assert(h.objects.get(key)?.equals(bytes), 'rework and approval retain all prior immutable objects');
    });
    await check('used tool cannot be disabled while formal references remain; normal four-module transfer and approval remove those references', async () => {
      await f.test.read(); f.test.working.equipment.find(row => row.id === 'new-one').enabled = false;
      assert(await f.test.writeShared('apply')); assert(await f.test.writeShared('save'));
      const disabledSaved = h.flow(await h.read('routine-equipment')).saved, before = h.snapshot();
      const refusal = await h.command('routine-equipment', 'submit', { savedId: disabledSaved.id, reason: 'Synthetic referenced tool disable must be refused' }, 'editor', 422);
      assert.equal(refusal.error, 'VALIDATION_FAILED'); assert(refusal.details.issues.some(issue => issue.message === 'EQUIPMENT_STILL_REFERENCED')); assert.deepEqual(h.snapshot(), before);
      assert.equal(h.flow(await h.read('routine-equipment')).active.content.equipment.find(row => row.id === 'new-one').enabled, true);
      f.test.working.equipment.find(row => row.id === 'new-one').enabled = true; assert(await f.test.writeShared('apply')); assert(await f.test.writeShared('save'));
      for(const moduleId of ['fqc','iqc','ipqc-c','ipqc-ab']) {
        const q=saveQuery(moduleId), original=json(h.flow(await fullRead(moduleId,q)).active);
        assert(!(await fullRead(moduleId,stateQ(moduleId))).control.versions.some(version=>version.status==='draft'),'new approved-tool transfer starts with no destination draft');
        const beginCount=f.requests.filter(row=>row.path==='/api/'+moduleId+'/workflow'&&['begin','begin-v1'].includes(row.action)).length;
        await h.begin(moduleId,'editor',200,stateQ(moduleId));if(moduleId==='ipqc-ab')await h.begin(moduleId,'editor',200,q);
        await runTransfer(moduleId, 'new-two', 'success', 'new-one');
        assert.equal(f.requests.filter(row=>row.path==='/api/'+moduleId+'/workflow'&&['begin','begin-v1'].includes(row.action)).length,beginCount,'replacement leaves Begin to the destination module');
        const saved=await manualSave(moduleId,'new-two');
        const submitted=await h.command(moduleId,'submit',{savedId:saved.id,reason:'Synthetic move references before disabling used tool'},'editor',200,q);
        assert.deepEqual(h.flow(await fullRead(moduleId,q)).active,original);
        await h.command(moduleId,'approve',{caseId:submitted.receipt.caseId},'reviewer',200,q);
        assert.equal(savedItem(moduleId,h.flow(await fullRead(moduleId,q)).active).equipmentId,'new-two');
      }
      const empty=(await previewFor('new-one')).modules; assert.equal(empty.length,4); assert(empty.every(module=>module.items.length===0));
      const referenced=(await previewFor('new-two')).modules; assert.equal(referenced.length,4); assert(referenced.every(module=>module.items.length===1&&module.items[0].activeEquipmentId==='new-two'));
    });
    await check('used tool disable Save/Submit/Return/edit/Save/Resubmit/Approve preserves record and history, with consistent reverse references', async () => {
      await f.test.read(); const original=json(h.flow(await h.read('routine-equipment'))), objects=new Map(h.objects);
      const storedBefore=json(JSON.parse((await h.core.readState()).values.routineEquipmentControl).workflow), originalTool=json(original.active.content.equipment.find(row=>row.id==='new-one'));
      f.test.working.equipment.find(row=>row.id==='new-one').enabled=false; assert(await f.test.writeShared('apply')); assert(await f.test.writeShared('save'));
      const saved=h.flow(await h.read('routine-equipment')).saved, submitted=await f.test.writeShared('submit'); assert(submitted?.receipt?.caseId);
      assert.deepEqual(h.flow(await h.read('routine-equipment')).active,original.active);
      await f.setActor('reviewer'); await f.test.read(); assert(await f.test.writeShared('reject',{versionId:submitted.receipt.caseId}));
      await f.setActor('editor'); await f.test.read(); const oldSaves=json(JSON.parse((await h.core.readState()).values.routineEquipmentControl).workflow.saves); f.test.working.equipment.find(row=>row.id==='new-one').notes='Stopped after references moved; reviewer correction';
      assert(await f.test.writeShared('apply')); assert(await f.test.writeShared('save')); const revised=h.flow(await h.read('routine-equipment')).saved; assert.notEqual(revised.id,saved.id);
      const nextSaves=JSON.parse((await h.core.readState()).values.routineEquipmentControl).workflow.saves; assert.equal(nextSaves.length,oldSaves.length+1); assert.deepEqual(nextSaves.slice(0,-1),oldSaves);
      const second=await f.test.writeShared('submit'); assert(second?.receipt?.caseId); assert.notEqual(second.receipt.caseId,submitted.receipt.caseId); assert.deepEqual(h.flow(await h.read('routine-equipment')).active,original.active);
      await f.setActor('reviewer'); await f.test.read(); assert(await f.test.writeShared('approve',{versionId:second.receipt.caseId}));
      await f.setActor('editor'); await f.test.read(); const final=h.flow(await h.read('routine-equipment')), stopped=final.active.content.equipment.find(row=>row.id==='new-one');
      assert(stopped); assert.equal(stopped.enabled,false); assert.equal(stopped.notes,'Stopped after references moved; reviewer correction');
      const retainedFields=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['enabled','notes'].includes(key))); assert.deepEqual(retainedFields(stopped),retainedFields(originalTool));
      const storedAfter=JSON.parse((await h.core.readState()).values.routineEquipmentControl).workflow;
      assert.deepEqual(storedAfter.cases.slice(0,storedBefore.cases.length),storedBefore.cases,'all previous equipment case records remain unchanged');
      assert.deepEqual(storedAfter.saves.slice(0,storedBefore.saves.length),storedBefore.saves,'all previous equipment saved records remain unchanged');
      assert.deepEqual(storedAfter.cases.find(row=>row.id===submitted.receipt.caseId).content,saved.content); assert.deepEqual(storedAfter.cases.find(row=>row.id===second.receipt.caseId).content,revised.content);
      assert(final.cases.some(row=>row.id===submitted.receipt.caseId&&row.status==='returned')); assert(final.cases.some(row=>row.id===original.active.id&&row.status==='approved'));
      const refs=(await previewFor('new-one')).modules; assert.equal(refs.length,4); assert(refs.every(module=>module.items.length===0));
      for(const [key,bytes] of objects)assert(h.objects.get(key)?.equals(bytes),'disable does not delete old records or object bytes');
    });
    await check('actual pending scope remains unavailable and stale confirmed selection sends no POST', async () => {
      await h.begin('fqc');
      await runTransfer('fqc', 'target', 'success', 'new-two'); const saved = h.flow(await h.command('fqc', 'save')).saved;
      f.test.openTransferModal('new-two'); await tick(); for (let i = 0; !f.test.dialog?.preview && i < 1000; i++) await tick(); assert(f.test.dialog?.preview);
      f.test.dialog.targetEqId = 'target'; const submitted = await h.command('fqc', 'submit', { savedId: saved.id, reason: 'Synthetic pending race' });
      const before = h.snapshot(), posts = f.posts().length; await f.test.executeTransfer('fqc'); assert.equal(f.posts().length, posts); assert.deepEqual(h.snapshot(), before);
      const entry = (await previewFor('new-two')).modules.find(row => row.moduleId === 'fqc'); assert.equal(entry.items.length,1); assert(entry.items.every(row => !row.selectable)); assert.equal(h.flow(await h.read('fqc')).pendingId, submitted.receipt.caseId);
    });
    for (const [key, bytes] of oldObjects) assert(h.objects.get(key)?.equals(bytes));
    console.log(JSON.stringify({ status: 'PASS_FOUR_MODULE_ACTUAL_TRANSFER', groups: results.length, results, operationTimings, uiRequests: f.requests, sourceHandlerInvocations: h.trace.length, limits: ['Actual UI/controller/shared client and actual routes with normal-approved synthetic producers in private SQLite/R2; no browser or live system', 'All four transfers explicitly save one shared draft. No transfer rewrites source equipment, active standards or history. Explicit separate fixture creation/approval adds two tools; saved snapshots remain immutable. Approved targets cannot be deleted even after references are moved', 'Destination Save uses actual authorized routes, not destination page UI controls; AB uses whole-module Save. C public GET confirms saved id/revision; full saved content is independently verified through core.readState', 'Fixtures exercise one standard per module and one AB scope; multi-scope partial error is separately covered in synthetic UI tests', 'Timings are local isolated handler plus synthetic DOM durations, not native page-load/render or hosted latency'] }));
  } finally { h.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
