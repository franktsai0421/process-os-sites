/* Exact #44/#51 DTO deltas for the non-primary owner/reader fixtures only.
 * Construct the expected response from v20: retain every existing byte/field
 * and insert eleven denied restore cells at their fixed catalog positions,
 * plus the approved empty categoryGroups field for this fixed empty-group fixture.
 * Never strip candidate users/cells, derive grants, or replace the v20 loader. */
const assert=require('node:assert/strict');
const restoreAnchors=[['ab','exchange'],['c','exchange'],['bom','exchange'],['templates','exchange'],['editor','return'],['fqc','exchange'],['iqc','exchange'],['ipqc-ab','exchange'],['ipqc-c','exchange'],['tooling','exchange'],['equipment','exchange']];
const restoreKeys=restoreAnchors.map(([module])=>module+'.restore');
function publicFixtureUser(body){
 assert.equal(typeof body.values.platformUsers,'string');
 const users=JSON.parse(body.values.platformUsers);assert.equal(users.length,1,'Bootstrap must expose only the actor');
 const user=users[0];assert(['owner','reader'].includes(user.id),'Unexpected projection fixture actor');
 assert.equal(body.identity.id,user.id);assert.equal(user.role,user.id==='owner'?'admin':'staff');assert.equal(user.primary,false);assert.equal(user.enabled,true);
 for(const key of ['password','passwordHash'])assert.equal(Object.hasOwn(user,key),false,'Private user field leaked: '+key);
 for(const key of ['processCustomRoles','processRoleTemplateOverrides','processAccessControl'])assert.equal(Object.hasOwn(body.values,key),false,'Private role field leaked: '+key);
 return user;
}
function expectedRestoreProjection(body){
 const user=publicFixtureUser(body),anchors=new Map(restoreAnchors.map(([module,op])=>[module+'.'+op,module+'.restore']));
 for(const key of restoreKeys){assert.equal(Object.hasOwn(user.cells,key),false,'v20 unexpectedly contains restore');assert.equal(user.permissions.includes(key),false);}
 for(const anchor of anchors.keys())assert(Object.hasOwn(user.cells,anchor),'Pinned restore anchor missing: '+anchor);
 user.cells=Object.fromEntries(Object.entries(user.cells).flatMap(([key,value])=>anchors.has(key)?[[key,value],[anchors.get(key),false]]:[[key,value]]));
 body.values.platformUsers=JSON.stringify([user]);return body;
}
function comparableBootstrap(response,candidate=false){
 if(response.status!==200)return{status:response.status,headers:response.headers,text:response.text};
 const body=JSON.parse(response.text);
 if(candidate){
  assert.deepEqual(body.features,{webFeedback:true});delete body.features;
  assert.deepEqual(body.catalog.categoryGroups,[],'Fixed fixture must expose exactly the approved empty category groups');
  const user=publicFixtureUser(body);for(const key of restoreKeys){assert.equal(user.cells[key],false,'Fixture must not acquire restore: '+key);assert.equal(user.permissions.includes(key),false);}
 }else{
  assert.equal(Object.hasOwn(body,'features'),false);expectedRestoreProjection(body);
  assert.equal(Object.hasOwn(body.catalog,'categoryGroups'),false,'Pinned v20 must not contain category groups');
  assert(Object.hasOwn(body.catalog,'loadedScopes'),'Pinned category group insertion anchor missing');
  body.catalog=Object.fromEntries(Object.entries(body.catalog).flatMap(([key,value])=>key==='loadedScopes'?[[key,value],['categoryGroups',[]]]:[[key,value]]));
 }
 return{status:response.status,headers:response.headers,text:JSON.stringify(body)};
}
function assertRestoreProjectionContract(before,after){
 const expected=comparableBootstrap(before);assert.deepEqual(comparableBootstrap(after,true),expected);
 let negatives=0;
 const reject=response=>{assert.throws(()=>assert.deepEqual(comparableBootstrap(response,true),expected));negatives++;};
 const mutateBody=fn=>{const body=JSON.parse(after.text);reject({...after,text:JSON.stringify(fn(body)||body)});};
 const mutateUser=fn=>mutateBody(body=>{const users=JSON.parse(body.values.platformUsers);fn(users[0]);body.values.platformUsers=JSON.stringify(users);});
 for(const key of restoreKeys){
  mutateUser(user=>{user.cells[key]=true;});
  mutateUser(user=>{delete user.cells[key];});
  mutateUser(user=>{const value=user.cells[key];delete user.cells[key];user.cells[key]=value;});
  mutateBody(body=>{const entry=JSON.stringify(key)+':false';assert(body.values.platformUsers.includes(entry));body.values.platformUsers=body.values.platformUsers.replace(entry,entry+','+entry);});
 }
 mutateUser(user=>{user.cells['iqc.view']=!user.cells['iqc.view'];});
 mutateUser(user=>{user.cells['unrelated.view']=false;});
 mutateUser(user=>{user.name+=' changed';});
 mutateUser(user=>{user.id='different-actor';});
 for(const key of ['password','passwordHash'])mutateUser(user=>{user[key]='synthetic-private';});
 mutateUser(user=>{user.permissions.push('iqc.restore');});
 for(const key of ['processCustomRoles','processRoleTemplateOverrides','processAccessControl'])mutateBody(body=>{body.values[key]='synthetic-private';});
 mutateBody(body=>{body.extraDTO=true;});
 mutateBody(body=>{delete body.catalog.categoryGroups;});
 mutateBody(body=>{body.catalog.categoryGroups=null;});
 mutateBody(body=>{body.catalog.categoryGroups=[{line:'A',name:'unexpected',defaultStages:['unapproved']}];});
 mutateBody(body=>{body.catalog.categoryGroups={};});
 mutateBody(body=>{const groups=body.catalog.categoryGroups;delete body.catalog.categoryGroups;body.catalog.categoryGroups=groups;});
 mutateBody(body=>{body.catalog.unexpected='synthetic-private';});
 mutateBody(body=>{body.values.platformUsers=JSON.stringify([...JSON.parse(body.values.platformUsers),{id:'other-user'}]);});
 mutateBody(body=>Object.fromEntries(Object.entries(body).reverse()));
 reject({...after,status:403});reject({...after,headers:{...after.headers,'x-unexpected':'true'}});
 return {restoreCells:restoreKeys.length,negativeCases:negatives};
}
module.exports={comparableBootstrap,assertRestoreProjectionContract};
