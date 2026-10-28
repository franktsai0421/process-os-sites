import {loginIntent} from '@/lib/login-destination.mjs';
import LoginClient from './login-client';
import './login.css';

type LoginSearchParams=Record<string,string|string[]|undefined>;

export default async function LoginPage({searchParams}:{searchParams:Promise<LoginSearchParams>}){
  const query=new URLSearchParams();
  // Preserve duplicate values so the existing intent allowlist can reject them.
  for(const [key,value] of Object.entries(await searchParams)){
    for(const entry of Array.isArray(value)?value:value===undefined?[]:[value])query.append(key,entry);
  }
  const intent=loginIntent(query);
  return <LoginClient initialSystem={intent.get('system')||'process'} initialLine={intent.get('line')||'A'} />;
}
