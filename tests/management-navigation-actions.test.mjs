// Static JSX contract checks. Committed ReactDOM events are covered in the external DOM harness.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const matrix={
 'import/observation-client.tsx':[['/login?next=%2Fsetup%2Fimport',''],['/setup/import','']],
 'import/verify-client.tsx':[['/setup/import?continue=apply',''],['/login?next=%2Fsetup%2Fimport%3Fcontinue%3Dverify',''],['/setup/import','']],
 'import/upload-client.tsx':[['/login?next=%2Fsetup%2Fimport','_top']],
 'import/apply-client.tsx':[['/setup/import?continue=apply',''],['/login?next=%2Fsetup%2Fimport',''],['/setup/import?continue=verify','']],
 'import/page.tsx':[['/login?next=%2Fsetup%2Fimport','_top']],
 'owner/page.tsx':[['/login','']],
 'startup-assets/page.tsx':[['/process/','_top'],['/login','_top']],
};
const entries=Object.entries(matrix).map(([file,expected])=>{const source=readFileSync(new URL(`../app/setup/${file}`,import.meta.url),'utf8');return{file,expected,source,ast:ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)};});
function elements(node,tag){const found=[];function walk(n){if(ts.isJsxElement(n)&&n.openingElement.tagName.getText()===tag)found.push(n);ts.forEachChild(n,walk);}walk(node);return found;}
function attrs(node){return node.attributes.properties.filter(ts.isJsxAttribute).map(a=>[a.name.getText(),a.initializer&&ts.isStringLiteral(a.initializer)?a.initializer.text:a.initializer?.getText()??true]);}
function formData(form){const values=[];function walk(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText()==='input'){const a=Object.fromEntries(attrs(n));assert.equal(a.type,'hidden');assert.equal(typeof a.name,'string');assert.equal(typeof a.value,'string');values.push([a.name,a.value]);}ts.forEachChild(n,walk);}walk(form);return values;}
for(const e of entries)void test(`${e.file}: native GET destinations and targets are exact; no business form nesting`,()=>{
 assert.equal(elements(e.ast,'a').length,0);assert.doesNotMatch(e.source,/from\s+['"]next\/link['"]|window\.top|location\.assign|requestSubmit/);
 const forms=elements(e.ast,'form').filter(f=>Object.fromEntries(attrs(f.openingElement)).method==='get');
 assert.deepEqual(forms.map(f=>{const a=Object.fromEntries(attrs(f.openingElement));assert.equal(a.onSubmit,undefined);assert.equal(a.onClick,undefined);let parent=f.parent;while(parent){if(ts.isJsxElement(parent))assert.ok(!['form','p'].includes(parent.openingElement.tagName.getText()));parent=parent.parent;}
  const controls=elements(f,'button');assert.equal(controls.length,1);const b=Object.fromEntries(attrs(controls[0].openingElement));assert.equal(b.type,'submit');assert.equal(b.onClick,undefined);assert.equal(b.disabled,undefined);assert.match(b.style,/minHeight:44/);assert.ok(controls[0].children.some(c=>ts.isJsxText(c)&&c.text.includes(' / ')));
  const u=new URL(a.action,'https://synthetic.invalid');assert.equal(u.origin,'https://synthetic.invalid');const params=new URLSearchParams(formData(f));u.search=params.toString();return[u.pathname+u.search,a.target??''];}),e.expected);
});
void test('all 14 entries use exactly 13 GET forms and one real local mode button',()=>{
 assert.equal(entries.flatMap(e=>elements(e.ast,'form').filter(f=>Object.fromEntries(attrs(f.openingElement)).method==='get')).length,13);
 const {ast}=entries.find(e=>e.file==='import/page.tsx');const b=elements(ast,'button').find(n=>n.getText().includes('接續已上傳資料'));
 assert.ok(b);assert.equal(Object.fromEntries(attrs(b.openingElement)).type,'button');
 assert.match(b.getText(),/onClick=\{e=>\{e\.preventDefault\(\);history\.replaceState\(null,'','\?continue=verify'\);setContinuation\(true\);\}\}/);
 assert.doesNotMatch(b.getText(),/fetch|submit|location\./);
});
void test('owner navigation form is separate from credentials and cannot submit the owner POST',()=>{
 const e=entries.find(e=>e.file==='owner/page.tsx');const forms=elements(e.ast,'form');assert.equal(forms.length,2);
 const post=forms.find(f=>Object.fromEntries(attrs(f.openingElement)).onSubmit==='{submit}');assert.ok(post);assert.match(post.getText(),/name="bootstrapKey"/);assert.match(post.getText(),/name="password"/);assert.match(post.getText(),/name="confirmation"/);
 const navigation=forms.find(f=>Object.fromEntries(attrs(f.openingElement)).method==='get');assert.ok(navigation);assert.deepEqual(formData(navigation),[]);assert.doesNotMatch(navigation.getText(),/password|bootstrapKey|confirmation|onSubmit/);
});

void test('observation fixture walker terminates on void hidden controls and retains all nested buttons',()=>{
 const source=readFileSync(new URL('./c273-observation-client.test.mjs',import.meta.url),'utf8'),ast=ts.createSourceFile('fixture.mjs',source,ts.ScriptTarget.Latest,true);let declaration;
 function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='buttons')declaration=n;ts.forEachChild(n,walk);}walk(ast);assert.ok(declaration);
 const first={type:'button',props:{children:'first'}},second={type:'button',props:{children:'second'}},tree={type:'main',props:{children:[{type:'input',props:{type:'hidden',name:'next',value:'/setup/import'}},first,{type:'form',props:{children:[null,false,second]}}]}};
 const actual=runInNewContext(`(${declaration.getText(ast)})`,{tree},{timeout:1000});const result=actual();assert.equal(result.length,2);assert.equal(result[0],first);assert.equal(result[1],second);
 const old=runInNewContext(`(${declaration.getText(ast).replace('element.props?.children??[]','element.props?.children')})`,{tree},{timeout:1000});assert.throws(()=>old(),/Maximum call stack/);
});
