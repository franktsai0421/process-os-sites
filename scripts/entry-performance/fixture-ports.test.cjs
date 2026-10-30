const assert=require('node:assert/strict'),install=require('./fixture-ports.cjs');
void (async()=>{
 const transportTimer=()=>{throw Error('scheduler must not use transport timer');};
 const context={window:{},document:{},setTimeout:transportTimer},clock=install(context),poll=context.window.createForegroundPoll();let calls=0;
 poll.schedule(()=>{calls++;});assert.equal(clock.pending(),1);assert.equal(clock.nextDelay(),30000);assert.equal(context.setTimeout,transportTimer);await clock.runNext();assert.equal(calls,1);
 poll.schedule(()=>{calls++;});clock.visible(false);assert.equal(clock.pending(),0);clock.visible(true);assert.equal(clock.nextDelay(),0);await clock.runNext();assert.equal(calls,2);
 poll.schedule(()=>{calls++;});clock.focus(false);assert.equal(clock.pending(),0);clock.focus(true);assert.equal(clock.nextDelay(),0);await clock.runNext();assert.equal(calls,3);
 const owner=poll.capture();poll.schedule(()=>{calls++;});poll.cancel();assert.equal(poll.isCurrent(owner),false);assert.equal(clock.pending(),0);
 const failure=new Error('synthetic');poll.schedule(()=>{throw failure;});await assert.rejects(()=>clock.runNext(),e=>e===failure);assert.equal(clock.pending(),0);
 poll.schedule(()=>{calls++;});poll.dispose();clock.focus(false);clock.focus(true);assert.equal(clock.pending(),0);assert.equal(calls,3);
 console.log(JSON.stringify({status:'PASS',checks:6,scope:'actual shipped scheduler under event/virtual-clock ports; client timeout ports unchanged; no browser'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
