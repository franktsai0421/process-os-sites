import historical from '../historical-source-fixture.cjs';
import './poll-wiring-retired.test.mjs';
// Retired draft timers are tested as absent in the complete shipped initializers.
// Generic foreground scheduling and pinned historical history/restore security remain tested.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import './foreground-poll.test.mjs';
import {draftModules,assertNoDraftPoll,assertDraftInitializerIdle,assertLivePermissionTimers,assertDirtyFlushRetained} from './draft-no-poll-fixture.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),modules=[];
for(const name of draftModules){modules.push(await assertDraftInitializerIdle(root,name));console.log('PASS '+name+' full initializer/events have no draft scheduler');}
for(const text of ['setInterval(()=>read(),4000);','window.createForegroundPoll();','renamed.schedule(()=>read());','session.schedule(()=>{matrixSnapshot();return transport.read();});'])assert.throws(()=>assertNoDraftPoll(root,'negative-probe.js',text),/retired|hide a draft reader/);
const permissionCases=await assertLivePermissionTimers(root,historical.readPublic('history_frozen','shared-draft-client.js')),dirtyFlushCases=assertDirtyFlushRetained(root);
console.log(JSON.stringify({status:'PASS_CURRENT_POLL_WIRING',modules,permissionCases,dirtyFlushCases,negativeProbes:4,actualInitializers:true,syntheticBootstrapPorts:true,browser:false,network:false}));
await import('../../tests/equipment-no-poll.test.mjs');
