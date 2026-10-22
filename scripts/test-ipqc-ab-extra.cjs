const assert=require('node:assert/strict');
const url='http://127.0.0.1:3002';
async function auth(role){
  const response=await fetch(`${url}/api/platform-login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({demoRole:role})});
  assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];
}
(async()=>{
  const admin=await auth('admin');
  const read=async()=>{const r=await fetch(`${url}/api/ipqc-ab`,{headers:{Cookie:admin}});assert.equal(r.status,200);return r.json()};
  const post=async(line,group,action,detail={},expected=200,cookie=admin)=>{
    const state=await read(),scope=state.control.scopes[`${line}:${group}`],v=scope?.versions.find(v=>['draft','pending','pending-test'].includes(v.status));
    const r=await fetch(`${url}/api/ipqc-ab`,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},
      body:JSON.stringify({action,line,group,baseRevision:state.revision,versionId:v?.id,versionRevision:v?.revision,...detail})});
    const body=await r.json();assert.equal(r.status,expected,`${action}: ${JSON.stringify(body)}`);return body;
  };
  const state=await read(),scope=state.control.scopes['A:BORUAXE1021'],v=scope.versions.find(v=>v.status==='draft');
  assert.ok(v);
  const failed=await post('A','BORUAXE1021','submit',{snapshot:v.snapshot,reason:'Test missing method'},422);
  assert.ok(failed.issues.some(issue=>issue.reason.includes('敘述')));
  assert.equal((await read()).control.scopes['A:BORUAXE1021'].versions[0].status,'draft');
  console.log('PASS imported incomplete standard blocks formal submit without changing draft');

  const line='B',group='VANPHAONHUA';
  let current=await read(),target=current.control.scopes[`${line}:${group}`];
  if (!target.versions.some(v=>v.status==='draft')) await post(line,group,'begin');
  current=await read();target=current.control.scopes[`${line}:${group}`];
  const draft=target.versions.find(v=>v.status==='draft');
  // The prior fixture may contain a draft created before the version-number fix;
  // the next new begin is covered by the corrected backend code.
  const stage=current.catalog.stages.find(s=>s.line===line).code;
  await post(line,group,'create-error',{stageCode:stage,name:'Mã thử số 1'});
  current=await read();target=current.control.scopes[`${line}:${group}`];
  const first=target.versions.find(v=>v.status==='draft').snapshot.errors.at(-1);
  await post(line,group,'delete-error',{id:first.id});
  await post(line,group,'create-error',{stageCode:stage,name:'Mã thử số 2'});
  current=await read();target=current.control.scopes[`${line}:${group}`];
  const second=target.versions.find(v=>v.status==='draft').snapshot.errors.at(-1);
  assert.notEqual(first.code,second.code);
  assert.ok(Number(second.code.match(/L(\d+)$/)[1])>Number(first.code.match(/L(\d+)$/)[1]));
  console.log('PASS deleted error code not reused');

  const operator=await auth('staff');
  const snapshot=target.versions.find(v=>v.status==='draft').snapshot;
  await post(line,group,'submit-test',{snapshot,reason:'Test withdrawal'},200);
  await post(line,group,'approve',{},403,operator);
  await post(line,group,'withdraw');
  current=await read();assert.equal(current.control.scopes[`${line}:${group}`].versions.find(v=>v.status==='draft').id,draft.id);
  await post(line,group,'submit-test',{snapshot,reason:'Test return'});
  await post(line,group,'reject');
  current=await read();target=current.control.scopes[`${line}:${group}`];
  assert.equal(target.versions.find(v=>v.id===draft.id).status,'draft');
  assert.equal(target.activeVersionId,null);
  assert.ok(target.versions.find(v=>v.id===draft.id).history.some(event=>event.action==='withdraw'));
  assert.ok(target.versions.find(v=>v.id===draft.id).history.some(event=>event.action==='reject'));
  console.log('PASS unauthorized review denied; withdraw/reject restore same draft, no effective version');
})().catch(error=>{console.error(error);process.exitCode=1});
