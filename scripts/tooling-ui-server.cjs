/* oxlint-disable typescript/no-require-imports -- loopback UI acceptance, memory data only. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
module.exports=({load,headers,core,db})=>{
 let iqcFailure=false;const routes=new Map(),port=3031;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  if(url.pathname==='/fixture'){
   if(url.searchParams.has('iqc'))iqcFailure=url.searchParams.get('iqc')==='fail';
   const user=url.searchParams.get('user');if(user&&headers[user])res.setHeader('Set-Cookie','tooling_fixture='+user+'; Path=/; HttpOnly; SameSite=Strict');
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>3031 模具 UI 記憶體驗收</h1><p>合成資料，非3030匯入庫。IQC failure: '+iqcFailure+'</p>'+Object.keys(headers).map(u=>'<p><a href="/fixture?user='+u+'">帳號 '+u+'</a></p>').join('')+'<p><a href="/fixture?iqc=fail">IQC 失敗</a> / <a href="/fixture?iqc=ok">IQC 正常</a></p><a href="/process/?system=quality&view=data&dataTab=quality-mold-equipment">開啟模具模組</a>');return;
  }
  if(url.pathname==='/fixture-state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await core.readState()));return;}
  if(url.pathname.startsWith('/api/')){
   if(iqcFailure&&url.pathname==='/api/tooling/iqc'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'FIXTURE_IQC_UNAVAILABLE'}));return;}
   const user=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('tooling_fixture='))?.split('=')[1]||'a';if(!headers[user]){res.writeHead(401);res.end();return;}
   const body=[];for await(const c of req)body.push(c);const raw=Buffer.concat(body),h=new Headers(req.headers);for(const [k,v]of Object.entries(headers[user]))h.set(k,v);h.set('Origin',url.origin);h.delete('content-length');h.delete('host');
   const key=url.pathname.slice(5);if(!routes.has(key))routes.set(key,load('app/api/'+key+'/route.ts'));const handler=routes.get(key)[req.method];if(!handler){res.writeHead(405);res.end();return;}
   const response=await handler(new Request(url,{method:req.method,headers:h,...(raw.length?{body:raw}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const relative=decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname),root=path.resolve('public'),file=path.resolve(root,'.'+relative);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const type={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});let bytes=fs.readFileSync(file);if(file.endsWith('.html'))bytes=bytes.toString().replace('<body>','<body><aside data-i18n-skip="true" style="padding:8px;background:#fff0c2">3031 合成記憶體驗收 · <a href="/fixture">帳號／故障注入</a></aside>');res.end(bytes);
 }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
 server.listen(port,'127.0.0.1',()=>console.log('UI fixture ready at http://127.0.0.1:'+port+'/fixture'));
 process.on('SIGINT',()=>server.close(()=>{db.close();process.exitCode=0;}));
};
