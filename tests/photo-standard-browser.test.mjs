import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import sharp from 'sharp';import {chromium} from 'playwright';
import {pngFixture} from './photo-fixtures.mjs';
const fixtures=[
 {name:'transparent technical drawing',type:'image/png',bytes:pngFixture({alpha:true}),orientation:false},
 {name:'portrait EXIF camera',type:'image/jpeg',bytes:await sharp({create:{width:120,height:80,channels:3,background:'#255588'}}).jpeg().withMetadata({orientation:6}).toBuffer(),orientation:true},
 {name:'landscape JPEG',type:'image/jpeg',bytes:await sharp(pngFixture({width:800,height:400})).jpeg().toBuffer(),orientation:false},
 {name:'existing WebP',type:'image/webp',bytes:await sharp(pngFixture({width:600,height:300})).webp().toBuffer(),orientation:false}
];
const server=http.createServer((req,res)=>{if(req.url==='/photo-policy.mjs'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(new URL('../public/process/photo-policy.mjs',import.meta.url)));}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta name="viewport" content="width=device-width"><body>Isolated photo decoder</body></html>');}});
let browser;const results=[];
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-background-networking']});
 for(const width of [1365,390]){
 const page=await browser.newPage({viewport:{width,height:844}});await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await page.goto(origin);
 for(const fixture of fixtures){
  const outcome=await page.evaluate(async({data,type})=>{
   const {prepareBrowserPhoto}=await import('/photo-policy.mjs');const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),original=new File([bytes],'synthetic',{type});
   async function pixels(blob){const url=URL.createObjectURL(blob);try{const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return{width:canvas.width,height:canvas.height,hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',ctx.getImageData(0,0,canvas.width,canvas.height).data))].join(',')};}finally{URL.revokeObjectURL(url);}}
   const before=await pixels(original),first=await prepareBrowserPhoto(original),after=await pixels(first.blob),retry=await prepareBrowserPhoto(original);
   return{before,after,type:first.blob.type,bytes:first.blob.size,originalBytes:original.size,retryBytes:retry.blob.size};
  },{data:fixture.bytes.toString('base64'),type:fixture.type});
  assert.deepEqual(outcome.before,outcome.after);assert.equal(outcome.bytes,outcome.retryBytes);assert.equal(outcome.type,fixture.type);if(fixture.orientation){assert.equal(outcome.after.width,80);assert.equal(outcome.after.height,120);}
  results.push({name:fixture.name,viewport:width,status:'PASS',dimensions:[outcome.after.width,outcome.after.height]});
 }
 await page.close();
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify({status:'PASS_BROWSER_LOSSLESS_PHOTOS',cases:results.length,results,physicalDevice:false}));
