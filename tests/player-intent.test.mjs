import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import test from 'node:test';
const text=fs.readFileSync('public/process/app.js','utf8'),parsed=ts.createSourceFile('app.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const functions=parsed.statements.filter(n=>ts.isFunctionDeclaration(n)&&['applyPlayerIntent','rememberPlayerPosition'].includes(n.name?.text)).map(n=>n.getText(parsed)).join('\n');
test('actual player intent validates current line/stage, retains reload position, and never supplies identity',()=>{
 const state={deviceLine:'A',deviceStage:'A-CUT'},location={href:'https://fixture.invalid/process/?view=player&line=C&stage=C-PACK'},events=[];
 const context={state,location,URL,routing:{lines:[{code:'A',stages:[{code:'A-CUT'}]},{code:'C',stages:[{code:'C-CUT'},{code:'C-PACK'}]}]},history:{state:{kept:true},replaceState(s,_title,url){events.push(s);location.href=String(url);}}};
 vm.createContext(context);vm.runInContext(functions+';applyPlayerIntent();',context);assert.equal(state.deviceLine,'C');assert.equal(state.deviceStage,'C-PACK');assert.equal(state.currentUser,undefined);
 state.deviceStage='C-CUT';vm.runInContext('rememberPlayerPosition()',context);assert.equal(new URL(location.href).searchParams.get('stage'),'C-CUT');assert.deepEqual(events,[{kept:true}]);
 state.deviceLine='A';state.deviceStage='A-CUT';vm.runInContext('applyPlayerIntent()',context);assert.equal(state.deviceLine,'C');assert.equal(state.deviceStage,'C-CUT');
 location.href='https://fixture.invalid/process/?view=player&line=C&stage=A-CUT';vm.runInContext('applyPlayerIntent()',context);assert.equal(state.deviceStage,'C-CUT');
 location.href='https://fixture.invalid/process/?view=player&line=PRIVATE&stage=X';vm.runInContext('applyPlayerIntent()',context);assert.equal(state.deviceLine,'C');
 assert.match(text,/window\.addEventListener\('popstate',applyPlayerIntent\)/);
});
