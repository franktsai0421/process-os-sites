/* Exact reversible GET opt-in only. All older source proofs remain unchanged. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const beforeHash='67dfc685a2374aeba0e2c8f3154a3594c69e8526a0201794a29e0ce6ee07c25e',afterHash='0610032b06bbf21ecfc796ab51bf5a4f35d7719f8981338a6549644d14ac104f';
const before=Buffer.from("    const state=await readState({...(query.has('permissions')?{keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode']}:createReadback?{keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode',KEY]}:{}),modelKey:KEY,deferDependencyHistory:true,deferHistory:true,caseId:query.get('caseId'),saveId:query.get('restoreSaveId'),versionId:query.get('versionId')||query.get('legacyVersionId')}),actor=await identity(request,state),permissions=await access(request,state);\r\n"),after=Buffer.from("    // Normal compact workflow reads retain all objects/checks; overlap only GET metadata.\n    const workflowReadAhead=query.get('caseMetadata')==='1'&&query.get('compact')==='1'&&[...query.keys()].every(key=>['since','caseMetadata','compact'].includes(key));\n    const state=await readState({...(workflowReadAhead?{aggregateReadAhead:true}:{}),...(query.has('permissions')?{keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode']}:createReadback?{keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode',KEY]}:{}),modelKey:KEY,deferDependencyHistory:true,deferHistory:true,caseId:query.get('caseId'),saveId:query.get('restoreSaveId'),versionId:query.get('versionId')||query.get('legacyVersionId')}),actor=await identity(request,state),permissions=await access(request,state);\n");
function withoutWorkflowReadAhead(bytes){
 assert(Buffer.isBuffer(bytes),'Workflow read I/O requires raw bytes');
 assert.equal(hash(bytes),afterHash,'Workflow read I/O source differs from pinned bytes');
 const at=bytes.indexOf(after);assert(at>=0&&bytes.indexOf(after,at+after.length)===-1,'Workflow read I/O span must occur exactly once');
 const result=Buffer.concat([bytes.subarray(0,at),before,bytes.subarray(at+after.length)]);
 assert.equal(hash(result),beforeHash,'Workflow read I/O inverse changed frozen source');return result;
}
module.exports={withoutWorkflowReadAhead,beforeHash,afterHash,before,after};
