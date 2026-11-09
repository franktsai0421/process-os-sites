/* Explicit historical regression fixtures only. Current acceptance must read the
 * actual checkout. These bytes come from genuine pinned Git objects, never an
 * inverse-generated source or an invented ref/object. No network or mutation. */
const assert=require('node:assert/strict'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pins=Object.freeze({main:{commit:'d4ac309fe05c89288af226b52c18161865ccdcb8',tree:'598194ab8561cfbab845e82ee7b0ccaf6629743b'},history_frozen:{commit:'3f6e736efddcd03f731ea180d063c489731339df',tree:'1d16d03dc77402d04688c99cff58ae04130906a3'}}),checked=new Set(),cache=new Map();
function readPublic(target,name){
 const pin=pins[target];assert(pin,'Unknown historical fixture target');assert(typeof name==='string'&&/^[a-z0-9-]+\.js$/.test(name),'Historical fixture requires one public JS basename');
 if(!checked.has(target)){assert.equal(execFileSync('git',['rev-parse',pin.commit+'^{tree}'],{cwd:root,encoding:'utf8'}).trim(),pin.tree,'Historical fixture tree differs');checked.add(target);}
 const key=target+':'+name;if(!cache.has(key))cache.set(key,execFileSync('git',['show',pin.commit+':public/process/'+name],{cwd:root,maxBuffer:8*1024*1024}).toString('utf8'));return cache.get(key);
}
module.exports=Object.freeze({readPublic,pins});
