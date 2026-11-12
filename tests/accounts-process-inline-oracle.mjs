// This runner seeds small inline values. Do not route them through the
// record-storage-only oracle, or silently accept another storage format.
import assert from 'node:assert/strict';
export async function readJointInlineValues(db){
 const row=await db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
 assert(row&&Number.isSafeInteger(row.revision)&&row.revision>0,'Missing/invalid joint state revision');
 assert.equal(typeof row.values,'string');
 const values=JSON.parse(row.values);
 assert(values&&typeof values==='object'&&!Array.isArray(values),'Invalid inline values');
 for(const key of ['__processRecords','__processChunks','__processR2'])assert(!Object.hasOwn(values,key),'Joint fixture unexpectedly changed storage: '+key);
 assert(Object.values(values).every(value=>typeof value==='string'),'Invalid inline value type');
 return values;
}
