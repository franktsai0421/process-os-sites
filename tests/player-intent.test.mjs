import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import test from 'node:test';
const text=fs.readFileSync('public/process/app.js','utf8'),parsed=ts.createSourceFile('app.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const functions=parsed.statements.filter(n=>ts.isFunctionDeclaration(n)&&['applyPlayerIntent','rememberPlayerPosition'].includes(n.name?.text)).map(n=>n.getText(parsed)).join('\n');
test('actual player intent validates current line/stage, retains reload position, and never supplies identity',()=>{
 const state={deviceLine:'A',deviceStage:'A-CUT'},location={href:'https://fixture.invalid/process/?view=player&line=C&stage=C-PACK'},events=[];
 const context={window:{},state,location,URL,routing:{lines:[{code:'A',stages:[{code:'A-CUT'}]},{code:'C',stages:[{code:'C-CUT'},{code:'C-PACK'}]}]},history:{state:{kept:true},replaceState(s,_title,url){events.push(s);location.href=String(url);}}};
 vm.createContext(context);vm.runInContext(functions+';applyPlayerIntent();',context);assert.equal(state.deviceLine,'C');assert.equal(state.deviceStage,'C-PACK');assert.equal(state.currentUser,undefined);
 state.deviceStage='C-CUT';vm.runInContext('rememberPlayerPosition()',context);assert.equal(new URL(location.href).searchParams.get('stage'),'C-CUT');assert.deepEqual(events,[{kept:true}]);
 state.deviceLine='A';state.deviceStage='A-CUT';vm.runInContext('applyPlayerIntent()',context);assert.equal(state.deviceLine,'C');assert.equal(state.deviceStage,'C-CUT');
 location.href='https://fixture.invalid/process/?view=player&line=C&stage=A-CUT';vm.runInContext('applyPlayerIntent()',context);assert.equal(state.deviceStage,'C-CUT');
 location.href='https://fixture.invalid/process/?view=player&line=PRIVATE&stage=X';vm.runInContext('applyPlayerIntent()',context);assert.equal(state.deviceLine,'C');
 assert.match(text,/window\.addEventListener\('popstate',/);
});
for(const outcome of ['missing method','declined','accepted'])test('actual player display URL hook '+outcome+' preserves history ownership and excludes identity',()=>{
 const identity={id:'synthetic-actor',role:'synthetic-role'},state={deviceLine:'C',deviceStage:'C-CUT',currentUser:identity};
 const location={href:'https://fixture.invalid/process/?view=player&line=C&stage=C-PACK'},historyState={kept:true,processNavigationIndex:7},replacements=[],delegated=[];
 const history={state:historyState,replaceState(value,title,url){replacements.push({value,title,url:String(url)});this.state=value;location.href=String(url);}};
 const navigation={};if(outcome!=='missing method')navigation.replaceDisplayURL=url=>{delegated.push(url);if(outcome==='accepted')location.href=String(url);return outcome==='accepted';};
 const context=vm.createContext({window:{ProcessDeliveryNavigation:navigation},state,location,history,URL});vm.runInContext(functions+';rememberPlayerPosition();',context);
 const actual=new URL(location.href);assert.equal(actual.origin,'https://fixture.invalid');assert.equal(actual.pathname,'/process/');assert.deepEqual(Object.fromEntries(actual.searchParams),{view:'player',line:'C',stage:'C-CUT',system:'process'});
 assert.strictEqual(state.currentUser,identity);assert.deepEqual(identity,{id:'synthetic-actor',role:'synthetic-role'});assert.strictEqual(history.state,historyState);assert.equal(history.state.processNavigationIndex,7);
 assert.equal(delegated.length,outcome==='missing method'?0:1);if(delegated.length){assert(delegated[0] instanceof URL);assert.equal(String(delegated[0]),location.href);}
 assert.equal(replacements.length,outcome==='accepted'?0:1);if(replacements.length){assert.strictEqual(replacements[0].value,historyState);assert.equal(replacements[0].title,'');assert.equal(replacements[0].url,location.href);}
});

test('actual player popstate retains native fallback but leaves owned history to fresh commit',()=>{
 const registration=text.split('\n').find(line=>line.startsWith("window.addEventListener('popstate',"));assert(registration);
 for(const owner of [undefined,{ownsHistory:false},{ownsHistory:true}]){
  const state={deviceLine:'A',deviceStage:'A-CUT'},window={ProcessDeliveryNavigation:owner,addEventListener(_name,fn){this.popstate=fn;}};
  const context=vm.createContext({window,state,URL,location:{href:'https://fixture.invalid/process/?view=player&line=C&stage=C-CUT'},routing:{lines:[{code:'C',stages:[{code:'C-CUT'}]}]}});
  vm.runInContext(functions+'\n'+registration,context);window.popstate();assert.equal(state.deviceLine,owner?.ownsHistory?'A':'C');assert.equal(state.deviceStage,owner?.ownsHistory?'A-CUT':'C-CUT');
  vm.runInContext('applyPlayerIntent()',context);assert.equal(state.deviceLine,'C');assert.equal(state.deviceStage,'C-CUT','explicit post-install application remains available to the owner');
 }
});
