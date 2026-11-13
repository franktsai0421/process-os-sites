// One effective projection for server decisions and account-dialog previews.
// Preview context carries only already-authorized subjects and minimal audit
// evidence; it is never accepted by a server mutation as authority.
import {catalog,effectiveCells,isPrimary,PRIMARY_ADMIN_ID} from './access-policy.mjs?v=20261110-account-pages1';
import {prepareDraftReviewPolicy,platformApprovalSource} from './draft-review-policy.mjs?v=20261110-account-pages1';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v),own=(v,k)=>object(v)&&Object.hasOwn(v,k),key='approval.approve';
export function resolveAccountReview(user,roles,control={}){
 const before=effectiveCells(user,roles),active=own(control,'draftReviewPolicy');
 if(!active)return{cells:before,draftReviewPolicyActive:false};
 const plan=prepareDraftReviewPolicy(user,roles,control),supported=control.draftReviewPolicy==='page-v1'&&control.schemaVersion===2&&control.primaryAdminId===PRIMARY_ADMIN_ID,resolved=supported&&plan.projectionReady;
 const blocked=supported?plan.blocked.map(row=>row.code):['DRAFT_REVIEW_POLICY_LAYOUT_INVALID'];
 let cells={...plan.after};if(!resolved){cells={...plan.before,[key]:false};for(const row of catalog.filter(row=>row.ops.includes('submit')))for(const op of ['submit','withdraw','return','approve'])cells[row.id+'.'+op]=false;}
 return{cells,draftReviewPolicyActive:true,reviewPolicy:{resolved,blocked}};
}
export function publicAccountReviewContext(users,roles,control,actor){
 if(!own(control,'draftReviewPolicy'))return undefined;
 const safe={schemaVersion:control.schemaVersion===2?2:0,primaryAdminId:control.primaryAdminId===PRIMARY_ADMIN_ID?PRIMARY_ADMIN_ID:'invalid',draftReviewPolicy:control.draftReviewPolicy==='page-v1'?'page-v1':'unsupported',audit:[]},seen=new Set();
 const subjects=[...users,...Object.keys(roles).map(role=>({id:'role-preview',role,enabled:true}))];
 const audit=Array.isArray(control?.audit)?control.audit:[];
 for(const user of subjects){const source=platformApprovalSource(user,roles,control);if(source.status!=='confirmed-explicit'||seen.has(source.auditId))continue;
  const entry=[...audit].reverse().find(row=>row?.id===source.auditId&&row.target===source.subject.id);if(!entry)continue;seen.add(source.auditId);
  const field=source.subject.kind==='user'?'accessOverrides':'access',selected=value=>({[field]:own(value?.[field],key)?{[key]:value[field][key]}:{}});
  safe.audit.push({id:entry.id,actor:{id:entry.actor.id,role:entry.actor.role},action:entry.action,target:entry.target,before:selected(entry.before),after:selected(entry.after),...(own(entry,'approvalConfirmation')?{approvalConfirmation:{...entry.approvalConfirmation}}:{})});
 }
 return{control:safe,canConfirm:isPrimary(actor)};
}
export function previewAccountCells(user,roles,context,confirmation){
 if(!context)return effectiveCells(user,roles);
 let control=context.control;
 if(context.canConfirm===true&&confirmation){
  const subject=confirmation,field=subject.kind==='role'?'access':'accessOverrides',value=subject.kind==='role'?roles[subject.id]?.access:user.accessOverrides;
  if(['user','role'].includes(subject.kind)&&typeof subject.id==='string'&&subject.id&&value?.[key]===true){const snapshot={[field]:{[key]:true}},entry={id:'local-preview-not-authority',actor:{id:PRIMARY_ADMIN_ID,role:'admin'},action:subject.kind==='role'?'update-role':'update-user',target:subject.id,before:snapshot,after:snapshot,approvalConfirmation:{schemaVersion:1,permission:key,granted:true,subjectKind:subject.kind,subjectId:subject.id}};control={...control,audit:[...control.audit,entry]};}
 }
 return resolveAccountReview(user,roles,control).cells;
}
