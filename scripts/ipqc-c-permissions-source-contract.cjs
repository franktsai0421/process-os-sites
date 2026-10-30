/* Exact existing #44 permissions/restore read changes, not release approval.
 * Reverse only the five pinned prefix/GET spans, composing the existing exact
 * POST contract. P8 still checks working/HEAD and the original operation/read
 * optimization chain against its untouched historical whole-file baseline. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {withoutApprovedExplicitRights,explicitRightsBase}=require('./ipqc-c-explicit-rights-source-contract.cjs');
const route='app/api/ipqc-c/workflow/route.ts',marker='export async function POST(';
const contract={
  "prefixHash": "f9061372cac27c7de5323d4587386530d399dbe4384f157944a8515c3d448b1c",
  "rules": [
    {
      "name": "restore dependency import",
      "before": "import { env } from 'cloudflare:workers';\r\n",
      "after": "import {restoreAllowed,assertRestoreAccess,restoreEffects} from '@/lib/draft-restore-access';\r\nimport { env } from 'cloudflare:workers';\r\n"
    },
    {
      "name": "workflow-access dependency import",
      "before": "import {otherReviewerAvailable,workflowInterfaceMetadata} from '@/lib/versioned-shared-workflow';\r\n",
      "after": "import {otherReviewerAvailable,workflowInterfaceMetadata,workflowAccess} from '@/lib/versioned-shared-workflow';\r\n"
    },
    {
      "name": "explicit module operation cells",
      "before": "async function access(request:Request,state:State) {\r\n  const data=await can(request,state,'view:data'),review=await can(request,state,'view:approval');\r\n  const edit=data&&await can(request,state,'ipqc-c.edit');\n  return {view:data||review,edit,\n    save:data&&await can(request,state,'ipqc-c.save'),submit:data&&await can(request,state,'ipqc-c.submit'),\n    withdraw:data||review&&await can(request,state,'approval.withdraw'),\r\n    approve:review&&await can(request,state,'approval.approve'),return:review&&await can(request,state,'approval.reject'),\r\n    history:(data||review)&&await can(request,state,'approval.compare'),delete:edit&&await can(request,state,'master.delete')};\n}\r\n",
      "after": "async function access(request:Request,state:State) {\r\n  const rights=await workflowAccess(request,state);\r\n  return {...rights,restore:rights.edit&&await restoreAllowed(request,state),create:rights.edit&&await can(request,state,'ipqc-c.create'),delete:rights.edit&&await can(request,state,'ipqc-c.delete')};\r\n}\r\n"
    },
    {
      "name": "restore preview authorization and effect check",
      "before": "    if(query.has('restoreSaveId')){\r\n      if(!permissions.history||!permissions.edit)return reply({error:'FORBIDDEN'},403);\r\n      if(!flow||openIpqc(control)?.status!=='draft')return reply({error:flow?.pendingId?'PENDING_LOCKED':'BEGIN_REQUIRED'},409);\r\n      const saved=flow.saves.find(s=>s.id===query.get('restoreSaveId'));if(!saved)return reply({error:'SAVE_NOT_FOUND'},404);\r\n      const context=ipqcWorkflowContext(control,{actor:{id:actor.id,name:actor.name,admin:actor.role==='admin'},at:new Date().toISOString(),id:()=>crypto.randomUUID(),allowed:p=>permissions[p]},[]);\r\n      return reply({generation:flow.generation,expectedRevision:flow.revision,restoreSaveId:saved.id,before:flow.working,\r\n        after:context.restoreContent!(copyIpqc(saved.content),flow.working),source:{actor:saved.actor,at:saved.at}});\r\n    }\r\n",
      "after": "    if(query.has('restoreSaveId')){\r\n      if(!permissions.history||!permissions.restore)return reply({error:'FORBIDDEN'},403);\r\n      if(!flow||openIpqc(control)?.status!=='draft')return reply({error:flow?.pendingId?'PENDING_LOCKED':'BEGIN_REQUIRED'},409);\r\n      const saved=flow.saves.find(s=>s.id===query.get('restoreSaveId'));if(!saved)return reply({error:'SAVE_NOT_FOUND'},404);\r\n      const context=ipqcWorkflowContext(control,{actor:{id:actor.id,name:actor.name,admin:actor.role==='admin'},at:new Date().toISOString(),id:()=>crypto.randomUUID(),allowed:p=>permissions[p]},[]);\r\n      const after=context.restoreContent!(copyIpqc(saved.content),flow.working);\r\n      await assertRestoreAccess(request,state,flow.working,after);\r\n      return reply({generation:flow.generation,expectedRevision:flow.revision,restoreSaveId:saved.id,before:flow.working,after,source:{actor:saved.actor,at:saved.at}});\r\n    }\r\n"
    },
    {
      "name": "restore receipt authorization",
      "before": "      if(receipt.actorId!==actor.id||!permissions[permission as DraftPermission])return reply({error:'FORBIDDEN'},403);\r\n",
      "after": "      if(receipt.actorId!==actor.id||!permissions[permission as DraftPermission]||action==='restore'&&!permissions.restore)return reply({error:'FORBIDDEN'},403);\r\n"
    }
  ]
};
function split(bytes){const at=bytes.indexOf(Buffer.from(marker));assert(at>=0,'Permission-read POST marker missing');assert.equal(bytes.indexOf(Buffer.from(marker),at+marker.length),-1,'Permission-read POST marker repeated');return{prefix:bytes.subarray(0,at),post:bytes.subarray(at)};}
function projectedPrefix(original){
 const {prefix}=split(original);assert.equal(createHash('sha256').update(prefix).digest('hex'),contract.prefixHash,'Permission-read baseline prefix bytes changed');
 let after=prefix.toString('utf8');
 for(const rule of contract.rules){const at=after.indexOf(rule.before);assert(at>=0,'Permission-read old span missing: '+rule.name);assert.equal(after.indexOf(rule.before,at+rule.before.length),-1,'Permission-read old span repeated: '+rule.name);after=after.slice(0,at)+rule.after+after.slice(at+rule.before.length);}
 return{before:prefix,after};
}
function withoutExplicitPermissionReadAlignment(bytes,original=execFileSync('git',['show',explicitRightsBase+':'+route])){
 const normalizedPost=withoutApprovedExplicitRights(route,bytes,original),{before,after}=projectedPrefix(original);
 assert.deepEqual(split(bytes).prefix,Buffer.from(after),'Permission-read prefix bytes differ from exact five-span contract');
 return Buffer.concat([before,split(normalizedPost).post]);
}
function assertPermissionReadSourceContract(bytes,original=execFileSync('git',['show',explicitRightsBase+':'+route])){
 const {after}=projectedPrefix(original),{post}=split(bytes);assert.deepEqual(withoutExplicitPermissionReadAlignment(bytes,original),original);
 let negatives=0;const reject=prefix=>{assert.throws(()=>withoutExplicitPermissionReadAlignment(Buffer.concat([Buffer.from(prefix),post]),original),/Permission-read prefix bytes differ/);negatives++;};
 for(const rule of contract.rules){
  const at=after.indexOf(rule.after);assert(at>=0);assert.equal(after.indexOf(rule.after,at+rule.after.length),-1);
  const left=after.slice(0,at),right=after.slice(at+rule.after.length);assert(right.length>0);
  reject(left+'!'+rule.after.slice(1)+right); // mutation within the span
  reject(left+right); // deletion
  reject(left+rule.after+rule.after+right); // duplicate span
  reject(left+right+rule.after); // exact span moved elsewhere
  reject(left+rule.after+'!'+right.slice(1)); // adjacent byte outside the span
 }
 const damaged=Buffer.concat([Buffer.from('!'),original.subarray(1)]);
 assert.throws(()=>withoutExplicitPermissionReadAlignment(bytes,damaged),/Permission-read baseline prefix bytes changed/);negatives++;
 return{route,prefixSpans:contract.rules.length,negativeCases:negatives,postContract:'existing exact #44 POST spans retained'};
}
module.exports={withoutExplicitPermissionReadAlignment,assertPermissionReadSourceContract};
if(require.main===module)console.log(JSON.stringify(assertPermissionReadSourceContract(require('node:fs').readFileSync(route))));
