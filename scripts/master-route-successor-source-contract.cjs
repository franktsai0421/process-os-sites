/* Source evidence only. Never load this inverse in the application or use its
 * output as executable route source. Attest the complete current route first.
 * GitHub raw blobs verified at these immutable commits:
 * - bad04632d354f290850632976bf6eb69b8e2d3c9 and
 *   1d02e90c3723211fbdc1a710d014f057fac62e47: e39549a0f631f75bd0191bbfa3e1a2aeb0c35820
 * - a1d810894d9ef82e99e1d272c4f43715fb798080: 99b8373fad782fed6f97b04c3ebfdc1ce8500f08
 * The latter commit's parent is 1d02e90c3723211fbdc1a710d014f057fac62e47.
 * Only its three documentBoundary route spans differ. The original e593 pin
 * already includes 25b35d39b651d0d0bc5dd2e0798872bfee55f152's edit-or-save
 * catalog permission. That permission is never removed by this inverse.
 * https://github.com/franktsai0421/process-os-sites/commit/a1d810894d9ef82e99e1d272c4f43715fb798080
 */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const file='app/api/master/workflow/route.ts';
const beforeHash='e59302315b30f2e2bce1d47ea6d6ea4f9d7228babaa0ddfc23267fee90ec2de8';
const afterHash='ad13dec6e560d606d831e64ced7a1d94fde84a93faed832e86ab46450df1966f';
const beforeLength=5336,afterLength=5829;
const rules=Object.freeze([
 Object.freeze({offset:740,before:'',after:"import {assertMasterDocumentRouteAvailable} from '@/lib/master-document-boundary';\n\nfunction documentBoundary(request:Request):Response|null{\n try{assertMasterDocumentRouteAvailable(new URL(request.url).searchParams);return null;}\n catch(error){if(!(error instanceof DraftConflict))throw error;\n  return Response.json({error:error.code},{status:error.status,headers:responseHeaders});}\n}\n"}),
 Object.freeze({offset:4822,before:"export const GET=(request:Request)=>new URL(request.url).searchParams.has('references')?productReferences(request):new URL(request.url).searchParams.get('catalog')==='effective'\n ?effectiveABCatalog(request):versionedWorkflowRoute(masterWorkflowAdapter(new URL(request.url).searchParams.get('scope')||'')).GET(request);\n",after:"export const GET=async(request:Request)=>documentBoundary(request)||(new URL(request.url).searchParams.has('references')?productReferences(request):new URL(request.url).searchParams.get('catalog')==='effective'\n ?effectiveABCatalog(request):versionedWorkflowRoute(masterWorkflowAdapter(new URL(request.url).searchParams.get('scope')||'')).GET(request));\n"}),
 Object.freeze({offset:5220,before:'',after:' const boundary=documentBoundary(request);if(boundary)return boundary;\n'}),
]);
function assertMasterRouteSuccessor(bytes,path){
 assert(Buffer.isBuffer(bytes),'Master successor requires raw source bytes');
 assert.equal(path,file,'Master successor wrong file');
 assert.equal(bytes.length,afterLength,'Master successor differs from pinned byte length');
 assert.equal(hash(bytes),afterHash,'Master successor differs from pinned bytes');
 for(const {offset,after}of rules){
  const span=Buffer.from(after);
  assert.deepEqual(bytes.subarray(offset,offset+span.length),span,'Master successor exact source span changed');
  assert.equal(bytes.indexOf(span),offset,'Master successor source span moved');
  assert.equal(bytes.indexOf(span,offset+span.length),-1,'Master successor source span repeated');
 }
}
function restoreMasterRoutePredecessor(bytes,path){
 assertMasterRouteSuccessor(bytes,path);
 let result=Buffer.from(bytes);
 for(const {offset,before,after}of [...rules].reverse()){
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+Buffer.byteLength(after))]);
 }
 assert.equal(result.length,beforeLength,'Master inverse changed pinned predecessor length');
 assert.equal(hash(result),beforeHash,'Master inverse changed pinned predecessor bytes');
 return result;
}
module.exports=Object.freeze({file,beforeHash,afterHash,beforeLength,afterLength,rules,assertMasterRouteSuccessor,restoreMasterRoutePredecessor});
