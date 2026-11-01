/* Exact FQC-only phase extraction. Undo this one byte span before the older
 * AB inverse; outside-span identity/revocation/auth bytes must still match. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contract={
  "baselineSha256": "d4c7d5b1ab1e002a56b5826ae8508ae842408e84da857d387ee3e3b5607903e1",
  "candidateSha256": "a9ac65e8a0cac0b7346b88e7b33271aa0b10dcdf69ebd99c616c96a220d66937",
  "before": "  const keys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];\r\n  const auth=keys.map(key=>state.values[key]),revision=state.revision;",
  "after": "  return createWorkflowPermissionPhase(request,state);\r\n}\r\n// FQC alone adopts the same request-local phase. Never broaden another route\r\n// through a caller-provided scope or reuse the handle across selected states.\r\nexport async function createFqcPermissionPhase(request:Request,state:State){\r\n  const url=new URL(request.url);\r\n  if(url.pathname!=='/api/fqc/workflow'||url.searchParams.has('scope'))throw Error('INVALID_PERMISSION_PHASE');\r\n  return createWorkflowPermissionPhase(request,state);\r\n}\r\nasync function createWorkflowPermissionPhase(request:Request,state:State){\r\n  const keys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];\r\n  const auth=keys.map(key=>state.values[key]),revision=state.revision;"
};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function withoutFqcPermissionPhase(bytes){
 const before=Buffer.from(contract.before),after=Buffer.from(contract.after),at=bytes.indexOf(after);
 assert(at>=0&&bytes.indexOf(after,at+1)===-1,'FQC auth exact span missing or duplicated');
 const restored=Buffer.concat([bytes.subarray(0,at),before,bytes.subarray(at+after.length)]);
 assert.equal(hash(restored),contract.baselineSha256,'FQC auth outside exact span changed');
 assert.equal(hash(bytes),contract.candidateSha256,'FQC auth candidate bytes changed');
 return restored;
}
function assertFqcPermissionPhaseContract(bytes){
 withoutFqcPermissionPhase(bytes);const span=Buffer.from(contract.after),at=bytes.indexOf(span),mutated=Buffer.from(bytes);mutated[at]^=1;
 for(const changed of [mutated,Buffer.concat([bytes,span]),Buffer.concat([bytes.subarray(0,at),bytes.subarray(at+span.length)]),Buffer.concat([bytes,Buffer.from(' ')]),Buffer.from(bytes.toString().replace(/\r\n/g,'\n'))])assert.throws(()=>withoutFqcPermissionPhase(changed));
 return 5;
}
module.exports={withoutFqcPermissionPhase,assertFqcPermissionPhaseContract};
