// Scheduling opt-in only. All selected records, hashes, faults and ordered body
// decoding remain in state-records; this never narrows a write's dependencies.
export function inventoryReadAhead(request,key,scope,body){
 const url=new URL(request.url);
 if(url.searchParams.has('scope'))return false;
 if(!(key==='toolingMasterControl'&&scope==='tooling'&&url.pathname==='/api/tooling/workflow'||key==='routineEquipmentControl'&&scope==='routine-equipment'&&url.pathname==='/api/routine-equipment/workflow'))return false;
 if(request.method==='GET')return !url.searchParams.has('restoreSaveId');
 if(request.method!=='POST'||!body||body.action!==undefined||Object.keys(body).some(k=>k!=='command'))return false;
 const command=body.command;
 if(!command||!['apply','save','submit','withdraw','approve','return'].includes(command.action))return false;
 // Destructive/restore/import paths belong to their existing owner and retain
 // their original read scheduling. No deletion behavior changes in this task.
 if(command.moduleAction!==undefined&&!(command.action==='save'&&command.moduleAction==='save-local-v1'))return false;
 if(command.patches!==undefined&&!Array.isArray(command.patches))return false;
 return !command.patches?.some(p=>!p||p.op!=='set'||!Array.isArray(p.path)||['deleted','isDeleted'].includes(p.path?.at(-1)));
}
