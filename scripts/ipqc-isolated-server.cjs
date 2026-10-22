/* oxlint-disable typescript/no-require-imports -- loopback-only, in-memory acceptance server. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),fixture=require('./ipqc-assignment-fixture.cjs');
const authAdapter=require('./ipqc-isolated-auth.cjs');
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
(async()=>{const runtimeRoot=args.includes('--runtime-dir')?path.resolve(option('--runtime-dir')):null;
 if(args.includes('--session-revocation')&&!runtimeRoot)throw Error('Session revocation requires durable --runtime-dir');
 const fixtureOptions={...(args.includes('--media-root')?{photoRoot:path.resolve(option('--media-root'))}:{}),feedback:args.includes('--web-feedback'),normalLogin:true},sessionOptions=name=>args.includes('--session-revocation')?{sessionStore:path.join(runtimeRoot,name+'-session-revocations.sqlite'),sessionSecretFile:path.join(runtimeRoot,name+'-session-secret.json')}:{},primary=await fixture(option('--source'),{...fixtureOptions,...sessionOptions('primary')}),editorFixture=args.includes('--editor-fixture')?await fixture(option('--editor-fixture'),{...fixtureOptions,...sessionOptions('synthetic')}):null,port=Number(option('--port')||3016),before=args.includes('--before')?path.resolve(option('--before')):null;
 // Large captured states must not be decoded concurrently by every polling tab.
 // This queue wraps real handlers unchanged; business CAS/permissions still run.
 let requestQueue=Promise.resolve();
 async function serial(work){const prior=requestQueue;let release;requestQueue=new Promise(r=>release=r);await prior;try{return await work();}finally{release();}}
 const durable=require('./ipqc-durable-checkpoint.cjs')(runtimeRoot);
 if(fixtureOptions.feedback&&!runtimeRoot)throw Error('Feedback requires durable --runtime-dir');
 async function checkpointFeedback(f,name){if(!fixtureOptions.feedback)return;const file=path.join(runtimeRoot,name+'-web-feedback.json'),tmp=file+'.tmp',row=f.db.prepare('SELECT revision,payload FROM web_feedback_store WHERE id=1').get();fs.writeFileSync(tmp,JSON.stringify(row));fs.renameSync(tmp,file);}
 async function checkpoint(f,name){await durable.save(f,name);}
 if(runtimeRoot){fs.mkdirSync(runtimeRoot,{recursive:true});for(const name of ['primary','synthetic']){const f=name==='primary'?primary:editorFixture;if(!f)continue;
  if(fixtureOptions.feedback){const file=path.join(runtimeRoot,name+'-web-feedback.json');if(fs.existsSync(file)){const row=JSON.parse(fs.readFileSync(file,'utf8'));f.db.prepare('UPDATE web_feedback_store SET revision=?,payload=? WHERE id=1').run(row.revision,row.payload);}await checkpointFeedback(f,name);}
  const fallback=f.env.STATE_ARCHIVE,dir=path.join(runtimeRoot,name+'-archive');fs.mkdirSync(dir,{recursive:true});
  const file=k=>path.join(dir,require('node:crypto').createHash('sha256').update(k).digest('hex'));
  f.env.STATE_ARCHIVE={async put(k,v){fs.writeFileSync(file(k),Buffer.from(v));},async head(k){return fs.existsSync(file(k))?{}:fallback.head(k);},async get(k){if(!fs.existsSync(file(k)))return fallback.get(k);const b=fs.readFileSync(file(k));return {text:async()=>b.toString(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),body:new ReadableStream({start(c){c.enqueue(b);c.close();}}),httpMetadata:{contentType:'application/json'},writeHttpMetadata(h){h.set('Content-Type','application/json');}};}};
  await checkpoint(f,name);
 }}
 const {readWebImage}=await import('../lib/canonical-images.mjs'),assetManifest=JSON.parse(fs.readFileSync('data/canonical/assets/manifest.json','utf8')),assetCache=new Map();
 // Compile the enabled fixture route before accepting requests. This does not
 // call it, read private drafts, populate authorization caches, or bypass gates.
 // Normal Local uses its application host; this fixture has a separate TS loader.
 if(fixtureOptions.feedback)for(const f of [primary,editorFixture].filter(Boolean))f.api('/api/web-feedback');
 const server=http.createServer(async(req,res)=>{try{const host=String(req.headers.host).toLowerCase();if(!['127.0.0.1:'+port,'localhost:'+port].includes(host)){res.writeHead(400);res.end('Invalid local host');return;}const url=new URL(req.url,'http://'+host),isEditorFixture=!!editorFixture&&host==='localhost:'+port,f=isEditorFixture?editorFixture:primary;
  // The loopback fixture has no daily R2 binding. Serve the *same* immutable
  // canonical bytes after manifest/size/hash validation; never seed business data.
  if(url.pathname==='/api/canonical-assets'&&req.method==='GET'){
   const id=url.searchParams.get('id'),version=url.searchParams.get('version');
   if(!/^[a-f0-9]{64}$/.test(id||'')||!/^[a-f0-9]{64}$/.test(version||'')){res.writeHead(400);res.end('Invalid image reference');return;}
   const record=assetManifest.records.find(r=>r.id==='asset:'+id&&!r.deletedAt&&r.web?.sha256===version);
   if(!record){res.writeHead(404);res.end('Image not found');return;}
   let bytes=assetCache.get(version);if(!bytes){bytes=readWebImage(process.cwd(),record);assetCache.set(version,bytes);}
   res.writeHead(200,{'Content-Type':'image/webp','Content-Length':bytes.length,'Cache-Control':'private, max-age=31536000, immutable','ETag':'"'+version+'"','X-Content-Type-Options':'nosniff'});res.end(bytes);return;
  }
  if(url.pathname==='/fixture-info'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...f.metadata,isolated:true}));return;}
  if(url.pathname==='/fixture-checkpoint'&&req.method==='GET'&&req.headers['x-fixture-user']==='admin'){res.setHeader('Content-Type','application/json');await serial(async()=>res.end(await durable.bytes(f)));return;}
  if(url.pathname==='/fixture-account'){
   if(req.method==='POST'){const chunks=[];for await(const b of req)chunks.push(b);const user=new URLSearchParams(Buffer.concat(chunks).toString()).get('user');if(!f.sessions[user]){res.writeHead(400);res.end('Unknown isolated account');return;}const token=await f.core.demoSession(new Request(url.href),user,false);if(!token){res.writeHead(503);res.end('Isolated session unavailable');return;}res.writeHead(303,{'Set-Cookie':'ipqc_fixture_session='+token+'; Path=/; HttpOnly; SameSite=Strict',Location:'/process/?view=approval&system=process'});res.end();return;}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>3020 隔離測試帳號</title><main style="max-width:500px;margin:40px auto;font:18px system-ui"><h1>3020 隔離測試帳號</h1><p>只切換本隔離服務的合成測試帳號；不變更日常帳號權限。</p><form method="post"><label>測試身分 <select name="user" style="padding:12px"><option value="a">a · 員工</option><option value="admin">ADMIN · 可自送自審</option><option value="admin2">ADMIN 2 · 交叉驗收</option><option value="employee">employee · 無核准權員工</option><option value="disabled">停用帳號</option><option value="reviewer">reviewer · 審核者</option><option value="withdrawer">withdrawer · 僅撤回</option></select></label><button style="padding:12px">切換</button></form></main>');return;
  }
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const b of req)chunks.push(b);const body=Buffer.concat(chunks);let headers;
   try{headers=authAdapter.requestHeaders(req.headers,f.sessions);}catch{res.writeHead(401);res.end();return;}
   if(req.headers['x-fixture-user'])headers.set('Origin',url.origin);
   const handler=f.api(url.pathname)[req.method];if(!handler){res.writeHead(405);res.end();return;}
   await serial(async()=>{const response=await handler(new Request(url.href,{method:req.method,headers,...(body.length?{body}:{} )}));if(req.method!=='GET'&&response.ok){if(url.pathname==='/api/web-feedback')await checkpointFeedback(f,isEditorFixture?'synthetic':'primary');else await checkpoint(f,isEditorFixture?'synthetic':'primary');}res.writeHead(response.status,authAdapter.responseHeaders(response,url.pathname));res.end(Buffer.from(await response.arrayBuffer()));});return;
  }
  const relative=decodeURIComponent(url.pathname==='/'?'/process/index.html':url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname),base=path.resolve('public'),target=path.resolve(base,'.'+relative);
  if(!target.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}
  const baseline=before&&path.join(before,'public',relative),file=baseline&&fs.existsSync(baseline)?baseline:target;if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});const content=fs.readFileSync(file);res.end(path.extname(file)==='.html'?content.toString().replace('</body>',(fixtureOptions.feedback?'<script defer src="/process/web-feedback-loader.js"></script>':'')+'</body>').replace('<body>','<body><aside style="position:sticky;top:0;z-index:10000;padding:6px;background:#fff0c2;text-align:center" data-i18n-skip="true">'+(isEditorFixture?'3020 編輯台專用測試副本（合成產品，與原資料分離）':'3020 隔離測試')+' · <a href="/fixture-account">切換測試帳號／ADMIN</a></aside>'):content);
 }catch(error){console.error('Isolated request failed:',req.url,error.message);res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
 server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+port+'/process/?view=editor',...primary.metadata,inMemory:true,before:!!before})));process.on('SIGINT',()=>server.close(()=>{primary.close();editorFixture?.close();process.exit();}));
})().catch(e=>{console.error(e);process.exitCode=1;});
