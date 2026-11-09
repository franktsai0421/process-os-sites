// Configuration-only checks. Never launches a browser or worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const helper=fs.readFileSync(new URL('./native-acceptance-browser-options.mjs',import.meta.url),'utf8');
const suite=fs.readFileSync(new URL('./user-access-prewrite-native.test.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/account-password-acceptance.yml',import.meta.url),'utf8');
function options(platform,flag,existing){
 const context={process:{platform,env:{PROCESS_NATIVE_ACCEPTANCE:flag}}};
 vm.createContext(context);
 vm.runInContext(helper.replace('export function ','function ')+';this.launchOptions=nativeAcceptanceLaunchOptions;',context);
 return context.launchOptions(existing);
}
void test('Windows CI uses installed Chrome with sandbox and no inherited launch arguments',()=>{
 const legacy={executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']};
 const original=structuredClone(legacy),selected=options('win32','1',legacy);
 assert.deepEqual(JSON.parse(JSON.stringify(selected)),{channel:'chrome',headless:false,chromiumSandbox:true});
 assert.deepEqual(legacy,original);
});
void test('Native acceptance rejects unsupported platforms instead of silently falling back',()=>{
 for(const platform of ['linux','darwin'])assert.throws(()=>options(platform,'1',{}),/Native acceptance requires the Windows runner/);
});
void test('Non-CI callers retain their previous launch options unchanged',()=>{
 const legacy={executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']};
 for(const flag of [undefined,'0'])assert.equal(options('linux',flag,legacy),legacy);
});
void test('Compiled confirmation suite uses the shared launcher and preserves password/CAS assertions',()=>{
 assert.match(suite,/import\s*\{nativeAcceptanceLaunchOptions\}\s*from '\.\/native-acceptance-browser-options\.mjs'/);
 assert.match(suite,/chromium\.launch\(nativeAcceptanceLaunchOptions\(/);
 assert.equal((suite.match(/chromium\.launch\(/g)||[]).length,1);
 assert(suite.includes("assert.equal((await verifyTarget(entered)).status,200"));
 assert(suite.includes("assert.equal((await verifyTarget(currentTargetPassword)).status,401"));
 assert(suite.includes("report.network.at(-1).code==='REVISION_CHANGED'"));
 assert(suite.includes('assert.equal(await submit().isDisabled(),true)'));
 assert(suite.includes("document.querySelector('dialog form').reportValidity()"));
 assert(suite.includes("document.querySelector('dialog form').requestSubmit()"));
 assert(suite.includes("persistent native validation follows interface language"));
});
void test('Read-only Windows job runs actual compiled confirmation without upload or secrets',()=>{
 assert.match(workflow,/runs-on: windows-latest/);
 assert.match(workflow,/PROCESS_NATIVE_ACCEPTANCE: '1'/);
 assert.match(workflow,/PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'/);
 assert.match(workflow,/contents: read/);
 assert.match(workflow,/if: \$\{\{ github\.event\.pull_request\.head\.repo\.full_name == github\.repository \}\}/);
 assert.match(workflow,/run: node tests\/user-access-prewrite-native\.test\.mjs/);
 assert.match(workflow,/run: node --test tests\/account-login-password\.test\.mjs tests\/native-account-ci-contract\.test\.mjs/);
 assert.match(workflow,/fetch-depth: 0/);
 assert.match(workflow,/persist-credentials: false/);
 assert.match(workflow,/node scripts\/sites-ci-preflight\.mjs/);
 assert(!workflow.includes('secrets.'));
 assert(!workflow.includes('actions/upload-artifact@'));
 assert(!workflow.includes('playwright/cli.js install'));
 assert(workflow.indexOf('npm run build')<workflow.indexOf('run: node tests/user-access-prewrite-native.test.mjs'));
});
