// Testing evidence only: exact no-poll inverse to dc348749 equipment bytes. Never imported by runtime.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=b=>createHash('sha256').update(b).digest('hex');
const contract={
  "file": "public/process/routine-equipment.js",
  "beforeHash": "ecd1bf66f4c486e31b0567a6644517fc07dff6e6821243bd49073755b980702d",
  "afterHash": "6612c3d515d8acaf2f4ac5d4819595145894c2f8500b3fef4b5690bf1d7b8241",
  "rules": [
    {
      "offset": 2973,
      "before": "  let sharedClient=null,sharedActor='',syncBase=null,syncGeneration=null,inputOwner=null;const sharedPoll=window.createForegroundPoll();let readIntent=0,localBeginReceipt=null,pendingSaveBatch=null;\n",
      "after": "  let sharedClient=null,sharedActor='',syncBase=null,syncGeneration=null,inputOwner=null;let readIntent=0,localBeginReceipt=null,pendingSaveBatch=null;\n"
    },
    {
      "offset": 13434,
      "before": "      pollShared();\n",
      "after": ""
    },
    {
      "offset": 42691,
      "before": "  function pollShared(){const pollScheduleOwner=sharedPoll.capture();try{if(readBeginRecovery()){sharedPoll.cancel();return;}}catch{sharedPoll.cancel();return;}const delivery=window.ProcessSync?.captureDelivery?.(),owns=()=>sharedPoll.isCurrent(pollScheduleOwner)&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));sharedPoll.schedule(async()=>{\n    if(!owns())return;\r\n    if(!routineTabIsActive())return;\r\n    if(!inputOwnerCurrent()){render();return;}\n    try{if(!busy&&document.visibilityState!=='hidden'&&sharedTransport().canPoll('state')){\r\n      const intent=readIntent,flow=control?.workflow,result=await sharedTransport().read(flow?`${flow.generation}:${flow.revision}`:'');\n      if(!owns()||intent!==readIntent||busy)return;if(!result.unchanged&&result.control){const wasOpen=['draft','pending'].includes(selected()?.status);control=result.control;revision=result.revision;\n        if(editingEquipmentId||nodeDialog||addingEquipment||pendingPhotos.size||working&&syncBase&&snapshotChanges(syncBase,working).patches.length||document.activeElement?.matches('input,textarea,select')){const status=host?.querySelector('#routine-shared-status');if(status)status.textContent=t('共用內容已更新，保留目前輸入，套用時核對來源。','Nội dung chung đã cập nhật; giữ dữ liệu đang nhập và kiểm tra nguồn khi áp dụng.');}\r\n        else{if(wasOpen){selectedVersionId=open()?.id||active()?.id;working=open()?.status==='draft'?snapshotOf(open()):null;syncBase=working&&clone(working);syncGeneration=control.workflow?.generation||null;rememberInputOwner();}render();}\r\n      }\r\n    }}catch(e){if(owns())showEquipmentReadRecovery(e);}\r\n    finally{if(owns()&&sharedPoll.isCurrent(pollScheduleOwner))pollShared();}\r\n  });}\r\n",
      "after": ""
    },
    {
      "offset": 265608,
      "before": "    sharedPoll.cancel();\r\n",
      "after": ""
    },
    {
      "offset": 265760,
      "before": "    if (preserve) { message = t('本頁仍有未儲存草稿，已保留於工作區；請儲存或送審。', 'Trang này còn bản nháp chưa lưu; đã giữ trong vùng làm việc.'); render(); pollShared(); return; }\r\n",
      "after": "    if (preserve) { message = t('本頁仍有未儲存草稿，已保留於工作區；請儲存或送審。', 'Trang này còn bản nháp chưa lưu; đã giữ trong vùng làm việc.'); render(); return; }\n"
    },
    {
      "offset": 266902,
      "before": "      render();pollShared();if(!linkedId)void reconcilePendingReplacements();\r\n",
      "after": "      render();if(!linkedId)void reconcilePendingReplacements();\n"
    },
    {
      "offset": 281023,
      "before": "  });},requiresSave:()=>false,saveForDeparture:()=>saveDraft('save'),canLeave:()=>!busy&&!transferBusy(),error:()=>navigationError,reset(){viewDialog?.references?.closeDetail?.();equipmentEditRequest++;writeShared.attempt=null;busy=false;sharedPoll.cancel();equipmentReadAttempt=null;host=null;reviewHost=null;control=null;revision=null;working=null;controlActor='';readUnavailable=false;selectedVersionId='';editingEquipmentId='';selectedEquipmentId='';syncBase=null;syncGeneration=null;localBeginReceipt=null;pendingSaveBatch=null;inputOwner=null;viewDialog=null;formSnapshot=null;problemSnapshot=null;invalidateEquipmentReferences();equipmentRefReads.clear();navigationError=null;}},\n",
      "after": "  });},requiresSave:()=>false,saveForDeparture:()=>saveDraft('save'),canLeave:()=>!busy&&!transferBusy(),error:()=>navigationError,reset(){viewDialog?.references?.closeDetail?.();equipmentEditRequest++;writeShared.attempt=null;busy=false;equipmentReadAttempt=null;host=null;reviewHost=null;control=null;revision=null;working=null;controlActor='';readUnavailable=false;selectedVersionId='';editingEquipmentId='';selectedEquipmentId='';syncBase=null;syncGeneration=null;localBeginReceipt=null;pendingSaveBatch=null;inputOwner=null;viewDialog=null;formSnapshot=null;problemSnapshot=null;invalidateEquipmentReferences();equipmentRefReads.clear();navigationError=null;}},\n"
    }
  ]
};
function restoreEquipmentPolling(bytes,file){
 assert(Buffer.isBuffer(bytes),'Equipment inverse requires raw source bytes');
 assert.equal(file,contract.file,'Equipment inverse wrong file');
 assert.equal(hash(bytes),contract.afterHash,'Equipment inverse differs from pinned bytes');
 let result=Buffer.from(bytes);
 for(const {offset,before,after} of [...contract.rules].reverse()){const expected=Buffer.from(after);assert.deepEqual(result.subarray(offset,offset+expected.length),expected);result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+expected.length)]);}
 assert.equal(hash(result),contract.beforeHash);return result;
}
module.exports={...contract,restoreEquipmentPolling};
