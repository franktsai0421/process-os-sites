/* Synthetic actual-handler fixture; SQLite/R2 and ephemeral actors only. */
const {randomUUID}=require('node:crypto');
module.exports=async({format='records'}={})=>{
 const f=await require('../scripts/fqc-apply-fixture.cjs')({format}),D=await import('../public/process/bom-domain.mjs');
 const sheets=[{name:'ERP',rows:[D.columns,['ROOT','0','','ROOT','Root 中文','Spec','pc','1','1','0'],['ROOT','1','0010','PART','Tên Việt','Part spec','ea','2','1','3'],['ROOT','2','0020','DEEP','Deep','Deep spec','kg','','','']]}],snapshot={bom:D.parseMatrices(sheets),referenceIssues:[]};
 await f.mutate(values=>{const users=JSON.parse(values.platformUsers);for(const user of users){for(const op of ['view','edit','submit','withdraw','approve','return','exchange'])user.accessOverrides['bom.'+op]=true;user.accessOverrides['bom.save']=false;}values.platformUsers=JSON.stringify(users);values.bomMasterControl=JSON.stringify({schemaVersion:1,activeVersionId:'bom-active',versions:[{id:'bom-active',number:1,status:'approved',snapshot,revision:1,history:[]}]});values.bomOverrides=JSON.stringify({__format:'PROCESS_OS_BOM_OCCURRENCES_V3',replaceAll:true,data:snapshot.bom});});
 const api=f.load('app/api/bom/workflow/route.ts'),url='https://synthetic.invalid/api/bom/workflow?caseMetadata=1';
 async function call(body,actor='editor',query=''){const response=await api[body?'POST':'GET'](new Request(url+query,{method:body?'POST':'GET',headers:{origin:'https://synthetic.invalid',cookie:f.cookies[actor],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return{status:response.status,body:await response.json()};}
 const read=async()=>JSON.parse((await f.core.readState()).values.bomMasterControl),row=()=>f.db.prepare('SELECT * FROM shared_state WHERE id=1').get();
 const begun=await call({action:'begin'});if(begun.status!==200)throw Error(JSON.stringify(begun));
 let sequence=0;const command=(operations,extra={})=>({action:'save',moduleAction:'save-local-v1',input:{operations},operationId:randomUUID(),clientId:'bom-synthetic',sequence:++sequence,generation:begun.body.control.workflow.generation,...extra});
 const manual=(field,value,base,index=1)=>{const path=['bom','ROOT',{id:snapshot.bom.ROOT[index].id},field];return{patches:[{op:'set',path,value}],guards:[{path,value:base}]};};
 async function importing(bom,changes,{legacy=false}={}){const matrices=structuredClone(sheets);for(const [index,field,value]of changes)matrices[0].rows[index+1][D.fields.indexOf(field)]=value;const incoming=D.parseMatrices(matrices),batch=D.compare(bom,incoming);return{moduleAction:'import-digiwin',input:{sheets:matrices,baseDigest:await D.semanticDigest(bom),decisions:batch.changes.map(()=>({decision:'accept'})),...(legacy?{}:{importMode:'incremental-v1'})}};}
 return{...f,D,sheets,snapshot,api,call,read,row,command,manual,importing};
};
