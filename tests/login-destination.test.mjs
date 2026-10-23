import assert from 'node:assert/strict';import {loginDestination} from '../lib/login-destination.mjs';
assert.equal(loginDestination('?next=%2Fsetup%2Fimport'),'/setup/import');assert.equal(loginDestination('?next=/setup/import'),'/setup/import');
for(const search of ['','?next=https://other.invalid','?next=//other.invalid','?next=/callback','?next=/signin-with-chatgpt','?next=/signout-with-chatgpt','?next=/setup/import?x=1','?next=/setup/import&next=/process/'])assert.equal(loginDestination(search),'/process/index.html');
console.log(JSON.stringify({status:'PASS_FIXED_POST_LOGIN_DESTINATION',cases:10,realData:false,network:false}));
