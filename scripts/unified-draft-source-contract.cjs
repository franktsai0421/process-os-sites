/* Test-only strict outer contract; no runtime import or source rewrite. */
const fs=require('node:fs'),path=require('node:path'),{joinSourcePool}=require('./unified-draft-source-pool.cjs');
const manifest=joinSourcePool(require('./unified-draft-source-contract.json'),file=>fs.readFileSync(path.join(__dirname,file)));
module.exports=require('./unified-draft-source-engine.cjs').createSourceContract(manifest);
