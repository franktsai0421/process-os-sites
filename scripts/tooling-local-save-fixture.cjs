/* Isolated actual handlers; no external service or business data. */
const fixture=require('./fqc-apply-fixture.cjs');
module.exports=async()=>{
 const f=await fixture();
 const tool=id=>({id,code:'DC01-'+id,nameVi:'Khuôn '+id,nameZh:'模具 '+id,categoryId:'cat',assetCode:'SYN',specification:'Synthetic',quantity:1,unit:'PCS',manufacturerId:'',location:{kind:'internal',holderId:'holder'},inboundDate:'2026-01-01',inboundDateLost:false,enabled:true,inactiveReason:'',archived:false,archiveReason:'',notes:'',frequencyMonths:12,photos:[],iqcIds:[]});
 const snapshot={tools:[tool('one'),tool('two')],categories:[{id:'cat',code:'DC01',nameVi:'Synthetic'}],custodians:[{id:'holder',nameVi:'Synthetic holder'}],suppliers:[],manufacturers:[],transfers:[]};
 await f.mutate(values=>{const users=JSON.parse(values.platformUsers);for(const u of users){for(const op of ['view','edit','create','delete'])u.accessOverrides['tooling.'+op]=true;for(const op of ['save','submit','withdraw','approve','return'])u.accessOverrides['tooling.'+op]=false;}values.platformUsers=JSON.stringify(users);values.toolingMasterControl=JSON.stringify({schemaVersion:1,activeVersionId:'active-tooling',versions:[{id:'active-tooling',number:1,status:'approved',snapshot}],reservedCodes:{categories:['DC01'],tools:['DC01-one','DC01-two']}});values.iqcMasterControl=JSON.stringify({schemaVersion:1,activeVersionId:'iqc-active',versions:[{id:'iqc-active',status:'approved',snapshot:{categories:[],suppliers:[],errors:[],items:[],parts:[{id:'part',code:'SYN-PART',nameVi:'Synthetic part',isEnabled:true,photos:[]}]}}]});});
 const api=f.load('app/api/tooling/workflow/route.ts'),origin='https://synthetic.invalid';
 async function call(body,actor='editor',query=''){const r=await api[body?'POST':'GET'](new Request(origin+'/api/tooling/workflow?caseMetadata=1'+query,{method:body?'POST':'GET',headers:{cookie:f.cookies[actor],origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,body:await r.json()};}
 const read=async()=>JSON.parse((await f.core.readState()).values.toolingMasterControl);
 const rights=async(actor,changes)=>f.mutate(values=>{const users=JSON.parse(values.platformUsers);for(const [key,value]of Object.entries(changes))users.find(u=>u.id===actor).accessOverrides['tooling.'+key]=value;values.platformUsers=JSON.stringify(users);});
 return {...f,api,call,read,tool,snapshot,rights};
};
