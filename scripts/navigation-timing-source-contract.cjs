/* Compose the exact diagnostic inverse BEFORE the existing auth/read inverses.
 * No older hash, allowed span, EOL rule or tamper assertion is replaced. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const proof=require('./navigation-timing-source-spans.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function withoutNavigationTiming(file,bytes){
 const contract=proof.files[file];assert(contract,'unregistered timing inverse target');
 assert.equal(hash(bytes),contract.candidateSha256,'complete timing candidate bytes changed');
 let restored=bytes;
 for(const row of contract.spans){
  const span=Buffer.from(row.candidate),at=restored.indexOf(span);
  assert(at>=0&&restored.indexOf(span,at+1)===-1,'timing exact span missing or duplicated');
  restored=Buffer.concat([restored.subarray(0,at),Buffer.from(row.baseline),restored.subarray(at+span.length)]);
 }
 assert.equal(hash(restored),contract.baselineSha256,'timing outside exact spans changed');return restored;
}
module.exports={withoutNavigationTiming};
