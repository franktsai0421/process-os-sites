/* Exact inverse for the create-item read/encode and final revocation spans.
 * Keep the older Save/permission contracts unchanged after this inverse. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const beforeHash="5f79d4070f7e6028ab3916e52d4c04caf8a32ed5017be16f42023af578473d5b",afterHash="349b5978459c5d9cd14fa1f8353cf3c2af6696dd603e8f2ad93fae5085a146eb";
const rules=[
  {
    "offset": 0,
    "before": "",
    "after": "import {ipqcCCreateCommand,readIpqcCCreateMutationState,encodeIpqcCCreateMutationState} from '@/lib/ipqc-c-create-record-mutation';\r\n"
  },
  {
    "offset": 11271,
    "before": "      const state=saveMutationState||await readState({modelKey:KEY,deferDependencyHistory:true,deferHistory:true,allocationKey:['create-error','create-item'].includes(body.command?.moduleAction||'')?KEY:undefined,caseId:body.command?.caseId,saveId:body.command?.restoreSaveId}),actor=await identity(request,state);streamRecords=!!state.recordStorage;\r\n",
    "after": "      const createMutationState=body.action===undefined&&Object.keys(body).every(key=>key==='command')&&ipqcCCreateCommand(body.command)?await readIpqcCCreateMutationState(body.command):null;\r\n      const state=createMutationState||saveMutationState||await readState({modelKey:KEY,deferDependencyHistory:true,deferHistory:true,allocationKey:['create-error','create-item'].includes(body.command?.moduleAction||'')?KEY:undefined,caseId:body.command?.caseId,saveId:body.command?.restoreSaveId}),actor=await identity(request,state);streamRecords=!!state.recordStorage;\r\n"
  },
  {
    "offset": 18484,
    "before": "",
    "after": "      const encoded=await (createMutationState?encodeIpqcCCreateMutationState(state,values,prepared):saveMutationState?encodeIpqcCSaveMutationState(state,values,prepared):encodeValues(values,state,prepared));\r\n      // Recheck session revocation after slow photo/immutable storage I/O.\r\n      // Account/permission changes remain fenced by the state revision CAS.\r\n      if(ipqcCCreateCommand(body.command)&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);\r\n"
  },
  {
    "offset": 19098,
    "before": "        .bind(state.revision+1,await (saveMutationState?encodeIpqcCSaveMutationState(state,values,prepared):encodeValues(values,state,prepared)),at,state.revision).run();\r\n",
    "after": "        .bind(state.revision+1,encoded,at,state.revision).run();\r\n"
  }
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function withoutCreateMutation(bytes){
 assert.equal(hash(bytes),afterHash,'Create C source differs from pinned bytes');let result=Buffer.from(bytes);
 for(const {offset,before,after} of [...rules].reverse()){
  const expected=Buffer.from(after);assert.deepEqual(result.subarray(offset,offset+expected.length),expected);
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+expected.length)]);
 }
 assert.equal(hash(result),beforeHash,'Create C inverse changed historical source');return result;
}
function assertCreateMutationContract(bytes){
 const normalized=withoutCreateMutation(bytes);let negatives=0;
 for(const {offset,after}of rules){const length=Buffer.byteLength(after),left=bytes.subarray(0,offset),right=bytes.subarray(offset+length);for(const changed of [Buffer.concat([left,right]),Buffer.concat([left,Buffer.from(after),Buffer.from(after),right]),Buffer.concat([left,right,Buffer.from(after)])]){assert.throws(()=>withoutCreateMutation(changed),/Create C source differs/);negatives++;}}
 const changed=Buffer.from(bytes);changed[changed.indexOf(Buffer.from('sameOrigin'))]^=1;assert.throws(()=>withoutCreateMutation(changed),/Create C source differs/);return{normalized,negativeCases:negatives+1};
}
module.exports={withoutCreateMutation,assertCreateMutationContract};
