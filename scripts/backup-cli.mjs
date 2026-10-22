import process from 'node:process';
import {createBackup,inspectBackup,listBackups,restoreBackup,runScheduler} from '../lib/local-backup.mjs';

const root=process.cwd(),[action,arg]=process.argv.slice(2);
try{
  if(action==='create')console.log(JSON.stringify(createBackup(root,{actor:'admin',reason:'主機命令列立即備份'}),null,2));
  else if(action==='list')console.log(JSON.stringify(listBackups(root),null,2));
  else if(action==='inspect')console.log(JSON.stringify(inspectBackup(root,arg),null,2));
  else if(action==='schedule')console.log(JSON.stringify(runScheduler(root),null,2));
  else if(action==='restore'){
    if(!arg)throw Error('請指定備份 ZIP 檔名');
    const password=process.env.PROCESS_ADMIN_PASSWORD;if(!password)throw Error('緊急還原前請設定 PROCESS_ADMIN_PASSWORD 環境變數');
    console.log(JSON.stringify(restoreBackup(root,{fileName:arg,actor:'admin',password,confirmText:'0988901928',sourceIp:'emergency-cli'}),null,2));
  }else console.log('用法：node scripts/backup-cli.mjs create|list|inspect <zip>|schedule|restore <zip>');
}catch(error){console.error(error.message);process.exitCode=1}
