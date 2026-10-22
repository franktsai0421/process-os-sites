// Temporary server ingress guard for the explicitly approved Local adoption.
// Leave the flag in place on any failure; release only after pointer verification.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const directory=path.resolve('.wrangler/local-only/v3-adoption-20261003');
const flag=path.join(directory,'read-only.lock');
if(!fs.existsSync(flag))throw Error('Local adoption read-only lock is required');
// Snapshot the inherited callable; delegation keeps its dynamic receiver and call lookup.
const original=Reflect.get(http.Server.prototype,'emit');
http.Server.prototype.emit=function(event,...args){
 if(event==='request'&&this.address()?.port===3000&&fs.existsSync(flag)){
  const [request,response]=args,url=new URL(request.url,'http://127.0.0.1:3000');
  const permitted=['GET','HEAD','OPTIONS'].includes(request.method)||(request.method==='POST'&&url.pathname==='/api/platform-login');
  if(!permitted){fs.appendFileSync(path.join(directory,'blocked-requests.jsonl'),JSON.stringify({at:new Date().toISOString(),method:request.method,path:url.pathname})+'\n');response.writeHead(423,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify({error:'LOCAL_ADOPTION_READ_ONLY',message:'Local 套用唯讀驗收中；尚未接收業務修改。'}));return true;}
 }
 return original.call(this,event,...args);
};
