import {readPhotoUpload,photoUploadFailure} from '@/lib/photo-upload.mjs';
import {readLedger} from '@/lib/piece-calibration.mjs';
import { env } from 'cloudflare:workers';
import { readState, identity, can, sameOrigin } from '@/lib/process-state';

const key = (id: string) => `piece-calibration/photos/${id}`;
const imageTypes = new Set(['image/jpeg','image/png','image/webp','image/gif']);
const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  byte => byte.toString(16).padStart(2, '0')).join('');

export async function GET(request: Request) {
  if((env as unknown as Record<string,string>).PIECE_CALIBRATION_ENABLED!=='1')return new Response(null,{status:404});
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[a-f0-9]{64}$/.test(id)) return new Response('Not found', { status: 404 });
  try {
    const state = await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode','pieceCalibrationLedger']});
    if (!await identity(request, state) ||
        !(await can(request,state,'equipment.view')) || !(await can(request,state,'routine.view')))
      return new Response('Forbidden', { status: 403 });
    const ledger=readLedger(state.values.pieceCalibrationLedger);
    if(ledger.revokedPhotos?.includes(id)||!ledger.docs.some((d:{rows:{photos:string[]}[]})=>d.rows.some(r=>r.photos.includes(id))))return new Response(null,{status:404});
    const image = await env.STATE_ARCHIVE.get(key(id));
    if (!image) return new Response('Not found', { status: 404 });
    return new Response(image.body, { headers: {
      'Content-Type': image.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch { return new Response('Unavailable', { status: 503 }); }
}

export async function PUT(request: Request) {
  if((env as unknown as Record<string,string>).PIECE_CALIBRATION_ENABLED!=='1')return new Response(null,{status:404});
  if (!sameOrigin(request)) return Response.json({ error: '來源不允許' }, { status: 403 });
  try {
    const state = await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode','pieceCalibrationLedger']});
    if (!await identity(request, state) || !(await can(request, state, 'equipment.view')) || !(await can(request,state,'routine.view')) || !(await can(request,state,'routine.edit')) || !(await can(request,state,'routine.save')))
      return Response.json({ error: '沒有照片上傳權限' }, { status: 403 });
    if(state.values.maintenanceMode==='1')return new Response(null,{status:503});
    const type = request.headers.get('content-type')?.split(';')[0] || '';
    if (!imageTypes.has(type)) return Response.json({ error: '僅接受圖片檔' }, { status: 415 });
    const bytes = await readPhotoUpload(request,5_000_000);
    const id = await digest(bytes);
    if(readLedger(state.values.pieceCalibrationLedger).revokedPhotos?.includes(id))return Response.json({error:'PHOTO_REVOKED'},{status:409});
    if (!await env.STATE_ARCHIVE.head(key(id)))
      await env.STATE_ARCHIVE.put(key(id), bytes, { httpMetadata: { contentType: type } });
    return Response.json({ id, url: `/api/piece-calibration/photo?id=${id}` });
  } catch (error) {
    const failure=photoUploadFailure(error);if(failure)return failure;
    console.error('[routine-equipment] photo upload failed', error);
    return Response.json({ error: '照片未保存，請重試' }, { status: 503 });
  }
}
