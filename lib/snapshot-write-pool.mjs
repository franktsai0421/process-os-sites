// One request/reservation owns this pool. Never parallelize campaign requests.
// Drain every started operation before returning an error to the budget owner.
export async function writeBatchBounded(items, write) {
 if(!Array.isArray(items)||items.length<1||items.length>16||typeof write!=='function')throw Error('IMPORT_BATCH_COUNT');
 let next=0,failed=false,failure;
 async function worker(){
  while(!failed&&next<items.length){const item=items[next++];try{await write(item);}catch(error){if(!failed){failure=error;failed=true;}}}
 }
 await Promise.all(Array.from({length:Math.min(4,items.length)},()=>worker()));
 if(failed)throw failure;
}
