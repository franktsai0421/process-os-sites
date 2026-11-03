// Failure-only diagnostics: stable categories, never raw exception text, state,
// request bodies, cookies, object keys or stack traces. The HTTP contract stays 500.
const reasons = new Map([
 ['Invalid record manifest','RECORD_MANIFEST_INVALID'],
 ['Invalid FQC required manifest','REQUIRED_MANIFEST_INVALID'],
 ['Invalid FQC inline authority','INLINE_AUTHORITY_INVALID'],
 ['Invalid FQC authority body','AUTHORITY_BODY_INVALID'],
 ['Invalid immutable record reference','RECORD_REFERENCE_INVALID'],
 ['Immutable record missing','RECORD_MISSING'],
 ['Immutable record corrupt','RECORD_INTEGRITY_FAILED'],
 ['Invalid FQC required workflow','WORKFLOW_STRUCTURE_INVALID'],
 ['FQC authorization basis changed','AUTHORIZATION_BASIS_CHANGED'],
 ['FQC selected manifest changed','SELECTED_MANIFEST_CHANGED'],
 ['Invalid FQC required mutation binding','MUTATION_BINDING_INVALID'],
 ['Invalid FQC sealed adapter result','ADAPTER_RESULT_CHANGED'],
 ['FQC projection differs from its adapter result','PROJECTION_MISMATCH'],
 ['Invalid FQC required mutation handle','MUTATION_HANDLE_INVALID'],
 ['Untrusted immutable record reference','UNTRUSTED_RECORD_REFERENCE'],
 ['Current state is missing; explicit initialization is required','STATE_MISSING'],
]);
export function fqcWriteFailureReason(error:unknown):string {
 return error instanceof Error ? reasons.get(error.message)||'UNCLASSIFIED_EXCEPTION' : 'NON_ERROR_EXCEPTION';
}
