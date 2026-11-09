import {DraftConflict} from './shared-draft';
import type {ModuleDraftCommand} from './versioned-shared-workflow';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const path=(v:unknown)=>Array.isArray(v)&&v.length>0&&v.length<=32&&v.every(step=>typeof step==='string'?!!step&&!['__proto__','constructor','prototype'].includes(step):object(step)&&typeof step.id==='string'&&!!step.id&&Object.keys(step).length===1);
/** Validate before routing/allocation/permission code can inspect patch fields. */
export function assertFqcLocalSaveCommand(command:ModuleDraftCommand|undefined):void{
 if(command?.action!=='save'||command.moduleAction!=='save-local-v1')return;
 if(!Array.isArray(command.patches)||command.patches.length>256||!command.patches.every(p=>object(p)&&path(p.path)&&(p.op==='set'?Object.hasOwn(p,'value'):p.op==='insert'&&object(p.value)&&typeof p.value.id==='string'&&!!p.value.id))||!Array.isArray(command.guards)||!command.guards.every(g=>object(g)&&path(g.path))||!object(command.input)||Object.keys(command.input).some(k=>!['matrixCells','expectedAB','reviveRows','draftVersionId'].includes(k))||!Array.isArray(command.input.matrixCells)||command.input.matrixCells.length>100000||command.input.expectedAB!==undefined&&!object(command.input.expectedAB))throw new DraftConflict('INVALID_FQC_LOCAL_SAVE',422);
 const revive=command.input.reviveRows;
 if(revive!==undefined&&(!Number.isSafeInteger(command.expectedRevision)||typeof command.input.draftVersionId!=='string'||!command.input.draftVersionId||!Array.isArray(revive)||!revive.length||revive.length>256||revive.some(row=>!object(row)||Object.keys(row).sort().join(',')!=='collection,id,tombstone'||typeof row.collection!=='string'||!['errors','items'].includes(row.collection)||typeof row.id!=='string'||!row.id||!object(row.tombstone)||row.tombstone.id!==row.id||row.tombstone.isDeleted!==true)||new Set(revive.map(row=>JSON.stringify([row.collection,row.id]))).size!==revive.length)||revive===undefined&&command.input.draftVersionId!==undefined)throw new DraftConflict('INVALID_FQC_LOCAL_SAVE',422);
}
