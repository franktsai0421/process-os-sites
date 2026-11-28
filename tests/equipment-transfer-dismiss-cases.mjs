import assert from 'node:assert/strict';

export async function testTransferDismissal({p, m, modal, storage, cmd, operator, peer, field}) {
  const code = {'ipqc-ab':'ipqcAB','ipqc-c':'ipqcC'}[m] || m;
  const boxes = p.locator('[data-transfer-check="' + code + '"]');
  const overlay = p.locator('#routine-transfer-backdrop');
  const source = p.locator('[data-equipment-transfer="source"]');
  const save = p.locator('#routine-confirm-transfer-' + m);
  const top = p.locator('#routine-transfer-close'), footer = p.locator('#routine-transfer-dismiss');
  const within = (promise,label) => Promise.race([promise,new Promise((_,reject)=>{
    const timer=setTimeout(()=>reject(Error('Timed out waiting for '+label)),15000);timer.unref();
  })]);
  const onPhone = await p.evaluate(() => navigator.maxTouchPoints > 0);
  let postCount = 0, getCount = 0, deferredRead, interceptSave;
  const lookup = '**/api/quality-equipment-replacement?**';
  const workflow = '**/api/' + m + '/workflow**';
  const reads = async route => {
    getCount++;
    const hold = deferredRead;
    if (!hold) return route.continue();
    deferredRead = null;
    const response = await route.fetch();
    hold.started();
    await hold.release.promise;
    if (hold.fail) await route.abort();
    else await route.fulfill({response});
    hold.finished();
  };
  const writes = async route => {
    const r = route.request();
    if (r.method() !== 'POST' || r.postDataJSON()?.command?.action !== 'save') return route.continue();
    postCount++;
    if (!interceptSave) return route.continue();
    const gate = interceptSave;
    interceptSave = null;
    gate.started.resolve();
    await gate.release.promise;
    deferredRead = gate.next;
    await route.continue();
  };
  await p.route(lookup, reads);
  await p.route(workflow, writes);
  async function close(button) {
    assert(await button.isEnabled());
    const hit = await button.evaluate(el => {
      const r = el.getBoundingClientRect(), v = visualViewport;
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      return r.width >= 44 && r.height >= 44 && r.top >= v.offsetTop - 1 &&
        r.bottom <= v.offsetTop + v.height + 1 && el.contains(document.elementFromPoint(x,y));
    });
    assert(hit, 'visible touch target in the visual viewport');
    if (onPhone) await button.tap(); else await button.click();
    await overlay.waitFor({state:'detached'});
    await p.requestGC();
  }
  try {
    const initial = await storage(m);
    const keys = initial.formal.snapshot.items.slice(0,2).map(row=>row.id);
    assert.equal(keys.length,2);
    await modal(m,'source','target',keys[0]);
    const preflightStarted=Promise.withResolvers(), preflightFinished=Promise.withResolvers(), releasePreflight=Promise.withResolvers();
    deferredRead={started:preflightStarted.resolve,finished:preflightFinished.resolve,release:releasePreflight};
    await save.click();
    await within(preflightStarted.promise,'preflight reference read');
    await close(top);
    releasePreflight.resolve();
    await within(preflightFinished.promise,'cancelled preflight');
    assert.equal(postCount,0);
    for (const [index,id] of keys.entries()) {
      const action = await modal(m,'source','target',id,true);
      const held = Promise.withResolvers(), finished = Promise.withResolvers(), release = Promise.withResolvers();
      const gate = {started:Promise.withResolvers(),release:Promise.withResolvers(),
        next:{started:held.resolve,finished:finished.resolve,release,fail:index === 1}};
      interceptSave = gate;
      const receipt = action.click();
      await within(gate.started.promise,'outgoing Save');
      assert(await top.isDisabled()); assert(await footer.isDisabled());
      gate.release.resolve();
      await receipt;
      await within(held.promise,'post-save GET');
      console.log('Confirmed receipt with GET held',m,index+1);
      const state = await storage(m);
      assert.equal(postCount,index+1);
      assert.deepEqual(state.formal,initial.formal);
      const savedId = state.module.saved.id;
      assert((await overlay.innerText()).includes(savedId));
      if (onPhone) await p.setViewportSize({width:390,height:index===0?470:660});
      await close(index===0?top:footer);
      if (onPhone) await p.setViewportSize({width:390,height:844});
      const readsBefore = getCount;
      await modal(m,'source','target',id,true);
      assert(getCount>readsBefore);
      const selectedBox=p.locator('[data-transfer-check="'+code+'"]:checked');
      assert.equal(await selectedBox.inputValue(),action.choice);
      assert.match(await selectedBox.locator('xpath=ancestor::div[1]').innerText(),/草稿已存取|Đã lưu bản nháp/);
      assert.equal(await p.locator('#routine-target-eq-select').inputValue(),'target');
      release.resolve();
      await within(finished.promise,'stale read delivery');
      await save.click();
      await p.locator('.routine-transfer-mod-msg').filter({hasText:/無需重存|không cần lưu lại/}).waitFor();
      assert.equal(postCount,index+1);
      assert.deepEqual(await storage(m),state);
      await close(index===0?footer:top);
      await source.waitFor();
      console.log('Closed, reopened, same target unchanged',m,index+1);
    }
    // Confirm an actual third choice with both equipment codes in the prompt.
    const peerField={fqc:'description',iqc:'nameVi','ipqc-ab':'standard','ipqc-c':'description'}[m];
    await field(m,keys[1],peerField,'retain synthetic coworker field');
    const change=await modal(m,'source','alternate',keys[0],true);
    const dialogs=p.listeners('dialog');
    for(const listener of dialogs)p.off('dialog',listener);
    let prompt='';
    p.once('dialog',d=>{prompt=d.message();return d.dismiss();});
    await save.click();
    assert.match(prompt,/SYN-X-1[^\n]*→[^\n]*SYN-X-2/);
    assert.equal(postCount,2);
    for(const listener of dialogs)p.on('dialog',listener);
    const immediate = {promise:Promise.resolve()};
    interceptSave={started:Promise.withResolvers(),release:immediate,next:{started(){},finished(){},release:immediate,fail:true}};
    await change.click();
    await overlay.getByRole('alert').filter({hasText:/關聯更新失敗|lỗi cập nhật tham chiếu/}).waitFor();
    assert.match(await overlay.innerText(),/已移轉並存取草稿|Đã chuyển và lưu bản nháp/);
    assert.equal(postCount,3);
    await close(top);
    const done=await storage(m);
    const savedRows=(done.module.saved.content.scopes?.['A:G-A']||done.module.saved.content).items;
    assert.equal(savedRows.find(row=>row.id===keys[0]).equipmentId,'alternate');
    assert.equal(savedRows.find(row=>row.id===keys[1])[peerField],'retain synthetic coworker field');
    await cmd(peer,m,false,'submit',{savedId:done.module.saved.id,reason:'Synthetic dismissal approval'});
    await source.click(); await boxes.first().waitFor({state:'attached'});
    assert(await boxes.first().isDisabled());
    assert.match(await boxes.first().locator('xpath=ancestor::div[1]').innerText(),/待審|Chờ duyệt/);
    await close(footer);
    const pending=await storage(m);
    await cmd(operator,m,false,'approve',{caseId:pending.module.pendingId});
    await p.locator('[data-equipment-transfer="target"]').click();await boxes.first().waitFor({state:'attached'});
    assert.match(await boxes.first().locator('xpath=ancestor::div[1]').innerText(),/已生效|Đang có hiệu lực/);
    assert.equal(postCount,3);
    await close(top);
    console.log('PASS dismissal',m,'3 saves, explicit third target, same-page reopen, stale/aborted GET, idempotency, pending and approved');
  } finally {
    await p.unroute(lookup,reads); await p.unroute(workflow,writes);
  }
}
