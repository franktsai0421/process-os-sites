// Owned synthetic storage only. Uses the compiled app and its normal login API.
import {randomBytes} from 'node:crypto';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {accessKeys} from '../public/process/access-policy.mjs';
import {pngFixture} from './photo-fixtures.mjs';
export async function createFeedbackFixture() {
 const password=randomBytes(24).toString('hex');
 const fixture=await createRootEntryFixture({syntheticBindings:{WEB_FEEDBACK_ENABLED:'1',PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:randomBytes(48).toString('hex'),DEMO_LOGIN_ENABLED:'false'}});
 const users=['frank','other-admin','employee'].map(id=>({id,name:id==='other-admin'?'Frank':id,role:id==='employee'?'staff':'admin',enabled:true,authMode:'platform',authEpoch:1,password,accessOverrides:Object.fromEntries(accessKeys.map(key=>[key,key.startsWith('feedback.')||key==='dashboard.view']))}));
 const values={platformUsers:JSON.stringify(users),backupSettings:'{"enabled":false}',masterDataControl:'{"active":{"AB":{"products":[],"lines":[]},"C":{"products":[],"lines":[]},"PROCESS":{}},"versions":[]}',processMasterData:'{}',bomOverrides:'{"replaceAll":true,"data":{}}',dispatchBoard:'{"A":[],"B":[],"C":[]}'};
 await fixture.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(JSON.stringify(values),'synthetic-feedback').run();
 await fixture.db.prepare('INSERT INTO web_feedback_store(id,revision,payload) VALUES(1,1,?)').bind(JSON.stringify({issues:[],attachments:[],batches:[],handoffs:[]})).run();
 const origin=fixture.url.origin;
 async function login(id){const response=await fixture.mf.dispatchFetch(origin+'/api/platform-login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({id,password})});if(response.status!==200)throw Error('SYNTHETIC_LOGIN_FAILED_'+response.status);return response.headers.get('set-cookie').split(';')[0];}
 const cookie=await login('frank'),location={type:'page',view:'dashboard',tab:'',system:'process',display:'合成測試 · Trang thử nghiệm',locator:{},context:{}};
 const upload=await fixture.mf.dispatchFetch(origin+'/api/web-feedback?action=upload&name='+encodeURIComponent('中文越文附件_kiểm-tra.png')+'&location='+encodeURIComponent(JSON.stringify(location)),{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'image/png'},body:pngFixture({width:48,height:48})});
 if(upload.status!==201)throw Error('SYNTHETIC_UPLOAD_FAILED_'+upload.status);
 const attachment=await upload.json();
 for(let batch=0;batch<3;batch++){
  const result=await fixture.mf.dispatchFetch(origin+'/api/web-feedback?action=submit',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({operationId:'synthetic-batch-'+batch,markers:Array.from({length:20},(_,i)=>({id:'synthetic-marker-'+batch+'-'+i,description:(i%2?'越文 Kiểm tra tiếng Việt có dấu: chất lượng và hình ảnh. ':'中文問題：按鈕與圖片標記測試。')+(i%7===0?'長內容 không mất dữ liệu '.repeat(100):'')+' #'+(batch*20+i),location,attachments:i%5===0?[attachment.id]:[]}))})});if(result.status!==201)throw Error('SYNTHETIC_SEED_FAILED_'+result.status);
 }
 return {...fixture,origin,password,login,async businessState(){return (await fixture.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first());}};
}
