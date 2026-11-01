// Exact independently reviewed deltas only. Historical pins are unchanged.
// Missing, duplicate, moved, inside/outside-byte and EOL changes fail closed.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contracts={
  "app/api/ipqc-c/workflow/route.ts": {
    "baselineCommit": "268a8e49ec751bb6849033e20a27d30194aad67c",
    "baselineHash": "5f79d4070f7e6028ab3916e52d4c04caf8a32ed5017be16f42023af578473d5b",
    "candidateHash": "36c205d2f618cd05579362dea758a4a3c72230fd3f7398a55a007f14865802b9",
    "outsideMarker": "export async function POST(",
    "rules": [
      {
        "name": "records scope import",
        "offset": 0,
        "before": "",
        "after": "import {readScopedWorkflowState} from '@/lib/scoped-workflow-read';\n"
      },
      {
        "name": "records GET selection and HEAD compatibility",
        "offset": 4235,
        "before": "    const state=await readState({...(query.has('permissions')?{keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode']}:{}),modelKey:KEY,deferDependencyHistory:true,deferHistory:true,caseId:query.get('caseId'),saveId:query.get('restoreSaveId'),versionId:query.get('versionId')||query.get('legacyVersionId')}),actor=await identity(request,state),permissions=await access(request,state);\r\n",
        "after": "    const state=(request.method==='GET'?await readScopedWorkflowState(request,'ipqc-c-workflow'):null)||await readState({...(query.has('permissions')?{keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode']}:{}),modelKey:KEY,deferDependencyHistory:true,deferHistory:true,caseId:query.get('caseId'),saveId:query.get('restoreSaveId'),versionId:query.get('versionId')||query.get('legacyVersionId')}),actor=await identity(request,state),permissions=await access(request,state);\n"
      }
    ]
  }
};
function inverse(file,bytes,baseline){
 const spec=contracts[file];assert(spec,'Unexpected exact contract file');
 if(baseline)assert.equal(hash(baseline),spec.baselineHash,'Exact contract baseline changed');
 assert.equal(hash(bytes),spec.candidateHash,'Exact contract candidate changed');
 let restored=Buffer.from(bytes);
 for(const rule of [...spec.rules].reverse()){
  const after=Buffer.from(rule.after),before=Buffer.from(rule.before),at=rule.offset;
  assert(after.length>0);assert.deepEqual(restored.subarray(at,at+after.length),after,'Exact span content/position changed: '+rule.name);
  assert.equal(restored.indexOf(after),at,'Exact span not at unique position');assert.equal(restored.indexOf(after,at+1),-1,'Exact span repeated');
  restored=Buffer.concat([restored.subarray(0,at),before,restored.subarray(at+after.length)]);
 }
 assert.equal(hash(restored),spec.baselineHash,'Unreviewed bytes outside exact spans');if(baseline)assert.deepEqual(restored,baseline);return restored;
}
function negatives(file,bytes,baseline){
 const spec=contracts[file];baseline ||= inverse(file,bytes);
 assert.deepEqual(inverse(file,bytes,baseline),baseline);let count=0;
 const reject=changed=>{assert.throws(()=>inverse(file,changed,baseline));count++;};
 for(const rule of spec.rules){
  const at=rule.offset,after=Buffer.from(rule.after),left=bytes.subarray(0,at),right=bytes.subarray(at+after.length),mutated=Buffer.from(after);mutated[0]^=1;
  reject(Buffer.concat([left,mutated,right]));reject(Buffer.concat([left,right]));reject(Buffer.concat([left,after,after,right]));reject(at===0?Buffer.concat([left,right,after]):Buffer.concat([after,left,right]));
 }
 const outside=bytes.indexOf(Buffer.from(spec.outsideMarker));assert(outside>=0&&spec.rules.every(rule=>outside<rule.offset||outside>=rule.offset+Buffer.byteLength(rule.after)));
 const changed=Buffer.from(bytes);changed[outside]^=1;reject(changed);reject(Buffer.from(bytes.toString().includes('\r\n')?bytes.toString().replace(/\r\n/g,'\n'):bytes.toString().replace(/\n/g,'\r\n')));
 assert.throws(()=>inverse(file,bytes,Buffer.concat([baseline,Buffer.from(' ')])));count++;
 return count;
}
const file='app/api/ipqc-c/workflow/route.ts';
module.exports={withoutScopedWorkflowReadScope:(bytes,baseline)=>inverse(file,bytes,baseline),assertScopedWorkflowReadScopeContract:(bytes,baseline)=>negatives(file,bytes,baseline)};
