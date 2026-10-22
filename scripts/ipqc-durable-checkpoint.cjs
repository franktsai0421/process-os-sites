/* oxlint-disable typescript/no-require-imports -- isolated fixture checkpoint transport; no production binding. */
const fs=require('node:fs'),path=require('node:path');
module.exports=function durableCheckpoints(runtimeRoot){
 const snapshots=new WeakMap();
 return {
  async save(f,name){
   if(!runtimeRoot)return;
   if(!['primary','synthetic'].includes(name))throw Error('Invalid checkpoint scope');
   const state=await f.core.readState(),bytes=Buffer.from(JSON.stringify({isolatedResume:true,...state})),file=path.join(runtimeRoot,name+'-latest.json'),tmp=file+'.tmp';
   fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,file);
   // Install only after durable replacement succeeds. At most one buffer per fixture.
   snapshots.set(f,{revision:state.revision,bytes});
  },
  async bytes(f){
   if(!runtimeRoot)return Buffer.from(JSON.stringify({isolatedResume:true,...await f.core.readState()}));
   const snapshot=snapshots.get(f),current=f.db.prepare('SELECT revision FROM shared_state WHERE id=1').get();
   if(!snapshot||snapshot.revision!==current?.revision)throw Error('Latest durable checkpoint unavailable');
   return snapshot.bytes;
  }
 };
};
