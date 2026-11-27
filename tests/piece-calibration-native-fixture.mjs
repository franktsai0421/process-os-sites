import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac,randomBytes,randomUUID,scryptSync} from 'node:crypto';
import {crc32,deflateSync} from 'node:zlib';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {accessKeys} from '../public/process/access-policy.mjs';
const require=createRequire(import.meta.url);
export const endpoint='/api/piece-calibration',photoEndpoint=endpoint+'/photo';
export function pixel(red=77){
 const word=n=>{const out=Buffer.alloc(4);out.writeUInt32BE(n);return out;};
 const chunk=(name,value)=>{const body=Buffer.concat([Buffer.from(name),value]);return Buffer.concat([word(value.length),body,word(crc32(body))]);};
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',Buffer.concat([word(1),word(1),Buffer.from([8,2,0,0,0])])),chunk('IDAT',deflateSync(Buffer.from([0,red,99,80]))),chunk('IEND',Buffer.alloc(0))]);
}
export const photoBytes=pixel();
export async function setup(enabled='1',reset='1',{transfer=true,restartable=false,externalTarget=false,legacyMethods=false}={}){
 const secret=randomBytes(32).toString('hex'),password=randomBytes(24).toString('hex'),salt=randomBytes(24);
 const passwordHash='scrypt$32768$8$3$'+salt.toString('hex')+'$'+scryptSync(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex');
 const settings={restartable,syntheticBindings:{PROCESS_SESSION_SECRET:secret,PROCESS_IMPORT_ENABLED:'0',PIECE_CALIBRATION_ENABLED:enabled,PIECE_CALIBRATION_RESET_ENABLED:reset}};
 let f=await createRootEntryFixture(settings);
 const bucket=await f.mf.getR2Bucket('STATE_ARCHIVE'),load=require('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE:bucket});
 const staff=(id,cells)=>({id,name:'Synthetic '+id,role:'staff',enabled:true,authMode:'platform',authEpoch:1,accessOverrides:Object.fromEntries(accessKeys.map(key=>[key,cells.includes(key)]))});
 const visible=['routine.view','equipment.view'];
 const users=[{id:'frank',primary:true,role:'admin',name:'Synthetic owner',enabled:true,authMode:'platform',authEpoch:1,passwordHash},staff('operator',[...visible,'routine.create','routine.edit','routine.save','routine.withdraw','routine.submit']),staff('reviewer',[...visible,'approval.view','routine.approve','routine.return']),staff('viewer',visible),staff('outsider',[])];
 const cookie=id=>{const payload=Buffer.from(JSON.stringify({version:2,id,sessionType:'platform',authEpoch:1,expires:Date.now()+3600000,nonce:randomUUID()})).toString('base64');return payload+'.'+createHmac('sha256',secret).update(payload).digest('hex');};
 const request=(path,who='operator',method='GET',body,headers={})=>f.mf.dispatchFetch(f.url.origin+path,{method,headers:{origin:f.url.origin,...(who?{cookie:'process_demo='+cookie(who)}:{}),...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});
 try{
  const equipmentPhotos=new Map();
  const values={platformUsers:JSON.stringify(users),backupSettings:'{"enabled":false}'};
  const seed=await require('../scripts/equipment-transfer-fixture.cjs').createTransferFixture({calibrated:true,externalTarget});
  try{
   const source=(await seed.core.readState()).values;
   for(const key of ['masterDataControl','processMasterData','routineEquipmentControl',...(transfer?['qualityMasterControl','iqcMasterControl','ipqcCMasterControl','ipqcABMasterControl']:[])])values[key]=source[key];
   if(legacyMethods){
    const control=JSON.parse(values.routineEquipmentControl);
    const approved=control.versions.find(version=>version.id===control.activeVersionId);
    for(const row of approved.equipment)row.calibrationMethod=row.id==='source'?'內部校正':'Hiệu chuẩn bên ngoài';
    values.routineEquipmentControl=JSON.stringify(control);
   }
   for(const [key,bytes] of seed.objects){
    if(key.startsWith('routine-equipment/photos/'))equipmentPhotos.set(key,bytes);
    else await bucket.put(key,bytes);
   }
  }finally{await seed.close();}
  await f.db.prepare('INSERT INTO web_feedback_store(id,revision,payload) VALUES(1,1,?)').bind(JSON.stringify({issues:[],attachments:[],batches:[],handoffs:[]})).run();
  const raw=await load('lib/state-records.ts').encodeRecordValues(bucket,values);
  await f.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(raw,new Date().toISOString()).run();
  // The producer's byte map has no R2 metadata. Re-upload its synthetic PNGs through the real equipment endpoint.
  for(const [key,bytes] of equipmentPhotos){
   const result=await request('/api/routine-equipment/photo','frank','PUT',bytes,{'content-type':'image/png'});
   assert.equal(result.status,200);
   assert.equal('routine-equipment/photos/'+(await result.json()).id,key);
  }
 }catch(e){await f.close();throw e;}
 const json=async(path,who='operator',status=200)=>{const r=await request(path,who);assert.equal(r.status,status,await r.clone().text());return r.json();};
 const state=()=>json(endpoint);
 const send=async(who,cmd,status=200,error)=>{const r=await request(endpoint,who,'POST',{revision:(await state()).revision,...cmd}),reply=await r.json();assert.equal(r.status,status,JSON.stringify(reply));if(error)assert.equal(reply.error,error);return reply;};
 return {get url(){return f.url;},get db(){return f.db;},get mf(){return f.mf;},settings,load,cookie,password,request,json,state,send,close:()=>f.close(),async restart(flags={}){const resumeRuntime=f.runtime;await f.close();f=await createRootEntryFixture({...settings,resumeRuntime,syntheticBindings:{...settings.syntheticBindings,...flags}});}};
}
