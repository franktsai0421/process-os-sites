import { env } from 'cloudflare:workers';

// Staged rollout: migrate the target DB before explicitly enabling this gate.
// Public requests never create schema or rotate signing secrets.
export const sessionRevocationEnabled = () => (env as { PROCESS_SESSION_REVOCATION_ENABLED?: string }).PROCESS_SESSION_REVOCATION_ENABLED === '1';
const digest = async (token: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');

export async function sessionRevoked(token: string) {
  const row = await env.DB.prepare('SELECT expires_at FROM process_revoked_sessions WHERE token_digest=?')
    .bind(await digest(token)).first<{ expires_at: number }>();
  return !!row && row.expires_at > Date.now();
}

export async function revokeSession(token: string, expires: number) {
  const tokenDigest = await digest(token);
  await env.DB.prepare('INSERT INTO process_revoked_sessions(token_digest,expires_at,revoked_at) VALUES(?,?,?) ON CONFLICT(token_digest) DO NOTHING')
    .bind(tokenDigest, expires, Date.now()).run();
  const row = await env.DB.prepare('SELECT expires_at FROM process_revoked_sessions WHERE token_digest=?')
    .bind(tokenDigest).first<{ expires_at: number }>();
  if (!row || row.expires_at < expires) throw Error('SESSION_REVOCATION_NOT_PERSISTED');
}
