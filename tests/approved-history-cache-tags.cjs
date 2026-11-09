// Current integrated cache expectations use one bounded true predecessor plus
// the explicit combined-asset tags. Original historical tags stay in the witness.
const history=require('../scripts/historical-source-fixture.cjs');
module.exports=(file,_prior)=>history.expectedCurrentCache(file);
