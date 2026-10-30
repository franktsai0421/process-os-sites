import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {accessKeys} from '../public/process/access-policy.mjs';
export async function createProcessMasterFixture(){
 const secret=randomBytes(32).toString('hex');
 const f=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:secret,PROCESS_SESSION_REVOCATION_ENABLED:'0'}});
 const require=createRequire(import.meta.url),bucket=await f.mf.getR2Bucket('STATE_ARCHIVE'),load=require('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE:bucket});
 const password='Cloud-fixture-only-29102026';
 const cells=(allowed)=>Object.fromEntries(accessKeys.map(key=>[key,allowed.includes(key)]));
 const templateCells=accessKeys.filter(key=>key.startsWith('templates.')||key==='editor.view'||key==='approval.view');
 const users=[
 {id:'frank',name:'Synthetic Frank',role:'admin',enabled:true,authMode:'platform',authEpoch:1,password},
 ...[['other-admin','admin',templateCells],['editor','staff',templateCells.filter(key=>!['templates.approve','templates.return'].includes(key))],['reviewer','rd',templateCells],['reader','staff',['templates.view']],['denied','staff',['dashboard.view']]]
 .map(([id,role,allowed])=>({id,name:'Synthetic '+id,role,enabled:true,authMode:'platform',authEpoch:1,password,accessOverrides:cells(allowed)}))];
 const catalog=line=>({products:[{code:line+'1',name:'隔離產品 '+line,category:'CAT-'+line,line,unit:'pcs',stages:[line+'-CUT']}],lines:[{code:line,name:'Line '+line,stages:[{code:line+'-CUT',name:'工段 Cắt',machine:'Machine',assetNumber:'FIXTURE',operators:1}]}],categoryGroups:[{line,name:'CAT-'+line}]});
 const templates=stage=>['entry','manual','manual-inspection','machine-assembly','exit'].map((presetKey,i)=>({id:stage+'-'+presetKey,presetKey,presetVersion:'existing',name:['開始','一般作業','檢查','機器設定','結束'][i],mode:presetKey==='machine-assembly'?'machine':'human',mediaItems:[],...(presetKey==='machine-assembly'?{equipment:Array.from({length:20},(_,n)=>({id:stage+'-EQ-'+n,number:'EQ-'+n,name:'隔離機器 '+n,nameVi:'Máy thử nghiệm '+n,line:stage.split('-')[0],stageCode:stage,kind:presetKey,machineType:'fixture',purpose:'test',note:'',mediaItems:[]}))}:{})})).concat(Array.from({length:10},(_,n)=>({id:stage+'-CUSTOM-'+n,catalogKey:'fixture-custom-'+n,name:'隔離流程 '+n,mode:'human',mediaItems:[]})));
 const active={AB:catalog('A'),C:catalog('C'),PROCESS:{'A-CUT':templates('A-CUT'),'C-CUT':templates('C-CUT')}};
 const versions=Object.entries(active).map(([scope,snapshot])=>({id:'MASTER-'+scope,scope,number:1,status:'approved',snapshot,creatorId:'frank',creatorName:'Synthetic Frank',createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z',history:[]}));
 const op={id:'reference-operation',number:'A-01',name:'引用測試',stageCode:'A-CUT',templateId:'A-CUT-CUSTOM-0',productCodes:['A1'],nextIds:[],machineIds:['A-CUT-EQ-0'],machineDetails:[],instructionSteps:[]};
 const values={platformUsers:JSON.stringify(users),backupSettings:'{"enabled":false}',masterDataControl:JSON.stringify({active,versions}),processMasterData:JSON.stringify(active.PROCESS),bomOverrides:'{"replaceAll":true,"data":{}}',dispatchBoard:'{"A":[],"B":[],"C":[]}',approvalVersions:JSON.stringify([{id:'process-active-fixture',number:1,status:'approved',line:'A',category:'CAT-A',stages:{'A-CUT':[op]}}]),'processEditor:CAT-A:A':JSON.stringify({stages:{'A-CUT':[op]}})};
 const raw=await load('lib/state-records.ts').encodeRecordValues(bucket,values);
 await f.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(raw,'synthetic').run();
 async function mutateSyntheticValues(change){const row=await f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();const records=load('lib/state-records.ts'),decoded=await records.decodeRecordValues(bucket,JSON.parse(row.values));change(decoded.values);const encoded=await records.encodeRecordValues(bucket,decoded.values,decoded.recordStorage);await f.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1 AND revision=?').bind(encoded,row.revision).run();}
 async function adoptAuthoring(){await mutateSyntheticValues(values=>{const content={workspaces:[{id:JSON.stringify(['CAT-A','A']),line:'A',category:'CAT-A',stages:{'A-CUT':[{...op,editorType:'machine'}]}}]};const workflow=load('lib/shared-draft.ts').createSharedDraft('process:platform',content,'synthetic-authoring','synthetic-generation');values.processAuthoringControl=JSON.stringify({activeVersionId:'synthetic-authoring',workflow,versions:[{id:'synthetic-authoring',number:1,status:'approved',snapshot:content,revision:0,creatorId:'frank',creatorName:'Synthetic Frank',createdAt:'synthetic',updatedAt:'synthetic',history:[]}]});});}
 return {...f,password,users,mutateSyntheticValues,adoptAuthoring,counts:{stages:2,templates:30,equipment:40,referencedOperations:1}};
}
