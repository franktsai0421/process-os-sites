import {applyDraftCommand,cloneDraft,DraftConflict,sameDraftValue,type DraftCommand,type DraftContext,type SharedDraft} from './shared-draft';

export const CANVAS_SAVE_ACTION='save-canvas-v1';

// The surrounding workflow route commits this result once. The ordinary Apply
// checks run first, including replay fingerprint, guards, structure and locks.
// No intermediate shared working state or second operation is persisted.
export function applyProcessCanvasSave<T>(source:SharedDraft<T>,command:DraftCommand,context:DraftContext<T>){
 if(!context.allowed('save'))throw new DraftConflict('FORBIDDEN',403);
 const result=applyDraftCommand(source,command,context);
 if(source.receipts[command.operationId])return result;
 const state=result.state,saveUnchanged=!!state.saved&&sameDraftValue(state.saved.content,state.working);
 if(!saveUnchanged){
  if(result.receipt.unchanged){state.revision++;result.receipt.revision=state.revision;}
  state.saved={id:context.id(),actor:cloneDraft(context.actor),at:context.at,revision:state.revision,
   content:cloneDraft(state.working),contributors:cloneDraft(state.contributors),
   ...(command.reason?.trim()?{reason:command.reason.trim()}:{}),...(command.source?.trim()?{source:command.source.trim()}:{})};
  state.saves.push(state.saved);
  state.contributors={};
 }
 result.receipt.savedId=state.saved!.id;
 result.receipt.unchanged=result.receipt.unchanged&&saveUnchanged;
 state.receipts[command.operationId]={...state.receipts[command.operationId],result:cloneDraft(result.receipt)};
 return result;
}
