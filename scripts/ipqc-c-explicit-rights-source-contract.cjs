/* #44's already-authorized explicit operation/restore gates only.
 * Preserve the original v20 and 2026-10-27 contracts: construct the exact new
 * protected source from five named deltas against a pinned pre-#44 main blob.
 * A shifted/duplicated/missing delta or any other protected byte is rejected.
 * This helper does not replace C9's committed-vs-working byte guard. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const explicitRightsBase='2cac307f29b8017a2bb6dc5229d47720f2deab33';
const contracts={
  "app/api/ipqc-c/route.ts": {
    "marker": "type Body =",
    "baselineHash": "ad153eb45826d8a029a5f1ce73eee8de1bfa0e9af627c54d5dcbffaf22946803",
    "rules": [
      {
        "name": "legacy edit/create/withdraw",
        "before": "      const data=await can(request,state,'view:data');\n      // Legacy Save/Submit replace body.snapshot, unlike V3's separate working,\n      // saved and fixed case commands. Require every operation they perform.\n      const required=action==='save'?['edit','save']:action==='submit'?['edit','save','submit']:['edit'];\n      const allowed=action==='withdraw'\n        ? (data||await can(request,state,'view:approval'))&&await can(request,state,'approval.withdraw')\n        : data&&(await Promise.all(required.map(op=>can(request,state,'ipqc-c.'+op)))).every(Boolean);\n      if (!allowed)\n        return reply({ error: '沒有 IPQC-C 編輯權限' }, 403);\n",
        "after": "      const data=await can(request,state,'ipqc-c.view');\n      // Legacy Save/Submit replace body.snapshot, unlike V3's separate working,\n      // saved and fixed case commands. Require every operation they perform.\n      const required=action==='save'?['edit','save']:action==='submit'?['edit','save','submit']:action.startsWith('create')?['edit','create']:['edit'];\n      const allowed=action==='withdraw'\n        ? data&&await can(request,state,'ipqc-c.withdraw')\n        : data&&(await Promise.all(required.map(op=>can(request,state,'ipqc-c.'+op)))).every(Boolean);\n      if (!allowed)\n        return reply({ error: '沒有 IPQC-C 編輯權限' }, 403);\n"
      },
      {
        "name": "legacy review module view",
        "before": "    } else if (review) {\n      if (!(await can(request, state, 'view:approval')) ||\n          !(await can(request, state, action === 'approve' ? 'approval.approve' : 'approval.reject')))\n        return reply({ error: '沒有審核權限' }, 403);\n",
        "after": "    } else if (review) {\n      if (!(await can(request, state, 'ipqc-c.view')) ||\n          !(await can(request, state, action === 'approve' ? 'approval.approve' : 'approval.reject')))\n        return reply({ error: '沒有審核權限' }, 403);\n"
      },
      {
        "name": "legacy snapshot create/delete effects",
        "before": "        const previousPhotos = new Set(version.snapshot.items.flatMap(item => item.mediaItems.map(photo => photo.id)));\n",
        "after": "        const effects=restoreEffects(version.snapshot,snapshot);\n        for(const op of ['create','delete'] as const)if(effects[op]&&!await can(request,state,'ipqc-c.'+op))return reply({error:'FORBIDDEN'},403);\n        const previousPhotos = new Set(version.snapshot.items.flatMap(item => item.mediaItems.map(photo => photo.id)));\n"
      }
    ]
  },
  "app/api/ipqc-c/workflow/route.ts": {
    "marker": "export async function POST(",
    "baselineHash": "a312d6b39ebad0662867d288060cff4d5077d6f1dae0605ac84b3f44aa6aac6b",
    "rules": [
      {
        "name": "workflow command create/delete/restore gates",
        "before": "        if(body.command.moduleAction?.startsWith('delete')&&!await can(request,state,'master.delete'))return reply({error:'FORBIDDEN'},403);\r\n",
        "after": "        if(body.command.moduleAction?.startsWith('delete')&&!permissions.delete)return reply({error:'FORBIDDEN'},403);\r\n        if(body.command.moduleAction?.startsWith('create')&&!permissions.create)return reply({error:'FORBIDDEN'},403);\r\n        if(body.command.action==='restore'&&!permissions.restore)return reply({error:'RESTORE_PERMISSION_REQUIRED'},403);\r\n"
      },
      {
        "name": "workflow restore/apply effects",
        "before": "        const alreadyAccepted=control.workflow?.receipts[body.command.operationId];\r\n        receipt=applyIpqcWorkflow(control,body.command,context);\r\n",
        "after": "        const alreadyAccepted=control.workflow?.receipts[body.command.operationId],beforeChange=copyIpqc(control.workflow?.working||openIpqc(control)?.snapshot||{errors:[],items:[]});\r\n        receipt=applyIpqcWorkflow(control,body.command,context);\r\n        if(!alreadyAccepted&&body.command.action==='restore')await assertRestoreAccess(request,state,beforeChange,control.workflow!.working);\r\n        if(!alreadyAccepted&&body.command.action==='apply'){const effects=restoreEffects(beforeChange,control.workflow!.working);if(effects.create&&!permissions.create||effects.delete&&!permissions.delete)return reply({error:'FORBIDDEN'},403);}\r\n"
      }
    ]
  }
};
function protectedStart(text,marker){const start=text.indexOf(marker);assert(start>=0,'Explicit-rights source marker missing');assert.equal(text.indexOf(marker,start+marker.length),-1,'Explicit-rights source marker repeated');return start;}
function projectedSource(file,original){
 const contract=contracts[file];assert(contract,'Unexpected explicit-rights source');
 const text=original.toString('utf8'),start=protectedStart(text,contract.marker),before=text.slice(start);
 assert.equal(createHash('sha256').update(before).digest('hex'),contract.baselineHash,'Explicit-rights baseline bytes changed');
 let after=before;
 for(const rule of contract.rules){const a=after.indexOf(rule.before);assert(a>=0,'Explicit-rights old span missing: '+rule.name);assert.equal(after.indexOf(rule.before,a+rule.before.length),-1,'Explicit-rights old span repeated: '+rule.name);after=after.slice(0,a)+rule.after+after.slice(a+rule.before.length);}
 return {contract,before,after};
}
function withoutApprovedExplicitRights(file,bytes,original=execFileSync('git',['show',explicitRightsBase+':'+file])){
 const {contract,before,after}=projectedSource(file,original),text=bytes.toString('utf8'),start=protectedStart(text,contract.marker);
 assert.deepEqual(bytes.subarray(Buffer.byteLength(text.slice(0,start))),Buffer.from(after),'Explicit-rights protected bytes differ from exact five-span contract: '+file);
 return Buffer.concat([bytes.subarray(0,Buffer.byteLength(text.slice(0,start))),Buffer.from(before)]);
}
function assertExplicitRightsContract(file,bytes,original=execFileSync('git',['show',explicitRightsBase+':'+file])){
 const {contract,before,after}=projectedSource(file,original),text=bytes.toString('utf8'),prefix=text.slice(0,protectedStart(text,contract.marker));
 assert.deepEqual(withoutApprovedExplicitRights(file,bytes,original),Buffer.from(prefix+before));
 let negatives=0;
 const reject=protectedText=>{assert.throws(()=>withoutApprovedExplicitRights(file,Buffer.from(prefix+protectedText),original),/Explicit-rights protected bytes differ/);negatives++;};
 for(const rule of contract.rules){
  const a=after.indexOf(rule.after);assert(a>=0);assert.equal(after.indexOf(rule.after,a+rule.after.length),-1);
  const left=after.slice(0,a),right=after.slice(a+rule.after.length);
  reject(left+'!'+rule.after.slice(1)+right); // mutation
  reject(left+right); // deletion
  reject(left+rule.after+rule.after+right); // duplication
  reject(left+right+rule.after); // unchanged bytes moved out of position
 }
 assert(after.includes('sameOrigin'));reject(after.replace('sameOrigin','sameOrigiN')); // outside the five spans
 assert.throws(()=>withoutApprovedExplicitRights(file,bytes,Buffer.concat([original,Buffer.from(' ')])),/Explicit-rights baseline bytes changed/);negatives++;
 return {file,spans:contract.rules.length,negativeCases:negatives};
}
module.exports={withoutApprovedExplicitRights,assertExplicitRightsContract,explicitRightsBase};
if(require.main===module){const fs=require('node:fs');for(const file of Object.keys(contracts))console.log(JSON.stringify(assertExplicitRightsContract(file,fs.readFileSync(file))));}
