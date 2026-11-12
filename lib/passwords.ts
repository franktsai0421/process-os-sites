// Credentials never leave the server. Existing plaintext is accepted only for
// compatibility until the reviewed, explicit local migration. Login never writes it.
import {scrypt,randomBytes} from 'node:crypto';
import {Buffer} from 'node:buffer';
const derive=async(password:string,salt:string)=>{
 try{return await new Promise<Buffer>((resolve,reject)=>scrypt(password,Buffer.from(salt,'hex'),64,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));}
 catch{throw Error('PASSWORD_SERVICE_UNAVAILABLE');}
};
type CredentialRecord={password?:unknown;passwordHash?:unknown};
// Metadata only. Callers must authorize any diagnostic projection. Never return
// a verifier, salt, digest, password length or an exception from the crypto API.
export function passwordCredentialState(user:CredentialRecord){
 if(user.passwordHash){
  if(typeof user.passwordHash!=='string')return 'invalid';
  const [format,n,r,p,salt,digest,extra]=user.passwordHash.split('$');
  if(format!=='scrypt')return 'unsupported';
  if(n!=='32768'||r!=='8'||p!=='3'||!/^[a-f0-9]{48}$/.test(salt||'')||!/^[a-f0-9]{128}$/.test(digest||'')||extra)return 'invalid';
  return 'scrypt';
 }
 return typeof user.password==='string'&&user.password.length>0?'legacy':'missing';
}
const equal=(a:string,b:string)=>{const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);let mismatch=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)mismatch|=(x[i]||0)^(y[i]||0);return mismatch===0;};
export function validatePassword(password:string,confirm:string){if(password!==confirm)throw Error('PASSWORD_MISMATCH');if(password.length<8||password.length>200)throw Error('PASSWORD_LENGTH');}
export async function passwordHash(password:string){
 try{const salt=randomBytes(24).toString('hex');return 'scrypt$32768$8$3$'+salt+'$'+(await derive(password,salt)).toString('hex');}
 catch{throw Error('PASSWORD_SERVICE_UNAVAILABLE');}
}
export async function verifyPassword(user:CredentialRecord,password:string){
 const state=passwordCredentialState(user);
 if(state==='scrypt'){
  const [,,,,salt,digest]=(user.passwordHash as string).split('$');
  return equal((await derive(password,salt)).toString('hex'),digest);
 }
 return state==='legacy'&&equal(user.password as string,password);
}
