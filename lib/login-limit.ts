import {env} from 'cloudflare:workers';

// Database-owned counters work across isolates. Requests never create this table.
export async function allowLoginAttempt(request:Request,account:string,now=Date.now()) {
  const period=Math.floor(now/300_000);
  const address=request.headers.get('CF-Connecting-IP') || 'unknown';
  const hashes=await Promise.all([`ip:${address}`,`account:${account}`].map(async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')));
  const statements=hashes.map(key=>env.DB.prepare('INSERT INTO process_login_limits (key,bucket_start,attempts) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET bucket_start=excluded.bucket_start,attempts=CASE WHEN process_login_limits.bucket_start=excluded.bucket_start THEN process_login_limits.attempts+1 ELSE 1 END RETURNING attempts').bind(key,period));
  const results=await env.DB.batch<{attempts:number}>(statements);
  return results.length===2 && results.every((result,index)=>result.success && result.results[0]?.attempts<=(index===0?30:15));
}
