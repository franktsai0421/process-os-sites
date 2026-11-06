import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {accessEventSchemaReady} from '../lib/access-event-schema-ready.ts';
import {verifyLocalSchema} from '../lib/local-schema.mjs';import {getTableConfig} from 'drizzle-orm/sqlite-core';import * as localSchema from '../db/schema.ts';
const files=folder=>fs.readdirSync(folder).filter(name=>name.endsWith('.sql')).sort();
const apply=(db,folder,names)=>{for(const name of names)db.exec(fs.readFileSync(folder+'/'+name,'utf8'));};
const binding=db=>({prepare(sql){return{async all(){return{results:db.prepare(sql).all()};}};}});
for(const folder of ['drizzle','drizzle-sites-fresh'])void test(folder+' additive event migration preserves old rows and fails closed when incomplete',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const names=files(folder),upgrade=names.at(-1),old=names.slice(0,-1);assert.match(upgrade,/access_events_candidate/);apply(db,folder,old);
  db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,7,?,?)').run('{"synthetic":"old"}','synthetic');
  assert.equal(await accessEventSchemaReady(binding(db)),false);
  if(folder==='drizzle')await assert.rejects(()=>verifyLocalSchema(binding(db),Object.values(localSchema).map(getTableConfig)),/incomplete/);
  const migration=fs.readFileSync(folder+'/'+upgrade,'utf8');assert.doesNotMatch(migration,/\b(DROP|DELETE|UPDATE|ALTER|REPLACE)\b/i);db.exec(migration);
  assert.equal(await accessEventSchemaReady(binding(db)),true);assert.equal(db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get().values,'{"synthetic":"old"}');
  if(folder==='drizzle')assert.deepEqual(await verifyLocalSchema(binding(db),Object.values(localSchema).map(getTableConfig)),[]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM access_events').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM access_event_exports').get().n,0);
  assert.throws(()=>db.exec(migration),/already exists/);assert.equal(await accessEventSchemaReady(binding(db)),true);
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
