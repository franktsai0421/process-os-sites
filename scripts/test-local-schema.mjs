import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { verifyLocalSchema } from '../lib/local-schema.mjs';
const require=createRequire(import.meta.url),ts=require('typescript'),workflowModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('db/schema.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module: workflowModule,exports:workflowModule.exports,require});
const tables=Object.values(workflowModule.exports).map(require('drizzle-orm/sqlite-core').getTableConfig);
const db=new DatabaseSync(':memory:');
const adapter={prepare(sql){let args=[];return{bind(...values){args=values;return this},async first(){return db.prepare(sql).get(...args)},async all(){return{results:db.prepare(sql).all(...args)}}}}};
try {
  for(const name of fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())
    db.exec(fs.readFileSync('drizzle/'+name,'utf8').replace(/(`id` text) PRIMARY KEY NOT NULL/g,'$1 PRIMARY KEY'));
  assert.equal((await verifyLocalSchema(adapter,tables)).length,1);
  db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(NULL,1,?,?)').run('{}','fixture');
  assert.equal(db.prepare('SELECT id IS NULL AS absent,id=rowid AS alias FROM shared_state').get().absent,0);
  assert.equal(db.prepare('SELECT id=rowid AS alias FROM shared_state').get().alias,1);
  db.prepare('INSERT INTO state_backups(id,revision,"values",reason,actor,created_at) VALUES(NULL,1,?,?,?,?)').run('{}','fixture','fixture','fixture');
  await assert.rejects(()=>verifyLocalSchema(adapter,tables),/NULL or duplicates/);
  console.log('PASS: INTEGER rowid semantics, valid legacy warning, invalid TEXT primary key refused; memory fixtures only');
} finally {db.close();}
