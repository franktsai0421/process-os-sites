import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const BASELINE_COMMIT='db190a37ff7b9c5dc1e098e2a62d9d9ddff504da';
export const INPUTS=Object.freeze(['package.json','package-lock.json','.oxlintrc.json','tsconfig.json','.githooks/pre-push','scripts/main-push-guard.mjs','scripts/collaboration-setup.mjs']);
const GUARD='scripts/main-push-guard.mjs';
const BASE_GUARD='c476feed3be3d3b24210506135264a258797f200';
const HEAD_GUARD='fc1dc7fb48fe8379aa28208e9158342119786533';
const OLD_IMPORT="import {fileURLToPath,pathToFileURL} from 'node:url';";
const NEW_IMPORT="import {pathToFileURL} from 'node:url';";
const fail=(file)=>{throw new Error(`BASELINE_INPUTS_NOT_COMPARABLE ${file}`);};
export function gitBlob(bytes){return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');}

// Deliberately recognizes one reviewed source difference, not a normalization rule.
// Every other input remains byte-identical, including all lint settings and hooks.
export function classifyInputs({baseCommit,base,head}){
  if(baseCommit!==BASELINE_COMMIT)fail('baseline-commit');
  let classification='BYTE_IDENTICAL';
  for(const file of INPUTS){
    const b=base[file],h=head[file];
    if(!b||!h||!Buffer.isBuffer(b.bytes)||!Buffer.isBuffer(h.bytes))fail(file);
    if(gitBlob(b.bytes)!==b.sha||gitBlob(h.bytes)!==h.sha)fail(file);
    if(b.sha===h.sha){if(!b.bytes.equals(h.bytes))fail(file);continue;}
    if(file!==GUARD||b.sha!==BASE_GUARD||h.sha!==HEAD_GUARD)fail(file);
    const needle=Buffer.from(OLD_IMPORT),replacement=Buffer.from(NEW_IMPORT);
    const at=b.bytes.indexOf(needle);
    if(at<0||b.bytes.indexOf(needle,at+needle.length)!==-1)fail(file);
    const expected=Buffer.concat([b.bytes.subarray(0,at),replacement,b.bytes.subarray(at+needle.length)]);
    if(!expected.equals(h.bytes))fail(file);
    classification='EQUIVALENT_REVIEWED_UNUSED_IMPORT_ONLY';
  }
  return classification;
}

function readInputs(root){
  const entries={};
  for(const file of INPUTS){
    try{
      const sha=execFileSync('git',['rev-parse',`HEAD:${file}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
      const bytes=execFileSync('git',['cat-file','blob',sha],{cwd:root,stdio:['ignore','pipe','pipe']});
      entries[file]={sha,bytes};
    }catch{fail(file);}
  }
  return entries;
}
export function compareCheckouts(baseRoot,headRoot){
  let baseCommit;
  try{baseCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:baseRoot,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{fail('baseline-commit');}
  return classifyInputs({baseCommit,base:readInputs(baseRoot),head:readInputs(headRoot)});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    if(process.argv.length!==4)fail('arguments');
    console.log(`BASELINE_INPUTS_${compareCheckouts(process.argv[2],process.argv[3])}`);
  }catch(error){console.error(error instanceof Error?error.message:'BASELINE_INPUTS_NOT_COMPARABLE');process.exitCode=1;}
}
