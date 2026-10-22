import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateR1LocalDestination} from '../lib/r1-local-destination.mjs';
const destination='E:/ProcessOS-Sites-Private-20261022',valid={format:'PROCESS_OS_OWNER_ACCEPTED_LOCAL_DESTINATION_V1',path:destination,mode:'existing-inherited-acl-owner-accepted',userConfirmedNoSync:true,otherLocalReadersAccepted:true,inheritancePreserved:true,aclChanged:false,privateByACL:false},tests=[];
function test(name,run){run();tests.push({name,status:'PASS'});}
test('explicit local owner acceptance retains inheritance without claiming private ACL',()=>{const result=validateR1LocalDestination(valid,destination);assert.equal(result.privateByACL,false);assert.equal(result.aclChanged,false);assert.equal(result.inheritancePreserved,true);});
test('absent or old protected-policy receipts cannot silently select this mode',()=>{for(const value of [null,{}, {...valid,mode:'protected-only'},{...valid,otherLocalReadersAccepted:false}])assert.throws(()=>validateR1LocalDestination(value,destination),/OWNER_ACCEPTED/);});
test('different destination and unconfirmed sync scope refuse',()=>{for(const value of [{...valid,path:'E:/other'},{...valid,userConfirmedNoSync:false}])assert.throws(()=>validateR1LocalDestination(value,destination),/OWNER_ACCEPTED/);});
test('ACL mutation or misleading protection claims refuse',()=>{for(const value of [{...valid,aclChanged:true},{...valid,inheritancePreserved:false},{...valid,privateByACL:true}])assert.throws(()=>validateR1LocalDestination(value,destination),/OWNER_ACCEPTED/);});
const report={status:'PASS_OWNER_ACCEPTED_LOCAL_DESTINATION',cases:tests.length,tests,scope:{fakePolicyOnly:true,ACLChanged:false,realData:false}};if(process.env.R1_DESTINATION_REPORT)fs.writeFileSync(process.env.R1_DESTINATION_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
