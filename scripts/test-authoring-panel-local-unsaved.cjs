// Current approved-history UI has its own actual-stack acceptance; the two
// optimization controls below retain their exact genuine historical bytes.
const fs=require('node:fs'),{execFileSync}=require('node:child_process'),proof=require('./unified-draft-source-contract.cjs');
proof.attest(file=>proof.canonicalSource(fs.readFileSync(file),execFileSync('git',['show','HEAD:'+file])));
require('./test-authoring-panel-local-unsaved-legacy.cjs');
require('./test-authoring-panel-local-unsaved-editor-prehistory.cjs');
