// Test-only finite cached predecessor sources. Current removed producers are
// checked in full; no historical callback is installed in application code.
import {execFileSync} from 'node:child_process';
import {assertNoDraftPoll} from './draft-no-poll-fixture.mjs';
export const retiredDraftRef='d4ac309fe05c89288af226b52c18161865ccdcb8';
const modules=new Set(['master-data.js','fqc-master.js','iqc-master.js','ipqc-ab.js','ipqc-c.js','bom-workspace.js','tooling.js']);
export function retiredDraftSource(root,name){if(!modules.has(name))throw Error('UNREGISTERED_RETIRED_DRAFT_SOURCE');assertNoDraftPoll(root,name);return execFileSync('git',['show',retiredDraftRef+':public/process/'+name],{cwd:root,encoding:'utf8'});}
export const isRetiredDraftModule=name=>modules.has(name);
