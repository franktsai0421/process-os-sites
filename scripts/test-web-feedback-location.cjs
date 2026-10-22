/* oxlint-disable typescript/no-require-imports -- locator regression fixtures */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const results=[],nodes=new Map(),root=process.argv[2];if(!root)throw Error('Evidence output required');
const location={href:'http://localhost:3020/process/?view=editor&system=process',origin:'http://localhost:3020'};
const document={documentElement:{lang:'zh-Hant'},querySelector(){return null;},querySelectorAll(s){return nodes.get(s)||[];}};
const window={addEventListener(){}};
// Expose private pure locator functions only in this isolated VM, never in the product.
const source=fs.readFileSync('public/process/web-feedback.js','utf8').replace('window.WebFeedback={open,admin,identityChanged,routeChanged};','window.WebFeedback={locate,resolveLocation};');
vm.runInNewContext(source,{window,document,location,URL,CSS:{escape:s=>s},crypto:require('node:crypto').webcrypto,Set,Promise});
function element(tag,attributes={},ancestors={}){const el={tagName:tag,id:attributes.id||'',textContent:'',getAttribute:k=>attributes[k]||null,closest(s){if(s.includes('[data-node]')&&attributes['data-node'])return el;return ancestors[s]||null;}};return el;}
function test(name,fn){fn();results.push({name,status:'PASS'});}
const card=element('ARTICLE',{'data-node':'stable-record-123'}),selector='[data-node="stable-record-123"]';nodes.set(selector,[card]);
test('Repeated card port targets stable business card',()=>{const port=element('BUTTON',{}, {'[data-node]':card,'[data-op-id],[data-node]':card});const selected=window.WebFeedback.locate(port);assert.equal(selected.locator.attribute,'data-node');assert.equal(selected.context.recordId,'stable-record-123');assert.equal(window.WebFeedback.resolveLocation(selected),card);});
const saved={type:'element',view:'editor',tab:'',system:'process',locator:{attribute:'data-node',value:'stable-record-123',tag:'article'},context:{recordId:'another-record'}};
test('Reused selector with different record never reattaches',()=>assert.equal(window.WebFeedback.resolveLocation(saved),null));
test('Other route never reattaches',()=>assert.equal(window.WebFeedback.resolveLocation({...saved,view:'data'}),null));
test('Duplicate locator never reattaches',()=>{nodes.set(selector,[card,card]);assert.equal(window.WebFeedback.resolveLocation({...saved,context:{}}),null);nodes.set(selector,[card]);});
test('Missing/deleted element never reattaches',()=>{nodes.delete(selector);assert.equal(window.WebFeedback.resolveLocation({...saved,context:{}}),null);});
test('Reusable modal control falls back to page',()=>{const modal=element('DIALOG'),control=element('BUTTON',{id:'apply-operation'},{dialog:modal});nodes.set('#apply-operation',[control]);const selected=window.WebFeedback.locate(control);assert.equal(selected.type,'page');assert.deepEqual(Object.keys(selected.locator),[]);});
fs.mkdirSync(root,{recursive:true});fs.writeFileSync(root+'/location-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
