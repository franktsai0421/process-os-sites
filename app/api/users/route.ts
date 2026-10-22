import {responseHeaders} from '@/lib/process-state';
// Retired whole-account endpoint. Use the granular, audited /api/user-access route.
export async function POST(){return Response.json({error:'ACCOUNT_API_REQUIRED'},{status:410,headers:responseHeaders});}
