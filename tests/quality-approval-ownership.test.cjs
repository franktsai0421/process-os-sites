const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./helpers/authoring-ipqc-loader.cjs')(process.cwd(), {}, {});
const {checkApprovalItemOwners} = load('lib/quality-approval-ownership.ts');

for (const field of ['code','checkNo']) {
  test(field + ' checks only the loss of a competing effective owner at approval', () => {
    const row = (id,code) => ({id,[field]:code});
    const old = row('one','legacy.123');
    const peer = row('peer',' MIXED-02 ');
    const change = row('one','mixed-02');
    const verify = (before,active,proposed) => checkApprovalItemOwners({
      activeVersionId:'base',versions:[{id:'base',snapshot:{items:active}}]
    }, {items:before}, {items:proposed}, field);

    assert.throws(() => verify([old],[old,peer],[change]), {message:'ACTIVE_VERSION_CHANGED'});
    assert.throws(() => verify([old],[old,peer],[change,{...peer,deleted:true}]), {message:'ACTIVE_VERSION_CHANGED'});
    verify([old],[old],[change]);
    verify([old,peer],[old,peer],[change]);
    verify([change,peer],[change,peer],[{...change,name:'edited'},peer]);
    verify([old],[old,{...peer,isDeleted:true}],[change]);
    verify([old],[old,peer],[old]);
  });
}
