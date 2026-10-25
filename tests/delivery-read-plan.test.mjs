import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizedDeliveryKeys,canonicalReference,identityKeys} from '../lib/delivery-read-plan.mjs';
test('effective cells select only authorized aggregates before hydration', async()=>{
  const keys=await authorizedDeliveryKeys(key=>key==='iqc.view');
  assert.deepEqual(keys,[...identityKeys,'canonicalQuality','iqcMasterControl']);
  assert.deepEqual(await authorizedDeliveryKeys(()=>false),identityKeys);
  const player=await authorizedDeliveryKeys(key=>key==='player.view');
  assert(player.includes('dispatchBoard'));assert(!player.includes('qualityMasterControl'));
  assert(!player.includes('platformPassword'));assert(!player.includes('routineFqcControl'));
});
test('image reference must occur in authorized visible data, not as text substring',()=>{
  const id='a'.repeat(64),version='b'.repeat(64),url=`/api/canonical-assets?id=${id}&version=${version}`;
  assert(canonicalReference({x:JSON.stringify({photo:{src:url}})},id,version));
  assert(canonicalReference({x:JSON.stringify(['asset:'+id])},id,version));
  assert(!canonicalReference({x:JSON.stringify('see '+url+' for details')},id,version));
  assert(!canonicalReference({x:JSON.stringify(url+'c')},id,version));
  assert(!canonicalReference({},id,version));
});
