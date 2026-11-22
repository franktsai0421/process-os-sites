import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {accessEventSchemaReady} from '../lib/access-event-schema-ready.ts';
import {verifyLocalSchema} from '../lib/local-schema.mjs';import {getTableConfig} from 'drizzle-orm/sqlite-core';import * as localSchema from '../db/schema.ts';
const files=folder=>fs.readdirSync(folder).filter(name=>name.endsWith('.sql')).sort();
const apply=(db,folder,names)=>{for(const name of names)db.exec(fs.readFileSync(folder+'/'+name,'utf8'));};
const binding=db=>({prepare(sql){return{async all(){return{results:db.prepare(sql).all()};}};}});
for(const folder of ['drizzle','drizzle-sites-fresh'])void test(folder+' additive event migration preserves old rows and fails closed when incomplete',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const base='d7288eb0ccc54df4817f50de36e6900cd6615678';
  const oldBytes=file=>execFileSync('git',['show',base+':'+folder+'/'+file]);
  const history=JSON.parse(oldBytes('meta/_journal.json')).entries;
  const sites=folder==='drizzle-sites-fresh',upgrade=sites?'0009_access_events_candidate.sql':'0004_access_events_candidate.sql';
  const next='0010_fqc_plan_reconciliation_journal.sql',prior=history.map(entry=>entry.tag+'.sql');
  const names=files(folder),journal=JSON.parse(fs.readFileSync(folder+'/meta/_journal.json')).entries;
  assert.equal(prior.at(-1),upgrade);
  assert.deepEqual(names,sites?[...prior,next]:prior);
  assert.deepEqual(journal.slice(0,history.length),history);
  assert.deepEqual(journal.map(entry=>entry.tag+'.sql'),names);
  assert.deepEqual(journal.map(entry=>entry.idx),names.map((_,idx)=>idx));
  for(const file of prior)assert.deepEqual(fs.readFileSync(folder+'/'+file),oldBytes(file),file);
  apply(db,folder,prior.slice(0,-1));
  db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,7,?,?)').run('{"synthetic":"old"}','synthetic');
  assert.equal(await accessEventSchemaReady(binding(db)),false);
  if(folder==='drizzle')await assert.rejects(()=>verifyLocalSchema(binding(db),Object.values(localSchema).map(getTableConfig)),/incomplete/);
  const migration=fs.readFileSync(folder+'/'+upgrade,'utf8');assert.doesNotMatch(migration,/\b(DROP|DELETE|UPDATE|ALTER|REPLACE)\b/i);db.exec(migration);
  assert.equal(await accessEventSchemaReady(binding(db)),true);assert.equal(db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get().values,'{"synthetic":"old"}');
  if(folder==='drizzle')assert.deepEqual(await verifyLocalSchema(binding(db),Object.values(localSchema).map(getTableConfig)),[]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM access_events').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM access_event_exports').get().n,0);
  assert.throws(()=>db.exec(migration),/already exists/);assert.equal(await accessEventSchemaReady(binding(db)),true);
  if(sites){
    db.exec("INSERT INTO access_events VALUES('event','actor','fqc','op','save',1,'now','now','unknown',NULL,'open',1,'[]','[]','[]')");
    db.exec("INSERT INTO access_event_exports VALUES('export','actor','op','digest','now','[]','[]',0,0,'sha')");
    const eventRows=()=>['access_events','access_event_exports'].map(table=>db.prepare('SELECT * FROM '+table).all());
    const rowsBefore=eventRows();
    const before=db.prepare('SELECT type,name,sql FROM sqlite_schema ORDER BY name').all();
    apply(db,folder,[next]);
    const after=db.prepare('SELECT type,name,sql FROM sqlite_schema ORDER BY name').all();
    assert.deepEqual(after.filter(row=>row.name!=='fqc_plan_reconciliation_journal'),before);
    assert.equal(after.length,before.length+1);
    assert.deepEqual(eventRows(),rowsBefore);
    assert.equal(db.prepare('SELECT count(*) n FROM fqc_plan_reconciliation_journal').get().n,0);
    assert.equal(db.prepare('SELECT revision FROM shared_state WHERE id=1').get().revision,7);
    assert.equal(await accessEventSchemaReady(binding(db)),true);
    assert.throws(()=>db.exec("INSERT INTO fqc_plan_reconciliation_journal VALUES(2,'sample','sample')"),/CHECK constraint/);
  }
 }finally{db.close();}
});
void test('partial or incompatible event schema never passes readiness',async()=>{
 const db=new DatabaseSync(':memory:');try{apply(db,'drizzle',files('drizzle').slice(0,-1));db.exec('CREATE TABLE access_events(id TEXT PRIMARY KEY)');assert.equal(await accessEventSchemaReady(binding(db)),false);assert.throws(()=>db.exec(fs.readFileSync('drizzle/0004_access_events_candidate.sql','utf8')),/already exists/);assert.equal(await accessEventSchemaReady(binding(db)),false);}
 finally{db.close();}
});
void test('same-name indexes on wrong columns cannot satisfy event schema readiness',async()=>{
 const db=new DatabaseSync(':memory:');try{apply(db,'drizzle',files('drizzle'));
  db.exec('DROP INDEX access_events_status_cursor');
  db.exec('CREATE INDEX access_events_status_cursor ON access_events(updated_at,id)');
  assert.equal(await accessEventSchemaReady(binding(db)),false);
 }finally{db.close();}
});
void test('same-name partial unique index cannot satisfy whole-table UPSERT readiness',async()=>{
 const db=new DatabaseSync(':memory:');try{apply(db,'drizzle',files('drizzle'));
  db.exec('DROP INDEX access_events_actor_module_operation');
  db.exec("CREATE UNIQUE INDEX access_events_actor_module_operation ON access_events(actor_id,module,operation_id) WHERE status='open'");
  assert.equal(await accessEventSchemaReady(binding(db)),false);
  assert.throws(()=>db.prepare("INSERT INTO access_events(id,actor_id,module,operation_id,action,occurred_at,received_at,updated_at,outcome,verified_at,status,version,notes,history,update_receipts) VALUES('id','actor','bom','operation','save',1,'now','now','unknown',NULL,'open',1,'[]','[]','[]') ON CONFLICT(actor_id,module,operation_id) DO NOTHING").run(),/ON CONFLICT clause does not match/);
 }finally{db.close();}
});
void test('same-name NOCASE index cannot collapse case-sensitive operation identities',async()=>{
 const db=new DatabaseSync(':memory:');try{apply(db,'drizzle',files('drizzle'));
  db.exec('DROP INDEX access_events_actor_module_operation');
  db.exec('CREATE UNIQUE INDEX access_events_actor_module_operation ON access_events(actor_id,module,operation_id COLLATE NOCASE)');
  assert.equal(await accessEventSchemaReady(binding(db)),false);
  const statement=db.prepare("INSERT INTO access_events(id,actor_id,module,operation_id,action,occurred_at,received_at,updated_at,outcome,verified_at,status,version,notes,history,update_receipts) VALUES(?,'actor','bom',?,'save',1,'now','now','unknown',NULL,'open',1,'[]','[]','[]') ON CONFLICT(actor_id,module,operation_id) DO NOTHING");
  statement.run('id-a','OperationABC');statement.run('id-b','operationabc');assert.equal(db.prepare('SELECT COUNT(*) n FROM access_events').get().n,1);
 }finally{db.close();}
});
