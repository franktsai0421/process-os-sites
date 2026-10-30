// Explicit IQC presentation opt-in only; storage and workflow validation stay full.
export function iqcEditingRequested(request:Request,key:string,scope:string){
 const query=new URL(request.url).searchParams;
 return key==='iqcMasterControl'&&scope==='iqc'&&query.get('projection')==='iqc-edit-v1'&&query.get('caseMetadata')==='1';
}
type ProjectionVersion={id:string;status:string;snapshot?:unknown;[key:string]:unknown};
type ProjectionBody={control?:{activeVersionId?:string;versions?:ProjectionVersion[];workflow?:{active?:{id?:string;content?:unknown};saved?:{content?:unknown};[key:string]:unknown};[key:string]:unknown};wireVersion?:number;liveContent?:Record<string,unknown>;[key:string]:unknown};
const activeRef=(value:unknown)=>!!value&&typeof value==='object'&&(value as Record<string,unknown>).__liveContent==='active';
export function iqcEditingPayload(payload:unknown,enabled:boolean):unknown{
 if(!enabled||!payload||typeof payload!=='object')return payload;
 const body=payload as ProjectionBody,control=body.control,flow=control?.workflow;
 if(!control||!flow||!Array.isArray(control.versions)||!flow.active?.id)return payload;
 const open=control.versions.find(v=>['draft','pending','pending-test'].includes(v.status));
 if(!open||open.id===flow.active.id||flow.active.id!==control.activeVersionId)return payload;
 const active=control.versions.find(v=>v.id===control.activeVersionId);
 if(!active)return payload;
 const versions=control.versions.map(v=>{if(v.id!==active.id)return v;const {snapshot:_snapshot,...metadata}=v;return{...metadata,snapshotDeferred:'iqc-active-v1'};});
 const {content:_content,...activeMetadata}=flow.active;
 const result={...body,iqcProjection:{version:1,activeVersionId:active.id},control:{...control,versions,workflow:{...flow,active:{...activeMetadata,contentDeferred:'iqc-active-v1'}}}};
 // Saved content is required by exact dirty comparison. Never drop its body
 // just because it happens to equal active rather than the newer working copy.
 if(body.wireVersion===1&&body.liveContent){const live={...body.liveContent};if(!activeRef(flow.saved?.content)&&!versions.some(v=>activeRef(v.snapshot)))delete live.active;return{...result,liveContent:live};}
 return result;
}
