/* Explicit finite true-object source reads, never a synthetic Git history. */
const witness=require('./unified-draft-source-witness.cjs').createWitness(require('./unified-draft-source-witness.json'));
module.exports=Object.freeze({read:witness.readHistorical});
