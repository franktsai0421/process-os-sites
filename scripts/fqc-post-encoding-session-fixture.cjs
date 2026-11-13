// Test-only assertions for the additional final session boundary; real isolated handlers.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const isRevocation=e=>e.type==='sqlRead'&&e.sql.includes('FROM process_revoked_sessions');
function assertFinalSessionOrder(events){
 const lastPut=events.findLastIndex(e=>e.type==='put'),cas=events.findIndex(e=>e.type==='sqlWrite'&&e.sql.startsWith('UPDATE shared_state'));
 assert(lastPut>=0&&cas>lastPut,'actual immutable encoding precedes publication');
 const afterEncoding=events.slice(lastPut+1,cas);
 assert.equal(afterEncoding.filter(isRevocation).length,2,'existing phase check plus exactly one additional final session check');
 assert(isRevocation(events[cas-1]),'final DB read immediately before CAS checks session revocation');
 assert.equal(events.filter(e=>e.type==='sqlWrite').length,1,'one publication CAS');
}
async function assertFinalSessionRevocation(s,command,fixed){
 const req=await s.request(command),token=req.headers.get('cookie').split('=').slice(1).join('='),digest=createHash('sha256').update(token).digest('hex'),before=s.row();
 let checks=0,revoked=false;s.events.length=0;
 s.hook.read=sql=>{
  if(sql.includes('FROM process_revoked_sessions')&&s.events.some(e=>e.type==='put')&&++checks===2){
   revoked=true;s.db.prepare('INSERT INTO process_revoked_sessions VALUES(?,?,?)').run(digest,fixed+3600000,fixed);
  }
 };
 try{
  const response=await s.route.POST(req);assert(revoked,'revocation is injected at the second post-encoding session read');
  assert.equal(checks,2);assert.equal(response.status,401);assert.equal((await response.json()).error,'LOGIN_REQUIRED');
  assert(s.events.some(e=>e.type==='put'),'immutable encoding really executed');
  assert.equal(s.events.filter(e=>e.type==='sqlWrite').length,0,'no publication or receipt after final revocation');assert.deepEqual(s.row(),before);
 }finally{s.hook.read=null;}
}
module.exports={assertFinalSessionOrder,assertFinalSessionRevocation};
