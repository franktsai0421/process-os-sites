import {DraftConflict} from './shared-draft';

export type ResetStage='read_state'|'authorize'|'receipt'|'recheck'|'target'|'prepare_reset'|'encode_state'|'commit';
const stages:readonly string[]=['read_state','authorize','receipt','recheck','target','prepare_reset','encode_state','commit'];

// Fixed vocabulary only. Never serialize an exception or derive labels from its text.
// Logging must not change the public response or the operation's persistence behavior.
export function resetDiagnostic(operation:'read'|'write',stage:ResetStage,error:unknown){
  try {
    const category=error instanceof DraftConflict?'draft_conflict':error instanceof SyntaxError?'syntax_error':error instanceof TypeError?'type_error':'unknown';
    console.error(JSON.stringify({event:'routine_reset_diagnostic',version:1,
      operation:operation==='read'?'read':'write',stage:stages.includes(stage)?stage:'unknown',category}));
  }catch{/* Observability failure cannot affect Reset. */}
}
