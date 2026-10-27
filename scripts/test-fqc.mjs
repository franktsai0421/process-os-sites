import __esmImport0 from "node:assert/strict";
import __esmImport1 from "node:fs";
import __esmImport2 from "node:vm";
import __esmImport3 from "node:path";
import __esmImport4 from "typescript";
import {fileURLToPath as __esmPath} from 'node:url';
import __esmPathModule from 'node:path';
const __filename=__esmPath(new URL('./test-fqc.cjs',import.meta.url));
const __dirname=__esmPathModule.dirname(__filename);
const assert = __esmImport0;
const fs = __esmImport1;
const _vm = __esmImport2;
const path = __esmImport3;
const root = path.resolve(__dirname, '..');
const canonical = JSON.parse(fs.readFileSync(path.join(root, 'data/canonical/quality/fqc.json'), 'utf8'));
const errors = canonical.records.filter(record => record.type === 'error-code');
const items = canonical.records.filter(record => record.type === 'check-item');
assert.ok(items.every(record => record.data.source.sha256 === '5BC8CC4B55C4194DA08E18E4F9E75CE65D4FB50967B2A0BB2F861B5845FCF257'));
assert.equal(errors.length, 164);
assert.equal(items.length, 508);
assert.equal(new Set(items.map(record => record.data.checkNo)).size, 508);
for (const code of ['103SM00012', '104A10202', '108BR4005']) {
  const refs = items.flatMap(record => record.data.productRefs || []).filter(ref => ref.code === code);
  assert.ok(refs.length > 0, `${code} must be retained`);
  assert.ok(refs.every(ref => ref.kind === 'semi-finished'), `${code} must retain semi-finished identity`);
}
for (const category of ['BRX1021-CO3360', 'DAUTUOICAY-RUAXE', 'ONGHOI-CAOAP/BRX-CAOAP', 'PHAODIEN', 'PVC(2)']) assert.ok(items.some(record => record.data.category === category));
const source = fs.readFileSync(path.join(root, 'public/process/fqc-master.js'), 'utf8');
for (const signal of ['qualityMasterControl', 'await window.ProcessSync?.flush?.()', 'data-matrix-item', 'preselectCode', 'mediaItems']) assert.match(source, new RegExp(signal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
const excel = fs.readFileSync(path.join(root, 'public/process/fqc-excel.js'), 'utf8');
assert.match(excel, /sheet\['!merges'\]/);
assert.match(excel, /PROCESS_OS_FQC_EXCEL/);

// Current whole-module controller contract: the signed server response supplies status.
// This component VM checks production transport/sharedAction/adopt delegation only;
// it does not claim API permission, database, real HTTP or browser acceptance.
const ts = __esmImport4;
const ast = ts.createSourceFile('fqc-master.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function productionFunction(name) {
  const found=[];
  function visit(node) { if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found.push(node);ts.forEachChild(node,visit); }
  visit(ast);assert.equal(found.length,1,'Production function '+name+' must exist once');return found[0].getText(ast);
}
async function currentWholeModuleDelegation() {
  const copy=value=>JSON.parse(JSON.stringify(value)),working={errors:[],items:[{id:'unit-item',name:'synthetic'}]};
  const control={activeVersionId:'active',versions:[{id:'active',status:'approved',snapshot:copy(working)},{id:'draft',status:'draft',snapshot:copy(working)}],workflow:{generation:'unit-generation',revision:1,working:copy(working)}};
  const owner={libraries:{fqc:control}},commands=[],events=[],buttons=[{disabled:false},{disabled:false}];let resolve,reject,options,renders=0;
  const client={hasUnknown:()=>false,command(generation,action,detail){commands.push({generation,action,detail});return new Promise((yes,no)=>{resolve=yes;reject=no;});},begin(){throw Error('Unexpected implicit begin');},flush(){throw Error('Unexpected Save in submit/review contract');}};
  const context={ui:{saving:false,lastError:null,selectedVersionId:'draft'},sharedClient:null,sharedActor:'',mountSequence:0,pendingCommandFeedback:null,activeSharedAction:null,syncBase:copy(working),syncGeneration:'unit-generation',clone:copy,
    ensureControl:()=>owner,library:()=>owner.libraries.fqc,selected:()=>owner.libraries.fqc.versions.find(v=>v.id===context.ui.selectedVersionId),editable:()=>owner.libraries.fqc.versions.find(v=>v.status==='draft'),identity:()=>({id:'synthetic-controller-actor'}),
    hostElement:{querySelectorAll:()=>buttons,querySelector:()=>null},document:{querySelector:()=>null},isVi:()=>false,render(){renders++;},
    window:{ProcessSync:{platformHeaders:()=>({'Content-Type':'application/json'})},createSharedDraftClient(value){options=value;return client;},dispatchEvent(event){events.push(event.type);}},CustomEvent:class{constructor(type){this.type=type;}}};
  _vm.runInNewContext(['currentReadOwner','transport','adopt','sharedAction'].map(productionFunction).join('\n')+'\nthis.sharedAction=sharedAction;',context);
  const submitDetail={savedId:'synthetic-saved',reason:'synthetic submission'},submit=context.sharedAction('submit',submitDetail);
  assert.equal(context.ui.saving,true);assert.ok(buttons.every(button=>button.disabled));assert.equal(owner.libraries.fqc.versions.find(v=>v.id==='draft').status,'draft','No optimistic pending mutation before API response');
  assert.equal(options.endpoint,'/api/fqc/workflow?caseMetadata=1');assert.equal(options.actorId,'synthetic-controller-actor');assert.equal(commands[0].generation,'unit-generation');assert.equal(commands[0].action,'submit');assert.strictEqual(commands[0].detail,submitDetail);
  const pendingControl={activeVersionId:'active',versions:[control.versions[0],{id:'case',status:'pending',snapshot:copy(working)}],workflow:{generation:'unit-generation',revision:2,working:copy(working),pendingId:'case'}};
  const pendingReply={control:pendingControl,revision:2};resolve(pendingReply);assert.strictEqual(await submit,pendingReply);assert.strictEqual(owner.libraries.fqc,pendingControl);assert.equal(context.ui.selectedVersionId,'case');assert.equal(context.ui.saving,false);assert.equal(context.syncGeneration,'unit-generation');assert.deepEqual(context.syncBase,working);
  const approveDetail={id:'case',reason:'synthetic review'},approve=context.sharedAction('approve',approveDetail);assert.equal(owner.libraries.fqc.versions.find(v=>v.id==='case').status,'pending','No optimistic approve mutation before API response');assert.equal(commands[1].action,'approve');assert.strictEqual(commands[1].detail,approveDetail);
  const approvedControl={activeVersionId:'case',versions:[{id:'case',status:'approved',snapshot:copy(working)}],workflow:{generation:'unit-generation',revision:3,working:copy(working)}};
  const approvedReply={control:approvedControl,revision:3};resolve(approvedReply);assert.strictEqual(await approve,approvedReply);assert.strictEqual(owner.libraries.fqc,approvedControl);assert.equal(context.ui.selectedVersionId,'case');assert.equal(context.selected().status,'approved');assert.equal(context.ui.saving,false);assert.equal(events.length,2);assert.equal(renders,2);
  const failed=context.sharedAction('approve',approveDetail);reject(Error('SYNTHETIC_API_CONFLICT'));await assert.rejects(failed,/SYNTHETIC_API_CONFLICT/);assert.strictEqual(owner.libraries.fqc,approvedControl);assert.equal(context.ui.lastError,'SYNTHETIC_API_CONFLICT');assert.equal(context.ui.saving,false);assert.equal(events.length,2);assert.equal(renders,3);
}
currentWholeModuleDelegation().then(()=>console.log('FQC canonical and workflow checks passed')).catch(error=>{console.error(error);process.exitCode=1;});
