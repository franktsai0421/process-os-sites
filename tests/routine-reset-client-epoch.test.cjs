const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function ports(){
 const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const c={window:{localStorage:storage},crypto,TextEncoder,Uint8Array};vm.runInNewContext(fs.readFileSync('public/process/routine-reset.js','utf8'),c);
 return {memory,storage,reset:c.window.RoutineReset};
}
test('actual IQC call rejects its own delayed response but accepts an independent FQC reset',async()=>{
 for(const resetScope of ['iqc','fqc']){
  const {storage,reset}=ports();let release;
  const v={owner:{actor:'frank'}},c={window:{RoutineReset:reset},endpoint:'/api/routine-iqc',current:x=>x===v,fetch:()=>new Promise(r=>release=r)};
  const source=fs.readFileSync('public/process/routine-iqc.js','utf8');
  vm.runInNewContext(source.slice(source.indexOf('  async function call(v,'),source.indexOf('  async function load(v)')),c);
  const result=c.call(v);
  storage.setItem('routine-reset-client-epoch:'+resetScope+':frank','new-reset');
  release({ok:true,json:async()=>({revision:1})});
  if(resetScope==='iqc')await assert.rejects(result,/DELIVERY_SUPERSEDED/);else assert.equal((await result).revision,1);
 }
});
test('actual FQC receipt pin and display callbacks expire only on FQC reset',()=>{
 const {storage,reset}=ports(),root={},data={identity:{id:'frank'}},sync={identity:{id:'frank'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:()=>true};
 const c={window:{RoutineReset:reset,ProcessSync:sync},data,root,receiptLifecycle:0,receiptSuspended:false,receiptText:x=>typeof x==='string',historyDisplayEpoch:0,historyAllowsMutation:()=>true};
 const source=fs.readFileSync('public/process/routine-fqc.js','utf8');
 vm.runInNewContext(source.slice(source.indexOf('  function receiptPin('),source.indexOf('  function receiptOwnedPin(')),c);
 const line=source.split('\n').find(x=>x.includes('const captureHistoryDisplay='));vm.runInNewContext(line.replace('const captureHistoryDisplay=','var captureHistoryDisplay='),c);
 const pin=c.receiptPin(),display=c.captureHistoryDisplay();assert(c.receiptCurrent(pin)&&display());
 storage.setItem('routine-reset-client-epoch:iqc:frank','iqc-reset');assert(c.receiptCurrent(pin)&&display());
 storage.setItem('routine-reset-client-epoch:fqc:frank','fqc-reset');assert(!c.receiptCurrent(pin)&&!display());
});
test('actual FQC late photo callback cannot attach after own reset; IQC reset does not discard it',async()=>{
 for(const scope of ['fqc','iqc']){
  const {storage,reset}=ports();let release,touches=0,paints=0;
  const c={window:{RoutineReset:reset},data:{identity:{id:'frank'}},root:{},historyDisplayEpoch:0,historyAllowsMutation:()=>true,
   receiptPin:()=>reset.epoch('fqc','frank'),receiptCurrent:pin=>pin===reset.epoch('fqc','frank'),
   el:{files:[{}],dataset:{upload:'evidence'}},c:{evidence:[]},s:{},endpoint:'/api/routine-fqc',touch:()=>touches++,paint:()=>paints++,t:x=>x,fetch:()=>new Promise(r=>release=r)};
  const source=fs.readFileSync('public/process/routine-fqc.js','utf8'),line=source.split('\n').find(x=>x.includes('const captureHistoryDisplay='));
  vm.runInNewContext(line.replace('const captureHistoryDisplay=','var captureHistoryDisplay='),c);
  const start=source.indexOf('          const uploadCurrent=captureHistoryDisplay()'),end=source.indexOf('        }),\n    );',start);
  assert(start>0&&end>start);vm.runInNewContext('async function upload(){\n'+source.slice(start,end)+'\n}',c);
  const result=c.upload();storage.setItem('routine-reset-client-epoch:'+scope+':frank','reset');
  release({ok:true,json:async()=>({id:'synthetic-photo'})});await result;
  assert.equal(c.c.evidence.length,scope==='fqc'?0:1);assert.equal(touches,scope==='fqc'?0:1);assert.equal(paints,scope==='fqc'?0:1);
 }
});
