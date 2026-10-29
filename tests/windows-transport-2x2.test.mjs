import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {CELLS,SIZES,REQUEST_LIMIT,WORKERS,workingLockMatches,configText,safeCode,parseListen,requestBytes,probe,classify} from '../scripts/windows-transport-2x2.mjs';
const loadWorker=source=>vm.runInNewContext('('+source.replace('export default','').replace(/;$/,'')+')',{Response});
function socketHarness() {
 const socket=new EventEmitter(),writes=[];let pending,cleared=false,destroyed=0,connections=0;
 socket.write=bytes=>{writes.push(bytes);return true;};socket.destroy=()=>{destroyed++;socket.emit('close');};
 const io={connect:options=>{assert.deepEqual(options,{host:'127.0.0.1',port:12345});connections++;return socket;},setTimer:(callback,delay)=>{assert.equal(delay,1500);pending=callback;return 1;},clearTimer:id=>{assert.equal(id,1);cleared=true;}};
 return {socket,writes,io,expire:()=>pending(),state:()=>({connections,cleared,destroyed})};
}
void test('2x2 topology is exactly four loopback sockets; internet is a local deny worker',()=>{
 const config=configText();assert.equal(CELLS.length,4);assert.equal(REQUEST_LIMIT,CELLS.length*SIZES.length);
 assert.equal((config.match(/address="127.0.0.1:0"/g)||[]).length,4);
 assert.equal((config.match(/name="TARGET",service=/g)||[]).length,2);
 assert.ok(config.includes('name="internet",worker='));assert.ok(!/network\s*=|disk\s*=|d1|r2|secret|credentials/.test(config));
});
void test('unread control never reads; reading control awaits body; both return same 413',async()=>{
 let calls=0,release;const pending=new Promise(resolve=>{release=resolve;});
 const request={arrayBuffer(){calls++;return pending;}};
 assert.equal((await loadWorker(WORKERS.unread).fetch(request)).status,413);assert.equal(calls,0);
 let finished=false;const result=loadWorker(WORKERS.read).fetch(request).then(value=>{finished=true;return value;});
 await Promise.resolve();assert.equal(calls,1);assert.equal(finished,false);release(new ArrayBuffer(1));assert.equal((await result).status,413);
});
void test('read failure is not swallowed; forward uses exact request and target receiver',async()=>{
 const failure=new Error('synthetic');await assert.rejects(loadWorker(WORKERS.read).fetch({arrayBuffer(){throw failure;}}),error=>error===failure);
 const request={},target={fetch(value){assert.equal(this,target);assert.equal(value,request);throw failure;}};
 await assert.rejects(loadWorker(WORKERS.forward).fetch(request,{TARGET:target}),error=>error===failure);
 assert.equal((await loadWorker(WORKERS.deny).fetch()).status,599);
});
void test('only bounded fixed synthetic bodies accepted',()=>{
 for(const size of SIZES){const bytes=requestBytes(size),split=bytes.indexOf('\r\n\r\n');assert.ok(bytes.subarray(0,split).toString().endsWith(`Content-Length: ${size}`));assert.deepEqual(bytes.subarray(split+4),Buffer.alloc(size,120));}
 for(const size of [0,2,5000,9001,'1'])assert.throws(()=>requestBytes(size));
});
void test('control readiness rejects unknown socket, invalid port, malformed input',()=>{
 assert.deepEqual(parseListen('{"event":"listen","socket":"direct-read","port":12345}'),{cell:'direct-read',port:12345});
 for(const line of ['{}','not-json','{"event":"listen","socket":"external","port":1}','{"event":"listen","socket":"direct-read","port":0}','{"event":"listen","socket":"direct-read","port":"123"}'])assert.throws(()=>parseListen(line));
});
void test('error output is enum-only and does not invoke sensitive getters',()=>{
 let touched=0;const poisoned={get code(){touched++;throw Error('not logged');},get message(){touched++;throw Error('not logged');}};
 assert.equal(safeCode(poisoned),'UNCLASSIFIED');assert.equal(touched,0);
 assert.equal(safeCode({code:'ECONNRESET',message:'private'}),'ECONNRESET');assert.equal(safeCode({code:'PRIVATE_SECRET'}),'UNCLASSIFIED');assert.equal(safeCode(null),'UNCLASSIFIED');
});
for(const size of SIZES)void test(`single request ${size} bytes preserves response then reset evidence without retry`,async()=>{
 const h=socketHarness(),promise=probe(12345,size,h.io);h.socket.emit('connect');h.socket.emit('data',Buffer.from('HTTP/1.1 413 Payload Too Large\r\nContent-Length: 0\r\n\r\n'));h.socket.emit('error',{code:'ECONNRESET',message:'must not appear'});
 const result=await promise;assert.equal(result.status,413);assert.equal(result.errorCode,'ECONNRESET');assert.equal(result.ending,'SOCKET_ERROR');assert.equal(result.requestWrites,1);assert.deepEqual(h.writes,[requestBytes(size)]);assert.deepEqual(h.state(),{connections:1,cleared:true,destroyed:1});assert.ok(!JSON.stringify(result).includes('must not appear'));
});
void test('reset before headers retains null status, not fabricated 413',async()=>{
 const h=socketHarness(),promise=probe(12345,1,h.io);h.socket.emit('connect');h.socket.emit('error',{code:'ECONNRESET'});const result=await promise;assert.equal(result.status,null);assert.equal(result.responseBytes,0);assert.equal(result.requestWrites,1);
});
void test('split header and clean EOF retain true status; no implicit retry',async()=>{
 const h=socketHarness(),promise=probe(12345,1,h.io);h.socket.emit('connect');h.socket.emit('data',Buffer.from('HTTP/1.1 4'));h.socket.emit('data',Buffer.from('13 No\r\n\r\n'));h.socket.emit('end');const result=await promise;assert.equal(result.status,413);assert.equal(result.ending,'CLEAN_END');assert.equal(h.writes.length,1);
});
void test('deadline bounds observation and destroys only its own socket',async()=>{
 const h=socketHarness(),promise=probe(12345,1,h.io);h.socket.emit('connect');h.socket.emit('data',Buffer.from('HTTP/1.1 413 No\r\n\r\n'));h.expire();const result=await promise;assert.equal(result.ending,'OBSERVATION_DEADLINE');assert.equal(result.status,413);assert.equal(h.state().destroyed,1);
});
void test('oversized response fails without recording contents',async()=>{
 const h=socketHarness(),promise=probe(12345,1,h.io);h.socket.emit('connect');h.socket.emit('data',Buffer.alloc(8193,120));const result=await promise;assert.equal(result.ending,'RESPONSE_LIMIT');assert.equal(result.status,null);assert.equal(h.writes.length,1);
});
void test('connect permission refusal is explicit and no request is sent',async()=>{
 const result=await probe(12345,1,{connect(){throw {code:'EPERM'};},setTimer(){return 1;},clearTimer(){}});assert.equal(result.ending,'CONNECT_THROW');assert.equal(result.errorCode,'EPERM');assert.equal(result.requestWrites,0);
});
void test('summary never turns incomplete, wrong status or post-response reset into success',()=>{
 const good=Array.from({length:8},()=>({status:413,ending:'OBSERVATION_DEADLINE'}));assert.equal(classify(good),'NO_RESET_OBSERVED_WITHIN_WINDOW');assert.equal(classify(good.slice(1)),'INCOMPLETE');
 for(const change of [{status:null},{status:401},{ending:'SOCKET_ERROR'},{ending:'CONNECT_THROW'},{ending:'RESPONSE_LIMIT'}])assert.equal(classify([{...good[0],...change},...good.slice(1)]),'TRANSPORT_DIFFERENCE_OBSERVED');
});

void test('canonical Git lock bytes permit only working-tree CRLF conversion',()=>{
 const canonical=Buffer.from('{\n  "lockfileVersion": 3\n}\n');
 assert.equal(workingLockMatches(canonical,canonical),true);
 assert.equal(workingLockMatches(canonical,Buffer.from(canonical.toString().replace(/\n/g,'\r\n'))),true);
 for(const changed of [canonical.toString().replace('3','2'),canonical.toString()+'\n',canonical.toString().replace('  ',' '),canonical.toString().replace('Version','Ver\rsion')])assert.equal(workingLockMatches(canonical,Buffer.from(changed)),false);
});
void test('deadline is explicitly window-limited; unclean close is inconclusive',()=>{
 const good=Array.from({length:8},()=>({status:413,ending:'CLEAN_END'}));
 assert.equal(classify(good),'NO_RESET_OBSERVED_CLEAN_ENDS');
 assert.equal(classify([{...good[0],ending:'OBSERVATION_DEADLINE'},...good.slice(1)]),'NO_RESET_OBSERVED_WITHIN_WINDOW');
 assert.equal(classify([{...good[0],ending:'CLOSED'},...good.slice(1)]),'INCONCLUSIVE_SOCKET_CLOSE');
 assert.equal(classify([{...good[0],ending:'UNKNOWN'},...good.slice(1)]),'INCONCLUSIVE_SOCKET_CLOSE');
});
