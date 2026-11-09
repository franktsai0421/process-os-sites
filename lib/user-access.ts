export const roleDefaults = {
  admin: { name: 'ADMIN', lines: ['A','B','C'], views: ['dashboard','player','dispatch','productStatus','approval','editor','data'], permissions: ['approval.viewAll','approval.viewLine','approval.compare','approval.submit','approval.withdraw','approval.approve','approval.reject','approval.requestChange','approval.revoke','approval.revise','status.viewAllLines','status.viewDetails','status.viewMedia','master.delete','master.import','master.export'] },
  rd: { name: 'RD 主管', lines: ['A','B','C'], views: ['dashboard','productStatus','approval','editor','data'], permissions: ['approval.viewAll','approval.compare','approval.approve','approval.reject','approval.requestChange','approval.revoke','approval.revise','status.viewAllLines','status.viewDetails','status.viewMedia','master.delete','master.import','master.export'] },
  staff: { name: '製程人員（STAFF）', lines: ['A'], views: ['dashboard','productStatus','approval','editor','data'], permissions: ['approval.viewLine','approval.compare','approval.submit','approval.withdraw','approval.revise','status.viewDetails','status.viewMedia'] },
};
type AccessScope={id?:string; name?:string; lines:string[]; views:string[]; permissions:string[];access?:Record<string,boolean>};
export type AccessUser=Partial<AccessScope> & {id:string; role:string; enabled?:boolean; inheritRole?:boolean; deletedAt?:string;authMode?:string;accessOverrides?:Record<string,boolean>};
export type PlatformUser = AccessUser & { name: string; email?: string; password?: string; passwordHash?: string; authEpoch?: number };
export function roleTemplates(values:Record<string,string>):Record<string,AccessScope> {return templates(values,roleDefaults);}
export function effectiveAccess(user:AccessUser, values:Record<string,string>, roles=roleTemplates(values)) {
  const role = user.role;
  const preset = roles[role];
  const scope = user.inheritRole !== false ? preset : user;
  const enabled = user.enabled !== false && !user.deletedAt && !!preset;
  const primary=isPrimary(user);let cells=effectiveCells(user,roles);
  let draftReviewPolicyActive=false,reviewPolicy:{resolved:boolean;blocked:string[]}|undefined;
  let control:Record<string,unknown>={};try{control=JSON.parse(values.processAccessControl||'{}');}catch{/* Existing legacy control is not an activation source. */}
  if(control&&typeof control==='object'&&Object.hasOwn(control,'draftReviewPolicy')){
    draftReviewPolicyActive=true;
    const plan=prepareDraftReviewPolicy(user,roles,control),supported=control.draftReviewPolicy==='page-v1'&&control.schemaVersion===2&&control.primaryAdminId===PRIMARY_ADMIN_ID;
    const resolved=supported&&plan.projectionReady,blocked=supported?plan.blocked.map((row:{code:string})=>row.code):['DRAFT_REVIEW_POLICY_LAYOUT_INVALID'];
    if(resolved)cells={...plan.after};else{cells={...plan.before,'approval.approve':false};for(const row of catalog.filter(row=>row.ops.includes('submit')))for(const op of ['submit','withdraw','return','approve'])cells[row.id+'.'+op]=false;}
    reviewPolicy={resolved,blocked};
  }
  const legacyPermissions=primary?roleDefaults.admin.permissions:scope?.permissions||[];
  const permissions=draftReviewPolicyActive?legacyPermissions.filter(key=>!['approval.approve','approval.submit','approval.withdraw','approval.reject'].includes(key)):legacyPermissions;
  if(draftReviewPolicyActive){if(cells['approval.approve'])permissions.push('approval.approve');for(const [op,alias]of [['submit','approval.submit'],['withdraw','approval.withdraw'],['return','approval.reject']])if(catalog.some(row=>row.ops.includes('submit')&&cells[row.id+'.'+op]))permissions.push(alias);}

  return { role, enabled, primary, cells, draftReviewPolicyActive,...(reviewPolicy?{reviewPolicy}:{}), inheritRole: user.inheritRole !== false,
    lines: enabled ? ['A','B','C'] : [], views: enabled ? [...new Set(catalog.filter(row=>cells[row.id+'.view']).map(row=>row.view))] : [], permissions: enabled ? [...new Set([...permissions,...accessKeys.filter(key=>cells[key])])] : [] };
}
import {templates,effectiveCells,isPrimary,accessKeys,catalog,PRIMARY_ADMIN_ID} from '../public/process/access-policy.mjs';

import {prepareDraftReviewPolicy} from '../public/process/draft-review-policy.mjs';
