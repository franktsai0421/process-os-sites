/* Actual isolated routes, synthetic identities and memory storage only. */
const assert=require('node:assert/strict'),fixture=require('./test-master-page-runtime.cjs');
const copy=value=>JSON.parse(JSON.stringify(value)),results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',reason:error.message});}}
async function removedLine(f){let control=await f.begin('LINES');const line=copy(control.workflow.working.AB.lines[0]),stagePath=['AB','lines',{id:line.id},'stages',{id:line.stages[0].id}];
 let r=await f.send('LINES',{command:f.save(control,[{patches:[{op:'remove',path:stagePath}],guards:[{path:stagePath,value:line.stages[0]}]}])},'reviewer');assert.equal(r.status,200,JSON.stringify(r));control=r.body.control;
 const path=['AB','lines',{id:line.id}],empty=control.workflow.working.AB.lines[0];r=await f.send('LINES',{command:f.save(control,[{patches:[{op:'remove',path}],guards:[{path,value:empty}]}])},'reviewer');assert.equal(r.status,200,JSON.stringify(r));return{control:r.body.control,line};}
(async()=>{
 for(const record of [false,true]){
  const mode=record?'records':'inline';
  await check(mode+' generic aggregate writer cannot initialize managed page layout',async()=>{
   const f=await fixture(record);try{const legacy=copy(f.root);delete legacy.pageDraftLayout;for(const key of ['AB.catalog','C.catalog','LINES'])delete legacy.active[key];legacy.versions=legacy.versions.filter(version=>!['AB.catalog','C.catalog','LINES'].includes(version.scope));
    await f.install({...f.values,masterDataControl:JSON.stringify(legacy)});const state=await f.core.readState(),before=JSON.stringify(await f.readRoot()),api=f.load('app/api/shared-state/route.ts');
    const response=await api.POST(new Request(f.base+'/api/shared-state',{method:'POST',headers:{cookie:f.cookies.writer,origin:f.base,'content-type':'application/json'},body:JSON.stringify({baseRevision:state.revision,updates:{masterDataControl:JSON.stringify(f.root)}})}));
    assert.equal(response.status,409,'managed layout is not a generic client field: '+JSON.stringify(await response.json()));assert.equal(JSON.stringify(await f.readRoot()),before);
   }finally{f.close();}
  });
  await check(mode+' restored parent with new child still requires create',async()=>{
   const f=await fixture(record);try{const users=JSON.parse(f.values.platformUsers);users.find(user=>user.id==='writer').accessOverrides['lines.create']=false;await f.install({...f.values,platformUsers:JSON.stringify(users)});
    const {control,line}=await removedLine(f),before=JSON.stringify(await f.readRoot()),restored={...line,stages:[{id:'brand-new-stage',code:'A-NEW',name:'New child'}]};
    const r=await f.send('LINES',{command:f.save(control,[{patches:[{op:'insert',path:['AB','lines'],value:restored}],guards:[]}])});assert.equal(r.status,403,'new descendant must require create: '+JSON.stringify(r.body));assert.equal(JSON.stringify(await f.readRoot()),before);
   }finally{f.close();}
  });
  await check(mode+' same-parent original subtree restoration remains available under edit',async()=>{
   const f=await fixture(record);try{const users=JSON.parse(f.values.platformUsers);users.find(user=>user.id==='writer').accessOverrides['lines.create']=false;await f.install({...f.values,platformUsers:JSON.stringify(users)});
    const {control,line}=await removedLine(f);line.stages[0].name='Retained local child edit';const r=await f.send('LINES',{command:f.save(control,[{patches:[{op:'insert',path:['AB','lines'],value:line}],guards:[]}])});assert.equal(r.status,200,JSON.stringify(r));const working=r.body.control.workflow.working.AB.lines[0];assert.equal(working.id,line.id);assert.equal(working.stages[0].id,line.stages[0].id);assert.equal(working.stages[0].name,'Retained local child edit');
   }finally{f.close();}
  });
  await check(mode+' namespace and public references derive from approved owners instead of a stale compatibility mirror',async()=>{
   const f=await fixture(record);try{const control=await f.begin('AB'),root=await f.readRoot(),product={id:'approved-c-product',code:'KEEP',name:'Approved C',line:'C',category:'',stages:['C-1']};
    root.active['C.catalog'].products.push(product);root.versions.find(version=>version.scope==='C.catalog'&&version.status==='approved').snapshot=copy(root.active['C.catalog']);root.active.C.products=[];
    await f.install({...f.values,masterDataControl:JSON.stringify(root)});const before=JSON.stringify(await f.readRoot()),publicRoot=JSON.parse(f.core.publicState(await f.core.readState(),'writer').values.masterDataControl);assert.equal(publicRoot.active.C.products[0].code,'KEEP');
    const r=await f.send('AB',{command:f.save(control,[{patches:[{op:'insert',path:['products'],value:{id:'duplicate',code:'KEEP',name:'Duplicate',line:'A',category:'',stages:['A-1']}}],guards:[]}])});assert.equal(r.status,409,JSON.stringify(r));assert.equal(r.body.error,'PRODUCT_CODE_USED_IN_OTHER_SCOPE');assert.equal(JSON.stringify(await f.readRoot()),before);
   }finally{f.close();}
  });
  await check(mode+' each companion active body and pointer must resolve to original approved source before read or Begin',async()=>{
   const f=await fixture(record);try{
    for(const kind of ['line-body','catalog-body','line-pointer-body','duplicate-companion-id']){
     const root=copy(f.root);
     if(kind==='line-body')root.active.LINES.AB.lines[0].stages.push({id:'not-approved',code:'A-UNAPPROVED',name:'Unapproved source'});
     else if(kind==='catalog-body')root.active['C.catalog'].products.push({id:'not-approved',code:'UNAPPROVED',name:'Unapproved',line:'C',category:'',stages:['C-1']});
     else if(kind==='line-pointer-body'){const draft=f.load('lib/shared-draft.ts');root.workflowScopes.LINES=draft.createSharedDraft('master:LINES',root.active.LINES,'approved-LINES','fixture-generation');root.workflowScopes.LINES.active.content.AB.lines[0].name='Not the approved source';}
     else root.versions.push({...copy(root.versions.find(version=>version.scope==='LINES')),scope:'unrelated'});
     await f.install({...f.values,masterDataControl:JSON.stringify(root)});const before=JSON.stringify(await f.readRoot());
     let r=await f.send('AB');assert.equal(r.status,409,kind+' read must reject: '+JSON.stringify(r.body));
     r=await f.send('AB',{action:'begin'});assert.equal(r.status,409,kind+' Begin must reject');assert.equal(JSON.stringify(await f.readRoot()),before);
    }
   }finally{f.close();}
  });
 }
 console.log(JSON.stringify({status:results.every(result=>result.status==='PASS')?'PASS':'FAIL',results,storage:'memory SQLite/Map R2; real data untouched'},null,2));if(results.some(result=>result.status!=='PASS'))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
