const { path, os } = require('./browser-runtime-builtins.mjs').default;
const repositoryRoot=path.resolve(__dirname,'..');
function moduleLocation(){if(process.env.PLAYWRIGHT_MODULE)return process.env.PLAYWRIGHT_MODULE;try{return require.resolve('playwright',{paths:[repositoryRoot]});}catch{throw Error('BROWSER_TEST_DEPENDENCY_REQUIRED: set PLAYWRIGHT_MODULE to an installed dependency; no download is performed');}}
function localUrl(value=process.env.PROCESS_TEST_URL||'http://127.0.0.1:3000'){let url;try{url=new URL(value);}catch{throw Error('LOCAL_BROWSER_TEST_URL_REQUIRED');}if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password)throw Error('LOCAL_BROWSER_TEST_URL_REQUIRED');return url.href.replace(/\/$/,'');}
module.exports={repositoryRoot,fixtureBackupPath:path.join(os.tmpdir(),'process-browser-fixture-backups'),localUrl,browserExecutable:process.env.CHROME_PATH||undefined};
Object.defineProperty(module.exports,'playwrightModule',{get:moduleLocation});
