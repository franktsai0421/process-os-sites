// Exercise the same migration journal the official source projection copies.
import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import {getTableConfig} from 'drizzle-orm/sqlite-core';
import * as schema from '../db/sites-fresh-schema.ts';

test('fresh journal applies all seven schema-only migrations and matches all 19 model tables',()=>{
 const migrations=readMigrationFiles({migrationsFolder:'drizzle-sites-fresh'}),db=new DatabaseSync(':memory:');
 try{
  assert.equal(migrations.length,7);
  for(const migration of migrations)for(const statement of migration.sql){
   assert.doesNotMatch(statement,/\b(INSERT|UPDATE|DELETE|REPLACE|DROP)\b/i);
   db.exec(statement);
  }
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const models=Object.values(schema).map(getTableConfig);
  assert.equal(models.length,19);assert.deepEqual(tables,models.map(m=>m.name).sort());
  for(const model of models){
   const actual=db.prepare('PRAGMA table_info("'+model.name+'")').all();
   assert.deepEqual(actual.map(c=>({name:c.name,type:c.type,notNull:Boolean(c.notnull)})),model.columns.map(c=>({name:c.name,type:c.getSQLType().toUpperCase(),notNull:c.notNull})),model.name);
  }
  assert.ok(tables.includes('process_import_capabilities'));
  assert.ok(tables.includes('process_import_verify_capabilities'));
  assert.ok(tables.includes('process_import_verify_maintenance'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM process_import_verify_capabilities').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM process_import_verify_maintenance').get().n,0);
 }finally{db.close();}
});
