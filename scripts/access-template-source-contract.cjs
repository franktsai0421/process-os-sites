/* #44's existing projection reuse and explicit policy changes only.
 * Reconstruct the entire source from pinned pre-#44 bytes and six exact spans.
 * This is not a policy wildcard, semantic normalizer, or substitute for T5's
 * committed-vs-working guard. Identity/session/revocation remain untouched. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const accessTemplateBase='2cac307f29b8017a2bb6dc5229d47720f2deab33';
const contracts={
  "lib/user-access.ts": {
    "baselineHash": "baf9930e3cd4243d79415049e91963b21776110d49f1a97cf86eec17ae8ab641",
    "rules": [
      {
        "name": "shared role-template parameter",
        "before": "export function effectiveAccess(user:AccessUser, values:Record<string,string>) {\r\n",
        "after": "export function effectiveAccess(user:AccessUser, values:Record<string,string>, roles=roleTemplates(values)) {\r\n"
      },
      {
        "name": "reuse supplied role templates",
        "before": "  const roles = roleTemplates(values), preset = roles[role];\r\n",
        "after": "  const preset = roles[role];\r\n"
      }
    ]
  },
  "public/process/access-policy.mjs": {
    "baselineHash": "ebdc1c9321e760579c26bb92bd8c3d3c166be6050e9c9acda0d140547ff199e5",
    "rules": [
      {
        "name": "explicit restore column",
        "before": "export const columns=[['view','查看','Xem'],['create','新增','Thêm'],['edit','編輯','Sửa'],['delete','刪除','Xóa'],['save','儲存草稿','Lưu nháp'],['submit','送審','Gửi duyệt'],['withdraw','撤回送審','Rút hồ sơ'],['approve','核准','Duyệt'],['return','發回','Trả lại'],['exchange','匯入／匯出','Nhập / xuất'],['settings','設定','Cài đặt']];\n",
        "after": "export const columns=[['view','查看','Xem'],['create','新增','Thêm'],['edit','編輯','Sửa'],['delete','刪除','Xóa'],['save','儲存草稿','Lưu nháp'],['submit','送審','Gửi duyệt'],['withdraw','撤回送審','Rút hồ sơ'],['approve','核准','Duyệt'],['return','發回','Trả lại'],['exchange','匯入／匯出','Nhập / xuất'],['settings','設定','Cài đặt'],['restore','還原歷史至草稿','Khôi phục lịch sử vào bản nháp']];\n"
      },
      {
        "name": "restore module catalog",
        "before": "export const accessKeys=catalog.flatMap(r=>r.ops.map(op=>r.id+'.'+op));\n",
        "after": "export const restoreModules=['ab','c','bom','templates','editor','fqc','iqc','ipqc-ab','ipqc-c','tooling','equipment'];\nfor(const r of catalog)if(restoreModules.includes(r.id))r.ops=[...r.ops,'restore'];\nexport const accessKeys=catalog.flatMap(r=>r.ops.map(op=>r.id+'.'+op));\n"
      },
      {
        "name": "restore never inferred from legacy authority",
        "before": " const source=user.inheritRole===false?user:preset;if(!source)return false;\n",
        "after": " // New restore capability is explicit opt-in; never infer it from edit/admin.\n if(op==='restore')return false;\n const source=user.inheritRole===false?user:preset;if(!source)return false;\n"
      },
      {
        "name": "dependency validation and lines exemption",
        "before": "export function invalidDependencies(cells){return catalog.filter(r=>r.ops.includes('view')&&!cells[r.id+'.view']&&r.ops.some(op=>op!=='view'&&cells[r.id+'.'+op])).map(r=>r.id);}\n",
        "after": "export function invalidDependencies(cells){return catalog.filter(r=>r.id!=='lines'&&r.ops.includes('view')&&!cells[r.id+'.view']&&r.ops.some(op=>op!=='view'&&cells[r.id+'.'+op])).map(r=>r.id);}\n// Existing inconsistent settings are reported, not silently rewritten. Writers\n// reject newly introduced dependencies so unrelated edits remain possible.\nexport function dependencyIssues(cells){return catalog.flatMap(r=>r.ops.filter(op=>r.id!=='lines'&&cells[r.id+'.'+op]).flatMap(op=>{\n const required=[...(op!=='view'&&r.ops.includes('view')?['view']:[]),...(restoreModules.includes(r.id)&&['create','delete','restore'].includes(op)?['edit']:[])];\n const issues=required.filter(need=>!cells[r.id+'.'+need]).map(need=>({key:r.id+'.'+op,requires:r.id+'.'+need}));\n if(r.id==='fqc'&&op==='view')for(const key of ['ab.view','equipment.view'])if(!cells[key])issues.push({key:'fqc.view',requires:key});\n return issues;\n}));}\nexport function newDependencyIssues(cells,previous={}){const old=new Set(dependencyIssues(previous).map(i=>i.key+':'+i.requires));return dependencyIssues(cells).filter(i=>!old.has(i.key+':'+i.requires));}\n"
      }
    ]
  }
};
function projectedSource(file,original){
 const contract=contracts[file];assert(contract,'Unexpected access-template contract source');
 assert.equal(createHash('sha256').update(original).digest('hex'),contract.baselineHash,'Access-template baseline bytes changed: '+file);
 const before=original.toString('utf8');let after=before;
 for(const rule of contract.rules){
  const start=after.indexOf(rule.before);assert(start>=0,'Access-template old span missing: '+rule.name);
  assert.equal(after.indexOf(rule.before,start+rule.before.length),-1,'Access-template old span repeated: '+rule.name);
  after=after.slice(0,start)+rule.after+after.slice(start+rule.before.length);
 }
 return {contract,before,after};
}
function withoutPR44AccessChanges(file,bytes,original=execFileSync('git',['show',accessTemplateBase+':'+file])){
 const {before,after}=projectedSource(file,original);
 assert.deepEqual(bytes,Buffer.from(after),'Access-template source differs from exact six-span contract: '+file);
 return Buffer.from(before);
}
function assertAccessTemplateContract(file,bytes,original=execFileSync('git',['show',accessTemplateBase+':'+file])){
 const {contract,before,after}=projectedSource(file,original);
 assert.deepEqual(withoutPR44AccessChanges(file,bytes,original),Buffer.from(before));
 let negatives=0;
 const reject=text=>{assert.throws(()=>withoutPR44AccessChanges(file,Buffer.from(text),original),/Access-template source differs/);negatives++;};
 for(const rule of contract.rules){
  const start=after.indexOf(rule.after);assert(start>=0);assert.equal(after.indexOf(rule.after,start+rule.after.length),-1);
  const left=after.slice(0,start),right=after.slice(start+rule.after.length);
  reject(left+'!'+rule.after.slice(1)+right); // mutation
  reject(left+right); // deletion
  reject(left+rule.after+rule.after+right); // duplication
  reject(left+right+rule.after); // same span moved out of position
 }
 // Both files contain this unchanged authority check, outside the six spans.
 assert(after.includes('isPrimary'));reject(after.replace('isPrimary','isPrimarY'));
 assert.throws(()=>withoutPR44AccessChanges(file,bytes,Buffer.concat([original,Buffer.from(' ')])),/Access-template baseline bytes changed/);negatives++;
 return {file,spans:contract.rules.length,negativeCases:negatives};
}
module.exports={withoutPR44AccessChanges,assertAccessTemplateContract,accessTemplateBase};
if(require.main===module){const fs=require('node:fs');for(const file of Object.keys(contracts))console.log(JSON.stringify(assertAccessTemplateContract(file,fs.readFileSync(file))));}
