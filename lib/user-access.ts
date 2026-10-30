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
  const cells=effectiveCells(user,roles),primary=isPrimary(user);
  return { role, enabled, primary, cells, inheritRole: user.inheritRole !== false,
    lines: enabled ? ['A','B','C'] : [], views: enabled ? [...new Set(catalog.filter(row=>cells[row.id+'.view']).map(row=>row.view))] : [], permissions: enabled ? [...new Set([...(primary?roleDefaults.admin.permissions:scope?.permissions||[]),...accessKeys.filter(key=>cells[key])])] : [] };
}
import {templates,effectiveCells,isPrimary,accessKeys,catalog} from '../public/process/access-policy.mjs';
