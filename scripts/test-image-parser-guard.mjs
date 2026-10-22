import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {withFixtureCleanup} from './fixture-cleanup.mjs';
const fromVinext=createRequire(path.join(fs.realpathSync('node_modules/vinext'),'package.json'));
const resolved=fromVinext.resolve('image-size');
let packageRoot=path.dirname(resolved);
while(!fs.existsSync(path.join(packageRoot,'package.json'))||JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8')).name!=='image-size'){
 const parent=path.dirname(packageRoot);assert.notEqual(parent,packageRoot,'Image parser package root not found');packageRoot=parent;
}
const metadata=JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8'));
assert.match(metadata.version,/^\d+\.\d+\.\d+$/);
const [major,minor,patch]=metadata.version.split('.').map(Number);
assert(major>2||major===2&&(minor>0||minor===0&&patch>=4),'Official image-size security patch is required');
const cjs=fromVinext('image-size'),cjsFile=fromVinext('image-size/fromFile');
const esm=await import(pathToFileURL(path.join(packageRoot,metadata.exports['.'].import.default)).href);
const esmFile=await import(pathToFileURL(path.join(packageRoot,metadata.exports['./fromFile'].import.default)).href);
assert(['icns','heif','jxl'].every(type=>cjs.types.includes(type)),'No custom parser format disable');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'process-image-parser-normal-')),cases=[];
await withFixtureCleanup(async()=>{
 for(const format of ['png','jpeg','gif','webp']){
  const bytes=await sharp({create:{width:2,height:3,channels:3,background:{r:42,g:80,b:140}}}).toFormat(format).toBuffer();
  const file=path.join(fixture,'valid.'+format);fs.writeFileSync(file,bytes);
  for(const [entry,read]of [['cjs-memory',()=>cjs.imageSize(bytes)],['esm-memory',()=>esm.imageSize(bytes)],['cjs-file',()=>cjsFile.imageSizeFromFile(file)],['esm-file',()=>esmFile.imageSizeFromFile(file)]]){
   const dimensions=await read();assert.equal(dimensions.width,2);assert.equal(dimensions.height,3);cases.push({format,entry,status:'PASS'});
  }
 }
 console.log(JSON.stringify({status:'PASS_PATCHED_DEPENDENCY_AND_NORMAL_FORMAT_COMPATIBILITY',version:metadata.version,cases,uncommonFormats:'Support declarations retained; valid ICNS/HEIF/JXL images not tested',securityReproduction:'NOT_VERIFIED_PLATFORM_BLOCK',liveMainCache:'NOT_VERIFIED',mainWrites:0,nativeNetworkRequests:0}));
},()=>{
 const actual=fs.realpathSync(fixture);assert.equal(path.dirname(actual),fs.realpathSync(os.tmpdir()));assert(path.basename(actual).startsWith('process-image-parser-normal-'));fs.rmSync(actual,{recursive:true,force:true});
});
