const test=require('node:test'),assert=require('node:assert/strict');
const setup=require('../scripts/quality-authoring-bootstrap-fixture.cjs'),{loadAt,snap}=require('../scripts/quality-operation-speed-fixture.cjs');
async function bootstrap(load,f,view='editor',opt=true){const start=performance.now(),response=await load('app/api/process-bootstrap/route.ts').GET(new Request('https://synthetic.invalid/api/process-bootstrap?view='+view,{headers:{cookie:f.cookies.editor,...(opt?{'X-Process-Authoring':'workflow-v1'}:{})}})),raw=await response.text();return{status:response.status,body:JSON.parse(raw),bytes:Buffer.byteLength(raw),ms:performance.now()-start};}
void test('12 MB adopted editor bootstrap defers only authoring bodies; required workflow retains full data and failures',async t=>{
 const f=await setup();t.after(()=>f.close());const before=snap(f),now=Date.now(),old=loadAt(f.env,true,now),next=loadAt(f.env,false,now);
 old('app/api/process-bootstrap/route.ts');next('app/api/process-bootstrap/route.ts');
 const baseline=await bootstrap(old,f),candidate=await bootstrap(next,f);assert.equal(baseline.status,200);assert.equal(candidate.status,200);
 const full=JSON.parse(baseline.body.values.processAuthoringControl),marker=JSON.parse(candidate.body.values.processAuthoringControl);assert.equal(full.versions[0].snapshot.workspaces[0].stages.S.length,1000);assert.deepEqual(marker,{activeVersionId:'approved',versions:[]});
 assert(baseline.bytes>12000000);assert(candidate.bytes<baseline.bytes/100);const expected=structuredClone(baseline.body);expected.values.processAuthoringControl=candidate.body.values.processAuthoringControl;assert.deepEqual(candidate.body,expected);
 for(const view of ['editor','player']){const a=await bootstrap(old,f,view,false),b=await bootstrap(next,f,view,false);assert.equal(a.status,200);assert.deepEqual(b.body,a.body);}
 const player=await bootstrap(next,f,'player',true);assert.deepEqual(player.body,(await bootstrap(old,f,'player',true)).body,'header cannot defer player data');
 async function workflow(load){const r=await load('app/api/process-authoring/workflow/route.ts').GET(new Request('https://synthetic.invalid/api/process-authoring/workflow?caseMetadata=1',{headers:{cookie:f.cookies.editor}}));return{status:r.status,body:await r.json()};}
 const a=await workflow(old),b=await workflow(next);assert.equal(b.status,200);assert.deepEqual(b,a);assert.equal(b.body.control.workflow.working.workspaces[0].stages.S.length,1000);assert.deepEqual(snap(f).row,before.row);
 const refs=JSON.parse(before.row.values).__processRecords.values,aggregate=JSON.parse(f.objects.get(refs.processAuthoringControl.key)),key=aggregate.versions[0].snapshot.__immutableBody.key,bytes=f.objects.get(key);f.objects.delete(key);
 assert.equal((await bootstrap(next,f)).status,200,'deferred bootstrap is not readiness');assert.equal((await workflow(next)).status,503,'required body failure remains a failed workflow load');assert.equal((await bootstrap(next,f,'player')).status,503);f.objects.set(key,bytes);assert.deepEqual(snap(f).row,before.row);
 let revoked=false;f.hooks.get=key=>{if(!revoked&&key===refs.processAuthoringControl.key){revoked=true;f.revoke();}};
 assert.equal((await bootstrap(next,f)).status,401,'revocation during selected aggregate read still denies deferred bootstrap');assert(revoked);
 t.diagnostic(JSON.stringify({method:'same synthetic 1000 operations / ~12 MB approved instructions; full workflow equality; not browser or Office timings',baseline:{bytes:baseline.bytes,ms:baseline.ms},candidate:{bytes:candidate.bytes,ms:candidate.ms}}));
});
