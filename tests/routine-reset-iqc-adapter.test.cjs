const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('actual IQC Reset adapter settles legacy session pending and preserves FQC state',async()=>{
 const memory=new Map([['routine-iqc-receipt:frank','legacy-iqc-operation'],['routine-fqc-peer','unchanged']]);
 const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const v={root:{isConnected:true},owner:{actor:'frank'},data:{identity:{id:'frank'}},pending:'legacy-iqc-operation'},c={window:{localStorage:storage,ProcessSync:{identity:{id:'frank'}}},sessionStorage:storage,crypto,TextEncoder,Uint8Array,v,data:v.data,current:x=>x===v,edited:()=>false,t:x=>x,load:async()=>{},key:'routine-iqc-receipt:',endpoint:'/api/routine-iqc',fetch:async()=>({ok:true,json:async()=>({identity:{id:'frank'},resetGenerationRevision:8})})};
 vm.createContext(c);vm.runInContext(fs.readFileSync('public/process/routine-reset.js','utf8'),c);
 let args;c.window.RoutineReset.bind=(...a)=>args=a;
 const source=fs.readFileSync('public/process/routine-iqc.js','utf8');
 vm.runInContext(source.slice(source.indexOf('  function resetPendingRows(v)'),source.indexOf('  async function load(v)')),c);
 const a=source.indexOf("      window.RoutineReset?.bind(v.root,'iqc'"),b=source.indexOf('        });',a);
 assert(a>0&&b>a);vm.runInContext(source.slice(a,b+'        });'.length),c);
 assert.equal(args[1],'iqc');assert(args[4]());const adapter=args[6],pending=await adapter.capture();assert.equal(pending[0].operationId,'legacy-iqc-operation');
 adapter.invalidate();await adapter.settle({scope:'iqc',actorId:'frank',generationRevision:8,settlements:pending.map(x=>({...x,status:'superseded-by-reset',priorOutcome:'unknown'}))});
 assert.equal(v.pending,null);assert.equal(memory.get('routine-fqc-peer'),'unchanged');assert.equal(memory.size,1);
});
