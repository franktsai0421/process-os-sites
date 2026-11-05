/* oxlint-disable typescript/no-require-imports -- Disposable SQLite/R2 test adapters only. */
const fs=require('node:fs'),path=require('node:path');
function migrate(db){for(const name of fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));}
function d1(db){return {
 prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {success:true,results:db.prepare(sql).all(...args)};},async run(){return {success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};},
 async batch(statements){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.all());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
};}
module.exports={migrate,d1};
