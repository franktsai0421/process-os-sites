// Test-only browser-source inventory. Does not run application code or timers.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {createHash} from 'node:crypto';
const extension=/\.(?:m?js|tsx?|html)$/;
const timerNames=new Set(['setTimeout','setInterval']);
const hash=text=>createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
export function readBrowserSources(root=process.cwd()){
 const sources=new Map();
 for(const dir of ['public','app','components','hooks','lib'])for(const rel of fs.readdirSync(path.join(root,dir),{recursive:true})){
  const file=(dir+'/'+rel).replaceAll('\\','/');if(extension.test(file)&&fs.statSync(path.join(root,file)).isFile())sources.set(file,fs.readFileSync(path.join(root,file),'utf8'));
 }
 return sources;
}
export function browserTimerInventory(sources){
 const parsed=new Map([...sources].map(([file,text])=>[file,ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true)]));
 const queue=[...sources.keys()].filter(file=>file.startsWith('public/')||file.startsWith('hooks/')||parsed.get(file).statements.some(n=>ts.isExpressionStatement(n)&&ts.isStringLiteral(n.expression)&&n.expression.text==='use client'));
 const reachable=new Set(),timers=[];
 function resolve(from,specifier){
  const spec=specifier.split('?')[0];let base;
  if(spec.startsWith('@/'))base=spec.slice(2);else if(spec.startsWith('.'))base=path.posix.normalize(path.posix.join(path.posix.dirname(from),spec));else return null;
  if(base.endsWith('.css'))return null;
  const target=[base,...['.ts','.tsx','.mjs','.js','/index.ts','/index.tsx'].map(ext=>base+ext)].find(file=>sources.has(file));
  if(!target)throw Error('UNRESOLVED_BROWSER_IMPORT: '+from+' -> '+specifier);return target;
 }
 while(queue.length){
  const file=queue.shift();if(reachable.has(file))continue;reachable.add(file);const ast=parsed.get(file),aliases=new Map(),nodes=[];
  const add=n=>{nodes.push(n);ts.forEachChild(n,add);};add(ast);
  const timerKind=n=>{
   if(!n)return null;
   if(ts.isIdentifier(n))return timerNames.has(n.text)?n.text:aliases.get(n.text)||null;
   if(ts.isPropertyAccessExpression(n))return timerNames.has(n.name.text)?n.name.text:null;
   if(ts.isElementAccessExpression(n)&&n.argumentExpression&&ts.isStringLiteralLike(n.argumentExpression))return timerNames.has(n.argumentExpression.text)?n.argumentExpression.text:null;
   if(ts.isParenthesizedExpression(n))return timerKind(n.expression);
   if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='bind')return timerKind(n.expression.expression);
   if(ts.isBinaryExpression(n))return timerKind(n.left)||timerKind(n.right);
   if(ts.isConditionalExpression(n))return timerKind(n.whenTrue)||timerKind(n.whenFalse);
   return null;
  };
  for(let round=0;round<nodes.length;round++){
   let changed=false;
   for(const n of nodes)if(ts.isVariableDeclaration(n)||ts.isParameter(n)){
    if(ts.isIdentifier(n.name)){const kind=timerKind(n.initializer);if(kind&&aliases.get(n.name.text)!==kind){aliases.set(n.name.text,kind);changed=true;}}
    else if(ts.isObjectBindingPattern(n.name))for(const part of n.name.elements){const property=part.propertyName||part.name;if(ts.isIdentifier(property)&&timerNames.has(property.text)&&ts.isIdentifier(part.name)&&aliases.get(part.name.text)!==property.text){aliases.set(part.name.text,property.text);changed=true;}}
   }
   if(!changed)break;
  }
  for(const n of nodes){
   if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){const dep=resolve(file,n.moduleSpecifier.text);if(dep)queue.push(dep);}
   if(ts.isCallExpression(n)){
    if(n.expression.kind===ts.SyntaxKind.ImportKeyword){if(!ts.isStringLiteralLike(n.arguments[0]))throw Error('DYNAMIC_BROWSER_IMPORT_REQUIRES_AUDIT: '+file);const dep=resolve(file,n.arguments[0].text);if(dep)queue.push(dep);}
    const kind=timerKind(n.expression);if(kind)timers.push({file,line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,kind,hash:hash(n.getText(ast))});
   }
  }
 }
 return {reachable:[...reachable].sort((a,b)=>a.localeCompare(b)),timers};
}
