import {withFixtureCleanupSync} from './fixture-cleanup.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadSettings,saveSettings} from '../lib/local-backup.mjs';
const require=createRequire(import.meta.url),browser=require('./browser-test-runtime.cjs');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'process-portable-test-')),prior=process.env.PROCESS_BACKUP_PATH;
withFixtureCleanupSync(() => {
  delete process.env.PROCESS_BACKUP_PATH;
  const settings=loadSettings(fixture);
  assert.equal(settings.backupPath,path.join(fixture,'.local-backups'));
  assert.equal(fs.existsSync(settings.backupPath),false);
  assert.equal(browser.repositoryRoot,path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
  assert.equal(browser.localUrl('http://127.0.0.1:3000'),'http://127.0.0.1:3000');
  assert.throws(()=>browser.localUrl('https://example.invalid'),/LOCAL_BROWSER_TEST_URL_REQUIRED/);
  assert.throws(()=>saveSettings(fixture,{backupPath:'//network/share'},{createDirectory:false}),/LOCAL_BACKUP_PATH_REQUIRED/);
  assert.equal(fs.existsSync(settings.backupPath),false);
  console.log('PASS: portable repository root, relative backup default, no backup execution, loopback browser target and remote-path refusal');
}, () => {
  if(prior===undefined)delete process.env.PROCESS_BACKUP_PATH;else process.env.PROCESS_BACKUP_PATH=prior;
  if(path.dirname(fs.realpathSync(fixture))!==fs.realpathSync(os.tmpdir())||!path.basename(fixture).startsWith('process-portable-test-'))throw Error('TEMP_BOUNDARY');
  fs.rmSync(fixture,{recursive:true,force:true});
});