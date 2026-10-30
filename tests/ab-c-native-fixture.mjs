// Synthetic-only AB/C environment. Never connects to a hosted Site.
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {accessKeys} from '../public/process/access-policy.mjs';
const require=createRequire(import.meta.url);
export async function createABCFixture({products=40,withAuthoring=false,includeOutsider=false}={}) {
 const secret='isolated-ab-c-fixture-signing-only';
 const fixture=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:secret}});
 const bucket=await fixture.mf.getR2Bucket('STATE_ARCHIVE');
 const load=require('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE:bucket});
 const stages=line=>['A','B','C','D','E'].map(code=>({code:line+'-'+code,name:'工段 '+code+' / Công đoạn '+code}));
 const catalog=line=>({name:line,products:Array.from({length:products},(_,i)=>({code:line+String(i+1).padStart(3,'0'),name:'隔離產品 Sản phẩm '+(i+1),line,category:i<products/2?'GROUP-1':'GROUP-2',unit:'pcs',specification:'synthetic',routeMode:'exception',stages:stages(line).slice(0,i%2?4:3).map(s=>s.code)})),lines:[{code:line,name:'隔離線 Chuyền '+line,stages:stages(line)}],categoryGroups:['GROUP-1','GROUP-2'].map(name=>({line,name,defaultStages:stages(line).slice(0,4).map(s=>s.code)}))});
 const active={AB:catalog('A'),C:catalog('C'),PROCESS:Object.fromEntries(['A','C'].flatMap(line=>stages(line).map(s=>[s.code,load('lib/master-stage-link.ts').stageDefaultTemplates(s.code)])))};
 const at='2026-10-30T00:00:00.000Z';
 const versions=Object.entries(active).map(([scope,snapshot])=>({id:'fixture-'+scope,scope,number:1,status:'approved',snapshot,creatorId:'frank',creatorName:'Synthetic owner',createdAt:at,updatedAt:at,history:[]}));
 const staff=(id,cells)=>({id,name:'Synthetic '+id,role:'staff',enabled:true,authMode:'platform',authEpoch:1,accessOverrides:Object.fromEntries(accessKeys.map(key=>[key,cells.includes(key)]))});
 const users=[{id:'frank',name:'Synthetic owner',role:'admin',primary:true,enabled:true,authMode:'platform',authEpoch:1},staff('writer',accessKeys.filter(key=>key.startsWith('ab.')||key.startsWith('c.')||key==='editor.view')),staff('viewer',['ab.view','c.view']),...(includeOutsider?[staff('outsider',[])]:[])];
 const values={platformUsers:JSON.stringify(users),backupSettings:'{"enabled":false}',masterDataControl:JSON.stringify({active,versions}),processMasterData:JSON.stringify(active.PROCESS),bomOverrides:'{"replaceAll":true,"data":{}}',dispatchBoard:'{"A":[],"B":[],"C":[]}'};
 if(withAuthoring){
  const content={workspaces:['A','C'].map(line=>({id:JSON.stringify(['GROUP-1',line]),line,category:'GROUP-1',stages:{[line+'-D']:[{id:line+'-retained',stageCode:line+'-D',name:'Retained hidden content',editorType:'custom',productCodes:[line+'001'],nextIds:[],machineIds:[],bomSelections:{},mediaItems:[],x:125,y:175}]}}))};
  values.processAuthoringControl=JSON.stringify({activeVersionId:'authoring-approved',versions:[{id:'authoring-approved',number:1,status:'approved',snapshot:content,creatorId:'frank',creatorName:'Synthetic owner',createdAt:at,updatedAt:at,history:[]}],workflow:load('lib/shared-draft.ts').createSharedDraft('process:platform',content,'authoring-approved','authoring-generation')});
 }
 const raw=await load('lib/state-records.ts').encodeRecordValues(bucket,values);
 await fixture.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(raw,at).run();
 return {...fixture,load,values,cookie(actor='frank') {const payload=Buffer.from(JSON.stringify({version:2,id:actor,sessionType:'platform',authEpoch:1,expires:Date.now()+3600000,nonce:'ab-c-isolated'})).toString('base64');return payload+'.'+createHmac('sha256',secret).update(payload).digest('hex');}};
}
