'use client';
import {useEffect,useState} from 'react';
import {validateAttemptPolicy} from '@/lib/snapshot-attempt-policy.mjs';
import ImportClient,{type ImportConfiguration} from './upload-client';
function isConfiguration(value:unknown):value is ImportConfiguration{
 if(!value||typeof value!=='object')return false;const data=value as Record<string,unknown>;
 if(!data.pins||typeof data.pins!=='object'||typeof data.bootstrapClosed!=='boolean')return false;const pins=data.pins as Record<string,unknown>;
 if(!['projectId','origin','ownerId','targetFingerprint','manifestSha256'].every(k=>typeof pins[k]==='string'))return false;
 if(data.attempt!=null){try{validateAttemptPolicy(data.attempt,pins);}catch{return false;}}
 if(data.attempt!=null&&data.capacity!=null)return false;
 if(data.budget!=null){if(typeof data.budget!=='object')return false;const b=data.budget as Record<string,unknown>;if(!['not-started','open','stopped','complete'].includes(String(b.state))||typeof b.inFlight!=='boolean'||(b.reason!==null&&typeof b.reason!=='string'))return false;if(b.used!==null){if(!b.used||typeof b.used!=='object')return false;const used=b.used as Record<string,unknown>;if(!['writeBytes','writeCalls','requests','dbBytes','dbStatements'].every(k=>typeof used[k]==='number'&&Number.isSafeInteger(used[k])&&Number(used[k])>=0))return false;}}
 if(data.capacity===null)return true;if(!data.capacity||typeof data.capacity!=='object')return false;const c=data.capacity as Record<string,unknown>;
 return ['projectId','targetFingerprint','reference','checkedAt'].every(k=>typeof c[k]==='string')&&['r2AvailableBytes','d1AvailableBytes'].every(k=>typeof c[k]==='number');
}
export default function ImportPage(){
 const [config,setConfig]=useState<ImportConfiguration|null>(null),[error,setError]=useState('');
 useEffect(()=>{const abort=new AbortController();void(async()=>{try{const r=await fetch('/api/snapshots/import?action=configuration',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:abort.signal});if(!r.ok){setError(r.status===401?'LOGIN_REQUIRED':r.status===403?'IMPORT_OWNER_REQUIRED':'IMPORT_CONFIGURATION_UNAVAILABLE');return;}const value:unknown=await r.json();if(!isConfiguration(value)||value.pins.origin!==location.origin)throw Error('IMPORT_CONFIGURATION_UNAVAILABLE');setConfig(value);}catch{if(!abort.signal.aborted)setError('IMPORT_CONFIGURATION_UNAVAILABLE');}})();return()=>abort.abort();},[]);
 if(config)return <ImportClient {...config}/>;
 return <main style={{maxWidth:720,margin:'auto',padding:24,fontFamily:'system-ui'}}><h1>資料匯入 / Nhập dữ liệu</h1><p role="status">{error?'無法取得管理員匯入權限或設定，尚未選取或上傳任何檔案。 / Chưa xác nhận quyền hoặc cấu hình; chưa chọn hoặc gửi tệp.':'正在核對管理員登入狀態… / Đang kiểm tra phiên quản trị viên…'}</p>{error&&<p>{error}</p>}<a href="/login" target="_top">返回登入頁 / Trang đăng nhập</a></main>;
}
