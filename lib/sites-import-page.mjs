// Metadata-only page gate. Neither Sites headers nor a source/service token
// replace the normal application owner session and permission checks.
import {validateAttemptPolicy} from './snapshot-attempt-policy.mjs';
export function importPageConfiguration(values,projectId){
 const pins={projectId,origin:values.PROCESS_IMPORT_ORIGIN,ownerId:values.PROCESS_IMPORT_OWNER_ID,targetFingerprint:values.PROCESS_IMPORT_TARGET_FINGERPRINT,manifestSha256:values.PROCESS_IMPORT_MANIFEST_SHA256};
 let capacity=null;if(typeof values.PROCESS_IMPORT_CAPACITY_JSON==='string'){try{const parsed=JSON.parse(values.PROCESS_IMPORT_CAPACITY_JSON);if(parsed&&typeof parsed==='object'&&parsed.projectId===projectId&&parsed.targetFingerprint===pins.targetFingerprint)capacity={projectId:parsed.projectId,targetFingerprint:parsed.targetFingerprint,reference:parsed.reference,checkedAt:parsed.checkedAt,r2AvailableBytes:parsed.r2AvailableBytes,d1AvailableBytes:parsed.d1AvailableBytes};}catch{/* Unknown quota remains unavailable. */}}
 let attempt=null;if(values.PROCESS_IMPORT_ATTEMPT_JSON!==undefined){let parsed;try{parsed=JSON.parse(values.PROCESS_IMPORT_ATTEMPT_JSON);}catch{throw Error('IMPORT_ATTEMPT_CONFIGURATION');}attempt=validateAttemptPolicy(parsed,pins);if(values.PROCESS_IMPORT_CAPACITY_JSON!==undefined)throw Error('IMPORT_ATTEMPT_AMBIGUOUS');}
 return{pins,capacity,attempt,bootstrapClosed:values.PROCESS_OWNER_BOOTSTRAP_ENABLED==='0'};
}
