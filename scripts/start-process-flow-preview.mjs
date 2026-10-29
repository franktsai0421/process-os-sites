import {randomUUID} from 'node:crypto';
import {createProcessMasterFixture} from '../tests/process-master-cloud-fixture.mjs';
import {pngFixture} from '../tests/photo-fixtures.mjs';
const fixture=await createProcessMasterFixture();
try {
 const photo={src:'data:image/png;base64,'+pngFixture({width:640,height:320,alpha:true}).toString('base64'),name:'synthetic-preview.png',type:'image/png'};
 await fixture.mutateSyntheticValues(values=>{
  const root=JSON.parse(values.masterDataControl);
  for(const snapshot of [root.active.PROCESS,...root.versions.filter(v=>v.scope==='PROCESS').map(v=>v.snapshot)])for(const templates of Object.values(snapshot))templates.forEach((row,index)=>{if(!row.presetKey)row.editorType=['machine','inspection','manual','custom'][index%4];if(index===0)row.mediaItems=[photo];if(row.equipment)row.equipment[0].mediaItems=[photo];});
  values.masterDataControl=JSON.stringify(root);values.processMasterData=JSON.stringify(root.active.PROCESS);
 });
 await fixture.adoptAuthoring();
 const origin=fixture.url.origin,cookies=new Map();let sequence=0;
 for(const id of ['frank','reviewer']){const response=await fixture.mf.dispatchFetch(origin+'/api/platform-login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({id,password:fixture.password})});if(response.status!==200)throw Error('PREVIEW_LOGIN_FAILED');cookies.set(id,response.headers.get('Set-Cookie').split(';')[0]);}
 const endpoint=origin+'/api/master/workflow?scope=PROCESS';
 const request=async(actor,body)=>{const response=await fixture.mf.dispatchFetch(endpoint,{method:body?'POST':'GET',headers:{Cookie:cookies.get(actor),Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(response.status!==200)throw Error('PREVIEW_SEED_FAILED_'+response.status);return response.json();};
 await request('frank',{action:'begin'});
 async function command(actor,action,detail={}){const data=await request(actor);return request(actor,{command:{operationId:randomUUID(),clientId:'preview-seed',sequence:++sequence,generation:data.control.workflow.generation,action,...detail}});}
 const path=['A-CUT',{id:'A-CUT-CUSTOM-1'},'name'];
 await command('frank','apply',{patches:[{op:'set',path,value:'隔離待修流程'}],guards:[{path,value:'隔離流程 1'}]});
 const saved=await command('frank','save'),savedId=saved.control.workflow.saved.id;
 const first=await command('frank','submit',{savedId,reason:'合成退回案例'});
 await command('reviewer','return',{caseId:first.receipt.caseId,reason:'合成案例：請補照片說明'});
 const second=await command('frank','submit',{savedId,reason:'合成撤回案例'});
 await command('frank','withdraw',{caseId:second.receipt.caseId,reason:'合成案例：送審者撤回'});
 console.log(JSON.stringify({name:'流程資料驗收副本 CLOUD 29102026',status:'READY_ISOLATED_PREVIEW',port:fixture.url.port,programCommit:process.env.PROCESS_PROGRAM_COMMIT,composition:{flow:'74ab03f',photos:'19855a0'},realData:false}));
 let stopping=false;
 const stop=async()=>{if(stopping)return;stopping=true;await fixture.close();process.exit(0);};
 process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
}catch(error){await fixture.close();throw error;}
