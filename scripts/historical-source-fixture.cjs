/* Historical fixtures only. Current acceptance reads actual current sources.
 * Named projections reconstruct genuine frozen Git blobs, validated against bounded real
 * commit/tree witnesses. No object/ref is invented or inserted into Git. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pins=Object.freeze({main:Object.freeze({target:'latest_main',commit:'d4ac309fe05c89288af226b52c18161865ccdcb8',tree:'598194ab8561cfbab845e82ee7b0ccaf6629743b'}),background100:Object.freeze({target:'background100',commit:'158bb6b7ad3b98eda8104ef9a271073ee1caf0b3',tree:'6eee3963fec61a540c144a920fbb3f65949d5e10'}),history_frozen:Object.freeze({target:'history_frozen',commit:'3f6e736efddcd03f731ea180d063c489731339df',tree:'1d16d03dc77402d04688c99cff58ae04130906a3'})}),cache=new Map();
const proof=require('./unified-draft-source-contract.cjs'),witness=require('./unified-draft-source-witness.cjs').createWitness(require('./unified-draft-source-witness.json'));
const current=file=>proof.canonicalSource(fs.readFileSync(path.join(root,file)),execFileSync('git',['show','HEAD:'+file],{cwd:root,maxBuffer:8*1024*1024}));
let attested=false;
function readPublic(target,name){
 const pin=pins[target];assert(pin,'Unknown historical fixture target');assert(typeof name==='string'&&/^[a-z0-9-]+\.(?:js|css|html)$/.test(name),'Historical fixture requires one public asset basename');
 if(!attested){witness.attest(proof.manifest);proof.attest(current);attested=true;}
 assert.equal(proof.manifest.targets[pin.target].commit,pin.commit,'Historical fixture commit differs');assert.equal(proof.manifest.targets[pin.target].tree,pin.tree,'Historical fixture tree differs');
 const key=target+':'+name;if(!cache.has(key)){const file='public/process/'+name,raw=proof.project(current(file),file,pin.target);assert.equal(createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex'),witness.resolve(pin.commit,file),'Historical fixture must match the genuine Git blob');cache.set(key,raw.toString('utf8'));}return cache.get(key);
}
const integratedAssets=new Set(['shared-draft-client.js','process-authoring-v3.js','effective-version-notice.js','process-ipqc.js','editor-line-selection.js','process-editor.js','canvas-local.js']);
function expectedCurrentCache(asset){const references=[...readPublic('history_frozen','index.html').matchAll(/(?:data-process-src|src|href)="([^"]+)"/g)].map(match=>match[1]),matches=references.filter(value=>value.split('?')[0]===asset);assert.equal(matches.length,1,'Frozen history asset must exist exactly once: '+asset);return integratedAssets.has(asset)?'20261109-editor-complete-local1':matches[0].split('?v=')[1];}
module.exports=Object.freeze({readPublic,pins,expectedCurrentCache});
