/* Test-only exact composition for the equipment CI repairs. Never execute the
 * reconstructed predecessor. Before bytes are the verified PR 97 head
 * 8823cb67501730b7f9f02fb49337bc7126620602, not an inferred candidate.
 * Product changes are equipment ACK structural equality and explicit same-owner
 * delivery permission recheck. Other runtime source is not projected here. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contracts=[
  {
    "file": "public/process/routine-equipment.js",
    "beforeHash": "6612c3d515d8acaf2f4ac5d4819595145894c2f8500b3fef4b5690bf1d7b8241",
    "afterHash": "6f57fc37463575cb1ee59790bad2869f44c7583a8005cbde1e805494f816597f",
    "beforeLength": 282530,
    "afterLength": 283915,
    "rules": [
      {
        "offset": 13509,
        "before": "",
        "after": "  // JSON object key order is not content; array positions, keys and values are.\n  function equipmentContentEqual(a,b){\n    if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;\n    if(Array.isArray(a)&&a.length!==b.length)return false;\n    const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equipmentContentEqual(a[key],b[key]));\n  }\n"
      },
      {
        "offset": 14602,
        "before": "    const actual=matches[0],same=(a,b)=>{\n      if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;\n      const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));\n    };\n",
        "after": "    const actual=matches[0],same=equipmentContentEqual;\n"
      },
      {
        "offset": 28081,
        "before": "      if(action==='save'&&(!result.receipt?.savedId||confirmed.control.workflow.saved?.id!==result.receipt.savedId||JSON.stringify(confirmed.control.workflow.saved.content)!==JSON.stringify(confirmed.control.workflow.working))){readUnavailable=true;throw Error('SYNC_CONFIRMATION_REQUIRED');}\n",
        "after": "      if(action==='save'&&(!result.receipt?.savedId||confirmed.control.workflow.saved?.id!==result.receipt.savedId||!equipmentContentEqual(confirmed.control.workflow.saved.content,confirmed.control.workflow.working))){readUnavailable=true;throw Error('SYNC_CONFIRMATION_REQUIRED');}\n"
      },
      {
        "offset": 52688,
        "before": "    const access=await (deliveryRecheck?readClient:sharedTransport()).permissions();\n",
        "after": "    const recheckCurrent=()=>owns()&&inputOwner===retainedOwner&&working===retainedWorking&&syncBase===retainedBase&&nodeDialog===retainedNode&&newEquipmentForm===retainedForm&&sharedClient===readClient&&inputPrincipalCurrent()&&inputTargetCurrent();\n    const acceptRecheck=access=>{\n      const flow=body.control.workflow,draft=body.control.versions?.find(item=>item.id===versionId);\n      return recheckCurrent()&&!(readClient.hasSyncFailures()&&!readClient.hasUnknown())&&Number.isSafeInteger(body.revision)&&Number.isSafeInteger(access.revision)&&access.revision>=body.revision&&access.permissions?.view===true&&access.permissions?.edit===true&&flow?.scope==='routine-equipment'&&flow.generation===retainedOwner.generation&&(!localBeginReceipt||localBeginReceipt.generation===flow.generation)&&!flow.pendingId&&!body.control.versions.some(item=>['pending','pending-test'].includes(item.status))&&draft?.status==='draft'&&Number.isSafeInteger(flow.revision)&&flow.revision>=(control?.workflow?.revision||0)&&body.revision>=revision;\n    };\n    const access=await (deliveryRecheck?readClient.recheckEquipmentDelivery(retainedOwner.generation,recheckCurrent,acceptRecheck):sharedTransport().permissions());\n"
      },
      {
        "offset": 55231,
        "before": "",
        "after": "    if(deliveryRecheck)readClient.confirmEquipmentDelivery(access);\n"
      }
    ]
  },
  {
    "file": "public/process/shared-draft-client.js",
    "beforeHash": "cb5fccf31b25d24751f5d72422cc744a3c6024e9e2142bf55db6189942d12352",
    "afterHash": "0a580dc462943f0acd76dcbee419a0abc5605e0b7d508700fd36cdd3e4ca28d4",
    "beforeLength": 167585,
    "afterLength": 171066,
    "rules": [
      {
        "offset": 95369,
        "before": "    async function request(url,body,readOptions) {\n      if(body?.action==='begin-v1'&&durableBegin){assertBegin(beginRecord);if(body.begin?.operationId!==beginRecord.operationId||JSON.stringify(body.begin.basis)!==JSON.stringify(beginRecord.basis))throw Error('BEGIN_MARKER_CHANGED');}else if(body)assertMutationAdmission();else assertOwner();\n",
        "after": "    async function request(url,body,readOptions,equipmentRecheck) {\n      // Only the private explicit equipment permission read may use its new delivery pin.\n      const assertRequestOwner=()=>{if(equipmentRecheck){if(body||url!==query('permissions=1'))throw Error('EQUIPMENT_DELIVERY_RECHECK_REQUIRED');equipmentRecheck();}else assertOwner();};\n      if(body?.action==='begin-v1'&&durableBegin){assertBegin(beginRecord);if(body.begin?.operationId!==beginRecord.operationId||JSON.stringify(body.begin.basis)!==JSON.stringify(beginRecord.basis))throw Error('BEGIN_MARKER_CHANGED');}else if(body)assertMutationAdmission();else assertRequestOwner();\n"
      },
      {
        "offset": 100522,
        "before": "        assertOwner();\n",
        "after": "        assertRequestOwner();\n"
      },
      {
        "offset": 109696,
        "before": "",
        "after": "    // JSON object key order is not content; array positions, keys and values are.\n    function equipmentContentEqual(a,b){\n      if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;\n      if(Array.isArray(a)&&a.length!==b.length)return false;\n      const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equipmentContentEqual(a[key],b[key]));\n    }\n"
      },
      {
        "offset": 110864,
        "before": "      if(originalPost&&command.action==='save'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.requestId||'')&&Number.isSafeInteger(result.revision)&&result.revision>=0&&postFlow?.scope==='routine-equipment'&&postFlow.generation===command.generation&&postFlow.revision===result.receipt.revision&&postFlow.saved?.id===result.receipt.savedId&&postFlow.pendingId===null&&result.receipt.caseId===null&&JSON.stringify(postFlow.saved.content)===JSON.stringify(postFlow.working))return {...result,equipmentCommand:JSON.parse(JSON.stringify(command))};\n",
        "after": "      if(originalPost&&command.action==='save'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.requestId||'')&&Number.isSafeInteger(result.revision)&&result.revision>=0&&postFlow?.scope==='routine-equipment'&&postFlow.generation===command.generation&&postFlow.revision===result.receipt.revision&&postFlow.saved?.id===result.receipt.savedId&&postFlow.pendingId===null&&result.receipt.caseId===null&&equipmentContentEqual(postFlow.saved.content,postFlow.working))return {...result,equipmentCommand:JSON.parse(JSON.stringify(command))};\n"
      },
      {
        "offset": 120349,
        "before": "",
        "after": "    const equipmentDeliveryChecks=new WeakMap();\n"
      },
      {
        "offset": 121925,
        "before": "",
        "after": "      async recheckEquipmentDelivery(generation,isCurrent,accept){\n        const owner=beginRuntimeOwner,oldDelivery=owner?.delivery,delivery=window.ProcessSync?.captureDelivery?.(),marker=sessionStorage.getItem(key),record=unknown;\n        const failures=[...syncFailures],assertRecheck=()=>{\n          if(!equipmentLocalSave||!durableBegin||endpoint!=='/api/routine-equipment/workflow?caseMetadata=1'||!accessGuard||!owner||owner!==beginRuntimeOwner||owner.delivery!==oldDelivery||!oldDelivery||window.ProcessSync?.isCurrentDelivery?.(oldDelivery)!==false||\n            !departureOwnerCurrent(owner)||owner.identity!==window.ProcessSync?.identity||owner.id!==actorId||\n            !Number.isSafeInteger(owner.epoch)||owner.epoch<0||owner.epoch!==window.ProcessSync?.identityGeneration?.()||\n            clientPagehideGeneration!==transportPagehideGeneration||!delivery||window.ProcessSync?.isCurrentDelivery?.(delivery)!==true||\n            queued||preparedFlights.size||beginPending||retryPending||beginRead||recoveryInvalid||beginOutstanding()||equipmentProjectionRetired||\n            typeof generation!=='string'||!generation||conditionalRead?.flowToken?.slice(0,conditionalRead.flowToken.lastIndexOf(':'))!==generation||record&&record.generation!==generation||unknown!==record||\n            sessionStorage.getItem(key)!==marker||marker!==(record?JSON.stringify(packCommand(record)):null)||\n            syncFailures.size!==failures.length||failures.some(([id,failure])=>syncFailures.get(id)!==failure)||syncFailures.size&&!record||\n            typeof isCurrent!=='function'||isCurrent()!==true||typeof accept!=='function')throw Error('EQUIPMENT_DELIVERY_RECHECK_REQUIRED');\n        };\n        assertRecheck();\n        const result=await request(query('permissions=1'),undefined,{isCurrent,requireAcceptedAccess:true},assertRecheck);\n        assertRecheck();\n        if(result.permissions?.view!==true||result.permissions?.edit!==true||accept(result)!==true)throw Error('EQUIPMENT_DELIVERY_RECHECK_REQUIRED');\n        assertRecheck();\n        equipmentDeliveryChecks.set(result,()=>{assertRecheck();if(accept(result)!==true)throw Error('EQUIPMENT_DELIVERY_RECHECK_REQUIRED');assertRecheck();owner.delivery=delivery;});\n        return result;\n      },\n      confirmEquipmentDelivery(result){\n        const confirm=equipmentDeliveryChecks.get(result);if(!confirm)throw Error('EQUIPMENT_DELIVERY_RECHECK_REQUIRED');\n        equipmentDeliveryChecks.delete(result);\n        // Only this read's private receipt can renew the idle runtime after all\n        // caller checks. Original journal, operations and failures stay untouched.\n        confirm();\n      },\n"
      }
    ]
  }
];
for(const contract of contracts){for(const rule of contract.rules)Object.freeze(rule);Object.freeze(contract.rules);Object.freeze(contract);}Object.freeze(contracts);
function assertCurrent(bytes,file){
 assert(Buffer.isBuffer(bytes),'Equipment repair proof requires raw source bytes');
 const contract=contracts.find(value=>value.file===file);assert(contract,'Equipment repair proof wrong file');
 assert.equal(bytes.length,contract.afterLength,'Equipment repair proof differs from pinned byte length');
 assert.equal(hash(bytes),contract.afterHash,'Equipment repair proof differs from pinned bytes');
 for(const {offset,after}of contract.rules){const span=Buffer.from(after);assert.deepEqual(bytes.subarray(offset,offset+span.length),span,'Equipment repair proof fixed source span changed');}
 return contract;
}
function restorePredecessor(bytes,file){
 const contract=assertCurrent(bytes,file);let result=Buffer.from(bytes);
 for(const {offset,before,after}of [...contract.rules].reverse())result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+Buffer.byteLength(after))]);
 assert.equal(result.length,contract.beforeLength,'Equipment repair proof predecessor length changed');
 assert.equal(hash(result),contract.beforeHash,'Equipment repair proof predecessor bytes changed');return result;
}
module.exports=Object.freeze({contracts,assertCurrent,restorePredecessor});
