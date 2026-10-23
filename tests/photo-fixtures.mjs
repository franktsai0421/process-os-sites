// Generated pixels only. Never reads company media or credentials.
import {deflateSync} from 'node:zlib';
const crc=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;}return(n^0xffffffff)>>>0;};
export function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4,4,'ascii');Buffer.from(data).copy(b,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;}
const paeth=(a,b,c)=>{const p=a+b-c,ds=[Math.abs(p-a),Math.abs(p-b),Math.abs(p-c)],m=Math.min(...ds);return ds[0]===m?a:ds[1]===m?b:c;};
export function pngFixture({width=512,height=256,alpha=false,animation=false,invalidData=false,filter=0,bits=8,colour=alpha?6:2}={}){
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=bits;ihdr[9]=colour;
 const channels=({0:1,2:3,3:1,4:2,6:4})[colour],rowBytes=Math.ceil(width*channels*bits/8),bpp=Math.ceil(channels*bits/8),raw=Buffer.alloc((rowBytes+1)*height);
 let previous=Buffer.alloc(rowBytes);
 for(let y=0;y<height;y++){const row=Buffer.alloc(rowBytes);for(let i=0;i<rowBytes;i++)row[i]=(i*3+y*7)%256;const mode=filter==='all'?y%5:filter,at=y*(rowBytes+1);raw[at]=mode;for(let i=0;i<rowBytes;i++){const a=i>=bpp?row[i-bpp]:0,b=previous[i],c=i>=bpp?previous[i-bpp]:0,p=mode===0?0:mode===1?a:mode===2?b:mode===3?Math.floor((a+b)/2):paeth(a,b,c);raw[at+i+1]=(row[i]-p)&255;}previous=row;}
 const gamma=Buffer.alloc(4);gamma.writeUInt32BE(45455);const frames=Buffer.alloc(8);frames.writeUInt32BE(1);
 const palette=Buffer.from(Array.from({length:768},(_,i)=>i%256));
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('gAMA',gamma),chunk('tEXt',Buffer.from('Comment\0synthetic fixture')),...(colour===3?[chunk('PLTE',palette),chunk('tRNS',Buffer.from(Array.from({length:256},(_,i)=>i)))]:[]),...(animation?[chunk('acTL',frames)]:[]),chunk('IDAT',invalidData?Buffer.from('not zlib'):deflateSync(raw,{level:0})),chunk('IEND',Buffer.alloc(0))]);
}
