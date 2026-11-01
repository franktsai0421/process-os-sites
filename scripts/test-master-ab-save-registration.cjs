// Exact registration-only inverse; callback/assertion bytes must remain unchanged.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const spans=[
  {
    "before": "import test from 'node:test';\n",
    "after": "import nativeTest from 'node:test';\n"
  },
  {
    "before": "",
    "after": "// Registration only: every original callback/assertion below remains unchanged.\n// Fixtures are created inside each callback and closed by that callback's t.after.\nconst definitions = [];\nfunction test(name, body) {definitions.push({name, body});}\n\n"
  },
  {
    "before": "",
    "after": "\n// Default invocation still registers all 113 cases. Bounded CI shards register\n// each assigned case exactly once; no skip/todo or conditionally absent assertions.\nconst shardText = process.env.MASTER_AB_SAVE_SHARD, shard = shardText ? shardText.split('/').map(Number) : [1, 1];\nassert.ok(shard.length === 2 && shard.every(Number.isSafeInteger) && shard[0] >= 1 && shard[0] <= shard[1] && shard[1] >= 1);\nassert.equal(definitions.length, 113); assert.equal(new Set(definitions.map(d => d.name)).size, 113);\nconst order = process.env.MASTER_AB_SAVE_TEST_ORDER || 'declared'; assert.ok(['declared', 'reverse'].includes(order));\nconst selected = definitions.filter((_definition, index) => index % shard[1] === shard[0] - 1);\nif (order === 'reverse') selected.reverse();\nif (process.argv.includes('--manifest')) console.log(JSON.stringify({total: definitions.length, shard: shardText || 'all', order, all: definitions.map(({name}) => ({group: 'master-ab-save', name})), selected: selected.map(d => d.name)}));\nelse for (const {name, body} of selected) void nativeTest(name, body);\n"
  }
];
const candidateSha='ba1a9c292fe109b0005c28fe9c022661ac8b2a2230a71170d284695f785ff150',originalSha='9c91b9435405ebf078136f6ea90daa6ca5f515af3546b0d541b16b6378cf60d2';
function inverse(source){
 assert.equal(hash(source),candidateSha,'Exact registered suite changed');
 for(const span of spans){const index=source.indexOf(span.after);assert(index>=0&&source.indexOf(span.after,index+1)===-1,'Unique registration span required');source=source.slice(0,index)+span.before+source.slice(index+span.after.length);}
 assert.equal(hash(source),originalSha,'Original imports/helpers/callbacks/assertions changed');return source;
}
const source=fs.readFileSync(path.resolve(__dirname,'../tests/master-ab-save-record-mutation.test.mjs'),'utf8');inverse(source);
let negatives=0;
for(const span of spans){for(const value of [source.replace(span.after,''),source.replace(span.after,span.after+span.after),source.replace(span.after,span.after.slice(0,-1)+'x')]){assert.throws(()=>inverse(value));negatives++;}}
for(const value of [source+'x',source.replace('assert.equal(replay.status, 200)','assert.equal(replay.status, 201)'),source.replace(/\n/g,'\r\n')]){assert.throws(()=>inverse(value));negatives++;}
console.log(JSON.stringify({status:'PASS_SAVE_REGISTRATION_EXACT_INVERSE',originalSha,candidateSha,negativeMutations:negatives,originalCallbacksAssertionsPreserved:true,defaultUnshardedEntryPreserved:true}));
