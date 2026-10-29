import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
import {prepareBrowserPhoto} from '../public/process/photo-policy.mjs';
import {pngFixture} from './photo-fixtures.mjs';
const source=fs.readFileSync(new URL('../public/process/fqc-master.js',import.meta.url),'utf8');
const start=source.indexOf('  async function fileData(file) {'),end=source.indexOf('  function openExistingModal(',start);
assert.ok(start>=0&&end>start);
class Reader {readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');this.onload();},e=>{this.error=e;this.onerror();});}}
const context=vm.createContext({FileReader:Reader});
const policy=new vm.SyntheticModule(['prepareBrowserPhoto'],function(){this.setExport('prepareBrowserPhoto',prepareBrowserPhoto);},{context});
await policy.link(()=>{});await policy.evaluate();
const uploadModule=new vm.SourceTextModule(source.slice(start,end)+'\nexport {fileData};',{context,importModuleDynamically:async spec=>{assert.equal(spec,'./photo-policy.mjs?v=20261023-lossless1');return policy;}});
await uploadModule.link(()=>{});await uploadModule.evaluate();
const bytes=pngFixture({alpha:true}),blob=new File([bytes],'synthetic.png',{type:'image/png'});
const expected=await prepareBrowserPhoto(blob),actual=await uploadModule.namespace.fileData(blob);
assert.deepEqual(Buffer.from(actual.split(',')[1],'base64'),Buffer.from(await expected.blob.arrayBuffer()));
assert.ok(expected.changed);
const corrupt=Buffer.from(bytes);corrupt[corrupt.length-5]^=1;await assert.rejects(uploadModule.namespace.fileData(new File([corrupt],'bad.png',{type:'image/png'})),/PHOTO_PNG_INVALID/);
console.log(JSON.stringify({status:'PASS_FQC_ACTUAL_UPLOAD_HELPER',cases:2,originalUntouched:true}));
