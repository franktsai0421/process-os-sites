import {env} from 'cloudflare:workers';
import {encodeValues,type State} from './process-state';
import {initializeRecordValues,isImmutableRecordBody} from './state-records';

// Deferred adoption design; production workflow writers do not call this helper.
// Enabling requires a separately reviewed migration decision. Synthetic tests only.
// A future caller must validate and use the existing global revision CAS.
// Small legacy states and chunk storage keep their existing write format.
export async function encodeMasterWorkflowValues(values:Record<string,string>,previous:State,models?:Map<string,unknown>){
 const master=values.masterDataControl;
 if(previous.recordStorage||previous.storage||previous.deliveryOnly||!master||new TextEncoder().encode(master).byteLength<512*1024)
  return encodeValues(values,previous,models);
 // Unknown legacy scalars and unverified embedded record pointers keep the
 // old format. Initial adoption must never confer trust on a legacy pointer.
 const hasReference=(value:unknown):boolean=>isImmutableRecordBody(value)||!!value&&typeof value==='object'&&Object.values(value).some(hasReference);
 try{for(const value of Object.values(values))if(hasReference(JSON.parse(value)))return encodeValues(values,previous,models);}catch{return encodeValues(values,previous,models);}
 return initializeRecordValues(env.STATE_ARCHIVE,values,previous.values);
}
