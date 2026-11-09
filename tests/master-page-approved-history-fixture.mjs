// Actual new-page routes, immutable records and signed sessions. Synthetic state only.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),runtime=require('../scripts/test-master-page-runtime.cjs'),copy=structuredClone;
export async function setup(page,{records=true,legacyCount=22}={}){
 const f=await runtime(records),at='2026-11-09T00:00:00.000Z';let control=await f.begin(page);
 const path=page==='LINES'?['AB','lines',{id:'line-A'},'name']:['categoryGroups'];
 const patch=page==='LINES'?{op:'set',path,value:'IMMUTABLE_NEW_LINES'}:{op:'insert',path,value:{id:'approved-group-'+page,line:page==='C'?'C':'A',name:'IMMUTABLE_NEW_'+page,defaultStages:[]}};
 const guards=page==='LINES'?[{path,value:'A'}]:[{path:['products'],value:[]}];
 let result=await f.send(page,{command:f.save(control,[{patches:[patch],guards}])});assert.equal(result.status,200,JSON.stringify(result));control=result.body.control;
 result=await f.send(page,{command:f.command(control,'submit',{savedId:control.workflow.saved.id,expectedRevision:control.workflow.revision,reason:'Synthetic page review'})});assert.equal(result.status,200,JSON.stringify(result));control=result.body.control;
 const approvedId=control.workflow.pendingId;result=await f.send(page,{command:f.command(control,'approve',{caseId:approvedId,expectedRevision:control.workflow.revision,reason:'Synthetic reviewer approval'})},'reviewer');assert.equal(result.status,200,JSON.stringify(result));
 const root=await f.readRoot();
 for(const part of ['AB','C']){
  const old=root.workflowScopes[part],actor={id:'writer',name:'Synthetic writer'},reviewer={id:'reviewer',name:'Synthetic reviewer'},id='old-case',content={products:[{id:'old-product',code:part+'-OLD',name:'IMMUTABLE_OLD_'+part,line:part==='C'?'C':'A',category:'Original',stages:[]}],lines:[{id:'old-line-'+part,code:part==='C'?'C':'A',name:'OLD_TOPOLOGY_'+part,stages:[]}],categoryGroups:[]};
  old.cases.push({id,savedId:'old-save',baseId:old.baseId,actor,at,reason:'Old review',status:'approved',content:copy(content),before:copy(old.working),result:{actor:reviewer,at,reason:'Old approval'}});
  root.versions.push({id,scope:part,number:2,status:'superseded',snapshot:{...copy(content),products:[{...content.products[0],name:'MUTABLE_NUMERIC_COPY'}]},baseVersionId:old.baseId,revision:1,creatorId:actor.id,creatorName:actor.name,createdAt:at,updatedAt:at,history:[]});
  for(let i=0;i<legacyCount;i++)root.versions.push({id:'old-'+i,scope:part,number:i+3,status:'superseded',snapshot:{...copy(content),products:[{...content.products[0],name:part+'_LEGACY_'+i}]},revision:1,creatorId:actor.id,creatorName:actor.name,createdAt:at,updatedAt:at,history:[{action:'approved',actorId:reviewer.id,actorName:reviewer.name,at}]});
  for(const [id,history]of [['unapproved',[]],['shared-old',[{action:'approved',actorId:reviewer.id,actorName:reviewer.name,at}]]])root.versions.push({id,scope:part,number:90,status:'superseded',snapshot:copy(content),revision:1,creatorId:actor.id,creatorName:actor.name,createdAt:at,updatedAt:at,history});
 }
 await f.install({...f.values,masterDataControl:JSON.stringify(root)},100);
 const get=async(extra,who='writer')=>f.route.GET(new Request(f.base+'/api/master/pages?scope='+page+'&approvedOnly=1&'+extra,{headers:{cookie:f.cookies[who],origin:f.base}}));
 return {...f,page,approvedId,get,legacy:(part,id='old-case')=>'legacy-master-page:'+JSON.stringify([page,part,id]),snapshot:()=>({row:{...f.db.prepare('SELECT * FROM shared_state WHERE id=1').get()},metrics:f.metrics()})};
}
