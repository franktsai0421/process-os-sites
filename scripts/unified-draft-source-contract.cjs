/* Test-only strict outer contract; no runtime import or source rewrite. */
module.exports=require('./unified-draft-source-engine.cjs').createSourceContract(require('./unified-draft-source-contract.json'));
