/* External evidence is supplied explicitly; missing inputs never create an empty substitute. */
const path=require('node:path');
function configuredPath(variable,suffix=''){
  const root=process.env[variable];
  if(!root||!path.isAbsolute(root))throw Error('ABSOLUTE_EVIDENCE_PATH_REQUIRED:'+variable);
  const relative=suffix.replace(/^[\\/]+/,'');
  if(relative.split(/[\\/]/).includes('..'))throw Error('EVIDENCE_PATH_TRAVERSAL');
  const value=relative?path.join(root,relative):path.resolve(root);
  return /[\\/]$/.test(suffix)?value+path.sep:value;
}
module.exports={configuredPath};
