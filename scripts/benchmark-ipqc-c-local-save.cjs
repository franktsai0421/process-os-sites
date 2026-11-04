/* Synthetic composition benchmark: old per-Apply+Save protocol vs atomic batch. */
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture}=require('./ipqc-c-operation-fixture.cjs');
const initial={schemaVersion:1,activeVersionId:null,source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions:[{id:'initial',number:1,status:'draft',snapshot:{errors:[],items:[]},baseVersionId:null,revision:1,creatorId:'fixture',creatorName:'fixture',createdAt:'fixture',updatedAt:'fixture',history:[]}]};
(async()=>{const h=await fixture({ipqcCMasterControl:JSON.stringify(initial),masterDataControl:JSON.stringify({active:{C:{products:[{code:'C100',stages:['C-CUT']}]}}})});try{
 await h.begin('ipqc-c');await h.command('ipqc-c','apply',{moduleAction:'create-error',input:{productCode:'C100',stageCode:'C-CUT',name:'initial'}});
 const flow=h.flow(await h.read('ipqc-c')),id=flow.working.errors[0].id,base=h.snapshot(),objects=new Map(h.objects),samples={sequential:[],atomic:[]};
 const changes=Array.from({length:10},(_,i)=>({patches:[{op:'set',path:['errors',{id},'name'],value:'value-'+i}],guards:[{path:['errors',{id},'name'],value:i?'value-'+(i-1):'initial'}]}));
 const call=command=>h.call('ipqc-c/workflow','POST',{command},'editor',200,'?caseMetadata=1');
 for(let run=0;run<6;run++)for(const mode of ['sequential','atomic']){
 h.db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1').run(base.row.revision,base.row.values,base.row.updated_at);h.objects.clear();for(const [key,value]of objects)h.objects.set(key,value);
 let sequence=0;const command=(action,fields={})=>({action,operationId:randomUUID(),clientId:'benchmark-client',generation:flow.generation,sequence:++sequence,...fields});
 const started=performance.now();let result;if(mode==='sequential'){for(const change of changes)await call(command('apply',change));result=await call(command('save'));}else result=await call(command('save',{localChanges:changes}));
 const elapsed=performance.now()-started;assert.equal(result.control.workflow.saved.content.errors[0].name,'value-9');const writes=result.revision-base.row.revision;assert.equal(writes,mode==='atomic'?1:11);if(run)samples[mode].push({ms:elapsed,cas:writes});
 }
 const summary=Object.fromEntries(Object.entries(samples).map(([mode,rows])=>[mode,{medianMs:rows.map(r=>r.ms).sort((a,b)=>a-b)[2],cas:rows[0].cas,samples:rows.map(r=>Number(r.ms.toFixed(2)))}]));console.log(JSON.stringify({rounds:5,edits:10,summary,limits:'In-process actual handlers, synthetic SQLite/R2; excludes browser, network, photos and live Site latency'},null,2));
 }finally{h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
