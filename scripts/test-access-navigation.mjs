import __esmImport0 from "node:fs";
import __esmImport1 from "node:vm";
import __esmImport2 from "node:assert/strict";
import __esmImport3 from "node:crypto";
import {createRequire as __esmFactory} from 'node:module';
const __esmRequire=__esmFactory(import.meta.url);
const fs=__esmImport0,vm=__esmImport1,assert=__esmImport2,{createHash}=__esmImport3,P=__esmRequire('../public/process/access-policy.mjs');
const source=fs.readFileSync('public/process/permission-controls.js','utf8'),start=source.indexOf('  function allowed('),end=source.indexOf('\n  window.hasPermission',start),code=source.slice(start,end);
const ctx={currentUser:{id:'limited',enabled:true,views:['data'],permissions:[],cells:Object.fromEntries(P.accessKeys.map(k=>[k,k==='bom.view']))},window:{ProcessAccessPolicy:P,ProcessSync:{protected:true,identity:{id:'limited'}}},location:{href:''},permissionGroups:[]};vm.createContext(ctx);vm.runInContext(code+';this.allowed=allowed;',ctx);
for(const view of ['data&dataTab=bom','editor','approval','dashboard']){ctx.location.href='http://localhost:3032/process/?view='+view;for(const target of ['editor','approval','dashboard'])assert.equal(ctx.allowed('view:'+target),false,view+'→'+target);assert.equal(ctx.allowed('view:data'),true);}
ctx.location.href='http://localhost:3032/process/?view=data&dataTab=bom';assert.equal(ctx.allowed('master.import'),false);ctx.currentUser.cells['bom.exchange']=true;assert.equal(ctx.allowed('master.import'),true);assert.equal(ctx.allowed('master.export'),true);
console.log('PASS: actual frontend allowed() target navigation, denied editor/approval/dashboard, combined BOM exchange. SHA256 '+createHash('sha256').update(source).digest('hex'));
console.log(code);
