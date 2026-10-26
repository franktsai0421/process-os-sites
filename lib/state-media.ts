import { env } from 'cloudflare:workers';
import { publicState, type State } from './process-state';

const mediaPattern =
  /^data:((?:image\/(?:png|jpeg|webp|gif|avif)|video\/(?:mp4|webm|ogg|quicktime)));base64,([A-Za-z0-9+/=]+)$/;
export const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');

// Delivery copies only: retain the original D1 values and historical R2 snapshots.
// Immutable, byte-identical images are fetched when displayed, not on every login.
export async function mediaState(state: State, actorId?: string, authorizedSource?:{revision:number;values:Record<string,string>}) {
  const source = authorizedSource || publicState(state, actorId);
  const entries = Object.entries(source.values);
  // No transform is needed: retain exact authorized raw values without a derived cache round trip.
  if (entries.every(([, raw]) => !/data:(?:image|video)\//.test(raw)))
    return { revision: source.revision, values: Object.fromEntries(entries) };
  const bucket = env.STATE_ARCHIVE;
  const cacheKey = `delivery/v1/${await digest(JSON.stringify(source))}.json`;
  const cached = await bucket.get(cacheKey);
  if (cached) return JSON.parse(await cached.text());
  const images = new Map<string, string>();
  async function visit(value: unknown): Promise<unknown> {
    if (typeof value === 'string' && value.length > 4096) {
      const match = mediaPattern.exec(value);
      if (!match) return value;
      if (images.has(value)) return images.get(value);
      const id = await digest(value),
        key = `delivery/media/${id}`;
      if (!(await bucket.head(key))) {
        const decoded = atob(match[2]);
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++)
          bytes[i] = decoded.charCodeAt(i);
        await bucket.put(key, bytes, {
          httpMetadata: { contentType: match[1] },
        });
      }
      const url = `/api/state-media?id=${id}`;
      images.set(value, url);
      return url;
    }
    if (Array.isArray(value)) {
      const result = [];
      for (const item of value) result.push(await visit(item));
      return result;
    }
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value))
        result[key] = await visit(item);
      return result;
    }
    return value;
  }
  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(source.values)) {
    values[key] = /data:(?:image|video)\//.test(raw)
      ? JSON.stringify(await visit(JSON.parse(raw)))
      : raw;
  }
  const result = { revision: source.revision, values };
  await bucket.put(cacheKey, JSON.stringify(result), {
    httpMetadata: { contentType: 'application/json' },
  });
  return result;
}

export async function writeReceipt(
  state: State,
  request: Request,
  updates: Record<string, string | null>,
) {
  if (request.headers.get('X-Process-Receipt') !== 'sha256')
    return publicState(state);
  const accepted: Record<string, string> = {};
  for (const [key, value] of Object.entries(updates))
    accepted[key] = await digest(JSON.stringify(value));
  return { revision: state.revision, accepted };
}

// The lightweight URLs are a transport representation, never a new stored format.
// Resolve them before validation/persistence so rollback, export and old clients
// continue to see the original data URIs and byte-identical version snapshots.
export async function restoreMediaUpdates(
  updates: Record<string, string | null>,
  previousValues: Record<string, string> = {},
) {
  const media = new Map<string, string>();
  // Index only affected, already integrity-checked server values. Match by content
  // digest, not array position: reorder/move must never attach another item's photo.
  const wanted = new Set<string>();
  for (const raw of Object.values(updates))
    for (const match of raw?.matchAll(/\/api\/state-media\?id=([a-f0-9]{64})/g) || []) wanted.add(match[1]);
  const seen = new Set<string>();
  async function reuse(value: unknown): Promise<void> {
    if (typeof value === 'string' && mediaPattern.test(value) && !seen.has(value)) {
      seen.add(value);
      const id = await digest(value);
      if (wanted.has(id)) media.set(`/api/state-media?id=${id}`, value);
    } else if (Array.isArray(value)) {
      for (const item of value) await reuse(item);
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) await reuse(item);
    }
  }
  for (const key of Object.keys(updates))
    if (wanted.size && previousValues[key]?.includes('data:')) await reuse(JSON.parse(previousValues[key]));
  async function visit(value: unknown): Promise<unknown> {
    if (
      typeof value === 'string' &&
      /^\/api\/state-media\?id=[a-f0-9]{64}$/.test(value)
    ) {
      if (media.has(value)) return media.get(value);
      const id = value.slice(value.indexOf('=') + 1);
      const object = await env.STATE_ARCHIVE.get(`delivery/media/${id}`);
      if (!object) throw Error('Media unavailable; content was not saved');
      const bytes = new Uint8Array(await object.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 16384)
        binary += String.fromCharCode(
          ...bytes.subarray(offset, offset + 16384),
        );
      const data = `data:${object.httpMetadata?.contentType};base64,${btoa(binary)}`;
      if ((await digest(data)) !== id)
        throw Error('Media integrity check failed');
      media.set(value, data);
      return data;
    }
    if (Array.isArray(value)) {
      const result = [];
      for (const item of value) result.push(await visit(item));
      return result;
    }
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = Object.create(null);
      for (const [key, item] of Object.entries(value))
        result[key] = await visit(item);
      return result;
    }
    return value;
  }
  const result: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(updates))
    result[key] = raw?.includes('/api/state-media?id=')
      ? JSON.stringify(await visit(JSON.parse(raw)))
      : raw;
  return result;
}
