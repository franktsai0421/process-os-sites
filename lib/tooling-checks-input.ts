import type {ToolingControl} from './tooling-workflow';

type ChecksPayload={control:ToolingControl;revision:number};
// Full workflow transport and validation stay unchanged. This readonly projection
// retains the two inspected snapshots, not unused versions/active/case branches.
export function toolingChecksInput({control,revision:stateRevision}:ChecksPayload){
 const flow=control.workflow;
 return {stateRevision,activeVersionId:control.activeVersionId,savedId:flow?.saved?.id||null,generation:flow?.generation,revision:flow?.revision,
  hasWorkflow:!!flow,hasSaved:!!flow?.saved,working:flow?.working,saved:flow?.saved?.content};
}
