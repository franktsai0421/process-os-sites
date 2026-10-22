import {scanFiles,sourceFiles} from '../lib/safety-scan.mjs';
const findings=scanFiles(process.cwd(),sourceFiles(process.cwd()));console.log(JSON.stringify({files:sourceFiles(process.cwd()).length,findings},null,2));if(findings.length)process.exitCode=1;
