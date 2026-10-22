// Explicit owner choice for this local, inherited-ACL output. Not a sharing grant.
import path from 'node:path';
export function validateR1LocalDestination(receipt,expected){
 if(!receipt||receipt.format!=='PROCESS_OS_OWNER_ACCEPTED_LOCAL_DESTINATION_V1'||typeof receipt.path!=='string'||path.resolve(receipt.path)!==path.resolve(expected)||receipt.mode!=='existing-inherited-acl-owner-accepted'||receipt.userConfirmedNoSync!==true||receipt.otherLocalReadersAccepted!==true||receipt.inheritancePreserved!==true||receipt.aclChanged!==false||receipt.privateByACL!==false)throw Error('R1_OWNER_ACCEPTED_LOCAL_DESTINATION_REQUIRED');
 return {path:expected,mode:receipt.mode,userConfirmedNoSync:true,otherLocalReadersAccepted:true,inheritancePreserved:true,aclChanged:false,privateByACL:false};
}
