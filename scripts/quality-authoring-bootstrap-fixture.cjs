// Generated 12 MB approved authoring data; owned isolated storage only.
const {randomUUID}=require('node:crypto'),fixture=require('./fqc-apply-fixture.cjs');
async function setup(){const f=await fixture();await f.mutate(values=>{
 const keys=require('../public/process/access-policy.mjs').accessKeys,users=JSON.parse(values.platformUsers);for(const u of users){u.role='admin';u.lines=['A','B','C'];for(const key of keys)u.accessOverrides[key]=true;}values.platformUsers=JSON.stringify(users);
 const rows=Array.from({length:1000},(_,i)=>({id:'op'+i,name:'Operation '+i,stageCode:'S',productCodes:[],nextIds:[],instructionSteps:[{text:'Synthetic instruction '.repeat(570)}]}));
 const content={workspaces:[{id:JSON.stringify(['Synthetic','A']),category:'Synthetic',line:'A',stages:{S:rows}}]},workflow=f.load('lib/shared-draft.ts').createSharedDraft('process:platform',content,'approved',randomUUID());
 values.processAuthoringControl=JSON.stringify({activeVersionId:'approved',versions:[{id:'approved',number:1,status:'approved',snapshot:content,revision:1,history:[]},{id:'draft',number:2,status:'draft',snapshot:content,revision:0,history:[]}],workflow});
 values.masterDataControl=JSON.stringify({active:{AB:{products:[],lines:[{code:'A',stages:[{code:'S'}]}],categoryGroups:[]},C:{products:[],lines:[],categoryGroups:[]},PROCESS:{}},versions:[]});values.bomOverrides=JSON.stringify({replaceAll:true,data:{}});
 });return f;}
module.exports=setup;
