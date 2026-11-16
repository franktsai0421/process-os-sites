import {compactWorkflowPayload} from './workflow-wire';
// Opt-in response transport only: all domain reads, validation, authorization
// and metadata selection finish before this pure representation change.
export function qualityReadPayload(payload:{control:unknown;[key:string]:unknown},module:'AB'|'C',enabled:boolean):unknown{
 if(!enabled)return payload;
 if(module==='C')return{qualityReadWire:1,module,payload:compactWorkflowPayload(payload,true)};
 const control=payload.control as {scopes:Record<string,unknown>;moduleDraft?:unknown};
 if(!control||!control.scopes||typeof control.scopes!=='object'||Array.isArray(control.scopes))return payload;
 const {scopes,moduleDraft,...rest}=control;
 return{qualityReadWire:1,module,payload:{...payload,control:rest},scopes:Object.entries(scopes).map(([key,value])=>[key,compactWorkflowPayload({control:value},true)]),...(moduleDraft===undefined?{}:{moduleDraft:compactWorkflowPayload({control:moduleDraft},true)})};
}
