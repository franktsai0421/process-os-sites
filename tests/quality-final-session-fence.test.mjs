import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {setup as iqcSetup} from './iqc-save-choice-fixture.mjs';
const fixture=createRequire(import.meta.url)('../scripts/fqc-apply-fixture.cjs');
for(const moduleName of ['fqc','iqc'])void test(moduleName+' session revoked during immutable encoding cannot publish a Save or receipt',async()=>{
 const h=moduleName==='iqc'?await iqcSetup():null,f=h?.f||await fixture();
 try{
  const a=moduleName==='fqc'?f.realm():null;
  if(a){await a.client.read();await a.client.begin();}else await h.stage({nameVi:'Retained local input'});
  const before=f.db.prepare('SELECT * FROM shared_state WHERE id=1').get();
  let revoked=false;f.hooks.put=()=>{if(!revoked){revoked=true;f.revoke('editor');}};
  if(a){const g=(await f.state()).workflow.generation;await assert.rejects(a.client.command(g,'save',{moduleAction:'save-local-v1',patches:[{op:'set',path:['items',{id:'item'},'name'],value:'Retained local input'}],guards:[{path:['items',{id:'item'},'name'],value:'Synthetic item'}],input:{matrixCells:[]}}));}
  else {await assert.rejects(h.probe.post('save'));assert.equal(h.probe.get().localSnapshot.items[0].nameVi,'Retained local input');}
  assert(revoked,'actual immutable encoding hook executed');
  assert.deepEqual(f.db.prepare('SELECT * FROM shared_state WHERE id=1').get(),before,'no CAS, saved snapshot or receipt may publish');
 }finally{f.close();}
});
