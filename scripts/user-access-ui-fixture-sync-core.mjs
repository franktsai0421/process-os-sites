import __factoryBuiltin0 from "node:fs";
import __factoryBuiltin1 from "node:path";
import __factoryBuiltin2 from "node:http";
export default function createLegacyApi(){
// Dedicated, loopback-only candidate UI. No daily SQLite, R2 or credentials.
const fs=__factoryBuiltin0,path=__factoryBuiltin1,http=__factoryBuiltin2;
return ({load,core: _core,db,password,users})=>{
 const routes=new Map(),base='http://localhost:3034';
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,base);
  if(url.pathname==='/fixture'){
   const actor=users.find(u=>u.id===url.searchParams.get('actor'))||users[0],language=url.searchParams.get('lang')==='vi'?'vi':'zh';
   const login=await load('app/api/platform-login/route.ts').POST(new Request(base+'/api/platform-login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(actor.authMode==='demo'?{demoRole:actor.role}:{id:actor.id,password})}));
   const data=await login.json();if(!login.ok)throw Error(data.error);res.setHeader('Set-Cookie',login.headers.get('Set-Cookie').replace('process_demo=','process_fixture_3034='));
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="${language}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/process/user-access.css"><style>body{margin:20px;font:15px system-ui;background:#f4f8f6;color:#113338}button{border:1px solid #acc5bc;border-radius:6px;padding:8px 12px;background:white}input,select,textarea{font:inherit;box-sizing:border-box}input,select{padding:8px}button:disabled{opacity:.5}button:focus-visible,input:focus-visible{outline:2px solid #087881}.button.signal{background:#13585d;color:white}dialog::backdrop{background:#102c3360}small{display:block}</style></head><body><p>3034 · ${language==='zh'?'合成帳號隔離驗證':'Kiểm thử tài khoản giả lập'} · ${actor.id}</p><nav>${users.filter(u=>u.authMode!=='demo'||u.role==='admin').map(u=>`<a href="/fixture?actor=${u.id}&lang=${language}">${u.id}</a>`).join(' · ')} · <a href="/fixture?actor=${actor.id}&lang=${language==='vi'?'zh':'vi'}">中文 / Tiếng Việt</a></nav><div id="account-menu" class="open"></div><main id="data-content" data-active-tab="users"></main><p id="toast" role="status"></p><script>let currentUser=${JSON.stringify(data.user)},state={view:'data',dataTab:'users'};localStorage.setItem('processUILanguage',${JSON.stringify(language)});window.ProcessSync={identity:currentUser,platformHeaders:()=>({'Content-Type':'application/json'}),clearIdentity(){this.identity=null}};window.escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.toast=s=>document.querySelector('#toast').textContent=s;window.renderLogin=()=>document.querySelector('#data-content').textContent=${JSON.stringify(language==='zh'?'請重新登入':'Vui lòng đăng nhập lại')};let bindDataInner=()=>{},userManagementView=()=>'',bindView=()=>{};</script><script type="module">window.ProcessAccessPolicy=await import('/process/access-policy.mjs');const script=document.createElement('script');script.src='/process/user-access.js';document.body.append(script);</script></body></html>`);return;
  }
  if(url.pathname.startsWith('/api/')){const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks),key=url.pathname.slice(5);if(!routes.has(key))routes.set(key,load('app/api/'+key+'/route.ts'));const handler=routes.get(key)[req.method];if(!handler){res.writeHead(405);res.end();return;}const response=await handler(new Request(url,{method:req.method,headers:{'Content-Type':req.headers['content-type']||'application/json',Cookie:(req.headers.cookie||'').split(';').map(c=>c.trim()).filter(c=>c.startsWith('process_fixture_3034=')).map(c=>c.replace('process_fixture_3034=','process_demo=')).join(';'),Origin:url.origin},...(bytes.length?{body:bytes}:{})}));const replyHeaders=Object.fromEntries(response.headers);if(replyHeaders['set-cookie'])replyHeaders['set-cookie']=replyHeaders['set-cookie'].replace('process_demo=','process_fixture_3034=');res.writeHead(response.status,replyHeaders);res.end(Buffer.from(await response.arrayBuffer()));return;}
  const root=path.resolve('public'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'}[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(fs.readFileSync(file));
 }catch{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'FIXTURE_FAILED'}));}});
 server.listen(3034,'127.0.0.1',()=>console.log('Synthetic account UI ready: http://localhost:3034/fixture; memory-only SQLite/R2'));
 process.on('SIGINT',()=>server.close(()=>db.close()));
};

}
