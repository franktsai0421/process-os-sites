// Offline workerd API/semantics probe, not platform memory-limit acceptance.
import {toolingChecksInput} from '../lib/tooling-checks-input';
import {toolingIssues} from '../lib/tooling';
import {toolingIsolatedSnapshot} from '../scripts/tooling-isolated-fixture.mjs';
const fixture={async test(){
 for(const count of [366,1000])for(const distinct of [false,true]){
  const working=toolingIsolatedSnapshot(count),saved=structuredClone(working);if(distinct)saved.tools[0].nameZh='Saved-only fixture';
  const input={revision:5,control:{activeVersionId:'A',versions:[{id:'A',snapshot:working}],workflow:{generation:'G',revision:3,working,active:{content:working},saved:{id:'S',content:saved}}}};
  const original=JSON.parse(JSON.stringify(input));
  const selected=toolingChecksInput(original),expected={working:toolingIssues(original.control.workflow.working),saved:toolingIssues(original.control.workflow.saved.content)};
  const observed={working:toolingIssues(selected.working!),saved:toolingIssues(selected.saved!)};
  if(JSON.stringify(observed)!==JSON.stringify(expected))throw Error('TOOLING_CHECKS_ISSUES_DIFFER');
  if(selected.working!==original.control.workflow.working||selected.saved!==original.control.workflow.saved.content)throw Error('PROJECTION_CLONED_CONTENT');
  const response=Response.json(observed);if((await response.json() as typeof observed).working.length!==expected.working.length)throw Error('RESPONSE_ISSUES_DIFFER');
 }
}};

export default fixture;
