// Read-only readiness fence. Never create or repair a table on a request path.
type DB={prepare:(sql:string)=>{all:()=>Promise<{results:Record<string,unknown>[]}>}};
const columns={
 access_events:['id:text:1','actor_id:text:1','module:text:1','operation_id:text:1','action:text:1','occurred_at:integer:1','received_at:text:1','updated_at:text:1','outcome:text:1','verified_at:text:0','status:text:1','version:integer:1','notes:text:1','history:text:1','update_receipts:text:1'],
 access_event_exports:['id:text:1','actor_id:text:1','operation_id:text:1','digest:text:1','generated_at:text:1','modules:text:1','ids:text:1','count:integer:1','size:integer:1','sha256:text:1'],
} as const;
export async function accessEventSchemaReady(db:DB):Promise<boolean>{
 try{
  for(const [table,expected] of Object.entries(columns)){
   const actual=(await db.prepare(`PRAGMA table_info("${table}")`).all()).results;
   if(actual.length!==expected.length||actual.some((row,i)=>typeof row.name!=='string'||typeof row.type!=='string'||`${row.name}:${row.type.toLowerCase()}:${Number(row.notnull)}`!==expected[i]||Number(row.pk)!==(i===0?1:0)))return false;
  }
  const eventIndexes=(await db.prepare('PRAGMA index_list("access_events")').all()).results;
  const exportIndexes=(await db.prepare('PRAGMA index_list("access_event_exports")').all()).results;
  if(!eventIndexes.some(row=>row.name==='access_events_actor_module_operation'&&Number(row.unique)===1&&Number(row.partial)===0)||!eventIndexes.some(row=>row.name==='access_events_status_cursor'&&Number(row.partial)===0)||!exportIndexes.some(row=>row.name==='access_event_exports_actor_operation'&&Number(row.unique)===1&&Number(row.partial)===0))return false;
  for(const [name,expected] of [
   ['access_events_actor_module_operation',['actor_id','module','operation_id']],
   ['access_events_status_cursor',['status','id']],
   ['access_event_exports_actor_operation',['actor_id','operation_id']],
  ] as const){
   const actual=(await db.prepare(`PRAGMA index_xinfo("${name}")`).all()).results.filter(row=>Number(row.key)===1);
   if(actual.length!==expected.length||actual.some((row,i)=>row.name!==expected[i]||row.coll!=='BINARY'||Number(row.desc)!==0))return false;
  }
  const definitions=(await db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('access_events','access_event_exports')").all()).results;
  const events=definitions.find(row=>row.name==='access_events')?.sql;
  if(typeof events!=='string')return false;
  return /CHECK\([^)]*outcome[^)]*IN\s*\('unknown','receipt-confirmed'\)\)/i.test(events)&&/CHECK\([^)]*status[^)]*IN\s*\('open','handled'\)\)/i.test(events);
 }catch{return false;}
}
