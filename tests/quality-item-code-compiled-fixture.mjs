import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const qualityFixture = require('../scripts/v3-quality-growth-fixture.cjs');
export const cases = [
  {module:'fqc', key:'qualityMasterControl', add:'#fqc-add-error', edit:'[data-edit-error="error"]', form:'.fqc-modal-form', prefix:'fqc', id:'error'},
  {module:'iqc', key:'iqcMasterControl', add:'#iqc-add-error', edit:'[data-edit-error="error0"]', form:'#iqc-error-form', prefix:'iqc', id:'error0'},
  ...['A','B'].map(line => ({module:'ipqc-ab', key:'ipqcABMasterControl', line, add:'#ipqcab-add-error', edit:'[data-ab-edit-error="error0"]', form:'.ipqcab-dialog', prefix:'ipqcab', id:'error0'})),
  {module:'ipqc-c', key:'ipqcCMasterControl', add:'[data-ipqcc-add="error"]', edit:'[data-ipqcc-edit-error="error0"]', form:'#ipqcc-editor', prefix:'ipqcc', id:'error0'},
];

export function seed(values) {
  const users=JSON.parse(values.platformUsers);
  users.push({...users.find(user=>user.id==='frank'),id:'quality-reviewer',name:'Synthetic quality reviewer',primary:false});
  values.platformUsers=JSON.stringify(users);
  const master = JSON.parse(values.masterDataControl);
  for (const config of cases.filter(c => c.line !== 'B')) {
    const data = qualityFixture(config.module,[{id:'synthetic',bytes:1}],0,1);
    const control = JSON.parse(data.values[data.key], (key,value) => {
      if (['mediaItems','standardPhotos','methodPhotos','photos'].includes(key)) return [];
      if (key === 'items' && Array.isArray(value) && ['iqc','ipqc-c'].includes(config.module)) {
        return legacyRows(value.map(item => ({...item, equipmentSnapshot:null})));
      }
      if (key==='items' && Array.isArray(value) && value[0]?.errorId) return legacyRows(value);
      return value;
    });
    if (config.module === 'ipqc-ab') {
      control.scopes['B:GB'] = makeB(control.scopes['A:G']);
    }
    values[data.key] = JSON.stringify(control);
    if (config.module === 'fqc') {
      const {AB,C} = JSON.parse(data.values.masterDataControl).active;
      const b = makeB(AB);
      for (const key of ['categoryGroups','products','lines']) AB[key].push(...b[key]);
      for (const [scope,catalog] of Object.entries({AB,C})) {
        master.active[scope] = catalog;
        master.versions.find(v => v.scope === scope).snapshot = catalog;
      }
    }
  }
  values.masterDataControl = JSON.stringify(master);
}

function legacyRows(items) {
  const first=items[0];
  if(!first?.errorId)return items;
  const field='checkNo' in first?'checkNo':'code',prefix=first[field].slice(0,-3);
  return [...items,{...first,id:'ambiguous', [field]:prefix+'-X-04'},{...first,id:'long', [field]:prefix+'-123'}];
}
function makeB(input) {
  return JSON.parse(JSON.stringify(input), (key,value) => {
    if (value === 'A') return 'B';
    if (value === 'A:G') return 'B:GB';
    if (value === 'G') return 'GB';
    if (value === 'PAB') return 'PBB';
    return typeof value === 'string' ? value.replaceAll('A-CUT','B-CUT').replace('ipqc-ab:A:G','ipqc-ab:B:GB') : value;
  });
}
