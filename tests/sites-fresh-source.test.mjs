import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {getTableConfig} from 'drizzle-orm/sqlite-core';
import {materializeFreshSitesSource} from '../scripts/sites-fresh-source.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),base=fs.mkdtempSync(path.join(root,'.sites-runtime/fresh-source-fixture-'));
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),projectId='appgprj_6ad9abaff47c8191846eb9821034696b',output=path.join(base,'source');
const result=materializeFreshSitesSource({sourceRoot:root,output,programCommit:commit,projectId});
assert.equal(fs.existsSync(path.join(output,'.git')),false);assert.equal(fs.existsSync(path.join(output,'node_modules')),false);assert.equal(result.profile.platformMigrationApplied,false);
for(const entry of result.profile.originalAppliedMigrationBytesPreserved)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(output,entry.target))).digest('hex'),entry.sha256);
// Compare the actual projected commit with its own projected model, rather than
// comparing an uncommitted working schema against a different committed tree.
const sqlFiles=fs.readdirSync(path.join(output,'drizzle')).filter(n=>n.endsWith('.sql')).sort(),db=new DatabaseSync(':memory:');
for(const name of sqlFiles){const sql=fs.readFileSync(path.join(output,'drizzle',name),'utf8');assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|REPLACE|DROP)\b/i);db.exec(sql);}
const models=Object.values(await import(pathToFileURL(path.join(output,'db/sites-fresh-schema.ts')).href)).map(getTableConfig);
const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
assert.deepEqual(tables,models.map(m=>m.name).sort());
for(const model of models){assert.equal(db.prepare('SELECT COUNT(*) n FROM "'+model.name+'"').get().n,0);assert.deepEqual(db.prepare('PRAGMA table_info("'+model.name+'")').all().map(c=>({name:c.name,type:c.type,notNull:Boolean(c.notnull)})),model.columns.map(c=>({name:c.name,type:c.getSQLType().toUpperCase(),notNull:c.notNull})));}db.close();
const journal=JSON.parse(fs.readFileSync(path.join(output,'drizzle/meta/_journal.json'),'utf8'));assert.deepEqual(journal.entries.map(e=>e.tag+'.sql'),sqlFiles);
assert.throws(()=>materializeFreshSitesSource({sourceRoot:root,output,programCommit:commit,projectId}),/FRESH_SOURCE_NEW_OUTPUT_REQUIRED/);
assert.equal(JSON.parse(fs.readFileSync(path.join(output,'.openai/hosting.json'),'utf8')).project_id,projectId);
assert.equal(result.profile.packageManager,'npm');assert.ok(fs.existsSync(path.join(output,'package-lock.json')));assert.equal(fs.existsSync(path.join(output,'pnpm-lock.yaml')),false);
for(const entry of result.profile.inactiveHistoricalLocks)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(output,entry.target))).digest('hex'),entry.sha256);
console.log(JSON.stringify({status:'PASS_FRESH_SOURCE_PROJECTION',tests:5,sourceProgramCommit:commit,originalMigrationsPreserved:true,originalLockBytesPreserved:true,activeMigrationsSchemaOnly:true,dependencyPayloadCopied:false,platformAccepted:false,fixtureDirectory:base}));
