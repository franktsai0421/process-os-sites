/* Exact authorized 2026-10-27 C operation-gate deltas only. Historical read-cost
 * baseline pins stay unchanged; every byte outside these gates remains protected. */
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const approvedBase="8c8d07d2d6e6c11ffe65a75499165e71e47e615d";
const rules=new Map([
  [
    "app/api/ipqc-c/workflow/route.ts",
    "async function access(",
    "function readControl(",
    "async function access(request:Request,state:State) {\n  const data=await can(request,state,'view:data'),review=await can(request,state,'view:approval');\n  const edit=data&&await can(request,state,'ipqc-c.edit');\n  return {view:data||review,edit,\n    save:data&&await can(request,state,'ipqc-c.save'),submit:data&&await can(request,state,'ipqc-c.submit'),\n    withdraw:data||review&&await can(request,state,'approval.withdraw'),\n    approve:review&&await can(request,state,'approval.approve'),return:review&&await can(request,state,'approval.reject'),\n    history:(data||review)&&await can(request,state,'approval.compare'),delete:edit&&await can(request,state,'master.delete')};\n}\n"
  ],
  [
    "app/api/ipqc-c/route.ts",
    "    } else if (edit) {\n",
    "      if (action.startsWith('delete')",
    "    } else if (edit) {\n      const data=await can(request,state,'view:data');\n      // Legacy Save/Submit replace body.snapshot, unlike V3's separate working,\n      // saved and fixed case commands. Require every operation they perform.\n      const required=action==='save'?['edit','save']:action==='submit'?['edit','save','submit']:['edit'];\n      const allowed=action==='withdraw'\n        ? (data||await can(request,state,'view:approval'))&&await can(request,state,'approval.withdraw')\n        : data&&(await Promise.all(required.map(op=>can(request,state,'ipqc-c.'+op)))).every(Boolean);\n      if (!allowed)\n        return reply({ error: '沒有 IPQC-C 編輯權限' }, 403);\n"
  ],
  [
    "app/api/ipqc-c/photo/route.ts",
    "    if (!await identity(request, state) || !(await can(request, state, 'view:data')) ||\n",
    "      return Response.json({ error: '沒有照片上傳權限'",
    "    if (!await identity(request, state) || !(await can(request, state, 'view:data')) ||\n        !(await can(request, state, 'ipqc-c.edit')))\n"
  ]
].map(([file,start,end,expected])=>[file,{start,end,expected}]));
const lf=s=>s.replace(/\r\n/g,'\n');
function span(text,start,end){const a=text.indexOf(start);assert(a>=0,'Operation start marker missing');assert.equal(text.indexOf(start,a+start.length),-1,'Operation start marker repeated');const b=text.indexOf(end,a+start.length);assert(b>a,'Operation end marker missing');return[a,b];}
function withoutApprovedOperationAlignment(file,bytes){
 const rule=rules.get(file);assert(rule,'Unexpected policy source');const text=bytes.toString('utf8'),[a,b]=span(text,rule.start,rule.end);
 assert.equal(lf(text.slice(a,b)),rule.expected,'Operation gate differs from exact approved contract: '+file);
 const original=execFileSync('git',['show',approvedBase+':'+file]).toString('utf8'),[x,y]=span(original,rule.start,rule.end);
 return Buffer.from(text.slice(0,a)+original.slice(x,y)+text.slice(b));
}
module.exports={withoutApprovedOperationAlignment,approvedBase};
