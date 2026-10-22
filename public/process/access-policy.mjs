// One catalog for the server, role matrix and individual matrix.
export const PRIMARY_ADMIN_ID='frank';
export const columns=[['view','查看','Xem'],['create','新增','Thêm'],['edit','編輯','Sửa'],['delete','刪除','Xóa'],['save','儲存草稿','Lưu nháp'],['submit','送審','Gửi duyệt'],['withdraw','撤回送審','Rút hồ sơ'],['approve','核准','Duyệt'],['return','發回','Trả lại'],['exchange','匯入／匯出','Nhập / xuất'],['settings','設定','Cài đặt']];
const draft=['view','create','edit','delete','save','submit','withdraw','approve','return','exchange'];
const row=(id,group,zh,vi,view,ops,extra={})=>({id,group,zh,vi,view,ops,...extra});
export const catalog=[
 row('dashboard','process','總覽','Tổng quan','dashboard',['view']),
 row('player','process','產線播放台','Phát quy trình','player',['view']),
 row('dispatch','process','發送介面','Điều phối','dispatch',['view','edit']),
 row('status','process','產品製程狀態','Trạng thái sản phẩm','productStatus',['view']),
 row('ab','process','AB 產線與類別','Dữ liệu chuyền AB','data',draft),
 row('c','process','C 產線與類別','Dữ liệu chuyền C','data',draft),
 row('bom','process','BOM','BOM','data',['view','edit','save','submit','withdraw','approve','return','exchange']),
 row('lines','process','線別與工段管理','Chuyền và công đoạn','data',draft),
 row('templates','process','流程資料','Dữ liệu quy trình','data',draft),
 row('editor','process','製程編輯台','Trình sửa quy trình','editor',['view','create','edit','delete','save','submit','withdraw','approve','return']),
 row('approval','process','版本確認平台','Duyệt phiên bản','approval',['view','approve','return','withdraw']),
 row('fqc','quality','FQC','FQC','data',draft),
 row('iqc','quality','IQC','IQC','data',draft),
 row('ipqc-ab','quality','IPQC-AB','IPQC-AB','data',draft),
 row('ipqc-c','quality','IPQC-C','IPQC-C','data',draft),
 row('tooling','quality','模具設備','Khuôn và thiết bị','data',draft),
 row('routine-reports','quality','例行報告資料庫','Dữ liệu báo cáo định kỳ','data',['view'],{building:true}),
 row('equipment','quality','檢具與測試設備','Dụng cụ và thiết bị kiểm tra','data',draft),
 row('quality-dashboard','quality','品質總覽','Tổng quan chất lượng','data',['view']),
 row('quality-search','quality','標準搜尋','Tìm tiêu chuẩn','data',['view']),
 row('quality-reports','quality','品質報告','Báo cáo chất lượng','data',['view']),
 row('fpy','quality','FPY','FPY','data',['view']),
 row('routine','quality','例行檢查','Kiểm tra định kỳ','data',['view','create','edit','delete','save','submit','withdraw','approve','return','settings']),
 row('feedback','system','網頁問題回報','Báo lỗi trang web','data',['view','create','edit','exchange'],{adminOps:['edit','exchange']}),
 row('users','system','使用者與權限','Tài khoản và phân quyền','data',['view','create','edit','delete'],{adminOnly:true}),
 row('user-status','system','帳號啟用／停用','Kích hoạt tài khoản','data',['edit'],{adminOnly:true}),
 row('user-password','system','重設普通帳號密碼','Đặt lại mật khẩu','data',['edit'],{adminOnly:true}),
];
export const accessKeys=catalog.flatMap(r=>r.ops.map(op=>r.id+'.'+op));
export const isPrimary=user=>user?.id===PRIMARY_ADMIN_ID&&user.role==='admin'&&!user.deletedAt&&user.enabled!==false&&user.authMode!=='demo';
export const parse=(raw,fallback)=>{try{return typeof raw==='string'?JSON.parse(raw):raw??fallback;}catch{return fallback;}};
export function templates(values,defaults){const custom=parse(values.processCustomRoles,[]),overrides=parse(values.processRoleTemplateOverrides,{});return Object.fromEntries(Object.entries({...defaults,...Object.fromEntries(custom.map(r=>[r.id,r]))}).map(([id,r])=>[id,{...r,...overrides[id]}]));}
export function legacyAllowed(user,preset,module,op){
 const row=catalog.find(r=>r.id===module);if(!row||!row.ops.includes(op))return false;
 const source=user.inheritRole===false?user:preset;if(!source)return false;
 if(row.adminOnly)return user.role==='admin';
 const perms=new Set(source.permissions||[]),views=new Set(source.views||[]);
 if(module==='feedback')return views.size>0&&(user.role==='admin'||['view','create'].includes(op));
 if(user.role==='admin')return true;
 if(module==='editor'||module==='approval'||row.ops.includes('save')){
  const data=views.has('data'),review=views.has('approval'),editor=views.has('editor'),edit=module==='editor'?editor:data;
  if(op==='view')return module==='approval'?review:module==='editor'?editor||review:data||review;
  if(['create','edit','save','submit'].includes(op))return edit;
  if(op==='withdraw')return module==='approval'?review&&perms.has('approval.withdraw'):edit||review&&perms.has('approval.withdraw');
  if(op==='approve')return review&&perms.has('approval.approve');if(op==='return')return review&&perms.has('approval.reject');
  if(op==='delete')return module==='routine'?edit:edit&&perms.has(module==='editor'?'approval.submit':'master.delete');
  if(op==='exchange')return data&&perms.has('master.import')&&perms.has('master.export');
  if(op==='settings')return data&&perms.has('master.import');
 }
 if(!views.has(row.view))return false;if(op==='view')return true;
 if(op==='exchange')return perms.has('master.import')&&perms.has('master.export');
 if(op==='approve')return perms.has('approval.approve');if(op==='return')return perms.has('approval.reject');
 if(op==='withdraw')return perms.has('approval.withdraw');if(op==='delete')return perms.has('master.delete');
 if(op==='settings')return module==='routine'?perms.has('master.import'):user.role==='admin';
 if(module==='dispatch')return views.has('dispatch');
 return perms.has('approval.submit')||perms.has('approval.revise');
}
export function effectiveCells(user,roles){
 const preset=roles[user.role];if(!preset||user.enabled===false||user.deletedAt)return Object.fromEntries(accessKeys.map(k=>[k,false]));
 if(isPrimary(user))return Object.fromEntries(accessKeys.map(k=>[k,true]));
 return Object.fromEntries(catalog.flatMap(r=>r.ops.map(op=>{const key=r.id+'.'+op;let value=Object.hasOwn(preset.access||{},key)?preset.access[key]===true:legacyAllowed(user,preset,r.id,op);if(Object.hasOwn(user.accessOverrides||{},key))value=user.accessOverrides[key]===true;if((r.adminOnly||r.adminOps?.includes(op))&&user.role!=='admin')value=false;if(key==='users.view')value=user.role==='admin';return[key,value];})));
}
export function managementRight(actor,target,action,cells){
 if(!actor||!target||actor.enabled===false||actor.deletedAt)return false;
 if(target.authMode==='demo'&&action!=='view')return false;
 if(action==='password-own')return actor.id===target.id&&target.authMode!=='demo';
 if(action==='view')return actor.id===target.id||actor.role==='admin';
 if(isPrimary(actor))return !((action==='delete'||action==='status')&&isPrimary(target));
 if(actor.role!=='admin'||actor.id===target.id||target.role==='admin'||isPrimary(target))return false;
 return cells[({'edit':'users.edit',create:'users.create',delete:'users.delete',status:'user-status.edit',password:'user-password.edit'})[action]]===true;
}
export const roleEditable=role=>Object.fromEntries(catalog.flatMap(r=>r.ops.map(op=>[r.id+'.'+op,r.id+'.'+op!=='users.view'&&(!(r.adminOnly||r.adminOps?.includes(op))||role==='admin')])));
export const editableCells=(actor,target,cells,action='edit')=>{const allowed=roleEditable(target.role),manage=!isPrimary(target)&&managementRight(actor,target,action,cells);return Object.fromEntries(accessKeys.map(key=>[key,allowed[key]&&manage&&(isPrimary(actor)||cells[key]===true)]));};
// Reject invalid combinations rather than silently granting view or removing actions.
export function invalidDependencies(cells){return catalog.filter(r=>r.ops.includes('view')&&!cells[r.id+'.view']&&r.ops.some(op=>op!=='view'&&cells[r.id+'.'+op])).map(r=>r.id);}
export function moduleForURL(input){
 const url=new URL(input,'http://localhost'),p=url.pathname,q=url.searchParams;
 const api=[['/api/bom','bom'],['/api/ipqc-ab','ipqc-ab'],['/api/ipqc-c','ipqc-c'],['/api/iqc','iqc'],['/api/tooling','tooling'],['/api/routine-equipment','equipment'],['/api/routine-fqc','routine'],['/api/web-feedback','feedback'],['/api/process-authoring','editor'],['/api/process-ipqc','editor'],['/api/fqc','fqc']];
 for(const [prefix,id]of api)if(p===prefix||p.startsWith(prefix+'/'))return id;
 const scope=q.get('scope');if(scope==='AB')return'ab';if(scope==='C')return'c';if(scope==='PROCESS')return'templates';
 const tab=q.get('dataTab'),tabs={AB:'ab',C:'c',bom:'bom','line-admin':'lines','process-master':'templates',users:'users',fqc:'fqc','quality-fqc':'fqc',iqc:'iqc','quality-iqc':'iqc','quality-ipqc-ab':'ipqc-ab','quality-ipqc-c':'ipqc-c','quality-tooling':'tooling','quality-mold-equipment':'tooling','quality-routine-reports':'routine-reports','routine-equipment':'equipment','quality-routine-equipment':'equipment','web-feedback':'feedback'};
 if(q.get('view')==='data'&&tabs[tab])return tabs[tab];
 return ({editor:'editor',approval:'approval','quality-dashboard':'quality-dashboard','quality-search':'quality-search','quality-reports':'quality-reports',fpy:'fpy','quality-fpy':'fpy',routine:'routine','quality-inspections':'routine',dashboard:'dashboard',player:'player',dispatch:'dispatch',productStatus:'status'})[q.get('view')]||null;
}
export const operationForLegacy=key=>({'approval.submit':'submit','approval.revise':'edit','approval.withdraw':'withdraw','approval.approve':'approve','approval.reject':'return','approval.compare':'view','approval.viewAll':'view','approval.viewLine':'view','master.delete':'delete','master.import':'exchange','master.export':'exchange'})[key]||null;
