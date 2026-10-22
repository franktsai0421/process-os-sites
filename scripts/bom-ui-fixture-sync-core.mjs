import __factoryBuiltin0 from "node:fs";
import __factoryBuiltin1 from "node:path";
import __factoryBuiltin2 from "node:http";
export default function createLegacyApi(){
// Loopback-only BOM UI harness. All writes use real handlers and an in-memory database.
const fs=__factoryBuiltin0,path=__factoryBuiltin1,http=__factoryBuiltin2;
return ({load,headers,core,db})=>{
 let actor='editor',failSave=false;const routes=new Map();
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost:3002');
  if(url.pathname==='/fixture'){
   if(headers[url.searchParams.get('actor')])actor=url.searchParams.get('actor');
   if(url.searchParams.has('failSave'))failSave=url.searchParams.get('failSave')==='1';
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="zh-TW"><head><link rel="stylesheet" href="/process/bom-workspace.css"><link rel="stylesheet" href="/process/version-draft-ui.css"><style>body{font:14px system-ui;margin:20px}button,input,select{padding:8px}small{display:block}</style></head><body><aside>3002 · BOM 隔離記憶體驗證 · ${actor} · <a href="/fixture?actor=editor">編輯者</a> <a href="/fixture?actor=viewer">唯讀</a> <a href="/fixture?actor=reviewer">審核者</a> <a href="/fixture?failSave=1">儲存故障</a> <a href="/fixture?failSave=0">正常儲存</a></aside><main id="data-content"></main><script>window.ProcessSync={identity:{id:${JSON.stringify(actor)}}};window.hasPermission=k=>${JSON.stringify(actor)}!=='viewer';window.bindDataInner=()=>{};window.bomTable=()=>'';</script><script src="/process/vendor/xlsx.full.min.js"></script><script src="/process/shared-draft-client.js"></script><script src="/process/version-draft-ui.js"></script><script src="/process/bom-workspace.js"></script><script>document.querySelector('#data-content').innerHTML=bomTable();bindDataInner('bom');</script></body></html>`);return;
  }
  if(url.pathname==='/fixture-state'){res.setHeader('Content-Type','application/json');const state=await core.readState();res.end(JSON.stringify({revision:state.revision,bom:JSON.parse(state.values.bomMasterControl||'null'),process:state.values.processEditorFixture}));return;}
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);
   if(failSave&&bytes.length&&JSON.parse(bytes).command?.action==='save'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'FIXTURE_SAVE_FAILED'}));return;}
   const key=url.pathname.slice(5);if(!routes.has(key))routes.set(key,load('app/api/'+key+'/route.ts'));const handler=routes.get(key)[req.method];if(!handler){res.writeHead(405);res.end();return;}
   const response=await handler(new Request(url,{method:req.method,headers:{...headers[actor],Origin:url.origin},...(bytes.length?{body:bytes}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const root=path.resolve('public'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'}[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(fs.readFileSync(file));
 }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
 server.listen(3002,'127.0.0.1',()=>console.log('BOM UI fixture ready: http://localhost:3002/fixture; SQLite/R2 in memory only'));
 process.on('SIGINT',()=>server.close(()=>db.close()));
};

}
