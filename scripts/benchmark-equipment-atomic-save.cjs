/* oxlint-disable typescript/no-require-imports -- Local synthetic benchmark and child fixtures. */
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const baselineRef='0af6d57e912e5615250959c9e76210fecd55d96b';
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
async function sample(mode){const {fixture}=require('./equipment-atomic-fixture.cjs'),h=await fixture();try{
 const initial=await h.state(),field=['equipment',{id:'source'},'name'],patches=[{op:'set',path:field,value:'Synthetic measured edit'}],guards=[{path:field,value:initial.workflow.working.equipment[0].name}],generation=initial.workflow.generation;let sequence=0;
 const send=async(action,detail={})=>{const command={action,operationId:randomUUID(),clientId:'benchmark-equipment',sequence:++sequence,generation,...detail},r=await h.call('/api/routine-equipment/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command})});assert.equal(r.status,200,await r.clone().text());return r.json();};
 const start=performance.now();if(mode==='before'){await send('apply',{patches,guards});await send('save');}else await send('save',{moduleAction:'save-local-v1',patches,guards});const wallMs=performance.now()-start;
 const result=await h.state();assert.equal(result.workflow.saved.content.equipment[0].name,'Synthetic measured edit');assert.deepEqual(result.workflow.saved.content,result.workflow.working);
 return {mode,workflowPOSTs:h.requests.filter(r=>r.method==='POST').length,verificationGETs:h.requests.filter(r=>r.method==='GET').length,handlerMs:+h.requests.reduce((sum,r)=>sum+r.ms,0).toFixed(3),wallMs:+wallMs.toFixed(3)};
 }finally{h.close();}}
(async()=>{
 if(process.argv[2]==='--sample'){assert(['before','atomic'].includes(process.argv[3]));console.log(JSON.stringify(await sample(process.argv[3])));return;}
 const root=process.cwd(),baselineRoot=process.env.EQUIPMENT_BASELINE_ROOT;assert(baselineRoot,'EQUIPMENT_BASELINE_ROOT must be a source-only archive of the pinned base');
 for(const file of ['lib/equipment-workflow.ts','lib/routine-equipment.ts','lib/versioned-shared-workflow.ts','app/api/routine-equipment/workflow/route.ts'])assert.deepEqual(fs.readFileSync(path.join(baselineRoot,file)),execFileSync('git',['show',baselineRef+':'+file]),'exact baseline source '+file);
 const samples=[];for(let pair=0;pair<5;pair++)for(const mode of pair%2?['atomic','before']:['before','atomic']){
 const env={...process.env,NODE_PATH:path.join(root,'node_modules'),IPQCC_OPERATION_SOURCE_ROOT:mode==='before'?baselineRoot:root};
 const output=execFileSync(process.execPath,[__filename,'--sample',mode],{cwd:root,env,encoding:'utf8'}),result=JSON.parse(output.trim().split('\n').at(-1));samples.push({pair,...result});}
 const summary=Object.fromEntries(['before','atomic'].map(mode=>{const rows=samples.filter(r=>r.mode===mode);return[mode,{n:rows.length,workflowPOSTs:rows[0].workflowPOSTs,verificationGETs:rows[0].verificationGETs,medianWallMs:+median(rows.map(r=>r.wallMs)).toFixed(3),medianHandlerMs:+median(rows.map(r=>r.handlerMs)).toFixed(3)}];}));
 console.log(JSON.stringify({status:'PASS_SYNTHETIC_EQUIPMENT_SAVE_MEASUREMENT',beforeRef:baselineRef,afterHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),samples,summary,scope:'Pinned baseline Apply+Save versus candidate atomic Save. Separate child processes, identical isolated records-v1 SQLite/R2 setup: 1 category/subcategory/group, 2 tools, 1 changed field, no photo upload/network delay. Five alternating pairs; no warmup. Setup excluded. Exact normal POST authority; lost-ACK recovery GET measured separately by tests. Not hosted or business-data latency.'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
