// Actual signed Routine handlers/kernel, private SQLite/Map-R2.
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import {createHash,randomUUID,webcrypto} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
const require=createRequire(import.meta.url),harness=require('../scripts/ipqc-ab-import-harness.cjs'),protectBackups=require('../scripts/automatic-backup-fixture.cjs'),clone=v=>JSON.parse(JSON.stringify(v));
const schemaFiles=['drizzle/0000_conscious_skin.sql','drizzle/0001_woozy_roxanne_simpson.sql','drizzle/0002_local_feedback_sessions.sql','drizzle/0003_login_limits.sql'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
async function fixture(t, { withPeer = false } = {}) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  for (const file of schemaFiles) db.exec(fs.readFileSync(file, 'utf8'));
  const verifyBackups = protectBackups(db);
  const objects = new Map([
    ['fixture/unrelated-retained-object', { bytes: Buffer.from('synthetic retained bytes'), options: {} }],
  ]);
  const counts = { post: 0, get: 0, receiptGet: 0, stateGet: 0, dbRun: 0, r2Put: 0, r2Head: 0 };
  let beforeCAS = null;
  const env = {
    PROCESS_SESSION_SECRET: randomUUID(),
    DB: {
      prepare(sql) {
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          async first() { return db.prepare(sql).get(...args) || null; },
          async all() { return { results: db.prepare(sql).all(...args) }; },
          async run() {
            if (sql.startsWith('UPDATE shared_state SET revision=') && beforeCAS) {
              const hook = beforeCAS; beforeCAS = null; await hook();
            }
            counts.dbRun++;
            return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } };
          },
        };
      },
    },
    STATE_ARCHIVE: {
      async head(key) { counts.r2Head++; return objects.has(key) ? {} : null; },
      async put(key, value, options) {
        counts.r2Put++;
        objects.set(key, { bytes: Buffer.from(value), options: structuredClone(options) });
      },
      async get(key) {
        const item = objects.get(key);
        if (!item) return null;
        const bytes = item.bytes;
        return {
          body: bytes,
          text: async () => bytes.toString(),
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          httpMetadata: item.options?.httpMetadata,
        };
      },
    },
  };
  const load = harness(env);
  const core = load('lib/process-state.ts');
  const model = load('lib/routine-fqc.ts');
  const route = load('app/api/routine-fqc/route.ts');
  const today = model.companyDate();
  const user = {
    id: 'fixture-route-admin', name: 'Synthetic route administrator',
    role: 'admin', enabled: true, inheritRole: false,
    accessOverrides: Object.fromEntries([
      'routine.view', 'routine.edit', 'routine.save', 'routine.submit',
      'routine.withdraw', 'routine.approve', 'routine.return', 'routine.history',
      'routine.create', 'routine.delete', 'routine.settings',
      'approval.revoke', 'approval.revise',
    ].map((key) => [key, true])),
  };
  const peer = withPeer ? { ...clone(user), id: 'fixture-route-peer', name: 'Synthetic independent peer' } : null;
  const values = {
    platformUsers: JSON.stringify(peer ? [user, peer] : [user]),
    routineFqcEnabled: '1', sentinel: JSON.stringify('unrelated synthetic module bytes'),
    qualityMasterControl: JSON.stringify({ libraries: { fqc: {
      activeVersionId: 'fixture-approved-source',
      versions: [{
        id: 'fixture-approved-source', number: 1, status: 'approved',
        reviewedAt: today + 'T00:00:00Z',
        snapshot: { errors: [], items: [{
          id: 'fixture-item', name: 'Synthetic weekly check', checkNo: 'SYNTHETIC-1',
          line: 'A', category: 'QA', isEnabled: true, productCodes: ['FIXTURE-A'],
          rule: { cadence: 'time', timeFrequency: 'weekly' },
        }] },
      }],
    } } }),
  };
  db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)')
    .run(JSON.stringify(values), 'synthetic fixture initialization');
  const base = 'https://routine-fixture.invalid';
  const url = base + '/api/routine-fqc';
  const cookies = { owner: 'process_demo=' + await core.demoSession(new Request(url), user.id, false) };
  if (peer) cookies.peer = 'process_demo=' + await core.demoSession(new Request(url), peer.id, false);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all().map((row) => row.name);
  const persisted = () => ({
    tables: tables.map((name) => [name, clone(db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all())]),
    objects: [...objects].map(([key, item]) => [key, item.bytes.toString('base64'), clone(item.options || {})]),
  });
  const setRight=(key,enabled)=>{const row=db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),values=JSON.parse(row.values),users=JSON.parse(values.platformUsers);for(const user of users)user.accessOverrides[key]=enabled;values.platformUsers=JSON.stringify(users);db.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').run(row.revision+1,JSON.stringify(values));};
  const stagePhoto=name=>{const bytes=Buffer.from('synthetic photo '+name),id=createHash('sha256').update(bytes).digest('hex');objects.set('routine-fqc/photos/'+id,{bytes,options:{}});return id;};
  const storedValues = () => JSON.parse(db.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values);
  const control = () => model.parseRoutine(storedValues()[model.RF_KEY]);
  const document = (id) => control().documents.find((item) => item.id === id);
  let sequence = 0;
  async function dispatch(input, options = {}, actor = 'owner') {
    const target = new URL(input, base);
    assert.equal(target.origin, base);
    assert.equal(target.pathname, '/api/routine-fqc');
    const method = options.method || 'GET';
    assert.ok(Object.hasOwn(cookies, actor), 'only an initialized signed fixture actor may dispatch');
    assert.ok(['GET', 'POST'].includes(method), 'fixture dispatch only admits the actual routine handlers');
    if (method === 'POST') counts.post++;
    else {
      counts.get++;
      if (target.searchParams.has('operationId')) counts.receiptGet++;
      else counts.stateGet++;
    }
    return route[method](new Request(target, {
      ...options, method,
      headers: { ...options.headers, Cookie: cookies[actor], Origin: base, 'Content-Type': 'application/json' },
    }));
  }
  async function get(query = '') {
    const response = await dispatch(url + query);
    return { status: response.status, body: await response.json() };
  }
  async function post(command, actor = 'owner') {
    const response = await dispatch(url, { method: 'POST', body: JSON.stringify(command) }, actor);
    return { status: response.status, body: await response.json() };
  }
  const command = (action, extra = {}) => ({
    action, operationId: randomUUID(), expectedRevision: control().revision, ...extra,
  });
  const draft = (id, action, extra = {}) => {
    const operationId = randomUUID();
    return {
      action: 'draft', documentId: id, operationId,
      command: {
        action, operationId, generation: document(id).flow.generation,
        clientId: 'synthetic-route-client', sequence: ++sequence,
        ...(['save', 'submit'].includes(action) ? { expectedRevision: document(id).flow.revision } : {}),
        ...extra,
      },
    };
  };
  async function accepted(command) {
    const response = await post(command);
    assert.equal(response.status,200,command.action+' '+JSON.stringify(response.body));
    assert.match(response.body.requestId, uuid, 'original POST carries a server request UUID');
    return response.body;
  }
  const delta = (before) => Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value - before[key]]));
  async function createPlan() {
    await accepted(command('configure', { startDate: today }));
    await accepted(command('generate'));
    const jobs = control().jobs;
    assert.equal(jobs.length, 1);
    return (await accepted(command('create-plan', { jobIds: [jobs[0].id] }))).result.documentId;
  }
  async function approve(id) {
    await accepted(draft(id, 'save'));
    await accepted(draft(id, 'submit', { savedId: document(id).flow.saved.id, reason: 'Synthetic submission' }));
    await accepted(draft(id, 'approve', {
      caseId: document(id).flow.pendingId, reason: 'Synthetic review', selfReviewConfirmed: true,
    }));
  }
  return { db,objects,env,core,load,user,url,cookies,counts, persisted, verifyBackups, setRight, stagePhoto, storedValues, control, document, dispatch, get, post, command, draft, accepted, delta, createPlan, approve, beforeCAS: hook => { beforeCAS = hook; } };
}
export async function setup(t,{lang='zh',records=true,intercept,kind='plan'}={}){
 const f=await fixture(t),documentId=await f.createPlan();await f.approve(documentId);
 const values=f.storedValues(),control=JSON.parse(values.routineFqcControl),d=control.documents.find(d=>d.id===documentId),approved=d.flow.cases.find(c=>c.status==='approved');
 // Supported persisted reopened state, initialized only in this private fixture.
 // Existing revoke-plan authorization returned 403; no product grant is changed.
 d.kind=kind;d.reopened=true;d.flow.generation=randomUUID();d.flow.revision++;d.flow.saved=null;
 for(let i=0;i<22;i++){const c=clone(approved);c.id='history-'+i;c.savedId='history-save-'+i;c.content.title='IMMUTABLE_APPROVED_'+i;d.flow.cases.push(c);}
 for(const status of ['pending','returned','withdrawn'])d.flow.cases.push({...clone(approved),id:'not-'+status,status,result:undefined});d.flow.cases.push({...clone(approved),id:'missing-reviewer',result:{actor:{name:'Incomplete'},at:approved.result.at}});
 const other=clone(d);other.id='other-document';other.number='SYNTHETIC-OTHER';other.correctionOf=null;other.flow=f.load('lib/shared-draft.ts').createSharedDraft('routine-fqc:'+other.id,clone(d.flow.working),'other-case',randomUUID());other.flow.cases=[{...clone(approved),id:'other-case',savedId:'other-save'}];other.flow.active={id:'other-case',content:clone(d.flow.working)};other.reopened=true;control.documents.push(other);values.routineFqcControl=JSON.stringify(control);
 const encoded=records?await f.load('lib/state-records.ts').encodeRecordValues(f.env.STATE_ARCHIVE,values):JSON.stringify(values);f.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(encoded);
 const dom=canvasDOM(),doc=dom.document;doc.hidden=false;doc.visibilityState='visible';doc.documentElement.lang=lang;doc.contains=n=>doc.documentElement.contains(n);doc.createTextNode=text=>{const n=doc.createElement('span');n.textContent=text;return n;};
 const createElement=doc.createElement.bind(doc);doc.createElement=tag=>{const n=createElement(tag);n.dataset=new Proxy(n.dataset,{set(target,key,value){target[key]=String(value);n.attrs['data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(value);return true;}});return n;};
 dom.Node.prototype.before=function(n){const p=this.parentElement;n.remove();n.parentElement=p;p.children.splice(p.children.indexOf(this),0,n);};dom.Node.prototype.getClientRects=()=>[{}];Object.defineProperty(dom.Node.prototype,'options',{get(){return this.querySelectorAll('option');}});Object.defineProperty(dom.Node.prototype,'firstChild',{get(){return this.children[0]||null;}});Object.defineProperty(dom.Node.prototype,'childNodes',{get(){return this.children;}});
 doc.createTreeWalker=area=>{const rows=[];const visit=n=>{if(n._text)rows.push({get nodeValue(){return n._text;},set nodeValue(v){n._text=v;}});for(const child of n.children)visit(child);};visit(area);let i=0;return{nextNode:()=>rows[i++]||null};};
 const root=doc.createElement('section');root.id='routine-fqc-root';doc.body.append(root);const initial=await f.get(),store=new Map(),calls=[];let epoch=1,delivery=1,lose=false,receiptDown=false;const storage={get length(){return store.size;},key:i=>[...store.keys()][i]??null,getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const box={...dom,console,crypto:webcrypto,structuredClone,URL,URLSearchParams,Response,Request,Headers,AbortController,performance,TextEncoder,NodeFilter:{SHOW_TEXT:4},CSS:{escape:String},location:{origin:new URL(f.url).origin,href:new URL(f.url).origin+'/process/',port:''},scrollX:0,scrollY:0,scrollTo(){},matchMedia:()=>({matches:false}),localStorage:storage,sessionStorage:storage,setTimeout,clearTimeout,setInterval(){},requestAnimationFrame(){},bindDataInner(){},ProcessSync:{identity:initial.body.identity,identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:x=>x===delivery,platformHeaders:()=>({'Content-Type':'application/json'})},confirm:()=>true,alert(){}};box.window=box;dom.events(box);
 box.fetch=async(url,o={})=>{const target=new URL(url,f.url),record={url:target.pathname+target.search,method:o.method||'GET',body:o.body};calls.push(record);const send=async()=>{if(receiptDown&&target.searchParams.has('operationId'))return Response.json({error:'UNAVAILABLE'},{status:503});const response=await f.dispatch(target,o);if(lose&&o.method==='POST'){lose=false;throw Error('SYNTHETIC_ACK_LOST');}return response;};return intercept?intercept(target.href,o,send):send();};
 vm.createContext(box);vm.runInContext(fs.readFileSync('public/process/shared-draft-client.js','utf8'),box);vm.runInContext(fs.readFileSync('public/process/version-draft-ui.js','utf8'),box);vm.runInContext(fs.readFileSync('public/process/canvas-approved-history.js','utf8'),box);
 const source=fs.readFileSync('public/process/routine-fqc.js','utf8'),hook='window.__RoutineHistory={s,paint,choose,buffer,save,draft,act,read,postOwned,client:approvedClient,record:()=>receiptRecord,setData:v=>data=v,getData:()=>data,setRoot:v=>root=v};';vm.runInContext(source.replace(/\}\)\(\);\s*$/,hook+'})();'),box);const api=box.__RoutineHistory;api.setData(initial.body);api.setRoot(root);api.s.selected=documentId;api.s.tab='plans';api.paint();assert(root.querySelector('#routine-fqc-approved-version'),root.textContent);
 return{...f,box,root,doc,api,calls,store,documentId,otherId:other.id,async permission(key,value){const state=await f.core.readState(),values={...state.values},users=JSON.parse(values.platformUsers);users.find(u=>u.id===f.user.id).accessOverrides[key]=value;values.platformUsers=JSON.stringify(users);const encoded=records?await f.load('lib/state-records.ts').encodeRecordValues(f.env.STATE_ARCHIVE,values):JSON.stringify(values);f.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(encoded);},select:()=>root.querySelector('#routine-fqc-approved-version'),display:()=>root.querySelector('[data-vd-approved-view]'),async open(){await this.select().onfocus();},async chooseVersion(id){const s=this.select();s.value=id;await s.onchange();},inputs:()=>JSON.stringify({buffers:[...api.s.buffers],bases:[...api.s.bases],generations:[...api.s.bufferGenerations]}),stage(value){const field=root.querySelector('[data-field="title"]');field.value=value;field.oninput();},posts:()=>calls.filter(c=>c.method==='POST'),rotate(){epoch++;},delivery(){delivery++;},lose(){lose=true;receiptDown=true;},receipts(){receiptDown=false;}};
}
