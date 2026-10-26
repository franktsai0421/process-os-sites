/* Disabled periodic-backup contract: no storage or complete-state reads. */
const assert=require('node:assert/strict');
const env={DB:{prepare(){throw Error('periodic backup must not query D1');}},STATE_ARCHIVE:{get(){throw Error('periodic backup must not read R2');},put(){throw Error('periodic backup must not write R2');}}};
const core=require('./ipqc-ab-import-harness.cjs')(env)('lib/process-state.ts');
(async()=>{let fullReads=0;for(const state of [{revision:1,values:{backupSettings:'{"enabled":true}'}},{revision:1,values:{},deliveryOnly:true}]){assert.equal((await core.scheduledBackup(state,async()=>{fullReads++;throw Error('must not load');})).status,'disabled');}assert.equal(fullReads,0);console.log(JSON.stringify({status:'PASS_SCHEDULED_BACKUP_DISABLED',d1Reads:0,r2Reads:0,writes:0,fullReads}));})().catch(e=>{console.error(e);process.exitCode=1;});
