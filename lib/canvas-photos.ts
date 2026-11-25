import type {Workspace} from './process-authoring-workflow';
import {DraftConflict} from './shared-draft';

export const photoPath='/api/process-authoring/photo';
export const photoPrefix='process-authoring/photos/';
export const validLine=/^[A-Za-z0-9_-]{1,64}$/;
export const validId=/^[a-f0-9]{64}$/;
export const photoURL=(line:string,id:string)=>photoPath+'?line='+line+'&id='+id;

export function canvasPhotoIds(content:{workspaces:Workspace[]}){
 const ids=new Set<string>();
 for(const w of content.workspaces)for(const operations of Object.values(w.stages))for(const op of operations){
  const groups=[op.mediaItems,...Object.values(op.productMediaItems||{})];
  const sources=[op.media,...groups.flatMap(group=>Array.isArray(group)?group.map(item=>item?.src):[])];
  for(const src of sources){
   if(typeof src!=='string'||!src.startsWith(photoPath))continue;
   const id=src.slice(-64);
   if(!validLine.test(w.line)||!validId.test(id)||src!==photoURL(w.line,id))throw new DraftConflict('CANVAS_PHOTO_REFERENCE_INVALID',422);
   ids.add(w.line+'/'+id);
  }
 }
 return [...ids];
}
