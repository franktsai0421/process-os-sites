/* Isolated API flow; this fixture must never point at the user's port-3000 Local DB. */
const assert = require('node:assert/strict');
const url = 'http://127.0.0.1:3002';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');

(async () => {
  const login = await fetch(`${url}/api/platform-login`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({demoRole:'admin'})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={'Content-Type':'application/json',Cookie:cookie};
  const read=async()=>{
    const response=await fetch(`${url}/api/ipqc-ab`,{headers});
    assert.equal(response.status,200);
    return response.json();
  };
  let state=await read();
  assert.equal(state.control.source.importedRelations,194);
  assert.equal(Object.values(state.control.scopes).flatMap(s=>s.versions[0].snapshot.items).length,61);
  const imported=state.control.scopes['A:BORUAXE1021'];
  assert.equal(imported.versions[0].status,'draft');
  assert.equal(imported.activeVersionId,null);
  async function post(line,group,action,details={},expected=200) {
    const current=await read(), scope=current.control.scopes[`${line}:${group}`];
    const opened=scope?.versions.find(v=>['draft','pending','pending-test'].includes(v.status));
    const response=await fetch(`${url}/api/ipqc-ab`,{method:'POST',headers,
      body:JSON.stringify({action,baseRevision:current.revision,line,group,
        versionId:opened?.id,versionRevision:opened?.revision,...details})});
    const body=await response.json();
    assert.equal(response.status,expected,`${action}: ${JSON.stringify(body)}`);
    return body;
  }
  const group=state.catalog.groups.find(g=>!state.control.scopes[`${g.line}:${g.name}`] &&
    state.catalog.products.some(p=>p.line===g.line && p.category===g.name));
  assert.ok(group,'Empty master category is available for isolated fixture');
  const stage=state.catalog.stages.find(s=>s.line===group.line && state.catalog.products.some(p=>
    p.line===group.line&&p.category===group.name&&p.stages.includes(s.code)));
  assert.ok(stage);
  await post(group.line,group.name,'begin');
  await post(group.line,group.name,'create-error',{stageCode:stage.code,name:'Kiểm tra thử'});
  state=await read();
  let scope=state.control.scopes[`${group.line}:${group.name}`];
  const error=scope.versions.at(-1).snapshot.errors[0];
  await post(group.line,group.name,'create-item',{errorId:error.id});
  state=await read();scope=state.control.scopes[`${group.line}:${group.name}`];
  let version=scope.versions.at(-1),snapshot=structuredClone(version.snapshot);
  const item=snapshot.items[0];
  const photo=await fetch(`${url}/api/ipqc-ab/photo`,{method:'PUT',headers:{Cookie:cookie,'Content-Type':'image/png'},body:image});
  assert.equal(photo.status,200);
  const uploaded=await photo.json();
  item.standard='Tiêu chuẩn kiểm tra thử';item.methodText='Quan sát bằng mắt';
  item.rules=[{id:'fixture-rule',cadence:'batch',kind:'custom',name:'Số mẫu',value:'3 hoặc toàn bộ'}];
  item.standardPhotos=[{id:uploaded.id,name:'fixture.png',note:'Ảnh thử'}];
  item.productCodes=state.catalog.products.filter(p=>p.line===group.line&&p.category===group.name&&p.stages.includes(stage.code)).map(p=>p.code);
  assert.ok(item.productCodes.length>0);
  await post(group.line,group.name,'save',{snapshot});
  state=await read();scope=state.control.scopes[`${group.line}:${group.name}`];
  version=scope.versions.at(-1);
  assert.equal(version.snapshot.items[0].standardPhotos[0].id,uploaded.id);
  assert.equal(version.snapshot.items[0].rules[0].value,'3 hoặc toàn bộ');
  const downloaded=await fetch(`${url}/api/ipqc-ab/photo?id=${uploaded.id}`,{headers:{Cookie:cookie}});
  assert.equal(downloaded.status,200);
  assert.equal((await downloaded.arrayBuffer()).byteLength,image.length);
  // A changed effective candidate in the same error is covered; direct submit saves the latest snapshot.
  snapshot=structuredClone(version.snapshot);snapshot.items[0].methodText='Kiểm tra trực quan cuối cùng';
  await post(group.line,group.name,'submit',{snapshot,reason:'Isolated formal workflow fixture'});
  state=await read();scope=state.control.scopes[`${group.line}:${group.name}`];version=scope.versions.at(-1);
  assert.equal(version.status,'pending');assert.equal(scope.activeVersionId,null);
  await post(group.line,group.name,'approve');
  state=await read();scope=state.control.scopes[`${group.line}:${group.name}`];version=scope.versions.at(-1);
  assert.equal(version.status,'approved');assert.equal(scope.activeVersionId,version.id);
  assert.equal(version.snapshot.items[0].methodText,'Kiểm tra trực quan cuối cùng');
  assert.equal(state.control.scopes['A:BORUAXE1021'].activeVersionId,null);
  console.log(`PASS formal: ${group.line}:${group.name}, save/photo/custom rule/direct submit/approve, other group unaffected`);

  const second=state.catalog.groups.find(g=>!state.control.scopes[`${g.line}:${g.name}`] && g.name!==group.name);
  assert.ok(second);
  await post(second.line,second.name,'begin');
  state=await read();scope=state.control.scopes[`${second.line}:${second.name}`];version=scope.versions[0];
  await post(second.line,second.name,'submit-test',{snapshot:version.snapshot});
  state=await read();scope=state.control.scopes[`${second.line}:${second.name}`];
  assert.equal(scope.versions[0].status,'pending-test');assert.equal(scope.activeVersionId,null);
  await post(second.line,second.name,'approve');
  state=await read();scope=state.control.scopes[`${second.line}:${second.name}`];
  assert.equal(scope.versions[0].status,'tested');assert.equal(scope.activeVersionId,null);
  console.log(`PASS test review: ${second.line}:${second.name}, approval never effective`);

  // A stale global revision must not overwrite a newer value.
  const stale=state.revision;
  const _latest=await read();
  await post(second.line,second.name,'begin');
  const collision=await fetch(`${url}/api/ipqc-ab`,{method:'POST',headers,
    body:JSON.stringify({action:'begin',line:second.line,group:second.name,baseRevision:stale})});
  assert.equal(collision.status,409);
  console.log('PASS revision CAS rejects stale write');
})().catch(error=>{console.error(error);process.exitCode=1;});
