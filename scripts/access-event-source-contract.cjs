/* Exact metadata/reporting-only inverse. Complete hashes and byte spans preserve
 * every main/predecessor safety byte; no normalization or runtime source writes. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contracts=[
  {
    "file": "lib/versioned-shared-workflow.ts",
    "beforeHash": "d1246a4b451206a4091afbc66e3c066c5f04fa4de0da319e5120b0a339a7f01e",
    "afterHash": "b220a014deff38f2a0e47ba3cb01ec36084ff34f49cb46f1bf51ce6ccfafbb7e",
    "rules": [
      {
        "offset": 22717,
        "before": "        if(receipt.actorId!==actor.id||!permissions[permission as DraftPermission]||action==='restore'&&!permissions.restore)return reply({error:'FORBIDDEN'},403);return reply({receipt:receipt.result,...(action==='begin-v1'?{operationKind:'begin-v1'}:{})});}\n",
        "after": "        if(receipt.actorId!==actor.id||!permissions[permission as DraftPermission]||action==='restore'&&!permissions.restore)return reply({error:'FORBIDDEN'},403);return reply({receipt:receipt.result,...(query.get('accessEvent')==='1'?{operationAction:action}:{}),...(action==='begin-v1'?{operationKind:'begin-v1'}:{})});}\n"
      }
    ]
  },
  {
    "file": "lib/versioned-shared-workflow.ts",
    "beforeHash": "8734ac32aa54f02f2d19b94bd7b0ecbec849907867a9638a4f5afd34a4e244d1",
    "afterHash": "a91f78b66a5278ed250fc7587ae6807ce64648d6d905341916191324bb91dcce",
    "rules": [
      {
        "offset": 22230,
        "before": "        if(receipt.actorId!==actor.id||!permissions[permission as DraftPermission]||action==='restore'&&!permissions.restore)return reply({error:'FORBIDDEN'},403);return reply({receipt:receipt.result,...(action==='begin-v1'?{operationKind:'begin-v1'}:{})});}\n",
        "after": "        if(receipt.actorId!==actor.id||!permissions[permission as DraftPermission]||action==='restore'&&!permissions.restore)return reply({error:'FORBIDDEN'},403);return reply({receipt:receipt.result,...(query.get('accessEvent')==='1'?{operationAction:action}:{}),...(action==='begin-v1'?{operationKind:'begin-v1'}:{})});}\n"
      }
    ]
  },
  {
    "file": "app/api/ipqc-c/workflow/route.ts",
    "beforeHash": "58d065893bd14239095b0bd292dd5224b28b4299132a196f8ba6e31ca89f6ae1",
    "afterHash": "67dfc685a2374aeba0e2c8f3154a3594c69e8526a0201794a29e0ce6ee07c25e",
    "rules": [
      {
        "offset": 9337,
        "before": "      return reply({receipt:receipt.result,...(action==='begin-v1'?{operationKind:'begin-v1'}:{})});\n",
        "after": "      return reply({receipt:receipt.result,...(query.get('accessEvent')==='1'?{operationAction:action}:{}),...(action==='begin-v1'?{operationKind:'begin-v1'}:{})});\n"
      }
    ]
  },
  {
    "file": "public/process/shared-draft-client.js",
    "beforeHash": "194d0627c909f54a1bbf1c7c328cf9f98d5411234556e08c33538f9e55bf6589",
    "afterHash": "cb5fccf31b25d24751f5d72422cc744a3c6024e9e2142bf55db6189942d12352",
    "rules": [
      {
        "offset": 49356,
        "before": "      const recovered={...fresh,receipt:result.receipt,operationKind:'begin-v1',recoveryKind:'begin-v1',beginBasis:JSON.parse(JSON.stringify(record.basis))};clearBegin(record);return recovered;\n",
        "after": "      const recovered={...fresh,receipt:result.receipt,operationKind:'begin-v1',recoveryKind:'begin-v1',beginBasis:JSON.parse(JSON.stringify(record.basis))};reportAccessEvent({action:'begin-v1',operationId:record.operationId},'receipt-observed');clearBegin(record);return recovered;\n"
      },
      {
        "offset": 52454,
        "before": "        catch(error){const proof=beginResponses.get(error);if(proof?.record===record&&proof.raw===beginRaw&&beginUUID(error.requestId)&&((error.status===422&&error.message==='INVALID_BEGIN_IDENTITY')||(error.status===409&&error.message==='BEGIN_BASIS_CHANGED'))){clearBegin(record);}throw error;}\n",
        "after": "        catch(error){const proof=beginResponses.get(error);if(proof?.record===record&&proof.raw===beginRaw&&beginUUID(error.requestId)&&((error.status===422&&error.message==='INVALID_BEGIN_IDENTITY')||(error.status===409&&error.message==='BEGIN_BASIS_CHANGED'))){clearBegin(record);}if(beginRecord===record)reportAccessEvent({action:'begin-v1',operationId:record.operationId});throw error;}\n"
      },
      {
        "offset": 53620,
        "before": "",
        "after": "    function reportAccessEvent(command,phase='unknown') {\n      try {\n        const sources={'/api/fqc/workflow':'fqc','/api/iqc/workflow':'iqc','/api/ipqc-c/workflow':'ipqc-c','/api/bom/workflow':'bom','/api/tooling/workflow':'tooling','/api/routine-equipment/workflow':'equipment','/api/process-authoring/workflow':'editor'};\n        const url=new URL(endpoint,'https://local.invalid');for(const [key,value]of url.searchParams)if(!(key==='caseMetadata'&&value==='1'||key==='compact'&&value==='1'||key==='scope'&&['AB','C','PROCESS'].includes(value)||key==='module'&&value==='1'))return;\n        const moduleId=url.pathname==='/api/master/workflow'?({AB:'ab',C:'c',PROCESS:'templates'})[url.searchParams.get('scope')]:url.pathname==='/api/ipqc-ab/workflow'&&url.searchParams.get('module')==='1'?'ipqc-ab':sources[url.pathname];\n        if(moduleId)window.ProcessAccessEvents?.observe({actorId,module:moduleId,action:command.action,operationId:command.operationId,occurredAt:Date.now(),phase});\n      }catch{/* Reporting never changes original receipts, errors or write admission. */}\n    }\n    if(beginRecord)reportAccessEvent({action:'begin-v1',operationId:beginRecord.operationId});\n"
      },
      {
        "offset": 54944,
        "before": "    if(!externalStrict)try { unknown=unpackCommand(JSON.parse(sessionStorage.getItem(key)||'null'));if(unknown)unknownOwner=departureOwner(); } catch { recoveryInvalid=true; /* Retain the corrupt record and block writes; never erase an uncertain operation. */ }\n",
        "after": "    if(!externalStrict)try { unknown=unpackCommand(JSON.parse(sessionStorage.getItem(key)||'null'));if(unknown){unknownOwner=departureOwner();reportAccessEvent(unknown);} } catch { recoveryInvalid=true; /* Retain the corrupt record and block writes; never erase an uncertain operation. */ }\n"
      },
      {
        "offset": 69780,
        "before": "    if(externalBounded)try{boundedDiscovered=boundedDiscover();boundedRecord=boundedDiscovered[0]||null;if(boundedRecord){unknown={operationId:boundedRecord.operationId,generation:boundedRecord.generation,action:boundedRecord.action};unknownOwner=externalOwner;}}catch{recoveryInvalid=true;}\n",
        "after": "    if(externalBounded)try{boundedDiscovered=boundedDiscover();boundedRecord=boundedDiscovered[0]||null;if(boundedRecord){unknown={operationId:boundedRecord.operationId,generation:boundedRecord.generation,action:boundedRecord.action};unknownOwner=externalOwner;reportAccessEvent(unknown);}}catch{recoveryInvalid=true;}\n"
      },
      {
        "offset": 111779,
        "before": "      if(externalBounded&&boundedRecord?.operationId===command.operationId){const settled=await boundedTerminal(result,boundedRecord);if(!unknown)syncFailures.delete(command.operationId);return settled;}\n      window.SharedDraftDeparture.confirmed(sessionScope,command,result,owner);\n",
        "after": "      if(externalBounded&&boundedRecord?.operationId===command.operationId){const settled=await boundedTerminal(result,boundedRecord);if(!unknown){syncFailures.delete(command.operationId);reportAccessEvent(command,'receipt-observed');}return settled;}\n      reportAccessEvent(command,'receipt-observed');window.SharedDraftDeparture.confirmed(sessionScope,command,result,owner);\n"
      },
      {
        "offset": 116573,
        "before": "          throw Object.assign(Error('RESULT_UNKNOWN_CHECK_BEFORE_RETRY',externalBounded&&['fqc','iqc','ipqc-ab:module'].includes(boundedScope)?{cause:error}:undefined),{operationId:command.operationId,...(externalBounded&&['fqc','iqc','ipqc-ab:module'].includes(boundedScope)?{recoveryCause}:{})});\n",
        "after": "          reportAccessEvent(command);throw Object.assign(Error('RESULT_UNKNOWN_CHECK_BEFORE_RETRY',externalBounded&&['fqc','iqc','ipqc-ab:module'].includes(boundedScope)?{cause:error}:undefined),{operationId:command.operationId,...(externalBounded&&['fqc','iqc','ipqc-ab:module'].includes(boundedScope)?{recoveryCause}:{})});\n"
      }
    ]
  }
];
function withoutAccessEventMetadata(bytes,file){bytes=require('./ipqc-ab-integration-source-contract.cjs').projectKnown(bytes,file);
 assert(Buffer.isBuffer(bytes),'Access-event projection requires raw source bytes');
 bytes=require('./quality-integration-source-contract.cjs').projectKnown(bytes,file);
 const contract=contracts.find(c=>c.file===file&&c.afterHash===hash(bytes));if(!contract)return bytes;
 let result=Buffer.from(bytes);
 for(const {offset,before,after}of [...contract.rules].reverse()){
  const expected=Buffer.from(after);assert.deepEqual(result.subarray(offset,offset+expected.length),expected,'Exact access-event source offset changed');
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+expected.length)]);
 }
 assert.equal(hash(result),contract.beforeHash,'Access-event inverse changed pinned predecessor bytes');return result;
}
module.exports={withoutAccessEventMetadata};
