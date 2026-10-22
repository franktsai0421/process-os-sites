import { env } from 'cloudflare:workers';
import { readState, identity, can, sameOrigin } from '@/lib/process-state';

const key = (id: string) => `routine-fqc/photos/${id}`;
const imageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const digest = async (bytes: ArrayBuffer) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[a-f0-9]{64}$/.test(id))
    return new Response('Not found', { status: 404 });
  try {
    const state = await readState({
      keys: [
        'platformUsers',
        'processCustomRoles',
        'processRoleTemplateOverrides',
        'maintenanceMode',
        'routineFqcEnabled',
      ],
    });
    if (
      !(await identity(request, state)) ||
      (!(await can(request, state, 'view:data')) &&
        !(await can(request, state, 'view:approval')))
    )
      return new Response('Forbidden', { status: 403 });
    const image = await env.STATE_ARCHIVE.get(key(id));
    if (!image) return new Response('Not found', { status: 404 });
    return new Response(image.body, {
      headers: {
        'Content-Type':
          image.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Unavailable', { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: '來源不允許' }, { status: 403 });
  try {
    const state = await readState({
      keys: [
        'platformUsers',
        'processCustomRoles',
        'processRoleTemplateOverrides',
        'maintenanceMode',
        'routineFqcEnabled',
      ],
    });
    const url = new URL(request.url);
    if (
      !(
        url.port === '3040' && ['localhost', '127.0.0.1'].includes(url.hostname)
      ) &&
      state.values.routineFqcEnabled !== '1'
    )
      return Response.json({ error: 'FQC_NOT_ENABLED' }, { status: 404 });
    if (state.values.maintenanceMode === '1')
      return Response.json({ error: 'MAINTENANCE' }, { status: 503 });
    if (
      !(await identity(request, state)) ||
      !(await can(request, state, 'view:data'))
    )
      return Response.json(
        { error: '沒有 FQC 報告照片上傳權限' },
        { status: 403 },
      );
    const type = request.headers.get('content-type')?.split(';')[0] || '';
    if (!imageTypes.has(type))
      return Response.json({ error: '僅接受圖片檔' }, { status: 415 });
    if (Number(request.headers.get('content-length') || 0) > 25_000_000)
      return Response.json({ error: '圖片限 25 MB' }, { status: 413 });
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: '圖片為空' }, { status: 422 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 25_000_000) {
        await reader.cancel();
        return Response.json({ error: '圖片限 25 MB' }, { status: 413 });
      }
      chunks.push(chunk.value);
    }
    const assembled = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      assembled.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const bytes = assembled.buffer;
    const signatures: Record<string, boolean> = {
      'image/png':
        assembled[0] === 137 &&
        assembled[1] === 80 &&
        assembled[2] === 78 &&
        assembled[3] === 71,
      'image/jpeg':
        assembled[0] === 255 && assembled[1] === 216 && assembled[2] === 255,
      'image/gif':
        new TextDecoder().decode(assembled.slice(0, 6)).match(/^GIF8[79]a$/) !==
        null,
      'image/webp':
        new TextDecoder().decode(assembled.slice(0, 4)) === 'RIFF' &&
        new TextDecoder().decode(assembled.slice(8, 12)) === 'WEBP',
    };
    if (!signatures[type])
      return Response.json(
        { error: 'IMAGE_SIGNATURE_INVALID' },
        { status: 415 },
      );
    if (!bytes.byteLength || bytes.byteLength > 25_000_000)
      return Response.json({ error: '圖片限 25 MB' }, { status: 413 });
    const id = await digest(bytes);
    if (!(await env.STATE_ARCHIVE.head(key(id))))
      await env.STATE_ARCHIVE.put(key(id), bytes, {
        httpMetadata: { contentType: type },
      });
    return Response.json({ id, url: `/api/routine-fqc/photo?id=${id}` });
  } catch (error) {
    console.error('[routine-fqc] photo upload failed', error);
    return Response.json({ error: '照片未保存，請重試' }, { status: 503 });
  }
}
