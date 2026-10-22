'use strict';
// Candidate for lib/build-auth-safety.cjs. No IO, logging, hashes, masking or auth-result mutation.
const {isProxy}=require('node:util').types;
const MAX=64*1024*1024;
const CATEGORIES=Object.freeze(['ON_DEMAND_REVALIDATION_BEARER','PREVIEW_DRAFT_BYPASS_ID','PREVIEW_SIGNING_KEY','PREVIEW_ENCRYPTION_KEY','PRERENDER_ENDPOINT_BEARER']);
const CHANNELS=new Set(['server-private','client-public','log-output','distribution-public']);
const CODES=new Set(['AUTH_AUDIT_INPUT','AUTH_AUDIT_BINDINGS_INCOMPLETE','AUTH_AUDIT_DUPLICATE','AUTH_AUDIT_UNKNOWN_ARTIFACT','AUTH_AUDIT_BOUND','AUTH_AUDIT_INCOMPLETE','AUTH_AUDIT_INVALID_DEFINE']);
function fail(code){throw Object.assign(new Error('Build authentication boundary refused'),{code});}
function need(v,code='AUTH_AUDIT_INPUT'){if(!v)fail(code);}
function own(o,k){need(o&&typeof o==='object'&&!isProxy(o));let d;try{d=Object.getOwnPropertyDescriptor(o,k);}catch{fail('AUTH_AUDIT_INPUT');}need(d&&Object.hasOwn(d,'value'));return d.value;}
function bytes(b){need(Buffer.isBuffer(b)&&b.length<=MAX,'AUTH_AUDIT_BOUND');return b;}
function registry(names){need(Array.isArray(names)&&!isProxy(names)&&names.length>0&&names.length<=10000);const ids=new Map();for(const name of names){need(typeof name==='string'&&name.length<=1024&&!/[\\:]/.test(name)&&!Array.from(name).some(character=>character.charCodeAt(0)<32)&&!name.startsWith('/')&&name.split('/').every(x=>x&&x!=='.'&&x!=='..'));need(!ids.has(name),'AUTH_AUDIT_DUPLICATE');ids.set(name,ids.size);}return ids;}
function safeFailure(e){let code;try{if(e&&!isProxy(e)){const d=Object.getOwnPropertyDescriptor(e,'code');if(d&&Object.hasOwn(d,'value')&&CODES.has(d.value))code=d.value;}}catch{}return Object.freeze({status:'HOLD_BUILD_AUTH_DIAGNOSTIC',safeCode:code||'AUTH_AUDIT_REDACTED_EXCEPTION'});}
function createSafeDiagnostics(artifactNames){const ids=registry(artifactNames);return Object.freeze({difference(name,before,after){need(ids.has(name),'AUTH_AUDIT_UNKNOWN_ARTIFACT');bytes(before);bytes(after);let at=0;while(at<Math.min(before.length,after.length)&&before[at]===after[at])at++;return Object.freeze({artifactId:ids.get(name),path:name,changed:at!==before.length||at!==after.length,beforeBytes:before.length,afterBytes:after.length,firstDifferenceOffset:at===before.length&&at===after.length?null:at});},failure:safeFailure});}
function bindingsFromVinext(defines,prerenderManifests){
 const result=Object.create(null),keys={ON_DEMAND_REVALIDATION_BEARER:'process.env.__VINEXT_REVALIDATE_SECRET',PREVIEW_DRAFT_BYPASS_ID:'process.env.__VINEXT_PREVIEW_MODE_ID',PREVIEW_SIGNING_KEY:'process.env.__VINEXT_PREVIEW_MODE_SIGNING_KEY',PREVIEW_ENCRYPTION_KEY:'process.env.__VINEXT_PREVIEW_MODE_ENCRYPTION_KEY'};
 for(const [category,key]of Object.entries(keys)){const encoded=own(defines,key);need(typeof encoded==='string'&&encoded.length<=16384,'AUTH_AUDIT_INVALID_DEFINE');let value;try{value=JSON.parse(encoded);}catch{fail('AUTH_AUDIT_INVALID_DEFINE');}need(typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=4096,'AUTH_AUDIT_INVALID_DEFINE');result[category]=value;}
 need(Array.isArray(prerenderManifests)&&!isProxy(prerenderManifests)&&prerenderManifests.length>0);let expected;
 for(const manifest of prerenderManifests){const value=own(manifest,'prerenderSecret');need(typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=4096,'AUTH_AUDIT_BINDINGS_INCOMPLETE');need(expected===undefined||expected===value,'AUTH_AUDIT_BINDINGS_INCOMPLETE');expected=value;}
 result.PRERENDER_ENDPOINT_BEARER=expected;return result; // Ephemeral RAM input to audit; NEVER serialize or log this object.
}
function createAuthBoundaryAudit(artifactNames,bindings){
 const ids=registry(artifactNames),values=CATEGORIES.map(category=>{let value;try{value=own(bindings,category);}catch{fail('AUTH_AUDIT_BINDINGS_INCOMPLETE');}need(typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=4096,'AUTH_AUDIT_BINDINGS_INCOMPLETE');return {category,value:Buffer.from(value)};}),seen=new Map();let finished=false;
 return Object.freeze({observe(name,channel,raw){need(!finished&&ids.has(name),'AUTH_AUDIT_UNKNOWN_ARTIFACT');need(CHANNELS.has(channel));need(!seen.has(name),'AUTH_AUDIT_DUPLICATE');bytes(raw);const categories=values.filter(x=>raw.indexOf(x.value)>=0).map(x=>x.category);const row=Object.freeze({artifactId:ids.get(name),path:name,channel,authenticationCategories:Object.freeze(categories),violatesBoundary:channel!=='server-private'&&categories.length>0});seen.set(name,row);return row;},finish(){need(!finished&&seen.size===ids.size,'AUTH_AUDIT_INCOMPLETE');finished=true;const rows=Array.from(seen.values()),violations=rows.filter(r=>r.violatesBoundary);for(const x of values)x.value.fill(0);return Object.freeze({status:violations.length?'HOLD_AUTH_MATERIAL_IN_PUBLIC_OR_LOG_CHANNEL':'PASS_DECLARED_KNOWN_AUTH_BOUNDARY_ONLY',bindingCategories:CATEGORIES,artifactsChecked:rows.length,serverPrivateMayContainAuthentication:true,violations:Object.freeze(violations),universalSecretAbsence:false,authenticationRemovedOrWeakened:false});}});
}
module.exports={CATEGORIES,bindingsFromVinext,createSafeDiagnostics,createAuthBoundaryAudit,safeFailure};
