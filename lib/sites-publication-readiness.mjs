// A source/build precondition, not platform registration or publication approval.
export function requireProgramCommit(values={}) {
  const commit=values.PROCESS_PROGRAM_COMMIT;
  if(typeof commit!=='string'||!/^[a-f0-9]{40}$/.test(commit)||/^0{40}$/.test(commit))throw Error('SITES_REVIEWED_PROGRAM_COMMIT_REQUIRED');
  if(Object.hasOwn(values,'PROCESS_AUTH_MODE'))throw Error('SITES_AUTH_MODE_FLAG_NOT_IMPLEMENTED');
  return {status:'PROGRAM_COMMIT_FORMAT_PRESENT_REVIEW_STILL_REQUIRED',programCommit:commit,publicationAuthorized:false};
}
