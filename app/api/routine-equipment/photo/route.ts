import {readPhotoUpload,photoUploadFailure} from '@/lib/photo-upload.mjs';
import { env } from 'cloudflare:workers';
import { readState, identity, can, sameOrigin } from '@/lib/process-state';

const key = (id: string) => `routine-equipment/photos/${id}`;
const imageTypes = new Set(['image/jpeg','image/png','image/webp','image/gif']);
const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  byte => byte.toString(16).padStart(2, '0')).join('');

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[a-f0-9]{64}$/.test(id)) return new Response('Not found', { status: 404 });
  try {
    const state = await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});
    if (!await identity(request, state) ||
        !(await can(request, state, 'view:data')) && !(await can(request, state, 'view:approval')))
      return new Response('Forbidden', { status: 403 });
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
  if (!sameOrigin(request)) return Response.json({ error: '來源不允許' }, { status: 403 });
  try {
    const state = await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});
    if (!await identity(request, state) || !(await can(request, state, 'view:data')))
      return Response.json({ error: '沒有照片上傳權限' }, { status: 403 });
    const type = request.headers.get('content-type')?.split(';')[0] || '';
    if (!imageTypes.has(type)) return Response.json({ error: '僅接受圖片檔' }, { status: 415 });
    const bytes = await readPhotoUpload(request,5_000_000);
    const id = await digest(bytes);
    if (!await env.STATE_ARCHIVE.head(key(id)))
      await env.STATE_ARCHIVE.put(key(id), bytes, { httpMetadata: { contentType: type } });
    return Response.json({ id, url: `/api/routine-equipment/photo?id=${id}` });
  } catch (error) {
    const failure=photoUploadFailure(error);if(failure)return failure;
    console.error('[routine-equipment] photo upload failed', error);
    return Response.json({ error: '照片未保存，請重試' }, { status: 503 });
  }
}
