// The historical panel equivalence benchmark predates the approved-only UI.
// Keep its full hashes/negative controls; do not claim old/new UI equivalence.
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('./unified-draft-source-contract.cjs');
proof.attest(file=>proof.canonicalSource(fs.readFileSync(file),execFileSync('git',['show','HEAD:'+file])));
require('./test-authoring-panel-local-unsaved-legacy.cjs');
