/* Synthetic SQLite guard: normal application actions must retain all existing backups. */
const assert=require('node:assert/strict');
module.exports=function protectExistingBackups(db){
  assert.equal(db.prepare('SELECT count(*) n FROM state_backups').get().n,0);
  for(let i=0;i<150;i++)db.prepare('INSERT INTO state_backups(id,revision,"values",reason,actor,created_at) VALUES(?,?,?,?,?,?)').run('retained-'+i,i,JSON.stringify({retained:i}),'synthetic historical','fixture',new Date(Date.UTC(2026,0,1)+i*1000).toISOString());
  const read=()=>JSON.stringify(db.prepare('SELECT * FROM state_backups ORDER BY id').all()),before=read();
  for(const action of ['INSERT','UPDATE','DELETE'])db.exec(`CREATE TEMP TRIGGER forbid_automatic_backup_${action} BEFORE ${action} ON state_backups BEGIN SELECT RAISE(ABORT,'AUTOMATIC_BACKUP_MUTATION_FORBIDDEN'); END`);
  return()=>assert.equal(read(),before,'all 150 historical backup rows remain byte-identical');
};
