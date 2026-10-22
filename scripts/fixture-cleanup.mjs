// Optional handler retains an existing catch's reporting/return behavior. Cleanup
// still remembers the original operation failure if it also fails.
function finish(operationFailed,operationError,cleanupFailed,cleanupError,handled,value){
  if(operationFailed&&cleanupFailed)throw new AggregateError([operationError,cleanupError],'Fixture operation and cleanup failed',{cause:operationError});
  if(cleanupFailed)throw cleanupError;
  if(operationFailed&&!handled)throw operationError;
  return value;
}
export function withFixtureCleanupSync(operation,cleanup,onOperationError){
  let failed=false,error,value,handled=false,cleanupFailed=false,cleanupError;
  try{value=operation();}catch(e){failed=true;error=e;if(onOperationError){try{value=onOperationError(e);handled=true;}catch(handlerError){error=new AggregateError([e,handlerError],'Operation and error handler failed',{cause:e});}}}
  try{cleanup();}catch(e){cleanupFailed=true;cleanupError=e;}
  return finish(failed,error,cleanupFailed,cleanupError,handled,value);
}
export async function withFixtureCleanup(operation,cleanup,onOperationError){
  let failed=false,error,value,handled=false,cleanupFailed=false,cleanupError;
  try{value=await operation();}catch(e){failed=true;error=e;if(onOperationError){try{value=await onOperationError(e);handled=true;}catch(handlerError){error=new AggregateError([e,handlerError],'Operation and error handler failed',{cause:e});}}}
  try{await cleanup();}catch(e){cleanupFailed=true;cleanupError=e;}
  return finish(failed,error,cleanupFailed,cleanupError,handled,value);
}
