import fs from'node:fs';import os from'node:os';import path from'node:path';import assert from'node:assert/strict';import crypto from'node:crypto';import{DatabaseSync}from'node:sqlite';
import{upgradeLocalFeatures}from'./local-feature-upgrade.mjs';import{readLocalFeatures,localFeaturesPlugin}from'../lib/local-features.mjs';
const source=process.cwd(),root=fs.mkdtempSync(path.join(os.tmpdir(),'process-feature-upgrade-'));
try{
  for(const f of ['package.json','db/schema.ts','drizzle/meta/_journal.json',...fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).map(n=>'drizzle/'+n)]){const to=path.join(root,f);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(f,to);}
  fs.symlinkSync(path.join(source,'node_modules'),path.join(root,'node_modules'),'junction');
  const folder=path.join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');fs.mkdirSync(folder,{recursive:true});fs.mkdirSync(path.join(root,'.wrangler/local-only'),{recursive:true});
  let db=new DatabaseSync(path.join(folder,'fixture.sqlite'));for(const n of ['0000_conscious_skin.sql','0001_woozy_roxanne_simpson.sql'])db.exec(fs.readFileSync(path.join(root,'drizzle',n),'utf8'));
  const values=JSON.stringify({fixture:'preserve business'}),hash=crypto.createHash('sha256').update(values).digest('hex');db.prepare('INSERT INTO shared_state VALUES(1,7,?,?)').run(values,'before');db.close();
  await assert.rejects(()=>upgradeLocalFeatures(root,{port:3199,expectedRevision:8,expectedValuesHash:hash,backupDirectory:path.join(root,'wrong-revision')}));
  assert.deepEqual(readLocalFeatures(root),{webFeedback:false,sessionRevocation:false});
  const setting=path.join(root,'.wrangler/local-only/features.json');
  for(const invalid of [true,42,[],null,'invalid',{webFeedback:'1'}]){fs.writeFileSync(setting,JSON.stringify(invalid));assert.throws(()=>readLocalFeatures(root),/Invalid Local feature settings/);}
  fs.unlinkSync(setting);
  await upgradeLocalFeatures(root,{port:3199,expectedRevision:7,expectedValuesHash:hash,backupDirectory:path.join(root,'before')});
  assert.deepEqual(readLocalFeatures(root),{webFeedback:true,sessionRevocation:true});
  db=new DatabaseSync(path.join(folder,'fixture.sqlite'));assert.equal(db.prepare('SELECT "values" FROM shared_state').get().values,values);assert.equal(db.prepare('SELECT revision FROM shared_state').get().revision,7);assert.equal(db.prepare('SELECT COUNT(*) n FROM process_revoked_sessions').get().n,0);assert.deepEqual(JSON.parse(db.prepare('SELECT payload FROM web_feedback_store').get().payload),{issues:[],attachments:[],batches:[],handoffs:[]});db.close();
  await upgradeLocalFeatures(root,{port:3199,expectedRevision:7,expectedValuesHash:hash,backupDirectory:path.join(root,'retry')});
  fs.mkdirSync(path.join(root,'public/process'),{recursive:true});fs.writeFileSync(path.join(root,'public/process/index.html'),'<html><body>fixture</body></html>');let middleware;localFeaturesPlugin(root,{webFeedback:true}).configureServer({middlewares:{use(fn){middleware=fn;}}});
  let body;middleware({url:'/process/?system=process',method:'GET'},{setHeader(){},end(v){body=v;}},()=>assert.fail('not handled'));assert(body.includes('web-feedback-loader.js'));
  let next=false;middleware({url:'/api/web-feedback',method:'GET'},{},()=>{next=true;});assert(next);
  console.log('PASS: explicit upgrade, stale revision refused, original business preserved, empty store, idempotent retry, Local-only SPA injection');
}finally{const actual=fs.realpathSync(root);assert(path.dirname(actual)===fs.realpathSync(os.tmpdir())&&path.basename(actual).startsWith('process-feature-upgrade-'));fs.rmSync(actual,{recursive:true,force:true});}
