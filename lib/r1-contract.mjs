// Confirmed R1 logical metadata contract. SQL strings are never executed here.
import {snapshotTables} from './snapshot-d1-r2.mjs';
import {maximumJsonBytes} from './snapshot-redaction.mjs';
export const r1Tables=Object.freeze({...snapshotTables,process_revoked_sessions:['token_digest','expires_at','revoked_at']});
export const r1Digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function exactFields(value,required,optional=[],code='R1_FIELDS'){
  if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))throw Error(code);
}
export function parseR1Json(bytes,limit=maximumJsonBytes){
  if(!(bytes instanceof Uint8Array)||bytes.length>limit)throw Error('R1_METADATA_LIMIT');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('R1_METADATA_JSON_INVALID');}
  let index=0;
  const spaces=()=>{while(/[\t\r\n ]/.test(text[index]||'!'))index++;};
  function quoted(key=false){const start=index++;if(text[start]!=='"')throw Error('R1_METADATA_JSON_INVALID');while(index<text.length){const c=text[index++];if(c==='"'){if(key){if(index-start>2048)throw Error('R1_METADATA_KEY_LIMIT');return JSON.parse(text.slice(start,index));}return;}if(c==='\\'){if(text[index++]==='u')index+=4;}else if(c.charCodeAt(0)<32)throw Error('R1_METADATA_JSON_INVALID');}throw Error('R1_METADATA_JSON_INVALID');}
  function value(depth){if(depth>64)throw Error('R1_METADATA_DEPTH');spaces();const c=text[index];if(c==='{'){index++;spaces();const keys=new Set();if(text[index]==='}'){index++;return;}while(true){spaces();const key=quoted(true);if(keys.has(key))throw Error('R1_METADATA_DUPLICATE_KEY');if(['__proto__','constructor','prototype'].includes(key))throw Error('R1_METADATA_UNSAFE_KEY');keys.add(key);spaces();if(text[index++]!==':')throw Error('R1_METADATA_JSON_INVALID');value(depth+1);spaces();const end=text[index++];if(end==='}')return;if(end!==',')throw Error('R1_METADATA_JSON_INVALID');}}if(c==='['){index++;spaces();if(text[index]===']'){index++;return;}while(true){value(depth+1);spaces();const end=text[index++];if(end===']')return;if(end!==',')throw Error('R1_METADATA_JSON_INVALID');}}if(c==='"'){quoted();return;}const start=index;while(index<text.length&&!/[\s,}\]]/.test(text[index]))index++;if(index===start)throw Error('R1_METADATA_JSON_INVALID');}
  try{value(0);spaces();if(index!==text.length)throw Error('R1_METADATA_JSON_INVALID');return JSON.parse(text);}catch(error){if(/^R1_[A-Z_]+$/.test(error.message))throw error;throw Error('R1_METADATA_JSON_INVALID');}
}
export function validateR1Database(database){
  exactFields(database,['schemas','tables'],[],'R1_DATABASE_FORMAT_UNSUPPORTED');
  if(!Array.isArray(database.schemas)||database.schemas.length>100)throw Error('R1_SCHEMA_METADATA');
  const names=new Set();for(const schema of database.schemas){exactFields(schema,['name','sql'],[],'R1_SCHEMA_METADATA');if(typeof schema.name!=='string'||!Object.hasOwn(r1Tables,schema.name)||names.has(schema.name)||typeof schema.sql!=='string'||!schema.sql.length||schema.sql.length>65536)throw Error('R1_SCHEMA_METADATA');names.add(schema.name);}
  exactFields(database.tables,Object.keys(r1Tables),[],'R1_DATABASE_TABLE_COVERAGE');
  if(Object.keys(r1Tables).some(name=>!names.has(name)))throw Error('R1_SCHEMA_TABLE_COVERAGE');
  let total=0;const encoder=new TextEncoder();
  for(const [table,columns]of Object.entries(r1Tables)){
    const rows=database.tables[table];if(!Array.isArray(rows)||rows.length>1024)throw Error('R1_TABLE_LIMIT');const ids=new Set();
    for(const row of rows){exactFields(row,columns,[],'R1_TABLE_COLUMNS');const id=table==='process_revoked_sessions'?row.token_digest:row.id;if(ids.has(id))throw Error('R1_TABLE_DUPLICATE_ID');ids.add(id);
      if(table==='process_revoked_sessions'){if(!r1Digest(id)||!Number.isSafeInteger(row.expires_at)||!Number.isSafeInteger(row.revoked_at))throw Error('R1_SECURITY_TABLE_SCHEMA');}
      else{if(!Number.isSafeInteger(row.revision)||row.revision<0)throw Error('R1_TABLE_REVISION');for(const column of columns)if(!['id','revision'].includes(column)&&typeof row[column]!=='string')throw Error('R1_TABLE_VALUE');if(table==='state_backups'&&typeof id!=='string')throw Error('R1_TABLE_ID');}
      total+=encoder.encode(JSON.stringify(row)).length;
    }
  }
  if(total>maximumJsonBytes/2)throw Error('R1_DATABASE_LIMIT');
  for(const table of ['shared_state','web_feedback_store'])if(database.tables[table].length!==1||database.tables[table][0].id!==1)throw Error('R1_TABLE_SINGLETON');
  for(const table of ['shared_state','state_backups'])for(const row of database.tables[table]){const state=parseR1Json(encoder.encode(row.values));if(!state||typeof state!=='object'||Array.isArray(state)||Object.keys(state).some(key=>key.startsWith('__process')&&!['__processR2','__processRecords','__processChunks'].includes(key)))throw Error('R1_STATE_FORMAT_UNSUPPORTED');}
  return Object.fromEntries(Object.keys(snapshotTables).map(table=>[table,structuredClone(database.tables[table])]));
}
