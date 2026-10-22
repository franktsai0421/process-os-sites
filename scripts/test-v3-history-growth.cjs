/* oxlint-disable typescript/no-require-imports -- isolated representative history benchmark. */
const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
if(!process.argv.includes('--worker')){
 const rows=['clone-baseline','structural-sharing'].map(mode=>JSON.parse(execFileSync(process.execPath,['--expose-gc',__filename,'--worker',mode],{encoding:'utf8',maxBuffer:1_000_000})));
 console.log(JSON.stringify({result:'PASS',scope:'transition kernel only; not full HTTP/Workers capacity acceptance',measurements:rows}));
}else{
 const mode=process.argv.at(-1),load=require('./ipqc-ab-import-harness.cjs')(),kernel=load('lib/shared-draft.ts');
 const description='Kiểm tra toàn bộ kích thước, bề mặt và tình trạng của sản phẩm theo bản vẽ kỹ thuật đã được phê duyệt; ghi rõ kết quả và thông báo cho người phụ trách khi phát hiện bất thường. '.repeat(3);
 const content={items:Array.from({length:862},(_,i)=>({id:'item-'+i,code:'C-P'+i+'-TIEN-L1-01',standard:'27.9 mm ± 0.1 mm',description,note:'',equipmentId:'fixture-equipment-'+i%13,mediaItems:[{id:createHash('sha256').update('fixture-photo-'+i%13).digest('hex'),name:'Ảnh kiểm tra '+i,note:'Ảnh bất biến'}]}))};
 let state=kernel.createSharedDraft('growth-fixture',content,'active',randomUUID());const stamp={actor:{id:'editor-a',name:'Người sửa A',admin:false},at:'2026-10-01T00:00:00Z'};
 for(let i=0;i<40;i++){
   const snapshot=kernel.cloneDraft(content);snapshot.items[i].note='Lần sửa đổi '+i;
   state.saves.push({...stamp,id:'save-'+i,revision:i,content:snapshot,contributors:{}});
   state.cases.push({...stamp,id:'case-'+i,savedId:'save-'+i,baseId:'active',before:kernel.cloneDraft(content),content:kernel.cloneDraft(snapshot),reason:'Thay đổi có kiểm soát '+i,status:'approved',result:{...stamp,reason:'Đồng ý',selfReview:false}});
 }
 const hashHistory=s=>{const h=createHash('sha256');for(const save of s.saves)h.update(JSON.stringify(save));for(const c of s.cases)h.update(JSON.stringify(c));return h.digest('hex');};
 const historyHash=hashHistory(state),bytes=Buffer.byteLength(JSON.stringify(state)),source=state;global.gc();const baseline=process.memoryUsage(),times=[];
 const context={...stamp,id:randomUUID,allowed:()=>true,activeId:'active',semantic:v=>v,structure:()=>{},validate:()=>[]};
 for(let i=0;i<8;i++){
   const start=performance.now(),input=mode==='clone-baseline'?kernel.cloneDraft(state):state;
   state=kernel.applyDraftCommand(input,{operationId:randomUUID(),clientId:'fixture-client',generation:state.generation,sequence:i+1,action:'apply',patches:[{op:'set',path:['items',{id:'item-0'},'note'],value:'Thay đổi nhỏ '+i}]},context).state;
   times.push(Math.round(performance.now()-start));
 }
 assert.equal(hashHistory(state),historyHash);assert.equal(source.working.items[0].note,'');assert.equal(state.working.items[0].note,'Thay đổi nhỏ 7');
 if(mode==='structural-sharing')assert.equal(state.cases[0].content,source.cases[0].content);
 console.log(JSON.stringify({mode,items:862,historicalSaves:40,fixedCases:40,immutablePhotoReferences:13,aggregateBytes:bytes,operationMs:times,baselineHeapBytes:baseline.heapUsed,peakRssBytes:process.resourceUsage().maxRSS*1024,historyUnchanged:true}));
}
