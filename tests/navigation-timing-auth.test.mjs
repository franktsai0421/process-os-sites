import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
const harness=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs');
function fixture(){
 const state={revision:1,values:{platformUsers:JSON.stringify([{id:'fixture-admin',name:'Synthetic',role:'admin',enabled:true,authEpoch:0}])}};
 const calls=[];let revoked=false,fail=false;
 const env={PROCESS_SESSION_SECRET:randomBytes(32).toString('hex'),PROCESS_SESSION_REVOCATION_ENABLED:'1',PROCESS_NAVIGATION_TIMING:'1',PROCESS_NAVIGATION_TIMING_UNTIL:new Date(Date.now()+600000).toISOString(),DB:{prepare(sql){return {bind(){return this;},async first(){calls.push(sql.includes('process_revoked_sessions')?'revocation':'state');if(sql.includes('process_revoked_sessions')){if(fail)throw Error('synthetic unavailable');return revoked?{expires_at:Date.now()+600000}:null;}return {revision:state.revision,values:JSON.stringify(state.values)};}};}}};
 const load=harness(env),auth=load('lib/process-state.ts'),timing=load('lib/navigation-timing.ts'),config=load('app/api/navigation-diagnostics/route.ts');
 const request=(cookie,enabled=true)=>new Request('https://fixture.invalid/api/process-bootstrap',{headers:{...(cookie?{cookie}:{}),...(enabled?{'X-Process-Timing':'1'}:{})}});
 return {state,calls,env,auth,timing,config,request,setRevoked(value){revoked=value;},setFailure(value){fail=value;},user(change){const users=JSON.parse(state.values.platformUsers);Object.assign(users[0],change);state.values.platformUsers=JSON.stringify(users);}};
}
await test('real identity and diagnostic gate reject anonymous, nonadmin, disabled, deleted, epoch mismatch and revoked sessions',async()=>{
 const f=fixture(),token=await f.auth.demoSession(f.request(), 'fixture-admin',false,0),cookie='process_demo='+token;
 const sample=async(c=cookie,opt=true)=>f.timing.navigationTiming(f.request(c,opt),f.timing.timingEnabled(f.env),async()=>{const state=await f.auth.readState({keys:['platformUsers']}),actor=await f.auth.identity(f.request(c,opt),state);return Response.json({ok:!!actor},{status:actor?200:401});});
 const baseline=await sample(cookie,false);assert.equal(baseline.status,200);assert.equal(baseline.headers.get('server-timing'),null);
 f.calls.length=0;const valid=await sample();const counts=[...f.calls];assert.equal(valid.status,200);assert.match(valid.headers.get('server-timing'),/auth/);
 f.calls.length=0;const plain=await sample(cookie,false);assert.equal(await valid.text(),await plain.text());assert.deepEqual(f.calls,counts,'timing adds no auth/state DB call');
 assert.equal((await f.config.GET(f.request(cookie))).status,200);
 const cases=[['anonymous',()=>{},''],['staff',()=>f.user({role:'staff'}),cookie],['disabled',()=>f.user({enabled:false}),cookie],['deleted',()=>f.user({deletedAt:'synthetic'}),cookie],['epoch',()=>f.user({authEpoch:1}),cookie],['revoked',()=>f.setRevoked(true),cookie],['revocation unavailable',()=>f.setFailure(true),cookie]];
 for(const [label,change,c] of cases){f.user({role:'admin',enabled:true,deletedAt:null,authEpoch:0});f.setRevoked(false);f.setFailure(false);change();const r=await sample(c);assert.equal(r.headers.get('server-timing'),null,label);assert.equal(r.status,label==='staff'?200:401,label);assert.equal((await f.config.GET(f.request(c))).status,403,label);}
 f.user({role:'admin',enabled:true,deletedAt:null,authEpoch:0});f.setRevoked(false);f.setFailure(false);
 for(const change of [{PROCESS_NAVIGATION_TIMING:'0'},{PROCESS_NAVIGATION_TIMING:'1',PROCESS_NAVIGATION_TIMING_UNTIL:new Date(Date.now()-1).toISOString()}]){Object.assign(f.env,change);const r=await sample();assert.equal(r.status,200);assert.equal(r.headers.get('server-timing'),null);assert.equal((await (await f.config.GET(f.request(cookie))).json()).enabled,false);}
});
await test('valid demo-admin session cannot enable configuration or sample',async()=>{
 const f=fixture();f.env.DEMO_LOGIN_ENABLED='true';
 const {demoIdentity}=await import('../lib/demo-identities.mjs');const demo=demoIdentity('admin');
 f.state.values.platformUsers=JSON.stringify([{id:demo.id,role:'admin',authMode:'demo',enabled:true}]);
 const token=await f.auth.demoSession(f.request(),demo.id,true,0),request=f.request('process_demo='+token);
 const actor=await f.auth.identity(request,f.state);assert.equal(actor.sessionType,'demo');
 assert.equal((await f.config.GET(request)).status,403);
 const response=await f.timing.navigationTiming(request,true,async()=>{await f.auth.identity(request,f.state);return Response.json({ok:true});});assert.equal(response.status,200);assert.equal(response.headers.get('server-timing'),null);
});
await test('forty real anonymous 401s leave all thirty authorized sample slots available',async()=>{
 const f=fixture(),token=await f.auth.demoSession(f.request(),'fixture-admin',false,0),cookie='process_demo='+token;
 async function sample(c){const request=f.request(c);return f.timing.navigationTiming(request,true,async()=>{const actor=await f.auth.identity(request,f.state);return Response.json({ok:!!actor},{status:actor?200:401});});}
 for(let i=0;i<40;i++){const r=await sample('');assert.equal(r.status,401);assert.equal(r.headers.get('server-timing'),null);}
 f.calls.length=0;
 for(let i=0;i<30;i++){const r=await sample(cookie);assert.equal(r.status,200);assert.match(r.headers.get('server-timing'),/v1:bootstrap:/);}
 const exhausted=await sample(cookie);assert.equal(exhausted.status,200);assert.deepEqual(await exhausted.json(),{ok:true});assert.equal(exhausted.headers.get('server-timing'),null);assert.equal(f.calls.length,31,'one existing revocation read for each verified request, even after quota exhausted');
});
