import __esmImport0 from "fs";
import {createRequire as __esmFactory} from 'node:module';
const __esmRequire=__esmFactory(import.meta.url);
const fs = __esmImport0;
const src = JSON.parse(fs.readFileSync('public/process/routine-source.json', 'utf8'));

for (const e of src.equipment) {
  if (!e.photoId && e.photoSource?.webSha256) e.photoId = e.photoSource.webSha256;
}

function hierarchy(version) {
  const categories = [...(version.categories || [])];
  const subcategories = [...(version.subcategories || [])];
  const groups = (version.groups || []).map(group => ({ ...group }));
  for (const group of groups) {
    const code = String(group.categoryCode || '').trim();
    const categoryName = String(group.category || '').trim();
    let category = categories.find(item => item.id === group.categoryId) || categories.find(item => item.code === code && item.name === categoryName);
    if (!category && code) {
      category = { id: `legacy-category:${encodeURIComponent(code)}`, code, name: categoryName || code, sourceName: categoryName };
      categories.push(category);
    }
    if (!category) continue;
    group.categoryId = category.id;
    const subName = String(group.subcategory || '').trim();
    let sub = subcategories.find(item => item.id === group.subcategoryId) || subcategories.find(item => item.categoryId === category.id && item.name === subName);
    if (!sub && subName) {
      sub = { id: `legacy-subcategory:${encodeURIComponent(category.id)}:${encodeURIComponent(subName)}`, categoryId: category.id, name: subName, sourceName: subName };
      subcategories.push(sub);
    }
    if (sub) group.subcategoryId = sub.id;
    group.name ||= String(group.nameVi || group.nameZh || group.id);
  }
  return { categories, subcategories, groups };
}

const tree = hierarchy(src);

let subCount = 0;
let groupCount = 0;
for (const cat of tree.categories) {
  if (!['C01', 'C02', 'C03', 'C04', 'C05', 'C06'].includes(cat.code)) continue;
  const subs = tree.subcategories.filter(s => s.categoryId === cat.id);
  subCount += subs.length;
  for (const sub of subs) {
    const sGroups = tree.groups.filter(g => g.subcategoryId === sub.id);
    groupCount += sGroups.length;
  }
}
console.log(`C01~C06 Subcategories: ${subCount}, Groups: ${groupCount}`);
