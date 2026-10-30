// Synthetic isolated D1/R2 fixture shared by browser acceptance and local preview.
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const {createRootEntryFixture}=await import(pathToFileURL(path.resolve('tests/root-entry-native-fixture.mjs')).href);
import {accessKeys} from '../public/process/access-policy.mjs';
const require=createRequire(import.meta.url),load=require('../scripts/ipqc-ab-import-harness.cjs')();
export async function createLinesFixture(){
 const password=randomBytes(24).toString('hex');let fixture;
 try{
 fs.mkdirSync('.sites-runtime',{recursive:true});
 fixture=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:randomBytes(48).toString('hex'),DEMO_LOGIN_ENABLED:'false'}});
 const users=['frank','reviewer','reader','staff'].map(id=>({id,name:'Synthetic '+id,role:['frank','reviewer'].includes(id)?'admin':'staff',enabled:true,authMode:'platform',authEpoch:1,password,accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,id==='reviewer'||id==='staff'&&['ab','c','lines'].some(m=>k.startsWith(m+'.'))&&!/\.(approve|return)$/.test(k)||id==='reader'&&['ab.view','c.view','lines.view'].includes(k)]))}));
 const catalog=lines=>({products:lines.map(line=>({code:line+'1',name:'Synthetic '+line,category:'G',line,unit:'pcs',stages:[line+'-CUT']})),lines:lines.map(line=>({code:line,name:'Chuyền '+line,stages:[{code:line+'-CUT',name:'切割 · Cắt'}]})),categoryGroups:lines.map(line=>({line,name:'G'}))});
 const active={AB:catalog(['A','B']),C:catalog(['C']),PROCESS:Object.fromEntries(['A','B','C'].map(l=>[l+'-CUT',load('lib/master-stage-link.ts').stageDefaultTemplates(l+'-CUT')]))};
 const versions=Object.entries(active).map(([scope,snapshot])=>({id:'active-'+scope,scope,number:1,status:'approved',snapshot,revision:1,creatorId:'fixture',creatorName:'fixture',createdAt:'2026-10-30T00:00:00Z',updatedAt:'2026-10-30T00:00:00Z',history:[],warnings:[]}));
 await fixture.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(JSON.stringify({platformUsers:JSON.stringify(users),backupSettings:'{"enabled":false}',masterDataControl:JSON.stringify({active,versions}),processMasterData:JSON.stringify(active.PROCESS),bomOverrides:'{"replaceAll":true,"data":{}}',dispatchBoard:'{"A":[],"B":[],"C":[]}'}),'fixture').run();
 return {fixture,password,users:users.map(({id,role})=>({id,role}))};
 }catch(error){await fixture?.close();throw error;}
}
